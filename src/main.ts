import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onMpvEvent, MpvEvent, playFile, seek } from "./bridge";
import { state, updateState } from "./state";
import { initPlayerUI, formatTime } from "./player-ui";
import { initProgressBar } from "./progress-bar";
import { initVolume } from "./volume";
import { initSpeedPanel } from "./speed-panel";
import { initShortcuts } from "./shortcuts";
import { initSubtitlePanel } from "./subtitle-panel";
import { initPlaylistPanel, getCurrentFile, setCurrentFile } from "./playlist-panel";
import { initEmptyState, hideEmptyState } from "./empty-state";
import { initContextMenu } from "./context-menu";
import { feedStatsEvent } from "./stats-overlay";
import { showWizard } from "./wizard";

async function loadFileWithResume(filePath: string): Promise<void> {
  hideEmptyState();
  const record = await invoke<{ position: number; duration: number } | null>(
    "get_playback_position", { path: filePath }
  );

  await playFile(filePath);
  setCurrentFile(filePath);
  updateState({ title: filePath.split(/[/\\]/).pop() || "" });

  // Auto-resume to last playback position
  if (record && record.position > 5 && record.position < record.duration - 10) {
    const resumePos = record.position;
    // Seek after a short delay so mpv has loaded the file
    setTimeout(() => seek(resumePos, "absolute"), 300);
    // Show a brief prompt offering "从头开始" override
    showResumePrompt(resumePos, () => seek(0, "absolute"));
  }
}

function showResumePrompt(position: number, onRestart: () => void): void {
  const prompt = document.createElement("div");
  prompt.className = "resume-prompt";
  const timeStr = formatTime(position);
  prompt.innerHTML = `
    <span>已从 ${timeStr} 继续播放</span>
    <button class="resume-prompt-btn secondary">从头开始</button>
  `;

  const restartBtn = prompt.querySelector("button")!;
  restartBtn.addEventListener("click", () => { onRestart(); prompt.remove(); });

  document.getElementById("player-container")!.appendChild(prompt);
  setTimeout(() => prompt.remove(), 6000);
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
  initEmptyState((path) => loadFileWithResume(path));
  initContextMenu();

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
    // Forward all events to stats overlay (it filters internally)
    feedStatsEvent(event.name, event.data);
  });

  // Drag-and-drop support using Tauri v2 API
  const appWindow = getCurrentWindow();
  await appWindow.onDragDropEvent((event) => {
    if (event.payload.type === "drop") {
      const paths = event.payload.paths;
      if (paths.length > 0) {
        const videoFile = paths.find((f: string) =>
          /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts)$/i.test(f)
        );
        if (videoFile) {
          // Use setTimeout to avoid blocking the drag-drop handler
          setTimeout(() => loadFileWithResume(videoFile), 0);
        }
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
