---
name: UI/UX benchmark is Speechify
description: User is not satisfied with Read Aloud / Speechy UI — Speechify's polish is the target; OSS TTS extensions are only useful for backend logic, not design
type: feedback
---

Do NOT use Read Aloud or Speechy as UI/UX references. Their interfaces are subpar. Speechify is the gold standard for design and interaction patterns in this project.

**Why:** The whole reason this project exists is to build a Speechify-quality experience with BYOK. Copying lesser UI would defeat the purpose.

**How to apply:** When studying OSS TTS extensions, extract only backend logic (provider abstraction, audio pipeline, chunking). For all UI/UX decisions (toolbar, popup, settings, highlighting, onboarding), reference Speechify directly.
