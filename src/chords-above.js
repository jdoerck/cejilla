#!/usr/bin/env node
// Convert "chords above the lyrics" text into Inlay's inline bracket notation.
//
//   G         D
//   Hello darling     ->   [G]Hello [D]darling
//
// Pure Node, no dependencies. Used as a library (convertChordsAbove) and as a
// command:  node src/chords-above.js <song.md> [--write] [--print] [--no-headings]

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const ROOT = '[A-G][#b]?';
// Chord quality pieces. Deliberately strict so ordinary words ("Bad", "Fade",
// "Add") are never mistaken for chords.
const UNIT = '(?:(?:maj|min|dim|aug|sus|add|no|m|M)\\d{0,2}|\\d{1,2}|[+\\-]|[#b]\\d{1,2}|\\([^)]*\\))';
const CHORD_RE = new RegExp(`^${ROOT}${UNIT}*(?:/${ROOT})?$`);

const LABEL_RE = new RegExp(
  '^\\s*[\\[(]?\\s*((?:verse|chorus|bridge|intro|outro|interlude|pre[- ]?chorus|post[- ]?chorus|' +
  'refrain|solo|instrumental|coda|turnaround|tag|break)(?:\\s*\\d+)?)\\s*[\\])]?\\s*:?\\s*(.*)$', 'i');

const FENCE_RE = /^\s*```/;

// A line of guitar/ukulele tablature: an optional string name, a bar, then a
// run of dashes and fret numbers ("d|-5--7--|", "|-0-2-|"). Anything after the
// staff on the same line (a note like "repeat") is allowed.
const TAB_RE = /^\s*[A-Za-z#b]{0,2}\s?\|[-0-9xXhpbrvs\/\\~^()|<>.=]{4,}/;
export const isTabLine = line => TAB_RE.test(line);

// Non-breaking spaces become spaces, zero-width characters vanish, tabs
// become four spaces — columns only line up if every character is one column.
export function normalise(line) {
  return line
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\t/g, '    ');
}

// "Bb (A#)": a chord followed by its alternate spelling in parentheses. The
// alternate is an annotation, not a second chord.
const ALT_RE = /^\(\s*[A-G][#b]?[^)\s]*\)$/;
// A stray link left in a chord row (for example by an earlier HTML cleanup).
const LINK_RE = /^\(?https?:\/\/\S*\)?$/i;

// **bold** / __bold__ around chord rows and labels is formatting, not content.
const unemph = s => s.replace(/\*\*|__/g, '');

function tokens(line) {
  return [...line.matchAll(/\S+/g)].map(m => ({ tok: m[0], pos: m.index }));
}

// Chord names on a line, with parenthesised alternate spellings set aside.
function chordTokens(line) {
  const all = tokens(line);
  const chords = [];
  let alternates = 0, links = 0;
  for (let k = 0; k < all.length; k++) {
    if (LINK_RE.test(all[k].tok)) { links++; continue; }
    if (ALT_RE.test(all[k].tok) && k > 0 && CHORD_RE.test(all[k - 1].tok)) { alternates++; continue; }
    chords.push(all[k]);
  }
  return { chords, alternates, links };
}

/** A line made only of chord names (at least one). */
export function isChordLine(line) {
  if (/\[/.test(line)) return false;                 // already inline
  const { chords } = chordTokens(line);
  return chords.length > 0 && chords.every(x => CHORD_RE.test(x.tok));
}

function leading(s) {
  return s.length - s.trimStart().length;
}

function titleCase(s) {
  return s.replace(/[\[\]():]/g, '').trim().split(/\s+/)
    .map(w => (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) ? w[0] + w.slice(1).toLowerCase()
      : w[0].toUpperCase() + w.slice(1)).join(' ');
}

// "Chorus", "[Verse 2]", "INTRO: G D Em" -> { label, chords }. Null otherwise.
function labelLine(clean) {
  // Ultimate Guitar style: a line that is only a bracketed word, like [Hook] or
  // [Chords]. It is a section label as long as it is not itself a chord.
  const b = clean.match(/^\s*\[([A-Za-z][A-Za-z0-9 \-#]{2,39})\]\s*$/);
  if (b && !CHORD_RE.test(b[1].trim())) return { label: titleCase(b[1]), chords: [] };
  const m = clean.match(LABEL_RE);
  if (!m) return null;
  const rest = m[2].trim();
  if (rest === '') return { label: titleCase(m[1]), chords: [] };
  const t = tokens(rest);
  if (t.length && t.every(x => CHORD_RE.test(x.tok))) return { label: titleCase(m[1]), chords: t.map(x => x.tok) };
  return null;
}

function isLyric(clean) {
  if (clean.trim() === '') return false;
  if (isTabLine(clean)) return false;                // tab is never lyrics
  const view = unemph(clean);
  if (isChordLine(view)) return false;
  if (/^\s*(#{1,3}\s|```|\{|---\s*$|>|\[\[)/.test(clean)) return false;
  if (labelLine(view)) return false;
  return true;
}

// Chord rows are usually typed against a different layout than the lyric line
// they sit over, so a chord often lands a column or two inside a word. Move it
// to the nearest word (or hyphen-syllable) start within `maxDist` characters;
// farther than that it is left where it is, since that is a deliberate
// mid-word change.
function snapPos(text, p, maxDist) {
  if (maxDist <= 0 || p >= text.length) return p;
  const isStart = i => text[i] !== ' ' && (i === 0 || text[i - 1] === ' ' || text[i - 1] === '-');
  if (isStart(p)) return p;
  let back = p; while (back >= 0 && !isStart(back)) back--;
  let fwd = p;  while (fwd < text.length && !isStart(fwd)) fwd++;
  const db = back >= 0 ? p - back : Infinity;
  const df = fwd < text.length ? fwd - p : Infinity;
  if (text[p] === ' ') return df <= maxDist ? fwd : p;          // over a gap: belongs to the next word
  if (db <= maxDist && db <= df) return back;
  if (df <= maxDist) return fwd;
  return p;
}

// Put each chord into the lyric at the column it sat over (snapped to a word
// start). Chords past the end of the lyric go after it, in order.
function merge(chordLine, lyric, maxDist) {
  const indent = Math.min(leading(chordLine), leading(lyric));
  const toks = chordTokens(chordLine).chords.map(t => ({ tok: t.tok, pos: t.pos - indent }));
  const text = lyric.slice(indent).replace(/\s+$/, '');
  const inside = toks.filter(t => t.pos < text.length);
  const tail = toks.filter(t => t.pos >= text.length).map(t => t.tok);
  let snapped = 0, prev = 0;
  const placed = inside.map(t => {
    let pos = snapPos(text, t.pos, maxDist);
    if (pos !== t.pos) snapped++;
    pos = Math.max(pos, prev); prev = pos;               // keep the chords in their original order
    return { tok: t.tok, pos };
  });
  let out = text;
  for (let k = placed.length - 1; k >= 0; k--) out = out.slice(0, placed[k].pos) + '[' + placed[k].tok + ']' + out.slice(placed[k].pos);
  if (tail.length) out += ' ' + tail.map(c => `[${c}]`).join(' ');
  const mid = placed.filter(t => t.pos > 0 && text[t.pos] !== ' ' && text[t.pos - 1] !== ' ' && text[t.pos - 1] !== '-').length;
  return { text: out, snapped, mid, tail: tail.length, total: toks.length };
}

function collapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} body  song text WITHOUT frontmatter
 * @returns {{text:string, stats:{pairs:number,standalone:number,headings:number,warnings:{line:number,note:string}[],verified:boolean}}}
 */
export function convertChordsAbove(body, { headings = true, snap = 3 } = {}) {
  const lines = body.split('\n').map(l => l.replace(/\r$/, ''));
  const out = [];
  const stats = { pairs: 0, standalone: 0, headings: 0, tabs: 0, alternates: 0, links: 0, snapped: 0, midWord: 0, warnings: [], verified: false };
  let inFence = false;
  const origLyrics = [];
  let origChords = 0;
  let alreadyInline = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) { inFence = !inFence; out.push(line); continue; }
    if (inFence) { out.push(line); continue; }

    const clean = normalise(line);
    const view = unemph(clean);

    // Two or more tab lines in a row are a staff: fence them, leave them as written.
    if (isTabLine(clean)) {
      let j = i;
      while (j < lines.length && isTabLine(normalise(lines[j]))) j++;
      if (j - i >= 2) {
        out.push('```');
        for (let k = i; k < j; k++) out.push(lines[k].replace(/\s+$/, ''));
        out.push('```');
        stats.tabs++;
        i = j - 1;
        continue;
      }
    }

    if (isChordLine(view)) {
      const ct = chordTokens(view);
      origChords += ct.chords.length;
      stats.alternates += ct.alternates;
      stats.links += ct.links;
      const next = i + 1 < lines.length ? normalise(lines[i + 1]) : null;
      if (next !== null && isLyric(next)) {
        const r = merge(view, next, snap);
        out.push(r.text);
        stats.snapped += r.snapped; stats.midWord += r.mid;
        if (r.tail >= 3 || (r.tail >= 2 && r.tail * 2 >= r.total)) {
          stats.warnings.push({ line: i + 1, note: `${r.tail} of ${r.total} chords sit past the end of the lyric and were put after it; check this line` });
        }
        origLyrics.push(collapse(next.replace(/\[[A-G][^\]]*\]/g, '')));
        stats.pairs++; i++;
      } else {
        out.push(ct.chords.map(t => `[${t.tok}]`).join(' '));
        stats.standalone++;
      }
      continue;
    }

    const labelMatch = headings ? labelLine(view) : null;
    if (!labelMatch) alreadyInline += (clean.match(/\[[A-G][^\]]*\]/g) || []).length;

    if (headings) {
      const lab = labelMatch;
      if (lab) {
        if (out.length && out[out.length - 1].trim() !== '') out.push('');
        out.push('### ' + lab.label);
        if (lab.chords.length) { out.push(lab.chords.map(c => `[${c}]`).join(' ')); origChords += lab.chords.length; }
        stats.headings++;
        continue;
      }
    }

    // A line that mixes chords with a little other text (bars, "(x2)", an
    // alternate name like "Bb (A#)") is left alone and reported.
    const t = tokens(clean);
    const chordish = t.filter(x => CHORD_RE.test(x.tok)).length;
    if (!/\[/.test(clean) && t.length >= 2 && chordish >= 1 && t.length - chordish <= 2 &&
        t.filter(x => !CHORD_RE.test(x.tok)).every(x => x.tok.length <= 6)) {
      stats.warnings.push({ line: i + 1, note: 'chords mixed with other symbols, left as is' });
    }

    origLyrics.push(collapse(clean.replace(/\[[A-G][^\]]*\]/g, '')));
    out.push(clean !== line && /[ ​-‍⁠﻿]/.test(line) ? clean : line);
  }

  const text = out.join('\n');

  // Verify: every chord arrived, and no lyric text changed.
  let newChords = 0;
  const newLyrics = [];
  let fence = false;
  for (const l of out) {
    if (FENCE_RE.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    newChords += (l.match(/\[[A-G][^\]]*\]/g) || []).length;
    if (/^#{1,3}\s/.test(l)) continue;
    const bare = collapse(l.replace(/\[[A-G][^\]]*\]/g, ''));
    if (bare === '') continue;
    if (/^(#|\{|---|>|\[\[)/.test(bare)) continue;
    newLyrics.push(bare);
  }
  const skip = /^(#|\{|---|>|\[\[)/;
  const keepOrig = origLyrics.filter(x => x !== '' && !skip.test(x));
  stats.verified = newChords === origChords + alreadyInline &&
    JSON.stringify(newLyrics) === JSON.stringify(keepOrig);
  return { text, stats };
}

export function splitFrontmatter(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? { head: m[0], body: text.slice(m[0].length) } : { head: '', body: text };
}

// ----- command line -----
function main(argv) {
  const files = argv.filter((a, k) => !a.startsWith('--') && argv[k - 1] !== '--snap');
  const write = argv.includes('--write');
  const print = argv.includes('--print');
  const headings = !argv.includes('--no-headings');
  const si = argv.findIndex(a => a === '--snap' || a.startsWith('--snap='));
  const snap = si < 0 ? 3 : Number(argv[si].includes('=') ? argv[si].split('=')[1] : argv[si + 1]);
  if (Number.isNaN(snap) || snap < 0) { process.stderr.write('--snap needs a number of characters, 0 or more\n'); process.exit(1); }
  if (!files.length) {
    process.stderr.write('Usage: node src/chords-above.js <song.md...> [--write] [--print] [--no-headings] [--snap N]\n' +
      '  default: report only. --write rewrites the file; --print writes the result to stdout.\n');
    process.exit(1);
  }
  let failed = false;
  for (const f of files) {
    const { head, body } = splitFrontmatter(readFileSync(f, 'utf8'));
    const { text, stats } = convertChordsAbove(body, { headings, snap });
    const changed = stats.pairs + stats.standalone + stats.headings > 0;
    process.stderr.write(`${f}: ${stats.pairs} chord+lyric pairs, ${stats.standalone} chord-only rows, ` +
      `${stats.headings} headings${stats.tabs ? `, ${stats.tabs} tab blocks fenced` : ''}, ${stats.snapped} chords moved to a word start, ${stats.midWord} left mid-word` +
      `${stats.alternates ? `, ${stats.alternates} alternate names dropped` : ''}${stats.links ? `, ${stats.links} stray links dropped` : ''}${stats.verified ? '' : '  ** VERIFY FAILED **'}\n`);
    for (const w of stats.warnings) process.stderr.write(`  line ${w.line}: ${w.note}\n`);
    if (!stats.verified) { failed = true; continue; }
    if (print) process.stdout.write(head + text);
    if (write && changed) writeFileSync(f, head + text, 'utf8');
  }
  if (failed) process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
