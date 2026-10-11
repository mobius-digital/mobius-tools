// The stage: one background, one ink, the fonts. Everything in a spot sits
// inside a Stage. Fit scales the stacked content down a step in landscape so
// a column built for 1080x1920 still fits in 1920x1080.
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { colours } from '../../brand';
import { sansStack, serifStack } from './fonts';

export const useStage = () => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const k = portrait ? 1 : 0.8;
  return { w: width, h: height, portrait, k, dw: width / k, dh: height / k };
};

export const Stage: React.FC<{
  bg?: string;
  ink?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ bg = colours.paper, ink = colours.ink, children, style }) => (
  <AbsoluteFill
    style={{
      background: bg,
      color: ink,
      fontFamily: sansStack,
      fontFeatureSettings: '"tnum" 1, "cv11" 1',
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </AbsoluteFill>
);

// A design-pixel canvas: 1080 wide in portrait, 2400 by 1350 in landscape.
export const Fit: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const { k, dw, dh } = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: dw,
        height: dh,
        transform: `translate(-50%, -50%) scale(${k})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// A centred column with a gap, the usual scene layout.
export const Column: React.FC<{ gap?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  gap = 28,
  children,
  style,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap,
      textAlign: 'center',
      padding: '0 72px',
      ...style,
    }}
  >
    {children}
  </div>
);

// A line of copy. Wrap one word in *asterisks* for the accent: the serif
// italic, 8% larger, the same colour as the line (logo/kit.css section 4).
export const Line: React.FC<{
  text: string;
  size?: number;
  weight?: number;
  color?: string;
  accentColor?: string;
  style?: React.CSSProperties;
}> = ({ text, size = 64, weight = 650, color, accentColor, style }) => {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: weight,
        letterSpacing: '-0.02em',
        lineHeight: 1.12,
        color,
        textWrap: 'balance',
        ...style,
      }}
    >
      {parts.map((p, i) =>
        p.startsWith('*') ? (
          <span
            key={i}
            style={{
              fontFamily: serifStack,
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.08em',
              letterSpacing: 0,
              color: accentColor ?? color,
            }}
          >
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </div>
  );
};

// A big number, tabular, tight.
export const Figure: React.FC<{ text: string; size?: number; color?: string; style?: React.CSSProperties }> = ({
  text,
  size = 180,
  color,
  style,
}) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 700,
      letterSpacing: '-0.045em',
      lineHeight: 1,
      color,
      fontVariantNumeric: 'tabular-nums',
      ...style,
    }}
  >
    {text}
  </div>
);
