import { useState } from 'react';
import { sfx } from '../audio/sfx';

interface FieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  error?: string;
}

/** A labelled form input. Password fields get an eye button that shows what you typed. */
export function AuthField({ name, label, value, onChange, type = 'text', autoComplete, error }: FieldProps) {
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  return (
    <label className="field">
      <span>{label}</span>
      <div className={isPassword ? 'field-row' : undefined}>
        <input name={name} type={isPassword && shown ? 'text' : type} value={value}
               onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
               autoCapitalize={isPassword || type === 'email' ? 'none' : undefined}
               spellCheck={isPassword ? false : undefined}
               aria-invalid={!!error} required />
        {isPassword && (
          <button type="button" className="eye-btn" aria-label={shown ? 'Hide password' : 'Show password'}
                  aria-pressed={shown} title={shown ? 'Hide password' : 'Show password'}
                  onClick={() => { sfx.click(); setShown((s) => !s); }}>
            <EyeIcon open={shown} />
          </button>
        )}
      </div>
      {error && <em className="field-error">{error}</em>}
    </label>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 4l16 16" />}
    </svg>
  );
}
