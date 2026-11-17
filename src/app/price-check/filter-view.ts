// How the price check shows APT's filter objects (design A+B, FINDINGS F-54): stat filters in
// groups by kind with tiers, the mods behind pseudo totals, hidden filters apart, and the item
// header's base / corrupted switches. The filter objects stay APT's; only the view is ours.

import { STAT_GROUP_OTHER, STAT_GROUPS } from '../constants';
import { t, tr } from '../core/i18n';
import { ItemCategory, type ParsedItem } from '@/parser';
import {
  type FilterGroup,
  type FilterOrGroup,
  INTERNAL_TRADE_IDS,
  type ItemFilters,
  type StatFilter,
} from '../../lib/apt/web/price-check/filters/interfaces';

export type CorruptedState = 'any' | 'not' | 'only';

export interface StatGroup {
  name: string;
  entries: FilterOrGroup[];
}

export interface SourceLine {
  text: string;
  /** "crafted", "implicit", …: the mod's kind when it is not a plain explicit. */
  kind?: string;
  /** What the mod adds to the total when it differs from its own roll ("+18 to Strength" → 9 life). */
  adds?: number;
}


function tagOf(entry: FilterOrGroup): string {
  return entry.group ? entry.meta.tag : entry.tag;
}

function isHidden(entry: FilterOrGroup): boolean {
  return entry.group ? entry.meta.hidden != null : entry.hidden != null;
}

/** Visible filters in groups; hidden ones (APT `hidden`: "rarely moves the price") on their own. */
export function groupStats(stats: FilterOrGroup[]): { groups: StatGroup[]; hidden: FilterOrGroup[] } {
  const groups = new Map<string, FilterOrGroup[]>();
  const hidden: FilterOrGroup[] = [];
  for (const entry of stats) {
    if (isHidden(entry)) {
      hidden.push(entry);
      continue;
    }
    const tag = tagOf(entry);
    const name = STAT_GROUPS.find((group) => group.tags.includes(tag))?.name ?? STAT_GROUP_OTHER;
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  const order = [...STAT_GROUPS.map((group) => group.name), STAT_GROUP_OTHER];
  return {
    groups: order.filter((name) => groups.has(name)).map((name) => ({ name, entries: groups.get(name)! })),
    hidden,
  };
}

/** Best (lowest) tier among the mods behind a filter: T1 is the top roll range. */
export function statTier(filter: StatFilter): number | null {
  const tiers = filter.sources.map((source) => source.modifier.info?.tier).filter((tier): tier is number => tier != null);
  return tiers.length ? Math.min(...tiers) : null;
}

/**
 * A stat line with its roll: "+# to maximum Life" and 68 → "+68 to maximum Life". Filter texts drop
 * the leading "+" of the stat ref, so it comes back from the ref.
 */
export function statLine(template: string, ref: string, value: number | undefined): string {
  const text = template.trim();
  const signed = ref.startsWith('+#') && text.startsWith('#') ? `+${text}` : text;
  return value != null && signed.split('#').length === 2 ? signed.replace('#', String(value)) : signed;
}

/** The mods a pseudo total adds up (APT "Mods" toggle, `SourceInfo.vue`). */
export function sourceLines(filter: StatFilter): SourceLine[] {
  if (filter.tag !== 'pseudo') return [];
  return filter.sources.map((source) => {
    const roll = source.stat.roll?.value;
    const text = statLine(source.stat.translation.string, source.stat.stat.ref, roll);
    const type = source.modifier.info?.type;
    const adds = source.contributes?.value;
    return {
      text,
      kind: type === 'explicit' ? undefined : type,
      adds: adds != null && adds !== roll ? adds : undefined,
    };
  });
}

/** Number of stat filters that are on, and of all of them (APT "3 of 10, stats"). */
export function statCounts(stats: FilterOrGroup[]): { on: number; all: number } {
  const flat = stats.map((entry) => (entry.group ? entry.meta : entry));
  return { on: flat.filter((filter) => !filter.disabled).length, all: flat.length };
}

/**
 * APT's corrupted filter has three meanings: `value: false` = not corrupted, `value: true` with
 * `exact` = corrupted only, `value: true` without = any (no filter sent).
 */
export function corruptedState(filters: ItemFilters): CorruptedState | null {
  const corrupted = filters.corrupted;
  if (!corrupted) return null;
  if (!corrupted.value) return 'not';
  return corrupted.exact ? 'only' : 'any';
}

export function setCorrupted(filters: ItemFilters, state: CorruptedState): void {
  if (!filters.corrupted) return;
  filters.corrupted.value = state !== 'not';
  filters.corrupted.exact = state === 'only';
}

/** The header's base switch: the whole category or this exact base (APT `FilterName.vue`). */
export function baseSwitch(filters: ItemFilters): { category: string; base: string; exact: boolean } | null {
  const relaxed = filters.searchRelaxed;
  if (!relaxed) return null;
  const base = filters.searchExact.baseType ?? filters.searchExact.name ?? tr('This base');
  // The category is game data and stays as the trade site names it.
  return { category: relaxed.category ? tr('Any {0}', relaxed.category) : tr('Any'), base, exact: relaxed.disabled };
}

export function setExactBase(filters: ItemFilters, exact: boolean): void {
  if (filters.searchRelaxed) filters.searchRelaxed.disabled = exact;
}

// Mercenary warrants (APT FilterGroup.vue, FilterModifier.vue "miniFilter", FilterModifierLinks.vue,
// FilterModifierTiers.vue, FilterModifierOptions.vue): a group per skill of the mercenary with its
// supports, and a "None of" group of skills it must not have.

/** The text of a filter: APT's own ids ("6-Link with # Support Gems of Tier 3", "None of") come from i18n. */
export function filterText(filter: StatFilter): string {
  return INTERNAL_TRADE_IDS.includes(filter.tradeId[0]) ? t(filter.tradeId[0], '#', '#') : filter.text;
}

/** Filters shown on one compact line (supports of a mercenary skill, its 6-Link, gems, …). */
export function isMiniFilter(filter: StatFilter, item: ParsedItem): boolean {
  if (filter.hidden) return false;
  const name = item.info.refName;
  return (
    filter.tag === 'mercenary-support' ||
    (filter.tag === 'property' && name === 'Mercenary Warrant') ||
    name === 'Chronicle of Atzoatl' ||
    name === 'Mirrored Tablet' ||
    name === 'Filled Coffin' ||
    item.category === ItemCategory.Gem
  );
}

/** Choices of a filter with an option: a support Required / N-1 (optional), an empty affix kind. */
export function rollOptions(filter: StatFilter): Array<{ key: string; value: number }> | null {
  if (filter.tag === 'mercenary-support' && filter.option) {
    return [
      { key: 'filters.option_merc_required', value: 1 },
      { key: 'filters.option_merc_optional', value: 0 },
    ];
  }
  if (filter.tradeId[0] === 'item.has_empty_modifier') {
    return [
      { key: 'filters.option_empty_affix', value: 0 },
      { key: 'filters.option_empty_prefix', value: 1 },
      { key: 'filters.option_empty_suffix', value: 2 },
    ];
  }
  return null;
}

/** APT's option click: the chosen one again turns the filter on / off, another one picks it and turns it on. */
export function pickRollOption(filter: StatFilter, value: number): void {
  if (!filter.option) return;
  if (filter.option.value === value) {
    filter.disabled = !filter.disabled;
  } else {
    filter.option.value = value;
    filter.disabled = false;
  }
}

export type MercTierKind = 'tier-1' | 'tier-2' | 'not-tier-1' | 'merc-gilded';

/** The tier mark of a mercenary support: 3 is the best (gold), 4 gilded, 2 / 1 by whether it is the top one. */
export function mercTier(filter: StatFilter): { kind: MercTierKind; tier: number } | null {
  const tier = filter.mercenary?.tier;
  if (!tier) return null;
  const kind: MercTierKind = tier === 4 ? 'merc-gilded' : tier === 3 ? 'tier-1' : filter.mercenary!.maxTier ? 'tier-2' : 'not-tier-1';
  return { kind, tier };
}

export interface MercLink {
  skill: boolean;
  /** The skill with 5 supports: a 6-link. */
  sixlink?: boolean;
  tier3?: boolean;
  gilded?: boolean;
  /** Searched for: the skill (and 6-link) or the support is on. */
  checked: boolean;
}

/** The skill and its supports as linked sockets, as APT draws them on the group's line. */
export function mercLinks(group: FilterGroup): MercLink[] {
  const supports = group.stats.filter((stat) => stat.mercenary);
  const metaOn = !group.meta.disabled;
  const sixlinkOn = group.stats.some(
    (stat) => !stat.disabled && ((stat.not && supports.length === 5) || stat.tradeId[0] === 'item.mercenary_6link'),
  );
  return [
    { skill: true, sixlink: supports.length === 5, checked: metaOn && sixlinkOn },
    ...supports.map((gem) => ({
      skill: false,
      tier3: gem.mercenary!.tier === 3,
      gilded: gem.mercenary!.tier === 4,
      checked: metaOn && !gem.disabled,
    })),
  ];
}
