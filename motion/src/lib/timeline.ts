// The picture follows the voice. Each spot lists its spoken lines in order
// with the silence before each one; the lengths come from public/vo/manifest.json
// (written by scripts/voice.py), so re-voicing a line moves every beat after it.
import manifest from '../../public/vo/manifest.json';
import { fps } from '../../brand';

type Entry = { file: string; seconds: number; text: string };
const lines = manifest as Record<string, Entry>;

export type Cue = {
  id: string; // the line id in vo.json
  gap: number; // seconds of silence before this line starts
  hold?: number; // seconds the picture keeps after the line ends before the next cue may start (added to gap of the next)
};

export type Timeline = {
  at: (id: string) => number; // first frame of the line
  end: (id: string) => number; // last frame of the line (speech ends)
  len: (id: string) => number; // frames of speech
  text: (id: string) => string;
  file: (id: string) => string;
  total: number; // frames in the spot
  windows: [number, number][]; // speech windows, for ducking the music
};

export const voSeconds = (spot: string, id: string) => lines[`${spot}-${id}`]?.seconds ?? 0;

export const buildTimeline = (spot: 'cashew' | 'locus', cues: Cue[], tail: number): Timeline => {
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  const windows: [number, number][] = [];
  let t = 0;
  let carry = 0;
  for (const c of cues) {
    const key = `${spot}-${c.id}`;
    const e = lines[key];
    if (!e) throw new Error(`No voice for ${key}. Run: python3 scripts/voice.py`);
    t += c.gap + carry;
    const s = Math.round(t * fps);
    const n = Math.round(e.seconds * fps);
    starts.set(c.id, s);
    ends.set(c.id, s + n);
    windows.push([s, s + n]);
    t += e.seconds;
    carry = c.hold ?? 0;
  }
  const total = Math.round((t + carry + tail) * fps);
  const get = (m: Map<string, number>, id: string) => {
    const v = m.get(id);
    if (v === undefined) throw new Error(`No cue ${id} in the ${spot} timeline`);
    return v;
  };
  return {
    at: (id) => get(starts, id),
    end: (id) => get(ends, id),
    len: (id) => get(ends, id) - get(starts, id),
    text: (id) => lines[`${spot}-${id}`].text,
    file: (id) => lines[`${spot}-${id}`].file,
    total,
    windows,
  };
};
