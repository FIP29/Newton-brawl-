package com.newtonbrawl.codex;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CodexUnlockRepository extends JpaRepository<CodexUnlock, Long> {
    List<CodexUnlock> findByPlayerId(long playerId);
    long countByPlayerId(long playerId);
}
