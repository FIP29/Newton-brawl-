import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { FIGHTERS, ROSTER } from '../game/data/fighters';
import { ProceduralFighterVisual, idleView } from '../game/render/characters/FighterVisual';
import type { FighterView } from '../game/protocol';
import { SKINS } from '../game/render/characters/looks';

/** Dev-only gallery (/dev/characters): every scientist in a set of poses, for art iteration. */
export function CharacterPreview() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const app = new Application();
    let disposed = false;
    void app.init({ resizeTo: host.current!, background: 0x14181d, antialias: true }).then(() => {
      if (disposed) { app.destroy(true); return; }
      host.current!.appendChild(app.canvas);
      const poses: Array<[string, (id: string) => Partial<FighterView>]> = [
        ['idle', () => ({})],
        ['walk', () => ({ action: 'WALK', vx: 300 })],
        ['heavy', () => ({ action: 'ATTACK', move: 'heavy', moveFrame: 14 })],
        ['special', () => ({ action: 'ATTACK', move: 'special1', moveFrame: 6 })],
        ['ultimate', () => ({ action: 'ATTACK', move: 'ultimate', moveFrame: 10 })],
        ['hit', () => ({ action: 'HITSTUN' })],
      ];
      const visuals: Array<{ v: ProceduralFighterVisual; view: FighterView }> = [];
      const world = new Container();
      world.scale.set(1, -1);
      app.stage.addChild(world);
      const ids = location.search.includes('p7') ? ROSTER.slice(8, 12) : location.search.includes('new') ? ROSTER.slice(4, 8) : ROSTER.slice(0, 4);
      ids.forEach((id, row) => {
        poses.forEach(([name, make], col) => {
          const def = FIGHTERS[id];
          const v = new ProceduralFighterVisual(def);
          const view = idleView(def, { ...make(id), x: 110 + col * 190, y: 0 });
          const cell = new Container();
          cell.position.set(0, -(row + 1) * 250 + 20);
          cell.addChild(v.root);
          world.addChild(cell);
          visuals.push({ v, view });
          if (row === 0) {
            const t = new Text({ text: name, style: { fill: 0x9aa39c, fontSize: 14, fontFamily: 'Inter' } });
            t.scale.y = -1; t.position.set(80 + col * 190, -14);
            world.addChild(t);
          }
        });
        const floor = new Graphics().rect(0, -(row + 1) * 250 + 18, 1200, 2).fill({ color: 0xffffff, alpha: 0.1 });
        world.addChild(floor);
      });
      // Row 5: unlockable historical skins.
      Object.entries(SKINS).forEach(([id, skins], i) => {
        const [skin] = Object.keys(skins);
        const def = FIGHTERS[id];
        const v = new ProceduralFighterVisual(def, skin);
        const view = idleView(def, { x: 110 + i * 190 * 1.5, y: 0 });
        const cell = new Container();
        cell.position.set(0, -5 * 250 + 20);
        cell.addChild(v.root);
        world.addChild(cell);
        visuals.push({ v, view });
      });
      world.position.set(0, 0);
      app.ticker.add((tk) => visuals.forEach(({ v, view }) => v.update(view, tk.deltaMS / 1000)));
    });
    return () => { disposed = true; try { app.destroy(true); } catch { /* not initialised */ } };
  }, []);
  return <div ref={host} style={{ position: 'fixed', inset: 0 }} />;
}
