import { togglePause, seek, setVolume, setSpeed, toggleFullscreen } from "./bridge";
import { state } from "./state";

let rightHeld = false;
let leftHeld = false;
let leftInterval: number | null = null;
let speedBeforeHold = 1.0;

export function initShortcuts(): void {
  document.addEventListener("keydown", (e) => {
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
            if (rightHeld) setSpeed(3.0);
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
            }
          }, 200);
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        setVolume(Math.min(100, state.volume + 10));
        break;

      case "ArrowDown":
        e.preventDefault();
        setVolume(Math.max(0, state.volume - 10));
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
        } else {
          setVolume(80);
        }
        break;

      case "!": // Shift+1
        if (e.shiftKey) { e.preventDefault(); setSpeed(1.0); }
        break;

      case "@": // Shift+2
        if (e.shiftKey) { e.preventDefault(); setSpeed(2.0); }
        break;
    }
  });

  document.addEventListener("keyup", (e) => {
    switch (e.key) {
      case "ArrowRight":
        if (rightHeld) {
          rightHeld = false;
          if (state.speed === 3.0) {
            setSpeed(speedBeforeHold);
          } else {
            seek(5, "relative");
          }
        }
        break;

      case "ArrowLeft":
        if (leftHeld) {
          leftHeld = false;
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
