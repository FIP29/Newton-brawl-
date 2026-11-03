package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Jagadish Chandra Bose — Zoner.
 * <ul>
 *   <li>Microwave Pulse: millimetre radio waves pass through walls, so it leaves one side of the arena
 *       and comes back in the other. It is electromagnetic, so a Faraday cage stops it (that's
 *       exactly how a microwave oven's door keeps the waves in).</li>
 *   <li>Crescograph Vines: a plant grows where he points; plants respond to stimuli, so it grabs the
 *       opponent when they move near it, and drags them toward its root.</li>
 *   <li>ULTIMATE Living Signal: every one of his plants, plus new shoots around the opponent, strikes
 *       at the same instant.</li>
 * </ul>
 */
public final class JCBose extends Fighter {
    public static final String ID = "jc-bose";

    public JCBose(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Projectile wave = projectile(world, self, "microwave", moveId, m);
                wave.x = self.x() + self.facing() * m.param("offset", 70);
                wave.y = m.param("height", 125);
                wave.w = 40;
                wave.h = 90;
                wave.vx = self.facing() * m.param("speed", 900);
                wave.life = (int) m.param("life", 150);
                wave.wraps = (int) m.param("wraps", 1);
                wave.electric = true;
                world.spawn(wave);
            }
            case "special2" -> world.spawn(vine(world, self, moveId, m,
                self.x() + self.facing() * m.param("offset", 230), (int) m.param("grow", 30), 0, (int) m.param("life", 480)));
            case "ultimate" -> {
                int strike = (int) m.param("strike", 24);
                world.syncZones(self.slot(), Zone.VINE, strike);
                double spread = m.param("spread", 170);
                for (int i = -1; i <= 1; i++) {
                    world.spawn(vine(world, self, moveId, m, opp.x() + i * spread, 0, strike, strike + 2));
                }
            }
            default -> { }
        }
    }

    private static Zone vine(MatchWorld world, FighterState self, String moveId, MoveDefinition m, double x, int grow, int strikeAt, int life) {
        Zone vine = zone(world, self, Zone.VINE, moveId, m);
        vine.w = m.param("w", 120);
        vine.h = m.param("h", 130);
        vine.x = Math.max(vine.w / 2, Math.min(world.arena().width() - vine.w / 2, x));
        vine.y = vine.h / 2;
        vine.arm = grow;
        vine.delay = strikeAt;
        vine.life = life;
        return vine;
    }
}
