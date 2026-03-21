import React from 'react';

interface PlayerControlsProps {
  onStop: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  canSkipBack: boolean;
  canSkipForward: boolean;
}

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
  </svg>
);

const PrevIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <polygon points="11,2 5,7 11,12" fill="currentColor" />
    <rect x="2" y="2" width="2" height="10" rx="1" fill="currentColor" />
  </svg>
);

const NextIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <polygon points="3,2 9,7 3,12" fill="currentColor" />
    <rect x="10" y="2" width="2" height="10" rx="1" fill="currentColor" />
  </svg>
);

export function PlayerControls({ onStop, onSkipBack, onSkipForward, canSkipBack, canSkipForward }: PlayerControlsProps) {
  return (
    <div className="ir-controls-row">
      <button
        className="ir-btn ir-btn-nav"
        onClick={onSkipBack}
        aria-label="Previous"
        disabled={!canSkipBack}
      >
        <PrevIcon />
      </button>
      <button className="ir-btn ir-btn-stop" onClick={onStop} aria-label="Stop">
        <StopIcon />
      </button>
      <button
        className="ir-btn ir-btn-nav"
        onClick={onSkipForward}
        aria-label="Next"
        disabled={!canSkipForward}
      >
        <NextIcon />
      </button>
    </div>
  );
}
