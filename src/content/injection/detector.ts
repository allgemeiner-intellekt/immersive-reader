import { PLAY_BUTTON_WORD_THRESHOLD, PARAGRAPH_MIN_WORDS } from '@shared/constants';
import { findArticleRoot } from '../extraction/generic';

export interface TextBlock {
  element: Element;
  wordCount: number;
}

export type PageType = 'article' | 'reference' | 'email' | 'generic';

/** Non-content ancestors to skip when detecting paragraphs */
const SKIP_ANCESTORS = 'nav, footer, aside, header, [role="navigation"], [role="complementary"], .sidebar, .toc, .navbox, .infobox';

export function detectPageType(): PageType {
  const hostname = window.location.hostname;

  // Gmail
  if (hostname === 'mail.google.com') return 'email';

  // Wikipedia / reference sites
  if (hostname.includes('wikipedia.org') || document.querySelector('.mw-parser-output')) {
    return 'reference';
  }

  // Check for article signals
  const articleRoot = findArticleRoot();
  if (articleRoot) {
    const text = articleRoot.textContent?.trim() ?? '';
    const wordCount = countWords(text);
    if (wordCount > 300) return 'article';
  }

  // Check for article tag
  if (document.querySelector('article')) return 'article';

  return 'generic';
}

export function detectParagraphs(root: Element): TextBlock[] {
  const paragraphs = root.querySelectorAll('p');
  const blocks: TextBlock[] = [];

  for (const p of paragraphs) {
    // Skip paragraphs inside nav/footer/sidebar
    if (p.closest(SKIP_ANCESTORS)) continue;

    const text = p.textContent?.trim() ?? '';
    const wordCount = countWords(text);
    if (wordCount >= PARAGRAPH_MIN_WORDS) {
      blocks.push({ element: p, wordCount });
    }
  }

  return blocks;
}

export function detectTextBlocks(): TextBlock[] {
  const candidates: TextBlock[] = [];
  const selectors = 'article, section, main, [role="main"], .post-content, .article-content, .entry-content';
  const containers = document.querySelectorAll(selectors);

  // Also check large paragraphs directly
  const allParagraphs = document.querySelectorAll('p');

  const seen = new Set<Element>();

  // Check containers first
  for (const container of containers) {
    const text = container.textContent?.trim() ?? '';
    const wordCount = countWords(text);
    if (wordCount >= PLAY_BUTTON_WORD_THRESHOLD) {
      candidates.push({ element: container, wordCount });
      seen.add(container);
    }
  }

  // Check paragraphs not inside already-detected blocks
  for (const p of allParagraphs) {
    // Skip if inside an already-detected container
    let inside = false;
    for (const block of candidates) {
      if (block.element.contains(p)) {
        inside = true;
        break;
      }
    }
    if (inside) continue;

    const text = p.textContent?.trim() ?? '';
    const wordCount = countWords(text);
    if (wordCount >= PLAY_BUTTON_WORD_THRESHOLD && !seen.has(p)) {
      candidates.push({ element: p, wordCount });
      seen.add(p);
    }
  }

  return candidates;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}
