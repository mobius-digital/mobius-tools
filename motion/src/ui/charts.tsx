// The apps' own charts, drawn the way ledger/lg-core.js and profit/v2.js draw
// them (the same smoothing, the same geometry, no library), with one extra
// prop: `t`, 0 to 1, how much of the chart has drawn in.
import React from 'react';
import { interpolate } from 'remotion';
import { sans } from './tokens';

type Pt = [number, number];

// lg-core.js smoothPath, verbatim in spirit: a Catmull-Rom style curve with the
// control points clamped so the line never overshoots a neighbour.
export const smoothPath = (pts: Pt[]) => {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.16;
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const cl = (y: number) => Math.max(lo, Math.min(hi, y));
    d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${cl(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${cl(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};

export const scale = (vals: number[], h: number, pt: number, pb: number, zeroFloor = true) => {
  const v = vals.filter((x) => isFinite(x));
  let mn = zeroFloor ? Math.min(0, ...v) : Math.min(...v);
  let mx = Math.max(0, ...v);
  if (mx === mn) mx = mn + 1;
  const pad = (mx - mn) * 0.08;
  mx += pad;
  if (mn < 0) mn -= pad;
  const Y = (y: number) => pt + (1 - (y - mn) / (mx - mn)) * (h - pt - pb);
  return { mn, mx, Y };
};

export const niceTicks = (mn: number, mx: number, n = 4) => {
  const span = mx - mn;
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  const out: number[] = [];
  for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) out.push(t);
  return out;
};

export const kfmt = (n: number) =>
  Math.abs(n) >= 1e4 ? `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1e3).toFixed(0)}K` : `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

// A clip that reveals the drawing left to right as t grows.
const Reveal: React.FC<{ id: string; t: number; w: number; h: number; children: React.ReactNode }> = ({ id, t, w, h, children }) => (
  <>
    <defs>
      <clipPath id={id}>
        <rect x={0} y={-20} width={Math.max(0, w * t)} height={h + 40} />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id})`}>{children}</g>
  </>
);

let uid = 0;
const useId = (prefix: string) => React.useMemo(() => `${prefix}${++uid}`, [prefix]);

// A sparkline for a tile (lg-core.js spark): the line, a soft area under it, a dot at the end.
export const Spark: React.FC<{ values: number[]; w?: number; h?: number; color: string; t?: number; zeroFloor?: boolean; style?: React.CSSProperties; thick?: number }> = ({
  values, w = 300, h = 36, color, t = 1, zeroFloor = true, style, thick = 1.8,
}) => {
  const id = useId('sp');
  const { mn, Y } = scale(values, h, 3, 3, zeroFloor);
  const X = (i: number) => (i / Math.max(1, values.length - 1)) * (w - 6) + 3;
  const pts: Pt[] = values.map((v, i) => [X(i), Y(v)]);
  const base = Y(Math.max(mn, 0));
  const d = smoothPath(pts);
  const last = pts[pts.length - 1];
  const lastX = X(0) + (last[0] - X(0)) * t;
  // The dot rides the end of the drawn part: find the point at lastX by linear search on the polyline.
  let dotY = last[1];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= lastX) {
      const f = (lastX - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      dotY = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
      break;
    }
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible', ...style }}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.22} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {mn < 0 && <line x1={0} x2={w} y1={Y(0)} y2={Y(0)} stroke="#9C3A2E" strokeDasharray="3 3" strokeWidth={1} opacity={0.7} />}
      <Reveal id={`${id}c`} t={t} w={w} h={h}>
        <path d={`${d} L${last[0]},${base} L${pts[0][0]},${base}Z`} fill={`url(#${id}g)`} />
        <path d={d} fill="none" stroke={color} strokeWidth={thick} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </Reveal>
      {t > 0.02 && <circle cx={lastX} cy={dotY} r={2.6} fill={color} />}
    </svg>
  );
};

// A line chart (lg-core.js lineChart): grid, ticks, area, line, last dot. `w` and `h` in app px.
export const LineChart: React.FC<{
  rows: { x: string; v: number }[]; w?: number; h?: number; color: string; grid: string; faint: string; muted: string; surface: string;
  t?: number; zeroFloor?: boolean; fmt?: (n: number) => string; bad?: string; mark?: number; style?: React.CSSProperties;
}> = ({ rows, w = 760, h = 240, color, grid, faint, muted, surface, t = 1, zeroFloor = true, fmt = kfmt, bad = '#9C3A2E', mark, style }) => {
  const id = useId('lc');
  const pl = 54, pr = 16, pt = 16, pb = 26;
  const n = rows.length;
  const { mn, mx, Y } = scale(rows.map((r) => r.v), h, pt, pb, zeroFloor);
  const X = (i: number) => pl + (i / (n - 1)) * (w - pl - pr);
  const pts: Pt[] = rows.map((r, i) => [X(i), Y(r.v)]);
  const base = Y(Math.max(mn, 0));
  const d = smoothPath(pts);
  const ticks = niceTicks(mn, mx);
  const last = pts[n - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', fontFamily: sans, overflow: 'visible', ...style }}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.2} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={pl} x2={w - pr} y1={Y(tk)} y2={Y(tk)} stroke={tk === 0 && mn < 0 ? bad : grid} strokeDasharray={tk === 0 && mn < 0 ? '4 3' : '2 4'} />
          <text x={pl - 8} y={Y(tk) + 4} fontSize={10.5} textAnchor="end" fill={faint}>{fmt(tk)}</text>
        </g>
      ))}
      {rows.map((r, i) => (
        <text key={i} x={X(i)} y={h - 8} fontSize={10} textAnchor="middle" fill={muted}>{r.x}</text>
      ))}
      <Reveal id={`${id}c`} t={t} w={w} h={h}>
        <path d={`${d} L${last[0]},${base} L${pts[0][0]},${base}Z`} fill={`url(#${id}g)`} />
        <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Reveal>
      {t >= 0.999 && <circle cx={last[0]} cy={last[1]} r={4} fill={surface} stroke={color} strokeWidth={2} />}
      {mark !== undefined && t > (mark / (n - 1)) && (
        <circle cx={X(mark)} cy={Y(rows[mark].v)} r={5} fill={surface} stroke={bad} strokeWidth={2} />
      )}
    </svg>
  );
};

// Bars by period (lg-core.js barChart): negatives below a zero line, drawn red. `t` grows every bar from the zero line, staggered.
export const BarChart: React.FC<{
  rows: { x: string; v: number; faded?: boolean }[]; w?: number; h?: number; color: string; bad: string; grid: string; faint: string; muted: string;
  t?: number; fmt?: (n: number) => string; style?: React.CSSProperties;
}> = ({ rows, w = 760, h = 220, color, bad, grid, faint, muted, t = 1, fmt = kfmt, style }) => {
  const pl = 54, pr = 16, pt = 16, pb = 26;
  const n = rows.length;
  const { mn, mx, Y } = scale(rows.map((r) => r.v), h, pt, pb);
  const bw = (w - pl - pr) / n;
  const z = Y(0);
  const ticks = niceTicks(mn, mx);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', fontFamily: sans, overflow: 'visible', ...style }}>
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={pl} x2={w - pr} y1={Y(tk)} y2={Y(tk)} stroke={tk === 0 && mn < 0 ? bad : grid} strokeDasharray={tk === 0 && mn < 0 ? '4 3' : '2 4'} />
          <text x={pl - 8} y={Y(tk) + 4} fontSize={10.5} textAnchor="end" fill={faint}>{fmt(tk)}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        // Each bar grows in its own slice of t, overlapping the next.
        const local = interpolate(t, [i / (n + 2), (i + 3) / (n + 2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const y = Y((r.v || 0) * local);
        const x = pl + i * bw + bw * 0.2;
        const top = Math.min(y, z);
        const hh = Math.max(1.5, Math.abs(z - y));
        return (
          <g key={i}>
            <rect x={x} y={top} width={bw * 0.6} height={hh} rx={3} fill={(r.v || 0) < 0 ? bad : color} opacity={r.faded ? 0.5 : 1} />
            <text x={pl + i * bw + bw / 2} y={h - 8} fontSize={10} textAnchor="middle" fill={muted}>{r.x}</text>
          </g>
        );
      })}
    </svg>
  );
};
