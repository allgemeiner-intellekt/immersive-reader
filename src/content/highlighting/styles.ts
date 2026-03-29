import type { HighlightSettings } from '@shared/types';

const STYLE_ID = 'ir-highlight-styles';

/**
 * Inject a <style> element with highlight CSS rules.
 * Includes both CSS Custom Highlight API pseudo-elements and fallback mark classes.
 */
export function injectHighlightStyles(settings: HighlightSettings): HTMLStyleElement {
  // Remove existing style if present
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = buildCSS(settings);
  document.head.appendChild(styleEl);
  return styleEl;
}

/**
 * Update the CSS within an existing style element when settings change.
 */
export function updateHighlightStyles(
  styleEl: HTMLStyleElement,
  settings: HighlightSettings,
): void {
  styleEl.textContent = buildCSS(settings);
}

/**
 * Remove the injected style element.
 */
export function removeHighlightStyles(styleEl: HTMLStyleElement): void {
  styleEl.remove();
}

function buildCSS(settings: HighlightSettings): string {
  return `
/* CSS Custom Highlight API styles */
::highlight(ir-word) {
  background-color: ${settings.wordColor};
}
::highlight(ir-sentence) {
  background-color: ${settings.sentenceColor};
}

/* Fallback mark element styles */
mark.ir-word-mark {
  background-color: ${settings.wordColor};
  color: inherit;
  padding: 0;
  margin: 0;
  border-radius: 2px;
}
mark.ir-sentence-mark {
  background-color: ${settings.sentenceColor};
  color: inherit;
  padding: 0;
  margin: 0;
  border-radius: 2px;
}
`;
}
