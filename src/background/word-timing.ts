import { MSG, sendTabMessage } from '@shared/messages';

interface SimpleWordTiming {
  word: string;
  startTime: number;
  endTime: number;
}

let timingInterval: ReturnType<typeof setInterval> | null = null;

export function startWordTimingRelay(
  tabId: number,
  chunkIndex: number,
  chunkText: string,
  realTimings?: SimpleWordTiming[],
): void {
  stopWordTimingRelay();

  if (realTimings && realTimings.length > 0) {
    relayRealTimings(tabId, chunkIndex, realTimings);
  } else {
    relayInterpolatedTimings(tabId, chunkIndex, chunkText);
  }
}

export function stopWordTimingRelay(): void {
  if (timingInterval) {
    clearInterval(timingInterval);
    timingInterval = null;
  }
}

function relayRealTimings(
  tabId: number,
  chunkIndex: number,
  timings: SimpleWordTiming[],
): void {
  let wordIndex = 0;
  const startTime = Date.now();

  timingInterval = setInterval(() => {
    if (wordIndex >= timings.length) {
      stopWordTimingRelay();
      return;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    while (wordIndex < timings.length && timings[wordIndex].startTime <= elapsed) {
      const timing = timings[wordIndex];
      sendTabMessage(tabId, {
        type: MSG.WORD_TIMING,
        chunkIndex,
        wordIndex,
        word: timing.word,
        startTime: timing.startTime,
        endTime: timing.endTime,
      }).catch(() => {});
      wordIndex++;
    }
  }, 50);
}

function relayInterpolatedTimings(
  tabId: number,
  chunkIndex: number,
  chunkText: string,
): void {
  const words = chunkText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  // Estimate duration: ~150ms per word at 1x speed
  const estimatedDurationMs = words.length * 150;
  const wordDuration = estimatedDurationMs / words.length / 1000;

  let wordIndex = 0;
  const startTime = Date.now();

  timingInterval = setInterval(() => {
    if (wordIndex >= words.length) {
      stopWordTimingRelay();
      return;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const expectedWordIndex = Math.floor(elapsed / wordDuration);

    while (wordIndex <= Math.min(expectedWordIndex, words.length - 1)) {
      sendTabMessage(tabId, {
        type: MSG.WORD_TIMING,
        chunkIndex,
        wordIndex,
        word: words[wordIndex],
        startTime: wordIndex * wordDuration,
        endTime: (wordIndex + 1) * wordDuration,
      }).catch(() => {});
      wordIndex++;
    }
  }, 50);
}
