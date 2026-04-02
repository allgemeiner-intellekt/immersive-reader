import type { TextMapResult, TextNodeEntry, HighlightSettings } from '@shared/types';
import { buildTextNodeMap } from '../extraction/dom-mapper';
import { createRangeFromOffsets } from './utils';
import { injectHighlightStyles, updateHighlightStyles, removeHighlightStyles } from './styles';
import { scrollToHighlight } from './auto-scroll';

/**
 * Manages word and sentence highlighting on the page.
 *
 * Prefers the CSS Custom Highlight API (CSS.highlights) when available,
 * falling back to wrapping text in <mark> elements.
 */
export class HighlightManager {
  private textMap: TextMapResult | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private wordHighlight: Highlight | null = null;
  private sentenceHighlight: Highlight | null = null;
  private scrubHoverHighlight: Highlight | null = null;
  private settings: HighlightSettings;
  private useNativeHighlight: boolean;
  private markElements: HTMLElement[] = [];

  constructor(settings: HighlightSettings) {
    this.settings = settings;
    this.useNativeHighlight = typeof CSS !== 'undefined' && 'highlights' in CSS;
  }

  /**
   * Build the text-node map for the given source element and inject styles.
   */
  init(sourceElement: Element): void {
    this.textMap = buildTextNodeMap(sourceElement);
    this.styleEl = injectHighlightStyles(this.settings);

    if (this.useNativeHighlight) {
      this.wordHighlight = new Highlight();
      this.sentenceHighlight = new Highlight();
      this.scrubHoverHighlight = new Highlight();
      CSS.highlights.set('ir-word', this.wordHighlight);
      CSS.highlights.set('ir-sentence', this.sentenceHighlight);
      CSS.highlights.set('ir-scrub-hover', this.scrubHoverHighlight);
    }
  }

  /**
   * Highlight a single word by character offsets.
   */
  highlightWord(charStart: number, charEnd: number): void {
    if (!this.textMap || !this.settings.wordEnabled) return;

    this.clearWordHighlight();

    const range = createRangeFromOffsets(this.textMap.entries, charStart, charEnd);
    if (!range) return;

    if (this.useNativeHighlight && this.wordHighlight) {
      this.wordHighlight.add(range);
    } else {
      this.applyMarkFallback(range, 'ir-word-mark');
    }

    if (this.settings.autoScroll) {
      scrollToHighlight(range);
    }
  }

  /**
   * Highlight a sentence by character offsets.
   */
  highlightSentence(charStart: number, charEnd: number): void {
    if (!this.textMap || !this.settings.sentenceEnabled) return;

    this.clearSentenceHighlight();

    const range = createRangeFromOffsets(this.textMap.entries, charStart, charEnd);
    if (!range) return;

    if (this.useNativeHighlight && this.sentenceHighlight) {
      this.sentenceHighlight.add(range);
    } else {
      this.applyMarkFallback(range, 'ir-sentence-mark');
    }
  }

  clearWordHighlight(): void {
    if (this.useNativeHighlight && this.wordHighlight) {
      this.wordHighlight.clear();
    } else {
      this.removeMarksByClass('ir-word-mark');
    }
  }

  clearSentenceHighlight(): void {
    if (this.useNativeHighlight && this.sentenceHighlight) {
      this.sentenceHighlight.clear();
    } else {
      this.removeMarksByClass('ir-sentence-mark');
    }
  }

  /**
   * Highlight a sentence/chunk for the scrub hover effect.
   */
  highlightScrubHover(charStart: number, charEnd: number): void {
    if (!this.textMap) return;

    this.clearScrubHover();

    const range = createRangeFromOffsets(this.textMap.entries, charStart, charEnd);
    if (!range) return;

    if (this.useNativeHighlight && this.scrubHoverHighlight) {
      this.scrubHoverHighlight.add(range);
    } else {
      this.applyMarkFallback(range, 'ir-scrub-hover-mark');
    }
  }

  clearScrubHover(): void {
    if (this.useNativeHighlight && this.scrubHoverHighlight) {
      this.scrubHoverHighlight.clear();
    } else {
      this.removeMarksByClass('ir-scrub-hover-mark');
    }
  }

  /**
   * Return the text node entries for external offset mapping.
   */
  getEntries(): TextNodeEntry[] {
    return this.textMap?.entries ?? [];
  }

  /**
   * Return the concatenated plain text from the DOM text node map.
   */
  getFullText(): string {
    if (!this.textMap) return '';
    return this.textMap.text;
  }

  clearAll(): void {
    this.clearWordHighlight();
    this.clearSentenceHighlight();
    this.clearScrubHover();
  }

  updateColors(settings: HighlightSettings): void {
    this.settings = settings;
    if (this.styleEl) {
      updateHighlightStyles(this.styleEl, settings);
    }
  }

  destroy(): void {
    this.clearAll();

    if (this.useNativeHighlight) {
      CSS.highlights.delete('ir-word');
      CSS.highlights.delete('ir-sentence');
      CSS.highlights.delete('ir-scrub-hover');
    }

    this.wordHighlight = null;
    this.sentenceHighlight = null;
    this.scrubHoverHighlight = null;
    this.textMap = null;

    if (this.styleEl) {
      removeHighlightStyles(this.styleEl);
      this.styleEl = null;
    }
  }

  // --- Fallback: wrap range content in <mark> elements ---

  private applyMarkFallback(range: Range, className: string): void {
    // Use surroundContents for simple same-node ranges,
    // otherwise use extractContents/insertNode approach.
    try {
      if (range.startContainer === range.endContainer) {
        const mark = document.createElement('mark');
        mark.className = className;
        range.surroundContents(mark);
        this.markElements.push(mark);
      } else {
        // For cross-node ranges, highlight each text node individually
        this.highlightRangeNodes(range, className);
      }
    } catch {
      // surroundContents can throw if the range partially selects a non-text node
      this.highlightRangeNodes(range, className);
    }
  }

  private highlightRangeNodes(range: Range, className: string): void {
    if (!this.textMap) return;

    // Collect text nodes within the range
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
    );

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (range.intersectsNode(node)) {
        textNodes.push(node);
      }
    }

    for (const textNode of textNodes) {
      const nodeRange = document.createRange();

      if (textNode === range.startContainer) {
        nodeRange.setStart(textNode, range.startOffset);
      } else {
        nodeRange.setStart(textNode, 0);
      }

      if (textNode === range.endContainer) {
        nodeRange.setEnd(textNode, range.endOffset);
      } else {
        nodeRange.setEnd(textNode, textNode.length);
      }

      if (nodeRange.toString().length === 0) continue;

      const mark = document.createElement('mark');
      mark.className = className;
      try {
        nodeRange.surroundContents(mark);
        this.markElements.push(mark);
      } catch {
        // Skip nodes that can't be wrapped
      }
    }
  }

  private removeMarksByClass(className: string): void {
    const toRemove: HTMLElement[] = [];
    this.markElements = this.markElements.filter((mark) => {
      if (mark.classList.contains(className)) {
        toRemove.push(mark);
        return false;
      }
      return true;
    });

    for (const mark of toRemove) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize(); // merge adjacent text nodes
    }
  }
}
