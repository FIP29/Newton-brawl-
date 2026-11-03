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

const TRIGGERS: Record<string, Trigger> = { newton, tesla, curie, einstein };

export function onTrigger(w: MatchWorld, self: FighterState, opp: FighterState, moveId: string, m: MoveDefinition) {
  TRIGGERS[self.def.id]?.(w, self, opp, moveId, m);
}
