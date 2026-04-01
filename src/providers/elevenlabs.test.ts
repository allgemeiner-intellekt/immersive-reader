import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elevenlabsProvider } from './elevenlabs';
import type { ProviderConfig, Voice } from '@shared/types';

const TEST_CONFIG: ProviderConfig = {
  id: 'elevenlabs-test',
  providerId: 'elevenlabs',
  name: 'ElevenLabs',
  apiKey: '  test-api-key  ',
};

const TEST_VOICE: Voice = {
  id: 'voice-123',
  name: 'Test Voice',
};

describe('elevenlabsProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('trims the API key before loading voices', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ voices: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await elevenlabsProvider.listVoices(TEST_CONFIG);

    expect(fetchMock).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': 'test-api-key' },
    });
  });

  it('uses eleven_multilingual_v2 by default for synthesis', async () => {
    const fetchMock = vi.fn()
      // First call: /with-timestamps fails (not all plans support it)
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'not supported' })
      // Second call: /stream succeeds
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
        headers: new Headers(),
      });
    vi.stubGlobal('fetch', fetchMock);

    await elevenlabsProvider.synthesize('hello', TEST_VOICE, TEST_CONFIG);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Verify the /stream call uses the correct model
    const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      text: 'hello',
      model_id: 'eleven_multilingual_v2',
    });
  });

  it('surfaces ElevenLabs error details for 401 synthesis failures', async () => {
    const fetchMock = vi.fn()
      // First call: /with-timestamps fails
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'not supported' })
      // Second call: /stream returns 401
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            detail: {
              status: 'invalid_api_key',
              message: 'A valid API key is required.',
            },
          }),
        headers: new Headers(),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      elevenlabsProvider.synthesize('hello', TEST_VOICE, TEST_CONFIG),
    ).rejects.toThrow('invalid_api_key: A valid API key is required.');
  });
});
