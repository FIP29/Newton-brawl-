import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FightRenderer } from '../game/render/FightRenderer';
import { InputController, KEYS_LOCAL_P1, KEYS_LOCAL_P2 } from '../game/input/InputController';
import { lerpFighter } from '../game/net/SnapshotBuffer';
import { MatchSimulation } from '../game/sim/MatchSimulation';
import { ARENAS, STANDARD_RULES } from '../game/sim/constants';
import { FIGHTERS, ROSTER as ROSTER_IDS } from '../game/data/fighters';
import { TICK_MS, type FighterDefinition, type GameEvent, type Snapshot } from '../game/protocol';
import { lookFor } from '../game/render/characters/looks';
import { sfx } from '../audio/sfx';
import { Banner, HudBar, useMatchPresentation } from '../components/FightHud';
import { CharacterSelect } from '../components/CharacterSelect';
import { useFightOverlays } from '../components/FightOverlays';
import { fighterPortraits } from '../components/portraits';
import { VictoryPanel } from '../components/VictoryPanel';
import { RivalryIntro, RivalryOutcome } from '../components/RivalryIntro';
import { rivalryFor } from '../game/data/rivalries';
import { codexApi, unlocksApi, type LabNote } from '../api/progress';

const NAMES = ['Player 1', 'Player 2'];
const ROSTER = ROSTER_IDS.map((id) => FIGHTERS[id]);
type ArenaChoice = 'the-lab' | 'space-station' | 'black-hole-edge' | 'curzon-hall' | 'random';
const ARENA_CYCLE: ArenaChoice[] = ['random', 'the-lab', 'space-station', 'black-hole-edge', 'curzon-hall'];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Offline 2-player mode on one keyboard: character select, then a match run entirely in the
 * browser by the TypeScript port of the server simulation (parity-tested against Java) at a
 * fixed 60 Hz. Rendering interpolates between the last two ticks for smooth high-refresh motion.
 */
export function LocalVersusScreen() {
  const [picks, setPicks] = useState<[string, string] | null>(null);
  const [arena, setArena] = useState<string>('the-lab');
  return picks
    ? <LocalFight picks={picks} arenaId={arena} onChangeFighters={() => setPicks(null)} />
    : <LocalSelect onDone={(p, a) => { setArena(a); setPicks(p); }} />;
}

// ----------------------------------------------------------------------------- select

function LocalSelect({ onDone }: { onDone: (picks: [string, string], arena: string) => void }) {
  const [cursor, setCursor] = useState<[number, number]>([0, 1]);
  const [locked, setLocked] = useState<[boolean, boolean]>([false, false]);
  const [usable, setUsable] = useState<Record<string, string[]> | undefined>(undefined);
  const [arena, setArena] = useState<ArenaChoice>('random');
  const state = useRef({ cursor, locked, usable });
  state.current = { cursor, locked, usable };

  // Unlocks belong to the logged-in account and apply to both local players.
  useEffect(() => {
    if (import.meta.env.DEV && location.search.includes('unlockAll')) return; // dev tooling: everything selectable
    unlocksApi.usable().then(setUsable).catch(() => setUsable({ newton: ['classic'], tesla: ['classic'], curie: ['classic'], einstein: ['classic'] }));
  }, []);
  const isUsable = (i: number) => !state.current.usable || !!state.current.usable[ROSTER[i].id];

  useEffect(() => {
    const move = (p: 0 | 1, d: number) => {
      if (state.current.locked[p]) return;
      sfx.hover();
      setCursor((c) => {
        const n = [...c] as [number, number];
        let i = n[p];
        for (let k = 0; k < ROSTER.length; k++) { i = (i + d + ROSTER.length) % ROSTER.length; if (isUsable(i)) break; } // skip locked
        n[p] = i;
        return n;
      });
    };
    const lock = (p: 0 | 1, v: boolean) => {
      if (v) sfx.success(); else sfx.click();
      setLocked((l) => { const n = [...l] as [boolean, boolean]; n[p] = v; return n; });
    };
    const onKey = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyA': move(0, -1); break;
        case 'KeyD': move(0, 1); break;
        case 'KeyJ': lock(0, true); break;
        case 'KeyK': lock(0, false); break;
        case 'ArrowLeft': e.preventDefault(); move(1, -1); break;
        case 'ArrowRight': e.preventDefault(); move(1, 1); break;
        case 'Numpad1': case 'Comma': lock(1, true); break;
        case 'Numpad2': case 'Period': lock(1, false); break;
        case 'KeyQ': sfx.click(); setArena((a) => ARENA_CYCLE[(ARENA_CYCLE.indexOf(a) + 1) % ARENA_CYCLE.length]); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!locked[0] || !locked[1]) return;
    const chosen = arena === 'random' ? ARENAS[Math.floor(Math.random() * ARENAS.length)].id : arena;
    const t = window.setTimeout(() => onDone([ROSTER[cursor[0]].id, ROSTER[cursor[1]].id], chosen), 700);
    return () => window.clearTimeout(t);
  }, [locked, cursor, onDone, arena]);

  const click = (id: string) => {
    const idx = ROSTER.findIndex((d) => d.id === id);
    const p: 0 | 1 = !locked[0] ? 0 : 1;
    if (locked[p]) return;
    setCursor((c) => { const n = [...c] as [number, number]; n[p] = idx; return n; });
    setLocked((l) => { const n = [...l] as [boolean, boolean]; n[p] = true; return n; });
    sfx.success();
  };

  return (
    <div className="screen select-screen">
      <CharacterSelect
        roster={ROSTER}
        usable={usable}
        onCardClick={click}
        players={[
          { label: 'P1', color: 'var(--newton)', cursor: ROSTER[cursor[0]].id, locked: locked[0] },
          { label: 'P2', color: 'var(--tesla)', cursor: ROSTER[cursor[1]].id, locked: locked[1] },
        ]}
        footer={
          <div className="cs-footer">
            <span className="arena-pick">Arena:
              {ARENA_CYCLE.map((a) => (
                <button key={a} className={`cs-skin ${arena === a ? 'on' : ''}`} style={{ '--accent': 'var(--tesla)' } as React.CSSProperties}
                        onClick={() => { sfx.click(); setArena(a); }}>{a === 'random' ? 'Random' : ARENAS.find((x) => x.id === a)!.name}</button>
              ))}
              <kbd>Q</kbd></span>
            <span><b>P1</b> <kbd>A</kbd><kbd>D</kbd> choose · <kbd>J</kbd> lock · <kbd>K</kbd> back</span>
            <span><b>P2</b> <kbd>←</kbd><kbd>→</kbd> choose · <kbd>1</kbd>/<kbd>,</kbd> lock · <kbd>2</kbd>/<kbd>.</kbd> back</span>
            <Link className="btn-ghost" to="/">← Menu</Link>
          </div>
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------------------ fight

function LocalFight({ picks, arenaId, onChangeFighters }: { picks: [string, string]; arenaId: string; onChangeFighters: () => void }) {
  const arena = ARENAS.find((a) => a.id === arenaId) ?? ARENAS[0];
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<{ winner: number; roundWins: number[] } | null>(null);
  const [game, setGame] = useState(0); // bump to restart
  const [images, setImages] = useState<Record<string, string>>({});
  const [labNote, setLabNote] = useState<LabNote | null>(null);
  const { hud, banner, push, reset } = useMatchPresentation();
  const overlays = useFightOverlays();
  const togglePause = useRef<() => void>(() => {});
  const defs: [FighterDefinition, FighterDefinition] = [FIGHTERS[picks[0]], FIGHTERS[picks[1]]];

  useEffect(() => { void fighterPortraits().then(setImages); }, []);

  useEffect(() => {
    if (!host) return;
    let disposed = false;
    let ready = false;
    let isPaused = false;
    reset();
    overlays.reset();
    setResult(null);
    setLabNote(null);
    setPaused(false);

    const sim = new MatchSimulation(arena, defs, STANDARD_RULES);
    if (import.meta.env.DEV) (window as unknown as { __nbLocalSim: MatchSimulation }).__nbLocalSim = sim; // dev tooling hook
    const p1 = new InputController(KEYS_LOCAL_P1, 0).attach();
    const p2 = new InputController(KEYS_LOCAL_P2, 1).attach();
    const renderer = new FightRenderer();
    const prevBits = [0, 0];
    // Specials landed per slot → the Lab Note explains the winner's favourite.
    const landed: Array<Record<string, number>> = [{}, {}];
    let prev: Snapshot = sim.snapshot();
    let curr: Snapshot = prev;
    let acc = 0;
    let reported = false;

    const handle = (e: GameEvent) => {
      const combo = renderer.onEvent(e);
      if ((e.type === 'HIT' || e.type === 'CAST') && e.move && e.attacker >= 0) {
        const m = defs[e.attacker].moves[e.move];
        if (m && (m.kind ?? 'NORMAL') !== 'NORMAL' && (e.type === 'HIT' || m.damage === 0)) {
          landed[e.attacker][e.move] = (landed[e.attacker][e.move] ?? 0) + 1;
        }
      }
      if (e.type === 'REFLECT') landed[e.attacker].ultimate = (landed[e.attacker].ultimate ?? 0) + 1;
      if (e.type === 'HIT' && e.move === 'ultimate' && defs[e.attacker].id === 'tesla') renderer.coilStrike(e.x, e.y);
      overlays.onEvent(e, defs, combo);
    };

    const tick = () => {
      const b0 = p1.sample(), b1 = p2.sample();
      sim.step({ held: b0, pressed: b0 & ~prevBits[0] }, { held: b1, pressed: b1 & ~prevBits[1] });
      prevBits[0] = b0;
      prevBits[1] = b1;
      prev = curr;
      curr = sim.snapshot();
      curr.events.forEach(handle);
    };

    const frame = () => {
      const dt = renderer.app.ticker.deltaMS;
      if (!isPaused) {
        acc += Math.min(dt, 250);
        while (acc >= TICK_MS) { tick(); acc -= TICK_MS; }
      }
      const alpha = isPaused ? 1 : acc / TICK_MS;
      renderer.render({
        fighters: curr.fighters.map((f, i) => lerpFighter(prev.fighters[i], f, alpha)),
        projectiles: curr.projectiles, zones: curr.zones, objects: curr.objects,
        hitstop: curr.hitstop, cinematic: curr.cinematic,
      }, isPaused ? 0 : dt);
      push(curr, defs.map((d) => d.maxHealth), STANDARD_RULES, defs.map((d) => d.name));
      if (sim.phase === 'FINISHED' && sim.result && !reported) {
        reported = true;
        setResult({ winner: sim.result.winner, roundWins: sim.result.roundWins });
        const who = Math.max(0, sim.result.winner);
        const fav = Object.entries(landed[who]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'special1';
        void codexApi.labNote(defs[who].id, fav).then(setLabNote).catch(() => setLabNote(null));
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
      if (import.meta.env.DEV) (window as unknown as { __nbRenderer: FightRenderer }).__nbRenderer = renderer;
      renderer.setup(arena, defs);
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
    // defs derive from picks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, game, picks, push, reset]);

  const fighterInfo = defs.map((d) => ({ id: d.id, name: d.name, color: hex(lookFor(d.id).glow) }));

  return (
    <div className="fight-screen">
      <div className="fight-canvas" ref={setHost} />
      <HudBar hud={hud} names={NAMES} fighters={fighterInfo} images={images} />
      {banner && !result && <Banner key={banner.key} text={banner.text} sub={banner.sub} />}
      {overlays.element}
      {defs.length === 2 && <RivalryIntro key={`rv-${game}`} defs={defs} />}

      {paused && !result && (
        <div className="fight-overlay">
          <div className="panel overlay-card">
            <div className="result-title small">Paused</div>
            <div className="overlay-actions">
              <button className="btn-neon" onClick={() => togglePause.current()}>Resume</button>
              <button className="btn-ghost" onClick={onChangeFighters}>Change fighters</button>
              <Link className="btn-ghost" to="/">Quit to menu</Link>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="fight-overlay scroll">
          <VictoryPanel
            title={result.winner < 0 ? 'DRAW' : `${defs[result.winner].name.toUpperCase()} WINS`}
            score={`${result.roundWins[0]} – ${result.roundWins[1]}`}
            labNote={labNote}
            extra={(() => { const rv = rivalryFor(defs[0].id, defs[1].id); return rv && <RivalryOutcome rivalry={rv} winner={result.winner >= 0 ? defs[result.winner] : null} />; })()}
            variant={result.winner === 1 ? 'p2' : result.winner === 0 ? 'victory' : 'draw'}
            actions={<>
              <button className="btn-neon" onClick={() => { sfx.click(); setGame((g) => g + 1); }}>Rematch</button>
              <button className="btn-ghost" onClick={onChangeFighters}>Change fighters</button>
              <Link className="btn-ghost" to="/">Main menu</Link>
            </>}
          />
        </div>
      )}

      <div className="controls-help panel local-help">
        <b>Player 1</b>
        <span><kbd>A</kbd><kbd>D</kbd><kbd>W</kbd><kbd>S</kbd> · <kbd>J</kbd> light <kbd>K</kbd> heavy <kbd>L</kbd> special (<kbd>S</kbd>+<kbd>L</kbd> special 2) · <kbd>I</kbd> ultimate</span>
      </div>
      <div className="controls-help panel local-help right">
        <b>Player 2</b>
        <span>Arrows · <kbd>1</kbd> light <kbd>2</kbd> heavy <kbd>3</kbd> special · <kbd>4</kbd> ultimate (or <kbd>,</kbd><kbd>.</kbd><kbd>/</kbd><kbd>'</kbd>)</span>
      </div>
      <div className="net-stats">Esc pause · H hitboxes · gamepads 1 &amp; 2</div>
    </div>
  );
}
