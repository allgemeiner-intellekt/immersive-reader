import type { AppSettings, ThemeMode } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  activeProviderGroup: null,
  activeVoiceId: null,
  theme: 'system' as ThemeMode,
  playback: {
    defaultSpeed: 1.0,
    defaultVolume: 1.0,
    bufferSize: 2, // prefetch 2 chunks ahead
    autoScrollEnabled: true,
    skipReferences: false,
  },
  highlight: {
    wordColor: 'rgba(59, 130, 246, 0.4)', // blue
    sentenceColor: 'rgba(59, 130, 246, 0.1)', // light blue
    wordEnabled: true,
    sentenceEnabled: true,
    autoScroll: true,
  },
  onboardingComplete: false,
};

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 3.0;
export const SPEED_STEP = 0.25;
export const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

export const CHUNK_MIN_WORDS = 5;
export const CHUNK_MAX_WORDS = 50;
export const CHUNK_TARGET_WORDS = 20;

export const PROGRESS_REPORT_INTERVAL_MS = 100;
export const LOOKAHEAD_BUFFER_SIZE = 2;
export const FIRST_AUDIO_TARGET_MS = 400;
