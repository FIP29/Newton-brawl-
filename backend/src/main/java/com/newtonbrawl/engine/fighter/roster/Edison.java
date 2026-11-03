package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Thomas Edison — Bruiser.
 * <ul>
 *   <li>DC Punch: a steady direct current that keeps hurting at close range. (Direct current lost too
 *       much power in long wires, which is why it lost the War of the Currents to Tesla's AC.)
 *       Electric, so a Faraday cage stops it.</li>
 *   <li>Lightbulb Flash: a dazzling flash; a dazzled opponent can't aim specials or turn to face him.</li>
 *   <li>ULTIMATE Patent: reproduces the opponent's last special for himself, and patents it: they
 *       can't use it again for a while.</li>
 * </ul>
 */
public final class Edison extends Fighter {
    public static final String ID = "edison";

    public Edison(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Zone current = zone(world, self, Zone.CURRENT, moveId, m);
                current.x = self.x() + self.facing() * m.param("offset", 95);
                current.y = m.param("height", 110);
                current.w = m.param("w", 130);
                current.h = m.param("h", 150);
                current.interval = (int) m.param("interval", 8);
                current.life = (int) m.param("life", 36);
                current.electric = true;
                world.spawn(current);
            }
            case "special2" -> {
                Zone flash = zone(world, self, Zone.BURST, moveId, m);
                flash.x = self.x() + self.facing() * m.param("offset", 110);
                flash.y = m.param("height", 140);
                flash.w = m.param("w", 220);
                flash.h = m.param("h", 200);
                flash.delay = 4;
                flash.active = 4;
                flash.life = 10;
                flash.blind = (int) m.param("blind", 150);
                world.spawn(flash);
            }
            case "ultimate" -> {
                String copied = copySpecial(world, self, opp);
                if (copied != null) {
                    opp.lockSpecial(copied.equals("special1") ? 0 : 1, (int) m.param("lock", 300));
                } else {
                    // Nothing to patent yet: a blinding burst of invention instead.
                    Zone burst = zone(world, self, Zone.BURST, moveId, m);
                    burst.x = self.x() + self.facing() * 140;
                    burst.y = 150;
                    burst.w = 320;
                    burst.h = 300;
                    burst.delay = 2;
                    burst.active = 5;
                    burst.life = 9;
                    burst.blind = (int) m.param("blind", 150);
                    world.spawn(burst);
                }
            }
            default -> { }
        }
    }
}
