mod commands;

use std::sync::Mutex;
use tauri::Manager;

// ── Backend process state ────────────────────────────────────────────────────
// Holds the child process handle so we can kill it on app exit.
struct BackendProcess(Mutex<Option<std::process::Child>>);

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ── Backend spawner (release builds on Windows only) ─────────────────────────
// In development, the backend is started separately via `yarn dev:backend`.
#[cfg(all(not(debug_assertions), target_os = "windows"))]
fn kill_port_8000() {
    use std::process::Command;

    // Find PID listening on port 8000 and kill it (cleanup from previous run)
    let output = Command::new("cmd")
        .args(["/C", "for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do @echo %a"])
        .output();

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for pid_str in stdout.split_whitespace() {
            if let Ok(pid) = pid_str.trim().parse::<u32>() {
                if pid > 0 {
                    eprintln!("[ShortMagician] Killing stale process on port 8000 (PID: {})", pid);
                    let _ = Command::new("taskkill")
                        .args(["/F", "/T", "/PID", &pid.to_string()])
                        .output();
                }
            }
        }
    }
}

#[cfg(all(not(debug_assertions), target_os = "windows"))]
fn kill_process_tree(pid: u32) {
    use std::process::Command;
    // /T = kill entire process tree, /F = force
    let _ = Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .output();
}

#[cfg(all(not(debug_assertions), target_os = "windows"))]
fn spawn_backend() -> Option<std::process::Child> {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    // Kill any leftover backend from a previous run, then wait for port to be freed
    kill_port_8000();
    std::thread::sleep(std::time::Duration::from_millis(1500));

    let exe_path = std::env::current_exe().ok()?;
    let app_dir = exe_path.parent()?;
    // In NSIS bundle: resources are in {install_dir}/resources/
    // Fallback to same directory for portable builds
    let backend_exe = {
        let bundled = app_dir.join("resources").join("backend.exe");
        if bundled.exists() {
            bundled
        } else {
            app_dir.join("backend.exe")
        }
    };

    if !backend_exe.exists() {
        eprintln!(
            "[ShortMagician] backend.exe not found at {:?}",
            backend_exe
        );
        return None;
    }

    // Redirect stderr to a log file for debugging
    let log_file = std::fs::File::create(app_dir.join("backend.log")).ok();

    let mut cmd = Command::new(&backend_exe);
    cmd.current_dir(app_dir).stdout(Stdio::null());

    // CREATE_NO_WINDOW (0x08000000) prevents a console window from appearing
    cmd.creation_flags(0x08000000);

    match log_file {
        Some(f) => {
            cmd.stderr(Stdio::from(f));
        }
        None => {
            cmd.stderr(Stdio::null());
        }
    }

    match cmd.spawn() {
        Ok(child) => {
            eprintln!("[ShortMagician] Backend started (PID: {})", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!("[ShortMagician] Failed to start backend: {}", e);
            None
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            // In release builds, spawn the bundled backend server
            #[cfg(all(not(debug_assertions), target_os = "windows"))]
            {
                let child = spawn_backend();
                let state = app.state::<BackendProcess>();
                *state.0.lock().unwrap() = child;
            }

            // Suppress unused variable warning in debug builds
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
        .run(|app_handle, event| {
            // Kill the backend process tree when the app exits
            if let tauri::RunEvent::Exit = event {
                let state: tauri::State<BackendProcess> = app_handle.state();
                let child_opt = state.0.lock().unwrap().take();
                if let Some(mut child) = child_opt {
                    let pid = child.id();
                    eprintln!("[ShortMagician] Stopping backend tree (PID: {})...", pid);
                    // Kill entire process tree — PyInstaller --onefile spawns a child process
                    #[cfg(all(not(debug_assertions), target_os = "windows"))]
                    kill_process_tree(pid);
                    // Fallback: also kill the direct child
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
