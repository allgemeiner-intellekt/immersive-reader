import type { TextNodeEntry, TextMapResult } from '@shared/types';

/** Tags whose text content should be skipped entirely */
const SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'svg', 'math', 'code', 'pre',
  'nav', 'footer', 'aside', 'header',
]);

/** Selectors for non-content elements (checked via closest()) */
const SKIP_SELECTORS = [
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="banner"]',
  '[aria-hidden="true"]',
  '.sidebar',
  '.toc',
  '.references',
  '.mw-editsection',
  '.navbox',
  '.infobox',
  '.mw-jump-link',
  '.catlinks',
  '.mw-indicators',
  '.noprint',
  '.comments',
  '#comments',
  '.related-posts',
  '.share-buttons',
  '.social-share',
  '.author-bio',
  '.advertisement',
  '[class*="ad-"]',
  '.newsletter-signup',
  '.breadcrumb',
  '.wp-block-latest-posts',
  '.sharedaddy',
];

const SKIP_SELECTOR_STRING = SKIP_SELECTORS.join(',');

/** Block-level elements that trigger paragraph separators */
const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'blockquote', 'section', 'article', 'figcaption',
  'dt', 'dd', 'tr', 'br',
]);

/**
 * Build a map of text nodes under `root`, returning both the entries and
 * the constructed text string. Block element boundaries produce `\n\n`
 * separators in the text (these are synthetic — no TextNodeEntry covers them).
 */
export function buildTextNodeMap(root: Element): TextMapResult {
  const entries: TextNodeEntry[] = [];
  let text = '';
  let offset = 0;
  let lastBlockParent: Element | null = null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      // Skip by tag name (walk up to check ancestors)
      const tag = parent.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return NodeFilter.FILTER_REJECT;

      // Skip non-content ancestors
      if (parent.closest(SKIP_SELECTOR_STRING)) return NodeFilter.FILTER_REJECT;

      // Skip empty/whitespace-only text nodes
      if (!node.textContent || node.textContent.trim().length === 0) {
        return NodeFilter.FILTER_SKIP;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const nodeText = node.textContent || '';
    const parent = node.parentElement!;

    // Detect block boundary: find the nearest block-level ancestor
    const blockParent = findBlockAncestor(parent);
    if (blockParent && blockParent !== lastBlockParent && entries.length > 0) {
      // Insert paragraph separator
      text += '\n\n';
      offset += 2;
    }
    lastBlockParent = blockParent;

    entries.push({
      node: node as Text,
      globalStart: offset,
      globalEnd: offset + nodeText.length,
    });
    text += nodeText;
    offset += nodeText.length;
  }

  return { entries, text };
}

function findBlockAncestor(el: Element): Element | null {
  let current: Element | null = el;
  while (current) {
    if (BLOCK_TAGS.has(current.tagName.toLowerCase())) return current;
    current = current.parentElement;
  }
  return null;
}
