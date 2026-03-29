import { MSG, sendTabMessage, type ExtensionMessage } from '@shared/messages';
import type { TextChunk, Voice } from '@shared/types';
import { getProvider } from '@providers/registry';
import { getActiveProvider, getSettings } from '@shared/storage';
import { playbackState } from './playback-state';
import { ensureOffscreenDocument } from './offscreen-manager';
import { startWordTimingRelay, stopWordTimingRelay } from './word-timing';
import { LOOKAHEAD_BUFFER_SIZE } from '@shared/constants';

interface SynthesizedChunk {
  chunkIndex: number;
  audioData: ArrayBuffer;
  format: string;
  wordTimings?: Array<{ word: string; startTime: number; endTime: number }>;
}

let activeTabId: number | null = null;
const prefetchCache = new Map<number, SynthesizedChunk>();
let abortController: AbortController | null = null;

export function setActiveTab(tabId: number): void {
  activeTabId = tabId;
}

export function getActiveTab(): number | null {
  return activeTabId;
}

export async function startPlayback(tabId: number, fromSelection = false): Promise<void> {
  // Abort any ongoing playback
  stopPlayback();
  activeTabId = tabId;
  abortController = new AbortController();

  playbackState.setStatus('loading');

  // Step 1: Extract content from the page
  const extractResult = await sendTabMessage<{
    title?: string;
    wordCount?: number;
    totalChunks?: number;
    error?: string;
  }>(tabId, { type: MSG.EXTRACT_CONTENT, fromSelection });

  if (extractResult.error || !extractResult.totalChunks) {
    playbackState.setStatus('idle');
    throw new Error(extractResult.error ?? 'No content to read');
  }

  playbackState.update({
    totalChunks: extractResult.totalChunks,
    currentChunkIndex: 0,
  });

  // Step 2: Start the playback loop
  await playChunksSequentially(tabId, 0, extractResult.totalChunks);
}

export async function resumePlayback(): Promise<void> {
  if (playbackState.getStatus() !== 'paused') return;
  playbackState.setStatus('playing');
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({ type: MSG.RESUME }).catch(console.error);
}

export function pausePlayback(): void {
  if (playbackState.getStatus() !== 'playing') return;
  playbackState.setStatus('paused');
  stopWordTimingRelay();
  chrome.runtime.sendMessage({ type: MSG.PAUSE }).catch(console.error);
}

export function stopPlayback(): void {
  abortController?.abort();
  abortController = null;
  prefetchCache.clear();
  stopWordTimingRelay();
  playbackState.reset();
  chrome.runtime.sendMessage({ type: MSG.STOP }).catch(() => {});
}

export async function skipForward(): Promise<void> {
  const state = playbackState.getState();
  if (state.status === 'idle') return;
  const nextChunk = state.currentChunkIndex + 1;
  if (nextChunk >= state.totalChunks) {
    stopPlayback();
    return;
  }
  await skipToChunk(nextChunk);
}

export async function skipBackward(): Promise<void> {
  const state = playbackState.getState();
  if (state.status === 'idle') return;
  const prevChunk = Math.max(0, state.currentChunkIndex - 1);
  await skipToChunk(prevChunk);
}

async function skipToChunk(chunkIndex: number): Promise<void> {
  if (!activeTabId) return;
  const state = playbackState.getState();

  // Stop current audio
  stopWordTimingRelay();
  chrome.runtime.sendMessage({ type: MSG.STOP }).catch(() => {});

  // Reset abort for the new sequence
  abortController?.abort();
  abortController = new AbortController();

  playbackState.update({ currentChunkIndex: chunkIndex, status: 'loading' });
  await playChunksSequentially(activeTabId, chunkIndex, state.totalChunks);
}

export function setSpeed(speed: number): void {
  playbackState.update({ speed });
  chrome.runtime.sendMessage({ type: MSG.SET_SPEED, speed }).catch(() => {});
}

export function setVolume(volume: number): void {
  playbackState.update({ volume });
  chrome.runtime.sendMessage({ type: MSG.SET_VOLUME, volume }).catch(() => {});
}

async function playChunksSequentially(
  tabId: number,
  startIndex: number,
  totalChunks: number,
): Promise<void> {
  const signal = abortController?.signal;

  for (let i = startIndex; i < totalChunks; i++) {
    if (signal?.aborted) return;

    playbackState.update({ currentChunkIndex: i, status: 'loading' });

    // Synthesize current chunk (or use prefetched)
    let synthesized: SynthesizedChunk;
    const cached = prefetchCache.get(i);
    if (cached) {
      synthesized = cached;
      prefetchCache.delete(i);
    } else {
      try {
        synthesized = await synthesizeChunk(tabId, i);
      } catch (err) {
        if (signal?.aborted) return;
        // Notify content script of error
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (activeTabId) {
          sendTabMessage(activeTabId, {
            type: MSG.PLAYBACK_ERROR,
            error: errorMsg,
            chunkIndex: i,
          }).catch(() => {});
        }
        playbackState.setStatus('idle');
        return;
      }
    }

    if (signal?.aborted) return;

    // Start prefetching next chunks
    for (let j = 1; j <= LOOKAHEAD_BUFFER_SIZE; j++) {
      const prefetchIndex = i + j;
      if (prefetchIndex < totalChunks && !prefetchCache.has(prefetchIndex)) {
        synthesizeChunk(tabId, prefetchIndex)
          .then((result) => {
            if (!signal?.aborted) {
              prefetchCache.set(prefetchIndex, result);
            }
          })
          .catch(() => {
            // Prefetch failures are non-fatal
          });
      }
    }

    // Send audio to offscreen for playback
    await ensureOffscreenDocument();
    playbackState.setStatus('playing');
    chrome.runtime
      .sendMessage({
        type: MSG.PLAY_AUDIO,
        audioData: synthesized.audioData,
        chunkIndex: i,
        format: synthesized.format,
      })
      .catch(console.error);

    // Start word timing relay for this chunk
    const chunkResult = await sendTabMessage<TextChunk>(tabId, {
      type: MSG.GET_CHUNK,
      index: i,
    });
    if (chunkResult && 'text' in chunkResult) {
      startWordTimingRelay(tabId, i, chunkResult.text, synthesized.wordTimings);
    }

    // Wait for chunk to complete
    await waitForChunkComplete(i, signal);

    if (signal?.aborted) return;
  }

  // All chunks done
  stopPlayback();
}

async function synthesizeChunk(tabId: number, chunkIndex: number): Promise<SynthesizedChunk> {
  // Get chunk text from content script
  const chunk = await sendTabMessage<TextChunk & { error?: string }>(tabId, {
    type: MSG.GET_CHUNK,
    index: chunkIndex,
  });

  if (!chunk || chunk.error || !('text' in chunk)) {
    throw new Error(`Failed to get chunk ${chunkIndex}`);
  }

  // Get active provider and voice
  const providerConfig = await getActiveProvider();
  if (!providerConfig) {
    throw new Error('No TTS provider configured. Please add one in settings.');
  }

  const settings = await getSettings();
  const provider = getProvider(providerConfig.providerId);

  // Get voice
  const voiceId = settings.activeVoiceId;
  const voices = await provider.listVoices(providerConfig);
  const voice = voices.find((v) => v.id === voiceId) ?? voices[0];

  if (!voice) {
    throw new Error('No voice available for this provider');
  }

  // Synthesize
  const result = await provider.synthesize(chunk.text, voice, providerConfig, {
    speed: playbackState.getState().speed,
  });

  return {
    chunkIndex,
    audioData: result.audioData,
    format: result.format,
    wordTimings: result.wordTimings,
  };
}

function waitForChunkComplete(
  chunkIndex: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const listener = (message: ExtensionMessage) => {
      if (message.type === MSG.CHUNK_COMPLETE && 'chunkIndex' in message && message.chunkIndex === chunkIndex) {
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      } else if (message.type === MSG.PLAYBACK_ERROR && 'chunkIndex' in message && message.chunkIndex === chunkIndex) {
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    signal?.addEventListener('abort', () => {
      chrome.runtime.onMessage.removeListener(listener);
      resolve();
    });
  });
}

// Handle progress messages from offscreen
export function handlePlaybackProgress(currentTime: number, duration: number, chunkIndex: number): void {
  if (playbackState.getState().currentChunkIndex === chunkIndex) {
    playbackState.update({
      currentTime,
      duration,
      chunkProgress: duration > 0 ? currentTime / duration : 0,
    });
  }
}
