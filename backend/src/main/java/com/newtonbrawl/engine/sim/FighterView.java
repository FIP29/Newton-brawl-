package com.newtonbrawl.engine.sim;

/**
 * Immutable, network-friendly view of one fighter on one tick (positions rounded to 0.1 units).
 *
 * <p>Besides what the renderer needs, it carries the fighter's hidden timers so a client can
 * reconstruct the exact state and replay its own unacknowledged inputs (client-side prediction).
 *
 * @param flip    ticks of inverted gravity left (Newton's Gravity Flip)
 * @param reflect ticks of Third Law reflection left
 * @param invuln  ticks of invulnerability left (Light Dash)
 * @param cd1     Special 1 cooldown ticks
 * @param cd2     Special 2 cooldown ticks
 * @param timeAcc time-dilation accumulator (inside a slowing bubble the fighter skips ticks)
 * @param buoy    ticks of helpless buoyant floating left (Archimedes)
 * @param cage    ticks of Faraday Cage left (electric immunity)
 * @param scramble ticks of swapped left/right controls left (Heisenberg)
 * @param chill   ticks of Condensate Freeze slowing left (S.N. Bose)
 * @param blind   ticks of Lightbulb Flash dazzle left (Edison)
 * @param last    last special triggered (for copy moves), or null
 */
public record FighterView(double x, double y, double vx, double vy, int facing, int health, int energy,
                          Action action, String move, int moveFrame, boolean grounded,
                          int stun, boolean connected, int buffered, int bufferAge,
                          int flip, int reflect, int invuln, int cd1, int cd2, double timeAcc, int objHits,
                          int buoy, int cage, int scramble, int chill, int blind, String last) {}
