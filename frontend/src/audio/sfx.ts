/**
 * Placeholder UI sounds synthesised with the Web Audio API (no asset files needed).
 * Real recorded SFX will later be loaded through Howler.js behind this same interface.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function blip(freq: number, endFreq: number, duration: number, type: OscillatorType, volume: number) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

export const sfx = {
  hover: () => blip(880, 1320, 0.06, 'sine', 0.03),
  click: () => blip(440, 1760, 0.12, 'triangle', 0.08),
  error: () => blip(220, 110, 0.25, 'sawtooth', 0.05),
  success: () => { blip(523, 784, 0.15, 'triangle', 0.07); setTimeout(() => blip(784, 1568, 0.2, 'triangle', 0.07), 90); },
};
