package com.newtonbrawl.engine.sim;

public record ZoneView(int id, int owner, String kind, String move, double x, double y, double w, double h,
                       int age, int life, int delay, int active, boolean armed) {}
