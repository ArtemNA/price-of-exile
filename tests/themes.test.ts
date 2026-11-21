import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, themeById } from '../src/app/themes';

describe('themes', () => {
  it('starts with the APT layout in Vaal colours', () => {
    expect(DEFAULT_THEME).toBe('vaal');
    const theme = themeById('');
    expect(theme.id).toBe('vaal');
    // The same price check view as the APT theme: one layout, two palettes.
    expect(theme.priceCheck).toBe(themeById('apt').priceCheck);
    expect(theme.priceCheck).toBeDefined();
  });

  it('keeps the older themes selectable', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['price-of-exile', 'vaal', 'apt']);
  });
});
