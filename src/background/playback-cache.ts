export interface AudioCacheEntry {
  chunkIndex: number;
  audioBase64: string;
}

export function evictAudioCache<T extends AudioCacheEntry>(
  cache: Map<number, T>,
  currentIndex: number,
  maxEntries: number,
  maxBase64Chars: number,
): void {
  let totalChars = getAudioCacheBase64Chars(cache);
  if (cache.size <= maxEntries && totalChars <= maxBase64Chars) return;

  const keysByEvictionPriority = [...cache.keys()].sort((a, b) => {
    const distanceDelta = Math.abs(b - currentIndex) - Math.abs(a - currentIndex);
    if (distanceDelta !== 0) return distanceDelta;
    return a - b;
  });

  while (
    (cache.size > maxEntries || totalChars > maxBase64Chars) &&
    keysByEvictionPriority.length > 0
  ) {
    const key = keysByEvictionPriority.shift()!;
    const entry = cache.get(key);
    if (!entry) continue;
    totalChars -= entry.audioBase64.length;
    cache.delete(key);
  }
}

export function getAudioCacheBase64Chars<T extends AudioCacheEntry>(cache: Map<number, T>): number {
  let total = 0;
  for (const entry of cache.values()) {
    total += entry.audioBase64.length;
  }
  return total;
}
