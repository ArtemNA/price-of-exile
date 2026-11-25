// Inscribed Ultimatum (owner, 25.11.2026): priced by reward and sacrifice (trade site "Ultimatum
// Filters"), the mods do not matter; sacrifice and reward shown like related items with poe.ninja
// prices. Line formats from the game's ClientStrings and UltimatumItemisedRewards.
import { beforeAll, describe, expect, it } from 'vitest';
import { parseClipboard, type ParsedItem } from '@/parser';
import { createTradeRequest, listedSacrificeCount } from '../src/lib/apt/web/price-check/trade/pathofexile-trade';
import { activePreset, createItemPresets } from '../src/app/price-check/price-check';
import { itemFilterChips } from '../src/app/price-check/item-filter-chips';
import { ultimatumItems, type NinjaPrice } from '../src/app/core/ninja-prices';
import { readFileSync } from 'node:fs';
import { listingCard } from '../src/app/price-check/listing-card';
import { loadGameDataFromDisk } from './game-data';

beforeAll(loadGameDataFromDisk);

function parse(text: string): ParsedItem {
  const result = parseClipboard(text);
  if (result.isErr()) throw new Error(`parse failed: ${result.error}`);
  return result.value;
}

const trial = (sacrifice: string, reward: string) => `Item Class: Misc Map Items
Rarity: Currency
Inscribed Ultimatum
--------
Challenge: Stand in the Stone Circles
Area Level: 83
Requires Sacrifice: ${sacrifice}
Reward: ${reward}
--------
Choking Miasma III
(A large and fast cloud that deals Chaos Damage over Time will follow you)
Reduced Recovery
(60% Reduced Life, Mana, and Energy Shield Recovery Rate)
20% increased Monster Damage
70% more Monster Life
--------
Can be used in a personal map device to open portals to the Trialmaster's Domain and attempt his challenge. Portals will close once the challenge begins. While viewing your Atlas, Right-click this item to pinpoint its location.
`;

const DIVINES = trial('Divine Orb x4', 'Doubles sacrificed Currency');

function query(item: ParsedItem) {
  const { filters, stats } = activePreset(createItemPresets(item, 'Standard'));
  return { filters, request: () => createTradeRequest(filters, stats).query };
}

const price = (chaos: number): NinjaPrice => ({ name: '', chaos, graph: [], page: '' });

describe('Inscribed Ultimatum', () => {
  it('reads the sacrifice, its count and the reward', () => {
    const item = parse(DIVINES);
    expect(item.info.refName).toBe('Inscribed Ultimatum');
    expect(item.ultimatum).toMatchObject({ rewardType: 'DoubleCurrency', sacrificeText: 'Divine Orb', sacrificeCount: 4 });
    expect(item.ultimatum?.sacrifice?.refName).toBe('Divine Orb');
  });

  it('searches by reward type and required item, both on and each can be left out', () => {
    const { filters, request } = query(parse(DIVINES));
    expect(request().filters.ultimatum_filters?.filters).toEqual({
      ultimatum_reward: { option: 'DoubleCurrency' },
      ultimatum_input: { option: 'Divine Orb' },
    });
    expect(request().type).toBe('Inscribed Ultimatum');
    expect(filters.ultimatumSacrifice?.text).toBe('Divine Orb x4');
    expect(filters.ultimatumReward?.text).toBe('Doubles sacrificed Currency');
    const chips = itemFilterChips(filters);
    const sacrifice = chips.find((c) => c.key === 'ultimatumSacrifice')!;
    expect(sacrifice.enabled).toBe(true);
    sacrifice.toggle();
    expect(request().filters.ultimatum_filters?.filters).toEqual({ ultimatum_reward: { option: 'DoubleCurrency' } });
    chips.find((c) => c.key === 'ultimatumReward')!.toggle();
    expect(request().filters.ultimatum_filters).toBeUndefined();
  });

  it('a unique for a unique: reward type and the unique given', () => {
    const item = parse(trial('Headhunter', 'Mageblood'));
    expect(item.ultimatum).toMatchObject({ rewardType: 'ExchangeUnique', sacrificeCount: undefined });
    expect(query(item).request().filters.ultimatum_filters?.filters).toEqual({
      ultimatum_reward: { option: 'ExchangeUnique' },
      ultimatum_output: { option: 'Mageblood' },
      ultimatum_input: { option: 'Headhunter' },
    });
  });

  it('divination cards and the mirror: reward type, a sacrifice only when it is a known item', () => {
    const cards = query(parse(trial('The Doctor x2', 'Doubles sacrificed Divination Cards')));
    expect(cards.request().filters.ultimatum_filters?.filters).toEqual({
      ultimatum_reward: { option: 'DoubleDivCards' },
      ultimatum_input: { option: 'The Doctor' },
    });
    const mirror = query(parse(trial('Mirrorable, Rare Item', 'Item and Mirrored Copy')));
    expect(mirror.filters.ultimatumSacrifice).toBeUndefined();
    expect(mirror.request().filters.ultimatum_filters?.filters).toEqual({ ultimatum_reward: { option: 'MirrorRare' } });
  });

  it('shows sacrifice and reward with poe.ninja prices for their counts', () => {
    const db = new Map([
      ['ITEM::Divine Orb', price(200)],
      ['UNIQUE::Headhunter', price(5000)],
      ['UNIQUE::Mageblood // 6L', price(90000)],
      ['UNIQUE::Mageblood', price(80000)],
    ]);
    expect(ultimatumItems(parse(DIVINES).ultimatum!, db)).toEqual({
      related: [expect.objectContaining({ name: 'Divine Orb x4', chaos: 800 })],
      items: [expect.objectContaining({ name: 'Divine Orb x8', chaos: 1600 })],
    });
    expect(ultimatumItems(parse(trial('Headhunter', 'Mageblood')).ultimatum!, db)).toEqual({
      related: [expect.objectContaining({ name: 'Headhunter', chaos: 5000 })],
      items: [expect.objectContaining({ name: 'Mageblood', chaos: 80000 })],
    });
    expect(ultimatumItems(parse(trial('Mirrorable, Rare Item', 'Item and Mirrored Copy')).ultimatum!, db)).toBeNull();
  });

  it('has the chip labels in every interface language', () => {
    const files: Array<[string, (json: any) => any]> = [
      ['public/data/en/app_i18n.json', (json) => json.item],
      ['public/i18n/ru.json', (json) => json.apt.item],
      ['public/i18n/uk.json', (json) => json.apt.item],
    ];
    for (const [file, items] of files) {
      const item = items(JSON.parse(readFileSync(file, 'utf8')));
      expect(item?.ultimatum_reward, file).toContain('{0}');
      expect(item?.ultimatum_sacrifice, file).toContain('{0}');
    }
  });

  it('the listing card fills "{0}" placeholders (trade API properties, 25.11.2026)', () => {
    const card = listingCard({
      typeLine: 'Inscribed Ultimatum',
      frameType: 5,
      properties: [
        { name: 'Requires Sacrifice: {0} {1}', values: [['Divine Orb', 18], ['x1', 0]], displayMode: 3, type: 51 },
        { name: 'Reward: {0}', values: [['Doubles sacrificed Currency', 0]], displayMode: 3, type: 52 },
      ],
    });
    const text = (card?.properties ?? []).map((p) => p.parts.map((part) => (typeof part === 'string' ? part : part.text)).join(''));
    expect(text).toEqual(['Requires Sacrifice: Divine Orb x1', 'Reward: Doubles sacrificed Currency']);
  });

  it('reads each listing\'s sacrifice count for its row (the trade site cannot filter it)', () => {
    const props = (count: string) => [
      { name: 'Challenge', values: [['Stand in the Stone Circles', 0]] as Array<[string, number]>, displayMode: 0 },
      { name: 'Requires Sacrifice: {0} {1}', values: [['Divine Orb', 18], [count, 0]] as Array<[string, number]>, displayMode: 3, type: 51 },
    ];
    expect(listedSacrificeCount(props('x1'))).toBe(1);
    expect(listedSacrificeCount(props('x4'))).toBe(4);
    expect(listedSacrificeCount([{ name: 'Requires Sacrifice: {0}', values: [['Headhunter', 0]], type: 51 }])).toBeUndefined();
    expect(listedSacrificeCount(undefined)).toBeUndefined();
  });

  it('other items are not touched', () => {
    const lens = parse(`Item Class: Stackable Currency
Rarity: Currency
Divine Orb
--------
Stack Size: 1/20
--------
Randomises the numeric values of the random modifiers on an item
`);
    expect(lens.ultimatum).toBeUndefined();
  });
});
