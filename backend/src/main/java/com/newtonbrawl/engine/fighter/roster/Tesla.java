package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Nikola Tesla — Zoner.
 * <ul>
 *   <li>Chain Lightning: a bolt that arcs through metal objects toward the opponent, +25% per jump.</li>
 *   <li>Magnetic Pull: drags the opponent and every metal beaker toward Tesla (F = q·v×B).</li>
 *   <li>ULTIMATE Tesla Coil: an arena-wide electric field that strikes the opponent repeatedly.</li>
 * </ul>
 */
public final class Tesla extends Fighter {
    public static final String ID = "tesla";

    public Tesla(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Projectile bolt = projectile(world, self, "bolt", moveId, m);
                bolt.x = self.x() + self.facing() * m.param("offset", 60);
                bolt.y = m.param("height", 125);
                bolt.w = m.param("w", 54);
                bolt.h = m.param("h", 22);
                bolt.vx = self.facing() * m.param("speed", 1400);
                bolt.life = (int) m.param("life", 70);
                bolt.electric = true;
                bolt.maxChains = (int) m.param("maxChains", 3);
                world.spawn(bolt);
            }
            case "special2" -> {
                Zone pull = zone(world, self, Zone.PULL, moveId, m);
                pull.x = self.x();
                pull.y = 200;
                pull.w = m.param("range", 1300);
                pull.h = 400;
                pull.life = (int) m.param("life", 40);
                pull.strength = m.param("strength", 380);
                world.spawn(pull);
            }
            case "ultimate" -> {
                Zone field = zone(world, self, Zone.FIELD, moveId, m);
                field.x = world.arena().width() / 2;
                field.y = world.arena().height() / 2;
                field.w = world.arena().width();
                field.h = world.arena().height();
                field.life = (int) m.param("life", 200);
                field.interval = (int) m.param("interval", 20);
                field.electric = true;
                world.spawn(field);
            }
            default -> { }
        }
    }
}
