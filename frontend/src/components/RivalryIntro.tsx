import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import type { FighterDefinition } from '../game/protocol';
import { rivalryFor, type Rivalry } from '../game/data/rivalries';
import { lookFor } from '../game/render/characters/looks';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Pre-fight exchange for famous pairings (Tesla vs Edison, Newton vs Hooke, Schrödinger vs
 * Heisenberg, and the Bose–Einstein duo). Plays over the round-1 countdown, then fades out.
 */
export function RivalryIntro({ defs }: { defs: FighterDefinition[] }) {
  const root = useRef<HTMLDivElement>(null);
  const r = defs.length === 2 ? rivalryFor(defs[0].id, defs[1].id) : null;
  useLayoutEffect(() => {
    if (!r) return;
    const ctx = gsap.context(() => {
      gsap.timeline()
        .from('.rv-title', { opacity: 0, scale: 1.6, letterSpacing: '0.6em', duration: 0.5, ease: 'expo.out' })
        .from('.rv-line.left', { opacity: 0, x: -60, duration: 0.45, ease: 'power3.out' }, '-=0.1')
        .from('.rv-line.right', { opacity: 0, x: 60, duration: 0.45, ease: 'power3.out' }, '+=0.5')
        .to(root.current, { opacity: 0, duration: 0.6 }, '+=1.8');
    }, root);
    return () => ctx.revert();
  }, [r]);
  if (!r) return null;
  return (
    <div className="rivalry-intro" ref={root} aria-live="polite">
      <div className="rv-title">{r.kind === 'DUO' ? 'LEGENDARY DUO' : 'RIVALRY'}<small>{r.title}</small></div>
      {defs.map((d, i) => (
        <blockquote key={d.id + i} className={`rv-line ${i === 0 ? 'left' : 'right'}`} style={{ '--accent': hex(lookFor(d.id).glow) } as React.CSSProperties}>
          <b>{d.name}</b>
          <span>“{r.intro[d.id]}”</span>
        </blockquote>
      ))}
    </div>
  );
}

/** Victory line + history for a rivalry match (shown on the result screen). */
export function RivalryOutcome({ rivalry, winner }: { rivalry: Rivalry; winner: FighterDefinition | null }) {
  const color = winner ? hex(lookFor(winner.id).glow) : '#e9ece4';
  return (
    <div className="vp-section rivalry-outcome" style={{ '--accent': color } as React.CSSProperties}>
      <span className="vp-unlock-kind">{rivalry.kind === 'DUO' ? 'LEGENDARY DUO' : 'RIVALRY'} · {rivalry.title}</span>
      {winner && <blockquote><b>{winner.name}:</b> “{rivalry.victory[winner.id]}”</blockquote>}
      <p>{rivalry.fact}</p>
    </div>
  );
}
