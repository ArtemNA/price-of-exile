// "Import from Awakened PoE Trade": stash search groups and map check marks from APT's settings
// file (%APPDATA%\awakened-poe-trade\apt-data\config.json, read by the host), for users moving over.
// APT keeps the same shapes (we ported them): a stash search widget is a group, the item check
// widget's `maps` is our map check config. Only hotkeys differ: APT writes "Ctrl + Shift + D",
// we keep `tauri-plugin-global-shortcut` codes ("Ctrl+Shift+KeyD").

import type { MapCheckConfig } from '@/web/map-check/common';
import type { StashSearchGroup } from '../core/settings';
import { KEY_CODE } from './hotkey';

type Json = Record<string, any>;

const MODIFIERS: Record<string, string> = { Ctrl: 'Ctrl', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };

/** APT's key names that are not `KeyboardEvent.code` already. */
const KEY_NAMES: Record<string, string> = {
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Ins: 'Insert',
  Del: 'Delete',
  PgUp: 'PageUp',
  PgDn: 'PageDown',
};

/** "Ctrl + Shift + D" → "Ctrl+Shift+KeyD"; null when APT had none or a key we cannot register. */
export function aptHotkey(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean);
  const key = parts.pop();
  if (!key) return null;
  const modifiers = parts.map((part) => MODIFIERS[part]);
  if (modifiers.some((m) => !m)) return null;
  const code = /^[A-Z]$/i.test(key)
    ? `Key${key.toUpperCase()}`
    : /^\d$/.test(key)
      ? `Digit${key}`
      : (KEY_NAMES[key] ?? key);
  if (!KEY_CODE.test(code)) return null;
  return [...modifiers, code].join('+');
}

/** Stash search groups of an APT config, in APT's order; empty when there are none. */
export function aptStashGroups(config: unknown): StashSearchGroup[] {
  const widgets = (config as Json)?.widgets;
  if (!Array.isArray(widgets)) return [];
  return widgets
    .filter((w: Json) => w?.wmType === 'stash-search' && Array.isArray(w.entries))
    .map((w: Json, groupIndex: number) => ({
      id: groupIndex + 1,
      title: typeof w.wmTitle === 'string' ? w.wmTitle : '',
      enableHotkeys: w.enableHotkeys !== false,
      entries: w.entries
        .filter((e: Json) => typeof e?.text === 'string')
        .map((e: Json, entryIndex: number) => ({
          id: entryIndex + 1,
          name: typeof e.name === 'string' ? e.name : '',
          text: e.text,
          hotkey: aptHotkey(e.hotkey),
        })),
    }));
}

/** The map check config of an APT config (its item check widget's `maps`), or null. */
export function aptMapCheck(config: unknown): MapCheckConfig | null {
  const widgets = (config as Json)?.widgets;
  if (!Array.isArray(widgets)) return null;
  const maps = widgets.find((w: Json) => w?.wmType === 'item-check')?.maps;
  if (!maps || !Array.isArray(maps.selectedStats)) return null;
  return {
    profile: Number.isInteger(maps.profile) ? maps.profile : 1,
    showNewStats: Boolean(maps.showNewStats),
    selectedStats: maps.selectedStats
      .filter((s: Json) => typeof s?.matcher === 'string' && typeof s?.decision === 'string')
      .map((s: Json) => ({ matcher: s.matcher, decision: s.decision })),
  };
}

/** Parses APT's settings file; null when it is missing or not JSON. */
export function parseAptConfig(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
