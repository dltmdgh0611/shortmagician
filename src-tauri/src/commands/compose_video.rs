use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use std::path::PathBuf;

/// Compose final video with TTS audio and burned-in subtitles using FFmpeg.
#[tauri::command]
pub async fn compose_video(
    app: AppHandle,
    video_path: String,
    tts_audio_path: String,
    subtitle_path: String,
    font_dir: String,
) -> Result<String, String> {
    // 1. Validate all input paths exist
    let video = PathBuf::from(&video_path);
    if !video.exists() {
        return Err("영상 파일을 찾을 수 없습니다.".to_string());
    }

    let tts_audio = PathBuf::from(&tts_audio_path);
    if !tts_audio.exists() {
        return Err("TTS 오디오 파일을 찾을 수 없습니다.".to_string());
    }

    let subtitle = PathBuf::from(&subtitle_path);
    if !subtitle.exists() {
        return Err("자막 파일을 찾을 수 없습니다.".to_string());
    }

    // 2. Prepare output directory: AppLocalData/pipeline/
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("앱 데이터 디렉토리를 가져올 수 없습니다: {}", e))?;

    let pipeline_dir = data_dir.join("pipeline");
    if !pipeline_dir.exists() {
        std::fs::create_dir_all(&pipeline_dir)
            .map_err(|e| format!("pipeline 디렉토리를 생성할 수 없습니다: {}", e))?;
    }

    let output_path = pipeline_dir.join("composed.mp4");
    let output_str = output_path.to_string_lossy().to_string();

    // 3. Escape Windows backslashes for FFmpeg ASS filter
    let subtitle_escaped = subtitle_path.replace('\\', "/");
    let font_dir_escaped = font_dir.replace('\\', "/");

    // 4. Build ASS filter: burn subtitles with custom font directory
    let filter = format!(
        "[0:v]ass='{}':fontsdir='{}' [v]",
        subtitle_escaped, font_dir_escaped
    );

    // 5. Spawn FFmpeg sidecar: combine video + TTS audio + burned-in subtitles
    let shell = app.shell();
    let output = shell
        .sidecar("binaries/ffmpeg")
        .map_err(|e| format!("FFmpeg 사이드카를 실행할 수 없습니다: {}", e))?
        .args([
            "-i", &video_path,
            "-i", &tts_audio_path,
            "-filter_complex", &filter,
            "-map", "[v]",
            "-map", "1:a",
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "fast",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            "-y", &output_str,
        ])
        .output()
        .await
        .map_err(|e| format!("FFmpeg 실행에 실패했습니다: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("영상 합성에 실패했습니다: {}", stderr));
    }

    // 6. Verify output exists
    if !output_path.exists() {
        return Err("합성된 영상 파일이 생성되지 않았습니다.".to_string());
    }

    Ok(output_str)
}
