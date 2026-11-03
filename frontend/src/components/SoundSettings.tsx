import { useEffect, useState } from 'react';
import { getAudioSettings, onAudioSettings, setAudioSettings, type AudioSettings } from '../audio/engine';

/**
 * Music / SFX volume and mute. `floating` pins a small button to the corner (menus); otherwise it
 * renders inline (pause menu). `M` toggles mute anywhere.
 */
export function SoundSettings({ floating = false }: { floating?: boolean }) {
  const [s, setS] = useState<AudioSettings>(getAudioSettings());
  const [open, setOpen] = useState(!floating);
  useEffect(() => onAudioSettings(setS), []);
  const panel = (
    <div className="sound-panel">
      <label>Music <input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => setAudioSettings({ music: +e.target.value })} /></label>
      <label>Effects <input type="range" min={0} max={1} step={0.05} value={s.sfx} onChange={(e) => setAudioSettings({ sfx: +e.target.value })} /></label>
      <button className="btn-ghost small" onClick={() => setAudioSettings({ muted: !s.muted })}>{s.muted ? 'Unmute' : 'Mute'} <kbd>M</kbd></button>
    </div>
  );
  if (!floating) return panel;
  return (
    <div className="sound-floating">
      <button className="sound-button" aria-label="Sound settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {s.muted ? '🔇' : '♪'}
      </button>
      {open && panel}
    </div>
  );
}

/** Global `M` = mute toggle (ignored while typing in a field). */
export function installMuteKey() {
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyM' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    setAudioSettings({ muted: !getAudioSettings().muted });
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
