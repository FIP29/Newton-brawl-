package com.newtonbrawl.engine.input;

/**
 * Input for one fighter for one tick.
 *
 * @param held    buttons currently held down
 * @param pressed buttons that went down this tick (rising edges), used to trigger attacks
 */
public record InputFrame(int held, int pressed) {
    public static final InputFrame NONE = new InputFrame(0, 0);

    public boolean isHeld(int button) {
        return InputBits.has(held, button);
    }

    public boolean wasPressed(int button) {
        return InputBits.has(pressed, button);
    }

    /** -1 for left, +1 for right, 0 for neither/both. */
    public int horizontal() {
        return (isHeld(InputBits.RIGHT) ? 1 : 0) - (isHeld(InputBits.LEFT) ? 1 : 0);
    }
}
