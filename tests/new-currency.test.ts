// Currency added to the game in 3.30 after APT's data (2498730): Originator's and Primordial
// Exalted Orb. Records added by hand from the PoE1 data generator; see docs/FINDINGS.md (F-71).
import { beforeAll, describe, expect, it } from 'vitest';
import { parseClipboard, type ParsedItem } from '@/parser';
import { bulkSiteUrl } from '../src/app/price-check/bulk-search';
import { activePreset, createItemPresets } from '../src/app/price-check/price-check';
import { loadGameDataFromDisk } from './game-data';

beforeAll(loadGameDataFromDisk);

const parse = (text: string): ParsedItem => parseClipboard(text)._unsafeUnwrap();

/** Copied in game by the owner (20.11.2026). */
const ORIGINATORS = `Item Class: Stackable Currency
Rarity: Currency
Originator's Exalted Orb
--------
Stack Size: 1/20
--------
Removes a random Suffix modifier and adds a random
rare-only modifier to a rare map item
--------
Right click this item then left click a rare map item to apply it.
`;

/** Not copied in game: same layout as above with made-up help lines (the parser only needs the name). */
const PRIMORDIAL = `Item Class: Stackable Currency
Rarity: Currency
Primordial Exalted Orb
--------
Stack Size: 1/20
--------
Right click this item to reveal a random Exotic Exalted Orb
`;

describe.each([
  ["Originator's Exalted Orb", ORIGINATORS, 'originators-exalted-orb'],
  ['Primordial Exalted Orb', PRIMORDIAL, 'primordial-exalted-orb'],
])('%s', (name, text, tag) => {
  it('is known and priced on the bulk exchange by its trade tag', () => {
    const item = parse(text);
    expect(item.info).toMatchObject({ namespace: 'ITEM', refName: name, tradeTag: tag });
    expect(item.info.icon).toMatch(/^https:\/\/web\.poecdn\.com\//);
    const { filters } = activePreset(createItemPresets(item, 'Standard'));
    const query = JSON.parse(decodeURIComponent(bulkSiteUrl(item, filters, 'chaos').split('?q=')[1]));
    expect(query.exchange).toMatchObject({ have: ['chaos'], want: [tag] });
  });
});
