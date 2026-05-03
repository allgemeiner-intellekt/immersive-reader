export type PlaybackLatencyKind = 'first-start' | 'seek-to-audio';

export interface PlaybackLatencyEvent {
  kind: PlaybackLatencyKind;
  chunkIndex: number;
  elapsedMs: number;
}

interface PendingLatencyMark {
  kind: PlaybackLatencyKind;
  chunkIndex: number | null;
  startedAt: number;
}

export class PlaybackLatencyTracker {
  private pending: PendingLatencyMark | null = null;

  mark(kind: PlaybackLatencyKind, chunkIndex: number | null, now = performance.now()): void {
    this.pending = { kind, chunkIndex, startedAt: now };
  }

  cancel(): void {
    this.pending = null;
  }

  completeOnAudioProgress(chunkIndex: number, now = performance.now()): PlaybackLatencyEvent | null {
    const pending = this.pending;
    if (!pending) return null;
    if (pending.chunkIndex != null && pending.chunkIndex !== chunkIndex) return null;

    this.pending = null;
    return {
      kind: pending.kind,
      chunkIndex,
      elapsedMs: Math.max(0, Math.round(now - pending.startedAt)),
    };
  }
}
