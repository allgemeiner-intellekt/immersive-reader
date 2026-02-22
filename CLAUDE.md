# Immersive Reader

Chrome Extension (MV3) — AI-powered TTS with real-time word/sentence highlighting. Uses OpenAI-compatible TTS endpoints (designed for `openai-edge-tts` at `localhost:5050`).

## Commands

```bash
npm run dev        # Vite dev + HMR (load dist/ as unpacked extension)
npm run build      # tsc + vite build → dist/
```

## Architecture

Three isolated Chrome extension contexts, communicating via `chrome.runtime` message passing:

- **Content Script** — React app in Shadow DOM (`mount.tsx`), text extraction, word/sentence highlighting, player UI. Highlighting and play-button injection operate on the host page DOM directly; the React tree lives entirely inside the Shadow DOM.
- **Service Worker** — Pure message router; never processes messages, only forwards between content script and offscreen document.
- **Offscreen Document** — TTS fetch + MSE audio streaming (`MediaSource` → `SourceBuffer`). Prefetch uses its own `AbortController` separate from active playback.

All messages typed as discriminated union on `type` in `src/shared/messages.ts`. `SEGMENT_COMPLETE` and `PLAYBACK_ERROR` handlers validate `segmentId` against current segment — stale messages from previous segments are silently ignored.
