import type { PlaybackStatus, PlaybackState } from '@shared/types';

class PlaybackStateManager {
  private state: PlaybackState = {
    status: 'idle',
    currentChunkIndex: 0,
    totalChunks: 0,
    chunkProgress: 0,
    currentTime: 0,
    duration: 0,
    speed: 1.0,
    volume: 1.0,
  };

  private listeners: Array<(state: PlaybackState) => void> = [];

  getState(): PlaybackState {
    return { ...this.state };
  }

  getStatus(): PlaybackStatus {
    return this.state.status;
  }

  update(partial: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  setStatus(status: PlaybackStatus): void {
    this.state.status = status;
    this.notify();
  }

  reset(): void {
    this.state = {
      status: 'idle',
      currentChunkIndex: 0,
      totalChunks: 0,
      chunkProgress: 0,
      currentTime: 0,
      duration: 0,
      speed: this.state.speed,
      volume: this.state.volume,
    };
    this.notify();
  }

  onStateChange(listener: (state: PlaybackState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const playbackState = new PlaybackStateManager();
