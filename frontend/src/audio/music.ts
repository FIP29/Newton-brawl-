import type { Howl } from 'howler';
import { audio, buses, noise } from './engine';
import { playAsset } from './assets';

/**
 * Procedural synth music (no audio files). A 16th-note step sequencer schedules notes slightly
 * ahead of time on the Web Audio clock, so timing stays tight even if the main thread is busy.
 *
 * Tracks: a calm `menu` theme and one energetic fight theme per arena. `setIntensity(1)` adds
 * extra layers (final round, low health). Register `music:<track>` in AUDIO_ASSETS to replace any
 * track with a recorded file.
 */
export type TrackId = 'menu' | 'the-lab' | 'space-station' | 'black-hole-edge' | 'curzon-hall';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// ------------------------------------------------------------------------- instruments

/** Each instrument schedules one note at time `t` into `out`. */
interface Kit { ac: AudioContext; out: GainNode }

function env(k: Kit, t: number, attack: number, hold: number, release: number, peak: number): GainNode {
  const g = k.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  g.connect(k.out);
  return g;
}

function osc(k: Kit, type: OscillatorType, freq: number, t: number, dur: number, dest: AudioNode, detune = 0) {
  const o = k.ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function noiseHit(k: Kit, t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1) {
  const buf = noise();
  if (!buf) return;
  const src = k.ac.createBufferSource();
  src.buffer = buf;
  const f = k.ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(env(k, t, 0.002, 0, dur, vol));
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

const I = {
  kick(k: Kit, t: number, vol = 0.9) {
    const g = env(k, t, 0.002, 0.02, 0.28, vol);
    const o = osc(k, 'sine', 150, t, 0.35, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  },
  snare(k: Kit, t: number, vol = 0.45) {
    noiseHit(k, t, 0.18, vol, 'bandpass', 2200, 0.8);
    const g = env(k, t, 0.002, 0, 0.1, vol * 0.5);
    osc(k, 'triangle', 190, t, 0.12, g);
  },
  hat(k: Kit, t: number, vol = 0.12, open = false) {
    noiseHit(k, t, open ? 0.18 : 0.04, vol, 'highpass', 8000);
  },
  bass(k: Kit, t: number, note: number, dur: number, vol = 0.35, cutoff = 900) {
    const f = k.ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 2.5, t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + dur * 0.6);
    f.Q.value = 6;
    f.connect(env(k, t, 0.005, dur * 0.5, dur * 0.5, vol));
    osc(k, 'sawtooth', midi(note), t, dur, f);
    osc(k, 'square', midi(note - 12), t, dur, f);
  },
  pad(k: Kit, t: number, notes: number[], dur: number, vol = 0.06, cutoff = 1400) {
    const f = k.ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.connect(env(k, t, dur * 0.35, dur * 0.35, dur * 0.4, vol));
    for (const n of notes) { osc(k, 'sawtooth', midi(n), t, dur, f, -9); osc(k, 'sawtooth', midi(n), t, dur, f, 9); }
  },
  pluck(k: Kit, t: number, note: number, vol = 0.1, type: OscillatorType = 'triangle', decay = 0.25) {
    osc(k, type, midi(note), t, decay, env(k, t, 0.003, 0, decay, vol));
  },
  /** Sitar-like: bright, buzzy pluck with a slight upward bend (meend) into the note. */
  sitar(k: Kit, t: number, note: number, vol = 0.09) {
    const f = k.ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = midi(note) * 3;
    f.Q.value = 3;
    f.connect(env(k, t, 0.004, 0.05, 0.6, vol));
    const o = osc(k, 'sawtooth', midi(note - 0.6), t, 0.7, f);
    o.frequency.linearRampToValueAtTime(midi(note), t + 0.08);
  },
  /** Tabla-like strokes: low resonant "dha" or a bright "na". */
  tabla(k: Kit, t: number, low: boolean, vol = 0.35) {
    const g = env(k, t, 0.002, 0, low ? 0.35 : 0.12, vol);
    const o = osc(k, 'sine', low ? 120 : 520, t, 0.4, g);
    o.frequency.exponentialRampToValueAtTime(low ? 85 : 480, t + (low ? 0.3 : 0.1));
    if (!low) noiseHit(k, t, 0.03, vol * 0.3, 'highpass', 5000);
  },
  /** A long sustained drone (tanpura-like / sub). */
  drone(k: Kit, t: number, notes: number[], dur: number, vol = 0.05, type: OscillatorType = 'sawtooth', cutoff = 700) {
    const f = k.ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.connect(env(k, t, 0.4, dur - 0.8, 0.4, vol));
    for (const n of notes) osc(k, type, midi(n), t, dur, f, (Math.random() - 0.5) * 10);
  },
};

// ------------------------------------------------------------------------- tracks

interface Track {
  bpm: number;
  /** Schedules everything that starts on 16th-note `step` (0-based, running) at time `t`. */
  step(k: Kit, t: number, step: number, intensity: number, beat: number): void;
}

const S = (step: number) => step % 16;            // position in the bar
const BAR = (step: number) => Math.floor(step / 16);
const pick = <T>(xs: T[], i: number) => xs[((i % xs.length) + xs.length) % xs.length];

/** Calm menu theme: lush minor-ninth pads, a slow arpeggio, a heartbeat kick. */
const MENU: Track = {
  bpm: 84,
  step(k, t, step, _i, beat) {
    const chords = [[57, 60, 64, 71], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 64]]; // Am9 Fmaj7 Cmaj7 G6
    const c = pick(chords, BAR(step));
    if (S(step) === 0) { I.pad(k, t, c, beat * 4, 0.05, 1200); I.bass(k, t, c[0] - 12, beat * 3.5, 0.12, 300); }
    if (S(step) % 2 === 0) I.pluck(k, t, pick([...c, c[1] + 12, c[2] + 12], S(step) / 2) + 12, 0.045, 'triangle', 0.5);
    if (S(step) === 0 || S(step) === 8) I.kick(k, t, 0.25);
    if (S(step) % 4 === 2) I.hat(k, t, 0.03);
  },
};

/** The Lab: driving four-on-the-floor in A minor, bass in eighths, a square-wave arpeggio. */
const LAB: Track = {
  bpm: 132,
  step(k, t, step, i, beat) {
    const roots = [45, 41, 48, 43]; // A F C G
    const r = pick(roots, BAR(step));
    const s = S(step);
    if (s % 4 === 0) I.kick(k, t, 0.85);
    if (s === 4 || s === 12) I.snare(k, t, 0.42);
    I.hat(k, t, s % 4 === 2 ? 0.1 : 0.05, s % 4 === 2);
    if (s % 2 === 0) I.bass(k, t, r + (s % 8 === 6 ? 12 : 0), beat * 0.45, 0.3, 700);
    const arp = [r + 24, r + 27, r + 31, r + 36];
    if (i > 0.3 || BAR(step) % 4 >= 2) I.pluck(k, t, pick(arp, s), 0.05 + i * 0.03, 'square', 0.12);
    if (s === 0 && BAR(step) % 2 === 0) I.pad(k, t, [r + 12, r + 15, r + 19], beat * 8, 0.035, 1800);
    if (i > 0.6 && s % 2 === 1) I.hat(k, t, 0.06);
  },
};

/** Space Station: airy D dorian, half-floating beat, echoing triangle arpeggios. */
const STATION: Track = {
  bpm: 118,
  step(k, t, step, i, beat) {
    const chords = [[50, 57, 60, 64], [46, 53, 57, 62], [43, 50, 53, 58], [45, 52, 55, 61]]; // Dm9 Bbmaj7 Gm9 A7sus
    const c = pick(chords, BAR(step));
    const s = S(step);
    if (s === 0 || s === 10) I.kick(k, t, 0.7);
    if (s === 8) I.snare(k, t, 0.3);
    if (s % 2 === 0) I.hat(k, t, 0.04);
    if (s === 0) { I.pad(k, t, c.map((n) => n + 12), beat * 4, 0.045, 2200); I.bass(k, t, c[0] - 12, beat * 1.5, 0.25, 500); }
    if (s === 6 || s === 12) I.bass(k, t, c[0] - 12 + (s === 12 ? 7 : 0), beat * 0.8, 0.2, 500);
    if (s % 3 === 0) {
      const n = pick([...c, c[2] + 12], s / 3) + 12;
      I.pluck(k, t, n, 0.06, 'triangle', 0.35);
      I.pluck(k, t + beat * 0.75, n, 0.025, 'triangle', 0.35); // echo
    }
    if (i > 0.5 && s % 4 === 3) I.pluck(k, t, c[3] + 24, 0.04, 'sine', 0.2);
  },
};

/** Black Hole Edge: slow, heavy half-time in C# phrygian; a sub drone and glitchy hats. */
const BLACK_HOLE: Track = {
  bpm: 96,
  step(k, t, step, i, beat) {
    const roots = [37, 38, 37, 35]; // C# D C# B
    const r = pick(roots, BAR(step));
    const s = S(step);
    if (s === 0 || (s === 7 && BAR(step) % 2 === 1)) I.kick(k, t, 0.95);
    if (s === 8) I.snare(k, t, 0.5);
    if (s === 0) { I.drone(k, t, [r - 12, r - 5], beat * 4, 0.07, 'sawtooth', 260); I.pad(k, t, [r + 12, r + 13, r + 19], beat * 4, 0.03, 900); }
    // glitchy, uneven hats: deterministic from the step so loops repeat
    if (((step * 7919) % 13) < 5) I.hat(k, t, 0.05);
    if (s % 4 === 0) I.bass(k, t, r, beat * 0.9, 0.28, 220);
    if (i > 0.4 && s % 8 === 4) I.pluck(k, t, r + 24 + pick([0, 1, 7, 8], BAR(step)), 0.05, 'sawtooth', 0.4);
  },
};

/**
 * Curzon Hall: a nod to Bengal. A tanpura-like drone, tabla-like strokes and a sitar-like melody
 * in a Bhairav-like scale (C D♭ E F G A♭ B), over an electronic kick and bass.
 */
const CURZON: Track = {
  bpm: 124,
  step(k, t, step, i, beat) {
    const scale = [60, 61, 64, 65, 67, 68, 71, 72];
    const s = S(step);
    if (s === 0 && BAR(step) % 2 === 0) I.drone(k, t, [48, 55, 60], beat * 8, 0.04, 'sawtooth', 900);
    if (s === 0 || s === 8) I.kick(k, t, 0.7);
    // teental-flavoured pattern: dha dhin dhin dha | dha dhin dhin dha | na tin tin na | ...
    const bols = [1, 0, 0, 1, 1, 0, 0, 1, 2, 0, 0, 2, 1, 0, 0, 1];
    if (s % 1 === 0 && bols[s] === 1) I.tabla(k, t, true, 0.3);
    if (bols[s] !== 1 && s % 2 === 0) I.tabla(k, t, false, 0.22);
    if (s % 2 === 1 && i > 0.5) I.tabla(k, t, false, 0.12);
    if (s % 4 === 0) I.bass(k, t, s % 8 === 0 ? 36 : 43, beat * 0.9, 0.22, 450);
    // a melodic phrase that rises and falls through the scale
    const phrase = [0, 2, 3, 4, 5, 4, 3, 1, 0, 1, 2, 4, 6, 7, 6, 4];
    if (s % 2 === 0) {
      const idx = phrase[(s / 2 + BAR(step) * 3) % phrase.length];
      if (BAR(step) % 4 !== 3 || s < 8) I.sitar(k, t, scale[idx] + (BAR(step) % 8 >= 4 ? 12 : 0), 0.08);
    }
  },
};

const TRACKS: Record<TrackId, Track> = { menu: MENU, 'the-lab': LAB, 'space-station': STATION, 'black-hole-edge': BLACK_HOLE, 'curzon-hall': CURZON };

// ------------------------------------------------------------------------- player

class MusicPlayer {
  private current: TrackId | null = null;
  private gain: GainNode | null = null;
  private timer: number | null = null;
  private recorded: Howl | null = null;
  private stepN = 0;
  private nextTime = 0;
  private intensity = 0;

  /** Starts `id` (crossfading from whatever is playing). No-op if it's already playing. */
  play(id: TrackId) {
    if (this.current === id) return;
    this.stop(0.8);
    this.current = id;
    const recorded = playAsset(`music:${id}`, { loop: true, volume: 0.6 });
    if (recorded) { this.recorded = recorded; return; }
    const ac = audio(), bus = buses().music;
    if (!ac || !bus) return;
    this.gain = ac.createGain();
    this.gain.gain.setValueAtTime(0.0001, ac.currentTime);
    this.gain.gain.exponentialRampToValueAtTime(1, ac.currentTime + 1.2);
    this.gain.connect(bus);
    this.stepN = 0;
    this.nextTime = ac.currentTime + 0.1;
    this.intensity = 0;
    const track = TRACKS[id], kit: Kit = { ac, out: this.gain };
    this.timer = window.setInterval(() => this.schedule(track, kit), 25);
  }

  /** Fades out and stops. */
  stop(fade = 0.6) {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const ac = audio();
    if (this.gain && ac) {
      const g = this.gain;
      g.gain.cancelScheduledValues(ac.currentTime);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + fade);
      window.setTimeout(() => g.disconnect(), fade * 1000 + 200);
    }
    this.recorded?.fade(0.6, 0, fade * 1000);
    this.recorded = null;
    this.gain = null;
    this.current = null;
  }

  /** 0 = normal, 1 = everything (final round, someone nearly KO'd). */
  setIntensity(v: number) { this.intensity = Math.max(0, Math.min(1, v)); }

  get playing() { return this.current; }

  private schedule(track: Track, kit: Kit) {
    const beat = 60 / track.bpm, sixteenth = beat / 4;
    const now = kit.ac.currentTime;
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05; // the tab was asleep: skip ahead, don't burst
    while (this.nextTime < now + 0.15) {
      track.step(kit, this.nextTime, this.stepN, this.intensity, beat);
      this.nextTime += sixteenth;
      this.stepN++;
    }
  }
}

export const music = new MusicPlayer();

/** The fight theme for an arena. */
export const arenaTrack = (arenaId: string): TrackId =>
  (['the-lab', 'space-station', 'black-hole-edge', 'curzon-hall'] as const).find((a) => a === arenaId) ?? 'the-lab';
