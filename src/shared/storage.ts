import type { TTSSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';

const SETTINGS_KEY = 'ir-settings';

export async function loadSettings(): Promise<TTSSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
}

export async function saveSettings(settings: TTSSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
