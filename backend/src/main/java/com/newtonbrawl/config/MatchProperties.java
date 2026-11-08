package com.newtonbrawl.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Match / room settings bound from {@code newton-brawl.match.*}.
 *
 * @param countdownTicks  length of the "ROUND n — FIGHT!" intro, in ticks
 * @param roundSeconds    round clock
 * @param reconnectGrace  how long a disconnected player has to come back before forfeiting
 * @param roomTtl         unused rooms with no connected players expire after this long
 * @param startEnergy     ULTIMATE meter both fighters start with (testing only; 0 in normal play)
 */
@ConfigurationProperties(prefix = "newton-brawl.match")
public record MatchProperties(Integer countdownTicks, Integer roundSeconds, Duration reconnectGrace, Duration roomTtl,
                              Integer startEnergy) {
    public MatchProperties {
        countdownTicks = countdownTicks == null ? 120 : countdownTicks;
        roundSeconds = roundSeconds == null ? 99 : roundSeconds;
        reconnectGrace = reconnectGrace == null ? Duration.ofSeconds(8) : reconnectGrace;
        roomTtl = roomTtl == null ? Duration.ofMinutes(15) : roomTtl;
        startEnergy = startEnergy == null ? 0 : startEnergy;
    }
}
