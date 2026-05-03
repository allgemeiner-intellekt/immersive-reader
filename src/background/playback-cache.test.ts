import { describe, expect, it } from 'vitest';
import { evictAudioCache, getAudioCacheBase64Chars } from './playback-cache';

describe('evictAudioCache', () => {
  it('keeps cache entries nearest to the current chunk when entry count is exceeded', () => {
    const cache = new Map([
      [0, { chunkIndex: 0, audioBase64: 'aaaa' }],
      [2, { chunkIndex: 2, audioBase64: 'bbbb' }],
      [4, { chunkIndex: 4, audioBase64: 'cccc' }],
      [7, { chunkIndex: 7, audioBase64: 'dddd' }],
    ]);

    evictAudioCache(cache, 3, 2, 100);

    expect([...cache.keys()].sort((a, b) => a - b)).toEqual([2, 4]);
  });

  it('also enforces the base64 character budget', () => {
    const cache = new Map([
      [1, { chunkIndex: 1, audioBase64: 'aaaa' }],
      [2, { chunkIndex: 2, audioBase64: 'bbbb' }],
      [3, { chunkIndex: 3, audioBase64: 'cccc' }],
    ]);

    evictAudioCache(cache, 2, 3, 8);

    expect(getAudioCacheBase64Chars(cache)).toBeLessThanOrEqual(8);
    expect([...cache.keys()].sort((a, b) => a - b)).toEqual([2, 3]);
  });
});
