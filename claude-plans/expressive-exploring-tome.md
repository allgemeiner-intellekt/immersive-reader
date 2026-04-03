# Plan: Server-Side Speed + Continuous Slider with Haptic Snaps

## Context

Speed control sounds unnatural because `AudioBufferSourceNode.playbackRate` changes pitch proportionally (chipmunk at 1.5x+). The fix: lean on server-side TTS speed (the neural model generates natural prosody at the target rate), and only use client-side `playbackRate` as a brief bridge for the currently-playing chunk when speed changes mid-playback.

Additionally, the slider UX needs improvement: replace the 0.25-step discrete slider with a continuous (stepless) slider that magnetically snaps at preset values, and auto-constrains its range to what the active provider supports.

---

## Step 1: Add per-provider speed range metadata

**File: `src/lib/constants.ts`**

Add `SpeedRange` type and `PROVIDER_SPEED_RANGES` map (pure data, importable from any context):

```typescript
export interface SpeedRange { min: number; max: number }

export const PROVIDER_SPEED_RANGES: Record<string, SpeedRange | null> = {
  openai:     { min: 0.25, max: 4.0 },
  groq:       { min: 0.25, max: 4.0 },
  elevenlabs: { min: 0.7,  max: 1.2 },
  mimo:       null,                      // no server-side speed support
  custom:     { min: 0.25, max: 4.0 },  // OpenAI-compatible default
};
```

Change `SPEED_STEP` from `0.25` → `0.01`. Add `SPEED_SNAP_THRESHOLD = 0.04`.

Add utility functions:
- `snapSpeed(raw, presets, threshold)` — returns nearest preset if within threshold, else rounds to 2dp
- `filterPresetsForRange(min, max)` — filters `SPEED_PRESETS` to those within range
- `formatSpeed(s)` — smart display: `1x`, `1.25x`, `1.73x` (no trailing zeros for clean values)
- `getProviderSpeedRange(providerId)` — lookup helper, returns `SpeedRange | null`

---

## Step 2: Wire up ElevenLabs `speed` parameter

**File: `src/providers/elevenlabs.ts`**

In `synthesize()` (~line 90), add speed to the request body before both the `/with-timestamps` and `/stream` calls:

```typescript
const speed = options?.speed ?? 1.0;
if (speed !== 1.0) {
  body.speed = speed;
}
```

The `body` object is constructed once (line 90-93) and shared by both code paths, so this single change covers both.

---

## Step 3: Clamp speed in orchestrator before sending to provider

**File: `src/background/orchestrator.ts`**

In `synthesizeChunk()` (~line 411), clamp the speed to the provider's server-side range before passing to `synthesize()`. If the provider has no range (Mimo), pass speed=1.0 server-side (the full adjustment stays client-side via `playbackRate`).

```typescript
const rawSpeed = playbackState.getState().speed;
const range = PROVIDER_SPEED_RANGES[session.config.providerId];
const serverSpeed = range
  ? Math.min(Math.max(rawSpeed, range.min), range.max)
  : 1.0;

const result = await provider.synthesize(chunk.text, session.voice, session.config, {
  speed: serverSpeed,
});
```

In `setSpeed()` (~line 272), compute the **residual** for the client-side audio player. The offscreen document should play at `requestedSpeed / serverSpeed` (the ratio not covered by the server). For providers with full server range, the residual is ~1.0. For Mimo, the residual equals the full requested speed.

```typescript
// Send the residual rate to offscreen for the current chunk
const residual = range ? rawSpeed / serverSpeed : rawSpeed;
sendToOffscreen({ type: MSG.OFFSCREEN_SET_SPEED, speed: residual });
```

**Note**: For already-synthesized buffered chunks (synthesized at old speed), the offscreen `playbackRate` should be `newSpeed / oldServerSpeed`. This gets complex — simplest approach: invalidate pre-synthesized buffer on speed change and re-synthesize upcoming chunks at the new speed. The current chunk plays with `playbackRate = newSpeed / oldServerSpeed` as a bridge.

---

## Step 4: Create shared `SpeedSlider` component

**New file: `src/lib/SpeedSlider.tsx`**

Reusable across ExpandedPanel, Popup, and Options. Props:

```typescript
interface SpeedSliderProps {
  value: number;
  onChange: (speed: number) => void;
  providerId: string | null;
  showChips?: boolean;       // default true
  className?: string;
  labelId?: string;          // for aria-labelledby
}
```

Behavior:
- Derives effective `min`/`max` from `PROVIDER_SPEED_RANGES[providerId]`, falling back to global `SPEED_MIN`/`SPEED_MAX`
- Filters `SPEED_PRESETS` to only those within the effective range
- On `onChange`: applies `snapSpeed()` to raw slider value, then calls `props.onChange`
- Shows label row: "Speed" + formatted value (e.g. "1.5x")
- Shows `<input type="range">` with `step={SPEED_STEP}` (0.01) and `--fill` CSS var
- Shows preset chips (if `showChips`) filtered to provider range; active chip highlighted
- When `providerId` has `null` range (Mimo): slider still works (client-side only), but shows "(approximate)" or similar subtle note
- `useEffect` on `providerId` change: clamp value to new range if out of bounds

---

## Step 5: Replace inline sliders with `SpeedSlider`

### `src/content/player/ExpandedPanel.tsx` (lines 94-119)
- Import `SpeedSlider` from `@shared/SpeedSlider`
- Derive `activeProviderId` from `activeGroupKey`: for standard providers the groupKey IS the providerId; for custom, extract from `"custom:..."` → `"custom"`
- Replace the inline slider + chips with `<SpeedSlider value={speed} onChange={handleSpeedChange} providerId={activeProviderId} />`
- Remove `SPEED_CHIPS` constant and `SPEED_MIN/MAX/STEP` imports

### `src/popup/Popup.tsx` (lines 285-313)
- Same pattern. The Popup already tracks `activeProvider` — use `activeProvider?.providerId ?? null`
- Replace inline slider + chips with `<SpeedSlider>`

### `src/options/Options.tsx` (lines 745-761)
- Replace inline slider with `<SpeedSlider value={settings.playback.defaultSpeed} onChange={...} providerId={activeProviderId} showChips={false} />`
- Derive `activeProviderId` from settings' `activeProviderGroup`

---

## Step 6: Update `cycleSpeed` in store

**File: `src/content/state/store.ts`**

The `cycleSpeed` action (line 107) currently cycles through all `SPEED_PRESETS`. Update to filter presets by the active provider's range.

Add `activeProviderId: string | null` to `ToolbarState` and a `_setActiveProviderId` action. Set it when provider changes are detected (from the existing `_setProviderName` flow or storage change listener).

```typescript
cycleSpeed: () => {
  const { speed, activeProviderId } = get();
  const range = activeProviderId ? PROVIDER_SPEED_RANGES[activeProviderId] : null;
  const presets = range ? filterPresetsForRange(range.min, range.max) : SPEED_PRESETS;
  if (presets.length === 0) return;
  const idx = presets.indexOf(speed);
  const next = presets[(idx + 1) % presets.length];
  sendMessage({ type: MSG.SET_SPEED, speed: next });
  set({ speed: next });
},
```

---

## Step 7: CSS for snap feel and disabled state

**Files: `src/content/player/toolbar.css`, `src/popup/popup.css`, `src/options/options.css`**

- Add subtle thumb transition for magnetic snap feel: `transition: left 0.05s ease-out`
- Disabled slider styling (if needed for Mimo): `opacity: 0.4; cursor: not-allowed`
- No major CSS overhaul needed — existing `--fill` pattern works with the new step size

---

## Files Modified (summary)

| File | Change |
|------|--------|
| `src/lib/constants.ts` | `SpeedRange`, `PROVIDER_SPEED_RANGES`, snap/filter utilities, `SPEED_STEP` → 0.01 |
| `src/lib/SpeedSlider.tsx` | **New** — shared slider component |
| `src/providers/elevenlabs.ts` | Wire up `speed` param in API body |
| `src/background/orchestrator.ts` | Clamp speed to provider range; compute residual for offscreen |
| `src/content/player/ExpandedPanel.tsx` | Replace inline slider with `<SpeedSlider>` |
| `src/popup/Popup.tsx` | Replace inline slider with `<SpeedSlider>` |
| `src/options/Options.tsx` | Replace inline slider with `<SpeedSlider>` |
| `src/content/state/store.ts` | Add `activeProviderId`; update `cycleSpeed` |
| CSS files (toolbar, popup, options) | Snap transition, disabled state |

---

## Verification

1. `npm run typecheck` — no type errors
2. `npm run build` — clean production build
3. `npm run test` — existing tests pass
4. Manual test: load extension, switch between providers, verify:
   - Slider range changes per provider (e.g. ElevenLabs caps at 1.2x)
   - Slider snaps at preset values when dragging slowly
   - Slider moves continuously between presets
   - Speed chips only show values within provider range
   - Switching from OpenAI@2.0x to ElevenLabs auto-clamps to 1.2x
   - Mimo slider works (client-side rate) but range is unconstrained / labeled
   - ElevenLabs actually sends speed to API (check network tab)
   - Audio at 1.5x sounds natural (no chipmunk) on OpenAI/ElevenLabs
