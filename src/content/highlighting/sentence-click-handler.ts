import type { TextNodeEntry, GlobalSentenceBoundary } from '@shared/types';

const HOVER_HIGHLIGHT = 'ir-hover-sentence';

/** Interactive elements whose clicks should not trigger sentence jump */
const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'label']);

export type SentenceClickCallback = (sentence: GlobalSentenceBoundary) => void;

export class SentenceClickHandler {
  private root: Element;
  private entries: TextNodeEntry[];
  private sentences: GlobalSentenceBoundary[];
  private callback: SentenceClickCallback;
  private hoverHighlight: Highlight;
  private styleEl: HTMLStyleElement | null = null;
  private lastHoveredIndex = -1;
  private throttleTimer: number | null = null;

  constructor(
    root: Element,
    entries: TextNodeEntry[],
    sentences: GlobalSentenceBoundary[],
    callback: SentenceClickCallback
  ) {
    this.root = root;
    this.entries = entries;
    this.sentences = sentences;
    this.callback = callback;

    this.hoverHighlight = new Highlight();
    this.hoverHighlight.priority = 2;
    CSS.highlights.set(HOVER_HIGHLIGHT, this.hoverHighlight);

    this.injectStyles();
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('mousemove', this.handleMouseMove);
    (this.root as HTMLElement).style.cursor = 'pointer';
  }

  updateSentences(sentences: GlobalSentenceBoundary[]): void {
    this.sentences = sentences;
  }

  destroy(): void {
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('mousemove', this.handleMouseMove);
    (this.root as HTMLElement).style.cursor = '';
    CSS.highlights.delete(HOVER_HIGHLIGHT);
    this.hoverHighlight.clear();
    this.styleEl?.remove();
    this.styleEl = null;
    if (this.throttleTimer !== null) {
      cancelAnimationFrame(this.throttleTimer);
      this.throttleTimer = null;
    }
  }

  private handleClick = (e: Event): void => {
    const mouseEvent = e as MouseEvent;

    // Skip clicks on interactive elements
    const target = mouseEvent.target as Element;
    if (target && INTERACTIVE_TAGS.has(target.tagName.toLowerCase())) return;
    if (target && target.closest('a, button, input, select, textarea')) return;

    const globalOffset = this.getGlobalOffsetFromPoint(mouseEvent.clientX, mouseEvent.clientY);
    if (globalOffset === null) return;

    const sentence = this.findSentenceAtOffset(globalOffset);
    if (sentence) {
      this.callback(sentence);
    }
  };

  private handleMouseMove = (e: Event): void => {
    // Throttle to ~30fps
    if (this.throttleTimer !== null) return;
    this.throttleTimer = requestAnimationFrame(() => {
      this.throttleTimer = null;
      const mouseEvent = e as MouseEvent;
      const globalOffset = this.getGlobalOffsetFromPoint(mouseEvent.clientX, mouseEvent.clientY);
      if (globalOffset === null) {
        if (this.lastHoveredIndex !== -1) {
          this.hoverHighlight.clear();
          this.lastHoveredIndex = -1;
        }
        return;
      }

      const sentenceIndex = this.findSentenceIndexAtOffset(globalOffset);
      if (sentenceIndex === this.lastHoveredIndex) return;
      this.lastHoveredIndex = sentenceIndex;

      this.hoverHighlight.clear();
      if (sentenceIndex >= 0) {
        const sentence = this.sentences[sentenceIndex];
        const range = this.createRange(sentence.startOffset, sentence.endOffset);
        if (range) {
          this.hoverHighlight.add(range);
        }
      }
    });
  };

  private getGlobalOffsetFromPoint(x: number, y: number): number | null {
    // Use caretRangeFromPoint (or caretPositionFromPoint) to map click to text position
    let range: Range | null = null;

    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    }

    if (!range) return null;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;

    // Find this text node in entries via binary search
    const localOffset = range.startOffset;
    const textNode = node as Text;

    for (const entry of this.entries) {
      if (entry.node === textNode) {
        return entry.globalStart + localOffset;
      }
    }

    return null;
  }

  private findSentenceAtOffset(globalOffset: number): GlobalSentenceBoundary | null {
    const index = this.findSentenceIndexAtOffset(globalOffset);
    return index >= 0 ? this.sentences[index] : null;
  }

  private findSentenceIndexAtOffset(globalOffset: number): number {
    for (let i = 0; i < this.sentences.length; i++) {
      if (globalOffset >= this.sentences[i].startOffset && globalOffset < this.sentences[i].endOffset) {
        return i;
      }
    }
    return -1;
  }

  private createRange(globalStart: number, globalEnd: number): Range | null {
    const startPos = this.findDOMPosition(globalStart);
    const endPos = this.findDOMPosition(globalEnd);
    if (!startPos || !endPos) return null;

    try {
      const range = document.createRange();
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);
      return range;
    } catch {
      return null;
    }
  }

  private findDOMPosition(globalOffset: number): { node: Text; offset: number } | null {
    if (this.entries.length === 0) return null;

    let lo = 0;
    let hi = this.entries.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const entry = this.entries[mid];
      if (globalOffset < entry.globalStart) {
        hi = mid - 1;
      } else if (globalOffset >= entry.globalEnd) {
        lo = mid + 1;
      } else {
        return { node: entry.node, offset: globalOffset - entry.globalStart };
      }
    }

    if (lo < this.entries.length) {
      return { node: this.entries[lo].node, offset: 0 };
    }
    if (hi >= 0) {
      const entry = this.entries[hi];
      const nodeLen = entry.node.textContent?.length ?? 0;
      return { node: entry.node, offset: nodeLen };
    }

    return null;
  }

  private injectStyles(): void {
    if (document.getElementById('ir-hover-styles')) {
      this.styleEl = document.getElementById('ir-hover-styles') as HTMLStyleElement;
      return;
    }

    const style = document.createElement('style');
    style.id = 'ir-hover-styles';
    style.textContent = `
      ::highlight(${HOVER_HIGHLIGHT}) {
        background-color: rgba(59, 130, 246, 0.08);
      }
    `;
    document.head.appendChild(style);
    this.styleEl = style;
  }
}
