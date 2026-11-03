import { BlurFilter, Container, Graphics, Sprite, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { NEON } from '../../../fx/palette';
import type { FxSystem, FxTextures } from '../fx/primitives';
import { drawBolt, lightningPoints } from '../fx/primitives';
import type { ArenaBackdrop } from './types';

interface Layer { c: Container; factor: number }

const BRICK = 0x7e2a20, BRICK_DARK = 0x5e1d16, TRIM = 0xd8c9a6, TRIM_DIM = 0xa8987a, GLOW = 0xffc46a;

/**
 * CURZON HALL, University of Dhaka, at night. The red-brick hall (1904) mixes Mughal and European
 * styles: pointed arcades, a tall arched entrance, little domed chhatri kiosks along the roof and
 * domed corner towers. S.N. Bose taught physics here when he wrote his 1924 paper to Einstein, so
 * his formulas glow on the walls.
 *
 * Parallax layers (fraction of camera motion):
 *   0.05  night sky, crescent moon, stars
 *   0.25  distant tree line
 *   0.45  the hall itself, with lit windows and glowing equations
 *   0.75  krishnachura (flame trees) in bloom and lamp posts
 *   1.0   the lawn
 *   1.3   blurred foreground grass and marigolds
 */
export class CurzonHall implements ArenaBackdrop {
  readonly back = new Container();
  readonly front = new Container();
  readonly lights = new Container();
  surge = 0;
  private layers: Layer[] = [];
  private stars: Array<{ s: Sprite; phase: number }> = [];
  private windows: Array<{ g: Graphics; phase: number }> = [];
  private equations: Text[] = [];
  private lamps: Array<{ s: Sprite; x: number; y: number }> = [];
  private sparks = new Graphics();
  private time = 0;

  constructor(private readonly W: number, private readonly H: number, private readonly tex: FxTextures,
              private readonly fx: FxSystem, highQuality: boolean) {
    this.build(highQuality);
  }

  get coils() { return this.lamps.map((l) => ({ x: l.x, y: l.y })); }

  private layer(factor: number, front = false): Container {
    const c = new Container();
    (front ? this.front : this.back).addChild(c);
    this.layers.push({ c, factor });
    return c;
  }

  /** A pointed (Mughal-style) arch from y0 up to y0 + h, filled. */
  private arch(g: Graphics, x: number, y0: number, w: number, h: number, fill: number, alpha = 1) {
    const spring = y0 + h - w * 0.62;
    g.moveTo(x - w / 2, y0).lineTo(x - w / 2, spring)
      .quadraticCurveTo(x - w / 2, spring + w * 0.5, x, y0 + h)
      .quadraticCurveTo(x + w / 2, spring + w * 0.5, x + w / 2, spring)
      .lineTo(x + w / 2, y0).closePath().fill({ color: fill, alpha });
  }

  /** A small domed rooftop kiosk (chhatri). */
  private chhatri(g: Graphics, x: number, y: number, s: number) {
    for (const px of [-0.4, 0.4]) g.rect(x + px * s - s * 0.06, y, s * 0.12, s * 0.7).fill(TRIM_DIM);
    g.rect(x - s * 0.55, y + s * 0.7, s * 1.1, s * 0.1).fill(TRIM_DIM);
    const pts: number[] = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI - (i / 16) * Math.PI; pts.push(x + Math.cos(a) * s * 0.48, y + s * 0.8 + Math.sin(a) * s * 0.55); }
    g.poly(pts).fill(TRIM);
    g.moveTo(x, y + s * 1.35).lineTo(x, y + s * 1.6).stroke({ width: 3, color: TRIM });
    g.circle(x, y + s * 1.62, 3).fill(GLOW);
  }

  private build(hq: boolean) {
    const { W, H } = this;

    // ---- night sky ------------------------------------------------------------
    const sky = this.layer(0.05);
    const grad = new Graphics();
    const bands = [0x070a1c, 0x0b1029, 0x111637, 0x1b1c40, 0x2a2142];
    bands.forEach((c, i) => grad.rect(-1400, H + 300 - (i + 1) * 260, W + 2800, 262).fill(c));
    sky.addChild(grad);
    for (let i = 0; i < 180; i++) {
      const s = new Sprite(this.tex.dot);
      s.anchor.set(0.5);
      s.position.set(-700 + Math.random() * (W + 1400), 380 + Math.random() * (H + 200));
      s.scale.set(0.05 + Math.random() * 0.16);
      sky.addChild(s);
      this.stars.push({ s, phase: Math.random() * 10 });
    }
    // crescent moon
    const moon = new Graphics().circle(W * 0.78, H * 0.92, 44).fill(0xfff4d6);
    moon.filters = [new GlowFilter({ color: 0xffe7a8, distance: 30, outerStrength: 2.5, quality: 0.2 })];
    sky.addChild(moon);
    sky.addChild(new Graphics().circle(W * 0.78 + 18, H * 0.92 + 10, 40).fill(0x111637));

    // ---- distant trees ---------------------------------------------------------
    const far = this.layer(0.25);
    const treeline = new Graphics();
    for (let x = -900; x < W + 900; x += 70) treeline.circle(x, 200 + Math.sin(x * 0.03) * 40, 70 + Math.sin(x * 0.11) * 20).fill(0x0c1a17);
    treeline.rect(-900, 0, W + 1800, 200).fill(0x0c1a17);
    far.addChild(treeline);

    // ---- Curzon Hall -------------------------------------------------------------
    const hall = this.layer(0.45);
    const g = new Graphics();
    const x0 = -420, x1 = W + 420, base = 30, wallTop = 520;
    // wings
    g.rect(x0, base, x1 - x0, wallTop - base).fill(BRICK);
    // central block, taller, with the big entrance arch
    const cx = W / 2;
    g.rect(cx - 250, base, 500, 650 - base).fill(BRICK);
    // flanking towers with domes
    for (const tx of [cx - 290, cx + 290]) {
      g.rect(tx - 45, base, 90, 760 - base).fill(BRICK_DARK);
      g.rect(tx - 52, 760, 104, 14).fill(TRIM);
      const dome: number[] = [];
      for (let i = 0; i <= 20; i++) { const a = Math.PI - (i / 20) * Math.PI; dome.push(tx + Math.cos(a) * 46, 774 + Math.sin(a) * 62); }
      g.poly(dome).fill(TRIM);
      g.moveTo(tx, 836).lineTo(tx, 872).stroke({ width: 4, color: TRIM });
    }
    // brick courses
    for (let y = base + 14; y < 650; y += 16) {
      g.moveTo(x0, y).lineTo(x1, y);
    }
    g.stroke({ width: 1, color: BRICK_DARK, alpha: 0.55 });
    // cream string courses and cornice
    for (const y of [base, 270, 500]) g.rect(x0, y, x1 - x0, 10).fill(TRIM_DIM);
    g.rect(x0, wallTop, x1 - x0, 16).fill(TRIM);
    g.rect(cx - 262, 650, 524, 18).fill(TRIM);
    // battlement-like parapet on the wings
    for (let x = x0; x < x1; x += 40) g.rect(x + 6, wallTop + 16, 24, 18).fill(BRICK_DARK);
    // the grand entrance
    this.arch(g, cx, base, 220, 470, TRIM);
    this.arch(g, cx, base + 8, 190, 445, 0x2a1408);
    hall.addChild(g);
    // arcades: two storeys of pointed arches along each wing; some windows lit from inside
    const windows = new Graphics();
    windows.blendMode = 'add';
    for (let x = x0 + 70; x < x1 - 40; x += 120) {
      if (Math.abs(x - cx) < 320) continue;
      for (const [y, h] of [[base + 30, 220], [290, 190]] as const) {
        this.arch(g, x, y, 82, h, TRIM_DIM);
        this.arch(g, x, y + 5, 68, h - 12, 0x1a0c08);
        if (Math.random() < 0.45) {
          const w = new Graphics();
          this.arch(w, x, y + 5, 68, h - 12, GLOW, 0.35);
          w.blendMode = 'add';
          hall.addChild(w);
          this.windows.push({ g: w, phase: Math.random() * 10 });
        }
      }
    }
    // windows on the central block either side of the entrance
    for (const wx of [cx - 170, cx + 170]) {
      this.arch(g, wx, 400, 70, 180, TRIM_DIM);
      this.arch(g, wx, 405, 58, 168, 0x1a0c08);
      const w = new Graphics();
      this.arch(w, wx, 405, 58, 168, GLOW, 0.4);
      w.blendMode = 'add';
      hall.addChild(w);
      this.windows.push({ g: w, phase: Math.random() * 10 });
    }
    // chhatris along the roofline
    const roof = new Graphics();
    for (let x = x0 + 100; x < x1; x += 260) if (Math.abs(x - cx) > 340) this.chhatri(roof, x, wallTop + 34, 54);
    for (const kx of [cx - 150, cx, cx + 150]) this.chhatri(roof, kx, 668, kx === cx ? 80 : 56);
    hall.addChild(roof);
    hall.addChild(windows);
    // glowing equations on the walls: Bose's 1924 counting of photons
    const lines: Array<[string, number, number, number, number]> = [
      ['n = 1 / (e^(hν/kT) − 1)', cx, 590, NEON.bose, 40],
      ['E = hν', cx - 560, 420, NEON.bose, 34], ['u(ν) = 8πhν³/c³ · n', cx + 600, 420, NEON.bose, 30],
      ['Dhaka, 1924', cx - 900, 140, 0xffe7a8, 28], ['λ = 5 mm', cx + 930, 140, NEON.jcbose, 28],
    ];
    for (const [text, x, y, color, size] of lines) {
      const t = new Text({ text, style: { fontFamily: 'Caveat, cursive', fontSize: size, fill: color, fontWeight: '700' } });
      t.anchor.set(0.5); t.position.set(x, y); t.scale.y = -1; t.alpha = 0.8;
      t.filters = [new GlowFilter({ color, distance: 12, outerStrength: 1.6, quality: 0.2 })];
      hall.addChild(t);
      this.equations.push(t);
    }

    // ---- flame trees and lamp posts ------------------------------------------------
    const mid = this.layer(0.75);
    const trees = new Graphics();
    for (const tx of [-60, W + 60]) {
      trees.moveTo(tx, 0).lineTo(tx + 10, 300).stroke({ width: 26, color: 0x1c120c });
      trees.moveTo(tx + 8, 260).lineTo(tx + (tx < W / 2 ? 120 : -120), 380).stroke({ width: 12, color: 0x1c120c });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        trees.circle(tx + Math.cos(a) * 150, 420 + Math.sin(a) * 70, 70).fill(0x0f2617);
      }
      // krishnachura blossoms: scarlet clusters over the canopy
      for (let i = 0; i < 110; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
        trees.circle(tx + Math.cos(a) * 210 * rr, 420 + Math.sin(a) * 120 * rr, 4 + Math.random() * 5).fill(Math.random() < 0.7 ? 0xe8381f : 0xff7a2a);
      }
    }
    mid.addChild(trees);
    const posts = new Graphics();
    for (const lx of [W * 0.12, W * 0.88]) {
      posts.rect(lx - 5, 0, 10, 300).fill(0x1a1a1f);
      posts.rect(lx - 18, 300, 36, 44).fill({ color: 0xffe0a0, alpha: 0.9 }).stroke({ width: 3, color: 0x2a2a30 });
      posts.poly([lx - 24, 344, lx + 24, 344, lx, 370]).fill(0x2a2a30);
      const glow = new Sprite(this.tex.light);
      glow.anchor.set(0.5); glow.position.set(lx, 322); glow.scale.set(4); glow.tint = GLOW; glow.blendMode = 'add'; glow.alpha = 0.45;
      this.lights.addChild(glow);
      this.lamps.push({ s: glow, x: lx, y: 322 });
    }
    mid.addChild(posts);
    this.sparks.blendMode = 'add';
    mid.addChild(this.sparks);

    // ---- lawn ------------------------------------------------------------------------
    const lawn = this.layer(1);
    const ground = new Graphics();
    ground.rect(-1400, -500, W + 2800, 500).fill(0x0d1f12);
    for (let x = -1400; x < W + 1400; x += 120) ground.rect(x, -500, 60, 500).fill({ color: 0x112816, alpha: 0.8 }); // mown stripes
    for (let i = 1; i < 6; i++) ground.rect(-1400, -i * i * 9, W + 2800, 1.5).fill({ color: GLOW, alpha: 0.04 / i });
    lawn.addChild(ground);
    const path = new Graphics().rect(-1400, -6, W + 2800, 8).fill(0x8a5a3c);
    for (let x = -1400; x < W + 1400; x += 28) path.rect(x, -6, 2, 8).fill(0x5e3a26);
    lawn.addChild(path);
    const edge = new Graphics().rect(0, -1, W, 3).fill(GLOW);
    edge.alpha = 0.35;
    lawn.addChild(edge);

    // ---- foreground --------------------------------------------------------------------
    const fg = this.layer(1.3, true);
    const grass = new Graphics();
    for (let x = -500; x < W + 500; x += 9) {
      const h = 30 + Math.abs(Math.sin(x * 0.37)) * 50;
      grass.moveTo(x, -40).lineTo(x + Math.sin(x) * 8, -40 + h).stroke({ width: 3, color: 0x07120a });
    }
    for (let i = 0; i < 24; i++) grass.circle(-400 + Math.random() * (W + 800), -10 + Math.random() * 40, 7).fill(0xffa21f);
    if (hq) grass.filters = [new BlurFilter({ strength: 4 })];
    fg.addChild(grass);

    // ---- warm light from the hall ----------------------------------------------------------
    const hallGlow = new Sprite(this.tex.light);
    hallGlow.anchor.set(0.5); hallGlow.position.set(W / 2, 200); hallGlow.scale.set(14, 4);
    hallGlow.tint = GLOW; hallGlow.blendMode = 'add'; hallGlow.alpha = 0.12;
    this.lights.addChild(hallGlow);
    const moonlight = new Sprite(this.tex.light);
    moonlight.anchor.set(0.5); moonlight.position.set(W * 0.75, 600); moonlight.scale.set(10, 6);
    moonlight.tint = 0x9fb6ff; moonlight.blendMode = 'add'; moonlight.alpha = 0.06;
    this.lights.addChild(moonlight);
  }

  update(dt: number, camX: number) {
    this.time += dt;
    const t = this.time;
    for (const l of this.layers) l.c.x = (camX - this.W / 2) * (1 - l.factor);
    for (const st of this.stars) st.s.alpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.1 + st.phase));
    for (const w of this.windows) w.g.alpha = 0.75 + 0.25 * Math.sin(t * 0.7 + w.phase) + (Math.random() < 0.004 ? -0.5 : 0);
    for (const e of this.equations) e.alpha = 0.65 + 0.2 * Math.sin(t * 1.5 + e.x * 0.01);
    for (const l of this.lamps) l.s.alpha = 0.4 + 0.06 * Math.sin(t * 9 + l.x) + (Math.random() < 0.01 ? -0.15 : 0);

    // fireflies drifting over the lawn
    if (Math.random() < dt * 6) {
      this.fx.mote(Math.random() * this.W, 40 + Math.random() * 360, 0xd8ff7a, (Math.random() - 0.3) * 20, 2 + Math.random() * 3, 0.12 + Math.random() * 0.1);
    }
    // the odd falling krishnachura petal
    if (Math.random() < dt * 1.5) {
      const left = Math.random() < 0.5;
      this.fx.mote(left ? Math.random() * 220 : this.W - Math.random() * 220, 500, 0xe8381f, -30, 5, 0.15);
    }

    // Tesla's arena-wide ULTIMATE: the lamps crackle
    this.surge = Math.max(0, this.surge - dt * 0.4);
    const g = this.sparks.clear();
    if (this.surge > 0 && Math.random() < 0.5) {
      for (const l of this.lamps) drawBolt(g, lightningPoints(l.x, l.y, l.x + (Math.random() - 0.5) * 200, l.y + 80 + Math.random() * 100, 4, 0.35), NEON.tesla, 3, 0.9);
    }
  }
}
