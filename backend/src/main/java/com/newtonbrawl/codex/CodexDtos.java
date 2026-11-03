package com.newtonbrawl.codex;

import java.util.List;

/** Codex API shapes. Text of locked entries is withheld so unlocking matters. */
public final class CodexDtos {
    private CodexDtos() {}

    public record MoveEntry(String id, String move, String name, String equation, String law, String explain, boolean unlocked) {}

    public record FighterPage(String id, String name, String lived, String origin, int phase, boolean available,
                              boolean unlocked, String bio, String funFact, List<MoveEntry> moves) {}

    public record Codex(int unlockedCount, int totalCount, List<FighterPage> fighters) {}

    /** After-match note explaining the science behind one move. */
    public record LabNote(String fighterId, String fighterName, String move, String moveName, String equation, String law, String text) {}

    public record EntryRef(String id, String title) {}
}
