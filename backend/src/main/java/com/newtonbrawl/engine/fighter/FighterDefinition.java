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
 * @param projectileEvade percent chance (0–100) that a projectile passes straight through this fighter
 *                        (rolled once per projectile); null = 0. Heisenberg: you can't pin down where he is.
 */
public record FighterDefinition(
    String id,
    String name,
    String title,
    FighterClass fighterClass,
    String color,
    double mass,
    int maxHealth,
    double walkSpeed,
    double jumpVelocity,
    double airAcceleration,
    Body body,
    Map<String, MoveDefinition> moves,
    Integer projectileEvade) {

    public FighterDefinition {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(body, "body");
        if (mass <= 0) throw new IllegalArgumentException(id + ": mass must be positive");
        if (maxHealth <= 0) throw new IllegalArgumentException(id + ": maxHealth must be positive");
        moves = moves == null ? Map.of() : Map.copyOf(moves);
    }

    public FighterDefinition(String id, String name, String title, FighterClass fighterClass, String color, double mass,
                             int maxHealth, double walkSpeed, double jumpVelocity, double airAcceleration, Body body,
                             Map<String, MoveDefinition> moves) {
        this(id, name, title, fighterClass, color, mass, maxHealth, walkSpeed, jumpVelocity, airAcceleration, body, moves, null);
    }

    /** {@link #projectileEvade()} with null as 0. */
    public int evade() {
        return projectileEvade == null ? 0 : projectileEvade;
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
     * <p>For SPECIAL/ULTIMATE moves the fighter's {@link Fighter#onTrigger} runs on the first active
     * frame; damage/hitstun/hitstop/impulse then describe whatever it spawns (projectile, zone…),
     * and {@code params} holds move-specific tuning (speeds, sizes, durations) so balance stays in JSON.
     *
     * @param hitbox   melee hitbox, or null for moves that only spawn things
     * @param hitstun  ticks the defender can't act after being hit
     * @param hitstop  ticks the whole world freezes on impact (game "juice", applied server-side)
     * @param equation the real law behind the move, flashed on screen when it lands
     * @param cooldown ticks before a special can be used again
     */
    public record MoveDefinition(
        String name,
        MoveKind kind,
        String equation,
        int startup,
        int active,
        int recovery,
        int cooldown,
        int damage,
        int hitstun,
        int hitstop,
        Box hitbox,
        Impulse impulse,
        Map<String, Double> params) {

        public MoveDefinition {
            if (startup < 0 || active <= 0 || recovery < 0) {
                throw new IllegalArgumentException("invalid frame data");
            }
            kind = kind == null ? MoveKind.NORMAL : kind;
            if (kind != MoveKind.NORMAL && startup < 1) {
                throw new IllegalArgumentException("special moves need startup >= 1 (their trigger frame)");
            }
            impulse = impulse == null ? new Impulse(0, 0) : impulse;
            params = params == null ? Map.of() : Map.copyOf(params);
        }

        /** A tuning parameter from JSON, or the given default. */
        public double param(String key, double fallback) {
            Double v = params.get(key);
            return v == null ? fallback : v;
        }

        public int totalFrames() {
            return startup + active + recovery;
        }

        public boolean isActiveOn(int frame) {
            return frame >= startup && frame < startup + active;
        }
    }
}
