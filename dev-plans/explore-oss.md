# Explore Plan — Open Source Reference Projects

> **Goal:** Extract reusable logic, patterns, and architecture from OSS projects — NOT UI/UX.
> UI/UX benchmark is **Speechify itself**. The OSS TTS extensions (Read Aloud, Speechy) have poor UI — we study them only for backend mechanics.

---

## Guiding Principle

Each project below is tagged with what to extract and what to ignore. We're looking for:

- **Architecture patterns** — how providers, audio pipelines, and message passing are structured
- **Algorithms** — sentence chunking, word-timing sync, DOM traversal
- **Gotchas** — browser extension edge cases, MV3 pitfalls, Web Audio API quirks
- **Code we can directly adapt** — adapters, utilities, pipeline stages

We are NOT looking for:

- UI components, layouts, or design systems (Speechify is our reference)
- Onboarding flows or popup designs
- Toolbar styling or interaction patterns

---

## Phase 1: Architecture & Provider Layer (before Plan 00–01)

### 1A. Read Aloud — `github.com/ken107/read-aloud` ⭐1.6k

**Extract:**

- [ ] How it abstracts multiple TTS engines (Google, Amazon Polly, IBM Watson, OpenAI) behind a unified interface — compare with our `TTSProvider` interface design
- [ ] Service worker ↔ content script message protocol — what messages are passed, how playback state is synchronized
- [ ] How it handles engine switching mid-session (does it drain the buffer? hard-cut?)
- [ ] Error handling: rate limits, network failures, invalid API keys
- [ ] How it keeps the MV3 service worker alive during long playback sessions

**Ignore:** All UI — popup layout, icons, settings page design.

### 1B. Speechy — `github.com/hmirin/speechy` ⭐39

**Extract:**

- [ ] BYOK key storage implementation — how/where keys are stored, encrypted or plaintext, sync vs local
- [ ] API key validation flow — what happens on bad key, UX for key entry (backend logic only)
- [ ] OpenAI TTS adapter — request construction, response handling, audio format negotiation

**Ignore:** All UI. Small project — should take < 1 hour to review.

### 1C. js-tts-wrapper — `github.com/willwade/js-tts-wrapper` ⭐16

**Extract:**

- [ ] TypeScript interface design for multi-provider TTS — method signatures, config types, return types
- [ ] How it handles provider-specific options (ElevenLabs voice_settings, OpenAI model selection)
- [ ] Voice listing normalization — how different provider voice formats are unified
- [ ] Audio format conversion utilities

**Decision point:** Could we use this directly as a dependency, or is it better to write our own adapters? Evaluate: bundle size, browser compatibility, maintenance activity.

---

## Phase 2: Audio Pipeline & Chunking (before Plan 02–03)

### 2A. fetch-stream-audio — `github.com/AnthumChris/fetch-stream-audio` ⭐398

**Extract:**

- [ ] Chunk-buffered audio decoding pattern using Fetch API + Web Audio API
- [ ] How `AudioContext` is managed (creation, resume after user gesture, suspend/close)
- [ ] Buffer scheduling — how decoded chunks are queued on `AudioBufferSourceNode`
- [ ] Gapless playback between chunks — timing math for scheduling next buffer
- [ ] Latency measurements — what gap is achievable between chunks?

**This is critical for Plan 03's look-ahead buffer design.**

### 2B. RealtimeTTS — `github.com/KoljaB/RealtimeTTS` ⭐3.8k

**Extract (Python → port to TS):**

- [ ] Sentence boundary detection algorithm — how it handles abbreviations, decimals, URLs, ellipses
- [ ] Chunk size heuristics — min/max word counts, when to merge short sentences, when to split long ones
- [ ] Stream processing pipeline — how synthesis requests are queued and results buffered
- [ ] Provider abstraction — interface design for ElevenLabs, OpenAI, Azure adapters

**Note:** Python codebase. Focus on algorithms and data flow, not implementation details.

### 2C. howler.js — `github.com/goldfire/howler.js` ⭐25k

**Evaluate (not deep-dive):**

- [ ] Can it run inside a Chrome extension offscreen document?
- [ ] Does it support scheduling multiple AudioBuffers for gapless playback?
- [ ] Bundle size impact
- [ ] Would it simplify our playback engine, or add unnecessary abstraction?

**Decision point:** Use howler.js vs raw Web Audio API in the offscreen document.

---

## Phase 3: Highlighting & DOM Sync (before Plan 06)

### 3A. react-speech-highlight — `github.com/albirrkarim/react-speech-highlight-demo` ⭐187

**Extract:**

- [ ] How word-level timing data is extracted from TTS API responses (OpenAI `verbose_json`, ElevenLabs timestamps)
- [ ] Fallback timing estimation when provider doesn't return word timestamps
- [ ] How highlight state is synchronized with audio `currentTime`
- [ ] Performance — does it cause reflows? How does it handle long documents?
- [ ] CSS Custom Highlight API usage vs DOM `<mark>` wrapping — which approach does it use?

### 3B. Talkify — `github.com/Hagsten/Talkify` ⭐240

**Extract:**

- [ ] DOM walking algorithm — how it maps text content to DOM nodes for highlighting
- [ ] How it handles complex DOM structures (nested spans, links within paragraphs, etc.)
- [ ] Text-to-DOM position mapping — compare with our `TextChunk` model from Plan 02

---

## Phase 4: Extension Framework Decision (before Plan 00)

> This is a **blocking decision** — must be resolved before writing any code.

### 4A. Evaluate: Plasmo vs WXT vs CRXJS

| Criteria                     | Plasmo (⭐13k) | WXT (⭐9.5k) | CRXJS (⭐4k) |
| ---------------------------- | ------------- | ----------- | ----------- |
| Shadow DOM content script UI | Built-in ✅    | Manual      | Manual      |
| React + TypeScript           | First-class   | Supported   | Supported   |
| Build tool                   | Parcel        | Vite        | Vite        |
| MV3 offscreen document       | ?             | ?           | ?           |
| HMR quality                  | ?             | ?           | ?           |
| Bundle size overhead         | ?             | ?           | ?           |
| Escape hatch / eject         | ?             | ?           | ?           |
| Firefox MV3 support          | ?             | ?           | ?           |

- [ ] Build a minimal "hello world" extension with each framework (< 30 min each)
- [ ] Test: content script with Shadow DOM React component
- [ ] Test: offscreen document creation and audio playback
- [ ] Test: service worker ↔ content script messaging
- [ ] Test: `chrome.storage.local` read/write from popup and content script
- [ ] Measure: production build size
- [ ] Check: can we eject or customize if the framework gets in the way?

**Recommendation from research:** Plasmo has the best Shadow DOM story (critical for Plan 04). WXT is closer to our current Vite plan. CRXJS is lightest but requires the most manual setup.

### 4B. inject-react-anywhere — `github.com/OlegWock/inject-react-anywhere` ⭐58

**Only if we choose CRXJS or WXT (no built-in Shadow DOM):**

- [ ] How it creates the shadow root and mounts React
- [ ] CSS-in-JS isolation technique (styled-components / emotion in shadow DOM)
- [ ] Event propagation across shadow boundary — any gotchas?

---

## Phase 5: Reading Queue & PDF (before Plan 08)

### 5A. Omnivore — `github.com/omnivore-app/omnivore` ⭐16k

**Extract:**

- [ ] Reading queue data model — fields, storage schema, sync strategy
- [ ] Browser extension "save to queue" flow — how the clip happens
- [ ] Queue auto-advance logic — how it transitions between articles
- [ ] Reading progress tracking — how position and % complete are stored/resumed
- [ ] PDF text extraction pipeline — how it integrates `pdf.js`

**Note:** Large codebase. Focus on the browser extension directory and the queue/TTS modules only.

---

## Phase 6: UI/UX Reference (ongoing)

### 6A. Speechify (the product itself)

This is our design benchmark. Not open source, but we study it as a user:

- [ ] Install Speechify extension, use it on 5+ page types (news, blog, docs, Wikipedia, academic paper)
- [ ] Document the floating toolbar: dimensions, animations, states, transitions, drag behavior
- [ ] Document the popup: layout, hierarchy, what's above/below the fold
- [ ] Document highlighting: colors, animation timing, scroll behavior
- [ ] Document onboarding: steps, copy, how it handles first API setup
- [ ] Screenshot everything into `/docs/speechify-reference/`
- [ ] Note what feels polished and what feels clunky — these inform our design decisions

---

## Execution Order

```
Week 1 (parallel with Plan 00 scaffold):
  ├── Phase 4A — Framework decision (BLOCKING)
  ├── Phase 1A — Read Aloud architecture review
  ├── Phase 1B — Speechy BYOK review (quick)
  └── Phase 6A — Speechify UX documentation

Week 2 (parallel with Plans 01–02):
  ├── Phase 1C — js-tts-wrapper evaluation
  ├── Phase 2A — fetch-stream-audio deep-dive
  ├── Phase 2B — RealtimeTTS chunking algorithms
  └── Phase 2C — howler.js evaluation

Week 3 (parallel with Plans 03–04):
  ├── Phase 3A — react-speech-highlight review
  └── Phase 3B — Talkify DOM walking review

Week 4+ (before Plan 08):
  └── Phase 5A — Omnivore queue & PDF review
```

---

## Deliverables per Review

For each project reviewed, produce a short note (in `/docs/oss-reviews/`) with:

1. **Architecture sketch** — how the relevant subsystem is structured
2. **Reusable patterns** — specific code patterns or algorithms we should adopt
3. **Gotchas** — things they got wrong or edge cases they discovered
4. **Decision** — use as dependency / adapt code / take inspiration only / skip
