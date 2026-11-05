import { AnimatedSprite, Assets, Container, Graphics, type Spritesheet, type Texture } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { FighterDefinition, FighterView } from '../../protocol';
import { drawCharacter } from './draw';
import { lookFor, type Look } from './looks';
import { computePose, newRigState, type Pose, type RigState } from './rig';

/**
 * Anything that can draw a fighter. The renderer only talks to this interface, so procedural
 * art and real spritesheet/Spine art are interchangeable per fighter without touching gameplay
 * or netcode.
 */
export interface FighterVisual {
  readonly root: Container;
  update(v: FighterView, dt: number): void;
  /** Brief white flash when hit. */
  flash(): void;
  /** Last pose (hand positions etc.) for effects anchoring; null for sprite art. */
  readonly pose: Pose | null;
  /** Neon outline on/off (off at low graphics quality: it's an extra pass per fighter). */
  setGlow?(on: boolean): void;
  destroy(): void;
}

/**
 * Procedural scientist: rigged vector caricature in the Neon Chalkboard style.
 * Drawn in character space (x forward, y down) inside `body`, which is flipped to face left and
 * rotated for the KO fall.
 */
export class ProceduralFighterVisual implements FighterVisual {
  readonly root = new Container();
  private readonly body = new Container();
  private readonly g = new Graphics();
  private readonly glow: GlowFilter;
  private readonly rig: RigState = newRigState();
  private readonly look: Look;
  private flashT = 0;
  pose: Pose | null = null;

  constructor(private readonly def: FighterDefinition, skin?: string | null) {
    this.look = lookFor(def.id, skin);
    this.glow = new GlowFilter({ color: this.look.glow, distance: 14, outerStrength: 1.6, innerStrength: 0, quality: 0.2 });
    this.body.addChild(this.g);
    this.root.addChild(this.body);
    this.root.filters = [this.glow];
  }

  flash() { this.flashT = 0.12; }

  setGlow(on: boolean) { this.root.filters = on ? [this.glow] : null; }

  update(v: FighterView, dt: number) {
    this.flashT = Math.max(0, this.flashT - dt);
    const pose = computePose(v, this.def, this.look, this.rig, dt);
    this.pose = pose;
    this.root.position.set(v.x, v.y);
    // World space is y-up; character space is y-down and faces +x.
    this.body.scale.set(v.facing, -1);
    this.body.rotation = pose.bodyRot * v.facing * -1;
    this.g.clear();
    drawCharacter(this.g, pose, this.look, this.def.body.height, this.rig.time);

    const hit = this.flashT > 0 || v.action === 'HITSTUN' && this.rig.time % 0.12 < 0.06;
    this.glow.color = hit ? 0xffffff : this.look.glow;
    this.glow.outerStrength = hit ? 3.5 : 1.6 + pose.power * 2.2;
    this.root.alpha = v.invuln > 0 ? 0.55 : 1;
  }

  destroy() { this.root.destroy({ children: true }); }
}

/**
 * Spritesheet-driven art (drop-in replacement for the procedural visuals).
 *
 * To add real art for a fighter, put a TexturePacker/Aseprite JSON spritesheet in
 * `public/fighters/<id>/sheet.json` whose animation names match the actions
 * (IDLE, WALK, CROUCH, AIRBORNE, HITSTUN, KO, and per-move ones like `light`, `special1`), then add
 * the id to {@link ART_MANIFESTS}. Frames should be drawn facing right with the feet at the anchor.
 */
export interface ArtManifest { sheet: string; anchor: [number, number]; scale: number; fps: number }

export const ART_MANIFESTS: Record<string, ArtManifest> = {
  // e.g. newton: { sheet: '/fighters/newton/sheet.json', anchor: [0.5, 1], scale: 1, fps: 12 },
};

export class SpriteFighterVisual implements FighterVisual {
  readonly root = new Container();
  readonly pose = null;
  private sprite: AnimatedSprite | null = null;
  private sheet: Spritesheet | null = null;
  private current = '';
  private flashT = 0;

  constructor(private readonly manifest: ArtManifest, private readonly fallback: FighterVisual) {
    this.root.addChild(fallback.root);
    void Assets.load<Spritesheet>(manifest.sheet).then((sheet) => {
      this.sheet = sheet;
      this.root.removeChild(fallback.root);
    }).catch(() => { /* keep procedural art if the sheet fails to load */ });
  }

  flash() { this.flashT = 0.12; this.fallback.flash(); }

  update(v: FighterView, dt: number) {
    if (!this.sheet) { this.fallback.update(v, dt); return; }
    this.flashT = Math.max(0, this.flashT - dt);
    const anim = (v.action === 'ATTACK' && v.move && this.sheet.animations[v.move]) ? v.move : v.action;
    const frames: Texture[] | undefined = this.sheet.animations[anim] ?? this.sheet.animations.IDLE;
    if (frames && anim !== this.current) {
      this.current = anim;
      this.sprite?.destroy();
      this.sprite = new AnimatedSprite(frames);
      this.sprite.anchor.set(...this.manifest.anchor);
      this.sprite.animationSpeed = this.manifest.fps / 60;
      this.sprite.loop = v.action !== 'ATTACK' && v.action !== 'KO';
      this.sprite.play();
      this.root.addChild(this.sprite);
    }
    this.root.position.set(v.x, v.y);
    if (this.sprite) {
      this.sprite.scale.set(v.facing * this.manifest.scale, -this.manifest.scale);
      this.sprite.tint = this.flashT > 0 ? 0xffaaaa : 0xffffff;
    }
  }

  destroy() { this.fallback.destroy(); this.root.destroy({ children: true }); }
}

export function createFighterVisual(def: FighterDefinition, skin?: string | null): FighterVisual {
  const procedural = new ProceduralFighterVisual(def, skin);
  const manifest = ART_MANIFESTS[def.id];
  return manifest ? new SpriteFighterVisual(manifest, procedural) : procedural;
}

/** Static pose helper for portraits / character select. */
export function idleView(def: FighterDefinition, overrides: Partial<FighterView> = {}): FighterView {
  return {
    x: 0, y: 0, vx: 0, vy: 0, facing: 1, health: def.maxHealth, energy: 0, action: 'IDLE', move: null,
    moveFrame: 0, grounded: true, stun: 0, connected: false, buffered: 0, bufferAge: 0, flip: 0, reflect: 0,
    invuln: 0, cd1: 0, cd2: 0, timeAcc: 0, objHits: 0, buoy: 0, cage: 0, scramble: 0, chill: 0, blind: 0, last: null, ...overrides,
  };
}
