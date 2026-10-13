// Synthesize every sound the spots use, no network and no library: sine,
// noise and envelopes written straight to 48 kHz 16-bit WAV files in
// public/sfx/. Run `node scripts/make-sfx.mjs` after changing anything here.
//
//   pop.wav      a bite lands
//   whoosh.wav   the number melts
//   tick.wav     a tap, a calendar flip, a checklist tick
//   chime.wav    "Booked." and "Paused."
//   riser.wav    into the product reveal
//   drip.wav     a bar bleeds
//   wake.wav     the character wakes, a card lands
//   sigh.wav     the character deflates
//   hop.wav      the character springs up
//   land.wav     the character lands, squashed
//   bed-cashew.wav, bed-locus.wav   the music beds, 64 s each, quiet
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'sfx');
mkdirSync(out, { recursive: true });

const SR = 48000;
const TAU = Math.PI * 2;

// ---- helpers ---------------------------------------------------------------
const buf = (seconds) => new Float64Array(Math.ceil(seconds * SR));
const clamp = (x) => Math.max(-1, Math.min(1, x));
const exp = (t, k) => Math.exp(-t * k);
// A smooth attack and release around a hold.
const env = (t, a, hold, r) => (t < a ? t / a : t < a + hold ? 1 : Math.max(0, 1 - (t - a - hold) / r));
// Deterministic noise, so a re-run writes the same files.
let seed = 7;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};
// One-pole low pass with a cutoff that may move per sample.
const lowpass = (xs, cutoffAt) => {
  const ys = new Float64Array(xs.length);
  let y = 0;
  for (let i = 0; i < xs.length; i++) {
    const fc = cutoffAt(i / SR);
    const a = 1 - Math.exp((-TAU * fc) / SR);
    y += a * (xs[i] - y);
    ys[i] = y;
  }
  return ys;
};
const highpass = (xs, fc) => {
  const ys = new Float64Array(xs.length);
  const a = 1 - Math.exp((-TAU * fc) / SR);
  let lp = 0;
  for (let i = 0; i < xs.length; i++) {
    lp += a * (xs[i] - lp);
    ys[i] = xs[i] - lp;
  }
  return ys;
};
const normalize = (xs, peak = 0.9) => {
  let m = 0;
  for (const x of xs) m = Math.max(m, Math.abs(x));
  const g = m > 0 ? peak / m : 1;
  return xs.map((x) => x * g);
};
const mix = (...parts) => {
  const n = Math.max(...parts.map((p) => p.length));
  const o = new Float64Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) o[i] += p[i];
  return o;
};
const wav = (name, mono, peak = 0.9) => {
  const xs = normalize(mono, peak);
  const n = xs.length;
  const bytes = Buffer.alloc(44 + n * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + n * 2, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SR, 24);
  bytes.writeUInt32LE(SR * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) bytes.writeInt16LE(Math.round(clamp(xs[i]) * 32767), 44 + i * 2);
  writeFileSync(join(out, name), bytes);
  console.log(`${name}  ${(n / SR).toFixed(2)}s`);
};

// ---- the effects -----------------------------------------------------------
// A bite: a short pitch drop with a soft click at the front, like a cork.
const pop = () => {
  const b = buf(0.22);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const f = 520 * Math.exp(-t * 18) + 140;
    ph += (TAU * f) / SR;
    b[i] = Math.sin(ph) * exp(t, 22) * 0.9 + rnd() * exp(t, 160) * 0.5;
  }
  return b;
};
// The melt: a band of noise sliding down with a slow swell and a long tail.
const whoosh = () => {
  const n = buf(1.6);
  for (let i = 0; i < n.length; i++) n[i] = rnd();
  const lp = lowpass(n, (t) => 2400 * Math.exp(-t * 2.2) + 120);
  const hp = highpass(lp, 60);
  const o = buf(1.6);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] = hp[i] * env(t, 0.35, 0.3, 0.95);
  }
  return o;
};
// A tap or a tick: a tiny noise burst and a short high sine.
const tick = () => {
  const b = buf(0.08);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    b[i] = rnd() * exp(t, 220) * 0.7 + Math.sin(TAU * 1900 * t) * exp(t, 140) * 0.5;
  }
  return lowpass(b, () => 6000);
};
// A small chime: two partials a fifth apart with a slow decay and a touch of detune.
const chime = (f0 = 880) => {
  const b = buf(1.3);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    b[i] =
      Math.sin(TAU * f0 * t) * exp(t, 3.2) * 0.6 +
      Math.sin(TAU * f0 * 1.5 * t + 0.3) * exp(t, 4.5) * 0.35 +
      Math.sin(TAU * f0 * 2.01 * t) * exp(t, 7) * 0.18 +
      Math.sin(TAU * (f0 * 1.003) * t) * exp(t, 3.4) * 0.25;
    b[i] *= Math.min(1, t / 0.004);
  }
  return b;
};
// The riser: filtered noise and a rising tone that grows for 1.8 s, then a soft landing.
const riser = () => {
  const len = 2.2;
  const n = buf(len);
  for (let i = 0; i < n.length; i++) n[i] = rnd();
  const lp = lowpass(n, (t) => 300 + 2600 * Math.min(1, t / 1.8) ** 2);
  const o = buf(len);
  let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    const up = Math.min(1, t / 1.8);
    const f = 110 * Math.pow(2, up * 2.2);
    ph += (TAU * f) / SR;
    const tone = (Math.sin(ph) + 0.4 * Math.sin(ph * 2)) * 0.5;
    const land = t > 1.8 ? Math.sin(TAU * 70 * (t - 1.8)) * exp(t - 1.8, 9) * 0.8 : 0;
    o[i] = (lp[i] * 0.6 + tone * 0.4) * (up ** 1.6) * (t < 1.8 ? 1 : Math.max(0, 1 - (t - 1.8) / 0.4)) + land;
  }
  return o;
};
// A drip: a plink that falls.
const drip = () => {
  const b = buf(0.3);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const f = 900 * Math.exp(-t * 9) + 260;
    ph += (TAU * f) / SR;
    b[i] = Math.sin(ph) * exp(t, 14) * Math.min(1, t / 0.003);
  }
  return b;
};
// Waking: a soft bell that bends up.
const wake = () => {
  const b = buf(0.9);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const f = 520 + 180 * Math.min(1, t / 0.25);
    ph += (TAU * f) / SR;
    b[i] = (Math.sin(ph) + 0.3 * Math.sin(ph * 2.02)) * env(t, 0.03, 0.15, 0.7) * 0.8;
  }
  return b;
};

// A sigh: breath noise through a band that falls, a slow swell and a long let go.
const sigh = () => {
  const len = 1.4;
  const n = buf(len);
  for (let i = 0; i < n.length; i++) n[i] = rnd();
  const band = highpass(lowpass(n, (t) => 1500 * Math.exp(-t * 1.4) + 350), 180);
  const o = buf(len);
  let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    const f = 210 * Math.exp(-t * 0.6);
    ph += (TAU * f) / SR;
    o[i] = (band[i] * 0.9 + Math.sin(ph) * 0.08) * env(t, 0.18, 0.2, 1.0);
  }
  return o;
};
// A hop: a quick rising sine with a rubbery wobble.
const hop = () => {
  const b = buf(0.32);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const f = 240 + 520 * (1 - Math.exp(-t * 16)) + 30 * Math.sin(TAU * 22 * t);
    ph += (TAU * f) / SR;
    b[i] = Math.sin(ph) * exp(t, 11) * Math.min(1, t / 0.004);
  }
  return b;
};
// A landing: a soft low thud and a little squish of noise.
const land = () => {
  const b = buf(0.3);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const f = 150 * Math.exp(-t * 12) + 55;
    ph += (TAU * f) / SR;
    b[i] = Math.sin(ph) * exp(t, 14) + rnd() * exp(t, 60) * 0.25;
  }
  return lowpass(b, () => 1800);
};

// ---- the music beds --------------------------------------------------------
// A slow pad on four chords, a quiet pulse on the beat, low passed so it sits
// under a voice. Each bed is 64 s; the spot fades it out before the end.
const bed = (rootHz, minor, pulseHz) => {
  const len = 64;
  const o = buf(len);
  const bar = 4.8; // seconds per chord
  // Degrees of the progression, in semitones from the root: I, vi, IV, V (major) or i, VI, III, VII (minor).
  const prog = minor ? [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]] : [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];
  const hz = (semi) => rootHz * Math.pow(2, semi / 12);
  const phases = new Map();
  const osc = (key, f, i) => {
    const p = (phases.get(key) ?? 0) + (TAU * f) / SR;
    phases.set(key, p);
    return Math.sin(p);
  };
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    const ci = Math.floor(t / bar) % prog.length;
    const into = (t % bar) / bar;
    // Cross fade between the chord and the next so nothing clicks.
    const xf = into > 0.85 ? (into - 0.85) / 0.15 : 0;
    const chordA = prog[ci];
    const chordB = prog[(ci + 1) % prog.length];
    let s = 0;
    const voice = (chord, tag, g) => {
      chord.forEach((semi, k) => {
        const f = hz(semi) / 2;
        s += osc(`${tag}${k}a`, f, i) * 0.5 * g;
        s += osc(`${tag}${k}b`, f * 1.004, i) * 0.3 * g;
        s += osc(`${tag}${k}c`, f * 2, i) * 0.12 * g;
      });
      s += osc(`${tag}bass`, hz(chord[0]) / 4, i) * 0.55 * g;
    };
    voice(chordA, `a${ci}`, 1 - xf);
    voice(chordB, `b${ci}`, xf);
    // The pulse: a muted tap on every beat, a little louder on the one.
    const beat = 60 / pulseHz;
    const tb = t % beat;
    const onOne = Math.floor(t / beat) % 4 === 0;
    const pulse = Math.sin(TAU * hz(0) * 0.5 * tb) * exp(tb, 18) * (onOne ? 0.22 : 0.12);
    // A slow breath over the whole bed.
    const breath = 0.78 + 0.22 * Math.sin((TAU * t) / 13);
    o[i] = (s * 0.11 + pulse) * breath;
  }
  const lp = lowpass(o, (t) => 900 + 500 * Math.sin((TAU * t) / 19));
  // Fade in over the first second.
  for (let i = 0; i < SR; i++) lp[i] *= i / SR;
  return lp;
};

wav('pop.wav', pop(), 0.8);
wav('whoosh.wav', whoosh(), 0.7);
wav('tick.wav', tick(), 0.6);
wav('chime.wav', chime(880), 0.6);
wav('chime-low.wav', chime(660), 0.6);
wav('riser.wav', riser(), 0.75);
wav('drip.wav', drip(), 0.55);
wav('wake.wav', wake(), 0.6);
wav('sigh.wav', sigh(), 0.6);
wav('hop.wav', hop(), 0.55);
wav('land.wav', land(), 0.8);
// The beds are written near full scale; their level is set in src/lib/audio.tsx
// from a loudness measurement (scripts/mix.mjs), not here.
wav('bed-cashew.wav', bed(174.61, false, 72), 0.95); // F major, warm
wav('bed-locus.wav', bed(146.83, true, 78), 0.95); // D minor, awake
