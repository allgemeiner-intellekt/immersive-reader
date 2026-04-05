import { MSG, type ExtensionMessage } from '@shared/messages';
import type { TextChunk } from '@shared/types';
import { extractContent } from './extraction/extractor';
import { getSelectedText } from './extraction/selection';
import { chunkText } from '@shared/chunker';
import { mountToolbar } from './mount';
import { useToolbarStore } from './state/store';
import { getSettings } from '@shared/storage';
import { resolveHighlightSettings } from '@shared/accent-colors';
import { HighlightManager } from './highlighting/highlight-manager';
import {
  initAutoScroll,
  destroyAutoScroll,
  resumeAutoScroll,
} from './highlighting/auto-scroll';
import { initTextScrubber, destroyTextScrubber } from './highlighting/text-scrubber';

console.log('Immersive Reader: content script loaded');

// Auto-hide toolbar when native media (video/audio) plays
function setupNativeMediaDetection() {
  const store = useToolbarStore.getState;
  let wasVisibleBeforeMedia = false;

  const onNativePlay = () => {
    const state = store();
    if (state.toolbarVisible) {
      wasVisibleBeforeMedia = true;
      state.hideToolbar();
    }
  };

  const onNativePauseOrEnd = () => {
    if (wasVisibleBeforeMedia) {
      wasVisibleBeforeMedia = false;
      store().showToolbar();
    }
  };

  // Capture phase to catch events from all media elements
  document.addEventListener('play', onNativePlay, true);
  document.addEventListener('pause', onNativePauseOrEnd, true);
  document.addEventListener('ended', onNativePauseOrEnd, true);
}

setupNativeMediaDetection();

// Module-level storage for extracted chunks
let currentChunks: TextChunk[] = [];
let currentTitle = '';

// Highlight manager instance
let highlightManager: HighlightManager | null = null;

// Mount the floating toolbar into the page
mountToolbar();

function isContentMessage(message: ExtensionMessage): boolean {
  return (
    message.type === MSG.EXTRACT_CONTENT ||
    message.type === MSG.GET_CHUNK ||
    message.type === MSG.GET_PAGE_INFO ||
    message.type === MSG.PLAYBACK_PROGRESS ||
    message.type === MSG.CHUNK_COMPLETE ||
    message.type === MSG.WORD_TIMING ||
    message.type === MSG.PLAYBACK_ERROR ||
    message.type === MSG.START_READING ||
    message.type === MSG.STOP ||
    message.type === MSG.FAILOVER_NOTICE ||
    message.type === MSG.GET_PAGE_URL ||
    message.type === MSG.RESUME_FROM_PROGRESS ||
    message.type === MSG.SHOW_TOOLBAR
  );
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (!isContentMessage(message)) {
      return false;
    }

    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ error: String(err) });
    });
    return true;
  },
);

// Listen for settings changes to update highlight colors in real-time
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes['ir-settings']) return;
  const newSettings = changes['ir-settings'].newValue;
  if (newSettings?.highlight && highlightManager) {
    const resolved = resolveHighlightSettings(newSettings.highlight, newSettings.themeColor ?? null);
    highlightManager.updateColors(resolved);
  }
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  const store = useToolbarStore.getState();

  switch (message.type) {
    case MSG.EXTRACT_CONTENT: {
      // Check for text selection first
      const selection = getSelectedText();
      let textContent: string;
      let title: string;
      let wordCount: number;
      let sourceEl: Element | null = null;

      if (selection && message.fromSelection !== false) {
        textContent = selection.text;
        title = document.title;
        wordCount = textContent.split(/\s+/).filter(Boolean).length;
      } else {
        const result = extractContent();
        if (!result) {
          return { error: 'Could not extract content from this page.' };
        }
        textContent = result.textContent;
        title = result.title;
        wordCount = result.wordCount;
        sourceEl = result.sourceElement;
      }

      currentChunks = chunkText(textContent, message.chunkConfig);
      currentTitle = title;

      store._setTotalChunks(currentChunks.length);
      store.showToolbar();

      // Initialize highlighting
      const settings = await getSettings();
      const resolvedHighlight = resolveHighlightSettings(settings.highlight, settings.themeColor);
      highlightManager?.destroy();
      highlightManager = new HighlightManager(resolvedHighlight);
      // Always init highlighting — fallback to document.body if no source element
      highlightManager.init(sourceEl ?? document.body);

      // Recompute chunk offsets against the DOM text map so highlighting
      // aligns with actual text node positions (Readability's textContent
      // may differ from the live DOM, causing partial-word highlights).
      const domText = highlightManager.getFullText();
      if (domText) {
        recomputeChunkOffsets(currentChunks, domText);
      }

      if (settings.highlight.autoScroll) {
        initAutoScroll();
      }

      // Enable interactive text scrubbing (hover + click to seek)
      initTextScrubber(highlightManager, currentChunks, (chunkIndex) => {
        useToolbarStore.getState().seekToChunk(chunkIndex);
      });

      return {
        title,
        wordCount,
        totalChunks: currentChunks.length,
      };
    }

    case MSG.GET_CHUNK: {
      const chunk = currentChunks[message.index];
      if (!chunk) {
        return { error: `Chunk ${message.index} not found` };
      }
      return chunk;
    }

    case MSG.GET_PAGE_INFO:
      return {
        title: currentTitle || document.title,
        wordCount: document.body.innerText.split(/\s+/).filter(Boolean).length,
        isPlaying: store.playbackStatus === 'playing',
        currentChunk: store.currentChunkIndex,
        totalChunks: currentChunks.length,
      };

    case MSG.PLAYBACK_PROGRESS: {
      const progress =
        message.duration > 0 ? message.currentTime / message.duration : 0;
      store._setChunkProgress(progress, message.currentTime);
      store._setCurrentChunk(message.chunkIndex);
      if (store.playbackStatus !== 'playing') {
        store._setPlaybackStatus('playing');
      }
      return { ok: true };
    }

    case MSG.CHUNK_COMPLETE: {
      store._addChunkDuration(store.currentChunkTime);
      store._setCurrentChunk(message.chunkIndex + 1);
      store._setChunkProgress(0);
      // Clear highlights for completed chunk
      highlightManager?.clearAll();
      return { ok: true };
    }

    case MSG.WORD_TIMING: {
      if (highlightManager) {
        const chunk = currentChunks[message.chunkIndex];
        if (chunk) {
          // Calculate absolute character positions from chunk offset + word position
          const chunkText = chunk.text;
          const wordStart = findWordPosition(chunkText, message.word, message.wordIndex);
          if (wordStart >= 0) {
            const absStart = chunk.startOffset + wordStart;
            const absEnd = absStart + message.word.length;
            highlightManager.highlightWord(absStart, absEnd);

            // Also highlight the sentence containing this word
            const sentenceBounds = findSentenceBounds(chunkText, wordStart);
            highlightManager.highlightSentence(
              chunk.startOffset + sentenceBounds.start,
              chunk.startOffset + sentenceBounds.end,
            );

            // Resume auto-scroll on new sentence
            resumeAutoScroll();
          }
        }
      }
      return { ok: true };
    }

    case MSG.PLAYBACK_ERROR: {
      console.error('Immersive Reader playback error:', message.error);
      store._setPlaybackStatus('idle');
      return { ok: true };
    }

    case MSG.START_READING: {
      store._setPlaybackStatus('loading');
      store.showToolbar();
      return { ok: true };
    }

    case MSG.STOP: {
      destroyTextScrubber();
      highlightManager?.destroy();
      highlightManager = null;
      destroyAutoScroll();
      store._setPlaybackStatus('idle');
      return { ok: true };
    }

    case MSG.FAILOVER_NOTICE: {
      if ('toConfigName' in message) {
        store._showToast(`Switched to backup key: ${message.toConfigName}`);
      }
      return { ok: true };
    }

    case MSG.GET_PAGE_URL: {
      return window.location.href;
    }

    case MSG.RESUME_FROM_PROGRESS: {
      if ('chunkIndex' in message) {
        store._showToast(`Resuming from where you left off`);
      }
      return { ok: true };
    }

    case MSG.SHOW_TOOLBAR: {
      store.showToolbar();
      if (message.error) {
        store._showToast(message.error);
      }
      return { ok: true };
    }
  }
}

/**
 * Recompute chunk startOffset/endOffset so they refer to positions in `domText`
 * (the concatenated DOM text node map) rather than Readability's textContent.
 * Uses fuzzy matching: for each chunk, search for its text (or a normalised
 * version) in the DOM text near the expected position.
 */
function recomputeChunkOffsets(chunks: TextChunk[], domText: string): void {
  let searchFrom = 0;

  for (const chunk of chunks) {
    // Try exact match first
    let idx = domText.indexOf(chunk.text, searchFrom);

    if (idx < 0) {
      // Normalise whitespace and try again (DOM text nodes may have different
      // whitespace than Readability output)
      const normChunk = chunk.text.replace(/\s+/g, ' ').trim();
      // Build a regex that matches the chunk words with flexible whitespace
      const words = normChunk.split(' ');
      const pattern = words.map((w) => escapeRegExp(w)).join('\\s+');
      const re = new RegExp(pattern);
      const sub = domText.slice(searchFrom);
      const m = re.exec(sub);
      if (m) {
        idx = searchFrom + m.index;
        // Use the matched length (may differ from chunk.text.length due to whitespace)
        chunk.startOffset = idx;
        chunk.endOffset = idx + m[0].length;
        searchFrom = chunk.endOffset;
        continue;
      }
    }

    if (idx >= 0) {
      chunk.startOffset = idx;
      chunk.endOffset = idx + chunk.text.length;
      searchFrom = chunk.endOffset;
    }
    // If neither match works, keep the original offsets as a last resort
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the character position of the nth occurrence of `word` in `text`,
 * using wordIndex as a sequential word counter.
 */
function findWordPosition(text: string, word: string, wordIndex: number): number {
  // Split the text into words and track positions
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(text)) !== null) {
    if (idx === wordIndex) {
      // Verify the word matches (it may have punctuation attached)
      return match.index;
    }
    idx++;
  }
  // Fallback: search for the word directly
  return text.indexOf(word);
}

/**
 * Find the sentence boundaries (start, end) within `text` that contain `charPos`.
 */
function findSentenceBounds(
  text: string,
  charPos: number,
): { start: number; end: number } {
  // Find sentence start: look backwards for sentence-ending punctuation or start of text
  let start = 0;
  for (let i = charPos - 1; i >= 0; i--) {
    if ('.!?\n'.includes(text[i])) {
      start = i + 1;
      break;
    }
  }
  // Skip leading whitespace
  while (start < text.length && text[start] === ' ') start++;

  // Find sentence end: look forward for sentence-ending punctuation or end of text
  let end = text.length;
  for (let i = charPos; i < text.length; i++) {
    if ('.!?\n'.includes(text[i])) {
      end = i + 1;
      break;
    }
  }

  return { start, end };
}
