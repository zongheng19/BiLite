use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

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
