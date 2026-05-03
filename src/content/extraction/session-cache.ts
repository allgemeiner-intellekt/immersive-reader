export interface ChunkConfigKey {
  minWords: number;
  maxWords: number;
  splitThreshold: number;
}

export interface ExtractionCacheEntry {
  key: string;
  title: string;
  wordCount: number;
  totalChunks: number;
  sourceElement: Pick<Element, 'isConnected' | 'textContent'> | null;
  sourceTextLength: number | null;
}

export function createExtractionCacheKey(input: {
  url: string;
  fromSelection: boolean;
  selectionText: string | null;
  chunkConfig?: ChunkConfigKey;
}): string {
  const chunkConfigKey = input.chunkConfig
    ? `${input.chunkConfig.minWords}:${input.chunkConfig.maxWords}:${input.chunkConfig.splitThreshold}`
    : 'default';

  if (input.fromSelection && input.selectionText) {
    return [
      input.url,
      'selection',
      input.selectionText.length,
      hashTextSample(input.selectionText),
      chunkConfigKey,
    ].join('|');
  }

  return [input.url, 'document', chunkConfigKey].join('|');
}

export function createExtractionCacheEntry(input: {
  key: string;
  title: string;
  wordCount: number;
  totalChunks: number;
  sourceElement: Element | null;
}): ExtractionCacheEntry {
  return {
    key: input.key,
    title: input.title,
    wordCount: input.wordCount,
    totalChunks: input.totalChunks,
    sourceElement: input.sourceElement,
    sourceTextLength: input.sourceElement?.textContent?.length ?? null,
  };
}

export function canReuseExtraction(entry: ExtractionCacheEntry | null, key: string): boolean {
  if (!entry || entry.key !== key || entry.totalChunks <= 0) return false;
  if (!entry.sourceElement) return true;
  if (!entry.sourceElement.isConnected) return false;
  return (entry.sourceElement.textContent?.length ?? null) === entry.sourceTextLength;
}

function hashTextSample(text: string): string {
  const sample = text.length <= 128
    ? text
    : `${text.slice(0, 64)}${text.slice(-64)}`;
  let hash = 2166136261;

  for (let i = 0; i < sample.length; i++) {
    hash ^= sample.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
