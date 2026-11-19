// APT master after 3.30.101 (8a058ba → 844442d): twice corrupted items, rare-only mods,
// Atlas Drops / More Threads on maps and 9-mod maps.
import { beforeAll, describe, expect, it } from 'vitest';
import { parseClipboard, type ParsedItem } from '@/parser';
import { ModifierMechanic } from '../src/lib/apt/parser/modifiers';
import { createTradeRequest } from '../src/lib/apt/web/price-check/trade/pathofexile-trade';
import type { StatFilter } from '../src/lib/apt/web/price-check/filters/interfaces';
import { activePreset, createItemPresets } from '../src/app/price-check/price-check';
import { isTwiceCorrupted } from '../src/app/price-check/filter-view';
import { loadGameDataFromDisk } from './game-data';
import * as items from './items';

beforeAll(loadGameDataFromDisk);

function parse(text: string): ParsedItem {
  const result = parseClipboard(text);
  if (result.isErr()) throw new Error(`parse failed: ${result.error}`);
  return result.value;
}

const corruptedRing = (line: string) => `${items.RARE_RING}--------\n${line}\n`;

describe('Twice Corrupted', () => {
  it('parses once and twice corrupted items', () => {
    expect(parse(corruptedRing('Corrupted')).isCorrupted).toEqual({});
    expect(parse(corruptedRing('Twice Corrupted')).isCorrupted).toEqual({ twice: true });
    expect(parse(items.RARE_RING).isCorrupted).toBeUndefined();
  });

  it('searches a once corrupted item without twice corrupted ones', () => {
    const { filters, stats } = activePreset(createItemPresets(parse(corruptedRing('Corrupted')), 'Standard'));
    expect(filters.corrupted).toMatchObject({ value: true, twice: false });
    expect(isTwiceCorrupted(filters)).toBe(false);
    const misc = createTradeRequest(filters, stats).query.filters.misc_filters?.filters;
    expect(misc?.twice_corrupted).toEqual({ option: 'false' });
  });

  it('searches a twice corrupted item among all corrupted ones', () => {
    const { filters, stats } = activePreset(createItemPresets(parse(corruptedRing('Twice Corrupted')), 'Standard'));
    expect(filters.corrupted).toMatchObject({ value: true, twice: true });
    expect(isTwiceCorrupted(filters)).toBe(true);
    const misc = createTradeRequest(filters, stats).query.filters.misc_filters?.filters;
    expect(misc?.twice_corrupted).toBeUndefined();
  });
});

describe('rare-only mods', () => {
  // The game writes "Rare-only Prefix Modifier" / "Rare-only Suffix Modifier" (APT 3.30.102, "ggg fixed string").
  const ring = items.RARE_RING.replace(
    '{ Prefix Modifier "Rotund" (Tier: 4) — Life }',
    '{ Rare-only Prefix Modifier "Rotund" (Tier: 4) — Life }',
  );

  it('reads the mod as a rare-only prefix and keeps its tier', () => {
    const item = parse(ring);
    expect(item.unknownModifiers).toEqual([]);
    const life = item.newMods.find((m) => m.info.mechanic === ModifierMechanic.RareOnly);
    expect(life?.info).toMatchObject({ tier: 4, generation: 'prefix' });
    expect(life?.stats[0].stat.ref).toBe('+# to maximum Life');
  });
});

describe('Not Catalysed (3.30.102)', () => {
  it('offers it for jewellery without quality and searches quality ≤ 0', () => {
    const { filters, stats } = activePreset(createItemPresets(parse(items.RARE_RING), 'Standard'));
    expect(filters.notCatalysed).toEqual({ disabled: false });
    const misc = createTradeRequest(filters, stats).query.filters.misc_filters?.filters;
    expect(misc?.quality).toEqual({ max: 0 });
  });

  it('is not offered for jewellery that has quality', () => {
    const ring = items.RARE_RING.replace('--------\nRequirements:', '--------\nQuality (Life and Mana Modifiers): +20% (augmented)\n--------\nRequirements:');
    expect(parse(ring).quality).toBe(20);
    const { filters } = activePreset(createItemPresets(parse(ring), 'Standard'));
    expect(filters.notCatalysed).toBeUndefined();
  });
});

describe('Chronicle of Atzoatl (3.30.102)', () => {
  const chronicle = `Item Class: Misc Map Items
Rarity: Normal
Chronicle of Atzoatl
--------
Area Level: 83
--------
Item Level: 83
--------
Open Rooms:
Apex of Atzoatl
Cradle of Creation (Tier 3)
Anomaly Research Lab (Tier 1)
Obstructed Rooms:
Royal Forge (Tier 2)
--------
Take this item to the Map Device in your hideout to open a portal to the Temple of Atzoatl.
`;

  it('knows the renamed rooms, enables Cradle of Creation and shows the room reminder text', () => {
    const item = parse(chronicle);
    expect(item.unknownModifiers).toEqual([]);
    const stats = activePreset(createItemPresets(item, 'Standard')).stats as StatFilter[];
    const byRef = (ref: string) => stats.find((s) => s.statRef === ref);
    expect(byRef('Has Room: Cradle of Creation (Tier 3)')?.disabled).toBe(false);
    expect(byRef('Has Room: Apex of Atzoatl')?.disabled).toBe(false);
    expect(byRef('Has Room: Anomaly Research Lab (Tier 1)')).toBeUndefined(); // removed by the rules
    expect(stats.some((s) => s.reminderText)).toBe(true);
  });
});

describe('maps in 3.30', () => {
  const withDrops = items.RARE_MAP.replace(
    'Monster Pack Size: +29% (augmented)',
    'Monster Pack Size: +29% (augmented)\nAtlas Drops: +30% (augmented)\nMore Threads: +25% (augmented)',
  );

  it('reads Atlas Drops and More Threads and searches Atlas Drops as map_bonus', () => {
    const item = parse(withDrops);
    expect(item.areaAtlasDrops).toBe(30);
    expect(item.mapMoreThreads).toBe(25);

    const { filters, stats } = activePreset(createItemPresets(item, 'Standard'));
    const drops = (stats as StatFilter[]).find((s) => s.tradeId[0] === 'item.map_atlas_drops');
    expect(drops?.roll?.value).toBe(30);
    drops!.disabled = false;
    const map = createTradeRequest(filters, stats).query.filters.map_filters?.filters;
    expect(map?.map_bonus).toEqual({ min: drops!.roll!.min });
  });

  it('counts up to 9 explicit mods', () => {
    const extra = [
      '{ Prefix Modifier "Twinned" (Tier: 1) }',
      'Area contains two Unique Bosses',
      '{ Prefix Modifier "Fecund" (Tier: 1) }',
      '40(35-45)% more Monster Life',
      '{ Suffix Modifier "of Exposure" (Tier: 1) }',
      'Players have -10(-12--9)% to all maximum Resistances',
    ].join('\n');
    const nine = items.RARE_MAP.replace(
      'Monsters take 25(20-25)% reduced Extra Damage from Critical Strikes',
      `Monsters take 25(20-25)% reduced Extra Damage from Critical Strikes\n${extra}`,
    );
    const stats = activePreset(createItemPresets(parse(nine), 'Standard')).stats as StatFilter[];
    const count = stats.find((s) => s.statRef === '# Modifiers');
    expect(count?.roll).toMatchObject({ value: 9, min: 9 });
  });
});
