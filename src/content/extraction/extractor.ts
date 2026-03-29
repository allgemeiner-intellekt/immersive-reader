import type { ExtractionResult } from '@shared/types';
import { isGmail, extractGmail } from './gmail';
import { extractGeneric } from './generic';

/**
 * Main extraction orchestrator.
 * Tries Gmail-specific extraction first (if on Gmail), then generic Readability.
 */
export function extractContent(): ExtractionResult | null {
  try {
    if (isGmail()) {
      const gmailResult = extractGmail();
      if (gmailResult) return gmailResult;
    }

    return extractGeneric();
  } catch (err) {
    console.error('[ImmersiveReader] Content extraction failed:', err);
    return null;
  }
}
