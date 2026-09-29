// Ported from ../../src/renderers/html.js, restructured to build real DOM
// nodes (createElement / createElementNS) instead of concatenating an HTML
// string. Two reasons: Obsidian plugin review flags innerHTML on
// user-controlled content, and there's no <html>/<head>/<style> document to
// wrap here — this renders a fragment into an existing pane element.
//
// Geometry constants and layout math are unchanged from html.js — this is a
// faithful port, not a redesign. If the CLI's diagram layout changes, this
// file needs the matching change.

// @ts-ignore — plain JS core modules, copied verbatim from src/, no I/O
import { lookupChord, stringCount, stringNames } from './core/chords/index.js';
// @ts-ignore
import { extractChords } from './core/song.js';

export interface RenderOptions {
  instrument?: 'guitar' | 'ukulele';
  diagrams?: boolean;
}

const FRETS_SHOWN = 4;
const SVG_STRING_GAP = 18;
const SVG_FRET_GAP = 20;
const SVG_MARGIN = 20;
const SVG_NUT_HEIGHT = 6;
const SVG_DOT_R = 7;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends string>(tag: K, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function chordDiagram(chordName: string, instrument: string, customChords: Map<string, any> | null): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chord-diagram';

  const name = document.createElement('div');
  name.className = 'chord-name';
  name.textContent = chordName;
  wrap.appendChild(name);

  // customChords is typed `Map | null` here but TS infers lookupChord's
  // param type as just `null` from its JS default value — cast past that.
  const def = lookupChord(chordName, instrument, customChords as any);
  const nStrings = stringCount(instrument);
  const strNames: string[] = stringNames(instrument);

  if (!def) {
    const unknown = document.createElement('div');
    unknown.className = 'chord-unknown';
    unknown.textContent = '?';
    wrap.appendChild(unknown);
    return wrap;
  }

  const svgW = SVG_MARGIN * 2 + (nStrings - 1) * SVG_STRING_GAP;
  const svgH = SVG_MARGIN + SVG_NUT_HEIGHT + FRETS_SHOWN * SVG_FRET_GAP + SVG_MARGIN + 16;
  const x = (s: number) => SVG_MARGIN + s * SVG_STRING_GAP;
  const y = (f: number) => SVG_MARGIN + SVG_NUT_HEIGHT + f * SVG_FRET_GAP;

  const svg = svgEl('svg', { width: svgW, height: svgH, viewBox: `0 0 ${svgW} ${svgH}` });

  // Fret lines
  for (let f = 0; f <= FRETS_SHOWN; f++) {
    const strokeW = f === 0 && def.baseFret === 1 ? SVG_NUT_HEIGHT : 1;
    svg.appendChild(svgEl('line', {
      x1: x(0), y1: y(f), x2: x(nStrings - 1), y2: y(f),
      stroke: '#333', 'stroke-width': strokeW,
    }));
  }

  // String lines
  for (let s = 0; s < nStrings; s++) {
    svg.appendChild(svgEl('line', {
      x1: x(s), y1: y(0), x2: x(s), y2: y(FRETS_SHOWN),
      stroke: '#333', 'stroke-width': 1.5,
    }));
  }

  // Barre
  if (def.barre) {
    const barreY = y(def.barre.fret - def.baseFret + 1) - SVG_FRET_GAP / 2;
    svg.appendChild(svgEl('rect', {
      x: x(def.barre.from), y: barreY - SVG_DOT_R,
      width: (def.barre.to - def.barre.from) * SVG_STRING_GAP, height: SVG_DOT_R * 2,
      rx: SVG_DOT_R, fill: '#333',
    }));
  }

  // Finger dots
  for (let s = 0; s < nStrings; s++) {
    const fret = def.frets[s];
    if (fret <= 0) continue;
    if (def.barre && fret === def.barre.fret && s >= def.barre.from && s <= def.barre.to) continue;
    svg.appendChild(svgEl('circle', {
      cx: x(s), cy: y(fret - def.baseFret + 1) - SVG_FRET_GAP / 2, r: SVG_DOT_R, fill: '#333',
    }));
  }

  // Open/muted above nut
  for (let s = 0; s < nStrings; s++) {
    const fret = def.frets[s];
    const cx = x(s);
    const topY = SVG_MARGIN - 4;
    if (fret === -1) {
      const t = svgEl('text', {
        x: cx, y: topY, 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'monospace', fill: '#333',
      });
      t.textContent = 'x';
      svg.appendChild(t);
    } else if (fret === 0) {
      svg.appendChild(svgEl('circle', {
        cx, cy: topY - 4, r: 4, fill: 'none', stroke: '#333', 'stroke-width': 1.5,
      }));
    }
  }

  // baseFret label
  if (def.baseFret > 1) {
    const t = svgEl('text', {
      x: x(nStrings - 1) + 6, y: y(0) + 4, 'font-size': 11, 'font-family': 'monospace', fill: '#555',
    });
    t.textContent = `${def.baseFret}fr`;
    svg.appendChild(t);
  }

  // String names at bottom
  for (let s = 0; s < nStrings; s++) {
    const t = svgEl('text', {
      x: x(s), y: y(FRETS_SHOWN) + 14, 'text-anchor': 'middle', 'font-size': 10, 'font-family': 'monospace', fill: '#555',
    });
    t.textContent = strNames[s];
    svg.appendChild(t);
  }

  wrap.appendChild(svg);
  return wrap;
}

function renderMeta(meta: any): HTMLElement {
  const header = document.createElement('header');
  header.className = 'song-meta';

  if (meta.title) {
    const h1 = document.createElement('h1');
    h1.className = 'song-title';
    h1.textContent = meta.title;
    header.appendChild(h1);
  }
  if (meta.artist) {
    const p = document.createElement('p');
    p.className = 'song-artist';
    p.textContent = meta.artist;
    header.appendChild(p);
  }

  const details: string[] = [];
  if (meta.key) details.push(`Key: ${meta.key}`);
  if (meta.capo) details.push(`Capo: fret ${meta.capo}`);
  if (meta.tempo) details.push(`Tempo: ${meta.tempo} BPM`);
  if (meta.time) details.push(`Time: ${meta.time}`);

  if (details.length) {
    const ul = document.createElement('ul');
    ul.className = 'song-directives';
    for (const d of details) {
      const li = document.createElement('li');
      li.textContent = d;
      ul.appendChild(li);
    }
    header.appendChild(ul);
  }

  return header;
}

function renderLyricsLine(line: any): HTMLElement {
  if (line.type === 'blank_line') {
    const div = document.createElement('div');
    div.className = 'song-blank';
    return div;
  }
  if (line.type === 'comment_line') {
    const div = document.createElement('div');
    div.className = 'song-comment';
    div.textContent = line.text;
    return div;
  }

  const hasChords = line.segments.some((seg: any) => seg.chord);
  const div = document.createElement('div');
  div.className = hasChords ? 'song-line' : 'song-line song-line--lyrics-only';

  for (const seg of line.segments) {
    const segEl = document.createElement('span');
    segEl.className = 'segment';

    if (hasChords) {
      const chordEl = document.createElement('span');
      chordEl.className = seg.chord ? 'chord' : 'chord chord--empty';
      if (seg.chord) chordEl.textContent = seg.chord;
      segEl.appendChild(chordEl);
    }

    const textEl = document.createElement('span');
    if (seg.text) {
      textEl.className = 'lyric';
      textEl.textContent = seg.text;
    } else {
      textEl.className = 'lyric lyric--empty';
      textEl.textContent = ' ';
    }
    segEl.appendChild(textEl);

    div.appendChild(segEl);
  }

  return div;
}

// Group consecutive blockquote_lines together; everything else is a solo item
function groupLines(lines: any[]): { isBlockquote: boolean; lines: any[] }[] {
  const groups: { isBlockquote: boolean; lines: any[] }[] = [];
  for (const line of lines) {
    if (line.type === 'blockquote_line') {
      const last = groups[groups.length - 1];
      if (last && last.isBlockquote) last.lines.push(line);
      else groups.push({ isBlockquote: true, lines: [line] });
    } else {
      groups.push({ isBlockquote: false, lines: [line] });
    }
  }
  return groups;
}

function isSectionRef(group: { lines: any[] }, sectionLabels: Set<string>): boolean {
  if (group.lines.length !== 1) return false;
  const { segments } = group.lines[0];
  if (segments.length !== 1 || segments[0].chord) return false;
  return sectionLabels.has(segments[0].text.trim());
}

const SECTION_LABELS: Record<string, string> = {
  chorus: 'Chorus', verse: 'Verse', bridge: 'Bridge', tab: 'Tab', grid: 'Grid',
};

function renderSection(section: any, sectionLabels: Set<string>): HTMLElement {
  const label = section.label || (section.type !== 'default' ? SECTION_LABELS[section.type] || section.type : '');

  const sectionEl = document.createElement('section');
  sectionEl.className = `song-section song-section--${section.type}`;

  if (label) {
    const h2 = document.createElement('h2');
    h2.className = 'section-label';
    h2.textContent = label;
    sectionEl.appendChild(h2);
  }

  for (const group of groupLines(section.lines)) {
    if (!group.isBlockquote) {
      sectionEl.appendChild(renderLyricsLine(group.lines[0]));
    } else if (isSectionRef(group, sectionLabels)) {
      const refName = group.lines[0].segments[0].text.trim();
      const ref = document.createElement('div');
      ref.className = 'section-ref';
      ref.textContent = `↻ ${refName}`;
      sectionEl.appendChild(ref);
    } else {
      const bq = document.createElement('blockquote');
      bq.className = 'song-blockquote';
      for (const l of group.lines) bq.appendChild(renderLyricsLine(l));
      sectionEl.appendChild(bq);
    }
  }

  return sectionEl;
}

/**
 * Render a parsed song (from core/parser.js `parse()`) into a detached
 * container element. Caller appends it into the pane.
 */
export function renderSong(song: any, options: RenderOptions = {}): HTMLElement {
  const instrument = options.instrument || 'guitar';
  const showDiagrams = options.diagrams !== false;

  const root = document.createElement('article');
  root.className = 'inlay-song';

  root.appendChild(renderMeta(song.meta));

  const customChords = song.meta.customChords || null;

  if (showDiagrams) {
    const chords: string[] = extractChords(song);
    if (chords.length > 0) {
      const diagrams = document.createElement('div');
      diagrams.className = 'chord-diagrams';
      for (const c of chords) diagrams.appendChild(chordDiagram(c, instrument, customChords));
      root.appendChild(diagrams);
    }
  }

  const sectionLabels = new Set<string>(song.sections.map((s: any) => s.label).filter(Boolean));

  const body = document.createElement('div');
  body.className = 'song-body';
  for (const s of song.sections) body.appendChild(renderSection(s, sectionLabels));
  root.appendChild(body);

  return root;
}
