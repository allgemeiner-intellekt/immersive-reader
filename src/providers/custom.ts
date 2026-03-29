import type { TTSProvider, ProviderConfig, Voice, SynthesisResult, SynthesisOptions } from '@shared/types';

export const customProvider: TTSProvider = {
  id: 'custom',
  name: 'Custom (OpenAI-compatible)',

  async listVoices(config: ProviderConfig): Promise<Voice[]> {
    if (!config.baseUrl) return [];
    try {
      const response = await fetch(`${config.baseUrl}/v1/audio/voices`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.voices ?? []).map((v: { id: string; name?: string }) => ({
        id: v.id,
        name: v.name ?? v.id,
      }));
    } catch {
      return [];
    }
  },

  async synthesize(
    text: string,
    voice: Voice,
    config: ProviderConfig,
    options?: SynthesisOptions,
  ): Promise<SynthesisResult> {
    if (!config.baseUrl) {
      throw new Error('Custom provider requires a baseUrl.');
    }

    const speed = options?.speed ?? 1.0;
    const format = options?.format ?? 'mp3';

    const response = await fetch(`${config.baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: (config.extraParams?.model as string) ?? 'tts-1',
        input: text,
        voice: voice.id,
        response_format: format,
        speed,
      }),
    });

    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your API key.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (!response.ok) {
      throw new Error(`TTS request failed: ${response.status} ${response.statusText}`);
    }

    const audioData = await response.arrayBuffer();
    return { audioData, format };
  },

  async validateKey(config: ProviderConfig): Promise<boolean> {
    if (!config.baseUrl) return false;
    try {
      const response = await fetch(`${config.baseUrl}/v1/models`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  },
};
