package com.newtonbrawl.security;

import com.newtonbrawl.config.JwtProperties;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static final String SECRET =
        "bmV3dG9uLWJyYXdsLWRldi1zZWNyZXQtY2hhbmdlLW1lLWluLXByb2R1Y3Rpb24tcGxlYXNl";

    @Test
    void roundTrip() {
        JwtService svc = new JwtService(new JwtProperties(SECRET, 60));
        String token = svc.issue(42, "einstein").token();
        assertThat(svc.verify(token)).contains(new AuthenticatedPlayer(42, "einstein"));
    }

    @Test
    void expiredTokenIsRejected() {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        String token = new JwtService(new JwtProperties(SECRET, 1), Clock.fixed(t0, ZoneOffset.UTC))
            .issue(1, "bose").token();
        JwtService later = new JwtService(new JwtProperties(SECRET, 1),
            Clock.fixed(t0.plus(Duration.ofMinutes(5)), ZoneOffset.UTC));
        assertThat(later.verify(token)).isEmpty();
    }

    @Test
    void tamperedTokenIsRejected() {
        JwtService svc = new JwtService(new JwtProperties(SECRET, 60));
        String token = svc.issue(1, "hooke").token();
        String tampered = token.substring(0, token.length() - 2) + (token.endsWith("A") ? "BB" : "AA");
        assertThat(svc.verify(tampered)).isEmpty();
    }

    @Test
    void shortSecretFailsFast() {
        assertThatThrownBy(() -> new JwtService(new JwtProperties("c2hvcnQ=", 60)))
            .isInstanceOf(IllegalStateException.class);
    }
}
