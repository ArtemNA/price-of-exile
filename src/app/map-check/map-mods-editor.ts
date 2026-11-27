import { Component, computed, signal } from '@angular/core';
import type { StatMatcher } from '@/web/map-check/common';
import { MAP_CHECK_PROFILES, STASH_SEARCH_MAX_LENGTH } from '../constants';
import { interfaceLanguage, TrPipe } from '../core/i18n';
import { settings, updateSettings } from '../core/settings';
import { loadGameData } from '../game-data';
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

  constructor() {
    loadGameData().then(
      () => this.all.set(allAreaMods()),
      (e) => this.error.set(String(e)),
    );
  }

  protected decision(matcher: string): string {
    return decisionOf(this.config(), matcher);
  }

  protected marked(matcher: string): boolean {
    return decisionHasColor(this.config().selectedStats.find((s) => s.matcher === matcher)?.decision ?? '---', this.config().profile);
  }

  protected set(matcher: string, decision: string): void {
    updateSettings({ mapCheck: withDecision(this.config(), matcher, decision) });
  }

  protected selectProfile(profile: number): void {
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
    const config = this.config();
    const regex = mapRollingRegex(config, withWarnings ? ['d', 'w'] : ['d'], settings().language);
    if (!regex.text) {
      this.regexResult.set({ name: '', ...regex });
      return;
    }
    const { name, known } = mapRollingEntryName(withWarnings, config.profile, interfaceLanguage());
    const stashSearch = withMapRollingEntry(settings().stashSearch, name, regex.text, known);
    updateSettings({ stashSearch });
    // The entry keeps the name it was made with (maybe another interface language): show that one.
    const shown = stashSearch.find((g) => g.title === MAP_ROLLING_GROUP)?.entries.find((e) => known.includes(e.name))?.name ?? name;
    this.regexResult.set({ name: shown, ...regex });
  }

  protected readonly maxLength = STASH_SEARCH_MAX_LENGTH;
  protected readonly groupName = MAP_ROLLING_GROUP;
}

interface RegexResult extends MapRegex {
  /** The stash search entry written; empty when nothing was marked. */
  name: string;
}
