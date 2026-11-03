/**
 * Placeholder SFX synthesised with the Web Audio API (no asset files needed). Every scientist has
 * a sound signature for their specials; real recorded SFX will later be loaded through Howler.js
 * behind this same interface.
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, endFreq: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
  const ac = audio();
  if (!ac || !master) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function hiss(duration: number, volume: number, filterFreq: number, type: BiquadFilterType = 'bandpass', delay = 0) {
  const ac = audio();
  if (!ac || !noise || !master) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noise;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + duration + 0.02);
}

/** Per-fighter "voice" for impacts and specials. */
const SIGNATURE: Record<string, () => void> = {
  newton: () => { tone(160, 60, 0.35, 'sine', 0.22); hiss(0.15, 0.08, 800, 'lowpass'); },          // deep gravitational thud
  tesla: () => { hiss(0.22, 0.12, 5000, 'highpass'); tone(1800, 600, 0.18, 'sawtooth', 0.04); },    // crackling zap
  curie: () => { for (let i = 0; i < 6; i++) hiss(0.02, 0.12, 3000, 'bandpass', i * 0.035 + Math.random() * 0.02); tone(520, 780, 0.3, 'sine', 0.05); }, // Geiger clicks + glow
  einstein: () => { tone(400, 1600, 0.25, 'triangle', 0.07); tone(1200, 2400, 0.4, 'sine', 0.03, 0.05); }, // relativistic whoosh-chime
  galileo: () => { tone(660, 660, 0.12, 'sine', 0.07); tone(990, 990, 0.18, 'sine', 0.05, 0.12); },        // pendulum clock tick-tock
  archimedes: () => { tone(220, 110, 0.3, 'triangle', 0.1); hiss(0.25, 0.06, 600, 'lowpass', 0.05); },      // creaking wood, splash
  faraday: () => { tone(300, 900, 0.35, 'sawtooth', 0.035); tone(320, 960, 0.35, 'sawtooth', 0.03); },      // dynamo spin-up hum
  hooke: () => { tone(180, 900, 0.18, 'square', 0.04); tone(900, 140, 0.2, 'square', 0.04, 0.16); },        // boing
  schrodinger: () => { tone(620, 620, 0.2, 'sine', 0.05); tone(931, 931, 0.2, 'sine', 0.05); tone(1240, 300, 0.25, 'triangle', 0.03, 0.12); }, // two states at once, then collapse
  heisenberg: () => { for (let i = 0; i < 4; i++) tone(500 + Math.random() * 1400, 300 + Math.random() * 1600, 0.06, 'square', 0.025, i * 0.04); }, // jittery, never the same twice
  hawking: () => { tone(90, 30, 0.6, 'sine', 0.2); hiss(0.4, 0.05, 300, 'lowpass', 0.05); },               // deep gravitational rumble
  doppler: () => { tone(980, 620, 0.45, 'sawtooth', 0.04); tone(990, 610, 0.45, 'triangle', 0.04); },       // a siren falling in pitch as it passes
};

export const sfx = {
  hover: () => tone(880, 1320, 0.06, 'sine', 0.03),
  click: () => tone(440, 1760, 0.12, 'triangle', 0.08),
  error: () => tone(220, 110, 0.25, 'sawtooth', 0.05),
  success: () => { tone(523, 784, 0.15, 'triangle', 0.07); tone(784, 1568, 0.2, 'triangle', 0.07, 0.09); },
  hit: (heavy: boolean, fighterId?: string) => {
    hiss(heavy ? 0.18 : 0.08, heavy ? 0.3 : 0.18, heavy ? 900 : 1800, 'lowpass');
    tone(heavy ? 140 : 260, heavy ? 45 : 120, heavy ? 0.25 : 0.1, 'square', heavy ? 0.1 : 0.05);
    if (heavy && fighterId) SIGNATURE[fighterId]?.();
  },
  special: (fighterId: string) => SIGNATURE[fighterId]?.(),
  ultimate: () => {
    tone(60, 30, 1.0, 'sawtooth', 0.12);
    tone(200, 1600, 0.9, 'sine', 0.06);
    hiss(1.0, 0.06, 400, 'lowpass');
    tone(110, 40, 0.6, 'square', 0.12, 0.95); // the release
  },
  zap: () => { hiss(0.12, 0.14, 6000, 'highpass'); },
  clank: () => { tone(900, 700, 0.18, 'triangle', 0.08); tone(1400, 1300, 0.25, 'sine', 0.04); },
};
