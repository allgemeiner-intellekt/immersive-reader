import type { ExtractionResult } from '@shared/types';
import { isGmail, extractGmail } from './gmail';
import { isChatSite, extractChat } from './chat';
import { extractGeneric } from './generic';

/**
 * Main extraction orchestrator.
 * Order: Gmail → AI chat sites → generic Readability.
 *
 * Chat-specific extraction is checked before the generic path because
 * Readability picks a single top-scoring element, which on chat pages is
 * typically just one message bubble — leaving later replies unread.
 */
export function extractContent(): ExtractionResult | null {
  try {
    if (isGmail()) {
      const gmailResult = extractGmail();
      if (gmailResult) return gmailResult;
    }

    if (isChatSite()) {
      const chatResult = extractChat();
      if (chatResult) return chatResult;
    }

    return extractGeneric();
  } catch (err) {
    console.error('[Recito] Content extraction failed:', err);
    return null;
  }
}
