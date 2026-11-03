package com.newtonbrawl.progression;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.newtonbrawl.TestData;
import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.sim.GameEvent;
import com.newtonbrawl.engine.sim.MatchResult;
import com.newtonbrawl.history.MatchMode;
import com.newtonbrawl.match.MatchResultService;
import com.newtonbrawl.match.MatchReward;
import com.newtonbrawl.match.MatchStats;
import com.newtonbrawl.unlock.UnlockService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;

/** Ranked queue → match → rewards, and the Codex / unlock / leaderboard / history that follow. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "newton-brawl.match.countdown-ticks=5",
    "newton-brawl.match.reconnect-grace=200ms"
})
@ActiveProfiles("test")
class ProgressionIntegrationTest {

    @LocalServerPort int port;
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired MatchResultService results;
    @Autowired UnlockService unlocks;
    @Autowired FighterCatalog catalog;

    record Login(long id, String token) {}

    final class Client extends TextWebSocketHandler {
        final BlockingQueue<JsonNode> inbox = new LinkedBlockingQueue<>();
        WebSocketSession session;

        @Override
        protected void handleTextMessage(WebSocketSession s, TextMessage m) throws Exception {
            inbox.add(json.readTree(m.getPayload()));
        }

        void send(String payload) throws Exception {
            synchronized (this) { session.sendMessage(new TextMessage(payload)); }
        }

        JsonNode await(Predicate<JsonNode> match) throws InterruptedException {
            long deadline = System.nanoTime() + Duration.ofSeconds(6).toNanos();
            while (System.nanoTime() < deadline) {
                JsonNode n = inbox.poll(50, TimeUnit.MILLISECONDS);
                if (n != null && match.test(n)) return n;
            }
            throw new AssertionError("Timed out");
        }

        JsonNode awaitType(String t) throws InterruptedException {
            return await(n -> t.equals(n.path("t").asText()));
        }
    }

    @BeforeEach
    void clean() {
        TestData.wipe(jdbc);
    }

    private Login register(String name) {
        var res = http.postForEntity("/api/auth/register",
            Map.of("username", name, "email", name + "@lab.test", "password", "password123"), JsonNode.class);
        return new Login(res.getBody().at("/player/id").asLong(), res.getBody().get("token").asText());
    }

    private JsonNode call(HttpMethod method, String path, Login who) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(who.token());
        var res = http.exchange(path, method, new HttpEntity<>(h), JsonNode.class);
        assertThat(res.getStatusCode().is2xxSuccessful()).as(path + " → " + res.getStatusCode()).isTrue();
        return res.getBody();
    }

    private Client connect(Login who, String room) throws Exception {
        Client c = new Client();
        c.session = new StandardWebSocketClient()
            .execute(c, "ws://localhost:" + port + "/ws/match?room=" + room + "&token=" + who.token())
            .get(5, TimeUnit.SECONDS);
        return c;
    }

    @Test
    void rankedMatchUpdatesEloHistoryLeaderboardAndCodex() throws Exception {
        Login ada = register("ada"), max = register("max"), eve = register("eve");

        // Both join the ranked queue and are paired straight away (same Elo).
        JsonNode t1 = call(HttpMethod.POST, "/api/matchmaking/ranked", ada);
        assertThat(t1.get("state").asText()).isEqualTo("SEARCHING");
        JsonNode t2 = call(HttpMethod.POST, "/api/matchmaking/ranked", max);
        assertThat(t2.get("state").asText()).isEqualTo("MATCHED");
        String room = t2.get("roomCode").asText();
        assertThat(call(HttpMethod.GET, "/api/matchmaking/tickets/" + t1.get("ticket").asText(), ada).get("roomCode").asText()).isEqualTo(room);

        // A third player can't gatecrash a matchmade room.
        Client intruder = connect(eve, room);
        assertThat(intruder.awaitType("error").get("code").asText()).isEqualTo("ROOM_RESERVED");

        Client p1 = connect(ada, room), p2 = connect(max, room);
        JsonNode welcome = p1.awaitType("welcome");
        assertThat(welcome.get("mode").asText()).isEqualTo("RANKED");
        assertThat(welcome.at("/usable/newton/0").asText()).isEqualTo("classic");
        p2.awaitType("welcome");

        // Locked skin is refused; classic is fine.
        p1.send("{\"t\":\"pick\",\"f\":\"newton\",\"s\":\"royal-society\"}");
        assertThat(p1.awaitType("error").get("code").asText()).isEqualTo("LOCKED");
        p1.send("{\"t\":\"pick\",\"f\":\"newton\",\"s\":\"classic\"}");
        p2.send("{\"t\":\"pick\",\"f\":\"tesla\"}");
        assertThat(p1.awaitType("start").get("mode").asText()).isEqualTo("RANKED");

        // Max leaves: Ada wins by forfeit and gets a personal reward.
        p2.session.close();
        JsonNode end = p1.awaitType("end");
        JsonNode reward = end.get("reward");
        assertThat(reward.get("eloBefore").asInt()).isEqualTo(1000);
        assertThat(reward.get("eloAfter").asInt()).isEqualTo(1020); // K = 40 provisional, expected 0.5
        assertThat(reward.get("newCodex").findValuesAsText("id")).contains("newton", "tesla");
        assertThat(reward.at("/labNote/fighterId").asText()).isEqualTo("newton");
        assertThat(reward.at("/labNote/text").asText()).isNotBlank();

        Thread.sleep(200);
        // Leaderboard: Ada first with 1020, Max second with 980; Eve (no ranked games) absent.
        JsonNode board = call(HttpMethod.GET, "/api/leaderboard", eve);
        assertThat(board.get("totalPlayers").asInt()).isEqualTo(2);
        assertThat(board.at("/entries/0/username").asText()).isEqualTo("ada");
        assertThat(board.at("/entries/0/elo").asInt()).isEqualTo(1020);
        assertThat(board.at("/entries/1/elo").asInt()).isEqualTo(980);
        assertThat(board.get("me").isNull()).isTrue();
        assertThat(call(HttpMethod.GET, "/api/leaderboard", max).at("/me/rank").asInt()).isEqualTo(2);

        // History and profile.
        JsonNode history = call(HttpMethod.GET, "/api/players/me/matches", ada);
        assertThat(history).hasSize(1);
        assertThat(history.at("/0/result").asText()).isEqualTo("WIN");
        assertThat(history.at("/0/mode").asText()).isEqualTo("RANKED");
        assertThat(history.at("/0/opponentName").asText()).isEqualTo("max");
        JsonNode me = call(HttpMethod.GET, "/api/players/me", ada);
        assertThat(me.get("peakElo").asInt()).isEqualTo(1020);
        assertThat(me.get("rankedGames").asInt()).isEqualTo(1);
        assertThat(call(HttpMethod.GET, "/api/players/me/fighters", ada).at("/0/fighter").asText()).isEqualTo("newton");

        // Codex: the pages met in the match are unlocked (with text); others stay hidden.
        JsonNode codex = call(HttpMethod.GET, "/api/codex", ada);
        JsonNode newton = null, galileo = null;
        for (JsonNode p : codex.get("fighters")) {
            if (p.get("id").asText().equals("newton")) newton = p;
            if (p.get("id").asText().equals("galileo")) galileo = p;
        }
        assertThat(codex.get("totalCount").asInt()).isEqualTo(16 + 12);
        assertThat(newton.get("unlocked").asBoolean()).isTrue();
        assertThat(newton.get("bio").asText()).contains("Principia");
        assertThat(galileo.get("unlocked").asBoolean()).isFalse();
        assertThat(galileo.get("bio").isNull()).isTrue();
        assertThat(galileo.get("available").asBoolean()).isFalse();

        // Unlock progress: Galileo needs 3 matches.
        JsonNode status = call(HttpMethod.GET, "/api/unlocks", ada);
        JsonNode gal = null;
        for (JsonNode u : status) if (u.get("id").asText().equals("fighter.galileo")) gal = u;
        assertThat(gal.get("progress").asInt()).isEqualTo(1);
        assertThat(gal.get("target").asInt()).isEqualTo(3);
        assertThat(gal.get("unlocked").asBoolean()).isFalse();
    }

    @Test
    void specialsLandedUnlockCodexEntriesAndWinsUnlockSkins() {
        Login a = register("hertz"), b = register("ohm");
        var stats = new MatchStats(catalog.definition("newton"), catalog.definition("curie"));
        stats.onEvents(List.of(
            new GameEvent(GameEvent.HIT, 0, 1, "special1", 85, 0, 0),   // Newton's apple lands
            new GameEvent(GameEvent.HIT, 0, 1, "special1", 85, 0, 0),
            new GameEvent(GameEvent.HIT, 1, 0, "special2", 50, 0, 0),   // Curie's trap gets him
            new GameEvent(GameEvent.HIT, 0, 1, "light", 55, 0, 0)));    // normals don't count
        MatchReward[] first = null;
        for (int i = 0; i < 3; i++) {
            MatchReward[] r = results.record(new MatchResultService.Summary(MatchMode.CASUAL, new long[] {a.id(), b.id()},
                new MatchResult(0, MatchResult.Reason.DECISION, 1000, List.of(2, 0)), stats));
            if (i == 0) first = r;
            if (i == 2) {
                // Third match: Galileo (3 matches) for both; Newton skin (3 wins as Newton) for the winner only.
                assertThat(r[0].newUnlocks()).extracting(u -> u.id()).contains("fighter.galileo", "skin.newton.royal-society");
                assertThat(r[1].newUnlocks()).extracting(u -> u.id()).containsExactly("fighter.galileo");
                assertThat(r[0].newUnlocks().stream().filter(u -> u.id().equals("fighter.galileo")).findFirst().get().available()).isFalse();
            }
        }
        assertThat(first[0].mode()).isEqualTo(MatchMode.CASUAL);
        assertThat(first[0].eloAfter()).isEqualTo(first[0].eloBefore()); // casual: no Elo change
        assertThat(first[0].newCodex()).extracting(e -> e.id()).containsExactlyInAnyOrder("newton", "curie", "newton.special1", "curie.special2");
        assertThat(first[1].newCodex()).extracting(e -> e.id()).containsExactlyInAnyOrder("curie", "newton", "curie.special2", "newton.special1");
        assertThat(first[0].labNote().move()).isEqualTo("special1");      // his most-used special
        assertThat(first[0].labNote().text()).contains("9.8");
        assertThat(first[1].labNote().fighterId()).isEqualTo("curie");

        assertThat(unlocks.canUse(a.id(), "newton", "royal-society")).isTrue();
        assertThat(unlocks.canUse(b.id(), "newton", "royal-society")).isFalse();
        assertThat(unlocks.canUse(a.id(), "galileo", null)).isFalse();     // unlocked but not in this build yet
        assertThat(unlocks.usable(a.id()).get("newton")).containsExactly("classic", "royal-society");
    }
}
