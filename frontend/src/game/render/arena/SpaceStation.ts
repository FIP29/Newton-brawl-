import { BlurFilter, Container, Graphics, Sprite, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { NEON } from '../../../fx/palette';
import type { FxSystem, FxTextures } from '../fx/primitives';
import { drawBolt, lightningPoints } from '../fx/primitives';
import type { ArenaBackdrop } from './types';

interface Layer { c: Container; factor: number }

/**
 * SPACE STATION: an orbital lab in low gravity. Debris drifts in zero-g (simulated by the engine);
 * this class draws the stage around it.
 *
 * Parallax layers (fraction of camera motion):
 *   0.05  starfield, Sun, and the curve of the Earth through a huge panoramic viewport
 *   0.25  the station's rotating habitat ring outside the window
 *   0.5   hull panels with blinking status lights, hazard-striped beams
 *   0.8   holographic displays of orbital mechanics
 *   1.0   metal deck with glowing edge strips
 *   1.3   blurred foreground struts
 */
export class SpaceStation implements ArenaBackdrop {
  readonly back = new Container();
  readonly front = new Container();
  readonly lights = new Container();
  surge = 0;
  private layers: Layer[] = [];
  private stars: Array<{ s: Sprite; phase: number }> = [];
  private blinkers: Array<{ g: Graphics; phase: number; rate: number }> = [];
  private ring = new Container();
  private clouds = new Graphics();
  private holos: Text[] = [];
  private conduits: { x: number; y: number }[] = [];
  private sparks = new Graphics();
  private time = 0;
  private shooting = 0;

  constructor(private readonly W: number, private readonly H: number, private readonly tex: FxTextures,
              private readonly fx: FxSystem, highQuality: boolean) {
    this.build(highQuality);
  }

  get coils() { return this.conduits; }

  private layer(factor: number, front = false): Container {
    const c = new Container();
    (front ? this.front : this.back).addChild(c);
    this.layers.push({ c, factor });
    return c;
  }

  private build(hq: boolean) {
    const { W, H } = this;

    // ---- deep space ------------------------------------------------------------
    const space = this.layer(0.05);
    space.addChild(new Graphics().rect(-1400, -300, W + 2800, H + 900).fill(0x04060c));
    for (let i = 0; i < 220; i++) {
      const s = new Sprite(this.tex.dot);
      s.anchor.set(0.5);
      s.position.set(-600 + Math.random() * (W + 1200), 120 + Math.random() * (H + 200));
      s.scale.set(0.08 + Math.random() * 0.22);
      s.tint = Math.random() < 0.1 ? 0xffd9a0 : Math.random() < 0.1 ? 0x9fc4ff : 0xffffff;
      space.addChild(s);
      this.stars.push({ s, phase: Math.random() * 10 });
    }
    // the Sun with a lens flare
    const sun = new Graphics().circle(W * 0.86, H * 0.86, 46).fill(0xfff6d8);
    sun.filters = [new GlowFilter({ color: 0xffd27a, distance: 40, outerStrength: 4, quality: 0.2 })];
    space.addChild(sun);
    const flare = new Sprite(this.tex.light);
    flare.anchor.set(0.5); flare.position.set(W * 0.86, H * 0.86); flare.scale.set(8); flare.tint = 0xffc56a; flare.blendMode = 'add'; flare.alpha = 0.35;
    space.addChild(flare);
    // Earth: a huge blue limb rising from the bottom left, with clouds and a thin atmosphere
    const earth = new Graphics();
    earth.circle(W * 0.25, -900, 1250).fill(0x0d3b78);
    earth.circle(W * 0.25, -900, 1250).stroke({ width: 18, color: 0x5fb4ff, alpha: 0.35 });
    earth.circle(W * 0.25, -900, 1262).stroke({ width: 10, color: 0x9fd7ff, alpha: 0.2 });
    space.addChild(earth);
    this.clouds.blendMode = 'add';
    space.addChild(this.clouds);

    // ---- rotating habitat ring outside --------------------------------------------
    const outside = this.layer(0.25);
    const ringG = new Graphics();
    ringG.ellipse(0, 0, 520, 120).stroke({ width: 16, color: 0x8ea0b5, alpha: 0.7 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ringG.moveTo(0, 0).lineTo(Math.cos(a) * 520, Math.sin(a) * 120);
    }
    ringG.stroke({ width: 4, color: 0x8ea0b5, alpha: 0.4 });
    ringG.circle(0, 0, 40).fill(0x5d6b7c);
    this.ring.addChild(ringG);
    this.ring.position.set(W * 0.62, 660);
    outside.addChild(this.ring);

    // ---- viewport frame + hull --------------------------------------------------
    const hull = this.layer(0.5);
    const frame = new Graphics();
    // walls left and right of the panoramic window
    frame.rect(-900, 0, 1050, H + 300).fill(0x161d27).rect(W - 150, 0, 1050, H + 300).fill(0x161d27);
    frame.rect(-900, H - 60, W + 1800, 400).fill(0x161d27);
    // window struts
    for (const x of [150, W * 0.38, W * 0.62, W - 150]) frame.rect(x - 12, 160, 24, H - 220).fill(0x232c39);
    frame.roundRect(150, 160, W - 300, H - 220, 30).stroke({ width: 18, color: 0x2c3746 });
    // hull panels with seams and rivets
    for (const [x0, x1] of [[-900, 150], [W - 150, W + 900]]) {
      for (let x = x0; x < x1; x += 120) for (let y = 40; y < H; y += 110) {
        frame.rect(x + 6, y + 6, 108, 98).stroke({ width: 2, color: 0x2a3443 });
        frame.circle(x + 14, y + 14, 3).fill(0x3a4656).circle(x + 106, y + 96, 3).fill(0x3a4656);
      }
    }
    // hazard stripes along the window sill
    for (let x = 150; x < W - 150; x += 40) frame.poly([x, 150, x + 20, 150, x + 40, 168, x + 20, 168]).fill({ color: 0xffcc33, alpha: 0.6 });
    hull.addChild(frame);
    for (let i = 0; i < 14; i++) {
      const g = new Graphics().circle(0, 0, 5).fill(i % 3 === 0 ? 0xff4d6d : i % 3 === 1 ? 0x7cff6b : 0x33bbff);
      g.position.set(i < 7 ? -60 + (i % 2) * 120 + Math.floor(i / 2) * 25 : W + 60 - (i % 2) * 120 - Math.floor((i - 7) / 2) * 25, 220 + (i % 7) * 85);
      hull.addChild(g);
      this.blinkers.push({ g, phase: Math.random() * 10, rate: 1 + Math.random() * 3 });
    }
    // power conduits in the ceiling: arena-wide lightning comes from here
    for (const x of [W * 0.2, W * 0.8]) {
      frame.rect(x - 40, H - 70, 80, 30).fill(0x3a4656).stroke({ width: 2, color: 0x7fd7ff });
      this.conduits.push({ x, y: H - 60 });
    }
    this.sparks.blendMode = 'add';
    hull.addChild(this.sparks);

    // ---- holographic displays ----------------------------------------------------
    const holo = this.layer(0.8);
    const lines: Array<[string, number, number, number]> = [
      ['a = v² / r', W * 0.22, 640, NEON.tesla], ['F = G·Mm / r²', W * 0.78, 660, NEON.newton],
      ['Δv = vₑ·ln(m₀ / m₁)', W * 0.5, 760, 0x7fd7ff], ['v_orbit ≈ 7.7 km/s', W * 0.5, 600, NEON.curie],
    ];
    for (const [text, x, y, color] of lines) {
      const panel = new Graphics().roundRect(x - 150, y - 34, 300, 68, 10).fill({ color, alpha: 0.06 }).stroke({ width: 2, color, alpha: 0.4 });
      holo.addChild(panel);
      const t = new Text({ text, style: { fontFamily: 'Caveat, cursive', fontSize: 34, fill: color, fontWeight: '700' } });
      t.anchor.set(0.5); t.position.set(x, y); t.scale.y = -1; t.alpha = 0.7;
      holo.addChild(t);
      this.holos.push(t);
    }

    // ---- deck ------------------------------------------------------------------------
    const deck = this.layer(1);
    const floor = new Graphics();
    floor.rect(-1400, -500, W + 2800, 500).fill(0x0b1018);
    for (let x = -1400; x < W + 1400; x += 80) floor.moveTo(x, 0).lineTo(x + (x - W / 2) * 0.5, -260);
    floor.stroke({ width: 1.5, color: 0x7fd7ff, alpha: 0.06 });
    for (let i = 1; i < 6; i++) floor.rect(-1400, -i * i * 9, W + 2800, 1.5).fill({ color: 0x7fd7ff, alpha: 0.05 / i });
    deck.addChild(floor);
    const edge = new Graphics().rect(0, -3, W, 6).fill(0x7fd7ff);
    edge.filters = [new GlowFilter({ color: 0x7fd7ff, distance: 16, outerStrength: 2, quality: 0.2 })];
    edge.alpha = 0.75;
    deck.addChild(edge);
    // ceiling
    deck.addChild(new Graphics().rect(-1400, H, W + 2800, 300).fill(0x111823).rect(0, H - 4, W, 4).fill({ color: 0x7fd7ff, alpha: 0.4 }));

    // ---- foreground struts -------------------------------------------------------
    const fg = this.layer(1.3, true);
    const struts = new Graphics();
    struts.poly([-400, 0, -120, 0, 60, 260, -220, 300]).fill(0x05070b);
    struts.poly([W + 400, 0, W + 120, 0, W - 60, 260, W + 220, 300]).fill(0x05070b);
    if (hq) struts.filters = [new BlurFilter({ strength: 5 })];
    fg.addChild(struts);

    // ---- lights --------------------------------------------------------------------
    const deckGlow = new Sprite(this.tex.light);
    deckGlow.anchor.set(0.5); deckGlow.position.set(W / 2, 10); deckGlow.scale.set(12, 1.6);
    deckGlow.tint = 0x7fd7ff; deckGlow.blendMode = 'add'; deckGlow.alpha = 0.12;
    this.lights.addChild(deckGlow);
    const sunlight = new Sprite(this.tex.light);
    sunlight.anchor.set(0.5); sunlight.position.set(W * 0.8, 300); sunlight.scale.set(9, 6);
    sunlight.tint = 0xffd9a0; sunlight.blendMode = 'add'; sunlight.alpha = 0.08;
    this.lights.addChild(sunlight);
  }

  update(dt: number, camX: number) {
    this.time += dt;
    for (const l of this.layers) l.c.x = (camX - this.W / 2) * (1 - l.factor);
    for (const st of this.stars) st.s.alpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * 1.3 + st.phase));
    for (const b of this.blinkers) b.g.alpha = Math.sin(this.time * b.rate + b.phase) > 0.2 ? 1 : 0.15;
    this.ring.rotation = 0;
    this.ring.skew.x = Math.sin(this.time * 0.2) * 0.05;
    (this.ring.children[0] as Graphics).rotation = this.time * 0.08;
    for (const h of this.holos) h.alpha = 0.55 + 0.15 * Math.sin(this.time * 3 + h.x) + (Math.random() < 0.01 ? -0.4 : 0);

    // drifting cloud bands on Earth
    const c = this.clouds.clear();
    for (let i = 0; i < 7; i++) {
      const a = 1.05 + i * 0.12 + this.time * 0.004;
      const x = this.W * 0.25 + Math.cos(a) * 1180, y = -900 + Math.sin(a) * 1180;
      c.ellipse(x, y, 140, 26).fill({ color: 0xffffff, alpha: 0.12 });
    }

    // zero-g motes floating in every direction
    if (Math.random() < dt * 10) {
      this.fx.mote(Math.random() * this.W, Math.random() * this.H * 0.8, 0xbfe6ff, (Math.random() - 0.5) * 30, 5 + Math.random() * 4, 0.1 + Math.random() * 0.12);
    }
    // occasional shooting star
    this.shooting -= dt;
    if (this.shooting <= 0) {
      this.shooting = 3 + Math.random() * 5;
      const x = Math.random() * this.W, y = 500 + Math.random() * 300;
      this.fx.transient(0.6, (g, k) => {
        g.clear().moveTo(x - 300 * k, y - 80 * k).lineTo(x - 300 * k - 90, y - 80 * k - 24).stroke({ width: 2, color: 0xffffff, alpha: 1 - k });
      });
    }

    // conduits crackle during Tesla's ULTIMATE
    this.surge = Math.max(0, this.surge - dt * 0.4);
    const g = this.sparks.clear();
    if (this.surge > 0 && Math.random() < 0.5) {
      for (const p of this.conduits) drawBolt(g, lightningPoints(p.x, p.y, p.x + (Math.random() - 0.5) * 200, p.y - 80 - Math.random() * 120, 4, 0.35), NEON.tesla, 3, 0.9);
    }
  }
}
