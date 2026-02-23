import type { Segment } from '@shared/types';
import {
  SEGMENT_MIN_CHARS,
  SEGMENT_MAX_CHARS,
  SENTENCES_PER_SEGMENT,
} from '@shared/constants';
import { splitSentenceStrings } from './sentence-splitter';

export function segmentText(text: string): Segment[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const segments: Segment[] = [];
  let globalOffset = 0;
  let segmentId = 0;

  for (const paragraph of paragraphs) {
    // Find where this paragraph starts in the original text
    const paraStart = text.indexOf(paragraph, globalOffset);
    if (paraStart === -1) continue;

    const sentences = splitSentenceStrings(paragraph);
    let groupText = '';
    let groupSentenceCount = 0;
    let groupStart = paraStart;

    for (const sentence of sentences) {
      groupText += sentence;
      groupSentenceCount++;

      const reachedSentenceTarget = groupSentenceCount >= SENTENCES_PER_SEGMENT;
      const reachedMaxChars = groupText.length >= SEGMENT_MAX_CHARS;
      const longEnough = groupText.trim().length >= SEGMENT_MIN_CHARS;

      if ((reachedSentenceTarget && longEnough) || reachedMaxChars) {
        segments.push({
          id: segmentId++,
          text: groupText,
          startOffset: groupStart,
          endOffset: groupStart + groupText.length,
          wordCount: countWords(groupText),
        });
        groupStart = groupStart + groupText.length;
        groupText = '';
        groupSentenceCount = 0;
      }
    }

    // Remaining sentences in this paragraph
    if (groupText.length > 0) {
      if (groupText.trim().length >= SEGMENT_MIN_CHARS) {
        segments.push({
          id: segmentId++,
          text: groupText,
          startOffset: groupStart,
          endOffset: groupStart + groupText.length,
          wordCount: countWords(groupText),
        });
      } else if (segments.length > 0) {
        // Merge with previous segment if too short (preserve exact source text)
        const prev = segments[segments.length - 1];
        const gap = text.slice(prev.endOffset, groupStart);
        prev.text += gap + groupText;
        prev.endOffset = groupStart + groupText.length;
        prev.wordCount = countWords(prev.text);
      } else if (groupText.trim().length > 0) {
        // First segment, even if short
        segments.push({
          id: segmentId++,
          text: groupText,
          startOffset: groupStart,
          endOffset: groupStart + groupText.length,
          wordCount: countWords(groupText),
        });
      }
    }

    globalOffset = paraStart + paragraph.length;
  }

  return segments;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}
