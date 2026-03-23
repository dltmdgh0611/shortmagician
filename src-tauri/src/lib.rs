mod commands;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let _ = &app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::extract_audio::extract_audio,
            commands::generate_subtitles::generate_subtitles,
            commands::compose_video::compose_video,
            commands::cleanup_pipeline::cleanup_pipeline,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
