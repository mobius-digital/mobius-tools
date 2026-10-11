#!/usr/bin/env python3
"""Voice every line in vo.json with Kokoro (kokoro-onnx), one WAV per line.

    pip install kokoro-onnx soundfile
    python3 scripts/voice.py              # voices the lines whose text changed
    python3 scripts/voice.py --all        # re-voices everything
    python3 scripts/voice.py locus-11     # one line

The model and the voices come from Hugging Face the first time
(onnx-community/Kokoro-82M-v1.0-ONNX: onnx/model.onnx and voices/<name>.bin)
into ~/.cache/kokoro/; the .bin voices are packed into the voices.npz that
kokoro-onnx wants. Output: public/vo/<spot>-<id>.wav (24 kHz mono) and
public/vo/manifest.json, which the spots read for each line's length.
"""
import hashlib, json, os, sys, time, urllib.request
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT = os.path.join(ROOT, 'public', 'vo')
CACHE = os.path.expanduser('~/.cache/kokoro')
HF = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/'
VOICES = ['af_heart', 'af_bella', 'af_sarah', 'af_nicole', 'am_michael', 'am_adam', 'bm_george']

os.makedirs(OUT, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)


def fetch(name, url):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        print('downloading', url)
        urllib.request.urlretrieve(url, path)
    return path


model = fetch('kokoro-v1.0.onnx', HF + 'onnx/model.onnx')
npz = os.path.join(CACHE, 'voices.npz')
if not os.path.exists(npz):
    packed = {}
    for v in VOICES:
        p = fetch(v + '.bin', HF + f'voices/{v}.bin')
        packed[v] = np.fromfile(p, dtype=np.float32).reshape(-1, 1, 256)
    np.savez(npz, **packed)

from kokoro_onnx import Kokoro  # noqa: E402

spec = json.load(open(os.path.join(ROOT, 'vo.json')))
voice, speed = spec['voice'], float(spec.get('speed', 1.0))
mpath = os.path.join(OUT, 'manifest.json')
manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
args = [a for a in sys.argv[1:] if not a.startswith('--')]
force = '--all' in sys.argv

k = Kokoro(model, npz)
for spot in ('cashew', 'locus'):
    for line in spec[spot]:
        key = f"{spot}-{line['id']}"
        if args and key not in args:
            continue
        text = line['text']
        if '\u2014' in text or '\u2013' in text:
            sys.exit(f'{key}: no dashes in the script, write it as two sentences')
        digest = hashlib.sha1(f'{voice}|{speed}|{text}'.encode()).hexdigest()[:12]
        wav = os.path.join(OUT, key + '.wav')
        if not force and manifest.get(key, {}).get('hash') == digest and os.path.exists(wav):
            continue
        t0 = time.time()
        audio, sr = k.create(text, voice=voice, speed=speed, lang='en-us')
        # A touch of room at the head so the first word is never clipped by a cut.
        pad = np.zeros(int(sr * 0.06), dtype=audio.dtype)
        audio = np.concatenate([pad, audio])
        peak = float(np.abs(audio).max()) or 1.0
        audio = audio * (0.89 / peak)
        sf.write(wav, audio, sr, subtype='PCM_16')
        manifest[key] = {'file': f'vo/{key}.wav', 'seconds': round(len(audio) / sr, 3), 'text': text, 'hash': digest}
        print(f'{key}  {len(audio) / sr:5.2f}s  {time.time() - t0:4.1f}s  {text}')
json.dump(manifest, open(mpath, 'w'), indent=1)
total = {s: round(sum(v['seconds'] for k2, v in manifest.items() if k2.startswith(s)), 1) for s in ('cashew', 'locus')}
print('spoken seconds per spot:', total)
