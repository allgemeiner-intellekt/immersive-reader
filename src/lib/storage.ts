import type { ProviderConfig, AppSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';

const PROVIDERS_KEY = 'ir-providers';
const SETTINGS_KEY = 'ir-settings';

// === Provider Config Storage ===

export async function getProviders(): Promise<ProviderConfig[]> {
  const result = await chrome.storage.local.get(PROVIDERS_KEY);
  return result[PROVIDERS_KEY] ?? [];
}

export async function saveProvider(config: ProviderConfig): Promise<void> {
  const providers = await getProviders();
  const index = providers.findIndex((p) => p.id === config.id);
  if (index >= 0) {
    providers[index] = config;
  } else {
    providers.push(config);
  }
  await chrome.storage.local.set({ [PROVIDERS_KEY]: providers });
}

export async function deleteProvider(configId: string): Promise<void> {
  const providers = await getProviders();
  const filtered = providers.filter((p) => p.id !== configId);
  await chrome.storage.local.set({ [PROVIDERS_KEY]: filtered });

  // If the deleted provider was active, clear active
  const settings = await getSettings();
  if (settings.activeProviderId === configId) {
    await saveSettings({ ...settings, activeProviderId: null, activeVoiceId: null });
  }
}

export async function getActiveProvider(): Promise<ProviderConfig | null> {
  const settings = await getSettings();
  if (!settings.activeProviderId) return null;
  const providers = await getProviders();
  return providers.find((p) => p.id === settings.activeProviderId) ?? null;
}

export async function setActiveProvider(configId: string, voiceId?: string): Promise<void> {
  const settings = await getSettings();
  settings.activeProviderId = configId;
  if (voiceId) settings.activeVoiceId = voiceId;
  await saveSettings(settings);
}

// === App Settings Storage ===

export async function getSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// === Key Masking Utility ===

export function maskKey(key: string): string {
  if (!key || key.length < 8) return '••••••••';
  return '••••' + key.slice(-4);
}

// === ID Generation ===

export function generateId(): string {
  return crypto.randomUUID();
}
