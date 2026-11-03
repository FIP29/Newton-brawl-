package com.newtonbrawl.codex;

import com.newtonbrawl.common.exception.NotFoundException;
import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/** Science Codex: content + each player's progress. */
@Service
public class CodexService {

    private final CodexCatalog catalog;
    private final CodexUnlockRepository unlocks;
    private final FighterCatalog fighters;

    public CodexService(CodexCatalog catalog, CodexUnlockRepository unlocks, FighterCatalog fighters) {
        this.catalog = catalog;
        this.unlocks = unlocks;
        this.fighters = fighters;
    }

    @Transactional(readOnly = true)
    public CodexDtos.Codex codexFor(long playerId) {
        Set<String> have = unlockedIds(playerId);
        List<CodexDtos.FighterPage> pages = new ArrayList<>();
        for (CodexCatalog.Page p : catalog.pages()) {
            Optional<FighterDefinition> def = definition(p.id());
            boolean pageUnlocked = have.contains(p.id());
            List<CodexDtos.MoveEntry> moves = new ArrayList<>();
            p.moves().forEach((moveId, m) -> {
                String id = p.id() + "." + moveId;
                boolean ok = have.contains(id);
                MoveDefinition md = def.map(d -> d.move(moveId)).orElse(null);
                moves.add(new CodexDtos.MoveEntry(id, moveId, md == null ? moveId : md.name(), md == null ? null : md.equation(),
                    ok ? m.law() : null, ok ? m.explain() : null, ok));
            });
            pages.add(new CodexDtos.FighterPage(p.id(), p.name(), p.lived(), p.origin(), p.phase(), def.isPresent(),
                pageUnlocked, pageUnlocked ? p.bio() : null, pageUnlocked ? p.funFact() : null, moves));
        }
        return new CodexDtos.Codex(have.size(), catalog.allEntryIds().size(), pages);
    }

    public Set<String> unlockedIds(long playerId) {
        return unlocks.findByPlayerId(playerId).stream().map(CodexUnlock::getEntryId).collect(Collectors.toSet());
    }

    public long count(long playerId) {
        return unlocks.countByPlayerId(playerId);
    }

    /** Unlocks the given entries (unknown ids ignored). Returns the ones that are new. */
    @Transactional
    public List<CodexDtos.EntryRef> unlock(long playerId, Collection<String> entryIds) {
        Set<String> have = new HashSet<>(unlockedIds(playerId));
        List<CodexDtos.EntryRef> fresh = new ArrayList<>();
        for (String id : entryIds) {
            if (!catalog.exists(id) || !have.add(id)) continue;
            unlocks.save(new CodexUnlock(playerId, id));
            fresh.add(new CodexDtos.EntryRef(id, title(id)));
        }
        return fresh;
    }

    /** Lab Note for a move (public content; also used after local matches). */
    public CodexDtos.LabNote labNote(String fighterId, String moveId) {
        CodexCatalog.Page page = catalog.page(fighterId).orElseThrow(() -> new NotFoundException("Unknown fighter"));
        CodexCatalog.Move m = Optional.ofNullable(page.moves().get(moveId)).orElseThrow(() -> new NotFoundException("Unknown move"));
        MoveDefinition md = definition(fighterId).map(d -> d.move(moveId)).orElse(null);
        return new CodexDtos.LabNote(fighterId, page.name(), moveId, md == null ? moveId : md.name(),
            md == null ? null : md.equation(), m.law(), m.labNote());
    }

    public boolean hasLabNote(String fighterId, String moveId) {
        return catalog.move(fighterId, moveId).isPresent();
    }

    private String title(String entryId) {
        int dot = entryId.indexOf('.');
        CodexCatalog.Page page = catalog.page(dot < 0 ? entryId : entryId.substring(0, dot)).orElseThrow();
        if (dot < 0) return page.name();
        String move = entryId.substring(dot + 1);
        String name = definition(page.id()).map(d -> d.move(move)).map(MoveDefinition::name).orElse(move);
        return page.name() + ": " + name;
    }

    private Optional<FighterDefinition> definition(String id) {
        try {
            return Optional.of(fighters.definition(id));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }
}
