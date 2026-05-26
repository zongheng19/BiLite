# BiLite Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, cross-platform local video player with Bilibili-style UI using Tauri v2 + mpv sidecar.

**Architecture:** Tauri v2 app with Rust backend managing an mpv child process via JSON IPC over named pipes (Windows) / Unix domain sockets (macOS/Linux). mpv renders video into the native window handle via `--wid`. A transparent WebView overlays the video with B站-style controls. Frontend is vanilla TypeScript bundled with Vite.

**Tech Stack:** Tauri v2, Rust, mpv (sidecar), Vite, TypeScript, SQLite (rusqlite), CSS custom properties for theming.

---

## File Structure

```
bilite/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/                        # App icons
│   ├── resources/                    # mpv binaries (per-platform)
│   └── src/
│       ├── main.rs                   # Tauri entry, app setup, event wiring
│       ├── commands.rs               # All #[tauri::command] functions
│       ├── mpv/
│       │   ├── mod.rs                # Re-exports
│       │   ├── process.rs            # Spawn/kill mpv, pass --wid and args
│       │   └── ipc.rs                # JSON IPC: send commands, observe properties
│       ├── storage/
│       │   ├── mod.rs                # Re-exports
│       │   ├── database.rs           # SQLite: playback_history CRUD
│       │   └── config.rs             # JSON config: read/write/defaults
│       ├── playlist.rs               # Scan directory, natural sort, next/prev
│       └── platform/
│           ├── mod.rs                # Platform detection, dispatch
│           ├── windows.rs            # HWND retrieval, file association registry
│           ├── macos.rs              # NSView handle, Info.plist association
│           └── linux.rs              # X11/Wayland handle, .desktop file
├── src/                              # Frontend (Vite + vanilla TS)
│   ├── index.html                    # Main HTML shell
│   ├── main.ts                       # App entry: init, event listeners, routing
│   ├── player-ui.ts                  # Control bar logic: show/hide, button states
│   ├── progress-bar.ts              # Progress bar: drag, click, hover preview
│   ├── volume.ts                     # Volume slider + mute toggle
│   ├── speed-panel.ts               # Playback speed selection panel
│   ├── subtitle-panel.ts            # Subtitle track selection panel
│   ├── playlist-panel.ts            # Playlist sidebar panel
│   ├── shortcuts.ts                  # Keyboard shortcut handler
│   ├── wizard.ts                     # First-run wizard logic
│   ├── bridge.ts                     # Tauri invoke/listen wrappers (typed)
│   ├── state.ts                      # Reactive player state store
│   ├── styles/
│   │   ├── reset.css                 # CSS reset
│   │   ├── variables.css             # CSS custom properties (colors, spacing)
│   │   ├── theme-dark.css            # Dark theme overrides
│   │   ├── theme-light.css           # Light theme overrides
│   │   ├── player.css                # Player controls layout
│   │   ├── progress.css              # Progress bar styles
│   │   ├── panels.css                # Speed/subtitle/playlist panels
│   │   └── wizard.css                # First-run wizard styles
│   └── icons/                        # SVG icons (play, pause, volume, etc.)
├── package.json
├── vite.config.ts
├── tsconfig.json
└── docs/
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `bilite/package.json`
- Create: `bilite/vite.config.ts`
- Create: `bilite/tsconfig.json`
- Create: `bilite/src/index.html`
- Create: `bilite/src/main.ts`
- Create: `bilite/src-tauri/Cargo.toml`
- Create: `bilite/src-tauri/tauri.conf.json`
- Create: `bilite/src-tauri/build.rs`
- Create: `bilite/src-tauri/src/main.rs`

- [ ] **Step 1: Initialize Tauri v2 project**

Run:
```bash
npm create tauri-app@latest bilite -- --template vanilla-ts --manager npm
cd bilite
```
Expected: Project scaffolded with `src/`, `src-tauri/`, `package.json`, `vite.config.ts`.

- [ ] **Step 2: Configure Tauri for transparent window**

Edit `bilite/src-tauri/tauri.conf.json`:
```json
{
  "productName": "BiLite",
  "version": "0.1.0",
  "identifier": "com.bilite.player",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "title": "BiLite",
    "windows": [
      {
        "title": "BiLite",
        "width": 1280,
        "height": 720,
        "minWidth": 640,
        "minHeight": 360,
        "decorations": true,
        "transparent": true
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"],
    "externalBin": ["resources/mpv"]
  }
}
```

- [ ] **Step 3: Add Rust dependencies**

Edit `bilite/src-tauri/Cargo.toml` dependencies section:
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-build = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.31", features = ["bundled"] }
dirs = "5"
natord = "1.0"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

- [ ] **Step 4: Create minimal Rust entry point**

Write `bilite/src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running BiLite");
}
```

Write `bilite/src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 5: Set up frontend with transparent background**

Write `bilite/src/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BiLite</title>
  <link rel="stylesheet" href="/styles/reset.css" />
  <link rel="stylesheet" href="/styles/variables.css" />
  <link rel="stylesheet" href="/styles/theme-dark.css" />
  <link rel="stylesheet" href="/styles/player.css" />
</head>
<body>
  <div id="app">
    <div id="player-container">
      <div id="top-bar" class="auto-hide">
        <span id="video-title"></span>
      </div>
      <div id="subtitle-layer"></div>
      <div id="control-bar" class="auto-hide">
        <div id="progress-area"></div>
        <div id="controls"></div>
      </div>
    </div>
  </div>
  <script type="module" src="/main.ts"></script>
</body>
</html>
```

Write `bilite/src/main.ts`:
```typescript
console.log("BiLite starting...");
```

- [ ] **Step 6: Verify project builds**

Run:
```bash
cd bilite
npm install
cd src-tauri && cargo build
```
Expected: Rust compiles without errors.

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: initialize BiLite Tauri v2 project scaffold"
```

---

## Task 2: mpv IPC Communication Layer

**Files:**
- Create: `bilite/src-tauri/src/mpv/mod.rs`
- Create: `bilite/src-tauri/src/mpv/ipc.rs`

- [ ] **Step 1: Create mpv module structure**

Create `bilite/src-tauri/src/mpv/mod.rs`:
```rust
pub mod ipc;
pub mod process;
```

- [ ] **Step 2: Write IPC connection and command sending**

Create `bilite/src-tauri/src/mpv/ipc.rs`:
```rust
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

pub struct MpvIpc {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    request_id: AtomicU64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MpvEvent {
    pub event: Option<String>,
    pub name: Option<String>,
    pub data: Option<Value>,
    pub request_id: Option<u64>,
    pub error: Option<String>,
}

impl MpvIpc {
    #[cfg(windows)]
    pub fn connect(pipe_name: &str) -> Result<(Self, mpsc::UnboundedReceiver<MpvEvent>), String> {
        use std::fs::OpenOptions;
        let pipe_path = format!(r"\\.\pipe\{}", pipe_name);
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&pipe_path)
            .map_err(|e| format!("Failed to connect to mpv pipe: {}", e))?;

        let reader = file.try_clone().map_err(|e| e.to_string())?;
        let writer: Box<dyn Write + Send> = Box::new(file);

        let (tx, rx) = mpsc::unbounded_channel();
        std::thread::spawn(move || {
            let buf_reader = BufReader::new(reader);
            for line in buf_reader.lines() {
                if let Ok(line) = line {
                    if let Ok(event) = serde_json::from_str::<MpvEvent>(&line) {
                        if tx.send(event).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        Ok((
            Self {
                writer: Arc::new(Mutex::new(writer)),
                request_id: AtomicU64::new(1),
            },
            rx,
        ))
    }

    #[cfg(unix)]
    pub fn connect(socket_path: &str) -> Result<(Self, mpsc::UnboundedReceiver<MpvEvent>), String> {
        use std::os::unix::net::UnixStream;
        let stream = UnixStream::connect(socket_path)
            .map_err(|e| format!("Failed to connect to mpv socket: {}", e))?;

        let reader = stream.try_clone().map_err(|e| e.to_string())?;
        let writer: Box<dyn Write + Send> = Box::new(stream);

        let (tx, rx) = mpsc::unbounded_channel();
        std::thread::spawn(move || {
            let buf_reader = BufReader::new(reader);
            for line in buf_reader.lines() {
                if let Ok(line) = line {
                    if let Ok(event) = serde_json::from_str::<MpvEvent>(&line) {
                        if tx.send(event).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        Ok((
            Self {
                writer: Arc::new(Mutex::new(writer)),
                request_id: AtomicU64::new(1),
            },
            rx,
        ))
    }

    pub fn send_command(&self, command: &[Value]) -> Result<u64, String> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);
        let msg = json!({ "command": command, "request_id": id });
        let mut writer = self.writer.lock().map_err(|e| e.to_string())?;
        writeln!(writer, "{}", msg).map_err(|e| format!("Failed to send command: {}", e))?;
        Ok(id)
    }

    pub fn set_property(&self, name: &str, value: Value) -> Result<u64, String> {
        self.send_command(&[json!("set_property"), json!(name), value])
    }

    pub fn get_property(&self, name: &str) -> Result<u64, String> {
        self.send_command(&[json!("get_property"), json!(name)])
    }

    pub fn observe_property(&self, id: u64, name: &str) -> Result<u64, String> {
        self.send_command(&[json!("observe_property"), json!(id), json!(name)])
    }

    pub fn loadfile(&self, path: &str) -> Result<u64, String> {
        self.send_command(&[json!("loadfile"), json!(path)])
    }

    pub fn seek(&self, seconds: f64, mode: &str) -> Result<u64, String> {
        self.send_command(&[json!("seek"), json!(seconds), json!(mode)])
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd bilite/src-tauri && cargo check
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/mpv/
git commit -m "feat: add mpv JSON IPC communication layer"
```

---

## Task 3: mpv Process Manager & Window Embedding

**Files:**
- Create: `bilite/src-tauri/src/mpv/process.rs`
- Create: `bilite/src-tauri/src/platform/mod.rs`
- Create: `bilite/src-tauri/src/platform/windows.rs`
- Create: `bilite/src-tauri/src/platform/macos.rs`
- Create: `bilite/src-tauri/src/platform/linux.rs`

- [ ] **Step 1: Create platform module for window handle retrieval**

Create `bilite/src-tauri/src/platform/mod.rs`:
```rust
#[cfg(target_os = "windows")]
pub mod windows;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "linux")]
pub mod linux;

use tauri::WebviewWindow;

pub fn get_window_handle(window: &WebviewWindow) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    return windows::get_hwnd(window);
    #[cfg(target_os = "macos")]
    return macos::get_ns_view(window);
    #[cfg(target_os = "linux")]
    return linux::get_xid(window);
}

pub fn get_ipc_path() -> String {
    #[cfg(target_os = "windows")]
    return format!("bilite-mpv-{}", std::process::id());
    #[cfg(unix)]
    return format!("/tmp/bilite-mpv-{}.sock", std::process::id());
}
```

Create `bilite/src-tauri/src/platform/windows.rs`:
```rust
use tauri::WebviewWindow;

pub fn get_hwnd(window: &WebviewWindow) -> Result<String, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window.window_handle()
        .map_err(|e| format!("Failed to get window handle: {}", e))?;
    match handle.as_raw() {
        RawWindowHandle::Win32(h) => Ok(format!("{}", h.hwnd.get() as isize)),
        _ => Err("Not a Win32 window".to_string()),
    }
}
```

Create `bilite/src-tauri/src/platform/macos.rs`:
```rust
use tauri::WebviewWindow;

pub fn get_ns_view(window: &WebviewWindow) -> Result<String, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window.window_handle()
        .map_err(|e| format!("Failed to get window handle: {}", e))?;
    match handle.as_raw() {
        RawWindowHandle::AppKit(h) => Ok(format!("{}", h.ns_view.as_ptr() as isize)),
        _ => Err("Not an AppKit window".to_string()),
    }
}
```

Create `bilite/src-tauri/src/platform/linux.rs`:
```rust
use tauri::WebviewWindow;

pub fn get_xid(window: &WebviewWindow) -> Result<String, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window.window_handle()
        .map_err(|e| format!("Failed to get window handle: {}", e))?;
    match handle.as_raw() {
        RawWindowHandle::Xlib(h) => Ok(format!("{}", h.window)),
        RawWindowHandle::Xcb(h) => Ok(format!("{}", h.window.get())),
        _ => Err("Unsupported Linux window system".to_string()),
    }
}
```

- [ ] **Step 2: Write mpv process manager**

Create `bilite/src-tauri/src/mpv/process.rs`:
```rust
use std::process::{Child, Command};
use crate::platform;

pub struct MpvProcess {
    child: Option<Child>,
    ipc_path: String,
}

impl MpvProcess {
    pub fn new() -> Self {
        Self {
            child: None,
            ipc_path: platform::get_ipc_path(),
        }
    }

    pub fn ipc_path(&self) -> &str {
        &self.ipc_path
    }

    pub fn spawn(&mut self, wid: &str, mpv_bin: &str) -> Result<(), String> {
        let ipc_arg = {
            #[cfg(target_os = "windows")]
            { format!("--input-ipc-server=\\\\.\\pipe\\{}", self.ipc_path) }
            #[cfg(unix)]
            { format!("--input-ipc-server={}", self.ipc_path) }
        };

        let child = Command::new(mpv_bin)
            .args([
                &format!("--wid={}", wid),
                &ipc_arg,
                "--no-terminal",
                "--no-osc",
                "--no-osd-bar",
                "--keep-open=yes",
                "--idle=yes",
                "--sub-auto=fuzzy",
            ])
            .spawn()
            .map_err(|e| format!("Failed to spawn mpv: {}", e))?;

        self.child = Some(child);
        Ok(())
    }

    pub fn kill(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
    }

    pub fn is_running(&self) -> bool {
        self.child.is_some()
    }
}

impl Drop for MpvProcess {
    fn drop(&mut self) {
        self.kill();
    }
}
```

- [ ] **Step 3: Add raw-window-handle dependency**

Add to `Cargo.toml`:
```toml
raw-window-handle = "0.6"
```

- [ ] **Step 4: Verify compilation**

Run:
```bash
cd bilite/src-tauri && cargo check
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/mpv/process.rs src-tauri/src/platform/ src-tauri/Cargo.toml
git commit -m "feat: add mpv process manager with cross-platform window embedding"
```

---

## Task 4: Tauri Commands (Frontend ↔ Backend Bridge)

**Files:**
- Create: `bilite/src-tauri/src/commands.rs`
- Modify: `bilite/src-tauri/src/main.rs`

- [ ] **Step 1: Write Tauri commands**

Create `bilite/src-tauri/src/commands.rs`:
```rust
use crate::mpv::ipc::MpvIpc;
use crate::mpv::process::MpvProcess;
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub mpv_process: Mutex<MpvProcess>,
    pub mpv_ipc: Mutex<Option<MpvIpc>>,
}

#[tauri::command]
pub fn play_file(path: String, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.loadfile(&path)?;
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
    window.set_fullscreen(!is_fullscreen).map_err(|e| e.to_string())?;
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
```

- [ ] **Step 2: Wire up main.rs with commands and mpv lifecycle**

Rewrite `bilite/src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod mpv;
mod platform;

use commands::AppState;
use mpv::process::MpvProcess;
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            mpv_process: Mutex::new(MpvProcess::new()),
            mpv_ipc: Mutex::new(None),
        })
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let wid = platform::get_window_handle(&window)?;

            let mpv_bin = app.path()
                .resource_dir()
                .map_err(|e| e.to_string())?
                .join(if cfg!(windows) { "mpv.exe" } else { "mpv" });

            let state = app.state::<AppState>();
            let mut process = state.mpv_process.lock().map_err(|e| e.to_string())?;
            process.spawn(&wid, mpv_bin.to_str().unwrap())?;

            // Wait briefly for mpv to create IPC socket, then connect
            let ipc_path = process.ipc_path().to_string();
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                match mpv::ipc::MpvIpc::connect(&ipc_path) {
                    Ok((ipc, mut rx)) => {
                        // Observe key properties
                        let _ = ipc.observe_property(1, "time-pos");
                        let _ = ipc.observe_property(2, "duration");
                        let _ = ipc.observe_property(3, "pause");
                        let _ = ipc.observe_property(4, "volume");
                        let _ = ipc.observe_property(5, "speed");
                        let _ = ipc.observe_property(6, "eof-reached");

                        let state = app_handle.state::<AppState>();
                        *state.mpv_ipc.lock().unwrap() = Some(ipc);

                        // Forward mpv events to frontend
                        tokio::runtime::Runtime::new().unwrap().block_on(async {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running BiLite");
}
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd bilite/src-tauri && cargo check
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat: add Tauri commands bridging frontend to mpv"
```

---

## Task 5: Frontend Base UI — Styles & Control Bar Layout

**Files:**
- Create: `bilite/src/styles/reset.css`
- Create: `bilite/src/styles/variables.css`
- Create: `bilite/src/styles/theme-dark.css`
- Create: `bilite/src/styles/theme-light.css`
- Create: `bilite/src/styles/player.css`
- Create: `bilite/src/styles/progress.css`
- Create: `bilite/src/styles/panels.css`
- Modify: `bilite/src/index.html`

- [ ] **Step 1: Create CSS reset**

Create `bilite/src/styles/reset.css`:
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
body { background: transparent; }
button { border: none; background: none; cursor: pointer; color: inherit; font: inherit; }
```

- [ ] **Step 2: Create CSS variables and themes**

Create `bilite/src/styles/variables.css`:
```css
:root {
  --accent: #00a1d6;
  --accent-hover: #00b5e5;
  --control-height: 48px;
  --progress-height: 3px;
  --progress-height-hover: 6px;
  --transition-fast: 0.2s ease;
  --transition-normal: 0.3s ease;
  --font-size-sm: 12px;
  --font-size-base: 14px;
  --radius-sm: 4px;
  --radius-md: 8px;
}
```

Create `bilite/src/styles/theme-dark.css`:
```css
[data-theme="dark"] {
  --bg-control: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  --bg-top: linear-gradient(rgba(0, 0, 0, 0.6), transparent);
  --bg-panel: rgba(21, 21, 21, 0.95);
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-muted: rgba(255, 255, 255, 0.5);
  --border-color: rgba(255, 255, 255, 0.1);
  --progress-bg: rgba(255, 255, 255, 0.2);
  --progress-buffer: rgba(255, 255, 255, 0.3);
  --subtitle-bg: rgba(0, 0, 0, 0.7);
}
```

Create `bilite/src/styles/theme-light.css`:
```css
[data-theme="light"] {
  --bg-control: linear-gradient(transparent, rgba(255, 255, 255, 0.92));
  --bg-top: linear-gradient(rgba(255, 255, 255, 0.7), transparent);
  --bg-panel: rgba(255, 255, 255, 0.95);
  --text-primary: #212121;
  --text-secondary: rgba(0, 0, 0, 0.7);
  --text-muted: rgba(0, 0, 0, 0.5);
  --border-color: rgba(0, 0, 0, 0.1);
  --progress-bg: rgba(0, 0, 0, 0.15);
  --progress-buffer: rgba(0, 0, 0, 0.25);
  --subtitle-bg: rgba(255, 255, 255, 0.8);
}
```

- [ ] **Step 3: Create player layout CSS**

Create `bilite/src/styles/player.css`:
```css
#app {
  width: 100vw;
  height: 100vh;
  position: relative;
  user-select: none;
}

#player-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

#top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 14px 20px;
  background: var(--bg-top);
  z-index: 10;
  transition: opacity var(--transition-normal);
}

#top-bar .video-title {
  color: var(--text-primary);
  font-size: var(--font-size-base);
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

#subtitle-layer {
  position: absolute;
  bottom: 70px;
  left: 0;
  right: 0;
  text-align: center;
  z-index: 5;
  pointer-events: none;
}

#subtitle-layer .subtitle-text {
  display: inline-block;
  background: var(--subtitle-bg);
  color: var(--text-primary);
  padding: 4px 14px;
  border-radius: var(--radius-sm);
  font-size: 18px;
  line-height: 1.5;
}

#control-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-control);
  padding: 14px 16px 10px;
  z-index: 20;
  transition: opacity var(--transition-normal);
}

.auto-hide { opacity: 1; }
.auto-hide.hidden { opacity: 0; pointer-events: none; }

#controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

#controls .left { display: flex; align-items: center; gap: 16px; }
#controls .right { display: flex; align-items: center; gap: 14px; }

.ctrl-btn {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast);
}
.ctrl-btn:hover { color: var(--text-primary); }

.ctrl-btn.play-btn { font-size: 20px; color: var(--text-primary); }

.time-display {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-family: monospace;
}

.speed-btn {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
}
```

- [ ] **Step 4: Create progress bar CSS**

Create `bilite/src/styles/progress.css`:
```css
#progress-area {
  position: relative;
  height: 14px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.progress-bar {
  width: 100%;
  height: var(--progress-height);
  background: var(--progress-bg);
  border-radius: 2px;
  position: relative;
  transition: height var(--transition-fast);
}

#progress-area:hover .progress-bar {
  height: var(--progress-height-hover);
}

.progress-buffer {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: var(--progress-buffer);
  border-radius: 2px;
}

.progress-played {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  background: var(--accent);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 4px rgba(0, 161, 214, 0.5);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

#progress-area:hover .progress-thumb { opacity: 1; }

.progress-tooltip {
  position: absolute;
  bottom: 20px;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  pointer-events: none;
  display: none;
}

#progress-area:hover .progress-tooltip { display: block; }
```

- [ ] **Step 5: Update index.html with full control bar markup**

Update `bilite/src/index.html` body content:
```html
<body data-theme="dark">
  <div id="app">
    <div id="player-container">
      <div id="top-bar" class="auto-hide">
        <span class="video-title" id="video-title"></span>
      </div>
      <div id="subtitle-layer"></div>
      <div id="control-bar" class="auto-hide">
        <div id="progress-area">
          <div class="progress-bar">
            <div class="progress-buffer"></div>
            <div class="progress-played"></div>
            <div class="progress-thumb"></div>
          </div>
          <div class="progress-tooltip"></div>
        </div>
        <div id="controls">
          <div class="left">
            <button class="ctrl-btn play-btn" id="btn-play">▶</button>
            <span class="time-display"><span id="time-current">00:00</span> / <span id="time-duration">00:00</span></span>
          </div>
          <div class="right">
            <button class="ctrl-btn speed-btn" id="btn-speed">1.0x</button>
            <button class="ctrl-btn" id="btn-subtitle">字幕</button>
            <div class="volume-wrap" id="volume-wrap">
              <button class="ctrl-btn" id="btn-volume">🔊</button>
              <div class="volume-slider" id="volume-slider"></div>
            </div>
            <button class="ctrl-btn" id="btn-fullscreen">⛶</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script type="module" src="/main.ts"></script>
</body>
```

- [ ] **Step 6: Verify frontend builds**

Run:
```bash
cd bilite && npm run build
```
Expected: Vite builds without errors.

- [ ] **Step 7: Commit**

```bash
git add src/styles/ src/index.html
git commit -m "feat: add B站-style player UI layout and theming"
```

---

## Task 6: Player Controls Logic (Frontend)

**Files:**
- Create: `bilite/src/bridge.ts`
- Create: `bilite/src/state.ts`
- Create: `bilite/src/player-ui.ts`
- Create: `bilite/src/progress-bar.ts`
- Create: `bilite/src/volume.ts`
- Create: `bilite/src/speed-panel.ts`
- Modify: `bilite/src/main.ts`

- [ ] **Step 1: Create Tauri bridge (typed invoke/listen wrappers)**

Create `bilite/src/bridge.ts`:
```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export async function playFile(path: string): Promise<void> {
  return invoke("play_file", { path });
}

export async function togglePause(): Promise<void> {
  return invoke("toggle_pause");
}

export async function seek(seconds: number, mode: string = "relative"): Promise<void> {
  return invoke("seek", { seconds, mode });
}

export async function setVolume(volume: number): Promise<void> {
  return invoke("set_volume", { volume });
}

export async function setSpeed(speed: number): Promise<void> {
  return invoke("set_speed", { speed });
}

export async function toggleFullscreen(): Promise<void> {
  return invoke("toggle_fullscreen");
}

export async function setSubtitleTrack(trackId: number): Promise<void> {
  return invoke("set_subtitle_track", { trackId });
}

export interface MpvEvent {
  event?: string;
  name?: string;
  data?: unknown;
}

export function onMpvEvent(callback: (event: MpvEvent) => void): Promise<UnlistenFn> {
  return listen<MpvEvent>("mpv-event", (e) => callback(e.payload));
}
```

- [ ] **Step 2: Create reactive player state**

Create `bilite/src/state.ts`:
```typescript
export interface PlayerState {
  paused: boolean;
  timePos: number;
  duration: number;
  volume: number;
  speed: number;
  eofReached: boolean;
  title: string;
}

type Listener = (state: PlayerState) => void;

const listeners: Listener[] = [];

export const state: PlayerState = {
  paused: true,
  timePos: 0,
  duration: 0,
  volume: 80,
  speed: 1.0,
  eofReached: false,
  title: "",
};

export function updateState(partial: Partial<PlayerState>): void {
  Object.assign(state, partial);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
```

- [ ] **Step 3: Create player UI controller (auto-hide, play button, time)**

Create `bilite/src/player-ui.ts`:
```typescript
import { state, subscribe } from "./state";
import { togglePause } from "./bridge";

let hideTimer: number | null = null;

export function initPlayerUI(): void {
  const topBar = document.getElementById("top-bar")!;
  const controlBar = document.getElementById("control-bar")!;
  const playBtn = document.getElementById("btn-play")!;
  const timeCurrent = document.getElementById("time-current")!;
  const timeDuration = document.getElementById("time-duration")!;
  const videoTitle = document.getElementById("video-title")!;
  const container = document.getElementById("player-container")!;

  playBtn.addEventListener("click", () => togglePause());

  container.addEventListener("dblclick", () => togglePause());

  container.addEventListener("mousemove", () => {
    showControls(topBar, controlBar);
    resetHideTimer(topBar, controlBar);
  });

  container.addEventListener("mouseleave", () => {
    hideControls(topBar, controlBar);
  });

  subscribe((s) => {
    playBtn.textContent = s.paused ? "▶" : "⏸";
    timeCurrent.textContent = formatTime(s.timePos);
    timeDuration.textContent = formatTime(s.duration);
    videoTitle.textContent = s.title;
  });
}

function showControls(...els: HTMLElement[]): void {
  els.forEach((el) => el.classList.remove("hidden"));
}

function hideControls(...els: HTMLElement[]): void {
  els.forEach((el) => el.classList.add("hidden"));
}

function resetHideTimer(...els: HTMLElement[]): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => hideControls(...els), 3000);
}

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Create progress bar interaction**

Create `bilite/src/progress-bar.ts`:
```typescript
import { state, subscribe } from "./state";
import { seek } from "./bridge";
import { formatTime } from "./player-ui";

export function initProgressBar(): void {
  const area = document.getElementById("progress-area")!;
  const played = area.querySelector(".progress-played") as HTMLElement;
  const thumb = area.querySelector(".progress-thumb") as HTMLElement;
  const tooltip = area.querySelector(".progress-tooltip") as HTMLElement;

  let dragging = false;

  subscribe((s) => {
    if (!dragging && s.duration > 0) {
      const pct = (s.timePos / s.duration) * 100;
      played.style.width = `${pct}%`;
      thumb.style.left = `${pct}%`;
    }
  });

  area.addEventListener("mousemove", (e) => {
    const rect = area.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * state.duration;
    tooltip.textContent = formatTime(time);
    tooltip.style.left = `${pct * 100}%`;

    if (dragging) {
      played.style.width = `${pct * 100}%`;
      thumb.style.left = `${pct * 100}%`;
    }
  });

  area.addEventListener("mousedown", (e) => {
    dragging = true;
    const rect = area.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = pct * state.duration;
    seek(time, "absolute");
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });

  area.addEventListener("click", (e) => {
    const rect = area.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = pct * state.duration;
    seek(time, "absolute");
  });
}
```

- [ ] **Step 5: Create volume control**

Create `bilite/src/volume.ts`:
```typescript
import { state, subscribe } from "./state";
import { setVolume } from "./bridge";

export function initVolume(): void {
  const btn = document.getElementById("btn-volume")!;
  const wrap = document.getElementById("volume-wrap")!;

  let muted = false;
  let prevVolume = state.volume;

  btn.addEventListener("click", () => {
    if (muted) {
      setVolume(prevVolume);
      muted = false;
    } else {
      prevVolume = state.volume;
      setVolume(0);
      muted = true;
    }
  });

  subscribe((s) => {
    if (s.volume === 0) {
      btn.textContent = "🔇";
    } else if (s.volume < 50) {
      btn.textContent = "🔉";
    } else {
      btn.textContent = "🔊";
    }
  });

  // Volume slider on scroll
  wrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 10 : -10;
    const newVol = Math.max(0, Math.min(100, state.volume + delta));
    setVolume(newVol);
    muted = false;
  });
}
```

- [ ] **Step 6: Create speed panel**

Create `bilite/src/speed-panel.ts`:
```typescript
import { state, subscribe } from "./state";
import { setSpeed } from "./bridge";

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

export function initSpeedPanel(): void {
  const btn = document.getElementById("btn-speed")!;
  let panel: HTMLElement | null = null;

  btn.addEventListener("click", () => {
    if (panel) {
      panel.remove();
      panel = null;
      return;
    }

    panel = document.createElement("div");
    panel.className = "speed-panel";
    panel.style.cssText = `
      position: absolute; bottom: 50px; right: 80px;
      background: var(--bg-panel); border-radius: var(--radius-md);
      padding: 8px 0; min-width: 100px; z-index: 100;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    SPEEDS.forEach((speed) => {
      const item = document.createElement("button");
      item.className = "speed-item";
      item.textContent = `${speed}x`;
      item.style.cssText = `
        display: block; width: 100%; padding: 8px 20px;
        text-align: center; color: var(--text-secondary);
        font-size: 13px; cursor: pointer; border: none; background: none;
      `;
      if (speed === state.speed) item.style.color = "var(--accent)";
      item.addEventListener("click", () => {
        setSpeed(speed);
        panel?.remove();
        panel = null;
      });
      panel!.appendChild(item);
    });

    document.getElementById("control-bar")!.appendChild(panel);
  });

  subscribe((s) => {
    btn.textContent = `${s.speed}x`;
  });
}
```

- [ ] **Step 7: Wire everything in main.ts**

Rewrite `bilite/src/main.ts`:
```typescript
import { onMpvEvent, MpvEvent } from "./bridge";
import { updateState } from "./state";
import { initPlayerUI } from "./player-ui";
import { initProgressBar } from "./progress-bar";
import { initVolume } from "./volume";
import { initSpeedPanel } from "./speed-panel";

async function init(): Promise<void> {
  initPlayerUI();
  initProgressBar();
  initVolume();
  initSpeedPanel();

  await onMpvEvent((event: MpvEvent) => {
    if (event.name === "time-pos" && event.data != null) {
      updateState({ timePos: event.data as number });
    } else if (event.name === "duration" && event.data != null) {
      updateState({ duration: event.data as number });
    } else if (event.name === "pause") {
      updateState({ paused: event.data as boolean });
    } else if (event.name === "volume" && event.data != null) {
      updateState({ volume: event.data as number });
    } else if (event.name === "speed" && event.data != null) {
      updateState({ speed: event.data as number });
    } else if (event.name === "eof-reached") {
      updateState({ eofReached: event.data as boolean });
    }
  });
}

init();
```

- [ ] **Step 8: Install Tauri JS dependencies**

Run:
```bash
cd bilite && npm install @tauri-apps/api
```

- [ ] **Step 9: Verify build**

Run:
```bash
cd bilite && npm run build
```
Expected: No TypeScript or build errors.

- [ ] **Step 10: Commit**

```bash
git add src/
git commit -m "feat: add player controls logic - play, seek, volume, speed"
```

---

## Task 7: Data Persistence — SQLite & Config

**Files:**
- Create: `bilite/src-tauri/src/storage/mod.rs`
- Create: `bilite/src-tauri/src/storage/database.rs`
- Create: `bilite/src-tauri/src/storage/config.rs`
- Modify: `bilite/src-tauri/src/commands.rs`
- Modify: `bilite/src-tauri/src/main.rs`

- [ ] **Step 1: Create storage module**

Create `bilite/src-tauri/src/storage/mod.rs`:
```rust
pub mod config;
pub mod database;
```

- [ ] **Step 2: Write SQLite database layer**

Create `bilite/src-tauri/src/storage/database.rs`:
```rust
use rusqlite::{Connection, params};
use std::path::PathBuf;

pub struct Database {
    conn: Connection,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PlaybackRecord {
    pub file_path: String,
    pub position: f64,
    pub duration: f64,
    pub last_played: i64,
}

impl Database {
    pub fn open(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let db_path = data_dir.join("data.db");
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS playback_history (
                file_path TEXT PRIMARY KEY,
                position REAL NOT NULL,
                duration REAL NOT NULL,
                last_played INTEGER NOT NULL
            )",
            [],
        ).map_err(|e| e.to_string())?;

        Ok(Self { conn })
    }

    pub fn save_position(&self, file_path: &str, position: f64, duration: f64) -> Result<(), String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.conn.execute(
            "INSERT OR REPLACE INTO playback_history (file_path, position, duration, last_played)
             VALUES (?1, ?2, ?3, ?4)",
            params![file_path, position, duration, now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_position(&self, file_path: &str) -> Result<Option<PlaybackRecord>, String> {
        let mut stmt = self.conn
            .prepare("SELECT file_path, position, duration, last_played FROM playback_history WHERE file_path = ?1")
            .map_err(|e| e.to_string())?;

        let result = stmt.query_row(params![file_path], |row| {
            Ok(PlaybackRecord {
                file_path: row.get(0)?,
                position: row.get(1)?,
                duration: row.get(2)?,
                last_played: row.get(3)?,
            })
        });

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
}
```

- [ ] **Step 3: Write JSON config layer**

Create `bilite/src-tauri/src/storage/config.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub volume: f64,
    pub playback_speed: f64,
    pub subtitle_font_size: u32,
    pub file_associations: Vec<String>,
    pub window: WindowConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            volume: 80.0,
            playback_speed: 1.0,
            subtitle_font_size: 24,
            file_associations: vec![
                ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts",
            ].into_iter().map(String::from).collect(),
            window: WindowConfig { width: 1280, height: 720, x: None, y: None },
        }
    }
}

impl AppConfig {
    pub fn load(data_dir: &PathBuf) -> Self {
        let config_path = data_dir.join("config.json");
        if config_path.exists() {
            let content = std::fs::read_to_string(&config_path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self, data_dir: &PathBuf) -> Result<(), String> {
        std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let config_path = data_dir.join("config.json");
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn is_first_run(data_dir: &PathBuf) -> bool {
        !data_dir.join("config.json").exists()
    }
}
```

- [ ] **Step 4: Add storage commands to commands.rs**

Append to `bilite/src-tauri/src/commands.rs`:
```rust
use crate::storage::database::PlaybackRecord;
use crate::storage::config::AppConfig;

// Add to AppState:
// pub database: Mutex<Database>,
// pub config: Mutex<AppConfig>,
// pub data_dir: PathBuf,

#[tauri::command]
pub fn save_playback_position(path: String, position: f64, duration: f64, state: State<AppState>) -> Result<(), String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    db.save_position(&path, position, duration)
}

#[tauri::command]
pub fn get_playback_position(path: String, state: State<AppState>) -> Result<Option<PlaybackRecord>, String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    db.get_position(&path)
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
```

- [ ] **Step 5: Verify compilation**

Run:
```bash
cd bilite/src-tauri && cargo check
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/storage/ src-tauri/src/commands.rs
git commit -m "feat: add SQLite playback history and JSON config persistence"
```

---

## Task 8: Playlist — Directory Scanning & UI

**Files:**
- Create: `bilite/src-tauri/src/playlist.rs`
- Create: `bilite/src/playlist-panel.ts`
- Modify: `bilite/src-tauri/src/commands.rs`

- [ ] **Step 1: Write playlist scanning logic (Rust)**

Create `bilite/src-tauri/src/playlist.rs`:
```rust
use std::path::{Path, PathBuf};

const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts", "mpg", "mpeg", "3gp",
];

pub fn scan_directory(file_path: &str) -> Vec<String> {
    let path = Path::new(file_path);
    let dir = match path.parent() {
        Some(d) => d,
        None => return vec![file_path.to_string()],
    };

    let mut videos: Vec<PathBuf> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|p| {
            p.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .collect();

    videos.sort_by(|a, b| natord::compare(
        a.file_name().unwrap_or_default().to_str().unwrap_or(""),
        b.file_name().unwrap_or_default().to_str().unwrap_or(""),
    ));

    videos.into_iter()
        .filter_map(|p| p.to_str().map(String::from))
        .collect()
}

pub fn find_index(playlist: &[String], current: &str) -> Option<usize> {
    playlist.iter().position(|p| p == current)
}

pub fn next_file(playlist: &[String], current: &str) -> Option<&String> {
    find_index(playlist, current)
        .and_then(|idx| playlist.get(idx + 1))
}

pub fn prev_file(playlist: &[String], current: &str) -> Option<&String> {
    find_index(playlist, current)
        .and_then(|idx| idx.checked_sub(1))
        .and_then(|idx| playlist.get(idx))
}
```

- [ ] **Step 2: Add playlist commands**

Append to `bilite/src-tauri/src/commands.rs`:
```rust
use crate::playlist;

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
```

- [ ] **Step 3: Create playlist panel UI**

Create `bilite/src/playlist-panel.ts`:
```typescript
import { invoke } from "@tauri-apps/api/core";
import { playFile } from "./bridge";
import { state } from "./state";

let panelEl: HTMLElement | null = null;
let currentFile = "";

export function initPlaylistPanel(): void {
  // Playlist button would be added to controls if desired
  // For now, triggered by a keyboard shortcut or future button
}

export function setCurrentFile(path: string): void {
  currentFile = path;
}

export async function togglePlaylistPanel(): Promise<void> {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
    return;
  }

  const playlist: string[] = await invoke("get_playlist", { currentFile });

  panelEl = document.createElement("div");
  panelEl.className = "playlist-panel";
  panelEl.style.cssText = `
    position: absolute; top: 0; right: 0; bottom: 0; width: 300px;
    background: var(--bg-panel); z-index: 50; overflow-y: auto;
    padding: 16px; border-left: 1px solid var(--border-color);
    animation: slideIn 0.2s ease;
  `;

  const title = document.createElement("h3");
  title.textContent = "播放列表";
  title.style.cssText = "color: var(--text-primary); margin-bottom: 12px; font-size: 14px;";
  panelEl.appendChild(title);

  playlist.forEach((filePath) => {
    const item = document.createElement("div");
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    item.textContent = fileName;
    item.style.cssText = `
      padding: 8px 12px; border-radius: var(--radius-sm); cursor: pointer;
      font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    `;
    if (filePath === currentFile) {
      item.style.color = "var(--accent)";
      item.style.background = "rgba(0, 161, 214, 0.1)";
    }
    item.addEventListener("click", () => {
      playFile(filePath);
      setCurrentFile(filePath);
      togglePlaylistPanel();
    });
    panelEl!.appendChild(item);
  });

  document.getElementById("player-container")!.appendChild(panelEl);
}

export async function playNext(): Promise<void> {
  const next: string | null = await invoke("get_next_file", { currentFile });
  if (next) {
    await playFile(next);
    setCurrentFile(next);
  }
}

export async function playPrev(): Promise<void> {
  const prev: string | null = await invoke("get_prev_file", { currentFile });
  if (prev) {
    await playFile(prev);
    setCurrentFile(prev);
  }
}
```

- [ ] **Step 4: Verify build**

Run:
```bash
cd bilite && npm run build && cd src-tauri && cargo check
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/playlist.rs src-tauri/src/commands.rs src/playlist-panel.ts
git commit -m "feat: add playlist - directory scanning and panel UI"
```

---

## Task 9: Keyboard Shortcuts & Subtitle Panel

**Files:**
- Create: `bilite/src/shortcuts.ts`
- Create: `bilite/src/subtitle-panel.ts`
- Modify: `bilite/src/main.ts`

- [ ] **Step 1: Write keyboard shortcut handler**

Create `bilite/src/shortcuts.ts`:
```typescript
import { togglePause, seek, setVolume, setSpeed, toggleFullscreen } from "./bridge";
import { state } from "./state";
import { playNext, playPrev } from "./playlist-panel";

let rightHeld = false;
let leftHeld = false;
let leftInterval: number | null = null;
let speedBeforeHold = 1.0;

export function initShortcuts(): void {
  document.addEventListener("keydown", (e) => {
    if (e.repeat && e.key !== "ArrowLeft") return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        togglePause();
        break;

      case "ArrowRight":
        e.preventDefault();
        if (!rightHeld) {
          rightHeld = true;
          speedBeforeHold = state.speed;
          // Start a timer: if held > 200ms, switch to 3x
          setTimeout(() => {
            if (rightHeld) setSpeed(3.0);
          }, 200);
        }
        break;

      case "ArrowLeft":
        e.preventDefault();
        if (!leftHeld) {
          leftHeld = true;
          // Start a timer: if held > 200ms, start rapid seeking
          setTimeout(() => {
            if (leftHeld) {
              leftInterval = window.setInterval(() => {
                seek(-1, "relative");
              }, 100);
            }
          }, 200);
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        setVolume(Math.min(100, state.volume + 10));
        break;

      case "ArrowDown":
        e.preventDefault();
        setVolume(Math.max(0, state.volume - 10));
        break;

      case "f":
      case "F":
        e.preventDefault();
        toggleFullscreen();
        break;

      case "m":
      case "M":
        e.preventDefault();
        if (state.volume > 0) {
          setVolume(0);
        } else {
          setVolume(80);
        }
        break;

      case "!": // Shift+1
        if (e.shiftKey) {
          e.preventDefault();
          setSpeed(1.0);
        }
        break;

      case "@": // Shift+2
        if (e.shiftKey) {
          e.preventDefault();
          setSpeed(2.0);
        }
        break;
    }
  });

  document.addEventListener("keyup", (e) => {
    switch (e.key) {
      case "ArrowRight":
        if (rightHeld) {
          rightHeld = false;
          if (state.speed === 3.0) {
            setSpeed(speedBeforeHold);
          } else {
            // Was a tap (< 200ms), do a 5s seek
            seek(5, "relative");
          }
        }
        break;

      case "ArrowLeft":
        if (leftHeld) {
          leftHeld = false;
          if (leftInterval) {
            clearInterval(leftInterval);
            leftInterval = null;
          } else {
            // Was a tap (< 200ms), do a 5s back seek
            seek(-5, "relative");
          }
        }
        break;
    }
  });
}
```

- [ ] **Step 2: Write subtitle panel**

Create `bilite/src/subtitle-panel.ts`:
```typescript
import { invoke } from "@tauri-apps/api/core";
import { setSubtitleTrack } from "./bridge";

let panelEl: HTMLElement | null = null;

export function initSubtitlePanel(): void {
  const btn = document.getElementById("btn-subtitle")!;
  btn.addEventListener("click", () => toggleSubtitlePanel());
}

async function toggleSubtitlePanel(): Promise<void> {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
    return;
  }

  panelEl = document.createElement("div");
  panelEl.className = "subtitle-panel";
  panelEl.style.cssText = `
    position: absolute; bottom: 50px; right: 120px;
    background: var(--bg-panel); border-radius: var(--radius-md);
    padding: 8px 0; min-width: 140px; z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  // "关闭字幕" option
  const offItem = document.createElement("button");
  offItem.textContent = "关闭字幕";
  offItem.style.cssText = `
    display: block; width: 100%; padding: 8px 20px;
    text-align: center; color: var(--text-secondary);
    font-size: 13px; cursor: pointer; border: none; background: none;
  `;
  offItem.addEventListener("click", () => {
    setSubtitleTrack(0);
    panelEl?.remove();
    panelEl = null;
  });
  panelEl.appendChild(offItem);

  // Subtitle tracks would be populated from mpv track-list property
  // For now, show track 1 as default
  const track1 = document.createElement("button");
  track1.textContent = "字幕轨道 1";
  track1.style.cssText = offItem.style.cssText;
  track1.addEventListener("click", () => {
    setSubtitleTrack(1);
    panelEl?.remove();
    panelEl = null;
  });
  panelEl.appendChild(track1);

  document.getElementById("control-bar")!.appendChild(panelEl);
}
```

- [ ] **Step 3: Register shortcuts and subtitle panel in main.ts**

Add imports and init calls to `bilite/src/main.ts`:
```typescript
import { initShortcuts } from "./shortcuts";
import { initSubtitlePanel } from "./subtitle-panel";
import { initPlaylistPanel } from "./playlist-panel";

// Add to init():
initShortcuts();
initSubtitlePanel();
initPlaylistPanel();
```

- [ ] **Step 4: Verify build**

Run:
```bash
cd bilite && npm run build
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/shortcuts.ts src/subtitle-panel.ts src/main.ts
git commit -m "feat: add keyboard shortcuts and subtitle panel"
```

---

## Task 10: First-Run Wizard & File Association

**Files:**
- Create: `bilite/src/wizard.ts`
- Create: `bilite/src/styles/wizard.css`
- Modify: `bilite/src-tauri/src/platform/windows.rs` (add file association)
- Modify: `bilite/src-tauri/src/platform/linux.rs` (add .desktop file)
- Modify: `bilite/src-tauri/src/commands.rs`
- Modify: `bilite/src/main.ts`

- [ ] **Step 1: Write wizard UI**

Create `bilite/src/wizard.ts`:
```typescript
import { invoke } from "@tauri-apps/api/core";

const VIDEO_FORMATS = [
  { ext: ".mp4", label: "MP4" },
  { ext: ".mkv", label: "MKV" },
  { ext: ".avi", label: "AVI" },
  { ext: ".mov", label: "MOV" },
  { ext: ".wmv", label: "WMV" },
  { ext: ".flv", label: "FLV" },
  { ext: ".webm", label: "WebM" },
  { ext: ".m4v", label: "M4V" },
  { ext: ".ts", label: "TS" },
];

export async function showWizard(): Promise<void> {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  const wizard = document.createElement("div");
  wizard.className = "wizard";
  wizard.innerHTML = `
    <div class="wizard-container">
      <h1 class="wizard-title">欢迎使用 BiLite</h1>
      <p class="wizard-subtitle">轻量级本地视频播放器</p>

      <div class="wizard-step" id="step-theme">
        <h2>选择主题</h2>
        <div class="wizard-options">
          <button class="wizard-option selected" data-theme="dark">
            <div class="theme-preview dark-preview"></div>
            <span>深色</span>
          </button>
          <button class="wizard-option" data-theme="light">
            <div class="theme-preview light-preview"></div>
            <span>亮色</span>
          </button>
        </div>
      </div>

      <div class="wizard-step" id="step-formats">
        <h2>关联视频格式</h2>
        <p class="wizard-hint">双击这些格式的文件将直接用 BiLite 打开</p>
        <div class="format-grid" id="format-grid"></div>
      </div>

      <button class="wizard-btn" id="wizard-start">开始使用</button>
    </div>
  `;

  app.appendChild(wizard);

  // Populate format checkboxes
  const grid = document.getElementById("format-grid")!;
  VIDEO_FORMATS.forEach(({ ext, label }) => {
    const item = document.createElement("label");
    item.className = "format-item";
    item.innerHTML = `<input type="checkbox" value="${ext}" checked /><span>${label} (${ext})</span>`;
    grid.appendChild(item);
  });

  // Theme selection
  let selectedTheme = "dark";
  wizard.querySelectorAll(".wizard-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      wizard.querySelectorAll(".wizard-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedTheme = (btn as HTMLElement).dataset.theme || "dark";
      document.body.dataset.theme = selectedTheme;
    });
  });

  // Start button
  document.getElementById("wizard-start")!.addEventListener("click", async () => {
    const formats = Array.from(grid.querySelectorAll("input:checked"))
      .map((input) => (input as HTMLInputElement).value);

    await invoke("save_config", {
      config: {
        theme: selectedTheme,
        volume: 80,
        playback_speed: 1.0,
        subtitle_font_size: 24,
        file_associations: formats,
        window: { width: 1280, height: 720, x: null, y: null },
      },
    });

    await invoke("register_file_associations", { extensions: formats });

    // Reload to player mode
    window.location.reload();
  });
}
```

- [ ] **Step 2: Create wizard styles**

Create `bilite/src/styles/wizard.css`:
```css
.wizard {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-panel);
}

.wizard-container {
  max-width: 480px;
  width: 100%;
  padding: 40px;
  text-align: center;
}

.wizard-title {
  font-size: 28px;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.wizard-subtitle {
  color: var(--text-muted);
  font-size: 14px;
  margin-bottom: 40px;
}

.wizard-step {
  margin-bottom: 32px;
  text-align: left;
}

.wizard-step h2 {
  font-size: 16px;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.wizard-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.wizard-options {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.wizard-option {
  padding: 16px 24px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition-fast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  background: none;
}

.wizard-option.selected {
  border-color: var(--accent);
  color: var(--accent);
}

.theme-preview {
  width: 80px;
  height: 50px;
  border-radius: var(--radius-sm);
}

.dark-preview { background: #1a1a1a; }
.light-preview { background: #f5f5f5; border: 1px solid #ddd; }

.format-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.format-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.format-item input { accent-color: var(--accent); }

.wizard-btn {
  margin-top: 24px;
  padding: 12px 40px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.wizard-btn:hover { background: var(--accent-hover); }
```

- [ ] **Step 3: Add file association registration command (Windows)**

Add to `bilite/src-tauri/src/platform/windows.rs`:
```rust
#[cfg(target_os = "windows")]
pub fn register_associations(exe_path: &str, extensions: &[String]) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let classes = hkcu.open_subkey_with_flags("Software\\Classes", KEY_WRITE)
        .map_err(|e| e.to_string())?;

    // Register BiLite application
    let (app_key, _) = classes.create_subkey("BiLite.Player\\shell\\open\\command")
        .map_err(|e| e.to_string())?;
    app_key.set_value("", &format!("\"{}\" \"%1\"", exe_path))
        .map_err(|e| e.to_string())?;

    // Associate each extension
    for ext in extensions {
        let (ext_key, _) = classes.create_subkey(ext)
            .map_err(|e| e.to_string())?;
        ext_key.set_value("", &"BiLite.Player")
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
```

- [ ] **Step 4: Add file association command to commands.rs**

```rust
#[tauri::command]
pub fn register_file_associations(extensions: Vec<String>, app: tauri::AppHandle) -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .to_str()
        .unwrap_or("")
        .to_string();

    #[cfg(target_os = "windows")]
    crate::platform::windows::register_associations(&exe_path, &extensions)?;

    #[cfg(target_os = "linux")]
    crate::platform::linux::register_associations(&exe_path, &extensions)?;

    // macOS uses Info.plist, handled at build time
    Ok(())
}
```

- [ ] **Step 5: Update main.ts to check first-run**

Update `bilite/src/main.ts` init function:
```typescript
import { showWizard } from "./wizard";

async function init(): Promise<void> {
  const firstRun: boolean = await invoke("is_first_run");

  if (firstRun) {
    showWizard();
    return;
  }

  // Normal player initialization
  initPlayerUI();
  initProgressBar();
  initVolume();
  initSpeedPanel();
  initShortcuts();
  initSubtitlePanel();
  initPlaylistPanel();

  await onMpvEvent((event: MpvEvent) => {
    // ... event handling as before
  });

  // Handle file passed as CLI argument
  const args: string[] = await invoke("get_cli_args");
  if (args.length > 0) {
    playFile(args[0]);
    setCurrentFile(args[0]);
    updateState({ title: args[0].split(/[/\\]/).pop() || "" });
  }
}
```

- [ ] **Step 6: Add winreg dependency for Windows**

Add to `Cargo.toml`:
```toml
[target.'cfg(windows)'.dependencies]
winreg = "0.52"
```

- [ ] **Step 7: Verify full build**

Run:
```bash
cd bilite && npm run build && cd src-tauri && cargo check
```
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/ src-tauri/
git commit -m "feat: add first-run wizard with theme selection and file association"
```

---

## Task 11: Integration, Drag-and-Drop & Polish

**Files:**
- Modify: `bilite/src/main.ts`
- Modify: `bilite/src-tauri/src/main.rs`
- Modify: `bilite/src-tauri/src/commands.rs`

- [ ] **Step 1: Add drag-and-drop support**

Add to `bilite/src/main.ts`:
```typescript
import { listen } from "@tauri-apps/api/event";

// In init(), after player setup:
await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
  const files = event.payload.paths;
  if (files.length > 0) {
    const videoFile = files.find((f) =>
      /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts)$/i.test(f)
    );
    if (videoFile) {
      playFile(videoFile);
      setCurrentFile(videoFile);
      updateState({ title: videoFile.split(/[/\\]/).pop() || "" });
    }
  }
});
```

- [ ] **Step 2: Add CLI args command**

Add to `bilite/src-tauri/src/commands.rs`:
```rust
#[tauri::command]
pub fn get_cli_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}
```

- [ ] **Step 3: Add periodic position saving**

Add to `bilite/src/main.ts`:
```typescript
// Save position every 5 seconds while playing
setInterval(async () => {
  if (!state.paused && state.timePos > 0 && state.duration > 0) {
    await invoke("save_playback_position", {
      path: currentFile,
      position: state.timePos,
      duration: state.duration,
    });
  }
}, 5000);
```

- [ ] **Step 4: Add resume playback prompt**

Add to `bilite/src/main.ts` (when loading a file):
```typescript
async function loadFileWithResume(filePath: string): Promise<void> {
  const record = await invoke<{ position: number; duration: number } | null>(
    "get_playback_position", { path: filePath }
  );

  await playFile(filePath);
  setCurrentFile(filePath);
  updateState({ title: filePath.split(/[/\\]/).pop() || "" });

  if (record && record.position > 5 && record.position < record.duration - 10) {
    showResumePrompt(record.position, () => {
      seek(record.position, "absolute");
    });
  }
}

function showResumePrompt(position: number, onResume: () => void): void {
  const prompt = document.createElement("div");
  prompt.style.cssText = `
    position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%);
    background: var(--bg-panel); padding: 10px 20px; border-radius: var(--radius-md);
    color: var(--text-primary); font-size: 13px; z-index: 100;
    display: flex; align-items: center; gap: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  const timeStr = formatTime(position);
  prompt.innerHTML = `
    <span>上次播放到 ${timeStr}</span>
    <button style="background:var(--accent);color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;">继续播放</button>
    <button style="background:none;color:var(--text-muted);border:1px solid var(--border-color);padding:4px 12px;border-radius:4px;cursor:pointer;">从头开始</button>
  `;

  const [resumeBtn, restartBtn] = prompt.querySelectorAll("button");
  resumeBtn.addEventListener("click", () => { onResume(); prompt.remove(); });
  restartBtn.addEventListener("click", () => prompt.remove());

  document.getElementById("player-container")!.appendChild(prompt);
  setTimeout(() => prompt.remove(), 8000);
}
```

- [ ] **Step 5: Register all commands in main.rs**

Update the `invoke_handler` in `bilite/src-tauri/src/main.rs`:
```rust
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
    commands::register_file_associations,
    commands::get_cli_args,
])
```

- [ ] **Step 6: Full build and manual test**

Run:
```bash
cd bilite && npm run build && cd src-tauri && cargo build
```
Expected: Full application compiles. Test by running the binary with a video file argument.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add drag-and-drop, resume playback, and integration wiring"
```

---

## Summary

| Task | Description | Key Deliverable |
|------|-------------|-----------------|
| 1 | Project Scaffolding | Tauri v2 + Vite + TS project compiles |
| 2 | mpv IPC Layer | JSON IPC send/receive over pipe/socket |
| 3 | mpv Process Manager | Spawn mpv with --wid, cross-platform handles |
| 4 | Tauri Commands | Frontend ↔ Backend bridge functions |
| 5 | Frontend Base UI | B站-style CSS, control bar layout, themes |
| 6 | Player Controls Logic | Play, seek, volume, speed interactions |
| 7 | Data Persistence | SQLite history + JSON config |
| 8 | Playlist | Directory scan, panel UI, next/prev |
| 9 | Shortcuts & Subtitles | Key bindings, subtitle panel |
| 10 | First-Run Wizard | Theme + file association setup |
| 11 | Integration & Polish | Drag-drop, resume prompt, full wiring |
