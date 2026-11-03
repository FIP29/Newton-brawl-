package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Marie Curie — Zoner.
 * <ul>
 *   <li>Radioactive Orb: a slow orb whose damage halves every half-life (N = N₀·½^(t/t½)).</li>
 *   <li>Glow Trap: a glowing radium trap that stuns whoever steps on it (one at a time).</li>
 *   <li>ULTIMATE Chain Reaction: fission blasts that spread outward in both directions.</li>
 * </ul>
 */
public final class Curie extends Fighter {
    public static final String ID = "curie";

    public Curie(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Projectile orb = projectile(world, self, "orb", moveId, m);
                orb.x = self.x() + self.facing() * m.param("offset", 70);
                orb.y = m.param("height", 110);
                orb.w = orb.h = m.param("size", 46);
                orb.vx = self.facing() * m.param("speed", 360);
                orb.life = (int) m.param("life", 220);
                orb.halfLife = (int) m.param("halfLife", 45);
                world.spawn(orb);
            }
            case "special2" -> {
                world.removeZones(self.slot(), Zone.TRAP);
                Zone trap = zone(world, self, Zone.TRAP, moveId, m);
                trap.x = self.x() + self.facing() * m.param("offset", 100);
                trap.y = 10;
                trap.w = m.param("w", 110);
                trap.h = 24;
                trap.arm = (int) m.param("arm", 30);
                trap.life = (int) m.param("life", 480);
                world.spawn(trap);
            }
            case "ultimate" -> {
                // One fission event at the core; each "generation" k spreads 170 units further, 10 ticks later.
                double x0 = self.x() + self.facing() * m.param("offset", 150);
                int generations = (int) m.param("generations", 3);
                double spacing = m.param("spacing", 170);
                int stepTicks = (int) m.param("stepTicks", 10);
                for (int k = -generations; k <= generations; k++) {
                    Zone blast = zone(world, self, Zone.BLAST, moveId, m);
                    blast.x = x0 + k * spacing;
                    blast.y = 130;
                    blast.w = m.param("w", 200);
                    blast.h = m.param("h", 260);
                    blast.delay = Math.abs(k) * stepTicks;
                    blast.active = (int) m.param("active", 10);
                    blast.life = blast.delay + blast.active + 2;
                    world.spawn(blast);
                }
            }
            default -> { }
        }
    }
}
