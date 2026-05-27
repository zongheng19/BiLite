import { saveAudioPrefs } from "./bridge";
import { state } from "./state";

/**
 * Debounced audio-prefs persistence. Wheel/keyboard volume tweaks fire
 * dozens of events per second; we coalesce to one disk write per ~500ms.
 */

let pending: number | null = null;
const DEBOUNCE_MS = 500;

export function persistAudioPrefs(): void {
  if (pending !== null) {
    clearTimeout(pending);
  }
  pending = window.setTimeout(() => {
    pending = null;
    saveAudioPrefs(state.volume, state.muted).catch((err) => {
      console.warn("[BiLite] save_audio_prefs failed:", err);
    });
  }, DEBOUNCE_MS);
}

/** Force-flush any pending save (e.g. before app close). */
export function flushAudioPrefs(): void {
  if (pending !== null) {
    clearTimeout(pending);
    pending = null;
    saveAudioPrefs(state.volume, state.muted).catch(() => {});
  }
}
