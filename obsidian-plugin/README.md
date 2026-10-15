# Cejilla — Obsidian plugin

Scaffold. Untested on-device. See [docs/app-plan.md](../docs/app-plan.md) section 0
for the plan this implements, including what's still unverified.

## What this is

Renders a note whose frontmatter has `key:` or `instrument:` — the same
`.md` format the CLI in `../src` parses — as a chord-over-lyric chart with
guitar/ukulele diagrams, inline in reading view / live preview. Same file
format, same parser logic, no import step: point Obsidian at the same
folder the CLI already reads.

## Layout

```
obsidian-plugin/
  manifest.json       plugin id/version/isDesktopOnly (must stay false)
  package.json        devDependencies, not installed yet — see below
  tsconfig.json
  esbuild.config.mjs
  styles.css           auto-loaded by Obsidian, theme-aware (dark mode safe)
  main.ts              Plugin class, settings tab, post-processor
  src/
    render.ts           parsed song -> DOM (ported from ../src/renderers/html.js,
                         rebuilt with createElement/createElementNS instead of
                         string concatenation — see file header comment for why)
```

The parser, song helpers and chord tables are not copied here: `main.ts` and
`src/render.ts` import them straight from `../src` (pure JS, no Node I/O), and
esbuild bundles them into `main.js`. One source of truth, so a parser fix lands
in the CLI and the plugin together. If the plugin ever moves to its own repo
(the community-plugin registry wants a standalone one), that import becomes a
vendored copy or a shared package again — see
[docs/app-plan.md](../docs/app-plan.md).

## Build

Not run yet in this session — no network fetch of devDependencies happened.

```bash
cd obsidian-plugin
npm install
npm run dev     # esbuild watch mode, emits main.js
```

To test in a real vault: create a symlink (or copy `manifest.json`,
`main.js`, `styles.css` after a build) into
`<vault>/.obsidian/plugins/inlay-chords/`, then enable it under
Settings → Community plugins.

```bash
ln -s "$(pwd)" "/path/to/your/vault/.obsidian/plugins/inlay-chords"
```

## What's unverified (do this before trusting it)

1. **The full-note takeover in [main.ts](main.ts) `processSongNote`.**
   Obsidian calls the post-processor once per rendered section, not once per
   note — see the `NOTE` comment above that function for the approach taken
   and why it needs on-device confirmation, in both reading view and live
   preview, before it's solid.
2. **iOS.** `isDesktopOnly: false` is set, and there's no Node/Electron API
   anywhere in this plugin's own code (`core/*.js` were already pure JS
   before this scaffold — no `fs`, no `path`) — but it has never actually
   been loaded on a phone or iPad yet.
3. **Dark mode / theme colors** on the chord diagram SVG — `styles.css`
   overrides `stroke`/`fill` by attribute-selector, which is fragile if the
   SVG geometry in [src/render.ts](src/render.ts) ever changes which
   elements carry `fill="#333"` literally.

## Feature order

See [docs/app-plan.md](../docs/app-plan.md) section 0.4. This scaffold
covers step 1 (detect + render, no diagrams gate) and step 2 (diagrams) in
one pass, plus a settings pane (step 3). Transpose (step 4) and directory
submission (step 6) are not started.
