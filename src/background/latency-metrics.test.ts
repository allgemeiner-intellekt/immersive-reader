import { describe, expect, it } from 'vitest';
import { PlaybackLatencyTracker } from './latency-metrics';

describe('PlaybackLatencyTracker', () => {
  it('measures first-start latency on the first audio progress event', () => {
    const tracker = new PlaybackLatencyTracker();
    tracker.mark('first-start', null, 100);

    expect(tracker.completeOnAudioProgress(3, 345)).toEqual({
      kind: 'first-start',
      chunkIndex: 3,
      elapsedMs: 245,
    });
    expect(tracker.completeOnAudioProgress(3, 500)).toBeNull();
  });

  it('waits for the targeted seek chunk before completing seek latency', () => {
    const tracker = new PlaybackLatencyTracker();
    tracker.mark('seek-to-audio', 8, 50);

    expect(tracker.completeOnAudioProgress(7, 100)).toBeNull();
    expect(tracker.completeOnAudioProgress(8, 275)).toEqual({
      kind: 'seek-to-audio',
      chunkIndex: 8,
      elapsedMs: 225,
    });
  });
});
