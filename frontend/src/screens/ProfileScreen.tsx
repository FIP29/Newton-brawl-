import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { historyApi, unlocksApi, type FighterStats, type MatchHistoryEntry, type UnlockStatus } from '../api/progress';
import { useAuth } from '../auth/AuthContext';
import { TierBadge, tierColor } from '../components/TierBadge';
import { fighterPortraits } from '../components/portraits';
import { FIGHTERS } from '../game/data/fighters';
import { lookFor, skinName } from '../game/render/characters/looks';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const fighterName = (id: string) => FIGHTERS[id]?.name ?? id;

/** Player profile: rank, record, favourite fighters, recent matches and unlock progress. */
export function ProfileScreen() {
  const { player, refresh } = useAuth();
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [fighters, setFighters] = useState<FighterStats[]>([]);
  const [unlocks, setUnlocks] = useState<UnlockStatus[]>([]);
  const [faces, setFaces] = useState<Record<string, string>>({});

  useEffect(() => {
    void refresh();
    historyApi.matches(15).then(setMatches).catch(() => undefined);
    historyApi.fighters().then(setFighters).catch(() => undefined);
    unlocksApi.list().then(setUnlocks).catch(() => undefined);
    void fighterPortraits().then(setFaces);
  }, [refresh]);

  if (!player) return null;
  const games = player.wins + player.losses;
  const span = player.nextTierElo > 0 ? player.nextTierElo - (TIER_MIN[player.rankTier] ?? 0) : 1;
  const pct = player.nextTierElo > 0 ? Math.max(0, Math.min(100, ((player.elo - (TIER_MIN[player.rankTier] ?? 0)) / span) * 100)) : 100;

  return (
    <div className="screen profile-screen">
      <div className="profile-grid">
        <section className="panel profile-card" style={{ '--accent': tierColor(player.rankTier) } as React.CSSProperties}>
          <TierBadge tier={player.rankTier} size={84} />
          <div className="player-name">{player.displayName}</div>
          <div className="player-handle">@{player.username}</div>
          <div className="tier"><span className="tier-name">{player.rankTierName}</span><span className="tier-elo">{player.elo} Elo</span></div>
          <div className="vp-progress"><div style={{ width: `${pct}%` }} /></div>
          <div className="vp-next">{player.nextTierName ? `${player.nextTierElo - player.elo} Elo to ${player.nextTierName}` : 'Top of the ladder'}</div>
          <dl className="stats">
            <div><dt>Wins</dt><dd>{player.wins}</dd></div>
            <div><dt>Losses</dt><dd>{player.losses}</dd></div>
            <div><dt>Win rate</dt><dd>{games ? `${player.winRate}%` : '—'}</dd></div>
            <div><dt>Peak Elo</dt><dd>{player.peakElo}</dd></div>
            <div><dt>Ranked</dt><dd>{player.rankedGames}</dd></div>
            <div><dt>Matches</dt><dd>{games}</dd></div>
          </dl>
        </section>

        <section className="panel profile-section">
          <h2>Scientists played</h2>
          {fighters.length === 0 ? <p className="chalk-note">No matches yet.</p> : (
            <ul className="fighter-stats">
              {fighters.map((f) => (
                <li key={f.fighter} style={{ '--accent': hex(lookFor(f.fighter).glow) } as React.CSSProperties}>
                  <span className="codex-face" style={faces[f.fighter] ? { backgroundImage: `url(${faces[f.fighter]})` } : undefined} />
                  <b>{fighterName(f.fighter)}</b>
                  <span>{f.matches} played · {f.wins} won</span>
                </li>
              ))}
            </ul>
          )}

          <h2>Recent matches</h2>
          {matches.length === 0 ? <p className="chalk-note">Your match history will appear here.</p> : (
            <ul className="history">
              {matches.map((m) => {
                const d = m.eloAfter - m.eloBefore;
                return (
                  <li key={m.id} className={m.result.toLowerCase()}>
                    <span className="h-result">{m.result}</span>
                    <span className="h-vs">{fighterName(m.fighter)} <small>vs</small> {fighterName(m.opponentFighter)} <small>({m.opponentName})</small></span>
                    <span className="h-score">{m.rounds}–{m.opponentRounds}</span>
                    <span className={`mode-badge ${m.mode.toLowerCase()}`}>{m.mode}</span>
                    <span className={`h-elo ${d >= 0 ? 'up' : 'down'}`}>{m.mode === 'RANKED' ? `${d >= 0 ? '+' : ''}${d}` : ''}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel profile-section">
          <h2>Unlocks</h2>
          <ul className="unlock-list">
            {unlocks.map((u) => (
              <li key={u.id} className={u.unlocked ? 'done' : ''}>
                <div className="unlock-title">
                  <span className="vp-unlock-kind">{u.type === 'FIGHTER' ? 'FIGHTER' : 'SKIN'}</span>
                  <b>{u.type === 'SKIN' ? `${fighterName(u.fighter)}: ${skinName(u.fighter, u.skin ?? '')}` : u.name}</b>
                  {u.unlocked && <span className="unlock-check">✓</span>}
                </div>
                <div className="unlock-req">{u.requirement}{!u.available && ' · arrives in a later update'}</div>
                <div className="vp-progress"><div style={{ width: `${(u.progress / u.target) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Link className="btn-ghost" to="/">← Main menu</Link>
    </div>
  );
}

const TIER_MIN: Record<string, number> = { ATOM: 0, MOLECULE: 1100, STAR: 1300, SUPERNOVA: 1500, BLACK_HOLE: 1700 };
