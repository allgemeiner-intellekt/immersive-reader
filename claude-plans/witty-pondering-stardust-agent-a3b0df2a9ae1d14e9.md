# Review of witty-pondering-stardust.md Improvement Plan

## 1A. Gapless Audio Scheduling — SIMPLIFY

**Does it make the project better?** Yes, audible gaps between chunks are real and noticeable. This is the single highest-impact UX improvement in the plan.

**Cost analysis:**
- Implementation: ~200 lines changed across 3-4 files. Major rewrite of `audio-player.ts`.
- Maintenance: High. Time-cursor scheduling with multiple active `AudioBufferSourceNode`s is tricky — pause/resume/skip/speed-change all get harder when you have pre-scheduled future sources.
- Runtime cost: Negligible (slightly more memory for multiple scheduled buffers).
- Regression risk: HIGH. Pause, resume, skip forward/backward, speed change mid-playback, volume change — all need to work correctly with pre-scheduled sources. The current `pause()` at line 82 does `sourceNode.stop()` and records `pauseOffset` — this pattern breaks completely with time-cursor scheduling because you can't resume pre-scheduled-but-not-yet-started sources after `ctx.suspend()`.

**Concreteness gaps:**
- The plan says "Pause/resume via `ctx.suspend()`/`ctx.resume()`" but does not address that `setSpeed()` (line 104) currently sets `sourceNode.playbackRate.value` on a single source. With multiple scheduled sources, you need to update ALL active sources AND recalculate all future `start()` times. This is a significant omission.
- "Only last source's `onended` sends `CHUNK_COMPLETE`" — but what if the user skips forward while sources are still scheduled? Need to cancel all scheduled sources. The plan does not describe the cancellation logic.
- The `OFFSCREEN_SCHEDULE_NEXT` message is poorly defined. What does it carry? Just audio data and chunk index? How does the orchestrator know when to schedule vs. when to wait?

**Simpler alternative that gets 80% of the benefit:**
Instead of full time-cursor scheduling, use a **two-buffer crossfade approach**: keep the current single-source model, but when chunk N is ~200ms from ending, pre-decode chunk N+1 (already done via prefetch cache) and start it at `currentSource.buffer.duration - pauseOffset - 0.05` seconds from now. This eliminates the gap without requiring a full rewrite of pause/resume/skip/speed logic. Concretely:

1. In `AudioPlayer`, add a `nextSourceNode` field.
2. When `OFFSCREEN_PLAY` arrives and a source is already playing, schedule the new source to start at `this.startTime + this.currentBuffer.duration / this.playbackRate`.
3. When `onended` fires on the current source, promote `nextSourceNode` to `sourceNode`.
4. Pause/resume/skip still work on at most 2 sources.

This is ~50 lines of change instead of ~200, and it preserves the existing pause/resume/speed mechanics.

**Verdict: SIMPLIFY** — Use the two-buffer overlap approach. Defer full time-cursor scheduling to a later version when you have proper integration tests.

---

## 1B. Structured Errors + Retry-After + Timeouts — KEEP

**Does it make the project better?** Yes. The current `ApiError.fromResponse()` (line 10-13 of `api-error.ts`) ignores `Retry-After` headers entirely. The hardcoded cooldowns in `failover.ts` (lines 9-12: `COOLDOWN_429 = 60_000`, etc.) are guesses. Timeouts are missing — a hung API call blocks playback forever.

**Cost analysis:**
- Implementation: ~40 lines. Add `retryAfterMs` field, parse header in `fromResponse()`, add `fromTimeout()` factory, wrap `synthesize()` with `Promise.race`.
- Maintenance: Minimal — additive fields, no behavioral change for providers that don't send `Retry-After`.
- Runtime cost: Zero.
- Regression risk: LOW. The timeout wrapper is the riskiest part — make sure the `AbortController` from the timeout actually aborts the underlying `fetch()`.

**Concreteness improvements needed:**
- Specify the exact `Retry-After` parsing. The header can be either seconds (`Retry-After: 120`) or an HTTP-date (`Retry-After: Wed, 21 Oct 2025 07:28:00 GMT`). The plan should say: parse as integer seconds first, fall back to Date parsing, ignore if unparseable.
- The timeout should use `AbortSignal.timeout()` passed to `fetch()` rather than `Promise.race`, which leaves the fetch dangling. Concretely, in `elevenlabs.ts` line 72 and `openai.ts` line 34, add `signal: AbortSignal.timeout(30_000)` to the fetch options. This is cleaner than the `Promise.race` approach the plan describes.
- The exponential backoff formula `Math.min(1000 * 2^(attempts-1), 8000)` should replace the flat `setTimeout(r, 1000)` at `orchestrator.ts` line 210.

**Verdict: KEEP** — with the `AbortSignal.timeout()` simplification instead of `Promise.race`.

---

## 2A. Improved Sentence Splitting — KEEP

**Does it make the project better?** Yes, but marginally. East Asian punctuation support is legitimate for i18n. URL handling is a real edge case.

**Cost analysis:**
- Implementation: ~15 lines. Add 3 Unicode characters to the punctuation check at `sentence-splitter.ts` line 71 (`ch !== '.' && ch !== '!' && ch !== '?'`), add a `isUrlDot()` check.
- Maintenance: Zero.
- Runtime cost: Zero.
- Regression risk: LOW.

**Concreteness improvements needed:**
- The East Asian terminators need to be added to the condition at line 71 of `sentence-splitter.ts`: change the guard to also check `\u3002`, `\uFF01`, `\uFF1F`. But also need to adjust the "next is uppercase" check at line 95 — CJK text does not have uppercase letters. After CJK terminators, any non-whitespace character should count as a new sentence start.
- The `isUrlDot()` helper should check for `://` within the last ~20 characters before the dot, or check for common TLD patterns (`com`, `org`, `net`, `io`). But honestly, URLs in article body text are rare after Readability extraction strips navigation. Consider whether this is worth the regex cost.

**Verdict: KEEP** — East Asian punctuation is trivial and correct. URL handling is optional; skip it unless you have test cases showing real breakage.

---

## 2B. Dynamic Chunk Sizing per Provider — SIMPLIFY

**Does it make the project better?** Theoretically yes — larger chunks for cloud providers reduce API calls and improve prosody. But the plan's implementation is over-engineered.

**Cost analysis:**
- Implementation: ~100 lines across 5 files. New type, new registry function, new chunker strategy, new message field, orchestrator changes.
- Maintenance: Every new provider needs a capabilities entry. The char-based chunking strategy is a second code path to maintain.
- Runtime cost: Fewer API calls for cloud providers (good), but larger chunks mean longer time-to-first-audio (bad).
- Regression risk: MEDIUM. The plan says "changes content extraction contract" — this is underselling it. Content extraction currently happens in the content script, and chunks are stored there. Changing chunk sizes means the orchestrator needs to communicate the chunk config to the content script BEFORE extraction. The current flow is `EXTRACT_CONTENT` -> content script chunks internally -> orchestrator calls `GET_CHUNK` by index. Adding `chunkConfig` to `ExtractContentMessage` means the content script's chunker needs to accept the config.

**What's missing:**
- Time-to-first-audio tradeoff. A 750-char chunk for OpenAI means ~150 words. At ~150 WPM, that is ~60 seconds of audio per chunk. Synthesis time for 150 words is ~2-4 seconds. The user waits 2-4 seconds before hearing anything. The current 20-word chunks give ~0.5s synthesis latency. The plan does not address this.
- The plan targets 750 chars for OpenAI, but OpenAI's `tts-1` has a 4096 character limit. 750 is conservative but fine.

**Simpler alternative:**
Just change the constants in `constants.ts` (lines 18-20) and `chunker.ts` (lines 4-7) to be configurable rather than hardcoded. Add a `getChunkLimits(providerId: string)` function to `registry.ts` that returns `{ minWords: number, maxWords: number }`. Pass this to `chunkText()`. Skip the char-based strategy entirely — word-based chunking with larger targets (e.g., 40-60 words for cloud providers) captures 80% of the prosody benefit without a second code path.

```typescript
// In registry.ts
export function getChunkLimits(providerId: string): { min: number; max: number } {
  switch (providerId) {
    case 'groq': return { min: 15, max: 25 };
    default: return { min: 30, max: 50 };
  }
}
```

**Verdict: SIMPLIFY** — Use word-based chunking with per-provider limits. Skip the char-based strategy.

---

## 3A. ElevenLabs Word-Level Timestamps — KEEP (with caveats)

**Does it make the project better?** Yes. This is the biggest highlighting quality improvement possible. The current interpolation in `word-timing.ts` (lines 55-75) uses character-weighted fractions which is a rough approximation — real timestamps from ElevenLabs would make highlighting genuinely accurate.

**Cost analysis:**
- Implementation: ~30 lines in `elevenlabs.ts`. Add `with_alignment: true` to the request body, parse the alignment response.
- Maintenance: Low, but depends on ElevenLabs API stability. The alignment format may change.
- Runtime cost: Response payload increases (alignment data). Negligible.
- Regression risk: MEDIUM. The response format changes when `with_alignment: true` is set — need to verify it is still a raw audio stream or if it becomes a JSON wrapper.

**Critical gap in the plan:**
The plan does not specify the ElevenLabs alignment response format. When `with_alignment: true` is added to the `/v1/text-to-speech/{voice_id}/stream` endpoint, the response is **no longer a raw audio stream**. It becomes a JSON response with `audio_base64` and `alignment` fields. This is a significant API contract change that the plan completely glosses over. The current code at `elevenlabs.ts` line 85 does `response.arrayBuffer()` — this would break.

The implementation needs to:
1. Check if alignment data is supported (it requires certain models/plans).
2. Parse the JSON response: `{ audio_base64: string, alignment: { characters: string[], character_start_times_seconds: number[], character_end_times_seconds: number[] } }`.
3. Map character-level alignment to word-level `WordTiming[]`.
4. Decode the base64 audio back to `ArrayBuffer`.

Alternatively, use the `/v1/text-to-speech/{voice_id}/with-timestamps` endpoint which is the documented way to get alignment. The `/stream` endpoint with `with_alignment` is undocumented behavior.

**Verdict: KEEP** — but the implementation section needs a complete rewrite to handle the response format change. Use the `/with-timestamps` endpoint.

---

## 3B. Streaming TTS Playback — CUT

**Does it make the project better?** In theory, yes — streaming reduces time-to-first-audio. In practice, the complexity is not justified for a Chrome extension.

**Cost analysis:**
- Implementation: ~200+ lines across 5 files. New `synthesizeStream()` interface method, `BufferedStreamReader`, progressive decode, new message types.
- Maintenance: HIGH. Two code paths for synthesis (streaming and non-streaming). Progressive MP3 decoding is fragile — `decodeAudioData()` can fail on partial MP3 frames.
- Runtime cost: More message passing (stream chunks as base64 over Chrome messages).
- Regression risk: HIGH. The plan correctly notes that `ReadableStream` cannot be transferred via MV3 message passing, so streaming reads happen in the service worker and decoded chunks are sent as base64. This means the service worker is doing CPU-intensive work (buffering, potentially decoding) which conflicts with MV3's service worker lifecycle (can be killed after 30s of inactivity).

**Why it's not worth it:**
- Current time-to-first-audio with 20-word chunks is ~0.3-1s for cloud providers. This is already acceptable.
- If you implement 2B (larger chunks), then streaming becomes more valuable — but the plan proposes both, and they partially conflict (larger chunks reduce API calls; streaming reduces latency of each call).
- The MV3 service worker constraint makes this significantly harder than in a normal web app. The plan acknowledges this but underestimates the implementation cost.
- This depends on 1A (gapless scheduling), adding ordering risk.

**Verdict: CUT** — The complexity-to-benefit ratio is poor in an MV3 context. If time-to-first-audio is a problem, keep chunks small instead.

---

## 4A. Reading Progress Persistence — KEEP

**Does it make the project better?** Yes. Losing your place on page refresh is a real pain point for long articles.

**Cost analysis:**
- Implementation: ~80 lines. New storage type, save/load functions, a small toast component.
- Maintenance: Low. The `cleanOldProgress(maxAgeDays=7)` is good hygiene.
- Runtime cost: One `chrome.storage.local.set()` per chunk (~every 5-10 seconds). Negligible.
- Regression risk: LOW.

**Concreteness improvements needed:**
- The progress key should be `url + providerId + voiceId` to avoid resuming with a different voice at a mismatched position (different voices have different timing).
- Actually, simpler: just store `{ url, chunkIndex, totalChunks, timestamp }`. The chunk index is voice-agnostic since chunks are text-based.
- The "Resume from where you left off?" toast needs dismiss + accept. On accept, call `startPlayback()` then `skipToChunk()`. The plan does not specify the skip mechanism — the existing `skipToChunk()` in `orchestrator.ts` (line 161) works, but it requires playback to already be active. The resume flow should be: start playback normally, then in `playChunksSequentially()`, check for saved progress and start from that index instead of 0.
- Storage format:
```typescript
interface ReadingProgress {
  url: string;
  chunkIndex: number;
  totalChunks: number;
  timestamp: number;
}
```
- Store under key `ir-progress-${hashUrl(url)}` to avoid key collisions.

**Verdict: KEEP** — straightforward, high user value. Implement the resume by passing `startIndex` to `playChunksSequentially()` rather than a skip.

---

## 4B. LRU Audio Cache — SIMPLIFY

**Does it make the project better?** Marginally. Skip-back requiring re-synthesis is annoying but rare. The existing prefetch cache (`prefetchedBuffers` in `audio-player.ts`, `prefetchCache` in `orchestrator.ts`) already handles forward caching.

**Cost analysis:**
- Implementation: ~60 lines for an LRU cache class.
- Maintenance: Low.
- Runtime cost: Memory — 5 decoded `AudioBuffer`s. At ~1MB per 30s of audio, this is ~5MB. Acceptable.
- Regression risk: LOW.

**What's missing:**
- The plan says "keyed by `hash(text+voiceId+speed)`" but speed changes should invalidate the cache because the audio was synthesized at a specific speed (for OpenAI which takes speed as a parameter). For ElevenLabs, speed is applied client-side via `playbackRate`, so the audio data is speed-independent. The cache key strategy needs to be provider-aware.
- Actually, looking at the code: OpenAI sends `speed` in the synthesis request (openai.ts line 39), so cached audio at speed 1.0x cannot be reused at 1.5x. ElevenLabs does NOT send speed to the API — speed is applied via `sourceNode.playbackRate`. So for ElevenLabs, `hash(text+voiceId)` suffices. For OpenAI, `hash(text+voiceId+speed)` is correct.

**Simpler alternative:**
The existing `prefetchCache` in the orchestrator already stores `SynthesizedChunk` objects. Instead of a separate LRU in `audio-player.ts`, just modify the orchestrator's `prefetchCache` to not clear backwards entries. Change it from a `Map` to an LRU map with a max size of 8, keeping both forward-prefetched and recently-played chunks. This is ~20 lines of change in `orchestrator.ts` instead of a new class in `audio-player.ts`.

**Verdict: SIMPLIFY** — Expand the existing `prefetchCache` in the orchestrator to retain backward entries with an LRU eviction policy. No new class needed.

---

## Summary Table

| # | Improvement | Verdict | Effort | Impact | Priority |
|---|------------|---------|--------|--------|----------|
| 1A | Gapless Audio | SIMPLIFY (two-buffer overlap) | Medium | High | 1 |
| 1B | Structured Errors + Timeouts | KEEP | Low | Medium | 2 |
| 2A | Sentence Splitting (CJK) | KEEP (skip URL handling) | Low | Low | 3 |
| 2B | Dynamic Chunk Sizing | SIMPLIFY (word-based only) | Low | Medium | 4 |
| 3A | ElevenLabs Timestamps | KEEP (rewrite impl details) | Medium | High | 5 |
| 3B | Streaming TTS | CUT | High | Low (in MV3) | - |
| 4A | Reading Progress | KEEP | Low | High | 2 |
| 4B | LRU Audio Cache | SIMPLIFY (expand prefetchCache) | Low | Low | 6 |

## Recommended Shipping Order

1. **1B + 2A + 4A** — Three low-risk, independent improvements. Ship together.
2. **2B (simplified)** — Change chunk limits per provider. Quick follow-up.
3. **1A (simplified)** — Two-buffer overlap for gapless audio. Ship alone, test heavily.
4. **3A** — ElevenLabs timestamps. Behind a flag until validated.
5. **4B (simplified)** — Expand prefetchCache to retain backward entries.
6. ~~3B~~ — Cut entirely.
