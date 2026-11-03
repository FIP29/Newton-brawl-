package com.newtonbrawl.security;

import com.newtonbrawl.config.JwtProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;

/**
 * Issues and verifies HS256 access tokens. The subject is the player id; the username is
 * carried as a claim purely for convenience/logging.
 */
@Service
public class JwtService {

    private static final String ISSUER = "newton-brawl";

    private final SecretKey key;
    private final Duration lifetime;
    private final Clock clock;

    @Autowired
    public JwtService(JwtProperties props) {
        this(props, Clock.systemUTC());
    }

    JwtService(JwtProperties props, Clock clock) {
        byte[] bytes = Decoders.BASE64.decode(props.secret());
        if (bytes.length < 32) {
            throw new IllegalStateException("newton-brawl.jwt.secret must decode to at least 32 bytes");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.lifetime = Duration.ofMinutes(props.expirationMinutes());
        this.clock = clock;
    }

    /** Creates a signed token for the given player. */
    public IssuedToken issue(long playerId, String username) {
        Instant now = clock.instant();
        Instant expires = now.plus(lifetime);
        String token = Jwts.builder()
            .issuer(ISSUER)
            .subject(Long.toString(playerId))
            .claim("username", username)
            .issuedAt(Date.from(now))
            .expiration(Date.from(expires))
            .signWith(key)
            .compact();
        return new IssuedToken(token, expires);
    }

    /** Verifies signature, issuer and expiry. Returns empty for any invalid token. */
    public Optional<AuthenticatedPlayer> verify(String token) {
        try {
            Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(ISSUER)
                .clock(() -> Date.from(clock.instant()))
                .build()
                .parseSignedClaims(token)
                .getPayload();
            return Optional.of(new AuthenticatedPlayer(
                Long.parseLong(claims.getSubject()), claims.get("username", String.class)));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    public record IssuedToken(String token, Instant expiresAt) {}
}
