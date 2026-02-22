import { MSG, type ExtensionMessage } from '@shared/messages';
import { AudioPlayer } from './audio-player';

const audioEl = document.getElementById('audio') as HTMLAudioElement;
const player = new AudioPlayer(audioEl);

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ error: String(err) });
    });
    return true;
  }
);

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case MSG.PLAY_SEGMENT:
      // Fire-and-forget: don't await, return immediately (Bug F fix)
      player.playSegment(
        message.text,
        message.settings,
        message.segmentId
      ).catch((err) => {
        // AbortErrors are expected when transitioning between segments
        // (cleanup() aborts the previous fetch) — don't report them
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const errorMsg = err instanceof TypeError
          ? `Network error: ${err.message}`
          : String(err);
        chrome.runtime.sendMessage({
          type: MSG.PLAYBACK_ERROR,
          error: errorMsg,
          segmentId: message.segmentId,
        }).catch(() => {});
      });
      return { ok: true };

    case MSG.PREFETCH_SEGMENT:
      player.prefetch(message.text, message.settings, message.segmentId);
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

    case MSG.SEEK_TO_TIME:
      player.seekTo(message.time);
      return { ok: true };

    default:
      return { ok: true };
  }
}
