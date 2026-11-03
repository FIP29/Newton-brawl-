import type { FighterDefinition, FighterView } from '../../protocol';
import type { Look } from './looks';

/** 2D point in character space: x forward (facing direction), y DOWN, feet at (0, 0). */
export interface P { x: number; y: number }

/**
 * A skeleton pose. Animations only choose where hands, feet, hips, chest and head go; elbows and
 * knees are solved with two-bone inverse kinematics, which keeps every pose anatomically plausible.
 */
export interface Pose {
  hip: P; chest: P; head: P;
  shoulderF: P; shoulderB: P; elbowF: P; elbowB: P; handF: P; handB: P;
  hipF: P; hipB: P; kneeF: P; kneeB: P; footF: P; footB: P;
  /** Whole-body rotation around the feet (KO fall), radians. */
  bodyRot: number;
  headTilt: number;
  /** -1..1 sway for coat tails / skirt / hair from horizontal speed. */
  sway: number;
  expression: 'calm' | 'focus' | 'shout' | 'hurt' | 'ko';
  /** 0..1 how "charged" the character looks (specials/ultimates). */
  power: number;
  handFOpen: boolean;
  /** End of a whip/elastic lash held in the front hand (Hooke), or null. */
  whip: P | null;
}

/** Animation state the rig keeps between frames. */
export interface RigState { walkPhase: number; koTime: number; time: number; lastAction: string }

export const newRigState = (): RigState => ({ walkPhase: 0, koTime: 0, time: Math.random() * 10, lastAction: 'IDLE' });

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lp = (a: P, b: P, t: number): P => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const ease = (t: number) => 1 - (1 - t) * (1 - t);

/** Two-bone IK: joint position for a limb from `a` reaching toward `t`. `bend` picks the side the joint folds to. */
export function ik(a: P, t: P, l1: number, l2: number, bend: number): P {
  const dx = t.x - a.x, dy = t.y - a.y;
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const ang = Math.atan2(dy, dx);
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const j = ang + bend * Math.acos(Math.max(-1, Math.min(1, cos)));
  return { x: a.x + Math.cos(j) * l1, y: a.y + Math.sin(j) * l1 };
}

/** Clamp a reach target to what the limb can actually touch. */
function reach(a: P, t: P, len: number): P {
  const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
  if (d <= len) return t;
  return { x: a.x + dx / d * len, y: a.y + dy / d * len };
}

/**
 * Computes the pose for the current frame from authoritative fighter state.
 * Purely cosmetic: nothing here affects gameplay.
 */
export function computePose(v: FighterView, def: FighterDefinition, look: Look, st: RigState, dt: number): Pose {
  const H = def.body.height;
  st.time += dt;
  const t = st.time;
  if (v.action === 'KO') st.koTime += dt; else st.koTime = 0;
  if (v.action === 'WALK') st.walkPhase += dt * (Math.abs(v.vx) / (H * 0.55)) * Math.PI * 2 * Math.sign(v.vx * v.facing || 1);
  st.lastAction = v.action;

  const breathe = Math.sin(t * 2.4) * H * 0.006;
  const upper = H * 0.17, fore = H * 0.17, thigh = H * 0.245, shin = H * 0.245;
  const sw = look.shoulders * H;

  // ---- base stance -----------------------------------------------------------
  let hip: P = { x: 0, y: -H * 0.47 + breathe * 0.4 };
  let chest: P = { x: H * 0.02, y: -H * 0.74 + breathe };
  let head: P = { x: H * 0.04, y: -H * 0.9 + breathe };
  let footF: P = { x: H * 0.1, y: 0 }, footB: P = { x: -H * 0.08, y: 0 };
  let handF: P, handB: P;
  switch (look.stance) {
    case 'boxer':     handF = { x: H * 0.17, y: -H * 0.74 }; handB = { x: H * 0.09, y: -H * 0.7 }; break;
    case 'showman':   handF = { x: H * 0.18, y: -H * 0.66 + Math.sin(t * 3) * H * 0.01 }; handB = { x: -H * 0.02, y: -H * 0.52 }; break;
    case 'chemist':   handF = { x: H * 0.14, y: -H * 0.64 }; handB = { x: -H * 0.04, y: -H * 0.6 }; break;
    case 'professor': handF = { x: H * 0.12, y: -H * 0.6 }; handB = { x: H * 0.04, y: -H * 0.56 }; break;
  }
  let bodyRot = 0, headTilt = 0, power = 0;
  let expression: Pose['expression'] = 'calm';
  let handFOpen = look.stance !== 'boxer';
  let lean = look.posture ?? 0;
  let whip: P | null = null;

  switch (v.action) {
    case 'WALK': {
      const ph = st.walkPhase;
      footF = { x: H * 0.02 + Math.sin(ph) * H * 0.13, y: -Math.max(0, Math.cos(ph)) * H * 0.05 };
      footB = { x: H * 0.0 - Math.sin(ph) * H * 0.13, y: -Math.max(0, -Math.cos(ph)) * H * 0.05 };
      const bob = Math.abs(Math.sin(ph)) * H * 0.015;
      hip.y += bob; chest.y += bob; head.y += bob;
      handF = { x: handF.x - Math.sin(ph) * H * 0.04, y: handF.y };
      handB = { x: handB.x + Math.sin(ph) * H * 0.05, y: handB.y };
      lean = 0.04;
      break;
    }
    case 'CROUCH':
      hip = { x: -H * 0.02, y: -H * 0.3 };
      chest = { x: H * 0.08, y: -H * 0.56 };
      head = { x: H * 0.12, y: -H * 0.68 };
      footF = { x: H * 0.16, y: 0 }; footB = { x: -H * 0.12, y: 0 };
      handF = { x: H * 0.2, y: -H * 0.52 }; handB = { x: H * 0.12, y: -H * 0.48 };
      expression = 'focus';
      break;
    case 'AIRBORNE': {
      const rising = v.vy > 0;
      footF = { x: H * 0.12, y: -H * 0.14 }; footB = { x: -H * 0.04, y: -H * 0.08 };
      handF = rising ? { x: H * 0.12, y: -H * 0.95 } : { x: H * 0.22, y: -H * 0.72 };
      handB = rising ? { x: -H * 0.08, y: -H * 0.9 } : { x: -H * 0.16, y: -H * 0.7 };
      handFOpen = true;
      if (v.flip > 0) { headTilt = 0.4 * Math.sin(t * 5); expression = 'hurt'; }
      break;
    }
    case 'HITSTUN': {
      lean = -0.28;
      headTilt = -0.35;
      handF = { x: -H * 0.05, y: -H * 0.88 }; handB = { x: -H * 0.2, y: -H * 0.75 };
      footF = { x: H * 0.16, y: v.grounded ? 0 : -H * 0.06 };
      handFOpen = true;
      expression = 'hurt';
      break;
    }
    case 'KO': {
      const k = Math.min(1, st.koTime * 2.6);
      bodyRot = -ease(k) * Math.PI * 0.47;
      handF = { x: -H * 0.12, y: -H * 0.95 }; handB = { x: -H * 0.25, y: -H * 0.85 };
      footF = { x: H * 0.18, y: -H * 0.02 };
      headTilt = -0.4;
      handFOpen = true;
      expression = 'ko';
      break;
    }
    case 'ATTACK': {
      const m = v.move ? def.moves[v.move] : undefined;
      if (!m) break;
      const f = v.moveFrame;
      const total = m.startup + m.active + m.recovery;
      const kind = m.kind ?? 'NORMAL';
      // phase 0..1 within startup / active / recovery
      const inStartup = f < m.startup, inActive = !inStartup && f < m.startup + m.active;
      const pS = Math.min(1, f / Math.max(1, m.startup));
      const pR = inStartup || inActive ? 0 : (f - m.startup - m.active) / Math.max(1, m.recovery);
      expression = kind === 'NORMAL' ? 'focus' : 'shout';
      power = kind === 'ULTIMATE' ? 1 : kind === 'SPECIAL' ? (inStartup ? pS : 1 - pR) : 0;

      if (kind !== 'NORMAL' && m.hitbox) {
        // A special with its own hitbox (Hooke's Elastic Whip): the arm cracks a lash to the hitbox tip.
        const hb = m.hitbox;
        const tip: P = { x: hb.x + hb.w * 0.5, y: -hb.y };
        handF = inStartup ? lp(handF, { x: -H * 0.08, y: -H * 0.95 }, ease(pS)) : { x: H * 0.3, y: -H * 0.72 };
        if (inActive) whip = tip;
        else if (!inStartup) whip = lp(tip, handF, ease(pR));
        lean = 0.12;
        handFOpen = false;
      } else if (kind === 'NORMAL') {
        const hb = m.hitbox!;
        const tip: P = { x: hb.x + hb.w * 0.4, y: -hb.y };
        const heavy = v.move === 'heavy';
        const wind: P = heavy ? { x: -H * 0.1, y: -H * 0.8 } : { x: H * 0.06, y: -H * 0.74 };
        if (inStartup) { handF = lp(handF, wind, ease(pS)); lean = heavy ? -0.1 * pS : 0; }
        else if (inActive) { handF = tip; lean = heavy ? 0.18 : 0.08; footF = { x: H * 0.18, y: 0 }; }
        else { handF = lp(tip, handF, ease(pR)); lean = (heavy ? 0.18 : 0.08) * (1 - pR); }
        handFOpen = false;
      } else {
        const castPose = castPoseFor(def.id, v.move!, H);
        const target = inStartup ? lp(handF, castPose.f, ease(pS)) : inActive ? castPose.f : lp(castPose.f, handF, ease(pR));
        const targetB = inStartup ? lp(handB, castPose.b, ease(pS)) : inActive ? castPose.b : lp(castPose.b, handB, ease(pR));
        handF = target; handB = targetB;
        lean = castPose.lean * (inStartup ? pS : 1 - pR);
        if (castPose.crouch) {
          const c = inStartup ? pS : 1 - pR;
          hip.y = lerp(hip.y, -H * 0.3, c); chest = lp(chest, { x: H * 0.1, y: -H * 0.55 }, c); head = lp(head, { x: H * 0.14, y: -H * 0.67 }, c);
          footF = { x: H * 0.16, y: 0 }; footB = { x: -H * 0.12, y: 0 };
        }
        handFOpen = true;
      }
      void total;
      break;
    }
    default:
      break;
  }
  if (v.reflect > 0) power = Math.max(power, 0.6);

  if (look.seated) {
    // Hover chair: seated torso, feet on the footrest, gentle bob. A KO sets the chair down instead
    // of toppling it; crouching lowers it and he leans in.
    const hover = Math.sin(t * 2.2) * H * 0.012;
    const down = v.action === 'KO' ? H * 0.07 * Math.min(1, st.koTime * 2) : v.action === 'CROUCH' ? H * 0.12 : 0;
    const dy = hover + down;
    hip = { x: -H * 0.05, y: -H * 0.38 + dy };
    chest = { x: H * 0.0, y: -H * 0.64 + breathe + dy };
    head = { x: H * 0.03, y: -H * 0.8 + breathe + dy };
    footF = { x: H * 0.2, y: -H * 0.09 + dy };
    footB = { x: H * 0.15, y: -H * 0.09 + dy };
    handF = { x: handF.x, y: handF.y + H * 0.1 + dy };
    handB = { x: handB.x, y: handB.y + H * 0.1 + dy };
    if (v.action === 'CROUCH') lean = 0.45;
    if (v.action === 'KO') { bodyRot = 0; lean = 0.25; headTilt = 0.5; }
    if (v.action === 'WALK') lean = 0.06;
  }

  // Lean rotates the upper body around the hip.
  const rot = (p: P, a: number): P => {
    const dx = p.x - hip.x, dy = p.y - hip.y;
    return { x: hip.x + dx * Math.cos(a) - dy * Math.sin(a), y: hip.y + dx * Math.sin(a) + dy * Math.cos(a) };
  };
  chest = rot(chest, lean);
  head = rot(head, lean * 1.15);
  handF = rot(handF, lean * 0.5);
  handB = rot(handB, lean * 0.5);

  const shoulderF: P = { x: chest.x + sw * 0.25, y: chest.y + H * 0.01 };
  const shoulderB: P = { x: chest.x - sw * 0.3, y: chest.y + H * 0.005 };
  const hipF: P = { x: hip.x + H * 0.03, y: hip.y }, hipB: P = { x: hip.x - H * 0.03, y: hip.y };
  handF = reach(shoulderF, handF, upper + fore);
  handB = reach(shoulderB, handB, upper + fore);
  footF = reach(hipF, footF, thigh + shin);
  footB = reach(hipB, footB, thigh + shin);

  return {
    hip, chest, head, shoulderF, shoulderB,
    elbowF: ik(shoulderF, handF, upper, fore, 1),
    elbowB: ik(shoulderB, handB, upper, fore, 1),
    handF, handB, hipF, hipB,
    kneeF: ik(hipF, footF, thigh, shin, -1),
    kneeB: ik(hipB, footB, thigh, shin, -1),
    footF, footB, bodyRot, headTilt,
    sway: Math.max(-1, Math.min(1, -v.vx * v.facing / 600)),
    expression, power, handFOpen, whip,
  };
}

/** Signature casting poses per special (hand targets in character space). */
function castPoseFor(id: string, move: string, H: number): { f: P; b: P; lean: number; crouch?: boolean } {
  const key = `${id}.${move}`;
  switch (key) {
    case 'newton.special1': return { f: { x: H * 0.1, y: -H * 1.08 }, b: { x: -H * 0.05, y: -H * 0.62 }, lean: -0.05 };   // points to the sky
    case 'newton.special2': return { f: { x: H * 0.3, y: -H * 0.72 }, b: { x: H * 0.26, y: -H * 0.62 }, lean: 0.12 };     // two-palm push
    case 'newton.ultimate': return { f: { x: H * 0.25, y: -H * 0.95 }, b: { x: -H * 0.22, y: -H * 0.95 }, lean: -0.05 };  // arms spread
    case 'tesla.special1':  return { f: { x: H * 0.33, y: -H * 0.68 }, b: { x: -H * 0.06, y: -H * 0.5 }, lean: 0.1 };     // finger-gun thrust
    case 'tesla.special2':  return { f: { x: H * 0.2, y: -H * 0.7 }, b: { x: H * 0.15, y: -H * 0.62 }, lean: -0.12 };     // pull toward self
    case 'tesla.ultimate':  return { f: { x: H * 0.08, y: -H * 1.12 }, b: { x: -H * 0.08, y: -H * 1.1 }, lean: -0.08 };   // channels the sky
    case 'curie.special1':  return { f: { x: H * 0.3, y: -H * 0.72 }, b: { x: -H * 0.12, y: -H * 0.6 }, lean: 0.14 };     // lob
    case 'curie.special2':  return { f: { x: H * 0.24, y: -H * 0.06 }, b: { x: -H * 0.02, y: -H * 0.45 }, lean: 0.2, crouch: true }; // kneels to place trap
    case 'curie.ultimate':  return { f: { x: H * 0.26, y: -H * 0.9 }, b: { x: -H * 0.24, y: -H * 0.9 }, lean: 0 };
    case 'einstein.special1': return { f: { x: H * 0.28, y: -H * 0.66 }, b: { x: -H * 0.22, y: -H * 0.62 }, lean: 0.3 };  // blur forward
    case 'einstein.special2': return { f: { x: H * 0.3, y: -H * 0.8 }, b: { x: H * 0.04, y: -H * 0.58 }, lean: 0.05 };   // conjures a clock
    case 'einstein.ultimate': return { f: { x: H * 0.32, y: -H * 0.68 }, b: { x: H * 0.3, y: -H * 0.62 }, lean: 0.14 };  // two-hand release
    case 'galileo.special1':  return { f: { x: H * 0.26, y: -H * 0.98 }, b: { x: -H * 0.06, y: -H * 0.6 }, lean: -0.04 }; // sets the pendulum swinging
    case 'galileo.special2':  return { f: { x: H * 0.08, y: -H * 1.12 }, b: { x: -H * 0.04, y: -H * 0.62 }, lean: -0.08 }; // points up the tower
    case 'galileo.ultimate':  return { f: { x: H * 0.16, y: -H * 0.9 }, b: { x: H * 0.13, y: -H * 0.88 }, lean: -0.12 };  // telescope to the sky
    case 'archimedes.special1': return { f: { x: H * 0.26, y: -H * 0.2 }, b: { x: H * 0.18, y: -H * 0.22 }, lean: 0.3, crouch: true }; // presses the lever
    case 'archimedes.special2': return { f: { x: H * 0.3, y: -H * 0.62 }, b: { x: H * 0.26, y: -H * 0.56 }, lean: 0.06 };
    case 'archimedes.ultimate': return { f: { x: H * 0.2, y: -H * 1.14 }, b: { x: -H * 0.16, y: -H * 1.1 }, lean: -0.1 }; // raises the mirror
    case 'faraday.special1':  return { f: { x: H * 0.12, y: -H * 0.72 }, b: { x: H * 0.1, y: -H * 0.74 }, lean: 0 };     // braces inside the cage
    case 'faraday.special2':  return { f: { x: H * 0.3, y: -H * 0.32 }, b: { x: -H * 0.04, y: -H * 0.58 }, lean: 0.22 }; // sets the coil
    case 'faraday.ultimate':  return { f: { x: H * 0.3, y: -H * 0.82 }, b: { x: -H * 0.3, y: -H * 0.82 }, lean: 0 };     // spins up the dynamo
    case 'hooke.special1':    return { f: { x: H * 0.22, y: -H * 0.06 }, b: { x: -H * 0.02, y: -H * 0.45 }, lean: 0.2, crouch: true };
    case 'schrodinger.special1': return { f: { x: H * 0.28, y: -H * 0.72 }, b: { x: -H * 0.26, y: -H * 0.7 }, lean: 0 };     // splits in two
    case 'schrodinger.special2': return { f: { x: H * 0.24, y: -H * 0.08 }, b: { x: -H * 0.02, y: -H * 0.45 }, lean: 0.2, crouch: true }; // sets down the box
    case 'schrodinger.ultimate': return { f: { x: H * 0.18, y: -H * 1.08 }, b: { x: -H * 0.12, y: -H * 1.05 }, lean: -0.06 }; // conducts the wave
    case 'heisenberg.special1':  return { f: { x: H * 0.3, y: -H * 0.68 }, b: { x: -H * 0.2, y: -H * 0.6 }, lean: 0.32 };   // smeared forward
    case 'heisenberg.special2':  return { f: { x: H * 0.34, y: -H * 0.7 }, b: { x: H * 0.02, y: -H * 0.55 }, lean: 0.1 };   // fires a photon
    case 'heisenberg.ultimate':  return { f: { x: H * 0.3, y: -H * 0.86 }, b: { x: H * 0.26, y: -H * 0.8 }, lean: -0.05 };
    case 'hawking.special1':     return { f: { x: H * 0.32, y: -H * 0.66 }, b: { x: H * 0.1, y: -H * 0.55 }, lean: 0.05 };
    case 'hawking.special2':     return { f: { x: H * 0.24, y: -H * 0.95 }, b: { x: H * 0.02, y: -H * 0.55 }, lean: 0 };
    case 'hawking.ultimate':     return { f: { x: H * 0.18, y: -H * 1.06 }, b: { x: -H * 0.12, y: -H * 1.02 }, lean: -0.05 };
    case 'doppler.special1':     return { f: { x: H * 0.32, y: -H * 0.72 }, b: { x: H * 0.1, y: -H * 0.66 }, lean: 0.1 };    // strikes the fork
    case 'doppler.special2':     return { f: { x: H * 0.3, y: -H * 0.62 }, b: { x: -H * 0.24, y: -H * 0.62 }, lean: 0.35 };  // breaks the sound barrier
    case 'doppler.ultimate':     return { f: { x: H * 0.33, y: -H * 0.72 }, b: { x: H * 0.3, y: -H * 0.66 }, lean: 0.15 };
    case 'bernoulli.special1':  return { f: { x: H * 0.12, y: -H * 1.1 }, b: { x: -H * 0.1, y: -H * 1.05 }, lean: -0.05 };  // rides the updraft
    case 'bernoulli.special2':  return { f: { x: H * 0.34, y: -H * 0.68 }, b: { x: H * 0.3, y: -H * 0.62 }, lean: 0.12 };
    case 'bernoulli.ultimate':  return { f: { x: H * 0.26, y: -H * 1.0 }, b: { x: -H * 0.24, y: -H * 0.98 }, lean: 0 };       // whips up the wind
    case 'edison.special1':     return { f: { x: H * 0.34, y: -H * 0.68 }, b: { x: H * 0.08, y: -H * 0.62 }, lean: 0.16 };   // a straight DC jab
    case 'edison.special2':     return { f: { x: H * 0.1, y: -H * 0.98 }, b: { x: H * 0.28, y: -H * 0.8 }, lean: -0.05 };    // holds the bulb up high
    case 'edison.ultimate':     return { f: { x: H * 0.3, y: -H * 0.8 }, b: { x: H * 0.06, y: -H * 0.62 }, lean: 0.05 };      // presents the patent
    case 'sn-bose.special1':    return { f: { x: H * 0.32, y: -H * 0.7 }, b: { x: H * 0.28, y: -H * 0.64 }, lean: 0.08 };
    case 'sn-bose.special2':    return { f: { x: H * 0.24, y: -H * 0.78 }, b: { x: -H * 0.24, y: -H * 0.78 }, lean: 0 };      // mirrors
    case 'sn-bose.ultimate':    return { f: { x: H * 0.16, y: -H * 1.06 }, b: { x: -H * 0.14, y: -H * 1.04 }, lean: -0.05 };
    case 'jc-bose.special1':    return { f: { x: H * 0.34, y: -H * 0.72 }, b: { x: H * 0.02, y: -H * 0.6 }, lean: 0.1 };      // aims the transmitter
    case 'jc-bose.special2':    return { f: { x: H * 0.24, y: -H * 0.06 }, b: { x: -H * 0.02, y: -H * 0.45 }, lean: 0.2, crouch: true }; // plants a seed
    case 'jc-bose.ultimate':    return { f: { x: H * 0.24, y: -H * 0.4 }, b: { x: -H * 0.22, y: -H * 0.4 }, lean: 0.1, crouch: true };  // hands to the earth
    case 'hooke.ultimate':    return { f: { x: H * 0.16, y: -H * 0.52 }, b: { x: -H * 0.1, y: -H * 0.52 }, lean: -0.12 }; // strains past the limit
    default: return { f: { x: H * 0.28, y: -H * 0.7 }, b: { x: H * 0.05, y: -H * 0.6 }, lean: 0.08 };
  }
}
