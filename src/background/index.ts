import { ensureOffscreenDocument } from './offscreen-manager';
import { routeMessage } from './message-router';
import { playbackState } from './playback-state';
import { cleanOldProgress, getActiveProvider, getSettings } from '@shared/storage';
import { MSG, sendTabMessage } from '@shared/messages';
import { updateIcon } from './icon-renderer';
import {
  startPlayback,
  pausePlayback,
  resumePlayback,
  stopPlayback,
  skipForward,
  skipBackward,
  getActiveTab,
  ensureContentScript,
} from './orchestrator';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  routeMessage(message, sender, sendResponse);
  return true; // keep channel open for async response
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Recito installed', details.reason);
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') });
  }
});

// Clean up old reading progress entries on startup
cleanOldProgress().catch(() => {});

// Keep service worker alive during playback via periodic alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ir-keepalive') {
    const status = playbackState.getStatus();
    if (status === 'idle') {
      chrome.alarms.clear('ir-keepalive');
    }
  }
});

playbackState.onStateChange((state) => {
  if (state.status === 'playing' || state.status === 'loading') {
    chrome.alarms.create('ir-keepalive', { periodInMinutes: 0.4 });
  } else if (state.status === 'idle') {
    chrome.alarms.clear('ir-keepalive');
  }
});

// Keyboard shortcuts via chrome.commands
chrome.commands.onCommand.addListener(async (command) => {
  const status = playbackState.getStatus();

  switch (command) {
    case 'toggle-playback':
      if (status === 'playing') {
        pausePlayback();
      } else if (status === 'paused') {
        resumePlayback().catch(console.error);
      } else {
        // Start playback on the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          startPlayback(tab.id).catch(console.error);
        }
      }
      break;
    case 'skip-forward':
      if (status === 'playing' || status === 'paused') {
        skipForward().catch(console.error);
      }
      break;
    case 'skip-backward':
      if (status === 'playing' || status === 'paused') {
        skipBackward().catch(console.error);
      }
      break;
  }
});

// Extension icon click → auto-start reading or toggle playback
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  const status = playbackState.getStatus();
  const activeTab = getActiveTab();

  // If playing/paused on a different tab, stop that and start fresh on this tab
  if (status !== 'idle' && status !== 'loading' && activeTab !== null && activeTab !== tab.id) {
    stopPlayback();
    // Forward STOP to old tab for cleanup
    chrome.tabs.sendMessage(activeTab, { type: MSG.STOP }).catch(() => {});
  }

  if (status === 'playing' && activeTab === tab.id) {
    pausePlayback();
    return;
  }

  if (status === 'paused' && activeTab === tab.id) {
    resumePlayback().catch(console.error);
    return;
  }

  if (status === 'loading') return; // debounce

  // Idle (or switched tab) → start reading
  try {
    const provider = await getActiveProvider();
    if (!provider) {
      // No provider configured — show toolbar with error, then open settings
      await ensureContentScript(tab.id);
      sendTabMessage(tab.id, { type: MSG.SHOW_TOOLBAR, error: 'No TTS provider configured' }).catch(() => {});
      setTimeout(() => chrome.runtime.openOptionsPage(), 1000);
      return;
    }
    await startPlayback(tab.id);
  } catch (err) {
    console.error('Icon click: failed to start playback', err);
    chrome.action.setBadgeText({ text: '!' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
  }
});

// Right-click context menu on extension icon → open settings
chrome.contextMenus.create({
  id: 'ir-settings',
  title: 'Recito Settings',
  contexts: ['action'],
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'ir-settings') {
    chrome.runtime.openOptionsPage();
  }
});

// Set icon to match accent color on startup and when settings change
getSettings().then((s) => updateIcon(s.themeColor)).catch(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['ir-settings']) {
    const themeColor = changes['ir-settings'].newValue?.themeColor ?? null;
    updateIcon(themeColor);
  }
});

// Pre-create offscreen document
ensureOffscreenDocument().catch(console.error);
