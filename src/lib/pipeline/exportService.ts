import { Command } from "@tauri-apps/plugin-shell";
import { appLocalDataDir, join, downloadDir, resolveResource } from "@tauri-apps/api/path";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { SubtitleSegment, SubtitleStyle } from "../types/pipeline";
import type { BlurRegion } from "../../pages/ShortsEditor";
import { escapeForFilter } from "./videoComposer";

// ── ASS Color Conversion ──────────────────────────────────────────────────────

/**
 * Convert a hex color (#RRGGBB) to ASS color format (&H00BBGGRR).
 * ASS uses BGR byte order with alpha prefix (00 = fully opaque).
 */
function hexToAssColor(hex: string): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/**
 * Convert a CSS color value to ASS color format.
 * Handles: hex (#RGB or #RRGGBB), 'transparent'.
 * Falls back to transparent for unsupported formats.
 */
function cssColorToAssColor(color: string): string {
  if (color === "transparent") return "&HFF000000";
  if (color.startsWith("#")) {
    let hex = color;
    if (hex.length === 4) {
      // Expand #RGB → #RRGGBB
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    if (hex.length === 7) {
      return hexToAssColor(hex);
    }
  }
  return "&HFF000000"; // Fallback: fully transparent
}

// ── ASS Timestamp Formatting ──────────────────────────────────────────────────

/**
 * Convert seconds to ASS timestamp format: H:MM:SS.CS (centiseconds).
 * Example: 1.5 → "0:00:01.50", 65.3 → "0:01:05.30"
 */
function formatAssTimestamp(seconds: number): string {
  const totalCs = Math.round(seconds * 100);
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// ── ASS File Generation ───────────────────────────────────────────────────────

/**
 * Generate a complete ASS subtitle file content from segments and style.
 *
 * Resolution is fixed at 1080×1920 (9:16 short-form video).
 * Subtitle position is derived from style.y (percentage from top):
 *   MarginV = PlayResY − (y + height) × PlayResY / 100
 */
export function generateAssContent(
  segments: SubtitleSegment[],
  style: SubtitleStyle,
): string {
  const PLAY_RES_X = 1080;
  const PLAY_RES_Y = 1920;

  const primaryColor = hexToAssColor(style.fontColor);
  const outlineColor = hexToAssColor(style.outlineColor);
  const backColor = cssColorToAssColor(style.backgroundColor);

  const bold = style.bold ? -1 : 0;
  const italic = style.italic ? -1 : 0;
  const shadowDepth = Math.round(style.shadowBlur);
  const marginV = Math.round(
    PLAY_RES_Y - (style.y + style.height) * (PLAY_RES_Y / 100),
  );

  // Subtitle center position (matches CSS preview's alignItems:'center' + justifyContent:'center')
  const centerX = Math.round((style.x + style.width / 2) * (PLAY_RES_X / 100));
  const centerY = Math.round((style.y + style.height / 2) * (PLAY_RES_Y / 100));
  // ── [Script Info] ────────────────────────────────────────────────────────
  const scriptInfo = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${PLAY_RES_X}`,
    `PlayResY: ${PLAY_RES_Y}`,
    "Collisions: Normal",
    "",
  ].join("\n");

  // ── [V4+ Styles] ─────────────────────────────────────────────────────────
  const styleFormat =
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding";
  const styleData = [
    "Style: Default",
    style.fontFamily,
    Math.round(style.fontSize),
    primaryColor,
    primaryColor,
    outlineColor,
    backColor,
    bold,
    italic,
    0,      // Underline
    0,      // StrikeOut
    100,    // ScaleX
    100,    // ScaleY
    0,      // Spacing
    0,      // Angle
    1,      // BorderStyle (1 = outline + shadow)
    (style.outlineWidth / 2).toFixed(1),
    shadowDepth,
    2,      // Alignment: 2 = bottom-center
    10,     // MarginL
    10,     // MarginR
    marginV,
    1,      // Encoding
  ].join(",");

  const v4Styles = ["[V4+ Styles]", styleFormat, styleData, ""].join("\n");

  // ── [Events] ─────────────────────────────────────────────────────────────
  const eventFormat =
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";
  // Fill gaps: extend each subtitle until the next one starts (matches preview behavior).
  // The preview keeps showing the last-ended subtitle during gaps — replicate in ASS.
  const filledSegments = segments.map((seg, i) => {
    const nextStart = i < segments.length - 1 ? segments[i + 1].startTime : seg.endTime + 86400;
    return { ...seg, endTime: Math.max(seg.endTime, nextStart) };
  });

  const dialogues = filledSegments.map((seg) => {
    const start = formatAssTimestamp(seg.startTime);
    const end = formatAssTimestamp(seg.endTime);
    // Escape newlines for ASS (\N = hard line break)
    const text = seg.translatedText.replace(/\n/g, "\\N");
    // \an5 = middle-center anchor, \pos = absolute position at box center
    // This matches the CSS preview where text is centered within the DraggableOverlay box
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,{\\an5\\pos(${centerX},${centerY})}${text}`;
  });

  const events = ["[Events]", eventFormat, ...dialogues].join("\n");

  return [scriptInfo, v4Styles, events].join("\n");
}

// ── Export Params ─────────────────────────────────────────────────────────────

export interface ExportParams {
  originalVideoPath: string;
  mergedTtsPath: string;
  subtitleSegments: SubtitleSegment[];
  subtitleStyle: SubtitleStyle;
  blurRegion?: BlurRegion;
  outputDir?: string;
  onProgress?: (percent: number, message: string) => void;
}

// ── Main Export Function ──────────────────────────────────────────────────────

/**
 * Burn subtitles (and optional blur region) into the composed video using FFmpeg.
 *
 * Steps:
 *   1. Generate ASS subtitle file
 *   2. Write ASS to AppLocalData/pipeline/export_subs.ass
 *   3. Resolve bundled font directory
 *   4. Build FFmpeg filter (with or without blur region)
 *   5. Execute FFmpeg sidecar
 *   6. Return output path in the user's Downloads folder
 */
export async function exportVideo(params: ExportParams): Promise<string> {
  // ── 1. Resolve output path ────────────────────────────────────────────────
  const baseDir = params.outputDir || await downloadDir();
  const filename = `shortmagician_export_${Date.now()}.mp4`;
  const outputPath = await join(baseDir, filename);

  // ── 2. Generate and write ASS subtitle file ───────────────────────────────
  params.onProgress?.(5, "자막 파일 생성 중...");
  const dataDir = await appLocalDataDir();
  const assPath = await join(dataDir, "pipeline", "export_subs.ass");
  const assContent = generateAssContent(
    params.subtitleSegments,
    params.subtitleStyle,
  );
  await writeFile(assPath, new TextEncoder().encode(assContent));

  // ── 3. Resolve font directory ─────────────────────────────────────────────
  let fontDir: string;
  try {
    const fontFile = await resolveResource("fonts/NotoSansCJKkr-Regular.otf");
    // Extract parent directory (compatible with both / and \ separators)
    const lastFwd = fontFile.lastIndexOf("/");
    const lastBack = fontFile.lastIndexOf("\\");
    const lastSep = Math.max(lastFwd, lastBack);
    fontDir = lastSep >= 0 ? fontFile.substring(0, lastSep) : fontFile;
  } catch {
    // Dev-mode fallback: resources sit next to the executable
    fontDir = await join(dataDir, "..", "resources", "fonts");
  }

  // ── 4. Build FFmpeg filter arguments ────────────────────────────────────
  params.onProgress?.(10, "자막을 입히는 중...");
  const escapedAss = escapeForFilter(assPath);
  const escapedFonts = escapeForFilter(fontDir);

  let args: string[];

  if (params.blurRegion) {
    const br = params.blurRegion;
    const xRatio = (br.x / 100).toFixed(4);
    const yRatio = (br.y / 100).toFixed(4);
    const wRatio = (br.width / 100).toFixed(4);
    const hRatio = (br.height / 100).toFixed(4);

    // filter_complex: split → blur crop → overlay → burn subs
    const filterComplex = [
      `[0:v]split[main][toblur]`,
      `[toblur]crop=iw*${wRatio}:ih*${hRatio}:iw*${xRatio}:ih*${yRatio},boxblur=20:10[blurred]`,
      `[main][blurred]overlay=W*${xRatio}:H*${yRatio},ass=${escapedAss}:fontsdir=${escapedFonts}[vout]`,
    ].join(";");

    args = [
      "-i", params.originalVideoPath,
      "-i", params.mergedTtsPath,
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      "-map", "1:a",
      "-c:a", "aac",
      "-b:a", "128k",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-y",
      outputPath,
    ];
  } else {
    args = [
      "-i", params.originalVideoPath,
      "-i", params.mergedTtsPath,
      "-vf", `ass=${escapedAss}:fontsdir=${escapedFonts}`,
      "-map", "0:v",
      "-map", "1:a",
      "-c:a", "aac",
      "-b:a", "128k",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-y",
      outputPath,
    ];
  }

  // ── 5. Execute FFmpeg sidecar ─────────────────────────────────────────────
  const result = await Command.sidecar("binaries/ffmpeg", args).execute();
  if (result.code !== 0) {
    throw new Error(`내보내기 실패: ${result.stderr}`);
  }

  params.onProgress?.(100, "내보내기 완료!");
  return outputPath;
}
