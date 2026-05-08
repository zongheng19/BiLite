import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { onMpvEvent, MpvEvent, playFile, seek } from "./bridge";
import { state, updateState } from "./state";
import { initPlayerUI, formatTime } from "./player-ui";
import { initProgressBar } from "./progress-bar";
import { initVolume } from "./volume";
import { initSpeedPanel } from "./speed-panel";
import { initShortcuts } from "./shortcuts";
import { initSubtitlePanel } from "./subtitle-panel";
import { initPlaylistPanel, getCurrentFile, setCurrentFile } from "./playlist-panel";
import { showWizard } from "./wizard";

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

async function init(): Promise<void> {
  const firstRun: boolean = await invoke("is_first_run");
  if (firstRun) {
    showWizard();
    return;
  }

  initPlayerUI();
  initProgressBar();
  initVolume();
  initSpeedPanel();
  initShortcuts();
  initSubtitlePanel();
  initPlaylistPanel();

  await onMpvEvent((event: MpvEvent) => {
    if (event.name === "time-pos" && event.data != null)
      updateState({ timePos: event.data as number });
    else if (event.name === "duration" && event.data != null)
      updateState({ duration: event.data as number });
    else if (event.name === "pause")
      updateState({ paused: event.data as boolean });
    else if (event.name === "volume" && event.data != null)
      updateState({ volume: event.data as number });
    else if (event.name === "speed" && event.data != null)
      updateState({ speed: event.data as number });
    else if (event.name === "eof-reached")
      updateState({ eofReached: event.data as boolean });
  });

  // Drag-and-drop support
  await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
    const files = event.payload.paths;
    if (files.length > 0) {
      const videoFile = files.find((f) =>
        /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts)$/i.test(f)
      );
      if (videoFile) {
        loadFileWithResume(videoFile);
      }
    }
  });

  // Periodic position saving
  setInterval(async () => {
    if (!state.paused && state.timePos > 0 && state.duration > 0) {
      await invoke("save_playback_position", {
        path: getCurrentFile(),
        position: state.timePos,
        duration: state.duration,
      });
    }
  }, 5000);

  // Handle CLI args on startup
  const args: string[] = await invoke("get_cli_args");
  if (args.length > 0) {
    await loadFileWithResume(args[0]);
  }
}

init();
