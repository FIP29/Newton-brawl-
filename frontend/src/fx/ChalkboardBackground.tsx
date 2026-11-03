import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { BACKDROP_EQUATIONS, NEON } from './palette';

/**
 * Full-screen animated menu backdrop rendered with PixiJS v8.
 *
 * Three parallax layers on a transparent canvas (the slate + vignette is CSS, underneath):
 *   1. far   — twinkling stars
 *   2. mid   — glowing chalk equations drifting and fading, plus a slowly orbiting chalk atom
 *   3. near  — chalk dust motes rising through the air
 * Neon glow uses GlowFilter per glowing object. (A bloom pass over the whole transparent layer
 * leaks light outside texture bounds as faint boxes, so per-object glow is used instead.)
 */
export function ChalkboardBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const app = new Application();
    let disposed = false;
    let initialised = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const speed = reducedMotion ? 0.25 : 1;

    // Mouse-driven parallax target in [-1, 1].
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };

    (async () => {
      await app.init({ resizeTo: window, backgroundAlpha: 0, antialias: true,
                       resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true });
      initialised = true;
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);
      // Wait for the chalk handwriting font so Text measures correctly.
      await document.fonts.load('48px Caveat').catch(() => undefined);
      if (disposed) return;
      build();
    })();

    function build() {
      const W = () => app.screen.width;
      const H = () => app.screen.height;
      const far = new Container();
      const mid = new Container();
      const near = new Container();
      app.stage.addChild(far, mid, near);
      const glow = (color: number, outer = 2.2) =>
        new GlowFilter({ color, distance: 14, outerStrength: outer, innerStrength: 0, quality: 0.15 });

      const dotTex: Texture = app.renderer.generateTexture(new Graphics().circle(0, 0, 4).fill(0xffffff));

      // ---- far: stars ------------------------------------------------------
      const stars = Array.from({ length: 140 }, () => {
        const s = new Sprite(dotTex);
        s.anchor.set(0.5);
        s.scale.set(0.15 + Math.random() * 0.35);
        s.position.set(Math.random() * W(), Math.random() * H());
        s.tint = Math.random() < 0.15 ? NEON.tesla : NEON.chalk;
        far.addChild(s);
        return { s, phase: Math.random() * Math.PI * 2, rate: 0.5 + Math.random() * 1.5 };
      });

      // ---- mid: chalk atom -------------------------------------------------
      const atom = new Container();
      const orbits = [0, Math.PI / 3, (2 * Math.PI) / 3].map((rot, i) => {
        const g = new Graphics().ellipse(0, 0, 150, 50).stroke({ width: 2, color: [NEON.tesla, NEON.einstein, NEON.curie][i], alpha: 0.35 });
        g.rotation = rot;
        atom.addChild(g);
        const e = new Sprite(dotTex);
        e.anchor.set(0.5);
        e.scale.set(1.1);
        e.tint = [NEON.tesla, NEON.einstein, NEON.curie][i];
        atom.addChild(e);
        return { rot, e, phase: i * 2.1 };
      });
      const nucleus = new Graphics().circle(0, 0, 10).fill({ color: NEON.newton, alpha: 0.85 });
      atom.addChild(nucleus);
      atom.filters = [glow(NEON.tesla, 1.5)];
      mid.addChild(atom);

      // ---- mid: floating equations ----------------------------------------
      interface Eq { t: Text; vx: number; vy: number; life: number; maxLife: number; spin: number }
      const eqs: Eq[] = [];
      const spawnEquation = (initial: boolean): Eq => {
        const def = BACKDROP_EQUATIONS[Math.floor(Math.random() * BACKDROP_EQUATIONS.length)];
        const t = new Text({ text: def.text, style: {
          fontFamily: 'Caveat, cursive', fontSize: 26 + Math.random() * 30, fill: def.color, fontWeight: '700',
        } });
        t.anchor.set(0.5);
        t.filters = [glow(def.color)];
        t.position.set(Math.random() * W(), Math.random() * H());
        t.rotation = (Math.random() - 0.5) * 0.25;
        const maxLife = 9 + Math.random() * 8;
        const eq = { t, vx: (Math.random() - 0.5) * 8, vy: -3 - Math.random() * 6, life: initial ? Math.random() * maxLife : 0, maxLife, spin: (Math.random() - 0.5) * 0.01 };
        mid.addChild(t);
        return eq;
      };
      const EQ_COUNT = Math.max(6, Math.min(12, Math.round((W() * H()) / 140000)));
      for (let i = 0; i < EQ_COUNT; i++) eqs.push(spawnEquation(true));

      // ---- near: chalk dust ------------------------------------------------
      const dust = Array.from({ length: 160 }, () => {
        const s = new Sprite(dotTex);
        s.anchor.set(0.5);
        s.scale.set(0.12 + Math.random() * 0.4);
        s.alpha = 0.15 + Math.random() * 0.45;
        s.tint = NEON.chalk;
        s.position.set(Math.random() * W(), Math.random() * H());
        near.addChild(s);
        return { s, vy: -(6 + Math.random() * 18), sway: Math.random() * Math.PI * 2 };
      });

      let time = 0;
      app.ticker.add((ticker) => {
        const dt = (ticker.deltaMS / 1000) * speed;
        time += dt;

        // Smooth the pointer, then offset layers by depth for parallax.
        pointer.sx += (pointer.x - pointer.sx) * 0.04;
        pointer.sy += (pointer.y - pointer.sy) * 0.04;
        far.position.set(-pointer.sx * 8, -pointer.sy * 6);
        mid.position.set(-pointer.sx * 20, -pointer.sy * 14);
        near.position.set(-pointer.sx * 40, -pointer.sy * 28);

        for (const st of stars) st.s.alpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(time * st.rate + st.phase));

        atom.position.set(W() * 0.84, H() * 0.24);
        atom.rotation = time * 0.05;
        for (const o of orbits) {
          const a = time * 1.6 + o.phase;
          const x = Math.cos(a) * 150, y = Math.sin(a) * 50;
          o.e.position.set(x * Math.cos(o.rot) - y * Math.sin(o.rot), x * Math.sin(o.rot) + y * Math.cos(o.rot));
        }
        nucleus.scale.set(1 + 0.08 * Math.sin(time * 3));

        for (let i = 0; i < eqs.length; i++) {
          const q = eqs[i];
          q.life += dt;
          q.t.x += q.vx * dt;
          q.t.y += q.vy * dt;
          q.t.rotation += q.spin * dt;
          // Fade in, hold, fade out — with a subtle "flicker" like a buzzing neon tube.
          const k = q.life / q.maxLife;
          const env = Math.min(1, k * 4, (1 - k) * 4);
          const flicker = Math.random() < 0.005 ? 0.4 : 1;
          q.t.alpha = Math.max(0, env) * 0.75 * flicker;
          if (q.life >= q.maxLife) {
            q.t.destroy();
            eqs[i] = spawnEquation(false);
          }
        }

        for (const d of dust) {
          d.sway += dt;
          d.s.y += d.vy * dt;
          d.s.x += Math.sin(d.sway) * 6 * dt;
          if (d.s.y < -10) { d.s.y = H() + 10; d.s.x = Math.random() * W(); }
        }
      });
    }

    window.addEventListener('pointermove', onMove);
    return () => {
      disposed = true;
      window.removeEventListener('pointermove', onMove);
      if (initialised) app.destroy(true, { children: true, texture: true });
    };
  }, []);

  return <div ref={hostRef} className="backdrop" aria-hidden="true" />;
}
