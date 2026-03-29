import { Readability } from '@mozilla/readability';
import type { ExtractionResult } from '@shared/types';

// Selectors for elements that should be stripped before scoring
const NOISE_SELECTORS = [
  'nav', 'footer', 'header', 'aside',
  '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
  '.cookie-banner', '.cookie-notice', '.ad', '.ads', '.advertisement',
  '.sidebar', '.social-share', '.related-posts', '.comments',
  '#comments', '.newsletter-signup', '.promo',
  'script', 'style', 'noscript', 'iframe',
];

// High-confidence article selectors
const HIGH_CONFIDENCE_SELECTORS = [
  '.mw-parser-output',
  '[itemprop="articleBody"]',
  '[data-article-body]',
];

// Broader candidate selectors, in rough priority order
const CANDIDATE_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  '.article-body',
  '.article-content',
  '.post-content',
  '.post-body',
  '.entry-content',
  '.story-body',
  '.content-body',
  '.page-content',
  '#article-body',
  '#content',
  '.content',
];

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function stripNoise(root: Element): void {
  for (const sel of NOISE_SELECTORS) {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  }
}

function scoreCandidate(el: Element): number {
  const text = (el as HTMLElement).innerText ?? el.textContent ?? '';
  const words = wordCount(text);

  // Base score: word count (more content = better)
  let score = words;

  // Tag bonus
  const tag = el.tagName.toLowerCase();
  if (tag === 'article') score += 25;
  if (tag === 'main') score += 15;

  // Class/id signals
  const classAndId = `${el.className} ${el.id}`.toLowerCase();
  if (/article|post|entry|story|content/.test(classAndId)) score += 20;
  if (/comment|sidebar|footer|header|nav|menu|ad/.test(classAndId)) score -= 30;

  // Paragraph density: boost elements with many <p> children
  const paragraphs = el.querySelectorAll('p');
  const paragraphText = Array.from(paragraphs)
    .map((p) => p.textContent ?? '')
    .join(' ');
  const paragraphWords = wordCount(paragraphText);
  if (words > 0) {
    const density = paragraphWords / words;
    score += density * 30;
  }

  // Link density penalty: high ratio of link text = navigation, not content
  const links = el.querySelectorAll('a');
  const linkText = Array.from(links)
    .map((a) => a.textContent ?? '')
    .join(' ');
  const linkWords = wordCount(linkText);
  if (words > 0) {
    const linkDensity = linkWords / words;
    if (linkDensity > 0.5) score -= 50;
    else if (linkDensity > 0.3) score -= 20;
  }

  return score;
}

/**
 * Heuristic fallback: find the most likely article root by scoring candidates.
 */
function findArticleRoot(): Element | null {
  // Try high-confidence selectors first
  for (const sel of HIGH_CONFIDENCE_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && wordCount(el.textContent ?? '') > 50) return el;
  }

  // Score broader candidates
  let bestEl: Element | null = null;
  let bestScore = -Infinity;

  for (const sel of CANDIDATE_SELECTORS) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      const s = scoreCandidate(el);
      if (s > bestScore) {
        bestScore = s;
        bestEl = el;
      }
    }
  }

  // Only accept if score is reasonable
  if (bestEl && bestScore > 50) return bestEl;

  return null;
}

/**
 * Extract article content using Readability with a heuristic fallback.
 */
export function extractGeneric(): ExtractionResult | null {
  // Try Readability first
  try {
    const clone = document.cloneNode(true) as Document;
    const article = new Readability(clone).parse();
    if (article && article.textContent && wordCount(article.textContent) > 30) {
      return {
        title: article.title,
        html: article.content,
        textContent: article.textContent,
        wordCount: wordCount(article.textContent),
        sourceElement: null, // Readability works on a clone, no live element
      };
    }
  } catch {
    // Readability failed, fall through to heuristic
  }

  // Heuristic fallback
  const root = findArticleRoot();
  if (!root) return null;

  // Clone root and strip noise
  const cleanRoot = root.cloneNode(true) as Element;
  stripNoise(cleanRoot);

  const textContent = (cleanRoot as HTMLElement).innerText?.trim() ?? cleanRoot.textContent?.trim() ?? '';
  if (!textContent || wordCount(textContent) < 30) return null;

  return {
    title: document.title,
    html: cleanRoot.innerHTML,
    textContent,
    wordCount: wordCount(textContent),
    sourceElement: root,
  };
}
