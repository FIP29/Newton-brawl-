package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.EngineConstants;
import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Projectile;

/**
 * Galileo Galilei — Speedster.
 * <ul>
 *   <li>Pendulum Swing: a bob swings from a pivot under θ'' = −(g/L)θ, so it strikes on the
 *       pendulum's own rhythm, T = 2π√(L/g).</li>
 *   <li>Tower Drop: a heavy cannonball and a light musket ball fall side by side and land together.</li>
 *   <li>ULTIMATE Starry Messenger: Jupiter's four Galilean moons orbit him (T² ∝ r³) and strike.</li>
 * </ul>
 */
public final class Galileo extends Fighter {
    public static final String ID = "galileo";
    private static final String[] MOONS = {"io", "europa", "ganymede", "callisto"};

    public Galileo(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                Projectile bob = projectile(world, self, "pendulum", moveId, m);
                bob.motion = Projectile.Motion.PENDULUM;
                bob.length = m.param("length", 110);
                bob.gOverL = m.param("gravity", 2600) / bob.length;
                bob.pivotX = self.x() + self.facing() * m.param("offset", 70);
                bob.pivotY = m.param("pivotHeight", 290);
                bob.theta = -self.facing() * m.param("amplitude", 1.15); // starts raised behind him
                bob.w = bob.h = m.param("size", 46);
                bob.x = bob.pivotX + bob.length * bob.theta;
                bob.y = bob.pivotY - bob.length * (1 - bob.theta * bob.theta * 0.5);
                bob.life = (int) m.param("life", 78);
                world.spawn(bob);
            }
            case "special2" -> {
                double spread = m.param("spread", 36);
                for (int i = 0; i < 2; i++) {
                    Projectile ball = projectile(world, self, i == 0 ? "cannonball" : "musketball", moveId, m);
                    ball.x = opp.x() + (i == 0 ? -spread : spread);
                    ball.y = m.param("dropHeight", 780);
                    ball.w = ball.h = i == 0 ? m.param("heavySize", 44) : m.param("lightSize", 22);
                    ball.ay = -m.param("gravity", EngineConstants.REAL_G); // same g for both masses
                    ball.life = (int) m.param("life", 240);
                    world.spawn(ball);
                }
            }
            case "ultimate" -> {
                // Offsets and tangential speeds at four fixed phases; ω per moon follows Kepler (T² ∝ r³).
                double[][] start = {{1, 0, 0, 1}, {0, 1, -1, 0}, {-1, 0, 0, -1}, {0, -1, 1, 0}};
                for (int i = 0; i < 4; i++) {
                    double r = m.param("r" + (i + 1), 90 + 35 * i), w = m.param("w" + (i + 1), 4);
                    Projectile moon = projectile(world, self, MOONS[i], moveId, m);
                    moon.motion = Projectile.Motion.ORBIT;
                    moon.anchor = self.slot();
                    moon.k = w * w;
                    moon.ox = start[i][0] * r;
                    moon.oy = start[i][1] * r;
                    moon.ovx = start[i][2] * w * r;
                    moon.ovy = start[i][3] * w * r;
                    moon.x = self.x() + moon.ox;
                    moon.y = self.y() + self.bodyHeight() * 0.55 + moon.oy;
                    moon.w = moon.h = m.param("size", 30);
                    moon.life = (int) m.param("life", 240);
                    world.spawn(moon);
                }
            }
            default -> { }
        }
    }
}
