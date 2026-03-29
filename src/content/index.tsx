import { MSG, type ExtensionMessage } from '@shared/messages';
import type { TextChunk, HighlightSettings } from '@shared/types';
import { extractContent } from './extraction/extractor';
import { getSelectedText } from './extraction/selection';
import { chunkText } from '@shared/chunker';
import { mountToolbar } from './mount';
import { useToolbarStore } from './state/store';
import { getSettings } from '@shared/storage';
import { HighlightManager } from './highlighting/highlight-manager';
import {
  initAutoScroll,
  destroyAutoScroll,
  resumeAutoScroll,
} from './highlighting/auto-scroll';

console.log('Immersive Reader: content script loaded');

// Module-level storage for extracted chunks
let currentChunks: TextChunk[] = [];
let currentTitle = '';

// Highlight manager instance
let highlightManager: HighlightManager | null = null;

// Mount the floating toolbar into the page
mountToolbar();

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
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
    highlightManager.updateColors(newSettings.highlight as HighlightSettings);
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

      currentChunks = chunkText(textContent);
      currentTitle = title;

      store._setTotalChunks(currentChunks.length);
      store.showToolbar();

      // Initialize highlighting
      const settings = await getSettings();
      highlightManager?.destroy();
      highlightManager = new HighlightManager(settings.highlight);
      if (sourceEl) {
        highlightManager.init(sourceEl);
      }

      if (settings.highlight.autoScroll) {
        initAutoScroll();
      }

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
      store._setChunkProgress(progress);
      store._setCurrentChunk(message.chunkIndex);
      if (store.playbackStatus !== 'playing') {
        store._setPlaybackStatus('playing');
      }
      return { ok: true };
    }

    case MSG.CHUNK_COMPLETE: {
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
      highlightManager?.destroy();
      highlightManager = null;
      destroyAutoScroll();
      store._setPlaybackStatus('idle');
      return { ok: true };
    }

    default:
      return { ok: true };
  }
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
