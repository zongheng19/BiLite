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
        .plugin(tauri_plugin_dialog::init())
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

            // Resolve mpv sidecar path using Tauri's shell API
            let mpv_bin = app
                .path()
                .resource_dir()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?
                .join(if cfg!(windows) { "mpv.exe" } else { "mpv" });

            // Fallback: check if mpv is in the same directory as the executable
            let mpv_path = if mpv_bin.exists() {
                mpv_bin
            } else {
                let exe_dir = std::env::current_exe()
                    .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?
                    .parent()
                    .unwrap()
                    .to_path_buf();
                let alt = exe_dir.join(if cfg!(windows) { "mpv.exe" } else { "mpv" });
                if alt.exists() {
                    alt
                } else {
                    // Last resort: try system PATH
                    std::path::PathBuf::from(if cfg!(windows) { "mpv.exe" } else { "mpv" })
                }
            };

            let state = app.state::<AppState>();
            let mut process = state.mpv_process.lock().map_err(|e| e.to_string())?;

            match process.spawn(&wid, mpv_path.to_str().unwrap()) {
                Ok(()) => {
                    let ipc_path = process.ipc_path().to_string();
                    drop(process); // Release the lock before spawning thread

                    let app_handle = app.handle().clone();
                    std::thread::spawn(move || {
                        // Give mpv time to start and create the pipe
                        std::thread::sleep(std::time::Duration::from_millis(200));
                        match mpv::ipc::MpvIpc::connect(&ipc_path) {
                            Ok((ipc, mut rx)) => {
                                eprintln!("[BiLite] mpv IPC connected successfully");
                                let _ = ipc.observe_property(1, "time-pos");
                                let _ = ipc.observe_property(2, "duration");
                                let _ = ipc.observe_property(3, "pause");
                                let _ = ipc.observe_property(4, "volume");
                                let _ = ipc.observe_property(5, "speed");
                                let _ = ipc.observe_property(6, "eof-reached");
                                // Stats observers (for the debug overlay)
                                let _ = ipc.observe_property(10, "video-codec");
                                let _ = ipc.observe_property(11, "video-params/w");
                                let _ = ipc.observe_property(12, "video-params/h");
                                let _ = ipc.observe_property(13, "container-fps");
                                let _ = ipc.observe_property(14, "estimated-vf-fps");
                                let _ = ipc.observe_property(15, "audio-codec");
                                let _ = ipc.observe_property(16, "audio-params/samplerate");
                                let _ = ipc.observe_property(17, "audio-params/channel-count");
                                let _ = ipc.observe_property(18, "file-size");
                                let _ = ipc.observe_property(19, "video-bitrate");
                                let _ = ipc.observe_property(20, "audio-bitrate");
                                let _ = ipc.observe_property(21, "frame-drop-count");
                                let _ = ipc.observe_property(22, "decoder-frame-drop-count");
                                let _ = ipc.observe_property(23, "hwdec-current");
                                let _ = ipc.observe_property(24, "demuxer-cache-duration");

                                let state = app_handle.state::<AppState>();
                                *state.mpv_ipc.lock().unwrap() = Some(ipc);

                                // Forward mpv events to frontend with throttling
                                let rt = tokio::runtime::Runtime::new().unwrap();
                                rt.block_on(async {
                                    let mut last_time_pos = std::time::Instant::now();
                                    while let Some(event) = rx.recv().await {
                                        // Throttle time-pos to max 5 updates/sec
                                        if event.name.as_deref() == Some("time-pos") {
                                            let now = std::time::Instant::now();
                                            if now.duration_since(last_time_pos).as_millis() < 200 {
                                                continue;
                                            }
                                            last_time_pos = now;
                                        }
                                        let _ = app_handle.emit("mpv-event", &event);
                                    }
                                });
                            }
                            Err(e) => eprintln!("Failed to connect to mpv IPC: {}", e),
                        }
                    });
                }
                Err(e) => {
                    eprintln!("Failed to spawn mpv: {}. Player will run without video.", e);
                }
            }

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
            commands::set_video_property,
            commands::set_volume_max,
            commands::set_equalizer,
            commands::clear_equalizer,
            commands::toggle_loop,
            commands::toggle_mirror,
            commands::save_playback_position,
            commands::get_playback_position,
            commands::get_recent_playback,
            commands::get_config,
            commands::save_config,
            commands::is_first_run,
            commands::get_playlist,
            commands::get_next_file,
            commands::get_prev_file,
            commands::register_file_associations,
            commands::get_cli_args,
            commands::generate_ai_subtitle,
            commands::whisper_configured,
            commands::ai_subtitle_exists,
            commands::whisper_default_dir,
            commands::open_whisper_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BiLite");
}
