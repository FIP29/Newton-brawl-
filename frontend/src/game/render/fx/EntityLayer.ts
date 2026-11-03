import { Container, Graphics, Sprite } from 'pixi.js';
import type { FighterDefinition, FighterView, ObjectView, ProjectileView, ZoneView } from '../../protocol';
import { NEON } from '../../../fx/palette';
import { drawBolt, lightningPoints, type FxSystem, type FxTextures } from './primitives';

const AMBER_C = 0xffa630, BRONZE_C = 0xcd7f32, COPPER_C = 0xe8834a, STEEL_C = 0xc8d2dc;
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
    }
    void colors;
  }

  // ---------------------------------------------------------------------- objects

  private drawObject(b: Graphics, o: ObjectView, colors: number[], dt: number) {
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
    if (v.action === 'ATTACK' && v.move === 'ultimate') this.light(v.x, cy, color, 5, 0.35);
  }

  clear() {
    this.seen.clear();
    this.blasted.clear();
    this.trails.clear();
  }
}
