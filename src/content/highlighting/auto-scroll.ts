const MANUAL_SCROLL_PAUSE_MS = 5000;

let enabled = true;
let paused = false;
let pauseTimer: ReturnType<typeof setTimeout> | null = null;
let boundOnWheel: (() => void) | null = null;
let boundOnTouch: (() => void) | null = null;

function onManualScroll(): void {
  if (!enabled) return;
  paused = true;
  if (pauseTimer !== null) clearTimeout(pauseTimer);
  pauseTimer = setTimeout(() => {
    paused = false;
    pauseTimer = null;
  }, MANUAL_SCROLL_PAUSE_MS);
}

/**
 * Start listening for manual scroll events so we can pause auto-scroll.
 */
export function initAutoScroll(): void {
  enabled = true;
  paused = false;
  boundOnWheel = onManualScroll;
  boundOnTouch = onManualScroll;
  window.addEventListener('wheel', boundOnWheel, { passive: true });
  window.addEventListener('touchmove', boundOnTouch, { passive: true });
}

/**
 * Smooth-scroll so the highlighted range is visible near the center of the viewport.
 */
export function scrollToHighlight(range: Range): void {
  if (!enabled || paused) return;

  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return;

  const viewportHeight = window.innerHeight;
  // If already visible in the middle 60% of viewport, skip scroll
  const topThreshold = viewportHeight * 0.2;
  const bottomThreshold = viewportHeight * 0.8;
  if (rect.top >= topThreshold && rect.bottom <= bottomThreshold) return;

  const targetY = window.scrollY + rect.top - viewportHeight / 2 + rect.height / 2;
  window.scrollTo({ top: targetY, behavior: 'smooth' });
}

/**
 * Smooth-scroll to center a given element in the viewport.
 */
export function scrollToElement(element: Element): void {
  if (!enabled || paused) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function pauseAutoScroll(): void {
  paused = true;
}

export function resumeAutoScroll(): void {
  paused = false;
  if (pauseTimer !== null) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
}

/**
 * Remove event listeners and reset state.
 */
export function destroyAutoScroll(): void {
  if (boundOnWheel) {
    window.removeEventListener('wheel', boundOnWheel);
    boundOnWheel = null;
  }
  if (boundOnTouch) {
    window.removeEventListener('touchmove', boundOnTouch);
    boundOnTouch = null;
  }
  if (pauseTimer !== null) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
  paused = false;
  enabled = false;
}
