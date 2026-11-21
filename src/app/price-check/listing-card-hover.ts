// Pointer over a listing row's eye icon (or over the row with Shift, per the setting) → the card of
// that listing in its own window (src-tauri/src/card.rs).
// Shift comes from the pointer events: the popup usually has no keyboard focus while the game
// has it, so keydown / keyup may never arrive, but every mouse event carries the modifier state.
// The key listeners stay for a still pointer while the popup has the keyboard.

import { host } from '../host';
import { settings } from '../core/settings';
import { cardVisible, listingCard, type ListingCard } from './listing-card';

interface Row {
  id: string;
  item?: unknown;
}

class ListingCardHover {
  private row: { id: string; el: HTMLElement; card?: ListingCard } | null = null;
  private shift = false;
  private onEye = false;
  private shownId: string | null = null;
  /** Cards already built, by listing id (building one walks the whole item). */
  private readonly cards = new Map<string, ListingCard | undefined>();

  constructor() {
    if (typeof window === 'undefined') return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Shift') this.setShift(event.type === 'keydown');
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    window.addEventListener('blur', () => this.setShift(false));
  }

  /** Rows show an eye icon: the card shows while the pointer is on it. */
  get eyes(): boolean {
    return settings().priceCheck.listingCard === 'eye';
  }

  /** `mouseenter` of a row's eye icon: shows the card right away. */
  eye(event: MouseEvent, row: Row): void {
    this.onEye = true;
    this.pointer(event, row, (event.currentTarget as HTMLElement).closest('[data-listing-row]') as HTMLElement | null);
  }

  /** `mouseleave` of the eye icon (the pointer may still be over the row). */
  eyeLeave(): void {
    this.onEye = false;
    this.update();
  }

  /** `mouseenter` / `mousemove` of a listing row; `rowEl` when the event comes from inside the row. */
  pointer(event: MouseEvent, row: Row, rowEl?: HTMLElement | null): void {
    if (this.row?.id !== row.id) {
      if (!this.cards.has(row.id)) this.cards.set(row.id, listingCard(row.item));
      this.row = { id: row.id, el: rowEl ?? (event.currentTarget as HTMLElement), card: this.cards.get(row.id) };
    }
    this.shift = event.shiftKey;
    this.update();
  }

  /** `mouseleave` of a listing row. */
  leave(): void {
    this.row = null;
    this.onEye = false;
    this.update();
  }

  /** The list changed (a new search, another item) or scrolled: no card until the pointer moves again. */
  reset(): void {
    this.row = null;
    this.onEye = false;
    this.cards.clear();
    this.update();
  }

  private setShift(held: boolean): void {
    if (this.shift === held) return;
    this.shift = held;
    this.update();
  }

  private update(): void {
    const row = this.row;
    const visible = cardVisible(settings().priceCheck.listingCard, this.shift, !!row?.card, this.onEye);
    if (visible && row && row.card) {
      if (this.shownId === row.id) return;
      this.shownId = row.id;
      const rect = row.el.getBoundingClientRect();
      void host.listingCardShow(row.card, rect.top, rect.bottom).catch(() => undefined);
    } else if (this.shownId !== null) {
      this.shownId = null;
      void host.listingCardHide().catch(() => undefined);
    }
  }
}

export const listingCardHover = new ListingCardHover();
