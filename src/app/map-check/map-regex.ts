// Stash search regex that skips maps with marked mods (owner, 27.11.2026): "!tok1|tok2|…", where
// each token is the shortest piece of a mod's text found in no other line a map can show (other
// map mods and map implicits, properties, the description, area names). Our own generator over our
// game data; the idea is the one poe.re uses, none of its (AGPL) code or data.

import { CLIENT_STRINGS as _$, ITEMS_ITERATOR, STATS_ITERATOR } from '@/assets/data';
import type { MapCheckConfig } from '@/web/map-check/common';
import type { StashSearchGroup } from '../core/settings';
import { MAP_ROLLING_ENTRY_NAMES, STASH_SEARCH_MAX_LENGTH, type UiLang } from '../constants';
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
 * stash, 27.11.2026). One optional character before the digits takes the sign.
 */
const NUMBER = '.?\\d+';

/** A piece of a mod line as a regex: numbers (`#`) as {@link NUMBER}, a literal `+` escaped. */
function toToken(piece: string): string {
  return piece.replaceAll('+', '\\+').replaceAll('#', NUMBER);
}

/** How the game may show a line's numbers: plain, signed. */
const SHOWN_NUMBERS = ['17', '+17', '-17'];
/** Substrings indexed up to this length; longer candidates are checked line by line. */
const INDEXED = 16;

type Where = 'start' | 'end' | 'exact' | 'inside';

interface Corpus {
  /** Every line a map can show, lowercased, numbers as `#`. */
  lines: string[];
  /** Line texts per area mod matcher (its own lines never block its token). */
  own: Map<string, string[]>;
  /** Line texts of every wording of the matcher's stat ("# раз" and "# раз(-а)"). */
  siblings: Map<string, string[]>;
  inside: Map<string, Set<string>>;
  starts: Map<string, Set<string>>;
  ends: Map<string, Set<string>>;
}

function add(index: Map<string, Set<string>>, key: string, line: string): void {
  const set = index.get(key);
  if (set) set.add(line);
  else index.set(key, new Set([line]));
}

/** The lines of a map's text, from the loaded game data (its language); exported for tests. */
export function mapLines(): { lines: string[]; own: Map<string, string[]>; siblings: Map<string, string[]> } {
  const own = new Map<string, string[]>();
  const siblings = new Map<string, string[]>();
  const lines = new Set<string>();
  for (const stat of STATS_ITERATOR('AreaMods')) {
    if (!stat.fromAreaMods) continue;
    const all = stat.matchers.flatMap((matcher) => matcher.string.split('\n').map(normalise));
    for (const matcher of stat.matchers) {
      const parts = matcher.string.split('\n').map(normalise);
      own.set(matcher.string, parts);
      siblings.set(matcher.string, all);
      parts.forEach((line) => lines.add(line));
    }
  }
  // Map implicits (Eldritch influence, atlas passives): found by the English stat ref.
  for (const stat of STATS_ITERATOR('implicit')) {
    if (stat.fromAreaMods || !/\b(Maps?|Area)\b/.test(stat.ref) || /\bArea (of Effect|Damage)\b/.test(stat.ref)) continue;
    for (const matcher of stat.matchers) matcher.string.split('\n').forEach((line) => lines.add(normalise(line)));
  }
  const fixed = [
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
    `${_$.RARITY}${_$.RARITY_NORMAL}`,
    `${_$.RARITY}${_$.RARITY_MAGIC}`,
    `${_$.RARITY}${_$.RARITY_RARE}`,
    `${_$.RARITY}${_$.RARITY_UNIQUE}`,
    _$.CORRUPTED,
    _$.UNIDENTIFIED,
    _$.MAP_DESCRIPTION,
  ];
  fixed.forEach((line) => lines.add(normalise(line)));
  for (const area of ITEMS_ITERATOR('"namespace":"AREA"')) {
    lines.add(normalise(area.name));
    lines.add(normalise(`${_$.MAP_AREA}${area.name}`));
  }
  return { lines: [...lines], own, siblings };
}

function buildCorpus(): Corpus {
  const { lines, own, siblings } = mapLines();
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
  return { lines, own, siblings, inside, starts, ends };
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
 */
function shortestToken(corpus: Corpus, matcher: string): string | null {
  const ownLines = corpus.own.get(matcher);
  if (!ownLines) return null;
  return tokenWithin(corpus, ownLines, new Set(ownLines)) ?? tokenWithin(corpus, ownLines, new Set(corpus.siblings.get(matcher)));
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

/** The shortest token found in ownLines that no line outside mine holds. */
function tokenWithin(corpus: Corpus, ownLines: string[], mine: Set<string>): string | null {
  // The index compares text; a number's `.?` also takes one more character ("+#" of another mod), so
  // such a token is run as the game runs it over every other line too.
  const unique = (piece: string, where: Where, token: string) =>
    [...holders(corpus, piece, where)].every((line) => mine.has(line)) && (!piece.includes('#') || matchesNoOther(corpus, token, mine));
  let best: string | null = null;
  for (const line of ownLines) {
    // Any piece of the line; a number placeholder inside it becomes `\d+` in the token.
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
        if (!numberFirst && !numberLast) options.push([token, 'inside']);
        if (at === 0 && !numberLast) options.push([`^${token}`, 'start']);
        if (at + length === line.length && !numberFirst) options.push([`${token}$`, 'end']);
        if (at === 0 && at + length === line.length) options.push([`^${token}$`, 'exact']);
        for (const [candidate, where] of options) {
          if ((!best || candidate.length < best.length) && unique(piece, where, candidate)) best = candidate;
        }
      }
    }
  }
  return best;
}

let cached: { language: string; corpus: Corpus; tokens: Map<string, string | null> } | undefined;

/** Token of a map mod matcher in the loaded game language; null when it has none or is unknown. */
export function mapModToken(matcher: string, language: string): string | null {
  if (cached?.language !== language) cached = { language, corpus: buildCorpus(), tokens: new Map() };
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
