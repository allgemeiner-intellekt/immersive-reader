import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Immersive Reader',
  description: 'AI-powered TTS with real-time text highlighting',
  version: '0.1.0',
  icons: {
    '16': 'src/assets/icons/icon-16.png',
    '48': 'src/assets/icons/icon-48.png',
    '128': 'src/assets/icons/icon-128.png',
  },
  permissions: ['offscreen', 'storage', 'activeTab'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.tsx'],
      css: ['content/highlighting.css'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'src/assets/icons/icon-16.png',
      '48': 'src/assets/icons/icon-48.png',
    },
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
});
