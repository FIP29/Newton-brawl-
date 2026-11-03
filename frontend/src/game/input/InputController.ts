import { Btn } from '../protocol';

/**
 * Samples player controls into a button bitmask.
 *   Keyboard (online): WASD to move/jump/crouch, J light, K heavy, L special.
 *   Gamepad (standard mapping): stick or d-pad, A light, B heavy, X special, Y jump.
 * Keys are tracked by `code` (physical position) so non-QWERTY layouts work.
 */
const KEYMAP: Record<string, number> = {
  KeyA: Btn.LEFT, KeyD: Btn.RIGHT, KeyW: Btn.UP, KeyS: Btn.DOWN, Space: Btn.UP,
  KeyJ: Btn.LIGHT, KeyK: Btn.HEAVY, KeyL: Btn.SPECIAL,
};

const STICK_DEADZONE = 0.45;

export class InputController {
  private held = 0;
  /** Keys pressed since the last sample. Ensures a tap shorter than one tick still registers. */
  private latched = 0;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    const bit = KEYMAP[e.code];
    if (bit === undefined) return;
    e.preventDefault(); // stop Space/WASD from scrolling or typing elsewhere
    this.held |= bit;
    if (!e.repeat) this.latched |= bit;
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    const bit = KEYMAP[e.code];
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

  /** Current buttons: keyboard OR any connected gamepad. */
  sample(): number {
    let bits = this.held | this.latched;
    this.latched = 0;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const b = (i: number) => pad.buttons[i]?.pressed ?? false;
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      if (b(14) || ax < -STICK_DEADZONE) bits |= Btn.LEFT;
      if (b(15) || ax > STICK_DEADZONE) bits |= Btn.RIGHT;
      if (b(12) || b(3) || ay < -STICK_DEADZONE * 1.4) bits |= Btn.UP;
      if (b(13) || ay > STICK_DEADZONE * 1.4) bits |= Btn.DOWN;
      if (b(0)) bits |= Btn.LIGHT;
      if (b(1)) bits |= Btn.HEAVY;
      if (b(2)) bits |= Btn.SPECIAL;
    }
    return bits;
  }
}
