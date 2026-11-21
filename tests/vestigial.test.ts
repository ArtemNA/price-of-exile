// Vestigial bases on non-unique items (owner's helmet, 21.11.2026): APT strips "Vestigial " only
// from unique bases, so a rare "Vestigial Golden Mask" was an unknown item.
import { beforeAll, describe, expect, it } from 'vitest';
import { parseClipboard, type ParsedItem } from '@/parser';
import { createTradeRequest } from '../src/lib/apt/web/price-check/trade/pathofexile-trade';
import type { StatFilter } from '../src/lib/apt/web/price-check/filters/interfaces';
import { activePreset, createItemPresets } from '../src/app/price-check/price-check';
import { loadGameDataFromDisk } from './game-data';

beforeAll(loadGameDataFromDisk);

function parse(text: string): ParsedItem {
  const result = parseClipboard(text);
  if (result.isErr()) throw new Error(`parse failed: ${result.error}`);
  return result.value;
}

const RARE_HELMET = `Item Class: Helmets
Rarity: Rare
Armageddon Keep
Vestigial Golden Mask
--------
Evasion Rating: 175 (augmented)
Energy Shield: 47 (augmented)
--------
Requirements:
Level: 60
Dex: 40
Int: 40
--------
Sockets: R-W W-W 
--------
Item Level: 84
--------
{ Vestigial Implicit Modifier }
50% increased Effect of Shrine Buffs on you
--------
{ Prefix Modifier "Sylph's" (Tier: 3) — Defences, Evasion, Energy Shield }
+42(28-48) to Evasion Rating
+17(13-22) to maximum Energy Shield
{ Prefix Modifier "Gentian" (Tier: 5) — Mana }
+50(50-54) to maximum Mana
{ Prefix Modifier "Shadowy" (Tier: 7) — Defences, Evasion, Energy Shield }
23(15-26)% increased Evasion and Energy Shield
{ Suffix Modifier "of Revoking" (Tier: 3) }
+9(9-10)% chance to Suppress Spell Damage
(40% of Damage from Suppressed Hits and Ailments they inflict is prevented)
{ Suffix Modifier "of the Ranger" (Tier: 2) — Attack }
+452(351-480) to Accuracy Rating
{ Suffix Modifier "of the Squall" (Tier: 7) — Elemental, Lightning, Resistance }
+17(12-17)% to Lightning Resistance
--------
Corrupted
`;

describe('Vestigial bases', () => {
  it('knows a rare Vestigial helmet by its base', () => {
    const item = parse(RARE_HELMET);
    expect(item.info.refName).toBe('Golden Mask');
    expect(item.isVestigial).toBe(true);
    expect(item.unknownModifiers).toEqual([]);
  });

  it('searches its mods and the vestigial implicit as an implicit', () => {
    const { filters, stats } = activePreset(createItemPresets(parse(RARE_HELMET), 'Standard'));
    const all = stats as StatFilter[];
    expect(all.map((s) => s.statRef)).toContain('+# to Accuracy Rating');
    const shrine = all.find((s) => s.statRef === '#% increased Effect of Shrine Buffs on you');
    expect(shrine?.tradeId).toEqual(['implicit.stat_1939175721']);
    const ids = JSON.stringify(createTradeRequest(filters, stats).query.stats);
    expect(ids).toContain('implicit.stat_1939175721');
  });

  it('knows a normal Vestigial base', () => {
    const normal = RARE_HELMET.replace('Rarity: Rare\nArmageddon Keep\n', 'Rarity: Normal\n').split('--------\n{ Vestigial')[0];
    const item = parse(normal);
    expect(item.info.refName).toBe('Golden Mask');
    expect(item.isVestigial).toBe(true);
  });
});
