-- Players: account + public profile + win/loss record + ranked rating.
CREATE TABLE players (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    username       VARCHAR(20)  NOT NULL,
    email          VARCHAR(254) NOT NULL,
    password_hash  VARCHAR(100) NOT NULL,
    display_name   VARCHAR(32)  NOT NULL,
    elo            INT          NOT NULL DEFAULT 1000,
    wins           INT          NOT NULL DEFAULT 0,
    losses         INT          NOT NULL DEFAULT 0,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at  TIMESTAMP    NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_players_username UNIQUE (username),
    CONSTRAINT uk_players_email UNIQUE (email)
);

CREATE INDEX idx_players_elo ON players (elo);
