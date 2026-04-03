import { create } from 'zustand';
import type { PlaybackStatus } from '@shared/types';
import { MSG, sendMessage } from '@shared/messages';
import { SPEED_PRESETS } from '@shared/constants';

export interface ToolbarState {
  // Playback
  playbackStatus: PlaybackStatus;
  currentChunkIndex: number;
  totalChunks: number;
  chunkProgress: number;
  speed: number;
  volume: number;

  // UI
  toolbarVisible: boolean;
  expanded: boolean;

  // Provider info
  providerName: string;

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
  _setChunkProgress: (progress: number) => void;
  _setCurrentChunk: (index: number, total?: number) => void;
  _setTotalChunks: (total: number) => void;
  _setProviderName: (name: string) => void;
  _showToast: (message: string) => void;
}

export const useToolbarStore = create<ToolbarState>((set, get) => ({
  playbackStatus: 'idle',
  currentChunkIndex: 0,
  totalChunks: 0,
  chunkProgress: 0,
  speed: 1.0,
  volume: 1.0,
  toolbarVisible: false,
  expanded: false,
  providerName: '',
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
    const { speed } = get();
    const currentIndex = SPEED_PRESETS.indexOf(speed);
    const nextIndex = (currentIndex + 1) % SPEED_PRESETS.length;
    const nextSpeed = SPEED_PRESETS[nextIndex];
    sendMessage({ type: MSG.SET_SPEED, speed: nextSpeed });
    set({ speed: nextSpeed });
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
  _setChunkProgress: (progress) => set({ chunkProgress: progress }),
  _setCurrentChunk: (index, total) =>
    set((s) => ({ currentChunkIndex: index, totalChunks: total ?? s.totalChunks })),
  _setTotalChunks: (total) => set({ totalChunks: total }),
  _setProviderName: (name) => set({ providerName: name }),
  _showToast: (message) => {
    set({ toastMessage: message });
    setTimeout(() => set({ toastMessage: null }), 3000);
  },
}));
