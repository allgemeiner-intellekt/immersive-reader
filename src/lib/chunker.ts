import type { TextChunk } from '@shared/types';
import { splitSentenceStrings } from '../content/extraction/sentence-splitter';

const TARGET_MIN_WORDS = 15;
const TARGET_MAX_WORDS = 25;
const MAX_WORDS_BEFORE_SPLIT = 50;
const MIN_WORDS_FOR_STANDALONE = 5;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Split a long sentence at clause boundaries (comma, semicolon, em-dash).
 */
function splitAtClauseBoundary(text: string): string[] {
  // Split at comma/semicolon/em-dash followed by a space
  const parts = text.split(/(?<=[,;\u2014])\s+/);
  if (parts.length <= 1) return [text];

  // Merge parts to stay within target range
  const merged: string[] = [];
  let current = '';

  for (const part of parts) {
    const combined = current ? `${current} ${part}` : part;
    if (countWords(combined) > TARGET_MAX_WORDS && current) {
      merged.push(current.trim());
      current = part;
    } else {
      current = combined;
    }
  }
  if (current.trim()) merged.push(current.trim());

  return merged;
}

/**
 * Split text into TTS-friendly chunks.
 *
 * Strategy:
 * 1. Split by paragraphs
 * 2. Split each paragraph into sentences
 * 3. Merge short sentences, split long ones
 * 4. Target 15-25 words per chunk
 */
export function chunkText(text: string): TextChunk[] {
  if (!text.trim()) return [];

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const rawChunks: string[] = [];

  for (const para of paragraphs) {
    const sentences = splitSentenceStrings(para.trim());
    let buffer = '';

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceWords = countWords(sentence);

      // Very long sentence: split at clause boundary
      if (sentenceWords > MAX_WORDS_BEFORE_SPLIT) {
        if (buffer.trim()) {
          rawChunks.push(buffer.trim());
          buffer = '';
        }
        const clauses = splitAtClauseBoundary(sentence);
        for (const clause of clauses) {
          rawChunks.push(clause);
        }
        continue;
      }

      // Short sentence: try to merge with buffer
      if (sentenceWords < MIN_WORDS_FOR_STANDALONE) {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
        if (countWords(buffer) >= TARGET_MIN_WORDS) {
          rawChunks.push(buffer.trim());
          buffer = '';
        }
        continue;
      }

      // Normal sentence: check if adding to buffer hits target range
      const combined = buffer ? `${buffer} ${sentence}` : sentence;
      const combinedWords = countWords(combined);

      if (combinedWords <= TARGET_MAX_WORDS) {
        buffer = combined;
        if (combinedWords >= TARGET_MIN_WORDS) {
          rawChunks.push(buffer.trim());
          buffer = '';
        }
      } else {
        // Buffer is full enough or sentence is standalone
        if (buffer.trim()) {
          rawChunks.push(buffer.trim());
        }
        buffer = sentence;
      }
    }

    // Flush remaining buffer at paragraph end
    if (buffer.trim()) {
      rawChunks.push(buffer.trim());
      buffer = '';
    }
  }

  // Build TextChunk array with offsets
  const chunks: TextChunk[] = [];
  let globalOffset = 0;

  for (let i = 0; i < rawChunks.length; i++) {
    const chunkText = rawChunks[i];
    // Find the chunk in the original text starting from globalOffset
    const idx = text.indexOf(chunkText, globalOffset);
    const startOffset = idx >= 0 ? idx : globalOffset;
    const endOffset = startOffset + chunkText.length;

    chunks.push({
      index: i,
      text: chunkText,
      startOffset,
      endOffset,
      wordCount: countWords(chunkText),
    });

    if (idx >= 0) {
      globalOffset = endOffset;
    }
  }

  return chunks;
}
