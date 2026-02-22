import type { TextNodeEntry, Segment, WordTiming, SentenceBoundary } from '@shared/types';
import { estimateWordTimings, findWordAtTime } from './timing';
import { splitSentences } from '../extraction/sentence-splitter';
import { autoScrollRange } from './scroller';

const SENTENCE_HIGHLIGHT = 'ir-sentence';
const WORD_HIGHLIGHT = 'ir-active-word';

/** EMA smoothing factor for calibration */
const EMA_ALPHA = 0.3;

export class Highlighter {
  private entries: TextNodeEntry[];
  private segments: Segment[];
  private sentenceHighlight: Highlight;
  private wordHighlight: Highlight;
  private styleEl: HTMLStyleElement | null = null;

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

    this.sentenceHighlight = new Highlight();
    this.sentenceHighlight.priority = 0;
    this.wordHighlight = new Highlight();
    this.wordHighlight.priority = 1;

    CSS.highlights.set(SENTENCE_HIGHLIGHT, this.sentenceHighlight);
    CSS.highlights.set(WORD_HIGHLIGHT, this.wordHighlight);

    this.injectStyles();
  }

  activateSegment(segmentIndex: number): void {
    const segment = this.segments[segmentIndex];
    if (!segment) return;

    // Clear previous highlights
    this.sentenceHighlight.clear();
    this.wordHighlight.clear();

    this.activeSegmentIndex = segmentIndex;
    this.timingsLockedToFinalDuration = false;
    this.hasEarlyCalibratedThisSegment = false;

    // Parse sentences using shared splitter
    this.sentences = splitSentences(segment.text, segment.startOffset);

    // Estimate word timings with calibration factor applied
    this.naiveEstimate = 0; // will be set below
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
      const sentenceRange = this.createRange(
        this.sentences[0].startOffset,
        this.sentences[0].endOffset
      );
      if (sentenceRange) {
        this.sentenceHighlight.add(sentenceRange);
      }
    }

    // Activate first word
    if (this.wordTimings.length > 0) {
      this.activeWordIndex = 0;
      const wt = this.wordTimings[0];
      const wordRange = this.createRange(
        segment.startOffset + wt.charStart,
        segment.startOffset + wt.charEnd
      );
      if (wordRange) {
        this.wordHighlight.add(wordRange);
        autoScrollRange(wordRange);
      }
    }
  }

  updateProgress(currentTime: number, duration: number, durationFinal: boolean): void {
    if (this.wordTimings.length === 0) return;
    const segment = this.segments[this.activeSegmentIndex];
    if (!segment) return;

    // Early recalibration: when we have partial duration info (before durationFinal)
    if (!this.timingsLockedToFinalDuration && !this.hasEarlyCalibratedThisSegment &&
        duration > 0 && currentTime > 0.5) {
      this.hasEarlyCalibratedThisSegment = true;
      this.wordTimings = estimateWordTimings(segment.text, duration);
    }

    // Recalculate timings when we get final duration (only once)
    if (durationFinal && duration > 0 && !this.timingsLockedToFinalDuration) {
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

    // Update word highlight
    this.wordHighlight.clear();
    if (wordIndex >= 0 && wordIndex < this.wordTimings.length) {
      const wt = this.wordTimings[wordIndex];
      const wordRange = this.createRange(
        segment.startOffset + wt.charStart,
        segment.startOffset + wt.charEnd
      );
      if (wordRange) {
        this.wordHighlight.add(wordRange);
        autoScrollRange(wordRange);
      }
    }
    this.activeWordIndex = wordIndex;

    // Check if we've moved to a new sentence
    if (wordIndex >= 0 && this.sentences.length > 0) {
      const globalCharPos = segment.startOffset + this.wordTimings[wordIndex].charStart;
      const newSentenceIndex = this.findSentenceIndex(globalCharPos);
      if (newSentenceIndex !== this.activeSentenceIndex && newSentenceIndex >= 0) {
        this.activeSentenceIndex = newSentenceIndex;
        this.sentenceHighlight.clear();
        const sentenceRange = this.createRange(
          this.sentences[newSentenceIndex].startOffset,
          this.sentences[newSentenceIndex].endOffset
        );
        if (sentenceRange) {
          this.sentenceHighlight.add(sentenceRange);
        }
      }
    }
  }

  deactivateSegment(): void {
    this.sentenceHighlight.clear();
    this.wordHighlight.clear();
    this.wordTimings = [];
    this.sentences = [];
    this.activeWordIndex = -1;
    this.activeSentenceIndex = -1;
  }

  deactivateAll(): void {
    this.deactivateSegment();
    CSS.highlights.delete(SENTENCE_HIGHLIGHT);
    CSS.highlights.delete(WORD_HIGHLIGHT);
    this.removeStyles();
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

    // Binary search for the entry containing this offset
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
        // Found: offset is within this entry
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
    // If past all sentences, return last
    if (this.sentences.length > 0) {
      return this.sentences.length - 1;
    }
    return -1;
  }

  private injectStyles(): void {
    if (document.getElementById('ir-highlight-styles')) {
      this.styleEl = document.getElementById('ir-highlight-styles') as HTMLStyleElement;
      return;
    }

    const style = document.createElement('style');
    style.id = 'ir-highlight-styles';
    style.textContent = `
      ::highlight(${SENTENCE_HIGHLIGHT}) {
        background-color: #F5F5F5;
      }
      ::highlight(${WORD_HIGHLIGHT}) {
        background-color: #3A3A3A;
        color: #FFFFFF;
      }
    `;
    document.head.appendChild(style);
    this.styleEl = style;
  }

  private removeStyles(): void {
    this.styleEl?.remove();
    this.styleEl = null;
  }
}
