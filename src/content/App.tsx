import React, { useEffect, useRef, useCallback } from 'react';
import { FloatingPlayer } from './player/FloatingPlayer';
import { useStore } from './state/store';
import { MSG, type ExtensionMessage } from '@shared/messages';
import type { PageInfo, TextMapResult, GlobalSentenceBoundary } from '@shared/types';
import { WORDS_PER_MINUTE } from '@shared/constants';
import { extractContent } from './extraction/extractor';
import { segmentText } from './extraction/segmenter';
import { splitSentences } from './extraction/sentence-splitter';
import { buildTextNodeMap } from './highlighting/dom-mapper';
import { Highlighter } from './highlighting/highlighter';
import { SentenceClickHandler } from './highlighting/sentence-click-handler';
import { findArticleRoot } from './extraction/generic';

import { saveReadingProgress } from '@shared/storage';

interface AppProps {
  shadowRoot: ShadowRoot;
}

export function App({ shadowRoot }: AppProps) {
  const playback = useStore((s) => s.playback);
  const error = useStore((s) => s.error);
  const setPlayback = useStore((s) => s.setPlayback);
  const setSegments = useStore((s) => s.setSegments);
  const setTextNodeMap = useStore((s) => s.setTextNodeMap);
  const highlighterRef = useRef<Highlighter | null>(null);
  const sentenceClickHandlerRef = useRef<SentenceClickHandler | null>(null);
  const globalSentencesRef = useRef<GlobalSentenceBoundary[]>([]);
  const totalWordsRef = useRef(0);
  const pendingAdvanceRef = useRef(false);

  const getSettings = useCallback(() => useStore.getState().settings, []);

  const sendPlaySegment = useCallback((segment: { text: string; id: number }, segmentIndex: number) => {
    highlighterRef.current?.activateSegment(segmentIndex);
    const settings = getSettings();
    chrome.runtime.sendMessage({
      type: MSG.PLAY_SEGMENT,
      text: segment.text,
      segmentId: segment.id,
      settings: {
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        voice: settings.voice,
        speed: settings.speed,
        model: settings.model,
      },
    }).catch(console.error);
  }, [getSettings]);

  const sendPrefetch = useCallback((segment: { text: string; id: number }) => {
    const settings = getSettings();
    chrome.runtime.sendMessage({
      type: MSG.PREFETCH_SEGMENT,
      text: segment.text,
      segmentId: segment.id,
      settings: {
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        voice: settings.voice,
        speed: settings.speed,
        model: settings.model,
      },
    }).catch(console.error);
  }, [getSettings]);

  const stopPlayback = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.STOP }).catch(console.error);
    highlighterRef.current?.deactivateAll();
    highlighterRef.current = null;
    sentenceClickHandlerRef.current?.destroy();
    sentenceClickHandlerRef.current = null;
    globalSentencesRef.current = [];
    pendingAdvanceRef.current = false;
    useStore.getState().setError(null);
    setPlayback({
      isPlaying: false,
      isPaused: false,
      currentSegmentIndex: 0,
      totalSegments: 0,
      segmentProgress: 0,
      currentTime: 0,
      duration: 0,
      elapsedTime: 0,
      estimatedTotalTime: 0,
      completedSegmentsDuration: 0,
    });
  }, [setPlayback]);

  const advanceToNextSegment = useCallback(() => {
    const store = useStore.getState();
    const { currentSegmentIndex, totalSegments, completedSegmentsDuration, duration } = store.playback;
    const segs = store.segments;
    const nextIndex = currentSegmentIndex + 1;

    highlighterRef.current?.deactivateSegment();

    if (nextIndex >= totalSegments) {
      stopPlayback();
      return;
    }

    // Accumulate completed segment duration
    const newCompletedDuration = completedSegmentsDuration + (duration > 0 ? duration : 0);

    // Re-estimate total time from average duration per word
    const completedWords = segs.slice(0, nextIndex).reduce((sum, s) => sum + s.wordCount, 0);
    let newEstimatedTotal = store.playback.estimatedTotalTime;
    if (completedWords > 0 && newCompletedDuration > 0) {
      const avgDurationPerWord = newCompletedDuration / completedWords;
      newEstimatedTotal = avgDurationPerWord * totalWordsRef.current;
    }

    setPlayback({
      currentSegmentIndex: nextIndex,
      segmentProgress: 0,
      currentTime: 0,
      duration: 0,
      completedSegmentsDuration: newCompletedDuration,
      elapsedTime: newCompletedDuration,
      estimatedTotalTime: newEstimatedTotal,
    });

    sendPlaySegment(segs[nextIndex], nextIndex);

    // Save reading progress
    saveReadingProgress({
      url: window.location.href,
      title: document.title,
      segmentIndex: nextIndex,
      totalSegments,
      timestamp: Date.now(),
    }).catch(console.error);

    // Prefetch next+1 segment
    if (nextIndex + 1 < segs.length) {
      sendPrefetch(segs[nextIndex + 1]);
    }
  }, [sendPlaySegment, sendPrefetch, setPlayback, stopPlayback]);

  const jumpToSentence = useCallback((sentence: GlobalSentenceBoundary) => {
    const store = useStore.getState();
    if (!store.playback.isPlaying) return;
    pendingAdvanceRef.current = false;

    const segs = store.segments;
    const { currentSegmentIndex } = store.playback;

    if (sentence.segmentIndex === currentSegmentIndex) {
      // Same segment: seek within audio
      const highlighter = highlighterRef.current;
      if (!highlighter) return;

      const wordTimings = highlighter.getWordTimings();
      const segment = segs[currentSegmentIndex];
      if (!segment || wordTimings.length === 0) return;

      // Find the word timing closest to the sentence start
      const sentenceLocalStart = sentence.startOffset - segment.startOffset;
      let seekTime = 0;
      for (const wt of wordTimings) {
        if (wt.charStart >= sentenceLocalStart) {
          seekTime = wt.startTime;
          break;
        }
      }

      // If paused, resume playback so audio actually plays after seeking
      if (store.playback.isPaused) {
        chrome.runtime.sendMessage({ type: MSG.RESUME }).catch(console.error);
        setPlayback({ isPaused: false });
      }

      chrome.runtime.sendMessage({
        type: MSG.SEEK_TO_TIME,
        time: seekTime,
        segmentId: segment.id,
      }).catch(console.error);

      // Update highlighter position
      highlighter.updateProgress(seekTime, store.playback.duration, store.playback.duration > 0);
    } else {
      // Different segment: start playback at that segment
      const targetIndex = sentence.segmentIndex;
      if (targetIndex < 0 || targetIndex >= segs.length) return;

      highlighterRef.current?.deactivateSegment();

      // Calculate completed duration up to target segment
      // (rough estimate: use average from what we know)
      const prevCompletedDuration = store.playback.completedSegmentsDuration;
      const prevIndex = store.playback.currentSegmentIndex;
      const completedWords = segs.slice(0, prevIndex).reduce((sum, s) => sum + s.wordCount, 0);
      let avgDurPerWord = 0;
      if (completedWords > 0 && prevCompletedDuration > 0) {
        avgDurPerWord = prevCompletedDuration / completedWords;
      }
      const targetCompletedWords = segs.slice(0, targetIndex).reduce((sum, s) => sum + s.wordCount, 0);
      const newCompletedDuration = avgDurPerWord > 0
        ? avgDurPerWord * targetCompletedWords
        : 0;

      setPlayback({
        isPaused: false,
        currentSegmentIndex: targetIndex,
        segmentProgress: 0,
        currentTime: 0,
        duration: 0,
        completedSegmentsDuration: newCompletedDuration,
        elapsedTime: newCompletedDuration,
      });

      sendPlaySegment(segs[targetIndex], targetIndex);

      if (targetIndex + 1 < segs.length) {
        sendPrefetch(segs[targetIndex + 1]);
      }
    }
  }, [setPlayback, sendPlaySegment, sendPrefetch]);

  const startReading = useCallback((fromSegmentIndex = 0, sourceElement?: Element) => {
    const store = useStore.getState();
    pendingAdvanceRef.current = false;

    // Clean up local UI — don't send STOP to offscreen because it races
    // with the PLAY_SEGMENT we're about to send. The offscreen's
    // playSegment() already calls cleanup() at the start.
    if (store.playback.isPlaying) {
      highlighterRef.current?.deactivateAll();
      sentenceClickHandlerRef.current?.destroy();
      sentenceClickHandlerRef.current = null;
    }

    // Clear any previous error
    store.setError(null);

    let rootElement: Element;

    if (sourceElement) {
      // Direct element playback (from injected button)
      rootElement = sourceElement;
    } else {
      // Full page extraction — use extractContent for Readability title/wordCount,
      // but get text from buildTextNodeMap for offset alignment
      const result = extractContent();
      if (!result) return;
      rootElement = result.sourceElement ?? findArticleRoot() ?? document.body;
    }

    // buildTextNodeMap is the single source of truth for text + offsets
    const mapResult: TextMapResult = buildTextNodeMap(rootElement);
    if (mapResult.text.trim().length === 0) return;

    const segs = segmentText(mapResult.text);
    if (segs.length === 0) return;

    setSegments(segs);
    setTextNodeMap(mapResult.entries);

    // Count total words
    const totalWords = segs.reduce((sum, s) => sum + s.wordCount, 0);
    totalWordsRef.current = totalWords;

    // Build global sentence map
    const globalSentences: GlobalSentenceBoundary[] = [];
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si];
      const sentences = splitSentences(seg.text, seg.startOffset);
      for (let ssi = 0; ssi < sentences.length; ssi++) {
        globalSentences.push({
          text: sentences[ssi].text,
          startOffset: sentences[ssi].startOffset,
          endOffset: sentences[ssi].endOffset,
          segmentIndex: si,
          sentenceIndexInSegment: ssi,
        });
      }
    }
    globalSentencesRef.current = globalSentences;

    highlighterRef.current = new Highlighter(mapResult.entries, segs);

    // Create sentence click handler
    sentenceClickHandlerRef.current = new SentenceClickHandler(
      rootElement,
      mapResult.entries,
      globalSentences,
      jumpToSentence
    );

    // Compute initial estimated total time
    const speed = store.settings.speed;
    const estimatedTotalTime = (totalWords / WORDS_PER_MINUTE) * 60 / speed;

    setPlayback({
      isPlaying: true,
      isPaused: false,
      currentSegmentIndex: fromSegmentIndex,
      totalSegments: segs.length,
      segmentProgress: 0,
      currentTime: 0,
      duration: 0,
      elapsedTime: 0,
      estimatedTotalTime,
      completedSegmentsDuration: 0,
    });

    sendPlaySegment(segs[fromSegmentIndex], fromSegmentIndex);

    if (fromSegmentIndex + 1 < segs.length) {
      sendPrefetch(segs[fromSegmentIndex + 1]);
    }
  }, [setSegments, setTextNodeMap, setPlayback, sendPlaySegment, sendPrefetch, jumpToSentence]);

  // Listen for messages from background - single stable listener
  useEffect(() => {
    const handler = (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean => {
      switch (message.type) {
        case MSG.PLAYBACK_PROGRESS: {
          const store = useStore.getState();
          const elapsedTime = store.playback.completedSegmentsDuration + message.currentTime;
          store.setPlayback({
            currentTime: message.currentTime,
            duration: message.duration,
            segmentProgress: message.duration > 0 ? message.currentTime / message.duration : 0,
            elapsedTime,
          });
          highlighterRef.current?.updateProgress(
            message.currentTime,
            message.duration,
            message.durationFinal
          );
          return false;
        }

        case MSG.SEGMENT_COMPLETE: {
          const store = useStore.getState();
          const currentSeg = store.segments[store.playback.currentSegmentIndex];
          if (currentSeg && message.segmentId !== currentSeg.id) {
            console.warn('Ignoring stale SEGMENT_COMPLETE for segment', message.segmentId);
            return false;
          }
          if (store.playback.isPaused) {
            pendingAdvanceRef.current = true;
          } else {
            advanceToNextSegment();
          }
          return false;
        }

        case MSG.PLAYBACK_ERROR: {
          const store = useStore.getState();
          const currentSeg = store.segments[store.playback.currentSegmentIndex];
          if (currentSeg && message.segmentId !== currentSeg.id) {
            console.warn('Ignoring stale PLAYBACK_ERROR for segment', message.segmentId);
            return false;
          }
          console.error('Playback error:', message.error);
          highlighterRef.current?.deactivateAll();
          store.setPlayback({ isPaused: true });
          store.setError(message.error);
          return false;
        }

        case MSG.GET_PAGE_INFO: {
          const result = extractContent();
          const store = useStore.getState();
          const info: PageInfo = {
            wordCount: result?.wordCount ?? 0,
            isPlaying: store.playback.isPlaying,
            title: result?.title ?? document.title,
          };
          sendResponse(info);
          return true;
        }

        case MSG.START_READING:
          startReading();
          return false;

        default:
          return false;
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, [advanceToNextSegment, startReading]);

  // Tab visibility: re-sync on return
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && highlighterRef.current) {
        const store = useStore.getState();
        if (store.playback.isPlaying && !store.playback.isPaused) {
          highlighterRef.current.updateProgress(
            store.playback.currentTime,
            store.playback.duration,
            true
          );
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const retryCurrentSegment = useCallback(() => {
    const store = useStore.getState();
    store.setError(null);
    const { currentSegmentIndex } = store.playback;
    const segs = store.segments;
    if (segs[currentSegmentIndex]) {
      store.setPlayback({ isPaused: false });
      highlighterRef.current?.activateSegment(currentSegmentIndex);
      sendPlaySegment(segs[currentSegmentIndex], currentSegmentIndex);
    }
  }, [sendPlaySegment]);

  const dismissError = useCallback(() => {
    useStore.getState().setError(null);
  }, []);

  const togglePause = useCallback(() => {
    const store = useStore.getState();
    if (store.playback.isPaused) {
      setPlayback({ isPaused: false });
      if (pendingAdvanceRef.current) {
        pendingAdvanceRef.current = false;
        advanceToNextSegment();
      } else {
        chrome.runtime.sendMessage({ type: MSG.RESUME }).catch(console.error);
      }
    } else {
      chrome.runtime.sendMessage({ type: MSG.PAUSE }).catch(console.error);
      setPlayback({ isPaused: true });
    }
  }, [setPlayback, advanceToNextSegment]);

  // Spacebar pause/resume
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      togglePause();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [togglePause]);

  const skipForward = useCallback(() => {
    advanceToNextSegment();
  }, [advanceToNextSegment]);

  const skipBack = useCallback(() => {
    const store = useStore.getState();
    const { currentSegmentIndex } = store.playback;
    const segs = store.segments;
    const prevIndex = Math.max(0, currentSegmentIndex - 1);

    highlighterRef.current?.deactivateSegment();

    setPlayback({
      currentSegmentIndex: prevIndex,
      segmentProgress: 0,
      currentTime: 0,
      duration: 0,
    });

    sendPlaySegment(segs[prevIndex], prevIndex);
  }, [setPlayback, sendPlaySegment]);

  if (!playback.isPlaying) return null;

  return (
    <FloatingPlayer
      shadowRoot={shadowRoot}
      playback={playback}
      error={error}
      onTogglePause={togglePause}
      onSkipForward={skipForward}
      onSkipBack={skipBack}
      onStop={stopPlayback}
      onStartReading={startReading}
      onRetry={retryCurrentSegment}
      onDismissError={dismissError}
    />
  );
}
