// The mix: the voice on top, a handful of sounds, a music bed ducked under
// the voice. Everything is a file in public/ (vo/ from scripts/voice.py,
// sfx/ from scripts/make-sfx.mjs), played with Remotion's Audio.
import React from 'react';
import { Audio, Sequence, getInputProps, interpolate, staticFile } from 'remotion';
import type { Timeline } from './timeline';

// For measuring the mix: render with inputProps {stem: 'voice' | 'bed' | 'sfx'}
// and only that part plays (scripts/mix.mjs).
const stem = (getInputProps() as { stem?: string }).stem;
const plays = (part: string) => !stem || stem === part;

export const VOICE_GAIN = 1.0;
// Set from scripts/mix.mjs: the bed files sit near -17 LUFS, so 0.76 puts the bed
// near -18 LUFS between lines once render.mjs brings the spot to -16, and the
// duck to 0.5 (6 dB) puts it near -24 under the voice.
export const BED_GAIN = 0.76;
export const DUCK_TO = 0.5; // the bed drops to this share of itself under speech

// Every spoken line, placed where the timeline puts it.
export const Voice: React.FC<{ tl: Timeline; ids: string[] }> = ({ tl, ids }) => !plays('voice') ? null : (
  <>
    {ids.map((id) => (
      <Sequence key={id} from={tl.at(id)} durationInFrames={tl.len(id) + 6} name={`vo ${id}`}>
        <Audio src={staticFile(tl.file(id))} volume={VOICE_GAIN} />
      </Sequence>
    ))}
  </>
);

// A sound at a frame. `name` is a file in public/sfx without the extension.
export const Sfx: React.FC<{ name: string; at: number; volume?: number; rate?: number }> = ({ name, at, volume = 0.6, rate = 1 }) => !plays('sfx') ? null : (
  <Sequence from={at} name={`sfx ${name}`}>
    <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} playbackRate={rate} />
  </Sequence>
);

// The bed, ducked under every speech window with a short ramp either side,
// and faded out over the last second and a half.
export const Bed: React.FC<{ name: string; tl: Timeline; gain?: number; from?: number }> = ({ name, tl, gain = BED_GAIN, from = 0 }) => {
  if (!plays('bed')) return null;
  const ramp = 9;
  const volume = (f: number) => {
    const frame = f + from;
    let duck = 0;
    for (const [s, e] of tl.windows) {
      const a = interpolate(frame, [s - ramp, s], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const b = interpolate(frame, [e, e + ramp * 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      duck = Math.max(duck, Math.min(a, b));
    }
    const out = interpolate(frame, [tl.total - 45, tl.total - 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const fadeIn = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return gain * (1 - duck * (1 - DUCK_TO)) * out * fadeIn;
  };
  return (
    <Sequence from={from} name="bed">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
};
