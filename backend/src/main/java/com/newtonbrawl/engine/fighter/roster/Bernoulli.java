package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Daniel Bernoulli — Speedster.
 * <ul>
 *   <li>Lift Jump: fast air over him means low pressure above (P + ½ρv² = constant), so he's lifted
 *       far higher than a normal jump; the updraft at takeoff launches anyone next to him.</li>
 *   <li>Pressure Jet: a narrow, fast jet of air; little damage but a huge shove.</li>
 *   <li>ULTIMATE Hurricane: a vortex whose low-pressure eye drags the opponent in and lifts them.</li>
 * </ul>
 */
public final class Bernoulli extends Fighter {
    public static final String ID = "bernoulli";

    public Bernoulli(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Zone updraft = zone(world, self, Zone.BURST, moveId, m);
                updraft.x = self.x();
                updraft.y = self.bodyHeight() / 2;
                updraft.w = m.param("w", 170);
                updraft.h = self.bodyHeight();
                updraft.delay = 1;
                updraft.active = 5;
                updraft.life = 8;
                world.spawn(updraft);
                self.launch(self.facing() * m.param("drift", 380), m.param("lift", 1650));
            }
            case "special2" -> {
                Projectile jet = projectile(world, self, "jet", moveId, m);
                jet.x = self.x() + self.facing() * m.param("offset", 70);
                jet.y = m.param("height", 110);
                jet.w = 90;
                jet.h = 46;
                jet.vx = self.facing() * m.param("speed", 1100);
                jet.life = (int) m.param("life", 40);
                world.spawn(jet);
            }
            case "ultimate" -> {
                Zone eye = zone(world, self, Zone.VORTEX, moveId, m);
                double w = m.param("w", 560);
                eye.x = Math.max(w / 2, Math.min(world.arena().width() - w / 2, self.x() + self.facing() * m.param("offset", 300)));
                eye.w = w;
                eye.h = m.param("h", 600);
                eye.y = eye.h / 2;
                eye.strength = m.param("pull", 260);
                eye.lift = m.param("lift", 380);
                eye.interval = (int) m.param("interval", 16);
                eye.life = (int) m.param("life", 210);
                world.spawn(eye);
            }
            default -> { }
        }
    }
}
