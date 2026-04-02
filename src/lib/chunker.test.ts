import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker';

describe('chunkText', () => {
  it('keeps short sentences as independent playback segments', () => {
    expect(
      chunkText('Hi there. Ok. This is the third sentence.', {
        minWords: 30,
        maxWords: 50,
        splitThreshold: 80,
      }).map((chunk) => chunk.text),
    ).toEqual([
      'Hi there.',
      'Ok.',
      'This is the third sentence.',
    ]);
  });

  it('splits very long sentences at clause boundaries', () => {
    const chunks = chunkText(
      'This sentence is intentionally very long, with several comma-separated parts, so that it crosses the split threshold, and it should become multiple playback segments.',
      {
        minWords: 15,
        maxWords: 8,
        splitThreshold: 10,
      },
    ).map((chunk) => chunk.text);

    expect(chunks).toEqual([
      'This sentence is intentionally very long,',
      'with several comma-separated parts,',
      'so that it crosses the split threshold,',
      'and it should become multiple playback segments.',
    ]);
  });
});
