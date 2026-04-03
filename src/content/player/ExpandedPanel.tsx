import React, { useState, useEffect, useCallback } from 'react';
import { MSG, sendMessage } from '@shared/messages';
import type { ProviderConfig } from '@shared/types';
import { getProviders, getSettings, getActiveProvider, getProviderGroupKey } from '@shared/storage';
import { SPEED_MIN, SPEED_MAX, SPEED_STEP } from '@shared/constants';
import { useToolbarStore } from '../state/store';

const SPEED_CHIPS = [1, 1.25, 1.5, 2];

export function ExpandedPanel() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeGroupKey, setActiveGroupKey] = useState<string>('');
  const { speed, setSpeed, currentChunkIndex, totalChunks, chunkProgress } = useToolbarStore();

  useEffect(() => {
    (async () => {
      const [provs, active] = await Promise.all([getProviders(), getActiveProvider()]);
      setProviders(provs);
      if (active) setActiveGroupKey(getProviderGroupKey(active));
    })();
  }, []);

  useEffect(() => {
    const handler = () => {
      (async () => {
        const [provs, active] = await Promise.all([getProviders(), getActiveProvider()]);
        setProviders(provs);
        if (active) setActiveGroupKey(getProviderGroupKey(active));
      })();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const handleProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const groupKey = e.target.value;
      sendMessage({ type: MSG.SET_ACTIVE_PROVIDER, groupKey });
      setActiveGroupKey(groupKey);
    },
    [],
  );

  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      // Persist to settings
      getSettings().then((settings) => {
        const updated = { ...settings, playback: { ...settings.playback, defaultSpeed: newSpeed } };
        chrome.storage.local.set({ 'ir-settings': updated });
      });
    },
    [setSpeed],
  );

  const openSettings = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  // Build deduplicated provider options
  const providerOptions: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const p of providers) {
    const key = getProviderGroupKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    const count = providers.filter((q) => getProviderGroupKey(q) === key).length;
    const label = count > 1 ? `${p.name} (${count} keys)` : p.name;
    providerOptions.push({ key, label });
  }

  const overallProgress =
    totalChunks > 0 ? ((currentChunkIndex + chunkProgress) / totalChunks) * 100 : 0;

  return (
    <div className="ir-expanded-panel">
      {/* Provider Selector */}
      {providers.length > 0 && (
        <div className="ir-panel-row">
          <label className="ir-panel-label">Provider</label>
          <select
            className="ir-panel-select"
            value={activeGroupKey}
            onChange={handleProviderChange}
          >
            <option value="" disabled>Select a provider</option>
            {providerOptions.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Speed Slider */}
      <div className="ir-panel-row">
        <label className="ir-panel-label">Speed</label>
        <span className="ir-panel-value">{speed.toFixed(2)}x</span>
      </div>
      <input
        type="range"
        className="ir-panel-slider"
        min={SPEED_MIN}
        max={SPEED_MAX}
        step={SPEED_STEP}
        value={speed}
        onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
        style={{ '--fill': `${((speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100}%` } as React.CSSProperties}
      />
      <div className="ir-panel-chips">
        {SPEED_CHIPS.map((s) => (
          <button
            key={s}
            className={`ir-panel-chip ${speed === s ? 'ir-panel-chip--active' : ''}`}
            onClick={() => handleSpeedChange(s)}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Reading Progress */}
      {totalChunks > 0 && (
        <div className="ir-panel-progress">
          <span className="ir-panel-meta">
            Segment {currentChunkIndex + 1} / {totalChunks}
          </span>
          <div className="ir-panel-progress-bar">
            <div
              className="ir-panel-progress-fill"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Settings Button */}
      <button className="ir-panel-settings-btn" onClick={openSettings}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
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
        Settings
      </button>
    </div>
  );
}
