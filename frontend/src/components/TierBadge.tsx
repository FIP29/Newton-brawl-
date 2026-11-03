import type { Tier } from '../api/progress';

const COLORS: Record<Tier, string> = {
  ATOM: '#33bbff', MOLECULE: '#7cff6b', STAR: '#ffcc33', SUPERNOVA: '#ff4d6d', BLACK_HOLE: '#b57bff',
};

/** Rank badges, from the smallest structure to the most extreme object in the universe. */
export function TierBadge({ tier, size = 40, title }: { tier: Tier; size?: number; title?: string }) {
  const c = COLORS[tier];
  const common = { width: size, height: size, viewBox: '0 0 48 48', fill: 'none', stroke: c, strokeWidth: 2.4,
                   strokeLinecap: 'round' as const, style: { filter: `drop-shadow(0 0 6px ${c})`, flex: 'none' } };
  return (
    <svg {...common} role="img" aria-label={title ?? tier}>
      {tier === 'ATOM' && (<>
        <circle cx="24" cy="24" r="3.5" fill={c} />
        <ellipse cx="24" cy="24" rx="19" ry="7" />
        <ellipse cx="24" cy="24" rx="19" ry="7" transform="rotate(60 24 24)" />
        <ellipse cx="24" cy="24" rx="19" ry="7" transform="rotate(-60 24 24)" />
      </>)}
      {tier === 'MOLECULE' && (<>
        <path d="M16 30 L24 16 L33 29 M24 16 L24 6" />
        <circle cx="24" cy="16" r="6" fill={c} fillOpacity={0.3} />
        <circle cx="14" cy="33" r="5" /><circle cx="35" cy="32" r="5" /><circle cx="24" cy="6" r="3.5" />
      </>)}
      {tier === 'STAR' && (
        <path d="M24 4 L28.5 18 L43 18.5 L31.5 27.5 L35.5 42 L24 33.5 L12.5 42 L16.5 27.5 L5 18.5 L19.5 18 Z" fill={c} fillOpacity={0.25} />
      )}
      {tier === 'SUPERNOVA' && (<>
        <circle cx="24" cy="24" r="7" fill={c} fillOpacity={0.4} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2, r1 = 10, r2 = i % 2 ? 17 : 22;
          return <line key={i} x1={24 + Math.cos(a) * r1} y1={24 + Math.sin(a) * r1} x2={24 + Math.cos(a) * r2} y2={24 + Math.sin(a) * r2} />;
        })}
      </>)}
      {tier === 'BLACK_HOLE' && (<>
        <ellipse cx="24" cy="24" rx="21" ry="7" />
        <circle cx="24" cy="24" r="9" fill="#05040a" />
        <path d="M14 22 A11 11 0 0 1 34 22" />
      </>)}
    </svg>
  );
}

export const tierColor = (t: Tier) => COLORS[t];
