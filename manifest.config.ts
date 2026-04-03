import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Immersive Reader',
  description: 'Open-source TTS with BYOK support — bring your own OpenAI, ElevenLabs, Groq, or custom provider',
  version: '1.0.0',
  icons: {
    '16': 'public/icons/icon-16.png',
    '48': 'public/icons/icon-48.png',
    '128': 'public/icons/icon-128.png',
  },
  permissions: ['offscreen', 'storage', 'activeTab', 'scripting', 'alarms', 'contextMenus'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_icon: {
      '16': 'public/icons/icon-16.png',
      '48': 'public/icons/icon-48.png',
    },
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  commands: {
    'toggle-playback': {
      suggested_key: { default: 'Alt+Shift+Space' },
      description: 'Play / Pause',
    },
    'skip-forward': {
      suggested_key: { default: 'Alt+Shift+Right' },
      description: 'Skip forward',
    },
    'skip-backward': {
      suggested_key: { default: 'Alt+Shift+Left' },
      description: 'Skip backward',
    },
  },
});
