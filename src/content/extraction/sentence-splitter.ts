import type { SentenceBoundary } from '@shared/types';

/** Common abbreviations that should not be treated as sentence endings */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'ave', 'blvd',
  'gen', 'gov', 'sgt', 'cpl', 'pvt', 'capt', 'lt', 'col', 'maj',
  'dept', 'univ', 'est', 'approx', 'inc', 'ltd', 'co', 'corp',
  'vs', 'etc', 'al', 'fig', 'vol', 'no', 'op', 'ed',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]);

/** Two-letter abbreviations like "e.g.", "i.e.", "U.S." */
const MULTI_DOT_ABBREVS = /^(?:[a-zA-Z]\.){2,}$/;

/**
 * Split text into sentences with better handling of abbreviations,
 * decimals, ellipses, and other tricky cases.
 *
 * A period is a sentence boundary only if:
 * - It's followed by whitespace + uppercase letter (or end of text)
 * - It's NOT preceded by a known abbreviation
 * - It's NOT between digits (decimals like 3.99)
 * - Ellipsis (...) is treated as a single punctuation unit
 *
 * Returns SentenceBoundary[] with offsets relative to baseOffset.
 */
export function splitSentences(text: string, baseOffset = 0): SentenceBoundary[] {
  const boundaries: SentenceBoundary[] = [];
  let sentenceStart = 0;

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '.' || ch === '!' || ch === '?') {
      // Consume the full punctuation cluster (e.g., "...", "?!", "!!")
      let punctEnd = i + 1;
      while (punctEnd < text.length && (text[punctEnd] === '.' || text[punctEnd] === '!' || text[punctEnd] === '?')) {
        punctEnd++;
      }

      // Check if this is a sentence boundary
      if (isSentenceBoundary(text, i, punctEnd)) {
        // Consume trailing whitespace
        let end = punctEnd;
        while (end < text.length && (text[end] === ' ' || text[end] === '\t')) {
          end++;
        }

        const sentenceText = text.slice(sentenceStart, end);
        if (sentenceText.trim().length > 0) {
          boundaries.push({
            text: sentenceText,
            startOffset: baseOffset + sentenceStart,
            endOffset: baseOffset + sentenceText.trimEnd().length + sentenceStart,
          });
        }
        sentenceStart = end;
        i = end;
        continue;
      }

      i = punctEnd;
      continue;
    }

    i++;
  }

  // Remaining text after last boundary
  if (sentenceStart < text.length) {
    const remaining = text.slice(sentenceStart);
    if (remaining.trim().length > 0) {
      boundaries.push({
        text: remaining,
        startOffset: baseOffset + sentenceStart,
        endOffset: baseOffset + sentenceStart + remaining.trimEnd().length,
      });
    }
  }

  // Fallback: whole text is one sentence
  if (boundaries.length === 0 && text.trim().length > 0) {
    boundaries.push({
      text,
      startOffset: baseOffset,
      endOffset: baseOffset + text.trimEnd().length,
    });
  }

  return boundaries;
}

/**
 * Also export a simple string[] version for use in segmenter.ts,
 * which needs sentence strings rather than boundary objects.
 */
export function splitSentenceStrings(text: string): string[] {
  const boundaries = splitSentences(text);
  return boundaries.map((b) => b.text);
}

function isSentenceBoundary(text: string, punctStart: number, punctEnd: number): boolean {
  // Period between digits → decimal (e.g., "3.99", "$12.50")
  if (text[punctStart] === '.' && punctEnd === punctStart + 1) {
    if (punctStart > 0 && punctEnd < text.length) {
      const before = text[punctStart - 1];
      const after = text[punctEnd];
      if (/\d/.test(before) && /\d/.test(after)) {
        return false;
      }
    }
  }

  // Single period: check for abbreviation
  if (text[punctStart] === '.' && punctEnd === punctStart + 1) {
    // Find the word before the period
    const wordBefore = getWordBefore(text, punctStart);

    if (wordBefore) {
      // Known abbreviation (e.g., "Dr.", "Mr.", "etc.")
      if (ABBREVIATIONS.has(wordBefore.toLowerCase())) {
        return false;
      }

      // Single uppercase letter followed by period (initial: "J. K. Rowling")
      if (wordBefore.length === 1 && /[A-Z]/.test(wordBefore)) {
        return false;
      }

      // Multi-dot abbreviation (e.g., "U.S.", "e.g.")
      const fullToken = getTokenBefore(text, punctEnd);
      if (fullToken && MULTI_DOT_ABBREVS.test(fullToken)) {
        return false;
      }
    }
  }

  // Must be followed by whitespace+uppercase, newline, or end of text to be a boundary
  if (punctEnd >= text.length) {
    return true; // End of text
  }

  // Check what follows the punctuation
  let afterPunct = punctEnd;
  // Skip whitespace
  while (afterPunct < text.length && /\s/.test(text[afterPunct])) {
    afterPunct++;
  }

  if (afterPunct >= text.length) {
    return true; // Only whitespace until end
  }

  // Next non-whitespace character should be uppercase, quote, or opening bracket
  const nextChar = text[afterPunct];
  if (/[A-Z"\u201C\u2018([\u2014\u2013]/.test(nextChar)) {
    return true;
  }

  // For ! and ?, be more lenient — these almost always end sentences
  if (text[punctStart] === '!' || text[punctStart] === '?') {
    // Unless followed by a closing quote/paren immediately
    if (/\s/.test(text[punctEnd] || '')) {
      return true;
    }
  }

  return false;
}

function getWordBefore(text: string, pos: number): string | null {
  let end = pos;
  let start = end - 1;
  while (start >= 0 && /[a-zA-Z]/.test(text[start])) {
    start--;
  }
  start++;
  if (start >= end) return null;
  return text.slice(start, end);
}

function getTokenBefore(text: string, pos: number): string | null {
  let start = pos - 1;
  while (start >= 0 && /[a-zA-Z.]/.test(text[start])) {
    start--;
  }
  start++;
  if (start >= pos) return null;
  return text.slice(start, pos);
}
