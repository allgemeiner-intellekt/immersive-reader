import React, { useRef } from 'react';
import { useToolbarStore } from '../state/store';
import {
  PlayPauseButton,
  SkipButton,
  SpeedChip,
  VolumeSlider,
  ProgressBar,
  CloseButton,
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
    toastMessage,
    play,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    cycleSpeed,
    setVolume,
    hideToolbar,
  } = useToolbarStore();

  const { getStyle, onMouseDown } = useDrag(toolbarRef);

  if (!toolbarVisible) return null;

  const isPlaying = playbackStatus === 'playing';
  const isLoading = playbackStatus === 'loading';

  const toast = toastMessage ? (
    <div className="ir-toast">{toastMessage}</div>
  ) : null;

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else if (playbackStatus === 'paused') {
      resume();
    } else {
      play();
    }
  };

  const handleClose = () => {
    stop();
    hideToolbar();
  };

  return (
    <>
    {toast}
    <div
      ref={toolbarRef}
      className="ir-toolbar ir-toolbar--collapsed"
      style={getStyle()}
      onMouseDown={onMouseDown}
    >
      <SkipButton direction="backward" onClick={skipBackward} />
      <PlayPauseButton
        isPlaying={isPlaying}
        isLoading={isLoading}
        onClick={handlePlayPause}
      />
      <SkipButton direction="forward" onClick={skipForward} />
      <ProgressBar
        progress={chunkProgress}
        chunkIndex={currentChunkIndex}
        totalChunks={totalChunks}
      />
      <VolumeSlider volume={volume} onChange={setVolume} />
      <SpeedChip speed={speed} onClick={cycleSpeed} />
      <CloseButton onClick={handleClose} />
    </div>
    </>
  );
}
