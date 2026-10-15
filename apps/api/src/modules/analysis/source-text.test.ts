import { expect, it } from 'vitest';
import {
  quoteLines,
  splitSourceLines,
  toNormalizedText,
} from './source-text.js';

it.each([
  ['', [], 'none', ''],
  ['a', ['a'], 'none', 'a'],
  ['a\n', ['a'], 'lf', 'a\n'],
  ['a\n\n', ['a', ''], 'lf', 'a\n\n'],
  ['a\r\nb\r\n', ['a', 'b'], 'crlf', 'a\nb\n'],
  ['a\rb', ['a', 'b'], 'cr', 'a\nb'],
  ['a\r\nb\nc\r', ['a', 'b', 'c'], 'mixed', 'a\nb\nc\n'],
  ['\t x \u2028y\n', ['\t x \u2028y'], 'lf', '\t x \u2028y\n'],
])('splits %j only on CRLF/LF/CR', (text, lines, style, normalized) => {
  const source = splitSourceLines(text);
  expect(source.lines).toEqual(lines);
  expect(source.newlineStyle).toBe(style);
  expect(toNormalizedText(source)).toBe(normalized);
});

it('quotes an inclusive 1-based range joined by LF and rejects bad ranges', () => {
  const source = splitSourceLines('one\r\ntwo\r\nthree');
  expect(quoteLines(source, 2, 3)).toBe('two\nthree');
  expect(quoteLines(source, 1, 1)).toBe('one');
  expect(quoteLines(source, 0, 1)).toBeNull();
  expect(quoteLines(source, 3, 2)).toBeNull();
  expect(quoteLines(source, 3, 4)).toBeNull();
});
