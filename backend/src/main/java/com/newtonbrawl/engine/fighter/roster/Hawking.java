package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Stephen Hawking — Zoner, in a hover chair.
 * <ul>
 *   <li>Hawking Radiation: a tiny black hole that evaporates as it flies. A black hole's temperature
 *       is inversely proportional to its mass, so it gets hotter (and hits harder) as it shrinks.</li>
 *   <li>Event Horizon: a black hole that drags the opponent in, bends their projectiles toward it and
 *       swallows any that cross the horizon; its core hurts.</li>
 *   <li>ULTIMATE Supermassive Black Hole: a huge, strong one that finally evaporates in a burst.</li>
 * </ul>
 */
public final class Hawking extends Fighter {
    public static final String ID = "hawking";

    public Hawking(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Projectile hole = projectile(world, self, "minihole", moveId, m);
                hole.x = self.x() + self.facing() * m.param("offset", 70);
                hole.y = m.param("height", 130);
                hole.w = hole.h = hole.size0 = m.param("size", 60);
                hole.minSize = m.param("minSize", 14);
                hole.life = (int) m.param("life", 100);
                hole.shrink = (hole.size0 - hole.minSize) / hole.life;
                hole.vx = self.facing() * m.param("speed", 380);
                world.spawn(hole);
            }
            case "special2" -> {
                world.removeZones(self.slot(), Zone.SINGULARITY);
                Zone hole = singularity(world, self, moveId, m, m.param("size", 340), m.param("size", 340));
                hole.y = m.param("height", 150);
                world.spawn(hole);
            }
            case "ultimate" -> {
                Zone hole = singularity(world, self, moveId, m, m.param("w", 900), m.param("h", 640));
                hole.y = m.param("height", 280);
                world.spawn(hole);
                // Evaporation: when it's gone, all that mass-energy comes out at once.
                Zone burst = zone(world, self, Zone.BURST, moveId, m);
                burst.x = hole.x;
                burst.y = hole.y;
                burst.w = burst.h = m.param("burstSize", 520);
                burst.damage = (int) m.param("burstDamage", 120);
                burst.impulseX = m.param("burstX", 36000);
                burst.impulseY = m.param("burstY", 42000);
                burst.hitstun = 30;
                burst.hitstop = 12;
                burst.delay = hole.life;
                burst.active = 6;
                burst.life = burst.delay + burst.active + 2;
                world.spawn(burst);
            }
            default -> { }
        }
    }

    private static Zone singularity(MatchWorld world, FighterState self, String moveId, MoveDefinition m, double w, double h) {
        Zone hole = zone(world, self, Zone.SINGULARITY, moveId, m);
        double width = world.arena().width();
        hole.x = Math.max(w / 4, Math.min(width - w / 4, self.x() + self.facing() * m.param("offset", 320)));
        hole.w = w;
        hole.h = h;
        hole.strength = m.param("pull", 170);
        hole.core = m.param("core", 42);
        hole.interval = (int) m.param("interval", 30);
        hole.life = (int) m.param("life", 240);
        return hole;
    }
}
