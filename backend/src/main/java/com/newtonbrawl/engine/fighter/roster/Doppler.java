package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Christian Doppler — Bruiser.
 * <ul>
 *   <li>Doppler Shift: a sound wave whose damage follows the observed frequency,
 *       f' = f·(c + v_o)/(c − v_s). Fire it while moving toward the opponent (a jump-in), or catch them
 *       walking into it, and it hits harder; retreating sources and observers hear a lower pitch.</li>
 *   <li>Sonic Boom: he breaks the sound barrier, dashing ahead; the shock cone arrives after he passes.</li>
 *   <li>ULTIMATE Blueshift Barrage: a source moving at 0.6 c emits wavefronts squeezed together,
 *       λ' = λ(1 − v/c), that hit one after another.</li>
 * </ul>
 */
public final class Doppler extends Fighter {
    public static final String ID = "doppler";

    public Doppler(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Projectile wave = projectile(world, self, "soundwave", moveId, m);
                wave.x = self.x() + self.facing() * m.param("offset", 70);
                wave.y = m.param("height", 120);
                wave.w = m.param("w", 50);
                wave.h = m.param("h", 140);
                wave.waveSpeed = m.param("speed", 820);
                wave.vx = self.facing() * wave.waveSpeed;
                wave.vs = self.facing() * self.vx(); // source velocity toward the target
                wave.life = (int) m.param("life", 70);
                wave.effect = Projectile.Effect.DOPPLER;
                world.spawn(wave);
            }
            case "special2" -> {
                double start = self.x();
                world.teleport(self, start + self.facing() * m.param("distance", 320));
                self.setInvulnTicks((int) m.param("invuln", 10));
                Zone boom = zone(world, self, Zone.BOOM, moveId, m);
                boom.x = (start + self.x()) / 2;
                boom.w = Math.abs(self.x() - start) + 80;
                boom.h = self.bodyHeight();
                boom.y = boom.h / 2;
                boom.delay = (int) m.param("delay", 5);
                boom.active = (int) m.param("active", 5);
                boom.life = boom.delay + boom.active + 2;
                world.spawn(boom);
            }
            case "ultimate" -> {
                int waves = (int) m.param("waves", 6);
                double spacing = m.param("lambda", 140) * (1 - m.param("mach", 0.6));
                for (int i = 0; i < waves; i++) {
                    Projectile front = projectile(world, self, "wavefront", moveId, m);
                    front.x = self.x() + self.facing() * (80 + i * spacing);
                    front.y = 120;
                    front.w = 40;
                    front.h = 170;
                    front.vx = self.facing() * m.param("speed", 900);
                    front.life = (int) m.param("life", 80);
                    world.spawn(front);
                }
            }
            default -> { }
        }
    }
}
