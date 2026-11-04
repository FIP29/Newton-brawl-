-- Phase 5: ranked ladder, match history, Science Codex progress, fighter/skin unlocks.
ALTER TABLE players ADD COLUMN peak_elo INT NOT NULL DEFAULT 1000;
ALTER TABLE players ADD COLUMN ranked_games INT NOT NULL DEFAULT 0;

CREATE TABLE matches (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    mode            VARCHAR(16)  NOT NULL,
    p1_id           BIGINT       NOT NULL,
    p2_id           BIGINT       NOT NULL,
    p1_fighter      VARCHAR(32)  NOT NULL,
    p2_fighter      VARCHAR(32)  NOT NULL,
    winner_slot     INT          NOT NULL,          -- 0, 1, or -1 for a draw
    reason          VARCHAR(16)  NOT NULL,
    p1_rounds       INT          NOT NULL,
    p2_rounds       INT          NOT NULL,
    p1_elo_before   INT          NOT NULL,
    p1_elo_after    INT          NOT NULL,
    p2_elo_before   INT          NOT NULL,
    p2_elo_after    INT          NOT NULL,
    duration_ticks  BIGINT       NOT NULL,
    played_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_matches_p1 FOREIGN KEY (p1_id) REFERENCES players (id),
    CONSTRAINT fk_matches_p2 FOREIGN KEY (p2_id) REFERENCES players (id)
);
CREATE INDEX idx_matches_p1 ON matches (p1_id, played_at);
CREATE INDEX idx_matches_p2 ON matches (p2_id, played_at);

CREATE TABLE player_codex (
    id           BIGINT      NOT NULL AUTO_INCREMENT,
    player_id    BIGINT      NOT NULL,
    entry_id     VARCHAR(64) NOT NULL,
    unlocked_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_player_codex UNIQUE (player_id, entry_id),
    CONSTRAINT fk_codex_player FOREIGN KEY (player_id) REFERENCES players (id)
);

CREATE TABLE player_unlocks (
    id           BIGINT      NOT NULL AUTO_INCREMENT,
    player_id    BIGINT      NOT NULL,
    unlock_id    VARCHAR(64) NOT NULL,
    unlocked_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_player_unlocks UNIQUE (player_id, unlock_id),
    CONSTRAINT fk_unlocks_player FOREIGN KEY (player_id) REFERENCES players (id)
);
