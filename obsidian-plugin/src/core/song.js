export function createSong() {
  return {
    meta: {
      title: null, artist: null, key: null,
      capo: null, tempo: null, time: null, comment: null, raw: {}
    },
    sections: []
  };
}

export function createSection(type = 'default', label = null) {
  return { type, label, lines: [] };
}

export function extractChords(song) {
  const seen = new Set();
  const chords = [];
  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.type !== 'lyrics_line') continue;
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
