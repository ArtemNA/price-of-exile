// "Import from Awakened PoE Trade": stash search groups and map check marks from APT's config.json.
// The fixture has the shape of a real APT 3.30 config.json (widgets with wmType), with made-up entries.
import { describe, expect, it } from 'vitest';
import { aptHotkey, aptMapCheck, aptStashGroups, parseAptConfig } from '../src/app/settings/apt-import';

const CONFIG = {
  configVersion: 18,
  overlayKey: 'Shift + Space',
  widgets: [
    { wmId: 1, wmType: 'price-check', wmTitle: '' },
    {
      wmId: 4,
      wmType: 'stash-search',
      wmTitle: 'Map rolling',
      enableHotkeys: true,
      entries: [
        { id: 1, name: '', text: '"Pack Size: +3"', hotkey: null },
        { id: 7, name: 'Quantity', text: '"Item Quantity: +1"', hotkey: 'Ctrl + Shift + 1' },
      ],
    },
    {
      wmId: 5,
      wmType: 'stash-search',
      wmTitle: 'Dump sorting',
      enableHotkeys: false,
      entries: [{ id: 2, name: '', text: '"Divination Card"', hotkey: 'Alt + F11' }],
    },
    {
      wmId: 6,
      wmType: 'item-check',
      hotkey: 'Ctrl + F11',
      maps: {
        profile: 3,
        showNewStats: true,
        selectedStats: [
          { matcher: '#% maximum Player Resistances', decision: 'w--' },
          { matcher: 'Players cannot Regenerate Life, Mana or Energy Shield', decision: 'd-d' },
        ],
      },
    },
  ],
};

describe('aptHotkey', () => {
  it.each([
    ['Ctrl + F11', 'Ctrl+F11'],
    ['Shift + Space', 'Shift+Space'],
    ['Ctrl + Shift + D', 'Ctrl+Shift+KeyD'],
    ['Alt + 1', 'Alt+Digit1'],
    ['F5', 'F5'],
    ['Ctrl + /', 'Ctrl+Slash'],
  ])('%s → %s', (apt, ours) => {
    expect(aptHotkey(apt)).toBe(ours);
  });

  it('drops what cannot be registered', () => {
    expect(aptHotkey(null)).toBeNull();
    expect(aptHotkey('')).toBeNull();
    expect(aptHotkey('Hyper + D')).toBeNull();
    expect(aptHotkey('Ctrl + MouseWheel')).toBeNull();
  });
});

describe('aptStashGroups', () => {
  it('turns each stash search widget into a group, hotkeys converted', () => {
    expect(aptStashGroups(CONFIG)).toEqual([
      {
        id: 1,
        title: 'Map rolling',
        enableHotkeys: true,
        entries: [
          { id: 1, name: '', text: '"Pack Size: +3"', hotkey: null },
          { id: 2, name: 'Quantity', text: '"Item Quantity: +1"', hotkey: 'Ctrl+Shift+Digit1' },
        ],
      },
      { id: 2, title: 'Dump sorting', enableHotkeys: false, entries: [{ id: 1, name: '', text: '"Divination Card"', hotkey: 'Alt+F11' }] },
    ]);
  });

  it('finds nothing in a config without widgets', () => {
    expect(aptStashGroups({})).toEqual([]);
    expect(aptStashGroups(null)).toEqual([]);
  });
});

describe('aptMapCheck', () => {
  it('takes the item check widget maps as they are', () => {
    expect(aptMapCheck(CONFIG)).toEqual(CONFIG.widgets[3].maps);
  });

  it('is null without an item check widget', () => {
    expect(aptMapCheck({ widgets: [] })).toBeNull();
  });
});

describe('parseAptConfig', () => {
  it('reads JSON and gives null for a missing or broken file', () => {
    expect(parseAptConfig(JSON.stringify(CONFIG))).toEqual(CONFIG);
    expect(parseAptConfig(null)).toBeNull();
    expect(parseAptConfig('{broken')).toBeNull();
  });
});
