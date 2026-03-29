import type { TTSProvider, ProviderConfig, Voice, SynthesisResult, SynthesisOptions } from '@shared/types';

const DEFAULT_BASE_URL = 'https://api.elevenlabs.io';

export const elevenlabsProvider: TTSProvider = {
  id: 'elevenlabs',
  name: 'ElevenLabs',

  async listVoices(config: ProviderConfig): Promise<Voice[]> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const response = await fetch(`${baseUrl}/v1/voices`, {
      headers: { 'xi-api-key': config.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ElevenLabs voices: ${response.status}`);
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
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const format = options?.format ?? 'mp3';

    const body: Record<string, unknown> = {
      text,
      model_id: (config.extraParams?.model_id as string) ?? 'eleven_monolingual_v1',
    };

    if (config.extraParams?.stability != null || config.extraParams?.similarity_boost != null) {
      body.voice_settings = {
        stability: config.extraParams.stability ?? 0.5,
        similarity_boost: config.extraParams.similarity_boost ?? 0.75,
      };
    }

    const response = await fetch(`${baseUrl}/v1/text-to-speech/${voice.id}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': config.apiKey,
        'Content-Type': 'application/json',
        'Accept': `audio/${format}`,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your ElevenLabs API key.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (!response.ok) {
      throw new Error(`ElevenLabs TTS request failed: ${response.status} ${response.statusText}`);
    }

    const audioData = await response.arrayBuffer();
    return { audioData, format };
  },

  async validateKey(config: ProviderConfig): Promise<boolean> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    try {
      const response = await fetch(`${baseUrl}/v1/voices`, {
        headers: { 'xi-api-key': config.apiKey },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  },
};
