import { detectTextBlocks, detectParagraphs, detectPageType } from './detector';
import { createPlayButton, removeAllPlayButtons } from './play-button';
import { findArticleRoot } from '../extraction/generic';
import { isGmail } from '../extraction/extractor';
import { useStore } from '../state/store';

let gmailObserver: MutationObserver | null = null;

export function injectPlayButtons(): void {
  if (isGmail()) {
    injectGmailButtons();
    return;
  }

  const pageType = detectPageType();

  if (pageType === 'article' || pageType === 'reference') {
    injectParagraphButtons();
  } else {
    // Generic: original behavior with 200+ word blocks
    const blocks = detectTextBlocks();
    for (const block of blocks) {
      const btn = createPlayButton(() => {
        startPlaybackFromElement(block.element);
      });
      block.element.insertBefore(btn, block.element.firstChild);
    }
  }
}

export function cleanupPlayButtons(): void {
  removeAllPlayButtons();
  if (gmailObserver) {
    gmailObserver.disconnect();
    gmailObserver = null;
  }
}

function injectParagraphButtons(): void {
  const root = findArticleRoot();
  if (!root) {
    // Fallback to generic behavior
    const blocks = detectTextBlocks();
    for (const block of blocks) {
      const btn = createPlayButton(() => {
        startPlaybackFromElement(block.element);
      });
      block.element.insertBefore(btn, block.element.firstChild);
    }
    return;
  }

  const paragraphs = detectParagraphs(root);

  for (const para of paragraphs) {
    const el = para.element as HTMLElement;
    const rect = el.getBoundingClientRect();
    const hasLeftMargin = rect.left > 50;

    if (hasLeftMargin) {
      // Position button in the left margin
      const computedPosition = getComputedStyle(el).position;
      if (computedPosition === 'static') {
        el.style.position = 'relative';
      }

      const btn = createPlayButton(() => {
        startPlaybackFromElement(el);
      }, 'small');

      Object.assign(btn.style, {
        position: 'absolute',
        left: '-36px',
        top: '2px',
        marginRight: '0',
      });

      el.appendChild(btn);
    } else {
      // Inline at paragraph start
      const btn = createPlayButton(() => {
        startPlaybackFromElement(el);
      }, 'small');

      el.insertBefore(btn, el.firstChild);
    }
  }
}

function injectGmailButtons(): void {
  // Inject into any existing email bodies
  injectGmailButtonsNow();

  // Watch for new email bodies being loaded
  gmailObserver = new MutationObserver(() => {
    // Debounce: wait for DOM to settle
    setTimeout(injectGmailButtonsNow, 500);
  });

  gmailObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function injectGmailButtonsNow(): void {
  const emailBodies = document.querySelectorAll('div.a3s.aiL, div.a3s');
  for (const body of emailBodies) {
    if (body.querySelector('.ir-play-btn')) continue; // Already injected
    const text = body.textContent?.trim() ?? '';
    if (text.split(/\s+/).length < 50) continue; // Too short

    const btn = createPlayButton(() => {
      startPlaybackFromElement(body);
    });
    body.insertBefore(btn, body.firstChild);
  }
}

function startPlaybackFromElement(element: Element): void {
  const text = element.textContent?.trim() ?? '';
  if (!text) return;

  useStore.getState().setPendingPlaybackElement(element);
  document.dispatchEvent(new CustomEvent('ir-start-playback'));
}
