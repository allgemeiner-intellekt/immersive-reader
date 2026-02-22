import { create } from 'zustand';
import type { TTSSettings, PlaybackState, Segment, TextNodeEntry } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { loadSettings, saveSettings } from '@shared/storage';

interface Store {
  settings: TTSSettings;
  playback: PlaybackState;
  segments: Segment[];
  textNodeMap: TextNodeEntry[];
  error: string | null;
  pendingPlaybackElement: Element | null;

  setSettings: (settings: Partial<TTSSettings>) => void;
  setPlayback: (playback: Partial<PlaybackState>) => void;
  setSegments: (segments: Segment[]) => void;
  setTextNodeMap: (map: TextNodeEntry[]) => void;
  setError: (error: string | null) => void;
  setPendingPlaybackElement: (el: Element | null) => void;
  loadPersistedSettings: () => Promise<void>;
}

export const useStore = create<Store>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  playback: {
    isPlaying: false,
    isPaused: false,
    currentSegmentIndex: 0,
    totalSegments: 0,
    segmentProgress: 0,
    currentTime: 0,
    duration: 0,
    elapsedTime: 0,
    estimatedTotalTime: 0,
    completedSegmentsDuration: 0,
  },
  segments: [],
  textNodeMap: [],
  error: null,
  pendingPlaybackElement: null,

  setSettings: (partial) => {
    const updated = { ...get().settings, ...partial };
    set({ settings: updated });
    saveSettings(updated).catch(console.error);
  },

  setPlayback: (partial) => {
    set({ playback: { ...get().playback, ...partial } });
  },

  setSegments: (segments) => set({ segments }),
  setTextNodeMap: (textNodeMap) => set({ textNodeMap }),
  setError: (error) => set({ error }),
  setPendingPlaybackElement: (pendingPlaybackElement) => set({ pendingPlaybackElement }),

  loadPersistedSettings: async () => {
    const settings = await loadSettings();
    set({ settings });
  },
}));

// Load persisted settings on init
useStore.getState().loadPersistedSettings();
