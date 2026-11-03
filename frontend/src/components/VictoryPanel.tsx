import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { LabNote, MatchReward } from '../api/progress';
import { TIERS, tierFor } from '../api/progress';
import { TierBadge, tierColor } from './TierBadge';
import { ChalkEquation } from './ChalkEquation';
import { lookFor } from '../game/render/characters/looks';
import { sfx } from '../audio/sfx';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Post-match screen content: Elo change (ranked), newly unlocked Codex entries and rewards, and
 * the Lab Note, a short explanation of the real science behind a move used in the match.
 */
export function VictoryPanel({ title, subtitle, score, reward, labNote, actions, variant }: {
  title: string; subtitle?: string; score?: string; reward?: MatchReward | null; labNote?: LabNote | null;
  actions: React.ReactNode; variant: 'victory' | 'defeat' | 'draw' | 'p2';
}) {
  const root = useRef<HTMLDivElement>(null);
  const note = labNote ?? reward?.labNote ?? null;

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from('.vp-title', { scale: 2, opacity: 0, duration: 0.45, ease: 'expo.out' })
        .from('.vp-section', { y: 30, opacity: 0, stagger: 0.15, duration: 0.45, ease: 'power3.out' }, '-=0.1');
    }, root);
    if (variant === 'victory') sfx.success();
    return () => ctx.revert();
  }, [variant]);

  return (
    <div className={`panel vp result-${variant}`} ref={root}>
      <div className="vp-title result-title">{title}</div>
      {score && <div className="result-score">{score}</div>}
      {subtitle && <p className="chalk-note">{subtitle}</p>}

      {reward?.mode === 'RANKED' && <EloChange reward={reward} />}

      {reward && (reward.newCodex.length > 0 || reward.newUnlocks.length > 0) && (
        <div className="vp-section vp-unlocks">
          {reward.newUnlocks.map((u) => (
            <div key={u.id} className="vp-unlock">
              <span className="vp-unlock-kind">{u.type === 'FIGHTER' ? 'NEW FIGHTER' : 'NEW SKIN'}</span>
              <b>{u.name}</b>
              {!u.available && <small>Arrives in a later update</small>}
            </div>
          ))}
          {reward.newCodex.length > 0 && (
            <div className="vp-codex">
              <span className="vp-unlock-kind">CODEX +{reward.newCodex.length}</span>
              <span>{reward.newCodex.map((e) => e.title).join(' · ')}</span>
            </div>
          )}
        </div>
      )}

      {note && <LabNoteCard note={note} />}

      <div className="vp-section overlay-actions">{actions}</div>
    </div>
  );
}

function EloChange({ reward }: { reward: MatchReward }) {
  const [shown, setShown] = useState(reward.eloBefore);
  const delta = reward.eloAfter - reward.eloBefore;
  const tier = tierFor(shown);
  const idx = TIERS.findIndex((t) => t.id === tier.id);
  const next = TIERS[idx + 1];
  const pct = next ? Math.max(0, Math.min(1, (shown - tier.min) / (next.min - tier.min))) * 100 : 100;
  const tierUp = TIERS.findIndex((t) => t.id === reward.tierAfter) > TIERS.findIndex((t) => t.id === reward.tierBefore);

  useEffect(() => {
    const o = { v: reward.eloBefore };
    const tw = gsap.to(o, { v: reward.eloAfter, duration: 1.2, delay: 0.6, ease: 'power2.out', onUpdate: () => setShown(Math.round(o.v)) });
    return () => { tw.kill(); };
  }, [reward.eloBefore, reward.eloAfter]);

  return (
    <div className="vp-section vp-elo" style={{ '--accent': tierColor(tier.id) } as React.CSSProperties}>
      <TierBadge tier={tier.id} size={54} />
      <div className="vp-elo-main">
        <div className="vp-elo-row">
          <span className="vp-elo-value">{shown}</span>
          <span className={`vp-elo-delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '+' : ''}{delta}</span>
          <span className="vp-tier-name">{tier.name}</span>
        </div>
        <div className="vp-progress"><div style={{ width: `${pct}%` }} /></div>
        <div className="vp-next">{next ? `${next.min - shown} to ${next.name}` : 'Top of the ladder'}</div>
      </div>
      {tierUp && <div className="vp-tierup">TIER UP!</div>}
    </div>
  );
}

export function LabNoteCard({ note }: { note: LabNote }) {
  const color = hex(lookFor(note.fighterId).glow);
  return (
    <div className="vp-section lab-note" style={{ '--accent': color } as React.CSSProperties}>
      <div className="lab-note-head">
        <span className="lab-note-tag">LAB NOTE</span>
        <span>{note.fighterName} · {note.moveName}</span>
      </div>
      {note.equation && <ChalkEquation text={note.equation} color={color} size={40} duration={0.9} />}
      <p className="lab-note-law">{note.law}</p>
      <p className="lab-note-text">{note.text}</p>
    </div>
  );
}
