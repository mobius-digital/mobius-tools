// Small drawn things both spots share: a phone, a card, a tap, a circle
// drawn around a number, crumbs from a bite.
import React from 'react';
import { colours } from '../../brand';

// A phone frame in design pixels. The screen is a column; children go in it.
export const Phone: React.FC<{
  width?: number;
  height?: number;
  screen?: string;
  frame?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ width = 440, height = 900, screen = '#FFFFFF', frame = colours.ink, children, style }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 64,
      background: frame,
      padding: 16,
      boxSizing: 'border-box',
      position: 'relative',
      flex: 'none',
      ...style,
    }}
  >
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 50,
        background: screen,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
    <div
      style={{
        position: 'absolute',
        top: 30,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 120,
        height: 34,
        borderRadius: 17,
        background: frame,
      }}
    />
  </div>
);

// A white card on a field or on paper.
export const Card: React.FC<{ width?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  width = 880,
  children,
  style,
}) => (
  <div
    style={{
      width,
      background: '#FFFFFF',
      color: colours.ink,
      borderRadius: 32,
      padding: '36px 40px',
      boxSizing: 'border-box',
      boxShadow: '0 24px 60px rgba(0,0,0,.14)',
      textAlign: 'left',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Button: React.FC<{ label: string; fill: string; ink?: string; pressed?: number; style?: React.CSSProperties }> = ({
  label,
  fill,
  ink = colours.onField,
  pressed = 0,
  style,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      height: 84,
      padding: '0 40px',
      borderRadius: 22,
      background: fill,
      color: ink,
      fontSize: 34,
      fontWeight: 600,
      transform: `scale(${1 - pressed * 0.06})`,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {label}
  </div>
);

// A tap: a ring that grows and fades, with a dot at the centre. `t` 0 to 1.
export const Tap: React.FC<{ t: number; color?: string; size?: number; style?: React.CSSProperties }> = ({
  t,
  color = colours.ink,
  size = 180,
  style,
}) => {
  if (t <= 0 || t >= 1) return null;
  return (
    <div style={{ position: 'absolute', width: size, height: size, pointerEvents: 'none', ...style }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <circle cx="50" cy="50" r={10 + t * 36} fill="none" stroke={color} strokeWidth={4} opacity={1 - t} />
        <circle cx="50" cy="50" r={9 * (1 - t * 0.5)} fill={color} opacity={1 - t * t} />
      </svg>
    </div>
  );
};

// A hand-drawn circle around whatever sits under it, drawn in from `t` 0 to 1.
export const Circled: React.FC<{ t: number; width: number; height: number; color: string; stroke?: number }> = ({
  t,
  width,
  height,
  color,
  stroke = 10,
}) => {
  const w = width + 90;
  const h = height + 70;
  const rx = w / 2 - stroke;
  const ry = h / 2 - stroke;
  // An ellipse that does not quite close, tilted a touch, like a pen.
  const d = `M ${w / 2 + rx * Math.cos(2.4)} ${h / 2 + ry * Math.sin(2.4)} A ${rx} ${ry} 0 1 1 ${
    w / 2 + rx * Math.cos(2.4 + Math.PI * 1.98)
  } ${h / 2 + ry * Math.sin(2.4 + Math.PI * 1.98)}`;
  const len = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%) rotate(-4deg)',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - t)}
      />
    </svg>
  );
};

// Crumbs from a bite: a few dots thrown from a point, settling with gravity.
export const Crumbs: React.FC<{ t: number; color: string; seed?: number }> = ({ t, color, seed = 1 }) => {
  if (t <= 0 || t >= 1) return null;
  const dots = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + seed;
    const v = 90 + ((i * 37 + seed * 11) % 50);
    return {
      x: Math.cos(a) * v * t,
      y: Math.sin(a) * v * t * 0.6 + 260 * t * t,
      r: 7 - i * 0.6,
    };
  });
  return (
    <svg style={{ position: 'absolute', left: -200, top: -200, overflow: 'visible', pointerEvents: 'none' }} width={400} height={400}>
      {dots.map((d, i) => (
        <circle key={i} cx={200 + d.x} cy={200 + d.y} r={d.r} fill={color} opacity={1 - t} />
      ))}
    </svg>
  );
};
