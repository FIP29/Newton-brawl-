import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { MatchRules, Snapshot } from '../game/protocol';
import { ENERGY_MAX, TICK_RATE } from '../game/sim/constants';

/** Everything the HUD shows; recomputed from snapshots but only re-rendered when it changes. */
export interface HudState {
  health: number[];
  maxHealth: number[];
  energy: number[];
  roundWins: number[];
  roundsToWin: number;
  round: number;
  seconds: number;
}

export interface BannerState { text: string; sub?: string; key: number }

/**
 * Turns a stream of snapshots into HUD state and round banners
 * ("ROUND 1" → "FIGHT!" → "K.O." / "TIME" → "... wins the round").
 */
export function useMatchPresentation() {
  const [hud, setHud] = useState<HudState | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const prev = useRef<Snapshot | null>(null);
  const lastKey = useRef('');

  const push = useCallback((s: Snapshot, maxHealth: number[], rules: MatchRules, names: string[]) => {
    const seconds = Math.max(0, Math.ceil(s.timer / TICK_RATE));
    const key = `${s.fighters[0].health}|${s.fighters[1].health}|${s.fighters[0].energy}|${s.fighters[1].energy}|${s.roundWins}|${s.round}|${seconds}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      setHud({
        health: s.fighters.map((f) => f.health), maxHealth,
        energy: s.fighters.map((f) => f.energy),
        roundWins: s.roundWins, roundsToWin: rules.roundsToWin, round: s.round, seconds,
      });
    }

    const p = prev.current;
    prev.current = s;
    const show = (text: string, sub?: string) => setBanner({ text, sub, key: performance.now() });
    if (s.phase === 'ROUND_START' && (p === null || p.phase !== 'ROUND_START' || p.round !== s.round)) {
      const final = s.roundWins.every((w) => w === rules.roundsToWin - 1) && s.round > 1;
      show(final ? 'FINAL ROUND' : `ROUND ${s.round}`);
    } else if (s.phase === 'FIGHTING' && (p === null || p.phase === 'ROUND_START')) {
      show('FIGHT!');
    } else if (s.phase === 'ROUND_END' && p && p.phase === 'FIGHTING' && s.lastRound) {
      const r = s.lastRound;
      const text = r.reason === 'KO' ? 'K.O.' : r.reason === 'DOUBLE_KO' ? 'DOUBLE K.O.' : 'TIME';
      show(text, r.winner < 0 ? 'Draw round' : `${names[r.winner]} wins the round`);
    }
  }, []);

  const reset = useCallback(() => {
    prev.current = null;
    lastKey.current = '';
    setHud(null);
    setBanner(null);
  }, []);

  return { hud, banner, push, reset };
}

export function HudBar({ hud, names, mySlot }: { hud: HudState | null; names: string[]; mySlot?: number }) {
  return (
    <div className="hud">
      {[0, 1].map((s) => {
        const pct = hud ? Math.max(0, hud.health[s] / hud.maxHealth[s]) * 100 : 100;
        const energy = hud ? hud.energy[s] / ENERGY_MAX * 100 : 0;
        const full = energy >= 100;
        return (
          <div key={s} className={`hud-side side-${s}`}>
            <div className="hud-name">
              {names[s]} {s === mySlot && <span className="you-tag">YOU</span>}
            </div>
            <div className="health" role="meter" aria-label={`${names[s]} health`} aria-valuenow={hud?.health[s]}>
              <div className="health-ghost" style={{ width: `${pct}%` }} />
              <div className="health-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="hud-sub">
              <div className={`energy ${full ? 'full' : ''}`} role="meter" aria-label={`${names[s]} energy`}>
                <div className="energy-fill" style={{ width: `${energy}%` }} />
              </div>
              <div className="pips" aria-label={`${hud?.roundWins[s] ?? 0} rounds won`}>
                {Array.from({ length: hud?.roundsToWin ?? 2 }, (_, i) => (
                  <span key={i} className={`pip ${(hud?.roundWins[s] ?? 0) > i ? 'won' : ''}`} />
                ))}
              </div>
            </div>
            {full && <div className="ult-ready">ULTIMATE READY</div>}
          </div>
        );
      })}
      <div className="hud-center">
        <div className={`hud-timer ${hud && hud.seconds <= 10 ? 'low' : ''}`}>{hud ? String(hud.seconds).padStart(2, '0') : '99'}</div>
        <div className="hud-round">ROUND {hud?.round ?? 1}</div>
      </div>
    </div>
  );
}

export function Banner({ text, sub }: { text: string; sub?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const hold = text.startsWith('ROUND') || text === 'FINAL ROUND' ? 1.1 : sub ? 1.4 : 0.6;
    const tl = gsap.timeline();
    tl.fromTo(ref.current, { scale: 2.4, opacity: 0, letterSpacing: '0.6em' },
                           { scale: 1, opacity: 1, letterSpacing: '0.08em', duration: 0.35, ease: 'expo.out' })
      .to(ref.current, { opacity: 0, scale: 0.9, duration: 0.3, delay: hold });
    return () => { tl.kill(); };
  }, [text, sub]);
  const ko = text.includes('K.O.') || text === 'TIME';
  return (
    <div ref={ref} className={`banner ${ko ? 'ko' : ''}`}>
      {text}
      {sub && <div className="banner-sub">{sub}</div>}
    </div>
  );
}
