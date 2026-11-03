package com.newtonbrawl.engine.sim;

/** Immutable, network-friendly view of one fighter on one tick. Values are rounded to 0.1 units. */
public record FighterView(double x, double y, double vx, double vy, int facing, int health,
                          Action action, String move, int moveFrame, boolean grounded) {}
