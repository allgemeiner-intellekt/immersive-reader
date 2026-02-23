import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../.tmp-tests/src/content/extraction/sentence-splitter.js';

test('splitSentences handles abbreviations (Dr.)', () => {
  const text = 'Dr. Smith went home. He slept.';
  const out = splitSentences(text);
  assert.equal(out.length, 2);
  assert.equal(out[0].text.trim(), 'Dr. Smith went home.');
  assert.equal(out[1].text.trim(), 'He slept.');
});

test('splitSentences handles multi-dot abbreviations (U.S.)', () => {
  const text = 'The U.S. economy grew. It was good.';
  const out = splitSentences(text);
  assert.equal(out.length, 2);
  assert.equal(out[0].text.trim(), 'The U.S. economy grew.');
  assert.equal(out[1].text.trim(), 'It was good.');
});

test('splitSentences does not split decimals (3.99)', () => {
  const text = 'It costs $3.99. That is cheap.';
  const out = splitSentences(text);
  assert.equal(out.length, 2);
  assert.equal(out[0].text.trim(), 'It costs $3.99.');
  assert.equal(out[1].text.trim(), 'That is cheap.');
});

test('splitSentences respects baseOffset', () => {
  const text = 'Hello. World.';
  const out = splitSentences(text, 10);
  assert.equal(out[0].startOffset, 10);
});

