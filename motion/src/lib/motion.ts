// Spring presets and small helpers. Every motion in the spots goes through
// spring(); nothing is linear. Each preset is named for how it feels.
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { SpringConfig } from 'remotion';

export const feel: Record<string, Partial<SpringConfig>> = {
  pop: { damping: 12, stiffness: 170, mass: 0.7 }, // an entrance with a bounce
  settle: { damping: 20, stiffness: 120, mass: 1 }, // calm, no overshoot to speak of
  snap: { damping: 22, stiffness: 320, mass: 0.6 }, // quick, for a tap or a count
  heavy: { damping: 16, stiffness: 70, mass: 1.8 }, // slow and weighty, the melt
  wobble: { damping: 8, stiffness: 140, mass: 0.9 }, // a shove, an argument
  soft: { damping: 26, stiffness: 90, mass: 1 }, // a fade or a drift
};

// A spring that starts at `delay` frames into the current sequence.
export const useSpring = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (delay: number, config: Partial<SpringConfig> = feel.pop, durationInFrames?: number) =>
    spring({ frame, fps, delay, config, durationInFrames });
};

// 0 to 1 and back: a nudge that returns home. `hold` is frames at the peak.
export const useBump = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (delay: number, hold = 6, config: Partial<SpringConfig> = feel.snap) => {
    const up = spring({ frame, fps, delay, config });
    const down = spring({ frame, fps, delay: delay + hold, config: feel.settle });
    return up - down;
  };
};

// Fade a sequence out over its last `len` frames. Pass the sequence length.
export const useExit = (durationInFrames: number, len = 10) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [durationInFrames - len, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

// Rise in: opacity and a lift from `dy` to 0, driven by one spring.
export const rise = (p: number, dy = 40) => ({
  opacity: Math.min(1, p * 1.4),
  transform: `translateY(${(1 - p) * dy}px)`,
});

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
