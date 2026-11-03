package com.newtonbrawl.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Match / room settings bound from {@code newton-brawl.match.*}.
 *
 * @param countdownTicks  length of the "ROUND 1 — FIGHT!" intro, in ticks
 * @param reconnectGrace  how long a disconnected player has to come back before forfeiting
 * @param roomTtl         unused rooms with no connected players expire after this long
 */
@ConfigurationProperties(prefix = "newton-brawl.match")
public record MatchProperties(Integer countdownTicks, Duration reconnectGrace, Duration roomTtl) {
    public MatchProperties {
        countdownTicks = countdownTicks == null ? 120 : countdownTicks;
        reconnectGrace = reconnectGrace == null ? Duration.ofSeconds(8) : reconnectGrace;
        roomTtl = roomTtl == null ? Duration.ofMinutes(15) : roomTtl;
    }
}
