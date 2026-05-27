import { state, subscribe, updateState } from "./state";
import { setVolume } from "./bridge";
import { showVolumeToast } from "./volume-toast";
import { persistAudioPrefs } from "./audio-prefs";

export function initVolume(): void {
  const btn = document.getElementById("btn-volume")!;
  const wrap = document.getElementById("volume-wrap")!;
  const slider = document.getElementById("volume-slider")!;
  const track = slider.querySelector(".volume-slider-track") as HTMLElement;
  const fill = document.getElementById("volume-fill")!;
  const thumb = document.getElementById("volume-thumb")!;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMute();
  });

  // Slider click and drag
  let dragging = false;
  const updateFromEvent = (e: MouseEvent) => {
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    applyVolume(pct * 100);
  };
  track.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    dragging = true;
    updateFromEvent(e);
  });
  document.addEventListener("mousemove", (e) => {
    if (dragging) updateFromEvent(e);
  });
  document.addEventListener("mouseup", () => { dragging = false; });

  subscribe((s) => {
    const use = btn.querySelector("use")!;
    let icon = "#icon-volume-high";
    if (s.muted || s.volume === 0) icon = "#icon-volume-mute";
    else if (s.volume < 30) icon = "#icon-volume-low";
    else if (s.volume < 70) icon = "#icon-volume-mid";
    use.setAttribute("href", icon);

    const displayVol = s.muted ? 0 : s.volume;
    const pct = Math.max(0, Math.min(100, displayVol));
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    const valueEl = document.getElementById("volume-value");
    if (valueEl) valueEl.textContent = String(Math.round(pct));
  });

  wrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    const base = state.muted ? 0 : state.volume;
    const newVol = Math.max(0, Math.min(100, base + delta));
    applyVolume(newVol);
    showVolumeToast(newVol);
  });
}

/** Set the active volume; un-mutes if it was muted and volume > 0. */
export function applyVolume(v: number): void {
  const clamped = Math.max(0, Math.min(100, v));
  if (clamped > 0) {
    updateState({ volume: clamped, prevVolume: clamped, muted: false });
    setVolume(clamped);
  } else {
    // setting to 0 == implicit mute
    updateState({ volume: 0, muted: true });
    setVolume(0);
  }
  persistAudioPrefs();
}

/** Toggle mute on/off, restoring previous volume when un-muting. */
export function toggleMute(): void {
  if (state.muted || state.volume === 0) {
    const restore = state.prevVolume > 0 ? state.prevVolume : 80;
    updateState({ volume: restore, muted: false });
    setVolume(restore);
  } else {
    updateState({ prevVolume: state.volume, muted: true });
    setVolume(0);
  }
  persistAudioPrefs();
}
