/**
 * "Neon Chalkboard" palette. Each fighter's signature color is defined once here and reused
 * by UI (CSS variables are mirrored in global.css) and by the PixiJS renderer.
 */
export const NEON = {
  newton: 0xffcc33,     // gold
  tesla: 0x33bbff,      // electric blue
  curie: 0x7cff6b,      // toxic green
  einstein: 0xb57bff,   // violet
  galileo: 0xffa630,    // amber
  hooke: 0xc8d2dc,      // steel grey
  schrodinger: 0x2ee6c9,// teal
  heisenberg: 0xff3df2, // magenta
  hawking: 0x6f7bff,    // indigo
  bernoulli: 0x00e5ff,  // sky cyan
  edison: 0xffe14d,     // warm filament yellow
  bose: 0x9fe8ff,       // ice blue
  jcbose: 0x2ecc71,     // emerald
  doppler: 0xff4d6d,    // red-shift
  chalk: 0xe9ece4,
} as const;

/** Equations that drift across the menu backdrop, each glowing in its fighter's color. */
export const BACKDROP_EQUATIONS: Array<{ text: string; color: number }> = [
  { text: 'F = ma', color: NEON.newton },
  { text: 'F = G·m₁m₂ / r²', color: NEON.newton },
  { text: 'E = mc²', color: NEON.einstein },
  { text: 'Δt′ = Δt / √(1 − v²/c²)', color: NEON.einstein },
  { text: 'F = −kx', color: NEON.hooke },
  { text: 'N(t) = N₀·(½)^(t/t½)', color: NEON.curie },
  { text: 'F = q(E + v × B)', color: NEON.tesla },
  { text: 'Δx·Δp ≥ ħ/2', color: NEON.heisenberg },
  { text: 'iħ ∂ψ/∂t = Ĥψ', color: NEON.schrodinger },
  { text: 'r_s = 2GM / c²', color: NEON.hawking },
  { text: 'T = 2π√(L/g)', color: NEON.galileo },
  { text: 'f′ = f·(c + v)/(c − v)', color: NEON.doppler },
  { text: 'n = 1 / (e^(hν/kT) − 1)', color: NEON.bose },
  { text: 'P + ½ρv² = const', color: NEON.bernoulli },
  { text: 'V = IR', color: NEON.edison },
  { text: 'c = fλ', color: NEON.jcbose },
];
