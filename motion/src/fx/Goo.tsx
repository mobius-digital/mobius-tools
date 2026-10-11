// The liquid: a number that melts into a puddle, a pill that loses a bite,
// a bar that bleeds down the chart. All SVG under one "goo" filter (a blur
// and a hard alpha curve) so separate shapes merge like one fluid.
import React from 'react';
import { interpolate } from 'remotion';

export const GooDefs: React.FC<{ id?: string; blur?: number }> = ({ id = 'goo', blur = 7 }) => (
  <defs>
    <filter id={id} x="-30%" y="-30%" width="160%" height="200%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="b" />
      <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="g" />
      <feComposite in="SourceGraphic" in2="g" operator="atop" />
    </filter>
  </defs>
);

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Drips hanging from a horizontal edge. `t` 0 to 1 lengthens them; each drip
// has its own delay and length so they never move together.
export const Drips: React.FC<{
  x: number; y: number; width: number; t: number; color: string; count?: number; maxLen: number; seed?: number; floorY?: number; thin?: number;
}> = ({ x, y, width, t, color, count = 4, maxLen, seed = 1, floorY, thin = 1 }) => {
  const drips = Array.from({ length: count }, (_, i) => {
    const u = (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1;
    const r = Math.abs(u);
    const px = x + width * ((i + 0.5) / count) + (r - 0.5) * (width / count) * 0.5;
    const delay = (i * 0.17 + r * 0.2) % 0.55;
    const local = ease((t - delay) / (1 - delay));
    const len = maxLen * (0.55 + r * 0.45) * local;
    const w = (10 + r * 8) * thin;
    const tipY = floorY !== undefined ? Math.min(y + len, floorY) : y + len;
    return { px, len, w, tipY, local };
  });
  return (
    <g>
      {drips.map((d, i) => (
        <g key={i}>
          <rect x={d.px - d.w / 2} y={y - 2} width={d.w} height={Math.max(0, d.tipY - y + 2)} rx={d.w / 2} fill={color} />
          {d.local > 0 && <circle cx={d.px} cy={d.tipY} r={d.w * 0.85} fill={color} />}
        </g>
      ))}
    </g>
  );
};

// A puddle on a floor: an ellipse that spreads, with a few beads beside it.
export const Puddle: React.FC<{ cx: number; cy: number; t: number; color: string; rx: number; ry?: number; seed?: number }> = ({ cx, cy, t, color, rx, ry = 0.14, seed = 2 }) => {
  const e = ease(t);
  const beads = [0, 1, 2, 3, 4].map((i) => {
    const r = Math.abs((Math.sin(seed * 31.7 + i * 17.3) * 1000) % 1);
    const side = i % 2 ? 1 : -1;
    return { x: cx + side * rx * (0.55 + r * 0.6) * e, y: cy - 4 + r * 10, r: 3 + r * 5, show: ease((t - 0.35 - i * 0.08) / 0.4) };
  });
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx * e} ry={rx * ry * (0.6 + 0.4 * e)} fill={color} />
      {beads.map((b, i) => b.show > 0 && <circle key={i} cx={b.x} cy={b.y} r={b.r * b.show} fill={color} />)}
    </g>
  );
};

// The melt. A pill (the number's home) sinks and stretches down into drips
// and a puddle. t 0: the pill. t 1: only the puddle, the pill gone.
export const MeltPill: React.FC<{
  w: number; h: number; t: number; color: string; floor: number; width?: number; height?: number; children?: React.ReactNode;
}> = ({ w, h, t, color, floor, width = 1080, height = 900, children }) => {
  const sink = ease(interpolate(t, [0, 0.75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const fade = ease(interpolate(t, [0.55, 0.95], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const cx = width / 2;
  const top = height * 0.18;
  // The pill drops a little, squashes to the bottom, and widens.
  const pillH = h * (1 - 0.72 * sink);
  const pillW = w * (1 + 0.22 * sink);
  const pillY = top + (h - pillH) + sink * 70;
  const dripT = interpolate(t, [0.12, 0.85], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const puddleT = interpolate(t, [0.3, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <GooDefs id="meltgoo" blur={9} />
      <g filter="url(#meltgoo)">
        <g opacity={fade}>
          <rect x={cx - pillW / 2} y={pillY} width={pillW} height={pillH} rx={Math.min(pillH / 2, h / 2)} fill={color} />
        </g>
        <g opacity={fade}>
          <Drips x={cx - pillW / 2 + 30} y={pillY + pillH - 8} width={pillW - 60} t={dripT} color={color} count={5} maxLen={floor - (pillY + pillH)} floorY={floor} seed={3} thin={1.5} />
        </g>
        <Puddle cx={cx} cy={floor} t={puddleT} color={color} rx={w * 0.68} ry={0.17} seed={5} />
      </g>
      <foreignObject x={cx - pillW / 2} y={pillY} width={pillW} height={pillH} style={{ opacity: fade, overflow: 'visible' }}>
        <div style={{ width: pillW, height: pillH, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scaleY(${pillH / h})`, transformOrigin: '50% 50%' }}>{children}</div>
      </foreignObject>
    </svg>
  );
};

// A pill with bites out of it. Each bite is a circle cut from the pill at a
// point on its edge; `bites[i]` is how far that bite has landed, 0 to 1.
export type BiteSpot = { x: number; y: number; r: number }; // x,y as fractions of the pill box; r in px
export const BittenPill: React.FC<{ w: number; h: number; color: string; spots: BiteSpot[]; bites: number[]; children?: React.ReactNode; style?: React.CSSProperties }> = ({
  w, h, color, spots, bites, children, style,
}) => {
  const id = React.useMemo(() => `bite${Math.round(Math.random() * 1e6)}`, []);
  return (
    <div style={{ position: 'relative', width: w, height: h, ...style }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <mask id={id}>
            <rect x={-50} y={-50} width={w + 100} height={h + 100} fill="white" />
            {spots.map((s, i) => {
              const p = bites[i] ?? 0;
              if (p <= 0) return null;
              // Two overlapping circles make a ragged bite, like teeth.
              return (
                <g key={i}>
                  <circle cx={s.x * w} cy={s.y * h} r={s.r * Math.min(1.08, p)} fill="black" />
                  <circle cx={s.x * w + (s.x < 0.5 ? -1 : 1) * s.r * 0.45} cy={s.y * h + (s.y < 0.5 ? -1 : 1) * s.r * 0.35} r={s.r * 0.5 * Math.min(1.08, p)} fill="black" />
                </g>
              );
            })}
          </mask>
        </defs>
        <rect x={0} y={0} width={w} height={h} rx={h / 2} fill={color} mask={`url(#${id})`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
};
