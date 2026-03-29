import { MSG, type ExtensionMessage } from '@shared/messages';
import { AudioPlayer } from './audio-player';

console.log('Immersive Reader: offscreen document loaded');

const player = new AudioPlayer();

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ error: String(err) });
    });
    return true;
  },
);

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case MSG.PLAY_AUDIO:
      await player.play(message.audioData, message.chunkIndex, message.format);
      return { ok: true };

    case MSG.PREFETCH_AUDIO:
      await player.prefetch(message.audioData, message.chunkIndex, message.format);
      return { ok: true };

    case MSG.PAUSE:
      player.pause();
      return { ok: true };

    case MSG.RESUME:
      player.resume();
      return { ok: true };

    case MSG.STOP:
      player.stop();
      return { ok: true };

    case MSG.SET_SPEED:
      player.setSpeed(message.speed);
      return { ok: true };

    case MSG.SET_VOLUME:
      player.setVolume(message.volume);
      return { ok: true };

    default:
      return { ok: true };
  }
}
