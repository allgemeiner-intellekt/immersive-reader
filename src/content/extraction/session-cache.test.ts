import { describe, expect, it } from 'vitest';
import {
  canReuseExtraction,
  createExtractionCacheEntry,
  createExtractionCacheKey,
} from './session-cache';

describe('extraction session cache helpers', () => {
  it('keys selection reuse without storing the full selected text', () => {
    const selectedText = 'A selected passage that should be represented by length and sample hash.';
    const key = createExtractionCacheKey({
      url: 'https://example.com/article',
      fromSelection: true,
      selectionText: selectedText,
      chunkConfig: { minWords: 5, maxWords: 25, splitThreshold: 35 },
    });

    expect(key).toContain('https://example.com/article|selection|');
    expect(key).not.toContain(selectedText);
  });

  it('reuses document extraction while the source element is connected and length-stable', () => {
    const sourceElement = {
      isConnected: true,
      textContent: 'Article text',
    } as Pick<Element, 'isConnected' | 'textContent'> as Element;
    const entry = createExtractionCacheEntry({
      key: 'cache-key',
      title: 'Title',
      wordCount: 2,
      totalChunks: 1,
      sourceElement,
    });

    expect(canReuseExtraction(entry, 'cache-key')).toBe(true);

    sourceElement.textContent = 'Article text changed';
    expect(canReuseExtraction(entry, 'cache-key')).toBe(false);
  });
});
