package com.newtonbrawl.ranked;

/**
 * Elo rating maths (pure functions).
 *
 * <p>Expected score of A against B: E = 1 / (1 + 10^((Rb − Ra) / 400)). After a game with actual
 * score S (1 win, ½ draw, 0 loss): R′ = R + K·(S − E). New players use a larger K so they reach
 * their true rating quickly.
 */
public final class Elo {
    private Elo() {}

    public static final int FLOOR = 100;
    public static final int PROVISIONAL_GAMES = 10;
    public static final int K_PROVISIONAL = 40;
    public static final int K_ESTABLISHED = 24;

    public static double expected(int rating, int opponent) {
        return 1.0 / (1.0 + Math.pow(10, (opponent - rating) / 400.0));
    }

    public static int kFactor(int rankedGamesPlayed) {
        return rankedGamesPlayed < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED;
    }

    /** New rating after one game. */
    public static int update(int rating, int opponent, double score, int k) {
        int next = (int) Math.round(rating + k * (score - expected(rating, opponent)));
        return Math.max(FLOOR, next);
    }
}
