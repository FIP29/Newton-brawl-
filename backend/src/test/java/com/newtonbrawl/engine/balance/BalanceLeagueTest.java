package com.newtonbrawl.engine.balance;

import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.sim.Arena;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Balance guard: in a bot league no fighter may win more than 70% or fewer than 30% of its games.
 * Run with {@code -Dbalance.full=true} for a larger league that also rewrites docs/balance-report.md.
 */
class BalanceLeagueTest {

    @Test
    void noFighterIsAnOutlier() throws Exception {
        FighterCatalog catalog = FighterCatalog.loadFromClasspath();
        List<String> roster = BalanceLeague.roster(catalog);
        boolean full = Boolean.getBoolean("balance.full");
        BalanceLeague.Report r = BalanceLeague.run(catalog, roster, Arena.ALL, full ? 3 : 1);
        if (full) Files.writeString(Path.of("../docs/balance-report.md"), BalanceLeague.markdown(r));
        System.out.println(BalanceLeague.markdown(r));
        for (String f : roster) {
            assertThat(r.winRate(f)).as(f + " win rate").isBetween(0.30, 0.70);
        }
    }
}
