import { beforeAll, describe, expect, it } from 'vitest';
import { parseClipboard, type ParsedItem } from '@/parser';
import type { FilterGroup, StatFilter } from '../src/lib/apt/web/price-check/filters/interfaces';
import { activePreset, createItemPresets } from '../src/app/price-check/price-check';
import {
  baseSwitch,
  filterText,
  isMiniFilter,
  mercLinks,
  mercTier,
  pickRollOption,
  rollOptions,
  corruptedState,
  groupStats,
  setCorrupted,
  setExactBase,
  sourceLines,
  statCounts,
  statLine,
  statTier,
} from '../src/app/price-check/filter-view';
import { loadGameDataFromDisk } from './game-data';
import * as items from './items';

beforeAll(loadGameDataFromDisk);

const parse = (text: string): ParsedItem => parseClipboard(text)._unsafeUnwrap();
const preset = (text: string, id?: string) => {
  const presets = createItemPresets(parse(text), 'Allflame');
  if (id) presets.active = id;
  return activePreset(presets);
};
const texts = (entries: unknown[]) => (entries as StatFilter[]).map((s) => s.text.trim());

const LIFE_RING = `Item Class: Rings
Rarity: Rare
Doom Band
Coral Ring
--------
Item Level: 80
--------
{ Implicit Modifier — Life }
+25(20-30) to maximum Life
--------
{ Prefix Modifier "Rotund" (Tier: 4) — Life }
+68(60-69) to maximum Life
{ Suffix Modifier "of the Lion" (Tier: 2) — Attribute }
+48(43-50) to Strength
`;

describe('groupStats', () => {
  it('puts pseudo totals under Totals and hidden filters apart', () => {
    const { groups, hidden } = groupStats(preset(items.RARE_RING).stats);
    expect(groups.map((g) => g.name)).toEqual(['Totals']);
    expect(texts(groups[0].entries)).toContain('+# total maximum Life');
    expect(texts(hidden)).toEqual(['+#% total to Fire Resistance']);
    expect((hidden[0] as StatFilter).hidden).toBe('filters.hide_ele_res');
  });

  it('groups the Mods preset by mod kind, in a fixed order', () => {
    const { groups } = groupStats(preset(items.RARE_RING, 'mods').stats);
    expect(groups.map((g) => g.name)).toEqual(['Implicit', 'Explicit']);
    expect(texts(groups[1].entries)).toEqual(['# to maximum Life', '#% to Fire Resistance', '#% to Lightning Resistance', '# to Dexterity']);
  });
});

describe('statTier and statCounts', () => {
  it('reads the tier of the mod behind a filter', () => {
    const explicit = groupStats(preset(items.RARE_RING, 'mods').stats).groups[1].entries as StatFilter[];
    expect(explicit.map(statTier)).toEqual([4, 3, 4, 4]);
    const implicit = groupStats(preset(items.RARE_RING, 'mods').stats).groups[0].entries as StatFilter[];
    expect(statTier(implicit[0])).toBeNull();
  });

  it('counts the filters that are on', () => {
    expect(statCounts(preset(items.RARE_RING).stats)).toEqual({ on: 2, all: 4 });
  });
});

describe('statLine and sourceLines', () => {
  it('fills in the roll and keeps the sign of the stat ref', () => {
    expect(statLine('# to maximum Life', '+# to maximum Life', 68)).toBe('+68 to maximum Life');
    expect(statLine('+# total maximum Life ', '+# total maximum Life', 93)).toBe('+93 total maximum Life');
    expect(statLine('#% increased Attack Speed', '#% increased Attack Speed', 7)).toBe('7% increased Attack Speed');
  });

  it('lists the mods behind a pseudo total, with what each adds', () => {
    const stats = preset(LIFE_RING).stats as StatFilter[];
    const life = stats.find((s) => s.statRef === '+# total maximum Life')!;
    expect(sourceLines(life)).toEqual([
      { text: '+25 to maximum Life', kind: 'implicit', adds: undefined },
      { text: '+68 to maximum Life', kind: undefined, adds: undefined },
      { text: '+48 to Strength', kind: undefined, adds: 24 },
    ]);
  });
});

describe('corrupted and base switches', () => {
  it('maps the corrupted filter to any / not / only and back', () => {
    const { filters } = preset(items.RARE_RING);
    expect(corruptedState(filters)).toBe('not');
    setCorrupted(filters, 'only');
    expect(filters.corrupted).toMatchObject({ value: true, exact: true });
    expect(corruptedState(filters)).toBe('only');
    setCorrupted(filters, 'any');
    expect(corruptedState(filters)).toBe('any');
    setCorrupted(filters, 'not');
    expect(filters.corrupted).toMatchObject({ value: false, exact: false });
  });

  it('switches between the whole category and the exact base', () => {
    const { filters } = preset(items.RARE_RING);
    expect(baseSwitch(filters)).toMatchObject({ base: 'Sapphire Ring', exact: false });
    expect(baseSwitch(filters)!.category).toMatch(/^Any /);
    setExactBase(filters, true);
    expect(baseSwitch(filters)!.exact).toBe(true);
  });
});

describe('mercenary warrants', () => {
  const groups = () => preset(items.MERCENARY_WARRANT).stats.filter((e) => e.group) as FilterGroup[];

  it('groups each skill with its supports and adds a "None of" group', () => {
    const all = groups();
    expect(all.map((g) => g.group)).toEqual(['mercenary', 'mercenary', 'mercenary', 'mercenary', 'mercenary', 'mercenary', 'not']);
    expect(all[0].meta.mercenary?.icon).toBeTruthy();
    expect(filterText(all[6].meta)).not.toBe(all[6].meta.text); // "None of", from i18n
  });

  it('draws a 6-link with tier 3 supports as APT does', () => {
    const blast = groups()[2];
    const links = mercLinks(blast);
    expect(links.length).toBe(6);
    expect(links[0]).toMatchObject({ skill: true, sixlink: true, checked: false });
    expect(links.filter((l) => l.tier3).length).toBe(3);
    const sixlink = blast.stats.find((s) => s.tradeId[0] === 'item.mercenary_6link')!;
    expect(filterText(sixlink)).not.toBe('6-Link');
    blast.meta.disabled = false;
    sixlink.disabled = false;
    expect(mercLinks(blast)[0].checked).toBe(true);
  });

  it('marks support tiers and offers Required / N-1', () => {
    const supports = groups()[0].stats;
    expect(mercTier(supports[0])).toEqual({ kind: 'tier-1', tier: 3 });
    expect(mercTier(supports[1])).toEqual({ kind: 'not-tier-1', tier: 2 });
    expect(rollOptions(supports[0])!.map((o) => o.value)).toEqual([1, 0]);
    expect(isMiniFilter(supports[0], parse(items.MERCENARY_WARRANT))).toBe(true);
  });

  it('picks an option like APT: another one turns the filter on, the same one toggles it', () => {
    const support = groups()[0].stats[0];
    pickRollOption(support, 0);
    expect(support).toMatchObject({ option: { value: 0 }, disabled: false });
    pickRollOption(support, 0);
    expect(support.disabled).toBe(true);
  });
});

describe('mercenary support families', () => {
  it('have sources without mod info: tiers and source lines must not throw', () => {
    const blast = (preset(items.MERCENARY_WARRANT).stats.filter((e) => e.group) as FilterGroup[])[2];
    const not = blast.stats.filter((s) => s.not);
    expect(not.length).toBeGreaterThan(0);
    for (const stat of blast.stats) {
      expect(() => statTier(stat)).not.toThrow();
      expect(() => sourceLines(stat)).not.toThrow();
    }
  });
});
