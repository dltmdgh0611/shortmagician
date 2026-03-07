mod commands;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::extract_audio::extract_audio,
            commands::generate_subtitles::generate_subtitles,
            commands::compose_video::compose_video,
            commands::cleanup_pipeline::cleanup_pipeline,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
