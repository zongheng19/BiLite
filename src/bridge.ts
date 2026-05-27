import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export async function playFile(path: string): Promise<void> {
  return invoke("play_file", { path });
}
export async function togglePause(): Promise<void> {
  return invoke("toggle_pause");
}
export async function seek(seconds: number, mode: string = "relative"): Promise<void> {
  return invoke("seek", { seconds, mode });
}
export async function setVolume(volume: number): Promise<void> {
  return invoke("set_volume", { volume });
}
export async function setSpeed(speed: number): Promise<void> {
  return invoke("set_speed", { speed });
}
export async function toggleFullscreen(): Promise<void> {
  return invoke("toggle_fullscreen");
}
export async function setSubtitleTrack(trackId: number): Promise<void> {
  return invoke("set_subtitle_track", { trackId });
}
export async function setVideoProperty(name: string, value: number): Promise<void> {
  return invoke("set_video_property", { name, value });
}
export async function setVolumeMax(maxPct: number): Promise<void> {
  return invoke("set_volume_max", { maxPct });
}
export async function setEqualizer(bands: number[]): Promise<void> {
  return invoke("set_equalizer", { bands });
}
export async function clearEqualizer(): Promise<void> {
  return invoke("clear_equalizer");
}
export async function toggleLoop(enabled: boolean): Promise<void> {
  return invoke("toggle_loop", { enabled });
}
export async function toggleMirror(enabled: boolean): Promise<void> {
  return invoke("toggle_mirror", { enabled });
}
export async function generateAiSubtitle(videoPath: string): Promise<string> {
  return invoke("generate_ai_subtitle", { videoPath });
}
export async function whisperConfigured(): Promise<boolean> {
  return invoke("whisper_configured");
}
export interface WhisperPaths {
  model_dir: string;
  module_dir: string;
}
export async function whisperDefaultDir(): Promise<WhisperPaths> {
  return invoke("whisper_default_dir");
}
export async function openWhisperDir(): Promise<void> {
  return invoke("open_whisper_dir");
}
export async function saveAudioPrefs(volume: number, muted: boolean): Promise<void> {
  return invoke("save_audio_prefs", { volume, muted });
}
export async function getConfig(): Promise<any> {
  return invoke("get_config");
}
export async function saveConfig(config: any): Promise<void> {
  return invoke("save_config", { config });
}

export interface MpvEvent {
  event?: string;
  name?: string;
  data?: unknown;
}

export function onMpvEvent(callback: (event: MpvEvent) => void): Promise<UnlistenFn> {
  return listen<MpvEvent>("mpv-event", (e) => callback(e.payload));
}
