import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { lookupChord, stringCount, stringNames } from '../chords/index.js';
import { extractChords, isMidWordBreak, isChordsOnlyLine, repeatRefName, sourceLabels } from '../song.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(__dirname, 'song.css'), 'utf8');

const FRETS_SHOWN = 4;
const SVG_STRING_GAP = 18;
const SVG_FRET_GAP = 20;
const SVG_MARGIN = 20;
const SVG_NUT_HEIGHT = 6;
const SVG_DOT_R = 7;

function svgDiagram(chordName, instrument, customChords) {
  const def = lookupChord(chordName, instrument, customChords);
  const nStrings = stringCount(instrument);
  const strNames = stringNames(instrument);

  // Extra right-side room for the "Nfr" position label — without this the
  // label starts past the SVG's own declared width and gets silently
  // clipped by the browser's default overflow:hidden on <svg> (it was
  // showing as "3f" instead of "3fr").
  const FRET_LABEL_SPACE = 20;
  const svgW = SVG_MARGIN * 2 + (nStrings - 1) * SVG_STRING_GAP + FRET_LABEL_SPACE;
  const svgH = SVG_MARGIN + SVG_NUT_HEIGHT + FRETS_SHOWN * SVG_FRET_GAP + SVG_MARGIN + 16;

  if (!def) {
    return `<div class="chord-diagram"><div class="chord-name">${esc(chordName)}</div><div class="chord-unknown">?</div></div>`;
  }

  const x = (s) => SVG_MARGIN + s * SVG_STRING_GAP;
  const y = (f) => SVG_MARGIN + SVG_NUT_HEIGHT + f * SVG_FRET_GAP;

  let svg = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">`;

  // Fret lines
  for (let f = 0; f <= FRETS_SHOWN; f++) {
    const ly = y(f);
    const strokeW = (f === 0 && def.baseFret === 1) ? SVG_NUT_HEIGHT : 1;
    svg += `<line x1="${x(0)}" y1="${ly}" x2="${x(nStrings-1)}" y2="${ly}" stroke="#333" stroke-width="${strokeW}"/>`;
  }

  // String lines
  for (let s = 0; s < nStrings; s++) {
    svg += `<line x1="${x(s)}" y1="${y(0)}" x2="${x(s)}" y2="${y(FRETS_SHOWN)}" stroke="#333" stroke-width="1.5"/>`;
  }

  // Barre
  if (def.barre) {
    const barreY = y(def.barre.fret - def.baseFret + 1) - SVG_FRET_GAP / 2;
    svg += `<rect x="${x(def.barre.from)}" y="${barreY - SVG_DOT_R}" width="${(def.barre.to - def.barre.from) * SVG_STRING_GAP}" height="${SVG_DOT_R * 2}" rx="${SVG_DOT_R}" fill="#333"/>`;
  }

  // Finger dots
  for (let s = 0; s < nStrings; s++) {
    const fret = def.frets[s];
    if (fret <= 0) continue;
    const cx = x(s);
    const cy = y(fret - def.baseFret + 1) - SVG_FRET_GAP / 2;
    if (def.barre && fret === def.barre.fret && s >= def.barre.from && s <= def.barre.to) continue;
    svg += `<circle cx="${cx}" cy="${cy}" r="${SVG_DOT_R}" fill="#333"/>`;
  }

  // Open/muted above nut
  for (let s = 0; s < nStrings; s++) {
    const fret = def.frets[s];
    const cx = x(s);
    const topY = SVG_MARGIN - 4;
    if (fret === -1) {
      svg += `<text x="${cx}" y="${topY}" text-anchor="middle" font-size="12" font-family="monospace" fill="#333">x</text>`;
    } else if (fret === 0) {
      svg += `<circle cx="${cx}" cy="${topY - 4}" r="4" fill="none" stroke="#333" stroke-width="1.5"/>`;
    }
  }

  // baseFret label
  if (def.baseFret > 1) {
    svg += `<text x="${x(nStrings-1) + 6}" y="${y(0) + 4}" font-size="14" font-family="monospace" fill="#555">${def.baseFret}fr</text>`;
  }

  // String names at bottom
  for (let s = 0; s < nStrings; s++) {
    svg += `<text x="${x(s)}" y="${y(FRETS_SHOWN) + 14}" text-anchor="middle" font-size="10" font-family="monospace" fill="#555">${strNames[s]}</text>`;
  }

  svg += '</svg>';

  return `<div class="chord-diagram">
  <div class="chord-name">${esc(chordName)}</div>
  ${svg}
</div>`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMeta(meta) {
  let html = '<header class="song-meta">';
  if (meta.title)  html += `<h1 class="song-title">${esc(meta.title)}</h1>`;
  if (meta.artist) html += `<p class="song-artist">${esc(meta.artist)}</p>`;
  const details = [];
  if (meta.key)   details.push(`Key: ${esc(meta.key)}`);
  if (meta.capo)  details.push(`Capo: fret ${meta.capo}`);
  if (meta.tempo) details.push(`Tempo: ${meta.tempo} BPM`);
  if (meta.time)  details.push(`Time: ${esc(meta.time)}`);
  const links = sourceLabels(meta.source).map(l => l.url
    ? `<a class="song-source" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.text)}</a>`
    : esc(l.text));
  if (links.length) details.push(`Source: ${links.join(', ')}`);
  if (details.length) {
    html += '<ul class="song-directives">' + details.map(d => `<li>${d}</li>`).join('') + '</ul>';
  }
  html += '</header>';
  return html;
}

function renderLyricsLine(line) {
  if (line.type === 'tab_block')    return `<pre class="song-tab">${esc(line.lines.join('\n'))}</pre>`;
  if (line.type === 'blank_line')   return '<div class="song-blank"></div>';
  if (line.type === 'column_break') return '<div class="column-break"></div>';
  if (line.type === 'comment_line') return `<div class="song-comment">${esc(line.text)}</div>`;

  const hasChords = line.segments.some(seg => seg.chord);

  if (isChordsOnlyLine(line)) {
    const chords = line.segments.filter(seg => seg.chord)
      .map(seg => `<span class="chord">${esc(seg.chord)}</span>`).join('');
    return `<div class="song-line song-line--chords-only">${chords}</div>`;
  }

  const segs = line.segments.map((seg, i) => {
    const tight = isMidWordBreak(seg, line.segments[i + 1]);
    const chord = hasChords
      ? (seg.chord
          ? `<span class="chord">${esc(seg.chord)}</span>`
          : `<span class="chord chord--empty"></span>`)
      : '';
    const displayText = tight ? seg.text + '-' : seg.text;
    const text = displayText
      ? `<span class="lyric">${esc(displayText)}</span>`
      : `<span class="lyric lyric--empty"> </span>`;
    return `<span class="segment${tight ? ' segment--tight' : ''}">${chord}${text}</span>`;
  });

  return `<div class="song-line${hasChords ? '' : ' song-line--lyrics-only'}">${segs.join('')}</div>`;
}

// Group consecutive blockquote_lines together; everything else is a solo item
function groupLines(lines) {
  const groups = [];
  for (const line of lines) {
    if (line.type === 'blockquote_line') {
      if (groups.length && groups[groups.length - 1].isBlockquote) {
        groups[groups.length - 1].lines.push(line);
      } else {
        groups.push({ isBlockquote: true, lines: [line] });
      }
    } else {
      groups.push({ isBlockquote: false, lines: [line] });
    }
  }
  return groups;
}

const SECTION_LABELS = {
  chorus: 'Chorus', verse: 'Verse', bridge: 'Bridge',
  tab: 'Tab', grid: 'Grid',
};

function renderSection(section) {
  const label = section.label
    || (section.type !== 'default' ? SECTION_LABELS[section.type] || section.type : '');

  // A section that opens with a {column_break} gets no divider rule — the
  // column change already separates it, and the rule would otherwise draw
  // at the bottom of the previous column with nothing under it.
  const startsColumn = section.lines[0]?.type === 'column_break';
  let html = `<section class="song-section song-section--${esc(section.type)}${startsColumn ? ' song-section--column-start' : ''}">`;
  if (label) html += `<h2 class="section-label">${esc(label)}</h2>`;

  for (const group of groupLines(section.lines)) {
    if (!group.isBlockquote) {
      html += renderLyricsLine(group.lines[0]);
    } else if (repeatRefName(group.lines)) {
      html += `<div class="section-ref">↻ ${esc(repeatRefName(group.lines))}</div>`;
    } else {
      html += '<blockquote class="song-blockquote">';
      html += group.lines.map(renderLyricsLine).join('');
      html += '</blockquote>';
    }
  }

  html += '</section>';
  return html;
}


export function render(song, options = {}) {
  const instrument = options.instrument || 'guitar';
  const showDiagrams = options.diagrams !== false;

  let body = renderMeta(song.meta);

  const customChords = song.meta.customChords || null;

  if (showDiagrams) {
    const chords = extractChords(song);
    if (chords.length > 0) {
      body += '<div class="chord-diagrams">';
      body += chords.map(c => svgDiagram(c, instrument, customChords)).join('\n');
      body += '</div>';
    }
  }

  body += '<div class="song-body">';
  body += song.sections.map(s => renderSection(s)).join('\n');
  body += '</div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(song.meta.title || 'ChordPro Song')}</title>
<style>
${CSS}
</style>
</head>
<body>
<article class="song">
${body}
</article>
</body>
</html>
`;
}
