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
    if !is_fullscreen {
        // If currently maximized, unmaximize first — some platforms (Windows)
        // refuse to transition directly from maximized to fullscreen.
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        }
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
    }
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

// ===== AI subtitles via whisper.cpp =====
// Layout (PotPlayer-style):
//   <portable_root>/Model/         — *.bin / *.gguf (or model dirs containing them)
//   <portable_root>/Module/Whisper/ — whisper-cli.exe / main.exe / main64.exe
//
// `<portable_root>` is searched in this order:
//   1. exe's parent directory (portable install)
//   2. <data_dir>/                (user data dir, %APPDATA%/BiLite)
//
// User can override either path via the settings panel; explicit settings win.

// whisper.cpp executables we recognize, in preferred order:
// - whisper-cli.exe (newer official build)
// - main64.exe (PotPlayer's whisper.cpp builds in CPU/, Vulkan/ subdirs)
// - main.exe (BUT NOT Const-me's main.exe — see is_constme_whisper)
const WHISPER_EXE_NAMES: &[&str] = &[
    "whisper-cli.exe", "whisper-cli", "main64.exe", "main.exe", "main",
];
const MODEL_EXT: &[&str] = &["bin", "gguf"];

fn portable_roots(state: &AppState) -> Vec<std::path::PathBuf> {
    let mut roots = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    roots.push(state.data_dir.clone());
    roots
}

/// Const-me/Whisper ships as `main.exe` next to `Whisper.dll`. Its CLI is NOT
/// compatible with whisper.cpp (no -of / -osrt / -m flags). Skip it.
fn is_constme_whisper(exe: &std::path::Path) -> bool {
    if let Some(parent) = exe.parent() {
        // Const-me uses Whisper.dll (capital W), whisper.cpp uses whisper64.dll / whisper.dll
        if parent.join("Whisper.dll").exists()
            && !parent.join("whisper64.dll").exists()
            && !parent.join("whisper.dll").exists()
        {
            return true;
        }
        // Folder name "Const-me" is also a strong signal
        if let Some(name) = parent.file_name().and_then(|n| n.to_str()) {
            if name.eq_ignore_ascii_case("Const-me") {
                return true;
            }
        }
    }
    false
}

fn find_whisper_exe(state: &AppState) -> Option<std::path::PathBuf> {
    for root in portable_roots(state) {
        let dir = root.join("Module").join("Whisper");
        if !dir.exists() { continue; }
        // Direct executables in Module/Whisper/
        for name in WHISPER_EXE_NAMES {
            let candidate = dir.join(name);
            if candidate.exists() && !is_constme_whisper(&candidate) {
                return Some(candidate);
            }
        }
        // One level deep — collect all candidates, prefer GPU > CPU > Const-me
        if let Ok(entries) = std::fs::read_dir(&dir) {
            let mut subdirs: Vec<std::path::PathBuf> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect();
            subdirs.sort_by_key(|p| {
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                // Prefer GPU > CPU > others > Const-me. GPU backends can crash
                // on driver mismatch; we'll fall back if that happens.
                if name.contains("const-me") { 9 }
                else if name.contains("vulkan") || name.contains("cuda") || name.contains("gpu") { 0 }
                else if name.contains("cpu") { 1 }
                else { 5 }
            });
            for sub in subdirs {
                for name in WHISPER_EXE_NAMES {
                    let candidate = sub.join(name);
                    if candidate.exists() && !is_constme_whisper(&candidate) {
                        return Some(candidate);
                    }
                }
            }
        }
    }
    None
}

// Detect a faster-whisper / CTranslate2 model directory (not compatible).
fn is_faster_whisper_dir(dir: &std::path::Path) -> bool {
    if !dir.is_dir() { return false; }
    let has_model = dir.join("model.bin").exists()
        || dir.join("model.safetensors").exists();
    let metadata_markers = ["tokenizer.json", "preprocessor_config.json", "vocabulary.json", "config.json"];
    let metadata_hits = metadata_markers.iter().filter(|m| dir.join(m).exists()).count();
    has_model && metadata_hits >= 1
}

fn is_faster_whisper_model_file(model_file: &std::path::Path) -> bool {
    if let Some(parent) = model_file.parent() {
        return is_faster_whisper_dir(parent);
    }
    false
}

fn find_whisper_model(state: &AppState) -> Option<std::path::PathBuf> {
    for root in portable_roots(state) {
        let dir = root.join("Model");
        if !dir.exists() { continue; }
        // Direct files in Model/
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if MODEL_EXT.contains(&ext.to_lowercase().as_str())
                            && !is_faster_whisper_model_file(&path)
                        {
                            return Some(path);
                        }
                    }
                }
            }
            // One level deep (Model/<name>/*.bin), but skip faster-whisper dirs.
            for entry in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
                let p = entry.path();
                if p.is_dir() && !is_faster_whisper_dir(&p) {
                    if let Ok(sub) = std::fs::read_dir(&p) {
                        for f in sub.flatten() {
                            let path = f.path();
                            if path.is_file() {
                                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                    if MODEL_EXT.contains(&ext.to_lowercase().as_str()) {
                                        return Some(path);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

fn detect_potplayer_models(state: &AppState) -> bool {
    for root in portable_roots(state) {
        let dir = root.join("Model");
        if !dir.exists() { continue; }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() && is_faster_whisper_dir(&p) {
                    return true;
                }
            }
        }
    }
    false
}

/// PotPlayer-built whisper main64.exe reads command-line args as ANSI/GBK
/// and crashes (STATUS_STACK_BUFFER_OVERRUN) when given UTF-8 paths with
/// non-ASCII characters. To work around this, hardlink (or copy) the model
/// to an ASCII-only path under %TEMP%/bilite-models/ and return that path.
/// The hardlink is created once and reused.
fn ascii_safe_model_path(model: &str) -> Result<String, String> {
    if model.is_ascii() {
        return Ok(model.to_string());
    }
    let src = std::path::PathBuf::from(model);
    let dest_dir = std::env::temp_dir().join("bilite-models");
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("无法创建模型缓存目录: {}", e))?;
    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("model.bin")
        .to_string();
    // Sanitize: replace any non-ASCII chars in the filename too.
    let safe_name: String = file_name
        .chars()
        .map(|c| if c.is_ascii() { c } else { '_' })
        .collect();
    let dest = dest_dir.join(&safe_name);
    if dest.exists() {
        // Already linked / copied. Verify size matches; if not, recreate.
        if let (Ok(src_meta), Ok(dest_meta)) = (std::fs::metadata(&src), std::fs::metadata(&dest)) {
            if src_meta.len() == dest_meta.len() {
                return Ok(dest.to_string_lossy().to_string());
            }
        }
        let _ = std::fs::remove_file(&dest);
    }
    // Try hardlink first (instant, no extra space)
    if std::fs::hard_link(&src, &dest).is_ok() {
        return Ok(dest.to_string_lossy().to_string());
    }
    // Fall back to copy (works across volumes)
    std::fs::copy(&src, &dest)
        .map_err(|e| format!("无法将模型复制到 ASCII 路径: {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

fn resolve_whisper_paths(state: &AppState) -> Result<(String, String, String), String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let mut exe = config.whisper.executable.clone();
    let mut model = config.whisper.model.clone();
    let lang = config.whisper.language.clone();
    drop(config);

    if exe.is_empty() {
        if let Some(p) = find_whisper_exe(state) {
            exe = p.to_string_lossy().to_string();
        }
    }
    if model.is_empty() {
        if let Some(p) = find_whisper_model(state) {
            model = p.to_string_lossy().to_string();
        }
    }

    if exe.is_empty() && model.is_empty() {
        return Err("未找到 whisper 可执行文件和模型，请放入 Module/Whisper/ 和 Model/ 目录".to_string());
    }
    if exe.is_empty() {
        return Err("未找到 whisper 可执行文件，请放入 Module/Whisper/ 目录".to_string());
    }
    if model.is_empty() {
        if detect_potplayer_models(state) {
            return Err(
                "检测到 PotPlayer 风格的 faster-whisper 模型，但 BiLite 使用 whisper.cpp 的 GGML 格式（单文件 ggml-*.bin / .gguf），两者不兼容。请从 https://huggingface.co/ggerganov/whisper.cpp/tree/main 下载 GGML 模型放入 Model/ 目录。"
                    .to_string()
            );
        }
        return Err("未找到 GGML 格式模型文件（ggml-*.bin / .gguf），请放入 Model/ 目录".to_string());
    }
    Ok((exe, model, lang))
}

#[tauri::command]
pub async fn generate_ai_subtitle(
    video_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Collect a verbose log of every step. Always written to <data_dir>/ai-subtitle.log
    // so it can be inspected after a failure.
    let log_path = state.data_dir.join("ai-subtitle.log");
    let mut log_lines: Vec<String> = Vec::new();
    let log_now = || -> String {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| format!("{}.{:03}", d.as_secs(), d.subsec_millis()))
            .unwrap_or_else(|_| "0".to_string())
    };
    macro_rules! logln {
        ($lines:expr, $($arg:tt)*) => {{
            let line = format!("[{}] {}", log_now(), format!($($arg)*));
            eprintln!("{}", line);
            $lines.push(line);
        }};
    }
    let _ = std::fs::create_dir_all(&state.data_dir);
    let flush_log = |lines: &Vec<String>| {
        let body = lines.join("\n") + "\n";
        let _ = std::fs::write(&log_path, body);
    };

    logln!(log_lines, "=== AI subtitle generation start ===");
    logln!(log_lines, "video_path: {}", video_path);

    let (executable, model, language) = match resolve_whisper_paths(&state) {
        Ok(v) => v,
        Err(e) => {
            logln!(log_lines, "resolve_whisper_paths failed: {}", e);
            flush_log(&log_lines);
            return Err(e);
        }
    };
    // whisper.cpp expects a language code or "auto"; treat empty as auto.
    let language = if language.trim().is_empty() {
        "auto".to_string()
    } else {
        language
    };
    logln!(log_lines, "executable: {}", executable);
    logln!(log_lines, "model: {}", model);
    logln!(log_lines, "language: {}", language);

    // Some whisper.cpp builds (notably PotPlayer's main64.exe) parse argv as
    // ANSI/GBK and crash on UTF-8 paths with non-ASCII chars. Workaround:
    // hardlink the model to a pure-ASCII path under %TEMP%/bilite-models/.
    let model_for_whisper = match ascii_safe_model_path(&model) {
        Ok(p) => p,
        Err(e) => {
            logln!(log_lines, "ascii_safe_model_path failed: {}", e);
            flush_log(&log_lines);
            return Err(e);
        }
    };
    if model_for_whisper != model {
        logln!(log_lines, "model (ASCII-safe alias): {}", model_for_whisper);
    }

    let exe = std::path::PathBuf::from(&executable);
    if !exe.exists() {
        logln!(log_lines, "executable not found");
        flush_log(&log_lines);
        return Err(format!("whisper 可执行文件不存在: {}", executable));
    }
    let model_path = std::path::PathBuf::from(&model);
    if !model_path.exists() {
        logln!(log_lines, "model not found");
        flush_log(&log_lines);
        return Err(format!("whisper 模型文件不存在: {}", model));
    }
    let video = std::path::PathBuf::from(&video_path);
    if !video.exists() {
        logln!(log_lines, "video not found");
        flush_log(&log_lines);
        return Err(format!("视频文件不存在: {}", video_path));
    }

    let video_dir = video.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let video_stem = video.file_stem().and_then(|s| s.to_str()).unwrap_or("video").to_string();
    let final_srt = video_dir.join(format!("{}.bilite-ai.srt", video_stem));
    let final_srt_str = final_srt.to_string_lossy().to_string();
    logln!(log_lines, "video_dir: {}", video_dir.display());
    logln!(log_lines, "final_srt: {}", final_srt_str);

    // If an AI subtitle file already exists for this video, skip generation
    // and just load it. This makes re-opening a previously-processed video
    // instant.
    if final_srt.exists() {
        logln!(log_lines, "existing AI subtitle found, loading without regenerating");
        let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
        if let Some(ref ipc) = *ipc {
            ipc.send_command(&[json!("sub-add"), json!(final_srt_str.clone()), json!("select")])?;
        }
        flush_log(&log_lines);
        return Ok(final_srt_str);
    }

    let unique_id = format!("{}-{}", std::process::id(), std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0));
    let tmp_dir = std::env::temp_dir();
    let tmp_wav = tmp_dir.join(format!("bilite-ai-{}.wav", unique_id));
    let tmp_out_base = tmp_dir.join(format!("bilite-ai-{}", unique_id));
    let tmp_srt = tmp_dir.join(format!("bilite-ai-{}.srt", unique_id));
    let tmp_wav_str = tmp_wav.to_string_lossy().to_string();
    let tmp_out_base_str = tmp_out_base.to_string_lossy().to_string();
    let tmp_srt_str = tmp_srt.to_string_lossy().to_string();
    logln!(log_lines, "tmp_dir: {}", tmp_dir.display());
    logln!(log_lines, "tmp_wav: {}", tmp_wav_str);
    logln!(log_lines, "tmp_out_base: {}", tmp_out_base_str);
    logln!(log_lines, "expected tmp_srt: {}", tmp_srt_str);

    let mpv_bin = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(if cfg!(windows) { "mpv.exe" } else { "mpv" })))
        .filter(|p| p.exists())
        .unwrap_or_else(|| std::path::PathBuf::from(if cfg!(windows) { "mpv.exe" } else { "mpv" }));
    let mpv_path_str = mpv_bin.to_string_lossy().to_string();
    logln!(log_lines, "mpv: {}", mpv_path_str);

    logln!(log_lines, "--- step 1: extract audio with mpv ---");
    {
        let video_clone = video_path.clone();
        let tmp_wav_for_task = tmp_wav_str.clone();
        let mpv_path_clone = mpv_path_str.clone();
        let mpv_result = tokio::task::spawn_blocking(move || -> Result<(String, String), String> {
            let mut cmd = std::process::Command::new(&mpv_path_clone);
            cmd.arg(&video_clone)
                .arg("--no-config")
                .arg("--no-video")
                .arg("--audio-channels=mono")
                .arg("--audio-samplerate=16000")
                .arg("--oac=pcm_s16le")
                .arg("--of=wav")
                .arg(format!("--o={}", tmp_wav_for_task))
                .arg("--quiet");
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            let output = cmd.output().map_err(|e| format!("运行 mpv 抽音频失败: {}", e))?;
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if !output.status.success() {
                return Err(format!("mpv 抽音频失败 (exit {:?})\nstderr: {}\nstdout: {}", output.status.code(), stderr, stdout));
            }
            Ok((stderr, stdout))
        })
        .await
        .map_err(|e| format!("音频提取调度失败: {}", e));

        match mpv_result {
            Ok(Ok((stderr, stdout))) => {
                logln!(log_lines, "mpv stderr: {}", stderr.trim());
                logln!(log_lines, "mpv stdout: {}", stdout.trim());
            }
            Ok(Err(e)) | Err(e) => {
                logln!(log_lines, "mpv extraction error: {}", e);
                flush_log(&log_lines);
                return Err(e);
            }
        }
    }

    if let Ok(meta) = std::fs::metadata(&tmp_wav_str) {
        logln!(log_lines, "tmp wav size: {} bytes", meta.len());
    } else {
        logln!(log_lines, "tmp wav NOT FOUND after mpv ran");
        flush_log(&log_lines);
        return Err("mpv 抽音频完成但未找到输出 wav 文件".to_string());
    }

    logln!(log_lines, "--- step 2: run whisper ---");
    let exe_path = executable.clone();
    let exe_path_for_err = executable.clone();
    let model_str = model_for_whisper.clone();
    let audio_str = tmp_wav_str.clone();
    let out_base_for_task = tmp_out_base_str.clone();
    let lang = language.clone();
    logln!(log_lines, "whisper cmd: \"{}\" -m \"{}\" -l \"{}\" -of \"{}\" -osrt \"{}\"",
        exe_path, model_str, lang, out_base_for_task, audio_str);

    let result = tokio::task::spawn_blocking(move || -> Result<(String, String, std::process::ExitStatus), String> {
        let mut cmd = std::process::Command::new(&exe_path);
        cmd.arg("-m").arg(&model_str)
            .arg("-l").arg(&lang)
            .arg("-of").arg(&out_base_for_task)
            .arg("-osrt")
            .arg(&audio_str);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd.output().map_err(|e| format!("运行 whisper 失败: {}", e))?;
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok((stderr, stdout, output.status))
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e));

    let (whisper_stderr, whisper_stdout, whisper_status) = match result {
        Ok(Ok(t)) => t,
        Ok(Err(e)) | Err(e) => {
            logln!(log_lines, "whisper run error: {}", e);
            flush_log(&log_lines);
            let _ = std::fs::remove_file(&tmp_wav_str);
            return Err(e);
        }
    };
    let _ = std::fs::remove_file(&tmp_wav_str);
    logln!(log_lines, "whisper exit: {:?}", whisper_status.code());
    logln!(log_lines, "whisper stderr ({} bytes): {}", whisper_stderr.len(), whisper_stderr);
    logln!(log_lines, "whisper stdout ({} bytes): {}", whisper_stdout.len(), whisper_stdout);

    if !whisper_status.success() {
        flush_log(&log_lines);
        return Err(format!(
            "whisper 退出码非零 (code {:?})\n详细日志: {}",
            whisper_status.code(),
            log_path.display()
        ));
    }

    // List recent files in temp dir to see what whisper actually produced
    logln!(log_lines, "--- temp dir scan after whisper ---");
    if let Ok(entries) = std::fs::read_dir(&tmp_dir) {
        let mut count = 0;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.contains("bilite") || name.contains(&unique_id) {
                if let Ok(meta) = entry.metadata() {
                    logln!(log_lines, "  {} ({} bytes)", name, meta.len());
                    count += 1;
                }
            }
        }
        if count == 0 {
            logln!(log_lines, "  (no bilite-* files found in temp)");
        }
    }
    // Also list any SRT files created in the last 30s anywhere we can guess
    logln!(log_lines, "--- video dir scan ---");
    if let Ok(entries) = std::fs::read_dir(&video_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".srt") {
                logln!(log_lines, "  {}", name);
            }
        }
    }

    let find_srt = || -> Option<std::path::PathBuf> {
        let candidates = [
            std::path::PathBuf::from(&tmp_srt_str),
            tmp_dir.join(format!("bilite-ai-{}.wav.srt", unique_id)),
            tmp_dir.join(format!("bilite-ai-{}.srt.srt", unique_id)),
        ];
        for c in &candidates {
            if c.exists() {
                return Some(c.clone());
            }
        }
        if let Ok(entries) = std::fs::read_dir(&tmp_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.contains(&unique_id) && name.ends_with(".srt") {
                    return Some(p);
                }
            }
        }
        None
    };

    let produced_srt = match find_srt() {
        Some(p) => {
            logln!(log_lines, "found whisper-written SRT at: {}", p.display());
            // Replace the streamed partial file with whisper's authoritative SRT
            // (better-formatted with proper segment numbering).
            if let Err(e) = std::fs::rename(&p, &final_srt) {
                logln!(log_lines, "rename failed: {}, falling back to copy", e);
                match std::fs::copy(&p, &final_srt) {
                    Ok(_) => { let _ = std::fs::remove_file(&p); }
                    Err(e2) => {
                        logln!(log_lines, "copy also failed: {}", e2);
                        // Keep the streamed file we already wrote; not a hard failure
                    }
                }
            }
            final_srt.clone()
        }
        None => {
            // Whisper didn't write its own SRT, but our streaming code may have
            // already written to final_srt. Check if we have anything there.
            if let Ok(meta) = std::fs::metadata(&final_srt) {
                if meta.len() > 0 {
                    logln!(log_lines, "using streamed SRT at: {}", final_srt.display());
                    final_srt.clone()
                } else {
                    logln!(log_lines, "SRT NOT FOUND anywhere (streamed file is empty)");
                    flush_log(&log_lines);
                    return Err(format!(
                        "whisper 完成但未找到输出文件。完整日志已写入:\n{}\n\n选用可执行: {}",
                        log_path.display(), exe_path_for_err
                    ));
                }
            } else {
                logln!(log_lines, "SRT NOT FOUND anywhere");
                flush_log(&log_lines);
                return Err(format!(
                    "whisper 完成但未找到输出文件。完整日志已写入:\n{}\n\n选用可执行: {}",
                    log_path.display(), exe_path_for_err
                ));
            }
        }
    };
    logln!(log_lines, "final SRT at: {}", produced_srt.display());

    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.send_command(&[json!("sub-add"), json!(final_srt_str.clone()), json!("select")])?;
    }

    logln!(log_lines, "=== success ===");
    flush_log(&log_lines);
    Ok(final_srt_str)
}

#[tauri::command]
pub fn whisper_configured(state: State<AppState>) -> bool {
    resolve_whisper_paths(&state).is_ok()
}

#[tauri::command]
pub fn ai_subtitle_exists(video_path: String) -> bool {
    let video = std::path::PathBuf::from(&video_path);
    let stem = match video.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s.to_string(),
        None => return false,
    };
    let dir = match video.parent() {
        Some(d) => d.to_path_buf(),
        None => return false,
    };
    dir.join(format!("{}.bilite-ai.srt", stem)).exists()
}

#[derive(serde::Serialize)]
pub struct WhisperPaths {
    pub model_dir: String,
    pub module_dir: String,
}

#[tauri::command]
pub fn whisper_default_dir(state: State<AppState>) -> WhisperPaths {
    // Prefer the exe's parent (portable layout); fall back to data_dir.
    let root = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| state.data_dir.clone());
    WhisperPaths {
        model_dir: root.join("Model").to_string_lossy().to_string(),
        module_dir: root.join("Module").join("Whisper").to_string_lossy().to_string(),
    }
}

#[tauri::command]
pub fn open_whisper_dir(state: State<AppState>) -> Result<(), String> {
    let root = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| state.data_dir.clone());
    let model_dir = root.join("Model");
    let module_dir = root.join("Module").join("Whisper");
    std::fs::create_dir_all(&model_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&module_dir).map_err(|e| e.to_string())?;

    let dir_str = root.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(&dir_str).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&dir_str).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(&dir_str).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}
