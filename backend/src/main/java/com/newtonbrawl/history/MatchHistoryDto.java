package com.newtonbrawl.history;

import java.time.Instant;

/** One row of a player's match history, from that player's point of view. */
public record MatchHistoryDto(long id, MatchMode mode, Instant playedAt, String fighter, String opponentFighter,
                              long opponentId, String opponentName, String result, int rounds, int opponentRounds,
                              int eloBefore, int eloAfter, String reason) {}
