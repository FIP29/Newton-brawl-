-- Guest accounts: one-click players with a generated name. They can later claim a real account.
ALTER TABLE players ADD COLUMN guest BOOLEAN NOT NULL DEFAULT FALSE;
