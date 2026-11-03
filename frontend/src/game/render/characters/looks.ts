/**
 * Character art direction: stylised, recognisable caricatures of each scientist, drawn as chalk
 * outlines that glow in their signature neon over muted period-accurate costumes.
 *
 * These are respectful homages built from each person's best-known features in historical portraits:
 *   Newton   — long curled periwig, 17th-century long coat with turned-back cuffs, white cravat
 *   Tesla    — tall and lean, centre-parted slicked black hair, thin moustache, dark three-piece suit
 *   Curie    — hair drawn up into a bun, long dark Victorian dress with high collar, glowing vial
 *   Einstein — wild white hair, bushy moustache, baggy grey cardigan
 */
export type HairStyle = 'periwig' | 'slick' | 'bun' | 'wild';
export type Outfit = 'frockcoat' | 'suit' | 'dress' | 'cardigan';
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
  brows: 'stern' | 'fine' | 'soft' | 'bushy';
  /** Shoulder width as a fraction of height. */
  shoulders: number;
  /** Visual-only prop held in the back hand. */
  prop?: 'vial';
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
  prototype: {
    glow: 0xe9ece4, skin: 0xd0d4d8, hair: 0x3a3f45, hairShade: 0x2a2e33,
    coat: 0x2a2f36, coatShade: 0x1d2126, trim: 0x8a9099, shirt: 0xd0d4d8, accent: 0xe9ece4,
    legs: 0x2a2f36, shoes: 0x15171a, hairStyle: 'slick', outfit: 'suit', stance: 'boxer',
    moustache: 'none', brows: 'fine', shoulders: 0.24,
  },
};

export const lookFor = (id: string): Look => LOOKS[id] ?? LOOKS.prototype;
