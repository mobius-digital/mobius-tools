// The mix: the voice on top, a handful of sounds, a music bed ducked under
// the voice. Everything is a file in public/ (vo/ from scripts/voice.py,
// sfx/ from scripts/make-sfx.mjs), played with Remotion's Audio.
import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';
import type { Timeline } from './timeline';

export const VOICE_GAIN = 1.0;
export const BED_GAIN = 0.16;
export const DUCK_TO = 0.38; // the bed drops to this share of itself under speech

// Every spoken line, placed where the timeline puts it.
export const Voice: React.FC<{ tl: Timeline; ids: string[] }> = ({ tl, ids }) => (
  <>
    {ids.map((id) => (
      <Sequence key={id} from={tl.at(id)} durationInFrames={tl.len(id) + 6} name={`vo ${id}`}>
        <Audio src={staticFile(tl.file(id))} volume={VOICE_GAIN} />
      </Sequence>
    ))}
  </>
);

// A sound at a frame. `name` is a file in public/sfx without the extension.
export const Sfx: React.FC<{ name: string; at: number; volume?: number; rate?: number }> = ({ name, at, volume = 0.6, rate = 1 }) => (
  <Sequence from={at} name={`sfx ${name}`}>
    <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} playbackRate={rate} />
  </Sequence>
);

// The bed, ducked under every speech window with a short ramp either side,
// and faded out over the last second and a half.
export const Bed: React.FC<{ name: string; tl: Timeline; gain?: number; from?: number }> = ({ name, tl, gain = BED_GAIN, from = 0 }) => {
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
