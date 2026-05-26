import { state, subscribe } from "./state";
import { seek } from "./bridge";
import { formatTime } from "./player-ui";

export function initProgressBar(): void {
  const area = document.getElementById("progress-area")!;
  const played = area.querySelector(".progress-played") as HTMLElement;
  const thumb = area.querySelector(".progress-thumb") as HTMLElement;
  const tooltip = area.querySelector(".progress-tooltip") as HTMLElement;
  let dragging = false;
  let lastDragPct = 0;
  let lastSeekTime = 0;

  subscribe((s) => {
    if (!dragging && s.duration > 0) {
      const pct = (s.timePos / s.duration) * 100;
      played.style.width = `${pct}%`;
      thumb.style.left = `${pct}%`;
    }
  });

  const pctFromEvent = (e: MouseEvent): number => {
    const rect = area.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const updateVisual = (pct: number) => {
    played.style.width = `${pct * 100}%`;
    thumb.style.left = `${pct * 100}%`;
  };

  area.addEventListener("mousemove", (e) => {
    const pct = pctFromEvent(e);
    const time = pct * state.duration;
    tooltip.textContent = formatTime(time);
    tooltip.style.left = `${pct * 100}%`;
  });

  area.addEventListener("mousedown", (e) => {
    if (state.duration <= 0) return;
    dragging = true;
    lastDragPct = pctFromEvent(e);
    updateVisual(lastDragPct);
    seek(lastDragPct * state.duration, "absolute");
    lastSeekTime = Date.now();
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    lastDragPct = pctFromEvent(e);
    updateVisual(lastDragPct);
    // Throttle seeks during drag (max 1 per 80ms)
    const now = Date.now();
    if (now - lastSeekTime > 80 && state.duration > 0) {
      seek(lastDragPct * state.duration, "absolute");
      lastSeekTime = now;
    }
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    // Final seek to release position
    if (state.duration > 0) {
      seek(lastDragPct * state.duration, "absolute");
    }
  });
}
