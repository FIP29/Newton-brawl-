package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Michael Faraday — Zoner.
 * <ul>
 *   <li>Faraday Cage: a conducting shell; every electric attack fizzles on it (hard counter to Tesla).</li>
 *   <li>Induction Coil: an opponent moving through its field takes induced-current damage; standing
 *       still is safe (ε = −dΦ/dt).</li>
 *   <li>ULTIMATE Dynamo: a spinning magnetic storm that drags the opponent in and shocks them.</li>
 * </ul>
 */
public final class Faraday extends Fighter {
    public static final String ID = "faraday";

    public Faraday(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> self.setCageTicks((int) m.param("cageTicks", 210));
            case "special2" -> {
                world.removeZones(self.slot(), Zone.INDUCTION);
                Zone coil = zone(world, self, Zone.INDUCTION, moveId, m);
                coil.x = self.x() + self.facing() * m.param("offset", 170);
                coil.y = 110;
                coil.w = m.param("w", 240);
                coil.h = m.param("h", 220);
                coil.life = (int) m.param("life", 300);
                coil.strength = m.param("strength", 0.09);
                coil.electric = true;
                world.spawn(coil);
            }
            case "ultimate" -> {
                Zone storm = zone(world, self, Zone.STORM, moveId, m);
                storm.x = self.x();
                storm.y = 200;
                storm.w = m.param("w", 620);
                storm.h = m.param("h", 420);
                storm.life = (int) m.param("life", 210);
                storm.interval = (int) m.param("interval", 18);
                storm.strength = m.param("pull", 240);
                storm.electric = true;
                world.spawn(storm);
            }
            default -> { }
        }
    }
}
