import { Application, Container, Rectangle } from 'pixi.js';
import { FIGHTERS, ROSTER } from '../game/data/fighters';
import { ProceduralFighterVisual, idleView } from '../game/render/characters/FighterVisual';

/**
 * PNG renders of every scientist (data URLs), made from the same rigged art used in the fight.
 *
 * A single offscreen Pixi Application is created lazily and deliberately never destroyed:
 * in Pixi v8, destroying one Application tears down batcher state that other live renderers
 * (the fight canvas) still share.
 */
let appPromise: Promise<Application> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function offscreenApp(): Promise<Application> {
  appPromise ??= (async () => {
    const app = new Application();
    await app.init({ width: 256, height: 256, backgroundAlpha: 0, antialias: true, resolution: 2, autoStart: false });
    return app;
  })();
  return appPromise;
}

type Place = (holder: Container, H: number) => void;

/**
 * Renders the given fighters with a placement function, one at a time on the shared app, yielding to
 * the browser between fighters so a batch never blocks a frame for long.
 */
function renderSome(ids: string[], w: number, h: number, place: Place): Promise<Record<string, string>> {
  const job = queue.then(async () => {
    const app = await offscreenApp();
    const out: Record<string, string> = {};
    for (const id of ids) {
      const def = FIGHTERS[id];
      if (!def) continue;
      app.renderer.resize(w, h);
      const v = new ProceduralFighterVisual(def);
      v.update(idleView(def), 0.016);
      const holder = new Container();
      place(holder, def.body.height);
      holder.addChild(v.root);
      app.stage.addChild(holder);
      app.render();
      out[id] = await app.renderer.extract.base64({ target: app.stage, frame: new Rectangle(0, 0, w, h) });
      app.stage.removeChildren();
      holder.destroy({ children: true });
      await new Promise((r) => setTimeout(r, 0));
    }
    return out;
  });
  queue = job.catch(() => undefined);
  return job;
}

/** A per-fighter cache over renderSome: each image is rendered at most once per page load. */
function cached(w: number, h: number, place: Place) {
  const done: Record<string, Promise<string>> = {};
  return (ids: readonly string[]): Promise<Record<string, string>> => {
    const missing = ids.filter((id) => !(id in done));
    if (missing.length) {
      const batch = renderSome(missing, w, h, place);
      for (const id of missing) done[id] = batch.then((r) => r[id] ?? '');
    }
    return Promise.all(ids.map((id) => done[id].then((url) => [id, url] as const)))
      .then((pairs) => Object.fromEntries(pairs.filter(([, url]) => url)));
  };
}

const bodiesOf = cached(260, 320, (holder, H) => {
  const s = (320 * 0.86) / H;
  holder.scale.set(s, -s);
  holder.position.set(130, 320 - 14);
});

const facesOf = cached(256, 256, (holder, H) => {
  const s = 256 / (H * 0.42);
  holder.scale.set(s, -s);
  holder.position.set(128 - H * 0.03 * s, 128 + H * 0.86 * s);
});

/** Full-body renders (character select cards). */
export function fighterImages(): Promise<Record<string, string>> {
  return bodiesOf(ROSTER);
}

/** Square head-and-shoulders portraits for every fighter (Codex, profile). */
export function fighterPortraits(): Promise<Record<string, string>> {
  return facesOf(ROSTER);
}

/**
 * Portraits for just these fighters (the fight HUD and the ULTIMATE cinematic). Call it when the match
 * starts so the cinematic never has to render anything mid-fight.
 */
export function portraitsFor(ids: readonly string[]): Promise<Record<string, string>> {
  return facesOf(ids);
}
