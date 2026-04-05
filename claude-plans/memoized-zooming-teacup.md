# Plan: Introduce Theme Color (Accent Color) Setting

## Context

The extension uses the same blue (`#3b82f6`) for both UI accent elements (buttons, toggles, progress bars, sliders, focus rings) and the default text highlighting color. The user wants to decouple these by introducing a "theme color" setting that controls all UI accent elements independently from the already-configurable highlight colors.

The highlight system already has its own color picker and uses `settings.wordColor`/`settings.sentenceColor` directly — it never references `--accent`. So highlight colors are already independent; we just need to make the accent color configurable.

## Approach

Store a single hex color (`themeColor`) in settings. At runtime, derive all accent variants (hover, subtle, glow) and inject them as CSS custom property overrides on `document.documentElement` (options/popup/onboarding) and on the Shadow DOM host (toolbar). When `themeColor` is `null` (default), no overrides are set and the hardcoded blue in CSS remains active — zero visual change for existing users.

## Implementation Steps

### 1. Add `themeColor` to types and defaults

**`src/lib/types.ts`** (line 124) — Add to `AppSettings`:
```ts
themeColor: string | null; // hex like '#3b82f6', null = default blue
```

**`src/lib/constants.ts`** (line 3) — Add to `DEFAULT_SETTINGS`:
```ts
themeColor: null,
```

Add preset palette:
```ts
export const THEME_COLOR_PRESETS = [
  '#3b82f6', // Blue (default)
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
];
```

No storage migration needed — `getSettings()` spreads with defaults, so missing `themeColor` → `null`.

### 2. Create color derivation utility

**New file: `src/lib/accent-colors.ts`**

Exports:
- `hexToRgb(hex: string): [number, number, number]`
- `darkenHex(hex: string, amount: number): string` — darken by percentage
- `deriveAccentVars(hex: string, theme: 'light' | 'dark')` — returns:
  - `accent`: the hex color
  - `accentHover`: darkened ~15%
  - `accentSubtle`: `rgba(r,g,b, 0.1)` (dark) / `rgba(r,g,b, 0.08)` (light)
  - `shadowGlow`: `0 0 20px rgba(r,g,b, 0.25)` (dark) / `rgba(r,g,b, 0.2)` (light)
  - `accentGlow`: `rgba(r,g,b, 0.3)` (dark) / `rgba(r,g,b, 0.25)` (light) — for toolbar

Pure math, no external library.

### 3. Add accent color application to theme system

**`src/lib/theme.ts`** — Add `applyAccentColor(hex: string | null, resolvedTheme: 'light' | 'dark')`:
- If `hex` is null: remove `--accent`, `--accent-hover`, `--accent-subtle`, `--shadow-glow` from `document.documentElement.style` (falls back to CSS defaults)
- Otherwise: compute derived vars and set them as inline style properties on `:root`

Modify `applyTheme(mode, themeColor?)` to call `applyAccentColor` after setting `data-theme`.

### 4. Update `useTheme` hook

**`src/lib/useTheme.ts`** — Pass `settings.themeColor` to `applyTheme` in both `init()` and the storage change handler. Minimal change — just forwarding the new field.

### 5. Update toolbar Shadow DOM

**`src/content/mount.tsx`** (line 37, `applyToolbarTheme`) — After toggling light/dark class, if `settings.themeColor` is set, compute derived vars and set `--ir-accent`, `--ir-accent-hover`, `--ir-accent-glow` on `host.style`. If null, remove them so CSS defaults apply.

### 6. Add accent color picker to Appearance section

**`src/options/Options.tsx`** (after line 418) — Add a new `settings-card` with:
- Label: "Accent color"
- Row of color swatches using `THEME_COLOR_PRESETS` (reuse existing `.swatch` / `.swatch-active` CSS)
- Description: "Controls the color of buttons, toggles, and other UI elements."
- Active state: `(settings.themeColor ?? '#3b82f6') === c`
- onClick: save `themeColor: c` to settings

No new CSS needed — the existing swatch styles from the highlighting section work perfectly.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `themeColor` field to `AppSettings` |
| `src/lib/constants.ts` | Add default + `THEME_COLOR_PRESETS` |
| `src/lib/accent-colors.ts` | **New** — color derivation utility |
| `src/lib/theme.ts` | Add `applyAccentColor`, update `applyTheme` signature |
| `src/lib/useTheme.ts` | Forward `themeColor` to `applyTheme` |
| `src/content/mount.tsx` | Apply accent vars to Shadow DOM host |
| `src/options/Options.tsx` | Add accent color picker in Appearance section |

## What does NOT change

- `src/lib/theme-vars.css` — hardcoded blues remain as defaults (overridden at runtime by inline styles)
- `src/content/player/toolbar.css` — hardcoded blues remain as defaults
- `src/content/highlighting/styles.ts` — already uses settings directly, not `--accent`
- Highlight color pickers — remain fully independent

## Verification

1. `npm run typecheck` — ensure no type errors
2. `npm run build` — clean production build
3. Load extension in Chrome → Options → Appearance: verify accent color swatches appear below theme mode
4. Select different accent colors → verify buttons, toggles, active nav, focus rings all update
5. Open popup → verify play button, sliders, chips reflect new accent color
6. Start playback on a page → verify toolbar (play button, progress ring) uses new accent color
7. Verify highlight colors remain unchanged when accent color changes
8. Switch theme mode (light/dark/system) with a custom accent → verify accent persists correctly
9. Set accent back to blue (first swatch) → verify everything looks identical to original
