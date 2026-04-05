import React, { useCallback, useEffect, useMemo } from 'react';
import {
  SPEED_DEFAULT_MIN,
  SPEED_DEFAULT_MAX,
  SPEED_STEP,
  snapSpeed,
  filterPresetsForRange,
  formatSpeed,
  getProviderSpeedRange,
} from './constants';

interface SpeedSliderProps {
  value: number;
  onChange: (speed: number) => void;
  providerId: string | null;
  showChips?: boolean;
  /** CSS class prefix: "ir-panel" for content script, undefined for popup/options */
  variant?: 'panel' | 'popup' | 'settings';
}

const CHIP_PRESETS = [0.75, 1, 1.25, 1.5, 2];

export function SpeedSlider({
  value,
  onChange,
  providerId,
  showChips = true,
  variant = 'panel',
}: SpeedSliderProps) {
  const range = useMemo(() => getProviderSpeedRange(providerId), [providerId]);

  const effectiveMin = range ? range.min : SPEED_DEFAULT_MIN;
  const effectiveMax = range ? range.max : SPEED_DEFAULT_MAX;

  const presets = useMemo(
    () => filterPresetsForRange(effectiveMin, effectiveMax),
    [effectiveMin, effectiveMax],
  );

  const chipPresets = useMemo(
    () => CHIP_PRESETS.filter((p) => p >= effectiveMin && p <= effectiveMax),
    [effectiveMin, effectiveMax],
  );

  // Clamp value when provider changes and current value is out of range
  useEffect(() => {
    const clamped = Math.min(Math.max(value, effectiveMin), effectiveMax);
    if (clamped !== value) {
      onChange(clamped);
    }
    // Only run on provider change, not on every value change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = parseFloat(e.target.value);
      const snapped = snapSpeed(raw, presets);
      onChange(snapped);
    },
    [presets, onChange],
  );

  const fillPercent = ((value - effectiveMin) / (effectiveMax - effectiveMin)) * 100;

  // Class names vary by variant
  const cls = variantClasses[variant];

  return (
    <>
      <div className={cls.row}>
        <label className={cls.label}>Speed</label>
        <span className={cls.valueLabel}>{formatSpeed(value)}</span>
      </div>
      <input
        type="range"
        className={cls.slider}
        min={effectiveMin}
        max={effectiveMax}
        step={SPEED_STEP}
        value={value}
        onChange={handleSliderChange}
        aria-label="Playback speed"
        style={{ '--fill': `${fillPercent}%` } as React.CSSProperties}
      />
      {showChips && chipPresets.length > 0 && (
        <div className={cls.chips}>
          {chipPresets.map((s) => (
            <button
              key={s}
              className={`${cls.chip} ${value === s ? cls.chipActive : ''}`}
              onClick={() => onChange(s)}
            >
              {formatSpeed(s)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const variantClasses = {
  panel: {
    row: 'ir-panel-row',
    label: 'ir-panel-label',
    valueLabel: 'ir-panel-value',
    slider: 'ir-panel-slider',
    chips: 'ir-panel-chips',
    chip: 'ir-panel-chip',
    chipActive: 'ir-panel-chip--active',
  },
  popup: {
    row: 'control-row',
    label: 'control-label',
    valueLabel: 'control-value',
    slider: 'slider',
    chips: 'speed-chips',
    chip: 'chip',
    chipActive: 'active',
  },
  settings: {
    row: 'setting-row',
    label: 'setting-label',
    valueLabel: 'setting-value',
    slider: 'slider',
    chips: 'speed-chips',
    chip: 'chip',
    chipActive: 'active',
  },
};
