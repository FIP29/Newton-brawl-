package com.newtonbrawl.unlock;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlayerUnlockRepository extends JpaRepository<PlayerUnlock, Long> {
    List<PlayerUnlock> findByPlayerId(long playerId);
}
