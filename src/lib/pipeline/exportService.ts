import { Command } from "@tauri-apps/plugin-shell";
import { appLocalDataDir, join, downloadDir, resolveResource } from "@tauri-apps/api/path";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { SubtitleSegment, SubtitleStyle } from "../types/pipeline";
import type { BlurRegion, TextOverlay } from "../../pages/ShortsEditor";
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

  // rgba(r, g, b, a) or rgb(r, g, b)
  const rgbaMatch = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/,
  );
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    const assAlpha = Math.round(255 * (1 - a))
      .toString(16)
      .padStart(2, "0");
    return `&H${assAlpha}${b}${g}${r}`.toUpperCase();
  }

  if (color.startsWith("#")) {
    let hex = color;
    if (hex.length === 4) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    if (hex.length === 7) {
      return hexToAssColor(hex);
    }
  }
  return "&HFF000000";
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
  textOverlays?: TextOverlay[],
): string {
  const PLAY_RES_X = 1080;
  const PLAY_RES_Y = 1920;

  const primaryColor = hexToAssColor(style.fontColor);
  const outlineColor = hexToAssColor(style.outlineColor);
  const shadowAssColor = cssColorToAssColor(style.shadowColor);

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
    Math.round(style.fontSize * 1.2),
    primaryColor,
    primaryColor,
    outlineColor,
    shadowAssColor,
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

  // ── Text Overlay Styles ──────────────────────────────────────────────────
  const overlayStyles: string[] = [];
  if (textOverlays && textOverlays.length > 0) {
    const overlayOutlineColor = cssColorToAssColor("rgba(0,0,0,0.3)");
    const overlayShadowColor = cssColorToAssColor("rgba(0,0,0,0.5)");

    textOverlays.forEach((overlay, idx) => {
      const overlayColor = hexToAssColor(overlay.fontColor);
      overlayStyles.push([
        `Style: TextOverlay_${idx}`,
        style.fontFamily,
        Math.round(overlay.fontSize * 1.2),
        overlayColor, overlayColor,
        overlayOutlineColor, overlayShadowColor,
        overlay.bold ? -1 : 0,
        0, 0, 0, 100, 100, 0, 0,
        1, "0.5", 1, 5, 0, 0, 0, 1,
      ].join(","));
    });
  }

  const v4Styles = ["[V4+ Styles]", styleFormat, styleData, ...overlayStyles, ""].join("\n");

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

  // ── Text Overlay Dialogues ────────────────────────────────────────────────
  const overlayDialogues: string[] = [];
  if (textOverlays && textOverlays.length > 0) {
    textOverlays.forEach((overlay, idx) => {
      const overlayCX = Math.round((overlay.x + overlay.width / 2) * (PLAY_RES_X / 100));
      const overlayCY = Math.round((overlay.y + overlay.height / 2) * (PLAY_RES_Y / 100));
      const overlayText = overlay.text.replace(/\n/g, "\\N");
      overlayDialogues.push(
        `Dialogue: 1,0:00:00.00,9:59:59.99,TextOverlay_${idx},,0,0,0,,{\\an5\\pos(${overlayCX},${overlayCY})}${overlayText}`
      );
    });
  }

  const events = ["[Events]", eventFormat, ...dialogues, ...overlayDialogues].join("\n");

  return [scriptInfo, v4Styles, events].join("\n");
}

// ── Export Params ─────────────────────────────────────────────────────────────

export interface ExportParams {
  originalVideoPath: string;
  mergedTtsPath: string;
  subtitleSegments: SubtitleSegment[];
  subtitleStyle: SubtitleStyle;
  blurRegion?: BlurRegion;
  textOverlays?: TextOverlay[];
  outputDir?: string;
  onProgress?: (percent: number, message: string) => void;
}

// ── FFmpeg Error Parser ───────────────────────────────────────────────────────

/**
 * Parse raw FFmpeg stderr into a user-friendly Korean error message.
 * Detects common failure patterns and returns actionable guidance.
 */
function parseFFmpegError(stderr: string): string {
  const s = stderr.toLowerCase();

  // Filter/codec errors
  if (s.includes("boxblur") && s.includes("invalid") && s.includes("radius")) {
    return "블러 처리에 실패했습니다. 블러 영역이 너무 작아 처리할 수 없습니다. 블러 영역 크기를 키우거나 해상도가 높은 영상을 사용해주세요.";
  }
  if (s.includes("no such filter")) {
    const match = stderr.match(/No such filter:\s*'([^']+)'/i);
    return `FFmpeg 필터를 찾을 수 없습니다${match ? ` (${match[1]})` : ""}. FFmpeg 설치 상태를 확인해주세요.`;
  }

  // Input file errors
  if (s.includes("no such file or directory")) {
    return "입력 파일을 찾을 수 없습니다. 영상 또는 오디오 파일이 삭제되었을 수 있습니다. 다시 변환 후 내보내기를 시도해주세요.";
  }
  if (s.includes("invalid data found when processing input")) {
    return "입력 파일이 손상되었거나 지원하지 않는 형식입니다. 다시 변환 후 내보내기를 시도해주세요.";
  }

  // Codec errors
  if (s.includes("encoder") && s.includes("not found")) {
    return "영상 인코더를 찾을 수 없습니다. FFmpeg 설치가 올바른지 확인해주세요.";
  }
  if (s.includes("could not open encoder")) {
    return "영상 인코더를 초기화할 수 없습니다. 필터 설정에 문제가 있을 수 있습니다.";
  }

  // Subtitle/font errors
  if (s.includes("ass") && (s.includes("failed") || s.includes("error"))) {
    return "자막 처리 중 오류가 발생했습니다. 자막 스타일을 변경한 후 다시 시도해주세요.";
  }

  // Disk space
  if (s.includes("no space left on device") || s.includes("disk full")) {
    return "디스크 공간이 부족합니다. 저장 공간을 확보한 후 다시 시도해주세요.";
  }

  // Permission
  if (s.includes("permission denied")) {
    return "파일 접근 권한이 없습니다. 내보내기 폴더의 권한을 확인해주세요.";
  }

  // Fallback: extract the most informative error line
  const errorLines = stderr
    .split("\n")
    .filter((line) => /error|invalid|fail|cannot|could not/i.test(line))
    .map((line) => line.trim())
    .filter(Boolean);

  if (errorLines.length > 0) {
    // Show first 2 error lines max, trimmed
    const summary = errorLines
      .slice(0, 2)
      .map((l) => (l.length > 120 ? l.slice(0, 120) + "…" : l))
      .join("\n");
    return `내보내기 실패:\n${summary}`;
  }

  return "내보내기 중 알 수 없는 오류가 발생했습니다. 다시 시도해주세요.";
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
    params.textOverlays,
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

    // filter_complex: split → gaussian blur crop → overlay → burn subs
    // Uses gblur (sigma-based) instead of boxblur to avoid radius limits
    // on low-res videos or small crop regions.
    const filterComplex = [
      `[0:v]split[main][toblur]`,
      `[toblur]crop=iw*${wRatio}:ih*${hRatio}:iw*${xRatio}:ih*${yRatio},gblur=sigma=30[blurred]`,
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
    throw new Error(parseFFmpegError(result.stderr));
  }

  params.onProgress?.(100, "내보내기 완료!");
  return outputPath;
}
