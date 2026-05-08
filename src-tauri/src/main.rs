#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod mpv;
mod platform;
mod playlist;
mod storage;

use commands::AppState;
use mpv::process::MpvProcess;
use storage::config::AppConfig;
use storage::database::Database;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

fn main() {
    let data_dir = dirs::data_dir().unwrap().join("BiLite");
    let database = Database::open(&data_dir).expect("Failed to open database");
    let config = AppConfig::load(&data_dir);

    tauri::Builder::default()
        .manage(AppState {
            mpv_process: Mutex::new(MpvProcess::new()),
            mpv_ipc: Mutex::new(None),
            database: Mutex::new(database),
            config: Mutex::new(config),
            data_dir,
        })
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let wid = platform::get_window_handle(&window)
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;

            let mpv_bin = app
                .path()
                .resource_dir()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?
                .join(if cfg!(windows) { "mpv.exe" } else { "mpv" });

            let state = app.state::<AppState>();
            let mut process = state.mpv_process.lock().map_err(|e| e.to_string())?;
            process
                .spawn(&wid, mpv_bin.to_str().unwrap())
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;

            // Wait briefly for mpv to create IPC socket, then connect
            let ipc_path = process.ipc_path().to_string();
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                match mpv::ipc::MpvIpc::connect(&ipc_path) {
                    Ok((ipc, mut rx)) => {
                        let _ = ipc.observe_property(1, "time-pos");
                        let _ = ipc.observe_property(2, "duration");
                        let _ = ipc.observe_property(3, "pause");
                        let _ = ipc.observe_property(4, "volume");
                        let _ = ipc.observe_property(5, "speed");
                        let _ = ipc.observe_property(6, "eof-reached");

                        let state = app_handle.state::<AppState>();
                        *state.mpv_ipc.lock().unwrap() = Some(ipc);

                        // Forward mpv events to frontend
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        rt.block_on(async {
                            while let Some(event) = rx.recv().await {
                                let _ = app_handle.emit("mpv-event", &event);
                            }
                        });
                    }
                    Err(e) => eprintln!("Failed to connect to mpv IPC: {}", e),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::play_file,
            commands::toggle_pause,
            commands::seek,
            commands::set_volume,
            commands::set_speed,
            commands::toggle_fullscreen,
            commands::set_subtitle_track,
            commands::save_playback_position,
            commands::get_playback_position,
            commands::get_config,
            commands::save_config,
            commands::is_first_run,
            commands::get_playlist,
            commands::get_next_file,
            commands::get_prev_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BiLite");
}
