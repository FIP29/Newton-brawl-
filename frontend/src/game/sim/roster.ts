/**
 * TypeScript port of the fighter behaviour classes in com.newtonbrawl.engine.fighter.roster.
 * Each case mirrors the Java `onTrigger` of the same fighter exactly (parity-tested).
 */
import type { MoveDefinition } from '../protocol';
import { REAL_G } from './constants';
import { Projectile, Zone, type ZoneKind } from './entities';
import { r, type FighterState } from './FighterState';
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

/** Schrödinger: Superposition (ghost copy), Schrödinger's Cat (alive or dead), ULTIMATE Particle in a Box. */
const schrodinger: Trigger = (w, self, _opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      w.removeZones(self.slot, 'GHOST');
      const half = self.def.body.width / 2;
      const ghost = zone(w, self, 'GHOST', moveId, m);
      ghost.x = Math.max(half, Math.min(w.arena.width - half, self.x + self.facing * param(m, 'offset', 260)));
      ghost.y = self.def.body.height / 2;
      ghost.w = self.def.body.width;
      ghost.h = self.def.body.height;
      ghost.life = int(param(m, 'life', 240));
      ghost.arm = int(param(m, 'invuln', 24));
      w.spawnZone(ghost);
      break;
    }
    case 'special2': {
      w.removeZones(self.slot, 'CATBOX');
      const box = zone(w, self, 'CATBOX', moveId, m);
      box.x = Math.max(40, Math.min(w.arena.width - 40, self.x + self.facing * param(m, 'offset', 190)));
      box.w = 70;
      box.h = 70;
      box.y = box.h / 2;
      box.delay = int(param(m, 'seal', 50));
      box.life = box.delay + 2;
      box.source = m;
      w.spawnZone(box);
      break;
    }
    case 'ultimate': {
      const width = w.arena.width, height = w.arena.height;
      for (const n of [3, 2]) {
        for (let k = 0; k < n; k++) {
          const wave = zone(w, self, 'WAVE', moveId, m);
          wave.x = width * (2 * k + 1) / (2.0 * n);
          wave.y = height / 2;
          wave.w = width / n * param(m, 'width', 0.6);
          wave.h = height;
          wave.delay = int(param(m, n === 3 ? 'delay3' : 'delay2', n === 3 ? 16 : 70));
          wave.active = int(param(m, 'active', 7));
          wave.life = wave.delay + wave.active + 2;
          wave.strength = n;
          w.spawnZone(wave);
        }
      }
      break;
    }
  }
};

/** Heisenberg: Uncertain Position (random blink), Measurement (random knockback), ULTIMATE Uncertainty Principle. */
const heisenberg: Trigger = (w, self, opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const distances = [param(m, 'd1', 170), param(m, 'd2', 270), param(m, 'd3', 370)];
      w.teleport(self, self.x + self.facing * distances[w.random(3)]);
      self.invulnTicks = int(param(m, 'invuln', 10));
      const arrive = zone(w, self, 'BURST', moveId, m);
      arrive.x = self.x;
      arrive.y = self.def.body.height / 2;
      arrive.w = param(m, 'w', 150);
      arrive.h = self.def.body.height;
      arrive.delay = 1;
      arrive.active = 4;
      arrive.life = 7;
      w.spawnZone(arrive);
      break;
    }
    case 'special2': {
      const photon = projectile(w, self, 'photon', moveId, m);
      photon.x = self.x + self.facing * param(m, 'offset', 60);
      photon.y = param(m, 'height', 120);
      photon.w = 44;
      photon.h = 24;
      photon.vx = self.facing * param(m, 'speed', 1400);
      photon.life = int(param(m, 'life', 55));
      photon.effect = 'MEASURE';
      w.spawnProjectile(photon);
      break;
    }
    case 'ultimate': {
      opp.scrambleTicks = int(param(m, 'scramble', 300));
      const field = zone(w, self, 'UNCERTAIN', moveId, m);
      field.x = w.arena.width / 2;
      field.y = w.arena.height / 2;
      field.w = w.arena.width;
      field.h = w.arena.height;
      field.life = int(param(m, 'life', 300));
      field.interval = int(param(m, 'interval', 20));
      w.spawnZone(field);
      break;
    }
  }
};

function singularity(w: MatchWorld, self: FighterState, moveId: string, m: MoveDefinition, width: number, height: number): Zone {
  const hole = zone(w, self, 'SINGULARITY', moveId, m);
  const aw = w.arena.width;
  hole.x = Math.max(width / 4, Math.min(aw - width / 4, self.x + self.facing * param(m, 'offset', 320)));
  hole.w = width;
  hole.h = height;
  hole.strength = param(m, 'pull', 170);
  hole.core = param(m, 'core', 42);
  hole.interval = int(param(m, 'interval', 30));
  hole.life = int(param(m, 'life', 240));
  return hole;
}

/** Hawking: Hawking Radiation (evaporating mini black hole), Event Horizon, ULTIMATE Supermassive Black Hole. */
const hawking: Trigger = (w, self, _opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const hole = projectile(w, self, 'minihole', moveId, m);
      hole.x = self.x + self.facing * param(m, 'offset', 70);
      hole.y = param(m, 'height', 130);
      hole.w = hole.h = hole.size0 = param(m, 'size', 60);
      hole.minSize = param(m, 'minSize', 14);
      hole.life = int(param(m, 'life', 100));
      hole.shrink = (hole.size0 - hole.minSize) / hole.life;
      hole.vx = self.facing * param(m, 'speed', 380);
      w.spawnProjectile(hole);
      break;
    }
    case 'special2': {
      w.removeZones(self.slot, 'SINGULARITY');
      const hole = singularity(w, self, moveId, m, param(m, 'size', 340), param(m, 'size', 340));
      hole.y = param(m, 'height', 150);
      w.spawnZone(hole);
      break;
    }
    case 'ultimate': {
      const hole = singularity(w, self, moveId, m, param(m, 'w', 900), param(m, 'h', 640));
      hole.y = param(m, 'height', 280);
      w.spawnZone(hole);
      const burst = zone(w, self, 'BURST', moveId, m);
      burst.x = hole.x;
      burst.y = hole.y;
      burst.w = burst.h = param(m, 'burstSize', 520);
      burst.damage = int(param(m, 'burstDamage', 120));
      burst.impulseX = param(m, 'burstX', 36000);
      burst.impulseY = param(m, 'burstY', 42000);
      burst.hitstun = 30;
      burst.hitstop = 12;
      burst.delay = hole.life;
      burst.active = 6;
      burst.life = burst.delay + burst.active + 2;
      w.spawnZone(burst);
      break;
    }
  }
};

/** Doppler: Doppler Shift (f' = f(c+v_o)/(c−v_s)), Sonic Boom, ULTIMATE Blueshift Barrage. */
const doppler: Trigger = (w, self, _opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const wave = projectile(w, self, 'soundwave', moveId, m);
      wave.x = self.x + self.facing * param(m, 'offset', 70);
      wave.y = param(m, 'height', 120);
      wave.w = param(m, 'w', 50);
      wave.h = param(m, 'h', 140);
      wave.waveSpeed = param(m, 'speed', 820);
      wave.vx = self.facing * wave.waveSpeed;
      wave.vs = self.facing * self.vx;
      wave.life = int(param(m, 'life', 70));
      wave.effect = 'DOPPLER';
      w.spawnProjectile(wave);
      break;
    }
    case 'special2': {
      const start = self.x;
      w.teleport(self, start + self.facing * param(m, 'distance', 320));
      self.invulnTicks = int(param(m, 'invuln', 10));
      const boom = zone(w, self, 'BOOM', moveId, m);
      boom.x = (start + self.x) / 2;
      boom.w = Math.abs(self.x - start) + 80;
      boom.h = self.def.body.height;
      boom.y = boom.h / 2;
      boom.delay = int(param(m, 'delay', 5));
      boom.active = int(param(m, 'active', 5));
      boom.life = boom.delay + boom.active + 2;
      w.spawnZone(boom);
      break;
    }
    case 'ultimate': {
      const waves = int(param(m, 'waves', 6));
      const spacing = param(m, 'lambda', 140) * (1 - param(m, 'mach', 0.6));
      for (let i = 0; i < waves; i++) {
        const front = projectile(w, self, 'wavefront', moveId, m);
        front.x = self.x + self.facing * (80 + i * spacing);
        front.y = 120;
        front.w = 40;
        front.h = 170;
        front.vx = self.facing * param(m, 'speed', 900);
        front.life = int(param(m, 'life', 80));
        w.spawnProjectile(front);
      }
      break;
    }
  }
};

/** Copy moves: re-run the opponent's last special as if `self` cast it (mirrors Fighter.copySpecial). */
function copySpecial(w: MatchWorld, self: FighterState, opp: FighterState): string | null {
  const id = opp.lastSpecial;
  if (id === null) return null;
  const src = opp.def.moves[id];
  if (!src || src.hitbox || param(src, 'copies', 0) === 1) return null;
  TRIGGERS[opp.def.id]?.(w, self, opp, id, src);
  w.event('COPY', self.slot, opp.slot, id, 0, r(self.x), r(self.y + self.def.body.height / 2));
  return id;
}

/** Bernoulli: Lift Jump (P + ½ρv² = const), Pressure Jet, ULTIMATE Hurricane. */
const bernoulli: Trigger = (w, self, _opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const updraft = zone(w, self, 'BURST', moveId, m);
      updraft.x = self.x;
      updraft.y = self.def.body.height / 2;
      updraft.w = param(m, 'w', 170);
      updraft.h = self.def.body.height;
      updraft.delay = 1;
      updraft.active = 5;
      updraft.life = 8;
      w.spawnZone(updraft);
      self.vx = self.facing * param(m, 'drift', 380);
      self.vy = param(m, 'lift', 1650);
      if (self.vy > 0) self.grounded = false;
      break;
    }
    case 'special2': {
      const jet = projectile(w, self, 'jet', moveId, m);
      jet.x = self.x + self.facing * param(m, 'offset', 70);
      jet.y = param(m, 'height', 110);
      jet.w = 90;
      jet.h = 46;
      jet.vx = self.facing * param(m, 'speed', 1100);
      jet.life = int(param(m, 'life', 40));
      w.spawnProjectile(jet);
      break;
    }
    case 'ultimate': {
      const eye = zone(w, self, 'VORTEX', moveId, m);
      const width = param(m, 'w', 560);
      eye.x = Math.max(width / 2, Math.min(w.arena.width - width / 2, self.x + self.facing * param(m, 'offset', 300)));
      eye.w = width;
      eye.h = param(m, 'h', 600);
      eye.y = eye.h / 2;
      eye.strength = param(m, 'pull', 260);
      eye.lift = param(m, 'lift', 380);
      eye.interval = int(param(m, 'interval', 16));
      eye.life = int(param(m, 'life', 210));
      w.spawnZone(eye);
      break;
    }
  }
};

/** Edison: DC Punch, Lightbulb Flash (dazzle), ULTIMATE Patent (copies and locks the opponent's last special). */
const edison: Trigger = (w, self, opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const current = zone(w, self, 'CURRENT', moveId, m);
      current.x = self.x + self.facing * param(m, 'offset', 95);
      current.y = param(m, 'height', 110);
      current.w = param(m, 'w', 130);
      current.h = param(m, 'h', 150);
      current.interval = int(param(m, 'interval', 8));
      current.life = int(param(m, 'life', 36));
      current.electric = true;
      w.spawnZone(current);
      break;
    }
    case 'special2': {
      const flash = zone(w, self, 'BURST', moveId, m);
      flash.x = self.x + self.facing * param(m, 'offset', 110);
      flash.y = param(m, 'height', 140);
      flash.w = param(m, 'w', 220);
      flash.h = param(m, 'h', 200);
      flash.delay = 4;
      flash.active = 4;
      flash.life = 10;
      flash.blind = int(param(m, 'blind', 150));
      w.spawnZone(flash);
      break;
    }
    case 'ultimate': {
      const copied = copySpecial(w, self, opp);
      if (copied !== null) {
        const idx = copied === 'special1' ? 0 : 1;
        opp.cooldowns[idx] = Math.max(opp.cooldowns[idx], int(param(m, 'lock', 300)));
      } else {
        const burst = zone(w, self, 'BURST', moveId, m);
        burst.x = self.x + self.facing * 140;
        burst.y = 150;
        burst.w = 320;
        burst.h = 300;
        burst.delay = 2;
        burst.active = 5;
        burst.life = 9;
        burst.blind = int(param(m, 'blind', 150));
        w.spawnZone(burst);
      }
      break;
    }
  }
};

/** S.N. Bose: Condensate Freeze (chill, then freeze), Boson Copy, ULTIMATE Bose–Einstein Condensate. */
const snBose: Trigger = (w, self, opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const cold = projectile(w, self, 'coldwave', moveId, m);
      cold.x = self.x + self.facing * param(m, 'offset', 70);
      cold.y = param(m, 'height', 120);
      cold.w = cold.h = param(m, 'size', 60);
      cold.vx = self.facing * param(m, 'speed', 620);
      cold.life = int(param(m, 'life', 90));
      cold.effect = 'CHILL';
      cold.effectTicks = int(param(m, 'chillTicks', 180));
      cold.freezeStun = int(param(m, 'freezeStun', 75));
      w.spawnProjectile(cold);
      break;
    }
    case 'special2':
      copySpecial(w, self, opp);
      break;
    case 'ultimate': {
      const aw = w.arena.width, ah = w.arena.height;
      w.condense(opp.slot, self.slot, aw / 2, ah / 2);
      const freeze = zone(w, self, 'BURST', moveId, m);
      freeze.x = aw / 2;
      freeze.y = ah / 2;
      freeze.w = aw;
      freeze.h = ah;
      freeze.delay = 2;
      freeze.active = 2;
      freeze.life = 6;
      w.spawnZone(freeze);
      break;
    }
  }
};

function vine(w: MatchWorld, self: FighterState, moveId: string, m: MoveDefinition, x: number, grow: number, strikeAt: number, life: number): Zone {
  const v = zone(w, self, 'VINE', moveId, m);
  v.w = param(m, 'w', 120);
  v.h = param(m, 'h', 130);
  v.x = Math.max(v.w / 2, Math.min(w.arena.width - v.w / 2, x));
  v.y = v.h / 2;
  v.arm = grow;
  v.delay = strikeAt;
  v.life = life;
  return v;
}

/** J.C. Bose: Microwave Pulse (through the walls), Crescograph Vines, ULTIMATE Living Signal. */
const jcBose: Trigger = (w, self, opp, moveId, m) => {
  switch (moveId) {
    case 'special1': {
      const wave = projectile(w, self, 'microwave', moveId, m);
      wave.x = self.x + self.facing * param(m, 'offset', 70);
      wave.y = param(m, 'height', 125);
      wave.w = 40;
      wave.h = 90;
      wave.vx = self.facing * param(m, 'speed', 900);
      wave.life = int(param(m, 'life', 150));
      wave.wraps = int(param(m, 'wraps', 1));
      wave.electric = true;
      w.spawnProjectile(wave);
      break;
    }
    case 'special2':
      w.spawnZone(vine(w, self, moveId, m, self.x + self.facing * param(m, 'offset', 230), int(param(m, 'grow', 30)), 0, int(param(m, 'life', 480))));
      break;
    case 'ultimate': {
      const strike = int(param(m, 'strike', 24));
      w.syncZones(self.slot, 'VINE', strike);
      const spread = param(m, 'spread', 170);
      for (let i = -1; i <= 1; i++) w.spawnZone(vine(w, self, moveId, m, opp.x + i * spread, 0, strike, strike + 2));
      break;
    }
  }
};

const TRIGGERS: Record<string, Trigger> = { newton, tesla, curie, einstein, galileo, archimedes, faraday, hooke,
  schrodinger, heisenberg, hawking, doppler, bernoulli, edison, 'sn-bose': snBose, 'jc-bose': jcBose };

export function onTrigger(w: MatchWorld, self: FighterState, opp: FighterState, moveId: string, m: MoveDefinition) {
  TRIGGERS[self.def.id]?.(w, self, opp, moveId, m);
}
