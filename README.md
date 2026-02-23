# Immersive Reader

A Chrome extension that reads web pages aloud with real-time word and sentence highlighting. Connects to any OpenAI-compatible TTS endpoint — designed for [openai-edge-tts](https://github.com/travisvn/openai-edge-tts) running locally.

## Requirements

A running TTS server. The easiest option is [openai-edge-tts](https://github.com/travisvn/openai-edge-tts):

```bash
docker run -p 5050:5050 travisvn/openai-edge-tts
```

## Install

1. Clone this repo and run `npm install && npm run build`
2. Open `chrome://extensions`, enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Usage

- Click the extension icon and press **Read this page** in the popup
- A player capsule appears on the right edge of the screen — click to pause/resume, adjust speed, or stop
- Click any sentence to jump to that point

## Configuration

Open the extension options (right-click the extension icon → Options):

| Setting | Default | Notes |
|---|---|---|
| API Base URL | `http://localhost:5050` | Don't include `/v1/audio/speech` |
| API Key | *(empty)* | Optional for local servers |
| Model | `tts-1` | |
| Voice | `en-US-AvaNeural` | Edge TTS voice names for openai-edge-tts |
| Speed | `1.0x` | 0.5× – 2.0× |

Use **Test Voice** in the options page to verify your connection before reading.

## Build from source

```bash
npm install
npm run build   # outputs to dist/
npm run dev     # dev server with HMR
```
