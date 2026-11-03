package com.newtonbrawl.player;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class RankTierTest {
    @ParameterizedTest
    @CsvSource({"0,ATOM", "1000,ATOM", "1099,ATOM", "1100,MOLECULE", "1300,STAR",
                "1499,STAR", "1500,SUPERNOVA", "1700,BLACK_HOLE", "2500,BLACK_HOLE"})
    void tierFromElo(int elo, RankTier expected) {
        assertThat(RankTier.forElo(elo)).isEqualTo(expected);
    }
}
