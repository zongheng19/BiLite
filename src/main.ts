import { invoke } from "@tauri-apps/api/core";
import { onMpvEvent, MpvEvent } from "./bridge";
import { updateState } from "./state";
import { initPlayerUI } from "./player-ui";
import { initProgressBar } from "./progress-bar";
import { initVolume } from "./volume";
import { initSpeedPanel } from "./speed-panel";
import { initShortcuts } from "./shortcuts";
import { initSubtitlePanel } from "./subtitle-panel";
import { initPlaylistPanel } from "./playlist-panel";
import { showWizard } from "./wizard";

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
}

init();
