import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { codexApi, unlocksApi, type Codex, type CodexPage, type UnlockStatus } from '../api/progress';
import { lookFor } from '../game/render/characters/looks';
import { fighterPortraits } from '../components/portraits';
import { ChalkEquation } from '../components/ChalkEquation';
import { sfx } from '../audio/sfx';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const FALLBACK = ['#ffa630', '#cd7f32', '#b87333', '#c8d2dc', '#2ee6c9', '#f2f2f2', '#9b59ff', '#ff4d6d', '#5fd7ff', '#ffd84d', '#9fe8ff', '#2ecc71'];

/**
 * The Science Codex: a page per scientist. Pages and move entries unlock as you meet fighters and
 * land (or suffer) their specials. Locked text stays hidden on the server until then.
 */
export function CodexScreen() {
  const [codex, setCodex] = useState<Codex | null>(null);
  const [unlocks, setUnlocks] = useState<UnlockStatus[]>([]);
  const [sel, setSel] = useState<string>('newton');
  const [faces, setFaces] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    codexApi.get().then(setCodex).catch(() => setError('Could not open the Codex.'));
    unlocksApi.list().then(setUnlocks).catch(() => undefined);
    void fighterPortraits().then(setFaces);
  }, []);

  const page = codex?.fighters.find((f) => f.id === sel) ?? null;
  const pct = codex ? Math.round((codex.unlockedCount / codex.totalCount) * 100) : 0;

  return (
    <div className="screen codex-screen">
      <header className="page-head">
        <h1 className="menu-logo"><span className="newton">SCIENCE</span> <span className="brawl">CODEX</span></h1>
        {codex && (
          <div className="codex-progress" aria-label={`${codex.unlockedCount} of ${codex.totalCount} entries`}>
            <div className="bar"><div style={{ width: `${pct}%` }} /></div>
            <span>{codex.unlockedCount} / {codex.totalCount} entries</span>
          </div>
        )}
      </header>
      {error && <p className="form-error">{error}</p>}
      {codex && (
        <div className="codex-layout">
          <nav className="codex-list" aria-label="Scientists">
            {codex.fighters.map((f, i) => {
              const color = f.available ? hex(lookFor(f.id).glow) : FALLBACK[i % FALLBACK.length];
              return (
                <button key={f.id} className={`codex-item ${f.id === sel ? 'active' : ''} ${f.unlocked ? '' : 'dim'}`}
                        style={{ '--accent': color } as React.CSSProperties}
                        onClick={() => { sfx.click(); setSel(f.id); }} onMouseEnter={sfx.hover}>
                  <span className="codex-face" style={faces[f.id] ? { backgroundImage: `url(${faces[f.id]})` } : undefined}>
                    {!faces[f.id] && f.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </span>
                  <span className="codex-item-name">{f.name}</span>
                  {!f.unlocked && <span className="codex-lock" aria-label="locked">🔒</span>}
                </button>
              );
            })}
          </nav>
          {page && <CodexPageView key={page.id} page={page} face={faces[page.id]} unlock={unlocks.find((u) => u.fighter === page.id && u.type === 'FIGHTER')}
                                   color={page.available ? hex(lookFor(page.id).glow) : FALLBACK[codex.fighters.indexOf(page) % FALLBACK.length]} />}
        </div>
      )}
      <Link className="btn-ghost" to="/">← Main menu</Link>
    </div>
  );
}

function CodexPageView({ page, face, color, unlock }: { page: CodexPage; face?: string; color: string; unlock?: UnlockStatus }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const ctx = gsap.context(() => gsap.from('.codex-anim', { opacity: 0, y: 16, stagger: 0.06, duration: 0.35 }), ref);
    return () => ctx.revert();
  }, []);
  return (
    <article className="codex-page panel" ref={ref} style={{ '--accent': color } as React.CSSProperties}>
      <div className="codex-hero codex-anim">
        <div className="codex-portrait" style={face ? { backgroundImage: `url(${face})` } : undefined} />
        <div>
          <h2>{page.name}</h2>
          <div className="codex-meta">{page.lived} · {page.origin}</div>
          {!page.available && <div className="codex-soon">Joins the roster in Phase {page.phase}{unlock ? ` · unlock: ${unlock.requirement} (${unlock.progress}/${unlock.target})` : ''}</div>}
        </div>
      </div>
      {page.unlocked ? (
        <>
          <p className="codex-bio codex-anim">{page.bio}</p>
          <div className="codex-fact codex-anim"><b>Fun fact</b> {page.funFact}</div>
        </>
      ) : (
        <p className="codex-locked codex-anim">
          {page.available ? `Play as or against ${page.name.split(' ').slice(-1)[0]} to unlock this page.` : 'This page unlocks when you first meet this scientist in a match.'}
        </p>
      )}
      {page.moves.length > 0 && (
        <div className="codex-moves">
          {page.moves.map((m) => (
            <section key={m.id} className={`codex-move codex-anim ${m.unlocked ? '' : 'locked'}`}>
              <header><span className="codex-move-kind">{m.move === 'ultimate' ? 'ULTIMATE' : m.move === 'special1' ? 'SPECIAL 1' : 'SPECIAL 2'}</span> <b>{m.name}</b></header>
              {m.equation && <ChalkEquation text={m.equation} color={m.unlocked ? color : '#5a6068'} size={34} duration={0.8} />}
              {m.unlocked
                ? <><p className="codex-law">{m.law}</p><p>{m.explain}</p></>
                : <p className="codex-locked">Land this move, or get hit by it, to unlock the science behind it.</p>}
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
