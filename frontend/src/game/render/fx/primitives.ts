import { Container, Graphics, Sprite, Texture, type Renderer } from 'pixi.js';

/** Shared textures generated once per renderer. */
export interface FxTextures { dot: Texture; light: Texture; streak: Texture }

export function makeTextures(renderer: Renderer): FxTextures {
  const dot = renderer.generateTexture(new Graphics().circle(0, 0, 8).fill(0xffffff));
  const streak = renderer.generateTexture(new Graphics().roundRect(0, 0, 40, 6, 3).fill(0xffffff));
  // Soft radial light (canvas gradient — Pixi Graphics has no radial gradient fill).
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return { dot, streak, light: Texture.from(c) };
}

/** Jagged lightning between two points (midpoint displacement). Visual only, so Math.random is fine. */
export function lightningPoints(x0: number, y0: number, x1: number, y1: number, depth = 5, spread = 0.28): number[] {
  let pts: Array<[number, number]> = [[x0, y0], [x1, y1]];
  let amp = Math.hypot(x1 - x0, y1 - y0) * spread;
  for (let d = 0; d < depth; d++) {
    const next: Array<[number, number]> = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const nx = -(by - ay), ny = bx - ax, len = Math.hypot(nx, ny) || 1;
      const off = (Math.random() - 0.5) * amp;
      next.push([(ax + bx) / 2 + nx / len * off, (ay + by) / 2 + ny / len * off], pts[i + 1]);
    }
    pts = next;
    amp *= 0.5;
  }
  return pts.flat();
}

export function drawBolt(g: Graphics, pts: number[], color: number, width: number, alpha = 1) {
  const path = () => { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); };
  path(); g.stroke({ width: width * 3, color, alpha: alpha * 0.35, cap: 'round', join: 'round' });
  path(); g.stroke({ width, color: 0xffffff, alpha, cap: 'round', join: 'round' });
}

interface Particle { s: Sprite; vx: number; vy: number; life: number; max: number; drag: number; grav: number; spin: number; grow: number }
interface Transient { g: Graphics; age: number; max: number; draw: (g: Graphics, k: number) => void }

/**
 * Pooled particles + short-lived vector effects (rings, lightning flashes, beams). Lives in world
 * space; everything is additive so overlapping effects bloom naturally.
 */
export class FxSystem {
  readonly layer = new Container();
  private particles: Particle[] = [];
  private pool: Sprite[] = [];
  private transients: Transient[] = [];
  private gPool: Graphics[] = [];
  /** Hard cap on live particles: big ULTIMATE bursts on top of ambient motes can't snowball. */
  static readonly MAX_PARTICLES = 650;

  constructor(private readonly tex: FxTextures) {}

  burst(x: number, y: number, color: number, count: number, speed: number,
        opts: { life?: number; size?: number; grav?: number; up?: number; streak?: boolean } = {}) {
    count = Math.min(count, FxSystem.MAX_PARTICLES - this.particles.length);
    for (let i = 0; i < count; i++) {
      const s = this.pool.pop() ?? new Sprite(this.tex.dot);
      s.texture = opts.streak ? this.tex.streak : this.tex.dot;
      s.anchor.set(0.5);
      s.tint = color;
      s.blendMode = 'add';
      s.alpha = 1;
      s.position.set(x, y);
      const a = Math.random() * Math.PI * 2, v = speed * (0.25 + Math.random() * 0.75);
      const life = (opts.life ?? 0.45) * (0.5 + Math.random() * 0.8);
      const size = (opts.size ?? 0.6) * (0.5 + Math.random());
      s.scale.set(size);
      s.rotation = opts.streak ? a : 0;
      this.layer.addChild(s);
      this.particles.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v + (opts.up ?? 150), life, max: life,
        drag: 0.94, grav: opts.grav ?? 1400, spin: 0, grow: opts.streak ? 0 : -0.6 });
    }
  }

  /** Slow ambient mote (dust, embers). */
  mote(x: number, y: number, color: number, vy: number, life: number, size: number) {
    if (this.particles.length >= FxSystem.MAX_PARTICLES * 0.8) return; // ambience yields to the action
    const s = this.pool.pop() ?? new Sprite(this.tex.dot);
    s.texture = this.tex.dot;
    s.anchor.set(0.5); s.tint = color; s.blendMode = 'add'; s.alpha = 0;
    s.position.set(x, y); s.scale.set(size); s.rotation = 0;
    this.layer.addChild(s);
    this.particles.push({ s, vx: (Math.random() - 0.5) * 20, vy, life, max: life, drag: 1, grav: 0, spin: 0, grow: 0 });
  }

  transient(max: number, draw: (g: Graphics, k: number) => void) {
    const g = this.gPool.pop() ?? new Graphics();
    g.clear();
    g.blendMode = 'add';
    g.alpha = 1;
    this.layer.addChild(g);
    this.transients.push({ g, age: 0, max, draw });
  }

  ring(x: number, y: number, color: number, radius: number, width: number, max = 0.3) {
    this.transient(max, (g, k) => {
      const rr = radius * (1 - Math.pow(1 - k, 3));
      g.clear().circle(x, y, rr).stroke({ width: width * (1 - k), color, alpha: 1 - k });
    });
  }

  lightning(x0: number, y0: number, x1: number, y1: number, color: number, width = 5, max = 0.18) {
    const pts = lightningPoints(x0, y0, x1, y1);
    this.transient(max, (g, k) => { g.clear(); drawBolt(g, pts, color, width, 1 - k); });
  }

  update(dt: number) {
    const frames = dt * 60; // drag is tuned per 60 Hz frame; scale it so 144 Hz screens look the same
    let keep = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) { this.layer.removeChild(p.s); this.pool.push(p.s); continue; }
      p.vy -= p.grav * dt;
      const drag = p.drag === 1 ? 1 : Math.pow(p.drag, frames);
      p.vx *= drag;
      p.vy *= drag;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      const k = p.life / p.max;
      p.s.alpha = p.grav === 0 ? Math.min(1, (1 - k) * 4, k * 2) * 0.6 : k;
      if (p.grow) p.s.scale.set(Math.max(0.05, p.s.scale.x + p.grow * dt));
      if (p.s.texture === this.tex.streak) p.s.rotation = Math.atan2(p.vy, p.vx);
      this.particles[keep++] = p;
    }
    this.particles.length = keep;
    keep = 0;
    for (const t of this.transients) {
      t.age += dt;
      if (t.age >= t.max) {
        t.g.removeFromParent();
        if (this.gPool.length < 32) this.gPool.push(t.g); else t.g.destroy();
        continue;
      }
      t.draw(t.g, t.age / t.max);
      this.transients[keep++] = t;
    }
    this.transients.length = keep;
  }

  clear() {
    this.particles.forEach((p) => p.s.destroy());
    this.transients.forEach((t) => t.g.destroy());
    this.particles = [];
    this.transients = [];
  }
}
