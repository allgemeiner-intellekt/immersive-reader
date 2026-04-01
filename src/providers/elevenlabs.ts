import type { TTSProvider, ProviderConfig, Voice, SynthesisResult, SynthesisOptions, ProviderUsage } from '@shared/types';
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

    const body: Record<string, unknown> = {
      text,
      model_id: (config.extraParams?.model_id as string) ?? DEFAULT_MODEL_ID,
    };

    if (config.extraParams?.stability != null || config.extraParams?.similarity_boost != null) {
      body.voice_settings = {
        stability: config.extraParams.stability ?? 0.5,
        similarity_boost: config.extraParams.similarity_boost ?? 0.75,
      };
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/text-to-speech/${voice.id}/stream`, {
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
      const detail = getElevenLabsErrorMessage(errBody);
      if (response.status === 401) {
        throw new ApiError(detail || 'ElevenLabs rejected the API request with a 401 error.', 401, 'elevenlabs', false);
      }
      if (response.status === 429) {
        throw new ApiError('Rate limit exceeded. Please try again later.', 429, 'elevenlabs', true);
      }
      throw ApiError.fromResponse(response.status, detail || response.statusText, 'elevenlabs');
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
