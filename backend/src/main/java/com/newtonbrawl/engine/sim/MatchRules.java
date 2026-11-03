package com.newtonbrawl.engine.sim;

/**
 * Tunable match format. {@code frontend/src/game/sim/rules.ts} mirrors {@link #STANDARD}.
 *
 * @param countdownTicks  "ROUND n — FIGHT!" intro before each round
 * @param roundTimeTicks  round clock (99 s); when it hits 0 the healthier fighter wins the round
 * @param roundsToWin     best of 3 ⇒ 2
 * @param maxRounds       cap so repeated draw rounds can't go on forever
 * @param roundEndTicks   KO / TIME slow-down before the next round
 */
public record MatchRules(int countdownTicks, int roundTimeTicks, int roundsToWin, int maxRounds, int roundEndTicks) {

    public static final MatchRules STANDARD = new MatchRules(120, 99 * 60, 2, 5, 150);

    public MatchRules {
        if (roundTimeTicks <= 0 || roundsToWin <= 0 || maxRounds < roundsToWin * 2 - 1) {
            throw new IllegalArgumentException("invalid match rules");
        }
        countdownTicks = Math.max(0, countdownTicks);
        roundEndTicks = Math.max(1, roundEndTicks);
    }

    public MatchRules withCountdown(int ticks) {
        return new MatchRules(ticks, roundTimeTicks, roundsToWin, maxRounds, roundEndTicks);
    }

    public MatchRules withRoundTime(int ticks) {
        return new MatchRules(countdownTicks, ticks, roundsToWin, maxRounds, roundEndTicks);
    }
}
