import { createSection } from './song.js';

// Section types that render as a highlighted part — the chorus tint, or the
// left-bar accent the others share with the bridge (see song.css/styles.css).
// A headed one covers only the stanza directly under its heading.
const BOXED_TYPES = new Set(['chorus', 'bridge', 'pre-chorus', 'post-chorus', 'intro', 'outro', 'interlude']);

const CHORD_RE = /\[([^\]]+)\]([^\[]*)/g;

// Parse a ChordPro-style define string into a chord definition object
// e.g. "B/A frets 4 3 2 0 fingers 3 2 1 0"
// 'x'/'X' is standard tab notation for "don't play this string" — map it
// to our internal muted-string convention (-1, same as the built-in
// guitar/ukulele DBs use) rather than letting it fall through to NaN.
function parseFret(token) {
  return /^x$/i.test(token) ? -1 : Number(token);
}

function parseDefineString(str) {
  const m = str.match(/^(\S+)\s+frets\s+([\dXx\s-]+?)(?:\s+fingers\s+([\d\s]+))?\s*$/);
  if (!m) return null;
  const name = m[1];
  const frets = m[2].trim().split(/\s+/).map(parseFret);
  const fingers = m[3] ? m[3].trim().split(/\s+/).map(Number) : frets.map(() => 0);

  // The diagram only draws a 4-fret window starting at baseFret. A custom
  // define up the neck (e.g. "frets 10 9 10 10") needs that window to
  // start near its lowest fretted note, or every dot lands outside the
  // visible grid and the diagram renders blank. Matches the convention
  // the built-in guitar/ukulele DBs already use for their own barre
  // shapes (baseFret = the lowest fretted position in that voicing).
  const fretted = frets.filter(f => f > 0);
  const baseFret = fretted.length ? Math.min(...fretted) : 1;

  return { name, frets, fingers, barre: null, baseFret };
}

// Minimal YAML frontmatter parser — handles key: value and key: + array items
function parseFrontmatter(text) {
  const meta = {};
  let arrayKey = null;

  for (const line of text.split('\n')) {
    // Array item (  - "value" or  - value)
    if (arrayKey !== null) {
      const item = line.match(/^\s+-\s+"?(.+?)"?\s*$/);
      if (item) { meta[arrayKey].push(item[1]); continue; }
      arrayKey = null;
    }

    const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!kv) continue;

    const key = kv[1].toLowerCase();
    const val = kv[2].trim().replace(/^['"]|['"]$/g, '');

    // [a, b] is an inline list, but [[file]] is an Obsidian link and stays text
    const flowArray = /^\[\[/.test(val) ? null : val.match(/^\[(.*)\]$/);
    if (flowArray) {
      meta[key] = flowArray[1] === '' ? [] : flowArray[1]
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(s => s !== '');
    } else if (val === '') {
      meta[key] = [];
      arrayKey = key;
    } else if (key === 'capo' || key === 'tempo') {
      meta[key] = parseInt(val, 10);
    } else {
      meta[key] = val;
    }
  }

  return meta;
}

function parseLyricsLine(rawText) {
  // Some songbooks (this vault's own included — 86/116 files at last count)
  // write chord brackets as \[C\] rather than [C], likely a leftover
  // convention from another ChordPro tool's Markdown export, or from
  // manually escaping brackets to dodge an editor's link-autocomplete.
  // Treat both as equivalent rather than requiring a vault-wide rewrite.
  const text = rawText.replace(/\\([[\]])/g, '$1');

  const segments = [];
  const firstBracket = text.indexOf('[');

  if (firstBracket === -1) return [{ chord: null, text }];

  if (firstBracket > 0) {
    segments.push({ chord: null, text: text.slice(0, firstBracket) });
  }

  CHORD_RE.lastIndex = firstBracket;
  let match;
  while ((match = CHORD_RE.exec(text)) !== null) {
    segments.push({ chord: match[1].trim(), text: match[2] });
  }

  return segments;
}

function inferSectionType(label) {
  const l = label.toLowerCase();
  // Pre-/post-chorus must be checked before plain "chorus", which they contain.
  if (/pre[\s-]*chorus/.test(l))  return 'pre-chorus';
  if (/post[\s-]*chorus/.test(l)) return 'post-chorus';
  if (l.includes('chorus'))   return 'chorus';
  if (l.includes('verse'))    return 'verse';
  if (l.includes('bridge'))   return 'bridge';
  if (l.includes('intro'))    return 'intro';
  if (l.includes('outro'))    return 'outro';
  if (l.includes('interlude'))return 'interlude';
  return 'default';
}

// A fenced block is only tablature if it looks like it. Some songs have their
// whole ChordPro source pasted inside a bare fence; its chord brackets and
// {directive} lines mean it is song content, so drop the fence markers and let
// it parse as normal lines. Real tab fences are left in place.
function dropNonTabFences(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```/.test(lines[i])) { out.push(lines[i]); continue; }
    let j = i + 1;
    while (j < lines.length && !/^\s*```/.test(lines[j])) j++;
    const inner = lines.slice(i + 1, j);
    const isSongContent = inner.some(l => /\[[A-G][^\]]*\]/.test(l) || /^\s*\{\w+/.test(l));
    if (isSongContent) {
      out.push(...inner);
    } else {
      out.push(lines[i], ...inner);
      if (j < lines.length) out.push(lines[j]);
    }
    i = j;
  }
  return out;
}

export function parse(source) {
  const song = {
    meta: {
      title: null, artist: null, key: null, capo: null,
      tempo: null, time: null, source: [], customChords: new Map(), raw: {},
    },
    sections: [],
  };

  let body = source.replace(/\r\n/g, '\n');

  // Extract YAML frontmatter
  const fmMatch = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fmMatch) {
    const fm = parseFrontmatter(fmMatch[1]);

    // Copy known scalar fields
    for (const key of ['title','artist','key','capo','tempo','time']) {
      if (fm[key] != null) song.meta[key] = fm[key];
    }

    // Where the chart came from: one address or a list of them (web links, or
    // any text such as an Obsidian link to a PDF). Always stored as a list.
    if (fm.source != null) {
      song.meta.source = (Array.isArray(fm.source) ? fm.source : [fm.source])
        .map(x => String(x).trim()).filter(Boolean);
    }

    // Parse chord definitions
    if (Array.isArray(fm.define)) {
      for (const str of fm.define) {
        const def = parseDefineString(str);
        if (def) song.meta.customChords.set(def.name, def);
      }
    }

    // Store anything else in raw
    for (const [k, v] of Object.entries(fm)) {
      if (!['title','artist','key','capo','tempo','time','source','define'].includes(k)) {
        song.meta.raw[k] = v;
      }
    }

    body = body.slice(fmMatch[0].length);
  }

  const lines = dropNonTabFences(body.split('\n'));
  let currentSection = createSection('default');

  function closeSection() {
    if (currentSection && (currentSection.lines.length > 0 || currentSection.type !== 'default')) {
      song.sections.push(currentSection);
    }
    currentSection = null;
  }

  function ensureSection() {
    if (!currentSection) currentSection = createSection('default');
  }

  // A fenced block (```) is tablature (or anything else that must keep its
  // exact spacing): kept verbatim as one tab_block line, never parsed for
  // chords, headings or quotes.
  let fence = null;

  for (const raw of lines) {
    if (fence) {
      if (/^\s*```/.test(raw)) {
        currentSection.lines.push({ type: 'tab_block', lines: fence });
        fence = null;
      } else {
        fence.push(raw.replace(/\s+$/, ''));
      }
      continue;
    }
    if (/^\s*```/.test(raw)) {
      ensureSection();
      fence = [];
      continue;
    }

    // Strip Obsidian embeds/wikilinks (![[file.png]] or [[file.pdf]]) before
    // anything else touches the line — otherwise their double brackets get
    // misread as chord brackets (e.g. [[dock.pdf]] parsing as a chord named
    // "[dock.pdf"). These are image/PDF embeds our renderer can't display
    // anyway, so dropping them entirely is the right outcome, not a
    // compromise.
    const line = raw.trimEnd().replace(/!?\[\[.*?\]\]/g, '');

    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      closeSection();
      const label = headingMatch[1].trim();
      currentSection = createSection(inferSectionType(label), label);
      continue;
    }

    if (line.trim() === '') {
      // Extra blank lines after a section that already ended at one.
      if (!currentSection) continue;
      // A headed chorus/bridge/intro/etc. — the types that render as a
      // highlighted part — covers only the stanza directly under its heading. The first
      // blank line after real content ends it, so an unheaded verse that
      // follows starts as a plain part instead of being boxed with the
      // chorus. That blank line is only the separator, so it is not kept
      // inside the box as trailing space. (Anything not boxed keeps all its
      // stanzas in one section.)
      if (BOXED_TYPES.has(currentSection.type) && currentSection.label
          && currentSection.lines.some(l => l.type === 'lyrics_line' || l.type === 'blockquote_line' || l.type === 'tab_block')) {
        closeSection();
        continue;
      }
      currentSection.lines.push({ type: 'blank_line' });
      continue;
    }

    // ChordPro's {column_break} directive — a manual break point in a
    // multi-column layout. Only this one directive is recognized; other
    // {...} directives (comment, start_of_chorus, etc.) aren't handled
    // and fall through to render as literal lyric text, same as before.
    //
    // It also closes whatever section is currently open, same as a bare
    // "---" divider does. In practice a column break always marks a real
    // structural boundary — end of this part, start of the next — so
    // without this, content after it kept inheriting the chorus/bridge
    // box styling of whatever came before, even though nothing marked
    // that section as over. This way it's never an extra thing to
    // remember: the break you're already placing for layout is the same
    // one that ends the highlight.
    if (line.trim() === '{column_break}') {
      closeSection();
      currentSection = createSection('default');
      currentSection.lines.push({ type: 'column_break' });
      continue;
    }

    // A bare "---" divider (already a standard Markdown horizontal rule,
    // so it reads naturally in the raw file too) starts a new unlabeled
    // section — for when a song just moves to its next part without
    // needing a "Verse 2" called out. Gets type 'default', same as
    // whatever's first in the file, so it renders with no box/highlight.
    if (/^---+$/.test(line)) {
      closeSection();
      currentSection = createSection('default');
      continue;
    }

    if (/^<!--/.test(line)) continue;

    ensureSection();

    // Blockquote line (> text). Markdown allows up to three spaces before the
    // ">" and no space after it, so " > Intro x 2" and ">[C]word" both count.
    if (/^ {0,3}>/.test(line)) {
      const content = line.replace(/^ {0,3}>[ ]?/, '');
      currentSection.lines.push({
        type: 'blockquote_line',
        segments: parseLyricsLine(content),
      });
      continue;
    }

    currentSection.lines.push({
      type: 'lyrics_line',
      segments: parseLyricsLine(line),
    });
  }

  if (fence && fence.length) {            // unclosed fence at end of file
    ensureSection();
    currentSection.lines.push({ type: 'tab_block', lines: fence });
  }
  if (currentSection) closeSection();

  return song;
}
