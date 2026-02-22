import type { TTSSettings } from './types';

export const DEFAULT_SETTINGS: TTSSettings = {
  apiUrl: 'http://localhost:5050',
  apiKey: '',
  voice: 'en-US-AvaNeural',
  speed: 1.0,
  model: 'tts-1',
};

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2.0;
export const SPEED_STEP = 0.1;

export const SEGMENT_MIN_CHARS = 50;
export const SEGMENT_MAX_CHARS = 2000;
export const SENTENCES_PER_SEGMENT = 2;

export const PLAY_BUTTON_WORD_THRESHOLD = 200;

export const PROGRESS_REPORT_INTERVAL_MS = 100;
export const PROGRESS_MAX_ENTRIES = 50;

export const WORDS_PER_MINUTE = 120;

export const AUTOSCROLL_TRIGGER_RATIO = 0.75;
export const AUTOSCROLL_TARGET_RATIO = 0.3;

export const PARAGRAPH_MIN_WORDS = 20;

export const PLAYER_HEIGHT = 48;
export const PLAYER_BORDER_RADIUS = 24;
