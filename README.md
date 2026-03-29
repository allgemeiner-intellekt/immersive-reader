# Immersive Reader

Open-source text-to-speech Chrome extension with Bring Your Own Key (BYOK) support.

## Features

- **Bring Your Own Keys** - Use OpenAI, ElevenLabs, Groq, or any OpenAI-compatible TTS service
- **Privacy First** - API keys stored locally in your browser, no data collection, no telemetry
- **Karaoke-Style Highlighting** - Word-by-word and sentence highlighting with auto-scroll
- **Floating Toolbar** - Minimal, draggable playback controls on any page
- **Keyboard Shortcuts** - Full keyboard control for playback
- **Customizable** - Adjust speed, volume, highlight colors, and more

## Installation

### Chrome Web Store

Coming soon.

### Developer Install

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/immersive-reader.git
   cd immersive-reader
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

For development with hot reload:
```bash
npm run dev
```

## Usage

1. Click the Immersive Reader icon in your toolbar
2. Select a TTS provider and add your API key
3. Navigate to any web page and click **Play** in the popup or floating toolbar
4. The page will be read aloud with word-by-word highlighting

### Supported Providers

| Provider | Description |
|----------|-------------|
| **OpenAI** | High-quality TTS with 6 built-in voices |
| **ElevenLabs** | Premium voice cloning and synthesis |
| **Groq** | Ultra-fast inference with PlayAI voices |
| **Custom** | Any OpenAI-compatible TTS endpoint |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Escape` | Stop |
| `ArrowRight` | Skip forward |
| `ArrowLeft` | Skip backward |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](./SECURITY.md) for information on how API keys are stored and our security practices.

## License

MIT - see [LICENSE](./LICENSE) for details.
