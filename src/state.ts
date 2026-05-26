export interface PlayerState {
  paused: boolean;
  timePos: number;
  duration: number;
  volume: number;
  speed: number;
  eofReached: boolean;
  title: string;
}

type Listener = (state: PlayerState) => void;
const listeners: Listener[] = [];

export const state: PlayerState = {
  paused: true,
  timePos: 0,
  duration: 0,
  volume: 80,
  speed: 1.0,
  eofReached: false,
  title: "",
};

export function updateState(partial: Partial<PlayerState>): void {
  Object.assign(state, partial);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
