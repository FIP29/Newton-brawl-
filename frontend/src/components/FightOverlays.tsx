import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { FighterDefinition, GameEvent } from '../game/protocol';
import { lookFor } from '../game/render/characters/looks';
import { ChalkEquation } from './ChalkEquation';
import { sfx } from '../audio/sfx';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

interface Flash { key: number; text: string; name: string; color: string; side: number }
interface Combo { key: number; count: number; side: number; color: string }
interface Cinematic { key: number; slot: number; def: FighterDefinition }

/**
 * DOM overlays that teach the science while you fight:
 *  - when a special lands, its equation writes itself in glowing chalk
 *  - combo counter
 *  - ULTIMATE cinematic: portrait slides in, the equation writes itself, then the attack fires
 * (The server freezes the world for exactly the cinematic's length, so both players see it.)
 */
export function useFightOverlays() {
  const [flash, setFlash] = useState<Flash | null>(null);
  const [combo, setCombo] = useState<Combo | null>(null);
  const [cine, setCine] = useState<Cinematic | null>(null);
  const lastFlash = useRef<Record<string, number>>({});

  const onEvent = useCallback((e: GameEvent, defs: FighterDefinition[], comboCount: number) => {
    const def = defs[e.attacker];
    if (!def) return;
    const move = e.move ? def.moves[e.move] : undefined;
    const color = hex(lookFor(def.id).glow);
    if (e.type === 'ULTIMATE') {
      setCine({ key: performance.now(), slot: e.attacker, def });
      sfx.ultimate();
      return;
    }
    if (e.type === 'HIT' || e.type === 'REFLECT') sfx.hit(e.damage >= 100, def.id);
    if (e.type === 'CAST' && move) sfx.special(def.id);
    if (e.type === 'ARC') sfx.zap();
    if (e.type === 'CLANK') sfx.clank();

    if (e.type === 'HIT' && comboCount >= 2) setCombo({ key: performance.now(), count: comboCount, side: e.attacker, color });

    // Equation flash: on a landed special, or on cast for specials that don't deal damage.
    const kind = move?.kind ?? 'NORMAL';
    const eligible = move?.equation && kind === 'SPECIAL'
      && ((e.type === 'HIT' && move.damage > 0) || (e.type === 'CAST' && move.damage === 0));
    const reflectEq = e.type === 'REFLECT';
    if (eligible || reflectEq) {
      const key = reflectEq ? 'reflect' : `${def.id}.${e.move}`;
      const now = performance.now();
      if (now - (lastFlash.current[key] ?? 0) < 1500) return;
      lastFlash.current[key] = now;
      if (reflectEq) {
        const newton = defs[e.attacker];
        const ult = newton.moves.ultimate;
        setFlash({ key: now, text: ult?.equation ?? 'F₁₂ = −F₂₁', name: ult?.name ?? 'Third Law', color, side: e.attacker });
      } else {
        setFlash({ key: now, text: move!.equation!, name: move!.name ?? '', color, side: e.attacker });
      }
    }
  }, []);

  const reset = useCallback(() => { setFlash(null); setCombo(null); setCine(null); }, []);

  const element = (
    <>
      {flash && <EquationFlash {...flash} key={flash.key} />}
      {combo && <ComboBadge {...combo} key={combo.key} />}
      {cine && <UltimateCinematic key={cine.key} def={cine.def} slot={cine.slot} onDone={() => setCine(null)} />}
    </>
  );
  return { element, onEvent, reset };
}

function EquationFlash({ text, name, color, side }: Flash) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(ref.current, { opacity: 0, y: 20, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'back.out(2)' })
      .to(ref.current, { opacity: 0, y: -10, duration: 0.4, delay: 1.5 });
    return () => { tl.kill(); };
  }, []);
  return (
    <div ref={ref} className={`eq-flash side-${side}`} style={{ '--accent': color } as React.CSSProperties} role="status">
      <ChalkEquation text={text} color={color} size={58} />
      <div className="eq-name">{name}</div>
    </div>
  );
}

function ComboBadge({ count, side, color }: Combo) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(ref.current, { scale: 1.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.18, ease: 'back.out(3)' })
      .to(ref.current, { opacity: 0, duration: 0.3, delay: 0.9 });
    return () => { tl.kill(); };
  }, []);
  return (
    <div ref={ref} className={`combo side-${side}`} style={{ '--accent': color } as React.CSSProperties}>
      <span className="combo-n">{count}</span> HITS
    </div>
  );
}

function UltimateCinematic({ def, slot, onDone }: { def: FighterDefinition; slot: number; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<string | null>(null);
  const color = hex(lookFor(def.id).glow);
  const ult = def.moves.ultimate;
  useLayoutEffect(() => {
    void import('./portraits').then((m) => m.fighterPortraits()).then((imgs) => setImg(imgs[def.id] ?? null));
    const from = slot === 0 ? -110 : 110;
    const tl = gsap.timeline({ onComplete: onDone });
    tl.fromTo(ref.current!.querySelector('.cine-band'), { xPercent: from }, { xPercent: 0, duration: 0.28, ease: 'power4.out' })
      .fromTo(ref.current!.querySelector('.cine-name'), { opacity: 0, x: from * 0.5 }, { opacity: 1, x: 0, duration: 0.25 }, '-=0.1')
      .to(ref.current, { opacity: 0, duration: 0.18, delay: 0.55 });
    return () => { tl.kill(); };
  }, [def.id, slot, onDone]);
  return (
    <div ref={ref} className={`cinematic side-${slot}`} style={{ '--accent': color } as React.CSSProperties} aria-live="assertive">
      <div className="cine-band">
        <div className="cine-portrait" style={img ? { backgroundImage: `url(${img})` } : undefined} />
        <div className="cine-text">
          <div className="cine-name">{def.name.toUpperCase()}</div>
          <div className="cine-ult">ULTIMATE · {ult?.name}</div>
          <ChalkEquation text={ult?.equation ?? ''} color={color} size={84} duration={0.55} />
        </div>
      </div>
    </div>
  );
}
