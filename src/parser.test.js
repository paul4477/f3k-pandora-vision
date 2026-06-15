import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTimingText } from './parser.js';

test('parses group, round, and listed times from Pandora display OCR text', () => {
  const parsed = parseTimingText('RND 04B1 PREP 08:27 01:00\'46"7 02:00\'59"5');

  assert.equal(parsed.round, '04');
  assert.equal(parsed.group, 'B');
  assert.deepEqual(parsed.times.map((time) => time.formatted), ['0:46.7', '0:59.5']);
});
