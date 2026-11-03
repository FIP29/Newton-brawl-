package com.newtonbrawl.match;

import com.newtonbrawl.engine.runtime.MatchRunner;
import com.newtonbrawl.match.protocol.ServerMessages.PlayerInfo;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * A private room. All mutation happens while holding the room's monitor (see {@link RoomService}).
 */
final class Room {
    final String code;
    final long ownerId;
    final Instant createdAt = Instant.now();

    final Seat[] seats = new Seat[2];
    RoomStatus status = RoomStatus.WAITING;
    MatchRunner runner;
    List<String> fighterIds = List.of();
    /** Latest simulated tick (written by the match thread, read for pongs). */
    volatile long lastTick;

    Room(String code, long ownerId) {
        this.code = code;
        this.ownerId = ownerId;
    }

    Seat seatOf(long playerId) {
        for (Seat s : seats) if (s != null && s.playerId == playerId) return s;
        return null;
    }

    int freeSlot() {
        for (int i = 0; i < seats.length; i++) if (seats[i] == null) return i;
        return -1;
    }

    boolean full() {
        return seats[0] != null && seats[1] != null;
    }

    boolean anyoneConnected() {
        for (Seat s : seats) if (s != null && s.connected()) return true;
        return false;
    }

    List<PlayerInfo> players() {
        List<PlayerInfo> list = new ArrayList<>(2);
        for (Seat s : seats) {
            if (s != null) list.add(new PlayerInfo(s.slot, s.playerId, s.username, s.displayName, s.elo, s.connected()));
        }
        return list;
    }
}
