import { Application, Container, Graphics, type Filter } from 'pixi.js';
import { AdvancedBloomFilter, GlowFilter, RGBSplitFilter, ShockwaveFilter } from 'pixi-filters';
import { BlurFilter } from 'pixi.js';
import type { ArenaInfo, FighterDefinition, FighterView, GameEvent, ObjectView, ProjectileView, ZoneView } from '../protocol';
import { NEON } from '../../fx/palette';
import { THE_LAB } from '../sim/constants';
import { createFighterVisual, type FighterVisual } from './characters/FighterVisual';
import { lookFor } from './characters/looks';
import { TheLab } from './arena/TheLab';
import { SpaceStation } from './arena/SpaceStation';
import { BlackHoleEdge } from './arena/BlackHoleEdge';
import { CurzonHall } from './arena/CurzonHall';
import type { ArenaBackdrop } from './arena/types';
import { EntityLayer } from './fx/EntityLayer';
import { FxSystem, makeTextures, type FxTextures } from './fx/primitives';
import { ChalkGradeFilter, LensingFilter, type Lens } from './fx/shaders';

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

import { getGraphicsPref, initialQuality, onGraphicsPref, type Quality } from './graphicsSettings';

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
  private lab: ArenaBackdrop | null = null;
  private entities: EntityLayer | null = null;
  private visuals: FighterVisual[] = [];
  /** Schrödinger's superposed copies, one per GHOST zone id. */
  private ghosts = new Map<number, FighterVisual>();
  private skins: (string | null)[] = [];
  private trails: Trail[] = [];
  private trailPool: Graphics[] = [];
  private trailTimer = 0;

  private bloom: AdvancedBloomFilter | null = null;
  private shock: ShockwaveFilter | null = null;
  private rgb: RGBSplitFilter | null = null;
  private lensing: LensingFilter | null = null;
  private grade: ChalkGradeFilter | null = null;
  private lastZones: ZoneView[] = [];
  private filterTime = 0;
  private quality: Quality = initialQuality();
  private frameEma = 16.7;
  private slowFrames = 0; // ms
  private warmup = 1500; // ms to ignore after (re)building: shader compiles and texture uploads stall frames
  private offPref: (() => void) | null = null;
  private appliedFilters: Filter[] = [];

  private arena: ArenaInfo = THE_LAB;
  private defs: FighterDefinition[] = [];
  private colors: number[] = [NEON.newton, NEON.tesla];
  private cam = { x: 800, viewW: 1600, shake: 0, zoomKick: 0, focusX: null as number | null };
  private cine = { t: 0, max: 0, slot: -1 };
  private combo = { attacker: -1, count: 0, timer: 0 };
  showHitboxes = false;

  async init(host: HTMLElement) {
    // Cap the pixel density: every full-screen pass costs (width × height × resolution²), and above
    // 1.5× the extra sharpness isn't worth dropped frames on phones and laptops with retina screens.
    await this.app.init({ preference: 'webgl', resizeTo: host, background: 0x0b0e11, antialias: true,
                          resolution: Math.min(window.devicePixelRatio || 1, 1.5), autoDensity: true,
                          powerPreference: 'high-performance' });
    host.appendChild(this.app.canvas);
    this.tex = makeTextures(this.app.renderer);
    this.fx = new FxSystem(this.tex);
    this.lightLayer.blendMode = 'add';
    this.world.addChild(this.arenaBack, this.entityBack, this.lightLayer, this.fighterLayer, this.entityFront,
                        this.fx.layer, this.arenaFront, this.debug);
    this.scene.addChild(this.world);
    this.app.stage.addChild(this.scene, this.overlay);
    this.applyQuality();
    this.offPref = onGraphicsPref((p) => this.setQuality(initialQuality(p)));
  }

  /** Change the VFX tier. The arena's optional blurs are rebuilt on the next setup(). */
  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.slowFrames = 0;
    this.warmup = 1000;
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
    this.trails = []; // their Graphics lived in fighterLayer, destroyed above
    const hq = this.quality !== 'low';
    this.warmup = 1500;
    this.lab = arena.id === 'space-station' ? new SpaceStation(arena.width, arena.height, this.tex, this.fx, hq)
      : arena.id === 'black-hole-edge' ? new BlackHoleEdge(arena.width, arena.height, this.tex, this.fx, hq)
      : arena.id === 'curzon-hall' ? new CurzonHall(arena.width, arena.height, this.tex, this.fx, hq)
      : new TheLab(arena.width, arena.height, this.tex, this.fx, hq);
    this.arenaBack.addChild(this.lab.back);
    this.arenaFront.addChild(this.lab.front);
    bakeStaticFilters(this.lab.back);
    bakeStaticFilters(this.lab.front);
    this.lightLayer.addChild(this.lab.lights);
    this.entities = new EntityLayer(this.tex, this.fx, arena.width, arena.height);
    this.entityBack.addChild(this.entities.back);
    this.entityFront.addChild(this.entities.front);
    this.lightLayer.addChild(this.entities.lights);
    this.visuals.forEach((v) => v.destroy());
    this.visuals = [];
    this.ghosts.clear(); // (their roots were in fighterLayer, destroyed above)
    this.skins = skins;
    this.visuals = fighters.map((d, i) => {
      const v = createFighterVisual(d, skins[i] ?? null);
      v.setGlow?.(this.quality !== 'low');
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
    this.lastZones = frame.zones;
    this.lab.update(dt, this.cam.x);
    if (frame.zones.some((z) => z.kind === 'FIELD')) this.lab.surge = 1;
    this.entities.update(dt, frame.projectiles, frame.zones, frame.objects, frame.fighters, this.defs, this.colors);
    frame.fighters.forEach((v, i) => this.visuals[i].update(v, dt));
    this.updateGhosts(frame, dt);
    this.updateTrails(frame.fighters, dt);
    this.fx.update(dt);
    this.updateFilters(realDt);
    this.drawDebug(frame);
    this.combo.timer -= dt;
    if (this.combo.timer <= 0) this.combo.count = 0;
  }

  /**
   * Superposition: a translucent second Schrödinger mirroring the real one at the GHOST zone's
   * position. Which one is real isn't decided until something hits him.
   */
  private updateGhosts(frame: RenderFrame, dt: number) {
    const live = new Set<number>();
    for (const z of frame.zones) {
      if (z.kind !== 'GHOST') continue;
      live.add(z.id);
      let g = this.ghosts.get(z.id);
      if (!g) {
        g = createFighterVisual(this.defs[z.owner], this.skins[z.owner] ?? null);
        g.setGlow?.(this.quality === 'high');
        this.fighterLayer.addChildAt(g.root, 0);
        this.ghosts.set(z.id, g);
        this.fx.burst(z.x, z.y, this.colors[z.owner], 24, 500, { grav: 0, life: 0.4 });
      }
      const real = frame.fighters[z.owner];
      g.update({ ...real, x: z.x, y: 0, vx: 0, vy: 0, invuln: 0, action: real.action === 'WALK' ? 'IDLE' : real.action }, dt);
      const fade = Math.min(1, z.age / 8) * Math.min(1, z.life / 20);
      g.root.alpha = (0.4 + 0.12 * Math.sin(performance.now() / 1000 * 9 + z.id)) * fade;
    }
    for (const [id, g] of this.ghosts) if (!live.has(id)) { g.destroy(); this.ghosts.delete(id); }
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
      case 'BLOCK':
        // an electric attack fizzling on Faraday's cage
        this.fx.burst(e.x, e.y, 0xe8834a, 22, 500, { streak: true, life: 0.3 });
        this.fx.ring(e.x, e.y, 0xe8834a, 70, 6, 0.25);
        break;
      case 'SHATTER':
        // Breaking Point: cracks race outward and everything flies
        this.cam.shake = 40;
        this.shockwave(e.x, e.y, 1.6);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
          const len = 400 + Math.random() * 500;
          const pts = [e.x, e.y];
          let x = e.x, y = e.y;
          for (let k = 0; k < 5; k++) { x += Math.cos(a + (Math.random() - 0.5) * 0.6) * len / 5; y += Math.sin(a + (Math.random() - 0.5) * 0.6) * len / 5; pts.push(x, y); }
          this.fx.transient(0.7, (g, k) => {
            g.clear().moveTo(pts[0], pts[1]);
            for (let j = 2; j < pts.length; j += 2) g.lineTo(pts[j], pts[j + 1]);
            g.stroke({ width: 4 * (1 - k), color: 0xe9f2ff, alpha: 1 - k });
          });
        }
        this.fx.burst(e.x, e.y, 0xc8d2dc, 60, 1200, { streak: true, life: 0.6 });
        break;
      case 'COLLAPSE': {
        // a superposition resolves: the wavefunction snaps to one outcome
        const c = 0x2ee6c9;
        this.fx.ring(e.x, e.y, c, 220, 10, 0.35);
        this.fx.ring(e.x, e.y, 0xffffff, 120, 6, 0.25);
        this.fx.burst(e.x, e.y, c, 34, 700, { grav: 0, life: 0.45, streak: true });
        if (e.move === 'special2') this.fx.burst(e.x, e.y, e.damage === 1 ? 0xfff1c4 : 0x9be07a, 30, 500, { life: 0.6 });
        this.cam.shake = Math.max(this.cam.shake, 10);
        break;
      }
      case 'PHASE':
        // Heisenberg: the shot passes through a smear of probability
        this.fx.burst(e.x, e.y, 0xff3df2, 16, 300, { grav: 0, life: 0.3 });
        this.fx.ring(e.x, e.y, 0xff3df2, 60, 3, 0.25);
        break;
      case 'FREEZE':
        this.fx.burst(e.x, e.y, 0xeaffff, 40, 700, { streak: true, life: 0.5 });
        this.fx.ring(e.x, e.y, 0x9fe8ff, 160, 8, 0.4);
        this.cam.shake = Math.max(this.cam.shake, 14);
        break;
      case 'CONDENSE': {
        // the whole arena drops toward absolute zero and becomes one super-atom
        this.shockwave(e.x, e.y, 1.4);
        this.fx.ring(e.x, e.y, 0x9fe8ff, 1200, 14, 0.7);
        for (let i = 0; i < 80; i++) this.fx.burst(Math.random() * this.arena.width, Math.random() * this.arena.height, 0xeaffff, 1, 40, { grav: -10, life: 1.2, size: 0.5 });
        this.cam.shake = 26;
        break;
      }
      case 'COPY':
        // a copied special: a burst in the caster's colour plus the copied fighter's
        this.fx.ring(e.x, e.y, color, 140, 6, 0.35);
        this.fx.burst(e.x, e.y, this.colors[e.defender] ?? 0xffffff, 20, 450, { grav: 0, life: 0.4 });
        break;
      case 'SWALLOW':
        // something crossed an event horizon: a flash of stretched light, then nothing
        this.fx.burst(e.x, e.y, 0xffc46a, 18, 300, { grav: 0, life: 0.35, streak: true });
        this.fx.ring(e.x, e.y, 0x6f7bff, 70, 5, 0.3);
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
    this.offPref?.();
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
    if (this.quality === 'low') return;
    const p = this.world.toGlobal({ x, y });
    if (!this.shock) {
      this.shock = new ShockwaveFilter({ amplitude: 26, wavelength: 140, speed: 900, brightness: 1.15, radius: -1 });
      if (this.quality !== 'high') this.shock.resolution = 1;
    }
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

    const high = this.quality === 'high';
    const filters: Filter[] = [];
    if (this.shockActive && this.shock) {
      this.shock.time += dt;
      if (this.shock.time > 0.6) this.shockActive = false; else filters.push(this.shock);
    }
    const lenses = this.quality !== 'low' ? this.lenses() : [];
    if (lenses.length) {
      if (!this.lensing) { this.lensing = new LensingFilter(); if (this.quality !== 'high') this.lensing.resolution = 1; }
      this.lensing.lenses = lenses;
      filters.unshift(this.lensing); // bend the scene first, then distort/bloom the result
    }
    if (this.bloom) filters.push(this.bloom);
    if (high) {
      // The grade's chromatic fringe doubles as the ULTIMATE colour split, so no extra pass is needed.
      this.grade ??= new ChalkGradeFilter();
      this.filterTime += dt;
      this.grade.time = this.filterTime;
      this.grade.fringe = 0.6 + cinK * 4;
      filters.push(this.grade);
    } else if (cinK > 0.02 && this.quality === 'medium') {
      if (!this.rgb) { this.rgb = new RGBSplitFilter(); this.rgb.resolution = 1; }
      const o = 8 * cinK;
      this.rgb.red = { x: -o, y: 0 };
      this.rgb.green = { x: 0, y: o * 0.5 };
      this.rgb.blue = { x: o, y: 0 };
      filters.push(this.rgb);
    }
    // Only touch scene.filters when the set of passes changes: reassigning every frame makes Pixi
    // re-validate the chain and can reallocate render targets mid-fight.
    const prev = this.appliedFilters;
    if (filters.length !== prev.length || filters.some((f, i) => f !== prev[i])) {
      this.appliedFilters = filters;
      this.scene.filters = filters.length ? filters : null;
    }
  }

  /**
   * Black holes on screen, as gravitational lenses: the Black Hole Edge's well, and Hawking's
   * singularities. Einstein radii are in world units scaled to screen pixels.
   */
  private lenses(): Lens[] {
    const out: Lens[] = [];
    const scale = Math.abs(this.world.scale.x);
    const at = (x: number, y: number, einstein: number, shadow: number) => {
      const p = this.world.toGlobal({ x, y });
      out.push({ x: p.x, y: p.y, einstein: einstein * scale, shadow: shadow * scale });
    };
    if (this.arena.well) at(this.arena.well.x, this.arena.well.y, 96, 66); // shadow matches the drawn one
    for (const z of this.lastZones) {
      if (z.kind !== 'SINGULARITY' || out.length >= 4) continue;
      const k = Math.min(1, z.age / 12) * Math.min(1, z.life / 15);
      at(z.x, z.y, z.w * 0.1 * k, Math.max(26, z.w * 0.12) * k); // gentler, so a fighter caught inside stays readable
    }
    return out;
  }

  private applyQuality() {
    this.bloom?.destroy();
    this.bloom = null;
    if (this.quality === 'high') {
      this.bloom = new AdvancedBloomFilter({ threshold: 0.62, bloomScale: 0.6, brightness: 1.0, blur: 5, quality: 3 });
    } else if (this.quality === 'medium') {
      this.bloom = new AdvancedBloomFilter({ threshold: 0.62, bloomScale: 0.55, brightness: 1.0, blur: 4, quality: 2 });
      this.bloom.resolution = 1; // at CSS pixels: on a retina screen that's a quarter of the work
    }
    if (this.lensing) this.lensing.resolution = this.quality === 'high' ? 'inherit' : 1;
    if (this.shock) this.shock.resolution = this.quality === 'high' ? 'inherit' : 1;
    this.visuals.forEach((v) => v.setGlow?.(this.quality !== 'low'));
    this.appliedFilters = [];
    this.scene.filters = null;
  }

  /**
   * "Auto" graphics: keep a smoothed frame time and, if the game can't hold ~50 fps for about two
   * seconds, step down one tier (high → medium → low). Hitches from a hidden tab or GC are ignored.
   */
  private autoQuality(dtMs: number) {
    if (this.warmup > 0) { this.warmup -= Math.min(dtMs, 250); return; }
    if (getGraphicsPref() !== 'auto' || this.quality === 'low' || dtMs > 1000) return; // >1 s: tab was hidden
    this.frameEma += (Math.min(dtMs, 100) - this.frameEma) * 0.08;
    // milliseconds spent below ~48 fps; recovering frames pay it back twice as fast
    this.slowFrames = this.frameEma > 21 ? this.slowFrames + dtMs : Math.max(0, this.slowFrames - 2 * dtMs);
    if (this.slowFrames > 2000) {
      this.setQuality(this.quality === 'high' ? 'medium' : 'low');
      this.frameEma = 16.7;
      console.info(`[NEWTON BRAWL] Frames running slow: VFX quality set to ${this.quality}.`);
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
        const g = this.trailPool.pop() ?? new Graphics();
        g.clear();
        g.roundRect(v.x - W * 0.35, v.y, W * 0.7, H * 0.8, 20).fill({ color: this.colors[i], alpha: 0.25 });
        g.circle(v.x + v.facing * H * 0.04, v.y + H * 0.9, H * 0.1).fill({ color: this.colors[i], alpha: 0.25 });
        g.blendMode = 'add';
        g.alpha = 1;
        this.fighterLayer.addChildAt(g, 0);
        this.trails.push({ g, age: 0 });
      });
    }
    // Recycle afterimages instead of creating and destroying a Graphics every 30 ms (GC hitches).
    let keep = 0;
    for (const t of this.trails) {
      t.age += dt;
      t.g.alpha = Math.max(0, 1 - t.age / 0.3);
      if (t.age >= 0.3) { t.g.removeFromParent(); if (this.trailPool.length < 24) this.trailPool.push(t.g); else t.g.destroy(); }
      else this.trails[keep++] = t;
    }
    this.trails.length = keep;
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

/**
 * Arena decorations with a glow or blur never change, but Pixi re-runs their filters every frame.
 * Render each one once into a cached texture instead (blurred ones at half resolution — a blur
 * hides the difference). Animated filters (god rays) and Text are left alone.
 */
function bakeStaticFilters(root: Container) {
  const targets: Graphics[] = [];
  const walk = (c: Container) => {
    for (const ch of c.children) {
      if (ch instanceof Graphics && ch.filters && (ch.filters as Filter[]).length
          && (ch.filters as Filter[]).every((f) => f instanceof GlowFilter || f instanceof BlurFilter)) targets.push(ch);
      else if (ch.children.length) walk(ch as Container);
    }
  };
  walk(root);
  for (const g of targets) {
    const parent = g.parent;
    if (!parent) continue;
    const blurOnly = (g.filters as Filter[]).every((f) => f instanceof BlurFilter);
    const wrap = new Container();
    parent.addChildAt(wrap, parent.getChildIndex(g));
    wrap.addChild(g);
    wrap.cacheAsTexture({ resolution: blurOnly ? 0.5 : 1, antialias: true });
  }
}
