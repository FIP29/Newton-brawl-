package com.newtonbrawl.matchmaking;

import com.newtonbrawl.history.MatchMode;
import com.newtonbrawl.match.RoomService;
import com.newtonbrawl.player.Player;
import com.newtonbrawl.player.PlayerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MatchmakingServiceTest {

    PlayerRepository players = mock(PlayerRepository.class);
    RoomService rooms = mock(RoomService.class);
    Instant now = Instant.parse("2026-11-03T12:00:00Z");
    MatchmakingService mm;

    @BeforeEach
    void setUp() {
        AtomicInteger n = new AtomicInteger();
        when(rooms.createReserved(any(), anyLong(), anyLong())).thenAnswer(inv -> "ROOM" + n.incrementAndGet());
        mm = new MatchmakingService(players, rooms, Clock.fixed(now, ZoneOffset.UTC));
    }

    private void player(long id, int elo) {
        Player p = new Player("p" + id, "p" + id + "@x.y", "hash", "P" + id);
        ReflectionTestUtils.setField(p, "id", id);
        ReflectionTestUtils.setField(p, "elo", elo);
        when(players.findById(id)).thenReturn(Optional.of(p));
    }

    private void advance(long seconds) {
        now = now.plusSeconds(seconds);
        mm.setClock(Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void casualPairsTheFirstTwoPlayers() {
        player(1, 1000);
        player(2, 1900);
        var a = mm.join(1, MatchMode.CASUAL);
        assertThat(a.state()).isEqualTo(MatchmakingService.State.SEARCHING);
        var b = mm.join(2, MatchMode.CASUAL);
        assertThat(b.state()).isEqualTo(MatchmakingService.State.MATCHED);
        assertThat(mm.poll(a.ticket(), 1).roomCode()).isEqualTo(b.roomCode());
    }

    @Test
    void rankedWaitsForCloseEloThenWidensTheWindow() {
        player(1, 1000);
        player(2, 1300); // 300 apart: outside the starting ±100 window
        var a = mm.join(1, MatchMode.RANKED);
        var b = mm.join(2, MatchMode.RANKED);
        assertThat(b.state()).isEqualTo(MatchmakingService.State.SEARCHING);
        assertThat(b.eloWindow()).isEqualTo(MatchmakingService.BASE_WINDOW);

        advance(5); // window 100 + 25·5 = 225: still too far
        mm.poll(a.ticket(), 1);
        assertThat(mm.poll(b.ticket(), 2).state()).isEqualTo(MatchmakingService.State.SEARCHING);

        advance(4); // window 325 ≥ 300
        mm.tick();
        assertThat(mm.poll(a.ticket(), 1).state()).isEqualTo(MatchmakingService.State.MATCHED);
        assertThat(mm.poll(b.ticket(), 2).roomCode()).isNotNull();
    }

    @Test
    void rankedPrefersTheEarliestCompatibleOpponent() {
        player(1, 1000);
        player(2, 1600);
        player(3, 1050);
        var a = mm.join(1, MatchMode.RANKED);
        mm.join(2, MatchMode.RANKED);
        var c = mm.join(3, MatchMode.RANKED);
        assertThat(c.state()).isEqualTo(MatchmakingService.State.MATCHED);
        assertThat(mm.poll(a.ticket(), 1).roomCode()).isEqualTo(c.roomCode());
    }

    @Test
    void queuesAreSeparateAndRejoiningReplacesTheTicket() {
        player(1, 1000);
        player(2, 1000);
        mm.join(1, MatchMode.CASUAL);
        var b = mm.join(2, MatchMode.RANKED);
        assertThat(b.state()).isEqualTo(MatchmakingService.State.SEARCHING);
        var again = mm.join(2, MatchMode.CASUAL); // switches queue
        assertThat(again.state()).isEqualTo(MatchmakingService.State.MATCHED);
        assertThatThrownBy(() -> mm.poll(b.ticket(), 2)).hasMessageContaining("Ticket not found");
    }

    @Test
    void playersWhoStopPollingAreDropped() {
        player(1, 1000);
        player(2, 1000);
        var a = mm.join(1, MatchMode.CASUAL);
        advance(11);
        mm.tick();
        assertThatThrownBy(() -> mm.poll(a.ticket(), 1)).hasMessageContaining("Ticket not found");
        assertThat(mm.join(2, MatchMode.CASUAL).state()).isEqualTo(MatchmakingService.State.SEARCHING);
    }

    @Test
    void cancelAndForeignTickets() {
        player(1, 1000);
        var a = mm.join(1, MatchMode.CASUAL);
        assertThatThrownBy(() -> mm.poll(a.ticket(), 99)).hasMessageContaining("Ticket not found");
        mm.cancel(a.ticket(), 1);
        assertThatThrownBy(() -> mm.poll(a.ticket(), 1)).hasMessageContaining("Ticket not found");
    }
}
