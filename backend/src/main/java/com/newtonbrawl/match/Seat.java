package com.newtonbrawl.match;

import org.springframework.web.socket.WebSocketSession;

import java.util.concurrent.ScheduledFuture;

/** A player occupying one side of a room, plus their current connection (if any). */
final class Seat {
    final int slot;
    final long playerId;
    final String username;
    final String displayName;
    final int elo;

    /** Current connection, or null while disconnected. Thread-safe decorator around the raw session. */
    WebSocketSession session;
    /** Picked fighter id, or null while still on character select. */
    String fighter;
    /** Picked skin id ("classic" by default). */
    String skin = "classic";
    /** Pending forfeit while disconnected mid-match. */
    ScheduledFuture<?> forfeitTimer;

    Seat(int slot, long playerId, String username, String displayName, int elo, WebSocketSession session) {
        this.slot = slot;
        this.playerId = playerId;
        this.username = username;
        this.displayName = displayName;
        this.elo = elo;
        this.session = session;
    }

    boolean connected() {
        return session != null && session.isOpen();
    }
}
