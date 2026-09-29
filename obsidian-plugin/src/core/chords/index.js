import { guitarChords } from './guitar.js';
import { ukuleleChords } from './ukulele.js';

// Enharmonic equivalents
const ENHARMONIC = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#',
  'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
  'C#': 'Db', 'D#': 'Eb', 'E#': 'F', 'F#': 'Gb',
  'G#': 'Ab', 'A#': 'Bb', 'B#': 'C',
};

function getDb(instrument) {
  return instrument === 'ukulele' ? ukuleleChords : guitarChords;
}

export function lookupChord(chordName, instrument = 'guitar', customChords = null) {
  // Song-level custom definitions take priority
  if (customChords && customChords.has(chordName)) return customChords.get(chordName);

  const db = getDb(instrument);
  if (db.has(chordName)) return db.get(chordName)[0];

  // Try enharmonic root: extract root note and suffix
  const rootMatch = chordName.match(/^([A-G][b#]?)(.*)/);
  if (rootMatch) {
    const alt = ENHARMONIC[rootMatch[1]];
    if (alt) {
      const altName = alt + rootMatch[2];
      if (db.has(altName)) return db.get(altName)[0];
    }
  }
  return null;
}

export function lookupChordAll(chordName, instrument = 'guitar') {
  const db = getDb(instrument);
  return db.get(chordName) || [];
}

export function stringCount(instrument) {
  return instrument === 'ukulele' ? 4 : 6;
}

export function stringNames(instrument) {
  return instrument === 'ukulele'
    ? ['G', 'C', 'E', 'A']
    : ['E', 'A', 'D', 'G', 'B', 'e'];
}
