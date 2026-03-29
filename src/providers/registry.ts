import type { TTSProvider } from '@shared/types';
import { openaiProvider } from './openai';
import { elevenlabsProvider } from './elevenlabs';
import { groqProvider } from './groq';
import { customProvider } from './custom';

export interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  website: string;
}

const providerMap: Record<string, TTSProvider> = {
  openai: openaiProvider,
  elevenlabs: elevenlabsProvider,
  groq: groqProvider,
  custom: customProvider,
};

export function getProvider(providerId: string): TTSProvider {
  const provider = providerMap[providerId];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return provider;
}

export const PROVIDER_LIST: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'High-quality TTS with 6 built-in voices',
    website: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Premium voice cloning and synthesis',
    website: 'https://elevenlabs.io/app/settings/api-keys',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference with PlayAI voices',
    website: 'https://console.groq.com/keys',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    description: 'Any OpenAI-compatible TTS endpoint',
    website: '',
  },
];
