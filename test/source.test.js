import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { sourceLabels } from '../src/song.js';

const meta = fm => parse(`---\ntitle: T\n${fm}\n---\n[C]la\n`).meta;

test('no source means an empty list', () => {
  assert.deepEqual(meta('key: C').source, []);
});

test('one address is read as a one-item list', () => {
  assert.deepEqual(meta('source: https://example.com/a-b-123').source, ['https://example.com/a-b-123']);
});

test('several addresses can be given as a YAML list', () => {
  const m = meta('source:\n  - https://a.example.com/x\n  - https://b.example.com/y');
  assert.deepEqual(m.source, ['https://a.example.com/x', 'https://b.example.com/y']);
});

test('or as an inline list', () => {
  assert.deepEqual(meta('source: [https://a.example.com/x, https://b.example.com/y]').source,
    ['https://a.example.com/x', 'https://b.example.com/y']);
});

test('an Obsidian link is kept as one piece of text, not split as a list', () => {
  assert.deepEqual(meta('source: "[[original scan.pdf]]"').source, ['[[original scan.pdf]]']);
});

test('source is not copied into the unused-properties bucket', () => {
  assert.equal(meta('source: https://example.com/').raw.source, undefined);
});

test('addresses are labelled by site; anything else is plain text', () => {
  assert.deepEqual(sourceLabels(['https://www.example.com/a/b?c=d', '[[scan.pdf]]']), [
    { url: 'https://www.example.com/a/b?c=d', text: 'example.com' },
    { url: null, text: '[[scan.pdf]]' },
  ]);
});

test('two addresses on one site are numbered so they can be told apart', () => {
  const l = sourceLabels(['https://tabs.example.com/one', 'https://tabs.example.com/two', 'https://other.org/x']);
  assert.deepEqual(l.map(x => x.text), ['tabs.example.com (1)', 'tabs.example.com (2)', 'other.org']);
});

test('empty and missing values give nothing', () => {
  assert.deepEqual(sourceLabels(undefined), []);
  assert.deepEqual(sourceLabels(['', '  ']), []);
});
