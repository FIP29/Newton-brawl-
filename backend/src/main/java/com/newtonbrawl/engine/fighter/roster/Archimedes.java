package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Archimedes of Syracuse — Bruiser.
 * <ul>
 *   <li>Lever Launch: a modest push on the long arm of a lever becomes a huge launch on the short arm
 *       (F₁·d₁ = F₂·d₂; the move's impulse is multiplied by the lever ratio).</li>
 *   <li>Buoyancy Bubble: a water bubble; whoever it catches floats up helplessly (F_b = ρVg).</li>
 *   <li>ULTIMATE Burning Mirrors: sunlight focused onto one spot after a short aiming delay.</li>
 * </ul>
 */
public final class Archimedes extends Fighter {
    public static final String ID = "archimedes";

    public Archimedes(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Zone lever = zone(world, self, Zone.LEVER, moveId, m);
                double ratio = m.param("ratio", 4);
                lever.impulseX *= ratio;
                lever.impulseY *= ratio;
                lever.x = self.x() + self.facing() * m.param("offset", 150);
                lever.y = 60;
                lever.w = m.param("w", 220);
                lever.h = 120;
                lever.delay = (int) m.param("delay", 6);
                lever.active = (int) m.param("active", 6);
                lever.life = lever.delay + lever.active + 2;
                world.spawn(lever);
            }
            case "special2" -> {
                Projectile bubble = projectile(world, self, "bubble", moveId, m);
                bubble.x = self.x() + self.facing() * m.param("offset", 80);
                bubble.y = m.param("height", 110);
                bubble.w = bubble.h = m.param("size", 60);
                bubble.vx = self.facing() * m.param("speed", 260);
                bubble.life = (int) m.param("life", 160);
                bubble.effect = Projectile.Effect.BUOY;
                bubble.effectTicks = (int) m.param("floatTicks", 150);
                world.spawn(bubble);
            }
            case "ultimate" -> {
                Zone focus = zone(world, self, Zone.FOCUS, moveId, m);
                focus.x = opp.x(); // aimed where the opponent stood: move and it misses
                focus.y = world.arena().height() / 2;
                focus.w = m.param("w", 110);
                focus.h = world.arena().height();
                focus.delay = (int) m.param("delay", 24);
                focus.active = (int) m.param("active", 24);
                focus.life = focus.delay + focus.active + 2;
                world.spawn(focus);
            }
            default -> { }
        }
    }
}
