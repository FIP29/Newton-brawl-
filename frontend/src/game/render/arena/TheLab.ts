import { BlurFilter, Container, Graphics, Sprite, Text } from 'pixi.js';
import { GodrayFilter, GlowFilter } from 'pixi-filters';
import { NEON } from '../../../fx/palette';
import type { FxSystem, FxTextures } from '../fx/primitives';
import { drawBolt, lightningPoints } from '../fx/primitives';
import type { ArenaBackdrop } from './types';

interface Layer { c: Container; factor: number }

/**
 * THE LAB — a night-time physics laboratory drawn in the Neon Chalkboard style.
 *
 * World space (y up, floor at 0). Parallax layers move at a fraction of the camera:
 *   0.15  moonlit arched window + stars + god rays
 *   0.45  back wall: chalkboards with equations, shelves of glowing flasks, pipes
 *   0.8   two Tesla coils that spark (and go wild during Tesla's ULTIMATE)
 *   1.0   polished floor with reflections, hanging lamp with flickering light pool
 *   1.3   blurred foreground lab benches
 */
export class TheLab implements ArenaBackdrop {
  readonly back = new Container();   // behind fighters
  readonly front = new Container();  // in front of fighters (foreground silhouettes)
  readonly lights = new Container(); // additive light sprites
  private layers: Layer[] = [];
  private stars: Array<{ s: Sprite; phase: number }> = [];
  private coilTops: Array<{ x: number; y: number }> = [];
  private sparks = new Graphics();
  private lampLight!: Sprite;
  private lampCone!: Graphics;
  private godrays: GodrayFilter | null = null;
  private flasks: Array<{ s: Sprite; phase: number }> = [];
  private time = 0;
  private sparkTimer = 0;
  /** 0..1 extra electrical activity (Tesla Coil ultimate). */
  surge = 0;

  constructor(private readonly W: number, _height: number, private readonly tex: FxTextures,
              private readonly fx: FxSystem, highQuality: boolean) {
    this.build(highQuality);
  }

  /** The two coil toroids (world space): lightning for Tesla's ULTIMATE originates here. */
  get coils() { return this.coilTops; }

  private layer(factor: number, front = false): Container {
    const c = new Container();
    (front ? this.front : this.back).addChild(c);
    this.layers.push({ c, factor });
    return c;
  }

  private build(hq: boolean) {
    const { W } = this;

    // ---- far: window + night sky ------------------------------------------------------
    const far = this.layer(0.15);
    const sky = new Graphics();
    sky.rect(-1200, -200, W + 2400, 1700).fill(0x0e1216);
    // arched window (sky inside)
    const wx = W / 2, wy = 470, ww = 360, wh = 380;
    sky.roundRect(wx - ww / 2, wy, ww, wh, 0).fill(0x0b1a2b);
    sky.circle(wx, wy + wh, ww / 2).fill(0x0b1a2b);
    far.addChild(sky);
    for (let i = 0; i < 60; i++) {
      const s = new Sprite(this.tex.dot);
      s.anchor.set(0.5);
      const a = Math.random() * Math.PI, rr = Math.sqrt(Math.random());
      const inArch = Math.random() < 0.4;
      s.position.set(inArch ? wx + Math.cos(a) * rr * ww * 0.48 : wx + (Math.random() - 0.5) * ww * 0.95,
                     inArch ? wy + wh + Math.sin(a) * rr * ww * 0.48 : wy + 20 + Math.random() * wh);
      s.scale.set(0.12 + Math.random() * 0.18);
      far.addChild(s);
      this.stars.push({ s, phase: Math.random() * 10 });
    }
    const moon = new Graphics().circle(wx + 90, wy + wh + 60, 34).fill(0xf3f1e6).circle(wx + 102, wy + wh + 70, 30).fill(0x0b1a2b);
    moon.filters = [new GlowFilter({ color: 0xcfe3ff, distance: 20, outerStrength: 2, quality: 0.2 })];
    far.addChild(moon);
    // mullions
    const frame = new Graphics();
    frame.moveTo(wx, wy).lineTo(wx, wy + wh + ww / 2).moveTo(wx - ww / 2, wy + wh * 0.55).lineTo(wx + ww / 2, wy + wh * 0.55)
      .stroke({ width: 10, color: 0x2a221c });
    frame.roundRect(wx - ww / 2, wy, ww, wh, 0).stroke({ width: 14, color: 0x3a2c22 });
    frame.moveTo(wx - ww / 2, wy + wh).arc(wx, wy + wh, ww / 2, Math.PI, 0, false).stroke({ width: 14, color: 0x3a2c22 });
    far.addChild(frame);
    // god rays falling from the window into the room
    const rays = new Graphics();
    rays.poly([wx - ww / 2, wy + wh, wx + ww / 2, wy + wh, wx + ww * 1.1, 0, wx - ww * 0.3, 0]).fill({ color: 0x9fc4ff, alpha: 0.09 });
    rays.blendMode = 'add';
    if (hq) {
      this.godrays = new GodrayFilter({ angle: 20, gain: 0.45, lacunarity: 2.6, parallel: true, alpha: 0.9 });
      rays.filters = [this.godrays];
    }
    far.addChild(rays);

    // ---- mid: back wall ---------------------------------------------------------------
    const mid = this.layer(0.45);
    const wall = new Graphics();
    // wainscot + tiles
    wall.rect(-800, 0, 600 + 300, 1100).fill(0x161b20).rect(W - 100, 0, 900, 1100).fill(0x161b20);
    for (let x = -800; x < W + 800; x += 64) wall.moveTo(x, 0).lineTo(x, 160);
    wall.moveTo(-800, 160).lineTo(W + 800, 160).stroke({ width: 2, color: 0xffffff, alpha: 0.05 });
    // chalkboards left and right of the window
    for (const bx of [80, W - 560]) {
      wall.roundRect(bx, 330, 480, 330, 10).fill(0x1c2a26).stroke({ width: 12, color: 0x4a3626 });
      wall.rect(bx + 10, 330, 460, 8).fill({ color: 0xffffff, alpha: 0.04 });
    }
    // pipes along the top
    wall.rect(-800, 860, W + 1600, 14).fill(0x3b4148).rect(-800, 890, W + 1600, 8).fill(0x2c3136);
    for (let x = -700; x < W + 800; x += 260) wall.rect(x, 852, 22, 30).fill(0x4d545c);
    mid.addChild(wall);
    const eqs: Array<[string, number, number, number, number]> = [
      ['F = G·m₁m₂ / r²', 320, 600, NEON.newton, 40], ['F = ma', 200, 470, NEON.newton, 46],
      ['∇ × E = −∂B/∂t', 420, 400, NEON.tesla, 32], ['E = mc²', W - 330, 600, NEON.einstein, 52],
      ['N = N₀e^(−λt)', W - 450, 470, NEON.curie, 36], ['Δt′ = γΔt', W - 200, 410, NEON.einstein, 34],
    ];
    for (const [text, x, y, color, size] of eqs) {
      const t = new Text({ text, style: { fontFamily: 'Caveat, cursive', fontSize: size, fill: color, fontWeight: '700' } });
      t.anchor.set(0.5); t.position.set(x, y); t.scale.y = -1; t.alpha = 0.5; t.rotation = (Math.random() - 0.5) * 0.06;
      mid.addChild(t);
    }
    // shelves with glowing flasks (each scientist's colour)
    const shelfColors = [NEON.newton, NEON.tesla, NEON.curie, NEON.einstein, NEON.doppler, NEON.galileo];
    for (const sx of [-380, W + 120]) {
      for (let row = 0; row < 3; row++) {
        const y = 300 + row * 160;
        const shelf = new Graphics().rect(sx, y, 300, 10).fill(0x4a3626);
        mid.addChild(shelf);
        for (let i = 0; i < 5; i++) {
          const color = shelfColors[(i + row * 2) % shelfColors.length];
          const fx = sx + 30 + i * 56, h = 40 + ((i * 37 + row * 13) % 30);
          const flask = new Graphics();
          flask.poly([fx - 16, y + 10, fx + 16, y + 10, fx + 6, y + 10 + h * 0.7, fx + 6, y + 10 + h, fx - 6, y + 10 + h, fx - 6, y + 10 + h * 0.7])
            .fill({ color: 0xbfd6e0, alpha: 0.12 }).stroke({ width: 2, color: 0xbfd6e0, alpha: 0.4 });
          flask.poly([fx - 14, y + 12, fx + 14, y + 12, fx + 8, y + 10 + h * 0.4, fx - 8, y + 10 + h * 0.4]).fill({ color, alpha: 0.7 });
          mid.addChild(flask);
          const glow = new Sprite(this.tex.light);
          glow.anchor.set(0.5); glow.position.set(fx, y + 25); glow.scale.set(0.9); glow.tint = color; glow.blendMode = 'add'; glow.alpha = 0.3;
          mid.addChild(glow);
          this.flasks.push({ s: glow, phase: Math.random() * 10 });
        }
      }
    }

    // ---- coils ------------------------------------------------------------------------
    const coils = this.layer(0.8);
    for (const cx of [230, W - 230]) {
      const g = new Graphics();
      g.rect(cx - 60, 0, 120, 40).fill(0x22262b).stroke({ width: 3, color: 0x3b4148 });
      g.rect(cx - 26, 40, 52, 330).fill(0x2a1a10);
      for (let y = 46; y < 366; y += 7) g.rect(cx - 27, y, 54, 4).fill(0xb87333); // copper windings
      g.ellipse(cx, 395, 90, 28).fill(0x9aa3ad).stroke({ width: 4, color: 0xd7dde3 });     // toroid
      g.ellipse(cx, 400, 70, 16).fill(0x5f666e);
      coils.addChild(g);
      this.coilTops.push({ x: cx, y: 400 });
      const glow = new Sprite(this.tex.light);
      glow.anchor.set(0.5); glow.position.set(cx, 400); glow.scale.set(3.2); glow.tint = NEON.tesla; glow.blendMode = 'add'; glow.alpha = 0.22;
      coils.addChild(glow);
    }
    this.sparks.blendMode = 'add';
    coils.addChild(this.sparks);

    // ---- floor --------------------------------------------------------------------
    const floorL = this.layer(1);
    const floor = new Graphics();
    floor.rect(-1200, -500, W + 2400, 500).fill(0x0c0f12);
    for (let i = 1; i < 8; i++) floor.rect(-1200, -i * i * 6, W + 2400, 1.5).fill({ color: 0xffffff, alpha: 0.05 / i });
    for (let x = -1200; x < W + 1200; x += 120) floor.moveTo(x, 0).lineTo(x + (x - W / 2) * 0.6, -300);
    floor.stroke({ width: 1.5, color: 0xffffff, alpha: 0.035 });
    // sheen reflecting the window
    floor.poly([W / 2 - 160, 0, W / 2 + 160, 0, W / 2 + 300, -260, W / 2 - 300, -260]).fill({ color: 0x9fc4ff, alpha: 0.035 });
    floorL.addChild(floor);
    const edge = new Graphics().rect(0, -3, W / 2, 6).fill(NEON.newton).rect(W / 2, -3, W / 2, 6).fill(NEON.tesla);
    edge.filters = [new GlowFilter({ color: 0xffffff, distance: 16, outerStrength: 2, quality: 0.2 })];
    edge.alpha = 0.7;
    floorL.addChild(edge);
    // hanging lamp
    this.lampCone = new Graphics();
    this.lampCone.poly([W / 2 - 40, 760, W / 2 + 40, 760, W / 2 + 330, 0, W / 2 - 330, 0]).fill({ color: 0xffe9b0, alpha: 0.05 });
    this.lampCone.blendMode = 'add';
    floorL.addChild(this.lampCone);
    const lamp = new Graphics();
    lamp.moveTo(W / 2, 900).lineTo(W / 2, 790).stroke({ width: 3, color: 0x555b63 });
    lamp.poly([W / 2 - 50, 760, W / 2 + 50, 760, W / 2 + 22, 795, W / 2 - 22, 795]).fill(0x2f353c).stroke({ width: 2, color: 0x6b737c });
    lamp.ellipse(W / 2, 760, 18, 6).fill(0xfff3c4);
    floorL.addChild(lamp);

    // ---- foreground ---------------------------------------------------------------
    const fg = this.layer(1.3, true);
    const bench = new Graphics();
    for (const bx of [-300, W + 40]) {
      bench.rect(bx, 0, 260, 120).fill(0x07090b).rect(bx - 20, 120, 300, 18).fill(0x0a0d10);
      bench.rect(bx + 40, 138, 26, 70).fill(0x0a0d10).rect(bx + 150, 138, 60, 40).fill(0x0a0d10);
    }
    bench.filters = [new BlurFilter({ strength: 4 })];
    fg.addChild(bench);

    // ---- lights -------------------------------------------------------------------
    this.lampLight = new Sprite(this.tex.light);
    this.lampLight.anchor.set(0.5); this.lampLight.position.set(W / 2, 20); this.lampLight.scale.set(9, 2.2);
    this.lampLight.tint = 0xffe2a0; this.lampLight.blendMode = 'add'; this.lampLight.alpha = 0.18;
    this.lights.addChild(this.lampLight);
    const moonPool = new Sprite(this.tex.light);
    moonPool.anchor.set(0.5); moonPool.position.set(W / 2 + 120, 10); moonPool.scale.set(7, 1.4);
    moonPool.tint = 0x9fc4ff; moonPool.blendMode = 'add'; moonPool.alpha = 0.12;
    this.lights.addChild(moonPool);
  }

  /** Parallax + ambient animation. `camX` is the world x at screen centre. */
  update(dt: number, camX: number) {
    this.time += dt;
    for (const l of this.layers) l.c.x = (camX - this.W / 2) * (1 - l.factor);
    for (const st of this.stars) st.s.alpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 1.7 + st.phase));
    for (const f of this.flasks) f.s.alpha = 0.22 + 0.1 * Math.sin(this.time * 2 + f.phase);
    if (this.godrays) this.godrays.time += dt * 0.25;

    // flickering lamp (old filament)
    const flicker = Math.random() < 0.02 ? 0.4 : 1;
    this.lampLight.alpha = 0.18 * flicker;
    this.lampCone.alpha = flicker;

    // chalk dust drifting in the light
    if (Math.random() < dt * 14) {
      this.fx.mote(this.W / 2 + (Math.random() - 0.5) * 700, Math.random() * 500, 0xfff1d0, 12 + Math.random() * 20, 4 + Math.random() * 4, 0.12 + Math.random() * 0.15);
    }

    // coil sparks: occasional idle arcs, a storm during Tesla's ULTIMATE
    this.surge = Math.max(0, this.surge - dt * 0.4);
    this.sparkTimer -= dt;
    const g = this.sparks.clear();
    if (this.sparkTimer <= 0) {
      this.sparkTimer = this.surge > 0 ? 0.04 : 0.6 + Math.random() * 1.8;
      this.sparkFrames = this.surge > 0 ? 3 : 4;
      this.sparkPts = this.coilTops.map((c) => lightningPoints(c.x, c.y, c.x + (Math.random() - 0.5) * 260, c.y + 40 + Math.random() * 160, 4, 0.35));
    }
    if (this.sparkFrames > 0) {
      this.sparkFrames--;
      for (const pts of this.sparkPts) if (Math.random() < (this.surge > 0 ? 1 : 0.5)) drawBolt(g, pts, NEON.tesla, 3, 0.9);
    }
  }
  private sparkFrames = 0;
  private sparkPts: number[][] = [];
}
