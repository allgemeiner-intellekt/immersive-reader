import { MSG } from '@shared/messages';
import { PROGRESS_REPORT_INTERVAL_MS } from '@shared/constants';
import type { TTSSettings } from '@shared/types';

interface PrefetchedResponse {
  segmentId: number;
  response: Response;
}

export class AudioPlayer {
  private audioEl: HTMLAudioElement;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private pendingBuffers: Uint8Array[] = [];
  private isAppending = false;
  private fetchController: AbortController | null = null;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private currentSegmentId = -1;
  private prefetched: PrefetchedResponse | null = null;
  private streamDone = false;
  private hasStartedPlaying = false;
  private totalBuffered = 0;
  private prefetchController: AbortController | null = null;

  constructor(audioEl: HTMLAudioElement) {
    this.audioEl = audioEl;
  }

  async playSegment(
    text: string,
    settings: TTSSettings,
    segmentId: number
  ): Promise<void> {
    this.cleanup();
    this.currentSegmentId = segmentId;
    this.streamDone = false;
    this.hasStartedPlaying = false;
    this.totalBuffered = 0;

    // Check for prefetched response
    let response: Response;
    if (this.prefetched && this.prefetched.segmentId === segmentId) {
      response = this.prefetched.response;
      this.prefetched = null;
    } else {
      response = await this.fetchTTS(text, settings);
    }

    if (!response.body) {
      this.sendError('No response body from TTS API', segmentId);
      return;
    }

    await this.streamToMSE(response.body, segmentId);
  }

  prefetch(text: string, settings: TTSSettings, segmentId: number): void {
    // Cancel any existing prefetch
    if (this.prefetchController) {
      this.prefetchController.abort();
    }
    this.prefetchController = new AbortController();

    this.fetchTTS(text, settings, this.prefetchController.signal)
      .then((response) => {
        this.prefetched = { segmentId, response };
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('Prefetch failed:', err);
        }
      });
  }

  pause(): void {
    this.audioEl.pause();
    this.stopProgressReporting();
  }

  resume(): void {
    this.audioEl.play().catch(console.error);
    this.startProgressReporting();
  }

  stop(): void {
    this.cleanup();
  }

  seekTo(time: number): void {
    if (this.audioEl.readyState >= 2) {
      this.audioEl.currentTime = time;
    }
  }

  setSpeed(speed: number): void {
    this.audioEl.playbackRate = speed;
  }

  private async fetchTTS(
    text: string,
    settings: TTSSettings,
    signal?: AbortSignal
  ): Promise<Response> {
    if (!signal) {
      this.fetchController = new AbortController();
      signal = this.fetchController.signal;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    const response = await fetch(`${settings.apiUrl}/v1/audio/speech`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.model,
        input: text,
        voice: settings.voice,
        speed: settings.speed,
        response_format: 'mp3',
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `TTS API error: ${response.status} ${response.statusText}`
      );
    }

    return response;
  }

  private async streamToMSE(
    body: ReadableStream<Uint8Array>,
    segmentId: number
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.mediaSource = new MediaSource();
      this.audioEl.src = URL.createObjectURL(this.mediaSource);

      this.mediaSource.addEventListener(
        'sourceopen',
        async () => {
          try {
            this.sourceBuffer = this.mediaSource!.addSourceBuffer('audio/mpeg');
            this.sourceBuffer.mode = 'sequence';

            this.sourceBuffer.addEventListener('updateend', () => {
              this.isAppending = false;
              this.appendNextBuffer();
              this.tryEndOfStream();
            });

            // Register ended listener BEFORE stream loop (Bug B fix)
            this.audioEl.addEventListener(
              'ended',
              () => {
                this.stopProgressReporting();
                this.sendMessage({
                  type: MSG.SEGMENT_COMPLETE,
                  segmentId,
                });
                resolve();
              },
              { once: true }
            );

            const reader = body.getReader();

            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                this.streamDone = true;
                this.tryEndOfStream();
                // Start playing if stream ended before buffer threshold
                if (!this.hasStartedPlaying) {
                  this.hasStartedPlaying = true;
                  this.audioEl
                    .play()
                    .then(() => this.startProgressReporting())
                    .catch(console.error);
                }
                break;
              }

              this.pendingBuffers.push(value);
              this.totalBuffered += value.byteLength;
              this.appendNextBuffer();

              // Start playing once enough data is buffered (Bug C fix)
              if (!this.hasStartedPlaying && this.totalBuffered >= 4096) {
                this.hasStartedPlaying = true;
                await new Promise((r) => setTimeout(r, 50));
                this.audioEl
                  .play()
                  .then(() => this.startProgressReporting())
                  .catch(console.error);
              }
            }
          } catch (err) {
            reject(err);
          }
        },
        { once: true }
      );

      this.mediaSource.addEventListener(
        'error',
        () => {
          this.sendError('MediaSource error', segmentId);
          reject(new Error('MediaSource error'));
        },
        { once: true }
      );
    });
  }

  private appendNextBuffer(): void {
    if (
      this.isAppending ||
      this.pendingBuffers.length === 0 ||
      !this.sourceBuffer ||
      this.sourceBuffer.updating
    ) {
      return;
    }

    this.isAppending = true;
    const chunk = this.pendingBuffers.shift()!;
    try {
      this.sourceBuffer.appendBuffer(chunk as unknown as ArrayBuffer);
    } catch (err) {
      console.error('appendBuffer error:', err);
      this.isAppending = false;
    }
  }

  private tryEndOfStream(): void {
    if (
      this.streamDone &&
      this.pendingBuffers.length === 0 &&
      this.mediaSource &&
      this.mediaSource.readyState === 'open' &&
      this.sourceBuffer &&
      !this.sourceBuffer.updating
    ) {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // May already be ended
      }
    }
  }

  private startProgressReporting(): void {
    this.stopProgressReporting();
    this.progressInterval = setInterval(() => {
      this.sendMessage({
        type: MSG.PLAYBACK_PROGRESS,
        currentTime: this.audioEl.currentTime,
        duration: this.audioEl.duration || 0,
        segmentId: this.currentSegmentId,
        durationFinal: this.streamDone,
      });
    }, PROGRESS_REPORT_INTERVAL_MS);
  }

  private stopProgressReporting(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private cleanup(): void {
    this.stopProgressReporting();

    if (this.fetchController) {
      this.fetchController.abort();
      this.fetchController = null;
    }

    if (this.prefetchController) {
      this.prefetchController.abort();
      this.prefetchController = null;
    }

    this.audioEl.pause();
    this.pendingBuffers = [];
    this.isAppending = false;
    this.streamDone = false;
    this.hasStartedPlaying = false;
    this.totalBuffered = 0;

    if (this.sourceBuffer && this.mediaSource?.readyState === 'open') {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // ignore
      }
    }

    if (this.audioEl.src) {
      URL.revokeObjectURL(this.audioEl.src);
      this.audioEl.removeAttribute('src');
      this.audioEl.load();
    }

    this.mediaSource = null;
    this.sourceBuffer = null;
  }

  private sendMessage(message: Record<string, unknown>): void {
    chrome.runtime.sendMessage(message).catch(() => {
      // Service worker may not be listening
    });
  }

  private sendError(error: string, segmentId: number): void {
    this.sendMessage({
      type: MSG.PLAYBACK_ERROR,
      error,
      segmentId,
    });
  }
}
