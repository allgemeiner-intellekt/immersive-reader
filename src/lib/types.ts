// === Provider Types ===

export interface ProviderConfig {
  id: string;
  providerId: string; // 'openai' | 'elevenlabs' | 'groq' | 'custom'
  name: string;
  apiKey: string;
  baseUrl?: string;
  extraParams?: Record<string, unknown>;
}

export interface Voice {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  previewUrl?: string;
}

export interface SynthesisResult {
  audioData: ArrayBuffer;
  format: string; // 'mp3', 'opus', 'wav', etc.
  wordTimings?: WordTiming[];
}

export interface TTSProvider {
  id: string;
  name: string;
  listVoices(config: ProviderConfig): Promise<Voice[]>;
  synthesize(
    text: string,
    voice: Voice,
    config: ProviderConfig,
    options?: SynthesisOptions,
  ): Promise<SynthesisResult>;
  validateKey(config: ProviderConfig): Promise<boolean>;
}

export interface SynthesisOptions {
  speed?: number;
  format?: string;
  signal?: AbortSignal;
}

// === Content Extraction Types ===

export interface ExtractionResult {
  title: string;
  html: string;
  textContent: string;
  wordCount: number;
  sourceElement: Element | null;
}

export interface TextChunk {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
  wordCount: number;
}

export interface TextNodeEntry {
  node: Text;
  globalStart: number;
  globalEnd: number;
}

export interface TextMapResult {
  entries: TextNodeEntry[];
  text: string;
}

export interface SentenceBoundary {
  text: string;
  startOffset: number;
  endOffset: number;
}

// === Playback Types ===

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused';

export interface PlaybackState {
  status: PlaybackStatus;
  currentChunkIndex: number;
  totalChunks: number;
  chunkProgress: number;
  currentTime: number;
  duration: number;
  speed: number;
  volume: number;
}

export interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  charStart: number;
  charEnd: number;
}

// === Theme ===

export type ThemeMode = 'system' | 'light' | 'dark';

// === Settings Types ===

export interface HighlightSettings {
  wordColor: string | null;
  sentenceColor: string | null;
  wordEnabled: boolean;
  sentenceEnabled: boolean;
  autoScroll: boolean;
}

/** Resolved highlight settings — colors are always concrete strings, never null. */
export interface ResolvedHighlightSettings {
  wordColor: string;
  sentenceColor: string;
  wordEnabled: boolean;
  sentenceEnabled: boolean;
  autoScroll: boolean;
}

export interface PlaybackSettings {
  defaultSpeed: number;
  defaultVolume: number;
  bufferSize: number;
  autoScrollEnabled: boolean;
  skipReferences: boolean;
}

export interface AppSettings {
  /** @deprecated Use activeProviderGroup instead. Kept for migration only. */
  activeProviderId?: string | null;
  activeProviderGroup: string | null;
  activeVoiceId: string | null;
  playback: PlaybackSettings;
  highlight: HighlightSettings;
  theme: ThemeMode;
  themeColor: string | null;
  onboardingComplete: boolean;
}

// === Provider Usage ===

export interface ProviderUsage {
  characterCount: number;
  characterLimit: number;
  nextResetUnix: number;
}

// === Page Info ===

export interface PageInfo {
  wordCount: number;
  title: string;
  isPlaying: boolean;
  currentChunk: number;
  totalChunks: number;
}
