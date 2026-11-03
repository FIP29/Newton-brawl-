import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

/** An equation that writes itself in chalk (stroke draws on, then the glowing fill fades in). */
export function ChalkEquation({ text, color, size = 64, duration = 0.7 }: { text: string; color: string; size?: number; duration?: number }) {
  const ref = useRef<SVGTextElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    gsap.set(el, { strokeDasharray: 2000, strokeDashoffset: 2000, fillOpacity: 0 });
    const tl = gsap.timeline();
    tl.to(el, { strokeDashoffset: 0, duration, ease: 'power1.inOut' })
      .to(el, { fillOpacity: 1, duration: 0.25 }, `-=${duration * 0.3}`);
    return () => { tl.kill(); };
  }, [text, duration]);
  const width = Math.max(200, text.length * size * 0.42);
  return (
    <svg className="chalk-eq" viewBox={`0 0 ${width} ${size * 1.4}`} width={width} height={size * 1.4} style={{ color }} aria-label={text}>
      <text ref={ref} x="50%" y="70%" textAnchor="middle" fontSize={size} fill={color} stroke={color} strokeWidth={1.4}
            fontFamily="Caveat, cursive" fontWeight={700}>{text}</text>
    </svg>
  );
}
