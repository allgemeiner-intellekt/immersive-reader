import React from 'react';
import type { PlaybackState } from '@shared/types';

interface ProgressBarProps {
  playback: PlaybackState;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ProgressBar({ playback }: ProgressBarProps) {
  const { elapsedTime, estimatedTotalTime } = playback;

  // Time-based progress
  const overallProgress = estimatedTotalTime > 0
    ? (elapsedTime / estimatedTotalTime) * 100
    : 0;

  return (
    <div className="ir-progress-container">
      <div className="ir-progress-bar">
        <div
          className="ir-progress-fill"
          style={{ width: `${Math.min(100, overallProgress)}%` }}
        />
      </div>
      <span className="ir-time-display">
        {formatTime(elapsedTime)} / {formatTime(estimatedTotalTime)}
      </span>
    </div>
  );
}
