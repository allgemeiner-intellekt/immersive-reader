import React, { useEffect, useState } from 'react';
import { PlayerControls } from './PlayerControls';
import { ProgressBar } from './ProgressBar';
import { SpeedControl } from './SpeedControl';
import type { PlaybackState } from '@shared/types';
import playerCSS from './player.css?inline';

function formatError(error: string): string {
  if (error.includes('Network error') || error.includes('TypeError') || error.includes('Failed to fetch')) {
    return 'Cannot reach TTS server';
  }
  if (error.includes('401') || error.includes('Unauthorized')) {
    return 'Invalid API key';
  }
  if (error.includes('429') || error.includes('Too Many')) {
    return 'Rate limited — try again';
  }
  if (error.includes('500') || error.includes('Internal Server')) {
    return 'TTS server error';
  }
  if (error.length > 60) {
    return error.slice(0, 57) + '...';
  }
  return error;
}

interface FloatingPlayerProps {
  shadowRoot: ShadowRoot;
  playback: PlaybackState;
  error: string | null;
  onTogglePause: () => void;
  onSkipForward: () => void;
  onSkipBack: () => void;
  onStop: () => void;
  onStartReading: (fromSegment?: number) => void;
  onRetry: () => void;
  onDismissError: () => void;
}

export function FloatingPlayer({
  shadowRoot,
  playback,
  error,
  onTogglePause,
  onSkipForward,
  onSkipBack,
  onStop,
  onRetry,
  onDismissError,
}: FloatingPlayerProps) {
  const [styleInjected, setStyleInjected] = useState(false);

  useEffect(() => {
    // Inject styles into shadow DOM
    if (!shadowRoot.querySelector('#ir-player-styles')) {
      const style = document.createElement('style');
      style.id = 'ir-player-styles';
      style.textContent = playerCSS;
      shadowRoot.appendChild(style);
    }
    setStyleInjected(true);

    return () => {
      const style = shadowRoot.querySelector('#ir-player-styles');
      style?.remove();
    };
  }, [shadowRoot]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(onDismissError, 5000);
    return () => clearTimeout(timer);
  }, [error, onDismissError]);

  if (!styleInjected) return null;

  return (
    <div className="ir-player">
      {error && (
        <div className="ir-error-toast">
          <span className="ir-error-toast-msg">{formatError(error)}</span>
          <button className="ir-error-toast-btn" onClick={onRetry}>Retry</button>
          <button className="ir-error-toast-dismiss" onClick={onDismissError}>&times;</button>
        </div>
      )}
      <ProgressBar
        playback={playback}
        isPaused={playback.isPaused}
        onTogglePause={onTogglePause}
      />
      <PlayerControls
        onStop={onStop}
        onSkipBack={onSkipBack}
        onSkipForward={onSkipForward}
        canSkipBack={playback.currentSegmentIndex > 0}
        canSkipForward={playback.currentSegmentIndex < playback.totalSegments - 1}
      />
      <SpeedControl />
    </div>
  );
}
