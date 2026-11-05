import { useEffect, useState } from 'react';
import { getAudioSettings, onAudioSettings, setAudioSettings, type AudioSettings } from '../audio/engine';
import { getGraphicsPref, onGraphicsPref, setGraphicsPref, type GraphicsPref } from '../game/render/graphicsSettings';

/**
 * Music / SFX volume and mute. `floating` pins a small button to the corner (menus); otherwise it
 * renders inline (pause menu). `M` toggles mute anywhere.
 */
export function SoundSettings({ floating = false }: { floating?: boolean }) {
  const [s, setS] = useState<AudioSettings>(getAudioSettings());
  const [open, setOpen] = useState(!floating);
  const [gfx, setGfx] = useState<GraphicsPref>(getGraphicsPref());
  useEffect(() => onAudioSettings(setS), []);
  useEffect(() => onGraphicsPref(setGfx), []);
  const panel = (
    <div className="sound-panel">
      <label>Music <input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => setAudioSettings({ music: +e.target.value })} /></label>
      <label>Effects <input type="range" min={0} max={1} step={0.05} value={s.sfx} onChange={(e) => setAudioSettings({ sfx: +e.target.value })} /></label>
      <label>Graphics
        <select value={gfx} onChange={(e) => setGraphicsPref(e.target.value as GraphicsPref)} title="Lower this if the game stutters">
          <option value="auto">Auto</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low (smoothest)</option>
        </select>
      </label>
      <button className="btn-ghost small" onClick={() => setAudioSettings({ muted: !s.muted })}>{s.muted ? 'Unmute' : 'Mute'} <kbd>M</kbd></button>
    </div>
  );
  if (!floating) return panel;
  return (
    <div className="sound-floating">
      <button className="sound-button" aria-label="Sound and graphics settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
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
