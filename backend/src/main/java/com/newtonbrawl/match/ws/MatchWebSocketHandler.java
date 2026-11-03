package com.newtonbrawl.match.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.newtonbrawl.match.RoomService;
import com.newtonbrawl.security.AuthenticatedPlayer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Match socket protocol (client → server):
 * <pre>
 *   {"t":"in",   "s": seq, "b": buttons}   one per client tick, see InputBits
 *   {"t":"ping", "c": clientTimeMs}         answered with {"t":"pong", ...}
 *   {"t":"pick", "f": fighterId, "s": skin} character select (before the match starts)
 * </pre>
 * Server → client messages are defined in {@link com.newtonbrawl.match.protocol.ServerMessages}.
 */
@Component
public class MatchWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(MatchWebSocketHandler.class);
    private static final String ATTR_SAFE_SESSION = "nb.safeSession";

    /** Per-session send buffer; snapshots beyond this are dropped for slow clients rather than blocking. */
    private static final int SEND_TIME_LIMIT_MS = 2_000;
    private static final int SEND_BUFFER_LIMIT = 256 * 1024;
    /** Client messages are tiny; anything bigger is a misbehaving client. */
    private static final int MAX_CLIENT_MESSAGE = 1024;

    private final RoomService rooms;
    private final ObjectMapper mapper;

    public MatchWebSocketHandler(RoomService rooms, ObjectMapper mapper) {
        this.rooms = rooms;
        this.mapper = mapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        // Several threads send on this session (match loop + pongs); the decorator serialises sends.
        WebSocketSession safe = new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS,
            SEND_BUFFER_LIMIT, ConcurrentWebSocketSessionDecorator.OverflowStrategy.DROP);
        session.getAttributes().put(ATTR_SAFE_SESSION, safe);
        AuthenticatedPlayer player = (AuthenticatedPlayer) session.getAttributes().get(AuthHandshakeInterceptor.ATTR_PLAYER);
        String room = (String) session.getAttributes().get(AuthHandshakeInterceptor.ATTR_ROOM);
        rooms.connect(safe, player, room);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        if (message.getPayloadLength() > MAX_CLIENT_MESSAGE) {
            session.close(CloseStatus.TOO_BIG_TO_PROCESS);
            return;
        }
        JsonNode msg;
        try {
            msg = mapper.readTree(message.getPayload());
        } catch (Exception e) {
            log.debug("Malformed message from {}", session.getId());
            return;
        }
        switch (msg.path("t").asText()) {
            case "in" -> rooms.input(session, msg.path("s").asLong(-1), msg.path("b").asInt(0));
            case "ping" -> rooms.ping(safe(session), msg.path("c").asDouble());
            case "pick" -> rooms.pick(session, msg.path("f").asText(null), msg.path("s").asText(null));
            default -> log.debug("Unknown message type from {}", session.getId());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        rooms.disconnect(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.debug("Transport error on {}: {}", session.getId(), exception.getMessage());
    }

    private static WebSocketSession safe(WebSocketSession session) {
        Object s = session.getAttributes().get(ATTR_SAFE_SESSION);
        return s instanceof WebSocketSession w ? w : session;
    }
}
