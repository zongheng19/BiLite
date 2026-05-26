import { state, subscribe } from "./state";
import { setVolume } from "./bridge";
import { showVolumeToast } from "./volume-toast";

export function initVolume(): void {
  const btn = document.getElementById("btn-volume")!;
  const wrap = document.getElementById("volume-wrap")!;
  const slider = document.getElementById("volume-slider")!;
  const track = slider.querySelector(".volume-slider-track") as HTMLElement;
  const fill = document.getElementById("volume-fill")!;
  const thumb = document.getElementById("volume-thumb")!;
  let muted = false;
  let prevVolume = state.volume;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (muted) {
      setVolume(prevVolume);
      muted = false;
    } else {
      prevVolume = state.volume;
      setVolume(0);
      muted = true;
    }
  });

  // Slider click and drag
  let dragging = false;
  const updateFromEvent = (e: MouseEvent) => {
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(pct * 100);
    muted = false;
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
    if (s.volume === 0) icon = "#icon-volume-mute";
    else if (s.volume < 30) icon = "#icon-volume-low";
    else if (s.volume < 70) icon = "#icon-volume-mid";
    use.setAttribute("href", icon);

    const pct = Math.max(0, Math.min(100, s.volume));
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    const valueEl = document.getElementById("volume-value");
    if (valueEl) valueEl.textContent = String(Math.round(pct));
  });

  wrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    const newVol = Math.max(0, Math.min(100, state.volume + delta));
    setVolume(newVol);
    showVolumeToast(newVol);
    muted = false;
  });
}
