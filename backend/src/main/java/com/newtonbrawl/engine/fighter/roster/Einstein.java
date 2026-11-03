package com.newtonbrawl.engine.fighter.roster;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchWorld;
import com.newtonbrawl.engine.sim.Zone;

/**
 * Albert Einstein — Trickster.
 * <ul>
 *   <li>Light Dash: a near-instant 320-unit blink with brief invulnerability; can pass through the opponent.</li>
 *   <li>Time Dilation Bubble: everything inside (except Einstein) runs at 0.4× speed (Δt′ = γΔt).</li>
 *   <li>ULTIMATE E = mc²: converts his energy into a screen-length beam.</li>
 * </ul>
 */
public final class Einstein extends Fighter {
    public static final String ID = "einstein";

    public Einstein(FighterDefinition def) {
        super(def);
    }

    @Override
    public void onTrigger(MatchWorld world, FighterState self, FighterState opp, String moveId, MoveDefinition m) {
        switch (moveId) {
            case "special1" -> {
                world.teleport(self, self.x() + self.facing() * m.param("distance", 320));
                self.setInvulnTicks((int) m.param("invulnTicks", 12));
            }
            case "special2" -> {
                Zone bubble = zone(world, self, Zone.BUBBLE, moveId, m);
                bubble.x = self.x() + self.facing() * m.param("offset", 230);
                bubble.y = m.param("height", 150);
                bubble.w = m.param("w", 340);
                bubble.h = m.param("h", 320);
                bubble.life = (int) m.param("life", 240);
                bubble.timeScale = m.param("timeScale", 0.4);
                world.spawn(bubble);
            }
            case "ultimate" -> {
                double width = world.arena().width();
                double start = self.x() + self.facing() * 40;
                double end = self.facing() > 0 ? width : 0;
                Zone beam = zone(world, self, Zone.BEAM, moveId, m);
                beam.x = (start + end) / 2;
                beam.y = m.param("height", 125);
                beam.w = Math.abs(end - start);
                beam.h = m.param("h", 120);
                beam.active = (int) m.param("active", 28);
                beam.life = beam.active + 2;
                world.spawn(beam);
            }
            default -> { }
        }
    }
}
