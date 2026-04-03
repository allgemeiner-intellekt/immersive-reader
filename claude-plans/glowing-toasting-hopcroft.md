# Plan: Add Xiaomi Mimo TTS as a Dedicated Provider

## Context

Mimo TTS (`mimo-v2-tts`) uses a fundamentally different API shape from all existing providers. Instead of `POST /v1/audio/speech` returning raw binary audio, it uses `POST /v1/chat/completions` with an `audio` modality and returns base64-encoded audio inside a JSON response at `choices[0].message.audio.data`. This means it cannot reuse the `openai-compatible.ts` utilities and needs a dedicated provider module (similar to how ElevenLabs has its own).

## Files to Create

### `src/providers/mimo.ts` — New provider implementation

Follow the structure of `groq.ts` (simplest reference). Key differences:

**Constants:**
- `DEFAULT_BASE_URL = 'https://api.xiaomimimo.com/v1'`
- `DEFAULT_MODEL = 'mimo-v2-tts'`
- Static voice list: `mimo_default`, `default_zh` (Chinese Female), `default_en` (English Female)

**`listVoices()`** — Return static `MIMO_VOICES` array (no API call).

**`synthesize(text, voice, config, options)`:**
1. Build chat completions request body:
   ```typescript
   {
     model: DEFAULT_MODEL,
     modalities: ['text', 'audio'],
     audio: { voice: voice.id, format: 'mp3' },
     messages: [
       { role: 'user', content: text },
       { role: 'assistant', content: '' },
     ],
   }
   ```
2. POST to `${baseUrl}/chat/completions` with `api-key` header for auth
3. Parse JSON response, extract `choices[0].message.audio.data` (base64 string)
4. Decode base64 → ArrayBuffer (same `atob` + `Uint8Array` pattern used in offscreen doc)
5. Return `{ audioData, format: 'mp3' }`
6. Validate response structure — throw `ApiError` if `audio.data` is missing
7. Standard error handling: 401 (non-retryable), 429 (retryable), etc.

**`validateKey(config)`:**
1. Check `hasLikelyValidApiKeyFormat(config)`
2. Make a minimal synthesis request with short text (`'test'`)
3. Return `true` if successful, `false` otherwise

**Auth header:** `'api-key': config.apiKey.trim()` (Mimo's primary auth, similar to how ElevenLabs uses `xi-api-key`)

## Files to Modify

### `src/providers/registry.ts`
- Import `mimoProvider` from `'./mimo'`
- Add `mimo: mimoProvider` to `providerMap` (line 18, before `custom`)
- Add entry to `PROVIDER_LIST` (before `custom` which should stay last):
  ```typescript
  {
    id: 'mimo',
    name: 'Xiaomi Mimo',
    description: 'Multilingual TTS with emotion and dialect support',
    website: 'https://platform.xiaomimimo.com',
  }
  ```
- No change to `getChunkLimits` — default (30-50 words) is appropriate

### `src/providers/api-key-format.ts`
- Add `case 'mimo': return apiKey.length >= 16;` (line 21 area, before default)
- No known key prefix — use permissive length check like ElevenLabs

### `src/options/Options.tsx`
- No changes needed. Mimo requires no provider-specific UI fields (no base URL, no model selector). The generic form (provider type + name + API key) is sufficient.

### `manifest.config.ts`
- No changes needed. MV3 service workers can make cross-origin `fetch` calls without `host_permissions`.

## Out of Scope (v1)
- Style control tags (emotions, dialects, speed, roles, singing) — text passed as-is
- Streaming support — full JSON response, not SSE
- Usage tracking — no known Mimo quota API
- Word-level timing — Mimo doesn't appear to provide alignment data

## Verification
1. `npm run typecheck` — ensure no type errors
2. `npm run build` — ensure production build succeeds
3. Manual test: open Options page → Add Provider → select "Xiaomi Mimo" → enter API key → Test Connection → save → select voice → play text on a webpage
