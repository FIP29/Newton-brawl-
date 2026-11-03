/** Mirrors com.newtonbrawl.engine.sim.Aabb. x, y = bottom-left corner. */
export interface Aabb { x: number; y: number; w: number; h: number }

export const centered = (cx: number, cy: number, w: number, h: number): Aabb => ({ x: cx - w / 2, y: cy - h / 2, w, h });

export const intersects = (a: Aabb, o: Aabb): boolean =>
  a.x < o.x + o.w && o.x < a.x + a.w && a.y < o.y + o.h && o.y < a.y + a.h;

export function overlapCenter(a: Aabb, o: Aabb): [number, number] {
  const left = Math.max(a.x, o.x), right = Math.min(a.x + a.w, o.x + o.w);
  const bottom = Math.max(a.y, o.y), top = Math.min(a.y + a.h, o.y + o.h);
  return [(left + right) / 2, (bottom + top) / 2];
}
