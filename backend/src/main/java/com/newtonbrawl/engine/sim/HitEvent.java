package com.newtonbrawl.engine.sim;

/** Emitted on the tick a hit connects; clients use it for sparks, shake and sound. */
public record HitEvent(int attacker, int defender, String move, int damage, double x, double y) {}
