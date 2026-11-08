import { Application, Container, Rectangle } from 'pixi.js';
import { FIGHTERS, ROSTER } from '../game/data/fighters';
import { ProceduralFighterVisual, idleView } from '../game/render/characters/FighterVisual';

declare const __BUILD_ID__: string | undefined;

/**
 * Image renders of every scientist (data URLs), made from the same rigged art used in the fight.
 *
 * Turning a render into an image needs a GPU read-back (readPixels), which makes the GPU stop and
 * wait. Done during a fight, that is a visible hitch, so:
 *  - renders run one at a time in a background worker, highest priority first;
 *  - while a fight is on (`setFightActive(true)`) only the two fighters' own portraits may render
 *    (requested at fight start, during the countdown). Everything else waits for the menus;
 *  - results are kept in localStorage per build, so each image is made once per browser.
 *
 * A single offscreen Pixi Application is created lazily and deliberately never destroyed:
 * in Pixi v8, destroying one Application tears down batcher state that other live renderers
 * (the fight canvas) still share.
 */

type Kind = 'body' | 'face';
interface Job { kind: Kind; id: string; prio: number; promise: Promise<string>; resolve: (url: string) => void; done: boolean; url?: string }

/** Fight portraits: allowed even while a fight is on. */
const URGENT = 10;
const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const STORE = `nb.art.${BUILD}.`;

const jobs = new Map<string, Job>();
let fightActive = false;
let wake: (() => void) | null = null;
let running = false;
let appPromise: Promise<Application> | null = null;

const SIZE: Record<Kind, [number, number]> = { body: [260, 320], face: [256, 256] };
const PLACE: Record<Kind, (holder: Container, H: number) => void> = {
  body: (holder, H) => {
    const s = (320 * 0.86) / H;
    holder.scale.set(s, -s);
    holder.position.set(130, 320 - 14);
  },
  face: (holder, H) => {
    const s = 256 / (H * 0.42);
    holder.scale.set(s, -s);
    holder.position.set(128 - H * 0.03 * s, 128 + H * 0.86 * s);
  },
};

function offscreenApp(): Promise<Application> {
  appPromise ??= (async () => {
    const app = new Application();
    await app.init({ width: 256, height: 256, backgroundAlpha: 0, antialias: true, resolution: 2, autoStart: false });
    return app;
  })();
  return appPromise;
}

function stored(key: string): string | null {
  try { return localStorage.getItem(STORE + key); } catch { return null; }
}

function store(key: string, url: string) {
  try {
    localStorage.setItem(STORE + key, url);
  } catch {
    // Full: drop images from older builds, then give up quietly (they'll be re-rendered next visit).
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith('nb.art.') && !k.startsWith(STORE)) localStorage.removeItem(k);
      }
      localStorage.setItem(STORE + key, url);
    } catch { /* ignore */ }
  }
}

function request(kind: Kind, id: string, prio: number): Promise<string> {
  const key = `${kind}:${id}`;
  let job = jobs.get(key);
  if (!job) {
    let resolve!: (url: string) => void;
    const promise = new Promise<string>((r) => { resolve = r; });
    job = { kind, id, prio, promise, resolve, done: false };
    jobs.set(key, job);
    const cached = stored(key);
    if (cached) { job.done = true; job.url = cached; resolve(cached); return promise; }
  } else if (!job.done && prio > job.prio) {
    job.prio = prio;
  }
  if (!job.done) { wake?.(); void work(); }
  return job.promise;
}

function next(): Job | null {
  let best: Job | null = null;
  for (const j of jobs.values()) {
    if (j.done || (fightActive && j.prio < URGENT)) continue;
    if (!best || j.prio > best.prio) best = j;
  }
  return best;
}

async function work() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = next();
      if (!job) {
        if (![...jobs.values()].some((j) => !j.done)) return;
        await new Promise<void>((r) => { wake = r; }); // paused for a fight: wait for setFightActive(false)
        wake = null;
        continue;
      }
      const url = await render(job.kind, job.id).catch(() => '');
      job.done = true;
      job.url = url;
      job.resolve(url);
      if (url) store(`${job.kind}:${job.id}`, url);
      await new Promise((r) => setTimeout(r, 16)); // give the page a frame between read-backs
    }
  } finally {
    running = false;
  }
}

async function render(kind: Kind, id: string): Promise<string> {
  const def = FIGHTERS[id];
  if (!def) return '';
  const app = await offscreenApp();
  const [w, h] = SIZE[kind];
  app.renderer.resize(w, h);
  const v = new ProceduralFighterVisual(def);
  v.update(idleView(def), 0.016);
  const holder = new Container();
  PLACE[kind](holder, def.body.height);
  holder.addChild(v.root);
  app.stage.addChild(holder);
  app.render();
  try {
    // WebP keeps the cache small enough for localStorage (browsers without it fall back to PNG).
    return await app.renderer.extract.base64({ target: app.stage, frame: new Rectangle(0, 0, w, h), format: 'webp', quality: 0.9 });
  } finally {
    app.stage.removeChildren();
    holder.destroy({ children: true });
  }
}

async function many(kind: Kind, ids: readonly string[], prio: number, onEach?: (id: string, url: string) => void) {
  const unique = [...new Set(ids)];
  const pairs = await Promise.all(unique.map((id) => request(kind, id, prio).then((url) => {
    if (url) onEach?.(id, url);
    return [id, url] as const;
  })));
  return Object.fromEntries(pairs.filter(([, url]) => url));
}

/**
 * While a fight is on, only the fighters' own portraits are rendered. Call with true when a match
 * starts and false when it ends.
 */
export function setFightActive(on: boolean) {
  fightActive = on;
  if (!on) { wake?.(); void work(); }
}

/** Full-body renders (character select cards). `onEach` fires as each one becomes ready. */
export function fighterImages(onEach?: (id: string, url: string) => void): Promise<Record<string, string>> {
  return many('body', ROSTER, 1, onEach);
}

/** Square head-and-shoulders portraits for every fighter (Codex, profile). */
export function fighterPortraits(onEach?: (id: string, url: string) => void): Promise<Record<string, string>> {
  return many('face', ROSTER, 2, onEach);
}

/**
 * Portraits for just these fighters (the fight HUD and the ULTIMATE cinematic), at top priority and
 * allowed during a fight. Call it as soon as the fighters are known.
 */
export function portraitsFor(ids: readonly string[]): Promise<Record<string, string>> {
  return many('face', ids, URGENT);
}

/** A portrait only if it's already rendered: never starts work (used mid-fight). */
export function readyPortrait(id: string): string | null {
  return jobs.get(`face:${id}`)?.url || stored(`face:${id}`);
}
