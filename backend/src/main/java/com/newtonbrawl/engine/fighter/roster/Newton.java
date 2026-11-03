package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.EngineConstants;
import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;

/**
 * Sir Isaac Newton — Bruiser.
 * <ul>
 *   <li>Apple Drop: an apple appears above the opponent and falls with real g = 9.8 m/s² (F = mg).</li>
 *   <li>Gravity Flip: a gravitational wave; on hit the target's gravity inverts for 3 s and they drift up.</li>
 *   <li>ULTIMATE Third Law: for 5 s every hit and projectile is reflected back at its source.</li>
 * </ul>
 */
public final class Newton extends Fighter {
    public static final String ID = "newton";

    public Newton(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Projectile apple = projectile(world, self, "apple", moveId, m);
                apple.x = opp.x();
                apple.y = m.param("dropHeight", 760);
                apple.w = apple.h = m.param("size", 36);
                apple.ay = -m.param("gravity", EngineConstants.REAL_G);
                apple.life = (int) m.param("life", 240);
                world.spawn(apple);
            }
            case "special2" -> {
                Projectile wave = projectile(world, self, "gravity-wave", moveId, m);
                wave.x = self.x() + self.facing() * m.param("offset", 80);
                wave.y = m.param("height", 110);
                wave.w = m.param("w", 60);
                wave.h = m.param("h", 150);
                wave.vx = self.facing() * m.param("speed", 900);
                wave.life = (int) m.param("life", 32);
                wave.effect = Projectile.Effect.GRAVITY_FLIP;
                wave.effectTicks = (int) m.param("flipTicks", 180);
                world.spawn(wave);
            }
            case "ultimate" -> self.setReflectTicks((int) m.param("reflectTicks", 300));
            default -> { }
        }
    }
}
