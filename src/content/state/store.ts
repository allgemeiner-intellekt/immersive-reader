import { create } from 'zustand';
import type { PlaybackStatus } from '@shared/types';
import { MSG, sendMessage } from '@shared/messages';
import { SPEED_PRESETS, PROVIDER_SPEED_RANGES, filterPresetsForRange } from '@shared/constants';

export interface ToolbarState {
  // Playback
  playbackStatus: PlaybackStatus;
  currentChunkIndex: number;
  totalChunks: number;
  chunkProgress: number;
  elapsedTime: number;       // accumulated seconds from completed chunks
  currentChunkTime: number;  // current chunk's currentTime in seconds
  speed: number;
  volume: number;

  // UI
  toolbarVisible: boolean;
  expanded: boolean;

  // Provider info
  providerName: string;
  activeProviderId: string | null;

  // Toast notification
  toastMessage: string | null;

  // Actions
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipForward: () => void;
  skipBackward: () => void;
  seekToChunk: (chunkIndex: number) => void;
  setSpeed: (speed: number) => void;
  cycleSpeed: () => void;
  setVolume: (volume: number) => void;
  showToolbar: () => void;
  hideToolbar: () => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;

  // State updates (called from message listeners)
  _setPlaybackStatus: (status: PlaybackStatus) => void;
  _setChunkProgress: (progress: number, currentTime?: number) => void;
  _setCurrentChunk: (index: number, total?: number) => void;
  _addChunkDuration: (duration: number) => void;
  _setTotalChunks: (total: number) => void;
  _setProviderId: (id: string | null) => void;
  _setProviderName: (name: string) => void;
  _showToast: (message: string) => void;
}

export const useToolbarStore = create<ToolbarState>((set, get) => ({
  playbackStatus: 'idle',
  currentChunkIndex: 0,
  totalChunks: 0,
  chunkProgress: 0,
  elapsedTime: 0,
  currentChunkTime: 0,
  speed: 1.0,
  volume: 1.0,
  toolbarVisible: false,
  expanded: false,
  providerName: '',
  activeProviderId: null,
  toastMessage: null,

  play: () => {
    sendMessage({ type: MSG.PLAY });
    set({ playbackStatus: 'loading', toolbarVisible: true });
  },

  pause: () => {
    sendMessage({ type: MSG.PAUSE });
    set({ playbackStatus: 'paused' });
  },

  resume: () => {
    sendMessage({ type: MSG.RESUME });
    set({ playbackStatus: 'playing' });
  },

  stop: () => {
    sendMessage({ type: MSG.STOP });
    set({
      playbackStatus: 'idle',
      currentChunkIndex: 0,
      chunkProgress: 0,
      elapsedTime: 0,
      currentChunkTime: 0,
      toolbarVisible: false,
      expanded: false,
    });
  },

  skipForward: () => {
    sendMessage({ type: MSG.SKIP_FORWARD });
  },

  skipBackward: () => {
    sendMessage({ type: MSG.SKIP_BACKWARD });
  },

  seekToChunk: (chunkIndex: number) => {
    if (get().playbackStatus === 'idle') return;
    sendMessage({ type: MSG.SEEK_TO_CHUNK, chunkIndex });
    set({ playbackStatus: 'loading' });
  },

  setSpeed: (speed: number) => {
    sendMessage({ type: MSG.SET_SPEED, speed });
    set({ speed });
  },

  cycleSpeed: () => {
    const { speed, activeProviderId } = get();
    const range = activeProviderId ? PROVIDER_SPEED_RANGES[activeProviderId] ?? null : null;
    const presets = range ? filterPresetsForRange(range.min, range.max) : SPEED_PRESETS;
    if (presets.length === 0) return;
    const idx = presets.indexOf(speed);
    const next = presets[(idx + 1) % presets.length];
    sendMessage({ type: MSG.SET_SPEED, speed: next });
    set({ speed: next });
  },

  setVolume: (volume: number) => {
    sendMessage({ type: MSG.SET_VOLUME, volume });
    set({ volume });
  },

  showToolbar: () => {
    set({ toolbarVisible: true });
  },

  hideToolbar: () => {
    set({ toolbarVisible: false, expanded: false });
  },

  toggleExpanded: () => {
    set((s) => ({ expanded: !s.expanded }));
  },

  setExpanded: (expanded: boolean) => {
    set({ expanded });
  },

  _setPlaybackStatus: (status) => set({ playbackStatus: status }),
  _setChunkProgress: (progress, currentTime) =>
    set((s) => ({ chunkProgress: progress, currentChunkTime: currentTime ?? s.currentChunkTime })),
  _addChunkDuration: (duration) =>
    set((s) => ({ elapsedTime: s.elapsedTime + duration, currentChunkTime: 0 })),
  _setCurrentChunk: (index, total) =>
    set((s) => ({ currentChunkIndex: index, totalChunks: total ?? s.totalChunks })),
  _setTotalChunks: (total) => set({ totalChunks: total }),
  _setProviderId: (id) => set({ activeProviderId: id }),
  _setProviderName: (name) => set({ providerName: name }),
  _showToast: (message) => {
    set({ toastMessage: message });
    setTimeout(() => set({ toastMessage: null }), 3000);
  },
}));
