import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentText } from '../.tmp-tests/src/content/extraction/segmenter.js';

test('segmentText preserves offsets (slice === segment.text)', () => {
  const para1 =
    'Hi. Ok. This sentence is long enough to exceed the minimum character threshold. ' +
    'Another long sentence to complete the first segment.';
  const para2 = 'Tiny.';
  const text = `${para1}\n\n${para2}`;

  const segments = segmentText(text);
  assert.ok(segments.length > 0);

  for (const seg of segments) {
    assert.equal(text.slice(seg.startOffset, seg.endOffset), seg.text);
    assert.equal(seg.endOffset - seg.startOffset, seg.text.length);
  }

  // Regression: the first two short sentences should not be dropped
  assert.ok(segments[0].text.includes('Hi. Ok.'));
});

test('segmentText merges very short trailing paragraph without breaking offsets', () => {
  const para1 =
    'This is a long sentence with enough characters to pass the minimum. ' +
    'This is another long sentence so the first paragraph forms a segment.';
  const para2 = 'Tiny.';
  const text = `${para1}\n\n${para2}`;

  const segments = segmentText(text);
  assert.ok(segments.length >= 1);

  // The last segment should end at the end of the whole text.
  const last = segments[segments.length - 1];
  assert.equal(last.endOffset, text.length);
  assert.equal(text.slice(last.startOffset, last.endOffset), last.text);
});

