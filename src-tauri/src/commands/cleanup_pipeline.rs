use tauri::AppHandle;
use tauri::Manager;

/// Delete the pipeline working directory (AppLocalData/pipeline/).
/// Used for cleanup after success, failure, or cancellation.
///
/// - On success: called to remove intermediate files (audio.mp3, TTS files) while
///   the composedVideo and pipeline.log are preserved.
/// - On failure/cancel: called to remove all temp files except pipeline.log for debugging.
#[tauri::command]
pub async fn cleanup_pipeline(app: AppHandle, keep_composed: bool) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("앱 데이터 디렉토리를 가져올 수 없습니다: {}", e))?;

    let pipeline_dir = data_dir.join("pipeline");

    if !pipeline_dir.exists() {
        return Ok(());
    }

    if keep_composed {
        // Remove intermediate files but keep composed.mp4 and pipeline.log
        let entries = std::fs::read_dir(&pipeline_dir)
            .map_err(|e| format!("pipeline 디렉토리를 읽을 수 없습니다: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();

            if name == "composed.mp4" || name == "pipeline.log" {
                continue;
            }

            if path.is_dir() {
                let _ = std::fs::remove_dir_all(&path);
            } else {
                let _ = std::fs::remove_file(&path);
            }
        }
    } else {
        // Remove everything except pipeline.log (keep for debugging)
        let entries = std::fs::read_dir(&pipeline_dir)
            .map_err(|e| format!("pipeline 디렉토리를 읽을 수 없습니다: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();

            if name == "pipeline.log" {
                continue;
            }

            if path.is_dir() {
                let _ = std::fs::remove_dir_all(&path);
            } else {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    Ok(())
}
