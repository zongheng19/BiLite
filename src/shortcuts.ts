import { togglePause, seek, setVolume, setSpeed, toggleFullscreen } from "./bridge";
import { state } from "./state";
import { showVolumeToast } from "./volume-toast";
import { toggleStats } from "./stats-overlay";

let rightHeld = false;
let leftHeld = false;
let leftInterval: number | null = null;
let speedBeforeHold = 1.0;

function showSpeedToast(text: string): void {
  const toast = document.getElementById("speed-toast");
  if (!toast) return;
  const textEl = toast.querySelector(".speed-toast-text");
  if (textEl) textEl.textContent = text;
  toast.classList.add("visible");
}

function hideSpeedToast(): void {
  const toast = document.getElementById("speed-toast");
  if (toast) toast.classList.remove("visible");
}

function isTypingInInput(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export function initShortcuts(): void {
  document.addEventListener("keydown", (e) => {
    if (isTypingInInput(e.target)) return;
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
          setTimeout(() => {
            if (rightHeld) {
              setSpeed(3.0);
              showSpeedToast("3x 倍速中");
            }
          }, 200);
        }
        break;

      case "ArrowLeft":
        e.preventDefault();
        if (!leftHeld) {
          leftHeld = true;
          setTimeout(() => {
            if (leftHeld) {
              leftInterval = window.setInterval(() => {
                seek(-1, "relative");
              }, 100);
              showSpeedToast("快速回退中");
            }
          }, 200);
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        {
          const v = Math.min(100, state.volume + 10);
          setVolume(v);
          showVolumeToast(v);
        }
        break;

      case "ArrowDown":
        e.preventDefault();
        {
          const v = Math.max(0, state.volume - 10);
          setVolume(v);
          showVolumeToast(v);
        }
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
          showVolumeToast(0);
        } else {
          setVolume(80);
          showVolumeToast(80);
        }
        break;

      case "!": // Shift+1
        if (e.shiftKey) { e.preventDefault(); setSpeed(1.0); }
        break;

      case "@": // Shift+2
        if (e.shiftKey) { e.preventDefault(); setSpeed(2.0); }
        break;

      case "Tab":
        e.preventDefault();
        toggleStats();
        break;
    }
  });

  document.addEventListener("keyup", (e) => {
    if (isTypingInInput(e.target)) return;

    switch (e.key) {
      case "ArrowRight":
        if (rightHeld) {
          rightHeld = false;
          hideSpeedToast();
          if (Math.abs(state.speed - 3.0) < 0.01) {
            setSpeed(speedBeforeHold);
          } else {
            seek(5, "relative");
          }
        }
        break;

      case "ArrowLeft":
        if (leftHeld) {
          leftHeld = false;
          hideSpeedToast();
          if (leftInterval) {
            clearInterval(leftInterval);
            leftInterval = null;
          } else {
            seek(-5, "relative");
          }
        }
        break;
    }
  });
}
