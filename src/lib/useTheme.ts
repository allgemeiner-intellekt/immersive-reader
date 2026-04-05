import { useEffect } from 'react';
import { getSettings } from './storage';
import { applyAccentColor, applyTheme, resolveTheme, watchTheme } from './theme';
import type { ThemeMode } from './types';

const SETTINGS_KEY = 'ir-settings';

export function useTheme(): void {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function init() {
      const settings = await getSettings();
      applyTheme(settings.theme, settings.themeColor);
      cleanup = watchTheme(settings.theme, (resolved) => {
        applyTheme(settings.theme, settings.themeColor);
      });
    }
    init();

    const handler = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[SETTINGS_KEY]?.newValue) {
        const newSettings = changes[SETTINGS_KEY].newValue;
        const newTheme: ThemeMode = newSettings.theme ?? 'system';
        const newColor: string | null = newSettings.themeColor ?? null;
        applyTheme(newTheme, newColor);
        cleanup?.();
        cleanup = watchTheme(newTheme, () => {
          applyAccentColor(newColor, resolveTheme(newTheme));
        });
      }
    };
    chrome.storage.onChanged.addListener(handler);

    return () => {
      cleanup?.();
      chrome.storage.onChanged.removeListener(handler);
    };
  }, []);
}
