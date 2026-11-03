import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { ArenaInfo, FighterDefinition, FighterView, HitEvent } from '../protocol';
import { NEON } from '../../fx/palette';

/** Placeholder slot colours until real fighters (with their own signature colours) arrive in Phase 4. */
export const SLOT_COLORS = [NEON.newton, NEON.tesla] as const;

const FLOOR_SCREEN_FRACTION = 0.84; // floor line sits at 84% of the screen height
const MIN_VIEW_WIDTH = 1100;        // camera never zooms in closer than this many world units

interface Particle { s: Sprite; vx: number; vy: number; life: number; max: number }
interface Ring { g: Graphics; age: number; max: number; color: number; x: number; y: number; big: boolean }

/**
 * Renders a match with placeholder "chalk robot" shapes.
 *
 * Coordinate systems: the world is the server's (x right, y up, floor at 0, 100 units ≈ 1 m).
 * `world` is a container whose transform is the camera: it flips y, follows the fighters, zooms
 * in when they're close and shakes on impact. Everything gameplay-related lives inside it.
 */
export class FightRenderer {
  readonly app = new Application();
  private world = new Container();
  private backdrop = new Container();
  private fighterLayer = new Container();
  private fxLayer = new Container();
  private debug = new Graphics();
  private fighters: FighterSprite[] = [];
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private dot!: Texture;

  private arenaWidth = 1600;
  private defs: FighterDefinition[] = [];
  private cam = { x: 800, viewW: 1600, shake: 0, zoomKick: 0 };
  showHitboxes = false;

  async init(host: HTMLElement) {
    await this.app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true,
                          resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    this.dot = this.app.renderer.generateTexture(new Graphics().circle(0, 0, 6).fill(0xffffff));
    this.world.addChild(this.backdrop, this.fighterLayer, this.fxLayer, this.debug);
    this.app.stage.addChild(this.world);
  }

  /** Builds the arena and fighters once the match configuration is known. */
  setup(arena: ArenaInfo, fighters: FighterDefinition[]) {
    this.arenaWidth = arena.width;
    this.defs = fighters;
    this.cam.x = this.arenaWidth / 2;
    this.buildBackdrop();
    this.fighterLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.fighters = this.defs.map((_d, i) => {
      const f = new FighterSprite(SLOT_COLORS[i]);
      this.fighterLayer.addChild(f.root);
      return f;
    });
  }

  /** Draw one frame. `fighters` are already interpolated; `dtMs` is real elapsed time. */
  render(fighters: FighterView[], hitstop: number, dtMs: number) {
    if (this.fighters.length !== fighters.length) return;
    // Camera smoothing uses real elapsed time so it converges at the same speed at any frame rate;
    // effects cap dt so a long stall doesn't teleport particles.
    this.updateCamera(fighters, Math.min(dtMs, 250) / 1000, hitstop > 0);
    const dt = Math.min(dtMs, 50) / 1000;
    fighters.forEach((v, i) => this.fighters[i].update(v, this.defs[i], dt));
    this.updateFx(dt);
    this.drawDebug(fighters);
  }

  /** Impact feedback for a hit: sparks, a shockwave ring, camera shake and a small zoom kick. */
  onHit(e: HitEvent) {
    const heavy = e.damage >= 100;
    const color = SLOT_COLORS[e.attacker];
    this.burst(e.x, e.y, color, heavy ? 46 : 22, heavy ? 900 : 600);
    this.burst(e.x, e.y, 0xffffff, heavy ? 14 : 6, heavy ? 500 : 350);
    this.ring(e.x, e.y, color, heavy);
    this.cam.shake = Math.max(this.cam.shake, heavy ? 22 : 9);
    this.cam.zoomKick = heavy ? 0.06 : 0.025;
    this.fighters[e.defender]?.flash();
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
    const targetW = Math.min(this.arenaWidth, Math.max(MIN_VIEW_WIDTH, spread + 700));
    const k = 1 - Math.exp(-dt * 4);
    this.cam.viewW += (targetW - this.cam.viewW) * k;
    const scale = (sw / this.cam.viewW) * (1 + this.cam.zoomKick);
    const halfView = sw / scale / 2;
    const targetX = clamp(mid, halfView, this.arenaWidth - halfView);
    this.cam.x += (targetX - this.cam.x) * k;

    // Shake decays exponentially; it keeps going through hit-stop for a punchy freeze-frame.
    const shake = this.cam.shake;
    const sx = (Math.random() - 0.5) * 2 * shake, sy = (Math.random() - 0.5) * 2 * shake;
    this.cam.shake *= Math.exp(-dt * (frozen ? 6 : 14));
    this.cam.zoomKick *= Math.exp(-dt * 8);

    this.world.scale.set(scale, -scale); // flip y: world up = screen up
    this.world.position.set(sw / 2 - this.cam.x * scale + sx, sh * FLOOR_SCREEN_FRACTION + sy);
  }

  // ---------------------------------------------------------------- backdrop

  private buildBackdrop() {
    this.backdrop.removeChildren().forEach((c) => c.destroy({ children: true }));
    const W = this.arenaWidth;
    const wall = new Graphics();
    // Back wall: a huge chalkboard with a wooden frame.
    wall.rect(-400, 0, W + 800, 1400).fill({ color: 0x161b20 });
    wall.roundRect(80, 180, W - 160, 640, 14).fill({ color: 0x1d252b }).stroke({ width: 10, color: 0x3a2c22 });
    // Faint chalk grid lines.
    for (let gx = 120; gx < W - 100; gx += 80) wall.moveTo(gx, 200).lineTo(gx, 800);
    for (let gy = 220; gy < 800; gy += 80) wall.moveTo(100, gy).lineTo(W - 100, gy);
    wall.stroke({ width: 1, color: NEON.chalk, alpha: 0.035 });
    // Floor.
    wall.rect(-400, -400, W + 800, 400).fill({ color: 0x0c0f12 });
    this.backdrop.addChild(wall);

    // Chalk scribbles on the board (text needs flipping back because the world flips y).
    const scribbles: Array<[string, number, number, number, number]> = [
      ['F = ma', 260, 700, NEON.newton, 54],
      ['p = mv', 1280, 720, NEON.tesla, 46],
      ['J = Δp = F·Δt', 760, 640, NEON.chalk, 40],
      ['v² = u² + 2as', 420, 420, NEON.curie, 36],
      ['KE = ½mv²', 1180, 430, NEON.einstein, 40],
    ];
    for (const [text, x, y, color, size] of scribbles) {
      const t = new Text({ text, style: { fontFamily: 'Caveat, cursive', fontSize: size, fill: color, fontWeight: '700' } });
      t.anchor.set(0.5);
      t.position.set(x, y);
      t.scale.y = -1;
      t.alpha = 0.22;
      t.rotation = (Math.random() - 0.5) * 0.08;
      this.backdrop.addChild(t);
    }

    // Glowing floor line in both players' colours.
    const line = new Graphics();
    line.rect(0, -3, W / 2, 6).fill({ color: SLOT_COLORS[0] });
    line.rect(W / 2, -3, W / 2, 6).fill({ color: SLOT_COLORS[1] });
    line.filters = [new GlowFilter({ color: 0xffffff, distance: 18, outerStrength: 2.5, quality: 0.2 })];
    line.alpha = 0.8;
    this.backdrop.addChild(line);

    // Arena walls.
    const walls = new Graphics();
    walls.rect(-12, 0, 12, 900).rect(W, 0, 12, 900).fill({ color: NEON.chalk, alpha: 0.08 });
    this.backdrop.addChild(walls);
  }

  // ---------------------------------------------------------------------- fx

  private burst(x: number, y: number, color: number, count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const s = new Sprite(this.dot);
      s.anchor.set(0.5);
      s.tint = color;
      s.blendMode = 'add';
      s.position.set(x, y);
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.25 + Math.random() * 0.35;
      s.scale.set(0.5 + Math.random() * 0.9);
      this.fxLayer.addChild(s);
      this.particles.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 150, life, max: life });
    }
  }

  private ring(x: number, y: number, color: number, big: boolean) {
    const g = new Graphics();
    g.blendMode = 'add';
    this.fxLayer.addChild(g);
    this.rings.push({ g, age: 0, max: big ? 0.35 : 0.22, color, x, y, big });
  }

  private updateFx(dt: number) {
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) { p.s.destroy(); return false; }
      p.vy -= 1400 * dt;
      p.vx *= 0.96;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.alpha = p.life / p.max;
      return true;
    });
    this.rings = this.rings.filter((r) => {
      r.age += dt;
      if (r.age >= r.max) { r.g.destroy(); return false; }
      const k = r.age / r.max;
      const radius = (r.big ? 170 : 90) * (1 - Math.pow(1 - k, 3));
      r.g.clear().circle(r.x, r.y, radius).stroke({ width: (r.big ? 14 : 8) * (1 - k), color: r.color, alpha: 1 - k });
      return true;
    });
  }

  // ------------------------------------------------------------------- debug

  /** Hurtboxes (cyan) and active hitboxes (red), toggled with H. Uses the same maths as the server. */
  private drawDebug(fs: FighterView[]) {
    const g = this.debug.clear();
    if (!this.showHitboxes) return;
    fs.forEach((v, i) => {
      const d = this.defs[i];
      const h = d.body.height * (v.action === 'CROUCH' ? 0.6 : 1);
      g.rect(v.x - d.body.width / 2, v.y, d.body.width, h).stroke({ width: 3, color: 0x33ddff, alpha: 0.9 });
      const m = v.move ? d.moves[v.move] : undefined;
      if (v.action === 'ATTACK' && m && v.moveFrame >= m.startup && v.moveFrame < m.startup + m.active) {
        const b = m.hitbox;
        g.rect(v.x + v.facing * b.x - b.w / 2, v.y + b.y - b.h / 2, b.w, b.h)
          .fill({ color: 0xff3355, alpha: 0.3 }).stroke({ width: 3, color: 0xff3355 });
      }
    });
  }
}

/**
 * Procedural placeholder fighter: a glowing chalk-line robot. Drawn in local space where +x is
 * "forward"; the container's x-scale is flipped to face left. Swap this class for a spritesheet or
 * Spine-driven implementation later without touching the netcode.
 */
class FighterSprite {
  readonly root = new Container();
  private body = new Graphics();
  private flashT = 0;
  private walkPhase = 0;
  private glow: GlowFilter;

  constructor(private readonly color: number) {
    this.glow = new GlowFilter({ color, distance: 16, outerStrength: 2.2, quality: 0.2 });
    this.root.filters = [this.glow];
    this.root.addChild(this.body);
  }

  flash() { this.flashT = 0.12; }

  update(v: FighterView, def: FighterDefinition, dt: number) {
    this.flashT = Math.max(0, this.flashT - dt);
    this.root.position.set(v.x, v.y);
    this.root.scale.x = v.facing;

    const W = def.body.width, H = def.body.height;
    const crouch = v.action === 'CROUCH' ? 0.62 : 1;
    // Squash & stretch: stretch while rising/falling fast.
    const stretch = v.grounded ? 1 : 1 + Math.min(0.12, Math.abs(v.vy) / 9000);
    const h = H * crouch * stretch;
    if (v.action === 'WALK') this.walkPhase += dt * 14 * Math.sign(v.vx * v.facing || 1);
    const stride = v.action === 'WALK' ? Math.sin(this.walkPhase) * W * 0.28 : 0;

    const stunned = v.action === 'HITSTUN' || this.flashT > 0;
    const line = stunned ? 0xffffff : this.color;
    const g = this.body.clear();
    const lean = v.action === 'HITSTUN' ? -0.18 : v.action === 'KO' ? -1.25 : 0;
    this.body.rotation = lean;

    // Legs
    const hip = h * 0.42;
    g.moveTo(-W * 0.18, hip).lineTo(-W * 0.22 - stride, 0)
     .moveTo(W * 0.18, hip).lineTo(W * 0.22 + stride, 0)
     .stroke({ width: 7, color: line, cap: 'round' });
    // Torso
    g.roundRect(-W * 0.4, hip, W * 0.8, h * 0.4, 14)
     .fill({ color: 0x0d1014, alpha: 0.85 })
     .stroke({ width: 6, color: line });
    // Head + visor (shows facing)
    const headY = hip + h * 0.4 + h * 0.1;
    g.circle(0, headY, h * 0.1).fill({ color: 0x0d1014 }).stroke({ width: 6, color: line });
    g.roundRect(h * 0.01, headY - h * 0.015, h * 0.085, h * 0.035, 4).fill({ color: line });

    // Arm: winds back on startup, extends to the hitbox during active frames, retracts in recovery.
    const shoulderY = hip + h * 0.33;
    let reach = W * 0.35, armY = shoulderY - h * 0.08, thick = 8;
    const m = v.move ? def.moves[v.move] : undefined;
    if (v.action === 'ATTACK' && m) {
      const f = v.moveFrame;
      const tip = m.hitbox.x + m.hitbox.w / 2;
      if (f < m.startup) reach = W * (0.25 - 0.2 * (f / Math.max(1, m.startup)));
      else if (f < m.startup + m.active) { reach = tip; thick = v.move === 'heavy' ? 16 : 11; }
      else reach = tip - (tip - W * 0.35) * ((f - m.startup - m.active) / Math.max(1, m.recovery));
      armY = m.hitbox.y * crouch;
    }
    g.moveTo(W * 0.2, shoulderY).lineTo(reach, armY).stroke({ width: thick, color: line, cap: 'round' });
    if (v.action === 'ATTACK' && m && v.moveFrame >= m.startup && v.moveFrame < m.startup + m.active) {
      g.circle(reach, armY, thick * 1.6).fill({ color: 0xffffff, alpha: 0.9 });
    }

    this.glow.outerStrength = stunned ? 4 : 2.2;
    this.root.alpha = v.action === 'KO' ? 0.75 : 1;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
}
