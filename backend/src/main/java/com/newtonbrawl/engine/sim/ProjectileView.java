package com.newtonbrawl.engine.sim;

/** @param px pendulum pivot x (0 for other motions) @param py pendulum pivot y */
public record ProjectileView(int id, int owner, String kind, String move, double x, double y, double vx, double vy,
                             double w, double h, int damage, int age, int chains, boolean reflected, double px, double py) {}
