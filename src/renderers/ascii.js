import { lookupChord, stringCount, stringNames } from '../chords/index.js';
import { extractChords, isMidWordBreak, isChordsOnlyLine } from '../song.js';

const FRETS_SHOWN = 4;

function chordDiagram(chordName, instrument, customChords) {
  const def = lookupChord(chordName, instrument, customChords);
  const nStrings = stringCount(instrument);
  const names = stringNames(instrument);

  if (!def) {
    return [`${chordName}`, '(unknown)', ''];
  }

  const lines = [];
  lines.push(chordName);

  // Open/muted indicators above nut
  const topRow = def.frets.map(f => {
    if (f === -1) return 'x';
    if (f === 0) return 'o';
    return ' ';
  }).join(' ');
  lines.push(' ' + topRow);

  // Fret position label
  const fretLabel = def.baseFret > 1 ? `${def.baseFret}fr` : ' ';

  // Nut or top bar
  const nutChar = def.baseFret === 1 ? '=' : '-';
  lines.push(fretLabel.padStart(3) + ' ' + Array(nStrings).fill('-').join('+') + '-');

  // Fret rows
  for (let fret = def.baseFret; fret < def.baseFret + FRETS_SHOWN; fret++) {
    let row = '    |';
    for (let s = 0; s < nStrings; s++) {
      const fingerFret = def.frets[s];
      let dot = '-';
      if (fingerFret === fret) dot = 'O';
      // Barre
      if (def.barre && fret === def.barre.fret && s >= def.barre.from && s <= def.barre.to) {
        dot = 'B';
      }
      row += dot + '|';
    }
    lines.push(row);
  }

  // String names at bottom
  lines.push('    ' + names.map(n => n.padEnd(1)).join(' '));

  return lines;
}

function renderDiagrams(chords, instrument, customChords) {
  if (chords.length === 0) return '';
  const diagrams = chords.map(c => chordDiagram(c, instrument, customChords));
  const maxHeight = Math.max(...diagrams.map(d => d.length));

  // Pad all diagrams to same height
  diagrams.forEach(d => {
    while (d.length < maxHeight) d.push('');
  });

  const colWidth = 14;
  const out = [];
  for (let row = 0; row < maxHeight; row++) {
    out.push(diagrams.map(d => (d[row] || '').padEnd(colWidth)).join('  '));
  }
  return out.join('\n');
}

function renderMeta(meta) {
  const lines = [];
  if (meta.title) {
    const bar = '='.repeat(meta.title.length + 4);
    lines.push(bar);
    lines.push('  ' + meta.title);
    lines.push(bar);
  }
  if (meta.artist) lines.push('Artist: ' + meta.artist);
  if (meta.key)    lines.push('Key: ' + meta.key);
  if (meta.capo)   lines.push('Capo: fret ' + meta.capo);
  if (meta.tempo)  lines.push('Tempo: ' + meta.tempo + ' BPM');
  if (meta.time)   lines.push('Time: ' + meta.time);
  if (meta.source && meta.source.length) lines.push('Source: ' + meta.source.join(', '));
  return lines.join('\n');
}

function renderLyricsContent(line) {
  const segs = line.segments;
  if (isChordsOnlyLine(line)) {
    return segs.filter(seg => seg.chord).map(seg => seg.chord).join('  ');
  }
  let chordRow = '';
  let lyricRow = '';
  segs.forEach((seg, i) => {
    const isLast = i === segs.length - 1;
    const tight = !isLast && isMidWordBreak(seg, segs[i + 1]);
    const chord = seg.chord || '';
    const text  = seg.text;
    // Width is always chord/text + a 1-char margin, same as before this
    // feature existed — that margin is what keeps adjacent chord NAMES
    // from colliding when one is longer than its lyric fragment (e.g.
    // "B/A" over a single trailing space). A tight join just changes what
    // fills that reserved margin — a hyphen instead of a space — rather
    // than changing how much space is reserved.
    const width = Math.max(chord.length, text.length) + (isLast ? 0 : 1);
    chordRow += chord.padEnd(width);
    lyricRow += (tight ? text + '-' : text).padEnd(width);
  });
  chordRow = chordRow.trimEnd();
  lyricRow = lyricRow.trimEnd();
  if (chordRow.trim() === '') return lyricRow;
  return chordRow + '\n' + lyricRow;
}

function renderLine(line) {
  if (line.type === 'blank_line') return '';
  if (line.type === 'tab_block') return line.lines.join('\n');
  if (line.type === 'column_break') return ''; // no column concept on stdout
  if (line.type === 'comment_line') return '# ' + line.text;
  if (line.type === 'blockquote_line') {
    return renderLyricsContent(line).split('\n').map(l => '| ' + l).join('\n');
  }

  return renderLyricsContent(line);
}

const SECTION_LABELS = {
  chorus: 'Chorus', verse: 'Verse', bridge: 'Bridge',
  tab: 'Tab', grid: 'Grid', default: '',
};

function renderSection(section) {
  const label = section.label
    || (section.type !== 'default' ? SECTION_LABELS[section.type] || section.type : '');

  const out = [];
  if (label) out.push(`[${label}]`);
  for (const line of section.lines) {
    out.push(renderLine(line));
  }
  return out.join('\n');
}

export function render(song, options = {}) {
  const instrument = options.instrument || 'guitar';
  const showDiagrams = options.diagrams !== false;

  const parts = [];

  const meta = renderMeta(song.meta);
  if (meta) parts.push(meta);

  const customChords = song.meta.customChords || null;

  if (showDiagrams) {
    const chords = extractChords(song);
    if (chords.length > 0) {
      parts.push('\nChords used:');
      parts.push(renderDiagrams(chords, instrument, customChords));
    }
  }

  for (const section of song.sections) {
    parts.push(renderSection(section));
  }

  return parts.join('\n\n') + '\n';
}
