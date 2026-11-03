package com.newtonbrawl.history;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MatchRecordRepository extends JpaRepository<MatchRecord, Long> {

    @Query("select m from MatchRecord m where m.p1Id = :pid or m.p2Id = :pid order by m.playedAt desc, m.id desc")
    List<MatchRecord> findRecent(@Param("pid") long playerId, Pageable page);

    @Query("select count(m) from MatchRecord m where m.p1Id = :pid or m.p2Id = :pid")
    long countForPlayer(@Param("pid") long playerId);

    /** Wins by a player while playing a given fighter. */
    @Query("""
        select count(m) from MatchRecord m
        where (m.p1Id = :pid and m.p1Fighter = :fighter and m.winnerSlot = 0)
           or (m.p2Id = :pid and m.p2Fighter = :fighter and m.winnerSlot = 1)""")
    long countWinsWith(@Param("pid") long playerId, @Param("fighter") String fighter);

    @Query("select m from MatchRecord m where m.p1Id = :pid or m.p2Id = :pid")
    List<MatchRecord> findAllForPlayer(@Param("pid") long playerId);
}
