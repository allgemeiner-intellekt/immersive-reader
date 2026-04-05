import React, { useState, useEffect, useCallback } from 'react';
import type { ProviderConfig, Voice, AppSettings, ProviderUsage, ThemeMode } from '@shared/types';
import { PROVIDER_LIST } from '@providers/registry';
import { ELEVENLABS_MODELS } from '@providers/elevenlabs';
import {
  getProviders,
  saveProvider,
  deleteProvider,
  getSettings,
  saveSettings,
  setActiveProviderGroup,
  getProviderGroupKey,
  maskKey,
  generateId,
} from '@shared/storage';
import { DEFAULT_SETTINGS, THEME_COLOR_PRESETS } from '@shared/constants';
import { highlightColorsFromAccent } from '@shared/accent-colors';
import { SpeedSlider } from '@shared/SpeedSlider';
import { MSG, sendMessage } from '@shared/messages';
import { useTheme } from '@shared/useTheme';
import type { ConfigHealth } from '../background/failover';

type Section = 'appearance' | 'providers' | 'voices' | 'playback' | 'hotkeys' | 'advanced';

// Inline SVG icon paths for nav (16x16, stroke-based)
const NAV_ICONS: Record<Section, string> = {
  appearance: 'M12 3a6 6 0 00-6 6c0 7 6 9 6 9s6-2 6-9a6 6 0 00-6-6z',
  providers: 'M7 11l5-5m0 0v4m0-4H8M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  voices: 'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zm-7 8v1a7 7 0 0014 0v-1m-7 8v4',
  playback: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z',
  hotkeys: 'M6 13h12M6 17h12M6 9h12M4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z',
  advanced: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'providers', label: 'Providers' },
  { id: 'voices', label: 'Voices' },
  { id: 'playback', label: 'Playback' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'advanced', label: 'Advanced' },
];

// Extra highlight color overrides (beyond the accent-derived default)
const EXTRA_WORD_COLORS = [
  'rgba(239, 68, 68, 0.35)',
  'rgba(34, 197, 94, 0.35)',
  'rgba(234, 179, 8, 0.35)',
  'rgba(168, 85, 247, 0.35)',
  'rgba(236, 72, 153, 0.35)',
];

const EXTRA_SENTENCE_COLORS = [
  'rgba(239, 68, 68, 0.08)',
  'rgba(34, 197, 94, 0.08)',
  'rgba(234, 179, 8, 0.08)',
  'rgba(168, 85, 247, 0.08)',
  'rgba(236, 72, 153, 0.08)',
];

// --- Modal for Add/Edit Provider ---
interface ProviderFormData {
  providerId: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  modelId: string;
  customModel: string;
}

const EMPTY_FORM: ProviderFormData = { providerId: 'openai', name: '', apiKey: '', baseUrl: '', modelId: 'eleven_multilingual_v2', customModel: 'tts-1' };

function nextFormState(current: ProviderFormData, partial: Partial<ProviderFormData>): ProviderFormData {
  return { ...current, ...partial };
}

function getFormProviderConfig(
  form: ProviderFormData,
  editingId: string | null,
): ProviderConfig {
  const trimmedProviderId = form.providerId.trim();
  const trimmedName = form.name.trim();
  const config: ProviderConfig = {
    id: editingId ?? generateId(),
    providerId: trimmedProviderId,
    name: trimmedName || PROVIDER_LIST.find((p) => p.id === trimmedProviderId)?.name || trimmedProviderId,
    apiKey: form.apiKey.trim(),
    baseUrl: form.baseUrl.trim() || undefined,
  };
  if (trimmedProviderId === 'elevenlabs') {
    config.extraParams = { model_id: form.modelId };
  } else if (trimmedProviderId === 'custom' && form.customModel.trim()) {
    config.extraParams = { model: form.customModel.trim() };
  }
  return config;
}

function describeVoiceLoadError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error && typeof error === 'object') {
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch {
      // Fall back to a generic string below.
    }
  }
  return 'Failed to load voices (no response from background service).';
}

export function Options() {
  useTheme();
  const [section, setSection] = useState<Section>('appearance');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState('');

  // Provider form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderFormData>(EMPTY_FORM);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // Health state
  const [healthMap, setHealthMap] = useState<Record<string, ConfigHealth>>({});

  // Confirm reset
  const [confirmReset, setConfirmReset] = useState(false);
  const requiresBaseUrl = form.providerId === 'custom';
  const canTestConnection = Boolean(form.apiKey.trim() && (!requiresBaseUrl || form.baseUrl.trim()));
  const canSaveProvider = Boolean(form.apiKey.trim() && (!requiresBaseUrl || form.baseUrl.trim()));

  // Load data
  const loadData = useCallback(async () => {
    const [provs, sett] = await Promise.all([getProviders(), getSettings()]);
    setProviders(provs);
    setSettings(sett);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for storage changes
  useEffect(() => {
    const handler = () => {
      loadData();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [loadData]);

  // Fetch voices when section is voices — use the first config in the active group
  useEffect(() => {
    if (section !== 'voices' || !settings.activeProviderGroup) return;
    const activeConfig = providers.find(
      (p) => getProviderGroupKey(p) === settings.activeProviderGroup,
    );
    if (!activeConfig) return;

    setVoicesLoading(true);
    setVoicesError('');
    sendMessage<Voice[] | { error?: string }>({ type: MSG.LIST_VOICES, providerId: activeConfig.id })
      .then((response) => {
        if (Array.isArray(response)) {
          setVoices(response);
          return;
        }

        const errorMessage =
          response && typeof response === 'object' && 'error' in response
            ? response.error
            : undefined;
        setVoices([]);
        setVoicesError(describeVoiceLoadError(errorMessage ?? response));
      })
      .catch((err: unknown) => {
        setVoicesError(describeVoiceLoadError(err));
        setVoices([]);
      })
      .finally(() => setVoicesLoading(false));
  }, [section, settings.activeProviderGroup, providers]);

  // Poll provider health when on the providers section
  useEffect(() => {
    if (section !== 'providers') return;

    const fetchHealth = () => {
      sendMessage<Record<string, ConfigHealth>>({ type: MSG.GET_PROVIDER_HEALTH })
        .then(setHealthMap)
        .catch(() => {});
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 10_000);
    return () => clearInterval(interval);
  }, [section]);

  // Poll ElevenLabs usage when on the providers section
  const [usageMap, setUsageMap] = useState<Record<string, ProviderUsage | { error: string }>>({});

  useEffect(() => {
    if (section !== 'providers') return;

    const elevenLabsConfigs = providers.filter((p) => p.providerId === 'elevenlabs');
    if (elevenLabsConfigs.length === 0) return;

    const fetchUsage = () => {
      elevenLabsConfigs.forEach((config) => {
        sendMessage<ProviderUsage | { error: string }>({
          type: MSG.GET_PROVIDER_USAGE,
          configId: config.id,
        })
          .then((result) => {
            setUsageMap((prev) => ({ ...prev, [config.id]: result }));
          })
          .catch(() => {});
      });
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 60_000);
    return () => clearInterval(interval);
  }, [section, providers]);

  // --- Provider CRUD ---
  const openAddForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTestResult(null);
    setShowForm(true);
  };

  const openEditForm = (config: ProviderConfig) => {
    setEditingId(config.id);
    setForm({
      providerId: config.providerId,
      name: config.name,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? '',
      modelId: (config.extraParams?.model_id as string) ?? 'eleven_multilingual_v2',
      customModel: (config.extraParams?.model as string) ?? 'tts-1',
    });
    setTestResult(null);
    setShowForm(true);
  };

  const handleSaveProvider = async () => {
    const config = getFormProviderConfig(form, editingId);
    await saveProvider(config);

    // If first provider, set its group as active
    if (providers.length === 0) {
      await setActiveProviderGroup(getProviderGroupKey(config));
    }
    setShowForm(false);
    await loadData();
  };

  const handleDeleteProvider = async (id: string) => {
    await deleteProvider(id);
    await loadData();
  };

  const handleResetHealth = async (configId: string) => {
    await sendMessage({ type: MSG.RESET_PROVIDER_HEALTH, configId } as never);
    setHealthMap((prev) => {
      const next = { ...prev };
      delete next[configId];
      return next;
    });
  };

  const handleTestConnection = async () => {
    if (requiresBaseUrl && !form.baseUrl.trim()) {
      setTestResult('Base URL is required for a custom provider.');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const config = getFormProviderConfig(form, editingId ?? 'test');
      const ok = await sendMessage<boolean>({ type: MSG.VALIDATE_KEY, config });
      setTestResult(ok ? 'Connection successful!' : 'Connection failed.');
    } catch (err: unknown) {
      setTestResult(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setTesting(false);
    }
  };

  // --- Settings helpers ---
  const updatePlayback = async (partial: Partial<typeof settings.playback>) => {
    const updated = { ...settings, playback: { ...settings.playback, ...partial } };
    setSettings(updated);
    await saveSettings(updated);
  };

  const updateHighlight = async (partial: Partial<typeof settings.highlight>) => {
    const updated = { ...settings, highlight: { ...settings.highlight, ...partial } };
    setSettings(updated);
    await saveSettings(updated);
  };

  const handleSelectVoice = async (voiceId: string) => {
    if (!settings.activeProviderGroup) return;
    const updated = { ...settings, activeVoiceId: voiceId };
    setSettings(updated);
    await saveSettings(updated);
  };

  const handleResetSettings = async () => {
    await saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
    setConfirmReset(false);
  };

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify({ providers, settings }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'immersive-reader-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.settings && typeof data.settings === 'object') {
          const merged = { ...DEFAULT_SETTINGS, ...data.settings };
          await saveSettings(merged);
          setSettings(merged);
        }
        if (Array.isArray(data.providers)) {
          await chrome.storage.local.set({ 'ir-providers': data.providers });
          setProviders(data.providers);
        }
      } catch {
        alert('Failed to import settings. Please check the file is valid JSON.');
      }
    };
    input.click();
  };

  return (
    <div className="options-layout">
      {/* Sidebar */}
      <nav className="sidebar" role="navigation" aria-label="Settings sections">
        <h2 className="sidebar-title">Immersive Reader</h2>
        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                className={`nav-item ${section === item.id ? 'active' : ''}`}
                onClick={() => setSection(item.id)}
              >
                <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={NAV_ICONS[item.id]} />
                </svg>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <main className="content" role="main">
        {/* === Appearance === */}
        {section === 'appearance' && (
          <div className="section-content">
            <h1>Appearance</h1>
            <div className="settings-card">
              <div className="setting-row">
                <span className="setting-label">Theme</span>
              </div>
              <div className="theme-options">
                {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`btn ${settings.theme === mode ? 'btn-primary' : ''}`}
                    onClick={() => saveSettings({ ...settings, theme: mode }).then(() => setSettings({ ...settings, theme: mode }))}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {mode === 'system' ? 'System' : mode === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
              <p className="setting-desc" style={{ marginTop: '12px' }}>
                {settings.theme === 'system'
                  ? 'Follows your operating system preference.'
                  : settings.theme === 'light'
                    ? 'Always use light theme.'
                    : 'Always use dark theme.'}
              </p>
            </div>
            <div className="settings-card">
              <div className="setting-row">
                <span className="setting-label">Accent color</span>
              </div>
              <div className="color-swatches">
                {THEME_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    className={`swatch${(settings.themeColor ?? '#3b82f6') === c ? ' swatch-active' : ''}`}
                    style={{ background: c }}
                    onClick={() => {
                      const updated = { ...settings, themeColor: c };
                      saveSettings(updated).then(() => setSettings(updated));
                    }}
                    aria-label="Select accent color"
                  />
                ))}
              </div>
              <p className="setting-desc" style={{ marginTop: '12px' }}>
                Controls the color of buttons, toggles, and other UI elements.
                Highlight colors follow the accent by default.
              </p>
            </div>

            <div className="settings-card">
              <label className="setting-row toggle-row">
                <span className="setting-label">Word highlighting</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.highlight.wordEnabled}
                  onChange={(e) => updateHighlight({ wordEnabled: e.target.checked })}
                />
              </label>
              {settings.highlight.wordEnabled && (
                <div className="color-swatches">
                  <button
                    className={`swatch${settings.highlight.wordColor === null ? ' swatch-active' : ''}`}
                    style={{ background: highlightColorsFromAccent(settings.themeColor).wordColor }}
                    onClick={() => updateHighlight({ wordColor: null })}
                    aria-label="Follow accent color"
                    title="Follow accent"
                  />
                  {EXTRA_WORD_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch${settings.highlight.wordColor === c ? ' swatch-active' : ''}`}
                      style={{ background: c }}
                      onClick={() => updateHighlight({ wordColor: c })}
                      aria-label="Select word highlight color"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="settings-card">
              <label className="setting-row toggle-row">
                <span className="setting-label">Sentence highlighting</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.highlight.sentenceEnabled}
                  onChange={(e) => updateHighlight({ sentenceEnabled: e.target.checked })}
                />
              </label>
              {settings.highlight.sentenceEnabled && (
                <div className="color-swatches">
                  <button
                    className={`swatch${settings.highlight.sentenceColor === null ? ' swatch-active' : ''}`}
                    style={{ background: highlightColorsFromAccent(settings.themeColor).sentenceColor }}
                    onClick={() => updateHighlight({ sentenceColor: null })}
                    aria-label="Follow accent color"
                    title="Follow accent"
                  />
                  {EXTRA_SENTENCE_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch${settings.highlight.sentenceColor === c ? ' swatch-active' : ''}`}
                      style={{ background: c }}
                      onClick={() => updateHighlight({ sentenceColor: c })}
                      aria-label="Select sentence highlight color"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="settings-card">
              <label className="setting-row toggle-row">
                <span className="setting-label">Auto-scroll to highlighted text</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.highlight.autoScroll}
                  onChange={(e) => updateHighlight({ autoScroll: e.target.checked })}
                />
              </label>
            </div>
          </div>
        )}

        {/* === Providers === */}
        {section === 'providers' && (
          <div className="section-content">
            <div className="section-header">
              <h1>Providers</h1>
              <button className="btn btn-primary" onClick={openAddForm}>
                Add Provider
              </button>
            </div>

            {providers.length === 0 && !showForm && (
              <p className="empty-state">No providers configured. Add one to get started.</p>
            )}

            <div className="card-list">
              {(() => {
                // Group providers by providerId (+ baseUrl for custom)
                const groups = new Map<string, ProviderConfig[]>();
                for (const p of providers) {
                  const key = getProviderGroupKey(p);
                  const group = groups.get(key) ?? [];
                  group.push(p);
                  groups.set(key, group);
                }

                return Array.from(groups.entries()).map(([groupKey, groupProviders]) => {
                  const meta = PROVIDER_LIST.find((m) => m.id === groupProviders[0].providerId);
                  const isGroupActive = settings.activeProviderGroup === groupKey;
                  const healthyCount = groupProviders.filter(
                    (p) => !healthMap[p.id] || healthMap[p.id].status === 'healthy',
                  ).length;

                  return (
                    <React.Fragment key={groupKey}>
                      <div className="provider-group-header">
                        <span>
                          {meta?.name ?? groupProviders[0].providerId}
                          {groupProviders.length > 1 && (
                            <> ({groupProviders.length} keys &mdash; {healthyCount} healthy)</>
                          )}
                        </span>
                        {isGroupActive ? (
                          <span className="badge">Active</span>
                        ) : (
                          <button
                            className="btn btn-sm"
                            onClick={() =>
                              setActiveProviderGroup(groupKey).then(loadData)
                            }
                          >
                            Set Active
                          </button>
                        )}
                      </div>
                      {groupProviders.map((p) => {
                        const provMeta = PROVIDER_LIST.find((m) => m.id === p.providerId);
                        const health = healthMap[p.id];
                        const healthStatus = health?.status ?? 'healthy';

                        return (
                          <div
                            key={p.id}
                            className={`card ${isGroupActive ? 'card-active' : ''}`}
                          >
                            <div className="card-body">
                              <div className="card-title-row">
                                <span className={`health-dot health-dot--${healthStatus}`} />
                                <strong>{p.name}</strong>
                              </div>
                              <div className="card-meta">
                                {provMeta?.name ?? p.providerId} &middot; Key: {maskKey(p.apiKey)}
                              </div>
                              {healthStatus === 'cooldown' && health?.cooldownUntil && (
                                <div className="health-info">
                                  Cooling down &mdash; retrying in{' '}
                                  {Math.max(
                                    0,
                                    Math.ceil((health.cooldownUntil - Date.now()) / 1000),
                                  )}
                                  s
                                </div>
                              )}
                              {healthStatus === 'failed' && (
                                <div className="health-info">
                                  Failed: {health?.lastError?.message ?? 'Unknown error'}
                                  <button
                                    className="btn btn-sm"
                                    onClick={() => handleResetHealth(p.id)}
                                  >
                                    Reset
                                  </button>
                                </div>
                              )}
                              {p.providerId === 'elevenlabs' && (() => {
                                const usage = usageMap[p.id];
                                if (!usage) return null;
                                if ('error' in usage) {
                                  return <div className="usage-text">{usage.error}</div>;
                                }
                                const pct = usage.characterLimit > 0
                                  ? (usage.characterCount / usage.characterLimit) * 100
                                  : 0;
                                const level = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok';
                                const daysUntilReset = Math.max(
                                  0,
                                  Math.ceil((usage.nextResetUnix * 1000 - Date.now()) / 86_400_000),
                                );
                                return (
                                  <div className="usage-section">
                                    <div className="usage-bar">
                                      <div
                                        className={`usage-fill usage-fill--${level}`}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                      />
                                    </div>
                                    <div className="usage-text">
                                      {usage.characterCount.toLocaleString()} / {usage.characterLimit.toLocaleString()} characters
                                      {' '}&middot; Resets in {daysUntilReset}d
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="card-actions">
                              <button className="btn btn-sm" onClick={() => openEditForm(p)}>
                                Edit
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => handleDeleteProvider(p.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                });
              })()}
            </div>

            {/* Add/Edit Modal */}
            {showForm && (
              <div className="modal-overlay" onClick={() => setShowForm(false)}>
                <div
                  className="modal"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-label={editingId ? 'Edit provider' : 'Add provider'}
                >
                  <h2>{editingId ? 'Edit Provider' : 'Add Provider'}</h2>

                  <label className="form-label">
                    Provider Type
                    <select
                      className="form-select"
                      value={form.providerId}
                      onChange={(e) => {
                        setTestResult(null);
                        setForm(
                          nextFormState(form, {
                            providerId: e.target.value,
                            name:
                              PROVIDER_LIST.find((p) => p.id === e.target.value)?.name ??
                              e.target.value,
                            baseUrl: e.target.value === 'custom' ? form.baseUrl : '',
                          }),
                        );
                      }}
                    >
                      {PROVIDER_LIST.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} &mdash; {p.description}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-label">
                    Display Name
                    <input
                      className="form-input"
                      type="text"
                      value={form.name}
                      onChange={(e) => {
                        setTestResult(null);
                        setForm(nextFormState(form, { name: e.target.value }));
                      }}
                      placeholder="My OpenAI key"
                    />
                  </label>

                  <label className="form-label">
                    API Key
                    <input
                      className="form-input"
                      type="password"
                      value={form.apiKey}
                      onChange={(e) => {
                        setTestResult(null);
                        setForm(nextFormState(form, { apiKey: e.target.value }));
                      }}
                      placeholder="sk-..."
                    />
                  </label>

                  {form.providerId === 'elevenlabs' && (
                    <label className="form-label">
                      Model
                      <select
                        className="form-select"
                        value={form.modelId}
                        onChange={(e) => {
                          setTestResult(null);
                          setForm(nextFormState(form, { modelId: e.target.value }));
                        }}
                      >
                        {ELEVENLABS_MODELS.map((m) => (
                          <option key={m.modelId} value={m.modelId}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {form.providerId === 'custom' && (
                    <>
                      <label className="form-label">
                        Base URL
                        <input
                          className="form-input"
                          type="url"
                          value={form.baseUrl}
                          onChange={(e) => {
                            setTestResult(null);
                            setForm(nextFormState(form, { baseUrl: e.target.value }));
                          }}
                          placeholder="https://api.example.com/v1"
                        />
                      </label>
                      <label className="form-label">
                        Model
                        <input
                          className="form-input"
                          type="text"
                          value={form.customModel}
                          onChange={(e) => {
                            setTestResult(null);
                            setForm(nextFormState(form, { customModel: e.target.value }));
                          }}
                          placeholder="tts-1"
                        />
                      </label>
                    </>
                  )}

                  {testResult && (
                    <div
                      className={`test-result ${testResult.includes('successful') ? 'success' : 'error'}`}
                    >
                      {testResult}
                    </div>
                  )}

                  <div className="modal-actions">
                    <button
                      className="btn"
                      onClick={handleTestConnection}
                      disabled={testing || !canTestConnection}
                    >
                      {testing ? 'Testing...' : 'Test Connection'}
                    </button>
                    <div className="modal-actions-right">
                      <button className="btn" onClick={() => setShowForm(false)}>
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={handleSaveProvider}
                        disabled={!canSaveProvider}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === Voices === */}
        {section === 'voices' && (
          <div className="section-content">
            <h1>Voices</h1>
            {!settings.activeProviderGroup ? (
              <p className="empty-state">Select an active provider group first to browse voices.</p>
            ) : voicesLoading ? (
              <div>
                <div className="skeleton skeleton-card" />
                <div className="skeleton skeleton-card" />
                <div className="skeleton skeleton-card" />
              </div>
            ) : voicesError ? (
              <p className="error-text">{voicesError}</p>
            ) : voices.length === 0 ? (
              <p className="empty-state">No voices available for this provider.</p>
            ) : (
              <div className="card-list">
                {voices.map((v) => {
                  const isActive = v.id === settings.activeVoiceId;
                  return (
                    <div
                      key={v.id}
                      className={`card card-clickable ${isActive ? 'card-active' : ''}`}
                      onClick={() => handleSelectVoice(v.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectVoice(v.id);
                        }
                      }}
                    >
                      <div className="card-body">
                        <div className="card-title-row">
                          <strong>{v.name}</strong>
                          {isActive && <span className="badge">Active</span>}
                        </div>
                        <div className="card-meta">
                          {[v.language, v.gender].filter(Boolean).join(' \u00B7 ') || v.id}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* === Playback === */}
        {section === 'playback' && (
          <div className="section-content">
            <h1>Playback</h1>

            <div className="settings-card">
              <SpeedSlider
                value={settings.playback.defaultSpeed}
                onChange={(speed) => updatePlayback({ defaultSpeed: speed })}
                providerId={
                  settings.activeProviderGroup
                    ? settings.activeProviderGroup.includes(':')
                      ? settings.activeProviderGroup.split(':')[0]
                      : settings.activeProviderGroup
                    : null
                }
                showChips={false}
                variant="settings"
              />
            </div>

            <div className="settings-card">
              <label className="setting-row">
                <span className="setting-label">Default Volume</span>
                <span className="setting-value">
                  {Math.round(settings.playback.defaultVolume * 100)}%
                </span>
              </label>
              <input
                type="range"
                className="slider"
                min={0}
                max={1}
                step={0.05}
                value={settings.playback.defaultVolume}
                onChange={(e) => updatePlayback({ defaultVolume: parseFloat(e.target.value) })}
                aria-label="Default volume"
                style={{ '--fill': `${settings.playback.defaultVolume * 100}%` } as React.CSSProperties}
              />
            </div>

            <div className="settings-card">
              <label className="setting-row toggle-row">
                <span className="setting-label">Auto-scroll with reading</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.playback.autoScrollEnabled}
                  onChange={(e) => updatePlayback({ autoScrollEnabled: e.target.checked })}
                />
              </label>
            </div>

            <div className="settings-card">
              <label className="setting-row toggle-row">
                <span className="setting-label">Skip references section</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.playback.skipReferences}
                  onChange={(e) => updatePlayback({ skipReferences: e.target.checked })}
                />
              </label>
            </div>
          </div>
        )}

        {/* === Hotkeys === */}
        {section === 'hotkeys' && (
          <div className="section-content">
            <h1>Keyboard Shortcuts</h1>
            <div className="hotkeys-list">
              {[
                ['Alt+Shift+Space', 'Play / Pause'],
                ['Alt+Shift+Right', 'Skip forward'],
                ['Alt+Shift+Left', 'Skip backward'],
              ].map(([key, desc]) => (
                <div key={key} className="hotkey-row">
                  <kbd className="hotkey-key">{key}</kbd>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === Advanced === */}
        {section === 'advanced' && (
          <div className="section-content">
            <h1>Advanced</h1>

            <div className="settings-card">
              <p className="setting-desc">Export all settings and provider configs as JSON.</p>
              <button className="btn" onClick={exportSettings}>
                Export Settings
              </button>
            </div>

            <div className="settings-card">
              <p className="setting-desc">Import settings and provider configs from a previously exported JSON file.</p>
              <button className="btn" onClick={importSettings}>
                Import Settings
              </button>
            </div>

            <div className="settings-card">
              <p className="setting-desc">Re-run the onboarding wizard to set up providers and preferences.</p>
              <button
                className="btn"
                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })}
              >
                Replay Onboarding
              </button>
            </div>

            <div className="settings-card">
              <p className="setting-desc">
                Reset all settings to defaults. This will not delete saved providers.
              </p>
              {confirmReset ? (
                <div className="confirm-row">
                  <span>Are you sure?</span>
                  <button className="btn btn-danger" onClick={handleResetSettings}>
                    Yes, reset
                  </button>
                  <button className="btn" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
                  Reset All Settings
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
