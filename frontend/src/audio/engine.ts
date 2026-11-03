/**
 * Shared Web Audio graph: master → { sfx bus, music bus } → speakers, with user volume settings
 * (saved per browser). Everything audible goes through here so one mute/volume control covers it.
 *
 * Browsers only allow audio after a user gesture; `audio()` resumes the context whenever it's
 * called, and `unlockOnGesture()` starts it on the first click or key press.
 */
export interface AudioSettings { music: number; sfx: number; muted: boolean }

const KEY = 'nb.audio';
const DEFAULTS: AudioSettings = { music: 0.55, sfx: 0.8, muted: false };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let settings: AudioSettings = load();
const listeners = new Set<(s: AudioSettings) => void>();

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

export function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      // Music runs through a low-pass filter so it can be muffled (ULTIMATE cinematic, slow-mo KO).
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = 18000;
      musicBus = ctx.createGain();
      musicBus.connect(musicFilter).connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      apply();
    } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const buses = () => ({ sfx: sfxBus, music: musicBus, musicFilter });
export const noise = () => noiseBuf;

function apply() {
  if (!ctx || !master || !sfxBus || !musicBus) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.02);
  sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.02);
  musicBus.gain.setTargetAtTime(settings.music * 0.5, t, 0.05);
}

export function getAudioSettings(): AudioSettings { return settings; }

export function setAudioSettings(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  apply();
  listeners.forEach((l) => l(settings));
}

export function onAudioSettings(l: (s: AudioSettings) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Muffle the music for `seconds` (e.g. during an ULTIMATE cinematic), then open it back up. */
export function muffleMusic(seconds: number, cutoff = 600) {
  const ac = audio();
  if (!ac || !musicFilter) return;
  const f = musicFilter.frequency, t = ac.currentTime;
  f.cancelScheduledValues(t);
  f.setValueAtTime(f.value, t);
  f.exponentialRampToValueAtTime(cutoff, t + 0.12);
  f.setValueAtTime(cutoff, t + seconds);
  f.exponentialRampToValueAtTime(18000, t + seconds + 0.5);
}

/** Starts audio on the first user gesture (browsers block it before that). */
export function unlockOnGesture(then: () => void) {
  const go = () => {
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    audio();
    then();
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}
