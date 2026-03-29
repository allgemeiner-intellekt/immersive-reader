import type { TTSProvider, ProviderConfig, Voice, SynthesisResult, SynthesisOptions } from '@shared/types';

const DEFAULT_BASE_URL = 'https://api.openai.com';

const OPENAI_VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy' },
  { id: 'echo', name: 'Echo' },
  { id: 'fable', name: 'Fable' },
  { id: 'onyx', name: 'Onyx' },
  { id: 'nova', name: 'Nova' },
  { id: 'shimmer', name: 'Shimmer' },
];

export const openaiProvider: TTSProvider = {
  id: 'openai',
  name: 'OpenAI',

  async listVoices(_config: ProviderConfig): Promise<Voice[]> {
    return OPENAI_VOICES;
  },

  async synthesize(
    text: string,
    voice: Voice,
    config: ProviderConfig,
    options?: SynthesisOptions,
  ): Promise<SynthesisResult> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const speed = options?.speed ?? 1.0;
    const format = options?.format ?? 'mp3';

    const response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice.id,
        response_format: format,
        speed,
      }),
    });

    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your OpenAI API key.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (!response.ok) {
      throw new Error(`OpenAI TTS request failed: ${response.status} ${response.statusText}`);
    }

    const audioData = await response.arrayBuffer();
    return { audioData, format };
  },

  async validateKey(config: ProviderConfig): Promise<boolean> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  },
};
