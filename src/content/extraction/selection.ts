/**
 * Get the currently selected text and its DOM range.
 */
export function getSelectedText(): { text: string; range: Range } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const text = sel.toString().trim();
  if (!text) return null;

  const range = sel.getRangeAt(0);
  return { text, range };
}
