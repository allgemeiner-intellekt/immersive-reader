import type { ThemeMode } from './types';
import { deriveAccentVars } from './accent-colors';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function applyAccentColor(
  hex: string | null,
  resolvedTheme: 'light' | 'dark',
): void {
  const el = document.documentElement;
  if (!hex) {
    el.style.removeProperty('--accent');
    el.style.removeProperty('--accent-hover');
    el.style.removeProperty('--accent-subtle');
    el.style.removeProperty('--shadow-glow');
    return;
  }
  const vars = deriveAccentVars(hex, resolvedTheme);
  el.style.setProperty('--accent', vars.accent);
  el.style.setProperty('--accent-hover', vars.accentHover);
  el.style.setProperty('--accent-subtle', vars.accentSubtle);
  el.style.setProperty('--shadow-glow', vars.shadowGlow);
}

export function applyTheme(
  mode: ThemeMode,
  themeColor?: string | null,
): void {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.body.style.opacity = '1';
  applyAccentColor(themeColor ?? null, resolved);
}

export function watchTheme(
  mode: ThemeMode,
  callback: (resolved: 'light' | 'dark') => void,
): () => void {
  if (mode !== 'system' || typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => callback(mql.matches ? 'dark' : 'light');
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
