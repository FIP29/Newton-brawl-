package com.newtonbrawl.codex;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The Science Codex content (classpath:/codex/codex.json): one page per scientist with a bio and a
 * fun fact, plus the real law behind each move with a short explanation and an after-match Lab Note.
 *
 * <p>Entry ids: {@code "<fighter>"} for the bio page, {@code "<fighter>.<move>"} for each move.
 */
@Component
public class CodexCatalog {

    public record Move(String law, String explain, String labNote) {}

    public record Page(String id, String name, String lived, String origin, int phase, String bio, String funFact,
                       Map<String, Move> moves) {
        public Page {
            moves = moves == null ? Map.of() : new LinkedHashMap<>(moves);
        }
    }

    private record File(List<Page> fighters) {}

    private final List<Page> pages;
    private final Map<String, Page> byId = new LinkedHashMap<>();

    public CodexCatalog(ObjectMapper mapper) {
        try (InputStream in = getClass().getResourceAsStream("/codex/codex.json")) {
            if (in == null) throw new IllegalStateException("Missing /codex/codex.json");
            this.pages = List.copyOf(mapper.readValue(in, File.class).fighters());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        pages.forEach(p -> byId.put(p.id(), p));
    }

    public List<Page> pages() { return pages; }

    public Optional<Page> page(String fighterId) { return Optional.ofNullable(byId.get(fighterId)); }

    public Optional<Move> move(String fighterId, String moveId) {
        return page(fighterId).map(p -> p.moves().get(moveId));
    }

    /** Every unlockable entry id, in display order. */
    public List<String> allEntryIds() {
        List<String> ids = new ArrayList<>();
        for (Page p : pages) {
            ids.add(p.id());
            p.moves().keySet().forEach(m -> ids.add(p.id() + "." + m));
        }
        return ids;
    }

    public boolean exists(String entryId) {
        int dot = entryId.indexOf('.');
        if (dot < 0) return byId.containsKey(entryId);
        return move(entryId.substring(0, dot), entryId.substring(dot + 1)).isPresent();
    }
}
