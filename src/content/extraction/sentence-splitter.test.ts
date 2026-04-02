import { describe, it, expect } from 'vitest';
import { splitSentences, splitSentenceStrings } from './sentence-splitter';

describe('splitSentenceStrings', () => {
  it('splits basic English sentences', () => {
    expect(splitSentenceStrings('Hello world. How are you? Fine!')).toEqual([
      'Hello world.',
      'How are you?',
      'Fine!',
    ]);
  });

  it('handles abbreviations', () => {
    expect(splitSentenceStrings('Dr. Smith arrived. He was early.')).toEqual([
      'Dr. Smith arrived.',
      'He was early.',
    ]);
  });

  it('handles decimals', () => {
    expect(splitSentenceStrings('The price is 3.14 dollars. That is cheap.')).toEqual([
      'The price is 3.14 dollars.',
      'That is cheap.',
    ]);
  });

  it('handles ellipsis', () => {
    expect(splitSentenceStrings('Wait... What happened? Nothing.')).toEqual([
      'Wait... What happened?',
      'Nothing.',
    ]);
  });

  it('splits sentences separated by newlines even if the next line starts lowercase', () => {
    expect(splitSentenceStrings('First sentence.\nsecond sentence.')).toEqual([
      'First sentence.',
      'second sentence.',
    ]);
  });
});

describe('East Asian sentence splitting', () => {
  it('splits Chinese sentences on 。', () => {
    const result = splitSentenceStrings('这是中文。第二句话。');
    expect(result).toEqual(['这是中文。', '第二句话。']);
  });

  it('splits on fullwidth ! and ?', () => {
    const result = splitSentenceStrings('你好吗？我很好！谢谢。');
    expect(result).toEqual(['你好吗？', '我很好！', '谢谢。']);
  });

  it('handles mixed English and CJK', () => {
    const result = splitSentenceStrings('This is English. 这是中文。第二句话。');
    expect(result).toEqual(['This is English.', '这是中文。', '第二句话。']);
  });

  it('does not split CJK decimals', () => {
    const result = splitSentenceStrings('价格是3.14元。真便宜。');
    expect(result).toEqual(['价格是3.14元。', '真便宜。']);
  });

  it('handles abbreviation followed by CJK', () => {
    const result = splitSentenceStrings('Dr. Smith arrived。他来了。');
    expect(result).toEqual(['Dr. Smith arrived。', '他来了。']);
  });
});

describe('splitSentences (with offsets)', () => {
  it('returns correct offsets for CJK', () => {
    const result = splitSentences('你好。世界。');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('你好。');
    expect(result[1].text).toBe('世界。');
    expect(result[0].startOffset).toBe(0);
    expect(result[1].startOffset).toBe(3);
  });
});
