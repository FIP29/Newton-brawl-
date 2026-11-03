package com.newtonbrawl.match.ws;

import com.newtonbrawl.security.AuthenticatedPlayer;
import com.newtonbrawl.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;
import java.util.Optional;

/**
 * Authenticates the WebSocket upgrade. Browsers can't set an Authorization header on WebSocket
 * connections, so the JWT travels as a query parameter ({@code ?token=}) and is verified here,
 * before the connection is accepted. Use TLS (wss://) in production so the token isn't exposed.
 */
@Component
public class AuthHandshakeInterceptor implements HandshakeInterceptor {

    public static final String ATTR_PLAYER = "nb.player";
    public static final String ATTR_ROOM = "nb.room";

    private final JwtService jwt;

    public AuthHandshakeInterceptor(JwtService jwt) {
        this.jwt = jwt;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        MultiValueMap<String, String> query = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams();
        String token = query.getFirst("token");
        String room = query.getFirst("room");
        Optional<AuthenticatedPlayer> player = token == null ? Optional.empty() : jwt.verify(token);
        if (player.isEmpty()) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        if (room == null || room.isBlank()) {
            response.setStatusCode(HttpStatus.BAD_REQUEST);
            return false;
        }
        attributes.put(ATTR_PLAYER, player.get());
        attributes.put(ATTR_ROOM, room);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // nothing to do
    }
}
