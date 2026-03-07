use tauri::AppHandle;
use tauri::Manager;
use serde::Deserialize;
use std::io::Write;

#[derive(Debug, Deserialize)]
pub struct SubtitleSegment {
    pub text: String,
    pub start_time: f64,
    pub end_time: f64,
}

/// Convert seconds to ASS timestamp format: H:MM:SS.CS
fn format_ass_time(seconds: f64) -> String {
    let total_cs = (seconds * 100.0).round() as u64;
    let cs = total_cs % 100;
    let total_s = total_cs / 100;
    let s = total_s % 60;
    let total_m = total_s / 60;
    let m = total_m % 60;
    let h = total_m / 60;
    format!("{}:{:02}:{:02}.{:02}", h, m, s, cs)
}

/// Check if a character is "wide" (CJK, Hangul, fullwidth, etc.).
/// Wide characters occupy roughly 2x the width of Latin characters.
fn is_wide_char(ch: char) -> bool {
    let cp = ch as u32;
    // CJK Unified Ideographs
    (0x4E00..=0x9FFF).contains(&cp)
    // CJK Extension A
    || (0x3400..=0x4DBF).contains(&cp)
    // CJK Compatibility Ideographs
    || (0xF900..=0xFAFF).contains(&cp)
    // Hangul Syllables
    || (0xAC00..=0xD7AF).contains(&cp)
    // Hangul Jamo
    || (0x1100..=0x11FF).contains(&cp)
    // Katakana
    || (0x30A0..=0x30FF).contains(&cp)
    // Hiragana
    || (0x3040..=0x309F).contains(&cp)
    // Fullwidth Latin / Halfwidth Katakana
    || (0xFF00..=0xFFEF).contains(&cp)
    // CJK Symbols and Punctuation
    || (0x3000..=0x303F).contains(&cp)
}

/// Calculate the display width of a string in abstract "units".
/// Wide (CJK) characters count as 2; narrow (Latin, etc.) count as 1.
fn display_width(text: &str) -> usize {
    text.chars().map(|c| if is_wide_char(c) { 2 } else { 1 }).sum()
}

/// Wrap subtitle text so that no line exceeds `max_units` display width.
///
/// For a 1080px canvas with 30px margins (1020px usable), font size 60 bold:
///   - CJK chars ≈ 60px each → 17 chars = 34 units max
///   - Latin chars ≈ 33px each → 30 chars = 30 units max
///
/// We use 28 units as a safe limit (14 CJK or 28 Latin per line).
/// Line breaks use ASS `\N` syntax.
fn wrap_subtitle_text(text: &str, max_units: usize) -> String {
    if display_width(text) <= max_units {
        return text.to_string();
    }

    let chars: Vec<char> = text.chars().collect();
    let mut result = String::new();
    let mut line_width: usize = 0;
    let mut line_start: usize = 0;
    let mut last_break_candidate: Option<usize> = None; // index AFTER the break char

    for (i, &ch) in chars.iter().enumerate() {
        let cw = if is_wide_char(ch) { 2 } else { 1 };

        // Track natural break points: after spaces, commas, periods, CJK punctuation
        if ch == ' ' || ch == ',' || ch == '.' || ch == '、' || ch == '。'
            || ch == '，' || ch == '；' || ch == '！' || ch == '？'
        {
            last_break_candidate = Some(i + 1);
        }
        // For CJK text (no spaces), allow breaking BEFORE any CJK character
        if is_wide_char(ch) && line_width > 0 {
            last_break_candidate = Some(i);
        }

        line_width += cw;

        if line_width > max_units {
            // Need to break
            let break_at = last_break_candidate.unwrap_or(i);

            let segment: String = chars[line_start..break_at].iter().collect();
            if !result.is_empty() {
                result.push_str("\\N");
            }
            result.push_str(segment.trim_end());

            line_start = break_at;
            // Skip leading space after break
            if line_start < chars.len() && chars[line_start] == ' ' {
                line_start += 1;
            }

            // Recalculate width from line_start to current position (inclusive)
            if line_start > i {
                // break_at was past current char — nothing left on this line yet
                line_width = 0;
            } else {
                line_width = chars[line_start..=i]
                    .iter()
                    .map(|c| if is_wide_char(*c) { 2 } else { 1 })
                    .sum();
            }
            last_break_candidate = None;
        }
    }

    // Append remaining text
    if line_start < chars.len() {
        let remaining: String = chars[line_start..].iter().collect();
        if !result.is_empty() {
            result.push_str("\\N");
        }
        result.push_str(remaining.trim_end());
    }

    result
}

/// Generate ASS subtitle file from translated segments.
#[tauri::command]
pub async fn generate_subtitles(
    app: AppHandle,
    segments: Vec<SubtitleSegment>,
    font_dir: String,
) -> Result<String, String> {
    if segments.is_empty() {
        return Err("자막 세그먼트가 비어있습니다.".to_string());
    }

    // 1. Resolve font name from font_dir
    let font_name = if std::path::Path::new(&font_dir).exists() {
        "Noto Sans CJK KR".to_string()
    } else {
        "Noto Sans CJK KR".to_string()
    };

    // 2. Build ASS content
    let mut ass = String::new();

    // [Script Info]
    ass.push_str("[Script Info]\n");
    ass.push_str("ScriptType: v4.00+\n");
    ass.push_str("PlayResX: 1080\n");
    ass.push_str("PlayResY: 1920\n");
    ass.push_str("WrapStyle: 0\n");
    ass.push_str("ScaledBorderAndShadow: yes\n");
    ass.push_str("\n");

    // [V4+ Styles]
    ass.push_str("[V4+ Styles]\n");
    ass.push_str("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n");
    ass.push_str(&format!(
        "Style: Default,{},80,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,5,30,30,0,1\n",
        font_name
    ));
    ass.push_str("\n");

    // [Events]
    ass.push_str("[Events]\n");
    ass.push_str("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n");

    // max_units = 20 → 10 CJK chars or 20 Latin chars per line (safe for 1080px at font size 80)
    const MAX_LINE_UNITS: usize = 20;

    for seg in &segments {
        let start = format_ass_time(seg.start_time);
        let end = format_ass_time(seg.end_time);
        let wrapped_text = wrap_subtitle_text(&seg.text, MAX_LINE_UNITS);
        ass.push_str(&format!(
            "Dialogue: 0,{},{},Default,,0,0,0,,{}\n",
            start, end, wrapped_text
        ));
    }

    // 3. Prepare output directory: AppLocalData/pipeline/
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("앱 데이터 디렉토리를 가져올 수 없습니다: {}", e))?;

    let pipeline_dir = data_dir.join("pipeline");
    if !pipeline_dir.exists() {
        std::fs::create_dir_all(&pipeline_dir)
            .map_err(|e| format!("pipeline 디렉토리를 생성할 수 없습니다: {}", e))?;
    }

    // 4. Write ASS file with UTF-8 BOM
    let output_path = pipeline_dir.join("subtitles.ass");
    let mut file = std::fs::File::create(&output_path)
        .map_err(|e| format!("자막 파일을 생성할 수 없습니다: {}", e))?;

    // UTF-8 BOM
    file.write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|e| format!("BOM 쓰기에 실패했습니다: {}", e))?;

    file.write_all(ass.as_bytes())
        .map_err(|e| format!("자막 내용 쓰기에 실패했습니다: {}", e))?;

    Ok(output_path.to_string_lossy().to_string())
}
