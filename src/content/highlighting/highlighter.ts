import type { TextNodeEntry, Segment, WordTiming, SentenceBoundary } from '@shared/types';
import { estimateWordTimings, findWordAtTime } from './timing';
import { splitSentences } from '../extraction/sentence-splitter';

const SENTENCE_HIGHLIGHT = 'ir-sentence';

/** EMA smoothing factor for calibration */
const EMA_ALPHA = 0.3;

function canUseCssHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

export class Highlighter {
  private entries: TextNodeEntry[];
  private segments: Segment[];

  private useCssHighlights: boolean;
  private sentenceHighlight: Highlight | null = null;

  private overlayRoot: HTMLDivElement | null = null;
  private overlayOffsets: { start: number; end: number } | null = null;
  private overlayRaf: number | null = null;

  private wordTimings: WordTiming[] = [];
  private sentences: SentenceBoundary[] = [];
  private activeWordIndex = -1;
  private activeSentenceIndex = -1;
  private activeSegmentIndex = -1;
  private timingsLockedToFinalDuration = false;

  /** Cross-segment EMA calibration factor */
  private durationCalibrationFactor = 1.0;
  private calibrationSamples = 0;
  private naiveEstimate = 0;
  private hasEarlyCalibratedThisSegment = false;

  constructor(entries: TextNodeEntry[], segments: Segment[]) {
    this.entries = entries;
    this.segments = segments;

    this.useCssHighlights = canUseCssHighlights();

    if (this.useCssHighlights) {
      this.sentenceHighlight = new Highlight();
      this.sentenceHighlight.priority = 0;
      CSS.highlights.set(SENTENCE_HIGHLIGHT, this.sentenceHighlight);
    } else {
      this.mountOverlay();
    }
  }

  activateSegment(segmentIndex: number): void {
    const segment = this.segments[segmentIndex];
    if (!segment) return;

    this.clearHighlight();

    this.activeSegmentIndex = segmentIndex;
    this.timingsLockedToFinalDuration = false;
    this.hasEarlyCalibratedThisSegment = false;

    // Parse sentences using shared splitter
    this.sentences = splitSentences(segment.text, segment.startOffset);

    // Estimate word timings with calibration factor applied
    this.naiveEstimate = 0;
    const rawTimings = estimateWordTimings(segment.text);
    if (rawTimings.length > 0) {
      this.naiveEstimate = rawTimings[rawTimings.length - 1].endTime;
    }
    const calibratedDuration = this.naiveEstimate * this.durationCalibrationFactor;
    this.wordTimings = calibratedDuration > 0
      ? estimateWordTimings(segment.text, calibratedDuration)
      : rawTimings;

    this.activeWordIndex = -1;
    this.activeSentenceIndex = -1;

    // Activate first sentence
    if (this.sentences.length > 0) {
      this.activeSentenceIndex = 0;
      this.highlightSentence(this.sentences[0].startOffset, this.sentences[0].endOffset);
    }
  }

  updateProgress(currentTime: number, duration: number, durationFinal: boolean): void {
    if (this.wordTimings.length === 0) return;
    const segment = this.segments[this.activeSegmentIndex];
    if (!segment) return;

    const durationUsable = Number.isFinite(duration) && duration > 0;

    // Early recalibration: only when duration is finite
    if (
      durationUsable &&
      !this.timingsLockedToFinalDuration &&
      !this.hasEarlyCalibratedThisSegment &&
      currentTime > 0.5
    ) {
      this.hasEarlyCalibratedThisSegment = true;
      this.wordTimings = estimateWordTimings(segment.text, duration);
    }

    // Recalculate timings when we get final finite duration (only once)
    if (durationFinal && durationUsable && !this.timingsLockedToFinalDuration) {
      this.timingsLockedToFinalDuration = true;
      this.wordTimings = estimateWordTimings(segment.text, duration);

      // Update EMA calibration factor
      if (this.naiveEstimate > 0) {
        const observedFactor = duration / this.naiveEstimate;
        if (this.calibrationSamples === 0) {
          this.durationCalibrationFactor = observedFactor;
        } else {
          this.durationCalibrationFactor =
            EMA_ALPHA * observedFactor + (1 - EMA_ALPHA) * this.durationCalibrationFactor;
        }
        this.calibrationSamples++;
      }
    }

    const wordIndex = findWordAtTime(this.wordTimings, currentTime);
    if (wordIndex === this.activeWordIndex) return;
    this.activeWordIndex = wordIndex;

    // Check if we've moved to a new sentence
    if (wordIndex >= 0 && this.sentences.length > 0) {
      const globalCharPos = segment.startOffset + this.wordTimings[wordIndex].charStart;
      const newSentenceIndex = this.findSentenceIndex(globalCharPos);
      if (newSentenceIndex !== this.activeSentenceIndex && newSentenceIndex >= 0) {
        this.activeSentenceIndex = newSentenceIndex;
        this.highlightSentence(
          this.sentences[newSentenceIndex].startOffset,
          this.sentences[newSentenceIndex].endOffset
        );
      }
    }
  }

  deactivateSegment(): void {
    this.clearHighlight();
    this.wordTimings = [];
    this.sentences = [];
    this.activeWordIndex = -1;
    this.activeSentenceIndex = -1;
    this.activeSegmentIndex = -1;
  }

  deactivateAll(): void {
    this.deactivateSegment();

    if (this.useCssHighlights) {
      CSS.highlights.delete(SENTENCE_HIGHLIGHT);
      this.sentenceHighlight = null;
      return;
    }

    this.unmountOverlay();
  }

  /**
   * Create a DOM Range spanning from globalStart to globalEnd in the
   * text node map. Uses binary search + boundary snapping.
   */
  createRange(globalStart: number, globalEnd: number): Range | null {
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

  /**
   * Binary search through entries to find the text node + local offset
   * for a given global character offset. Snaps to nearest entry boundary
   * when the offset falls in a separator gap.
   */
  findDOMPosition(globalOffset: number): { node: Text; offset: number } | null {
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
        return {
          node: entry.node,
          offset: globalOffset - entry.globalStart,
        };
      }
    }

    // Offset falls in a gap (separator). Snap to nearest boundary.
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

  /** Get the current word timings (used by sentence click handler for seeking) */
  getWordTimings(): WordTiming[] {
    return this.wordTimings;
  }

  /** Get current sentences (used by sentence click handler) */
  getSentences(): SentenceBoundary[] {
    return this.sentences;
  }

  /** Get active segment index */
  getActiveSegmentIndex(): number {
    return this.activeSegmentIndex;
  }

  private findSentenceIndex(globalCharPos: number): number {
    for (let i = 0; i < this.sentences.length; i++) {
      if (globalCharPos >= this.sentences[i].startOffset && globalCharPos < this.sentences[i].endOffset) {
        return i;
      }
    }
    if (this.sentences.length > 0) {
      return this.sentences.length - 1;
    }
    return -1;
  }

  private clearHighlight(): void {
    if (this.useCssHighlights) {
      this.sentenceHighlight?.clear();
      return;
    }

    this.overlayOffsets = null;
    this.renderOverlay();
  }

  private highlightSentence(globalStart: number, globalEnd: number): void {
    if (this.useCssHighlights) {
      this.sentenceHighlight?.clear();
      const range = this.createRange(globalStart, globalEnd);
      if (range) {
        this.sentenceHighlight?.add(range);
      }
      return;
    }

    this.overlayOffsets = { start: globalStart, end: globalEnd };
    this.renderOverlay();
  }

  private mountOverlay(): void {
    if (this.overlayRoot) return;

    const root = document.createElement('div');
    root.className = 'ir-highlight-overlay';

    const parent = document.body ?? document.documentElement;
    parent.appendChild(root);
    this.overlayRoot = root;

    document.addEventListener('scroll', this.handleOverlayViewportChange, true);
    window.addEventListener('resize', this.handleOverlayViewportChange);
  }

  private unmountOverlay(): void {
    document.removeEventListener('scroll', this.handleOverlayViewportChange, true);
    window.removeEventListener('resize', this.handleOverlayViewportChange);

    if (this.overlayRaf !== null) {
      cancelAnimationFrame(this.overlayRaf);
      this.overlayRaf = null;
    }

    this.overlayOffsets = null;
    this.overlayRoot?.remove();
    this.overlayRoot = null;
  }

  private handleOverlayViewportChange = (): void => {
    if (!this.overlayOffsets) return;
    if (this.overlayRaf !== null) return;

    this.overlayRaf = requestAnimationFrame(() => {
      this.overlayRaf = null;
      this.renderOverlay();
    });
  };

  private renderOverlay(): void {
    if (!this.overlayRoot) return;
    this.overlayRoot.replaceChildren();

    if (!this.overlayOffsets) return;

    const range = this.createRange(this.overlayOffsets.start, this.overlayOffsets.end);
    if (!range) return;

    const rects = Array.from(range.getClientRects());
    for (const rect of rects) {
      if (rect.width <= 0 || rect.height <= 0) continue;

      const el = document.createElement('div');
      el.className = 'ir-sentence-overlay-rect';
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      this.overlayRoot.appendChild(el);
    }
  }
}

