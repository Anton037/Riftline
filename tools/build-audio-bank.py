"""Build the short CC0 physical source bank; needs Python 3 and ffmpeg, never at game startup."""
from pathlib import Path
import argparse, array, hashlib, json, math, subprocess, urllib.request, wave
ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path)
args = parser.parse_args()
cache = args.source_dir or ROOT / 'node_modules/.cache/riftline/audio-sources'
cache.mkdir(parents=True, exist_ok=True)
rows = json.loads((ROOT / 'tools/audio-sources.json').read_text())
rate = 22050
bank = array.array('h')
clips = {}
for row in rows:
    file = cache / row['file']
    if not file.exists():
        urllib.request.urlretrieve(row['url'], file)
    assert hashlib.sha256(file.read_bytes()).hexdigest() == row['sha256'], row['file'] + ' changed'
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(file), '-ac', '1', '-ar', str(rate), '-f', 'f32le', '-'])
    pcm = array.array('f')
    pcm.frombytes(raw)
    peak = max((abs(v) for v in pcm))
    onset = next((i for i, v in enumerate(pcm) if abs(v) > peak * 0.035), 0)
    start = max(0, onset - int(rate * 0.003))
    name = Path(row['file']).stem
    duration = 0.16 if name == 'rifle_fire' else 0.24 if name == 'shotgun_fire' else 0.09 if name.startswith('ppsh') else 0.55 if 'heavy' in name or 'axe-' in name else 0.34
    sample = pcm[start:start + int(rate * duration)]
    peak = max((abs(v) for v in sample)) or 1
    offset = len(bank) / rate
    n = len(sample)
    for i, v in enumerate(sample):
        fade = min(1, i / (rate * 0.002), (n - 1 - i) / (rate * 0.018))
        bank.append(round(max(-1, min(1, v / peak * 0.78 * max(0, fade))) * 32767))
    clips[name] = {'start': round(offset, 7), 'duration': round(n / rate, 7)}
    bank.extend([0] * int(rate * 0.025))
with wave.open(str(ROOT / 'public/audio/physical-bank.wav'), 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(bank.tobytes())
(ROOT / 'src/audio/source-bank.js').write_text('// Generated CC0 source-bank regions in seconds; rebuild with tools/build-audio-bank.py.\nexport const SOURCE_CLIPS = ' + json.dumps(clips, indent=2) + ';\n')
lines = ['# Physical sound sources', '', 'The shipped WAV contains trimmed, faded and peak-normalized mono excerpts of these CC0 recordings.', 'The bank is 22,050 Hz / 16-bit PCM; playback and the new physical layers run locally, including offline.', 'Rebuild: `python tools/build-audio-bank.py` (Python 3 and ffmpeg). Pinned URLs and input hashes are in `tools/audio-sources.json`.', '', '| Original file | Creator | License and source |', '|---|---|---|']
for row in rows:
    lines.append('| ' + row['file'] + ' | ' + row['author'] + ' | [CC0-1.0](' + row['source'] + ') · [pinned recording](' + row['url'] + ') |')
lines += ['', 'Kenney original pack: https://kenney.nl/assets/impact-sounds', 'Still North Media library and license: https://github.com/PanderMusubi/sound-effects-library-weapons', 'CC0 legal text: https://creativecommons.org/publicdomain/zero/1.0/', '']
(ROOT / 'public/audio/SOURCES.md').write_text('\n'.join(lines))
print(len(clips), 'clips;', round(len(bank) / rate, 2), 'seconds;', len(bank) * 2 + 44, 'bytes')
