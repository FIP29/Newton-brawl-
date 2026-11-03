package com.newtonbrawl.player;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PlayerRepository extends JpaRepository<Player, Long> {
    Optional<Player> findByUsernameIgnoreCase(String username);
    Optional<Player> findByEmailIgnoreCase(String email);
    boolean existsByUsernameIgnoreCase(String username);
    boolean existsByEmailIgnoreCase(String email);

    Page<Player> findByRankedGamesGreaterThanOrderByEloDescIdAsc(int rankedGames, Pageable page);

    /** Ranked players ordered before this one (higher Elo, or same Elo and lower id). */
    @Query("select count(p) from Player p where p.rankedGames > 0 and (p.elo > :elo or (p.elo = :elo and p.id < :id))")
    long countRankedAbove(@Param("elo") int elo, @Param("id") long id);
}
