import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { FighterDefinition } from '../game/protocol';
import { lookFor, skinName } from '../game/render/characters/looks';
import { CLASS_LABEL, ClassIcon } from './ClassIcon';
import { fighterImages } from './portraits';
import { sfx } from '../audio/sfx';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Quick-read ratings (1–5) shown on the cards. */
const RATINGS: Record<string, { power: number; speed: number; range: number }> = {
  newton: { power: 5, speed: 2, range: 3 },
  tesla: { power: 3, speed: 4, range: 5 },
  curie: { power: 4, speed: 3, range: 4 },
  einstein: { power: 3, speed: 5, range: 3 },
  galileo: { power: 2, speed: 5, range: 4 },
  archimedes: { power: 5, speed: 1, range: 3 },
  faraday: { power: 3, speed: 3, range: 4 },
  hooke: { power: 3, speed: 4, range: 4 },
  schrodinger: { power: 3, speed: 3, range: 4 },
  heisenberg: { power: 2, speed: 5, range: 3 },
  hawking: { power: 4, speed: 1, range: 5 },
  doppler: { power: 5, speed: 2, range: 4 },
};

export interface SelectPlayer {
  label: string;           // "P1", "YOU", "Opponent"…
  color: string;
  /** Currently highlighted fighter id. */
  cursor: string | null;
  locked: boolean;
}

interface Props {
  roster: FighterDefinition[];
  players: SelectPlayer[];
  /** Clicking a card (mouse users). */
  onCardClick?: (id: string) => void;
  title?: string;
  footer?: React.ReactNode;
  /** Fighter id → unlocked skins for the local player; fighters missing from it are locked. Omit = all usable. */
  usable?: Record<string, string[]>;
  /** Hints shown on locked cards (fighter id → requirement text). */
  lockHints?: Record<string, string>;
  skin?: string;
  onSkin?: (skin: string) => void;
}

/**
 * Character select: one card per scientist with its idle portrait, class badge, ratings and the
 * real physics behind each special. Purely presentational — screens decide what the cursors do.
 */
export function CharacterSelect({ roster, players, onCardClick, title = 'CHOOSE YOUR SCIENTIST', footer, usable, lockHints, skin, onSkin }: Props) {
  const [images, setImages] = useState<Record<string, string>>({});
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { void fighterImages().then(setImages); }, []);
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.cs-card', { opacity: 0, y: 50, stagger: 0.07, duration: 0.5, ease: 'power3.out' });
      gsap.from('.cs-title', { opacity: 0, letterSpacing: '0.8em', duration: 0.7 });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div className="cs" ref={root}>
      <h2 className="cs-title">{title}</h2>
      <div className="cs-grid">
        {roster.map((d) => {
          const look = lookFor(d.id);
          const color = hex(look.glow);
          const here = players.filter((p) => p.cursor === d.id);
          const r = RATINGS[d.id] ?? { power: 3, speed: 3, range: 3 };
          const unavailable = usable !== undefined && !usable[d.id];
          const skins = usable?.[d.id] ?? [];
          const mineHere = here.some((p) => p.label === players[0]?.label) && players[0]?.cursor === d.id;
          return (
            <button key={d.id} className={`cs-card ${here.length ? 'active' : ''} ${here.some((p) => p.locked) ? 'locked' : ''} ${unavailable ? 'unavailable' : ''}`}
                    style={{ '--accent': color } as React.CSSProperties} disabled={unavailable}
                    onMouseEnter={sfx.hover} onClick={() => !unavailable && onCardClick?.(d.id)} aria-pressed={here.length > 0}>
              {unavailable && <div className="cs-lock"><span>🔒 Locked</span><small>{lockHints?.[d.id] ?? 'Keep playing to unlock'}</small></div>}
              <div className="cs-tags">
                {here.map((p) => (
                  <span key={p.label} className="cs-tag" style={{ background: p.color }}>{p.label}{p.locked ? ' ✓' : ''}</span>
                ))}
              </div>
              <div className="cs-art">
                {images[d.id] ? <img src={images[d.id]} alt={`${d.name}, drawn in neon chalk`} /> : <div className="cs-art-loading" />}
              </div>
              <div className="cs-name">{d.name}</div>
              <div className="cs-class"><ClassIcon cls={d.fighterClass} size={16} /> {CLASS_LABEL[d.fighterClass]} · {d.title}</div>
              <dl className="cs-stats">
                {(['power', 'speed', 'range'] as const).map((k) => (
                  <div key={k}><dt>{k}</dt><dd>{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < r[k] ? 'on' : ''} />)}</dd></div>
                ))}
              </dl>
              {onSkin && mineHere && skins.length > 1 && (
                <div className="cs-skins" onClick={(e) => e.stopPropagation()}>
                  {skins.map((sk) => (
                    <span key={sk} role="button" tabIndex={0} className={`cs-skin ${sk === (skin ?? 'classic') ? 'on' : ''}`}
                          onClick={() => { sfx.click(); onSkin(sk); }} onKeyDown={(e) => e.key === 'Enter' && onSkin(sk)}>
                      {skinName(d.id, sk)}
                    </span>
                  ))}
                </div>
              )}
              <ul className="cs-moves">
                {(['special1', 'special2', 'ultimate'] as const).map((id) => {
                  const m = d.moves[id];
                  return m ? <li key={id}><b>{id === 'ultimate' ? 'ULT ' : ''}{m.name}</b><span>{m.equation}</span></li> : null;
                })}
              </ul>
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}
