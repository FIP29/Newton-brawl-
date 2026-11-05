import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { sfx } from '../audio/sfx';
import { AuthField } from '../components/AuthFields';
import { ServerStatus } from '../components/ServerStatus';

type Mode = 'login' | 'register';

/** Login / register. The title "writes itself" in neon, then the form card rises in. */
export function LoginScreen() {
  const { status, login, register, playAsGuest } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const root = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ login: '', username: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.title-letter', { y: -80, opacity: 0, rotate: () => gsap.utils.random(-25, 25), stagger: 0.04, duration: 0.7, ease: 'back.out(2)' })
        .from('.title-sub', { opacity: 0, letterSpacing: '1.2em', duration: 0.8 }, '-=0.3')
        .from('.auth-card', { y: 60, opacity: 0, scale: 0.96, duration: 0.7 }, '-=0.5')
        .to('.title-word.brawl', { textShadow: '0 0 12px #ff4d6d, 0 0 36px #ff4d6d, 0 0 80px #ff4d6d', repeat: -1, yoyo: true, duration: 1.6, ease: 'sine.inOut' });
    }, root);
    return () => ctx.revert();
  }, []);

  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }


  const switchMode = (m: Mode) => {
    if (m === mode) return;
    sfx.click();
    setMode(m);
    setError(null);
    setFieldErrors({});
    gsap.fromTo('.auth-fields', { opacity: 0, x: m === 'register' ? 30 : -30 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' });
  };

  const [guestBusy, setGuestBusy] = useState(false);

  const fail = (err: unknown) => {
    sfx.error();
    gsap.fromTo('.auth-card', { x: -10 }, { x: 0, duration: 0.4, ease: 'elastic.out(1.2, 0.3)' });
    if (err instanceof ApiError) { setError(err.message); setFieldErrors(err.fieldErrors); }
    else setError('Something went wrong');
  };

  const guest = async () => {
    sfx.click();
    setGuestBusy(true);
    setError(null);
    try {
      await playAsGuest();
      sfx.success();
      navigate('/', { replace: true });
    } catch (err) {
      fail(err);
    } finally {
      setGuestBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (mode === 'login') await login(form.login.trim(), form.password);
      else await register(form.username.trim(), form.email.trim(), form.password);
      sfx.success();
      navigate('/', { replace: true });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const field = (name: keyof typeof form, label: string, type = 'text', autoComplete?: string) => (
    <AuthField name={name} label={label} type={type} autoComplete={autoComplete} value={form[name]}
               error={fieldErrors[name]} onChange={(v) => setForm((f) => ({ ...f, [name]: v }))} />
  );

  return (
    <div className="screen login-screen" ref={root}>
      <header className="title">
        <h1>
          <span className="title-word newton">{[...'NEWTON'].map((c, i) => <span key={i} className="title-letter">{c}</span>)}</span>
          <span className="title-word brawl">{[...'BRAWL'].map((c, i) => <span key={i} className="title-letter">{c}</span>)}</span>
        </h1>
        <p className="title-sub">every hit obeys the laws of physics</p>
      </header>

      <form className="auth-card panel" onSubmit={submit} noValidate>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Log in</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Register</button>
        </div>

        <div className="auth-fields">
          {mode === 'login' ? (
            <>
              {field('login', 'Username or email', 'text', 'username')}
              {field('password', 'Password', 'password', 'current-password')}
            </>
          ) : (
            <>
              {field('username', 'Username', 'text', 'username')}
              {field('email', 'Email', 'email', 'email')}
              {field('password', 'Password (8+ characters)', 'password', 'new-password')}
            </>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="btn-neon" type="submit" disabled={busy || guestBusy} onMouseEnter={sfx.hover}>
          {busy ? 'Calculating…' : mode === 'login' ? 'Enter the Lab' : 'Create Scientist'}
        </button>

        <div className="auth-or">or</div>
        <button className="btn-guest" type="button" onClick={guest} disabled={busy || guestBusy} onMouseEnter={sfx.hover}>
          {guestBusy ? 'Opening the lab…' : 'Play as guest'}
        </button>
        <p className="guest-note">No sign-up. Casual, private and local matches. Save your progress with an account any time.</p>

        <ServerStatus />
      </form>
    </div>
  );
}
