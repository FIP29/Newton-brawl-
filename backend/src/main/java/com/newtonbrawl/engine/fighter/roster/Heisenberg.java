package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Werner Heisenberg — Speedster.
 * <ul>
 *   <li>Uncertain Position: blinks forward, but nobody (not even him) knows exactly how far:
 *       one of three distances, chosen at random. Arriving on the opponent hits them.</li>
 *   <li>Measurement: a photon that pins down the opponent's position, which leaves their momentum
 *       uncertain: the knockback's direction and strength are random (Δx·Δp ≥ ħ/2).</li>
 *   <li>ULTIMATE Uncertainty Principle: the opponent's left and right swap, and an uncertainty field
 *       may strike them every third of a second (50% chance each time).</li>
 * </ul>
 */
public final class Heisenberg extends Fighter {
    public static final String ID = "heisenberg";

    public Heisenberg(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                double[] distances = {m.param("d1", 170), m.param("d2", 270), m.param("d3", 370)};
                world.teleport(self, self.x() + self.facing() * distances[world.random(3)]);
                self.setInvulnTicks((int) m.param("invuln", 10));
                Zone arrive = zone(world, self, Zone.BURST, moveId, m);
                arrive.x = self.x();
                arrive.y = self.bodyHeight() / 2;
                arrive.w = m.param("w", 150);
                arrive.h = self.bodyHeight();
                arrive.delay = 1;
                arrive.active = 4;
                arrive.life = 7;
                world.spawn(arrive);
            }
            case "special2" -> {
                Projectile photon = projectile(world, self, "photon", moveId, m);
                photon.x = self.x() + self.facing() * m.param("offset", 60);
                photon.y = m.param("height", 120);
                photon.w = 44;
                photon.h = 24;
                photon.vx = self.facing() * m.param("speed", 1400);
                photon.life = (int) m.param("life", 55);
                photon.effect = Projectile.Effect.MEASURE;
                world.spawn(photon);
            }
            case "ultimate" -> {
                opp.setScrambleTicks((int) m.param("scramble", 300));
                Zone field = zone(world, self, Zone.UNCERTAIN, moveId, m);
                field.x = world.arena().width() / 2;
                field.y = world.arena().height() / 2;
                field.w = world.arena().width();
                field.h = world.arena().height();
                field.life = (int) m.param("life", 300);
                field.interval = (int) m.param("interval", 20);
                world.spawn(field);
            }
            default -> { }
        }
    }
}
