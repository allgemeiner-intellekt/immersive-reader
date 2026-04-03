import React, { useCallback, useRef } from 'react';

// --- SVG Icon Paths ---

const PLAY_PATH = 'M8 5v14l11-7z';
const PAUSE_PATH = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
const SKIP_FORWARD_PATH = 'M6 18l8.5-6L6 6v12zm2 0l6.5-6L8 6v12zM16 6v12h2V6h-2z';
const SKIP_BACKWARD_PATH = 'M6 6h2v12H6zm3.5 6l8.5 6V6z';
const CLOSE_PATH = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

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
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    onClick();
    const el = btnRef.current;
    if (el) {
      const cls = direction === 'forward' ? 'ir-skip--nudge-forward' : 'ir-skip--nudge-backward';
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 150);
    }
  }, [direction, onClick]);

  return (
    <button
      ref={btnRef}
      className="ir-btn ir-skip"
      onClick={handleClick}
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
        style={{ '--fill': `${volume * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}

// --- PlayPauseWithProgress (circular progress ring around play/pause) ---

interface PlayPauseWithProgressProps {
  isPlaying: boolean;
  isLoading: boolean;
  onClick: () => void;
  progress: number; // 0-1
  chunkIndex: number;
  totalChunks: number;
}

const RING_SIZE = 40;
const STROKE_WIDTH = 2.5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PlayPauseWithProgress({
  isPlaying,
  isLoading,
  onClick,
  progress,
  chunkIndex,
  totalChunks,
}: PlayPauseWithProgressProps) {
  const overallProgress =
    totalChunks > 0 ? Math.min((chunkIndex + progress) / totalChunks, 1) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - overallProgress);

  return (
    <div
      className="ir-play-progress-wrap"
      title={`Segment ${chunkIndex + 1} of ${totalChunks}`}
    >
      <svg
        className="ir-progress-ring"
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      >
        <circle
          className="ir-progress-ring__track"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          className="ir-progress-ring__fill"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <button
        className={`ir-btn ir-play-pause${isPlaying ? ' ir-playing' : ''}`}
        onClick={onClick}
        disabled={isLoading}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isLoading ? (
          <span className="ir-spinner" />
        ) : (
          <Icon path={isPlaying ? PAUSE_PATH : PLAY_PATH} size={20} />
        )}
      </button>
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

// --- ExpandButton ---

interface ExpandButtonProps {
  expanded: boolean;
  onClick: () => void;
}

export function ExpandButton({ expanded, onClick }: ExpandButtonProps) {
  return (
    <button
      className={`ir-btn ir-expand${expanded ? ' ir-expand--open' : ''}`}
      onClick={onClick}
      title={expanded ? 'Collapse' : 'Expand'}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className="ir-expand-icon"
      >
        <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
      </svg>
    </button>
  );
}
