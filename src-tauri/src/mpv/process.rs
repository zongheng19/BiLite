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
            {
                format!("--input-ipc-server=\\\\.\\pipe\\{}", self.ipc_path)
            }
            #[cfg(unix)]
            {
                format!("--input-ipc-server={}", self.ipc_path)
            }
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
