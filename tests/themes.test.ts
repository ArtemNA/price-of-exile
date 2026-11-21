import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, themeById } from '../src/app/themes';

describe('themes', () => {
  it('starts with the APT layout in graphite and ice blue', () => {
    expect(DEFAULT_THEME).toBe('graphite');
    const theme = themeById('');
    expect(theme.id).toBe('graphite');
    // The same price check view as the APT theme: one layout, two palettes.
    expect(theme.priceCheck).toBe(themeById('apt').priceCheck);
    expect(theme.priceCheck).toBeDefined();
  });

  it('lists the default and APT first, the older two-column look last', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['graphite', 'apt', 'price-of-exile']);
  });

  it('sends the dropped Vaal theme to the default', () => {
    expect(themeById('vaal').id).toBe('graphite');
  });
});
