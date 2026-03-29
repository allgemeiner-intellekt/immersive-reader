# Contributing to Immersive Reader

## Development Setup

1. Clone and install:
   ```bash
   git clone https://github.com/your-org/immersive-reader.git
   cd immersive-reader
   npm install
   ```

2. Start the dev server:
   ```bash
   npm run dev
   ```

3. Load the extension in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

4. Run checks:
   ```bash
   npm run typecheck   # TypeScript type checking
   npm run lint         # ESLint
   npm test             # Vitest
   ```

## Project Structure

```
src/
  background/     Service worker (message routing, playback state)
  content/        Content script (extraction, highlighting, toolbar)
  popup/          Browser action popup (transport controls)
  options/        Settings page (providers, playback, highlight config)
  onboarding/     First-run onboarding wizard
  offscreen/      Offscreen document for audio playback
  lib/            Shared types, constants, storage, and messaging
  providers/      TTS provider adapters (OpenAI, ElevenLabs, Groq, custom)
```

## Adding a New TTS Provider

1. Create a new file at `src/providers/<name>.ts`

2. Implement the `TTSProvider` interface from `src/lib/types.ts`:
   ```typescript
   import type { TTSProvider, ProviderConfig, Voice, SynthesisResult, SynthesisOptions } from '@shared/types';

   export const myProvider: TTSProvider = {
     id: 'my-provider',
     name: 'My Provider',

     async listVoices(config: ProviderConfig): Promise<Voice[]> {
       // Fetch available voices from the API
     },

     async synthesize(text: string, voice: Voice, config: ProviderConfig, options?: SynthesisOptions): Promise<SynthesisResult> {
       // Call the TTS API and return audio data
     },

     async validateKey(config: ProviderConfig): Promise<boolean> {
       // Verify the API key is valid
     },
   };
   ```

3. Register in `src/providers/registry.ts`:
   - Add the import
   - Add to the `providerMap` object
   - Add metadata to `PROVIDER_LIST`

4. Run `npm run typecheck` to verify everything compiles

## Code Style

- TypeScript strict mode is enabled
- Use path aliases: `@shared/` for `src/lib/`, `@providers/` for `src/providers/`
- Prefer named exports over default exports
- Use `interface` for object shapes, `type` for unions and intersections
- Keep components focused and small

## Pull Request Guidelines

- Create a feature branch from `main`
- Include a clear description of the change
- Ensure `npm run typecheck` and `npm run lint` pass
- Add tests for new functionality where applicable
- Keep PRs focused on a single concern
