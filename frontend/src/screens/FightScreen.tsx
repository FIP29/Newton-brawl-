import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import gsap from 'gsap';
import { FightRenderer } from '../game/render/FightRenderer';
import { MatchConnection } from '../game/net/MatchConnection';
import { SnapshotBuffer } from '../game/net/SnapshotBuffer';
import { InputController } from '../game/input/InputController';
import type { EndMessage, MatchPhase, PlayerInfo, StartMessage } from '../game/protocol';
import { roomsApi } from '../api/rooms';
import { useAuth } from '../auth/AuthContext';
import { sfx } from '../audio/sfx';

type Status = 'connecting' | 'waiting' | 'live' | 'ended' | 'error';

interface Hud {
  health: [number, number];
  maxHealth: [number, number];
  phase: MatchPhase;
}

/**
 * Online fight. Wires together: WebSocket connection (inputs out, snapshots in), the snapshot
 * buffer (interpolation), the PixiJS renderer and the React HUD overlay.
 */
export function FightScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { player: me } = useAuth();
  const hostRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<number>(-1);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [hud, setHud] = useState<Hud | null>(null);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(null);
  const [end, setEnd] = useState<EndMessage | null>(null);
  const [ping, setPing] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [showHelp, setShowHelp] = useState(true);

  useEffect(() => {
    let disposed = false;
    const renderer = new FightRenderer();
    const buffer = new SnapshotBuffer();
    const input = new InputController().attach();
    let startMsg: StartMessage | null = null; // match config (fighters, arena)
    let ready = false;                         // renderer initialised
    let lastEventTick = 0;
    let lastPhase: MatchPhase | null = null;
    let lastHud = '';
    let ended = false;

    const showBanner = (text: string) => setBanner({ text, key: performance.now() });

    const conn = new MatchConnection(code, {
      onMessage(msg) {
        switch (msg.t) {
          case 'welcome':
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
            startMsg = msg;
            if (ready) renderer.setup(msg);
            break;
          case 'state':
            buffer.push(msg, performance.now());
            break;
          case 'end':
            ended = true;
            setEnd(msg);
            window.setTimeout(() => !disposed && setStatus('ended'), 600);
            break;
          case 'error':
            setError(msg.message);
            setStatus('error');
            break;
        }
      },
      onClose(closeCode) {
        if (ended || disposed) return;
        setStatus('error');
        setError((e) => e ?? (closeCode === 1006 ? 'Connection lost.' : 'Disconnected from the match.'));
      },
    });

    // Game loop: runs every display frame.
    const frame = () => {
      const now = performance.now();
      conn.pump(now, () => input.sample());
      const tick = buffer.renderTick(now);
      const sample = buffer.sample(tick);
      if (!sample) return;

      // Fire hit effects when the interpolated view reaches the tick they happened on.
      for (const s of buffer.between(lastEventTick, Math.floor(tick))) {
        s.events.forEach((e) => { renderer.onHit(e); e.damage >= 100 ? sfx.error() : sfx.click(); });
        lastEventTick = s.tick;
      }
      renderer.render(sample.fighters, sample.base.hitstop, renderer.app.ticker.deltaMS);

      const base = sample.base;
      if (base.phase !== lastPhase) {
        if (base.phase === 'COUNTDOWN') showBanner('ROUND 1');
        if (base.phase === 'FIGHTING' && lastPhase === 'COUNTDOWN') { showBanner('FIGHT!'); sfx.success(); }
        if (base.phase === 'KO') showBanner('K.O.');
        lastPhase = base.phase;
      }
      // Only touch React state when something visible changed.
      const key = `${base.fighters[0].health}|${base.fighters[1].health}|${base.phase}`;
      if (key !== lastHud) {
        lastHud = key;
        setHud({ health: [base.fighters[0].health, base.fighters[1].health], maxHealth: hudMax(startMsg), phase: base.phase });
      }
    };

    const onVisibility = () => { if (document.hidden) conn.releaseAll(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') renderer.showHitboxes = !renderer.showHitboxes;
      if (e.code === 'Slash' || e.code === 'F1') { e.preventDefault(); setShowHelp((v) => !v); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    const pingTimer = window.setInterval(() => setPing(Math.round(conn.rtt)), 1000);

    renderer.init(hostRef.current!).then(() => {
      if (disposed) { renderer.destroy(); return; }
      ready = true;
      if (import.meta.env.DEV) (window as unknown as { __nbRenderer: FightRenderer }).__nbRenderer = renderer;
      if (startMsg) renderer.setup(startMsg);
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
  }, [code, attempt]);

  const mySide = slot;
  const result = end && (end.winner < 0 ? 'DRAW' : end.winner === mySide ? 'VICTORY' : 'DEFEAT');

  const rematch = async () => {
    sfx.click();
    try {
      const room = await roomsApi.create();
      navigate(`/fight/${room.code}`);
    } catch { /* stay */ }
  };

  return (
    <div className="fight-screen">
      <div className="fight-canvas" ref={hostRef} />

      {status === 'live' || status === 'ended' ? (
        <HudBar players={players} hud={hud} mySlot={mySide} meName={me?.displayName} />
      ) : null}

      {banner && status === 'live' && <Banner key={banner.key} text={banner.text} />}

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
            <p className="chalk-note">{reasonText(end, mySide)}</p>
            <div className="overlay-actions">
              <button className="btn-neon" onClick={rematch}>New room</button>
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
          <div className="net-stats">{ping ? `${ping} ms` : '…'} · H hitboxes · / help</div>
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

function hudMax(start: StartMessage | null): [number, number] {
  return start ? [start.fighters[0].maxHealth, start.fighters[1].maxHealth] : [1000, 1000];
}

function reasonText(end: EndMessage, mySlot: number): string {
  switch (end.reason) {
    case 'KO': return end.winner === mySlot ? 'Knockout! Momentum was on your side.' : 'Knocked out. Every action has an equal and opposite reaction…';
    case 'DOUBLE_KO': return 'Double KO — perfectly balanced forces.';
    case 'FORFEIT': return end.winner === mySlot ? 'Your opponent left the lab.' : 'You left the match.';
    default: return 'The match was stopped.';
  }
}

function HudBar({ players, hud, mySlot, meName }: { players: PlayerInfo[]; hud: Hud | null; mySlot: number; meName?: string }) {
  const name = (s: number) => players.find((p) => p.slot === s)?.displayName ?? (s === mySlot ? meName : '???');
  const pct = (s: number) => (hud ? Math.max(0, hud.health[s] / hud.maxHealth[s]) * 100 : 100);
  return (
    <div className="hud">
      {[0, 1].map((s) => (
        <div key={s} className={`hud-side side-${s}`}>
          <div className="hud-name">
            {name(s)} {s === mySlot && <span className="you-tag">YOU</span>}
          </div>
          <div className="health">
            <div className="health-ghost" style={{ width: `${pct(s)}%` }} />
            <div className="health-fill" style={{ width: `${pct(s)}%` }} />
          </div>
        </div>
      ))}
      <div className="hud-center">
        <div className="hud-timer">∞</div>
        <div className="hud-round">ROUND 1</div>
      </div>
    </div>
  );
}

function Banner({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(ref.current, { scale: 2.4, opacity: 0, letterSpacing: '0.6em' },
                           { scale: 1, opacity: 1, letterSpacing: '0.08em', duration: 0.35, ease: 'expo.out' })
      .to(ref.current, { opacity: 0, scale: 0.9, duration: 0.3, delay: text === 'ROUND 1' ? 1.1 : 0.6 });
    return () => { tl.kill(); };
  }, [text]);
  return <div ref={ref} className={`banner ${text === 'K.O.' ? 'ko' : ''}`}>{text}</div>;
}
