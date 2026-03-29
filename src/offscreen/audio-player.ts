import { MSG } from '@shared/messages';
import { PROGRESS_REPORT_INTERVAL_MS } from '@shared/constants';

export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private pauseOffset = 0;
  private isPlaying = false;
  private currentChunkIndex = -1;
  private playbackRate = 1.0;
  private prefetchedBuffers = new Map<number, AudioBuffer>();

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async play(audioData: ArrayBuffer, chunkIndex: number, format: string): Promise<void> {
    this.stop();
    this.currentChunkIndex = chunkIndex;

    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    let buffer: AudioBuffer;

    // Check prefetch cache
    const cached = this.prefetchedBuffers.get(chunkIndex);
    if (cached) {
      buffer = cached;
      this.prefetchedBuffers.delete(chunkIndex);
    } else {
      buffer = await ctx.decodeAudioData(audioData.slice(0));
    }

    this.currentBuffer = buffer;
    this.pauseOffset = 0;
    this.startPlayback();
  }

  async prefetch(audioData: ArrayBuffer, chunkIndex: number, _format: string): Promise<void> {
    const ctx = this.getContext();
    try {
      const buffer = await ctx.decodeAudioData(audioData.slice(0));
      this.prefetchedBuffers.set(chunkIndex, buffer);
      // Keep only a few prefetched buffers
      if (this.prefetchedBuffers.size > 3) {
        const oldest = this.prefetchedBuffers.keys().next().value;
        if (oldest !== undefined) {
          this.prefetchedBuffers.delete(oldest);
        }
      }
    } catch (err) {
      console.warn('Prefetch decode failed:', err);
    }
  }

  private startPlayback(): void {
    if (!this.currentBuffer || !this.ctx || !this.gainNode) return;

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.currentBuffer;
    this.sourceNode.playbackRate.value = this.playbackRate;
    this.sourceNode.connect(this.gainNode);

    this.sourceNode.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.stopProgressReporting();
        this.sendMessage({
          type: MSG.CHUNK_COMPLETE,
          chunkIndex: this.currentChunkIndex,
        });
      }
    };

    this.sourceNode.start(0, this.pauseOffset);
    this.startTime = this.ctx.currentTime - this.pauseOffset;
    this.isPlaying = true;
    this.startProgressReporting();
  }

  pause(): void {
    if (!this.isPlaying || !this.ctx || !this.sourceNode) return;
    this.pauseOffset = (this.ctx.currentTime - this.startTime) * this.playbackRate;
    this.isPlaying = false;
    try {
      this.sourceNode.onended = null;
      this.sourceNode.stop();
    } catch {
      // already stopped
    }
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.stopProgressReporting();
  }

  resume(): void {
    if (this.isPlaying || !this.currentBuffer) return;
    this.startPlayback();
  }

  stop(): void {
    this.isPlaying = false;
    this.stopProgressReporting();
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
      } catch {
        // already stopped
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.currentBuffer = null;
    this.pauseOffset = 0;
    this.currentChunkIndex = -1;
  }

  setSpeed(rate: number): void {
    this.playbackRate = rate;
    if (this.sourceNode && this.isPlaying) {
      this.sourceNode.playbackRate.value = rate;
    }
  }

  setVolume(level: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, level));
    }
  }

  getCurrentTime(): number {
    if (!this.ctx || !this.isPlaying) return this.pauseOffset;
    return (this.ctx.currentTime - this.startTime) * this.playbackRate;
  }

  getDuration(): number {
    return this.currentBuffer?.duration ?? 0;
  }

  private startProgressReporting(): void {
    this.stopProgressReporting();
    this.progressInterval = setInterval(() => {
      this.sendMessage({
        type: MSG.PLAYBACK_PROGRESS,
        currentTime: this.getCurrentTime(),
        duration: this.getDuration(),
        chunkIndex: this.currentChunkIndex,
      });
    }, PROGRESS_REPORT_INTERVAL_MS);
  }

  private stopProgressReporting(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private sendMessage(message: Record<string, unknown>): void {
    chrome.runtime.sendMessage(message).catch(() => {
      // Service worker may not be listening
    });
  }
}
