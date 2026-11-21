// The card of a listed item (hover over a listing row): trade fetch result → card data.
// Fixtures: real PoE1 trade fetch responses, Standard, 21.11.2026 (accounts anonymized).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardVisible, listingCard, socketCell, stripMarkup } from '../src/app/price-check/listing-card';

const fixture = (name: string): Array<{ item: unknown }> =>
  JSON.parse(readFileSync(new URL(`./fixtures/fetch-${name}.json`, import.meta.url), 'utf-8')).result;

const chests = fixture('rare-chest-crafted');
const wands = fixture('unique-wand-corrupted');
const helmets = fixture('rare-helmet-fractured');

describe('listingCard', () => {
  it('reads a rare: title, properties, item level, requirements, tiers', () => {
    const card = listingCard(chests[0].item)!;
    expect(card.title).toEqual(['Rage Wrap', 'Gladiator Plate']);
    expect(card.rarity).toBe('Rare');
    expect([card.w, card.h]).toEqual([2, 3]);
    expect(card.properties[0].parts).toEqual(['Quality: ', { text: '+20%', colour: 1 }]);
    expect(card.properties[1].parts).toEqual(['Armour: ', { text: '1541', colour: 1 }]);
    expect(card.itemLevel).toBe(75);
    // "Requires Level 65, 177 Str": Level is "name value", attributes "value name".
    expect(card.requirements.map((r) => r.map((v) => v.text).join(''))).toEqual(['Level 65', '177 Str']);
    const [block] = card.modBlocks;
    expect(block.map((m) => [m.lines[0], m.kind, m.tier])).toEqual([
      ['74% increased Armour', 'explicit', 'P4'],
      ['+95 to maximum Life', 'explicit', 'P4'],
      ['+40% to Fire Resistance', 'explicit', 'S3'],
      ['+32% to Cold Resistance', 'explicit', 'S4'],
      // Crafted: no tier, as in the game (the API says "S0").
      ['+21% to Lightning Resistance', 'crafted', undefined],
    ]);
    expect(card.tags).toEqual([]);
  });

  it('joins the tiers of a line made by two mods', () => {
    const card = listingCard(helmets[0].item)!;
    const armour = card.modBlocks.flat().find((m) => m.lines[0] === '+179 to Armour');
    expect(armour?.tier).toBe('P1 + P2');
  });

  it('puts fractured mods first and marks them', () => {
    const card = listingCard(helmets[0].item)!;
    expect(card.modBlocks[0][0]).toEqual({ lines: ['+338 to Accuracy Rating'], kind: 'fractured', tier: 'S3' });
  });

  it('separates implicits from explicits', () => {
    const card = listingCard(chests[1].item)!;
    expect(card.modBlocks).toHaveLength(2);
    expect(card.modBlocks[0].every((m) => m.kind === 'implicit')).toBe(true);
    expect(card.modBlocks[1].every((m) => m.kind !== 'implicit')).toBe(true);
  });

  it('reads a corrupted unique weapon: DPS lines, flavour, markup, Corrupted', () => {
    const card = listingCard(wands[0].item)!;
    expect(card.title).toEqual(['Moonsorrow', 'Imbued Wand']);
    expect(card.rarity).toBe('Unique');
    const lines = card.properties.map((p) => p.parts.map((x) => (typeof x === 'string' ? x : x.text)).join(''));
    expect(lines).toEqual([
      'Wand',
      'Physical Damage: 61-113',
      'Critical Strike Chance: 8.00%',
      'Attacks per Second: 1.60',
      'DPS: 166.4',
      'Physical DPS: 166.4',
    ]);
    expect(card.properties.at(-1)!.parts[1]).toEqual({ text: '166.4', colour: 1 });
    expect(card.modBlocks[1][0].lines).toEqual(['Socketed Gems are Supported by Level 20 Blind Support']);
    expect(card.modBlocks[1].at(-1)!.lines).toEqual(['10% chance to Blind Enemies on Hit']);
    expect(card.flavour).toEqual(['Cast into darkness', 'And trapped for a thousand years,', 'The lonely moon weeps']);
    expect(card.tags).toEqual(['Corrupted']);
  });

  it('keeps the colour of elemental damage', () => {
    const card = listingCard(wands[3].item)!;
    expect(card.properties.find((p) => p.parts[0] === 'Elemental Damage: ')?.parts[1]).toEqual({ text: '5-61', colour: 6 });
  });

  it('reads sockets and links', () => {
    // Groups 0, 1, 2, 2: G - R - R=R.
    expect(listingCard(chests[0].item)!.sockets).toEqual([
      { colour: 'G', linkNext: false },
      { colour: 'R', linkNext: false },
      { colour: 'R', linkNext: true },
      { colour: 'R', linkNext: false },
    ]);
    expect(listingCard(chests[1].item)!.sockets.filter((s) => s.linkNext)).toHaveLength(5);
  });

  it('tags influences', () => {
    expect(listingCard(helmets[3].item)!.tags).toEqual(['Searing Exarch Item', 'Eater of Worlds Item']);
    // Its item text (extended.text) ends with the same two lines.
    expect(listingCard(chests[1].item)!.tags).toEqual(['Shaper Item', 'Crusader Item']);
  });

  it('reads the older API form: mods as strings, tiers through extended.hashes', () => {
    const card = listingCard({
      frameType: 2,
      name: 'Old',
      typeLine: 'Iron Ring',
      explicitMods: ['+10 to Strength', '+20 to Armour'],
      craftedMods: ['+5 to Dexterity'],
      extended: {
        mods: { explicit: [{ tier: 'S5' }, { tier: 'P1' }, { tier: 'P2' }] },
        hashes: { explicit: [['explicit.a', [0]], ['explicit.b', [1, 2]]] },
      },
    })!;
    expect(card.modBlocks[0].map((m) => [m.lines[0], m.kind, m.tier])).toEqual([
      ['+10 to Strength', 'explicit', 'S5'],
      ['+20 to Armour', 'explicit', 'P1 + P2'],
      ['+5 to Dexterity', 'crafted', undefined],
    ]);
  });

  it('gives no card for an item it cannot read, without throwing', () => {
    expect(listingCard(null)).toBeUndefined();
    expect(listingCard({ name: 'x' })).toBeUndefined();
    expect(listingCard({ typeLine: 'Ring', explicitMods: 5, properties: [{ values: 3 }] })).toBeUndefined();
  });

  it('reads every fixture listing', () => {
    for (const r of [...chests, ...wands, ...helmets]) expect(listingCard(r.item)).toBeDefined();
  });
});

describe('stripMarkup', () => {
  it('keeps the visible text', () => {
    expect(stripMarkup('[Quality]')).toBe('Quality');
    expect(stripMarkup('+13% to [PlayerItemRarity|Item Rarity]')).toBe('+13% to Item Rarity');
    expect(stripMarkup('Level 20 [SupportBlind::20|Blind Support]')).toBe('Level 20 Blind Support');
  });
});

describe('cardVisible', () => {
  it.each([
    ['eye', false, true, true, true],
    ['eye', true, true, false, false],
    ['eye', false, false, true, false],
    ['off', true, true, true, false],
    ['keybind', false, true, false, false],
    ['keybind', true, true, false, true],
    ['keybind', true, false, false, false],
    ['always', false, true, false, true],
    ['always', true, false, false, false],
  ] as const)('%s, shift %s, over a row %s, on its eye %s → %s', (mode, shift, over, eye, shown) => {
    expect(cardVisible(mode, shift, over, eye)).toBe(shown);
  });
});

describe('socketCell', () => {
  it('snakes the sockets of a two cells wide item', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => socketCell(i, 2))).toEqual([
      { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 1, row: 2 },
    ]);
  });

  it('stacks the sockets of a one cell wide item', () => {
    expect([0, 1, 2].map((i) => socketCell(i, 1))).toEqual([{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }]);
  });
});
