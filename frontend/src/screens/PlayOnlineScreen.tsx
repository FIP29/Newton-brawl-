import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { roomsApi } from '../api/rooms';
import { ApiError } from '../api/client';
import { sfx } from '../audio/sfx';

/** Create a private room or join a friend's by code. Matchmaking queues arrive in Phase 5. */
export function PlayOnlineScreen() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.play-card', { opacity: 0, y: 40, stagger: 0.1, duration: 0.6, ease: 'power3.out' });
    }, root);
    return () => ctx.revert();
  }, []);

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
        <section className="play-card panel" style={{ '--accent': 'var(--newton)' } as React.CSSProperties}>
          <h2>Private room</h2>
          <p className="chalk-note">Get a code and send it to a friend.</p>
          <button className="btn-neon" onClick={create} disabled={busy !== null} onMouseEnter={sfx.hover}>
            {busy === 'create' ? 'Opening lab…' : 'Create room'}
          </button>
        </section>

        <form className="play-card panel" onSubmit={join} style={{ '--accent': 'var(--tesla)' } as React.CSSProperties}>
          <h2>Join with code</h2>
          <input className="code-input" value={code} maxLength={5} placeholder="ABCDE" aria-label="Room code"
                 onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <button className="btn-neon btn-blue" type="submit" disabled={busy !== null || code.length < 5} onMouseEnter={sfx.hover}>
            {busy === 'join' ? 'Connecting…' : 'Join'}
          </button>
        </form>

        <section className="play-card panel muted" style={{ '--accent': 'var(--einstein)' } as React.CSSProperties}>
          <h2>Casual · Ranked</h2>
          <p className="chalk-note">Matchmaking queues and Elo arrive in Phase 5.</p>
        </section>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Link className="btn-ghost" to="/">← Main menu</Link>
    </div>
  );
}
