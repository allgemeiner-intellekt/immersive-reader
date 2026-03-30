import { MSG, sendTabMessage } from '@shared/messages';

interface SimpleWordTiming {
  word: string;
  startTime: number;
  endTime: number;
}

// State for the current chunk's word timing
let currentTabId: number | null = null;
let currentChunkIndex = -1;
let currentWords: string[] = [];
let currentWordIndex = 0;
let currentRealTimings: SimpleWordTiming[] | null = null;
let audioDuration = 0;
// Pre-computed cumulative character fractions for weighted interpolation
let cumulativeCharFractions: number[] = [];

export function startWordTimingRelay(
  tabId: number,
  chunkIndex: number,
  chunkText: string,
  realTimings?: SimpleWordTiming[],
): void {
  stopWordTimingRelay();

  currentTabId = tabId;
  currentChunkIndex = chunkIndex;
  currentWords = chunkText.split(/\s+/).filter(Boolean);
  currentWordIndex = 0;
  audioDuration = 0;

  if (realTimings && realTimings.length > 0) {
    currentRealTimings = realTimings;
  } else {
    currentRealTimings = null;
  }

  // Pre-compute cumulative character fractions for weighted interpolation.
  // Each word's "weight" is its character count, so longer words get more time.
  const totalChars = currentWords.reduce((sum, w) => sum + w.length, 0);
  cumulativeCharFractions = [];
  let cumulative = 0;
  for (const w of currentWords) {
    cumulative += w.length / (totalChars || 1);
    cumulativeCharFractions.push(cumulative);
  }
}

export function stopWordTimingRelay(): void {
  currentTabId = null;
  currentChunkIndex = -1;
  currentWords = [];
  currentWordIndex = 0;
  currentRealTimings = null;
  audioDuration = 0;
  cumulativeCharFractions = [];
}

/**
 * Called by the orchestrator when a PLAYBACK_PROGRESS message arrives from the offscreen player.
 * This drives word highlighting in sync with actual audio playback.
 */
export function onPlaybackProgress(
  chunkIndex: number,
  currentTime: number,
  duration: number,
): void {
  if (chunkIndex !== currentChunkIndex || !currentTabId || currentWords.length === 0) {
    return;
  }

  if (duration > 0) {
    audioDuration = duration;
  }

  if (currentRealTimings) {
    // Use real timings — advance words whose startTime has been reached
    while (
      currentWordIndex < currentRealTimings.length &&
      currentRealTimings[currentWordIndex].startTime <= currentTime
    ) {
      const timing = currentRealTimings[currentWordIndex];
      sendTabMessage(currentTabId, {
        type: MSG.WORD_TIMING,
        chunkIndex: currentChunkIndex,
        wordIndex: currentWordIndex,
        word: timing.word,
        startTime: timing.startTime,
        endTime: timing.endTime,
      }).catch(() => {});
      currentWordIndex++;
    }
  } else if (audioDuration > 0) {
    // Interpolate using character-weighted word durations so longer words
    // get proportionally more time (instead of uniform distribution which
    // causes highlighting to race ahead of short words).
    const progress = Math.min(currentTime / audioDuration, 1);

    // Find the expected word index using cumulative character fractions
    let expectedWordIndex = 0;
    for (let i = 0; i < cumulativeCharFractions.length; i++) {
      if (progress < cumulativeCharFractions[i]) {
        expectedWordIndex = i;
        break;
      }
      expectedWordIndex = i;
    }

    while (currentWordIndex <= expectedWordIndex) {
      const startFrac = currentWordIndex > 0 ? cumulativeCharFractions[currentWordIndex - 1] : 0;
      const endFrac = cumulativeCharFractions[currentWordIndex];
      sendTabMessage(currentTabId, {
        type: MSG.WORD_TIMING,
        chunkIndex: currentChunkIndex,
        wordIndex: currentWordIndex,
        word: currentWords[currentWordIndex],
        startTime: startFrac * audioDuration,
        endTime: endFrac * audioDuration,
      }).catch(() => {});
      currentWordIndex++;
    }
  }
}
