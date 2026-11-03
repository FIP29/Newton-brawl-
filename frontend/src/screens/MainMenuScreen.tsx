import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { useAuth } from '../auth/AuthContext';
import { sfx } from '../audio/sfx';

interface MenuItem { label: string; hint: string; color: string; phase: number }

/** Menu entries light up as later phases ship; for now they show which phase delivers them. */
const MENU: MenuItem[] = [
  { label: 'Play Online', hint: 'Casual · Ranked · Room code', color: 'var(--newton)', phase: 2 },
  { label: 'Local Versus', hint: 'Two players, one keyboard', color: 'var(--tesla)', phase: 3 },
  { label: 'Science Codex', hint: 'The real laws behind every move', color: 'var(--curie)', phase: 5 },
  { label: 'Leaderboard', hint: 'Atom → Black Hole', color: 'var(--einstein)', phase: 5 },
];

const TIER_COLOR: Record<string, string> = {
  ATOM: 'var(--tesla)', MOLECULE: 'var(--curie)', STAR: 'var(--newton)',
  SUPERNOVA: 'var(--doppler)', BLACK_HOLE: 'var(--einstein)',
};

export function MainMenuScreen() {
  const { player, logout } = useAuth();
  const root = useRef<HTMLDivElement>(null);

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
                    onMouseEnter={sfx.hover} onClick={sfx.click} aria-disabled="true">
              <span className="menu-label">{m.label}</span>
              <span className="menu-hint">{m.hint}</span>
              <span className="menu-badge">Phase {m.phase}</span>
            </button>
          ))}
        </nav>

        <aside className="player-card panel" style={{ '--accent': TIER_COLOR[player.rankTier] } as React.CSSProperties}>
          <div className="player-name">{player.displayName}</div>
          <div className="player-handle">@{player.username}</div>
          <div className="tier">
            <span className="tier-name">{player.rankTierName}</span>
            <span className="tier-elo">{player.elo} Elo</span>
          </div>
          <dl className="stats">
            <div><dt>Wins</dt><dd>{player.wins}</dd></div>
            <div><dt>Losses</dt><dd>{player.losses}</dd></div>
            <div><dt>Win rate</dt><dd>{games ? `${player.winRate}%` : '—'}</dd></div>
          </dl>
          <button className="btn-ghost" onClick={() => { sfx.click(); logout(); }}>Log out</button>
        </aside>
      </div>
    </div>
  );
}
