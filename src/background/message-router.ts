import { MSG, type ExtensionMessage } from '@shared/messages';
import { ensureOffscreenDocument } from './offscreen-manager';

let activeTabId: number | null = null;

const CONTENT_TO_OFFSCREEN: Set<string> = new Set([
  MSG.PLAY_SEGMENT,
  MSG.PAUSE,
  MSG.RESUME,
  MSG.STOP,
  MSG.SET_SPEED,
  MSG.PREFETCH_SEGMENT,
  MSG.SEEK_TO_TIME,
]);

const OFFSCREEN_TO_CONTENT: Set<string> = new Set([
  MSG.PLAYBACK_PROGRESS,
  MSG.SEGMENT_COMPLETE,
  MSG.PLAYBACK_ERROR,
]);

export async function routeMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): Promise<void> {
  try {
    if (CONTENT_TO_OFFSCREEN.has(message.type)) {
      // Message from content script → forward to offscreen
      if (sender.tab?.id) {
        activeTabId = sender.tab.id;
      }
      await ensureOffscreenDocument();
      // Fire-and-forget: don't block on offscreen response (Bug F fix)
      chrome.runtime.sendMessage(message).catch(console.error);
      sendResponse({ ok: true });
    } else if (OFFSCREEN_TO_CONTENT.has(message.type)) {
      // Message from offscreen → forward to content script
      if (activeTabId !== null) {
        try {
          await chrome.tabs.sendMessage(activeTabId, message);
        } catch {
          // Tab may have been closed
          activeTabId = null;
        }
      }
      sendResponse({ ok: true });
    } else if (message.type === MSG.GET_PAGE_INFO || message.type === MSG.START_READING) {
      // Popup → content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, message);
        sendResponse(response);
      } else {
        sendResponse({ error: 'No active tab' });
      }
    } else {
      sendResponse({ error: 'Unknown message type' });
    }
  } catch (err) {
    console.error('Message routing error:', err);
    sendResponse({ error: String(err) });
  }
}
