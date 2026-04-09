import type { TTSProvider, ProviderConfig, Voice, SynthesisResult, SynthesisOptions, ProviderUsage, WordTiming } from '@shared/types';
import { hasLikelyValidApiKeyFormat } from './api-key-format';
import { ApiError } from '@shared/api-error';

const DEFAULT_BASE_URL = 'https://api.elevenlabs.io';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';

export const ELEVENLABS_MODELS = [
  { label: 'Economy (Flash v2.5)', modelId: 'eleven_flash_v2_5' },
  { label: 'Quality (Multilingual v2)', modelId: 'eleven_multilingual_v2' },
] as const;

function getNormalizedBaseUrl(config: ProviderConfig): string {
  return (config.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

function getNormalizedApiKey(config: ProviderConfig): string {
  return config.apiKey.trim();
}

/**
 * Convert an ElevenLabs error response into an ApiError with the correct
 * retryable flag.
 *
 * ElevenLabs returns HTTP 401 for BOTH invalid keys and quota-exhausted
 * accounts (detail.status = 'quota_exceeded'). We must treat quota errors as
 * retryable so the orchestrator's failover can switch to a backup config;
 * otherwise the read stops dead even when another key is available.
 */
function toElevenLabsApiError(status: number, body: string, headers?: Headers): ApiError {
  const detail = getElevenLabsErrorMessage(body);
  const lower = detail.toLowerCase();

  const isQuotaExceeded =
    lower.includes('quota_exceeded') ||
    lower.includes('quota exceeded') ||
    lower.includes('usage_limit') ||
    lower.includes('usage limit') ||
    lower.includes('character limit') ||
    lower.includes('exceeds your remaining');

  if (isQuotaExceeded) {
    // Use 403 so failover.getCooldownDuration applies the longer quota cooldown.
    return new ApiError(
      detail || 'ElevenLabs quota exceeded.',
      403,
      'elevenlabs',
      true,
    );
  }

  if (status === 401) {
    // Genuine bad key — permanent failure.
    return new ApiError(
      detail || 'ElevenLabs rejected the API request with a 401 error.',
      401,
      'elevenlabs',
      false,
    );
  }

  if (status === 429) {
    return new ApiError(
      detail || 'Rate limit exceeded. Please try again later.',
      429,
      'elevenlabs',
      true,
    );
  }

  return ApiError.fromResponse(status, detail || `HTTP ${status}`, 'elevenlabs', headers);
}

function getElevenLabsErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      detail?: string | { message?: string; status?: string };
    };
    if (typeof parsed.detail === 'string') {
      return parsed.detail;
    }
    if (parsed.detail && typeof parsed.detail === 'object') {
      const status = parsed.detail.status?.trim();
      const message = parsed.detail.message?.trim();
      if (status && message) {
        return `${status}: ${message}`;
      }
      return message || status || trimmed;
    }
  } catch {
    // Fall back to the raw response text when the body is not JSON.
  }

  return trimmed;
}

export const elevenlabsProvider: TTSProvider = {
  id: 'elevenlabs',
  name: 'ElevenLabs',

  async listVoices(config: ProviderConfig): Promise<Voice[]> {
    const baseUrl = getNormalizedBaseUrl(config);
    const apiKey = getNormalizedApiKey(config);
    const response = await fetch(`${baseUrl}/v1/voices`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      const detail = getElevenLabsErrorMessage(errBody);
      if (response.status === 401) {
        throw new Error(detail || 'ElevenLabs rejected the API key while loading voices.');
      }
      throw new Error(
        `Failed to fetch ElevenLabs voices (${response.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    const data = await response.json();
    return (data.voices ?? []).map((v: { voice_id: string; name: string; labels?: Record<string, string> }) => ({
      id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender,
      language: v.labels?.language,
    }));
  },

  async synthesize(
    text: string,
    voice: Voice,
    config: ProviderConfig,
    options?: SynthesisOptions,
  ): Promise<SynthesisResult> {
    const baseUrl = getNormalizedBaseUrl(config);
    const apiKey = getNormalizedApiKey(config);
    const format = options?.format ?? 'mp3';

    const speed = options?.speed ?? 1.0;

    const body: Record<string, unknown> = {
      text,
      model_id: (config.extraParams?.model_id as string) ?? DEFAULT_MODEL_ID,
    };

    if (speed !== 1.0) {
      body.speed = speed;
    }

    if (config.extraParams?.stability != null || config.extraParams?.similarity_boost != null) {
      body.voice_settings = {
        stability: config.extraParams.stability ?? 0.5,
        similarity_boost: config.extraParams.similarity_boost ?? 0.75,
      };
    }

    // Try /with-timestamps endpoint first for word-level timing data.
    // If the plan doesn't support timestamps we get a 400 and fall back to
    // /stream. But authoritative errors (401 bad key, 403/429 quota, 5xx)
    // must propagate immediately — otherwise we waste a second request and,
    // worse, the fallback re-throws the same error, obscuring the cause.
    try {
      return await synthesizeWithTimestamps(baseUrl, apiKey, voice.id, body, text);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 400) {
        throw err;
      }
      // Fall through to /stream for 400s and non-ApiError failures.
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/text-to-speech/${voice.id}/stream`, {
        signal: AbortSignal.timeout(30_000),
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': `audio/${format}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw ApiError.fromNetworkError(err, 'elevenlabs');
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw toElevenLabsApiError(response.status, errBody, response.headers);
    }

    const audioData = await response.arrayBuffer();
    return { audioData, format };
  },

  async validateKey(config: ProviderConfig): Promise<boolean> {
    if (!hasLikelyValidApiKeyFormat(config)) {
      return false;
    }
    const baseUrl = getNormalizedBaseUrl(config);
    const apiKey = getNormalizedApiKey(config);
    try {
      const response = await fetch(`${baseUrl}/v1/voices`, {
        headers: { 'xi-api-key': apiKey },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  },
};

interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Synthesize using the /with-timestamps endpoint to get word-level timing data.
 * Returns audio as base64 + alignment data converted to WordTiming[].
 */
async function synthesizeWithTimestamps(
  baseUrl: string,
  apiKey: string,
  voiceId: string,
  body: Record<string, unknown>,
  originalText: string,
): Promise<SynthesisResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/text-to-speech/${voiceId}/with-timestamps`, {
      signal: AbortSignal.timeout(30_000),
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw ApiError.fromNetworkError(err, 'elevenlabs');
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw toElevenLabsApiError(response.status, errBody, response.headers);
  }

  const data = (await response.json()) as {
    audio_base64: string;
    alignment: ElevenLabsAlignment;
  };

  // Decode base64 audio to ArrayBuffer
  const binary = atob(data.audio_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const audioData = bytes.buffer;

  // Convert character-level alignment to word-level timings
  const wordTimings = alignmentToWordTimings(originalText, data.alignment);

  return { audioData, format: 'mp3', wordTimings };
}

/**
 * Convert ElevenLabs character-level alignment to word-level WordTiming[].
 */
function alignmentToWordTimings(text: string, alignment: ElevenLabsAlignment): WordTiming[] {
  const timings: WordTiming[] = [];
  const words = text.split(/\s+/);
  let charIdx = 0;
  let textPos = 0;

  for (const word of words) {
    if (!word) continue;

    // Find word position in original text
    const wordStart = text.indexOf(word, textPos);
    if (wordStart < 0) continue;
    textPos = wordStart + word.length;

    // Skip whitespace characters in alignment
    while (charIdx < alignment.characters.length && /\s/.test(alignment.characters[charIdx])) {
      charIdx++;
    }

    const startCharIdx = charIdx;
    const endCharIdx = Math.min(charIdx + word.length - 1, alignment.characters.length - 1);
    charIdx += word.length;

    if (startCharIdx < alignment.character_start_times_seconds.length) {
      timings.push({
        word,
        startTime: alignment.character_start_times_seconds[startCharIdx],
        endTime: alignment.character_end_times_seconds[endCharIdx] ??
                 alignment.character_start_times_seconds[startCharIdx] + 0.1,
        charStart: wordStart,
        charEnd: wordStart + word.length,
      });
    }
  }

  return timings;
}

export async function getElevenLabsUsage(config: ProviderConfig): Promise<ProviderUsage> {
  const baseUrl = getNormalizedBaseUrl(config);
  const apiKey = getNormalizedApiKey(config);
  const response = await fetch(`${baseUrl}/v1/user/subscription`, {
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    const detail = getElevenLabsErrorMessage(errBody);
    throw new Error(
      `Could not fetch usage (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  const data = (await response.json()) as {
    character_count: number;
    character_limit: number;
    next_character_count_reset_unix: number;
  };

  return {
    characterCount: data.character_count,
    characterLimit: data.character_limit,
    nextResetUnix: data.next_character_count_reset_unix,
  };
}
