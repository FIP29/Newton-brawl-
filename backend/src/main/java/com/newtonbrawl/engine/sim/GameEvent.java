package com.newtonbrawl.engine.sim;

/**
 * Something that happened on a tick; clients use it for VFX, sound and equation flashes.
 *
 * @param type     HIT, REFLECT (Third Law bounced it back), ULTIMATE (cinematic starts), CAST (special
 *                 triggered), ARC (lightning chained through metal), CLANK (melee hit an object),
 *                 BLOCK (an electric attack fizzled on a Faraday Cage), SHATTER (Breaking Point)
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
}
