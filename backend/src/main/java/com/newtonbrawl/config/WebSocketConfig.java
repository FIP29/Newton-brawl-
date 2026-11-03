package com.newtonbrawl.config;

import com.newtonbrawl.match.ws.AuthHandshakeInterceptor;
import com.newtonbrawl.match.ws.MatchWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Raw WebSocket endpoint for live matches (no STOMP: one small JSON frame per tick, minimal overhead).
 * Endpoint: {@code /ws/match?room=CODE&token=JWT}.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final MatchWebSocketHandler handler;
    private final AuthHandshakeInterceptor authInterceptor;
    private final CorsProperties cors;

    public WebSocketConfig(MatchWebSocketHandler handler, AuthHandshakeInterceptor authInterceptor, CorsProperties cors) {
        this.handler = handler;
        this.authInterceptor = authInterceptor;
        this.cors = cors;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/match")
            .addInterceptors(authInterceptor)
            .setAllowedOrigins(cors.allowedOrigins().toArray(String[]::new));
    }
}
