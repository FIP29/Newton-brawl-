package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Satyendra Nath Bose — Trickster.
 * <ul>
 *   <li>Condensate Freeze: a wave of cold. The first hit chills the opponent (they act on only half
 *       the ticks); a second hit while they're still chilled freezes them solid.</li>
 *   <li>Boson Copy: bosons can all share one quantum state, so he takes on the opponent's last
 *       special and casts it himself.</li>
 *   <li>ULTIMATE Bose–Einstein Condensate: near absolute zero every atom falls into the same state.
 *       The arena freezes into one super-atom: the opponent's projectiles vanish, props stop dead,
 *       and the opponent is frozen in place.</li>
 * </ul>
 */
public final class SNBose extends Fighter {
    public static final String ID = "sn-bose";

    public SNBose(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Projectile cold = projectile(world, self, "coldwave", moveId, m);
                cold.x = self.x() + self.facing() * m.param("offset", 70);
                cold.y = m.param("height", 120);
                cold.w = cold.h = m.param("size", 60);
                cold.vx = self.facing() * m.param("speed", 620);
                cold.life = (int) m.param("life", 90);
                cold.effect = Projectile.Effect.CHILL;
                cold.effectTicks = (int) m.param("chillTicks", 180);
                cold.freezeStun = (int) m.param("freezeStun", 75);
                world.spawn(cold);
            }
            case "special2" -> copySpecial(world, self, opp);
            case "ultimate" -> {
                double w = world.arena().width(), h = world.arena().height();
                world.condense(opp.slot(), self.slot(), w / 2, h / 2);
                Zone freeze = zone(world, self, Zone.BURST, moveId, m);
                freeze.x = w / 2;
                freeze.y = h / 2;
                freeze.w = w;
                freeze.h = h;
                freeze.delay = 2;
                freeze.active = 2;
                freeze.life = 6;
                world.spawn(freeze);
            }
            default -> { }
        }
    }
}
