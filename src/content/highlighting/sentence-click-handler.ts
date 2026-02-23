import type { TextNodeEntry, GlobalSentenceBoundary } from '@shared/types';

const HOVER_HIGHLIGHT = 'ir-hover-sentence';

/** Interactive elements whose clicks should not trigger sentence jump */
const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'label']);

export type SentenceClickCallback = (sentence: GlobalSentenceBoundary) => void;

function canUseCssHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

export class SentenceClickHandler {
  private root: Element;
  private entries: TextNodeEntry[];
  private nodeStartMap: WeakMap<Text, number>;
  private sentences: GlobalSentenceBoundary[];
  private callback: SentenceClickCallback;

  private useCssHighlights: boolean;
  private hoverHighlight: Highlight | null = null;
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

    this.nodeStartMap = new WeakMap();
    for (const entry of entries) {
      this.nodeStartMap.set(entry.node, entry.globalStart);
    }

    this.useCssHighlights = canUseCssHighlights();

    if (this.useCssHighlights) {
      this.hoverHighlight = new Highlight();
      this.hoverHighlight.priority = 2;
      CSS.highlights.set(HOVER_HIGHLIGHT, this.hoverHighlight);
      this.root.addEventListener('mousemove', this.handleMouseMove);
    }

    this.root.addEventListener('click', this.handleClick);
  }

  updateSentences(sentences: GlobalSentenceBoundary[]): void {
    this.sentences = sentences;
  }

  destroy(): void {
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('mousemove', this.handleMouseMove);

    if (this.useCssHighlights) {
      CSS.highlights.delete(HOVER_HIGHLIGHT);
      this.hoverHighlight?.clear();
      this.hoverHighlight = null;
    }

    if (this.throttleTimer !== null) {
      cancelAnimationFrame(this.throttleTimer);
      this.throttleTimer = null;
    }
  }

  private handleClick = (e: Event): void => {
    // Skip if user is selecting text (drag-select, triple-click, etc.)
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;

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
    if (!this.useCssHighlights || !this.hoverHighlight) return;

    // Throttle to ~60fps (per rAF)
    if (this.throttleTimer !== null) return;
    this.throttleTimer = requestAnimationFrame(() => {
      this.throttleTimer = null;
      const mouseEvent = e as MouseEvent;
      const globalOffset = this.getGlobalOffsetFromPoint(mouseEvent.clientX, mouseEvent.clientY);
      if (globalOffset === null) {
        if (this.lastHoveredIndex !== -1) {
          this.hoverHighlight!.clear();
          this.lastHoveredIndex = -1;
        }
        return;
      }

      const sentenceIndex = this.findSentenceIndexAtOffset(globalOffset);
      if (sentenceIndex === this.lastHoveredIndex) return;
      this.lastHoveredIndex = sentenceIndex;

      this.hoverHighlight!.clear();
      if (sentenceIndex >= 0) {
        const sentence = this.sentences[sentenceIndex];
        const range = this.createRange(sentence.startOffset, sentence.endOffset);
        if (range) {
          this.hoverHighlight!.add(range);
        }
      }
    });
  };

  private getGlobalOffsetFromPoint(x: number, y: number): number | null {
    const caret = this.getCaretAtPoint(x, y);
    if (!caret) return null;

    const base = this.nodeStartMap.get(caret.node);
    if (base === undefined) return null;
    return base + caret.offset;
  }

  private getCaretAtPoint(x: number, y: number): { node: Text; offset: number } | null {
    // Prefer caretPositionFromPoint when available
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      return this.resolveTextNode(pos.offsetNode, pos.offset);
    }

    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (!range) return null;
      return this.resolveTextNode(range.startContainer, range.startOffset);
    }

    return null;
  }

  private resolveTextNode(node: Node | null, offset: number): { node: Text; offset: number } | null {
    if (!node) return null;

    if (node.nodeType === Node.TEXT_NODE) {
      return { node: node as Text, offset };
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;

    const childAtOffset =
      offset >= 0 && offset < el.childNodes.length ? el.childNodes[offset] : null;
    if (childAtOffset) {
      const first = this.findFirstTextNode(childAtOffset);
      if (first) return { node: first, offset: 0 };
    }

    const prevChild =
      offset > 0 && offset - 1 < el.childNodes.length ? el.childNodes[offset - 1] : null;
    if (prevChild) {
      const last = this.findLastTextNode(prevChild);
      if (last) {
        const len = last.textContent?.length ?? 0;
        return { node: last, offset: len };
      }
    }

    return null;
  }

  private findFirstTextNode(node: Node): Text | null {
    if (node.nodeType === Node.TEXT_NODE) return node as Text;

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    return walker.nextNode() as Text | null;
  }

  private findLastTextNode(node: Node): Text | null {
    if (node.nodeType === Node.TEXT_NODE) return node as Text;

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    let current: Node | null;
    while ((current = walker.nextNode())) {
      last = current as Text;
    }
    return last;
  }

  private findSentenceAtOffset(globalOffset: number): GlobalSentenceBoundary | null {
    const index = this.findSentenceIndexAtOffset(globalOffset);
    return index >= 0 ? this.sentences[index] : null;
  }

  private findSentenceIndexAtOffset(globalOffset: number): number {
    let lo = 0;
    let hi = this.sentences.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const s = this.sentences[mid];

      if (globalOffset < s.startOffset) {
        hi = mid - 1;
      } else if (globalOffset >= s.endOffset) {
        lo = mid + 1;
      } else {
        return mid;
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
}

