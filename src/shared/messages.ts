export const MSG = {
  // Content → Service Worker → Offscreen
  PLAY_SEGMENT: 'PLAY_SEGMENT',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  STOP: 'STOP',
  SET_SPEED: 'SET_SPEED',
  PREFETCH_SEGMENT: 'PREFETCH_SEGMENT',
  SEEK_TO_TIME: 'SEEK_TO_TIME',

  // Offscreen → Service Worker → Content
  PLAYBACK_PROGRESS: 'PLAYBACK_PROGRESS',
  SEGMENT_COMPLETE: 'SEGMENT_COMPLETE',
  PLAYBACK_ERROR: 'PLAYBACK_ERROR',

  // Content ↔ Popup
  GET_PAGE_INFO: 'GET_PAGE_INFO',
  START_READING: 'START_READING',
} as const;

export type MessageType = (typeof MSG)[keyof typeof MSG];

export interface PlaySegmentMessage {
  type: typeof MSG.PLAY_SEGMENT;
  text: string;
  segmentId: number;
  settings: {
    apiUrl: string;
    apiKey: string;
    voice: string;
    speed: number;
    model: string;
  };
}

export interface PrefetchSegmentMessage {
  type: typeof MSG.PREFETCH_SEGMENT;
  text: string;
  segmentId: number;
  settings: {
    apiUrl: string;
    apiKey: string;
    voice: string;
    speed: number;
    model: string;
  };
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

export interface SetSpeedMessage {
  type: typeof MSG.SET_SPEED;
  speed: number;
}

export interface PlaybackProgressMessage {
  type: typeof MSG.PLAYBACK_PROGRESS;
  currentTime: number;
  duration: number;
  segmentId: number;
  durationFinal: boolean;
}

export interface SegmentCompleteMessage {
  type: typeof MSG.SEGMENT_COMPLETE;
  segmentId: number;
}

export interface PlaybackErrorMessage {
  type: typeof MSG.PLAYBACK_ERROR;
  error: string;
  segmentId: number;
}

export interface GetPageInfoMessage {
  type: typeof MSG.GET_PAGE_INFO;
}

export interface StartReadingMessage {
  type: typeof MSG.START_READING;
}

export interface SeekToTimeMessage {
  type: typeof MSG.SEEK_TO_TIME;
  time: number;
  segmentId: number;
}

export type ExtensionMessage =
  | PlaySegmentMessage
  | PrefetchSegmentMessage
  | PauseMessage
  | ResumeMessage
  | StopMessage
  | SetSpeedMessage
  | PlaybackProgressMessage
  | SegmentCompleteMessage
  | PlaybackErrorMessage
  | GetPageInfoMessage
  | StartReadingMessage
  | SeekToTimeMessage;
