import { state, subscribe } from "./state";
import { togglePause, toggleFullscreen, seek } from "./bridge";
import { showVolumeToast } from "./volume-toast";
import { applyVolume } from "./volume";
import { getCurrentWindow } from "@tauri-apps/api/window";

let hideTimer: number | null = null;

function parseTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.length === 0 || parts.length > 3) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => isNaN(n) || n < 0)) return null;
  let total = 0;
  if (nums.length === 1) total = nums[0];
  else if (nums.length === 2) total = nums[0] * 60 + nums[1];
  else total = nums[0] * 3600 + nums[1] * 60 + nums[2];
  return total;
}

export function initPlayerUI(): void {
  const topBar = document.getElementById("top-bar")!;
  const controlBar = document.getElementById("control-bar")!;
  const playBtn = document.getElementById("btn-play")!;
  const fullscreenBtn = document.getElementById("btn-fullscreen")!;
  const timeCurrent = document.getElementById("time-current")!;
  const timeDuration = document.getElementById("time-duration")!;
  const timeDisplay = document.getElementById("time-display")!;
  const timeInput = document.getElementById("time-input") as HTMLInputElement;
  const videoTitle = document.getElementById("video-title")!;
  const container = document.getElementById("player-container")!;
  const appWindow = getCurrentWindow();

  // Window control buttons
  const btnMin = document.getElementById("btn-min");
  const btnMax = document.getElementById("btn-max");
  const btnClose = document.getElementById("btn-close");
  btnMin?.addEventListener("click", (e) => { e.stopPropagation(); appWindow.minimize(); });
  btnMax?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const isMax = await appWindow.isMaximized();
    if (isMax) appWindow.unmaximize();
    else appWindow.maximize();
  });
  btnClose?.addEventListener("click", (e) => { e.stopPropagation(); appWindow.close(); });

  playBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePause(); });
  fullscreenBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFullscreen(); });

  // Update fullscreen icon when state changes
  document.addEventListener("fullscreenchange", () => {
    const fsUse = fullscreenBtn.querySelector("use")!;
    fsUse.setAttribute("href", document.fullscreenElement ? "#icon-fullscreen-exit" : "#icon-fullscreen");
  });

  // Esc exits fullscreen (Tauri-based, since we use window.set_fullscreen, not browser API)
  document.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const isFs = await appWindow.isFullscreen();
      if (isFs) appWindow.setFullscreen(false);
    }
  });

  // Hold-and-drag the video area to move the window
  let dragStarted = false;
  let mousedownPos: { x: number; y: number } | null = null;
  container.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // left button only
    const target = e.target as HTMLElement;
    // Don't drag when clicking on UI elements
    if (
      target.closest("#control-bar") ||
      target.closest("#top-bar") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("#empty-state") ||
      target.closest(".ctx-menu") ||
      target.closest(".adjust-panel") ||
      target.closest(".bp-panel") ||
      target.closest(".info-toast") ||
      target.closest(".playlist-panel") ||
      target.closest(".resume-prompt")
    ) {
      return;
    }
    mousedownPos = { x: e.clientX, y: e.clientY };
    dragStarted = false;
  });
  container.addEventListener("mousemove", async (e) => {
    if (!mousedownPos || dragStarted) return;
    const dx = Math.abs(e.clientX - mousedownPos.x);
    const dy = Math.abs(e.clientY - mousedownPos.y);
    // Threshold to distinguish click from drag
    if (dx > 4 || dy > 4) {
      dragStarted = true;
      try { await appWindow.startDragging(); } catch (_) { /* ignore */ }
    }
  });
  document.addEventListener("mouseup", () => {
    mousedownPos = null;
    // Reset dragStarted on next tick so the immediately-following click
    // handler can still see the correct value (true if drag happened).
    setTimeout(() => { dragStarted = false; }, 0);
  });

  // Time display click → input mode
  timeDisplay.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.duration <= 0) return;
    timeDisplay.classList.add("editing");
    timeInput.classList.add("visible");
    timeInput.value = formatTime(state.timePos);
    timeInput.focus();
    timeInput.select();
  });

  const commitTimeInput = (apply: boolean) => {
    if (apply) {
      const seconds = parseTime(timeInput.value);
      if (seconds !== null && state.duration > 0) {
        const target = Math.max(0, Math.min(state.duration, seconds));
        seek(target, "absolute");
      }
    }
    timeInput.classList.remove("visible");
    timeDisplay.classList.remove("editing");
  };

  timeInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") commitTimeInput(true);
    else if (e.key === "Escape") commitTimeInput(false);
  });
  timeInput.addEventListener("blur", () => commitTimeInput(true));
  timeInput.addEventListener("click", (e) => e.stopPropagation());

  // Single-click vs double-click coordination:
  // Browser fires click before dblclick. Delay single-click; cancel if
  // a dblclick arrives within the threshold. We use our own 190ms threshold
  // since the browser's native dblclick threshold (~500ms) is too lenient.
  let pendingClickTimer: number | null = null;
  let lastClickTime = 0;
  let lastClickGap = Infinity;
  const DBLCLICK_THRESHOLD = 190;

  const cancelPendingClick = () => {
    if (pendingClickTimer) {
      clearTimeout(pendingClickTimer);
      pendingClickTimer = null;
    }
  };

  const isUIClick = (target: HTMLElement): boolean =>
    !!(
      target.closest("#control-bar") ||
      target.closest("#top-bar") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("#empty-state") ||
      target.closest(".ctx-menu") ||
      target.closest(".adjust-panel") ||
      target.closest(".bp-panel") ||
      target.closest(".info-toast") ||
      target.closest(".playlist-panel") ||
      target.closest(".resume-prompt")
    );

  // Single click on video area toggles pause (delayed); double click toggles fullscreen
  container.addEventListener("click", (e) => {
    if (dragStarted) return;
    const target = e.target as HTMLElement;
    if (isUIClick(target)) return;

    const now = Date.now();
    lastClickGap = now - lastClickTime;
    lastClickTime = now;

    cancelPendingClick();
    pendingClickTimer = window.setTimeout(() => {
      togglePause();
      pendingClickTimer = null;
    }, DBLCLICK_THRESHOLD);
  });
  container.addEventListener("dblclick", (e) => {
    // Only treat as a real double-click if the two clicks happened within
    // our threshold. Otherwise let the second click's pause timer fire
    // naturally (the first click's pause already fired by now).
    if (lastClickGap > DBLCLICK_THRESHOLD) return;
    const target = e.target as HTMLElement;
    if (isUIClick(target)) return;
    cancelPendingClick();
    toggleFullscreen();
  });

  container.addEventListener("mousemove", () => {
    showControls(topBar, controlBar);
    resetHideTimer(topBar, controlBar);
  });
  container.addEventListener("mouseleave", () => {
    hideControls(topBar, controlBar);
  });

  // Mousewheel on video area: adjust volume by 2% per tick
  container.addEventListener("wheel", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("#control-bar") || target.closest("#empty-state") || target.closest(".bp-panel") || target.closest(".playlist-panel")) {
      return;
    }
    e.preventDefault();
    const delta = e.deltaY < 0 ? 2 : -2;
    const base = state.muted ? 0 : state.volume;
    const v = Math.max(0, Math.min(100, base + delta));
    applyVolume(v);
    showVolumeToast(v);
  }, { passive: false });

  subscribe((s) => {
    const playUse = playBtn.querySelector("use")!;
    playUse.setAttribute("href", s.paused ? "#icon-play" : "#icon-pause");
    timeCurrent.textContent = formatTime(s.timePos);
    timeDuration.textContent = formatTime(s.duration);
    videoTitle.textContent = s.title;
  });

  // Suppress unused variable warnings
  void state;
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
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
