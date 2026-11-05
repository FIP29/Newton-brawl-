/** Graphics quality preference, saved per browser. "auto" starts high and steps down if frames run slow. */
export type GraphicsPref = 'auto' | 'high' | 'medium' | 'low';
export type Quality = 'high' | 'medium' | 'low';

const KEY = 'nb.gfx';
const listeners = new Set<(p: GraphicsPref) => void>();

function load(): GraphicsPref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'auto' || v === 'high' || v === 'medium' || v === 'low') return v;
  } catch { /* storage blocked */ }
  return 'auto';
}

let pref: GraphicsPref = load();

export function getGraphicsPref(): GraphicsPref { return pref; }

export function setGraphicsPref(p: GraphicsPref) {
  pref = p;
  try { localStorage.setItem(KEY, p); } catch { /* session only */ }
  listeners.forEach((fn) => fn(p));
}

export function onGraphicsPref(fn: (p: GraphicsPref) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Where "auto" starts: phones and small/low-core devices begin at medium. */
export function initialQuality(p: GraphicsPref = pref): Quality {
  if (p !== 'auto') return p;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8;
  return coarse || cores <= 4 ? 'medium' : 'high';
}
