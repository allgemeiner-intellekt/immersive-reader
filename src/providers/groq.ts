import type { TTSProvider, ProviderConfig, Voice, SynthesisResult, SynthesisOptions } from '@shared/types';

const DEFAULT_BASE_URL = 'https://api.groq.com/openai';

const GROQ_VOICES: Voice[] = [
  { id: 'Arista-PlayAI', name: 'Arista' },
  { id: 'Atlas-PlayAI', name: 'Atlas' },
  { id: 'Basil-PlayAI', name: 'Basil' },
  { id: 'Briggs-PlayAI', name: 'Briggs' },
  { id: 'Calum-PlayAI', name: 'Calum' },
  { id: 'Celeste-PlayAI', name: 'Celeste' },
  { id: 'Cheyenne-PlayAI', name: 'Cheyenne' },
  { id: 'Chip-PlayAI', name: 'Chip' },
  { id: 'Cillian-PlayAI', name: 'Cillian' },
  { id: 'Daphne-PlayAI', name: 'Daphne' },
  { id: 'Fritz-PlayAI', name: 'Fritz' },
  { id: 'Gail-PlayAI', name: 'Gail' },
  { id: 'Indigo-PlayAI', name: 'Indigo' },
  { id: 'Mamaw-PlayAI', name: 'Mamaw' },
  { id: 'Mason-PlayAI', name: 'Mason' },
  { id: 'Mikail-PlayAI', name: 'Mikail' },
  { id: 'Mitch-PlayAI', name: 'Mitch' },
  { id: 'Nia-PlayAI', name: 'Nia' },
  { id: 'Quinn-PlayAI', name: 'Quinn' },
  { id: 'Thunder-PlayAI', name: 'Thunder' },
];

export const groqProvider: TTSProvider = {
  id: 'groq',
  name: 'Groq',

  async listVoices(_config: ProviderConfig): Promise<Voice[]> {
    return GROQ_VOICES;
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
    const model = (config.extraParams?.model as string) ?? 'playai-tts';

    const response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text,
        voice: voice.id,
        response_format: format,
        speed,
      }),
    });

    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your Groq API key.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (!response.ok) {
      throw new Error(`Groq TTS request failed: ${response.status} ${response.statusText}`);
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
