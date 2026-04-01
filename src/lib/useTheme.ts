import { useEffect } from 'react';
import { getSettings } from './storage';
import { applyTheme, watchTheme } from './theme';
import type { ThemeMode } from './types';

const SETTINGS_KEY = 'ir-settings';

export function useTheme(): void {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function init() {
      const settings = await getSettings();
      applyTheme(settings.theme);
      cleanup = watchTheme(settings.theme, () => applyTheme(settings.theme));
    }
    init();

    const handler = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[SETTINGS_KEY]?.newValue) {
        const newTheme: ThemeMode = changes[SETTINGS_KEY].newValue.theme ?? 'system';
        applyTheme(newTheme);
        cleanup?.();
        cleanup = watchTheme(newTheme, () => applyTheme(newTheme));
      }
    };
    chrome.storage.onChanged.addListener(handler);

    return () => {
      cleanup?.();
      chrome.storage.onChanged.removeListener(handler);
    };
  }, []);
}
