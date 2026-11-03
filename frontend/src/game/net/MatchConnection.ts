import { tokenStore } from '../../api/client';
import { TICK_MS, type ServerMessage } from '../protocol';

export interface ConnectionHandlers {
  onMessage(msg: ServerMessage): void;
  onClose(code: number, reason: string): void;
  /** Every input packet sent (feeds client-side prediction). */
  onInputSent?(seq: number, bits: number): void;
}

/**
 * The match WebSocket. Sends one input packet per client tick (fixed 60 Hz, driven by
 * {@link pump}) and measures round-trip time with periodic pings.
 */
export class MatchConnection {
  private ws: WebSocket;
  private seq = 0;
  private accumulator = 0;
  private lastPump = 0;
  private pingTimer: number | undefined;
  private closedByUs = false;
  /** Smoothed round-trip time in ms. */
  rtt = 0;

  constructor(room: string, private readonly handlers: ConnectionHandlers) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const base = import.meta.env.VITE_WS_BASE ?? `${proto}://${location.host}`;
    const token = encodeURIComponent(tokenStore.get() ?? '');
    this.ws = new WebSocket(`${base}/ws/match?room=${encodeURIComponent(room)}&token=${token}`);

    this.ws.onmessage = (e) => {
      let msg: ServerMessage;
      try { msg = JSON.parse(e.data as string) as ServerMessage; } catch { return; }
      if (msg.t === 'pong') {
        const sample = performance.now() - msg.c;
        this.rtt = this.rtt === 0 ? sample : this.rtt * 0.8 + sample * 0.2;
      }
      handlers.onMessage(msg);
    };
    this.ws.onopen = () => {
      this.ping();
      this.pingTimer = window.setInterval(() => this.ping(), 1000);
    };
    this.ws.onclose = (e) => {
      window.clearInterval(this.pingTimer);
      if (!this.closedByUs) handlers.onClose(e.code, e.reason);
    };
  }

  /**
   * Call every animation frame. Emits as many fixed-rate input packets as real time requires,
   * so inputs reach the server at 60 Hz regardless of the display's refresh rate.
   */
  pump(now: number, sample: () => number) {
    if (this.lastPump === 0) this.lastPump = now;
    this.accumulator += Math.min(now - this.lastPump, 250);
    this.lastPump = now;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.sendInput(sample());
    }
  }

  /** Immediately send "nothing held" (e.g. when the tab is hidden and frames stop). */
  releaseAll() {
    this.sendInput(0);
  }

  private sendInput(bits: number) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const seq = ++this.seq;
    this.ws.send(`{"t":"in","s":${seq},"b":${bits}}`);
    this.handlers.onInputSent?.(seq, bits);
  }

  private ping() {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'ping', c: performance.now() }));
  }

  close() {
    this.closedByUs = true;
    window.clearInterval(this.pingTimer);
    this.ws.close(1000, 'leaving');
  }
}
