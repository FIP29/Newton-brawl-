package com.newtonbrawl.engine.fighter;

import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * A playable fighter: its data definition plus behaviour for mechanics that can't be expressed
 * as frame data. One subclass per scientist; each special/ultimate is a few lines that spawn
 * projectiles or zones, or set status effects, using values from the fighter's JSON.
 *
 * <p>The TypeScript port mirrors every subclass in {@code frontend/src/game/sim/roster.ts}.
 */
public abstract class Fighter {

    private final FighterDefinition definition;

    protected Fighter(FighterDefinition definition) {
        this.definition = definition;
    }

    public FighterDefinition definition() {
        return definition;
    }

    public String id() {
        return definition.id();
    }

    /**
     * Called on the first active frame of a SPECIAL or ULTIMATE move.
     *
     * @param moveId "special1", "special2" or "ultimate"
     */
    public void onTrigger(MatchWorld world, FighterState self, FighterState opponent, String moveId, MoveDefinition move) {
        // default: no special behaviour
    }

    /** A projectile pre-filled from the move's damage/impulse/hitstun/hitstop, travelling in {@code self}'s facing direction. */
    protected static Projectile projectile(MatchWorld world, FighterState self, String kind, String moveId, MoveDefinition m) {
        Projectile p = new Projectile(world.nextId(), self.slot(), kind, moveId);
        p.dir = self.facing();
        p.damage = m.damage();
        p.impulseX = m.impulse().x();
        p.impulseY = m.impulse().y();
        p.hitstun = m.hitstun();
        p.hitstop = m.hitstop();
        return p;
    }

    /** A zone pre-filled from the move's damage/impulse/hitstun/hitstop. */
    protected static Zone zone(MatchWorld world, FighterState self, String kind, String moveId, MoveDefinition m) {
        Zone z = new Zone(world.nextId(), self.slot(), kind, moveId);
        z.dir = self.facing();
        z.damage = m.damage();
        z.impulseX = m.impulse().x();
        z.impulseY = m.impulse().y();
        z.hitstun = m.hitstun();
        z.hitstop = m.hitstop();
        return z;
    }
}
