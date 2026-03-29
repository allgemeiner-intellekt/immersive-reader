import { MSG, type ExtensionMessage } from '@shared/messages';
import { ensureOffscreenDocument } from './offscreen-manager';
import {
  startPlayback,
  pausePlayback,
  resumePlayback,
  stopPlayback,
  skipForward,
  skipBackward,
  setSpeed,
  setVolume,
  setActiveTab,
  getActiveTab,
  handlePlaybackProgress,
} from './orchestrator';
import { playbackState } from './playback-state';

const OFFSCREEN_TO_CONTENT: Set<string> = new Set([
  MSG.PLAYBACK_PROGRESS,
  MSG.CHUNK_COMPLETE,
  MSG.PLAYBACK_ERROR,
  MSG.WORD_TIMING,
]);

export async function routeMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): Promise<void> {
  try {
    // Track active tab from content script messages
    if (sender.tab?.id != null) {
      setActiveTab(sender.tab.id);
    }

    switch (message.type) {
      // === Transport controls (from popup/content/toolbar) ===
      case MSG.PLAY: {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          startPlayback(tab.id, message.fromSelection).catch(console.error);
          sendResponse({ ok: true });
        } else {
          sendResponse({ error: 'No active tab' });
        }
        break;
      }

      case MSG.START_READING: {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          startPlayback(tab.id).catch(console.error);
          sendResponse({ ok: true });
        } else {
          sendResponse({ error: 'No active tab' });
        }
        break;
      }

      case MSG.PAUSE:
        if (sender.tab?.id || !getActiveTab()) {
          // From content script or no active playback → forward to offscreen
          pausePlayback();
        } else {
          pausePlayback();
        }
        sendResponse({ ok: true });
        break;

      case MSG.RESUME:
        resumePlayback().catch(console.error);
        sendResponse({ ok: true });
        break;

      case MSG.STOP:
        stopPlayback();
        sendResponse({ ok: true });
        break;

      case MSG.SKIP_FORWARD:
        skipForward().catch(console.error);
        sendResponse({ ok: true });
        break;

      case MSG.SKIP_BACKWARD:
        skipBackward().catch(console.error);
        sendResponse({ ok: true });
        break;

      case MSG.SET_SPEED:
        setSpeed(message.speed);
        sendResponse({ ok: true });
        break;

      case MSG.SET_VOLUME:
        setVolume(message.volume);
        sendResponse({ ok: true });
        break;

      case MSG.GET_STATE:
        sendResponse(playbackState.getState());
        break;

      // === Audio pipeline messages to offscreen ===
      case MSG.PLAY_AUDIO:
      case MSG.PREFETCH_AUDIO:
        await ensureOffscreenDocument();
        chrome.runtime.sendMessage(message).catch(console.error);
        sendResponse({ ok: true });
        break;

      // === Offscreen → Content: relay progress/completion/errors ===
      case MSG.PLAYBACK_PROGRESS: {
        handlePlaybackProgress(message.currentTime, message.duration, message.chunkIndex);
        const tabId = getActiveTab();
        if (tabId) {
          chrome.tabs.sendMessage(tabId, message).catch(() => {});
        }
        sendResponse({ ok: true });
        break;
      }

      case MSG.CHUNK_COMPLETE:
      case MSG.PLAYBACK_ERROR:
      case MSG.WORD_TIMING: {
        const targetTab = getActiveTab();
        if (targetTab) {
          chrome.tabs.sendMessage(targetTab, message).catch(() => {});
        }
        sendResponse({ ok: true });
        break;
      }

      // === Content extraction (popup → content script) ===
      case MSG.EXTRACT_CONTENT:
      case MSG.GET_CHUNK:
      case MSG.GET_PAGE_INFO: {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const response = await chrome.tabs.sendMessage(tab.id, message);
          sendResponse(response);
        } else {
          sendResponse({ error: 'No active tab' });
        }
        break;
      }

      // === Provider management ===
      case MSG.LIST_VOICES:
      case MSG.VALIDATE_KEY:
      case MSG.SET_ACTIVE_PROVIDER:
      case MSG.SYNTHESIZE:
        // These are handled directly in the service worker
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (err) {
    console.error('Message routing error:', err);
    sendResponse({ error: String(err) });
  }
}
