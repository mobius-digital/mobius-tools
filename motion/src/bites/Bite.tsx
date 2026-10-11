// The bites: every cost has a face. Five characters on the brand kit's grid
// (64 units, stroke 5, round caps, currentColor) with two dots for eyes, so
// they belong beside the marks. Rent is a folded bill, the factory a box,
// ads a flame, fees a small purple blob, tax a stamped envelope.
import React from 'react';
import { colours } from '../../brand';

export type Who = 'rent' | 'factory' | 'ads' | 'fees' | 'tax';

const frame = {
  viewBox: '0 0 64 64',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// Two dots for eyes. `squint` closes them a little (the bite moment).
const Eyes: React.FC<{ x1: number; x2: number; y: number; squint?: number; r?: number }> = ({
  x1,
  x2,
  y,
  squint = 0,
  r = 2.4,
}) => {
  const ry = r * (1 - squint * 0.75);
  return (
    <>
      <ellipse cx={x1} cy={y} rx={r} ry={ry} fill="currentColor" stroke="none" />
      <ellipse cx={x2} cy={y} rx={r} ry={ry} fill="currentColor" stroke="none" />
    </>
  );
};

const Rent: React.FC<{ squint: number }> = ({ squint }) => (
  <svg {...frame}>
    <title>Rent, the bill</title>
    <path d="M16 8h22l10 10v38H16z" />
    <path d="M38 8v10h10" />
    <Eyes x1={26} x2={38} y={30} squint={squint} />
    <path d="M25 44h14" strokeWidth={3.5} />
    <path d="M25 50h8" strokeWidth={3.5} />
  </svg>
);

const Factory: React.FC<{ squint: number }> = ({ squint }) => (
  <svg {...frame}>
    <title>The factory, the box</title>
    <path d="M12 26h28v26H12z" />
    <path d="M12 26l10-10h28L40 26" />
    <path d="M40 26l10-10v26L40 52" />
    <Eyes x1={21} x2={31} y={36} squint={squint} />
  </svg>
);

const Ads: React.FC<{ squint: number }> = ({ squint }) => (
  <svg {...frame}>
    <title>Ads, the flame</title>
    <path d="M32 8c6 8 14 14 14 26a14 14 0 0 1-28 0c0-8 6-12 6-18 2 4 4 6 6 6-1-4 0-10 2-14z" />
    <Eyes x1={27} x2={37} y={37} squint={squint} />
  </svg>
);

// The blob is filled, so the eyes are holes, like the Locus dot.
const Fees: React.FC<{ squint: number }> = ({ squint }) => {
  const ry = 2.4 * (1 - squint * 0.75);
  return (
    <svg {...frame}>
      <title>Fees, the blob</title>
      <defs>
        <mask id="bite-fees" fill="#000" stroke="none">
          <rect width="64" height="64" fill="#fff" />
          <ellipse cx={26} cy={31} rx={2.4} ry={ry} fill="#000" />
          <ellipse cx={38} cy={31} rx={2.4} ry={ry} fill="#000" />
        </mask>
      </defs>
      <path
        d="M32 12c12-2 22 8 20 22-2 12-10 18-22 18S10 44 12 32c2-12 10-18 20-20z"
        fill="currentColor"
        stroke="none"
        mask="url(#bite-fees)"
      />
    </svg>
  );
};

const Tax: React.FC<{ squint: number }> = ({ squint }) => (
  <svg {...frame}>
    <title>The tax, the stamped envelope</title>
    <path d="M8 18h48v30H8z" />
    <path d="M8 18l24 18 24-18" />
    <path d="M42 8h12v10" strokeWidth={3.5} />
    <path d="M45 11h6M45 14h4" strokeWidth={2.4} />
    <Eyes x1={26} x2={38} y={41} squint={squint} />
  </svg>
);

const drawings: Record<Who, React.FC<{ squint: number }>> = {
  rent: Rent,
  factory: Factory,
  ads: Ads,
  fees: Fees,
  tax: Tax,
};

export const Bite: React.FC<{
  who: Who;
  size?: number;
  color?: string;
  squint?: number;
  style?: React.CSSProperties;
}> = ({ who, size = 160, color, squint = 0, style }) => {
  const Draw = drawings[who];
  const c = color ?? (who === 'fees' ? colours.blob : 'currentColor');
  return (
    <div style={{ width: size, height: size, color: c, flex: 'none', display: 'block', ...style }}>
      <Draw squint={squint} />
    </div>
  );
};
