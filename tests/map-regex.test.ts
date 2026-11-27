// Map rolling regex (owner, 27.11.2026): our own generator of short unique tokens per map mod.
// Every token is compiled as the game would use it and run over every line a map can show, with
// numbers filled in: it must match its own mod and nothing else.
import { beforeAll, describe, expect, it } from 'vitest';
import { allAreaMods } from '../src/app/map-check/map-check';
import { mapLines, mapModToken, mapRollingEntryName, mapRollingRegex, withMapRollingEntry } from '../src/app/map-check/map-regex';
import { DEFAULT_STASH_SEARCH, STASH_SEARCH_MAX_LENGTH } from '../src/app/constants';
import { loadGameDataFromDisk, loadGameDataInLanguage } from './game-data';

/** A line as the game shows it: numbers in place of `#`. */
const shown = (line: string) => line.replaceAll('#', '17');

function checkAllTokens(language: string): { mods: number; without: string[]; shared: string[] } {
  const { lines, own, siblings } = mapLines();
  const without: string[] = [];
  const shared: string[] = [];
  let mods = 0;
  for (const mod of allAreaMods()) {
    mods += 1;
    const token = mapModToken(mod.matchStr, language);
    if (!token) {
      without.push(mod.matchStr);
      continue;
    }
    const regex = new RegExp(token, 'i');
    const mine = own.get(mod.matchStr)!;
    expect(mine.some((line) => regex.test(shown(line))), `${token} ⇢ own ${mod.matchStr}`).toBe(true);
    // Other wordings of the same stat only when this one has no token of its own ("# раз(-а)"): listed.
    const sibling = siblings.get(mod.matchStr)!.filter((line) => !mine.includes(line));
    if (sibling.some((line) => regex.test(shown(line)))) shared.push(mod.matchStr);
    for (const line of lines) {
      if (mine.includes(line) || sibling.includes(line)) continue;
      expect(regex.test(shown(line)), `${token} (${mod.matchStr}) also matches "${line}"`).toBe(false);
    }
  }
  return { mods, without, shared };
}

const config = (stats: Array<[string, string]>, profile = 1) => ({
  profile,
  showNewStats: false,
  selectedStats: stats.map(([matcher, decision]) => ({ matcher, decision })),
});

describe('map rolling regex, English', () => {
  beforeAll(loadGameDataFromDisk);

  it('gives every map mod a token that matches only that mod', () => {
    const { mods, without, shared } = checkAllTokens('en');
    expect(mods).toBeGreaterThan(300);
    expect(without).toEqual([]);
    expect(shared).toEqual([]); // increased and reduced never share a token
  });

  it('excludes maps with mods marked deadly, or deadly and warning, in the current profile', () => {
    const marks = config([
      ['Players have #% less Recovery Rate of Life and Energy Shield', 'dw-'],
      ['Players have #% to all maximum Resistances', 'w--'],
      ['Monsters reflect #% of Elemental Damage', 'd--'],
      ['Area contains two Unique Bosses', 'g--'],
    ]);
    const deadly = mapRollingRegex(marks, ['d'], 'en');
    expect(deadly.text).toMatch(/^"!.+"$/);
    expect(deadly.missing).toEqual(['Monsters reflect #% of Elemental Damage']); // wording left the game
    const both = mapRollingRegex(marks, ['d', 'w'], 'en');
    expect(both.text.split('|').length).toBe(2);
    expect(mapRollingRegex({ ...marks, profile: 2 }, ['d'], 'en').text.split('|').length).toBe(0 + 1);
    expect(mapRollingRegex(config([]), ['d'], 'en').text).toBe('');
  });

  it('a real map: the regex catches its marked mod and spares a clean one', () => {
    const regex = mapRollingRegex(config([['Players have #% less Recovery Rate of Life and Energy Shield', 'd--']]), ['d'], 'en');
    const alternatives = new RegExp(regex.text.slice(2, -1), 'i');
    const map = [
      'Map Area: Strand',
      'Item Quantity: +82%',
      'Area contains two Unique Bosses',
      '40% more Monster Life',
      'Players have -10% to all maximum Resistances',
      'Players have 40% less Recovery Rate of Life and Energy Shield',
      'Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.',
    ];
    expect(map.some((line) => alternatives.test(line))).toBe(true);
    expect(map.filter((line) => !line.includes('Recovery')).some((line) => alternatives.test(line))).toBe(false);
  });

  it('says when the regex is longer than the game takes', () => {
    const many = allAreaMods().slice(0, 80).map((mod) => [mod.matchStr, 'd--'] as [string, string]);
    const regex = mapRollingRegex(config(many), ['d'], 'en');
    expect(regex.text.length).toBeGreaterThan(STASH_SEARCH_MAX_LENGTH);
    expect(regex.tooLong).toBe(true);
  });
});

describe('the "Map rolling" stash search group', () => {
  const groups = () => structuredClone(DEFAULT_STASH_SEARCH);

  it('adds the entry, then replaces its text on the next click', () => {
    const once = withMapRollingEntry(groups(), 'Non-deadly 1', '"!a|b"');
    const rolling = once.find((g) => g.title === 'Map rolling')!;
    expect(rolling.entries.at(-1)).toEqual({ id: 5, name: 'Non-deadly 1', text: '"!a|b"', hotkey: null });
    const twice = withMapRollingEntry(once, 'Non-deadly 1', '"!c"');
    const again = twice.find((g) => g.title === 'Map rolling')!;
    expect(again.entries.length).toBe(rolling.entries.length);
    expect(again.entries.at(-1)?.text).toBe('"!c"');
    expect(twice.find((g) => g.title === 'Dump sorting')).toEqual(groups()[1]);
  });

  it('keeps three pairs, named once in the interface language, however often the buttons are clicked', () => {
    let out = groups();
    const defaults = out.find((g) => g.title === 'Map rolling')!.entries.length;
    // First round in English, then the interface language changes: the same six entries get updated.
    (['en', 'uk', 'ru'] as const).forEach((language, round) => {
      for (const profile of [1, 2, 3]) {
        for (const withWarnings of [false, true]) {
          const { name, known } = mapRollingEntryName(withWarnings, profile, language);
          out = withMapRollingEntry(out, name, `"!r${round}"`, known);
        }
      }
    });
    const entries = out.find((g) => g.title === 'Map rolling')!.entries.slice(defaults);
    expect(entries.map((e) => e.name)).toEqual(['Non-deadly 1', 'Non warn-deadly 1', 'Non-deadly 2', 'Non warn-deadly 2', 'Non-deadly 3', 'Non warn-deadly 3']);
    expect(entries.every((e) => e.text === '"!r2"')).toBe(true);
  });

  it('names a new entry in the interface language', () => {
    const { name, known } = mapRollingEntryName(true, 2, 'uk');
    const out = withMapRollingEntry(groups(), name, '"!a"', known);
    expect(out.find((g) => g.title === 'Map rolling')!.entries.at(-1)?.name).toBe('Без warn-deadly 2');
  });

  it('makes the group when the user removed it', () => {
    const out = withMapRollingEntry(groups().slice(1), 'Non-deadly 2', '"!a"');
    expect(out.at(-1)).toEqual({ id: 3, title: 'Map rolling', enableHotkeys: true, entries: [{ id: 1, name: 'Non-deadly 2', text: '"!a"', hotkey: null }] });
  });
});

describe('map rolling regex, Russian', () => {
  beforeAll(() => loadGameDataInLanguage('ru'));

  it('gives every map mod a token that matches only that mod', () => {
    const { mods, without, shared } = checkAllTokens('ru');
    expect(mods).toBeGreaterThan(300);
    expect(without).toEqual([]);
    // Only this wording, which differs from its twin in "(-а)" alone, shares the twin's token.
    expect(shared).toEqual(['Обновление даров в алтарях Ритуала на ваших картах дополнительно # раз(-а) ничего не стоит']);
  });
});
