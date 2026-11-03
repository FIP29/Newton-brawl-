import { Application, Container, Graphics, type Filter } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, ShockwaveFilter } from 'pixi-filters';
import type { ArenaInfo, FighterDefinition, FighterView, GameEvent, ObjectView, ProjectileView, ZoneView } from '../protocol';
import { NEON } from '../../fx/palette';
import { THE_LAB } from '../sim/constants';
import { createFighterVisual, type FighterVisual } from './characters/FighterVisual';
import { lookFor } from './characters/looks';
import { TheLab } from './arena/TheLab';
import { EntityLayer } from './fx/EntityLayer';
import { FxSystem, makeTextures, type FxTextures } from './fx/primitives';

const FLOOR_SCREEN_FRACTION = 0.86; // floor line sits at 86% of the screen height
const MIN_VIEW_WIDTH = 1050;        // closest normal zoom, in world units across the screen

/** Everything the renderer needs for one frame. Fighters are already interpolated/predicted. */
export interface RenderFrame {
  fighters: FighterView[];
  projectiles: ProjectileView[];
  zones: ZoneView[];
  objects: ObjectView[];
  hitstop: number;
  cinematic: number;
}

type Quality = 'high' | 'low';

interface Trail { g: Graphics; age: number }

/**
 * Renders a match: The Lab arena, scientists, specials and all the game juice.
 *
 * World space is the server's (x right, y up, floor at 0, 100 units ≈ 1 m). `world` is the camera:
 * it flips y, follows the fighters, zooms in on combos/ultimates and shakes on impact.
 * Screen-space filters: bloom (whole scene), shockwave distortion (heavy hits), RGB split
 * (ultimate cinematics). Quality drops automatically if the frame rate can't keep up.
 */
export class FightRenderer {
  readonly app = new Application();
  private scene = new Container();       // filtered root
  private world = new Container();       // camera transform
  private arenaBack = new Container();
  private lightLayer = new Container();
  private entityBack = new Container();
  private fighterLayer = new Container();
  private entityFront = new Container();
  private arenaFront = new Container();
  private debug = new Graphics();
  private overlay = new Graphics();      // screen-space darkening for cinematics

  private tex!: FxTextures;
  private fx!: FxSystem;
  private lab: TheLab | null = null;
  private entities: EntityLayer | null = null;
  private visuals: FighterVisual[] = [];
  private trails: Trail[] = [];
  private trailTimer = 0;

  private bloom: AdvancedBloomFilter | null = null;
  private shock: ShockwaveFilter | null = null;
  private rgb: RGBSplitFilter | null = null;
  private quality: Quality = 'high';
  private slowFrames = 0;

  private arena: ArenaInfo = THE_LAB;
  private defs: FighterDefinition[] = [];
  private colors: number[] = [NEON.newton, NEON.tesla];
  private cam = { x: 800, viewW: 1600, shake: 0, zoomKick: 0, focusX: null as number | null };
  private cine = { t: 0, max: 0, slot: -1 };
  private combo = { attacker: -1, count: 0, timer: 0 };
  showHitboxes = false;

  async init(host: HTMLElement) {
    await this.app.init({ resizeTo: host, background: 0x0b0e11, antialias: true,
                          resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    this.tex = makeTextures(this.app.renderer);
    this.fx = new FxSystem(this.tex);
    this.lightLayer.blendMode = 'add';
    this.world.addChild(this.arenaBack, this.entityBack, this.lightLayer, this.fighterLayer, this.entityFront,
                        this.fx.layer, this.arenaFront, this.debug);
    this.scene.addChild(this.world);
    this.app.stage.addChild(this.scene, this.overlay);
    this.applyQuality();
  }

  /** Builds the arena and fighters once the match configuration is known. */
  setup(arena: ArenaInfo, fighters: FighterDefinition[], skins: (string | null)[] = []) {
    this.arena = arena;
    this.defs = fighters;
    this.colors = fighters.map((d) => lookFor(d.id).glow);
    this.cam.x = arena.width / 2;
    for (const c of [this.arenaBack, this.arenaFront, this.lightLayer, this.entityBack, this.entityFront, this.fighterLayer]) {
      c.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    }
    this.fx.clear();
    this.lab = new TheLab(arena.width, arena.height, this.tex, this.fx, this.quality === 'high');
    this.arenaBack.addChild(this.lab.back);
    this.arenaFront.addChild(this.lab.front);
    this.lightLayer.addChild(this.lab.lights);
    this.entities = new EntityLayer(this.tex, this.fx, arena.width, arena.height);
    this.entityBack.addChild(this.entities.back);
    this.entityFront.addChild(this.entities.front);
    this.lightLayer.addChild(this.entities.lights);
    this.visuals.forEach((v) => v.destroy());
    this.visuals = [];
    this.visuals = fighters.map((d, i) => {
      const v = createFighterVisual(d, skins[i] ?? null);
      this.fighterLayer.addChild(v.root);
      return v;
    });
  }

  /** Draw one frame. `dtMs` is real elapsed time. */
  render(frame: RenderFrame, dtMs: number) {
    if (this.visuals.length !== frame.fighters.length || !this.lab || !this.entities) return;
    this.autoQuality(dtMs);
    const dt = Math.min(dtMs, 50) / 1000;
    const realDt = Math.min(dtMs, 250) / 1000; // timers that must track wall-clock time (camera, cinematic)
    this.updateCamera(frame.fighters, realDt, frame.hitstop > 0 || frame.cinematic > 0);
    this.lab.update(dt, this.cam.x);
    if (frame.zones.some((z) => z.kind === 'FIELD')) this.lab.surge = 1;
    this.entities.update(dt, frame.projectiles, frame.zones, frame.objects, frame.fighters, this.defs, this.colors);
    frame.fighters.forEach((v, i) => this.visuals[i].update(v, dt));
    this.updateTrails(frame.fighters, dt);
    this.fx.update(dt);
    this.updateFilters(realDt);
    this.drawDebug(frame);
    this.combo.timer -= dt;
    if (this.combo.timer <= 0) this.combo.count = 0;
  }

  /** React to a simulation event with VFX. Returns the combo count for HIT events. */
  onEvent(e: GameEvent): number {
    const color = this.colors[e.attacker] ?? 0xffffff;
    switch (e.type) {
      case 'HIT':
      case 'REFLECT': {
        const heavy = e.damage >= 100;
        const big = e.damage >= 200;
        this.fx.burst(e.x, e.y, color, heavy ? 44 : 20, heavy ? 950 : 600, { streak: true, life: 0.35 });
        this.fx.burst(e.x, e.y, 0xffffff, heavy ? 14 : 6, heavy ? 500 : 300);
        this.fx.ring(e.x, e.y, color, heavy ? 180 : 95, heavy ? 16 : 9, heavy ? 0.35 : 0.22);
        if (e.type === 'REFLECT') this.fx.ring(e.x, e.y, NEON.newton, 240, 10, 0.4);
        this.cam.shake = Math.max(this.cam.shake, big ? 34 : heavy ? 22 : 9);
        if (e.defender >= 0) this.visuals[e.defender]?.flash();
        if (heavy) this.shockwave(e.x, e.y, big ? 1.4 : 1);
        // combo tracking → camera zooms in as the string grows
        if (e.attacker === this.combo.attacker && this.combo.timer > 0) this.combo.count++;
        else { this.combo.attacker = e.attacker; this.combo.count = 1; }
        this.combo.timer = 0.9;
        this.cam.zoomKick = Math.min(0.22, (heavy ? 0.06 : 0.025) + (this.combo.count - 1) * 0.03);
        return this.combo.count;
      }
      case 'ARC':
        this.fx.burst(e.x, e.y, NEON.tesla, 18, 600, { streak: true, life: 0.3 });
        this.fx.ring(e.x, e.y, NEON.tesla, 80, 6, 0.2);
        break;
      case 'CLANK':
        this.fx.burst(e.x, e.y, 0xd7dde3, 14, 700, { streak: true, life: 0.25 });
        this.cam.shake = Math.max(this.cam.shake, 6);
        break;
      case 'CAST':
        this.fx.burst(e.x, e.y, color, 14, 380, { grav: 0, life: 0.4 });
        this.fx.ring(e.x, e.y, color, 110, 6, 0.3);
        break;
      case 'ULTIMATE':
        this.cine = { t: 0, max: 1.0, slot: e.attacker };
        this.cam.focusX = e.x;
        this.fx.burst(e.x, e.y, color, 60, 700, { grav: 0, life: 0.9, streak: true });
        break;
    }
    return 0;
  }

  /** Lightning from the nearest coil to a struck fighter (Tesla Coil ULTIMATE). */
  coilStrike(x: number, y: number) {
    if (!this.lab) return;
    const coil = this.lab.coils.reduce((a, b) => (Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b));
    this.fx.lightning(coil.x, coil.y, x, y, NEON.tesla, 6, 0.2);
  }

  resize() { this.app.resize(); }

  destroy() {
    this.app.destroy(true, { children: true, texture: true });
  }

  // ------------------------------------------------------------------ camera

  private updateCamera(fs: FighterView[], dt: number, frozen: boolean) {
    const sw = this.app.screen.width, sh = this.app.screen.height;
    const mid = (fs[0].x + fs[1].x) / 2;
    const spread = Math.abs(fs[0].x - fs[1].x);
    let targetW = Math.min(this.arena.width, Math.max(MIN_VIEW_WIDTH, spread + 720));
    let targetX = mid;
    // Cinematic: punch in on the caster.
    const cinK = this.cine.max > 0 ? Math.sin(Math.min(1, this.cine.t / this.cine.max) * Math.PI) : 0;
    if (cinK > 0 && this.cam.focusX !== null) {
      targetW = targetW * (1 - 0.35 * cinK);
      targetX = targetX + (this.cam.focusX - targetX) * cinK;
    }
    const k = 1 - Math.exp(-dt * (cinK > 0 ? 8 : 4));
    this.cam.viewW += (targetW - this.cam.viewW) * k;
    const scale = (sw / this.cam.viewW) * (1 + this.cam.zoomKick);
    const halfView = sw / scale / 2;
    this.cam.x += (clamp(targetX, halfView, this.arena.width - halfView) - this.cam.x) * k;

    const shake = this.cam.shake;
    const sx = (Math.random() - 0.5) * 2 * shake, sy = (Math.random() - 0.5) * 2 * shake;
    this.cam.shake *= Math.exp(-dt * (frozen ? 5 : 13));
    this.cam.zoomKick *= Math.exp(-dt * (this.combo.timer > 0 ? 1.5 : 6));

    this.world.scale.set(scale, -scale);
    this.world.position.set(sw / 2 - this.cam.x * scale + sx, sh * FLOOR_SCREEN_FRACTION + sy);
  }

  // ----------------------------------------------------------------- filters

  private shockwave(x: number, y: number, power: number) {
    if (this.quality !== 'high') return;
    const p = this.world.toGlobal({ x, y });
    if (!this.shock) this.shock = new ShockwaveFilter({ amplitude: 26, wavelength: 140, speed: 900, brightness: 1.15, radius: -1 });
    this.shock.center = { x: p.x, y: p.y };
    this.shock.amplitude = 26 * power;
    this.shock.time = 0;
    this.shockActive = true;
  }
  private shockActive = false;

  private updateFilters(dt: number) {
    // ULTIMATE cinematic: screen darkens, colours split, then everything snaps back.
    let cinK = 0;
    if (this.cine.max > 0) {
      this.cine.t += dt;
      cinK = Math.sin(Math.min(1, this.cine.t / this.cine.max) * Math.PI);
      if (this.cine.t >= this.cine.max) { this.cine.max = 0; this.cam.focusX = null; this.cam.shake = 26; cinK = 0; }
    }
    const sw = this.app.screen.width, sh = this.app.screen.height;
    this.overlay.clear();
    if (cinK > 0) {
      this.overlay.rect(0, 0, sw, sh).fill({ color: 0x000000, alpha: 0.6 * cinK });
      // speed lines converging on the caster
      const cx = sw / 2, cy = sh * 0.55;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2 + this.cine.t;
        const r0 = Math.max(sw, sh) * (0.45 + Math.random() * 0.1);
        this.overlay.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0).lineTo(cx + Math.cos(a) * r0 * 0.7, cy + Math.sin(a) * r0 * 0.7);
      }
      this.overlay.stroke({ width: 3, color: this.colors[this.cine.slot] ?? 0xffffff, alpha: 0.5 * cinK });
    }

    const filters: Filter[] = [];
    if (this.shockActive && this.shock) {
      this.shock.time += dt;
      if (this.shock.time > 0.6) this.shockActive = false; else filters.push(this.shock);
    }
    if (cinK > 0.02) {
      if (!this.rgb) this.rgb = new RGBSplitFilter();
      const o = 10 * cinK;
      this.rgb.red = { x: -o, y: 0 };
      this.rgb.green = { x: 0, y: o * 0.5 };
      this.rgb.blue = { x: o, y: 0 };
      filters.push(this.rgb);
    }
    if (this.bloom) filters.push(this.bloom);
    this.scene.filters = filters.length ? filters : null;
  }

  private applyQuality() {
    this.bloom = this.quality === 'high'
      ? new AdvancedBloomFilter({ threshold: 0.62, bloomScale: 0.6, brightness: 1.0, blur: 6, quality: 5 })
      : null;
  }

  /** If frames take > 28 ms for ~2 s, drop to low quality (no bloom/shockwave/god rays). */
  private autoQuality(dtMs: number) {
    if (this.quality === 'low') return;
    this.slowFrames = dtMs > 28 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 120) {
      this.quality = 'low';
      this.applyQuality();
      console.info('[NEWTON BRAWL] Low frame rate detected: switching to low VFX quality.');
    }
  }

  // ------------------------------------------------------------------ trails

  /** Afterimages for fast movement (Light Dash, launches). */
  private updateTrails(fs: FighterView[], dt: number) {
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.03;
      fs.forEach((v, i) => {
        const fast = Math.abs(v.vx) > 650 || Math.abs(v.vy) > 900 || v.invuln > 0;
        if (!fast) return;
        const H = this.defs[i].body.height, W = this.defs[i].body.width;
        const g = new Graphics();
        g.roundRect(v.x - W * 0.35, v.y, W * 0.7, H * 0.8, 20).fill({ color: this.colors[i], alpha: 0.25 });
        g.circle(v.x + v.facing * H * 0.04, v.y + H * 0.9, H * 0.1).fill({ color: this.colors[i], alpha: 0.25 });
        g.blendMode = 'add';
        this.fighterLayer.addChildAt(g, 0);
        this.trails.push({ g, age: 0 });
      });
    }
    this.trails = this.trails.filter((t) => {
      t.age += dt;
      t.g.alpha = Math.max(0, 1 - t.age / 0.3);
      if (t.age >= 0.3) { t.g.destroy(); return false; }
      return true;
    });
  }

  // ------------------------------------------------------------------- debug

  /** Hurtboxes (cyan), hitboxes (red), zones (yellow), toggled with H. Same maths as the server. */
  private drawDebug(frame: RenderFrame) {
    const g = this.debug.clear();
    if (!this.showHitboxes) return;
    frame.fighters.forEach((v, i) => {
      const d = this.defs[i];
      const h = d.body.height * (v.action === 'CROUCH' ? 0.6 : 1);
      g.rect(v.x - d.body.width / 2, v.y, d.body.width, h).stroke({ width: 3, color: 0x33ddff, alpha: 0.9 });
      const m = v.move ? d.moves[v.move] : undefined;
      if (v.action === 'ATTACK' && m?.hitbox && v.moveFrame >= m.startup && v.moveFrame < m.startup + m.active) {
        const b = m.hitbox;
        g.rect(v.x + v.facing * b.x - b.w / 2, v.y + b.y - b.h / 2, b.w, b.h).fill({ color: 0xff3355, alpha: 0.3 }).stroke({ width: 3, color: 0xff3355 });
      }
    });
    for (const p of frame.projectiles) g.rect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h).stroke({ width: 2, color: 0xff3355 });
    for (const z of frame.zones) g.rect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h).stroke({ width: 2, color: 0xffe066, alpha: 0.7 });
    for (const o of frame.objects) g.rect(o.x - o.w / 2, o.y, o.w, o.h).stroke({ width: 2, color: 0x9fb3c8 });
  }
}

function clamp(v: number, lo: number, hi: number) {
  return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
}
