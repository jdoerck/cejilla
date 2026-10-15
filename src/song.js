export function createSong() {
  return {
    meta: {
      title: null, artist: null, key: null,
      capo: null, tempo: null, time: null, source: [], comment: null, raw: {}
    },
    sections: []
  };
}

export function createSection(type = 'default', label = null) {
  return { type, label, lines: [] };
}

// True when a chord bracket splits a single word rather than sitting at a
// word boundary — e.g. "tom[Gbm]orrow" (segments "tom" and "orrow", no
// space on either side) vs "word [C]word" (segment before the chord ends
// in a space, so it's a real boundary). Renderers use this to insert a
// hyphen instead of their usual between-segment gap, so a split word
// reads as "tom-orrow" rather than "tom orrow".
export function isMidWordBreak(segA, segB) {
  if (!segA || !segB) return false;
  const a = segA.text || '';
  const b = segB.text || '';
  if (a === '' || b === '') return false;
  return !/\s$/.test(a) && !/^\s/.test(b);
}

// A line that is only chords — every segment's text is empty or just the
// spacing between brackets (e.g. "[E] [D] [A]"). Renderers draw these as a
// single tight row of chords instead of a chord row over an empty lyric row.
export function isChordsOnlyLine(line) {
  const segs = line.segments || [];
  return segs.some(seg => seg.chord) && segs.every(seg => !(seg.text || '').trim());
}

// A lone blockquote line with no chords is a repeat reminder — "play the
// chorus again", "instrumental verse", "repeat 1st verse" — a visual cue to
// reuse something earlier in the tab rather than lyrics to sing. It does not
// need to match a heading. A leading "Repeat" is dropped from the display
// name since the repeat marker already says it. Returns null for anything
// else (several lines, or a line carrying chords), which stays a normal box.
export function repeatRefName(lines) {
  if (lines.length !== 1) return null;
  const { segments } = lines[0];
  if (segments.length !== 1 || segments[0].chord) return null;
  const name = segments[0].text.trim().replace(/^repeat\s+/i, '');
  return name || null;
}

// Turn the `source` list into display items: web addresses become links
// labelled with their site name ("tabs.ultimate-guitar.com"), anything else is
// shown as plain text. Two links to the same site are numbered so they can be
// told apart: "ultimate-guitar.com (1)", "ultimate-guitar.com (2)".
export function sourceLabels(sources) {
  const list = (Array.isArray(sources) ? sources : sources ? [sources] : [])
    .map(x => String(x).trim()).filter(Boolean);
  const items = list.map(s => {
    if (!/^https?:\/\//i.test(s)) return { url: null, base: s };
    let host = s;
    try { host = new URL(s).hostname.replace(/^www\./, ''); } catch { /* keep the raw text */ }
    return { url: s, base: host };
  });
  const total = {}, seen = {};
  items.forEach(i => { total[i.base] = (total[i.base] || 0) + 1; });
  return items.map(i => {
    seen[i.base] = (seen[i.base] || 0) + 1;
    return { url: i.url, text: total[i.base] > 1 ? `${i.base} (${seen[i.base]})` : i.base };
  });
}

export function extractChords(song) {
  const seen = new Set();
  const chords = [];
  for (const section of song.sections) {
    for (const line of section.lines) {
      // blockquote_line carries chords the same way lyrics_line does (a
      // highlighted chorus is still a chorus) — only blank_line and
      // comment_line have no .segments to read.
      if (line.type !== 'lyrics_line' && line.type !== 'blockquote_line') continue;
      for (const seg of line.segments) {
        if (seg.chord && !seen.has(seg.chord)) {
          seen.add(seg.chord);
          chords.push(seg.chord);
        }
      }
    }
  }
  return chords;
}
