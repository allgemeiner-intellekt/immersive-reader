export interface AccentVars {
  accent: string;
  accentHover: string;
  accentSubtle: string;
  shadowGlow: string;
  accentGlow: string;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}

export function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const factor = 1 - amount;
  return rgbToHex(r * factor, g * factor, b * factor);
}

export function deriveAccentVars(
  hex: string,
  theme: 'light' | 'dark',
): AccentVars {
  const [r, g, b] = hexToRgb(hex);
  const isDark = theme === 'dark';

  return {
    accent: hex,
    accentHover: darkenHex(hex, 0.15),
    accentSubtle: `rgba(${r}, ${g}, ${b}, ${isDark ? 0.1 : 0.08})`,
    shadowGlow: `0 0 20px rgba(${r}, ${g}, ${b}, ${isDark ? 0.25 : 0.2})`,
    accentGlow: `rgba(${r}, ${g}, ${b}, ${isDark ? 0.3 : 0.25})`,
  };
}

/** Default accent hex when no themeColor is set. */
const DEFAULT_ACCENT = '#3b82f6';

/**
 * Derive highlight colors from a hex accent color.
 * Word color = 35% opacity, sentence color = 8% opacity.
 */
export function highlightColorsFromAccent(hex: string | null): {
  wordColor: string;
  sentenceColor: string;
} {
  const [r, g, b] = hexToRgb(hex ?? DEFAULT_ACCENT);
  return {
    wordColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
    sentenceColor: `rgba(${r}, ${g}, ${b}, 0.08)`,
  };
}

import type { HighlightSettings, ResolvedHighlightSettings } from './types';

/**
 * Resolve highlight settings — replaces null colors with accent-derived values.
 */
export function resolveHighlightSettings(
  highlight: HighlightSettings,
  themeColor: string | null,
): ResolvedHighlightSettings {
  const accent = highlightColorsFromAccent(themeColor);
  return {
    ...highlight,
    wordColor: highlight.wordColor ?? accent.wordColor,
    sentenceColor: highlight.sentenceColor ?? accent.sentenceColor,
  };
}
