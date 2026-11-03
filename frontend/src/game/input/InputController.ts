import { Btn } from '../protocol';

/** Physical key (`KeyboardEvent.code`) → button. */
export type KeyMap = Record<string, number>;

/** Online: WASD + J/K/L (Space also jumps). */
export const KEYS_ONLINE: KeyMap = {
  KeyA: Btn.LEFT, KeyD: Btn.RIGHT, KeyW: Btn.UP, KeyS: Btn.DOWN, Space: Btn.UP,
  KeyJ: Btn.LIGHT, KeyK: Btn.HEAVY, KeyL: Btn.SPECIAL,
};

/** Local player 1: same as online. */
export const KEYS_LOCAL_P1: KeyMap = { ...KEYS_ONLINE };

/** Local player 2: arrows + numpad 1/2/3 (comma/period/slash for keyboards without a numpad). */
export const KEYS_LOCAL_P2: KeyMap = {
  ArrowLeft: Btn.LEFT, ArrowRight: Btn.RIGHT, ArrowUp: Btn.UP, ArrowDown: Btn.DOWN,
  Numpad1: Btn.LIGHT, Numpad2: Btn.HEAVY, Numpad3: Btn.SPECIAL,
  Comma: Btn.LIGHT, Period: Btn.HEAVY, Slash: Btn.SPECIAL,
};

const STICK_DEADZONE = 0.45;

/**
 * Samples one player's controls into a button bitmask: a keyboard map plus a gamepad
 * (standard mapping: stick/d-pad, A light, B heavy, X special, Y jump).
 *
 * @param gamepad  which gamepad index this player uses, or 'any' to accept every pad (online).
 */
export class InputController {
  private held = 0;
  /** Keys pressed since the last sample, so a tap shorter than one tick still registers. */
  private latched = 0;

  constructor(private readonly keys: KeyMap = KEYS_ONLINE, private readonly gamepad: number | 'any' = 'any') {}

  private readonly onKeyDown = (e: KeyboardEvent) => {
    const bit = this.keys[e.code];
    if (bit === undefined) return;
    e.preventDefault(); // stop Space/arrows from scrolling the page
    this.held |= bit;
    if (!e.repeat) this.latched |= bit;
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    const bit = this.keys[e.code];
    if (bit !== undefined) this.held &= ~bit;
  };

  /** Releasing everything when focus is lost prevents "stuck walking". */
  private readonly onBlur = () => { this.held = 0; this.latched = 0; };

  attach(): this {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    return this;
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.held = 0;
    this.latched = 0;
  }

  sample(): number {
    let bits = this.held | this.latched;
    this.latched = 0;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    pads.forEach((pad, i) => {
      if (!pad || !pad.connected || (this.gamepad !== 'any' && this.gamepad !== i)) return;
      const b = (n: number) => pad.buttons[n]?.pressed ?? false;
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      if (b(14) || ax < -STICK_DEADZONE) bits |= Btn.LEFT;
      if (b(15) || ax > STICK_DEADZONE) bits |= Btn.RIGHT;
      if (b(12) || b(3) || ay < -STICK_DEADZONE * 1.4) bits |= Btn.UP;
      if (b(13) || ay > STICK_DEADZONE * 1.4) bits |= Btn.DOWN;
      if (b(0)) bits |= Btn.LIGHT;
      if (b(1)) bits |= Btn.HEAVY;
      if (b(2)) bits |= Btn.SPECIAL;
    });
    return bits;
  }
}
