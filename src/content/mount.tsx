import React from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingToolbar } from './player/FloatingToolbar';
import toolbarStyles from './player/toolbar.css?inline';
import { deriveAccentVars } from '@shared/accent-colors';
import { getSettings } from '@shared/storage';
import { resolveTheme } from '@shared/theme';

const ROOT_ID = 'immersive-reader-root';
const SETTINGS_KEY = 'ir-settings';

export function mountToolbar() {
  // Avoid double-mounting
  if (document.getElementById(ROOT_ID)) return;

  const host = document.createElement('div');
  host.id = ROOT_ID;
  // Ensure host element does not interfere with page layout
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'visible';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';

  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles into shadow DOM
  const styleEl = document.createElement('style');
  styleEl.textContent = toolbarStyles;
  shadow.appendChild(styleEl);

  // Apply theme class to host
  async function applyToolbarTheme() {
    const settings = await getSettings();
    const resolved = resolveTheme(settings.theme);
    host.classList.toggle('light', resolved === 'light');
    host.classList.toggle('dark', resolved === 'dark');

    if (settings.themeColor) {
      const vars = deriveAccentVars(settings.themeColor, resolved);
      host.style.setProperty('--ir-accent', vars.accent);
      host.style.setProperty('--ir-accent-hover', vars.accentHover);
      host.style.setProperty('--ir-accent-glow', vars.accentGlow);
    } else {
      host.style.removeProperty('--ir-accent');
      host.style.removeProperty('--ir-accent-hover');
      host.style.removeProperty('--ir-accent-glow');
    }
  }

  applyToolbarTheme();

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[SETTINGS_KEY]) {
      applyToolbarTheme();
    }
  });

  // Listen for OS preference changes (for system mode)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyToolbarTheme();
  });

  // Create a container for React inside the shadow
  const container = document.createElement('div');
  container.style.pointerEvents = 'auto';
  shadow.appendChild(container);

  const root = createRoot(container);
  root.render(<FloatingToolbar />);
}
