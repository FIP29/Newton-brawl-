import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
import { roomsApi } from '../api/rooms';
import { ApiError } from '../api/client';
import { matchmakingApi, type TicketStatus } from '../api/progress';
import { useAuth } from '../auth/AuthContext';
import { TierBadge } from '../components/TierBadge';
import { sfx } from '../audio/sfx';

type Queue = 'casual' | 'ranked';

/**
 * Casual and ranked matchmaking queues, plus private rooms by code.
 * `?queue=ranked` (or casual) jumps straight into a queue (used by "Play again").
 */
export function PlayOnlineScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { player } = useAuth();
  const root = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketStatus | null>(null);
  const ticketRef = useRef<TicketStatus | null>(null);
  ticketRef.current = ticket;

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.play-card', { opacity: 0, y: 40, stagger: 0.1, duration: 0.6, ease: 'power3.out' });
    }, root);
    return () => ctx.revert();
  }, []);

  const joinQueue = useCallback(async (q: Queue) => {
    sfx.click();
    setError(null);
    try {
      const t = await matchmakingApi.join(q);
      if (t.state === 'MATCHED' && t.roomCode) {
        // Someone was already waiting: we're paired immediately.
        sfx.success();
        navigate(`/fight/${t.roomCode}`);
        return;
      }
      setTicket(t);
    } catch (e) {
      sfx.error();
      setError(e instanceof ApiError ? e.message : 'Could not join the queue');
    }
  }, [navigate]);

  // Poll the ticket once a second until matched.
  useEffect(() => {
    if (!ticket || ticket.state !== 'SEARCHING') return;
    const timer = window.setInterval(async () => {
      const t = ticketRef.current;
      if (!t) return;
      try {
        const next = await matchmakingApi.poll(t.ticket);
        setTicket(next);
        if (next.state === 'MATCHED' && next.roomCode) {
          sfx.success();
          navigate(`/fight/${next.roomCode}`);
        }
      } catch {
        setTicket(null);
        setError('Lost your place in the queue. Try again.');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ticket?.ticket, ticket?.state, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leave the queue when navigating away.
  useEffect(() => () => {
    const t = ticketRef.current;
    if (t && t.state === 'SEARCHING') void matchmakingApi.cancel(t.ticket).catch(() => undefined);
  }, []);

  useEffect(() => {
    const q = params.get('queue');
    if (q === 'casual' || q === 'ranked') void joinQueue(q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    sfx.click();
    const t = ticket;
    setTicket(null);
    if (t) await matchmakingApi.cancel(t.ticket).catch(() => undefined);
  };

  const create = async () => {
    sfx.click();
    setBusy('create');
    setError(null);
    try {
      const room = await roomsApi.create();
      navigate(`/fight/${room.code}`);
    } catch (e) {
      sfx.error();
      setError(e instanceof ApiError ? e.message : 'Could not create a room');
      setBusy(null);
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 5) return;
    sfx.click();
    setBusy('join');
    setError(null);
    try {
      const room = await roomsApi.get(c);
      if (room.mode !== 'PRIVATE') throw new ApiError(403, 'That room was arranged by matchmaking');
      if (room.playerCount >= 2 && room.status !== 'IN_PROGRESS') throw new ApiError(409, 'That room is full');
      navigate(`/fight/${room.code}`);
    } catch (err) {
      sfx.error();
      setError(err instanceof ApiError && err.status === 404 ? 'No room with that code' : err instanceof Error ? err.message : 'Could not join');
      setBusy(null);
    }
  };

  return (
    <div className="screen play-screen" ref={root}>
      <h1 className="menu-logo"><span className="newton">PLAY</span> <span className="brawl">ONLINE</span></h1>
      <div className="play-grid">
        <section className="play-card panel" style={{ '--accent': 'var(--curie)' } as React.CSSProperties}>
          <h2>Casual</h2>
          <p className="chalk-note">Quick matches, no rating on the line. Codex and unlock progress still count.</p>
          <button className="btn-neon btn-green" onClick={() => joinQueue('casual')} disabled={!!ticket} onMouseEnter={sfx.hover}>Find match</button>
        </section>

        <section className="play-card panel" style={{ '--accent': 'var(--einstein)' } as React.CSSProperties}>
          <h2>Ranked</h2>
          {player && (
            <div className="play-rank"><TierBadge tier={player.rankTier} size={34} /> <b>{player.rankTierName}</b> · {player.elo} Elo</div>
          )}
          <p className="chalk-note">Climb from Atom to Black Hole.</p>
          <button className="btn-neon btn-violet" onClick={() => joinQueue('ranked')} disabled={!!ticket} onMouseEnter={sfx.hover}>Find ranked match</button>
        </section>

        <section className="play-card panel" style={{ '--accent': 'var(--newton)' } as React.CSSProperties}>
          <h2>Private room</h2>
          <button className="btn-neon" onClick={create} disabled={busy !== null || !!ticket} onMouseEnter={sfx.hover}>
            {busy === 'create' ? 'Opening lab…' : 'Create room'}
          </button>
          <form className="code-form" onSubmit={join}>
            <input className="code-input" value={code} maxLength={5} placeholder="CODE" aria-label="Room code"
                   onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <button className="btn-neon btn-blue" type="submit" disabled={busy !== null || code.length < 5}>Join</button>
          </form>
        </section>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Link className="btn-ghost" to="/">← Main menu</Link>

      {ticket && (
        <div className="fight-overlay queue-overlay">
          <div className="panel overlay-card">
            <div className="queue-orbit" aria-hidden="true"><span /><span /><span /></div>
            <div className="result-title small">{ticket.mode === 'RANKED' ? 'Ranked' : 'Casual'} search</div>
            <p className="chalk-note">Looking for a worthy rival… {formatTime(ticket.waitedSeconds)}</p>
            <p className="overlay-hint">
              {ticket.playersSearching} scientist{ticket.playersSearching === 1 ? '' : 's'} in the queue
              {ticket.mode === 'RANKED' && ticket.eloWindow > 0 && <> · matching within ±{ticket.eloWindow} Elo</>}
            </p>
            <button className="btn-ghost" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
