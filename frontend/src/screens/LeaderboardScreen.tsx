import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { leaderboardApi, TIERS, type Leaderboard, type LeaderboardEntry } from '../api/progress';
import { TierBadge, tierColor } from '../components/TierBadge';
import { useAuth } from '../auth/AuthContext';
import { sfx } from '../audio/sfx';

const PAGE = 20;

/** Ranked ladder, highest Elo first, with your own position pinned. */
export function LeaderboardScreen() {
  const { player } = useAuth();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    leaderboardApi.get(page, PAGE).then(setBoard).catch(() => setError('Could not load the leaderboard.'));
  }, [page]);

  useLayoutEffect(() => {
    if (!tableRef.current) return;
    gsap.from(tableRef.current.children, { opacity: 0, x: -20, stagger: 0.025, duration: 0.3 });
  }, [board]);

  const pages = board ? Math.max(1, Math.ceil(board.totalPlayers / PAGE)) : 1;
  const meOnPage = board?.entries.some((e) => e.playerId === player?.id);

  return (
    <div className="screen board-screen">
      <h1 className="menu-logo"><span className="newton">RANKED</span> <span className="brawl">LADDER</span></h1>
      <div className="tier-legend">
        {TIERS.map((t) => (
          <span key={t.id} style={{ color: tierColor(t.id) }}><TierBadge tier={t.id} size={22} /> {t.name} <small>{t.min}+</small></span>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      {board && (
        <div className="panel board">
          {board.entries.length === 0 ? (
            <p className="chalk-note empty">No ranked matches yet. Be the first on the ladder!</p>
          ) : (
            <table>
              <thead><tr><th>#</th><th>Scientist</th><th>Tier</th><th>Elo</th><th>W–L</th><th>Games</th></tr></thead>
              <tbody ref={tableRef}>
                {board.entries.map((e) => <Row key={e.playerId} e={e} me={e.playerId === player?.id} />)}
              </tbody>
              {board.me && !meOnPage && (
                <tfoot><Row e={board.me} me /></tfoot>
              )}
            </table>
          )}
          <div className="board-pages">
            <button className="btn-ghost small" disabled={page === 0} onClick={() => { sfx.click(); setPage((p) => p - 1); }}>← Prev</button>
            <span>Page {page + 1} / {pages} · {board.totalPlayers} ranked players</span>
            <button className="btn-ghost small" disabled={page + 1 >= pages} onClick={() => { sfx.click(); setPage((p) => p + 1); }}>Next →</button>
          </div>
        </div>
      )}
      <div className="overlay-actions">
        <Link className="btn-neon btn-violet" to="/play?queue=ranked">Play ranked</Link>
        <Link className="btn-ghost" to="/">← Main menu</Link>
      </div>
    </div>
  );
}

function Row({ e, me }: { e: LeaderboardEntry; me: boolean }) {
  return (
    <tr className={me ? 'me' : ''} style={{ '--accent': tierColor(e.tier) } as React.CSSProperties}>
      <td className="rank">{e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}</td>
      <td><b>{e.displayName}</b> <small>@{e.username}</small></td>
      <td className="tier-cell"><TierBadge tier={e.tier} size={22} /> {e.tierName}</td>
      <td className="elo">{e.elo}</td>
      <td>{e.wins}–{e.losses}</td>
      <td>{e.rankedGames}</td>
    </tr>
  );
}
