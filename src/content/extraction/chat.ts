import type { ExtractionResult } from '@shared/types';

/**
 * Site-specific extraction for AI chat pages (Claude, ChatGPT, Gemini, etc.).
 *
 * The generic Readability-based extractor picks a single top-scoring element,
 * which on chat pages is typically just one message bubble. This module
 * instead finds all message bubbles and returns their lowest common ancestor
 * so the full conversation is read.
 */

interface ChatSite {
  name: string;
  match: (host: string) => boolean;
  /** Selectors that target message bubbles (both user and assistant). */
  selectors: string[];
}

const CHAT_SITES: ChatSite[] = [
  {
    name: 'claude',
    match: (h) => h === 'claude.ai' || h.endsWith('.claude.ai'),
    selectors: [
      '[data-testid="user-message"]',
      '.font-claude-message',
      '.font-claude-response',
    ],
  },
  {
    name: 'chatgpt',
    match: (h) =>
      h === 'chatgpt.com' ||
      h === 'chat.openai.com' ||
      h.endsWith('.chatgpt.com'),
    selectors: ['[data-message-author-role]'],
  },
  {
    name: 'gemini',
    match: (h) => h === 'gemini.google.com',
    selectors: ['user-query', 'model-response'],
  },
  {
    name: 'copilot',
    match: (h) => h === 'copilot.microsoft.com',
    selectors: [
      '[data-content="user-message"]',
      '[data-content="ai-message"]',
    ],
  },
  {
    name: 'perplexity',
    match: (h) => h === 'www.perplexity.ai' || h === 'perplexity.ai',
    selectors: ['[data-testid="message"]', '.prose'],
  },
  {
    name: 'deepseek',
    match: (h) => h === 'chat.deepseek.com',
    selectors: ['.ds-markdown', '[class*="message"]'],
  },
  {
    name: 'kimi',
    match: (h) =>
      h === 'kimi.com' ||
      h === 'kimi.moonshot.cn' ||
      h.endsWith('.kimi.com'),
    selectors: ['.chat-content-item', '[class*="segment-content"]'],
  },
];

/**
 * Generic chat selectors that work on multiple sites and also serve as a
 * fallback when the hostname isn't in the known list.
 */
const GENERIC_CHAT_SELECTORS = ['[data-message-author-role]'];

function findMatchedSite(): ChatSite | null {
  const host = window.location.hostname.toLowerCase();
  return CHAT_SITES.find((s) => s.match(host)) ?? null;
}

export function isChatSite(): boolean {
  if (findMatchedSite()) return true;
  // Generic fallback: any page that exposes role-tagged messages
  for (const sel of GENERIC_CHAT_SELECTORS) {
    try {
      if (document.querySelectorAll(sel).length >= 1) return true;
    } catch {
      /* invalid selector */
    }
  }
  return false;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Query all message elements, dedupe, drop empty/nested, sort in doc order. */
function queryMessages(selectors: string[]): HTMLElement[] {
  const set = new Set<HTMLElement>();
  for (const sel of selectors) {
    try {
      document.querySelectorAll<HTMLElement>(sel).forEach((n) => {
        const text = (n.innerText ?? '').trim();
        if (text.length > 0) set.add(n);
      });
    } catch {
      /* invalid selector — skip */
    }
  }
  const all = Array.from(set);
  // Drop elements contained inside another matched element
  const filtered = all.filter(
    (n) => !all.some((other) => other !== n && other.contains(n)),
  );
  filtered.sort((a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
  return filtered;
}

function pairwiseLCA(a: Element, b: Element): Element | null {
  const ancestors = new Set<Element>();
  let cur: Element | null = a;
  while (cur) {
    ancestors.add(cur);
    cur = cur.parentElement;
  }
  cur = b;
  while (cur) {
    if (ancestors.has(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function lowestCommonAncestor(nodes: Element[]): Element | null {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0].parentElement ?? nodes[0];
  let ancestor: Element | null = nodes[0];
  for (let i = 1; i < nodes.length && ancestor; i++) {
    ancestor = pairwiseLCA(ancestor, nodes[i]);
  }
  return ancestor;
}

export function extractChat(): ExtractionResult | null {
  const site = findMatchedSite();
  const selectors = site?.selectors ?? GENERIC_CHAT_SELECTORS;

  const messages = queryMessages(selectors);
  if (messages.length === 0) return null;

  const container =
    messages.length === 1
      ? (messages[0].parentElement ?? messages[0])
      : lowestCommonAncestor(messages);
  if (!container) return null;

  const textContent = (container as HTMLElement).innerText?.trim() ?? '';
  if (!textContent) return null;
  const words = wordCount(textContent);
  if (words < 5) return null;

  return {
    title: document.title,
    html: (container as HTMLElement).innerHTML,
    textContent,
    wordCount: words,
    sourceElement: container,
  };
}
