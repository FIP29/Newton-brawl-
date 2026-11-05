import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { sfx } from '../audio/sfx';
import { AuthField } from './AuthFields';

/** Modal: a guest picks a username, email and password. Their record, Codex and unlocks carry over. */
export function ClaimAccount({ onClose }: { onClose: () => void }) {
  const { claim } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setFieldErrors({});
    try {
      await claim(form.username.trim(), form.email.trim(), form.password);
      sfx.success();
      onClose();
    } catch (err) {
      sfx.error();
      if (err instanceof ApiError) { setError(err.message); setFieldErrors(err.fieldErrors); }
      else setError('Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const f = (name: keyof typeof form, label: string, type: string, autoComplete: string) => (
    <AuthField name={name} label={label} type={type} autoComplete={autoComplete} value={form[name]}
               error={fieldErrors[name]} onChange={(v) => setForm((s) => ({ ...s, [name]: v }))} />
  );

  return (
    <div className="claim-backdrop" role="dialog" aria-modal="true" aria-label="Save your progress"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="auth-card panel" onSubmit={submit} noValidate>
        <h2>Save your progress</h2>
        <p className="chalk-note">Keep your wins, Codex pages and unlocks, play ranked, and log in from any device.</p>
        <div className="auth-fields">
          {f('username', 'Username', 'text', 'username')}
          {f('email', 'Email', 'email', 'email')}
          {f('password', 'Password (8+ characters)', 'password', 'new-password')}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn-neon" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create account'}</button>
        <button className="btn-ghost" type="button" onClick={onClose}>Not now</button>
      </form>
    </div>
  );
}
