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
    let sentenceGroup: string[] = [];
    let groupStart = paraStart;

    for (const sentence of sentences) {
      sentenceGroup.push(sentence);

      if (sentenceGroup.length >= SENTENCES_PER_SEGMENT) {
        const groupText = sentenceGroup.join('');
        if (groupText.trim().length >= SEGMENT_MIN_CHARS) {
          segments.push({
            id: segmentId++,
            text: groupText.trim(),
            startOffset: groupStart,
            endOffset: groupStart + groupText.length,
            wordCount: countWords(groupText),
          });
        }
        groupStart = groupStart + groupText.length;
        sentenceGroup = [];
      }

      // Enforce max chars
      const currentText = sentenceGroup.join('');
      if (currentText.length >= SEGMENT_MAX_CHARS) {
        if (currentText.trim().length >= SEGMENT_MIN_CHARS) {
          segments.push({
            id: segmentId++,
            text: currentText.trim(),
            startOffset: groupStart,
            endOffset: groupStart + currentText.length,
            wordCount: countWords(currentText),
          });
        }
        groupStart = groupStart + currentText.length;
        sentenceGroup = [];
      }
    }

    // Remaining sentences in this paragraph
    if (sentenceGroup.length > 0) {
      const groupText = sentenceGroup.join('');
      if (groupText.trim().length >= SEGMENT_MIN_CHARS) {
        segments.push({
          id: segmentId++,
          text: groupText.trim(),
          startOffset: groupStart,
          endOffset: groupStart + groupText.length,
          wordCount: countWords(groupText),
        });
      } else if (segments.length > 0) {
        // Merge with previous segment if too short
        const prev = segments[segments.length - 1];
        prev.text += ' ' + groupText.trim();
        prev.endOffset = groupStart + groupText.length;
        prev.wordCount = countWords(prev.text);
      } else if (groupText.trim().length > 0) {
        // First segment, even if short
        segments.push({
          id: segmentId++,
          text: groupText.trim(),
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
