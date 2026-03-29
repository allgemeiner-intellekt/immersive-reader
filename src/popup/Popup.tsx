import React, { useState, useEffect, useCallback } from 'react';
import { MSG, sendMessage } from '@shared/messages';
import type { PlaybackState, ProviderConfig, AppSettings, PageInfo } from '@shared/types';
import { getProviders, getSettings, saveSettings, getActiveProvider } from '@shared/storage';
import { SPEED_MIN, SPEED_MAX, SPEED_STEP } from '@shared/constants';

const SPEED_CHIPS = [1, 1.25, 1.5, 2];

const DEFAULT_PLAYBACK: PlaybackState = {
  status: 'idle',
  currentChunkIndex: 0,
  totalChunks: 0,
  chunkProgress: 0,
  currentTime: 0,
  duration: 0,
  speed: 1,
  volume: 1,
};

export function Popup() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProvider, setActiveProvider] = useState<ProviderConfig | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>(DEFAULT_PLAYBACK);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);

  // Load initial data
  useEffect(() => {
    (async () => {
      const [provs, sett, active] = await Promise.all([
        getProviders(),
        getSettings(),
        getActiveProvider(),
      ]);
      setProviders(provs);
      setSettings(sett);
      setActiveProvider(active);
    })();
  }, []);

  // Poll playback state
  useEffect(() => {
    const poll = async () => {
      try {
        const state = await sendMessage<PlaybackState>({ type: MSG.GET_STATE });
        if (state && state.status) setPlayback(state);
      } catch {
        /* SW not ready */
      }
    };
    poll();
    const id = setInterval(poll, 500);
    return () => clearInterval(id);
  }, []);

  // Get page info from active tab
  useEffect(() => {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const info = await chrome.tabs.sendMessage(tab.id, { type: MSG.GET_PAGE_INFO });
          if (info) setPageInfo(info as PageInfo);
        }
      } catch {
        /* content script not loaded */
      }
    })();
  }, []);

  // Listen for storage changes
  useEffect(() => {
    const handler = () => {
      (async () => {
        const [provs, sett, active] = await Promise.all([
          getProviders(),
          getSettings(),
          getActiveProvider(),
        ]);
        setProviders(provs);
        setSettings(sett);
        setActiveProvider(active);
      })();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const openOptions = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  const handlePlay = useCallback(() => {
    if (playback.status === 'paused') {
      sendMessage({ type: MSG.RESUME });
    } else if (playback.status === 'playing') {
      sendMessage({ type: MSG.PAUSE });
    } else {
      sendMessage({ type: MSG.PLAY });
    }
  }, [playback.status]);

  const handleStop = useCallback(() => {
    sendMessage({ type: MSG.STOP });
  }, []);

  const handleSkipBack = useCallback(() => {
    sendMessage({ type: MSG.SKIP_BACKWARD });
  }, []);

  const handleSkipForward = useCallback(() => {
    sendMessage({ type: MSG.SKIP_FORWARD });
  }, []);

  const handleSpeedChange = useCallback(
    async (speed: number) => {
      sendMessage({ type: MSG.SET_SPEED, speed });
      setPlayback((prev) => ({ ...prev, speed }));
      if (settings) {
        const updated = { ...settings, playback: { ...settings.playback, defaultSpeed: speed } };
        await saveSettings(updated);
        setSettings(updated);
      }
    },
    [settings],
  );

  const handleVolumeChange = useCallback(
    async (volume: number) => {
      sendMessage({ type: MSG.SET_VOLUME, volume });
      setPlayback((prev) => ({ ...prev, volume }));
      if (settings) {
        const updated = {
          ...settings,
          playback: { ...settings.playback, defaultVolume: volume },
        };
        await saveSettings(updated);
        setSettings(updated);
      }
    },
    [settings],
  );

  const handleProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      const prov = providers.find((p) => p.id === id);
      if (prov) {
        sendMessage({ type: MSG.SET_ACTIVE_PROVIDER, configId: prov.id });
        setActiveProvider(prov);
      }
    },
    [providers],
  );

  const speed = playback.speed ?? settings?.playback.defaultSpeed ?? 1;
  const volume = playback.volume ?? settings?.playback.defaultVolume ?? 1;
  const isPlaying = playback.status === 'playing';
  const isPaused = playback.status === 'paused';
  const isActive = isPlaying || isPaused;

  const truncate = (s: string, max: number) =>
    s.length > max ? s.slice(0, max - 1) + '\u2026' : s;

  return (
    <div className="popup">
      {/* Header */}
      <header className="popup-header">
        <h1 className="popup-title">Immersive Reader</h1>
        <button
          className="icon-btn"
          onClick={openOptions}
          title="Settings"
          aria-label="Open settings"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 13a3 3 0 100-6 3 3 0 000 6z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M16.5 10a6.5 6.5 0 01-.4 2.2l1.5 1.2-1.2 2-1.8-.6a6.5 6.5 0 01-1.9 1.1l-.3 1.9h-2.4l-.3-1.9a6.5 6.5 0 01-1.9-1.1l-1.8.6-1.2-2 1.5-1.2A6.5 6.5 0 013.5 10c0-.8.1-1.5.4-2.2L2.4 6.6l1.2-2 1.8.6A6.5 6.5 0 017.3 4.1L7.6 2.2H10l.3 1.9a6.5 6.5 0 011.9 1.1l1.8-.6 1.2 2-1.5 1.2c.3.7.4 1.4.4 2.2z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {/* Provider Selector */}
      <section className="popup-section">
        {providers.length === 0 ? (
          <button className="btn btn-primary full-width" onClick={openOptions}>
            Add a provider to get started
          </button>
        ) : (
          <select
            className="provider-select"
            value={activeProvider?.id ?? ''}
            onChange={handleProviderChange}
            aria-label="Select TTS provider"
          >
            <option value="" disabled>
              Select a provider
            </option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </section>

      {/* Transport Controls */}
      <section className="popup-section transport">
        <button
          className="transport-btn"
          onClick={handleSkipBack}
          title="Skip backward"
          aria-label="Skip backward"
          disabled={!isActive}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
          </svg>
        </button>
        <button
          className={`play-btn ${isPlaying ? 'playing' : ''}`}
          onClick={handlePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={!activeProvider}
        >
          {isPlaying ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </button>
        <button
          className="transport-btn"
          onClick={handleSkipForward}
          title="Skip forward"
          aria-label="Skip forward"
          disabled={!isActive}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
          </svg>
        </button>
        <button
          className="transport-btn stop-btn"
          onClick={handleStop}
          title="Stop"
          aria-label="Stop"
          disabled={!isActive}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      </section>

      {/* Speed Control */}
      <section className="popup-section">
        <div className="control-row">
          <label className="control-label">Speed</label>
          <span className="control-value">{speed.toFixed(2)}x</span>
        </div>
        <input
          type="range"
          className="slider"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={SPEED_STEP}
          value={speed}
          onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
          aria-label="Playback speed"
        />
        <div className="speed-chips">
          {SPEED_CHIPS.map((s) => (
            <button
              key={s}
              className={`chip ${speed === s ? 'active' : ''}`}
              onClick={() => handleSpeedChange(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </section>

      {/* Volume Control */}
      <section className="popup-section">
        <div className="control-row">
          <span className="volume-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5z" />
            </svg>
          </span>
          <input
            type="range"
            className="slider volume-slider"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            aria-label="Volume"
          />
          <span className="control-value volume-value">{Math.round(volume * 100)}%</span>
        </div>
      </section>

      {/* Page Info */}
      {pageInfo && (
        <section className="popup-section page-info">
          <div className="page-title" title={pageInfo.title}>
            {truncate(pageInfo.title || 'Untitled page', 50)}
          </div>
          <div className="page-meta">
            <span>{pageInfo.wordCount.toLocaleString()} words</span>
            {playback.totalChunks > 0 && (
              <span>
                Chunk {playback.currentChunkIndex + 1} / {playback.totalChunks}
              </span>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="popup-footer">
        <button className="link-btn" onClick={openOptions}>
          Settings
        </button>
      </footer>
    </div>
  );
}
