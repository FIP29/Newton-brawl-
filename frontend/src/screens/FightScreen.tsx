import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FightRenderer } from '../game/render/FightRenderer';
import { MatchConnection } from '../game/net/MatchConnection';
import { SnapshotBuffer } from '../game/net/SnapshotBuffer';
import { Predictor } from '../game/net/Predictor';
import { InputController, KEYS_ONLINE } from '../game/input/InputController';
import type { EndMessage, PlayerInfo, StartMessage, StateMessage } from '../game/protocol';
import { roomsApi } from '../api/rooms';
import { useAuth } from '../auth/AuthContext';
import { sfx } from '../audio/sfx';
import { Banner, HudBar, useMatchPresentation } from '../components/FightHud';

type Status = 'connecting' | 'waiting' | 'live' | 'ended' | 'error';

/**
 * Online fight. Data flow per display frame:
 *   input → MatchConnection (60 Hz packets) → server
 *                         ↘ Predictor (our fighter, instantly)
 *   server snapshots → SnapshotBuffer (opponent, interpolated ~50 ms in the past)
 *                    → Predictor.onServerState (rewind + replay unacked inputs)
 *   renderer draws predicted-us + interpolated-them; HUD reads the newest snapshot.
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
  const [end, setEnd] = useState<EndMessage | null>(null);
  const [ping, setPing] = useState(0);
  const [predicting, setPredicting] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [showHelp, setShowHelp] = useState(true);
  const { hud, banner, push, reset } = useMatchPresentation();

  useEffect(() => {
    if (!host) return;
    let disposed = false;
    let ready = false;                         // renderer initialised
    let start: StartMessage | null = null;     // match config (fighters, arena, rules)
    let mySlot = -1;
    let names: string[] = ['P1', 'P2'];
    let predictor: Predictor | null = null;
    let predictionOn = true;
    let latest: StateMessage | null = null;
    let lastEventTick = 0;
    let ended = false;
    reset();

    const renderer = new FightRenderer();
    const buffer = new SnapshotBuffer();
    const input = new InputController(KEYS_ONLINE, 'any').attach();

    const onStart = (msg: StartMessage) => {
      start = msg;
      names = [0, 1].map((s) => msg.players.find((p) => p.slot === s)?.displayName ?? `P${s + 1}`);
      if (mySlot >= 0) predictor = new Predictor(msg.arena, msg.fighters, mySlot);
      if (ready) renderer.setup(msg.arena, msg.fighters);
    };

    const conn = new MatchConnection(code, {
      onMessage(msg) {
        switch (msg.t) {
          case 'welcome':
            mySlot = msg.slot;
            setSlot(msg.slot);
            setPlayers(msg.players);
            setStatus((s) => (s === 'live' ? s : 'waiting'));
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
            // Our own hits get feedback the moment the server confirms them.
            msg.events.forEach((e) => { if (e.attacker === mySlot && ready) hitFx(e); });
            break;
          case 'end':
            ended = true;
            setEnd(msg);
            window.setTimeout(() => !disposed && setStatus('ended'), 900);
            break;
          case 'error':
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

    const hitFx = (e: StateMessage['events'][number]) => {
      renderer.onHit(e);
      if (e.damage >= 100) sfx.error(); else sfx.click();
    };

    const frame = () => {
      const now = performance.now();
      conn.pump(now, () => input.sample());
      const dt = renderer.app.ticker.deltaMS;
      const tick = buffer.renderTick(now);
      const sample = buffer.sample(tick);
      if (!sample || !latest || !start) return;

      // Opponent's hits fire when the interpolated view reaches the tick they happened on.
      for (const s of buffer.between(lastEventTick, Math.floor(tick))) {
        s.events.forEach((e) => { if (e.attacker !== mySlot) hitFx(e); });
        lastEventTick = s.tick;
      }

      const fighters = sample.fighters.slice();
      const mine = predictionOn ? predictor?.view(dt) : null;
      if (mine && mySlot >= 0) fighters[mySlot] = mine;
      renderer.render(fighters, latest.hitstop, dt);
      push(latest, start.fighters.map((f) => f.maxHealth), start.rules, names);
    };

    const onVisibility = () => { if (document.hidden) conn.releaseAll(); };
    const onKey = (e: KeyboardEvent) => {
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
      if (start) renderer.setup(start.arena, start.fighters);
      renderer.app.ticker.add(frame);
    });

    return () => {
      disposed = true;
      conn.close();
      input.detach();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey);
      window.clearInterval(pingTimer);
      if (ready) renderer.destroy();
    };
  }, [code, attempt, host, push, reset]);

  const names = [0, 1].map((s) => players.find((p) => p.slot === s)?.displayName ?? (s === slot ? me?.displayName ?? 'You' : '???'));
  const result = end && (end.winner < 0 ? 'DRAW' : end.winner === slot ? 'VICTORY' : 'DEFEAT');

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

      {(status === 'live' || status === 'ended') && <HudBar hud={hud} names={names} mySlot={slot} />}
      {banner && status === 'live' && <Banner key={banner.key} text={banner.text} sub={banner.sub} />}

      {(status === 'connecting' || status === 'waiting') && (
        <div className="fight-overlay">
          <div className="panel overlay-card">
            <p className="chalk-note">{status === 'connecting' ? 'Connecting to the lab…' : 'Waiting for an opponent'}</p>
            <div className="room-code" aria-label="Room code">{code}</div>
            <p className="overlay-hint">Share this code. Your friend joins from <b>Play Online → Join with code</b>.</p>
            <div className="overlay-actions">
              <button className="btn-ghost" onClick={() => { void navigator.clipboard?.writeText(code); sfx.success(); }}>Copy code</button>
              <Link className="btn-ghost" to="/play">Leave</Link>
            </div>
          </div>
        </div>
      )}

      {status === 'live' && players.some((p) => !p.connected) && (
        <div className="net-warning">Opponent disconnected — waiting for them to reconnect…</div>
      )}

      {status === 'ended' && end && (
        <div className="fight-overlay">
          <div className={`panel overlay-card result-${result?.toLowerCase()}`}>
            <div className="result-title">{result}</div>
            <div className="result-score">{end.roundWins[0]} – {end.roundWins[1]}</div>
            <p className="chalk-note">{reasonText(end, slot)}</p>
            <div className="overlay-actions">
              <button className="btn-neon" onClick={newRoom}>New room</button>
              <Link className="btn-ghost" to="/">Main menu</Link>
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="fight-overlay">
          <div className="panel overlay-card">
            <div className="result-title small">Signal lost</div>
            <p className="form-error">{error}</p>
            <div className="overlay-actions">
              <button className="btn-neon" onClick={() => { setError(null); setStatus('connecting'); setAttempt((a) => a + 1); }}>Reconnect</button>
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
              <span><kbd>J</kbd> light · <kbd>K</kbd> heavy · <kbd>L</kbd> special</span>
              <span>Gamepad: stick · A / B / X · Y jump</span>
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
