import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FightRenderer } from '../game/render/FightRenderer';
import { InputController, KEYS_LOCAL_P1, KEYS_LOCAL_P2 } from '../game/input/InputController';
import { lerpFighter } from '../game/net/SnapshotBuffer';
import { MatchSimulation } from '../game/sim/MatchSimulation';
import { STANDARD_RULES, THE_LAB } from '../game/sim/constants';
import { fighter } from '../game/data/fighters';
import { TICK_MS, type Snapshot } from '../game/protocol';
import { sfx } from '../audio/sfx';
import { Banner, HudBar, useMatchPresentation } from '../components/FightHud';

const NAMES = ['Player 1', 'Player 2'];

/**
 * Offline 2-player mode on one keyboard. Runs the TypeScript port of the server simulation
 * (parity-tested against Java) at a fixed 60 Hz in the browser; rendering interpolates between
 * the last two ticks so motion stays smooth on high-refresh displays.
 */
export function LocalVersusScreen() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<{ winner: number; roundWins: number[] } | null>(null);
  const [game, setGame] = useState(0); // bump to restart
  const { hud, banner, push, reset } = useMatchPresentation();
  const togglePause = useRef<() => void>(() => {});

  useEffect(() => {
    if (!host) return;
    let disposed = false;
    let ready = false;
    let isPaused = false;
    reset();
    setResult(null);
    setPaused(false);

    const defs: [ReturnType<typeof fighter>, ReturnType<typeof fighter>] = [fighter('prototype'), fighter('prototype')];
    const sim = new MatchSimulation(THE_LAB, defs, STANDARD_RULES);
    const p1 = new InputController(KEYS_LOCAL_P1, 0).attach();
    const p2 = new InputController(KEYS_LOCAL_P2, 1).attach();
    const renderer = new FightRenderer();
    const prevBits = [0, 0];
    let prev: Snapshot = sim.snapshot();
    let curr: Snapshot = prev;
    let acc = 0;
    let reported = false;

    const tick = () => {
      const b0 = p1.sample(), b1 = p2.sample();
      sim.step({ held: b0, pressed: b0 & ~prevBits[0] }, { held: b1, pressed: b1 & ~prevBits[1] });
      prevBits[0] = b0;
      prevBits[1] = b1;
      prev = curr;
      curr = sim.snapshot();
      curr.events.forEach((e) => { renderer.onHit(e); if (e.damage >= 100) sfx.error(); else sfx.click(); });
    };

    const frame = () => {
      const dt = renderer.app.ticker.deltaMS;
      if (!isPaused) {
        acc += Math.min(dt, 250);
        while (acc >= TICK_MS) { tick(); acc -= TICK_MS; }
      }
      const alpha = isPaused ? 1 : acc / TICK_MS;
      const fighters = curr.fighters.map((f, i) => lerpFighter(prev.fighters[i], f, alpha));
      renderer.render(fighters, curr.hitstop, dt);
      push(curr, defs.map((d) => d.maxHealth), STANDARD_RULES, NAMES);
      if (sim.phase === 'FINISHED' && sim.result && !reported) {
        reported = true;
        setResult({ winner: sim.result.winner, roundWins: sim.result.roundWins });
      }
    };

    togglePause.current = () => {
      if (sim.phase === 'FINISHED') return;
      isPaused = !isPaused;
      setPaused(isPaused);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') togglePause.current();
      if (e.code === 'KeyH') renderer.showHitboxes = !renderer.showHitboxes;
    };
    const onVisibility = () => { if (document.hidden && !isPaused) { isPaused = true; setPaused(true); } };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);

    renderer.init(host).then(() => {
      if (disposed) { renderer.destroy(); return; }
      ready = true;
      renderer.setup(THE_LAB, defs);
      renderer.app.ticker.add(frame);
    });

    return () => {
      disposed = true;
      p1.detach();
      p2.detach();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      if (ready) renderer.destroy();
    };
  }, [host, game, push, reset]);

  return (
    <div className="fight-screen">
      <div className="fight-canvas" ref={setHost} />
      <HudBar hud={hud} names={NAMES} />
      {banner && !result && <Banner key={banner.key} text={banner.text} sub={banner.sub} />}

      {paused && !result && (
        <div className="fight-overlay">
          <div className="panel overlay-card">
            <div className="result-title small">Paused</div>
            <div className="overlay-actions">
              <button className="btn-neon" onClick={() => togglePause.current()}>Resume</button>
              <Link className="btn-ghost" to="/">Quit to menu</Link>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="fight-overlay">
          <div className={`panel overlay-card ${result.winner === 1 ? 'result-p2' : result.winner === 0 ? 'result-victory' : 'result-draw'}`}>
            <div className="result-title">{result.winner < 0 ? 'DRAW' : `${NAMES[result.winner].toUpperCase()} WINS`}</div>
            <div className="result-score">{result.roundWins[0]} – {result.roundWins[1]}</div>
            <div className="overlay-actions">
              <button className="btn-neon" onClick={() => { sfx.click(); setGame((g) => g + 1); }}>Rematch</button>
              <Link className="btn-ghost" to="/">Main menu</Link>
            </div>
          </div>
        </div>
      )}

      <div className="controls-help panel local-help">
        <b>Player 1</b>
        <span><kbd>A</kbd><kbd>D</kbd> move · <kbd>W</kbd> jump · <kbd>S</kbd> crouch · <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd></span>
      </div>
      <div className="controls-help panel local-help right">
        <b>Player 2</b>
        <span><kbd>←</kbd><kbd>→</kbd> move · <kbd>↑</kbd> jump · <kbd>↓</kbd> crouch · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> (or <kbd>,</kbd><kbd>.</kbd><kbd>/</kbd>)</span>
      </div>
      <div className="net-stats">Esc pause · H hitboxes · gamepads 1 &amp; 2 supported</div>
    </div>
  );
}
