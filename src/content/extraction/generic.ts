import { Readability } from '@mozilla/readability';
import type { ExtractionResult } from '@shared/types';

export function extractGeneric(): ExtractionResult | null {
  // Clone document before Readability parse (it modifies the DOM)
  const clone = document.cloneNode(true) as Document;
  const reader = new Readability(clone);
  const article = reader.parse();

  if (!article) {
    // Fallback: try article root (no body fallback)
    const root = findArticleRoot();
    if (!root) return null;
    const sourceElement = root as HTMLElement;
    const text = sourceElement.innerText;
    if (!text.trim()) return null;
    return {
      title: document.title,
      html: sourceElement.innerHTML,
      textContent: text,
      wordCount: countWords(text),
      sourceElement,
    };
  }

  // Find the source element in the live DOM
  const sourceElement = findArticleRoot();

  // Set textContent to '' — the caller (App.tsx) will use buildTextNodeMap's
  // text instead, guaranteeing offset alignment with the live DOM.
  return {
    title: article.title,
    html: article.content,
    textContent: '',
    wordCount: sourceElement
      ? countWords((sourceElement as HTMLElement).innerText)
      : countWords(article.textContent),
    sourceElement,
  };
}

/** High-confidence selectors tried first without scoring */
const HIGH_CONFIDENCE_SELECTORS = [
  '.mw-parser-output',
  '[itemprop="articleBody"]',
  '[data-article-body]',
];

/** Broader candidate selectors scored by heuristics */
const CANDIDATE_SELECTORS = [
  '#mw-content-text',
  'article',
  '[role="main"]',
  'main',
  '.article-body',
  '.post-content',
  '.article-content',
  '.entry-content',
  '.story-body',
  '.blog-post',
  '.td-post-content',
  '.content',
  '#content',
  'section',
];

/** Regex patterns for class/ID signals */
const POSITIVE_SIGNAL = /article|post|entry|content|story|body/i;
const NEGATIVE_SIGNAL = /sidebar|nav|menu|footer|comment|ad|widget|social|promo|related/i;

export function findArticleRoot(): Element | null {
  // Phase 1: Try high-confidence selectors first
  for (const selector of HIGH_CONFIDENCE_SELECTORS) {
    const el = document.querySelector(selector);
    if (el && el.textContent && el.textContent.trim().length > 200) {
      return el;
    }
  }

  // Phase 2: Score candidate elements
  const candidates: { el: Element; score: number }[] = [];

  for (const selector of CANDIDATE_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent?.trim() ?? '';
      if (text.length < 100) continue;

      const score = scoreCandidate(el, text);
      candidates.push({ el, score });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Return the best candidate if it has a positive score
  if (candidates[0].score > 0) {
    return candidates[0].el;
  }

  return null;
}

function scoreCandidate(el: Element, text: string): number {
  let score = 0;
  const wordCount = countWords(text);

  // Word count: up to 30 points
  score += Math.min(wordCount / 10, 30);

  // Tag bonus
  const tag = el.tagName.toLowerCase();
  if (tag === 'article') score += 25;
  else if (tag === 'main') score += 15;
  if (el.getAttribute('role') === 'main') score += 15;

  // Class/ID signals
  const classAndId = `${el.className} ${el.id}`;
  if (POSITIVE_SIGNAL.test(classAndId)) score += 15;
  if (NEGATIVE_SIGNAL.test(classAndId)) score -= 30;

  // Paragraph density: reward <p>-heavy content
  const paragraphs = el.querySelectorAll('p');
  let pTextLength = 0;
  for (const p of paragraphs) {
    pTextLength += (p.textContent?.length ?? 0);
  }
  const totalTextLength = text.length;
  if (totalTextLength > 0) {
    score += (pTextLength / totalTextLength) * 20;
  }

  // Link density penalty
  const links = el.querySelectorAll('a');
  let linkTextLength = 0;
  for (const a of links) {
    linkTextLength += (a.textContent?.length ?? 0);
  }
  if (totalTextLength > 0 && linkTextLength / totalTextLength > 0.3) {
    score -= 20;
  }

  // Depth penalty: elements < 2 levels deep from body
  let depth = 0;
  let current: Element | null = el;
  while (current && current !== document.body) {
    depth++;
    current = current.parentElement;
  }
  if (depth < 2) score -= 10;

  return score;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
