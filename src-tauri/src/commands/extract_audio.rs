use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use std::path::PathBuf;

/// Extract audio from video file using FFmpeg sidecar.
/// Output: 16kHz mono MP3 (optimal for Whisper API).
#[tauri::command]
pub async fn extract_audio(app: AppHandle, video_path: String) -> Result<String, String> {
    // 1. Validate input file exists
    let video = PathBuf::from(&video_path);
    if !video.exists() {
        return Err("영상 파일을 찾을 수 없습니다.".to_string());
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

    let output_path = pipeline_dir.join("audio.mp3");
    let output_str = output_path.to_string_lossy().to_string();

    // 3. Spawn FFmpeg sidecar: extract 16kHz mono MP3
    let shell = app.shell();
    let output = shell
        .sidecar("binaries/ffmpeg")
        .map_err(|e| format!("FFmpeg 사이드카를 실행할 수 없습니다: {}", e))?
        .args(["-i", &video_path, "-vn", "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", "-b:a", "64k", "-y", &output_str])
        .output()
        .await
        .map_err(|e| format!("FFmpeg 실행에 실패했습니다: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("오디오 추출에 실패했습니다: {}", stderr));
    }

    // 4. Verify output exists
    if !output_path.exists() {
        return Err("오디오 파일이 생성되지 않았습니다.".to_string());
    }

    Ok(output_str)
}
