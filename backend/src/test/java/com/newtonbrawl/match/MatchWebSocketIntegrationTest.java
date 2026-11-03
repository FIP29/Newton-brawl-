package com.newtonbrawl.match;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.player.Player;
import com.newtonbrawl.player.PlayerRepository;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Two real WebSocket clients against a real server: join, fight, forfeit. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "newton-brawl.match.countdown-ticks=5",
    "newton-brawl.match.reconnect-grace=300ms"
})
@ActiveProfiles("test")
class MatchWebSocketIntegrationTest {

    @LocalServerPort int port;
    @Autowired TestRestTemplate http;
    @Autowired PlayerRepository players;
    @Autowired ObjectMapper json;

    record Login(long id, String token) {}

    /** A test client that records every server message. */
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

        void pick(String fighter) throws Exception {
            send("{\"t\":\"pick\",\"f\":\"" + fighter + "\"}");
        }

        void input(long seq, int bits) throws Exception {
            send("{\"t\":\"in\",\"s\":" + seq + ",\"b\":" + bits + "}");
        }

        /** Waits for the first message matching the predicate, discarding the rest. */
        JsonNode await(Predicate<JsonNode> match, Duration timeout) throws InterruptedException {
            long deadline = System.nanoTime() + timeout.toNanos();
            while (System.nanoTime() < deadline) {
                JsonNode n = inbox.poll(50, TimeUnit.MILLISECONDS);
                if (n != null && match.test(n)) return n;
            }
            throw new AssertionError("Timed out waiting for message");
        }

        JsonNode awaitType(String t) throws InterruptedException {
            return await(n -> t.equals(n.path("t").asText()), Duration.ofSeconds(5));
        }
    }

    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        com.newtonbrawl.TestData.wipe(jdbc);
    }

    private Login register(String name) {
        var res = http.postForEntity("/api/auth/register",
            Map.of("username", name, "email", name + "@lab.test", "password", "password123"), JsonNode.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return new Login(res.getBody().at("/player/id").asLong(), res.getBody().get("token").asText());
    }

    private String createRoom(Login owner) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(owner.token());
        var res = http.exchange("/api/rooms", HttpMethod.POST, new HttpEntity<>(h), JsonNode.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return res.getBody().get("code").asText();
    }

    private Client connect(Login who, String room) throws Exception {
        Client c = new Client();
        c.session = wsClient()
            .execute(c, "ws://localhost:" + port + "/ws/match?room=" + room + "&token=" + who.token())
            .get(5, TimeUnit.SECONDS);
        return c;
    }

    @Test
    void twoPlayersJoinMoveAndHit() throws Exception {
        Login newton = register("newton"), tesla = register("tesla");
        String room = createRoom(newton);

        Client p1 = connect(newton, room);
        JsonNode welcome = p1.awaitType("welcome");
        assertThat(welcome.get("slot").asInt()).isZero();
        assertThat(welcome.get("roster")).hasSize(8);
        assertThat(welcome.at("/roster/0/id").asText()).isEqualTo("newton");
        Client p2 = connect(tesla, room);
        assertThat(p2.awaitType("welcome").get("slot").asInt()).isEqualTo(1);

        // Character select: nothing starts until both have picked.
        p1.pick("newton");
        p1.await(n -> "lobby".equals(n.path("t").asText()) && "newton".equals(n.at("/players/0/fighter").asText()), Duration.ofSeconds(3));
        assertThat(p1.inbox.stream().noneMatch(n -> "start".equals(n.path("t").asText()))).isTrue();
        p2.pick("not-a-scientist"); // ignored
        p2.pick("tesla");

        JsonNode start = p1.awaitType("start");
        assertThat(start.at("/fighters/0/id").asText()).isEqualTo("newton");
        assertThat(start.at("/fighters/1/id").asText()).isEqualTo("tesla");
        assertThat(start.at("/arena/objects").size()).isGreaterThanOrEqualTo(3);
        assertThat(start.get("tickRate").asInt()).isEqualTo(60);
        assertThat(start.get("fighters")).hasSize(2);
        assertThat(start.at("/players/1/username").asText()).isEqualTo("tesla");

        JsonNode first = p1.await(n -> "FIGHTING".equals(n.path("phase").asText()), Duration.ofSeconds(5));
        double startX = first.at("/fighters/0/x").asDouble();

        // Hold right: Newton walks until bodies touch.
        p1.input(1, InputBits.RIGHT);
        JsonNode walked = p1.await(n -> "state".equals(n.path("t").asText())
            && n.at("/fighters/1/x").asDouble() - n.at("/fighters/0/x").asDouble() < 95, Duration.ofSeconds(5));
        assertThat(walked.at("/fighters/0/x").asDouble()).isGreaterThan(startX + 100);
        assertThat(walked.at("/ack/0").asLong()).isEqualTo(1);

        // Newton's light attack lands on Tesla (950 HP, jab 55).
        p1.input(2, InputBits.LIGHT);
        JsonNode hit = p2.await(n -> {
            for (JsonNode e : n.path("events")) if ("HIT".equals(e.path("type").asText())) return true;
            return false;
        }, Duration.ofSeconds(3));
        JsonNode ev = null;
        for (JsonNode e : hit.path("events")) if ("HIT".equals(e.path("type").asText())) ev = e;
        assertThat(ev.get("attacker").asInt()).isZero();
        assertThat(ev.get("move").asText()).isEqualTo("light");
        assertThat(hit.at("/fighters/1/health").asInt()).isEqualTo(950 - 55);
        assertThat(hit.at("/fighters/1/action").asText()).isEqualTo("HITSTUN");

        p1.session.close();
        p2.session.close();
    }

    @Test
    void disconnectMidMatchForfeitsAfterGraceAndRecordsResult() throws Exception {
        Login curie = register("curie"), einstein = register("einstein");
        String room = createRoom(curie);
        Client p1 = connect(curie, room);
        Client p2 = connect(einstein, room);
        p1.awaitType("welcome");
        p2.awaitType("welcome");
        p1.pick("curie");
        p2.pick("einstein");
        p1.awaitType("start");

        p2.session.close();
        JsonNode lobby = p1.await(n -> "lobby".equals(n.path("t").asText())
            && !n.at("/players/1/connected").asBoolean(true), Duration.ofSeconds(3));
        assertThat(lobby).isNotNull();

        JsonNode end = p1.awaitType("end");
        assertThat(end.get("winner").asInt()).isZero();
        assertThat(end.get("reason").asText()).isEqualTo("FORFEIT");

        Thread.sleep(200); // result is persisted right after the end message is sent
        Player winner = players.findById(curie.id()).orElseThrow();
        Player loser = players.findById(einstein.id()).orElseThrow();
        assertThat(winner.getWins()).isEqualTo(1);
        assertThat(loser.getLosses()).isEqualTo(1);

        // Room is gone once the match ends.
        assertThat(http.getForEntity("/api/rooms/" + room, String.class).getStatusCode())
            .isIn(HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND);
    }

    @Test
    void reconnectWithinGraceKeepsTheMatchAlive() throws Exception {
        Login a = register("hooke"), b = register("galileo");
        String room = createRoom(a);
        Client p1 = connect(a, room);
        Client p2 = connect(b, room);
        p1.awaitType("welcome");
        p2.awaitType("welcome");
        p1.pick("newton");
        p2.pick("einstein");
        p1.awaitType("start");

        p2.session.close();
        Client p2again = connect(b, room);
        assertThat(p2again.awaitType("welcome").get("slot").asInt()).isEqualTo(1);
        assertThat(p2again.awaitType("start")).isNotNull(); // resumes rendering mid-match

        Thread.sleep(600); // longer than the grace period
        assertThat(p1.inbox.stream().noneMatch(n -> "end".equals(n.path("t").asText()))).isTrue();
        p2again.await(n -> "state".equals(n.path("t").asText()), Duration.ofSeconds(2));
    }

    @Test
    void thirdPlayerIsTurnedAwayAndUnknownRoomIsRejected() throws Exception {
        Login a = register("faraday"), b = register("bose"), c = register("hawking");
        String room = createRoom(a);
        connect(a, room);
        connect(b, room);
        Client third = connect(c, room);
        assertThat(third.awaitType("error").get("code").asText()).isEqualTo("ROOM_FULL");

        Client lost = connect(c, "ZZZZZ");
        assertThat(lost.awaitType("error").get("code").asText()).isEqualTo("ROOM_NOT_FOUND");
    }

    @Test
    void handshakeWithoutValidTokenIsRefused() {
        assertThatThrownBy(() -> wsClient()
            .execute(new TextWebSocketHandler(), "ws://localhost:" + port + "/ws/match?room=ABCDE&token=bogus")
            .get(5, TimeUnit.SECONDS))
            .hasMessageContaining("401");
    }

    /** The JSR-356 client defaults to 8 KB messages; the welcome (full roster) is larger. Browsers have no such cap. */
    static StandardWebSocketClient wsClient() {
        jakarta.websocket.WebSocketContainer c = jakarta.websocket.ContainerProvider.getWebSocketContainer();
        c.setDefaultMaxTextMessageBufferSize(1024 * 1024);
        return new StandardWebSocketClient(c);
    }
}
