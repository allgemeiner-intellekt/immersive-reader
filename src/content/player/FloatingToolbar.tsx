import React, { useRef } from 'react';
import { useToolbarStore } from '../state/store';
import {
  PlayPauseButton,
  SkipButton,
  SpeedChip,
  VolumeSlider,
  ProgressBar,
  CloseButton,
  StopButton,
  ExpandButton,
} from './ToolbarControls';
import { useDrag } from './useDrag';

export function FloatingToolbar() {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const {
    playbackStatus,
    currentChunkIndex,
    totalChunks,
    chunkProgress,
    speed,
    volume,
    toolbarVisible,
    toolbarExpanded,
    providerName,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    cycleSpeed,
    setVolume,
    toggleExpanded,
    hideToolbar,
  } = useToolbarStore();

  const { getStyle, onMouseDown } = useDrag(toolbarRef);

  if (!toolbarVisible) return null;

  const isPlaying = playbackStatus === 'playing';
  const isLoading = playbackStatus === 'loading';

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  const handleClose = () => {
    stop();
    hideToolbar();
  };

  if (toolbarExpanded) {
    return (
      <div
        ref={toolbarRef}
        className="ir-toolbar ir-toolbar--expanded"
        style={getStyle()}
        onMouseDown={onMouseDown}
      >
        {/* Collapsed-like top row */}
        <div className="ir-collapsed-row">
          <PlayPauseButton
            isPlaying={isPlaying}
            isLoading={isLoading}
            onClick={handlePlayPause}
          />
          <ProgressBar
            progress={chunkProgress}
            chunkIndex={currentChunkIndex}
            totalChunks={totalChunks}
          />
          <SpeedChip speed={speed} onClick={cycleSpeed} />
          <CloseButton onClick={handleClose} />
          <ExpandButton expanded={toolbarExpanded} onClick={toggleExpanded} />
        </div>

        {/* Transport controls */}
        <div className="ir-expanded-transport">
          <SkipButton direction="backward" onClick={skipBackward} />
          <PlayPauseButton
            isPlaying={isPlaying}
            isLoading={isLoading}
            onClick={handlePlayPause}
            large
          />
          <SkipButton direction="forward" onClick={skipForward} />
        </div>

        {/* Volume + progress */}
        <div className="ir-expanded-controls">
          <VolumeSlider volume={volume} onChange={setVolume} />
          <ProgressBar
            progress={chunkProgress}
            chunkIndex={currentChunkIndex}
            totalChunks={totalChunks}
          />
        </div>

        {/* Footer: provider info + stop */}
        <div className="ir-expanded-footer">
          {providerName ? (
            <span className="ir-provider-label">{providerName}</span>
          ) : (
            <span />
          )}
          <StopButton onClick={handleClose} />
        </div>
      </div>
    );
  }

  // Collapsed state
  return (
    <div
      ref={toolbarRef}
      className="ir-toolbar ir-toolbar--collapsed"
      style={getStyle()}
      onMouseDown={onMouseDown}
    >
      <PlayPauseButton
        isPlaying={isPlaying}
        isLoading={isLoading}
        onClick={handlePlayPause}
      />
      <ProgressBar
        progress={chunkProgress}
        chunkIndex={currentChunkIndex}
        totalChunks={totalChunks}
      />
      <SpeedChip speed={speed} onClick={cycleSpeed} />
      <CloseButton onClick={handleClose} />
      <ExpandButton expanded={toolbarExpanded} onClick={toggleExpanded} />
    </div>
  );
}
