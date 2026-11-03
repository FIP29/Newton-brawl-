import { BlurFilter, Container, Graphics, Sprite, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { NEON } from '../../../fx/palette';
import type { FxSystem, FxTextures } from '../fx/primitives';
import { drawBolt, lightningPoints } from '../fx/primitives';
import type { ArenaBackdrop } from './types';

interface Layer { c: Container; factor: number }
interface Mote { r: number; a: number; size: number; color: number }

/** Where the engine's gravity well is (Arena.BLACK_HOLE_EDGE.well), in world units. */
const HOLE_X = 800, HOLE_Y = 430;
const SHADOW_R = 66;   // drawn shadow (a little bigger than the 48-unit swallowing core)
const HOT = [0xffffff, 0xfff1c4, 0xffc46a, 0xff8a3d, 0xd8452e, 0x7a1f3a];

/**
 * BLACK HOLE EDGE: a shattered research platform at the edge of a black hole.
 *
 * The hole itself sits at the engine's well position on the gameplay layer, so the rocks you see
 * orbiting it really are orbiting it. Its accretion disk turns with Keplerian speeds (inner gas
 * faster, ω ∝ r^−3/2); a ring of lensed starlight circles the shadow.
 *
 * Parallax layers (fraction of camera motion):
 *   0.04  stars and a distant nebula
 *   0.2   a spiral galaxy
 *   0.7   holographic equations
 *   1.0   the black hole, its disk and jet, and the platform
 *   1.3   blurred foreground debris
 */
export class BlackHoleEdge implements ArenaBackdrop {
  readonly back = new Container();
  readonly front = new Container();
  readonly lights = new Container();
  surge = 0;
  private layers: Layer[] = [];
  private stars: Array<{ s: Sprite; phase: number }> = [];
  private disk = new Graphics();
  private diskFront = new Graphics();
  private jet = new Graphics();
  private cracks = new Graphics();
  private sparks = new Graphics();
  private galaxy = new Graphics();
  private motes: Mote[] = [];
  private holos: Text[] = [];
  private time = 0;
  private readonly source = [{ x: HOLE_X, y: HOLE_Y }];

  constructor(private readonly W: number, private readonly H: number, private readonly tex: FxTextures,
              private readonly fx: FxSystem, highQuality: boolean) {
    this.build(highQuality);
  }

  get coils() { return this.source; }

  private layer(factor: number, front = false): Container {
    const c = new Container();
    (front ? this.front : this.back).addChild(c);
    this.layers.push({ c, factor });
    return c;
  }

  private build(hq: boolean) {
    const { W, H } = this;

    // ---- deep space ----------------------------------------------------------------
    const space = this.layer(0.04);
    space.addChild(new Graphics().rect(-1400, -400, W + 2800, H + 1000).fill(0x030207));
    const nebula = new Graphics();
    for (let i = 0; i < 9; i++) {
      nebula.ellipse(-300 + i * 280, 300 + Math.sin(i * 1.7) * 240, 420, 180).fill({ color: i % 2 ? 0x2a1450 : 0x0f2350, alpha: 0.35 });
    }
    if (hq) nebula.filters = [new BlurFilter({ strength: 40 })];
    space.addChild(nebula);
    for (let i = 0; i < 260; i++) {
      const s = new Sprite(this.tex.dot);
      s.anchor.set(0.5);
      s.position.set(-700 + Math.random() * (W + 1400), -100 + Math.random() * (H + 400));
      s.scale.set(0.06 + Math.random() * 0.2);
      s.tint = Math.random() < 0.15 ? 0xffd9a0 : Math.random() < 0.15 ? 0xb9c8ff : 0xffffff;
      space.addChild(s);
      this.stars.push({ s, phase: Math.random() * 10 });
    }

    // ---- a distant spiral galaxy -----------------------------------------------------
    const far = this.layer(0.2);
    this.galaxy.position.set(W * 0.14, 760);
    this.galaxy.scale.set(1, 0.45);
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 70; i++) {
        const t = i / 70, a = arm * Math.PI + t * Math.PI * 3, rr = 8 + t * 150;
        this.galaxy.circle(Math.cos(a) * rr, Math.sin(a) * rr, 5 * (1 - t) + 1.5).fill({ color: t < 0.3 ? 0xffe7c4 : 0x9fb6ff, alpha: 0.5 * (1 - t) + 0.1 });
      }
    }
    this.galaxy.circle(0, 0, 18).fill({ color: 0xfff1d8, alpha: 0.8 });
    far.addChild(this.galaxy);

    // ---- holographic equations ----------------------------------------------------------
    const holo = this.layer(0.7);
    const lines: Array<[string, number, number, number]> = [
      ['r_s = 2GM / c²', W * 0.16, 560, NEON.hawking], ['a = GM / r²', W * 0.84, 560, NEON.newton],
      ['T = ħc³ / 8πGMk_B', W * 0.16, 700, 0xffc46a], ['Δt′ = Δt / √(1 − r_s/r)', W * 0.84, 700, NEON.einstein],
    ];
    for (const [text, x, y, color] of lines) {
      holo.addChild(new Graphics().roundRect(x - 165, y - 32, 330, 64, 10).fill({ color, alpha: 0.05 }).stroke({ width: 2, color, alpha: 0.35 }));
      const t = new Text({ text, style: { fontFamily: 'Caveat, cursive', fontSize: 32, fill: color, fontWeight: '700' } });
      t.anchor.set(0.5); t.position.set(x, y); t.scale.y = -1; t.alpha = 0.65;
      holo.addChild(t);
      this.holos.push(t);
    }

    // ---- the black hole (gameplay layer) ---------------------------------------------------
    const hole = this.layer(1);
    // lensing halo: the sky behind is bent into a bright ring just outside the shadow
    const halo = new Graphics();
    for (let i = 0; i < 6; i++) halo.circle(HOLE_X, HOLE_Y, SHADOW_R * (1.3 + i * 0.5)).stroke({ width: 10 - i, color: 0x8f7bff, alpha: 0.07 });
    if (hq) halo.filters = [new BlurFilter({ strength: 8 })];
    hole.addChild(halo);
    this.jet.blendMode = 'add';
    hole.addChild(this.jet);
    this.disk.blendMode = 'add';
    hole.addChild(this.disk);                         // far half of the disk (behind the shadow)
    const shadow = new Graphics().circle(HOLE_X, HOLE_Y, SHADOW_R).fill(0x000000);
    hole.addChild(shadow);
    const photonRing = new Graphics().circle(HOLE_X, HOLE_Y, SHADOW_R + 3).stroke({ width: 4, color: 0xfff1c4 });
    photonRing.filters = [new GlowFilter({ color: 0xffc46a, distance: 24, outerStrength: 3, quality: 0.2 })];
    hole.addChild(photonRing);
    this.diskFront.blendMode = 'add';
    hole.addChild(this.diskFront);                    // near half (in front of the shadow)
    this.sparks.blendMode = 'add';
    hole.addChild(this.sparks);
    for (let i = 0; i < 160; i++) {
      const r = SHADOW_R * (1.5 + Math.pow(Math.random(), 0.7) * 3.6);
      this.motes.push({ r, a: Math.random() * Math.PI * 2, size: 1.5 + Math.random() * 2.5, color: HOT[Math.min(HOT.length - 1, Math.floor((r / SHADOW_R - 1.5) * 1.4))] });
    }

    // ---- the platform ---------------------------------------------------------------------
    const deck = this.layer(1);
    const slab = new Graphics();
    slab.rect(-1400, -600, W + 2800, 600).fill(0x0a0810);
    // broken edges of the platform: jagged chunks breaking away beyond the walls
    slab.poly([-1400, 0, -40, 0, -120, -60, -260, -40, -1400, -90]).fill(0x0a0810);
    for (let x = -1400; x < W + 1400; x += 90) slab.moveTo(x, 0).lineTo(x + (x - W / 2) * 0.45, -280);
    slab.stroke({ width: 1.5, color: 0xff8a3d, alpha: 0.05 });
    for (let i = 1; i < 6; i++) slab.rect(-1400, -i * i * 9, W + 2800, 1.5).fill({ color: 0xff8a3d, alpha: 0.05 / i });
    deck.addChild(slab);
    // glowing cracks, hotter toward the middle (tidal stress)
    this.cracks.blendMode = 'add';
    deck.addChild(this.cracks);
    const edge = new Graphics().rect(0, -3, W, 6).fill(0xff8a3d);
    edge.filters = [new GlowFilter({ color: 0xff8a3d, distance: 16, outerStrength: 2, quality: 0.2 })];
    edge.alpha = 0.7;
    deck.addChild(edge);
    // a thin force-field ceiling
    deck.addChild(new Graphics().rect(0, H - 3, W, 3).fill({ color: NEON.hawking, alpha: 0.35 }));

    // ---- foreground debris ------------------------------------------------------------------
    const fg = this.layer(1.3, true);
    const debris = new Graphics();
    debris.poly([-420, 0, -150, 0, -40, 180, -260, 240, -380, 140]).fill(0x050308);
    debris.poly([W + 420, 0, W + 150, 0, W + 50, 160, W + 260, 230]).fill(0x050308);
    debris.poly([W * 0.3, H + 80, W * 0.36, H + 20, W * 0.42, H + 90]).fill(0x050308);
    if (hq) debris.filters = [new BlurFilter({ strength: 6 })];
    fg.addChild(debris);

    // ---- lights ---------------------------------------------------------------------------------
    const glow = new Sprite(this.tex.light);
    glow.anchor.set(0.5); glow.position.set(HOLE_X, HOLE_Y); glow.scale.set(13, 6);
    glow.tint = 0xff8a3d; glow.blendMode = 'add'; glow.alpha = 0.22;
    this.lights.addChild(glow);
    const floorGlow = new Sprite(this.tex.light);
    floorGlow.anchor.set(0.5); floorGlow.position.set(HOLE_X, 20); floorGlow.scale.set(12, 1.8);
    floorGlow.tint = 0xffc46a; floorGlow.blendMode = 'add'; floorGlow.alpha = 0.14;
    this.lights.addChild(floorGlow);
  }

  update(dt: number, camX: number) {
    this.time += dt;
    const t = this.time;
    for (const l of this.layers) l.c.x = (camX - this.W / 2) * (1 - l.factor);
    for (const st of this.stars) st.s.alpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.2 + st.phase));
    this.galaxy.rotation = t * 0.01;
    for (const h of this.holos) h.alpha = 0.5 + 0.15 * Math.sin(t * 3 + h.x) + (Math.random() < 0.01 ? -0.35 : 0);

    // Accretion disk, seen nearly edge-on: rings of hot gas; the near half passes in front of the shadow.
    const tilt = 0.24;
    const back = this.disk.clear(), front = this.diskFront.clear();
    for (let i = 0; i < HOT.length; i++) {
      const rx = SHADOW_R * (1.45 + i * 0.6), ry = rx * tilt;
      const w = 9 - i * 1.2, a = 0.55 - i * 0.07;
      // far side of the disk: behind the hole, lensed up and over the shadow (world is y-up)
      const lr = SHADOW_R * (1.12 + i * 0.13);
      back.moveTo(HOLE_X + lr, HOLE_Y).arc(HOLE_X, HOLE_Y, lr, 0, Math.PI, false);
      back.stroke({ width: w * 0.7, color: HOT[i], alpha: a * 0.8 });
      back.ellipse(HOLE_X, HOLE_Y, rx, ry).stroke({ width: w, color: HOT[i], alpha: a * 0.5 });
      // near half (below the centre in y-up world) crosses in front of the shadow
      front.moveTo(HOLE_X - rx, HOLE_Y);
      for (let k = 1; k <= 24; k++) { const ang = Math.PI + (k / 24) * Math.PI; front.lineTo(HOLE_X + Math.cos(ang) * rx, HOLE_Y + Math.sin(ang) * ry); }
      front.stroke({ width: w, color: HOT[i], alpha: a * 0.9 });
    }
    // gas clumps on Keplerian orbits: ω ∝ r^(−3/2)
    for (const m of this.motes) {
      m.a += dt * 2.4 * Math.pow(SHADOW_R * 1.5 / m.r, 1.5);
      const x = HOLE_X + Math.cos(m.a) * m.r, y = HOLE_Y + Math.sin(m.a) * m.r * tilt;
      (Math.sin(m.a) < 0 ? front : back).circle(x, y, m.size).fill({ color: m.color, alpha: 0.8 });
    }
    // a faint relativistic jet straight up out of the poles
    const j = this.jet.clear();
    for (let i = 0; i < 5; i++) {
      const flick = 0.6 + 0.4 * Math.sin(t * 9 + i * 1.7);
      j.poly([HOLE_X - 6 - i * 4, HOLE_Y + SHADOW_R * 0.6, HOLE_X + 6 + i * 4, HOLE_Y + SHADOW_R * 0.6, HOLE_X + 2, this.H + 200])
        .fill({ color: i === 0 ? 0xffffff : 0x8f7bff, alpha: 0.06 * flick });
    }

    // tidal cracks in the platform glow and pulse
    const c = this.cracks.clear();
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
    for (let k = 0; k < 7; k++) {
      const x0 = 120 + k * 230;
      c.moveTo(x0, -2).lineTo(x0 + 30, -40).lineTo(x0 - 10, -90).lineTo(x0 + 20, -160);
    }
    c.stroke({ width: 2, color: 0xff8a3d, alpha: 0.2 + 0.25 * pulse });

    // light from behind being dragged in: streaks spiralling toward the hole
    if (Math.random() < dt * 6) {
      const a = Math.random() * Math.PI * 2, r0 = 700;
      const x = HOLE_X + Math.cos(a) * r0, y = HOLE_Y + Math.sin(a) * r0 * 0.6;
      this.fx.transient(1.1, (g, k) => {
        const rr = r0 * (1 - k * 0.92), aa = a + k * 2.2;
        const px = HOLE_X + Math.cos(aa) * rr, py = HOLE_Y + Math.sin(aa) * rr * 0.6;
        g.clear().moveTo(x + (px - x) * Math.max(0, k - 0.15), y + (py - y) * Math.max(0, k - 0.15)).lineTo(px, py)
          .stroke({ width: 2, color: 0xffd9a0, alpha: 0.6 * (1 - k) });
      });
    }

    // Tesla's arena-wide ULTIMATE pulls lightning out of the disk
    this.surge = Math.max(0, this.surge - dt * 0.4);
    const sp = this.sparks.clear();
    if (this.surge > 0 && Math.random() < 0.5) {
      drawBolt(sp, lightningPoints(HOLE_X, HOLE_Y, HOLE_X + (Math.random() - 0.5) * 400, HOLE_Y - 150 - Math.random() * 200, 4, 0.35), NEON.tesla, 3, 0.9);
    }
  }
}
