import { createSection } from './song.js';

const CHORD_RE = /\[([^\]]+)\]([^\[]*)/g;

// Parse a ChordPro-style define string into a chord definition object
// e.g. "B/A frets 4 3 2 0 fingers 3 2 1 0"
function parseDefineString(str) {
  const m = str.match(/^(\S+)\s+frets\s+([\d\s-]+?)(?:\s+fingers\s+([\d\s]+))?\s*$/);
  if (!m) return null;
  const name = m[1];
  const frets = m[2].trim().split(/\s+/).map(Number);
  const fingers = m[3] ? m[3].trim().split(/\s+/).map(Number) : frets.map(() => 0);
  return { name, frets, fingers, barre: null, baseFret: 1 };
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

    const flowArray = val.match(/^\[(.*)\]$/);
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

function parseLyricsLine(text) {
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
  if (l.includes('chorus'))   return 'chorus';
  if (l.includes('verse'))    return 'verse';
  if (l.includes('bridge'))   return 'bridge';
  if (l.includes('intro'))    return 'intro';
  if (l.includes('outro'))    return 'outro';
  if (l.includes('pre'))      return 'pre-chorus';
  if (l.includes('interlude'))return 'interlude';
  return 'default';
}

export function parse(source) {
  const song = {
    meta: {
      title: null, artist: null, key: null, capo: null,
      tempo: null, time: null, customChords: new Map(), raw: {},
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

    // Parse chord definitions
    if (Array.isArray(fm.define)) {
      for (const str of fm.define) {
        const def = parseDefineString(str);
        if (def) song.meta.customChords.set(def.name, def);
      }
    }

    // Store anything else in raw
    for (const [k, v] of Object.entries(fm)) {
      if (!['title','artist','key','capo','tempo','time','define'].includes(k)) {
        song.meta.raw[k] = v;
      }
    }

    body = body.slice(fmMatch[0].length);
  }

  const lines = body.split('\n');
  let currentSection = createSection('default');

  function closeSection() {
    if (currentSection.lines.length > 0 || currentSection.type !== 'default') {
      song.sections.push(currentSection);
    }
    currentSection = null;
  }

  function ensureSection() {
    if (!currentSection) currentSection = createSection('default');
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      closeSection();
      const label = headingMatch[1].trim();
      currentSection = createSection(inferSectionType(label), label);
      continue;
    }

    if (line.trim() === '') {
      ensureSection();
      currentSection.lines.push({ type: 'blank_line' });
      continue;
    }

    if (/^---+$/.test(line) || /^<!--/.test(line)) continue;

    ensureSection();

    // Blockquote line (> text)
    if (line.startsWith('> ') || line === '>') {
      const content = line.startsWith('> ') ? line.slice(2) : '';
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

  if (currentSection) closeSection();

  return song;
}
