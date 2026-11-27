import { Component, computed, effect, signal } from '@angular/core';
import type { StatMatcher } from '@/web/map-check/common';
import { MAP_CHECK_PROFILES, STASH_SEARCH_MAX_LENGTH } from '../constants';
import { interfaceLanguage, TrPipe } from '../core/i18n';
import { settings, updateSettings } from '../core/settings';
import { gameDataLanguage, loadGameData } from '../game-data';
import { allAreaMods, decisionHasColor, decisionOf, filterAreaMods, StatTag, withDecision } from './map-check';
import { MAP_ROLLING_GROUP, type MapRegex, mapRollingEntryName, mapRollingRegex, withMapRollingEntry } from './map-regex';

/** Marks the user can set per mod in the editor; the order of APT's columns. `label` is English, the template translates it. */
const COLUMNS = [
  { decision: 'w', label: 'Warning', class: 'accent-warn' },
  { decision: 'd', label: 'Deadly', class: 'accent-deadly' },
  { decision: 'g', label: 'Good', class: 'accent-good' },
] as const;

/** Settings page of the map check (APT `settings-maps.vue` + `SettingsMatcherEntry.vue`). */
@Component({
  selector: 'app-map-mods-editor',
  imports: [TrPipe],
  templateUrl: './map-mods-editor.html',
  host: { class: 'flex min-h-0 flex-1 flex-col gap-2' },
})
export class MapModsEditor {
  protected readonly columns = COLUMNS;
  protected readonly profiles = MAP_CHECK_PROFILES;
  protected readonly tags = StatTag;
  protected readonly config = computed(() => settings().mapCheck);
  protected readonly search = signal('');
  protected readonly onlySelected = signal(false);
  private readonly all = signal<StatMatcher[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly list = computed(() => filterAreaMods(this.all(), this.config(), this.search(), this.onlySelected()));

  /** Only the language, so marking a mod does not reload the list. */
  private readonly gameLanguage = computed(() => settings().language);
  /** Language of the game data the list and the regex come from; null while it loads. */
  private readonly dataLanguage = signal<string | null>(null);
  protected readonly ready = computed(() => this.dataLanguage() !== null && this.all().length > 0);

  constructor() {
    // The game's language, as the map check itself reads items: the marks and the regex are in the
    // wording of the game (a Russian client got an English regex before, review 27.11.2026).
    effect(() => {
      const language = this.gameLanguage();
      this.dataLanguage.set(null);
      this.error.set(null);
      this.regexResult.set(null);
      loadGameData(language)
        .then(() => {
          // An older load of this language may finish while a newer one (after a switch back) waits.
          if (this.gameLanguage() !== language || gameDataLanguage() !== language) return;
          const mods = allAreaMods();
          if (!mods.length) throw new Error('no map mods in the game data');
          this.all.set(mods);
          this.dataLanguage.set(language);
        })
        .catch((e) => this.gameLanguage() === language && this.error.set(String(e)));
    });
  }

  protected decision(matcher: string): string {
    return decisionOf(this.config(), matcher);
  }

  protected marked(matcher: string): boolean {
    return decisionHasColor(this.config().selectedStats.find((s) => s.matcher === matcher)?.decision ?? '---', this.config().profile);
  }

  protected set(matcher: string, decision: string): void {
    // The regex shown under the buttons no longer matches the marks.
    this.regexResult.set(null);
    updateSettings({ mapCheck: withDecision(this.config(), matcher, decision) });
  }

  protected selectProfile(profile: number): void {
    this.regexResult.set(null);
    updateSettings({ mapCheck: { ...this.config(), profile } });
  }

  protected setShowNewStats(showNewStats: boolean): void {
    updateSettings({ mapCheck: { ...this.config(), showNewStats } });
  }

  /** What the last regex button did, shown under the buttons. */
  protected readonly regexResult = signal<RegexResult | null>(null);

  /**
   * Stash search regex skipping maps with the current profile's deadly (and warning) mods, put into
   * the "Map rolling" group (owner, 27.11.2026): added the first time, its text updated after that.
   * The entry's name carries the profile, so each profile keeps its own pair.
   */
  protected generateRegex(withWarnings: boolean): void {
    const language = this.dataLanguage();
    if (!language) return;
    const config = this.config();
    const regex = mapRollingRegex(config, withWarnings ? ['d', 'w'] : ['d'], language);
    // Nothing marked, or longer than the game takes (cut off, it could end inside a token): the
    // entry keeps its text.
    if (!regex.text || regex.tooLong) {
      this.regexResult.set({ name: '', updated: false, ...regex });
      return;
    }
    const { name, known } = mapRollingEntryName(withWarnings, config.profile, interfaceLanguage());
    const before = settings().stashSearch.find((g) => g.title === MAP_ROLLING_GROUP)?.entries.some((e) => known.includes(e.name)) ?? false;
    const stashSearch = withMapRollingEntry(settings().stashSearch, name, regex.text, known);
    updateSettings({ stashSearch });
    // The entry keeps the name it was made with (maybe another interface language): show that one.
    const shown = stashSearch.find((g) => g.title === MAP_ROLLING_GROUP)?.entries.find((e) => known.includes(e.name))?.name ?? name;
    this.regexResult.set({ name: shown, updated: before, ...regex });
  }

  protected readonly maxLength = STASH_SEARCH_MAX_LENGTH;
  protected readonly groupName = MAP_ROLLING_GROUP;
}

interface RegexResult extends MapRegex {
  /** The stash search entry written; empty when nothing was marked. */
  name: string;
  /** The entry was there before and only its text changed. */
  updated: boolean;
}
