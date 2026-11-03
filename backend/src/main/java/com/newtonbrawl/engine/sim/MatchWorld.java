package com.newtonbrawl.engine.sim;

/** What a {@link com.newtonbrawl.engine.fighter.Fighter} may do to the world when its special triggers. */
public interface MatchWorld {
    Arena arena();

    /** Fresh entity id (deterministic sequence). */
    int nextId();

    void spawn(Projectile p);

    void spawn(Zone z);

    /** Removes the owner's existing zones of a kind (e.g. "only one Glow Trap at a time"). */
    void removeZones(int owner, String kind);

    /** Moves a fighter horizontally, clamped to the arena walls (teleports, dashes). */
    void teleport(FighterState s, double x);
}
