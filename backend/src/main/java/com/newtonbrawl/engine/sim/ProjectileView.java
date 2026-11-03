package com.newtonbrawl.engine.sim;

public record ProjectileView(int id, int owner, String kind, String move, double x, double y, double vx, double vy,
                             double w, double h, int damage, int age, int chains, boolean reflected) {}
