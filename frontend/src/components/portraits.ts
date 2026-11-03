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

/** Renders each fighter with a placement function; runs jobs one at a time on the shared app. */
function renderAll(w: number, h: number, place: (holder: Container, H: number) => void): Promise<Record<string, string>> {
  const job = queue.then(async () => {
    const app = await offscreenApp();
    app.renderer.resize(w, h);
    const out: Record<string, string> = {};
    for (const id of ROSTER) {
      const def = FIGHTERS[id];
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
    }
    return out;
  });
  queue = job.catch(() => undefined);
  return job;
}

let bodies: Promise<Record<string, string>> | null = null;
let faces: Promise<Record<string, string>> | null = null;

/** Full-body renders (character select cards). */
export function fighterImages(): Promise<Record<string, string>> {
  bodies ??= renderAll(260, 320, (holder, H) => {
    const s = (320 * 0.86) / H;
    holder.scale.set(s, -s);
    holder.position.set(130, 320 - 14);
  });
  return bodies;
}

/** Square head-and-shoulders portraits (HUD, ULTIMATE cinematic). */
export function fighterPortraits(): Promise<Record<string, string>> {
  faces ??= renderAll(256, 256, (holder, H) => {
    const s = 256 / (H * 0.42);
    holder.scale.set(s, -s);
    holder.position.set(128 - H * 0.03 * s, 128 + H * 0.86 * s);
  });
  return faces;
}
