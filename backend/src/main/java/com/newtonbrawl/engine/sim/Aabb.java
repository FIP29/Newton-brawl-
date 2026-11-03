package com.newtonbrawl.engine.sim;

/** Axis-aligned bounding box in world units (x, y = bottom-left corner). */
public record Aabb(double x, double y, double w, double h) {

    public static Aabb centered(double cx, double cy, double w, double h) {
        return new Aabb(cx - w / 2, cy - h / 2, w, h);
    }

    public boolean intersects(Aabb o) {
        return x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h;
    }

    /** Centre of the overlap region, used as the visual impact point. Assumes {@link #intersects}. */
    public double[] overlapCenter(Aabb o) {
        double left = Math.max(x, o.x), right = Math.min(x + w, o.x + o.w);
        double bottom = Math.max(y, o.y), top = Math.min(y + h, o.y + o.h);
        return new double[] {(left + right) / 2, (bottom + top) / 2};
    }
}
