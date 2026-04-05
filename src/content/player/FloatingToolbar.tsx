import React, { useRef, useEffect, useState } from 'react';
import { useToolbarStore } from '../state/store';
import {
  PlayPauseWithProgress,
  SkipButton,
  SpeedPopup,
  VolumeSlider,
  CloseButton,
  ExpandButton,
} from './ToolbarControls';
import { ExpandedPanel } from './ExpandedPanel';
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
    expanded,
    toastMessage,
    activeProviderId,
    play,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    setSpeed,
    setVolume,
    hideToolbar,
    toggleExpanded,
  } = useToolbarStore();

  const { getStyle, onMouseDown } = useDrag(toolbarRef);

  // Entrance animation: track when toolbar becomes visible
  const [animClass, setAnimClass] = useState('');
  const prevVisible = useRef(false);

  useEffect(() => {
    if (toolbarVisible && !prevVisible.current) {
      setAnimClass('ir-toolbar-enter');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimClass('ir-toolbar-enter ir-toolbar-enter-active');
        });
      });
    } else if (!toolbarVisible) {
      setAnimClass('');
    }
    prevVisible.current = toolbarVisible;
  }, [toolbarVisible]);

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
      className={`ir-toolbar ${expanded ? 'ir-toolbar--expanded' : 'ir-toolbar--collapsed'} ${animClass}`}
      style={getStyle()}
      onMouseDown={onMouseDown}
    >
      <div className="ir-toolbar-controls">
        <SkipButton direction="backward" onClick={skipBackward} />
        <PlayPauseWithProgress
          isPlaying={isPlaying}
          isLoading={isLoading}
          onClick={handlePlayPause}
          progress={chunkProgress}
          chunkIndex={currentChunkIndex}
          totalChunks={totalChunks}
        />
        <SkipButton direction="forward" onClick={skipForward} />
        <VolumeSlider volume={volume} onChange={setVolume} />
        <SpeedPopup speed={speed} onChangeSpeed={setSpeed} activeProviderId={activeProviderId} />
        <ExpandButton expanded={expanded} onClick={toggleExpanded} />
        <CloseButton onClick={handleClose} />
      </div>
      {expanded && <ExpandedPanel />}
    </div>
    </>
  );
}
