/**
 * TypeScript port of the fighter behaviour classes in com.newtonbrawl.engine.fighter.roster.
 * Each case mirrors the Java `onTrigger` of the same fighter exactly (parity-tested).
 */
import type { MoveDefinition } from '../protocol';
import { REAL_G } from './constants';
import { Projectile, Zone, type ZoneKind } from './entities';
import type { FighterState } from './FighterState';
import type { MatchWorld } from './MatchSimulation';

const param = (m: MoveDefinition, key: string, fallback: number) => m.params?.[key] ?? fallback;
/** Java's `(int)` cast of a double. */
const int = (v: number) => Math.trunc(v);

function projectile(w: MatchWorld, self: FighterState, kind: string, moveId: string, m: MoveDefinition): Projectile {
  const p = new Projectile(w.nextId(), self.slot, kind, moveId);
  p.dir = self.facing;
  p.damage = m.damage;
  p.impulseX = m.impulse?.x ?? 0;
  p.impulseY = m.impulse?.y ?? 0;
  p.hitstun = m.hitstun;
  p.hitstop = m.hitstop;
  return p;
}

function zone(w: MatchWorld, self: FighterState, kind: ZoneKind, moveId: string, m: MoveDefinition): Zone {
  const z = new Zone(w.nextId(), self.slot, kind, moveId);
  z.dir = self.facing;
  z.damage = m.damage;
  z.impulseX = m.impulse?.x ?? 0;
  z.impulseY = m.impulse?.y ?? 0;
  z.hitstun = m.hitstun;
  z.hitstop = m.hitstop;
  return z;
}

type Trigger = (w: MatchWorld, self: FighterState, opp: FighterState, moveId: string, m: MoveDefinition) => void;

/** Newton: Apple Drop (real g), Gravity Flip, ULTIMATE Third Law. */
const newton: Trigger = (w, self, opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const apple = projectile(w, self, 'apple', moveId, m);
      apple.x = opp.x;
      apple.y = param(m, 'dropHeight', 760);
      apple.w = apple.h = param(m, 'size', 36);
      apple.ay = -param(m, 'gravity', REAL_G);
      apple.life = int(param(m, 'life', 240));
      w.spawnProjectile(apple);
      break;
    }
    case 'special2': {
      const wave = projectile(w, self, 'gravity-wave', moveId, m);
      wave.x = self.x + self.facing * param(m, 'offset', 80);
      wave.y = param(m, 'height', 110);
      wave.w = param(m, 'w', 60);
      wave.h = param(m, 'h', 150);
      wave.vx = self.facing * param(m, 'speed', 900);
      wave.life = int(param(m, 'life', 32));
      wave.effect = 'GRAVITY_FLIP';
      wave.effectTicks = int(param(m, 'flipTicks', 180));
      w.spawnProjectile(wave);
      break;
    }
    case 'ultimate':
      self.reflectTicks = int(param(m, 'reflectTicks', 300));
      break;
  }
};

/** Tesla: Chain Lightning, Magnetic Pull, ULTIMATE Tesla Coil. */
const tesla: Trigger = (w, self, _opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const bolt = projectile(w, self, 'bolt', moveId, m);
      bolt.x = self.x + self.facing * param(m, 'offset', 60);
      bolt.y = param(m, 'height', 125);
      bolt.w = param(m, 'w', 54);
      bolt.h = param(m, 'h', 22);
      bolt.vx = self.facing * param(m, 'speed', 1400);
      bolt.life = int(param(m, 'life', 70));
      bolt.electric = true;
      bolt.maxChains = int(param(m, 'maxChains', 3));
      w.spawnProjectile(bolt);
      break;
    }
    case 'special2': {
      const pull = zone(w, self, 'PULL', moveId, m);
      pull.x = self.x;
      pull.y = 200;
      pull.w = param(m, 'range', 1300);
      pull.h = 400;
      pull.life = int(param(m, 'life', 40));
      pull.strength = param(m, 'strength', 380);
      w.spawnZone(pull);
      break;
    }
    case 'ultimate': {
      const field = zone(w, self, 'FIELD', moveId, m);
      field.x = w.arena.width / 2;
      field.y = w.arena.height / 2;
      field.w = w.arena.width;
      field.h = w.arena.height;
      field.life = int(param(m, 'life', 200));
      field.interval = int(param(m, 'interval', 20));
      field.electric = true;
      w.spawnZone(field);
      break;
    }
  }
};

/** Curie: Radioactive Orb (half-life), Glow Trap, ULTIMATE Chain Reaction. */
const curie: Trigger = (w, self, _opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const orb = projectile(w, self, 'orb', moveId, m);
      orb.x = self.x + self.facing * param(m, 'offset', 70);
      orb.y = param(m, 'height', 110);
      orb.w = orb.h = param(m, 'size', 46);
      orb.vx = self.facing * param(m, 'speed', 360);
      orb.life = int(param(m, 'life', 220));
      orb.halfLife = int(param(m, 'halfLife', 45));
      w.spawnProjectile(orb);
      break;
    }
    case 'special2': {
      w.removeZones(self.slot, 'TRAP');
      const trap = zone(w, self, 'TRAP', moveId, m);
      trap.x = self.x + self.facing * param(m, 'offset', 100);
      trap.y = 10;
      trap.w = param(m, 'w', 110);
      trap.h = 24;
      trap.arm = int(param(m, 'arm', 30));
      trap.life = int(param(m, 'life', 480));
      w.spawnZone(trap);
      break;
    }
    case 'ultimate': {
      const x0 = self.x + self.facing * param(m, 'offset', 150);
      const generations = int(param(m, 'generations', 3));
      const spacing = param(m, 'spacing', 170);
      const stepTicks = int(param(m, 'stepTicks', 10));
      for (let k = -generations; k <= generations; k++) {
        const blast = zone(w, self, 'BLAST', moveId, m);
        blast.x = x0 + k * spacing;
        blast.y = 130;
        blast.w = param(m, 'w', 200);
        blast.h = param(m, 'h', 260);
        blast.delay = Math.abs(k) * stepTicks;
        blast.active = int(param(m, 'active', 10));
        blast.life = blast.delay + blast.active + 2;
        w.spawnZone(blast);
      }
      break;
    }
  }
};

/** Einstein: Light Dash, Time Dilation Bubble, ULTIMATE E = mc². */
const einstein: Trigger = (w, self, _opp, moveId, m) => {
  switch (moveId) {
    case 'special1':
      w.teleport(self, self.x + self.facing * param(m, 'distance', 320));
      self.invulnTicks = int(param(m, 'invulnTicks', 12));
      break;
    case 'special2': {
      const bubble = zone(w, self, 'BUBBLE', moveId, m);
      bubble.x = self.x + self.facing * param(m, 'offset', 230);
      bubble.y = param(m, 'height', 150);
      bubble.w = param(m, 'w', 340);
      bubble.h = param(m, 'h', 320);
      bubble.life = int(param(m, 'life', 240));
      bubble.timeScale = param(m, 'timeScale', 0.4);
      w.spawnZone(bubble);
      break;
    }
    case 'ultimate': {
      const width = w.arena.width;
      const start = self.x + self.facing * 40;
      const end = self.facing > 0 ? width : 0;
      const beam = zone(w, self, 'BEAM', moveId, m);
      beam.x = (start + end) / 2;
      beam.y = param(m, 'height', 125);
      beam.w = Math.abs(end - start);
      beam.h = param(m, 'h', 120);
      beam.active = int(param(m, 'active', 28));
      beam.life = beam.active + 2;
      w.spawnZone(beam);
      break;
    }
  }
};

const MOONS = ['io', 'europa', 'ganymede', 'callisto'];

/** Galileo: Pendulum Swing (T = 2π√(L/g)), Tower Drop (same g for every mass), ULTIMATE Starry Messenger (Kepler orbits). */
const galileo: Trigger = (w, self, opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const bob = projectile(w, self, 'pendulum', moveId, m);
      bob.motion = 'PENDULUM';
      bob.length = param(m, 'length', 110);
      bob.gOverL = param(m, 'gravity', 2600) / bob.length;
      bob.pivotX = self.x + self.facing * param(m, 'offset', 70);
      bob.pivotY = param(m, 'pivotHeight', 290);
      bob.theta = -self.facing * param(m, 'amplitude', 1.15);
      bob.w = bob.h = param(m, 'size', 46);
      bob.x = bob.pivotX + bob.length * bob.theta;
      bob.y = bob.pivotY - bob.length * (1 - bob.theta * bob.theta * 0.5);
      bob.life = int(param(m, 'life', 78));
      w.spawnProjectile(bob);
      break;
    }
    case 'special2': {
      const spread = param(m, 'spread', 36);
      for (let i = 0; i < 2; i++) {
        const ball = projectile(w, self, i === 0 ? 'cannonball' : 'musketball', moveId, m);
        ball.x = opp.x + (i === 0 ? -spread : spread);
        ball.y = param(m, 'dropHeight', 780);
        ball.w = ball.h = i === 0 ? param(m, 'heavySize', 44) : param(m, 'lightSize', 22);
        ball.ay = -param(m, 'gravity', REAL_G);
        ball.life = int(param(m, 'life', 240));
        w.spawnProjectile(ball);
      }
      break;
    }
    case 'ultimate': {
      const start = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]];
      for (let i = 0; i < 4; i++) {
        const r = param(m, `r${i + 1}`, 90 + 35 * i), om = param(m, `w${i + 1}`, 4);
        const moon = projectile(w, self, MOONS[i], moveId, m);
        moon.motion = 'ORBIT';
        moon.anchor = self.slot;
        moon.k = om * om;
        moon.ox = start[i][0] * r;
        moon.oy = start[i][1] * r;
        moon.ovx = start[i][2] * om * r;
        moon.ovy = start[i][3] * om * r;
        moon.x = self.x + moon.ox;
        moon.y = self.y + self.def.body.height * 0.55 + moon.oy;
        moon.w = moon.h = param(m, 'size', 30);
        moon.life = int(param(m, 'life', 240));
        w.spawnProjectile(moon);
      }
      break;
    }
  }
};

/** Archimedes: Lever Launch (F₁d₁ = F₂d₂), Buoyancy Bubble (F_b = ρVg), ULTIMATE Burning Mirrors. */
const archimedes: Trigger = (w, self, opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const lever = zone(w, self, 'LEVER', moveId, m);
      const ratio = param(m, 'ratio', 4);
      lever.impulseX *= ratio;
      lever.impulseY *= ratio;
      lever.x = self.x + self.facing * param(m, 'offset', 150);
      lever.y = 60;
      lever.w = param(m, 'w', 220);
      lever.h = 120;
      lever.delay = int(param(m, 'delay', 6));
      lever.active = int(param(m, 'active', 6));
      lever.life = lever.delay + lever.active + 2;
      w.spawnZone(lever);
      break;
    }
    case 'special2': {
      const bubble = projectile(w, self, 'bubble', moveId, m);
      bubble.x = self.x + self.facing * param(m, 'offset', 80);
      bubble.y = param(m, 'height', 110);
      bubble.w = bubble.h = param(m, 'size', 60);
      bubble.vx = self.facing * param(m, 'speed', 260);
      bubble.life = int(param(m, 'life', 160));
      bubble.effect = 'BUOY';
      bubble.effectTicks = int(param(m, 'floatTicks', 150));
      w.spawnProjectile(bubble);
      break;
    }
    case 'ultimate': {
      const focus = zone(w, self, 'FOCUS', moveId, m);
      focus.x = opp.x;
      focus.y = w.arena.height / 2;
      focus.w = param(m, 'w', 110);
      focus.h = w.arena.height;
      focus.delay = int(param(m, 'delay', 24));
      focus.active = int(param(m, 'active', 24));
      focus.life = focus.delay + focus.active + 2;
      w.spawnZone(focus);
      break;
    }
  }
};

/** Faraday: Faraday Cage, Induction Coil (ε = −dΦ/dt), ULTIMATE Dynamo. */
const faraday: Trigger = (w, self, _opp, moveId, m) => {
  switch (moveId) {
    case 'special1':
      self.cageTicks = int(param(m, 'cageTicks', 210));
      break;
    case 'special2': {
      w.removeZones(self.slot, 'INDUCTION');
      const coil = zone(w, self, 'INDUCTION', moveId, m);
      coil.x = self.x + self.facing * param(m, 'offset', 170);
      coil.y = 110;
      coil.w = param(m, 'w', 240);
      coil.h = param(m, 'h', 220);
      coil.life = int(param(m, 'life', 300));
      coil.strength = param(m, 'strength', 0.09);
      coil.electric = true;
      w.spawnZone(coil);
      break;
    }
    case 'ultimate': {
      const storm = zone(w, self, 'STORM', moveId, m);
      storm.x = self.x;
      storm.y = 200;
      storm.w = param(m, 'w', 620);
      storm.h = param(m, 'h', 420);
      storm.life = int(param(m, 'life', 210));
      storm.interval = int(param(m, 'interval', 18));
      storm.strength = param(m, 'pull', 240);
      storm.electric = true;
      w.spawnZone(storm);
      break;
    }
  }
};

/** Hooke: Spring Trap (F = −kx), Elastic Whip (frame data), ULTIMATE Breaking Point. */
const hooke: Trigger = (w, self, opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      w.removeZones(self.slot, 'SPRING');
      const spring = zone(w, self, 'SPRING', moveId, m);
      spring.x = self.x;
      spring.y = 10;
      spring.w = param(m, 'w', 100);
      spring.h = 24;
      spring.arm = int(param(m, 'arm', 20));
      spring.life = int(param(m, 'life', 600));
      spring.springK = param(m, 'k', 200);
      spring.maxStretch = param(m, 'maxStretch', 500);
      w.spawnZone(spring);
      break;
    }
    case 'ultimate': {
      const blast = zone(w, self, 'BLAST', moveId, m);
      blast.x = self.x;
      blast.y = 200;
      blast.w = param(m, 'w', 1000);
      blast.h = param(m, 'h', 420);
      blast.delay = int(param(m, 'delay', 14));
      blast.active = int(param(m, 'active', 8));
      blast.life = blast.delay + blast.active + 2;
      w.spawnZone(blast);
      w.shatter(opp.slot, self.slot, self.x, self.y + self.def.body.height / 2, param(m, 'shatterSpeed', 900));
      break;
    }
  }
};

const TRIGGERS: Record<string, Trigger> = { newton, tesla, curie, einstein, galileo, archimedes, faraday, hooke };

export function onTrigger(w: MatchWorld, self: FighterState, opp: FighterState, moveId: string, m: MoveDefinition) {
  TRIGGERS[self.def.id]?.(w, self, opp, moveId, m);
}
