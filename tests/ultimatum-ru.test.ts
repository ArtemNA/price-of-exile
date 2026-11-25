// Inscribed Ultimatum from the Russian client: line texts from the game's ClientStrings and
// UltimatumItemisedRewards (Russian), item class from ItemClasses (owner, 25.11.2026).
import { beforeAll, describe, expect, it } from 'vitest';
import { parseClipboard } from '@/parser';
import { createTradeRequest } from '../src/lib/apt/web/price-check/trade/pathofexile-trade';
import { activePreset, createItemPresets } from '../src/app/price-check/price-check';
import { loadGameDataInLanguage } from './game-data';

beforeAll(() => loadGameDataInLanguage('ru'));

const RU_TRIAL = `Класс предмета: Прочие предметы карт
Редкость: Валюта
Начертанный Ультиматум
--------
Испытание: Встаньте в каменные круги
Уровень области: 83
Требуется жертвоприношение: Божественная сфера x4
Награда: Удваивает принесённую в жертву валюту
--------
20% увеличение урона монстров
--------
Можно использовать в личной машине картоходца для открытия порталов во владения Мастера испытаний и принятия его вызова.
`;

describe('Inscribed Ultimatum, Russian client', () => {
  it('reads reward and sacrifice and searches with the Russian trade names', () => {
    const result = parseClipboard(RU_TRIAL);
    if (result.isErr()) throw new Error(`parse failed: ${result.error}`);
    const item = result.value;
    expect(item.ultimatum).toMatchObject({ rewardType: 'DoubleCurrency', sacrificeCount: 4 });
    expect(item.ultimatum?.sacrifice?.refName).toBe('Divine Orb');
    const { filters, stats } = activePreset(createItemPresets(item, 'Standard'));
    expect(createTradeRequest(filters, stats).query.filters.ultimatum_filters?.filters).toEqual({
      ultimatum_reward: { option: 'DoubleCurrency' },
      ultimatum_input: { option: 'Божественная сфера' },
    });
  });
});
