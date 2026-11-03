package com.newtonbrawl.ranked;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class EloTest {

    @Test
    void evenlyMatchedPlayersExpectHalf() {
        assertThat(Elo.expected(1200, 1200)).isEqualTo(0.5);
    }

    @Test
    void fourHundredPointsIsTenToOne() {
        assertThat(Elo.expected(1400, 1000)).isCloseTo(10.0 / 11, within(1e-9));
        assertThat(Elo.expected(1400, 1000) + Elo.expected(1000, 1400)).isCloseTo(1.0, within(1e-12));
    }

    @Test
    void winsAgainstStrongerOpponentsAreWorthMore() {
        int k = Elo.K_ESTABLISHED;
        int upset = Elo.update(1000, 1400, 1, k) - 1000;
        int expectedWin = Elo.update(1400, 1000, 1, k) - 1400;
        assertThat(upset).isGreaterThan(expectedWin);
        assertThat(upset).isEqualTo((int) Math.round(k * (1 - 1.0 / 11)));
    }

    @Test
    void drawsMoveRatingsTowardEachOther() {
        assertThat(Elo.update(1500, 1300, 0.5, 24)).isLessThan(1500);
        assertThat(Elo.update(1300, 1500, 0.5, 24)).isGreaterThan(1300);
    }

    @Test
    void provisionalPlayersMoveFaster() {
        assertThat(Elo.kFactor(0)).isEqualTo(Elo.K_PROVISIONAL);
        assertThat(Elo.kFactor(Elo.PROVISIONAL_GAMES)).isEqualTo(Elo.K_ESTABLISHED);
        assertThat(Elo.update(1000, 1000, 1, Elo.kFactor(0))).isEqualTo(1020);
    }

    @Test
    void ratingNeverDropsBelowTheFloor() {
        assertThat(Elo.update(Elo.FLOOR, 2500, 0, 40)).isEqualTo(Elo.FLOOR);
    }
}
