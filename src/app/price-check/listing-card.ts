// The card of a listed item, drawn like the game's item tooltip when the pointer is over a listing
// row (Exiled Exchange 2 `parseFetchResult` + `TooltipItem.vue`, for PoE1). Everything comes from
// the item of the trade fetch result the row was made from: no extra requests.

/** Trade API colour index of a value: 0 default, 1 augmented, 2 unmet, 3 physical, 4 fire, 5 cold, 6 lightning, 7 chaos. */
export type ValueColour = number;

export interface CardValue {
  text: string;
  colour: ValueColour;
}

/** A property line: `parts` are plain text and coloured values in the order the game shows them. */
export interface CardProperty {
  parts: Array<string | CardValue>;
}

export type ModKind =
  | 'enchant'
  | 'scourge'
  | 'implicit'
  | 'fractured'
  | 'explicit'
  | 'crafted'
  | 'veiled'
  | 'crucible'
  | 'utility';

export interface CardMod {
  /** One entry per line of the mod text. */
  lines: string[];
  kind: ModKind;
  /** "P1", "S3", "P1 + S2" for a line made by two mods; none when the API gives none. */
  tier?: string;
}

export interface CardSocket {
  /** R, G, B, W, A (abyss), DV (delve). */
  colour: string;
  /** Linked to the next socket. */
  linkNext: boolean;
}

export type CardRarity = 'Normal' | 'Magic' | 'Rare' | 'Unique' | 'Gem' | 'Currency' | 'Other';

export interface ListingCard {
  /** [name, base] for rare and unique items, [type line] otherwise. */
  title: string[];
  rarity: CardRarity;
  icon: string;
  /** Size in inventory cells. */
  w: number;
  h: number;
  sockets: CardSocket[];
  properties: CardProperty[];
  /** "Item Level: 75". */
  itemLevel?: number;
  /** "Requires Level 65, 177 Str". */
  requirements: CardValue[][];
  /** Blocks between separators, in the game's order. */
  modBlocks: CardMod[][];
  flavour: string[];
  /** Footer lines: Unidentified, Corrupted, Mirrored, influences… */
  tags: string[];
}

/** Mod arrays of a fetched item, in the order the game draws them (blocks split where a separator goes). */
const MOD_BLOCKS: ReadonlyArray<ReadonlyArray<[field: string, kind: ModKind]>> = [
  [['enchantMods', 'enchant']],
  [['scourgeMods', 'scourge']],
  [['implicitMods', 'implicit']],
  [
    ['fracturedMods', 'fractured'],
    ['explicitMods', 'explicit'],
    ['craftedMods', 'crafted'],
    ['veiledMods', 'veiled'],
  ],
  [['crucibleMods', 'crucible']],
  [['utilityMods', 'utility']],
];

/** Extended `hashes` / `mods` keys of the older API form (mods as strings). */
const HASH_KEYS: Partial<Record<ModKind, string>> = {
  enchant: 'enchant',
  scourge: 'scourge',
  implicit: 'implicit',
  fractured: 'fractured',
  explicit: 'explicit',
  crafted: 'crafted',
  crucible: 'crucible',
};

const INFLUENCES: Record<string, string> = {
  shaper: 'Shaper Item',
  elder: 'Elder Item',
  crusader: 'Crusader Item',
  redeemer: 'Redeemer Item',
  hunter: 'Hunter Item',
  warlord: 'Warlord Item',
  searing: 'Searing Exarch Item',
  tangled: 'Eater of Worlds Item',
};

const RARITIES: Record<number, CardRarity> = { 0: 'Normal', 1: 'Magic', 2: 'Rare', 3: 'Unique', 4: 'Gem', 5: 'Currency' };

type Json = Record<string, any>;

/** Card of a fetched item; undefined when the item cannot be read (the row stays, just no card). */
export function listingCard(item: unknown): ListingCard | undefined {
  try {
    return parse(item as Json);
  } catch {
    return undefined;
  }
}

function parse(item: Json): ListingCard | undefined {
  if (!item || typeof item.typeLine !== 'string') return undefined;
  const rarity = RARITIES[item.frameType as number] ?? 'Other';
  const title = [item.name, item.typeLine].filter((part): part is string => typeof part === 'string' && part !== '');
  return {
    title,
    rarity,
    icon: typeof item.icon === 'string' ? item.icon : '',
    w: Number(item.w) || 1,
    h: Number(item.h) || 1,
    sockets: sockets(item.sockets),
    properties: properties(item),
    itemLevel: typeof item.ilvl === 'number' && item.ilvl > 0 ? item.ilvl : undefined,
    requirements: requirements(item.requirements),
    modBlocks: MOD_BLOCKS.map((block) => block.flatMap(([field, kind]) => mods(item, field, kind))).filter((b) => b.length > 0),
    flavour: Array.isArray(item.flavourText) ? item.flavourText.map((line: string) => line.replace(/\r/g, '')) : [],
    tags: tags(item),
  };
}

/** "[Quality]", "[Physical|Physical Damage]" → the visible text. */
export function stripMarkup(text: string): string {
  return text.replace(/\[([^\]|]*\|)?([^\]]*)\]/g, '$2');
}

function value(raw: unknown): CardValue {
  const [text, colour] = raw as [string, number];
  return { text: String(text), colour: Number(colour) || 0 };
}

/** One property in the game's layout (`displayMode` 0: "Name: v", 1: "v Name", 3: "%0" placeholders). */
function property(prop: Json): CardProperty {
  const name = stripMarkup(String(prop.name ?? ''));
  const values: CardValue[] = (prop.values ?? []).map(value);
  if (values.length === 0) return { parts: [name] };
  switch (prop.displayMode) {
    case 1:
      return { parts: [...values, ` ${name}`] };
    case 3: {
      const parts: Array<string | CardValue> = [];
      let rest = name;
      for (let match = /%(\d+)/.exec(rest); match; match = /%(\d+)/.exec(rest)) {
        if (match.index > 0) parts.push(rest.slice(0, match.index));
        const v = values[Number(match[1])];
        if (v) parts.push(v);
        rest = rest.slice(match.index + match[0].length);
      }
      if (rest) parts.push(rest);
      return { parts };
    }
    default:
      return { parts: [`${name}: `, ...values.flatMap((v, i) => (i > 0 ? [', ', v] : [v]))] };
  }
}

/** The game's properties, then DPS lines the trade site adds for weapons (blue when augmented). */
function properties(item: Json): CardProperty[] {
  const out = (Array.isArray(item.properties) ? item.properties : []).map(property);
  const ext = item.extended ?? {};
  const dps: Array<[key: string, label: string]> = [
    ['dps', 'DPS'],
    ['pdps', 'Physical DPS'],
    ['edps', 'Elemental DPS'],
  ];
  for (const [key, label] of dps) {
    if (typeof ext[key] === 'number' && ext[key] > 0) {
      out.push({ parts: [`${label}: `, { text: ext[key].toFixed(1), colour: ext[`${key}_aug`] ? 1 : 0 }] });
    }
  }
  return out;
}

/** "Level 65", "177 Str" — each requirement as its value and name in the game's order. */
function requirements(list: unknown): CardValue[][] {
  if (!Array.isArray(list)) return [];
  return list.map((req: Json) => {
    const name = stripMarkup(String(req.name ?? ''));
    const v = req.values?.[0] ? value(req.values[0]) : { text: '', colour: 0 };
    return req.displayMode === 1 ? [v, { text: ` ${name}`, colour: -1 }] : [{ text: `${name} `, colour: -1 }, v];
  });
}

function mods(item: Json, field: string, kind: ModKind): CardMod[] {
  const list = item[field];
  if (!Array.isArray(list)) return [];
  return list.map((mod: unknown, index: number): CardMod => {
    if (typeof mod === 'string') {
      // Older form: the text only; tiers through extended.hashes → extended.mods.
      return withTier({ lines: stripMarkup(mod).split('\n'), kind }, oldTier(item.extended, kind, index));
    }
    const m = mod as Json;
    const flags = m.flags ?? {};
    const own: ModKind = flags.crafted || m.domain === 'crafted' ? 'crafted' : flags.fractured || m.domain === 'fractured' ? 'fractured' : kind;
    const tiers = (Array.isArray(m.mods) ? m.mods : []).map((x: Json) => x.tier).filter((t: unknown): t is string => typeof t === 'string' && t !== '');
    return withTier({ lines: stripMarkup(String(m.description ?? '')).split('\n'), kind: own }, tiers.join(' + '));
  });
}

/** The game shows no tier on crafted (bench) mods; the API calls them "S0" / "P0". */
function withTier(mod: CardMod, tier: string | undefined): CardMod {
  return tier && mod.kind !== 'crafted' ? { ...mod, tier } : mod;
}

/** Older API form: `extended.hashes.<block>` lists, by display index, indexes into `extended.mods.<block>`. */
function oldTier(ext: Json | undefined, kind: ModKind, index: number): string | undefined {
  const key = HASH_KEYS[kind];
  const hashes = key && ext?.hashes?.[key];
  const defs = key && ext?.mods?.[key];
  if (!Array.isArray(hashes) || !Array.isArray(defs)) return undefined;
  const refs = hashes[index]?.[1];
  if (!Array.isArray(refs)) return undefined;
  const tiers = refs.map((i: number) => defs[i]?.tier).filter((t: unknown): t is string => typeof t === 'string' && t !== '');
  return tiers.join(' + ') || undefined;
}

function sockets(list: unknown): CardSocket[] {
  if (!Array.isArray(list)) return [];
  return list.map((s: Json, i: number) => ({
    colour: String(s.sColour ?? s.attr ?? 'W'),
    linkNext: i + 1 < list.length && list[i + 1].group === s.group,
  }));
}

function tags(item: Json): string[] {
  const out: string[] = [];
  const influences = { ...(item.influences ?? {}) };
  for (const key of ['searing', 'tangled']) if (item[key]) influences[key] = true;
  for (const [key, label] of Object.entries(INFLUENCES)) if (influences[key]) out.push(label);
  if (item.split) out.push('Split');
  if (item.identified === false) out.push('Unidentified');
  if (item.duplicated) out.push('Mirrored');
  if (item.doubleCorrupted) out.push('Twice Corrupted');
  else if (item.corrupted) out.push('Corrupted');
  return out;
}

/** When the card shows: pointer on the eye icon of a row (default), over a row with Shift held, over a row, never. */
export type ListingCardMode = 'eye' | 'keybind' | 'always' | 'off';
export const LISTING_CARD_MODES: readonly ListingCardMode[] = ['eye', 'keybind', 'always', 'off'];

/** Whether the card shows: the pointer is over a row with a card (on its eye icon or not), and the mode lets it. */
export function cardVisible(mode: ListingCardMode, shiftHeld: boolean, overRowWithCard: boolean, overEye = false): boolean {
  if (!overRowWithCard) return false;
  switch (mode) {
    case 'eye':
      return overEye;
    case 'keybind':
      return shiftHeld;
    case 'always':
      return true;
    default:
      return false;
  }
}

/** Grid cell of socket `i` in an item `w` cells wide: PoE1 sockets snake row by row. */
export function socketCell(i: number, w: number): { col: number; row: number } {
  if (w <= 1) return { col: 0, row: i };
  const row = Math.floor(i / w);
  const along = i % w;
  return { col: row % 2 === 0 ? along : w - 1 - along, row };
}
