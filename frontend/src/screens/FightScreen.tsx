import { arenaTrack, music } from '../audio/music';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FightRenderer } from '../game/render/FightRenderer';
import { MatchConnection } from '../game/net/MatchConnection';
import { SnapshotBuffer } from '../game/net/SnapshotBuffer';
import { Predictor } from '../game/net/Predictor';
import { InputController, KEYS_ONLINE } from '../game/input/InputController';
import type { EndMessage, FighterDefinition, GameEvent, PlayerInfo, StartMessage, StateMessage } from '../game/protocol';
import { lookFor } from '../game/render/characters/looks';
import { roomsApi } from '../api/rooms';
import { useAuth } from '../auth/AuthContext';
import { sfx } from '../audio/sfx';
import { Banner, HudBar, useMatchPresentation } from '../components/FightHud';
import { CharacterSelect } from '../components/CharacterSelect';
import { useFightOverlays } from '../components/FightOverlays';
import { portraitsFor, setFightActive } from '../components/portraits';
import { VictoryPanel } from '../components/VictoryPanel';
import { RivalryIntro, RivalryOutcome } from '../components/RivalryIntro';
import { rivalryFor } from '../game/data/rivalries';
import { unlocksApi } from '../api/progress';

type Status = 'connecting' | 'select' | 'live' | 'ended' | 'error';
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Online fight. Data flow per display frame:
 *   input → MatchConnection (60 Hz packets) → server
 *                         ↘ Predictor (our fighter, instantly)
 *   server snapshots → SnapshotBuffer (opponent + entities, interpolated ~50 ms in the past)
 *                    → Predictor.onServerState (rewind + replay unacked inputs)
 *   renderer draws predicted-us + interpolated-everything-else; HUD reads the newest snapshot.
 * Before the match: character select inside the room (both players must pick).
 */
export function FightScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { player: me } = useAuth();
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<number>(-1);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [roster, setRoster] = useState<FighterDefinition[]>([]);
  const [hover, setHover] = useState(0);
  const [defs, setDefs] = useState<FighterDefinition[]>([]);
  const [end, setEnd] = useState<EndMessage | null>(null);
  const [ping, setPing] = useState(0);
  const [predicting, setPredicting] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [showHelp, setShowHelp] = useState(true);
  const [images, setImages] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'CASUAL' | 'RANKED' | 'PRIVATE'>('PRIVATE');
  const [usable, setUsable] = useState<Record<string, string[]> | undefined>(undefined);
  const [lockHints, setLockHints] = useState<Record<string, string>>({});
  const [skin, setSkin] = useState('classic');
  const [toast, setToast] = useState<string | null>(null);
  const { refresh } = useAuth();
  const { hud, banner, push, reset } = useMatchPresentation();
  const overlays = useFightOverlays();
  const connRef = useRef<MatchConnection | null>(null);
  const skinRef = useRef('classic');
  const selectRef = useRef({ hover: 0, roster: [] as FighterDefinition[], status: 'connecting' as Status });
  selectRef.current = { hover, roster, status };

  useEffect(() => {
    void unlocksApi.list().then((list) => {
      const hints: Record<string, string> = {};
      list.filter((u) => u.type === 'FIGHTER').forEach((u) => { hints[u.fighter] = `${u.requirement} (${u.progress}/${u.target})`; });
      setLockHints(hints);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!host) return;
    let disposed = false;
    let ready = false;
    let start: StartMessage | null = null;
    let mySlot = -1;
    let predictor: Predictor | null = null;
    let predictionOn = true;
    let latest: StateMessage | null = null;
    let lastEventTick = 0;
    let ended = false;
    reset();
    overlays.reset();

    const renderer = new FightRenderer();
    const buffer = new SnapshotBuffer();
    const input = new InputController(KEYS_ONLINE, 'any').attach();

    const handle = (e: GameEvent) => {
      if (!ready || !start) return;
      const combo = renderer.onEvent(e);
      if (e.type === 'HIT' && e.move === 'ultimate' && start.fighters[e.attacker].id === 'tesla') renderer.coilStrike(e.x, e.y);
      overlays.onEvent(e, start.fighters, combo);
    };

    const onStart = (msg: StartMessage) => {
      start = msg;
      // From here on no background image work may touch the GPU, except these two portraits, which
      // render right now during the "ROUND 1" countdown.
      setFightActive(true);
      void portraitsFor(msg.fighters.map((f) => f.id)).then((m) => { if (!disposed) setImages((old) => ({ ...old, ...m })); });
      setDefs(msg.fighters);
      if (mySlot >= 0) predictor = new Predictor(msg.arena, msg.fighters, mySlot);
      if (ready) renderer.setup(msg.arena, msg.fighters, skinsOf(msg));
      music.play(arenaTrack(msg.arena.id));
    };
    const skinsOf = (msg: StartMessage) => [0, 1].map((s) => msg.players.find((p) => p.slot === s)?.skin ?? null);

    const conn = new MatchConnection(code, {
      onMessage(msg) {
        switch (msg.t) {
          case 'welcome':
            mySlot = msg.slot;
            setSlot(msg.slot);
            setPlayers(msg.players);
            setRoster(msg.roster);
            setMode(msg.mode);
            setUsable(msg.usable);
            setStatus((s) => (s === 'live' ? s : 'select'));
            break;
          case 'lobby':
            setPlayers(msg.players);
            break;
          case 'start':
            setPlayers(msg.players);
            setStatus('live');
            onStart(msg);
            break;
          case 'state':
            buffer.push(msg, performance.now());
            predictor?.onServerState(msg);
            latest = msg;
            // Our own actions get feedback the moment the server confirms them (our fighter is predicted,
            // so it's already there). The opponent's, including their ULTIMATE, fire below when the
            // interpolated view reaches that tick, so the cinematic starts exactly as their fighter freezes.
            msg.events.forEach((e) => { if (e.attacker === mySlot) handle(e); });
            break;
          case 'end':
            ended = true;
            setFightActive(false);
            setEnd(msg);
            void refresh();
            window.setTimeout(() => !disposed && setStatus('ended'), 1200);
            break;
          case 'error':
            if (msg.code === 'LOCKED') { sfx.error(); setToast(msg.message); break; }
            setError(msg.message);
            setStatus('error');
            break;
        }
      },
      onInputSent(seq, bits) {
        predictor?.onInputSent(seq, bits);
      },
      onClose(closeCode) {
        if (ended || disposed) return;
        setStatus('error');
        setError((e) => e ?? (closeCode === 1006 ? 'Connection lost.' : 'Disconnected from the match.'));
      },
    });
    connRef.current = conn;

    const frame = () => {
      const now = performance.now();
      const dt = renderer.app.ticker.deltaMS;
      // Inputs only flow once the match is on (keys are used for character select before that).
      if (start) conn.pump(now, () => input.sample()); else input.sample();
      const tick = buffer.renderTick(now);
      const sample = buffer.sample(tick);
      if (!sample || !latest || !start) return;

      // Everyone else's events fire when the interpolated view reaches their tick.
      for (const s of buffer.between(lastEventTick, Math.floor(tick))) {
        s.events.forEach((e) => { if (e.attacker !== mySlot) handle(e); });
        lastEventTick = s.tick;
      }

      const fighters = sample.fighters.slice();
      const mine = predictionOn ? predictor?.view(dt) : null;
      if (mine && mySlot >= 0) fighters[mySlot] = mine;
      renderer.render({
        fighters, projectiles: sample.projectiles, zones: sample.base.zones, objects: sample.objects,
        // Freeze the camera with what's on screen (the interpolated snapshot), not the newest packet.
        hitstop: sample.base.hitstop, cinematic: sample.base.cinematic,
      }, dt);
      push(latest, start.fighters.map((f) => f.maxHealth), start.rules, start.fighters.map((f) => f.name));
    };

    const onVisibility = () => { if (document.hidden) conn.releaseAll(); };
    const onKey = (e: KeyboardEvent) => {
      const sel = selectRef.current;
      if (sel.status === 'select' && sel.roster.length) {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') { sfx.hover(); setHover((h) => (h + sel.roster.length - 1) % sel.roster.length); }
        if (e.code === 'KeyD' || e.code === 'ArrowRight') { sfx.hover(); setHover((h) => (h + 1) % sel.roster.length); }
        if (e.code === 'KeyJ' || e.code === 'Enter') { sfx.success(); conn.pick(sel.roster[sel.hover].id, skinRef.current); }
        return;
      }
      if (e.code === 'KeyH') renderer.showHitboxes = !renderer.showHitboxes;
      if (e.code === 'KeyP') { predictionOn = !predictionOn; setPredicting(predictionOn); }
      if (e.code === 'Slash' || e.code === 'F1') { e.preventDefault(); setShowHelp((v) => !v); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    const pingTimer = window.setInterval(() => setPing(Math.round(conn.rtt)), 1000);

    renderer.init(host).then(() => {
      if (disposed) { renderer.destroy(); return; }
      ready = true;
      if (import.meta.env.DEV) (window as unknown as { __nbRenderer: FightRenderer }).__nbRenderer = renderer;
      if (start) renderer.setup(start.arena, start.fighters, skinsOf(start));
      renderer.app.ticker.add(frame);
    });

    return () => {
      disposed = true;
      setFightActive(false);
      conn.close();
      connRef.current = null;
      input.detach();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey);
      window.clearInterval(pingTimer);
      if (ready) renderer.destroy();
    };
    // overlays.* are stable callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, attempt, host, push, reset, refresh]);

  const names = [0, 1].map((s) => players.find((p) => p.slot === s)?.displayName ?? (s === slot ? me?.displayName ?? 'You' : '???'));
  const result = end && (end.winner < 0 ? 'DRAW' : end.winner === slot ? 'VICTORY' : 'DEFEAT');
  const mine = players.find((p) => p.slot === slot);
  const theirs = players.find((p) => p.slot !== slot);
  const fighterInfo = defs.length === 2 ? defs.map((d) => ({ id: d.id, name: d.name, color: hex(lookFor(d.id).glow) })) : undefined;

  const pick = (id: string, withSkin?: string) => {
    sfx.success();
    const sk = withSkin ?? (id === mine?.fighter ? skin : 'classic');
    setHover(roster.findIndex((d) => d.id === id));
    setSkin(sk);
    skinRef.current = sk;
    connRef.current?.pick(id, sk);
  };

  const newRoom = async () => {
    sfx.click();
    try {
      const room = await roomsApi.create();
      navigate(`/fight/${room.code}`);
    } catch { /* stay */ }
  };

  return (
    <div className="fight-screen">
      <div className="fight-canvas" ref={setHost} />

      {(status === 'live' || status === 'ended') && <HudBar hud={hud} names={names} mySlot={slot} fighters={fighterInfo} images={images} />}
      {banner && status === 'live' && <Banner key={banner.key} text={banner.text} sub={banner.sub} />}
      {status === 'live' && overlays.element}
      {status === 'live' && defs.length === 2 && <RivalryIntro defs={defs} />}

      {status === 'connecting' && (
        <div className="fight-overlay"><div className="panel overlay-card"><p className="chalk-note">Connecting to the lab…</p></div></div>
      )}

      {status === 'select' && roster.length > 0 && (
        <div className="fight-overlay select-overlay">
          <CharacterSelect
            roster={roster}
            onCardClick={(id) => pick(id)}
            usable={usable}
            lockHints={lockHints}
            skin={skin}
            onSkin={(sk) => { const id = mine?.fighter ?? roster[hover]?.id; if (id) pick(id, sk); }}
            title={mode === 'PRIVATE' ? 'CHOOSE YOUR SCIENTIST' : `${mode} MATCH · CHOOSE YOUR SCIENTIST`}
            players={[
              { label: 'YOU', color: 'var(--newton)', cursor: mine?.fighter ?? roster[hover]?.id ?? null, locked: !!mine?.fighter },
              ...(theirs ? [{ label: theirs.displayName, color: 'var(--tesla)', cursor: theirs.fighter, locked: !!theirs.fighter }] : []),
            ]}
            footer={
              <div className="cs-footer">
                {mode === 'PRIVATE' ? (
                  <span className="room-line">Room <b className="room-code-inline">{code}</b>
                    <button className="btn-ghost small" onClick={() => { void navigator.clipboard?.writeText(code); sfx.success(); }}>Copy</button></span>
                ) : (
                  <span className={`mode-badge ${mode.toLowerCase()}`}>{mode}</span>
                )}
                <span>{!theirs ? 'Waiting for an opponent to join…' : theirs.fighter ? `${theirs.displayName} is ready` : `${theirs.displayName} is choosing…`}</span>
                <span><kbd>A</kbd><kbd>D</kbd> choose · <kbd>J</kbd> lock in (you can change until both are locked)</span>
                <Link className="btn-ghost" to="/play">Leave</Link>
              </div>
            }
          />
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
      {status === 'live' && mode !== 'PRIVATE' && <div className={`mode-badge floating ${mode.toLowerCase()}`}>{mode}</div>}

      {status === 'live' && players.some((p) => !p.connected) && (
        <div className="net-warning">Opponent disconnected — waiting for them to reconnect…</div>
      )}

      {status === 'ended' && end && (
        <div className="fight-overlay scroll">
          <VictoryPanel
            title={result ?? ''}
            score={`${end.roundWins[0]} – ${end.roundWins[1]}`}
            subtitle={reasonText(end, slot)}
            reward={end.reward}
            extra={(() => { const rv = defs.length === 2 ? rivalryFor(defs[0].id, defs[1].id) : null; return rv && <RivalryOutcome rivalry={rv} winner={end.winner >= 0 ? defs[end.winner] : null} />; })()}
            variant={result === 'VICTORY' ? 'victory' : result === 'DEFEAT' ? 'defeat' : 'draw'}
            actions={<>
              {mode === 'PRIVATE'
                ? <button className="btn-neon" onClick={newRoom}>New room</button>
                : <button className="btn-neon" onClick={() => navigate(`/play?queue=${mode.toLowerCase()}`)}>Play again</button>}
              <Link className="btn-ghost" to="/codex">Codex</Link>
              <Link className="btn-ghost" to="/">Main menu</Link>
            </>}
          />
        </div>
      )}

      {status === 'error' && (
        <div className="fight-overlay">
          <div className="panel overlay-card">
            <div className="result-title small">Signal lost</div>
            <p className="form-error">{error}</p>
            <div className="overlay-actions">
              {mode !== 'PRIVATE'
                ? <button className="btn-neon" onClick={() => navigate(`/play?queue=${mode.toLowerCase()}`)}>Back to the queue</button>
                : <button className="btn-neon" onClick={() => { setError(null); setStatus('connecting'); setAttempt((a) => a + 1); }}>Reconnect</button>}
              <Link className="btn-ghost" to="/play">Back</Link>
            </div>
          </div>
        </div>
      )}

      {status === 'live' && (
        <>
          <div className="net-stats">
            {ping ? `${ping} ms` : '…'} · prediction {predicting ? 'on' : 'off'} (P) · H hitboxes · / help
          </div>
          {showHelp && (
            <div className="controls-help panel">
              <b>Controls</b>
              <span><kbd>A</kbd><kbd>D</kbd> move · <kbd>W</kbd> jump · <kbd>S</kbd> crouch</span>
              <span><kbd>J</kbd> light · <kbd>K</kbd> heavy · <kbd>L</kbd> special · <kbd>S</kbd>+<kbd>L</kbd> special 2</span>
              <span><kbd>I</kbd> (or <kbd>K</kbd>+<kbd>L</kbd>) ULTIMATE when energy is full</span>
              <span>Gamepad: stick · A / B / X · Y jump · RB ultimate</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function reasonText(end: EndMessage, mySlot: number): string {
  switch (end.reason) {
    case 'DECISION':
      if (end.winner < 0) return 'A perfectly balanced draw. Equal and opposite.';
      return end.winner === mySlot ? 'Best of three: momentum was on your side.' : 'Every action has an equal and opposite reaction… next time.';
    case 'FORFEIT': return end.winner === mySlot ? 'Your opponent left the lab.' : 'You left the match.';
    default: return 'The match was stopped.';
  }
}
