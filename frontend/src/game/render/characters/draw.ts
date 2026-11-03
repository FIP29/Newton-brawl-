import type { Graphics } from 'pixi.js';
import type { Look } from './looks';
import type { P, Pose } from './rig';

/**
 * Draws a scientist into a Graphics in character space (x forward, y down, feet at the origin).
 * Every part is filled with a muted costume colour and outlined in the fighter's neon — the
 * "Neon Chalkboard" look. Pure vector, so it stays crisp at any zoom (including portraits).
 */
export function drawCharacter(g: Graphics, pose: Pose, look: Look, H: number, time: number) {
  const ow = Math.max(2, H * 0.016);           // outline width
  const glow = look.glow;
  const sw = look.shoulders * H;
  const r = H * 0.105;                          // head radius (caricature proportions)

  const longSkirt = look.outfit === 'dress' || look.outfit === 'robe';

  // ---------------------------------------------------------------- back layers
  if (look.hairStyle === 'periwig') periwigBack(g, pose.head, r, look, ow, time);
  if (look.hairStyle === 'wild') wildHairBack(g, pose.head, r, look, ow, time);
  if (look.hairStyle === 'long') longHairBack(g, pose.head, r, look, ow, pose.sway);

  if (look.seated) hoverChair(g, pose, H, look, ow, time);

  // back arm
  arm(g, pose.shoulderB, pose.elbowB, pose.handB, look, H, ow, true, true);
  if (look.prop === 'vial') vial(g, pose.handB, H, look, time);
  if (look.prop === 'telescope') telescope(g, pose.elbowB, pose.handB, H, look, ow);
  if (look.prop === 'fork') tuningFork(g, pose.elbowB, pose.handB, H, look, ow, pose.power, time);

  // back leg + skirts/coat tails behind
  if (!longSkirt) leg(g, pose.hipB, pose.kneeB, pose.footB, look, H, ow, true);
  else shoe(g, pose.footB, H, look, ow);

  // A long coat or tunic covers the front thigh; shorter garments sit behind the leg.
  if (look.outfit === 'frockcoat' || look.outfit === 'chiton') leg(g, pose.hipF, pose.kneeF, pose.footF, look, H, ow, false);
  torso(g, pose, look, H, sw, ow);
  if (look.outfit === 'suit' || look.outfit === 'cardigan') leg(g, pose.hipF, pose.kneeF, pose.footF, look, H, ow, false);
  if (longSkirt) shoe(g, pose.footF, H, look, ow);

  // neck + head
  const neckBase = { x: pose.chest.x + H * 0.01, y: pose.chest.y - H * 0.01 };
  g.moveTo(neckBase.x, neckBase.y).lineTo(pose.head.x - r * 0.15, pose.head.y + r * 0.7)
    .stroke({ width: H * 0.06 + ow * 2, color: glow, cap: 'round' })
    .moveTo(neckBase.x, neckBase.y).lineTo(pose.head.x - r * 0.15, pose.head.y + r * 0.7)
    .stroke({ width: H * 0.06, color: look.skin, cap: 'round' });
  collar(g, pose, look, H, ow);
  head(g, pose, look, r, ow, time);
  if (look.prop === 'cat') quantumCat(g, pose.shoulderB, H, look, ow, time);
  if (look.seated) chairScreen(g, pose, H, look, ow, time);

  // front arm last so punches read clearly
  arm(g, pose.shoulderF, pose.elbowF, pose.handF, look, H, ow, false, pose.handFOpen);
  if (pose.whip) {
    // Hooke's elastic lash: a taut curve from the fist to the tip
    const h = pose.handF, t = pose.whip;
    const mx = (h.x + t.x) / 2, my = Math.min(h.y, t.y) - H * 0.06;
    g.moveTo(h.x, h.y).quadraticCurveTo(mx, my, t.x, t.y).stroke({ width: ow * 2.4, color: look.glow, cap: 'round' })
      .moveTo(h.x, h.y).quadraticCurveTo(mx, my, t.x, t.y).stroke({ width: ow, color: 0xffffff, cap: 'round' });
    g.circle(t.x, t.y, H * 0.025).fill({ color: 0xffffff });
  }
}

// ------------------------------------------------------------------------ parts

function outlined(g: Graphics, pts: P[], width: number, fill: number, outline: number, ow: number) {
  const path = () => { g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); };
  path(); g.stroke({ width: width + ow * 2, color: outline, cap: 'round', join: 'round' });
  path(); g.stroke({ width, color: fill, cap: 'round', join: 'round' });
}

function arm(g: Graphics, s: P, e: P, h: P, look: Look, H: number, ow: number, back: boolean, open: boolean) {
  const bare = look.outfit === 'chiton';
  const sleeve = bare ? (back ? shade(look.skin, 0.88) : look.skin) : back ? look.coatShade : look.coat;
  const thick = H * (look.outfit === 'cardigan' ? 0.078 : 0.068);
  outlined(g, [s, e, h], thick, sleeve, look.glow, ow);
  // cuff
  const cx = e.x + (h.x - e.x) * 0.78, cy = e.y + (h.y - e.y) * 0.78;
  if (look.outfit === 'frockcoat') {
    g.circle(cx, cy, thick * 0.72).fill(look.trim).stroke({ width: ow * 0.6, color: look.glow });
  } else if (bare) {
    g.circle(cx, cy, thick * 0.4).fill(look.trim); // bronze armlet
  } else {
    g.circle(cx, cy, thick * 0.45).fill(look.shirt);
  }
  // hand
  const hr = H * 0.036;
  g.circle(h.x, h.y, hr).fill(look.skin).stroke({ width: ow, color: look.glow });
  if (open) {
    const ang = Math.atan2(h.y - e.y, h.x - e.x);
    for (let i = -1; i <= 1; i++) {
      const a = ang + i * 0.35;
      g.moveTo(h.x, h.y).lineTo(h.x + Math.cos(a) * hr * 1.7, h.y + Math.sin(a) * hr * 1.7);
    }
    g.stroke({ width: ow * 0.9, color: look.skin, cap: 'round' });
  }
}

function leg(g: Graphics, hip: P, knee: P, foot: P, look: Look, H: number, ow: number, back: boolean) {
  const thick = H * 0.074;
  const trousers = back ? shade(look.legs, 0.8) : look.legs;
  if (look.outfit === 'chiton') {
    outlined(g, [hip, knee, foot], thick * 0.85, trousers, look.glow, ow); // bare legs
  } else if (look.outfit === 'frockcoat') {
    // breeches to the knee, then white stockings
    outlined(g, [hip, knee], thick, trousers, look.glow, ow);
    outlined(g, [knee, foot], thick * 0.78, back ? 0xcfcabd : 0xe9e4d8, look.glow, ow);
  } else {
    outlined(g, [hip, knee, foot], thick, trousers, look.glow, ow);
  }
  shoe(g, foot, H, look, ow);
}

function shoe(g: Graphics, foot: P, H: number, look: Look, ow: number) {
  g.roundRect(foot.x - H * 0.035, foot.y - H * 0.035, H * 0.105, H * 0.04, H * 0.017)
    .fill(look.shoes).stroke({ width: ow * 0.8, color: look.glow });
  if (look.outfit === 'frockcoat') g.rect(foot.x + H * 0.015, foot.y - H * 0.028, H * 0.02, H * 0.014).fill(look.trim); // buckle
  if (look.outfit === 'chiton') {
    // sandal straps wrapping the ankle
    g.moveTo(foot.x - H * 0.02, foot.y - H * 0.03).lineTo(foot.x + H * 0.03, foot.y - H * 0.06)
      .moveTo(foot.x + H * 0.01, foot.y - H * 0.03).lineTo(foot.x - H * 0.01, foot.y - H * 0.07)
      .stroke({ width: ow * 0.7, color: look.shoes });
  }
}

function torso(g: Graphics, pose: Pose, look: Look, H: number, sw: number, ow: number) {
  const { chest: c, hip } = pose;
  const sway = pose.sway * H * 0.06;
  const shF = { x: c.x + sw * 0.42, y: c.y }, shB = { x: c.x - sw * 0.52, y: c.y + H * 0.005 };
  let shape: P[];
  switch (look.outfit) {
    case 'frockcoat':
      // long coat flaring to the knees; tails trail behind when moving
      shape = [shB, shF, { x: hip.x + sw * 0.38, y: hip.y - H * 0.02 }, { x: hip.x + sw * 0.5 + sway * 0.4, y: hip.y + H * 0.25 },
               { x: hip.x - sw * 0.72 + sway, y: hip.y + H * 0.27 }, { x: hip.x - sw * 0.45, y: hip.y - H * 0.02 }];
      break;
    case 'suit':
      shape = [shB, shF, { x: hip.x + sw * 0.36, y: hip.y + H * 0.06 }, { x: hip.x + sw * 0.1, y: hip.y + H * 0.09 },
               { x: hip.x - sw * 0.5 + sway * 0.3, y: hip.y + H * 0.1 }, { x: hip.x - sw * 0.46, y: hip.y }];
      break;
    case 'dress': {
      // fitted bodice, then a full skirt to the ankles that sways
      const waistF = { x: hip.x + sw * 0.32, y: hip.y - H * 0.04 }, waistB = { x: hip.x - sw * 0.36, y: hip.y - H * 0.04 };
      shape = [shB, shF, waistF, { x: hip.x + H * 0.2 + sway * 0.5, y: -H * 0.035 }, { x: hip.x - H * 0.22 + sway, y: -H * 0.035 }, waistB];
      break;
    }
    case 'robe': {
      // scholar's gown falling straight to the ankles
      shape = [shB, shF, { x: hip.x + sw * 0.4, y: hip.y }, { x: hip.x + H * 0.15 + sway * 0.4, y: -H * 0.035 },
               { x: hip.x - H * 0.17 + sway, y: -H * 0.035 }, { x: hip.x - sw * 0.5, y: hip.y }];
      break;
    }
    case 'chiton':
      // knee-length Greek tunic
      shape = [shB, shF, { x: hip.x + sw * 0.42, y: hip.y + H * 0.02 }, { x: hip.x + sw * 0.5 + sway * 0.3, y: hip.y + H * 0.2 },
               { x: hip.x - sw * 0.62 + sway * 0.6, y: hip.y + H * 0.21 }, { x: hip.x - sw * 0.5, y: hip.y + H * 0.02 }];
      break;
    case 'cardigan':
      // baggy, slightly rumpled sweater
      shape = [{ x: shB.x - sw * 0.06, y: shB.y + H * 0.01 }, { x: shF.x + sw * 0.05, y: shF.y + H * 0.01 },
               { x: hip.x + sw * 0.48, y: hip.y + H * 0.05 }, { x: hip.x - sw * 0.6, y: hip.y + H * 0.06 }];
      break;
  }
  const flat = shape.flatMap((p) => [p.x, p.y]);
  g.poly(flat).fill(look.coat).stroke({ width: ow, color: look.glow, join: 'round' });

  // details
  if (look.outfit === 'frockcoat') {
    // gold trimmed front edge + buttons, pocket flap
    g.moveTo(c.x + sw * 0.3, c.y + H * 0.03).lineTo(hip.x + sw * 0.42 + sway * 0.4, hip.y + H * 0.24).stroke({ width: ow * 0.9, color: look.trim });
    for (let i = 0; i < 5; i++) {
      const t = 0.12 + i * 0.17;
      g.circle(c.x + sw * 0.25 + (hip.x - c.x) * t, c.y + (hip.y + H * 0.1 - c.y) * t, H * 0.009).fill(look.trim);
    }
    g.moveTo(hip.x - sw * 0.1, hip.y + H * 0.05).lineTo(hip.x + sw * 0.25, hip.y + H * 0.05).stroke({ width: ow, color: look.trim });
  } else if (look.outfit === 'suit') {
    // lapels, shirt V, glowing tie, buttons
    g.poly([c.x + sw * 0.05, c.y, c.x + sw * 0.36, c.y + H * 0.005, c.x + sw * 0.2, c.y + H * 0.13]).fill(look.shirt);
    if (look.tie === 'bow') {
      const bx = c.x + sw * 0.22, by = c.y + H * 0.012, k = H * 0.03;
      g.poly([bx, by, bx - k, by - k * 0.6, bx - k, by + k * 0.6]).fill(look.accent).stroke({ width: ow * 0.4, color: look.glow });
      g.poly([bx, by, bx + k, by - k * 0.6, bx + k, by + k * 0.6]).fill(look.accent).stroke({ width: ow * 0.4, color: look.glow });
      g.circle(bx, by, k * 0.3).fill(look.accent);
    } else if (look.accent !== look.shirt) {
      g.moveTo(c.x + sw * 0.22, c.y + H * 0.01).lineTo(c.x + sw * 0.21, c.y + H * 0.12).stroke({ width: H * 0.018, color: look.accent, cap: 'round' });
    }
    g.moveTo(c.x + sw * 0.02, c.y).lineTo(c.x + sw * 0.18, c.y + H * 0.15).moveTo(c.x + sw * 0.4, c.y).lineTo(c.x + sw * 0.24, c.y + H * 0.15)
      .stroke({ width: ow * 0.8, color: look.trim });
    for (let i = 0; i < 2; i++) g.circle(c.x + sw * 0.2, c.y + H * (0.19 + i * 0.06), H * 0.007).fill(look.trim);
  } else if (look.outfit === 'robe') {
    // centre opening edged in gold, a few vertical folds
    g.moveTo(c.x + sw * 0.18, c.y + H * 0.04).lineTo(hip.x + H * 0.04 + pose.sway * H * 0.02, -H * 0.04).stroke({ width: ow * 0.8, color: look.trim });
    for (let i = -1; i <= 1; i += 2) g.moveTo(hip.x + i * sw * 0.2, hip.y).lineTo(hip.x + i * H * 0.08 + pose.sway * H * 0.03, -H * 0.05);
    g.stroke({ width: ow * 0.6, color: look.coatShade });
  } else if (look.outfit === 'chiton') {
    // belt, himation sash over one shoulder, meander border at the hem
    g.moveTo(hip.x - sw * 0.5, hip.y + H * 0.02).lineTo(hip.x + sw * 0.42, hip.y + H * 0.02).stroke({ width: ow * 1.4, color: look.accent });
    g.poly([c.x - sw * 0.5, c.y, c.x - sw * 0.2, c.y, hip.x + sw * 0.45, hip.y + H * 0.15, hip.x + sw * 0.2, hip.y + H * 0.17])
      .fill({ color: look.accent, alpha: 0.85 });
    const hemY = hip.y + H * 0.19, x0 = hip.x - sw * 0.56 + pose.sway * H * 0.03, x1 = hip.x + sw * 0.46;
    const step = (x1 - x0) / 8;
    g.moveTo(x0, hemY);
    for (let i = 0; i < 8; i++) g.lineTo(x0 + step * (i + 0.5), hemY - H * 0.018).lineTo(x0 + step * (i + 1), hemY);
    g.stroke({ width: ow * 0.8, color: look.trim });
  } else if (look.outfit === 'dress') {
    // skirt folds and a fitted waist band
    for (let i = -2; i <= 2; i++) {
      g.moveTo(hip.x + i * sw * 0.12, hip.y).lineTo(hip.x + i * H * 0.06 + pose.sway * H * 0.04, -H * 0.05);
    }
    g.stroke({ width: ow * 0.7, color: look.coatShade });
    g.moveTo(hip.x - sw * 0.34, hip.y - H * 0.04).lineTo(hip.x + sw * 0.3, hip.y - H * 0.04).stroke({ width: ow * 1.2, color: look.trim });
    for (let i = 0; i < 4; i++) g.circle(c.x + sw * 0.22, c.y + H * (0.03 + i * 0.04), H * 0.006).fill(look.trim);
  } else {
    // cardigan: V-neck showing shirt, buttons, pocket, knit ribbing
    g.poly([c.x - sw * 0.05, c.y, c.x + sw * 0.38, c.y, c.x + sw * 0.18, c.y + H * 0.12]).fill(look.shirt);
    for (let i = 0; i < 3; i++) g.circle(c.x + sw * 0.2 + (hip.x - c.x) * 0.1 * i, c.y + H * (0.15 + i * 0.06), H * 0.009).fill(look.trim);
    g.roundRect(hip.x + sw * 0.05, hip.y - H * 0.02, sw * 0.3, H * 0.05, H * 0.01).stroke({ width: ow * 0.7, color: look.coatShade });
    g.moveTo(hip.x - sw * 0.58, hip.y + H * 0.03).lineTo(hip.x + sw * 0.46, hip.y + H * 0.025).stroke({ width: ow * 1.4, color: look.coatShade });
  }
}

function collar(g: Graphics, pose: Pose, look: Look, H: number, ow: number) {
  const c = pose.chest;
  if (look.outfit === 'frockcoat') {
    // white lace cravat (jabot)
    g.poly([c.x + H * 0.0, c.y - H * 0.02, c.x + H * 0.07, c.y - H * 0.02, c.x + H * 0.06, c.y + H * 0.07, c.x + H * 0.02, c.y + H * 0.09])
      .fill(look.shirt).stroke({ width: ow * 0.6, color: look.glow });
    g.moveTo(c.x + H * 0.02, c.y + H * 0.02).lineTo(c.x + H * 0.055, c.y + H * 0.03).moveTo(c.x + H * 0.02, c.y + H * 0.05).lineTo(c.x + H * 0.05, c.y + H * 0.06)
      .stroke({ width: ow * 0.5, color: 0xcfc9bb });
  } else if (look.outfit === 'robe') {
    // Galileo's broad white falling band collar
    g.poly([c.x - H * 0.06, c.y - H * 0.02, c.x + H * 0.09, c.y - H * 0.02, c.x + H * 0.12, c.y + H * 0.05, c.x - H * 0.09, c.y + H * 0.05])
      .fill(look.shirt).stroke({ width: ow * 0.6, color: look.glow });
  } else if (look.outfit === 'dress') {
    // high white collar
    g.roundRect(c.x - H * 0.01, c.y - H * 0.04, H * 0.075, H * 0.04, H * 0.01).fill(look.shirt).stroke({ width: ow * 0.6, color: look.glow });
  } else if (look.outfit === 'suit') {
    // tall stiff collar
    g.rect(c.x + H * 0.005, c.y - H * 0.035, H * 0.06, H * 0.035).fill(look.shirt).stroke({ width: ow * 0.5, color: look.glow });
  }
}

function head(g: Graphics, pose: Pose, look: Look, r: number, ow: number, time: number) {
  const h = pose.head;
  const tilt = pose.headTilt;
  const rot = (x: number, y: number): [number, number] => [h.x + x * Math.cos(tilt) - y * Math.sin(tilt), h.y + x * Math.sin(tilt) + y * Math.cos(tilt)];

  // skull + slightly elongated jaw
  g.ellipse(h.x, h.y, r, r * 1.08).fill(look.skin).stroke({ width: ow, color: look.glow });
  // ear
  const [ex, ey] = rot(-r * 0.12, r * 0.05);
  g.ellipse(ex, ey, r * 0.16, r * 0.24).fill(shade(look.skin, 0.88)).stroke({ width: ow * 0.5, color: look.glow });

  if (look.sideburns) {
    const pts = [rot(-r * 0.06, -r * 0.3), rot(r * 0.08, -r * 0.28), rot(r * 0.13, r * 0.36), rot(r * 0.03, r * 0.48), rot(-r * 0.1, r * 0.12)];
    g.poly(pts.flat()).fill(look.hair).stroke({ width: ow * 0.4, color: look.hairShade, join: 'round' });
  }

  if (look.beard === 'full') {
    const pts = [rot(-r * 0.05, r * 0.25), rot(r * 0.35, r * 0.38), rot(r * 0.95, r * 0.42), rot(r * 0.9, r * 0.85),
                 rot(r * 0.55, r * 1.35), rot(r * 0.1, r * 1.25), rot(-r * 0.2, r * 0.8)];
    g.poly(pts.flat()).fill(look.hair).stroke({ width: ow * 0.6, color: look.hairShade, join: 'round' });
    for (let i = 0; i < 4; i++) {
      const a = rot(r * (0.2 + i * 0.17), r * 0.7), b2 = rot(r * (0.15 + i * 0.17), r * 1.1);
      g.moveTo(a[0], a[1]).lineTo(b2[0], b2[1]);
    }
    g.stroke({ width: ow * 0.4, color: look.hairShade });
  }

  // nose (Newton's is famously long and straight)
  const noseLen = look.hairStyle === 'periwig' ? 1.22 : look.hairStyle === 'wild' ? 1.14 : 1.08;
  const n1 = rot(r * 0.78, -r * 0.2), n2 = rot(r * noseLen, r * 0.2), n3 = rot(r * 0.8, r * 0.28);
  g.poly([...n1, ...n2, ...n3]).fill(shade(look.skin, 0.94)).stroke({ width: ow * 0.6, color: look.glow, join: 'round' });

  // eye
  const [eyx, eyy] = rot(r * 0.42, -r * 0.12);
  if (pose.expression === 'ko') {
    const k = r * 0.13;
    g.moveTo(eyx - k, eyy - k).lineTo(eyx + k, eyy + k).moveTo(eyx + k, eyy - k).lineTo(eyx - k, eyy + k).stroke({ width: ow * 0.8, color: 0x1a1a1a });
  } else if (pose.expression === 'hurt') {
    g.moveTo(eyx - r * 0.14, eyy - r * 0.04).lineTo(eyx + r * 0.14, eyy + r * 0.04).stroke({ width: ow * 0.8, color: 0x1a1a1a, cap: 'round' });
  } else {
    const open = pose.expression === 'shout' ? 1.3 : 1;
    const blink = Math.sin(time * 1.7) > 0.985 ? 0.15 : 1;
    g.ellipse(eyx, eyy, r * 0.17, r * 0.12 * open * blink).fill(0xf8f6f0);
    g.circle(eyx + r * 0.05, eyy, r * 0.075 * Math.min(1, blink * 2)).fill(0x1d1b1a);
    if (pose.power > 0.5) g.circle(eyx + r * 0.05, eyy, r * 0.05).fill(look.glow); // eyes glow when powered up
  }

  if (look.glasses) {
    const [gx, gy] = rot(r * 0.44, -r * 0.1);
    const rim = 0x2a2622;
    if (look.glasses === 'round') g.circle(gx, gy, r * 0.22).fill({ color: 0xbfe8ff, alpha: 0.18 }).stroke({ width: ow * 0.55, color: rim });
    else g.roundRect(gx - r * 0.25, gy - r * 0.17, r * 0.5, r * 0.34, r * 0.06).fill({ color: 0xbfe8ff, alpha: 0.18 }).stroke({ width: ow * 0.75, color: rim });
    const bridge = rot(r * 0.78, -r * 0.14), temple = rot(-r * 0.05, -r * 0.08);
    g.moveTo(gx + r * 0.22, gy - r * 0.02).lineTo(bridge[0], bridge[1])
      .moveTo(gx - r * 0.22, gy).lineTo(temple[0], temple[1]).stroke({ width: ow * 0.5, color: rim });
    g.circle(gx - r * 0.07, gy - r * 0.07, r * 0.05).fill({ color: 0xffffff, alpha: 0.6 }); // glint
  }

  // brows
  const b1 = rot(r * 0.22, -r * 0.34), b2 = rot(r * 0.62, look.brows === 'stern' || pose.expression === 'focus' ? -r * 0.26 : -r * 0.34);
  const browColor = look.hairStyle === 'wild' ? look.hair : shade(look.hair, look.hairStyle === 'periwig' ? 0.6 : 1);
  const browW = look.brows === 'bushy' ? r * 0.16 : look.brows === 'fine' ? r * 0.05 : r * 0.08;
  g.moveTo(b1[0], b1[1]).lineTo(b2[0], b2[1]).stroke({ width: browW, color: browColor, cap: 'round' });

  // mouth
  const m1 = rot(r * 0.42, r * 0.52), m2 = rot(r * 0.74, r * 0.48);
  if (pose.expression === 'shout' || pose.expression === 'hurt') {
    const [mx, my] = rot(r * 0.6, r * 0.55);
    g.ellipse(mx, my, r * 0.14, r * 0.11).fill(0x3a1612);
  } else {
    g.moveTo(m1[0], m1[1]).lineTo(m2[0], m2[1]).stroke({ width: ow * 0.6, color: 0x5a2a22, cap: 'round' });
  }

  // facial hair
  if (look.moustache === 'thin') {
    const a = rot(r * 0.48, r * 0.36), bb = rot(r * 0.98, r * 0.33), cc = rot(r * 0.4, r * 0.44);
    g.moveTo(cc[0], cc[1]).quadraticCurveTo(a[0], a[1], bb[0], bb[1]).stroke({ width: r * 0.08, color: look.hair, cap: 'round' });
  } else if (look.moustache === 'bushy') {
    const pts = [rot(r * 0.3, r * 0.3), rot(r * 0.7, r * 0.24), rot(r * 1.05, r * 0.3), rot(r * 0.98, r * 0.5), rot(r * 0.62, r * 0.48), rot(r * 0.32, r * 0.55)];
    g.poly(pts.flat()).fill(look.hair).stroke({ width: ow * 0.5, color: look.hairShade, join: 'round' });
  }

  // hair (front layers)
  switch (look.hairStyle) {
    case 'periwig': periwigFront(g, h, r, look, ow, rot); break;
    case 'slick': slickHair(g, r, look, ow, rot); break;
    case 'bun': bunHair(g, h, r, look, ow, rot); break;
    case 'wild': wildHairFront(g, r, look, ow, rot, time); break;
    case 'balding': baldingHair(g, r, look, ow, rot); break;
    case 'curly': curlyHair(g, r, look, ow, rot); break;
    case 'wavy': wavyHair(g, r, look, ow, rot); break;
    case 'long': longHairFront(g, r, look, ow, rot); break;
    case 'receding': recedingHair(g, r, look, ow, rot); break;
    case 'quiff': quiffHair(g, r, look, ow, rot); break;
    case 'side': sideHair(g, r, look, ow, rot); break;
  }
}

type Rot = (x: number, y: number) => [number, number];

/** Newton: voluminous shoulder-length curled periwig. */
function periwigBack(g: Graphics, h: P, r: number, look: Look, ow: number, time: number) {
  const curls: Array<[number, number, number]> = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    curls.push([-r * 0.55 - t * r * 0.35, -r * 0.6 + t * r * 2.2, r * (0.42 - t * 0.06)]);
    curls.push([-r * 0.1 - t * r * 0.15, -r * 0.2 + t * r * 2.1, r * 0.36]);
  }
  for (const [x, y, cr] of curls) {
    const bob = Math.sin(time * 2 + y * 0.05) * r * 0.03;
    g.circle(h.x + x, h.y + y + bob, cr).fill(look.hairShade).stroke({ width: ow * 0.7, color: look.glow });
  }
}

function periwigFront(g: Graphics, h: P, r: number, look: Look, ow: number, rot: Rot) {
  // crown with a centre part, then ringlets framing the face from the temple, behind the ear,
  // down over the shoulder — the silhouette of Kneller's 1689 portrait.
  const crown = [rot(r * 0.62, -r * 0.5), rot(r * 0.3, -r * 1.12), rot(-r * 0.4, -r * 1.14), rot(-r * 0.98, -r * 0.6), rot(-r * 0.72, -r * 0.05), rot(-r * 0.05, -r * 0.48)];
  g.poly(crown.flat()).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow, join: 'round' });
  const ringlets: Array<[number, number, number]> = [
    [-0.22, -0.42, 0.26], [-0.4, -0.05, 0.27], [-0.48, 0.38, 0.27], [-0.5, 0.82, 0.27], [-0.42, 1.22, 0.25], [-0.25, 1.55, 0.23],
  ];
  for (const [cx, cy, cr] of ringlets) {
    const [x, y] = rot(r * cx, r * cy);
    g.circle(x, y, r * cr).fill(look.hair).stroke({ width: ow * 0.55, color: look.hairShade });
    const a0 = 0.6;
    g.moveTo(x + Math.cos(a0) * r * cr * 0.5, y + Math.sin(a0) * r * cr * 0.5)
      .arc(x, y, r * cr * 0.5, a0, a0 + 3.4).stroke({ width: ow * 0.45, color: look.hairShade });
  }
  void h;
}

/** Tesla: centre-parted, slicked-back black hair with volume on top. */
function slickHair(g: Graphics, r: number, look: Look, ow: number, rot: Rot) {
  const pts = [rot(r * 0.72, -r * 0.45), rot(r * 0.55, -r * 1.05), rot(r * 0.05, -r * 1.22), rot(-r * 0.6, -r * 1.05),
               rot(-r * 1.02, -r * 0.5), rot(-r * 0.92, r * 0.15), rot(-r * 0.55, r * 0.1), rot(-r * 0.2, -r * 0.45), rot(r * 0.35, -r * 0.55)];
  g.poly(pts.flat()).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow, join: 'round' });
  const p1 = rot(r * 0.28, -r * 1.14), p2 = rot(r * 0.05, -r * 0.62);
  g.moveTo(p1[0], p1[1]).lineTo(p2[0], p2[1]).stroke({ width: ow * 0.6, color: look.hairShade });
  // comb lines catching the light
  for (let i = 0; i < 3; i++) {
    const a = rot(-r * (0.1 + i * 0.25), -r * (1.05 - i * 0.12)), b = rot(-r * (0.45 + i * 0.22), -r * (0.55 - i * 0.12));
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
  }
  g.stroke({ width: ow * 0.4, color: 0x4a5266 });
}

/** Curie: dark hair swept up into a bun, soft frizzy fringe. */
function bunHair(g: Graphics, h: P, r: number, look: Look, ow: number, rot: Rot) {
  const [bx, by] = rot(-r * 0.62, -r * 0.92);
  g.circle(bx, by, r * 0.42).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow });
  g.moveTo(bx + r * 0.22, by).arc(bx, by, r * 0.22, 0, 4.5).stroke({ width: ow * 0.5, color: look.hairShade });
  const cap = [rot(r * 0.62, -r * 0.42), rot(r * 0.4, -r * 1.0), rot(-r * 0.3, -r * 1.12), rot(-r * 0.98, -r * 0.55),
               rot(-r * 0.85, r * 0.2), rot(-r * 0.5, r * 0.05), rot(-r * 0.15, -r * 0.45), rot(r * 0.3, -r * 0.5)];
  g.poly(cap.flat()).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow, join: 'round' });
  for (let i = 0; i < 4; i++) {
    const [x, y] = rot(r * (0.5 - i * 0.18), -r * (0.55 + i * 0.1));
    g.circle(x, y, r * 0.13).fill(look.hair);
  }
  void h;
}

/** Einstein: the famous untamed white halo. */
function wildHairBack(g: Graphics, h: P, r: number, look: Look, ow: number, time: number) {
  const spikes = 15;
  const pts: number[] = [];
  for (let i = 0; i <= spikes; i++) {
    const a = Math.PI * 0.55 + (i / spikes) * Math.PI * 1.45;
    const jitter = Math.sin(i * 12.9898 + 1.3) * 0.18 + Math.sin(time * 3 + i) * 0.04;
    const rad = r * ((i % 2 === 0 ? 1.65 : 1.25) + jitter);
    pts.push(h.x - r * 0.15 + Math.cos(a) * rad, h.y - r * 0.15 + Math.sin(a) * rad);
  }
  g.poly(pts).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow, join: 'round' });
}

function wildHairFront(g: Graphics, r: number, look: Look, ow: number, rot: Rot, time: number) {
  // receding hairline: a few tufts flying off the temples and crown
  for (let i = 0; i < 5; i++) {
    const base = rot(-r * (0.1 + i * 0.18), -r * (0.95 - i * 0.12));
    const tip = rot(-r * (0.3 + i * 0.3) + Math.sin(time * 4 + i) * r * 0.04, -r * (1.45 - i * 0.05));
    g.moveTo(base[0], base[1]).quadraticCurveTo(base[0] + r * 0.2, tip[1], tip[0], tip[1]);
  }
  g.stroke({ width: r * 0.16, color: look.hair, cap: 'round' });
  const sideA = rot(-r * 0.2, -r * 0.5), sideB = rot(-r * 0.95, r * 0.25);
  g.moveTo(sideA[0], sideA[1]).quadraticCurveTo(-r * 0.6 + sideA[0], sideB[1] - r * 0.3, sideB[0], sideB[1])
    .stroke({ width: r * 0.3, color: look.hair, cap: 'round' });
  void ow;
}

/** Galileo: high forehead, grey hair at the sides and back. */
function baldingHair(g: Graphics, r: number, look: Look, ow: number, rot: Rot) {
  const band = [rot(-r * 0.15, -r * 0.62), rot(-r * 0.62, -r * 0.82), rot(-r * 1.02, -r * 0.35), rot(-r * 0.98, r * 0.35),
                rot(-r * 0.6, r * 0.55), rot(-r * 0.42, r * 0.05), rot(-r * 0.32, -r * 0.4)];
  g.poly(band.flat()).fill(look.hair).stroke({ width: ow * 0.7, color: look.glow, join: 'round' });
  const tuft = [rot(r * 0.05, -r * 0.98), rot(-r * 0.3, -r * 1.06), rot(-r * 0.25, -r * 0.9)];
  g.poly(tuft.flat()).fill(look.hair);
}

/** Archimedes: tight grey curls ringing the head. */
function curlyHair(g: Graphics, r: number, look: Look, ow: number, rot: Rot) {
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 1.05 + (i / 8) * Math.PI * 1.15;
    const [x, y] = rot(Math.cos(a) * r * 0.95 - r * 0.05, Math.sin(a) * r * 0.95);
    g.circle(x, y, r * 0.22).fill(look.hair).stroke({ width: ow * 0.5, color: look.hairShade });
  }
}

/** Faraday: thick wavy hair swept from a side parting. */
function wavyHair(g: Graphics, r: number, look: Look, ow: number, rot: Rot) {
  const pts = [rot(r * 0.66, -r * 0.42), rot(r * 0.55, -r * 0.92), rot(r * 0.2, -r * 1.14), rot(-r * 0.25, -r * 1.12),
               rot(-r * 0.7, -r * 0.95), rot(-r * 1.04, -r * 0.45), rot(-r * 1.0, r * 0.25), rot(-r * 0.62, r * 0.3),
               rot(-r * 0.42, -r * 0.2), rot(r * 0.15, -r * 0.55)];
  g.poly(pts.flat()).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow, join: 'round' });
  for (let i = 0; i < 3; i++) {
    const a = rot(r * (0.4 - i * 0.4), -r * (1.0 - i * 0.05)), b = rot(r * (0.1 - i * 0.4), -r * (0.7 - i * 0.05));
    g.moveTo(a[0], a[1]).quadraticCurveTo(a[0] - r * 0.25, (a[1] + b[1]) / 2, b[0], b[1]);
  }
  g.stroke({ width: ow * 0.45, color: look.hairShade });
}

/** Hooke: long, unpowdered hair falling past the shoulders. */
function longHairBack(g: Graphics, h: P, r: number, look: Look, ow: number, sway: number) {
  const s = sway * r * 0.3;
  g.poly([h.x - r * 0.2, h.y - r * 0.9, h.x - r * 1.05, h.y - r * 0.4, h.x - r * 1.15 + s, h.y + r * 1.9,
          h.x - r * 0.15 + s, h.y + r * 1.8, h.x + r * 0.1, h.y + r * 0.6])
    .fill(look.hairShade).stroke({ width: ow * 0.7, color: look.glow, join: 'round' });
}

function longHairFront(g: Graphics, r: number, look: Look, ow: number, rot: Rot) {
  const cap = [rot(r * 0.6, -r * 0.5), rot(r * 0.35, -r * 1.08), rot(-r * 0.35, -r * 1.12), rot(-r * 0.95, -r * 0.6),
               rot(-r * 0.75, r * 1.2), rot(-r * 0.4, r * 1.25), rot(-r * 0.3, -r * 0.3), rot(r * 0.15, -r * 0.55)];
  g.poly(cap.flat()).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow, join: 'round' });
  for (let i = 0; i < 3; i++) {
    const a = rot(-r * (0.2 + i * 0.18), -r * 0.9), b = rot(-r * (0.45 + i * 0.12), r * 1.15);
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
  }
  g.stroke({ width: ow * 0.45, color: look.hairShade });
}

/** Schrödinger: dark hair swept straight back from a high, receding hairline. */
function recedingHair(g: Graphics, r: number, look: Look, ow: number, rot: Rot) {
  const pts = [rot(r * 0.2, -r * 0.92), rot(-r * 0.2, -r * 1.12), rot(-r * 0.75, -r * 0.92), rot(-r * 1.04, -r * 0.4),
               rot(-r * 0.95, r * 0.25), rot(-r * 0.6, r * 0.2), rot(-r * 0.35, -r * 0.4), rot(-r * 0.05, -r * 0.82)];
  g.poly(pts.flat()).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow, join: 'round' });
  for (let i = 0; i < 3; i++) {
    const a = rot(r * (0.05 - i * 0.25), -r * (1.0 - i * 0.04)), b = rot(-r * (0.55 + i * 0.15), -r * (0.6 - i * 0.12));
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
  }
  g.stroke({ width: ow * 0.4, color: look.hairShade });
}

/** Heisenberg: a thick wave of sandy hair brushed up and back from the forehead. */
function quiffHair(g: Graphics, r: number, look: Look, ow: number, rot: Rot) {
  const pts = [rot(r * 0.7, -r * 0.55), rot(r * 0.78, -r * 1.05), rot(r * 0.45, -r * 1.42), rot(-r * 0.15, -r * 1.4),
               rot(-r * 0.7, -r * 1.15), rot(-r * 1.04, -r * 0.55), rot(-r * 0.95, r * 0.2), rot(-r * 0.58, r * 0.15),
               rot(-r * 0.3, -r * 0.5), rot(r * 0.3, -r * 0.62)];
  g.poly(pts.flat()).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow, join: 'round' });
  for (let i = 0; i < 3; i++) {
    const a = rot(r * (0.6 - i * 0.3), -r * (0.7 + i * 0.05)), b = rot(r * (0.2 - i * 0.35), -r * (1.32 - i * 0.06));
    g.moveTo(a[0], a[1]).quadraticCurveTo(a[0] + r * 0.25, (a[1] + b[1]) / 2, b[0], b[1]);
  }
  g.stroke({ width: ow * 0.45, color: look.hairShade });
}

/** Hawking: side parting with a soft fringe across the forehead. */
function sideHair(g: Graphics, r: number, look: Look, ow: number, rot: Rot) {
  const pts = [rot(r * 0.74, -r * 0.4), rot(r * 0.62, -r * 0.88), rot(r * 0.2, -r * 1.14), rot(-r * 0.4, -r * 1.1),
               rot(-r * 0.92, -r * 0.7), rot(-r * 1.04, -r * 0.1), rot(-r * 0.8, r * 0.3), rot(-r * 0.5, r * 0.15),
               rot(-r * 0.3, -r * 0.45), rot(r * 0.3, -r * 0.38)];
  g.poly(pts.flat()).fill(look.hair).stroke({ width: ow * 0.8, color: look.glow, join: 'round' });
  const p1 = rot(-r * 0.2, -r * 1.08), p2 = rot(r * 0.1, -r * 0.6);
  g.moveTo(p1[0], p1[1]).lineTo(p2[0], p2[1]).stroke({ width: ow * 0.5, color: look.hairShade });
}

/** Schrödinger's cat: alive AND dead, flickering between the two on his shoulder. */
function quantumCat(g: Graphics, shoulder: P, H: number, look: Look, ow: number, time: number) {
  const s = H * 0.07;
  const x = shoulder.x - s * 0.4, y = shoulder.y - s * 0.6;
  const alive = Math.sin(time * 3.1) + Math.sin(time * 7.3) * 0.5 > 0;
  const a = 0.75 + 0.2 * Math.sin(time * 11);
  const col = 0xd8fff7;
  // tail
  g.moveTo(x - s * 0.9, y + s * 0.2).quadraticCurveTo(x - s * 1.9, y - s * 0.2, x - s * 1.4, y - s * 1.3)
    .stroke({ width: s * 0.28, color: col, alpha: a * 0.8, cap: 'round' });
  // body + head + ears
  g.ellipse(x - s * 0.2, y, s * 0.85, s * 0.6).fill({ color: col, alpha: a * 0.45 }).stroke({ width: ow * 0.5, color: look.glow, alpha: a });
  const hx = x + s * 0.55, hy = y - s * 0.75;
  g.circle(hx, hy, s * 0.5).fill({ color: col, alpha: a * 0.5 }).stroke({ width: ow * 0.5, color: look.glow, alpha: a });
  g.poly([hx - s * 0.42, hy - s * 0.2, hx - s * 0.3, hy - s * 0.85, hx - s * 0.02, hy - s * 0.45]).fill({ color: col, alpha: a * 0.6 });
  g.poly([hx + s * 0.42, hy - s * 0.2, hx + s * 0.3, hy - s * 0.85, hx + s * 0.02, hy - s * 0.45]).fill({ color: col, alpha: a * 0.6 });
  if (alive) {
    g.circle(hx - s * 0.17, hy - s * 0.05, s * 0.09).fill(look.glow).circle(hx + s * 0.17, hy - s * 0.05, s * 0.09).fill(look.glow);
  } else {
    const k = s * 0.1;
    for (const ex of [hx - s * 0.17, hx + s * 0.17]) {
      g.moveTo(ex - k, hy - s * 0.05 - k).lineTo(ex + k, hy - s * 0.05 + k).moveTo(ex + k, hy - s * 0.05 - k).lineTo(ex - k, hy - s * 0.05 + k);
    }
    g.stroke({ width: ow * 0.45, color: 0x24403b });
  }
}

/** Doppler's tuning fork; its tines shimmer with sound waves when he's powered up. */
function tuningFork(g: Graphics, elbow: P, hand: P, H: number, look: Look, ow: number, power: number, time: number) {
  const ang = Math.atan2(hand.y - elbow.y, hand.x - elbow.x) - Math.PI / 2;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const at = (t: number, s: number) => [hand.x + dx * H * t + nx * H * s, hand.y + dy * H * t + ny * H * s];
  const [s0x, s0y] = at(0.04, 0), [s1x, s1y] = at(-0.05, 0);
  const [b1x, b1y] = at(-0.05, -0.022), [b2x, b2y] = at(-0.05, 0.022);
  const [t1x, t1y] = at(-0.17, -0.022), [t2x, t2y] = at(-0.17, 0.022);
  g.moveTo(s0x, s0y).lineTo(s1x, s1y).moveTo(b1x, b1y).lineTo(b2x, b2y).moveTo(b1x, b1y).lineTo(t1x, t1y).moveTo(b2x, b2y).lineTo(t2x, t2y)
    .stroke({ width: ow * 1.1, color: 0xc9ced6, cap: 'round' });
  if (power > 0.2) {
    const [cx, cy] = at(-0.17, 0);
    for (let i = 1; i <= 2; i++) {
      const rr = H * 0.03 * i + ((time * 60) % 10) * 0.6;
      g.circle(cx, cy, rr).stroke({ width: ow * 0.5, color: look.glow, alpha: 0.6 / i });
    }
  }
}

/** Hawking's hover chair: backrest, seat, footrest and a hovering base with glowing jets. */
function hoverChair(g: Graphics, pose: Pose, H: number, look: Look, ow: number, time: number) {
  const hx = pose.hip.x, seatY = pose.hip.y + H * 0.04;
  const frame = 0x22252e, panel = 0x2f3340;
  // backrest (behind the torso)
  g.roundRect(hx - H * 0.2, pose.hip.y - H * 0.36, H * 0.09, H * 0.42, H * 0.03).fill(frame).stroke({ width: ow * 0.8, color: look.glow });
  g.moveTo(hx - H * 0.155, pose.hip.y - H * 0.32).lineTo(hx - H * 0.155, seatY - H * 0.02).stroke({ width: ow * 0.6, color: look.glow, alpha: 0.6 });
  // base pod and jets
  const podY = Math.max(seatY + H * 0.12, -H * 0.12);
  const flick = 0.6 + 0.4 * Math.sin(time * 23);
  for (const jx of [-0.12, 0.0, 0.12]) {
    g.poly([hx + H * (jx - 0.03), podY + H * 0.03, hx + H * (jx + 0.03), podY + H * 0.03, hx + H * jx, podY + H * (0.09 + 0.03 * flick)])
      .fill({ color: look.glow, alpha: 0.55 * flick });
  }
  g.moveTo(hx + H * 0.02, seatY + H * 0.05).lineTo(hx + H * 0.02, podY).stroke({ width: H * 0.05, color: panel });
  g.ellipse(hx + H * 0.02, podY, H * 0.2, H * 0.045).fill(frame).stroke({ width: ow * 0.8, color: look.glow });
  g.ellipse(hx + H * 0.02, podY, H * 0.12, H * 0.015).fill({ color: look.glow, alpha: 0.5 });
  // footrest
  g.moveTo(hx + H * 0.12, seatY + H * 0.05).lineTo(pose.footF.x + H * 0.02, pose.footF.y + H * 0.012).stroke({ width: H * 0.025, color: panel });
  g.roundRect(pose.footB.x - H * 0.05, pose.footF.y + H * 0.005, H * 0.17, H * 0.022, H * 0.01).fill(frame).stroke({ width: ow * 0.6, color: look.glow });
  // seat cushion
  g.roundRect(hx - H * 0.2, seatY, H * 0.38, H * 0.06, H * 0.025).fill(panel).stroke({ width: ow * 0.8, color: look.glow });
}

/** The screen of his communication computer, on an arm at the side of the chair. */
function chairScreen(g: Graphics, pose: Pose, H: number, look: Look, ow: number, time: number) {
  const hx = pose.hip.x, seatY = pose.hip.y + H * 0.04;
  const sx = hx + H * 0.26, sy = pose.hip.y - H * 0.12;
  g.moveTo(hx + H * 0.16, seatY + H * 0.02).lineTo(sx, sy + H * 0.06).stroke({ width: H * 0.014, color: 0x3a3f4d, cap: 'round' });
  g.roundRect(sx - H * 0.06, sy - H * 0.045, H * 0.12, H * 0.09, H * 0.012).fill(0x0c1020).stroke({ width: ow * 0.6, color: look.glow });
  for (let i = 0; i < 3; i++) {
    const w = H * (0.04 + 0.03 * ((Math.sin(time * 1.3 + i * 2) + 1) / 2));
    g.rect(sx - H * 0.045, sy - H * 0.028 + i * H * 0.022, w, H * 0.008).fill({ color: look.glow, alpha: 0.8 });
  }
}

/** Galileo's brass telescope held along the forearm. */
function telescope(g: Graphics, elbow: P, hand: P, H: number, look: Look, ow: number) {
  const ang = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
  const len = H * 0.24, wdt = H * 0.035;
  const cx = hand.x + Math.cos(ang) * len * 0.25, cy = hand.y + Math.sin(ang) * len * 0.25;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const p = (t: number, s: number, w: number) => [cx + dx * len * t + nx * w * s, cy + dy * len * t + ny * w * s];
  g.poly([...p(-0.5, 1, wdt * 0.6), ...p(0.5, 1, wdt), ...p(0.5, -1, wdt), ...p(-0.5, -1, wdt * 0.6)])
    .fill(0xb8892e).stroke({ width: ow * 0.6, color: look.glow, join: 'round' });
  const [rx, ry] = p(0.2, 0, 0);
  g.circle(rx, ry, wdt * 0.5).fill(0x6b4a1a);
}

/** Curie's glowing radium vial. */
function vial(g: Graphics, hand: P, H: number, look: Look, time: number) {
  const w = H * 0.03, h = H * 0.09;
  const x = hand.x - w / 2, y = hand.y - h * 0.9;
  const pulse = 0.6 + 0.4 * Math.sin(time * 4);
  g.roundRect(x, y, w, h, w * 0.4).fill({ color: 0xcfe9d0, alpha: 0.35 }).stroke({ width: H * 0.006, color: look.glow });
  g.roundRect(x + w * 0.15, y + h * 0.45, w * 0.7, h * 0.5, w * 0.3).fill({ color: look.glow, alpha: 0.6 + 0.4 * pulse });
  g.rect(x - w * 0.1, y - h * 0.08, w * 1.2, h * 0.1).fill(0x8a7a64);
}

/** Multiply a colour's channels (0..1) to darken it. */
export function shade(color: number, k: number): number {
  const rr = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const gg = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const bb = Math.min(255, Math.round((color & 0xff) * k));
  return (rr << 16) | (gg << 8) | bb;
}
