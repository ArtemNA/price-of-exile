import { afterNextRender, Component, DestroyRef, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { listen } from '@tauri-apps/api/event';
import { LISTING_CARD_EVENT } from '../constants';
import { TrPipe } from '../core/i18n';
import { host } from '../host';
import { type CardMod, type CardValue, type ListingCard, socketCell } from '../price-check/listing-card';

interface CardMessage {
  generation: number;
  card: ListingCard;
  /** The hovered row in this window's px (the window is as tall as the game). */
  rowTop: number;
  rowBottom: number;
  /** Which side of the popup this window is on: the arrow points the other way. */
  side: 'left' | 'right';
}

/** Trade API value colours (index → CSS), as the game draws them. */
const VALUE_COLOURS: Record<number, string> = {
  0: '#ffffff',
  1: '#8888ff',
  2: '#d20000',
  3: '#ffffff',
  4: '#d02020',
  5: '#3f7fd0',
  6: '#ffd700',
  7: '#d02090',
};
const LABEL_COLOUR = '#7f7f7f';

const RARITY_COLOURS: Record<ListingCard['rarity'], string> = {
  Normal: '#c8c8c8',
  Magic: '#8888ff',
  Rare: '#ffff77',
  Unique: '#af6025',
  Gem: '#1ba29b',
  Currency: '#aa9e82',
  Other: '#c8c8c8',
};

const MOD_COLOURS: Record<CardMod['kind'], string> = {
  enchant: '#b4b4ff',
  scourge: '#ff7f50',
  implicit: '#8888ff',
  fractured: '#a29162',
  explicit: '#8888ff',
  crafted: '#b4b4ff',
  veiled: '#8a8a8a',
  crucible: '#ff9a5a',
  utility: '#8888ff',
};

const SOCKET_COLOURS: Record<string, string> = {
  R: '#c83c3c',
  G: '#6fbf3a',
  B: '#4b7fd6',
  W: '#e8e8e8',
  A: '#5a5a5a',
  DV: '#b04fd0',
};

/** One inventory cell of the item art, in px. */
const CELL = 47;

/**
 * The card of a listed item, drawn like the game's tooltip, in its own click-through window beside
 * the price check (src-tauri/src/card.rs). The window is already shown; the page reports when the
 * card is drawn, for the log.
 */
@Component({
  selector: 'app-card-window',
  imports: [TrPipe],
  template: `
    @if (message(); as m) {
      <div #card class="card" [class.right]="m.side === 'right'" [style.top.px]="top()" [style.visibility]="placed() ? 'visible' : 'hidden'">
        <div class="art" [style.width.px]="m.card.w * cell" [style.height.px]="m.card.h * cell">
          @if (m.card.icon) {
            <img [src]="m.card.icon" alt="" [style.width.px]="m.card.w * cell" [style.height.px]="m.card.h * cell" />
          }
          @for (socket of m.card.sockets; track $index) {
            <span class="socket" [style.left.px]="socketX($index, m.card.w)" [style.top.px]="socketY($index, m.card.w)"
              [style.background]="socketColour(socket.colour)"></span>
            @if (socket.linkNext) {
              <span class="link" [style]="linkStyle($index, m.card.w)"></span>
            }
          }
        </div>
        <div class="text">
          <div class="title" [style.color]="rarityColour(m.card)" [class.double]="m.card.title.length > 1">
            @for (line of m.card.title; track $index) {
              <div>{{ line }}</div>
            }
          </div>
          @if (m.card.properties.length) {
            <div class="block">
              @for (prop of m.card.properties; track $index) {
                <div>
                  @for (part of prop.parts; track $index) {
                    @if (isText(part)) {
                      <span [style.color]="labelColour">{{ part }}</span>
                    } @else {
                      <span [style.color]="valueColour(part)">{{ part.text }}</span>
                    }
                  }
                </div>
              }
            </div>
            <div class="sep" [style.color]="rarityColour(m.card)"></div>
          }
          @if (m.card.itemLevel || m.card.requirements.length) {
            <div class="block">
              @if (m.card.itemLevel) {
                <div><span [style.color]="labelColour">{{ 'Item Level' | tr }}: </span><span>{{ m.card.itemLevel }}</span></div>
              }
              @if (m.card.requirements.length) {
                <div>
                  <span [style.color]="labelColour">{{ 'Requires' | tr }} </span>
                  @for (req of m.card.requirements; track $index; let last = $last) {
                    @for (part of req; track $index) {
                      <span [style.color]="part.colour < 0 ? labelColour : valueColour(part)">{{ part.text }}</span>
                    }
                    @if (!last) {
                      <span [style.color]="labelColour">, </span>
                    }
                  }
                </div>
              }
            </div>
            <div class="sep" [style.color]="rarityColour(m.card)"></div>
          }
          @for (block of m.card.modBlocks; track $index) {
            <div class="block">
              @for (mod of block; track $index) {
                <div class="mod" [style.color]="modColour(mod)">
                  <span class="lines">
                    @for (line of mod.lines; track $index) {
                      <div>{{ line }}</div>
                    }
                  </span>
                  @if (mod.tier) {
                    <span class="tier" [class.prefix]="mod.tier.startsWith('P')" [class.suffix]="mod.tier.startsWith('S')">{{ mod.tier }}</span>
                  }
                </div>
              }
            </div>
            <div class="sep" [style.color]="rarityColour(m.card)"></div>
          }
          @if (m.card.flavour.length) {
            <div class="block flavour">
              @for (line of m.card.flavour; track $index) {
                <div>{{ line }}</div>
              }
            </div>
            <div class="sep" [style.color]="rarityColour(m.card)"></div>
          }
          @for (tag of m.card.tags; track $index) {
            <div class="block tag" [class.corrupted]="tag.includes('Corrupted')">{{ tag | tr }}</div>
          }
        </div>
        <span class="arrow" [style.top.px]="arrowTop()"></span>
      </div>
    }
  `,
  styles: `
    :host { display: block; position: relative; width: 100%; height: 100%; overflow: hidden; }
    .card { position: absolute; right: 12px; display: flex; align-items: flex-start; gap: 4px; max-width: calc(100% - 12px);
      font-family: 'FontinSmallCaps', 'Alegreya SC', serif; font-size: 15px; line-height: 1.25; }
    .card.right { right: auto; left: 12px; flex-direction: row-reverse; }
    .art { position: relative; flex: none; background: rgba(8, 10, 24, 0.75); border: 1px solid #3a3226; }
    .art img { display: block; }
    .socket { position: absolute; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #1a1a1a;
      box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.45); }
    .link { position: absolute; background: #c8a46a; border: 1px solid #3a2a12; }
    .text { flex: 1 1 auto; min-width: 220px; background: rgba(0, 0, 0, 0.94); border: 1px solid #3a3226; text-align: center; color: #fff; }
    .title { padding: 4px 10px; font-size: 18px; border-bottom: 1px solid currentColor;
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0)); }
    .block { padding: 3px 10px; }
    .sep { height: 1px; margin: 2px 24px; background: linear-gradient(to right, transparent, currentColor, transparent); }
    .sep:last-child { display: none; }
    .mod { display: flex; align-items: baseline; gap: 8px; }
    .mod .lines { flex: 1 1 auto; }
    .mod .tier { flex: none; font-family: Inter, sans-serif; font-size: 11px; color: #8f887c; }
    .mod .tier.prefix { color: #e0806a; }
    .mod .tier.suffix { color: #7fa8ff; }
    .flavour { color: #af6025; font-style: italic; }
    .tag { color: #c8c8c8; }
    .tag.corrupted { color: #d20000; }
    .arrow { position: absolute; right: -10px; width: 0; height: 0; margin-top: -8px;
      border: 8px solid transparent; border-left: 10px solid #3a3226; border-right: 0; }
    .card.right .arrow { right: auto; left: -10px; border-left: 0; border-right: 10px solid #3a3226; }
  `,
  host: { class: 'block h-full' },
})
export class CardWindow {
  protected readonly message = signal<CardMessage | null>(null);
  protected readonly top = signal(0);
  /** Drawn hidden first, shown once it stands at its row (no frame in the wrong place). */
  protected readonly placed = signal(false);
  protected readonly arrowTop = signal(0);
  protected readonly cell = CELL;
  protected readonly labelColour = LABEL_COLOUR;
  private readonly cardEl = viewChild<ElementRef<HTMLElement>>('card');
  private readonly injector = inject(Injector);

  constructor() {
    const unlisten = listen<CardMessage | null>(LISTING_CARD_EVENT, ({ payload }) => this.show(payload));
    inject(DestroyRef).onDestroy(() => void unlisten.then((fn) => fn()));
  }

  private show(message: CardMessage | null): void {
    this.message.set(message);
    if (!message) return;
    // Draw hidden first, then centre the card on the row, kept inside the window, and show it.
    this.placed.set(false);
    this.top.set(0);
    afterNextRender(
      () => {
        const el = this.cardEl()?.nativeElement;
        if (!el || this.message() !== message) return;
        const height = el.offsetHeight;
        const row = (message.rowTop + message.rowBottom) / 2;
        const top = Math.round(Math.min(Math.max(row - height / 2, 0), Math.max(window.innerHeight - height, 0)));
        el.style.top = `${top}px`;
        el.style.visibility = 'visible';
        this.top.set(top);
        this.placed.set(true);
        this.arrowTop.set(Math.round(row - top));
        void host.listingCardReady(message.generation).catch(() => undefined);
      },
      { injector: this.injector },
    );
  }

  protected isText(part: string | CardValue): part is string {
    return typeof part === 'string';
  }

  protected valueColour(value: CardValue): string {
    return VALUE_COLOURS[value.colour] ?? VALUE_COLOURS[0];
  }

  protected rarityColour(card: ListingCard): string {
    return RARITY_COLOURS[card.rarity];
  }

  protected modColour(mod: CardMod): string {
    return MOD_COLOURS[mod.kind];
  }

  protected socketColour(colour: string): string {
    return SOCKET_COLOURS[colour] ?? SOCKET_COLOURS['W'];
  }

  private socketCentre(i: number, w: number): { x: number; y: number } {
    const { col, row } = socketCell(i, w);
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
  }

  protected socketX(i: number, w: number): number {
    return this.socketCentre(i, w).x - 13;
  }

  protected socketY(i: number, w: number): number {
    return this.socketCentre(i, w).y - 13;
  }

  /** A link bar from socket `i` to socket `i + 1`. */
  protected linkStyle(i: number, w: number): string {
    const a = this.socketCentre(i, w);
    const b = this.socketCentre(i + 1, w);
    if (a.y === b.y) {
      return `left:${Math.min(a.x, b.x) + 10}px;top:${a.y - 4}px;width:${Math.abs(a.x - b.x) - 20}px;height:8px`;
    }
    return `left:${a.x - 4}px;top:${Math.min(a.y, b.y) + 10}px;width:8px;height:${Math.abs(a.y - b.y) - 20}px`;
  }

}
