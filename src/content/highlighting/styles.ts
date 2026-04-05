import type { ResolvedHighlightSettings } from '@shared/types';

const STYLE_ID = 'ir-highlight-styles';

/**
 * Inject a <style> element with highlight CSS rules.
 * Includes both CSS Custom Highlight API pseudo-elements and fallback mark classes.
 */
export function injectHighlightStyles(settings: ResolvedHighlightSettings): HTMLStyleElement {
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
  settings: ResolvedHighlightSettings,
): void {
  styleEl.textContent = buildCSS(settings);
}

/**
 * Remove the injected style element.
 */
export function removeHighlightStyles(styleEl: HTMLStyleElement): void {
  styleEl.remove();
}

/**
 * Parse an rgba/rgb color string and derive accent colors for underline and glow.
 */
function deriveAccentColors(rgbaColor: string): { underline: string; glow: string } {
  const match = rgbaColor.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    return { underline: rgbaColor, glow: rgbaColor };
  }
  const [, r, g, b] = match;
  return {
    underline: `rgba(${r}, ${g}, ${b}, 0.7)`,
    glow: `rgba(${r}, ${g}, ${b}, 0.25)`,
  };
}

function buildCSS(settings: ResolvedHighlightSettings): string {
  const wordAccent = deriveAccentColors(settings.wordColor);

  return `
/* CSS Custom Highlight API styles */
::highlight(ir-word) {
  background-color: ${settings.wordColor};
  text-shadow: 0 0 8px ${wordAccent.glow};
}
::highlight(ir-sentence) {
  background-color: ${settings.sentenceColor};
}

/* Scrub hover (interactive text navigation) */
::highlight(ir-scrub-hover) {
  background-color: rgba(0, 0, 0, 0.06);
}

/* Cursor when hovering over scrubbable text */
html.ir-scrub-active { cursor: pointer; }

/* Fallback mark element styles */
mark.ir-word-mark {
  background-color: ${settings.wordColor};
  color: inherit;
  padding: 0 1px;
  margin: 0;
  border-radius: 3px;
  box-shadow: 0 0 6px ${wordAccent.glow};
  transition: background-color 0.15s ease;
}
mark.ir-sentence-mark {
  background-color: ${settings.sentenceColor};
  color: inherit;
  padding: 0;
  margin: 0;
  border-radius: 3px;
}
mark.ir-scrub-hover-mark {
  background-color: rgba(0, 0, 0, 0.06);
  color: inherit;
  padding: 0;
  margin: 0;
  border-radius: 3px;
}
`;
}
