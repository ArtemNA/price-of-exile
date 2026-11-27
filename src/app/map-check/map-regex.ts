// Stash search regex that skips maps with marked mods (owner, 27.11.2026): "!tok1|tok2|…", where
// each token is the shortest piece of a mod's text found in no other line a map can show. The
// stash search reads a map's advanced text (owner's probe in the game, 27.11.2026: affix names,
// reminder texts, roll ranges "35(35-45)%" and " — Unscalable Value" all match), so the corpus has
// those too, besides other map mods and implicits, properties, base and area names. Our own
// generator over our game data; the idea is the one poe.re uses, none of its (AGPL) code or data.

import { CLIENT_STRINGS as _$, ITEMS_ITERATOR, STATS_ITERATOR } from '@/assets/data';
import type { MapCheckConfig } from '@/web/map-check/common';
import type { StashSearchGroup } from '../core/settings';
import { ELDRITCH_IMPLICIT_RANKS, MAP_ROLLING_ENTRY_NAMES, MAP_SEARCH_EXTRA_LINES, STASH_SEARCH_MAX_LENGTH, type UiLang } from '../constants';
import { MAP_SEARCH_LINES } from './map-search-lines';
import type { Decision } from './map-check';

/**
 * Characters a token must not contain: regex syntax, the search's quotes and digits (a literal "100"
 * could be any rolled number elsewhere); `+` and `#` are rewritten.
 */
const UNSAFE = /[.*?^${}()|[\]\\"\d]/;

/** A line as the index keeps it: lowercased, every number (rolled or literal) as `#`. */
const normalise = (text: string) => text.toLowerCase().replace(/\d+(?:\.\d+)?/g, '#');

/**
 * A number in a token. The game may show a sign the data's wording leaves out: "Monsters have #%
 * Chance to Block" is "+50%" on the map, so a plain `\d+` after the space never matched (owner's
 * stash, 27.11.2026). The advanced text the stash search reads also has the roll's range,
 * "35(35-45)%", and fractions ("0.5"): a run of signs, digits, dots and brackets takes them all.
 */
const NUMBER = '[-+\\d.()]+';

/** A piece of a mod line as a regex: numbers (`#`) as {@link NUMBER}, a literal `+` escaped. */
function toToken(piece: string): string {
  return piece.replaceAll('+', '\\+').replaceAll('#', NUMBER);
}

/** How the game may show a line's numbers: plain, signed, a fraction, with the roll's range. */
const SHOWN_NUMBERS = ['17', '+17', '-17', '0.5', '17(15-20)', '+17(15-20)', '-17(-20--15)'];
/** Substrings indexed up to this length; longer candidates are checked line by line. */
const INDEXED = 16;

type Where = 'start' | 'end' | 'exact' | 'inside';

/**
 * A line's end in a token, used only when a mod has no other token: the end of the line, or the
 * " — Unscalable Value" the game may add after it (which mods get it is not in our data).
 */
const LINE_END = '( —|$)';

interface Corpus {
  /** Every line a map can show, lowercased, numbers as `#`. */
  lines: string[];
  /** Line texts per area mod matcher (its own lines never block its token). */
  own: Map<string, string[]>;
  /** Line texts of every wording of the matcher's stat ("# раз" and "# раз(-а)"). */
  siblings: Map<string, string[]>;
  /** Stats (by ref) whose mods hold the line; "" for a line that is no map mod's. */
  owners: Map<string, Set<string>>;
  /** The stat (ref) of each area mod matcher. */
  statOf: Map<string, string>;
  inside: Map<string, Set<string>>;
  starts: Map<string, Set<string>>;
  ends: Map<string, Set<string>>;
  names: WordGap[];
}

function add(index: Map<string, Set<string>>, key: string, line: string): void {
  const set = index.get(key);
  if (set) set.add(line);
  else index.set(key, new Set([line]));
}

/** A literal prefix of a client-string pattern: "^Blighted (.*)$" -> "Blighted ". */
function patternPrefix(pattern: RegExp): string {
  return pattern.source.replace(/^\^/, '').replace(/\(\.\*\)\$$/, '').replace(/\\\(\(\?<\w+>.*$/, '');
}

/**
 * `name` as a client-string pattern of a name dresses it: "^Superior (.*)$" -> "Superior Dunes Map",
 * ru "^(.*) высокого качества$" -> "Карта дюн высокого качества"; of alternatives the first.
 */
function nameWith(pattern: RegExp, name: string): string {
  return pattern.source
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\(\?:([^|)]*)[^)]*\)/g, '$1')
    .replace(/\\u00a0\*|\\u00a0/g, '')
    .replace(/\(\.\*\??\)/, name);
}

/** The " (Tier #)" a map's name may end in, from its client-string pattern. */
function tierSuffix(pattern: RegExp): string {
  return pattern.source.replace('(\\d+)', '#').replace(/\\([().])/g, '$1').replace(/\$$/, '');
}

export interface MapLines {
  lines: string[];
  /** Map base names as shown, with their prefixes ("Blighted Dunes Map"), for magic map names. */
  mapNames: string[];
  own: Map<string, string[]>;
  siblings: Map<string, string[]>;
  owners: Map<string, Set<string>>;
  statOf: Map<string, string>;
}

/** Every line of a map's (advanced) text, from the loaded game data in `language`; exported for tests. */
export function mapLines(language: string): MapLines {
  const own = new Map<string, string[]>();
  const siblings = new Map<string, string[]>();
  const statOf = new Map<string, string>();
  const owners = new Map<string, Set<string>>();
  const addLine = (line: string, owner = '') => {
    const set = owners.get(line);
    if (set) set.add(owner);
    else owners.set(line, new Set([owner]));
  };
  for (const stat of STATS_ITERATOR('AreaMods')) {
    if (!stat.fromAreaMods) continue;
    const all = stat.matchers.flatMap((matcher) => matcher.string.split('\n').map(normalise));
    for (const matcher of stat.matchers) {
      const parts = matcher.string.split('\n').map(normalise);
      own.set(matcher.string, parts);
      siblings.set(matcher.string, all);
      statOf.set(matcher.string, stat.ref);
      parts.forEach((line) => addLine(line, stat.ref));
    }
  }
  // Map implicits (Eldritch influence, atlas passives): found by the English stat ref.
  for (const stat of STATS_ITERATOR('implicit')) {
    if (stat.fromAreaMods || !/\b(Maps?|Area)\b/.test(stat.ref) || /\bArea (of Effect|Damage)\b/.test(stat.ref)) continue;
    for (const matcher of stat.matchers) matcher.string.split('\n').forEach((line) => addLine(normalise(line)));
  }
  // Other stats a map may carry ("Area contains an additional unstable Breach", "Map has # additional
  // Synthesis Global Modifiers"): every non-map-mod stat whose English ref starts like a map line.
  for (const prefix of ['"ref":"Area ', '"ref":"Map ']) {
    for (const stat of STATS_ITERATOR(prefix)) {
      if (stat.fromAreaMods || !/^(Area|Map) /.test(stat.ref)) continue;
      for (const matcher of stat.matchers) matcher.string.split('\n').forEach((line) => addLine(normalise(line)));
    }
  }
  const fixed: string[] = [
    `${_$.MAP_ITEM_QUANTITY}+#%`,
    `${_$.MAP_ITEM_RARITY}+#%`,
    `${_$.MAP_MONSTER_PACK_SIZE}+#%`,
    `${_$.MAP_ATLAS_DROPS}+#%`,
    `${_$.MAP_MORE_MAPS}+#%`,
    `${_$.MAP_MORE_THREADS}+#%`,
    `${_$.MAP_MORE_CURRENCY}+#%`,
    `${_$.MAP_MORE_DIVINATION_CARDS}+#%`,
    `${_$.QUALITY}+#%`,
    `${_$.AREA_LEVEL}#`,
    `${_$.ITEM_LEVEL}#`,
    `${_$.MEMORY_STRANDS}#`,
    `${_$.RARITY}${_$.RARITY_NORMAL}`,
    `${_$.RARITY}${_$.RARITY_MAGIC}`,
    `${_$.RARITY}${_$.RARITY_RARE}`,
    `${_$.RARITY}${_$.RARITY_UNIQUE}`,
    _$.CORRUPTED,
    _$.TWICE_CORRUPTED,
    _$.UNIDENTIFIED,
    _$.MIRRORED,
    _$.SPLIT,
    _$.ITEM_EATER,
    _$.ITEM_EXARCH,
    _$.MAP_DESCRIPTION,
    // "Monsters cannot be Stunned — Unscalable Value" dimmed a clean map for the token "uns".
    _$.UNSCALABLE_VALUE,
    // The advanced text's affix header: { Prefix Modifier "Antagonist's" (Tier: 1) — Attack, Speed }.
    _$.PREFIX_MODIFIER,
    _$.SUFFIX_MODIFIER,
    _$.CRAFTED_PREFIX,
    _$.CRAFTED_SUFFIX,
    _$.IMPLICIT_MODIFIER,
    _$.CORRUPTED_IMPLICIT,
    _$.VESTIGIAL_IMPLICIT,
    _$.FOULBORN_MODIFIER,
    _$.FRACTURED_PREFIX,
    _$.FRACTURED_SUFFIX,
    `${patternPrefix(_$.MAP_COMPLETION_REWARD)}`,
    ...MAP_SEARCH_EXTRA_LINES,
  ];
  for (const header of [_$.EATER_IMPLICIT, _$.EXARCH_IMPLICIT]) {
    fixed.push(patternPrefix(header), ...ELDRITCH_IMPLICIT_RANKS.map((rank) => `${patternPrefix(header)}(${rank})`));
  }
  const tierWord = /\\\(([^:\\]+): \(\?<tier>/.exec(_$.MODIFIER_LINE.source)?.[1];
  if (tierWord) fixed.push(`(${tierWord}: #)`);
  const rankWord = /\\\(([^:\\]+): \(\?<rank>/.exec(_$.MODIFIER_LINE.source)?.[1];
  if (rankWord) fixed.push(`(${rankWord}: #)`);
  const extra = MAP_SEARCH_LINES[language];
  if (extra) {
    for (const name of extra.names) fixed.push(`"${name}"`, `${_$.PREFIX_MODIFIER} "${name}"`, `${_$.SUFFIX_MODIFIER} "${name}"`);
    fixed.push(...extra.tags, ...extra.tagLines.map((tags) => `— ${tags}`), ...extra.reminders, ...extra.properties, ...extra.descriptions);
    // Rare names are two of these words; each word is a line, tokens across the gap are checked apart.
    fixed.push(...extra.rarePrefixes, ...extra.rareSuffixes);
  }
  // A few descriptions hold a line break: each line apart, as the game shows them.
  fixed.flatMap((line) => line.split(/\r?\n/)).forEach((line) => addLine(normalise(line)));
  // The map's name: "Strand Map", "Blighted Strand Map", "Strand Map (Tier 16)", and the area itself.
  const bases = [...ITEMS_ITERATOR('"craftable":{"category":"Map"}')].map((item) => item.name);
  bases.push(...(extra?.bases ?? []));
  // Unique maps: "Acton's Nightmare" and the like.
  for (const unique of ITEMS_ITERATOR('"unique":{"base":"Map"}')) addLine(normalise(unique.name));
  for (const area of ITEMS_ITERATOR('"namespace":"AREA"')) {
    addLine(normalise(area.name));
    addLine(normalise(`${_$.MAP_AREA}${area.name}`));
    bases.push(`${area.name} Map`);
  }
  const mapNames: string[] = [];
  for (const base of bases) {
    // Blighted, Blight-ravaged, with quality ("Superior Dunes Map"), Synthesised: as the language words them.
    const dressed = [_$.MAP_BLIGHTED, _$.MAP_BLIGHT_RAVAGED, _$.ITEM_SUPERIOR, _$.ITEM_SYNTHESISED].map((pattern) => nameWith(pattern, base));
    for (const name of [base, ...dressed]) {
      mapNames.push(name);
      addLine(normalise(name));
      addLine(normalise(`${name}${tierSuffix(_$.MAP_TIER)}`));
    }
  }
  return { lines: [...owners.keys()], mapNames, own, siblings, owners, statOf };
}

/**
 * Words that stand side by side in a map's name: a rare name is two words ("Nebulous Grind"), a magic
 * map's name is an affix name, the base and another affix name ("Hexproof Mesa Map of Antagonism",
 * review round 4). Each word alone is a corpus line; this covers a piece that starts in the first
 * word and ends in the second, for every pair, without listing the pairs.
 */
interface WordGap {
  /** Every ending of a first word (whole words too), and the whole first words. */
  firstEnds: Set<string>;
  firstWords: Set<string>;
  /** Every beginning of a second word (whole words too), and the whole second words. */
  secondStarts: Set<string>;
  secondWords: Set<string>;
}

function wordGap(first: string[], second: string[]): WordGap {
  const firstWords = new Set(first.map(normalise));
  const secondWords = new Set(second.map(normalise));
  const firstEnds = new Set([...firstWords].flatMap((word) => [...word].map((_, at) => word.slice(at))));
  const secondStarts = new Set([...secondWords].flatMap((word) => [...word].map((_, at) => word.slice(0, at + 1))));
  return { firstEnds, firstWords, secondStarts, secondWords };
}

/** The gaps in map names: rare names, and affix names next to the base on either side (any language's order). */
function nameGaps(language: string, mapNames: string[]): WordGap[] {
  const extra = MAP_SEARCH_LINES[language];
  if (!extra) return [];
  return [wordGap(extra.rarePrefixes, extra.rareSuffixes), wordGap(extra.names, mapNames), wordGap(mapNames, extra.names)];
}

/** True when `piece`, placed as `where` says, can be read across a gap of a map's name. */
function crossesNameGap(gaps: WordGap[], piece: string, where: Where): boolean {
  for (let at = piece.indexOf(' '); at > 0; at = piece.indexOf(' ', at + 1)) {
    const first = piece.slice(0, at);
    const second = piece.slice(at + 1);
    if (!second) continue;
    for (const gap of gaps) {
      const firstOk = where === 'start' || where === 'exact' ? gap.firstWords.has(first) : gap.firstEnds.has(first);
      const secondOk = where === 'end' || where === 'exact' ? gap.secondWords.has(second) : gap.secondStarts.has(second);
      if (firstOk && secondOk) return true;
    }
  }
  return false;
}

function buildCorpus(language: string): Corpus {
  const { lines, mapNames, own, siblings, owners, statOf } = mapLines(language);
  const names = nameGaps(language, mapNames);
  const inside = new Map<string, Set<string>>();
  const starts = new Map<string, Set<string>>();
  const ends = new Map<string, Set<string>>();
  for (const line of lines) {
    for (let length = 1; length <= INDEXED; length++) {
      if (length <= line.length) {
        add(starts, line.slice(0, length), line);
        add(ends, line.slice(-length), line);
      }
      for (let at = 0; at + length <= line.length; at++) add(inside, line.slice(at, at + length), line);
    }
  }
  return { lines, own, siblings, owners, statOf, inside, starts, ends, names };
}

/** Lines holding `piece` (at the start, the end, as the whole line, or anywhere); short pieces from the index. */
function holders(corpus: Corpus, piece: string, where: Where): Iterable<string> {
  if (where === 'exact') return corpus.lines.filter((line) => line === piece);
  if (piece.length <= INDEXED) {
    const index = where === 'start' ? corpus.starts : where === 'end' ? corpus.ends : corpus.inside;
    return index.get(piece) ?? [];
  }
  return corpus.lines.filter((line) => (where === 'start' ? line.startsWith(piece) : where === 'end' ? line.endsWith(piece) : line.includes(piece)));
}

/**
 * The shortest token only this wording matches; failing that, one shared with the other wordings of
 * the same stat (they differ in a regex character only). Null when there is none.
 *
 * A line another stat's mod also has ("Monsters' Action Speed …" alone, and as the first line of the
 * Action + Movement Speed mod) first counts as someone else's, so the token sits in a line only this
 * stat has. Only a mod made of such shared lines alone takes a token from them: the stash cannot
 * tell those maps apart.
 */
function shortestToken(corpus: Corpus, matcher: string): string | null {
  const ownLines = corpus.own.get(matcher);
  if (!ownLines) return null;
  const stat = corpus.statOf.get(matcher);
  const siblingLines = corpus.siblings.get(matcher) ?? ownLines;
  const onlyThisStat = (lines: string[]) =>
    new Set(lines.filter((line) => [...(corpus.owners.get(line) ?? [])].every((owner) => owner === stat)));
  // A line's end only when nothing else works (a wording held whole in a longer line, "Chest Marker"
  // in "Chest Markers"); a token shared with the stat's other wordings only after that.
  for (const [alone, withSiblings] of [
    [onlyThisStat(ownLines), onlyThisStat(siblingLines)],
    [new Set(ownLines), new Set(siblingLines)],
  ]) {
    const token =
      tokenWithin(corpus, ownLines, alone, false) ??
      tokenWithin(corpus, ownLines, alone, true) ??
      tokenWithin(corpus, ownLines, withSiblings, false) ??
      tokenWithin(corpus, ownLines, withSiblings, true);
    if (token) return token;
  }
  return null;
}

/** A line with its numbers as the game may show them. */
export function shownLines(line: string): string[] {
  return SHOWN_NUMBERS.map((number) => line.replaceAll('#', number));
}

/** True when `token` matches no line outside `mine`, with numbers filled in as the game shows them. */
function matchesNoOther(corpus: Corpus, token: string, mine: Set<string>): boolean {
  const regex = new RegExp(token, 'i');
  return corpus.lines.every((line) => mine.has(line) || !shownLines(line).some((shown) => regex.test(shown)));
}

/** The shortest token found in ownLines that no line outside mine holds; `withEnd` allows {@link LINE_END}. */
function tokenWithin(corpus: Corpus, ownLines: string[], mine: Set<string>, withEnd: boolean): string | null {
  // The index compares text; a number's pattern also takes signs and brackets ("+#" of another mod),
  // so such a token is run as the game runs it over every other line too.
  const unique = (piece: string, where: Where, token: string) =>
    [...holders(corpus, piece, where)].every((line) => mine.has(line)) &&
    !crossesNameGap(corpus.names, piece, where) &&
    (!piece.includes('#') || matchesNoOther(corpus, token, mine));
  let best: string | null = null;
  for (const line of ownLines) {
    // Any piece of the line; a number placeholder inside it becomes NUMBER in the token.
    for (let length = 1; length <= line.length; length++) {
      if (best && length >= best.length) break;
      for (let at = 0; at + length <= line.length; at++) {
        const piece = line.slice(at, at + length);
        if (UNSAFE.test(piece) || /^\s|\s$/.test(piece)) continue;
        // A number at an edge only with an anchor there ("^\d+% chance"): unanchored it would match any number.
        const numberFirst = /^[#+-]/.test(piece);
        const numberLast = /[#+-]$/.test(piece);
        const token = toToken(piece);
        const options: Array<[string, Where]> = [];
        // Not a bare `$`: the game may add " — Unscalable Value" after a mod (owner, 27.11.2026).
        if (!numberFirst && !numberLast) options.push([token, 'inside']);
        if (at === 0 && !numberLast) options.push([`^${token}`, 'start']);
        if (withEnd && at + length === line.length && !numberFirst) options.push([`${token}${LINE_END}`, 'end']);
        if (withEnd && at === 0 && at + length === line.length) options.push([`^${token}${LINE_END}`, 'exact']);
        for (const [candidate, where] of options) {
          if ((!best || candidate.length < best.length) && unique(piece, where, candidate)) best = candidate;
        }
      }
    }
  }
  return best;
}

let cached: { language: string; corpus: Corpus; tokens: Map<string, string | null> } | undefined;

/**
 * Token of a map mod matcher; null when it has none or is unknown. `language` must be the language
 * of the loaded game data. A corpus built before the data is in (no map mods) is not kept.
 */
export function mapModToken(matcher: string, language: string): string | null {
  if (cached?.language !== language) {
    const corpus = buildCorpus(language);
    if (!corpus.own.size) return null;
    cached = { language, corpus, tokens: new Map() };
  }
  if (!cached.tokens.has(matcher)) cached.tokens.set(matcher, shortestToken(cached.corpus, matcher));
  return cached.tokens.get(matcher)!;
}

export interface MapRegex {
  /** The stash search text, `"!a|b"`; empty when nothing is marked. */
  text: string;
  /** Marked mods without a token (wording no longer in the data, or no unique piece): not excluded. */
  missing: string[];
  tooLong: boolean;
}

/** Excludes maps with any mod marked `decisions` in the current profile. */
export function mapRollingRegex(config: MapCheckConfig, decisions: Decision[], language: string): MapRegex {
  const tokens = new Set<string>();
  const missing: string[] = [];
  for (const entry of config.selectedStats) {
    if (!decisions.includes(entry.decision[config.profile - 1] as Decision)) continue;
    const token = mapModToken(entry.matcher, language);
    if (token) tokens.add(token);
    else missing.push(entry.matcher);
  }
  const text = tokens.size ? `"!${[...tokens].sort().join('|')}"` : '';
  return { text, missing, tooLong: text.length > STASH_SEARCH_MAX_LENGTH };
}

/** The stash search group the regexes go to (the default group's title). */
export const MAP_ROLLING_GROUP = 'Map rolling';

/**
 * Entry of a profile and kind: three pairs, "Non-deadly 1" / "Non warn-deadly 1" … (owner,
 * 27.11.2026). `name` is in the interface language, used only when the entry is made; `known` is
 * the name in every interface language, so a later click updates that entry instead of adding one.
 */
export function mapRollingEntryName(withWarnings: boolean, profile: number, language: UiLang): { name: string; known: string[] } {
  const of = (names: { deadly: string; warnDeadly: string }) => `${withWarnings ? names.warnDeadly : names.deadly} ${profile}`;
  return { name: of(MAP_ROLLING_ENTRY_NAMES[language]), known: Object.values(MAP_ROLLING_ENTRY_NAMES).map(of) };
}

/**
 * Puts `text` into the "Map rolling" group: updates the text of the entry named any of `known`
 * (keeping its name), else adds one named `name`; makes the group when there is none.
 */
export function withMapRollingEntry(groups: StashSearchGroup[], name: string, text: string, known: string[] = [name]): StashSearchGroup[] {
  const group = groups.find((g) => g.title === MAP_ROLLING_GROUP);
  if (!group) {
    const id = Math.max(0, ...groups.map((g) => g.id)) + 1;
    return [...groups, { id, title: MAP_ROLLING_GROUP, enableHotkeys: true, entries: [{ id: 1, name, text, hotkey: null }] }];
  }
  const existing = group.entries.find((entry) => known.includes(entry.name));
  const entries = existing
    ? group.entries.map((entry) => (entry === existing ? { ...entry, text } : entry))
    : [...group.entries, { id: Math.max(0, ...group.entries.map((entry) => entry.id)) + 1, name, text, hotkey: null }];
  return groups.map((g) => (g === group ? { ...g, entries } : g));
}
