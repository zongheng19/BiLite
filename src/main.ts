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
  closeEndPrompt();
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

let endPromptEl: HTMLElement | null = null;

function showEndPrompt(): void {
  if (endPromptEl) return;
  endPromptEl = document.createElement("div");
  endPromptEl.className = "end-prompt";
  endPromptEl.innerHTML = `
    <div class="end-prompt-title">播放结束</div>
    <div class="end-prompt-actions">
      <button class="end-prompt-btn primary" data-act="replay">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
        重新播放
      </button>
      <button class="end-prompt-btn" data-act="open">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        打开新视频
      </button>
    </div>
  `;
  document.getElementById("player-container")!.appendChild(endPromptEl);

  endPromptEl.querySelector('[data-act="replay"]')!.addEventListener("click", () => {
    seek(0, "absolute");
    togglePauseFromEnd();
    closeEndPrompt();
  });
  endPromptEl.querySelector('[data-act="open"]')!.addEventListener("click", async () => {
    closeEndPrompt();
    const selected = await openFileDialog();
    if (selected) await loadFileWithResume(selected);
  });
}

function closeEndPrompt(): void {
  if (endPromptEl) {
    endPromptEl.remove();
    endPromptEl = null;
  }
}

async function togglePauseFromEnd(): Promise<void> {
  // After EOF, mpv is paused. Send a play command via toggle.
  const { togglePause } = await import("./bridge");
  togglePause();
}

async function openFileDialog(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    filters: [
      { name: "视频文件", extensions: ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  return typeof selected === "string" ? selected : null;
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
    else if (event.name === "eof-reached") {
      const reached = event.data as boolean;
      updateState({ eofReached: reached });
      if (reached) {
        showEndPrompt();
      }
    }
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
