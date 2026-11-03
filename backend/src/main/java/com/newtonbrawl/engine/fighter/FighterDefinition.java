package com.newtonbrawl.engine.fighter;

import java.util.Map;
import java.util.Objects;

/**
 * Static, data-driven description of a fighter, loaded from {@code resources/fighters/<id>.json}.
 * Balance changes are JSON edits; behaviour that can't be expressed as data goes in the
 * fighter's {@link Fighter} subclass.
 *
 * @param mass            kg-equivalent; knockback received is impulse / mass
 * @param walkSpeed       units/s
 * @param jumpVelocity    initial upward velocity, units/s
 * @param airAcceleration horizontal control while airborne, units/s²
 */
public record FighterDefinition(
    String id,
    String name,
    FighterClass fighterClass,
    String color,
    double mass,
    int maxHealth,
    double walkSpeed,
    double jumpVelocity,
    double airAcceleration,
    Body body,
    Map<String, MoveDefinition> moves) {

    public FighterDefinition {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(body, "body");
        if (mass <= 0) throw new IllegalArgumentException(id + ": mass must be positive");
        if (maxHealth <= 0) throw new IllegalArgumentException(id + ": maxHealth must be positive");
        moves = moves == null ? Map.of() : Map.copyOf(moves);
    }

    public MoveDefinition move(String moveId) {
        return moves.get(moveId);
    }

    /** Body (and default hurtbox) size. Crouching scales the height. */
    public record Body(double width, double height) {}

    /** Axis-aligned box relative to the fighter's feet; x is measured forward (in the facing direction). */
    public record Box(double x, double y, double w, double h) {}

    /**
     * Momentum delivered on hit, in mass·units/s. x is forward relative to the attacker.
     * The defender's velocity becomes impulse / defenderMass (J = m·Δv).
     */
    public record Impulse(double x, double y) {}

    /**
     * Frame data for one move. Timeline (in ticks): startup → active → recovery.
     *
     * @param hitstun ticks the defender can't act after being hit
     * @param hitstop ticks the whole world freezes on impact (game "juice", applied server-side)
     */
    public record MoveDefinition(
        int startup,
        int active,
        int recovery,
        int damage,
        int hitstun,
        int hitstop,
        Box hitbox,
        Impulse impulse) {

        public MoveDefinition {
            if (startup < 0 || active <= 0 || recovery < 0) {
                throw new IllegalArgumentException("invalid frame data");
            }
            Objects.requireNonNull(hitbox, "hitbox");
            impulse = impulse == null ? new Impulse(0, 0) : impulse;
        }

        public int totalFrames() {
            return startup + active + recovery;
        }

        public boolean isActiveOn(int frame) {
            return frame >= startup && frame < startup + active;
        }
    }
}
