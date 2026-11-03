/**
 * Character art direction: stylised, recognisable caricatures of each scientist, drawn as chalk
 * outlines that glow in their signature neon over muted period-accurate costumes.
 *
 * These are respectful homages built from each person's best-known features in historical portraits:
 *   Newton   — long curled periwig, 17th-century long coat with turned-back cuffs, white cravat
 *   Tesla    — tall and lean, centre-parted slicked black hair, thin moustache, dark three-piece suit
 *   Curie    — hair drawn up into a bun, long dark Victorian dress with high collar, glowing vial
 *   Einstein — wild white hair, bushy moustache, baggy grey cardigan
 *   Galileo  — grey beard, receding hair, dark scholar's robe with a white falling collar, telescope
 *   Archimedes — curly grey hair and beard, cream chiton with a bronze meander border, sandals
 *   Faraday  — wavy greying hair, Victorian frock coat and stock
 *   Hooke    — no authentic portrait survives; drawn from contemporaries' descriptions: thin,
 *              stooped, long unpowdered brown hair, in a plain steel-grey coat
 *   Schrödinger — round wire-rimmed glasses, receding dark hair swept back, bow tie, grey suit;
 *              a flickering cat (alive? dead?) rides on his shoulder
 *   Heisenberg — young, with a thick upswept wave of sandy-blond hair, slate suit
 *   Hawking  — side-parted brown hair, glasses, dark jacket and open-collared blue shirt, in a
 *              futuristic hover chair (in life he used a motorised wheelchair and a speech computer;
 *              here it hovers, with his screen mounted at the side)
 *   Doppler  — 1840s Austrian: high forehead, dark hair and side-whiskers, high collar and black
 *              stock, navy coat; a tuning fork in hand
 */
export type HairStyle = 'periwig' | 'slick' | 'bun' | 'wild' | 'balding' | 'curly' | 'wavy' | 'long' | 'receding' | 'quiff' | 'side';
export type Outfit = 'frockcoat' | 'suit' | 'dress' | 'cardigan' | 'robe' | 'chiton';
export type Stance = 'boxer' | 'showman' | 'chemist' | 'professor';

export interface Look {
  glow: number;         // neon outline colour (signature colour)
  skin: number;
  hair: number;
  hairShade: number;
  coat: number;         // main garment
  coatShade: number;
  trim: number;         // buttons, cuffs, lapels
  shirt: number;        // collar / cravat
  accent: number;       // tie, waistcoat, etc.
  legs: number;         // breeches / trousers / stockings
  shoes: number;
  hairStyle: HairStyle;
  outfit: Outfit;
  stance: Stance;
  moustache: 'none' | 'thin' | 'bushy';
  beard?: 'full';
  /** Forward stoop of the upper body (radians). */
  posture?: number;
  brows: 'stern' | 'fine' | 'soft' | 'bushy';
  /** Shoulder width as a fraction of height. */
  shoulders: number;
  /** Visual-only prop held in the back hand (the cat sits on the back shoulder). */
  prop?: 'vial' | 'telescope' | 'cat' | 'fork';
  glasses?: 'round' | 'square';
  tie?: 'bow';
  sideburns?: boolean;
  /** Sits in a hover chair (Hawking). */
  seated?: boolean;
}

export const LOOKS: Record<string, Look> = {
  newton: {
    glow: 0xffcc33, skin: 0xf0c9a6, hair: 0xd8cfbf, hairShade: 0xa89f8e,
    coat: 0x7a2232, coatShade: 0x561522, trim: 0xe0b84a, shirt: 0xf6f2e8, accent: 0x9a7a3a,
    legs: 0x3b2b26, shoes: 0x171212, hairStyle: 'periwig', outfit: 'frockcoat', stance: 'boxer',
    moustache: 'none', brows: 'stern', shoulders: 0.27,
  },
  tesla: {
    glow: 0x33bbff, skin: 0xe9bf9b, hair: 0x17171c, hairShade: 0x2b2b33,
    coat: 0x1d2333, coatShade: 0x131826, trim: 0x8fa3c4, shirt: 0xedf0f5, accent: 0x33bbff,
    legs: 0x1d2333, shoes: 0x0d0d10, hairStyle: 'slick', outfit: 'suit', stance: 'showman',
    moustache: 'thin', brows: 'fine', shoulders: 0.23,
  },
  curie: {
    glow: 0x7cff6b, skin: 0xf2cdb0, hair: 0x4b3426, hairShade: 0x33241a,
    coat: 0x24212b, coatShade: 0x18161d, trim: 0x55505f, shirt: 0xebe8e1, accent: 0x7cff6b,
    legs: 0x24212b, shoes: 0x141217, hairStyle: 'bun', outfit: 'dress', stance: 'chemist',
    moustache: 'none', brows: 'soft', shoulders: 0.21, prop: 'vial',
  },
  einstein: {
    glow: 0xb57bff, skin: 0xf0c6a2, hair: 0xf3f3ef, hairShade: 0xc9c9c4,
    coat: 0x8b9097, coatShade: 0x6c7178, trim: 0x5d6168, shirt: 0xf0f0ea, accent: 0x7f6a52,
    legs: 0x6b5a47, shoes: 0x3a2c22, hairStyle: 'wild', outfit: 'cardigan', stance: 'professor',
    moustache: 'bushy', brows: 'bushy', shoulders: 0.28,
  },
  galileo: {
    glow: 0xffa630, skin: 0xeec4a0, hair: 0xcfc7b8, hairShade: 0x9a9284,
    coat: 0x1f1c22, coatShade: 0x151317, trim: 0xd9b25a, shirt: 0xf2eee4, accent: 0xffa630,
    legs: 0x2a2420, shoes: 0x1a1512, hairStyle: 'balding', outfit: 'robe', stance: 'showman',
    moustache: 'bushy', beard: 'full', brows: 'soft', shoulders: 0.22, prop: 'telescope',
  },
  archimedes: {
    glow: 0xcd7f32, skin: 0xdfae84, hair: 0xd6d1c7, hairShade: 0xa39d91,
    coat: 0xefe6d2, coatShade: 0xd1c4a9, trim: 0xcd7f32, shirt: 0xefe6d2, accent: 0x8c4a2b,
    legs: 0xdfae84, shoes: 0x7a5230, hairStyle: 'curly', outfit: 'chiton', stance: 'boxer',
    moustache: 'bushy', beard: 'full', brows: 'bushy', shoulders: 0.29,
  },
  faraday: {
    glow: 0xe8834a, skin: 0xf0c8a6, hair: 0x8f8478, hairShade: 0x645a50,
    coat: 0x2d2522, coatShade: 0x201a18, trim: 0xe8834a, shirt: 0xf1ede4, accent: 0x1c1c1c,
    legs: 0x2d2522, shoes: 0x121010, hairStyle: 'wavy', outfit: 'suit', stance: 'professor',
    moustache: 'none', brows: 'soft', shoulders: 0.23,
  },
  hooke: {
    glow: 0xc8d2dc, skin: 0xe6c2a2, hair: 0x5a4030, hairShade: 0x3e2b20,
    coat: 0x56606c, coatShade: 0x3f4650, trim: 0xc8d2dc, shirt: 0xece8df, accent: 0x8a96a3,
    legs: 0x2b2f36, shoes: 0x141518, hairStyle: 'long', outfit: 'frockcoat', stance: 'showman',
    moustache: 'none', brows: 'fine', shoulders: 0.2, posture: 0.12,
  },
  schrodinger: {
    glow: 0x2ee6c9, skin: 0xefc6a3, hair: 0x3b2e26, hairShade: 0x261d18,
    coat: 0x343a45, coatShade: 0x252a33, trim: 0x8d98a6, shirt: 0xf1eee6, accent: 0x1f7a6e,
    legs: 0x343a45, shoes: 0x15161a, hairStyle: 'receding', outfit: 'suit', stance: 'professor',
    moustache: 'none', brows: 'fine', shoulders: 0.23, glasses: 'round', tie: 'bow', prop: 'cat',
  },
  heisenberg: {
    glow: 0xff3df2, skin: 0xf2cfb3, hair: 0xd8b46a, hairShade: 0xa8873f,
    coat: 0x4a5568, coatShade: 0x384152, trim: 0xc3cad6, shirt: 0xf3f1ea, accent: 0x7a2b5c,
    legs: 0x4a5568, shoes: 0x1b1a1d, hairStyle: 'quiff', outfit: 'suit', stance: 'boxer',
    moustache: 'none', brows: 'soft', shoulders: 0.24,
  },
  hawking: {
    glow: 0x6f7bff, skin: 0xecc5a5, hair: 0x6b4a33, hairShade: 0x4a3322,
    coat: 0x262a36, coatShade: 0x1b1e27, trim: 0x6f7bff, shirt: 0xdfe6f2, accent: 0xdfe6f2,
    legs: 0x2c3140, shoes: 0x111216, hairStyle: 'side', outfit: 'suit', stance: 'professor',
    moustache: 'none', brows: 'soft', shoulders: 0.21, glasses: 'square', seated: true,
  },
  doppler: {
    glow: 0xff4d6d, skin: 0xeec7a5, hair: 0x2e2420, hairShade: 0x1e1714,
    coat: 0x1d2433, coatShade: 0x141924, trim: 0xb8a07a, shirt: 0xf2eee4, accent: 0x161616,
    legs: 0x262a33, shoes: 0x101012, hairStyle: 'balding', outfit: 'suit', stance: 'boxer',
    moustache: 'none', brows: 'stern', shoulders: 0.27, sideburns: true, prop: 'fork',
  },
  prototype: {
    glow: 0xe9ece4, skin: 0xd0d4d8, hair: 0x3a3f45, hairShade: 0x2a2e33,
    coat: 0x2a2f36, coatShade: 0x1d2126, trim: 0x8a9099, shirt: 0xd0d4d8, accent: 0xe9ece4,
    legs: 0x2a2f36, shoes: 0x15171a, hairStyle: 'slick', outfit: 'suit', stance: 'boxer',
    moustache: 'none', brows: 'fine', shoulders: 0.24,
  },
};

/**
 * Unlockable historical skins (costume overrides; the neon signature colour stays the same).
 * Ids must match `codex/unlocks.json` on the server.
 */
export const SKINS: Record<string, Record<string, { name: string; look: Partial<Look> }>> = {
  newton: {
    'royal-society': { name: 'Royal Society President', look: { coat: 0x1f2f5a, coatShade: 0x15203f, trim: 0xd3d9e2, legs: 0x1b1b24, accent: 0x9aa6b8 } },
  },
  tesla: {
    'colorado-springs': { name: 'Colorado Springs 1899', look: { coat: 0x6f7681, coatShade: 0x565c66, trim: 0xd9dee6, legs: 0x5d636c, accent: 0x9b2c2c } },
  },
  curie: {
    'radium-institute': { name: 'Radium Institute Lab Coat', look: { coat: 0xe6e9e4, coatShade: 0xc3c8c2, trim: 0x8a8f8a, shirt: 0x24212b } },
  },
  einstein: {
    // In 1905 the young patent clerk had dark hair and wore a brown suit.
    'patent-clerk': { name: 'Bern Patent Clerk, 1905', look: { coat: 0x5a3e2b, coatShade: 0x45301f, trim: 0x8b6b4a, legs: 0x4a3526,
      hair: 0x3b2a20, hairShade: 0x2a1d16, outfit: 'suit', accent: 0x7a2b2b } },
  },
};

export const skinName = (fighter: string, skin: string) => skin === 'classic' ? 'Classic' : SKINS[fighter]?.[skin]?.name ?? skin;

export const lookFor = (id: string, skin?: string | null): Look => {
  const base = LOOKS[id] ?? LOOKS.prototype;
  const variant = skin && skin !== 'classic' ? SKINS[id]?.[skin] : undefined;
  return variant ? { ...base, ...variant.look } : base;
};
