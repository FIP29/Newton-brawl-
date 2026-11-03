import { Container, Graphics, Sprite } from 'pixi.js';
import type { FighterDefinition, FighterView, ObjectView, ProjectileView, ZoneView } from '../../protocol';
import { NEON } from '../../../fx/palette';
import { drawBolt, lightningPoints, type FxSystem, type FxTextures } from './primitives';

const AMBER_C = 0xffa630, BRONZE_C = 0xcd7f32, COPPER_C = 0xe8834a, STEEL_C = 0xc8d2dc;
const SKY_C = 0x00e5ff, BULB_C = 0xffe14d, ICE_C = 0x9fe8ff, EMERALD_C = 0x2ecc71;
const TEAL_C = 0x2ee6c9, MAGENTA_C = 0xff3df2, INDIGO_C = 0x6f7bff, RED_C = 0xff4d6d, BLUESHIFT_C = 0x6fb8ff;
/** Hot accretion-disk colours, inner to outer. */
const DISK = [0xffffff, 0xffe0a0, 0xff9a40, 0xc8402a];
/** The Galilean moons in their real colours (sulphur-yellow Io, icy Europa, grey-brown Ganymede, dark Callisto). */
const MOON_COLORS: Record<string, number> = { io: 0xf2d16b, europa: 0xe8e2cf, ganymede: 0xb9a58d, callisto: 0x7d7264 };


/**
 * Draws everything that isn't a fighter: projectiles, zones, arena objects and status auras,
 * plus the dynamic lights they cast. Redrawn every frame from (interpolated) snapshot data;
 * `seen` sets trigger one-shot effects when an entity first appears.
 */
export class EntityLayer {
  readonly back = new Container();   // under fighters: floor traps, bubbles, field tint
  readonly front = new Container();  // over fighters: projectiles, beams, auras
  readonly lights = new Container();
  private gBack = new Graphics();
  private gFront = new Graphics();
  private lightPool: Sprite[] = [];
  private usedLights = 0;
  private seen = new Set<number>();
  private blasted = new Set<number>();
  private objSpin = new Map<number, number>();
  private time = 0;
  private trails = new Map<number, Array<[number, number]>>();

  constructor(private readonly tex: FxTextures, private readonly fx: FxSystem, private readonly arenaW: number,
              private readonly arenaH: number) {
    this.back.addChild(this.gBack);
    this.front.addChild(this.gFront);
  }

  private light(x: number, y: number, color: number, scale: number, alpha: number) {
    let s = this.lightPool[this.usedLights];
    if (!s) {
      s = new Sprite(this.tex.light);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.lightPool.push(s);
      this.lights.addChild(s);
    }
    this.usedLights++;
    s.visible = true;
    s.position.set(x, y);
    s.scale.set(scale);
    s.tint = color;
    s.alpha = alpha;
  }

  update(dt: number, projectiles: ProjectileView[], zones: ZoneView[], objects: ObjectView[],
         fighters: FighterView[], defs: FighterDefinition[], colors: number[]) {
    this.time += dt;
    this.usedLights = 0;
    const b = this.gBack.clear(), f = this.gFront.clear();
    const alive = new Set<number>();

    for (const z of zones) { alive.add(z.id); this.drawZone(b, f, z, fighters, defs, colors); }
    for (const p of projectiles) { alive.add(p.id); this.drawProjectile(b, f, p, colors); }
    for (const o of objects) this.drawObject(b, o, colors, dt);
    fighters.forEach((v, i) => this.drawStatus(f, v, defs[i], colors[i]));

    for (const id of [...this.seen]) if (!alive.has(id)) { this.seen.delete(id); this.trails.delete(id); }
    for (let i = this.usedLights; i < this.lightPool.length; i++) this.lightPool[i].visible = false;
  }

  // ------------------------------------------------------------------- projectiles

  private drawProjectile(b: Graphics, f: Graphics, p: ProjectileView, colors: number[]) {
    const color = colors[p.owner] ?? 0xffffff;
    const first = !this.seen.has(p.id);
    this.seen.add(p.id);
    const trail = this.trails.get(p.id) ?? [];
    trail.push([p.x, p.y]);
    if (trail.length > 10) trail.shift();
    this.trails.set(p.id, trail);

    switch (p.kind) {
      case 'apple': {
        if (first) this.fx.burst(p.x, p.y, NEON.newton, 10, 200, { grav: 0, life: 0.4 });
        // shadow on the floor grows as the apple approaches (it's falling at 9.8 m/s²)
        const k = Math.max(0, Math.min(1, 1 - p.y / 800));
        b.ellipse(p.x, 3, 18 + 22 * k, 5 + 4 * k).fill({ color: 0x000000, alpha: 0.25 + 0.35 * k });
        b.ellipse(p.x, 3, 26 + 30 * k, 7).stroke({ width: 2, color: NEON.newton, alpha: 0.25 + 0.5 * k });
        const r = p.w / 2;
        for (let i = 0; i < trail.length - 1; i++) {
          const [tx, ty] = trail[i];
          f.circle(tx, ty, r * (i / trail.length)).fill({ color: 0xff5a3c, alpha: 0.08 * i });
        }
        f.circle(p.x, p.y, r).fill(0xd92b2b).stroke({ width: 3, color: NEON.newton });
        f.circle(p.x - r * 0.35, p.y + r * 0.3, r * 0.28).fill({ color: 0xffffff, alpha: 0.5 });
        f.moveTo(p.x, p.y + r * 0.8).lineTo(p.x + 3, p.y + r * 1.4).stroke({ width: 3, color: 0x6b3d1f });
        f.ellipse(p.x + 9, p.y + r * 1.2, 8, 4).fill(0x4caf50);
        this.light(p.x, p.y, 0xff7a3c, 1.4, 0.35);
        break;
      }
      case 'gravity-wave': {
        const dir = Math.sign(p.vx) || 1;
        for (let i = 0; i < 4; i++) {
          const off = i * 22 - ((this.time * 200) % 22);
          const cx = p.x - dir * off;
          f.moveTo(cx + dir * Math.cos(-1.1) * 70, p.y + Math.sin(-1.1) * 70)
            .arc(cx, p.y, 70, dir > 0 ? -1.1 : Math.PI - 1.1, dir > 0 ? 1.1 : Math.PI + 1.1, false)
            .stroke({ width: 8 - i * 1.5, color: i % 2 ? 0xb57bff : NEON.newton, alpha: 0.9 - i * 0.18 });
        }
        this.light(p.x, p.y, NEON.newton, 2.2, 0.35);
        break;
      }
      case 'bolt': {
        if (first) this.fx.burst(p.x, p.y, NEON.tesla, 12, 500, { grav: 0, life: 0.25, streak: true });
        const [tx, ty] = trail[0];
        drawBolt(f, lightningPoints(tx, ty, p.x + (Math.sign(p.vx) || 1) * 20, p.y, 4, 0.35), NEON.tesla, 4);
        f.circle(p.x, p.y, 10).fill({ color: 0xffffff, alpha: 0.9 });
        if (Math.random() < 0.5) this.fx.burst(p.x, p.y, NEON.tesla, 1, 250, { grav: 0, life: 0.2, streak: true, size: 0.5 });
        this.light(p.x, p.y, NEON.tesla, 2.4, 0.55);
        break;
      }
      case 'orb': {
        // brightness follows the decaying damage: it literally fades with its half-life
        const strength = Math.max(0.15, p.damage / 130);
        const r = p.w / 2;
        const pulse = 1 + Math.sin(this.time * 12) * 0.08;
        f.circle(p.x, p.y, r * 1.6 * pulse).fill({ color: NEON.curie, alpha: 0.12 * strength });
        f.circle(p.x, p.y, r * pulse).fill({ color: NEON.curie, alpha: 0.55 * strength + 0.2 }).stroke({ width: 3, color: 0xeaffe6, alpha: strength });
        // radiation trefoil
        for (let i = 0; i < 3; i++) {
          const a = this.time * 2 + i * (Math.PI * 2 / 3);
          f.moveTo(p.x, p.y).arc(p.x, p.y, r * 0.75, a, a + 0.7).lineTo(p.x, p.y).fill({ color: 0x10240e, alpha: 0.6 });
        }
        if (Math.random() < 0.4) this.fx.burst(p.x, p.y, NEON.curie, 1, 90, { grav: -40, life: 0.6, size: 0.35 });
        this.light(p.x, p.y, NEON.curie, 2.6 * strength + 0.6, 0.5 * strength);
        break;
      }
      case 'pendulum': {
        // Galileo's pendulum: rope from the pivot, a brass bob, and a faint arc of its swing
        f.moveTo(p.px - 14, p.py).lineTo(p.px + 14, p.py).stroke({ width: 6, color: 0x6b4a1a });
        f.moveTo(p.px, p.py).lineTo(p.x, p.y).stroke({ width: 3, color: 0xe8d9b0 });
        for (let i = 0; i < trail.length - 1; i++) f.circle(trail[i][0], trail[i][1], p.w / 2 * (i / trail.length)).fill({ color: AMBER_C, alpha: 0.06 * i });
        f.circle(p.x, p.y, p.w / 2).fill(0xb8892e).stroke({ width: 3, color: AMBER_C });
        f.circle(p.x - p.w * 0.15, p.y + p.w * 0.15, p.w * 0.15).fill({ color: 0xffffff, alpha: 0.4 });
        this.light(p.x, p.y, AMBER_C, 1.8, 0.4);
        break;
      }
      case 'cannonball':
      case 'musketball': {
        // Tower Drop: two masses, one falling speed — matching floor shadows show they land together
        const heavy = p.kind === 'cannonball';
        const k = Math.max(0, Math.min(1, 1 - p.y / 800));
        b.ellipse(p.x, 3, (heavy ? 22 : 12) + 18 * k, 5 + 3 * k).fill({ color: 0x000000, alpha: 0.25 + 0.35 * k });
        f.circle(p.x, p.y, p.w / 2).fill(heavy ? 0x2b2e33 : 0x8c9196).stroke({ width: 3, color: AMBER_C });
        f.circle(p.x - p.w * 0.15, p.y + p.w * 0.15, p.w * 0.12).fill({ color: 0xffffff, alpha: 0.35 });
        this.light(p.x, p.y, AMBER_C, heavy ? 1.2 : 0.7, 0.25);
        break;
      }
      case 'io':
      case 'europa':
      case 'ganymede':
      case 'callisto': {
        // The Galilean moons, each with its real colouring
        const tint = MOON_COLORS[p.kind];
        for (let i = 0; i < trail.length - 1; i++) f.circle(trail[i][0], trail[i][1], p.w / 2 * (i / trail.length)).fill({ color: tint, alpha: 0.05 * i });
        f.circle(p.x, p.y, p.w / 2).fill(tint).stroke({ width: 2, color: AMBER_C });
        if (p.kind === 'europa') f.moveTo(p.x - 8, p.y - 4).lineTo(p.x + 6, p.y + 6).stroke({ width: 1.5, color: 0x8a6a4a });
        if (p.kind === 'io') f.circle(p.x + 4, p.y + 3, 3).fill(0xd2691e);
        this.light(p.x, p.y, tint, 1.1, 0.3);
        break;
      }
      case 'bubble': {
        // Archimedes' water bubble, wobbling as it drifts
        const wob = Math.sin(this.time * 9 + p.id) * 0.08;
        f.ellipse(p.x, p.y, p.w / 2 * (1 + wob), p.h / 2 * (1 - wob)).fill({ color: 0x5fd7ff, alpha: 0.18 }).stroke({ width: 3, color: 0x9fe8ff, alpha: 0.9 });
        f.ellipse(p.x - p.w * 0.16, p.y + p.h * 0.16, p.w * 0.12, p.h * 0.07).fill({ color: 0xffffff, alpha: 0.7 });
        if (Math.random() < 0.3) this.fx.burst(p.x, p.y - p.h / 2, 0x9fe8ff, 1, 40, { grav: -120, life: 0.6, size: 0.25 });
        this.light(p.x, p.y, 0x5fd7ff, 1.6, 0.25);
        break;
      }
      case 'cat': {
        // Alive! The cat leaps out of the box at the opponent
        const d = Math.sign(p.vx) || 1;
        const run = Math.sin(this.time * 30) * 4;
        f.ellipse(p.x, p.y, 26, 13).fill({ color: 0xd8fff7, alpha: 0.85 }).stroke({ width: 3, color: TEAL_C });
        f.circle(p.x + d * 26, p.y + 8, 11).fill(0xd8fff7).stroke({ width: 3, color: TEAL_C });
        f.poly([p.x + d * 19, p.y + 15, p.x + d * 22, p.y + 28, p.x + d * 28, p.y + 17]).fill(TEAL_C);
        f.poly([p.x + d * 30, p.y + 17, p.x + d * 35, p.y + 28, p.x + d * 36, p.y + 13]).fill(TEAL_C);
        f.circle(p.x + d * 30, p.y + 10, 2.5).fill(0x0b3a33);
        f.moveTo(p.x - d * 24, p.y + 4).quadraticCurveTo(p.x - d * 44, p.y + 20, p.x - d * 40, p.y + 34).stroke({ width: 5, color: TEAL_C, cap: 'round' });
        for (const lx of [-14, 12]) f.moveTo(p.x + lx, p.y - 8).lineTo(p.x + lx + run * d, p.y - 20).stroke({ width: 5, color: TEAL_C, cap: 'round' });
        this.light(p.x, p.y, TEAL_C, 1.6, 0.35);
        break;
      }
      case 'photon': {
        // A wave packet: a short oscillation inside a Gaussian envelope
        const d = Math.sign(p.vx) || 1;
        const pts: number[] = [];
        for (let i = -12; i <= 12; i++) {
          const x = i * 3.5, env = Math.exp(-(i * i) / 40);
          pts.push(p.x + d * x, p.y + Math.sin(i * 1.3 - this.time * 60) * 12 * env);
        }
        f.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) f.lineTo(pts[i], pts[i + 1]);
        f.stroke({ width: 4, color: MAGENTA_C });
        f.circle(p.x, p.y, 6).fill(0xffffff);
        this.light(p.x, p.y, MAGENTA_C, 1.8, 0.5);
        break;
      }
      case 'minihole': {
        // Evaporating black hole: as it shrinks it glows hotter (Hawking radiation)
        const rr = p.w / 2, heat = Math.min(1, (p.damage / 26 - 1) / 3);
        const hot = heat > 0.6 ? 0xffffff : heat > 0.3 ? 0xffe0a0 : 0xff9a40;
        f.circle(p.x, p.y, rr * 1.9).fill({ color: hot, alpha: 0.1 + 0.25 * heat });
        f.ellipse(p.x, p.y, rr * 1.6, rr * 0.45).stroke({ width: 3 + heat * 3, color: hot, alpha: 0.9 });
        f.circle(p.x, p.y, rr).fill(0x000000).stroke({ width: 2, color: INDIGO_C });
        if (Math.random() < 0.3 + heat * 0.7) {
          this.fx.burst(p.x, p.y, Math.random() < 0.5 ? hot : INDIGO_C, 1, 220 + heat * 300, { grav: 0, life: 0.3, streak: true, size: 0.4 });
        }
        this.light(p.x, p.y, hot, 1.2 + heat * 2.5, 0.3 + heat * 0.5);
        break;
      }
      case 'soundwave':
      case 'wavefront': {
        // Sound: arcs of compression; Blueshift wavefronts are squeezed and bluer
        const d = Math.sign(p.vx) || 1;
        const blue = p.kind === 'wavefront';
        const c = blue ? BLUESHIFT_C : RED_C;
        const n = blue ? 1 : 3;
        for (let i = 0; i < n; i++) {
          const cx = p.x - d * i * 18, rad = p.h * 0.6;
          f.moveTo(cx + d * Math.cos(-0.9) * rad - d * rad * 0.7, p.y + Math.sin(-0.9) * rad)
            .arc(cx - d * rad * 0.7, p.y, rad, d > 0 ? -0.9 : Math.PI - 0.9, d > 0 ? 0.9 : Math.PI + 0.9, false)
            .stroke({ width: 7 - i * 2, color: i === 0 ? 0xffffff : c, alpha: 0.95 - i * 0.25 });
          f.moveTo(cx + d * Math.cos(-0.9) * rad - d * rad * 0.7, p.y + Math.sin(-0.9) * rad)
            .arc(cx - d * rad * 0.7, p.y, rad, d > 0 ? -0.9 : Math.PI - 0.9, d > 0 ? 0.9 : Math.PI + 0.9, false)
            .stroke({ width: 14, color: c, alpha: 0.2 });
        }
        this.light(p.x, p.y, c, 2, 0.35);
        break;
      }
      case 'jet': {
        // a narrow jet of fast air: streamlines squeezed together
        const d = Math.sign(p.vx) || 1;
        for (let i = -2; i <= 2; i++) {
          const y = p.y + i * 8, ph = (this.time * 40 + i * 7) % 30;
          f.moveTo(p.x - d * (p.w * 0.9 + ph), y).lineTo(p.x + d * p.w / 2, y + i * 2).stroke({ width: 3 - Math.abs(i) * 0.5, color: i === 0 ? 0xffffff : SKY_C, alpha: 0.85 });
        }
        f.ellipse(p.x + d * p.w * 0.35, p.y, 18, 16).fill({ color: SKY_C, alpha: 0.35 });
        if (Math.random() < 0.6) this.fx.burst(p.x, p.y, 0xd8faff, 1, 260, { grav: 0, life: 0.25, streak: true, size: 0.4 });
        this.light(p.x, p.y, SKY_C, 1.6, 0.35);
        break;
      }
      case 'coldwave': {
        // a cloud of ice crystals: six-armed flakes tumbling
        const rr = p.w / 2;
        f.circle(p.x, p.y, rr * 1.2).fill({ color: ICE_C, alpha: 0.18 });
        for (let k = 0; k < 3; k++) {
          const a0 = this.time * (2 + k) + k, cx = p.x + Math.cos(a0) * rr * 0.4, cy = p.y + Math.sin(a0) * rr * 0.4, len = rr * (0.7 - k * 0.15);
          for (let i = 0; i < 3; i++) {
            const a = a0 + i * Math.PI / 3;
            f.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len).lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          }
          f.stroke({ width: 3 - k * 0.6, color: k === 0 ? 0xffffff : ICE_C, cap: 'round' });
        }
        if (Math.random() < 0.5) this.fx.burst(p.x, p.y, 0xeaffff, 1, 60, { grav: -30, life: 0.5, size: 0.3 });
        this.light(p.x, p.y, ICE_C, 2, 0.4);
        break;
      }
      case 'microwave': {
        // millimetre waves: a tight train of crests
        const d = Math.sign(p.vx) || 1;
        for (let i = 0; i < 4; i++) {
          const cx = p.x - d * i * 12;
          f.moveTo(cx, p.y - p.h / 2).quadraticCurveTo(cx + d * 14, p.y, cx, p.y + p.h / 2)
            .stroke({ width: 4 - i * 0.7, color: i === 0 ? 0xffffff : EMERALD_C, alpha: 1 - i * 0.2 });
        }
        this.light(p.x, p.y, EMERALD_C, 1.8, 0.4);
        break;
      }
      default:
        f.circle(p.x, p.y, p.w / 2).fill({ color, alpha: 0.8 });
    }
    if (p.reflected) f.circle(p.x, p.y, p.w).stroke({ width: 3, color: NEON.newton, alpha: 0.8 });
  }

  // ------------------------------------------------------------------------ zones

  private drawZone(b: Graphics, f: Graphics, z: ZoneView, fighters: FighterView[], defs: FighterDefinition[], colors: number[]) {
    const owner = fighters[z.owner];
    switch (z.kind) {
      case 'BUBBLE': {
        // Einstein's time-dilation bubble: a slow clockface rippling spacetime
        const k = Math.min(1, z.age / 10) * Math.min(1, z.life / 15);
        const rx = z.w / 2, ry = z.h / 2;
        b.ellipse(z.x, z.y, rx, ry).fill({ color: NEON.einstein, alpha: 0.1 * k }).stroke({ width: 4, color: NEON.einstein, alpha: 0.7 * k });
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6;
          b.moveTo(z.x + Math.cos(a) * rx * 0.86, z.y + Math.sin(a) * ry * 0.86).lineTo(z.x + Math.cos(a) * rx * 0.95, z.y + Math.sin(a) * ry * 0.95);
        }
        b.stroke({ width: 3, color: NEON.einstein, alpha: 0.6 * k });
        const t = this.time * 0.4; // hands crawl: time is slow in here
        b.moveTo(z.x, z.y).lineTo(z.x + Math.cos(-t) * rx * 0.6, z.y + Math.sin(-t) * ry * 0.6)
          .moveTo(z.x, z.y).lineTo(z.x + Math.cos(-t / 12) * rx * 0.4, z.y + Math.sin(-t / 12) * ry * 0.4)
          .stroke({ width: 5, color: 0xe7d6ff, alpha: 0.7 * k, cap: 'round' });
        for (let i = 1; i <= 2; i++) {
          const ph = ((this.time * 0.5 + i * 0.5) % 1);
          b.ellipse(z.x, z.y, rx * ph, ry * ph).stroke({ width: 2, color: NEON.einstein, alpha: 0.35 * (1 - ph) * k });
        }
        this.light(z.x, z.y, NEON.einstein, 4, 0.2 * k);
        break;
      }
      case 'PULL': {
        // magnetic field lines curling in toward Tesla
        const k = Math.min(1, z.age / 6) * Math.min(1, z.life / 8);
        const ox = owner.x, oy = 120;
        for (let i = -3; i <= 3; i++) {
          for (const side of [-1, 1]) {
            const ph = (this.time * 1.8 + i * 0.13) % 1;
            const sx = ox + side * (z.w / 2) * (1 - ph);
            const sy = oy + i * 34 * (1 - ph * 0.6);
            f.moveTo(sx, sy).quadraticCurveTo((sx + ox) / 2, sy + i * 30, ox + side * 30, oy + i * 8)
              .stroke({ width: 3, color: NEON.tesla, alpha: 0.5 * k * (1 - ph * 0.5) });
          }
        }
        this.light(ox, oy, NEON.tesla, 3.5, 0.3 * k);
        break;
      }
      case 'TRAP': {
        const pulse = 0.6 + 0.4 * Math.sin(this.time * (z.armed ? 7 : 3));
        const a = z.armed ? 1 : 0.35;
        b.ellipse(z.x, 4, z.w / 2, 12).fill({ color: NEON.curie, alpha: 0.25 * a * pulse }).stroke({ width: 3, color: NEON.curie, alpha: 0.9 * a });
        for (let i = 0; i < 3; i++) {
          const ang = i * (Math.PI * 2 / 3) + this.time;
          b.ellipse(z.x + Math.cos(ang) * 24, 4 + Math.sin(ang) * 5, 10, 4).fill({ color: 0xeaffe6, alpha: 0.6 * a });
        }
        if (z.armed && Math.random() < 0.3) this.fx.burst(z.x + (Math.random() - 0.5) * z.w * 0.8, 6, NEON.curie, 1, 60, { grav: -60, life: 0.8, size: 0.3 });
        this.light(z.x, 10, NEON.curie, 2.2, 0.35 * a * pulse);
        break;
      }
      case 'BLAST': {
        const t = z.age - z.delay;
        if (t <= 0) {
          // charging point before the split
          b.circle(z.x, 40, 6 + (z.delay > 0 ? 0 : 6)).fill({ color: NEON.curie, alpha: 0.5 });
          break;
        }
        const k = Math.min(1, t / z.active);
        if (!this.blasted.has(z.id)) {
          this.blasted.add(z.id);
          this.fx.burst(z.x, z.y, NEON.curie, 26, 900, { life: 0.5 });
          this.fx.burst(z.x, z.y, 0xffffff, 10, 500, { life: 0.3 });
          this.fx.ring(z.x, z.y, NEON.curie, z.w * 0.8, 16, 0.35);
        }
        f.circle(z.x, z.y, z.w * 0.55 * (0.4 + k)).fill({ color: NEON.curie, alpha: 0.45 * (1 - k) });
        f.circle(z.x, z.y, z.w * 0.3 * (0.4 + k)).fill({ color: 0xffffff, alpha: 0.7 * (1 - k) });
        this.light(z.x, z.y, NEON.curie, 6, 0.6 * (1 - k));
        break;
      }
      case 'BEAM': {
        const t = z.age - z.delay;
        const k = Math.min(1, t / 4) * Math.min(1, (z.active - t + 4) / 6);
        if (k <= 0) break;
        const x0 = z.x - z.w / 2, x1 = z.x + z.w / 2;
        const flick = 0.85 + Math.random() * 0.15;
        f.rect(x0, z.y - z.h * 0.8, z.w, z.h * 1.6).fill({ color: NEON.einstein, alpha: 0.25 * k });
        f.rect(x0, z.y - z.h / 2, z.w, z.h).fill({ color: NEON.einstein, alpha: 0.6 * k * flick });
        f.rect(x0, z.y - z.h * 0.18, z.w, z.h * 0.36).fill({ color: 0xffffff, alpha: 0.9 * k });
        for (let i = 0; i < 3; i++) this.fx.burst(x0 + Math.random() * z.w, z.y + (Math.random() - 0.5) * z.h, 0xe7d6ff, 1, 400, { grav: 0, life: 0.3, streak: true });
        for (let x = x0; x < x1; x += 160) this.light(x, z.y, NEON.einstein, 4, 0.5 * k);
        break;
      }
      case 'FIELD': {
        // Tesla Coil: the whole lab hums with charge
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 20);
        b.rect(0, 0, this.arenaW, this.arenaH).fill({ color: NEON.tesla, alpha: 0.05 + 0.04 * pulse });
        const target = fighters[1 - z.owner];
        const th = defs[1 - z.owner].body.height;
        if (Math.random() < 0.5) this.fx.lightning(target.x + (Math.random() - 0.5) * 120, target.y + th + 400, target.x, target.y + th * 0.6, NEON.tesla, 3, 0.08);
        this.light(target.x, target.y + th * 0.5, NEON.tesla, 4, 0.3 + 0.2 * pulse);
        break;
      }
      case 'LEVER': {
        // a plank on a triangular fulcrum: the near end drops, the far end catapults up
        const t = z.age - z.delay;
        const tilt = t <= 0 ? 0.25 * (z.age / Math.max(1, z.delay)) : 0.25 - Math.min(1, t / 3) * 0.6;
        const cx = z.x - z.w * 0.15, cy = 18;
        b.poly([cx - 16, 0, cx + 16, 0, cx, cy]).fill(0x5a3a1c).stroke({ width: 3, color: BRONZE_C });
        const half = z.w * 0.65, c = Math.cos(tilt), sn = Math.sin(tilt);
        b.moveTo(cx - half * c, cy - half * sn).lineTo(cx + half * c, cy + half * sn).stroke({ width: 10, color: 0x8a5a2b })
          .moveTo(cx - half * c, cy - half * sn).lineTo(cx + half * c, cy + half * sn).stroke({ width: 3, color: BRONZE_C });
        if (t === 1) this.fx.burst(z.x, 40, BRONZE_C, 20, 600, { life: 0.4, streak: true });
        break;
      }
      case 'FOCUS': {
        // Burning Mirrors: sunbeams converge on a target, then a blazing column
        const t = z.age - z.delay;
        if (t <= 0) {
          const k = z.age / Math.max(1, z.delay);
          for (const sx of [-0.2, 0.15, 0.55, 0.85, 1.2]) {
            f.moveTo(sx * this.arenaW, this.arenaH).lineTo(z.x, 0).stroke({ width: 2 + k * 3, color: 0xffe08a, alpha: 0.15 + 0.45 * k });
          }
          b.ellipse(z.x, 4, z.w * (1.2 - k * 0.7), 10).stroke({ width: 3, color: 0xffcc33, alpha: 0.4 + 0.6 * k });
          this.light(z.x, 10, 0xffcc33, 2 + 3 * k, 0.2 + 0.4 * k);
        } else if (t <= z.active) {
          const flick = 0.85 + Math.random() * 0.15;
          f.rect(z.x - z.w, 0, z.w * 2, this.arenaH).fill({ color: 0xffcc33, alpha: 0.2 * flick });
          f.rect(z.x - z.w / 2, 0, z.w, this.arenaH).fill({ color: 0xffe9a8, alpha: 0.7 * flick });
          f.rect(z.x - z.w / 6, 0, z.w / 3, this.arenaH).fill({ color: 0xffffff, alpha: 0.9 });
          if (Math.random() < 0.6) this.fx.burst(z.x, 10, 0xff8a3c, 2, 500, { life: 0.4 });
          for (let y = 100; y < this.arenaH; y += 200) this.light(z.x, y, 0xffcc33, 4, 0.6);
        }
        break;
      }
      case 'INDUCTION': {
        // a copper coil on the floor with looping field lines; it glows as induced charge builds
        const charge = 0.5 + 0.5 * Math.sin(this.time * 6);
        const base = 6;
        for (let i = 0; i < 5; i++) b.ellipse(z.x, base + i * 7, z.w * 0.2, 6).stroke({ width: 3, color: COPPER_C, alpha: 0.9 });
        for (let i = 0; i < 3; i++) {
          const ph = (this.time * 0.8 + i / 3) % 1;
          b.ellipse(z.x, z.y, z.w / 2 * (0.4 + ph * 0.6), z.h / 2 * (0.4 + ph * 0.6)).stroke({ width: 2, color: COPPER_C, alpha: 0.35 * (1 - ph) });
        }
        this.light(z.x, 30, COPPER_C, 2.2, 0.25 + 0.4 * charge);
        break;
      }
      case 'STORM': {
        // Dynamo: a spinning magnetic vortex
        const k = Math.min(1, z.age / 10) * Math.min(1, z.life / 15);
        for (let i = 0; i < 6; i++) {
          const rr = (i + 1) / 6;
          const a0 = this.time * (4 - i * 0.4) + i;
          const pts: number[] = [];
          for (let j = 0; j <= 16; j++) { const a = a0 + j * 0.25; pts.push(z.x + Math.cos(a) * z.w / 2 * rr, z.y + Math.sin(a) * z.h / 2 * rr); }
          f.moveTo(pts[0], pts[1]);
          for (let j = 2; j < pts.length; j += 2) f.lineTo(pts[j], pts[j + 1]);
          f.stroke({ width: 3, color: i % 2 ? COPPER_C : 0xffd8b0, alpha: 0.55 * k });
        }
        const target = fighters[1 - z.owner];
        if (Math.random() < 0.35) this.fx.lightning(z.x, z.y, target.x, target.y + defs[1 - z.owner].body.height * 0.5, COPPER_C, 3, 0.1);
        this.light(z.x, z.y, COPPER_C, 6, 0.3 * k);
        break;
      }
      case 'SPRING': {
        // Spring Trap: a coil on the floor tied to Hooke by an elastic line; brighter = more stretched
        const stretch = Math.min(500, Math.abs(owner.x - z.x)) / 500;
        const a = z.armed ? 1 : 0.4;
        const coils = 7, w = z.w * 0.5;
        const pts: number[] = [z.x - w / 2, 4];
        for (let i = 1; i <= coils; i++) pts.push(z.x - w / 2 + (w * i) / coils, i % 2 ? 26 + stretch * 10 : 4);
        b.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) b.lineTo(pts[i], pts[i + 1]);
        b.stroke({ width: 4, color: STEEL_C, alpha: a });
        const oh = defs[z.owner].body.height;
        b.moveTo(z.x, 14).quadraticCurveTo((z.x + owner.x) / 2, 14 - 30 * (1 - stretch), owner.x, owner.y + oh * 0.45)
          .stroke({ width: 1.5 + stretch * 4, color: STEEL_C, alpha: 0.25 + 0.6 * stretch });
        this.light(z.x, 12, STEEL_C, 1.5 + stretch * 2, 0.15 + 0.35 * stretch * a);
        break;
      }
      case 'VORTEX': {
        // Hurricane: spiral bands around a calm, low-pressure eye
        const k = Math.min(1, z.age / 10) * Math.min(1, z.life / 15);
        for (let band = 0; band < 5; band++) {
          const pts: number[] = [];
          for (let j = 0; j <= 30; j++) {
            const t = j / 30, a = this.time * 3 + band * 1.26 + t * 5;
            const rr = 30 + t * z.w * 0.5;
            pts.push(z.x + Math.cos(a) * rr, z.y * 0.6 + Math.sin(a) * rr * 0.45 + t * z.h * 0.25);
          }
          f.moveTo(pts[0], pts[1]);
          for (let j = 2; j < pts.length; j += 2) f.lineTo(pts[j], pts[j + 1]);
          f.stroke({ width: 4, color: band % 2 ? SKY_C : 0xd8faff, alpha: 0.45 * k });
        }
        if (Math.random() < 0.7) this.fx.burst(z.x + (Math.random() - 0.5) * z.w, 10, 0xd8faff, 1, 120, { grav: -200, life: 0.6, streak: true, size: 0.4 });
        this.light(z.x, z.y, SKY_C, 5, 0.25 * k);
        break;
      }
      case 'CURRENT': {
        // a steady direct current: straight, unwavering lines (DC doesn't alternate)
        const k = Math.min(1, z.life / 8);
        const x0 = z.x - z.w / 2, x1 = z.x + z.w / 2;
        for (let i = 0; i < 4; i++) {
          const y = z.y - z.h * 0.3 + i * z.h * 0.2, ph = ((this.time * 3 + i * 0.25) % 1) * z.w;
          f.moveTo(x0, y).lineTo(x1, y).stroke({ width: 3, color: BULB_C, alpha: 0.55 * k });
          f.circle(x0 + ph, y, 4).fill({ color: 0xffffff, alpha: k });
        }
        this.light(z.x, z.y, BULB_C, 2.4, 0.45 * k);
        break;
      }
      case 'VINE': {
        // a vine growing from the floor; it coils when ready, and lashes when it strikes
        const ready = z.armed;
        const strikeSoon = z.delay > 0 && z.delay - z.age < 8;
        const hgt = z.h * (ready ? 1 : 0.3 + 0.7 * Math.min(1, z.age / 30));
        for (let side = -1; side <= 1; side += 2) {
          const sway = Math.sin(this.time * 2 + z.id + side) * 10 + (strikeSoon ? Math.sin(this.time * 40) * 14 : 0);
          b.moveTo(z.x + side * 12, 0).bezierCurveTo(z.x + side * 40 + sway, hgt * 0.3, z.x - side * 30 + sway, hgt * 0.7, z.x + side * 8 + sway, hgt)
            .stroke({ width: 6, color: 0x2f7d3e });
          for (let l = 1; l <= 3; l++) {
            const ly = hgt * l / 4, lx = z.x + side * (18 + l * 4) + sway * (l / 4);
            b.ellipse(lx, ly, 12, 5).fill({ color: EMERALD_C, alpha: 0.9 });
          }
        }
        b.ellipse(z.x, 4, z.w * 0.45, 8).fill({ color: 0x3b2a1e, alpha: 0.7 });
        if (ready && Math.random() < 0.15) this.fx.burst(z.x, hgt, EMERALD_C, 1, 40, { grav: -40, life: 0.6, size: 0.3 });
        this.light(z.x, hgt * 0.6, EMERALD_C, 1.8, ready ? (strikeSoon ? 0.6 : 0.25) : 0.1);
        break;
      }
      case 'GHOST': {
        // the other half of the superposition (the copy itself is drawn by the renderer)
        const k = Math.min(1, z.age / 8) * Math.min(1, z.life / 20);
        b.ellipse(z.x, 4, 50, 10).fill({ color: TEAL_C, alpha: 0.25 * k });
        if (Math.random() < 0.4) this.fx.burst(z.x + (Math.random() - 0.5) * z.w, Math.random() * z.h, TEAL_C, 1, 40, { grav: 0, life: 0.5, size: 0.3 });
        this.light(z.x, z.y, TEAL_C, 2.4, 0.25 * k);
        break;
      }
      case 'CATBOX': {
        // the sealed box rattles harder as the moment of observation approaches
        const k = Math.min(1, z.age / Math.max(1, z.delay));
        const shake = Math.sin(this.time * 50) * 3 * k;
        const x0 = z.x - z.w / 2 + shake, y0 = z.y - z.h / 2;
        b.rect(x0, y0, z.w, z.h).fill(0x6b4a2b).stroke({ width: 3, color: TEAL_C });
        b.moveTo(x0, y0 + z.h * 0.75).lineTo(x0 + z.w, y0 + z.h * 0.75).moveTo(x0 + z.w * 0.5, y0).lineTo(x0 + z.w * 0.5, y0 + z.h * 0.75)
          .stroke({ width: 2, color: 0x3f2a17 });
        b.circle(x0 + z.w / 2, y0 + z.h * 0.38, 12).fill(0xffcc33);
        for (let i = 0; i < 3; i++) {
          const a = i * (Math.PI * 2 / 3) + Math.PI / 2;
          b.moveTo(x0 + z.w / 2, y0 + z.h * 0.38).arc(x0 + z.w / 2, y0 + z.h * 0.38, 10, a - 0.5, a + 0.5).lineTo(x0 + z.w / 2, y0 + z.h * 0.38).fill(0x1b1b1b);
        }
        b.circle(x0 + z.w / 2, y0 + z.h * 0.38, 3).fill(0xffcc33);
        this.light(z.x, z.y, TEAL_C, 1.6, 0.15 + 0.3 * k);
        break;
      }
      case 'CLOUD': {
        // the poison flask broke: a drifting cloud of vapour
        const k = Math.min(1, z.age / 10) * Math.min(1, z.life / 30);
        for (let i = 0; i < 9; i++) {
          const a = i * 2.4 + this.time * 0.6;
          const cx = z.x + Math.cos(a) * z.w * 0.28, cy = z.y + Math.sin(a * 1.3) * z.h * 0.25;
          b.circle(cx, cy, z.w * (0.18 + 0.05 * Math.sin(this.time * 2 + i))).fill({ color: i % 2 ? 0x8bd46a : 0x6a4c8c, alpha: 0.16 * k });
        }
        if (Math.random() < 0.3 * k) this.fx.burst(z.x + (Math.random() - 0.5) * z.w * 0.7, z.y + (Math.random() - 0.5) * z.h * 0.6, 0x9be07a, 1, 30, { grav: -30, life: 0.8, size: 0.4 });
        break;
      }
      case 'WAVE': {
        // ψₙ(x) = sin(nπx/L): the standing wave is shown first, then flares at its antinodes
        const n = Math.max(1, Math.round(0.6 * this.arenaW / z.w));
        const t = z.age - z.delay;
        const first = Math.abs(z.x - this.arenaW / (2 * n)) < 1; // one of the n zones draws the whole curve
        if (t <= 0) {
          if (first) {
            const warn = Math.min(1, z.age / Math.max(1, z.delay));
            for (const sign of [1, -1]) {
              f.moveTo(0, 450);
              for (let x = 0; x <= this.arenaW; x += 20) f.lineTo(x, 450 + sign * Math.sin(n * Math.PI * x / this.arenaW) * 380 * Math.sin(this.time * 10));
              f.stroke({ width: 3, color: TEAL_C, alpha: 0.3 + 0.5 * warn });
            }
          }
          b.rect(z.x - z.w / 2, 0, z.w, this.arenaH).fill({ color: TEAL_C, alpha: 0.05 + 0.1 * Math.min(1, z.age / Math.max(1, z.delay)) });
          break;
        }
        const k = 1 - Math.min(1, t / (z.active + 2));
        if (!this.blasted.has(z.id)) {
          this.blasted.add(z.id);
          this.fx.burst(z.x, 120, TEAL_C, 30, 900, { life: 0.5, streak: true });
          this.fx.ring(z.x, 120, 0xffffff, z.w * 0.6, 12, 0.3);
        }
        f.rect(z.x - z.w / 2, 0, z.w, this.arenaH).fill({ color: TEAL_C, alpha: 0.35 * k });
        f.rect(z.x - z.w * 0.18, 0, z.w * 0.36, this.arenaH).fill({ color: 0xffffff, alpha: 0.6 * k });
        this.light(z.x, 300, TEAL_C, 7, 0.6 * k);
        break;
      }
      case 'BURST': {
        const t = z.age - z.delay;
        const c = colors[z.owner] ?? 0xffffff;
        if (t <= 0) break;
        const k = Math.min(1, t / Math.max(1, z.active));
        if (!this.blasted.has(z.id)) {
          this.blasted.add(z.id);
          this.fx.burst(z.x, z.y, c, z.w > 300 ? 60 : 20, z.w > 300 ? 1200 : 600, { life: 0.5, streak: true });
          this.fx.ring(z.x, z.y, c, z.w * 0.7, 14, 0.35);
        }
        f.circle(z.x, z.y, z.w * 0.5 * (0.4 + k)).fill({ color: c, alpha: 0.4 * (1 - k) });
        f.circle(z.x, z.y, z.w * 0.25 * (0.4 + k)).fill({ color: 0xffffff, alpha: 0.7 * (1 - k) });
        this.light(z.x, z.y, c, z.w / 90, 0.6 * (1 - k));
        break;
      }
      case 'UNCERTAIN': {
        // the opponent smears into a probability cloud: you can't pin down where they are
        const target = fighters[1 - z.owner], H = defs[1 - z.owner].body.height;
        const k = Math.min(1, z.age / 10) * Math.min(1, z.life / 20);
        for (let i = 0; i < 26; i++) {
          const gx = (Math.random() + Math.random() + Math.random() - 1.5) * 90;
          const gy = (Math.random() + Math.random() + Math.random()) / 3 * H * 1.1;
          f.circle(target.x + gx, target.y + gy, 2 + Math.random() * 3).fill({ color: MAGENTA_C, alpha: 0.5 * k });
        }
        if (z.age % 20 === 0) this.fx.ring(target.x, target.y + H / 2, MAGENTA_C, 120, 4, 0.25);
        this.light(target.x, target.y + H / 2, MAGENTA_C, 3, 0.2 * k);
        break;
      }
      case 'SINGULARITY': {
        // a black hole: event horizon, photon ring, accretion disk spiralling in, lensing halo
        const k = Math.min(1, z.age / 12) * Math.min(1, z.life / 15);
        const R = z.w / 2, core = Math.max(26, z.w * 0.12);
        b.circle(z.x, z.y, R).fill({ color: 0x000000, alpha: 0.18 * k }).stroke({ width: 2, color: INDIGO_C, alpha: 0.35 * k });
        for (let i = 0; i < 4; i++) {
          const ph = (this.time * 0.7 + i / 4) % 1;
          b.circle(z.x, z.y, R * (1 - ph)).stroke({ width: 2, color: INDIGO_C, alpha: 0.3 * ph * k });
        }
        for (let ring = 0; ring < DISK.length; ring++) {
          const rx = core * (1.5 + ring * 0.55), ry = rx * 0.3;
          const spin = this.time * (5 - ring);
          f.ellipse(z.x, z.y, rx, ry).stroke({ width: 5 - ring, color: DISK[ring], alpha: 0.8 * k });
          const a = spin % (Math.PI * 2);
          f.circle(z.x + Math.cos(a) * rx, z.y + Math.sin(a) * ry, 3).fill({ color: 0xffffff, alpha: k });
        }
        f.circle(z.x, z.y, core).fill({ color: 0x000000, alpha: k }).stroke({ width: 3, color: 0xffe0a0, alpha: 0.9 * k });
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          this.fx.burst(z.x + Math.cos(a) * R * 0.9, z.y + Math.sin(a) * R * 0.9, INDIGO_C, 1, 60, { grav: 0, life: 0.5, size: 0.35 });
        }
        this.light(z.x, z.y, 0xff9a40, R / 70, 0.35 * k);
        break;
      }
      case 'BOOM': {
        // Mach cone: shock lines opening backward from the leading edge, sin θ = c/v
        const t = z.age - z.delay;
        const dir = Math.sign(owner.x - z.x) || 1; // Doppler is already at the far end
        const tipX = z.x + dir * z.w / 2;
        if (t <= 0) {
          b.moveTo(z.x - z.w / 2, 40).lineTo(z.x + z.w / 2, 40).stroke({ width: 3, color: RED_C, alpha: 0.4 });
          break;
        }
        const k = 1 - Math.min(1, t / (z.active + 3));
        if (!this.blasted.has(z.id)) {
          this.blasted.add(z.id);
          this.fx.burst(z.x, z.h / 2, 0xffffff, 24, 900, { life: 0.35, streak: true });
          this.fx.ring(tipX, z.h / 2, RED_C, 200, 10, 0.3);
        }
        for (let i = 0; i < 3; i++) {
          const back = z.w * (0.7 + i * 0.25);
          f.moveTo(tipX - dir * back, z.h / 2 + back * 0.55).lineTo(tipX, z.h / 2).lineTo(tipX - dir * back, z.h / 2 - back * 0.55)
            .stroke({ width: 8 - i * 2, color: i === 0 ? 0xffffff : RED_C, alpha: 0.8 * k });
        }
        f.rect(z.x - z.w / 2, 0, z.w, z.h).fill({ color: RED_C, alpha: 0.2 * k });
        this.light(z.x, z.h / 2, RED_C, 4, 0.5 * k);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------- objects

  private drawObject(b: Graphics, o: ObjectView, colors: number[], dt: number) {
    if (o.kind === 'rock') { this.drawRock(b, o, colors, dt); return; }
    if (o.kind === 'pot') { this.drawPot(b, o, colors, dt); return; }
    const floating = o.kind !== 'beaker';
    const spin = (this.objSpin.get(o.id) ?? 0) + (floating ? (o.vx + o.vy) * dt * 0.006 : o.y > 0 ? o.vx * dt * 0.02 : 0);
    this.objSpin.set(o.id, spin);
    const cx = o.x, cy = o.y + o.h / 2;
    const c = Math.cos(spin), s = Math.sin(spin);
    const pt = (x: number, y: number) => [cx + x * c - y * s, cy + x * s + y * c];
    const hw = o.w / 2, hh = o.h / 2;
    const danger = o.owner >= 0 && Math.abs(o.vx) + Math.abs(o.vy) > 400;
    if (floating) {
      // Space Station debris drifting in zero-g
      const rim = danger ? colors[o.owner] : 0x7fd7ff;
      if (o.kind === 'crate') {
        b.poly([pt(-hw, -hh), pt(hw, -hh), pt(hw, hh), pt(-hw, hh)].flat()).fill(0x3a4656).stroke({ width: 3, color: rim });
        b.poly([pt(-hw, -hh * 0.2), pt(hw, -hh * 0.2), pt(hw, hh * 0.2), pt(-hw, hh * 0.2)].flat()).fill({ color: 0xffcc33, alpha: 0.6 });
        b.poly([pt(-hw * 0.8, -hh * 0.8), pt(hw * 0.8, hh * 0.8)].flat()).stroke({ width: 2, color: 0x5d6b7c });
      } else if (o.kind === 'panel') {
        b.poly([pt(-hw, -hh), pt(hw, -hh), pt(hw, hh), pt(-hw, hh)].flat()).fill(0x52627a).stroke({ width: 3, color: rim });
        for (const fx of [-0.75, 0.75]) for (const fy of [-0.5, 0.5]) { const [x, y] = pt(hw * fx, hh * fy); b.circle(x, y, 3).fill(0xb9c6d6); }
      } else {
        // wrench
        b.poly([pt(-hw * 0.7, -hh * 0.25), pt(hw * 0.6, -hh * 0.25), pt(hw * 0.6, hh * 0.25), pt(-hw * 0.7, hh * 0.25)].flat()).fill(0x9aa6b5).stroke({ width: 2, color: rim });
        const [hx, hy] = pt(hw * 0.78, 0);
        b.circle(hx, hy, hh * 0.9).fill(0x9aa6b5).stroke({ width: 2, color: rim });
        const [mx, my] = pt(hw * 0.95, 0);
        b.circle(mx, my, hh * 0.45).fill(0x0b0e11);
      }
      if (danger) { this.fx.burst(cx, cy, colors[o.owner], 1, 80, { grav: 0, life: 0.25, size: 0.5 }); this.light(cx, cy, colors[o.owner], 1.5, 0.4); }
      else this.light(cx, cy, 0x7fd7ff, 0.9, 0.1);
      return;
    }
    // conductive metal flask: steel body, glass neck, glowing liquid
    const body = [pt(-hw, -hh), pt(hw, -hh), pt(hw * 0.95, hh * 0.1), pt(hw * 0.35, hh * 0.45), pt(hw * 0.35, hh), pt(-hw * 0.35, hh), pt(-hw * 0.35, hh * 0.45), pt(-hw * 0.95, hh * 0.1)].flat();
    const rim = danger ? colors[o.owner] : 0x9fb3c8;
    b.poly(body).fill(0x56616d).stroke({ width: 3, color: rim });
    b.poly([pt(-hw * 0.85, -hh * 0.85), pt(hw * 0.85, -hh * 0.85), pt(hw * 0.85, -hh * 0.2), pt(-hw * 0.85, -hh * 0.2)].flat()).fill({ color: NEON.tesla, alpha: 0.55 });
    b.poly([pt(-hw * 0.6, -hh * 0.9), pt(-hw * 0.4, -hh * 0.9), pt(-hw * 0.4, hh * 0.3), pt(-hw * 0.6, hh * 0.3)].flat()).fill({ color: 0xffffff, alpha: 0.25 });
    if (danger) {
      this.fx.burst(cx, cy, colors[o.owner], 1, 80, { grav: 0, life: 0.25, size: 0.5 });
      this.light(cx, cy, colors[o.owner], 1.5, 0.4);
    } else {
      this.light(cx, cy, NEON.tesla, 0.8, 0.12);
    }
  }

  /** Curzon Hall: a terracotta flower pot with marigolds. */
  private drawPot(b: Graphics, o: ObjectView, colors: number[], dt: number) {
    const spin = (this.objSpin.get(o.id) ?? 0) + (o.y > 0 ? o.vx * dt * 0.02 : 0);
    this.objSpin.set(o.id, spin);
    const cx = o.x, cy = o.y + o.h / 2, c = Math.cos(spin), sn = Math.sin(spin);
    const pt = (x: number, y: number) => [cx + x * c - y * sn, cy + x * sn + y * c];
    const hw = o.w / 2, hh = o.h / 2;
    const danger = o.owner >= 0 && Math.abs(o.vx) + Math.abs(o.vy) > 400;
    b.poly([pt(-hw * 0.7, -hh), pt(hw * 0.7, -hh), pt(hw, hh * 0.55), pt(-hw, hh * 0.55)].flat()).fill(0xb5653a).stroke({ width: 3, color: danger ? colors[o.owner] : 0xe0a070 });
    b.poly([pt(-hw * 1.05, hh * 0.55), pt(hw * 1.05, hh * 0.55), pt(hw * 1.05, hh * 0.8), pt(-hw * 1.05, hh * 0.8)].flat()).fill(0xc9784a);
    for (const fx of [-0.45, 0, 0.45]) {
      const [x, y] = pt(hw * fx, hh * 1.15);
      b.circle(x, y, 7).fill(0xffa21f).circle(x, y, 3).fill(0xd2551a);
    }
    if (danger) this.fx.burst(cx, cy, colors[o.owner], 1, 80, { grav: 0, life: 0.25, size: 0.5 });
  }

  /** Black Hole Edge: an asteroid fragment, stretched toward the hole when it gets close (tidal forces). */
  private drawRock(b: Graphics, o: ObjectView, colors: number[], dt: number) {
    const spin = (this.objSpin.get(o.id) ?? 0) + (o.vx - o.vy) * dt * 0.004;
    this.objSpin.set(o.id, spin);
    const cx = o.x, cy = o.y + o.h / 2;
    const dx = 800 - cx, dy = 430 - cy, d = Math.hypot(dx, dy); // the Black Hole Edge well
    const stretch = 1 + Math.max(0, (220 - d) / 220) * 0.8;
    const ta = Math.atan2(dy, dx);
    const danger = o.owner >= 0 && Math.abs(o.vx) + Math.abs(o.vy) > 400;
    const pts: number[] = [];
    for (let i = 0; i < 9; i++) {
      const a = spin + i * (Math.PI * 2 / 9);
      const rad = (o.w / 2) * (0.75 + 0.25 * Math.sin(i * 7.7 + o.id));
      let x = Math.cos(a) * rad, y = Math.sin(a) * rad * (o.h / o.w);
      const along = x * Math.cos(ta) + y * Math.sin(ta), across = -x * Math.sin(ta) + y * Math.cos(ta);
      x = along * stretch * Math.cos(ta) - across / stretch * Math.sin(ta);
      y = along * stretch * Math.sin(ta) + across / stretch * Math.cos(ta);
      pts.push(cx + x, cy + y);
    }
    b.poly(pts).fill(0x4a4038).stroke({ width: 3, color: danger ? colors[o.owner] : 0xff9a40 });
    b.circle(cx + Math.cos(spin) * o.w * 0.15, cy + Math.sin(spin) * o.h * 0.15, o.w * 0.1).fill(0x2f2924);
    if (danger) this.fx.burst(cx, cy, colors[o.owner], 1, 80, { grav: 0, life: 0.25, size: 0.5 });
    this.light(cx, cy, danger ? colors[o.owner] : 0xff9a40, 1, danger ? 0.4 : 0.12);
  }

  // ----------------------------------------------------------------------- status

  private drawStatus(f: Graphics, v: FighterView, def: FighterDefinition, color: number) {
    const H = def.body.height;
    const cy = v.y + H / 2;
    if (v.reflect > 0) {
      // Third Law: rotating golden hexagonal shield
      const r = H * 0.62, rot = this.time * 1.5;
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; pts.push(v.x + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r); }
      const fade = Math.min(1, v.reflect / 30);
      f.poly(pts).fill({ color: NEON.newton, alpha: 0.08 * fade }).stroke({ width: 4, color: NEON.newton, alpha: 0.8 * fade });
      this.light(v.x, cy, NEON.newton, 3.5, 0.35 * fade);
    }
    if (v.flip > 0) {
      // inverted gravity: arrows pointing UP around the victim
      for (let i = 0; i < 4; i++) {
        const ax = v.x + (i - 1.5) * 34, ay = v.y - 10 + ((this.time * 120 + i * 40) % 120);
        f.moveTo(ax - 9, ay).lineTo(ax, ay + 14).lineTo(ax + 9, ay).stroke({ width: 3, color: NEON.newton, alpha: 0.7 });
      }
      this.light(v.x, cy, 0xb57bff, 2.5, 0.25);
    }
    if (v.action === 'HITSTUN' && v.stun > 40) {
      // dazed (glow trap): orbiting radium sparks
      for (let i = 0; i < 3; i++) {
        const a = this.time * 6 + i * 2.1;
        f.circle(v.x + Math.cos(a) * 34, v.y + H + 14 + Math.sin(a) * 8, 5).fill({ color: NEON.curie, alpha: 0.9 });
      }
    }
    if (v.cage > 0) {
      // Faraday Cage: a copper wire-mesh dome
      const fade = Math.min(1, v.cage / 20), rx = H * 0.45, ry = H * 0.62;
      for (let i = -3; i <= 3; i++) {
        const k = i / 3.5;
        f.moveTo(v.x + rx * k, v.y).quadraticCurveTo(v.x + rx * k * 1.15, cy + ry * 0.9, v.x, v.y + H + 20).stroke({ width: 2, color: COPPER_C, alpha: 0.75 * fade });
      }
      for (let j = 1; j <= 4; j++) f.ellipse(v.x, v.y + (H + 20) * j / 5, rx * Math.sqrt(1 - (j / 5) ** 2) * 1.05, 6).stroke({ width: 2, color: COPPER_C, alpha: 0.6 * fade });
      this.light(v.x, cy, COPPER_C, 3, 0.2 * fade);
    }
    if (v.buoy > 0) {
      // caught in Archimedes' bubble: a big water sphere floating upward
      const wob = Math.sin(this.time * 6) * 0.05;
      f.ellipse(v.x, cy, H * 0.55 * (1 + wob), H * 0.62 * (1 - wob)).fill({ color: 0x5fd7ff, alpha: 0.14 }).stroke({ width: 3, color: 0x9fe8ff, alpha: 0.8 });
      if (Math.random() < 0.4) this.fx.burst(v.x + (Math.random() - 0.5) * H * 0.6, cy - H * 0.3, 0x9fe8ff, 1, 30, { grav: -160, life: 0.8, size: 0.3 });
    }
    if (v.chill > 0) {
      // Condensate Freeze: frost creeping over a body cooled toward absolute zero
      const fade = Math.min(1, v.chill / 20);
      f.roundRect(v.x - H * 0.26, v.y, H * 0.52, H, 18).fill({ color: ICE_C, alpha: 0.12 * fade }).stroke({ width: 2, color: ICE_C, alpha: 0.5 * fade });
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3 + this.time * 0.5, x = v.x + Math.cos(a) * H * 0.22, y = v.y + H * (0.15 + i * 0.17);
        f.moveTo(x - 6, y).lineTo(x + 6, y).moveTo(x - 3, y - 5).lineTo(x + 3, y + 5).moveTo(x + 3, y - 5).lineTo(x - 3, y + 5)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.8 * fade });
      }
      if (Math.random() < 0.2) this.fx.burst(v.x, v.y + H * Math.random(), 0xeaffff, 1, 30, { grav: 40, life: 0.6, size: 0.3 });
    }
    if (v.blind > 0) {
      // dazzled by the Lightbulb Flash: spots in front of the eyes
      const fade = Math.min(1, v.blind / 20), hy = v.y + H * 0.9;
      for (let i = 0; i < 3; i++) {
        const a = this.time * 4 + i * 2.1;
        f.circle(v.x + v.facing * 18 + Math.cos(a) * 16, hy + Math.sin(a) * 8, 5 + i).fill({ color: 0xfff6c8, alpha: 0.7 * fade });
      }
      this.light(v.x, hy, BULB_C, 1.6, 0.3 * fade);
    }
    if (v.scramble > 0) {
      // Uncertainty Principle: left and right are swapped (crossed arrows over the head)
      const y = v.y + H + 34 + Math.sin(this.time * 6) * 4, w = 26;
      const fade = Math.min(1, v.scramble / 20);
      f.moveTo(v.x - w, y - 8).lineTo(v.x + w, y + 8).moveTo(v.x + w - 10, y + 10).lineTo(v.x + w, y + 8).lineTo(v.x + w - 4, y - 2)
        .moveTo(v.x + w, y - 8).lineTo(v.x - w, y + 8).moveTo(v.x - w + 10, y + 10).lineTo(v.x - w, y + 8).lineTo(v.x - w + 4, y - 2)
        .stroke({ width: 4, color: MAGENTA_C, alpha: 0.85 * fade, cap: 'round', join: 'round' });
    }
    if (v.action === 'ATTACK' && v.move === 'ultimate') this.light(v.x, cy, color, 5, 0.35);
  }

  clear() {
    this.seen.clear();
    this.blasted.clear();
    this.trails.clear();
  }
}
