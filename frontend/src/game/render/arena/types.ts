import type { Container } from 'pixi.js';

/** A stage backdrop: parallax layers behind and in front of the fighters, plus additive lights. */
export interface ArenaBackdrop {
  readonly back: Container;
  readonly front: Container;
  readonly lights: Container;
  /** 0..1 extra electrical activity (Tesla Coil ULTIMATE). */
  surge: number;
  /** Where arena-wide lightning strikes come from (world space). */
  readonly coils: { x: number; y: number }[];
  update(dt: number, camX: number): void;
}
