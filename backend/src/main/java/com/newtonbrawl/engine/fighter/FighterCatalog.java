package com.newtonbrawl.engine.fighter;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.function.Function;

import com.newtonbrawl.engine.fighter.roster.Curie;
import com.newtonbrawl.engine.fighter.roster.Einstein;
import com.newtonbrawl.engine.fighter.roster.Newton;
import com.newtonbrawl.engine.fighter.roster.Tesla;

/**
 * Registry of every fighter: the JSON definition plus the Java class that implements it.
 *
 * <p>Adding a fighter = add {@code fighters/<id>.json} + a {@link Fighter} subclass + one line in
 * {@link #FACTORIES}.
 */
public final class FighterCatalog {

    /** id → constructor for that fighter's behaviour class. Order = roster order. */
    private static final Map<String, Function<FighterDefinition, Fighter>> FACTORIES = new LinkedHashMap<>();
    static {
        FACTORIES.put(Newton.ID, Newton::new);
        FACTORIES.put(Tesla.ID, Tesla::new);
        FACTORIES.put(Curie.ID, Curie::new);
        FACTORIES.put(Einstein.ID, Einstein::new);
        // Training dummy with only light/heavy; used by tests, not selectable.
        FACTORIES.put(PrototypeFighter.ID, PrototypeFighter::new);
    }

    /** Fighters players can pick, in roster order. */
    public static final java.util.List<String> PLAYABLE = java.util.List.of(Newton.ID, Tesla.ID, Curie.ID, Einstein.ID);

    private final Map<String, FighterDefinition> definitions;

    private FighterCatalog(Map<String, FighterDefinition> definitions) {
        this.definitions = Map.copyOf(definitions);
    }

    /** Loads every registered fighter's JSON from {@code classpath:/fighters/}. */
    public static FighterCatalog loadFromClasspath() {
        ObjectMapper mapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true);
        Map<String, FighterDefinition> defs = new LinkedHashMap<>();
        for (String id : FACTORIES.keySet()) {
            String path = "/fighters/" + id + ".json";
            try (InputStream in = FighterCatalog.class.getResourceAsStream(path)) {
                if (in == null) throw new IllegalStateException("Missing fighter config " + path);
                FighterDefinition def = mapper.readValue(in, FighterDefinition.class);
                if (!def.id().equals(id)) {
                    throw new IllegalStateException(path + " declares id '" + def.id() + "'");
                }
                defs.put(id, def);
            } catch (IOException e) {
                throw new UncheckedIOException("Failed to load " + path, e);
            }
        }
        return new FighterCatalog(defs);
    }

    /** Builds a catalog from in-memory definitions (tests, tools). */
    public static FighterCatalog of(Collection<FighterDefinition> defs) {
        Map<String, FighterDefinition> map = new LinkedHashMap<>();
        defs.forEach(d -> map.put(d.id(), d));
        return new FighterCatalog(map);
    }

    public FighterDefinition definition(String id) {
        FighterDefinition def = definitions.get(id);
        if (def == null) throw new NoSuchElementException("Unknown fighter: " + id);
        return def;
    }

    /** Creates a fresh fighter instance (each match gets its own, since subclasses may hold state). */
    public Fighter create(String id) {
        FighterDefinition def = definition(id);
        return FACTORIES.getOrDefault(id, PrototypeFighter::new).apply(def);
    }

    public Collection<FighterDefinition> all() {
        return definitions.values();
    }
}
