import type { ProviderConfig, AppSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';

const PROVIDERS_KEY = 'ir-providers';
const SETTINGS_KEY = 'ir-settings';

// === Provider Group Key ===

/**
 * Compute the group key for a provider config.
 * Standard providers group by providerId; custom providers also include baseUrl.
 */
export function getProviderGroupKey(config: ProviderConfig): string {
  if (config.providerId === 'custom') {
    const normalized = (config.baseUrl || '').trim().replace(/\/+$/, '');
    return `custom:${normalized}`;
  }
  return config.providerId;
}

// === Provider Config Storage ===

export async function getProviders(): Promise<ProviderConfig[]> {
  const result = await chrome.storage.local.get(PROVIDERS_KEY);
  return result[PROVIDERS_KEY] ?? [];
}

export async function saveProvider(config: ProviderConfig): Promise<void> {
  const normalizedConfig: ProviderConfig = {
    ...config,
    name: config.name.trim(),
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl?.trim() || undefined,
  };
  const providers = await getProviders();
  const index = providers.findIndex((p) => p.id === normalizedConfig.id);
  if (index >= 0) {
    providers[index] = normalizedConfig;
  } else {
    providers.push(normalizedConfig);
  }
  await chrome.storage.local.set({ [PROVIDERS_KEY]: providers });
}

export async function deleteProvider(configId: string): Promise<void> {
  const providers = await getProviders();
  const toDelete = providers.find((p) => p.id === configId);
  const filtered = providers.filter((p) => p.id !== configId);
  await chrome.storage.local.set({ [PROVIDERS_KEY]: filtered });

  // If the deleted provider's group is now empty and was active, clear the active group
  if (toDelete) {
    const settings = await getSettings();
    const groupKey = getProviderGroupKey(toDelete);
    if (settings.activeProviderGroup === groupKey) {
      const remaining = filtered.filter((p) => getProviderGroupKey(p) === groupKey);
      if (remaining.length === 0) {
        await saveSettings({ ...settings, activeProviderGroup: null, activeVoiceId: null });
      }
    }
  }
}

/**
 * Get the active provider config — the first config in the active group.
 * Returns null if no group is active or no configs match.
 */
export async function getActiveProvider(): Promise<ProviderConfig | null> {
  const settings = await getSettings();
  if (!settings.activeProviderGroup) return null;
  const providers = await getProviders();
  return providers.find((p) => getProviderGroupKey(p) === settings.activeProviderGroup) ?? null;
}

/**
 * Get all provider configs in the active group.
 */
export async function getActiveGroupConfigs(): Promise<ProviderConfig[]> {
  const settings = await getSettings();
  if (!settings.activeProviderGroup) return [];
  const providers = await getProviders();
  return providers.filter((p) => getProviderGroupKey(p) === settings.activeProviderGroup);
}

/**
 * Set the active provider group.
 * @param groupKey — group key from getProviderGroupKey(), e.g. "openai", "elevenlabs", "custom:https://..."
 */
export async function setActiveProviderGroup(groupKey: string, voiceId?: string): Promise<void> {
  const settings = await getSettings();
  settings.activeProviderGroup = groupKey;
  if (voiceId) settings.activeVoiceId = voiceId;
  await saveSettings(settings);
}

// === App Settings Storage ===

export async function getSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const raw = { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };

  // Migrate legacy activeProviderId → activeProviderGroup
  if (raw.activeProviderId && !raw.activeProviderGroup) {
    const providers = await getProviders();
    const legacy = providers.find((p) => p.id === raw.activeProviderId);
    if (legacy) {
      raw.activeProviderGroup = getProviderGroupKey(legacy);
    }
    delete raw.activeProviderId;
    // Persist the migration
    await chrome.storage.local.set({ [SETTINGS_KEY]: raw });
  }

  return raw;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  // Strip legacy field on save
  const toSave = { ...settings };
  delete toSave.activeProviderId;
  await chrome.storage.local.set({ [SETTINGS_KEY]: toSave });
}

// === Reading Progress ===

export interface ReadingProgress {
  url: string;
  chunkIndex: number;
  totalChunks: number;
  timestamp: number;
}

const PROGRESS_PREFIX = 'ir-progress:';
const PROGRESS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  await chrome.storage.local.set({ [PROGRESS_PREFIX + progress.url]: progress });
}

export async function getProgress(url: string): Promise<ReadingProgress | null> {
  const result = await chrome.storage.local.get(PROGRESS_PREFIX + url);
  const data = result[PROGRESS_PREFIX + url] as ReadingProgress | undefined;
  if (!data) return null;
  if (Date.now() - data.timestamp > PROGRESS_MAX_AGE_MS) {
    await chrome.storage.local.remove(PROGRESS_PREFIX + url);
    return null;
  }
  return data;
}

export async function clearProgress(url: string): Promise<void> {
  await chrome.storage.local.remove(PROGRESS_PREFIX + url);
}

export async function cleanOldProgress(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter(
    (k) => k.startsWith(PROGRESS_PREFIX) && Date.now() - (all[k] as ReadingProgress).timestamp > PROGRESS_MAX_AGE_MS,
  );
  if (keysToRemove.length) await chrome.storage.local.remove(keysToRemove);
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
