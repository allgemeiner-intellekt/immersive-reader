# Light Mode Implementation Plan

## Context

The extension currently has a hardcoded dark theme across all 4 UI surfaces (popup, options, onboarding, floating toolbar). All CSS files use `:root` CSS custom properties for colors, which makes adding a light variant straightforward. The toolbar is in Shadow DOM, requiring special handling via `:host()` selectors.

**User decisions:**
- Default: `system` (follow OS preference)
- Toggle location: Options page only (new "Appearance" section)
- Toolbar: matches extension theme
- Flash fix: hidden until ready (opacity:0 → fade in)

---

## Step 1: Types & Constants

**`src/lib/types.ts`** — Add theme type and field to AppSettings:
```typescript
export type ThemeMode = 'system' | 'light' | 'dark';
// Add to AppSettings interface:
theme: ThemeMode;
```

**`src/lib/constants.ts`** — Add default:
```typescript
theme: 'system' as ThemeMode,
```

---

## Step 2: Theme Utility

**New file: `src/lib/theme.ts`**

- `resolveTheme(mode: ThemeMode): 'light' | 'dark'` — resolves `system` via `matchMedia('(prefers-color-scheme: dark)')`
- `applyTheme(mode: ThemeMode)` — sets `document.documentElement.dataset.theme` to resolved value, then sets `document.body.style.opacity = '1'`
- `watchTheme(mode: ThemeMode, callback): cleanup` — listens for OS preference changes when mode is `system`

---

## Step 3: Shared CSS Variables

**New file: `src/lib/theme-vars.css`** — Single source of truth for both palettes:

```css
:root {
  --bg: #0f0f23;
  --bg-alt: #1a1a2e;
  --surface: #16213e;
  --surface-hover: #1c2a4a;
  --text: #e0e0e0;
  --text-muted: #888;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --border: #2a2a4a;
  --danger: #ef4444;
  --danger-hover: #dc2626;
  --success: #22c55e;
  --radius: 8px;
}

[data-theme="light"] {
  --bg: #f8f9fb;
  --bg-alt: #f0f1f5;
  --surface: #ffffff;
  --surface-hover: #f0f2f5;
  --text: #1a1a2e;
  --text-muted: #6b7280;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --border: #e2e4e9;
  --danger: #dc2626;
  --danger-hover: #b91c1c;
  --success: #16a34a;
}
```

---

## Step 4: Update Page CSS Files

**Files:** `src/popup/popup.css`, `src/options/options.css`, `src/onboarding/onboarding.css`

For each:
1. Replace `:root` variable block with `@import '../lib/theme-vars.css';` (keep page-specific vars like `--sidebar-width` in place)
2. Replace hardcoded `color: #fff` on headings/titles with `var(--text)` 
3. Replace hardcoded `border-color: #fff` (e.g., `.swatch-active`) with `var(--text)`
4. Add `body { opacity: 0; transition: opacity 0.1s; }` for flash prevention (JS sets opacity to 1 after theme applies)

Specific selectors to fix:
- `popup.css`: `.popup-title` color
- `options.css`: `.sidebar-title`, section headings, `.modal h2`, `.swatch-active` border
- `onboarding.css`: `.step-title`, `.value-card h3`, `.tips-card h3`

---

## Step 5: Toolbar CSS (Shadow DOM)

**`src/content/player/toolbar.css`**

1. Extract all hardcoded colors into `:host` CSS variables (prefixed `--ir-`):
```css
:host {
  --ir-bg: rgba(26, 26, 46, 0.95);
  --ir-border: rgba(255, 255, 255, 0.1);
  --ir-text: #ffffff;
  --ir-text-muted: rgba(255, 255, 255, 0.5);
  --ir-btn-hover: rgba(255, 255, 255, 0.12);
  --ir-progress-track: rgba(255, 255, 255, 0.15);
  --ir-accent: #3b82f6;
  --ir-stop: #ef4444;
  --ir-toast-bg: rgba(30, 30, 50, 0.95);
  /* ... etc */
}

:host(.light) {
  --ir-bg: rgba(255, 255, 255, 0.92);
  --ir-border: rgba(0, 0, 0, 0.1);
  --ir-text: #1a1a2e;
  --ir-text-muted: rgba(0, 0, 0, 0.5);
  --ir-btn-hover: rgba(0, 0, 0, 0.08);
  --ir-progress-track: rgba(0, 0, 0, 0.1);
  --ir-accent: #2563eb;
  --ir-stop: #dc2626;
  --ir-toast-bg: rgba(255, 255, 255, 0.95);
}
```

2. Replace all hardcoded color values throughout toolbar.css with `var(--ir-*)` references

---

## Step 6: Mount Theme on Shadow DOM

**`src/content/mount.tsx`**

After creating the host element:
1. Read theme from `chrome.storage.local`
2. Resolve it, apply `light` or `dark` class to host element
3. Listen for `chrome.storage.onChanged` to update dynamically
4. Listen for `matchMedia` changes when mode is `system`

---

## Step 7: useTheme Hook

**New file: `src/lib/useTheme.ts`**

React hook that:
1. On mount: reads settings, calls `applyTheme()`, starts OS preference watcher
2. Listens for `chrome.storage.onChanged` so theme updates propagate across open surfaces
3. Returns cleanup on unmount

Call `useTheme()` in: `Popup.tsx`, `Options.tsx`, `Onboarding.tsx`

---

## Step 8: Options UI — Appearance Section

**`src/options/Options.tsx`**

1. Add `'appearance'` to the `Section` type and `NAV_ITEMS` array (first position)
2. Add an Appearance section with 3 radio-style buttons: System, Light, Dark
3. On change: `saveSettings({ ...settings, theme: value })`
4. Style consistent with existing sections (settings-card, labels, etc.)

---

## Step 9: Flash Prevention

**Each HTML entry point** (`popup/index.tsx`, `options/index.tsx`, `onboarding/index.tsx`):
- The CSS sets `body { opacity: 0; transition: opacity 0.1s; }`
- `useTheme` hook calls `applyTheme()` which sets `document.body.style.opacity = '1'` after applying the theme attribute

---

## Files Modified (summary)

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `ThemeMode` type, `theme` field to `AppSettings` |
| `src/lib/constants.ts` | Add `theme: 'system'` to defaults |
| `src/lib/theme.ts` | **New** — resolve, apply, watch utilities |
| `src/lib/theme-vars.css` | **New** — shared dark/light CSS variables |
| `src/lib/useTheme.ts` | **New** — React hook for theme application |
| `src/popup/popup.css` | Import shared vars, fix hardcoded colors, add opacity:0 |
| `src/popup/Popup.tsx` | Add `useTheme()` call |
| `src/options/options.css` | Import shared vars, fix hardcoded colors, add opacity:0 |
| `src/options/Options.tsx` | Add `useTheme()`, add Appearance section |
| `src/onboarding/onboarding.css` | Import shared vars, fix hardcoded colors, add opacity:0 |
| `src/onboarding/Onboarding.tsx` | Add `useTheme()` call |
| `src/content/player/toolbar.css` | Extract colors to `:host` vars, add `:host(.light)` |
| `src/content/mount.tsx` | Apply theme class to Shadow DOM host |

## Verification

1. `npm run build` — ensure no TS or CSS errors
2. Load extension in Chrome, test all 4 surfaces in dark mode (should look identical to current)
3. Switch to light in Options → verify popup, options, onboarding, toolbar all switch
4. Switch to system → change OS preference → verify all surfaces follow
5. Close and reopen popup → verify no flash of dark theme in light mode
6. Test toolbar on both dark and light web pages
7. `npm run typecheck && npm run lint && npm run test`
