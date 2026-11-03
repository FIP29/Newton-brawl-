package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Erwin Schrödinger — Trickster.
 * <ul>
 *   <li>Superposition: a second copy of him appears. The first hit he takes "measures" which one was
 *       real: 50% he was the ghost (he appears there, the hit passes through), 50% the ghost vanishes.</li>
 *   <li>Schrödinger's Cat: a sealed box. When it opens the cat is alive (it pounces) or dead
 *       (the poison flask broke: a vapour cloud), with equal probability.</li>
 *   <li>ULTIMATE Particle in a Box: the arena becomes an infinite square well. Standing waves ψ₃ then
 *       ψ₂ flare at their antinodes, where |ψ|² is largest; only the nodes are safe.</li>
 * </ul>
 */
public final class Schrodinger extends Fighter {
    public static final String ID = "schrodinger";

    public Schrodinger(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                world.removeZones(self.slot(), Zone.GHOST);
                double half = self.definition().body().width() / 2;
                Zone ghost = zone(world, self, Zone.GHOST, moveId, m);
                ghost.x = Math.max(half, Math.min(world.arena().width() - half, self.x() + self.facing() * m.param("offset", 260)));
                ghost.y = self.bodyHeight() / 2;
                ghost.w = self.definition().body().width();
                ghost.h = self.bodyHeight();
                ghost.life = (int) m.param("life", 240);
                ghost.arm = (int) m.param("invuln", 24);
                world.spawn(ghost);
            }
            case "special2" -> {
                world.removeZones(self.slot(), Zone.CATBOX);
                Zone box = zone(world, self, Zone.CATBOX, moveId, m);
                box.x = Math.max(40, Math.min(world.arena().width() - 40, self.x() + self.facing() * m.param("offset", 190)));
                box.w = 70;
                box.h = 70;
                box.y = box.h / 2;
                box.delay = (int) m.param("seal", 50);
                box.life = box.delay + 2;
                box.source = m;
                world.spawn(box);
            }
            case "ultimate" -> {
                // Particle in a box of width L: ψₙ ∝ sin(nπx/L) has antinodes at x = L(2k+1)/(2n).
                double width = world.arena().width(), height = world.arena().height();
                int[] modes = {3, 2};
                for (int n : modes) {
                    for (int k = 0; k < n; k++) {
                        Zone wave = zone(world, self, Zone.WAVE, moveId, m);
                        wave.x = width * (2 * k + 1) / (2.0 * n);
                        wave.y = height / 2;
                        wave.w = width / n * m.param("width", 0.6);
                        wave.h = height;
                        wave.delay = (int) m.param(n == 3 ? "delay3" : "delay2", n == 3 ? 16 : 70);
                        wave.active = (int) m.param("active", 7);
                        wave.life = wave.delay + wave.active + 2;
                        wave.strength = n; // the mode number, for drawing
                        world.spawn(wave);
                    }
                }
            }
            default -> { }
        }
    }
}
