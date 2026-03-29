import React from 'react';

// --- SVG Icon Paths ---

const PLAY_PATH = 'M8 5v14l11-7z';
const PAUSE_PATH = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
const STOP_PATH = 'M6 6h12v12H6z';
const SKIP_FORWARD_PATH = 'M6 18l8.5-6L6 6v12zm2 0l6.5-6L8 6v12zM16 6v12h2V6h-2z';
const SKIP_BACKWARD_PATH = 'M6 6h2v12H6zm3.5 6l8.5 6V6z';
const CLOSE_PATH = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
const EXPAND_PATH = 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z';
const COLLAPSE_PATH = 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z';

interface IconProps {
  path: string;
  size?: number;
}

function Icon({ path, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={path} />
    </svg>
  );
}

// --- PlayPauseButton ---

interface PlayPauseButtonProps {
  isPlaying: boolean;
  isLoading: boolean;
  onClick: () => void;
  large?: boolean;
}

export function PlayPauseButton({ isPlaying, isLoading, onClick, large }: PlayPauseButtonProps) {
  const size = large ? 40 : 32;
  const iconSize = large ? 24 : 20;

  return (
    <button
      className={`ir-btn ir-play-pause ${large ? 'ir-play-pause--large' : ''}`}
      onClick={onClick}
      disabled={isLoading}
      title={isPlaying ? 'Pause' : 'Play'}
      style={{ width: size, height: size }}
    >
      {isLoading ? (
        <span className="ir-spinner" />
      ) : (
        <Icon path={isPlaying ? PAUSE_PATH : PLAY_PATH} size={iconSize} />
      )}
    </button>
  );
}

// --- SkipButton ---

interface SkipButtonProps {
  direction: 'forward' | 'backward';
  onClick: () => void;
}

export function SkipButton({ direction, onClick }: SkipButtonProps) {
  return (
    <button
      className="ir-btn ir-skip"
      onClick={onClick}
      title={direction === 'forward' ? 'Skip forward' : 'Skip backward'}
    >
      <Icon path={direction === 'forward' ? SKIP_FORWARD_PATH : SKIP_BACKWARD_PATH} size={18} />
    </button>
  );
}

// --- SpeedChip ---

interface SpeedChipProps {
  speed: number;
  onClick: () => void;
}

export function SpeedChip({ speed, onClick }: SpeedChipProps) {
  const label = speed % 1 === 0 ? `${speed}x` : `${speed}x`;
  return (
    <button className="ir-btn ir-speed-chip" onClick={onClick} title="Change speed">
      {label}
    </button>
  );
}

// --- VolumeSlider ---

interface VolumeSliderProps {
  volume: number;
  onChange: (volume: number) => void;
}

export function VolumeSlider({ volume, onChange }: VolumeSliderProps) {
  return (
    <div className="ir-volume">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>
      <input
        type="range"
        className="ir-volume-slider"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        title={`Volume: ${Math.round(volume * 100)}%`}
      />
    </div>
  );
}

// --- ProgressBar ---

interface ProgressBarProps {
  progress: number; // 0-1
  chunkIndex: number;
  totalChunks: number;
}

export function ProgressBar({ progress, chunkIndex, totalChunks }: ProgressBarProps) {
  // Overall progress: completed chunks + current chunk progress
  const overallProgress =
    totalChunks > 0 ? (chunkIndex + progress) / totalChunks : 0;

  return (
    <div className="ir-progress" title={`Chunk ${chunkIndex + 1} of ${totalChunks}`}>
      <div
        className="ir-progress-fill"
        style={{ width: `${Math.min(overallProgress * 100, 100)}%` }}
      />
    </div>
  );
}

// --- CloseButton ---

interface CloseButtonProps {
  onClick: () => void;
}

export function CloseButton({ onClick }: CloseButtonProps) {
  return (
    <button className="ir-btn ir-close" onClick={onClick} title="Close">
      <Icon path={CLOSE_PATH} size={16} />
    </button>
  );
}

// --- StopButton ---

interface StopButtonProps {
  onClick: () => void;
}

export function StopButton({ onClick }: StopButtonProps) {
  return (
    <button className="ir-btn ir-stop" onClick={onClick} title="Stop">
      <Icon path={STOP_PATH} size={18} />
    </button>
  );
}

// --- ExpandButton ---

interface ExpandButtonProps {
  expanded: boolean;
  onClick: () => void;
}

export function ExpandButton({ expanded, onClick }: ExpandButtonProps) {
  return (
    <button className="ir-btn ir-expand" onClick={onClick} title={expanded ? 'Collapse' : 'Expand'}>
      <Icon path={expanded ? COLLAPSE_PATH : EXPAND_PATH} size={16} />
    </button>
  );
}
