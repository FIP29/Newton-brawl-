import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useAuth } from '../auth/AuthContext';
import { sfx } from '../audio/sfx';
import { TierBadge } from '../components/TierBadge';
import { ClaimAccount } from '../components/ClaimAccount';

interface MenuItem { label: string; hint: string; color: string; phase: number; to?: string }

/** Menu entries light up as later phases ship; for now they show which phase delivers them. */
const MENU: MenuItem[] = [
  { label: 'Play Online', hint: 'Casual · Ranked · Private room', color: 'var(--newton)', phase: 2, to: '/play' },
  { label: 'Local Versus', hint: 'Two players, one keyboard', color: 'var(--tesla)', phase: 3, to: '/local' },
  { label: 'Science Codex', hint: 'The real laws behind every move', color: 'var(--curie)', phase: 5, to: '/codex' },
  { label: 'Leaderboard', hint: 'Atom → Black Hole', color: 'var(--einstein)', phase: 5, to: '/leaderboard' },
  { label: 'Profile', hint: 'Record · history · unlocks', color: 'var(--doppler)', phase: 5, to: '/profile' },
];

const TIER_COLOR: Record<string, string> = {
  ATOM: 'var(--tesla)', MOLECULE: 'var(--curie)', STAR: 'var(--newton)',
  SUPERNOVA: 'var(--doppler)', BLACK_HOLE: 'var(--einstein)',
};

export function MainMenuScreen() {
  const { player, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const [claiming, setClaiming] = useState(false);

  // Record/Elo may have changed in a match since the profile was loaded.
  useEffect(() => { void refresh(); }, [refresh]);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.menu-logo', { opacity: 0, y: -30, duration: 0.6 })
        .from('.menu-item', { opacity: 0, x: -60, stagger: 0.08, duration: 0.5 }, '-=0.3')
        .from('.player-card', { opacity: 0, x: 60, duration: 0.6 }, '-=0.5');
    }, root);
    return () => ctx.revert();
  }, []);

  if (!player) return null;
  const games = player.wins + player.losses;

  return (
    <div className="screen menu-screen" ref={root}>
      <h1 className="menu-logo"><span className="newton">NEWTON</span> <span className="brawl">BRAWL</span></h1>

      <div className="menu-layout">
        <nav className="menu-list">
          {MENU.map((m) => (
            <button key={m.label} className="menu-item" style={{ '--accent': m.color } as React.CSSProperties}
                    onMouseEnter={sfx.hover} aria-disabled={!m.to}
                    onClick={() => { sfx.click(); if (m.to) navigate(m.to); }}>
              <span className="menu-label">{m.label}</span>
              <span className="menu-hint">{m.hint}</span>
              <span className="menu-badge">{m.to ? 'Ready' : `Phase ${m.phase}`}</span>
            </button>
          ))}
        </nav>

        <aside className="player-card panel" style={{ '--accent': TIER_COLOR[player.rankTier] } as React.CSSProperties}>
          <div className="player-name">{player.displayName}</div>
          <div className="player-handle">@{player.username}</div>
          <div className="tier">
            <TierBadge tier={player.rankTier} size={34} />
            <span className="tier-name">{player.rankTierName}</span>
            <span className="tier-elo">{player.elo} Elo</span>
          </div>
          <dl className="stats">
            <div><dt>Wins</dt><dd>{player.wins}</dd></div>
            <div><dt>Losses</dt><dd>{player.losses}</dd></div>
            <div><dt>Win rate</dt><dd>{games ? `${player.winRate}%` : '—'}</dd></div>
          </dl>
          <div className="vp-next">{player.nextTierName ? `${player.nextTierElo - player.elo} Elo to ${player.nextTierName}` : 'Top of the ladder'}</div>
          {player.guest && (
            <div className="guest-banner">
              <b>Guest account.</b> Your progress lives on this device only, and ranked is locked.
              <button className="btn-neon" onClick={() => { sfx.click(); setClaiming(true); }}>Save my progress</button>
            </div>
          )}
          <button className="btn-ghost" onClick={() => {
            sfx.click();
            if (player.guest && !window.confirm('Log out of this guest account? Without an account you can\'t get back into it.')) return;
            logout();
          }}>Log out</button>
        </aside>
      </div>
      {claiming && <ClaimAccount onClose={() => setClaiming(false)} />}
    </div>
  );
}
