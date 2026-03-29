import React from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingToolbar } from './player/FloatingToolbar';
import toolbarStyles from './player/toolbar.css?inline';

const ROOT_ID = 'immersive-reader-root';

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

  // Create a container for React inside the shadow
  const container = document.createElement('div');
  container.style.pointerEvents = 'auto';
  shadow.appendChild(container);

  const root = createRoot(container);
  root.render(<FloatingToolbar />);
}
