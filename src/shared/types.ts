export interface TTSSettings {
  apiUrl: string;
  apiKey: string;
  voice: string;
  speed: number;
  model: string;
}

export interface Segment {
  id: number;
  text: string;
  startOffset: number;
  endOffset: number;
  wordCount: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentSegmentIndex: number;
  totalSegments: number;
  segmentProgress: number;
  currentTime: number;
  duration: number;
  elapsedTime: number;
  estimatedTotalTime: number;
  completedSegmentsDuration: number;
}

export interface ExtractionResult {
  title: string;
  html: string;
  textContent: string;
  wordCount: number;
  sourceElement: Element | null;
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

export interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  charStart: number;
  charEnd: number;
}

export interface GlobalSentenceBoundary {
  text: string;
  startOffset: number;
  endOffset: number;
  segmentIndex: number;
  sentenceIndexInSegment: number;
}

export interface PageInfo {
  wordCount: number;
  isPlaying: boolean;
  title: string;
}
