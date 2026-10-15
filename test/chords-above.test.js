import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertChordsAbove, isChordLine } from '../src/chords-above.js';

const first = (s, o) => convertChordsAbove(s, o).text.split('\n')[0];

test('puts each chord at the column it sat over', () => {
  // D is in column 6, the "w" of "world"
  const { text, stats } = convertChordsAbove('G     D\nhello world\n');
  assert.equal(text.split('\n')[0], '[G]hello [D]world');
  assert.equal(stats.pairs, 1);
  assert.ok(stats.verified);
});

test('the column is used exactly, even mid-word', () => {
  assert.equal(first('C   G\nabcdefgh\n'), '[C]abcd[G]efgh');
});

test('a chord row with no lyric under it becomes a bracket row', () => {
  const { text, stats } = convertChordsAbove('Am  F  C  G\n\nla la\n');
  assert.equal(text.split('\n')[0], '[Am] [F] [C] [G]');
  assert.equal(stats.standalone, 1);
});

test('chords past the end of the lyric go after it, in order', () => {
  assert.equal(first('C            G   D\nla la\n'), '[C]la la [G] [D]');
});

test('ordinary words are never read as chords', () => {
  for (const w of ['Bad', 'Fade', 'Add', 'Be', 'Dead', 'Go', 'Am I']) assert.equal(isChordLine(w), false, w);
  for (const w of ['A', 'Am7', 'F#m', 'Bbmaj7', 'C/G', 'Dsus4', 'E7#9', 'G6', 'Fsus4add9/A#', 'Em  Bm']) assert.equal(isChordLine(w), true, w);
});

test('label lines become headings; chords after a label are kept', () => {
  const { text, stats } = convertChordsAbove('CHORUS:\nG     D\nhello world\n\n[Verse 2]\n\nIntro: G D Em\n');
  const lines = text.split('\n');
  assert.equal(lines[0], '### Chorus');
  assert.equal(lines[1], '[G]hello [D]world');
  assert.ok(lines.includes('### Verse 2'));
  assert.ok(lines.includes('### Intro'));
  assert.ok(lines.includes('[G] [D] [Em]'));
  assert.equal(stats.headings, 3);
  assert.ok(stats.verified);
});

test('--no-headings leaves label lines alone', () => {
  assert.equal(first('Chorus\nG\nla\n', { headings: false }), 'Chorus');
});

test('a lyric line that merely starts with a label word is not a label', () => {
  assert.equal(convertChordsAbove('Bridge over water\n').text, 'Bridge over water\n');
});

test('fenced tab is left untouched', () => {
  const src = '```\nG\nA|--0--|\n```\n';
  assert.equal(convertChordsAbove(src).text, src);
});

test('lines mixing chords with other symbols are reported, not converted', () => {
  const { text, stats } = convertChordsAbove('G | D | C\nla\n');
  assert.equal(text.split('\n')[0], 'G | D | C');
  assert.equal(stats.warnings.length, 1);
  assert.equal(stats.warnings[0].line, 1);
});

test('a parenthesised alternate name is dropped, keeping the chord', () => {
  const { text, stats } = convertChordsAbove('Bb (A#)\nhello\n');
  assert.equal(text.split('\n')[0], '[Bb]hello');
  assert.equal(stats.alternates, 1);
  assert.equal(stats.warnings.length, 0);
  assert.ok(stats.verified);
});

test('non-breaking spaces do not break alignment or detection', () => {
  const { text, stats } = convertChordsAbove('G     D\nhello world\n');
  assert.equal(stats.pairs, 1);
  assert.equal(text.split('\n')[0], '[G]hello [D]world');
});

test('shared indentation is removed from both lines', () => {
  assert.equal(first('    G     D\n    hello world\n'), '[G]hello [D]world');
});

test('output is stable: converting converted text changes nothing', () => {
  const once = convertChordsAbove('G     D\nhello world\n').text;
  const twice = convertChordsAbove(once);
  assert.equal(twice.text, once);
  assert.equal(twice.stats.pairs, 0);
  assert.ok(twice.stats.verified);
});

test('lyrics are never altered', () => {
  const { stats } = convertChordsAbove('G   C   D\nsome words here\n\nEm\nmore words\n');
  assert.ok(stats.verified);
});

test('a chord inside a word moves forward to the next word when that is nearer', () => {
  // D is over the "o" of "hello": 4 from its start, 2 before "world"
  assert.equal(first('G   D\nhello world\n'), '[G]hello [D]world');
});

test('a chord inside a word moves back to the start of that word when that is nearer', () => {
  // C is over the first "l" of "hello": 2 from its start
  assert.equal(first('  C\nhello world\n'), '[C]hello world');
});

test('--snap 0 uses exact columns', () => {
  assert.equal(first('G   D\nhello world\n', { snap: 0 }), '[G]hell[D]o world');
});

test('a chord farther than the snap distance stays where it is (a real mid-word change)', () => {
  assert.equal(first('C       G\nabcdefghij\n'), '[C]abcdefgh[G]ij');
});

test('a chord over a gap belongs to the next word', () => {
  // column 5 is the first of two spaces; "world" starts at column 7
  assert.equal(first('     C\nhello  world\n'), 'hello  [C]world');
});

test('snapping never reorders chords', () => {
  const line = first('C G D\nhello world again\n');
  const order = [...line.matchAll(/\[(\w+)\]/g)].map(m => m[1]);
  assert.deepEqual(order, ['C', 'G', 'D']);
});

test('bold markers around a chord row or a label are formatting only', () => {
  const { text, stats } = convertChordsAbove('**CHORUS:**\n**G     D**\nhello world\n');
  const lines = text.split('\n');
  assert.equal(lines[0], '### Chorus');
  assert.equal(lines[1], '[G]hello [D]world');
  assert.equal(stats.pairs, 1);
  assert.ok(stats.verified);
});

test('a stray link in a chord row is dropped and reported', () => {
  const { text, stats } = convertChordsAbove('G    (https://example.com/)   D\nhello world\n');
  assert.equal(stats.pairs, 1);
  assert.equal(stats.links, 1);
  assert.ok(text.split('\n')[0].startsWith('[G]hello'));
  assert.ok(stats.verified);
});

test('a row whose chords mostly run past the lyric is flagged for checking', () => {
  const { stats } = convertChordsAbove('G           D   F   G   C\nhi there\n');
  assert.equal(stats.warnings.length, 1);
  assert.equal(stats.warnings[0].line, 1);
  assert.ok(stats.verified);
});

test('bracketed section labels like [Chorus] do not count as chords when verifying', () => {
  const { text, stats } = convertChordsAbove('[Chorus]\nAm  F\nhello world\n\n[Bridge]\n[Intro]\nAm  F  C  G\n');
  assert.ok(stats.verified);
  assert.equal(stats.headings, 3);
  assert.ok(text.split('\n').includes('### Chorus'));
  assert.ok(text.split('\n').includes('### Bridge'));
});

test('real inline chords already in the text still count', () => {
  const { stats } = convertChordsAbove('[G]already inline\n\nAm  F\nhello world\n');
  assert.ok(stats.verified);
});

test('a chord row above tablature stays a row; chords are never put into the tab', () => {
  const { text, stats } = convertChordsAbove('B  D\nd|-5--7--|\nA|-0--2--|\n');
  assert.equal(text, '[B] [D]\n```\nd|-5--7--|\nA|-0--2--|\n```\n');
  assert.equal(stats.tabs, 1);
  assert.equal(stats.standalone, 1);
  assert.ok(stats.verified);
});

test('tab with no string names, and notes after the staff, is still tab', () => {
  const { text } = convertChordsAbove('|-5--8--|\n|-5--8--| repeat\n');
  assert.equal(text, '```\n|-5--8--|\n|-5--8--| repeat\n```\n');
});

test('a single stray line with a bar is not mistaken for a staff', () => {
  assert.equal(convertChordsAbove('a | b\n').text, 'a | b\n');
});

test('any bracketed word on its own line is a section label, but a bracketed chord is not', () => {
  const { text, stats } = convertChordsAbove('[Chords]\nB  D\n\n[Hook]\n[Am]\n');
  const lines = text.split('\n');
  assert.equal(lines[0], '### Chords');
  assert.ok(lines.includes('### Hook'));
  assert.ok(lines.includes('[Am]'));
  assert.equal(stats.headings, 2);
  assert.ok(stats.verified);
});

test('short bracketed markers such as [x2] or [N.C.] are not turned into headings', () => {
  const { text } = convertChordsAbove('[x2]\n[N.C.]\n');
  assert.equal(text, '[x2]\n[N.C.]\n');
});
