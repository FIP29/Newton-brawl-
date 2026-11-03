package com.newtonbrawl.player;

/**
 * Ranked ladder tiers, ordered from lowest to highest. A player's tier is derived from Elo,
 * so it never needs to be stored separately (and can't drift out of sync).
 */
public enum RankTier {
    ATOM("Atom", 0),
    MOLECULE("Molecule", 1100),
    STAR("Star", 1300),
    SUPERNOVA("Supernova", 1500),
    BLACK_HOLE("Black Hole", 1700);

    private final String displayName;
    private final int minElo;

    RankTier(String displayName, int minElo) {
        this.displayName = displayName;
        this.minElo = minElo;
    }

    public String displayName() {
        return displayName;
    }

    public int minElo() {
        return minElo;
    }

    /** Highest tier whose threshold the rating meets. */
    public static RankTier forElo(int elo) {
        RankTier result = ATOM;
        for (RankTier t : values()) {
            if (elo >= t.minElo) result = t;
        }
        return result;
    }
}
