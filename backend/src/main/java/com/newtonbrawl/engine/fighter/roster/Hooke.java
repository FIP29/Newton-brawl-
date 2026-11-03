package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Robert Hooke — Trickster.
 * <ul>
 *   <li>Spring Trap: a spring anchored where he stands; the farther he walks away, the more it is
 *       stretched and the harder it snaps whoever triggers it (F = −kx).</li>
 *   <li>Elastic Whip: a long-reach lash that yanks the target back toward him (pure frame data).</li>
 *   <li>ULTIMATE Breaking Point: past the elastic limit everything shatters: a huge blast that also
 *       destroys the opponent's projectiles and traps and flings every prop.</li>
 * </ul>
 */
public final class Hooke extends Fighter {
    public static final String ID = "hooke";

    public Hooke(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                world.removeZones(self.slot(), Zone.SPRING);
                Zone spring = zone(world, self, Zone.SPRING, moveId, m);
                spring.x = self.x();
                spring.y = 10;
                spring.w = m.param("w", 100);
                spring.h = 24;
                spring.arm = (int) m.param("arm", 20);
                spring.life = (int) m.param("life", 600);
                spring.springK = m.param("k", 200);
                spring.maxStretch = m.param("maxStretch", 500);
                world.spawn(spring);
            }
            case "ultimate" -> {
                Zone blast = zone(world, self, Zone.BLAST, moveId, m);
                blast.x = self.x();
                blast.y = 200;
                blast.w = m.param("w", 1000);
                blast.h = m.param("h", 420);
                blast.delay = (int) m.param("delay", 14);
                blast.active = (int) m.param("active", 8);
                blast.life = blast.delay + blast.active + 2;
                world.spawn(blast);
                world.shatter(opp.slot(), self.slot(), self.x(), self.y() + self.bodyHeight() / 2, m.param("shatterSpeed", 900));
            }
            default -> { /* special2 (Elastic Whip) is pure frame data */ }
        }
    }
}
