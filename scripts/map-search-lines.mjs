// Extracts the extra text the game's stash search reads on a map (owner's in-game probe,
// 27.11.2026: affix names, tags and reminder texts are all searched) and writes
// src/app/map-check/map-search-lines.ts. Reads the local PoE1 install read-only through the data
// generator next to this project:
//
//   POE_DIR="C:/Program Files (x86)/Steam/steamapps/common/Path of Exile" node scripts/map-search-lines.mjs
import * as fs from 'node:fs'
import { table } from '../../poe-data-generator/poe1/src/tables.mjs'
import { loadDescriptions } from '../../poe-data-generator/poe1/src/descriptions.mjs'
import { listDir } from '../../poe-data-generator/poe1/src/game.mjs'

const LANGS = { en: 'English', ru: 'Russian' }
// Russian names carry every gender form: "<if:MS>{Быстрый}<elif:FS>{Быстрая}…" -> each form.
const forms = (name) => (name.includes('{') ? [...name.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]) : [name])
const STAT_COLS = ['StatsKey1', 'StatsKey2', 'StatsKey3', 'StatsKey4', 'StatsKey5', 'StatsKey6']
// Mod domains whose prefixes and suffixes are map / heist contract mods (as in the generator's areaModIndex).
const AREA_DOMAINS = new Set([5, 22])

const mods = await table('English', 'Mods', ['Domain', 'GenerationType', 'SpawnWeight_TagsKeys', 'SpawnWeight_Values', 'ImplicitTagsKeys', ...STAT_COLS])
const stats = await table('English', 'Stats', ['Id'])
// Every map / contract prefix and suffix, spawn weight or not: Kirac's bench adds weight-0 ones.
const area = mods.filter((m) => AREA_DOMAINS.has(m.Domain) && (m.GenerationType === 1 || m.GenerationType === 2))
const statIds = new Set(area.flatMap((m) => STAT_COLS.map((c) => m[c]).filter((k) => k != null).map((k) => stats[k].Id)))
const tagKeys = new Set(area.flatMap((m) => m.ImplicitTagsKeys))

// Reminder ids referenced by the descriptions of those stats, per language.
const reminderIds = { English: new Set(), Russian: new Set() }
const { files } = await listDir('metadata/statdescriptions')
for (const file of files.filter((f) => f.endsWith('.csd')).map((f) => f.split('/').pop())) {
  for (const block of await loadDescriptions(file)) {
    if (!block.ids.some((id) => statIds.has(id))) continue
    for (const [lang, entries] of Object.entries(block.langs)) {
      if (!reminderIds[lang]) continue
      for (const e of entries) for (const m of e.handlers.matchAll(/reminderstring\s+(\S+)/g)) reminderIds[lang].add(m[1])
    }
  }
}

// Map base types (class "Map") and the property labels a map shows, by row in each language.
const itemClasses = await table('English', 'ItemClasses', ['Id'])
const mapClass = itemClasses.find((c) => c.Id === 'Map')._index
const baseRows = (await table('English', 'BaseItemTypes', ['ItemClassesKey'])).filter((b) => b.ItemClassesKey === mapClass).map((b) => b._index)
const clientRows = (await table('English', 'ClientStrings', ['Id'])).filter((c) => ['ItemDisplayMapTier', 'RitualStoneLevel', 'ItemDisplayStringClass'].includes(c.Id))
// Descriptions of every item used in a Map Device (maps, unique and special maps), found by the English text.
const descriptionIds = (await table('English', 'ClientStrings', ['Id', 'Text'])).filter((c) => /personal Map Device/.test(c.Text ?? '')).map((c) => c.Id)
// Rare names are an ITEM_PREFIX word plus an ITEM_SUFFIX word (" Grind"): Wordlists 1 and 2.
const wordRows = await table('English', 'Words', ['Wordlist'])

const out = {}
for (const [id, lang] of Object.entries(LANGS)) {
  const names = await table(lang, 'Mods', ['Name'])
  const tags = await table(lang, 'Tags', ['Name'])
  const reminders = await table(lang, 'ReminderText', ['Id', 'Text'])
  const wanted = new Set([...reminderIds.English, ...reminderIds[lang]])
  const bases = await table(lang, 'BaseItemTypes', ['Name'])
  const client = await table(lang, 'ClientStrings', ['Id', 'Text'])
  const classes = await table(lang, 'ItemClasses', ['Name'])
  const words = await table(lang, 'Words', ['Text', 'Text2'])
  const label = (row) => client.find((c) => c.Id === row.Id).Text
  const [tier, level, itemClass] = ['ItemDisplayMapTier', 'RitualStoneLevel', 'ItemDisplayStringClass'].map((cid) => label(clientRows.find((r) => r.Id === cid)))
  const list = (n) => [...new Set(wordRows.filter((w) => w.Wordlist === n).flatMap((w) => forms(words[w._index].Text2 || words[w._index].Text || '')).map((t) => t.trim()).filter(Boolean))].sort()
  out[id] = {
    names: [...new Set(area.flatMap((m) => forms(names[m._index].Name ?? '')).filter((n) => n && !/^[A-Z]{2}$/.test(n) && n !== 'NAME'))].sort(),
    tags: [...new Set([...tagKeys].map((k) => tags[k].Name).filter(Boolean))].sort(),
    // The header lists a mod's tags in its own order: "— Elemental, Fire, Cold, Lightning, Ailment".
    tagLines: [...new Set(area.map((m) => m.ImplicitTagsKeys.map((k) => tags[k].Name).filter(Boolean).join(', ')).filter(Boolean))].sort(),
    reminders: [...new Set(reminders.filter((r) => wanted.has(r.Id)).map((r) => r.Text).filter(Boolean))].sort(),
    bases: [...new Set(baseRows.map((i) => bases[i].Name).filter(Boolean))].sort(),
    properties: [`${tier}: #`, `${level}: #`, `${itemClass}: ${classes[mapClass].Name}`],
    // Every description of an item used in a Map Device ("Travel to a Map of this tier…" and others).
    descriptions: [...new Set(descriptionIds.map((cid) => client.find((c) => c.Id === cid)?.Text).filter(Boolean))].sort(),
    rarePrefixes: list(1),
    rareSuffixes: list(2),
  }
  console.log(id, Object.entries(out[id]).map(([k, v]) => `${k} ${v.length}`).join(', '), out[id].properties)
}

const header = `// Generated by scripts/map-search-lines.mjs from the game files: do not edit by hand.
// Text the stash search reads on a map besides its mod lines (owner's probe, 27.11.2026):
// affix names, mod tags, the reminder texts of map mods, map base names, property labels, and the
// words of rare names (an ITEM_PREFIX word, then an ITEM_SUFFIX word: "Nebulous Grind").
`
fs.writeFileSync(new URL('../src/app/map-check/map-search-lines.ts', import.meta.url),
  `${header}export interface MapSearchLines {
  names: string[];
  tags: string[];
  tagLines: string[];
  reminders: string[];
  bases: string[];
  properties: string[];
  descriptions: string[];
  rarePrefixes: string[];
  rareSuffixes: string[];
}

export const MAP_SEARCH_LINES: Record<string, MapSearchLines> = ${JSON.stringify(out, null, 2)};\n`)
