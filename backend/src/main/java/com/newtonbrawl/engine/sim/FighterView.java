package com.newtonbrawl.engine.sim;

/**
 * Immutable, network-friendly view of one fighter on one tick (positions rounded to 0.1 units).
 *
 * <p>Besides what the renderer needs, it carries the fighter's hidden timers ({@code stun},
 * {@code connected}, {@code buffered}, {@code bufferAge}) so a client can reconstruct the exact
 * state and replay its own unacknowledged inputs on top of it (client-side prediction).
 */
public record FighterView(double x, double y, double vx, double vy, int facing, int health, int energy,
                          Action action, String move, int moveFrame, boolean grounded,
                          int stun, boolean connected, int buffered, int bufferAge) {}
