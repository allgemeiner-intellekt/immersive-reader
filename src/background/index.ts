import { ensureOffscreenDocument } from './offscreen-manager';
import { routeMessage } from './message-router';
import { playbackState } from './playback-state';
import { cleanOldProgress } from '@shared/storage';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  routeMessage(message, sender, sendResponse);
  return true; // keep channel open for async response
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Immersive Reader installed', details.reason);
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

// Pre-create offscreen document
ensureOffscreenDocument().catch(console.error);
