# Inlay — macOS / iOS app plan

Status: draft, 2026-09-22 (updated: Obsidian plugin track added)
Scope: two tracks reading the existing `.md` song format and presenting it as a playable chart.

- **Track 1 - Obsidian plugin.** Desktop + iOS + Android, inside the vault. Section 0.
- **Track 2 - Native app.** Mac + iPhone + iPad, dedicated stage surface. Sections 1-11.

**Sequencing: build the plugin first.** Days not weeks, reuses the parser almost untouched, validates the format and chord DB with real users on real iOS devices before an 8-week native bet. The native app's differentiator - a dedicated performance surface outside Obsidian's general UI - only matters once the plugin proves people want that escape hatch.

---

## 0. Obsidian plugin (Track 1)

### 0.1 Feasibility

Already proven by existing plugins - [Chord Sheets](https://community.obsidian.md/plugins/chord-sheets), [ChordPro Viewer](https://community.obsidian.md/plugins/chopro-viewer), [Markdown Chords](https://community.obsidian.md/plugins/markdown-chords) all render chord-over-lyric + diagrams in preview mode today. Difference from those: this plugin renders the *inline-bracket-in-plain-paragraph* format the CLI already parses, not a fenced ` ```chords ` code block. Closer in spirit to ChordPro Viewer (frontmatter-driven) than to Chord Sheets (fenced-block-driven).

### 0.2 Runs on iOS - with a constraint

Obsidian mobile installs community plugins from the same registry as desktop, same vault sync. The plugin API (`registerMarkdownPostProcessor`) is pure DOM manipulation and works identically on mobile.

**The catch: no Node/Electron APIs on mobile.** Obsidian mobile runs in a sandboxed webview, not Electron. No `fs`, no `child_process`, no `path`/`url`/`fileURLToPath`. Current parser and renderer assume Node stdlib throughout.

Porting work, concretely:
- `readFileSync` calls -> `this.app.vault.read(file)` (async, `Promise`-based - parser/renderer need to go async or take a pre-read string, which [parser.js](../src/parser.js) already does at its top level, good sign)
- The CSS-loading trick in [html.js](../src/renderers/html.js) (`__dirname` + `readFileSync(join(__dirname, 'song.css'))`, added this session) doesn't exist on mobile at all - inline the CSS as a bundled JS string constant instead, via esbuild (the standard Obsidian plugin build tool)
- Everything else - `parseFrontmatter`, `parseLyricsLine`, chord DB lookup, SVG string building - is plain JS with no I/O, ports untouched

**Footgun to avoid:** `manifest.json` has `isDesktopOnly`. Left `true` (a common scaffold default), the plugin never shows up in mobile's plugin browser. Must be `false`.

### 0.3 Architecture

Single TypeScript plugin, esbuild-bundled per the standard Obsidian plugin template.

| Module | Source | Change from CLI |
|---|---|---|
| `ChordProParser` | [src/parser.js](../src/parser.js) | copy near-verbatim, already synchronous-on-a-string |
| `ChordDB` | [src/chords/guitar.js](../src/chords/guitar.js), [src/chords/ukulele.js](../src/chords/ukulele.js) | copy verbatim |
| `render()` | [src/renderers/html.js](../src/renderers/html.js) | replace `readFileSync(song.css)` with a bundled string constant; output DOM nodes or an HTML fragment instead of a full `<html>` document |
| `main.ts` | new | `registerMarkdownPostProcessor` - detect a song note (frontmatter has `instrument:` or `key:`), replace the rendered body with the chord/lyric layout |
| settings | new | default instrument, diagram on/off, matches CLI's `--instrument` / `--no-diagrams` |

Full-document takeover (not a fenced block) means the post-processor needs to recognize "this whole note is a song" from frontmatter and replace Obsidian's normal paragraph rendering for the body, not just intercept one code fence. That's the one piece with no direct precedent in the existing renderer code - closest analog is ChordPro Viewer's approach, worth reading its source before writing this part.

### 0.4 Feature order

1. Detect song notes via frontmatter, render read-only chord-over-lyric in preview mode (no diagrams yet)
2. Chord diagrams (guitar + ukulele), ported SVG geometry
3. Settings pane - instrument choice, diagram toggle
4. Transpose command (in-memory only, doesn't touch the file)
5. Live source view still shows raw markdown untouched - editing stays plain-text, only preview mode is enhanced
6. Publish to the community plugin directory

### 0.5 Schedule

| Days | Work |
|---|---|
| 1 | Scaffold from the official Obsidian sample plugin, esbuild pipeline, confirm `isDesktopOnly: false` loads on an actual iOS device |
| 2 | Port parser + chord DB, verify against [examples/Beware_of_Darkness.md](../examples/Beware_of_Darkness.md) and [examples/wonderwall.md](../examples/wonderwall.md) |
| 3 | Post-processor + full-note takeover, diagrams rendering in preview mode |
| 4 | Settings pane, transpose command, dark-mode theming (inherit Obsidian's CSS variables rather than the CLI's fixed `#333`/`#fafafa` palette) |
| 5 | Test on real vault, real iOS device, submit to community plugin directory |

### 0.6 What it doesn't do

No dedicated stage mode, no autoscroll-while-hands-are-busy, no external display, no keep-awake, no setlist ordering UI - all live inside Obsidian's general-purpose shell. That gap is what Track 2 (sections 1-11 below) exists to fill, if the plugin shows people want it.

---

## 1. Premise (Track 2 - native app)

The CLI already parses the format and renders it ([src/parser.js](../src/parser.js), [src/renderers/html.js](../src/renderers/html.js)). The app is the same parse plus a screen you can read from six feet away while holding an instrument.

The thing that makes it not-another-songbook-app: **the folder of `.md` files is the library**. No import, no app-owned database, no account. Edit in Obsidian on the laptop, open on the iPad, same file.

---

## 2. Market

Checked 2026-09-22.

Existing iOS/iPadOS competitors:

| App | Model | Notes |
|---|---|---|
| OnSong 2026 | subscription | deepest features, MIDI, pedals, external display. Users angry about the subscription conversion; iOS 26 crash reports |
| SongbookPro | ~$7 one-time (Groups is subscription) | cheap, cross-platform, billing complaints |
| SongSheet Pro | free + lifetime unlock IAP | long-lived, loyal users, imports ChordPro/PDF/RTF |
| SongBook Chordpro | paid | original ChordPro app, transpose/autoscroll/MIDI |
| MySongbook | paid | widest instrument coverage (guitar, bass, uke, banjo, mandolin, cuatro) |

Obsidian-side plugins: Chord Sheets, ChordPro Viewer, Markdown Chords, Chord Lyrics. All render inside the vault on desktop. None is a stage app.

**Read:** the performance-app category is saturated and has a decade of feature moat. The gap is between the two groups - vault-native files on one side, stage-ready presentation on the other. Nobody bridges it.

Secondary opening: OnSong churn from the subscription move. One-time price is table stakes here.

Position: small tool, plain files, no account, one-time purchase. Do not compete on feature count.

Sources:
- https://onsongapp.com/pricing/
- https://songbook-pro.com/pricing/
- https://songsheetapp.com/en-US/
- https://apps.apple.com/us/app/songbook-chordpro/id392888837
- https://apps.apple.com/app/id504497717
- https://community.obsidian.md/plugins/chord-sheets
- https://community.obsidian.md/plugins/chopro-viewer
- https://community.obsidian.md/plugins/markdown-chords

---

## 3. Build path

Two options considered.

**A - Swift native.** Port the parser and chord DB to Swift, draw diagrams with SwiftUI `Canvas`, lay out chord-over-lyric natively. 3-4 weeks to usable. Full control of autoscroll, gestures, phone reflow.

**B - WebView wrapper.** Run the existing JS in JavaScriptCore, render the existing HTML into `WKWebView`. ~3 days to usable. Fights the webview for every native interaction.

**Decision: B as a week-one spike, A as the actual app.**

The spike proves folder access, security-scoped bookmarks, and on-device legibility without rewriting 900 lines. Then port module by module, renderer last, and delete the webview.

---

## 4. Architecture

One SwiftUI multiplatform target, macOS + iOS + iPadOS.

| Module | Ports from | Notes |
|---|---|---|
| `ChordProParser` | [src/parser.js](../src/parser.js) | frontmatter, `[Chord]` segments, `##` sections, `>` blockquotes, `define:` |
| `ChordDB` | [src/chords/guitar.js](../src/chords/guitar.js), [src/chords/ukulele.js](../src/chords/ukulele.js) | ship as a JSON resource, not code |
| `ChordDiagram` | [src/renderers/html.js](../src/renderers/html.js) SVG geometry | SwiftUI `Canvas`, 1:1 with the existing grid/dot/open-circle layout |
| `SongLayout` | new | the only genuinely new work - see 4.1 |
| `Library` | new | FileManager scan, security-scoped bookmark, `NSFilePresenter` live reload |
| `Index` | new | disposable cache, see 6 |

### 4.1 The layout problem

The HTML renderer emits inline `<span>` segments. Works at print width, breaks on a phone. The app needs measured-width line wrapping that keeps a chord glued to the syllable it sits on, and breaks between segments rather than through them.

Keep the distinction the HTML already makes between lyric lines, chord-only lines (`[B] [B/A] [G7]`), and lyrics-only lines - it drives three different layout rules.

---

## 5. Library browser

Three-pane on iPad and macOS: sidebar, list, chart. iPhone collapses to stack navigation.

**Sidebar:** folder tree (mirrors the vault), tag tree, smart lists, recently opened.

**List:** dense rows - title, artist, key, capo badge. Grid toggle.

**Group by:** artist / key / tag / folder / last opened.
**Sort by:** any frontmatter field (`key`, `tempo`, `time`, `instrument`, `capo`).

**Search, three kinds:**
1. title / artist - instant, index-backed
2. lyric full-text
3. **chord search** - "songs containing F#m and Bm". Falls out of the parse for free. Nobody else does this well.

---

## 6. Index cache

Scanning 500 `.md` files at every launch is too slow on an iPad.

SQLite (or plist) keyed by `path + mtime + size`, holding title, artist, key, tags, chord set, and a lyric blob for search.

Rule: **the vault is truth, the cache is disposable.** On any mismatch the file wins. Cache must be rebuildable from scratch at any time.

---

## 7. Tagging

Source of truth stays in the `.md`. Two syntaxes, both Obsidian-standard:

```md
---
tags: [gig, learning, uke/beginner]
---
```

and inline `#gig/2026` in the body.

- **Nested tags** (`uke/beginner`) render as a tree in the sidebar, same as Obsidian
- **Filter chips** with an AND/OR toggle
- **Write-back:** tagging from the app rewrites frontmatter in place. Atomic write, `NSFileCoordinator`, everything outside the touched key preserved byte-for-byte. This is the only place the app mutates a user file. Get it wrong once and Obsidian users never come back.
- **Virtual tags**, derived rather than stored: `key:E`, `instrument:ukulele`, `has:custom-chords`, `untagged`, `no-chords`. Verses 2 and 3 of [examples/Beware_of_Darkness.md](../examples/Beware_of_Darkness.md) are lyrics-only - a real state worth filtering on.
- **Smart lists** are saved tag queries, written as a `.md` file in the vault so Obsidian sees them too. No app-only store.

Setlists and tags do different jobs. A setlist is ordered and manual (a `.md` file of `[[wikilinks]]`). Tags are query-driven. Both live in the vault.

---

## 8. Feature order

1. Folder pick, song list, render one song (guitar + ukulele)
2. Live reload when Obsidian saves
3. Library browser + search (5)
4. Transpose + capo - in memory, never writes the file unless asked
5. Tag read, filter, tag tree
6. Tag write-back
7. Setlists as vault files
8. Autoscroll, stage mode (big text), dark mode, keep-screen-awake
9. Print / PDF - reuse the existing 2-column layout
10. Later: Bluetooth pedal, page-turn, external display

---

## 9. Known gotchas

- ~~**Inline flow arrays break the frontmatter parser.**~~ Fixed - [parseFrontmatter](../src/parser.js#L17) now handles `tags: [gig, learning, "uke/beginner"]` same as the block form.
- ~~**External CSS.**~~ Fixed - [html.js](../src/renderers/html.js) now inlines `song.css` into a `<style>` block at render time, no `<link>`, self-contained per [CLAUDE.md](../CLAUDE.md). Note for Track 1 (0.3): this fix uses `readFileSync`/`__dirname`, which doesn't exist on Obsidian mobile - the plugin needs its own bundled-string version of the same idea.
- **Duplicate section headings.** `Verse 2` appears twice in [examples/Beware_of_Darkness.md](../examples/Beware_of_Darkness.md). Section keys cannot be unique-by-name.
- **iCloud Drive.** Obsidian mobile keeps vaults in iCloud. Without file coordination the app reads stale or partially-downloaded files. Handle the not-yet-downloaded case explicitly.
- **Licensing.** Chord shapes and instrument data are fine. Bundled lyrics are not. User-supplied files only.

---

## 10. Rough schedule

Track 2 schedule below assumes Track 1 (section 0, ~5 days) ships first. If the plugin validates demand, this schedule starts; if it doesn't, it's shelved and the plugin is the whole product.

| Week | Work |
|---|---|
| 1 | WebView spike on a real iPad against a real vault |
| 2-3 | Parser + chord DB port, native list/detail, browser skeleton |
| 4-5 | Layout engine + `Canvas` diagrams |
| 6 | Transpose / capo / autoscroll, tag write-back |
| 7 | Setlists, print, index cache hardening |
| 8 | Ship - one-time purchase, no account, no subscription |

---

## 11. Open questions

- What does "the plugin validated demand" actually mean - install count, a specific feature request pattern, something else? Needs a threshold before Track 2 starts, not a vibe.
- Does the phone form factor earn its build cost, or is this iPad + Mac only for v1?
- Piano and bass diagrams, or stay with guitar and ukulele?
- Does the app ever write a song file, or is tag write-back the only mutation forever?
- If both tracks ship, do they share anything beyond the parser concept - e.g. does the native app's tag write-back format need to match whatever the plugin's transpose command does, so files stay portable between them?
