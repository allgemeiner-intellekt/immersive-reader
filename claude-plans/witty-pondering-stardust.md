# OSS-Informed Improvements Plan (Revised)

## Context

After deep-diving 10 OSS project reviews in `reference/oss-reviews/` and a Codex review pass, this plan identifies **7 improvements** (1 cut) organized into 4 shipment groups. Each improvement has been validated for real user benefit vs. complexity cost.

**Cut:** Streaming TTS (3B) — MV3 service workers can be killed mid-stream, `ReadableStream` can't cross message boundaries, progressive MP3 `decodeAudioData()` on partial frames is fragile. Current time-to-first-audio with 20-word chunks is already ~0.3-1s. Not worth the complexity.

---

## Ship 1: Low-Risk Quick Wins (1B + 2A + 4A)

Three independent improvements, no dependencies between them.

### 1B. Structured Errors + Retry-After + Timeouts

**Files to modify:**

**`src/lib/api-error.ts`** — Add `retryAfterMs` field + header parsing:
```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly providerId: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,  // NEW
  ) { ... }

  static fromResponse(
    status: number,
    body: string,
    providerId: string,
    headers?: Headers,  // NEW parameter
  ): ApiError {
    const retryable = status === 429 || status === 403 || status >= 500;
    let retryAfterMs: number | undefined;
    if (headers) {
      const ra = headers.get('retry-after');
      if (ra) {
        const seconds = parseInt(ra, 10);
        retryAfterMs = !isNaN(seconds) ? seconds * 1000 : undefined;
        if (retryAfterMs === undefined) {
          const date = Date.parse(ra);
          if (!isNaN(date)) retryAfterMs = Math.max(0, date - Date.now());
        }
      }
    }
    return new ApiError(body || `HTTP ${status}`, status, providerId, retryable, retryAfterMs);
  }
}
```

**`src/providers/elevenlabs.ts`** (line 126), **`openai.ts`**, **`groq.ts`**, **`custom.ts`** — Pass `response.headers` to `fromResponse()`:
```typescript
// Before: throw ApiError.fromResponse(response.status, detail, 'elevenlabs');
// After:  throw ApiError.fromResponse(response.status, detail, 'elevenlabs', response.headers);
```
Also add `AbortSignal.timeout(30_000)` to all `fetch()` calls:
```typescript
// elevenlabs.ts line 104:
response = await fetch(`${baseUrl}/v1/text-to-speech/${voice.id}/stream`, {
  signal: AbortSignal.timeout(30_000),  // NEW
  method: 'POST',
  ...
});
```

**`src/background/failover.ts`** — Use `retryAfterMs` in `getCooldownDuration()` (line 37):
```typescript
export function getCooldownDuration(error: ApiError): number {
  if (error.retryAfterMs) return error.retryAfterMs;  // NEW: honor server header
  if (error.status === 429) return COOLDOWN_429;
  // ... rest unchanged
}
```

**`src/background/orchestrator.ts`** (line 389) — Exponential backoff on 5xx retry:
```typescript
// Before: await new Promise((r) => setTimeout(r, 1000));
// After:
await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (attempts - 1), 8000)));
```

---

### 2A. East Asian Sentence Splitting

**`src/content/extraction/sentence-splitter.ts`** (line 71) — Add CJK terminators:
```typescript
// Before:
if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '\u2026') continue;

// After:
if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '\u2026'
    && ch !== '\u3002' && ch !== '\uFF01' && ch !== '\uFF1F') continue;
```

Also at line 103 — allow CJK sentence starts (no uppercase requirement):
```typescript
const isCjkTerminator = ch === '\u3002' || ch === '\uFF01' || ch === '\uFF1F';
const nextIsUpper = afterPunct < text.length && /[A-Z\u201C\u2018"'\(]/.test(text[afterPunct]);
const nextIsCjk = afterPunct < text.length && /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text[afterPunct]);

if (atEnd || nextIsUpper || nextIsCjk || hasNewline || isCjkTerminator) {
```

**New test file:** `src/content/extraction/__tests__/sentence-splitter.test.ts`
- Test: `"This is English. 这是中文。第二句话。"` splits into 3 sentences
- Test: `"价格是3.14元。"` — decimal not split
- Test: `"Dr. Smith arrived。他来了。"` — abbreviation + CJK

---

### 4A. Reading Progress Persistence

**`src/lib/storage.ts`** — Add progress functions:
```typescript
interface ReadingProgress {
  url: string;
  chunkIndex: number;
  totalChunks: number;
  timestamp: number;
}

const PROGRESS_PREFIX = 'ir-progress:';
const PROGRESS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  await chrome.storage.local.set({ [PROGRESS_PREFIX + progress.url]: progress });
}

export async function getProgress(url: string): Promise<ReadingProgress | null> {
  const result = await chrome.storage.local.get(PROGRESS_PREFIX + url);
  const data = result[PROGRESS_PREFIX + url] as ReadingProgress | undefined;
  if (!data) return null;
  if (Date.now() - data.timestamp > PROGRESS_MAX_AGE_MS) {
    await chrome.storage.local.remove(PROGRESS_PREFIX + url);
    return null;
  }
  return data;
}

export async function clearProgress(url: string): Promise<void> {
  await chrome.storage.local.remove(PROGRESS_PREFIX + url);
}

export async function cleanOldProgress(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter(
    (k) => k.startsWith(PROGRESS_PREFIX) && Date.now() - all[k].timestamp > PROGRESS_MAX_AGE_MS,
  );
  if (keysToRemove.length) await chrome.storage.local.remove(keysToRemove);
}
```

**`src/background/orchestrator.ts`** — Save progress in `playChunksSequentially()`:
- After line 319 (`await waitForChunkComplete(i, signal);`), add:
```typescript
saveProgress({ url: currentUrl, chunkIndex: i, totalChunks, timestamp: Date.now() });
```
- Need to pass `url` through to this function (from `startPlayback`, which can get it via `sendTabMessage(tabId, { type: MSG.GET_PAGE_URL })` or as a parameter)

**`src/background/orchestrator.ts::startPlayback()`** — Check for saved progress:
- After extraction succeeds (line 172), check `getProgress(url)`
- If found and `chunkIndex < totalChunks`, pass `savedProgress.chunkIndex` as `startIndex` to `playChunksSequentially()` instead of `0`
- Notify content script: `MSG.RESUME_FROM_PROGRESS` with `{ chunkIndex }` so UI can show a brief toast

**`src/lib/messages.ts`** — Add `GET_PAGE_URL`, `RESUME_FROM_PROGRESS` message types

**`src/background/index.ts`** — Call `cleanOldProgress()` on service worker startup

---

## Ship 2: Dynamic Chunk Sizing (2B)

### 2B. Per-Provider Word Count Limits (Simplified)

Keep word-based chunking, just vary the target range per provider. No char-based strategy.

**`src/providers/registry.ts`** — Add chunk limits lookup:
```typescript
export function getChunkLimits(providerId: string): { min: number; max: number; splitThreshold: number } {
  switch (providerId) {
    case 'groq': return { min: 15, max: 25, splitThreshold: 50 };
    default:     return { min: 30, max: 50, splitThreshold: 80 };  // cloud providers benefit from larger chunks
  }
}
```

**`src/lib/chunker.ts`** — Accept config parameter:
```typescript
interface ChunkConfig {
  minWords: number;
  maxWords: number;
  splitThreshold: number;
}

const DEFAULT_CONFIG: ChunkConfig = { minWords: 15, maxWords: 25, splitThreshold: 50 };

export function chunkText(text: string, config: ChunkConfig = DEFAULT_CONFIG): TextChunk[] {
  // Replace TARGET_MIN_WORDS with config.minWords
  // Replace TARGET_MAX_WORDS with config.maxWords
  // Replace MAX_WORDS_BEFORE_SPLIT with config.splitThreshold
  // ...rest unchanged
}
```

**`src/lib/messages.ts`** — Add optional `chunkConfig` to `ExtractContentMessage`:
```typescript
// In ExtractContentMessage:
chunkConfig?: { minWords: number; maxWords: number; splitThreshold: number };
```

**`src/background/orchestrator.ts`** — In `startPlayback()` (around line 153), pass chunk config:
```typescript
const limits = getChunkLimits(session.config.providerId);
extractResult = await sendTabMessage(tabId, {
  type: MSG.EXTRACT_CONTENT,
  fromSelection,
  chunkConfig: limits,  // NEW
});
```

**`src/content/index.tsx`** — In `EXTRACT_CONTENT` handler, pass config to `chunkText()`:
```typescript
const chunks = chunkText(extractedText, message.chunkConfig);
```

---

## Ship 3: Gapless Audio (1A)

### 1A. Two-Buffer Overlap Scheduling (Simplified)

Instead of full time-cursor scheduling with multiple active sources, use a simpler two-buffer approach: schedule the next source to start exactly when the current one ends. This preserves existing pause/resume/skip/speed mechanics.

**`src/offscreen/audio-player.ts`** — Add `nextSourceNode` for gapless overlap:

```typescript
export class AudioPlayer {
  // ... existing fields ...
  private nextSourceNode: AudioBufferSourceNode | null = null;
  private nextBuffer: AudioBuffer | null = null;
  private nextChunkIndex = -1;

  // NEW: Schedule next chunk to start when current ends (gapless)
  async scheduleNext(audioData: ArrayBuffer, chunkIndex: number, format: string): Promise<void> {
    const ctx = this.getContext();
    
    // Decode the next buffer
    let buffer: AudioBuffer;
    const cached = this.prefetchedBuffers.get(chunkIndex);
    if (cached) {
      buffer = cached;
      this.prefetchedBuffers.delete(chunkIndex);
    } else {
      buffer = await ctx.decodeAudioData(audioData.slice(0));
    }

    this.nextBuffer = buffer;
    this.nextChunkIndex = chunkIndex;

    if (!this.isPlaying || !this.currentBuffer) {
      // Nothing playing — just play directly
      await this.play(audioData, chunkIndex, format);
      return;
    }

    // Schedule: start at the moment current source ends
    this.nextSourceNode = ctx.createBufferSource();
    this.nextSourceNode.buffer = buffer;
    this.nextSourceNode.playbackRate.value = this.playbackRate;
    this.nextSourceNode.connect(this.gainNode!);

    // Calculate when current chunk ends
    const elapsed = (ctx.currentTime - this.startTime);
    const remaining = (this.currentBuffer.duration - this.pauseOffset) / this.playbackRate - elapsed;
    const startAt = ctx.currentTime + Math.max(0, remaining);
    
    this.nextSourceNode.start(startAt);
  }

  // Modify existing onended in startPlayback():
  // When current chunk ends, promote nextSourceNode → sourceNode
  private startPlayback(): void {
    // ... existing setup ...
    this.sourceNode.onended = () => {
      if (this.isPlaying) {
        this.stopProgressReporting();
        
        if (this.nextSourceNode && this.nextBuffer) {
          // Promote next to current (gapless transition)
          this.sourceNode = this.nextSourceNode;
          this.currentBuffer = this.nextBuffer;
          this.currentChunkIndex = this.nextChunkIndex;
          this.startTime = this.ctx!.currentTime;
          this.pauseOffset = 0;
          this.nextSourceNode = null;
          this.nextBuffer = null;
          this.startProgressReporting();
          
          // Signal old chunk complete
          this.sendMessage({ type: MSG.CHUNK_COMPLETE, chunkIndex: oldChunkIndex });
          // The promoted source already has its own onended
        } else {
          // No next buffer — just complete
          this.isPlaying = false;
          this.sendMessage({ type: MSG.CHUNK_COMPLETE, chunkIndex: this.currentChunkIndex });
        }
      }
    };
  }

  // Modify pause/stop to also handle nextSourceNode
  pause(): void {
    // ... existing code ...
    if (this.nextSourceNode) {
      try { this.nextSourceNode.stop(); } catch {}
      this.nextSourceNode.disconnect();
      this.nextSourceNode = null;
      // nextBuffer kept for resume re-scheduling
    }
  }

  setSpeed(rate: number): void {
    this.playbackRate = rate;
    if (this.sourceNode && this.isPlaying) {
      this.sourceNode.playbackRate.value = rate;
    }
    // Also update pre-scheduled next source
    if (this.nextSourceNode) {
      this.nextSourceNode.playbackRate.value = rate;
      // Reschedule timing (cancel and re-schedule with new rate)
    }
  }
}
```

**`src/offscreen/offscreen.ts`** — Handle `MSG.OFFSCREEN_SCHEDULE_NEXT`:
```typescript
case MSG.OFFSCREEN_SCHEDULE_NEXT:
  await player.scheduleNext(base64ToArrayBuffer(message.audioBase64), message.chunkIndex, message.format);
  break;
```

**`src/lib/messages.ts`** — Add `OFFSCREEN_SCHEDULE_NEXT` to `MSG` enum

**`src/background/orchestrator.ts`** — In `playChunksSequentially()`: for chunk 0, use `OFFSCREEN_PLAY`. For chunks 1+, use `OFFSCREEN_SCHEDULE_NEXT` if the previous chunk is still playing (don't wait for `CHUNK_COMPLETE` before scheduling next). This requires restructuring the loop to overlap synthesis with playback.

---

## Ship 4: Provider Enhancements + Cache (3A + 4B)

### 3A. ElevenLabs Word-Level Timestamps

**Important:** The `/v1/text-to-speech/{voice_id}/with-timestamps` endpoint returns JSON (not raw audio). Response format:
```json
{
  "audio_base64": "...",
  "alignment": {
    "characters": ["H","e","l","l","o"],
    "character_start_times_seconds": [0.0, 0.05, ...],
    "character_end_times_seconds": [0.05, 0.1, ...]
  }
}
```

**`src/providers/elevenlabs.ts`** — Use `/with-timestamps` endpoint:
```typescript
async synthesize(text, voice, config, options): Promise<SynthesisResult> {
  // ... existing setup ...
  
  // Use /with-timestamps for word timing data
  const url = `${baseUrl}/v1/text-to-speech/${voice.id}/with-timestamps`;
  response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // ... error handling unchanged ...

  const data = await response.json();
  const audioData = base64ToArrayBuffer(data.audio_base64);
  
  // Convert character-level alignment to word-level WordTiming[]
  const wordTimings = alignmentToWordTimings(text, data.alignment);
  
  return { audioData, format: 'mp3', wordTimings };
}
```

New helper in same file:
```typescript
function alignmentToWordTimings(
  text: string,
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  },
): Array<{ word: string; startTime: number; endTime: number }> {
  // Walk through text, group characters into words (split on whitespace)
  // Map each word's start = first char's start_time, end = last char's end_time
  const words = text.split(/\s+/);
  const timings: Array<{ word: string; startTime: number; endTime: number }> = [];
  let charIdx = 0;
  
  for (const word of words) {
    // Skip whitespace characters in alignment
    while (charIdx < alignment.characters.length && /\s/.test(alignment.characters[charIdx])) {
      charIdx++;
    }
    const startCharIdx = charIdx;
    charIdx += word.length;
    const endCharIdx = Math.min(charIdx - 1, alignment.characters.length - 1);
    
    if (startCharIdx < alignment.character_start_times_seconds.length) {
      timings.push({
        word,
        startTime: alignment.character_start_times_seconds[startCharIdx],
        endTime: alignment.character_end_times_seconds[endCharIdx] ?? 
                 alignment.character_start_times_seconds[startCharIdx] + 0.1,
      });
    }
  }
  return timings;
}
```

**Fallback:** If `/with-timestamps` fails (unsupported model/plan), fall back to current `/stream` endpoint without timestamps. Wrap in try/catch at the endpoint selection level.

---

### 4B. LRU Backward Cache (Simplified)

Expand existing `prefetchCache` in orchestrator to retain backward entries instead of deleting them.

**`src/background/orchestrator.ts`** — Replace `prefetchCache` Map with LRU behavior:
```typescript
const MAX_CACHE_SIZE = 8;  // Keep up to 8 chunks (forward + backward)

// In playChunksSequentially(), line 254-256:
// Before: prefetchCache.delete(i);
// After:  (keep it in cache — don't delete on use)

// After adding new prefetch entries, evict old ones:
function evictOldCache(currentIndex: number): void {
  if (prefetchCache.size <= MAX_CACHE_SIZE) return;
  // Remove entries furthest from currentIndex
  const entries = [...prefetchCache.entries()].sort(
    (a, b) => Math.abs(a[0] - currentIndex) - Math.abs(b[0] - currentIndex),
  );
  while (entries.length > MAX_CACHE_SIZE) {
    const evicted = entries.pop()!;
    prefetchCache.delete(evicted[0]);
  }
}
```

This means `skipBackward()` → `skipToChunk(prevChunk)` → `playChunksSequentially()` will find the previous chunk in `prefetchCache` and skip re-synthesis. ~15 lines of change.

---

## Shipping Order

| # | Items | Risk | Effort | Test approach |
|---|-------|------|--------|---------------|
| 1 | 1B + 2A + 4A | LOW | ~120 lines | Unit tests for error parsing, sentence splitting, progress storage. Manual: read article, refresh, verify resume |
| 2 | 2B | LOW | ~30 lines | Unit test `chunkText()` with different configs. Manual: verify larger chunks for OpenAI |
| 3 | 1A | MEDIUM | ~80 lines | Manual A/B: listen for gaps. Test pause/resume/skip/speed during chunk transitions |
| 4 | 3A + 4B | MEDIUM | ~60 lines | 3A: verify ElevenLabs highlighting accuracy. 4B: verify skip-back is instant |

## Verification (all ships)

1. `npm run typecheck` passes
2. `npm run test` passes  
3. `npm run build` succeeds
4. Manual test on Wikipedia, news sites, Gmail with each provider
5. Test: play → pause → resume → skip forward → skip back → stop
6. Test: speed change mid-playback, volume change
7. Test: failover (use invalid key as primary, valid as secondary)
