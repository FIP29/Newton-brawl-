package com.newtonbrawl.match;

import com.newtonbrawl.common.exception.NotFoundException;
import com.newtonbrawl.config.MatchProperties;
import com.newtonbrawl.engine.EngineConstants;
import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.runtime.MatchListener;
import com.newtonbrawl.engine.runtime.MatchRunner;
import com.newtonbrawl.engine.sim.Arena;
import com.newtonbrawl.engine.sim.MatchResult;
import com.newtonbrawl.engine.sim.MatchRules;
import com.newtonbrawl.engine.sim.MatchSimulation;
import com.newtonbrawl.engine.sim.MatchSnapshot;
import com.newtonbrawl.history.MatchMode;
import com.newtonbrawl.match.dto.RoomDto;
import com.newtonbrawl.unlock.UnlockService;
import com.newtonbrawl.match.protocol.ServerMessages;
import com.newtonbrawl.player.Player;
import com.newtonbrawl.player.PlayerRepository;
import com.newtonbrawl.security.AuthenticatedPlayer;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Owns private rooms and the matches running in them; the bridge between WebSocket sessions and
 * the engine's {@link MatchRunner}.
 *
 * <p>Lifecycle: create (REST) → players connect (WS) → both seated ⇒ match starts → KO/forfeit ⇒
 * result recorded, sessions closed, room removed. A player who drops mid-match has
 * {@link MatchProperties#reconnectGrace()} to reconnect before forfeiting; reconnecting from
 * another tab simply takes over the seat.
 *
 * <p>Concurrency: each {@link Room} is guarded by its own monitor. Network sends happen outside
 * the lock where practical; sessions are wrapped in a thread-safe decorator.
 */
@Service
public class RoomService {

    private static final Logger log = LoggerFactory.getLogger(RoomService.class);

    private record SessionRef(String code, int slot) {}

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, SessionRef> bySession = new ConcurrentHashMap<>();
    private final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "room-timers");
        t.setDaemon(true);
        return t;
    });

    private final RoomCodeGenerator codes;
    private final PlayerRepository players;
    private final FighterCatalog catalog;
    private final MatchResultService results;
    private final MatchMessenger messenger;
    private final MatchProperties props;
    private final UnlockService unlocks;

    public RoomService(RoomCodeGenerator codes, PlayerRepository players, FighterCatalog catalog,
                       MatchResultService results, MatchMessenger messenger, MatchProperties props, UnlockService unlocks) {
        this.unlocks = unlocks;
        this.codes = codes;
        this.players = players;
        this.catalog = catalog;
        this.results = results;
        this.messenger = messenger;
        this.props = props;
    }

    // ------------------------------------------------------------------ REST

    /** A private room: share the code with a friend. */
    public RoomDto create(long ownerId) {
        return toDto(allocate(ownerId, MatchMode.PRIVATE, null));
    }

    /** A room for two matchmade players; only they may join, in the given slots. */
    public String createReserved(MatchMode mode, long p1, long p2) {
        return allocate(p1, mode, new long[] {p1, p2}).code;
    }

    private Room allocate(long ownerId, MatchMode mode, long[] reserved) {
        for (int attempt = 0; attempt < 20; attempt++) {
            Room room = new Room(codes.next(), ownerId, mode, reserved);
            if (rooms.putIfAbsent(room.code, room) == null) {
                log.info("Room {} ({}) created for player {}", room.code, mode, ownerId);
                return room;
            }
        }
        throw new IllegalStateException("Could not allocate a room code");
    }

    public RoomDto get(String code) {
        Room room = rooms.get(normalise(code));
        if (room == null) throw new NotFoundException("Room not found");
        return toDto(room);
    }

    private static RoomDto toDto(Room room) {
        synchronized (room) {
            int count = (room.seats[0] != null ? 1 : 0) + (room.seats[1] != null ? 1 : 0);
            return new RoomDto(room.code, room.status, count, room.mode);
        }
    }

    public static String normalise(String code) {
        return code == null ? "" : code.trim().toUpperCase(java.util.Locale.ROOT);
    }

    // ------------------------------------------------------------- WebSocket

    /** A player's socket connected to {@code /ws/match?room=code}. */
    public void connect(WebSocketSession session, AuthenticatedPlayer who, String code) {
        Room room = rooms.get(normalise(code));
        if (room == null) {
            reject(session, "ROOM_NOT_FOUND", "That room code doesn't exist (or the match is over).");
            return;
        }
        Optional<Player> player = players.findById(who.id());
        if (player.isEmpty()) {
            reject(session, "UNKNOWN_PLAYER", "Player not found.");
            return;
        }

        WebSocketSession replaced = null;
        int slot;
        synchronized (room) {
            if (room.status == RoomStatus.FINISHED) {
                reject(session, "ROOM_NOT_FOUND", "That match is already over.");
                return;
            }
            Seat seat = room.seatOf(who.id());
            if (seat != null) {
                // Same player again: reconnect after a drop, or a second tab taking over.
                replaced = seat.session;
                seat.session = session;
                if (seat.forfeitTimer != null) {
                    seat.forfeitTimer.cancel(false);
                    seat.forfeitTimer = null;
                }
                if (room.runner != null) room.runner.resetInput(seat.slot);
                slot = seat.slot;
            } else if (room.reserved != null && room.reservedSlot(who.id()) < 0) {
                reject(session, "ROOM_RESERVED", "This match was arranged for two other players.");
                return;
            } else if (room.full()) {
                reject(session, "ROOM_FULL", "This room already has two scientists.");
                return;
            } else {
                Player p = player.get();
                slot = room.reserved != null ? room.reservedSlot(who.id()) : room.freeSlot();
                room.seats[slot] = new Seat(slot, p.getId(), p.getUsername(), p.getDisplayName(), p.getElo(), session);
            }
            bySession.put(session.getId(), new SessionRef(room.code, slot));
            if (replaced != null) bySession.remove(replaced.getId());

            messenger.send(session, new ServerMessages.Welcome(room.code, slot, room.mode, room.players(), roster(),
                unlocks.usable(who.id())));
            broadcast(room, new ServerMessages.Lobby(room.players()));
            if (room.status == RoomStatus.IN_PROGRESS) messenger.send(session, startMessage(room));
        }
        if (replaced != null) messenger.close(replaced, new CloseStatus(4001, "Replaced by a new connection"));
        log.info("Player {} joined room {} as slot {}", who.id(), room.code, slot);
    }

    /**
     * Character select: the match starts once both seated players have picked. Re-picking is allowed
     * until then. Fighters and skins must be unlocked by that player.
     */
    public void pick(WebSocketSession session, String fighterId, String skin) {
        SessionRef ref = bySession.get(session.getId());
        Room room = ref == null ? null : rooms.get(ref.code);
        if (room == null || fighterId == null) return;
        Seat seat;
        synchronized (room) { seat = room.seats[ref.slot]; }
        if (seat == null || !unlocks.canUse(seat.playerId, fighterId, skin)) {
            messenger.send(session, new ServerMessages.Error("LOCKED", "You haven't unlocked that yet."));
            return;
        }
        synchronized (room) {
            if (room.status != RoomStatus.WAITING || room.seats[ref.slot] == null) return;
            room.seats[ref.slot].fighter = fighterId;
            room.seats[ref.slot].skin = skin == null || skin.isBlank() ? UnlockService.CLASSIC_SKIN : skin;
            broadcast(room, new ServerMessages.Lobby(room.players()));
            if (room.everyonePicked()) startMatch(room);
        }
    }

    /** Every implemented, selectable fighter (locked ones are shown greyed out on the client). */
    private List<com.newtonbrawl.engine.fighter.FighterDefinition> roster() {
        List<com.newtonbrawl.engine.fighter.FighterDefinition> list = new ArrayList<>();
        for (var d : catalog.all()) if (!"prototype".equals(d.id())) list.add(d);
        return list;
    }

    /** Client input packet. Lock-free: goes straight into the runner's queue. */
    public void input(WebSocketSession session, long seq, int bits) {
        SessionRef ref = bySession.get(session.getId());
        if (ref == null) return;
        Room room = rooms.get(ref.code);
        MatchRunner runner = room == null ? null : room.runner;
        if (runner != null) runner.submitInput(ref.slot, seq, bits);
    }

    public void ping(WebSocketSession session, double clientTime) {
        SessionRef ref = bySession.get(session.getId());
        Room room = ref == null ? null : rooms.get(ref.code);
        messenger.send(session, new ServerMessages.Pong(clientTime, room == null ? 0 : room.lastTick));
    }

    public void disconnect(WebSocketSession session) {
        SessionRef ref = bySession.remove(session.getId());
        if (ref == null) return;
        Room room = rooms.get(ref.code);
        if (room == null) return;
        synchronized (room) {
            Seat seat = room.seats[ref.slot];
            if (seat == null || seat.session == null || !seat.session.getId().equals(session.getId())) return;
            seat.session = null;
            switch (room.status) {
                case WAITING -> room.seats[ref.slot] = null; // free the seat; room lives until TTL
                case IN_PROGRESS -> {
                    MatchRunner runner = room.runner;
                    runner.resetInput(ref.slot); // release all buttons
                    long graceMs = props.reconnectGrace().toMillis();
                    seat.forfeitTimer = timers.schedule(() -> runner.forfeit(ref.slot), graceMs, TimeUnit.MILLISECONDS);
                    log.info("Room {}: slot {} disconnected, forfeit in {} ms", room.code, ref.slot, graceMs);
                }
                case FINISHED -> { }
            }
            broadcast(room, new ServerMessages.Lobby(room.players()));
        }
    }

    // ----------------------------------------------------------------- match

    /** Caller holds the room lock. */
    private void startMatch(Room room) {
        Fighter p1 = catalog.create(room.seats[0].fighter);
        Fighter p2 = catalog.create(room.seats[1].fighter);
        MatchSimulation sim = new MatchSimulation(Arena.THE_LAB, p1, p2, rules());
        room.fighterIds = List.of(p1.id(), p2.id());
        room.stats = new MatchStats(p1.definition(), p2.definition());
        room.runner = new MatchRunner(room.code, sim, new RoomMatchListener(room));
        room.status = RoomStatus.IN_PROGRESS;
        broadcast(room, startMessage(room));
        room.runner.start();
        log.info("Room {}: match started", room.code);
    }

    private MatchRules rules() {
        return MatchRules.STANDARD.withCountdown(props.countdownTicks())
            .withRoundTime(props.roundSeconds() * EngineConstants.TICK_RATE);
    }

    private ServerMessages.Start startMessage(Room room) {
        Arena a = Arena.THE_LAB;
        MatchRules r = rules();
        return new ServerMessages.Start(room.code, room.mode, EngineConstants.TICK_RATE,
            new ServerMessages.RulesInfo(r.countdownTicks(), r.roundTimeTicks(), r.roundsToWin(), r.maxRounds(), r.roundEndTicks()),
            new ServerMessages.ArenaInfo(a.id(), a.width(), a.height(), a.gravity(), a.objectSpawns()), room.players(),
            room.fighterIds.stream().map(catalog::definition).toList());
    }

    /** Receives engine callbacks on the match thread. */
    private final class RoomMatchListener implements MatchListener {
        private final Room room;

        RoomMatchListener(Room room) {
            this.room = room;
        }

        @Override
        public void onTick(MatchSnapshot s, long[] ack) {
            room.lastTick = s.tick();
            if (!s.events().isEmpty()) room.stats.onEvents(s.events());
            TextMessage msg = messenger.encode(new ServerMessages.State(s, ack));
            for (WebSocketSession session : sessions(room)) messenger.send(session, msg);
        }

        @Override
        public void onMatchEnd(MatchResult result) {
            Seat[] seats;
            synchronized (room) {
                room.status = RoomStatus.FINISHED;
                for (Seat seat : room.seats) {
                    if (seat != null && seat.forfeitTimer != null) seat.forfeitTimer.cancel(false);
                }
                seats = room.seats.clone();
                rooms.remove(room.code);
            }
            // Persist outside the room lock: Elo, history, Codex, unlocks, Lab Note.
            MatchReward[] rewards = {null, null};
            if (result.reason() != MatchResult.Reason.ABORTED && seats[0] != null && seats[1] != null) {
                try {
                    rewards = results.record(new MatchResultService.Summary(room.mode,
                        new long[] {seats[0].playerId, seats[1].playerId}, result, room.stats));
                } catch (RuntimeException e) {
                    log.error("Room {}: failed to record result", room.code, e);
                }
            }
            for (Seat seat : seats) {
                if (seat == null || seat.session == null) continue;
                messenger.send(seat.session, new ServerMessages.End(result, rewards[seat.slot]));
                bySession.remove(seat.session.getId());
                messenger.close(seat.session, CloseStatus.NORMAL.withReason("Match over"));
            }
            log.info("Room {}: {} match ended {}", room.code, room.mode, result);
        }
    }

    // --------------------------------------------------------------- helpers

    private List<WebSocketSession> sessions(Room room) {
        List<WebSocketSession> list = new ArrayList<>(2);
        synchronized (room) {
            for (Seat s : room.seats) if (s != null && s.session != null) list.add(s.session);
        }
        return list;
    }

    private void broadcast(Room room, Object message) {
        TextMessage msg = messenger.encode(message);
        for (WebSocketSession s : sessions(room)) messenger.send(s, msg);
    }

    private void reject(WebSocketSession session, String code, String message) {
        messenger.send(session, new ServerMessages.Error(code, message));
        messenger.close(session, CloseStatus.POLICY_VIOLATION.withReason(code));
    }

    /** Matchmade players have this long to connect and pick before the room is cancelled. */
    static final java.time.Duration RESERVED_ROOM_TIMEOUT = java.time.Duration.ofSeconds(60);

    /** Expire rooms nobody is using, and matchmade rooms whose opponent never showed up. */
    @Scheduled(fixedDelay = 10_000)
    public void expireIdleRooms() {
        Instant now = Instant.now();
        Instant cutoff = now.minus(props.roomTtl());
        Instant reservedCutoff = now.minus(RESERVED_ROOM_TIMEOUT);
        rooms.values().removeIf(room -> {
            synchronized (room) {
                if (room.status != RoomStatus.WAITING) return false;
                if (room.reserved != null && room.createdAt.isBefore(reservedCutoff)) {
                    for (Seat seat : room.seats) {
                        if (seat != null && seat.session != null) {
                            reject(seat.session, "OPPONENT_NO_SHOW", "Your opponent didn't arrive. Back to the queue!");
                        }
                    }
                    return true;
                }
                return !room.anyoneConnected() && room.createdAt.isBefore(cutoff);
            }
        });
    }

    @PreDestroy
    void shutdown() {
        rooms.values().forEach(r -> { if (r.runner != null) r.runner.abort(); });
        timers.shutdownNow();
    }
}
