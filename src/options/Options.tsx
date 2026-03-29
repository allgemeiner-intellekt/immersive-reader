import React, { useState, useEffect, useCallback } from 'react';
import type { ProviderConfig, Voice, AppSettings } from '@shared/types';
import { PROVIDER_LIST } from '@providers/registry';
import {
  getProviders,
  saveProvider,
  deleteProvider,
  getSettings,
  saveSettings,
  setActiveProvider,
  maskKey,
  generateId,
} from '@shared/storage';
import { DEFAULT_SETTINGS, SPEED_MIN, SPEED_MAX, SPEED_STEP } from '@shared/constants';
import { MSG, sendMessage } from '@shared/messages';

type Section = 'providers' | 'voices' | 'playback' | 'highlighting' | 'hotkeys' | 'advanced';

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: 'providers', label: 'Providers' },
  { id: 'voices', label: 'Voices' },
  { id: 'playback', label: 'Playback' },
  { id: 'highlighting', label: 'Highlighting' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'advanced', label: 'Advanced' },
];

const HIGHLIGHT_COLORS = [
  'rgba(59, 130, 246, 0.4)',
  'rgba(239, 68, 68, 0.4)',
  'rgba(34, 197, 94, 0.4)',
  'rgba(234, 179, 8, 0.4)',
  'rgba(168, 85, 247, 0.4)',
  'rgba(236, 72, 153, 0.4)',
];

const SENTENCE_COLORS = [
  'rgba(59, 130, 246, 0.1)',
  'rgba(239, 68, 68, 0.1)',
  'rgba(34, 197, 94, 0.1)',
  'rgba(234, 179, 8, 0.1)',
  'rgba(168, 85, 247, 0.1)',
  'rgba(236, 72, 153, 0.1)',
];

// --- Modal for Add/Edit Provider ---
interface ProviderFormData {
  providerId: string;
  name: string;
  apiKey: string;
  baseUrl: string;
}

const EMPTY_FORM: ProviderFormData = { providerId: 'openai', name: '', apiKey: '', baseUrl: '' };

export function Options() {
  const [section, setSection] = useState<Section>('providers');
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

  // Confirm reset
  const [confirmReset, setConfirmReset] = useState(false);

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

  // Fetch voices when section is voices
  useEffect(() => {
    if (section !== 'voices' || !settings.activeProviderId) return;
    const activeConfig = providers.find((p) => p.id === settings.activeProviderId);
    if (!activeConfig) return;

    setVoicesLoading(true);
    setVoicesError('');
    sendMessage<Voice[]>({ type: MSG.LIST_VOICES, providerId: activeConfig.id })
      .then((v) => {
        if (Array.isArray(v)) setVoices(v);
        else setVoices([]);
      })
      .catch((err: unknown) => {
        setVoicesError(err instanceof Error ? err.message : 'Failed to load voices');
        setVoices([]);
      })
      .finally(() => setVoicesLoading(false));
  }, [section, settings.activeProviderId, providers]);

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
    });
    setTestResult(null);
    setShowForm(true);
  };

  const handleSaveProvider = async () => {
    const config: ProviderConfig = {
      id: editingId ?? generateId(),
      providerId: form.providerId,
      name: form.name || PROVIDER_LIST.find((p) => p.id === form.providerId)?.name || form.providerId,
      apiKey: form.apiKey,
      baseUrl: form.baseUrl || undefined,
    };
    await saveProvider(config);

    // If first provider, set as active
    if (providers.length === 0) {
      await setActiveProvider(config.id);
    }
    setShowForm(false);
    await loadData();
  };

  const handleDeleteProvider = async (id: string) => {
    await deleteProvider(id);
    await loadData();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const config: ProviderConfig = {
        id: editingId ?? 'test',
        providerId: form.providerId,
        name: form.name,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl || undefined,
      };
      const ok = await sendMessage<boolean>({ type: MSG.VALIDATE_KEY, config });
      setTestResult(ok ? 'Connection successful!' : 'Connection failed.');
    } catch (err: unknown) {
      setTestResult(err instanceof Error ? err.message : 'Connection failed.');
    }
    setTesting(false);
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
    if (!settings.activeProviderId) return;
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
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <main className="content" role="main">
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
              {providers.map((p) => {
                const meta = PROVIDER_LIST.find((m) => m.id === p.providerId);
                const isActive = p.id === settings.activeProviderId;
                return (
                  <div key={p.id} className={`card ${isActive ? 'card-active' : ''}`}>
                    <div className="card-body">
                      <div className="card-title-row">
                        <strong>{p.name}</strong>
                        {isActive && <span className="badge">Active</span>}
                      </div>
                      <div className="card-meta">
                        {meta?.name ?? p.providerId} &middot; Key: {maskKey(p.apiKey)}
                      </div>
                    </div>
                    <div className="card-actions">
                      {!isActive && (
                        <button
                          className="btn btn-sm"
                          onClick={() => setActiveProvider(p.id).then(loadData)}
                        >
                          Set Active
                        </button>
                      )}
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
                      onChange={(e) =>
                        setForm({
                          ...form,
                          providerId: e.target.value,
                          name:
                            PROVIDER_LIST.find((p) => p.id === e.target.value)?.name ??
                            e.target.value,
                        })
                      }
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
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="My OpenAI key"
                    />
                  </label>

                  <label className="form-label">
                    API Key
                    <input
                      className="form-input"
                      type="password"
                      value={form.apiKey}
                      onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                      placeholder="sk-..."
                    />
                  </label>

                  {form.providerId === 'custom' && (
                    <label className="form-label">
                      Base URL
                      <input
                        className="form-input"
                        type="url"
                        value={form.baseUrl}
                        onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                        placeholder="https://api.example.com/v1"
                      />
                    </label>
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
                      disabled={testing || !form.apiKey}
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
                        disabled={!form.apiKey}
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
            {!settings.activeProviderId ? (
              <p className="empty-state">Select an active provider first to browse voices.</p>
            ) : voicesLoading ? (
              <p className="loading-text">Loading voices...</p>
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
              <label className="setting-row">
                <span className="setting-label">Default Speed</span>
                <span className="setting-value">{settings.playback.defaultSpeed.toFixed(2)}x</span>
              </label>
              <input
                type="range"
                className="slider"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={SPEED_STEP}
                value={settings.playback.defaultSpeed}
                onChange={(e) => updatePlayback({ defaultSpeed: parseFloat(e.target.value) })}
                aria-label="Default speed"
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

        {/* === Highlighting === */}
        {section === 'highlighting' && (
          <div className="section-content">
            <h1>Highlighting</h1>

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
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch ${settings.highlight.wordColor === c ? 'swatch-active' : ''}`}
                      style={{ background: c }}
                      onClick={() => updateHighlight({ wordColor: c })}
                      aria-label={`Select word highlight color ${c}`}
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
                  {SENTENCE_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch ${settings.highlight.sentenceColor === c ? 'swatch-active' : ''}`}
                      style={{ background: c }}
                      onClick={() => updateHighlight({ sentenceColor: c })}
                      aria-label={`Select sentence highlight color ${c}`}
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

        {/* === Hotkeys === */}
        {section === 'hotkeys' && (
          <div className="section-content">
            <h1>Keyboard Shortcuts</h1>
            <div className="hotkeys-list">
              {[
                ['Space', 'Play / Pause'],
                ['ArrowRight', 'Skip forward'],
                ['ArrowLeft', 'Skip backward'],
                ['+', 'Speed up'],
                ['-', 'Speed down'],
                ['Escape', 'Stop'],
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
