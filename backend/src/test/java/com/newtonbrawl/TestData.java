package com.newtonbrawl;

import org.springframework.jdbc.core.JdbcTemplate;

/** Test helper: empties every table in foreign-key order. */
public final class TestData {
    private TestData() {}

    public static void wipe(JdbcTemplate jdbc) {
        for (String table : new String[] {"player_unlocks", "player_codex", "matches", "players"}) {
            jdbc.update("DELETE FROM " + table);
        }
    }
}
