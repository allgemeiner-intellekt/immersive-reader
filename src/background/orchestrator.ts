import { MSG, sendTabMessage, type ExtensionMessage } from '@shared/messages';
import type { TextChunk } from '@shared/types';
import { getProvider } from '@providers/registry';
import { getActiveProvider, getSettings, saveProgress, getProgress, clearProgress } from '@shared/storage';
import { getChunkLimits } from '@providers/registry';
import { playbackState } from './playback-state';
import { ensureOffscreenDocument } from './offscreen-manager';
import { startWordTimingRelay, stopWordTimingRelay, onPlaybackProgress } from './word-timing';
import { LOOKAHEAD_BUFFER_SIZE } from '@shared/constants';
import { ApiError } from '@shared/api-error';
import { getCachedVoices, setCachedVoices } from '@providers/voice-cache';
import {
  markFailed,
  getNextCandidate,
  type PlaybackSession,
} from './failover';

interface SynthesizedChunk {
  chunkIndex: number;
  audioBase64: string;
  format: string;
  wordTimings?: Array<{ word: string; startTime: number; endTime: number }>;
}

let activeTabId: number | null = null;
let currentPageUrl: string | undefined;
const prefetchCache = new Map<number, SynthesizedChunk>();
const MAX_CACHE_SIZE = 8;
let abortController: AbortController | null = null;

// Session binding — locks provider + voice for the duration of a playback session
let currentSession: PlaybackSession | null = null;
let sessionGeneration = 0;

const MAX_FAILOVER_ATTEMPTS = 3;

export function setActiveTab(tabId: number): void {
  activeTabId = tabId;
}

export function getActiveTab(): number | null {
  return activeTabId;
}

// Convert ArrayBuffer to base64 string for Chrome message passing
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Evict cache entries furthest from current playback position
function evictCache(currentIndex: number): void {
  if (prefetchCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...prefetchCache.keys()].sort(
    (a, b) => Math.abs(b - currentIndex) - Math.abs(a - currentIndex),
  );
  while (prefetchCache.size > MAX_CACHE_SIZE && entries.length > 0) {
    prefetchCache.delete(entries.shift()!);
  }
}

// Send a message to the offscreen document (uses OFFSCREEN_ prefix to avoid routing loops)
async function sendToOffscreen(message: Record<string, unknown>): Promise<void> {
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage(message).catch(console.error);
}

// Ensure the content script is injected into the tab
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    // Try pinging the content script
    await chrome.tabs.sendMessage(tabId, { type: MSG.GET_PAGE_INFO });
  } catch {
    // Content script not loaded — inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/index.tsx'],
    });
    // Wait briefly for it to initialize
    await new Promise((r) => setTimeout(r, 300));
  }
}

/**
 * Resolve the provider config and voice for a new session.
 * Locks these at session start so mid-read settings changes don't affect playback.
 */
async function initSession(): Promise<PlaybackSession> {
  const providerConfig = await getActiveProvider();
  if (!providerConfig) {
    throw new Error('No TTS provider configured. Please add one in Settings.');
  }

  const settings = await getSettings();
  const provider = getProvider(providerConfig.providerId);

  // Use voice cache to avoid per-session API calls
  let voices = getCachedVoices(providerConfig.id);
  if (!voices) {
    voices = await provider.listVoices(providerConfig);
    setCachedVoices(providerConfig.id, voices);
  }

  const voiceId = settings.activeVoiceId;
  const voice = voices.find((v) => v.id === voiceId) ?? voices[0];
  if (!voice) {
    throw new Error('No voice available for this provider.');
  }

  sessionGeneration++;
  const session: PlaybackSession = {
    config: providerConfig,
    voice,
    providerId: providerConfig.providerId,
    generation: sessionGeneration,
  };
  currentSession = session;
  return session;
}

export async function startPlayback(tabId: number, fromSelection = false): Promise<void> {
  // Abort any ongoing playback
  stopPlayback();
  activeTabId = tabId;
  abortController = new AbortController();

  playbackState.setStatus('loading');

  // Ensure content script is available
  try {
    await ensureContentScript(tabId);
  } catch (err) {
    playbackState.setStatus('idle');
    console.error('Cannot inject content script:', err);
    return;
  }

  // Initialize session — lock provider + voice
  try {
    await initSession();
  } catch (err) {
    playbackState.setStatus('idle');
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Session init failed:', errorMsg);
    if (activeTabId) {
      sendTabMessage(activeTabId, {
        type: MSG.PLAYBACK_ERROR,
        error: errorMsg,
        chunkIndex: 0,
      }).catch(() => {});
    }
    return;
  }

  // Step 1: Extract content from the page
  let extractResult: {
    title?: string;
    wordCount?: number;
    totalChunks?: number;
    error?: string;
  };
  try {
    const chunkConfig = currentSession ? getChunkLimits(currentSession.providerId) : undefined;
    extractResult = await sendTabMessage(tabId, { type: MSG.EXTRACT_CONTENT, fromSelection, chunkConfig });
  } catch (err) {
    playbackState.setStatus('idle');
    console.error('Failed to extract content:', err);
    return;
  }

  if (extractResult.error || !extractResult.totalChunks) {
    playbackState.setStatus('idle');
    console.error('Extraction failed:', extractResult.error ?? 'No content');
    return;
  }

  // Check for saved reading progress
  let startIndex = 0;
  currentPageUrl = undefined;
  try {
    currentPageUrl = await sendTabMessage<string>(tabId, { type: MSG.GET_PAGE_URL });
  } catch {
    // Content script may not respond
  }
  if (currentPageUrl && !fromSelection) {
    const saved = await getProgress(currentPageUrl);
    if (saved && saved.chunkIndex > 0 && saved.chunkIndex < extractResult.totalChunks) {
      startIndex = saved.chunkIndex;
      sendTabMessage(tabId, {
        type: MSG.RESUME_FROM_PROGRESS,
        chunkIndex: startIndex,
      } as ExtensionMessage).catch(() => {});
    }
  }

  playbackState.update({
    totalChunks: extractResult.totalChunks,
    currentChunkIndex: startIndex,
  });

  // Step 2: Start the playback loop
  await playChunksSequentially(tabId, startIndex, extractResult.totalChunks, currentPageUrl);
}

export async function resumePlayback(): Promise<void> {
  if (playbackState.getStatus() !== 'paused') return;
  playbackState.setStatus('playing');
  await sendToOffscreen({ type: MSG.OFFSCREEN_RESUME });
}

export function pausePlayback(): void {
  if (playbackState.getStatus() !== 'playing') return;
  playbackState.setStatus('paused');
  // Don't stop word timing relay on pause — the audio player's progress
  // interval is cleared, so no progress messages arrive while paused.
  // Keeping relay state alive lets highlighting resume seamlessly.
  sendToOffscreen({ type: MSG.OFFSCREEN_PAUSE }).catch(() => {});
}

export function stopPlayback(): void {
  abortController?.abort();
  abortController = null;
  prefetchCache.clear();
  // Clear saved progress on explicit stop — user is done with this article
  if (currentPageUrl) {
    clearProgress(currentPageUrl).catch(() => {});
    currentPageUrl = undefined;
  }
  currentSession = null;
  stopWordTimingRelay();
  playbackState.reset();
  sendToOffscreen({ type: MSG.OFFSCREEN_STOP }).catch(() => {});
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

export async function skipToChunk(chunkIndex: number): Promise<void> {
  if (!activeTabId) return;
  const state = playbackState.getState();
  if (state.status === 'idle') return;

  stopWordTimingRelay();
  await sendToOffscreen({ type: MSG.OFFSCREEN_STOP });

  abortController?.abort();
  abortController = new AbortController();

  playbackState.update({ currentChunkIndex: chunkIndex, status: 'loading' });
  await playChunksSequentially(activeTabId, chunkIndex, state.totalChunks);
}

export function setSpeed(speed: number): void {
  playbackState.update({ speed });
  sendToOffscreen({ type: MSG.OFFSCREEN_SET_SPEED, speed }).catch(() => {});
}

export function setVolume(volume: number): void {
  playbackState.update({ volume });
  sendToOffscreen({ type: MSG.OFFSCREEN_SET_VOLUME, volume }).catch(() => {});
}

async function playChunksSequentially(
  tabId: number,
  startIndex: number,
  totalChunks: number,
  pageUrl?: string,
): Promise<void> {
  const signal = abortController?.signal;

  for (let i = startIndex; i < totalChunks; i++) {
    if (signal?.aborted) return;

    playbackState.update({ currentChunkIndex: i, status: 'loading' });

    // Synthesize current chunk (or use cached — kept for backward skip)
    let synthesized: SynthesizedChunk;
    const cached = prefetchCache.get(i);
    if (cached) {
      synthesized = cached;
    } else {
      try {
        synthesized = await synthesizeChunkWithFailover(tabId, i);
      } catch (err) {
        if (signal?.aborted) return;
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Synthesis error:', errorMsg);
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

    // Cache current chunk result for backward skip
    if (!prefetchCache.has(i)) {
      prefetchCache.set(i, synthesized);
    }

    // Start prefetching next chunks (tagged with generation to discard stale results)
    const gen = sessionGeneration;
    for (let j = 1; j <= LOOKAHEAD_BUFFER_SIZE; j++) {
      const prefetchIndex = i + j;
      if (prefetchIndex < totalChunks && !prefetchCache.has(prefetchIndex)) {
        synthesizeChunk(tabId, prefetchIndex)
          .then((result) => {
            // Discard if session has changed (failover occurred)
            if (!signal?.aborted && sessionGeneration === gen) {
              prefetchCache.set(prefetchIndex, result);
            }
          })
          .catch(() => {});
      }
    }

    // Evict cache entries furthest from current position
    evictCache(i);

    // Send audio to offscreen as base64 (ArrayBuffer can't be serialized in Chrome messages)
    // Use OFFSCREEN_SCHEDULE_NEXT for gapless playback after the first chunk
    playbackState.setStatus('playing');
    const offscreenMsg = i === startIndex ? MSG.OFFSCREEN_PLAY : MSG.OFFSCREEN_SCHEDULE_NEXT;
    await sendToOffscreen({
      type: offscreenMsg,
      audioBase64: synthesized.audioBase64,
      chunkIndex: i,
      format: synthesized.format,
    });

    // Start word timing relay for this chunk
    let chunkResult: TextChunk | null = null;
    try {
      chunkResult = await sendTabMessage<TextChunk>(tabId, {
        type: MSG.GET_CHUNK,
        index: i,
      });
    } catch {
      // Content script may not respond
    }
    if (chunkResult && 'text' in chunkResult) {
      startWordTimingRelay(tabId, i, chunkResult.text, synthesized.wordTimings);
    }

    // Wait for chunk to complete
    await waitForChunkComplete(i, signal);

    if (signal?.aborted) return;

    // Save reading progress
    if (pageUrl) {
      saveProgress({ url: pageUrl, chunkIndex: i + 1, totalChunks, timestamp: Date.now() }).catch(() => {});
    }
  }

  // All chunks done — clear progress for this page
  if (pageUrl) {
    clearProgress(pageUrl).catch(() => {});
  }
  stopPlayback();
}

/**
 * Synthesize a chunk using the session-locked config.
 * Does NOT handle failover — used directly and by the failover wrapper.
 */
async function synthesizeChunk(tabId: number, chunkIndex: number): Promise<SynthesizedChunk> {
  const session = currentSession;
  if (!session) {
    throw new Error('No active playback session.');
  }

  // Get chunk text from content script
  const chunk = await sendTabMessage<TextChunk & { error?: string }>(tabId, {
    type: MSG.GET_CHUNK,
    index: chunkIndex,
  });

  if (!chunk || chunk.error || !('text' in chunk)) {
    throw new Error(`Failed to get chunk ${chunkIndex}`);
  }

  const provider = getProvider(session.config.providerId);

  // Synthesize using session-locked config and voice
  const result = await provider.synthesize(chunk.text, session.voice, session.config, {
    speed: playbackState.getState().speed,
  });

  return {
    chunkIndex,
    audioBase64: arrayBufferToBase64(result.audioData),
    format: result.format,
    wordTimings: result.wordTimings,
  };
}

/**
 * Synthesize with automatic failover to backup API keys on retryable errors.
 */
async function synthesizeChunkWithFailover(
  tabId: number,
  chunkIndex: number,
): Promise<SynthesizedChunk> {
  let attempts = 0;

  while (attempts < MAX_FAILOVER_ATTEMPTS) {
    try {
      return await synthesizeChunk(tabId, chunkIndex);
    } catch (err) {
      attempts++;

      // Non-ApiError or non-retryable → stop immediately
      if (!(err instanceof ApiError) || !err.retryable) {
        if (err instanceof ApiError) {
          markFailed(currentSession!.config.id, err);
        }
        throw err;
      }

      const failedConfigId = currentSession!.config.id;

      // For 5xx/network errors, retry same config once before failing over
      if ((err.status >= 500 || err.status === 0) && attempts === 1) {
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (attempts - 1), 8000)));
        continue;
      }

      // Mark the failed config
      markFailed(failedConfigId, err);

      // Try to find a backup
      const candidate = await getNextCandidate(currentSession!, failedConfigId);
      if (!candidate) {
        throw new Error(
          `All API keys for ${currentSession!.providerId} exhausted. Last error: ${err.message}`,
        );
      }

      // Switch session to the backup config
      console.log(`Failover: switching from config ${failedConfigId} to ${candidate.id}`);
      currentSession = {
        ...currentSession!,
        config: candidate,
        generation: ++sessionGeneration,
      };
      prefetchCache.clear();

      // Notify content script of failover
      if (activeTabId) {
        sendTabMessage(activeTabId, {
          type: MSG.FAILOVER_NOTICE,
          fromConfig: failedConfigId,
          toConfig: candidate.id,
          toConfigName: candidate.name,
        } as ExtensionMessage).catch(() => {});
      }
    }
  }

  throw new Error('Max failover attempts exceeded.');
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
      if (
        message.type === MSG.CHUNK_COMPLETE &&
        'chunkIndex' in message &&
        message.chunkIndex === chunkIndex
      ) {
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      } else if (
        message.type === MSG.PLAYBACK_ERROR &&
        'chunkIndex' in message &&
        message.chunkIndex === chunkIndex
      ) {
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
export function handlePlaybackProgress(
  currentTime: number,
  duration: number,
  chunkIndex: number,
): void {
  if (playbackState.getState().currentChunkIndex === chunkIndex) {
    playbackState.update({
      currentTime,
      duration,
      chunkProgress: duration > 0 ? currentTime / duration : 0,
    });
    // Drive word highlighting from real playback progress
    onPlaybackProgress(chunkIndex, currentTime, duration);
  }
}
