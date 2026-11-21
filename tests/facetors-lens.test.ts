// Facetor's Lens (owner, 21.11.2026): known item, "Stored Experience" parsed and searched with
// min and max as on the item (trade site: Miscellaneous → Stored Experience).
import { beforeAll, describe, expect, it } from 'vitest';
import { parseClipboard, type ParsedItem } from '@/parser';
import { createTradeRequest } from '../src/lib/apt/web/price-check/trade/pathofexile-trade';
import { activePreset, createItemPresets } from '../src/app/price-check/price-check';
import { itemFilterChips } from '../src/app/price-check/item-filter-chips';
import { loadGameDataFromDisk } from './game-data';

beforeAll(loadGameDataFromDisk);

function parse(text: string): ParsedItem {
  const result = parseClipboard(text);
  if (result.isErr()) throw new Error(`parse failed: ${result.error}`);
  return result.value;
}

const LENS = `Item Class: Stackable Currency
Rarity: Currency
Facetor's Lens
--------
Stored Experience: 500 000 000
--------
Adds stored experience to a gem, up to its maximum level
--------
Right click this item then left click a gem to apply it.
`;

describe("Facetor's Lens", () => {
  it('knows the lens and its stored experience', () => {
    const item = parse(LENS);
    expect(item.info.refName).toBe("Facetor's Lens");
    expect(item.storedExperience).toBe(500_000_000);
  });

  it('reads other digit separators', () => {
    expect(parse(LENS.replace('500 000 000', '1,234,567')).storedExperience).toBe(1_234_567);
    expect(parse(LENS.replace('500 000 000', '1 234')).storedExperience).toBe(1234);
  });

  it('searches with min and max as on the item, both editable', () => {
    const { filters, stats } = activePreset(createItemPresets(parse(LENS), 'Standard'));
    expect(filters.storedExperience).toEqual({ value: 500_000_000, max: 500_000_000, disabled: false });
    const chip = itemFilterChips(filters).find((c) => c.key === 'storedExperience');
    expect(chip?.numeric).toBe(filters.storedExperience);
    let misc = createTradeRequest(filters, stats).query.filters.misc_filters?.filters;
    expect(misc?.stored_experience).toEqual({ min: 500_000_000, max: 500_000_000 });
    filters.storedExperience!.value = 400_000_000;
    filters.storedExperience!.max = undefined;
    misc = createTradeRequest(filters, stats).query.filters.misc_filters?.filters;
    expect(misc?.stored_experience).toEqual({ min: 400_000_000 });
    expect(createTradeRequest(filters, stats).query.type).toBe("Facetor's Lens");
  });
});
