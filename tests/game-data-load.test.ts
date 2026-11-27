import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// loadGameData order (review 27.11.2026): loads never overlap, only the latest one flags the data as
// loaded, a failed load can be retried. init() is mocked with promises the test settles.
interface Call {
  lang: string;
  resolve: () => void;
  reject: (e: Error) => void;
  settled: boolean;
}

const h = vi.hoisted(() => ({
  calls: [] as any[],
  active: 0,
  maxActive: 0,
  initLog: [] as string[],
}));

vi.mock('@/assets/data', () => ({
  setDataSource: vi.fn(),
  init: (lang: string) => {
    h.active++;
    h.maxActive = Math.max(h.maxActive, h.active);
    h.initLog.push(`start:${lang}`);
    return new Promise<void>((resolve, reject) => {
      const c: Call = { lang, settled: false, resolve: () => {}, reject: () => {} };
      c.resolve = () => {
        h.active--;
        c.settled = true;
        h.initLog.push(`end:${lang}`);
        resolve();
      };
      c.reject = (e) => {
        h.active--;
        c.settled = true;
        h.initLog.push(`fail:${lang}`);
        reject(e);
      };
      h.calls.push(c);
    });
  },
}));

type Mod = typeof import('../src/app/game-data');
let mod: Mod;
const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);

const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};
const settle = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    () => 'err',
  );

beforeEach(async () => {
  h.calls.length = 0;
  h.active = 0;
  h.maxActive = 0;
  h.initLog.length = 0;
  unhandled.length = 0;
  vi.resetModules();
  process.on('unhandledRejection', onUnhandled);
  mod = await import('../src/app/game-data');
});
afterEach(async () => {
  await tick();
  process.off('unhandledRejection', onUnhandled);
  expect(unhandled).toEqual([]);
});

const state = () => [mod.gameDataLanguage(), mod.gameDataLoaded()] as const;
const call = (i: number) => h.calls[i] as Call;

describe('loadGameData sequences', () => {
  it('en', async () => {
    const p = mod.loadGameData('en');
    await tick();
    expect(h.calls.length).toBe(1);
    expect(state()).toEqual([null, false]);
    call(0).resolve();
    await p;
    expect(state()).toEqual(['en', true]);
  });

  it('same language twice shares one init', async () => {
    const a = mod.loadGameData('en');
    const b = mod.loadGameData('en');
    await tick();
    expect(h.calls.length).toBe(1);
    call(0).resolve();
    await Promise.all([a, b]);
    await mod.loadGameData('en');
    expect(h.calls.length).toBe(1);
    expect(state()).toEqual(['en', true]);
  });

  it('en -> ru, sequential, ends ru', async () => {
    const a = mod.loadGameData('en');
    const b = mod.loadGameData('ru');
    await tick();
    expect(h.calls.length).toBe(1);
    call(0).resolve();
    await a;
    await tick();
    expect(state()).toEqual([null, false]);
    expect(h.calls.length).toBe(2);
    call(1).resolve();
    await b;
    expect(state()).toEqual(['ru', true]);
    expect(h.maxActive).toBe(1);
  });

  it('en -> ru -> en mid-load ends en, init sequential', async () => {
    const a = mod.loadGameData('en');
    const b = mod.loadGameData('ru');
    const c = mod.loadGameData('en');
    await tick();
    expect(h.calls.length).toBe(1);
    call(0).resolve();
    await a;
    await tick();
    expect(state()).toEqual([null, false]);
    expect(h.calls.length).toBe(2);
    call(1).resolve();
    await b;
    await tick();
    expect(state()).toEqual([null, false]);
    expect(h.calls.length).toBe(3);
    call(2).resolve();
    await c;
    expect(state()).toEqual(['en', true]);
    expect(h.maxActive).toBe(1);
    expect(h.initLog).toEqual(['start:en', 'end:en', 'start:ru', 'end:ru', 'start:en', 'end:en']);
  });

  it('en done, then ru -> en: loaded false until last finishes', async () => {
    const a = mod.loadGameData('en');
    await tick();
    call(0).resolve();
    await a;
    const b = mod.loadGameData('ru');
    const c = mod.loadGameData('en');
    await tick();
    expect(state()).toEqual([null, false]);
    call(1).resolve();
    await b;
    await tick();
    expect(state()).toEqual([null, false]);
    call(2).resolve();
    await c;
    expect(state()).toEqual(['en', true]);
  });

  it('failure then retry', async () => {
    const a = mod.loadGameData('en');
    await tick();
    call(0).reject(new Error('x'));
    expect(await settle(a)).toBe('err');
    await tick();
    expect(state()).toEqual([null, false]);
    const b = mod.loadGameData('en');
    await tick();
    expect(h.calls.length).toBe(2);
    call(1).resolve();
    await b;
    expect(state()).toEqual(['en', true]);
  });

  it('failure of the last load, then retry of same lang', async () => {
    const a = mod.loadGameData('en');
    const b = mod.loadGameData('ru');
    await tick();
    call(0).resolve();
    await a;
    await tick();
    call(1).reject(new Error('ru down'));
    expect(await settle(b)).toBe('err');
    await tick();
    expect(state()).toEqual([null, false]);
    const c = mod.loadGameData('ru');
    await tick();
    expect(h.calls.length).toBe(3);
    call(2).resolve();
    await c;
    expect(state()).toEqual(['ru', true]);
  });

  it('mid-chain failure (stale en fails), newer ru still loads, ends ru', async () => {
    const a = mod.loadGameData('en');
    const b = mod.loadGameData('ru');
    await tick();
    call(0).reject(new Error('en down'));
    expect(await settle(a)).toBe('err');
    await tick();
    expect(h.calls.length).toBe(2);
    call(1).resolve();
    await b;
    expect(state()).toEqual(['ru', true]);
  });

  it('mid-chain failure of middle (ru fails), last en ends en', async () => {
    const a = mod.loadGameData('en');
    const b = mod.loadGameData('ru');
    const c = mod.loadGameData('en');
    await tick();
    call(0).resolve();
    await a;
    await tick();
    call(1).reject(new Error('ru'));
    expect(await settle(b)).toBe('err');
    await tick();
    expect(h.calls.length).toBe(3);
    expect(state()).toEqual([null, false]);
    call(2).resolve();
    await c;
    expect(state()).toEqual(['en', true]);
    expect(h.maxActive).toBe(1);
  });

  it('failure of last en after stale ru: retry en works', async () => {
    const a = mod.loadGameData('ru');
    const b = mod.loadGameData('en');
    await tick();
    call(0).resolve();
    await a;
    await tick();
    call(1).reject(new Error('en'));
    expect(await settle(b)).toBe('err');
    await tick();
    expect(state()).toEqual([null, false]);
    const c = mod.loadGameData('en');
    await tick();
    call(2).resolve();
    await c;
    expect(state()).toEqual(['en', true]);
  });

  it('shared same-lang promise rejects for both callers, retry works', async () => {
    const a = mod.loadGameData('en');
    const b = mod.loadGameData('en');
    await tick();
    call(0).reject(new Error('x'));
    expect(await settle(a)).toBe('err');
    expect(await settle(b)).toBe('err');
    await tick();
    const c = mod.loadGameData('en');
    await tick();
    call(1).resolve();
    await c;
    expect(state()).toEqual(['en', true]);
  });

  it('en fails while ru already queued: ru runs, state ru', async () => {
    const a = mod.loadGameData('en');
    await tick();
    const b = mod.loadGameData('ru');
    await tick();
    call(0).reject(new Error('x'));
    await settle(a);
    await tick();
    call(1).resolve();
    await b;
    expect(state()).toEqual(['ru', true]);
  });

  it('randomised sequences: invariants hold', async () => {
    let seed = 9;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let run = 0; run < 60; run++) {
      h.calls.length = 0;
      h.maxActive = 0;
      h.active = 0;
      unhandled.length = 0;
      vi.resetModules();
      mod = await import('../src/app/game-data');
      let last: 'en' | 'ru' | undefined;
      const ps: Promise<string>[] = [];
      for (let step = 0; step < 8; step++) {
        if (rnd() < 0.5) {
          const lang = rnd() < 0.5 ? 'en' : 'ru';
          ps.push(settle(mod.loadGameData(lang)));
          last = lang;
          await tick();
        } else {
          await tick();
          const c = h.calls.find((x: Call) => !x.settled);
          if (c) {
            if (rnd() < 0.25) c.reject(new Error('f'));
            else c.resolve();
          }
          await tick();
        }
        if (mod.gameDataLoaded()) expect(mod.gameDataLanguage()).toBe(last);
        expect(h.maxActive).toBeLessThanOrEqual(1);
      }
      for (let i = 0; i < 20; i++) {
        await tick();
        const c = h.calls.find((x: Call) => !x.settled);
        if (!c) break;
        c.resolve();
      }
      await Promise.all(ps);
      await tick();
      if (last) {
        if (mod.gameDataLoaded()) expect(mod.gameDataLanguage()).toBe(last);
        else expect(mod.gameDataLanguage()).toBeNull();
      }
      expect(unhandled).toEqual([]);
    }
  });
}, 60000);
