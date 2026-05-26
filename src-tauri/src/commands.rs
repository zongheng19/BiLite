use crate::mpv::ipc::MpvIpc;
use crate::mpv::process::MpvProcess;
use crate::playlist;
use crate::storage::config::AppConfig;
use crate::storage::database::{Database, PlaybackRecord};
use serde_json::json;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub mpv_process: Mutex<MpvProcess>,
    pub mpv_ipc: Mutex<Option<MpvIpc>>,
    pub database: Mutex<Database>,
    pub config: Mutex<AppConfig>,
    pub data_dir: PathBuf,
}

#[tauri::command]
pub fn play_file(path: String, state: State<AppState>) -> Result<(), String> {
    eprintln!("[BiLite] play_file called: {}", path);
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        eprintln!("[BiLite] sending loadfile to mpv");
        ipc.loadfile(&path)?;
        eprintln!("[BiLite] loadfile sent successfully");
    } else {
        eprintln!("[BiLite] mpv_ipc is None, cannot play");
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_pause(state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.send_command(&[json!("cycle"), json!("pause")])?;
    }
    Ok(())
}

#[tauri::command]
pub fn seek(seconds: f64, mode: String, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.seek(seconds, &mode)?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_volume(volume: f64, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.set_property("volume", json!(volume))?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_speed(speed: f64, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.set_property("speed", json!(speed))?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_fullscreen(window: tauri::WebviewWindow) -> Result<(), String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window
        .set_fullscreen(!is_fullscreen)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_subtitle_track(track_id: i64, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.set_property("sid", json!(track_id))?;
    }
    Ok(())
}

// ===== Video color adjustments =====
#[tauri::command]
pub fn set_video_property(name: String, value: f64, state: State<AppState>) -> Result<(), String> {
    // Allowed: brightness, contrast, saturation, hue, gamma (all -100 to 100)
    let allowed = ["brightness", "contrast", "saturation", "hue", "gamma"];
    if !allowed.contains(&name.as_str()) {
        return Err(format!("Unsupported video property: {}", name));
    }
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.set_property(&name, json!(value as i64))?;
    }
    Ok(())
}

// ===== Audio filters: volume boost + 10-band equalizer =====
// Volume boost: 0..400 (% of normal volume); the volume property handles up to volume-max
#[tauri::command]
pub fn set_volume_max(max_pct: f64, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.set_property("volume-max", json!(max_pct))?;
    }
    Ok(())
}

// Apply equalizer using mpv's `af add` with lavfi-wrapped firequalizer.
// `bands` is a 10-element array of gains in dB (-12..+12), at standard
// octave frequencies: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz.
// firequalizer interpolates between explicit entries, giving a smooth response.
#[tauri::command]
pub fn set_equalizer(bands: Vec<f64>, state: State<AppState>) -> Result<(), String> {
    if bands.len() != 10 {
        return Err("Equalizer requires exactly 10 bands".to_string());
    }
    // If all bands are zero, just remove the filter.
    if bands.iter().all(|g| g.abs() < 0.01) {
        return clear_equalizer(state);
    }
    const FREQS: [u32; 10] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    let mut entries = String::new();
    for (i, gain) in bands.iter().enumerate() {
        if i > 0 {
            entries.push(';');
        }
        entries.push_str(&format!("entry({},{})", FREQS[i], gain));
    }
    // Note: gain_entry value is wrapped in single quotes in mpv's lavfi-bridge.
    let filter = format!("@eq:lavfi=[firequalizer=gain_entry='{}']", entries);
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.send_command(&[json!("af"), json!("add"), json!(filter)])?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_equalizer(state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.send_command(&[json!("af"), json!("remove"), json!("@eq")])?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_loop(enabled: bool, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.set_property("loop-file", if enabled { json!("inf") } else { json!("no") })?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_mirror(enabled: bool, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        if enabled {
            ipc.send_command(&[json!("vf"), json!("add"), json!("@mirror:hflip")])?;
        } else {
            ipc.send_command(&[json!("vf"), json!("remove"), json!("@mirror")])?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn save_playback_position(
    path: String,
    position: f64,
    duration: f64,
    state: State<AppState>,
) -> Result<(), String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    db.save_position(&path, position, duration)
}

#[tauri::command]
pub fn get_playback_position(
    path: String,
    state: State<AppState>,
) -> Result<Option<PlaybackRecord>, String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    db.get_position(&path)
}

#[tauri::command]
pub fn get_recent_playback(state: State<AppState>) -> Result<Option<PlaybackRecord>, String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    db.get_most_recent()
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<AppConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn save_config(config: AppConfig, state: State<AppState>) -> Result<(), String> {
    let mut current = state.config.lock().map_err(|e| e.to_string())?;
    *current = config.clone();
    current.save(&state.data_dir)
}

#[tauri::command]
pub fn is_first_run(state: State<AppState>) -> bool {
    AppConfig::is_first_run(&state.data_dir)
}

#[tauri::command]
pub fn get_playlist(current_file: String) -> Vec<String> {
    playlist::scan_directory(&current_file)
}

#[tauri::command]
pub fn get_next_file(current_file: String) -> Option<String> {
    let list = playlist::scan_directory(&current_file);
    playlist::next_file(&list, &current_file).cloned()
}

#[tauri::command]
pub fn get_prev_file(current_file: String) -> Option<String> {
    let list = playlist::scan_directory(&current_file);
    playlist::prev_file(&list, &current_file).cloned()
}

#[tauri::command]
pub fn register_file_associations(extensions: Vec<String>) -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .to_str()
        .unwrap_or("")
        .to_string();

    #[cfg(target_os = "windows")]
    crate::platform::windows::register_associations(&exe_path, &extensions)?;

    Ok(())
}

#[tauri::command]
pub fn get_cli_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}
