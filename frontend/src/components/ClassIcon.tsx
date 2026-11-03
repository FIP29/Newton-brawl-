import type { FighterDefinition } from '../game/protocol';

/** Class badges: Bruiser (fist), Speedster (chevrons), Zoner (target), Trickster (spiral). */
export function ClassIcon({ cls, size = 22 }: { cls: FighterDefinition['fighterClass']; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
                   strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (cls) {
    case 'BRUISER':
      return <svg {...common}><path d="M6 11V8a2 2 0 0 1 4 0v2M10 9V7a2 2 0 0 1 4 0v3M14 9.5V8a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a2 2 0 0 1 4 0" /></svg>;
    case 'SPEEDSTER':
      return <svg {...common}><path d="M4 6l6 6-6 6M12 6l6 6-6 6" /></svg>;
    case 'ZONER':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>;
    case 'TRICKSTER':
      return <svg {...common}><path d="M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4-4 6 6 0 1 1-6 6 8 8 0 0 1 8-8" /></svg>;
  }
}

export const CLASS_LABEL: Record<FighterDefinition['fighterClass'], string> = {
  BRUISER: 'Bruiser', SPEEDSTER: 'Speedster', ZONER: 'Zoner', TRICKSTER: 'Trickster',
};
