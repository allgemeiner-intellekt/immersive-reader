import type { ProviderConfig, Voice, PlaybackState, AppSettings, ProviderUsage } from './types';

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

  // Offscreen audio commands (SW → offscreen)
  OFFSCREEN_PLAY: 'OFFSCREEN_PLAY',
  OFFSCREEN_PAUSE: 'OFFSCREEN_PAUSE',
  OFFSCREEN_RESUME: 'OFFSCREEN_RESUME',
  OFFSCREEN_STOP: 'OFFSCREEN_STOP',
  OFFSCREEN_SET_SPEED: 'OFFSCREEN_SET_SPEED',
  OFFSCREEN_SET_VOLUME: 'OFFSCREEN_SET_VOLUME',

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

  // Provider usage
  GET_PROVIDER_USAGE: 'GET_PROVIDER_USAGE',

  // Health & Failover
  GET_PROVIDER_HEALTH: 'GET_PROVIDER_HEALTH',
  RESET_PROVIDER_HEALTH: 'RESET_PROVIDER_HEALTH',
  FAILOVER_NOTICE: 'FAILOVER_NOTICE',

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

// --- Offscreen Audio Messages (use base64 since ArrayBuffer can't be serialized) ---

export interface OffscreenPlayMessage {
  type: typeof MSG.OFFSCREEN_PLAY;
  audioBase64: string;
  chunkIndex: number;
  format: string;
}

export interface OffscreenPauseMessage {
  type: typeof MSG.OFFSCREEN_PAUSE;
}

export interface OffscreenResumeMessage {
  type: typeof MSG.OFFSCREEN_RESUME;
}

export interface OffscreenStopMessage {
  type: typeof MSG.OFFSCREEN_STOP;
}

export interface OffscreenSetSpeedMessage {
  type: typeof MSG.OFFSCREEN_SET_SPEED;
  speed: number;
}

export interface OffscreenSetVolumeMessage {
  type: typeof MSG.OFFSCREEN_SET_VOLUME;
  volume: number;
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
  groupKey: string;
}

// --- Page Info Messages ---

export interface GetPageInfoMessage {
  type: typeof MSG.GET_PAGE_INFO;
}

export interface StartReadingMessage {
  type: typeof MSG.START_READING;
}

// --- Provider Usage Messages ---

export interface GetProviderUsageMessage {
  type: typeof MSG.GET_PROVIDER_USAGE;
  configId: string;
}

// --- Health & Failover Messages ---

export interface GetProviderHealthMessage {
  type: typeof MSG.GET_PROVIDER_HEALTH;
}

export interface ResetProviderHealthMessage {
  type: typeof MSG.RESET_PROVIDER_HEALTH;
  configId: string;
}

export interface FailoverNoticeMessage {
  type: typeof MSG.FAILOVER_NOTICE;
  fromConfig: string;
  toConfig: string;
  toConfigName: string;
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
  | OffscreenPlayMessage
  | OffscreenPauseMessage
  | OffscreenResumeMessage
  | OffscreenStopMessage
  | OffscreenSetSpeedMessage
  | OffscreenSetVolumeMessage
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
  | GetProviderUsageMessage
  | GetProviderHealthMessage
  | ResetProviderHealthMessage
  | FailoverNoticeMessage
  | SettingsChangedMessage;

// Helper to send a message and get a typed response
export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

// Helper to send a message to a specific tab
export function sendTabMessage<T = unknown>(tabId: number, message: ExtensionMessage): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message);
}
