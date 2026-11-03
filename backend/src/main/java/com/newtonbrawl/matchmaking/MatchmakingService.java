package com.newtonbrawl.matchmaking;

import com.newtonbrawl.common.exception.NotFoundException;
import com.newtonbrawl.history.MatchMode;
import com.newtonbrawl.match.RoomService;
import com.newtonbrawl.player.Player;
import com.newtonbrawl.player.PlayerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Casual and ranked queues.
 *
 * <p>Players join with a REST call and poll their ticket about once a second. Casual pairs the two
 * longest-waiting players. Ranked only pairs players whose Elo difference fits inside a search
 * window that widens the longer either has waited, so most matches are close but nobody waits
 * forever. When paired, a reserved room is created and both tickets point to its code; the clients
 * then connect to the match socket as for a private room.
 *
 * <p>Tickets whose owner stops polling are dropped (closed tab, lost connection).
 */
@Service
public class MatchmakingService {

    private static final Logger log = LoggerFactory.getLogger(MatchmakingService.class);

    static final int BASE_WINDOW = 100;
    static final int WINDOW_PER_SECOND = 25;
    static final int MAX_WINDOW = 600;
    static final Duration STALE_AFTER = Duration.ofSeconds(10);
    static final Duration MATCHED_TTL = Duration.ofSeconds(60);

    public enum State { SEARCHING, MATCHED, CANCELLED }

    /** Mutable ticket; guarded by the service monitor. */
    static final class Ticket {
        final String id = UUID.randomUUID().toString();
        final long playerId;
        final MatchMode mode;
        final int elo;
        final Instant joinedAt;
        Instant lastSeen;
        State state = State.SEARCHING;
        String roomCode;
        Instant matchedAt;
        long opponentId;

        Ticket(long playerId, MatchMode mode, int elo, Instant now) {
            this.playerId = playerId;
            this.mode = mode;
            this.elo = elo;
            this.joinedAt = now;
            this.lastSeen = now;
        }
    }

    public record TicketStatus(String ticket, MatchMode mode, State state, String roomCode, long waitedSeconds,
                               int eloWindow, int playersSearching) {}

    private final Map<String, Ticket> tickets = new ConcurrentHashMap<>();
    private final PlayerRepository players;
    private final RoomService rooms;
    private Clock clock;

    @Autowired
    public MatchmakingService(PlayerRepository players, RoomService rooms) {
        this(players, rooms, Clock.systemUTC());
    }

    MatchmakingService(PlayerRepository players, RoomService rooms, Clock clock) {
        this.players = players;
        this.rooms = rooms;
        this.clock = clock;
    }

    void setClock(Clock clock) { this.clock = clock; }

    public synchronized TicketStatus join(long playerId, MatchMode mode) {
        if (mode == MatchMode.PRIVATE) throw new IllegalArgumentException("Private matches use room codes");
        Player p = players.findById(playerId).orElseThrow(() -> new NotFoundException("Player not found"));
        // One ticket per player: re-joining replaces the old one.
        tickets.values().removeIf(t -> t.playerId == playerId && t.state == State.SEARCHING);
        Ticket t = new Ticket(playerId, mode, p.getElo(), clock.instant());
        tickets.put(t.id, t);
        log.info("Player {} joined the {} queue (Elo {})", playerId, mode, p.getElo());
        matchAll();
        return status(t);
    }

    public synchronized TicketStatus poll(String ticketId, long playerId) {
        Ticket t = owned(ticketId, playerId);
        t.lastSeen = clock.instant();
        if (t.state == State.SEARCHING) matchAll();
        return status(t);
    }

    public synchronized void cancel(String ticketId, long playerId) {
        Ticket t = owned(ticketId, playerId);
        if (t.state == State.SEARCHING) t.state = State.CANCELLED;
        tickets.remove(t.id);
    }

    /** Background pass: expire stale tickets and keep trying to pair (windows widen over time). */
    @Scheduled(fixedDelay = 500)
    public synchronized void tick() {
        Instant now = clock.instant();
        tickets.values().removeIf(t ->
            (t.state == State.SEARCHING && t.lastSeen.plus(STALE_AFTER).isBefore(now))
                || (t.state == State.MATCHED && t.matchedAt.plus(MATCHED_TTL).isBefore(now)));
        matchAll();
    }

    private void matchAll() {
        for (MatchMode mode : List.of(MatchMode.CASUAL, MatchMode.RANKED)) {
            List<Ticket> waiting = new ArrayList<>(tickets.values().stream()
                .filter(t -> t.mode == mode && t.state == State.SEARCHING)
                .sorted(Comparator.comparing((Ticket t) -> t.joinedAt).thenComparing(t -> t.id))
                .toList());
            while (waiting.size() >= 2) {
                Ticket a = waiting.remove(0);
                Ticket b = null;
                for (Ticket c : waiting) {
                    if (c.playerId != a.playerId && compatible(a, c)) { b = c; break; }
                }
                if (b == null) continue;
                waiting.remove(b);
                pair(a, b);
            }
        }
    }

    private boolean compatible(Ticket a, Ticket b) {
        if (a.mode == MatchMode.CASUAL) return true;
        int window = Math.max(window(a), window(b));
        return Math.abs(a.elo - b.elo) <= window;
    }

    int window(Ticket t) {
        long waited = Duration.between(t.joinedAt, clock.instant()).toSeconds();
        return (int) Math.min(MAX_WINDOW, BASE_WINDOW + WINDOW_PER_SECOND * waited);
    }

    private void pair(Ticket a, Ticket b) {
        String code = rooms.createReserved(a.mode, a.playerId, b.playerId);
        Instant now = clock.instant();
        for (Ticket t : List.of(a, b)) {
            t.state = State.MATCHED;
            t.roomCode = code;
            t.matchedAt = now;
        }
        a.opponentId = b.playerId;
        b.opponentId = a.playerId;
        log.info("{} match: players {} ({}) vs {} ({}) in room {}", a.mode, a.playerId, a.elo, b.playerId, b.elo, code);
    }

    private Ticket owned(String ticketId, long playerId) {
        Ticket t = tickets.get(ticketId);
        if (t == null || t.playerId != playerId) throw new NotFoundException("Ticket not found");
        return t;
    }

    private TicketStatus status(Ticket t) {
        long searching = tickets.values().stream().filter(x -> x.mode == t.mode && x.state == State.SEARCHING).count();
        return new TicketStatus(t.id, t.mode, t.state, t.roomCode, Duration.between(t.joinedAt, clock.instant()).toSeconds(),
            t.mode == MatchMode.RANKED ? window(t) : -1, (int) searching);
    }
}
