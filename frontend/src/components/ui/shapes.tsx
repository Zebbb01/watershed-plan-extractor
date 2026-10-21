import type { CSSProperties } from 'react';

/*
 * Quiet background for arrival pages (home, accuracy, how it works): pale circles, a ring, a
 * quarter circle, a dot grid and two small squares in brand blues. Hard edges, no blur. Each
 * drifts a few pixels on its own slow loop; the global reduced-motion rule stops them.
 * Working screens (the report) do not use it.
 */

const drift = (t: number, dx: number, dy: number, r = 0) => ({ '--t': `${t}s`, '--dx': `${dx}px`, '--dy': `${dy}px`, '--r': `${r}deg` }) as CSSProperties;

export function Shapes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="shape absolute -right-24 -top-28 size-[26rem] rounded-full bg-white/70" style={drift(28, -14, 10)} />
      <span className="shape absolute right-[18%] top-[58%] size-40 rounded-full border-2 border-primary-200" style={drift(22, 12, -10)} />
      <span className="shape absolute -bottom-24 -left-24 size-64 rounded-tr-full bg-primary-100/70" style={drift(30, 10, -6)} />
      <span className="shape absolute left-[44%] top-8 size-3 rotate-12 bg-primary-300" style={drift(18, 8, 12, 30)} />
      <span className="shape absolute bottom-10 right-[8%] size-2.5 -rotate-6 bg-primary-500/60" style={drift(20, -10, -8, -24)} />
      <svg className="shape absolute left-[3%] top-10 hidden h-28 w-40 text-primary-300 sm:block" style={drift(26, 6, 8)} viewBox="0 0 160 112">
        {Array.from({ length: 6 }, (_, row) =>
          Array.from({ length: 8 }, (_, col) => <circle key={`${row}-${col}`} cx={8 + col * 20} cy={8 + row * 19} r={2} fill="currentColor" />),
        )}
      </svg>
    </div>
  );
}
