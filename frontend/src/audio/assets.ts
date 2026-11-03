import { Howl, Howler } from 'howler';
import { getAudioSettings, onAudioSettings } from './engine';

// Recorded files follow the same volume settings as the synthesised sounds.
const syncVolume = () => { const s = getAudioSettings(); Howler.volume(s.muted ? 0 : s.sfx); };
syncVolume();
onAudioSettings(syncVolume);

/**
 * Real audio files, when you have them. Map a sound name (an `sfx` function name such as `hit`,
 * `ko`, `victory`, a fighter id for its signature, or `music:<track>` for a music track) to a file
 * in `public/audio/`, and it replaces the synthesised placeholder. No other code changes needed.
 *
 *   e.g. { ko: '/audio/ko.ogg', 'music:the-lab': '/audio/lab-theme.ogg' }
 */
export const AUDIO_ASSETS: Record<string, string> = {};

const cache = new Map<string, Howl>();

/** Plays the recorded file for `name` if one is registered. Returns false if there isn't one. */
export function playAsset(name: string, opts: { loop?: boolean; volume?: number } = {}): Howl | null {
  const src = AUDIO_ASSETS[name];
  if (!src) return null;
  let h = cache.get(name);
  if (!h) {
    h = new Howl({ src: [src], loop: opts.loop ?? false, volume: opts.volume ?? 1 });
    cache.set(name, h);
  }
  h.play();
  return h;
}
