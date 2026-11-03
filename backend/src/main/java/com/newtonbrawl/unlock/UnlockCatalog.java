package com.newtonbrawl.unlock;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Optional;

/**
 * Everything that can be unlocked (classpath:/codex/unlocks.json): future fighters and skins,
 * each with one requirement. Data-driven so balancing unlock pacing is a JSON edit.
 */
@Component
public class UnlockCatalog {

    public enum Type { FIGHTER, SKIN }

    public enum RequirementType {
        MATCHES_PLAYED, WINS, CODEX_ENTRIES,
        /** Wins while playing a specific fighter. */
        WINS_WITH
    }

    public record Requirement(RequirementType type, int count, String fighter) {}

    public record Unlock(String id, Type type, String fighter, String skin, String name, Requirement requirement) {}

    private record File(List<Unlock> unlocks) {}

    private final List<Unlock> unlocks;

    public UnlockCatalog(ObjectMapper mapper) {
        try (InputStream in = getClass().getResourceAsStream("/codex/unlocks.json")) {
            if (in == null) throw new IllegalStateException("Missing /codex/unlocks.json");
            this.unlocks = List.copyOf(mapper.readValue(in, File.class).unlocks());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public List<Unlock> all() { return unlocks; }

    public Optional<Unlock> fighter(String fighterId) {
        return unlocks.stream().filter(u -> u.type() == Type.FIGHTER && u.fighter().equals(fighterId)).findFirst();
    }

    public Optional<Unlock> skin(String fighterId, String skin) {
        return unlocks.stream().filter(u -> u.type() == Type.SKIN && u.fighter().equals(fighterId) && u.skin().equals(skin)).findFirst();
    }
}
