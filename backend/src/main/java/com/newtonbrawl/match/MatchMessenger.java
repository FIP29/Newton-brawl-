package com.newtonbrawl.match;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;

/** JSON encoding and fire-and-forget sending. A failed send never breaks the match loop. */
@Component
public class MatchMessenger {

    private static final Logger log = LoggerFactory.getLogger(MatchMessenger.class);

    private final ObjectMapper mapper;

    public MatchMessenger(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public TextMessage encode(Object message) {
        try {
            return new TextMessage(mapper.writeValueAsString(message));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise " + message.getClass().getSimpleName(), e);
        }
    }

    public void send(WebSocketSession session, Object message) {
        send(session, encode(message));
    }

    public void send(WebSocketSession session, TextMessage message) {
        if (session == null || !session.isOpen()) return;
        try {
            session.sendMessage(message);
        } catch (IOException | IllegalStateException e) {
            log.debug("Send to {} failed: {}", session.getId(), e.getMessage());
        }
    }

    public void close(WebSocketSession session, CloseStatus status) {
        if (session == null || !session.isOpen()) return;
        try {
            session.close(status);
        } catch (IOException e) {
            log.debug("Close of {} failed: {}", session.getId(), e.getMessage());
        }
    }
}
