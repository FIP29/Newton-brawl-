package com.newtonbrawl.engine.sim;

/**
 * Something that happened on a tick; clients use it for VFX, sound and equation flashes.
 *
 * @param type     HIT, REFLECT (Third Law bounced it back), ULTIMATE (cinematic starts), CAST (special
 *                 triggered), ARC (lightning chained through metal), CLANK (melee hit an object),
 *                 BLOCK (an electric attack fizzled on a Faraday Cage), SHATTER (Breaking Point),
 *                 COLLAPSE (a superposition resolved: for move special1 {@code damage} = 1 if the
 *                 attack passed through the ghost; for special2 1 = the cat is alive, 0 = dead),
 *                 SWALLOW (something fell into a black hole), PHASE (a projectile passed through
 *                 Heisenberg), FREEZE (chilled again: frozen solid), CONDENSE (Bose–Einstein condensate),
 *                 COPY (a copy move reproduced the opponent's special: {@code move} = the copied special)
 * @param attacker slot that caused it (for REFLECT: the reflecting fighter)
 * @param defender slot affected, or -1
 */
public record GameEvent(String type, int attacker, int defender, String move, int damage, double x, double y) {
    public static final String HIT = "HIT";
    public static final String REFLECT = "REFLECT";
    public static final String ULTIMATE = "ULTIMATE";
    public static final String CAST = "CAST";
    public static final String ARC = "ARC";
    public static final String CLANK = "CLANK";
    public static final String BLOCK = "BLOCK";
    public static final String SHATTER = "SHATTER";
    public static final String COLLAPSE = "COLLAPSE";
    public static final String SWALLOW = "SWALLOW";
    public static final String PHASE = "PHASE";
    public static final String FREEZE = "FREEZE";
    public static final String CONDENSE = "CONDENSE";
    public static final String COPY = "COPY";
}
