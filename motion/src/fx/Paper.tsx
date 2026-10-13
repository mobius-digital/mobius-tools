// Life for the paper scenes, so the pain beats are not quieter than the colour
// fields: a soft radial light, faint fragments of app UI drifting behind the
// main card at three depths, a fine grain, and the bits a bite throws off.
import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';

// The backdrop. Put it under the scenes for the frames the field is paper;
// `from` and `to` are the Field stops that turn paper on and off, so it fades
// with the field (which eases over the 14 frames before each stop).
export const PaperLife: React.FC<{ from: number; to: number; accent: string; seed?: string }> = ({ from, to, accent, seed = 'p' }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (f < from - 14 || f > to + 14) return null;
  const op = interpolate(f, [from - 14, from, to - 16, to - 4], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const t = f - from;
  const frags = Array.from({ length: 16 }, (_, i) => {
    const depth = i % 3; // 0 far, 2 near
    const k = [0.45, 0.7, 1][depth];
    const x0 = random(`${seed}x${i}`) * (width + 200) - 100;
    const y0 = random(`${seed}y${i}`) * (height + 200) - 100;
    const drift = 0.25 + depth * 0.35;
    return {
      i,
      depth,
      x: x0 + Math.sin(t / 70 + i) * 18 * k,
      y: ((y0 - t * drift + height + 400) % (height + 400)) - 200,
      rot: (random(`${seed}r${i}`) - 0.5) * 16,
      w: (150 + random(`${seed}w${i}`) * 150) * k * (height / 1920 + width / 1920) * 0.9,
      kind: i % 4,
      k,
    };
  });
  return (
    <AbsoluteFill style={{ opacity: op, pointerEvents: 'none' }}>
      {/* the light: brighter in the middle, the edges falling off warm */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 44%, rgba(255,255,255,.95) 0%, rgba(255,255,255,.4) 45%, rgba(214,208,192,.0) 70%), radial-gradient(ellipse 120% 90% at 50% 50%, rgba(0,0,0,0) 55%, rgba(120,110,90,.16) 100%)' }} />
      {frags.map((g) => (
        <div
          key={g.i}
          style={{
            position: 'absolute',
            left: g.x,
            top: g.y,
            width: g.w,
            transform: `rotate(${g.rot}deg)`,
            opacity: [0.32, 0.42, 0.55][g.depth],
            filter: g.depth === 0 ? 'blur(3px)' : g.depth === 1 ? 'blur(1.2px)' : undefined,
          }}
        >
          <Fragment kind={g.kind} w={g.w} accent={accent} seed={`${seed}${g.i}`} />
        </div>
      ))}
      <Grain />
    </AbsoluteFill>
  );
};

// One faint piece of an app: a tile with a line, a row of bars, a chip, a row.
const Fragment: React.FC<{ kind: number; w: number; accent: string; seed: string }> = ({ kind, w, accent, seed }) => {
  const card: React.CSSProperties = { background: 'rgba(255,255,255,.9)', borderRadius: w * 0.08, boxShadow: '0 10px 30px rgba(40,30,10,.10)', padding: w * 0.08, boxSizing: 'border-box' };
  const bar = (wd: number, c = 'rgba(17,17,20,.14)') => <div style={{ height: w * 0.045, width: `${wd}%`, borderRadius: 99, background: c, marginBottom: w * 0.04 }} />;
  if (kind === 0)
    return (
      <div style={card}>
        {bar(40)}
        <svg viewBox="0 0 100 34" width="100%" style={{ display: 'block' }}>
          <path d={`M0 ${26 + random(seed) * 6} C20 ${18 + random(seed + 'a') * 10} 40 ${22} 55 ${14 + random(seed + 'b') * 8} S85 6 100 ${4 + random(seed + 'c') * 8}`} fill="none" stroke={accent} strokeWidth={2.4} strokeLinecap="round" opacity={0.7} />
        </svg>
      </div>
    );
  if (kind === 1)
    return (
      <div style={{ ...card, display: 'flex', alignItems: 'flex-end', gap: w * 0.04, height: w * 0.6 }}>
        {[0.5, 0.7, 0.45, 0.85, 0.6, 0.95].map((h, i) => <div key={i} style={{ flex: 1, height: `${h * (0.7 + random(seed + i) * 0.3) * 100}%`, background: accent, opacity: 0.35, borderRadius: 3 }} />)}
      </div>
    );
  if (kind === 2)
    return <div style={{ display: 'inline-block', padding: `${w * 0.05}px ${w * 0.1}px`, borderRadius: 99, background: accent, opacity: 0.35, color: '#fff', fontWeight: 700, fontSize: w * 0.13 }}>${Math.round(100 + random(seed) * 900)}</div>;
  return (
    <div style={card}>
      {bar(70)}
      {bar(50)}
      {bar(62, accent)}
    </div>
  );
};

// A fine grain, shifted every two frames so it lives.
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.09 }) => {
  const f = useCurrentFrame();
  const step = Math.floor(f / 2);
  const dx = Math.floor(random(`gx${step}`) * 120);
  const dy = Math.floor(random(`gy${step}`) * 120);
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: 'multiply', overflow: 'hidden' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', left: -dx, top: -dy, width: 'calc(100% + 120px)', height: 'calc(100% + 120px)' }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.28  0 0 0 0 0.24  0 0 0 1.2 -0.1" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

// What a bite throws: chunks of the pill and the digits it took, flung out
// and falling. `t` 0 to 1 over the throw; `digits` is the text it lost.
export const BiteBurst: React.FC<{ t: number; color: string; digits: string; seed?: number; dir?: number }> = ({ t, color, digits, seed = 1, dir = 1 }) => {
  if (t <= 0 || t >= 1) return null;
  const chunks = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (random(`a${seed}${i}`) - 0.5) * Math.PI * 1.3 + dir * 0.4;
    const v = 140 + random(`v${seed}${i}`) * 220;
    return { x: Math.cos(a) * v * t, y: Math.sin(a) * v * t + 520 * t * t, r: 6 + random(`r${seed}${i}`) * 13, spin: (random(`s${seed}${i}`) - 0.5) * 720 * t };
  });
  const glyphs = digits.replace(/[^0-9$,]/g, '').split('');
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
      {chunks.map((c, i) => (
        <div key={i} style={{ position: 'absolute', left: c.x - c.r, top: c.y - c.r, width: c.r * 2, height: c.r * 1.6, borderRadius: '45% 55% 40% 60%', background: color, opacity: 1 - t * t, transform: `rotate(${c.spin}deg)`, boxShadow: 'inset -2px -3px 0 rgba(0,0,0,.18)' }} />
      ))}
      {glyphs.map((g, i) => {
        const a = -Math.PI / 2 + (i - glyphs.length / 2) * 0.32 + dir * 0.5;
        const v = 260 + random(`d${seed}${i}`) * 120;
        const x = Math.cos(a) * v * t;
        const y = Math.sin(a) * v * t + 700 * t * t;
        return (
          <div key={`g${i}`} style={{ position: 'absolute', left: x - 20, top: y - 34, fontSize: 64, fontWeight: 800, color, opacity: 1 - t, transform: `rotate(${(random(`gr${seed}${i}`) - 0.5) * 540 * t}deg)`, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
            {g}
          </div>
        );
      })}
    </div>
  );
};
