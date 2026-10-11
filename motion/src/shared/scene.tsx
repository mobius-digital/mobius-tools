// What both spots share: the colour field that changes under the beats, the
// box every scene is laid out in (1080 by 1920 design px, scaled down a step
// in landscape), the caption line, and the slow camera.
import React from 'react';
import { AbsoluteFill, interpolateColors, useCurrentFrame, useVideoConfig } from 'remotion';
import { sansStack, serifStack } from '../lib/fonts';
import { useStage } from '../lib/stage';

// The field: a list of [frame, colour] stops; the colour eases between them over `fade` frames.
export const Field: React.FC<{ stops: [number, string][]; fade?: number; children?: React.ReactNode }> = ({ stops, fade = 14, children }) => {
  const f = useCurrentFrame();
  let colour = stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [at, c] = stops[i];
    if (f >= at - fade) {
      const p = Math.min(1, Math.max(0, (f - (at - fade)) / fade));
      colour = interpolateColors(p, [0, 1], [colour, c]);
    }
  }
  return (
    <AbsoluteFill style={{ background: colour, fontFamily: sansStack, fontFeatureSettings: '"tnum" 1, "cv11" 1', overflow: 'hidden' }}>
      {children}
    </AbsoluteFill>
  );
};

export const SCENE_W = 1080;
export const SCENE_H = 1920;

// A scene box: 1080 by 1920 design px. Portrait fills the frame; landscape
// centres the box and scales it to the frame's height. Children position
// themselves absolutely inside it.
export const SceneBox: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; opacity?: number }> = ({ children, style, opacity = 1 }) => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  // In landscape the beats live between y 260 and 1760 of the box, so that band fills the frame's height.
  const k = portrait ? width / SCENE_W : height / 1500;
  const shift = portrait ? 0 : (1010 - SCENE_H / 2) * k;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: `calc(50% - ${shift}px)`,
        width: SCENE_W,
        height: SCENE_H,
        transform: `translate(-50%, -50%) scale(${k})`,
        opacity,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// A line of copy; *word* is the serif italic accent.
export const Words: React.FC<{ text: string; size?: number; color: string; weight?: number; accentColor?: string; style?: React.CSSProperties; align?: 'center' | 'left' }> = ({
  text, size = 54, color, weight = 650, accentColor, style, align = 'center',
}) => {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <div style={{ fontSize: size, fontWeight: weight, letterSpacing: '-0.022em', lineHeight: 1.15, color, textAlign: align, textWrap: 'balance', ...style }}>
      {parts.map((p, i) =>
        p.startsWith('*') ? (
          <span key={i} style={{ fontFamily: serifStack, fontStyle: 'italic', fontWeight: 400, fontSize: '1.08em', letterSpacing: 0, color: accentColor ?? color }}>{p.slice(1, -1)}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </div>
  );
};

// A caption pinned at a y in the scene box, rising in on `p` and leaving on `out`.
export const Caption: React.FC<{ text: string; y: number; p: number; out?: number; color: string; accentColor?: string; size?: number; width?: number }> = ({
  text, y, p, out = 1, color, accentColor, size = 54, width = 900,
}) => (
  <div style={{ position: 'absolute', left: (SCENE_W - width) / 2, top: y, width, opacity: Math.min(1, p * 1.4) * out, transform: `translateY(${(1 - p) * 28}px)` }}>
    <Words text={text} size={size} color={color} accentColor={accentColor} />
  </div>
);

// A big figure: tabular, tight.
export const Big: React.FC<{ text: string; size?: number; color: string; style?: React.CSSProperties; weight?: number }> = ({ text, size = 170, color, style, weight = 700 }) => (
  <div style={{ fontSize: size, fontWeight: weight, letterSpacing: '-0.045em', lineHeight: 1, color, fontVariantNumeric: 'tabular-nums', ...style }}>{text}</div>
);

// The slow camera: scale about a point, from a spring value 0..1.
export const Camera: React.FC<{ p: number; zoom?: number; cx?: number; cy?: number; children: React.ReactNode }> = ({ p, zoom = 1.1, cx = SCENE_W / 2, cy = SCENE_H / 2, children }) => (
  <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + (zoom - 1) * p})`, transformOrigin: `${cx}px ${cy}px` }}>{children}</div>
);

export const usePortrait = () => useStage().portrait;
