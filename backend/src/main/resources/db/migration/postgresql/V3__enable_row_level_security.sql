-- Hosted Postgres (Supabase) publishes tables in the public schema through its auto-generated REST
-- API. The game never uses that API: only the backend talks to the database, as the tables' owner,
-- and owners bypass RLS. Turning RLS on with no policies closes the API to everyone else
-- (e.g. anyone holding the project's anon key), so player emails and password hashes stay private.
-- (flyway_schema_history is left alone: Flyway locks it while migrating, and it holds nothing private.)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_codex ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_unlocks ENABLE ROW LEVEL SECURITY;
