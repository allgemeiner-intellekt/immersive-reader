import type { TextNodeEntry, TextMapResult } from '@shared/types';

/**
 * Walk the DOM tree under `root` and collect all text nodes with their
 * global character offsets in the concatenated plain-text output.
 */
export function buildTextNodeMap(root: Element): TextMapResult {
  const entries: TextNodeEntry[] = [];
  let offset = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.nodeValue ?? '';
    if (!text) continue;

    entries.push({
      node,
      globalStart: offset,
      globalEnd: offset + text.length,
    });

    offset += text.length;
  }

  const text = entries.map((e) => e.node.nodeValue ?? '').join('');

  return { entries, text };
}
