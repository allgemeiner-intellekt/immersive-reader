# Toolbar-First UX: One-Click Reading

## Context

Currently the user must: click extension icon → popup opens → click Play. This is 2 interactions for the most common action. The goal is: click extension icon → floating toolbar appears with animation → reading begins automatically. The toolbar becomes the primary UI surface, expandable to reveal controls that currently live only in the popup (provider selector, speed slider, page info, settings).

## Phase 1: Wire Icon Click to Auto-Start

### 1a. Remove popup from manifest
**File: `manifest.config.ts`**
- Remove `default_popup: 'src/popup/index.html'` from the `action` block
- Keep `default_icon` entries
- This enables `chrome.action.onClicked` to fire

### 1b. Add message type
**File: `src/lib/messages.ts`**
- Add `SHOW_TOOLBAR = 'SHOW_TOOLBAR'` to MSG enum
- Add to ExtensionMessage union: `{ type: MSG.SHOW_TOOLBAR; error?: string }`

### 1c. Add icon click handler
**File: `src/background/index.ts`**
- Add `chrome.action.onClicked.addListener(async (tab) => { ... })`
- State machine:
  - `idle` → check if provider configured → if yes, `startPlayback(tab.id)` → if no, send `SHOW_TOOLBAR` with error + open options page
  - `playing` → if same tab: `pausePlayback()`, if different tab: stop current + start on new tab
  - `paused` → if same tab: `resumePlayback()`, if different tab: stop current + start on new tab
  - `loading` → no-op (debounce)
- Guard against non-injectable pages (`chrome://`, `chrome-extension://`, Web Store) with try/catch
- Use `getActiveTab()` from orchestrator to detect tab mismatch

### 1d. Export ensureContentScript
**File: `src/background/orchestrator.ts`**
- Export the existing `ensureContentScript(tabId)` function so `index.ts` can call it

### 1e. Handle SHOW_TOOLBAR in content
**File: `src/content/index.tsx`**
- Add `MSG.SHOW_TOOLBAR` to the message listener
- Handler: `store.showToolbar()`, and if `message.error` → `store._showToast(message.error)`

## Phase 2: Expandable Toolbar

### 2a. Add expanded state to store
**File: `src/content/state/store.ts`**
- Add `expanded: boolean` (default `false`)
- Add `toggleExpanded()` and `setExpanded(expanded: boolean)` actions
- Auto-collapse on stop: update the `stop()` action to also `set({ expanded: false })`

### 2b. Create ExpandedPanel component
**File: `src/content/player/ExpandedPanel.tsx` (new)**
- Loads providers from `chrome.storage.local` via `getProviders()` on mount
- Loads settings via `getSettings()` on mount
- Listens to `chrome.storage.onChanged` for live updates
- Contains:
  - **Provider selector** — `<select>` with dedup logic (from Popup.tsx lines 210-228), dispatches `MSG.SET_ACTIVE_PROVIDER`
  - **Speed slider** with value label + preset chips (1x, 1.25x, 1.5x, 2x), uses store `setSpeed()`
  - **Page info** — title, word count, segment progress from store
  - **Settings button** — `chrome.runtime.openOptionsPage()`

### 2c. Update FloatingToolbar
**File: `src/content/player/FloatingToolbar.tsx`**
- Add expand/settings button (gear or chevron icon) to the collapsed row
- When `expanded`, render `<ExpandedPanel />` below the controls row
- Toggle class `ir-toolbar--collapsed` ↔ `ir-toolbar--expanded`

### 2d. Add ExpandButton to controls
**File: `src/content/player/ToolbarControls.tsx`**
- New `ExpandButton` component — chevron/gear icon that rotates when expanded

### 2e. Style the expanded panel
**File: `src/content/player/toolbar.css`**
- `.ir-toolbar--expanded`: rounded rect (16px radius), min-width 320px, flex-direction column
- `.ir-expanded-panel`: padding, gap, max-height transition for smooth open/close
- Provider select, speed slider, page info styles (adapted from popup.css for dark/light theme)
- Expand button styles with rotation transition

## Phase 3: Entrance Animation

### 3a. Add animation keyframes
**File: `src/content/player/toolbar.css`**
- `@keyframes ir-slide-up`: translateY(20px) opacity(0) → translateY(0) opacity(1), ~300ms ease-out

### 3b. Apply animation on visibility change
**File: `src/content/player/FloatingToolbar.tsx`**
- Track previous visibility to detect show transitions
- On show: apply `ir-slide-up` animation class
- On hide: reverse animation before unmounting (or simple fade-out)

## Phase 4: Safety & Edge Cases

### 4a. Context menu fallback
**File: `src/background/index.ts`**
- Add `chrome.contextMenus.create({ id: 'ir-settings', title: 'Immersive Reader Settings', contexts: ['action'] })` on install
- Handler opens `chrome.runtime.openOptionsPage()`
- This ensures settings are always reachable even on non-injectable pages

### 4b. Non-injectable page handling
- Wrap `ensureContentScript` / `startPlayback` in try/catch
- On failure, use `chrome.action.setBadgeText({ text: '!' })` briefly, then clear after 2s

### 4c. Tab mismatch
- Compare `getActiveTab()` with clicked `tab.id`
- If different and playing/paused: `stopPlayback()` first, then `startPlayback(tab.id)`

## Files Modified (summary)
| File | Change |
|---|---|
| `manifest.config.ts` | Remove `default_popup` |
| `src/lib/messages.ts` | Add `SHOW_TOOLBAR` message |
| `src/background/index.ts` | Add `onClicked` handler + context menu |
| `src/background/orchestrator.ts` | Export `ensureContentScript` |
| `src/content/index.tsx` | Handle `SHOW_TOOLBAR` message |
| `src/content/state/store.ts` | Add `expanded` state |
| `src/content/player/FloatingToolbar.tsx` | Add expand logic + animation |
| `src/content/player/ExpandedPanel.tsx` | **New** — provider selector, speed, page info, settings |
| `src/content/player/ToolbarControls.tsx` | Add `ExpandButton` |
| `src/content/player/toolbar.css` | Expanded styles + entrance animation |

## Verification
1. `npm run typecheck` — no type errors
2. `npm run build` — clean build, popup no longer in output
3. Load unpacked in Chrome:
   - Click icon on a normal page → toolbar slides up, reading starts automatically
   - Click icon while playing → pauses
   - Click icon while paused → resumes
   - Click expand button → panel opens with provider selector, speed, settings
   - Click icon on `chrome://extensions` → graceful error (badge "!"), no crash
   - Right-click icon → "Immersive Reader Settings" → opens options page
   - Remove all providers → click icon → toast "No TTS provider configured" + options page opens
4. `npm run test` — existing tests pass
