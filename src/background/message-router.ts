import { MSG, type ExtensionMessage } from '@shared/messages';
import {
  startPlayback,
  pausePlayback,
  resumePlayback,
  stopPlayback,
  skipForward,
  skipBackward,
  skipToChunk,
  setSpeed,
  setVolume,
  getActiveTab,
  handlePlaybackProgress,
} from './orchestrator';
import { playbackState } from './playback-state';
import { getProvider } from '@providers/registry';
import { getElevenLabsUsage } from '@providers/elevenlabs';
import { getProviders, setActiveProviderGroup } from '@shared/storage';
import { getAllHealth, clearHealth } from './failover';

export async function routeMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): Promise<void> {
  try {
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
        pausePlayback();
        sendResponse({ ok: true });
        break;

      case MSG.RESUME:
        resumePlayback().catch(console.error);
        sendResponse({ ok: true });
        break;

      case MSG.STOP: {
        const stopTab = getActiveTab();
        stopPlayback();
        // Forward to content script so it can clean up highlights & scrubber
        if (stopTab) {
          chrome.tabs.sendMessage(stopTab, message).catch(() => {});
        }
        sendResponse({ ok: true });
        break;
      }

      case MSG.SKIP_FORWARD:
        skipForward().catch(console.error);
        sendResponse({ ok: true });
        break;

      case MSG.SKIP_BACKWARD:
        skipBackward().catch(console.error);
        sendResponse({ ok: true });
        break;

      case MSG.SEEK_TO_CHUNK:
        skipToChunk(message.chunkIndex).catch(console.error);
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

      // === Offscreen → SW: relay progress/completion/errors to content script ===
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

      // === Provider management — actually execute provider operations ===
      case MSG.VALIDATE_KEY: {
        try {
          const provider = getProvider(message.config.providerId);
          const isValid = await provider.validateKey(message.config);
          sendResponse(isValid);
        } catch (err) {
          sendResponse(false);
        }
        break;
      }

      case MSG.LIST_VOICES: {
        try {
          // providerId here is the config ID, find the actual config
          const providers = await getProviders();
          const config = providers.find((p) => p.id === message.providerId);
          if (!config) {
            sendResponse({ error: 'Provider config not found' });
            break;
          }
          const provider = getProvider(config.providerId);
          const voices = await provider.listVoices(config);
          sendResponse(voices);
        } catch (err) {
          sendResponse({ error: err instanceof Error ? err.message : String(err) });
        }
        break;
      }

      case MSG.SET_ACTIVE_PROVIDER: {
        try {
          await setActiveProviderGroup(message.groupKey);
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ error: String(err) });
        }
        break;
      }

      case MSG.SYNTHESIZE: {
        // Not used directly (orchestrator handles synthesis internally)
        sendResponse({ error: 'Use PLAY to start playback' });
        break;
      }

      // === Provider Usage ===
      case MSG.GET_PROVIDER_USAGE: {
        try {
          const providers = await getProviders();
          const config = providers.find((p) => p.id === message.configId);
          if (!config || config.providerId !== 'elevenlabs') {
            sendResponse({ error: 'Not an ElevenLabs config' });
            break;
          }
          const usage = await getElevenLabsUsage(config);
          sendResponse(usage);
        } catch (err) {
          sendResponse({ error: err instanceof Error ? err.message : String(err) });
        }
        break;
      }

      // === Health & Failover ===
      case MSG.GET_PROVIDER_HEALTH: {
        sendResponse(getAllHealth());
        break;
      }

      case MSG.RESET_PROVIDER_HEALTH: {
        clearHealth(message.configId);
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (err) {
    console.error('Message routing error:', err);
    sendResponse({ error: String(err) });
  }
}
