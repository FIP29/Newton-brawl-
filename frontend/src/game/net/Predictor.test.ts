import { describe, expect, it } from 'vitest';
import { Btn, type StateMessage } from '../protocol';
import { MatchSimulation, NO_INPUT } from '../sim/MatchSimulation';
import { STANDARD_RULES, THE_LAB } from '../sim/constants';
import { fighter } from '../data/fighters';
import { Predictor } from './Predictor';

const defs = [fighter('prototype'), fighter('prototype')] as [ReturnType<typeof fighter>, ReturnType<typeof fighter>];

/**
 * A miniature server: the TS simulation (parity-identical to Java) plus an input queue that, like
 * engine.input.InputQueue, applies one client input per tick and acks its seq. Packets in both
 * directions are delayed by `latency` ticks.
 */
function runNetworked(latency: number, script: (t: number) => number, opponent: (t: number) => number, ticks: number) {
  const server = new MatchSimulation(THE_LAB, defs, { ...STANDARD_RULES, countdownTicks: 0 });
  const predictor = new Predictor(THE_LAB, defs, 0);
  const upstream: Array<{ at: number; seq: number; bits: number }> = [];
  const downstream: Array<{ at: number; msg: StateMessage }> = [];
  const queue: Array<{ seq: number; bits: number }> = [];
  let lastBits = 0, lastSeq = 0, oppPrev = 0, seq = 0;
  const corrections: number[] = [];

  for (let t = 1; t <= ticks; t++) {
    // client: sample + send + predict
    const bits = script(t);
    predictor.onInputSent(++seq, bits);
    upstream.push({ at: t + latency, seq, bits });

    // server: receive, consume one input, step, broadcast
    while (upstream.length && upstream[0].at <= t) queue.push(upstream.shift()!);
    const next = queue.shift();
    const held = next ? next.bits : lastBits;
    if (next) lastSeq = next.seq;
    const input = { held, pressed: held & ~lastBits };
    lastBits = held;
    const ob = opponent(t);
    server.step(input, ob ? { held: ob, pressed: ob & ~oppPrev } : NO_INPUT);
    oppPrev = ob;
    downstream.push({ at: t + latency, msg: { ...server.snapshot(), t: 'state', ack: [lastSeq, 0] } });

    // client: receive snapshots and reconcile
    while (downstream.length && downstream[0].at <= t) {
      predictor.onServerState(downstream.shift()!.msg);
      corrections.push(predictor.lastCorrection);
    }
  }
  return { server, predictor, corrections };
}

describe('Predictor', () => {
  const walkJumpCrouchAttack = (t: number) =>
    t < 40 ? Btn.RIGHT : t < 45 ? Btn.UP | Btn.RIGHT : t < 90 ? Btn.LEFT : t < 110 ? Btn.DOWN
      : t === 120 || t === 160 ? Btn.HEAVY : t === 140 ? Btn.LIGHT : t < 200 ? 0 : Btn.LEFT;

  it('predicts own movement exactly when nothing unexpected happens (100 ms each way)', () => {
    const { corrections } = runNetworked(6, walkJumpCrouchAttack, () => 0, 260);
    expect(corrections.length).toBeGreaterThan(200);
    // Only the 0.1-unit rounding of snapshots can introduce error.
    expect(Math.max(...corrections)).toBeLessThan(0.5);
  });

  it('shows our input immediately instead of a round trip later', () => {
    const latency = 6;
    const { predictor, server } = runNetworked(latency, (t) => (t > 20 ? Btn.LEFT : 0), () => 0, 30);
    const predicted = predictor.view(16)!.x;
    const serverX = server.snapshot().fighters[0].x;
    // Prediction is ~one full round trip (2 × latency ticks) of walking ahead of what the server has confirmed to us.
    expect(serverX - predicted).toBeGreaterThan(0);
    expect(predicted).toBeLessThan(THE_LAB.width * 0.35 - 9 * defs[0].walkSpeed / 60);
  });

  it('reconciles to the authoritative state when the opponent hits us', () => {
    // Opponent walks in and attacks; prediction can't know, so the server's hit must win.
    const opp = (t: number) => (t < 60 ? Btn.LEFT : t % 30 === 0 ? Btn.HEAVY : Btn.LEFT);
    const { corrections, predictor } = runNetworked(4, () => 0, opp, 200);
    expect(Math.max(...corrections)).toBeGreaterThan(1); // we were pushed/knocked back
    // And after settling, prediction matches the server again.
    expect(corrections.slice(-5).every((c) => c < 0.5)).toBe(true);
    expect(predictor.isActive).toBe(true);
  });
});
