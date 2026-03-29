import type { ProviderConfig, Voice, PlaybackState, PageInfo, AppSettings } from './types';

export const MSG = {
  // Transport controls (content/popup → SW → offscreen)
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  STOP: 'STOP',
  SKIP_FORWARD: 'SKIP_FORWARD',
  SKIP_BACKWARD: 'SKIP_BACKWARD',
  SET_SPEED: 'SET_SPEED',
  SET_VOLUME: 'SET_VOLUME',
  GET_STATE: 'GET_STATE',

  // Audio pipeline (SW → offscreen)
  PLAY_AUDIO: 'PLAY_AUDIO',
  PREFETCH_AUDIO: 'PREFETCH_AUDIO',

  // Playback events (offscreen → SW → content)
  PLAYBACK_PROGRESS: 'PLAYBACK_PROGRESS',
  CHUNK_COMPLETE: 'CHUNK_COMPLETE',
  PLAYBACK_ERROR: 'PLAYBACK_ERROR',
  WORD_TIMING: 'WORD_TIMING',

  // Content extraction (SW → content)
  EXTRACT_CONTENT: 'EXTRACT_CONTENT',
  GET_CHUNK: 'GET_CHUNK',

  // Provider management (popup/options → SW)
  SYNTHESIZE: 'SYNTHESIZE',
  LIST_VOICES: 'LIST_VOICES',
  VALIDATE_KEY: 'VALIDATE_KEY',
  SET_ACTIVE_PROVIDER: 'SET_ACTIVE_PROVIDER',

  // Content ↔ Popup
  GET_PAGE_INFO: 'GET_PAGE_INFO',
  START_READING: 'START_READING',

  // Settings
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
} as const;

export type MessageType = (typeof MSG)[keyof typeof MSG];

// --- Transport Messages ---

export interface PlayMessage {
  type: typeof MSG.PLAY;
  fromSelection?: boolean;
}

export interface PauseMessage {
  type: typeof MSG.PAUSE;
}

export interface ResumeMessage {
  type: typeof MSG.RESUME;
}

export interface StopMessage {
  type: typeof MSG.STOP;
}

export interface SkipForwardMessage {
  type: typeof MSG.SKIP_FORWARD;
}

export interface SkipBackwardMessage {
  type: typeof MSG.SKIP_BACKWARD;
}

export interface SetSpeedMessage {
  type: typeof MSG.SET_SPEED;
  speed: number;
}

export interface SetVolumeMessage {
  type: typeof MSG.SET_VOLUME;
  volume: number;
}

export interface GetStateMessage {
  type: typeof MSG.GET_STATE;
}

// --- Audio Pipeline Messages ---

export interface PlayAudioMessage {
  type: typeof MSG.PLAY_AUDIO;
  audioData: ArrayBuffer;
  chunkIndex: number;
  format: string;
}

export interface PrefetchAudioMessage {
  type: typeof MSG.PREFETCH_AUDIO;
  audioData: ArrayBuffer;
  chunkIndex: number;
  format: string;
}

// --- Playback Event Messages ---

export interface PlaybackProgressMessage {
  type: typeof MSG.PLAYBACK_PROGRESS;
  currentTime: number;
  duration: number;
  chunkIndex: number;
}

export interface ChunkCompleteMessage {
  type: typeof MSG.CHUNK_COMPLETE;
  chunkIndex: number;
}

export interface PlaybackErrorMessage {
  type: typeof MSG.PLAYBACK_ERROR;
  error: string;
  chunkIndex: number;
}

export interface WordTimingMessage {
  type: typeof MSG.WORD_TIMING;
  chunkIndex: number;
  wordIndex: number;
  word: string;
  startTime: number;
  endTime: number;
}

// --- Content Extraction Messages ---

export interface ExtractContentMessage {
  type: typeof MSG.EXTRACT_CONTENT;
  fromSelection?: boolean;
}

export interface GetChunkMessage {
  type: typeof MSG.GET_CHUNK;
  index: number;
}

// --- Provider Messages ---

export interface SynthesizeMessage {
  type: typeof MSG.SYNTHESIZE;
  text: string;
  voiceId: string;
  providerId: string;
}

export interface ListVoicesMessage {
  type: typeof MSG.LIST_VOICES;
  providerId: string;
}

export interface ValidateKeyMessage {
  type: typeof MSG.VALIDATE_KEY;
  config: ProviderConfig;
}

export interface SetActiveProviderMessage {
  type: typeof MSG.SET_ACTIVE_PROVIDER;
  configId: string;
}

// --- Page Info Messages ---

export interface GetPageInfoMessage {
  type: typeof MSG.GET_PAGE_INFO;
}

export interface StartReadingMessage {
  type: typeof MSG.START_READING;
}

// --- Settings Messages ---

export interface SettingsChangedMessage {
  type: typeof MSG.SETTINGS_CHANGED;
  settings: AppSettings;
}

export type ExtensionMessage =
  | PlayMessage
  | PauseMessage
  | ResumeMessage
  | StopMessage
  | SkipForwardMessage
  | SkipBackwardMessage
  | SetSpeedMessage
  | SetVolumeMessage
  | GetStateMessage
  | PlayAudioMessage
  | PrefetchAudioMessage
  | PlaybackProgressMessage
  | ChunkCompleteMessage
  | PlaybackErrorMessage
  | WordTimingMessage
  | ExtractContentMessage
  | GetChunkMessage
  | SynthesizeMessage
  | ListVoicesMessage
  | ValidateKeyMessage
  | SetActiveProviderMessage
  | GetPageInfoMessage
  | StartReadingMessage
  | SettingsChangedMessage;

// Helper to send a message and get a typed response
export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

// Helper to send a message to a specific tab
export function sendTabMessage<T = unknown>(tabId: number, message: ExtensionMessage): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message);
}
