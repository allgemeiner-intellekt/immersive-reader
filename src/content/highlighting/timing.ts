import { WORDS_PER_MINUTE } from '@shared/constants';
import type { WordTiming } from '@shared/types';

/**
 * Approximate syllable count using vowel-group heuristic.
 * Not perfect, but much better than character count for timing.
 */
function approximateSyllableCount(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleaned.length === 0) return 1;

  // Count vowel groups
  const vowelGroups = cleaned.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  // Silent 'e' at end
  if (cleaned.endsWith('e') && count > 1) count--;

  // 'le' at end after consonant adds a syllable
  if (cleaned.endsWith('le') && cleaned.length > 2 && !/[aeiouy]/.test(cleaned[cleaned.length - 3])) {
    count++;
  }

  return Math.max(count, 1);
}

/** Punctuation-based pause weights */
function getPunctuationPause(word: string): number {
  const lastChar = word[word.length - 1];
  if (!lastChar) return 0;

  // Sentence-ending punctuation
  if (lastChar === '.' || lastChar === '!' || lastChar === '?') return 0.5;
  // Comma, semicolon, colon
  if (lastChar === ',' || lastChar === ';' || lastChar === ':') return 0.3;
  // Dash, em-dash
  if (lastChar === '-' || lastChar === '\u2014' || lastChar === '\u2013') return 0.2;

  return 0;
}

export function estimateWordTimings(
  text: string,
  actualDuration?: number
): WordTiming[] {
  const words: { word: string; charStart: number; charEnd: number }[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    words.push({
      word: match[0],
      charStart: match.index,
      charEnd: match.index + match[0].length,
    });
  }

  if (words.length === 0) return [];

  // Calculate weights for each word
  const weights: number[] = words.map((w) => {
    const syllables = Math.max(approximateSyllableCount(w.word), 0.8);
    const pause = getPunctuationPause(w.word);
    return syllables + pause;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const duration = actualDuration && actualDuration > 0
    ? actualDuration
    : (words.length / WORDS_PER_MINUTE) * 60;

  const timings: WordTiming[] = [];
  let currentTime = 0;

  for (let i = 0; i < words.length; i++) {
    const proportion = weights[i] / totalWeight;
    const wordDuration = duration * proportion;
    timings.push({
      word: words[i].word,
      startTime: currentTime,
      endTime: currentTime + wordDuration,
      charStart: words[i].charStart,
      charEnd: words[i].charEnd,
    });
    currentTime += wordDuration;
  }

  return timings;
}

export function findWordAtTime(timings: WordTiming[], currentTime: number): number {
  for (let i = 0; i < timings.length; i++) {
    if (currentTime >= timings[i].startTime && currentTime < timings[i].endTime) {
      return i;
    }
  }
  // If past all timings, return last word
  if (timings.length > 0 && currentTime >= timings[timings.length - 1].startTime) {
    return timings.length - 1;
  }
  return 0;
}
