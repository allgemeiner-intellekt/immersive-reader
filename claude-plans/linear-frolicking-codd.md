# Plan: Interactive Text Scrubber

## Context

When the extension is reading (playing or paused), users should be able to hover over any sentence to see a subtle shadow, and click to jump playback to that sentence. This turns the highlighted text into an interactive scrubber for visual navigation.

Currently, highlights are purely visual feedback — no click/hover handlers exist on page text. The chunk system already maps sentences to character offsets, and the orchestrator already has `skipToChunk()` for jumping to arbitrary positions. This feature connects user clicks on page text → chunk lookup → seek command.

## Implementation

### 1. Add `SEEK_TO_CHUNK` message type
**File:** `src/lib/messages.ts`

- Add `SEEK_TO_CHUNK: 'SEEK_TO_CHUNK'` to the `MSG` object (line ~10, near `SKIP_FORWARD`/`SKIP_BACKWARD`)
- Add interface:
  ```ts
  export interface SeekToChunkMessage {
    type: typeof MSG.SEEK_TO_CHUNK;
    chunkIndex: number;
  }
  ```
- Add `SeekToChunkMessage` to the `ExtensionMessage` union type

### 2. Export `skipToChunk` and route the message
**File:** `src/background/orchestrator.ts`
- Change `async function skipToChunk(...)` (line 257) to `export async function skipToChunk(...)`

**File:** `src/background/message-router.ts`
- Import `skipToChunk` from orchestrator (add to existing import on line 3)
- Add case in `routeMessage` switch (after `MSG.SKIP_BACKWARD` case, ~line 72):
  ```ts
  case MSG.SEEK_TO_CHUNK:
    skipToChunk(message.chunkIndex).catch(console.error);
    sendResponse({ ok: true });
    break;
  ```

### 3. Add `seekToChunk` store action
**File:** `src/content/state/store.ts`
- Add `seekToChunk: (chunkIndex: number) => void` to the `ToolbarState` interface
- Implement in store:
  ```ts
  seekToChunk: (chunkIndex: number) => {
    sendMessage({ type: MSG.SEEK_TO_CHUNK, chunkIndex });
    set({ playbackStatus: 'loading' });
  },
  ```

### 4. Add scrub-hover highlight support to HighlightManager
**File:** `src/content/highlighting/highlight-manager.ts`
- Add private field `private scrubHoverHighlight: Highlight | null = null`
- In `init()`: create and register `CSS.highlights.set('ir-scrub-hover', this.scrubHoverHighlight)`
- Add public method `highlightScrubHover(charStart, charEnd)` — same pattern as `highlightSentence` but uses `ir-scrub-hover` register / `ir-scrub-hover-mark` fallback class
- Add public method `clearScrubHover()`
- Add public getter `getEntries()` — returns `this.textMap?.entries ?? []` (needed by scrubber to map click coordinates → character offsets)
- In `clearAll()`: also call `clearScrubHover()`
- In `destroy()`: also delete `ir-scrub-hover` from `CSS.highlights`

### 5. Add scrub-hover CSS styles
**File:** `src/content/highlighting/styles.ts`
- Add to `buildCSS()`:
  ```css
  ::highlight(ir-scrub-hover) {
    background-color: rgba(0, 0, 0, 0.06);
  }
  mark.ir-scrub-hover-mark {
    background-color: rgba(0, 0, 0, 0.06);
    color: inherit;
    padding: 0;
    margin: 0;
    border-radius: 2px;
  }
  html.ir-scrub-active { cursor: pointer; }
  ```

### 6. Create the text scrubber module (NEW FILE)
**File:** `src/content/highlighting/text-scrubber.ts`

Core module that attaches mousemove/click listeners to the document and maps cursor position → chunk index.

**API:**
```ts
export function initTextScrubber(
  highlightManager: HighlightManager,
  chunks: TextChunk[],
  onSeek: (chunkIndex: number) => void,
): void;

export function destroyTextScrubber(): void;
```

**Key implementation details:**

- **Coordinate → offset mapping**: Use `document.caretPositionFromPoint(x, y)` (Chrome 128+) with fallback to `document.caretRangeFromPoint(x, y)` to get the text node + local offset at cursor position
- **Node → global offset**: Build a `WeakMap<Text, TextNodeEntry>` from `highlightManager.getEntries()` during init for O(1) lookup. Given a text node + local offset, compute `globalOffset = entry.globalStart + localOffset`
- **Offset → chunk**: Linear scan through `chunks` to find `chunk.startOffset <= globalOffset < chunk.endOffset`
- **State gating**: Read `useToolbarStore.getState().playbackStatus` — only activate when `'playing'` or `'paused'`
- **Throttled mousemove**: Use `requestAnimationFrame` to throttle. Track `lastHoveredChunkIndex` to skip redundant highlight updates
- **On hover**: Call `highlightManager.highlightScrubHover(chunk.startOffset, chunk.endOffset)` and add `ir-scrub-active` class to `document.documentElement`
- **On click**: Map to chunk, call `onSeek(chunk.index)`, clear hover
- **Link/button safety**: Before handling click, check if `e.target` or ancestors are `<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, or `[role="button"]`/`[role="link"]`. If so, don't intercept
- **On destroy**: Remove listeners, clear hover, remove `ir-scrub-active` class

### 7. Wire scrubber into content script lifecycle
**File:** `src/content/index.tsx`
- Import `initTextScrubber`, `destroyTextScrubber` from `./highlighting/text-scrubber`
- After `recomputeChunkOffsets()` in `MSG.EXTRACT_CONTENT` handler (~line 142), call:
  ```ts
  initTextScrubber(highlightManager, currentChunks, (chunkIndex) => {
    useToolbarStore.getState().seekToChunk(chunkIndex);
  });
  ```
- In `MSG.STOP` handler (~line 229), before `highlightManager?.destroy()`, call:
  ```ts
  destroyTextScrubber();
  ```

## Files Changed (summary)

| File | Change |
|------|--------|
| `src/lib/messages.ts` | Add `SEEK_TO_CHUNK` msg type + interface |
| `src/background/orchestrator.ts` | Export `skipToChunk` |
| `src/background/message-router.ts` | Route `SEEK_TO_CHUNK` → `skipToChunk` |
| `src/content/state/store.ts` | Add `seekToChunk` action |
| `src/content/highlighting/highlight-manager.ts` | Add `ir-scrub-hover` highlight, `getEntries()` |
| `src/content/highlighting/styles.ts` | Add hover CSS + cursor class |
| **`src/content/highlighting/text-scrubber.ts`** | **NEW** — mousemove/click handlers, offset mapping |
| `src/content/index.tsx` | Init/destroy scrubber in lifecycle |

## Edge Cases

- **`caretPositionFromPoint` returns null**: Click was not on text — silently bail out
- **Rapid clicks**: `skipToChunk` already uses `abortController.abort()` + new controller, so rapid seeks are safe
- **Text selection drag**: Using `click` event (not `mouseup`) means drag-to-select won't trigger a seek
- **Paused → seek**: `skipToChunk` calls `playChunksSequentially()` which sets status to `playing` — auto-resumes

## Verification

1. `npm run typecheck` — ensure no type errors
2. `npm run build` — ensure clean production build
3. Manual test in Chrome:
   - Start reading an article
   - Hover over different sentences → subtle shadow appears on the hovered sentence
   - Click a sentence ahead → playback jumps to that sentence
   - Click a sentence behind → playback jumps backward
   - While paused, click a sentence → resumes from that position
   - Click on links/buttons → normal behavior, no interception
   - Stop reading → hover/click effects disappear
