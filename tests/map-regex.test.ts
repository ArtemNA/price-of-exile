// Map rolling regex (owner, 27.11.2026): our own generator of short unique tokens per map mod.
// Every token is compiled as the game would use it and run over every line a map can show, with
// numbers filled in: it must match its own mod and nothing else.
import { beforeAll, describe, expect, it } from 'vitest';
import { allAreaMods } from '../src/app/map-check/map-check';
import { mapLines, mapModToken, mapRollingEntryName, mapRollingRegex, shownLines, withMapRollingEntry } from '../src/app/map-check/map-regex';
import { DEFAULT_STASH_SEARCH, STASH_SEARCH_MAX_LENGTH } from '../src/app/constants';
import { CLIENT_STRINGS, ITEMS_ITERATOR } from '@/assets/data';
import { MAP_SEARCH_LINES } from '../src/app/map-check/map-search-lines';
import { loadGameDataFromDisk, loadGameDataInLanguage } from './game-data';

/** A line as the game may show it: numbers filled in, with or without " — Unscalable Value" after it. */
const variants = (line: string) => shownLines(line).flatMap((text) => [text, text + CLIENT_STRINGS.UNSCALABLE_VALUE]);

function checkAllTokens(language: string): { mods: number; without: string[]; shared: string[] } {
  const { lines, own, siblings } = mapLines(language);
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
    // The game may show the number signed although the wording has none ("+50% Chance to Block"),
    // a fraction, and " — Unscalable Value" after the mod: every way must match.
    for (let at = 0; at < variants('#').length; at++) {
      expect(mine.some((line) => regex.test(variants(line)[at])), `${token} ⇢ own ${mod.matchStr} (${variants('#')[at]})`).toBe(true);
    }
    // Other wordings of the same stat only when this one has no token of its own ("# раз(-а)"): listed.
    const sibling = siblings.get(mod.matchStr)!.filter((line) => !mine.includes(line));
    if (sibling.some((line) => variants(line).some((text) => regex.test(text)))) shared.push(mod.matchStr);
    for (const line of lines) {
      if (mine.includes(line) || sibling.includes(line)) continue;
      expect(variants(line).some((text) => regex.test(text)), `${token} (${mod.matchStr}) also matches "${line}"`).toBe(false);
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
  }, 60_000);

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
    expect(mapRollingRegex({ ...marks, profile: 2 }, ['d'], 'en').text).toBe(''); // profile 2 has no deadly mark
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

  it("the owner's stash: a deadly mod the game shows signed is excluded (27.11.2026)", () => {
    const regex = mapRollingRegex(config([['Monsters have #% Chance to Block Attack Damage', 'd--']]), ['d', 'w'], 'en');
    const alternatives = new RegExp(regex.text.slice(2, -1), 'i');
    expect(alternatives.test('Monsters have +50% Chance to Block Attack Damage')).toBe(true);
    expect(alternatives.test('Monsters have 50% chance to Block Attack Damage')).toBe(true);
    const clean = ['Area contains Labyrinth Hazards', 'Monsters have 680% increased Critical Strike Chance', '+75% to Monster Critical Strike Multiplier', 'Players have 30% less Armour', 'Players have 40% reduced Chance to Block', 'Monsters Maim on Hit with Attacks'];
    expect(clean.filter((line) => alternatives.test(line))).toEqual([]);
  });

  it("the owner's stash: a clean map stays lit although the game adds \"— Unscalable Value\" (27.11.2026)", () => {
    const marks = config([
      ['Area contains Unstable Tentacle Fiends', 'd--'],
      ['Area contains Runes of the Searing Exarch', 'd--'],
      ['Area contains Drowning Orbs', 'w--'],
      ['Players cannot Regenerate Life, Mana or Energy Shield', 'd--'],
    ]);
    const alternatives = new RegExp(mapRollingRegex(marks, ['d', 'w'], 'en').text.slice(2, -1), 'i');
    const clean = [
      'Unique Bosses are Possessed',
      'Monsters cannot be Stunned — Unscalable Value',
      "Monsters' Action Speed cannot be modified to below Base Value",
      'Monsters have 70% chance to Avoid Elemental Ailments',
      'Monsters gain a Frenzy Charge on Hit',
    ];
    expect(clean.filter((line) => alternatives.test(line))).toEqual([]);
    expect(alternatives.test('Area contains Unstable Tentacle Fiends')).toBe(true);
  });

  it('a token never dims a map with only another stat\'s mod, unless that mod holds all its lines', () => {
    // Independent of the corpus: every pair of mods of different stats, as the game prints them.
    const { own, statOf } = mapLines('en');
    const mods = [...own.keys()];
    const unavoidable: string[] = [];
    for (const marked of mods) {
      const regex = new RegExp(mapModToken(marked, 'en')!, 'i');
      for (const other of mods) {
        if (statOf.get(other) === statOf.get(marked)) continue;
        if (!own.get(other)!.some((line) => variants(line).some((text) => regex.test(text)))) continue;
        // Allowed only when the marked mod has no line of its own: each of its lines is another stat's.
        const noOwnLine = own.get(marked)!.every((line) => mods.some((m) => statOf.get(m) !== statOf.get(marked) && own.get(m)!.includes(line)));
        expect(noOwnLine, `${mapModToken(marked, 'en')} (${marked}) dims a map with "${other}"`).toBe(true);
        unavoidable.push(`${marked.replaceAll('\n', ' / ')} → ${other.replaceAll('\n', ' / ')}`);
      }
    }
    // The stash cannot tell these apart; the list is exact so a new case shows up here.
    expect(unavoidable.sort()).toMatchInlineSnapshot(`
      [
        "Monsters' Action Speed cannot be modified to below Base Value / Monsters' Movement Speed cannot be modified to below Base Value → Monsters' Movement Speed cannot be modified to below Base Value",
        "Monsters' Action Speed cannot be modified to below Base Value → Monsters' Action Speed cannot be modified to below Base Value / Monsters' Movement Speed cannot be modified to below Base Value",
        "Monsters' Movement Speed cannot be modified to below Base Value → Monsters' Action Speed cannot be modified to below Base Value / Monsters' Movement Speed cannot be modified to below Base Value",
      ]
    `);
  }, 60_000);

  it('no token matches affix names, tags, reminders or map names, taken straight from the data', () => {
    const extra = MAP_SEARCH_LINES.en;
    const texts = [
      // Each affix name with each real tag line, as the advanced header shows them.
      ...extra.names.flatMap((name) => extra.tagLines.map((tags) => `{ Prefix Modifier "${name}" (Tier: 1) — ${tags} }`)),
      ...extra.reminders,
      ...extra.properties.map((line) => line.replace('#', '16')),
      ...[...ITEMS_ITERATOR('"namespace":"AREA"')].flatMap((area) => [`${area.name} Map`, `Blighted ${area.name} Map`, `Blight-ravaged ${area.name} Map (Tier 16)`]),
    ];
    const hits = allAreaMods().flatMap((mod) => {
      const regex = new RegExp(mapModToken(mod.matchStr, 'en')!, 'i');
      return texts.filter((text) => regex.test(text)).map((text) => `${mapModToken(mod.matchStr, 'en')} → ${text}`);
    });
    expect(hits).toEqual([]);
  }, 60_000);

  it('no token matches stats a map may carry that are no map mods (review round 3)', () => {
    const lines = ['Area contains an additional unstable Breach', 'Area contains additional waves of Raging Spirits', 'Area contains additional waves of Ravager Maws'];
    const hits = allAreaMods().flatMap((mod) => {
      const regex = new RegExp(mapModToken(mod.matchStr, 'en')!, 'i');
      return lines.filter((line) => regex.test(line)).map((line) => `${mapModToken(mod.matchStr, 'en')} → ${line}`);
    });
    expect(hits).toEqual([]);
  });

  it('no token matches a magic map name: affix name, base, affix name (review round 4)', () => {
    const { names } = MAP_SEARCH_LINES.en;
    const { mapNames } = mapLines('en');
    let seed = 86;
    const next = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    const magic = Array.from({ length: 30_000 }, () => `${names[next(names.length)]} ${mapNames[next(mapNames.length)]} ${names[next(names.length)]}`);
    const hits = allAreaMods().flatMap((mod) => {
      const token = mapModToken(mod.matchStr, 'en')!;
      const regex = new RegExp(token, 'i');
      const hit = magic.find((name) => regex.test(name));
      return hit ? [`${token} → ${hit}`] : [];
    });
    expect(hits).toEqual([]);
  }, 60_000);

  it('no token matches a rare map name made of the game\'s name words', () => {
    // "Nebulous Grind": a first word and a second word from the game's word lists; 20,000 seeded pairs.
    const { rarePrefixes, rareSuffixes } = MAP_SEARCH_LINES.en;
    let seed = 84;
    const next = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    const names = Array.from({ length: 20_000 }, () => `${rarePrefixes[next(rarePrefixes.length)]} ${rareSuffixes[next(rareSuffixes.length)]}`);
    const hits = allAreaMods().flatMap((mod) => {
      const token = mapModToken(mod.matchStr, 'en')!;
      const regex = new RegExp(token, 'i');
      const hit = names.find((name) => regex.test(name));
      return hit ? [`${token} → ${hit}`] : [];
    });
    expect(hits).toEqual([]);
  }, 60_000);

  it("the owner's map: its whole advanced text stays lit with the owner's marks (27.11.2026)", () => {
    const marks = config([
      ['Players have #% to all maximum Resistances', 'w--'],
      ['Players have #% less Recovery Rate of Life and Energy Shield', 'd--'],
      ['Players cannot Regenerate Life, Mana or Energy Shield', 'd--'],
      ['Monsters have #% Chance to Block Attack Damage', 'd--'],
      ['Auras from Player Skills which affect Allies also affect Enemies', 'w--'],
      ['Area contains Runes of the Searing Exarch', 'd--'],
      ['Area contains Unstable Tentacle Fiends', 'd--'],
      ['Area contains Drowning Orbs', 'w--'],
      ['Players have #% reduced effect of Non-Curse Auras from Skills', 'd--'],
      ['Players have #% less Defences', 'w--'],
      ['Players have #% reduced Maximum total Life, Mana and Energy Shield Recovery per second from Leech', 'w--'],
      ['Rare monsters in area are Shaper-Touched', 'w--'],
    ]);
    const alternatives = new RegExp(mapRollingRegex(marks, ['d', 'w'], 'en').text.slice(2, -1), 'i');
    // Ctrl+Alt+C of the owner's "Nebulous Grind": the text the stash search reads.
    const text = `Item Class: Maps
Rarity: Rare
Nebulous Grind
Nightmare Map
Atlas Drops: +81% (augmented)
Item Rarity: +95% (augmented)
Monster Pack Size: +31% (augmented)
More Currency: +47% (augmented)
Item Level: 84
Monster Level: 83
{ Prefix Modifier "Antagonist's" (Tier: 1) }
35(35-45)% increased number of Rare Monsters
Rare Monsters each have 1 additional Modifier
{ Prefix Modifier "Enthralled" (Tier: 1) }
Unique Bosses are Possessed
{ Prefix Modifier "Overlord's" — Attack, Caster, Speed }
Unique Boss deals 25% increased Damage
Unique Boss has 30% increased Attack and Cast Speed
{ Suffix Modifier "of the Juggernaut" (Tier: 1) }
Monsters cannot be Stunned — Unscalable Value
Monsters' Action Speed cannot be modified to below Base Value
Monsters' Movement Speed cannot be modified to below Base Value
{ Suffix Modifier "of Insulation" — Elemental, Fire, Cold, Lightning, Ailment }
Monsters have 70% chance to Avoid Elemental Ailments
(Elemental Ailments are Ignited, Scorched, Chilled, Frozen, Brittle, Shocked, and Sapped)
{ Suffix Modifier "of Frenzy" }
Monsters gain a Frenzy Charge on Hit
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.
Modifiable with Limited Currency`;
    expect(text.split('\n').filter((line) => alternatives.test(line))).toEqual([]);
    // With a range in the line the block mod still dims ("+50(40-50)%").
    expect(alternatives.test('Monsters have +50(40-50)% Chance to Block Attack Damage')).toBe(true);
    // A Nightmare Map is no Goatmen map.
    const goatmen = new RegExp(mapRollingRegex(config([['Area is inhabited by Goatmen', 'd--']]), ['d'], 'en').text.slice(2, -1), 'i');
    expect(['Nightmare Map', 'Blight-ravaged Strand Map', 'Mirrored', 'Twice Corrupted'].filter((line) => goatmen.test(line))).toEqual([]);
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

  it('no token matches Russian base names, properties, affix headers, reminders or rare names', () => {
    const extra = MAP_SEARCH_LINES.ru;
    let seed = 85;
    const next = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    const texts = [
      ...extra.bases,
      ...extra.properties.map((line) => line.replace('#', '16')),
      ...extra.names.flatMap((name) => extra.tagLines.map((tags) => `{ ${CLIENT_STRINGS.PREFIX_MODIFIER} "${name}" (Уровень: 1) — ${tags} }`)),
      ...extra.reminders,
      ...Array.from({ length: 20_000 }, () => `${extra.rarePrefixes[next(extra.rarePrefixes.length)]} ${extra.rareSuffixes[next(extra.rareSuffixes.length)]}`),
      // Magic map names, both word orders (the Russian order is not known).
      ...Array.from({ length: 20_000 }, () => {
        const base = extra.bases[next(extra.bases.length)];
        const name = extra.names[next(extra.names.length)];
        return next(2) ? `${name} ${base}` : `${base} ${name}`;
      }),
    ];
    const hits = allAreaMods().flatMap((mod) => {
      const token = mapModToken(mod.matchStr, 'ru')!;
      const regex = new RegExp(token, 'i');
      const hit = texts.find((text) => regex.test(text));
      return hit ? [`${token} → ${hit}`] : [];
    });
    expect(hits).toEqual([]);
  }, 60_000);

  it('gives every map mod a token that matches only that mod', () => {
    const { mods, without, shared } = checkAllTokens('ru');
    expect(mods).toBeGreaterThan(300);
    expect(without).toEqual([]);
    // Only this wording, which differs from its twin in "(-а)" alone, shares the twin's token.
    expect(shared).toEqual(['Обновление даров в алтарях Ритуала на ваших картах дополнительно # раз(-а) ничего не стоит']);
  }, 60_000);
});
