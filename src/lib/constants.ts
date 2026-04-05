import type { AppSettings, ThemeMode } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  activeProviderGroup: null,
  activeVoiceId: null,
  theme: 'system' as ThemeMode,
  themeColor: null,
  playback: {
    defaultSpeed: 1.0,
    defaultVolume: 1.0,
    bufferSize: 2, // prefetch 2 chunks ahead
    autoScrollEnabled: true,
    skipReferences: false,
  },
  highlight: {
    wordColor: null, // null = follow accent color
    sentenceColor: null, // null = follow accent color
    wordEnabled: true,
    sentenceEnabled: true,
    autoScroll: true,
  },
  onboardingComplete: false,
};

export const THEME_COLOR_PRESETS = [
  '#3b82f6', // Blue (default)
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
];

export const SPEED_DEFAULT_MIN = 0.5;
export const SPEED_DEFAULT_MAX = 2.0;
export const SPEED_STEP = 0.01;
export const SPEED_SNAP_THRESHOLD = 0.04;
export const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export interface SpeedRange {
  min: number;
  max: number;
}

export const PROVIDER_SPEED_RANGES: Record<string, SpeedRange | null> = {
  openai: { min: 0.5, max: 2.0 },
  groq: { min: 0.5, max: 2.0 },
  elevenlabs: { min: 0.7, max: 1.2 },
  mimo: null,
  custom: { min: 0.5, max: 2.0 },
};

export function getProviderSpeedRange(providerId: string | null): SpeedRange | null {
  if (!providerId) return null;
  return PROVIDER_SPEED_RANGES[providerId] ?? null;
}

export function snapSpeed(
  raw: number,
  presets: number[],
  threshold = SPEED_SNAP_THRESHOLD,
): number {
  for (const preset of presets) {
    if (Math.abs(raw - preset) <= threshold) return preset;
  }
  return Math.round(raw * 100) / 100;
}

export function filterPresetsForRange(min: number, max: number): number[] {
  return SPEED_PRESETS.filter((p) => p >= min && p <= max);
}

export function formatSpeed(s: number): string {
  if (Number.isInteger(s)) return `${s}x`;
  // Quarter values like 1.25, 1.5, 1.75 — no trailing zeros
  const rounded = Math.round(s * 100) / 100;
  const str = String(rounded);
  return `${str}x`;
}

export const CHUNK_MIN_WORDS = 5;
export const CHUNK_MAX_WORDS = 50;
export const CHUNK_TARGET_WORDS = 20;

export const PROGRESS_REPORT_INTERVAL_MS = 100;
export const LOOKAHEAD_BUFFER_SIZE = 2;
export const FIRST_AUDIO_TARGET_MS = 400;
