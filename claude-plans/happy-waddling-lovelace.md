# Plan: ElevenLabs Usage/Quota Visualization

## Context

ElevenLabs has character-based quotas that reset monthly. Users currently have no visibility into how much of their quota they've consumed without leaving the extension. This feature adds a usage bar inside the provider card on the Options page for ElevenLabs configs, fetched via the `/v1/user/subscription` endpoint.

## Approach

Add a new `GET_PROVIDER_USAGE` message type. The background script handles it by calling the ElevenLabs API's subscription endpoint, returning character count/limit/reset date. The Options page renders a progress bar + text inside each ElevenLabs provider card.

## Files to modify

### 1. `src/lib/types.ts` — Add `ProviderUsage` interface

```ts
export interface ProviderUsage {
  characterCount: number;
  characterLimit: number;
  nextResetUnix: number;
}
```

### 2. `src/lib/messages.ts` — Add message type

- Add `GET_PROVIDER_USAGE: 'GET_PROVIDER_USAGE'` to `MSG` (line ~46, in Provider management section)
- Add `GetProviderUsageMessage` interface: `{ type, configId: string }`
- Add response type: `ProviderUsage | { error: string }`
- Add to `ExtensionMessage` union

### 3. `src/providers/elevenlabs.ts` — Add `getUsage()` standalone function

Export a new function (not on the `TTSProvider` interface since it's ElevenLabs-specific):

```ts
export async function getElevenLabsUsage(config: ProviderConfig): Promise<ProviderUsage> {
  const baseUrl = getNormalizedBaseUrl(config);
  const apiKey = getNormalizedApiKey(config);
  const response = await fetch(`${baseUrl}/v1/user/subscription`, {
    headers: { 'xi-api-key': apiKey },
  });
  // Parse character_count, character_limit, next_character_count_reset_unix
  // Throw on non-200
}
```

### 4. `src/background/message-router.ts` — Handle `GET_PROVIDER_USAGE`

Add a new case (~line 182, before `default`):

```ts
case MSG.GET_PROVIDER_USAGE: {
  const providers = await getProviders();
  const config = providers.find(p => p.id === message.configId);
  if (!config || config.providerId !== 'elevenlabs') {
    sendResponse({ error: 'Not an ElevenLabs config' });
    break;
  }
  const usage = await getElevenLabsUsage(config);
  sendResponse(usage);
}
```

### 5. `src/options/Options.tsx` — Render usage in ElevenLabs cards

- Add state: `usageMap: Record<string, ProviderUsage | { error: string }>`
- On mount + every 60s, fetch usage for each ElevenLabs config via `sendMessage({ type: MSG.GET_PROVIDER_USAGE, configId })`
- Inside each card where `p.providerId === 'elevenlabs'`, after the health-info section (~line 409), render:
  - A thin progress bar (character_count / character_limit)
  - Text: "X,XXX / Y,YYY characters" 
  - Text: "Resets in N days"
  - Color coding: green (<70%), yellow (70-90%), red (>90%)

### 6. `src/options/options.css` — Usage bar styles

```css
.usage-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin: 8px 0 4px; }
.usage-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.usage-fill--ok { background: var(--success); }
.usage-fill--warn { background: #eab308; }
.usage-fill--danger { background: var(--danger); }
.usage-text { font-size: 12px; color: var(--text-muted); }
```

## Verification

1. `npm run typecheck` — ensure no type errors
2. `npm run build` — production build succeeds
3. Load extension in Chrome → Settings → verify usage bar appears under ElevenLabs provider cards
4. Test with invalid key → should show error gracefully, not crash
5. Test with valid key → should show character count, limit, and reset date
