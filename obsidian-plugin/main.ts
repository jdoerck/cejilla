import { App, MarkdownPostProcessorContext, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
// @ts-ignore — plain JS core module, copied verbatim from src/parser.js, no I/O
import { parse } from './src/core/parser.js';
import { renderSong } from './src/render';

interface InlaySettings {
  instrument: 'guitar' | 'ukulele';
  diagrams: boolean;
}

const DEFAULT_SETTINGS: InlaySettings = {
  instrument: 'guitar',
  diagrams: true,
};

/**
 * A note counts as a "song note" if its frontmatter carries either of the
 * two fields every example file in ../examples/ has. Deliberately loose —
 * false positives on a non-song note just mean it renders (harmlessly) as
 * an empty chart; false negatives mean nothing happens. Tighten later with
 * an explicit `type: song` field if that turns out to matter.
 */
function isSongFrontmatter(fm: Record<string, unknown> | undefined | null): boolean {
  if (!fm) return false;
  return 'instrument' in fm || 'key' in fm;
}

export default class InlayChordsPlugin extends Plugin {
  settings: InlaySettings = DEFAULT_SETTINGS;

  // Section takeover, see NOTE below. Cleared on layout change so a note
  // re-renders after being edited, rather than staying stuck on stale HTML.
  private renderedDocs = new Set<string>();

  // sourcePath -> the root element of the last full render we inserted for
  // that note. See the second NOTE below, in processSongNote.
  private renderedRoots = new Map<string, HTMLElement>();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new InlaySettingTab(this.app, this));

    this.registerEvent(this.app.workspace.on('layout-change', () => {
      this.renderedDocs.clear();
      this.renderedRoots.clear();
    }));

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      await this.processSongNote(el, ctx);
    });
  }

  /**
   * NOTE — the risky, unverified part (see docs/app-plan.md section 0.3).
   *
   * Obsidian's live preview / reading view splits a note into several
   * sections and calls the post-processor once per section, not once per
   * note. A song note needs ONE full-note render, not one render per
   * section. The approach here: on the first section Obsidian hands us for
   * a given note (tracked by `ctx.docId`), read the whole file, parse it,
   * and replace that section's element with the entire rendered song.
   * Every later section-call for the same docId gets emptied out instead
   * of re-rendered, so the note doesn't show the song twice.
   *
   * This is the one piece with no direct precedent in the ported CLI code.
   * Needs verification against real notes in reading view, live preview,
   * and on an actual iOS device before this plugin is trustworthy —
   * ChordPro Viewer's source (community.obsidian.md/plugins/chopro-viewer)
   * is the closest prior art and worth reading before changing this.
   */
  private async processSongNote(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!isSongFrontmatter(fm)) return;

    if (this.renderedDocs.has(ctx.docId)) {
      el.empty();
      return;
    }
    this.renderedDocs.add(ctx.docId);

    // NOTE — confirmed live: on a long enough note, Obsidian's reading
    // view fires more than one render pass, each with its OWN docId (its
    // progressive/chunked rendering, not something this plugin controls).
    // The docId check above only dedupes *within* one pass — it does
    // nothing to stop a second pass from fully re-rendering the note
    // again, which is what produced two stacked copies of the song.
    //
    // Fix: don't try to guess which pass is "the real one" ahead of time.
    // Instead, track the DOM node our last full render inserted for this
    // file, and if a newer pass comes in and that node is still attached,
    // remove it first. Whichever pass finishes last wins; the stale one
    // gets cleaned up reactively rather than prevented.
    const stale = this.renderedRoots.get(ctx.sourcePath);
    if (stale?.isConnected) stale.remove();

    const source = await this.app.vault.cachedRead(file);
    const song = parse(source);
    const rendered = renderSong(song, {
      instrument: this.resolveInstrument(fm),
      diagrams: this.settings.diagrams,
    });
    this.renderedRoots.set(ctx.sourcePath, rendered);

    el.empty();
    el.appendChild(rendered);
  }

  /**
   * Per-song `instrument:` frontmatter wins over the global settings
   * default — matches how `key`, `capo`, etc. already work per-file. The
   * CLI ([../src/cli.js](../src/cli.js)) has the same gap (only reads
   * `--instrument` as a flag, never from the song's own frontmatter) —
   * not fixed there yet, fixed here first since it's what's in front of us.
   */
  private resolveInstrument(fm: Record<string, unknown> | undefined | null): 'guitar' | 'ukulele' {
    const raw = fm?.instrument;
    if (raw === 'guitar' || raw === 'ukulele') return raw;
    return this.settings.instrument;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class InlaySettingTab extends PluginSettingTab {
  plugin: InlayChordsPlugin;

  constructor(app: App, plugin: InlayChordsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Instrument')
      .setDesc('Chord diagram shapes to use for songs that don’t override it in frontmatter.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('guitar', 'Guitar (EADGBE)')
          .addOption('ukulele', 'Ukulele (GCEA)')
          .setValue(this.plugin.settings.instrument)
          .onChange(async (value) => {
            this.plugin.settings.instrument = value as 'guitar' | 'ukulele';
            await this.plugin.saveSettings();
            this.app.workspace.trigger('layout-change');
          })
      );

    new Setting(containerEl)
      .setName('Show chord diagrams')
      .setDesc('Render fretboard diagrams above the song body.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.diagrams).onChange(async (value) => {
          this.plugin.settings.diagrams = value;
          await this.plugin.saveSettings();
          this.app.workspace.trigger('layout-change');
        })
      );
  }
}
