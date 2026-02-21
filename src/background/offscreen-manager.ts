const OFFSCREEN_URL = chrome.runtime.getURL('src/offscreen/offscreen.html')

export async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: 'Play TTS audio reliably even on strict CSP pages.'
  })
}
