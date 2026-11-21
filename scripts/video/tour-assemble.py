#!/usr/bin/env python3
"""Builds the 1.5.78 tour video: the opening cards from the old video, the new recording with each tool's
narration and caption, then the closing cards. Under the narration sits the same quiet music bed as the old tour.
Usage: tour-assemble.py <old intro.mp4> <narration dir> <recording dir> <out.mp4> [crf]"""
import glob, json, os, subprocess, sys, tempfile
import numpy as np, scipy.io.wavfile as wf
sys.path.insert(0, os.path.dirname(__file__))
from capline import render as render_line, cmaps, FONTS

OLD, NARR, REC, OUT = sys.argv[1:5]; CRF = sys.argv[5] if len(sys.argv) > 5 else '26'
SR = 44100; TMP = tempfile.mkdtemp(prefix='tour')
SCRIPT = {x['id']: x for x in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tour-script.json')))}
FONT_B = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
# Opening and closing cards in the old video (the 1.5.78 tour: 55.57 and 1305.85)
INTRO_END, OUTRO_START = float(os.environ.get('INTRO_END', '55.57')), float(os.environ.get('OUTRO_START', '1305.85'))
run = lambda *a: subprocess.run(a, check=True)
VENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-pix_fmt', 'yuv420p', '-r', '30', '-g', '120']
AENC = ['-c:a', 'aac', '-b:a', '96k', '-ar', str(SR), '-ac', '2']

def load(f):
    r, x = wf.read(f); x = x.astype(np.float32) / 32768.0 if x.dtype == np.int16 else x.astype(np.float32)
    if x.ndim == 1: x = np.stack([x, x], 1)
    if r != SR:
        from scipy.signal import resample_poly; from math import gcd
        g = gcd(r, SR); x = resample_poly(x, SR // g, r // g, axis=0).astype(np.float32)
    return x

def old_audio(t0, t1):
    f = os.path.join(TMP, f'oa{t0:.0f}.wav')
    run('ffmpeg', '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-to', f'{t1:.3f}', '-i', OLD, '-vn', '-ac', '2', '-ar', str(SR), f); return load(f)

def bed_source():
    """Music-only moments (pauses between lines) from the old tour, joined with short crossfades."""
    a = old_audio(200, 700); w = int(0.25 * SR); fade = int(0.03 * SR); r = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
    chunks = [a[k * w:(k + 1) * w] for k in range(len(a) // w)]
    chunks = [c for c in chunks if -52 < 20 * np.log10(np.sqrt((c ** 2).mean()) + 1e-9) < -31]
    out = chunks[0].copy()
    for c in chunks[1:]: out[-fade:] = out[-fade:] * (1 - r) + c[:fade] * r; out = np.concatenate([out, c[fade:]])
    return out
BED = bed_source()
def bed(n):
    reps = int(np.ceil(n / len(BED))) + 1; return np.concatenate([BED] * reps)[:n]

def needs_fallback(t): return any(ord(ch) not in cmaps[FONTS[0]] for ch in t)
def esc(t): return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", '’').replace('%', '\\%')

rec = json.load(open(glob.glob(os.path.join(REC, 'tour-*.json'))[0])); clip = glob.glob(os.path.join(REC, 'tour-*.webm'))[0]
marks = rec['marks']; c0 = rec['start'] + marks[0]['at'] - 0.4
total = marks[-1]['at'] - marks[0]['at'] + marks[-1]['dur'] + 1.4 + 0.4
n = int(total * SR); audio = bed(n)
draw, overlays = [], []
for k, m in enumerate(marks):
    at = m['at'] - marks[0]['at'] + 0.4; nxt = (marks[k + 1]['at'] - marks[0]['at'] + 0.4) if k + 1 < len(marks) else total
    x = load(os.path.join(NARR, m['id'] + '.wav')); i = int(at * SR); audio[i:i + len(x)] += x[:n - i]
    head, title, line = SCRIPT[m['id']]['cap']; en = f"enable='between(t,{at:.2f},{nxt - 0.05:.2f})'"
    draw.append(f"drawtext=fontfile={FONT_B}:text='{esc(head.upper())}':expansion=none:fontsize=17:fontcolor=white:borderw=3:bordercolor=black@0.85:x=40:y=h-100:{en}")
    draw.append(f"drawtext=fontfile={FONT_B}:text='{esc(title)}':expansion=none:fontsize=30:fontcolor=white:borderw=4:bordercolor=black@0.85:x=40:y=h-78:{en}")
    png = os.path.join(TMP, f'cap{k:02d}.png'); render_line(line, 19, png); overlays.append((png, at, nxt - 0.05))
wf.write(os.path.join(TMP, 'body.wav'), SR, np.clip(audio, -1, 1).astype(np.float32))

# body: recording + captions (the caption line is a picture, so symbols like ⛶ ⤢ show)
inputs = ['-ss', f'{c0:.3f}', '-t', f'{total:.3f}', '-i', clip, '-i', os.path.join(TMP, 'body.wav')]
for p, _, _ in overlays: inputs += ['-i', p]
# re-recorded sections (PATCH=dir with tour-<id>.json/.webm) replace the main recording in their time window
patches = []
for pj in glob.glob(os.path.join(os.environ.get('PATCH', '/nonexistent'), 'tour-*.json')):
    pr = json.load(open(pj)); pm = pr['marks'][0]
    k = next(i for i, m in enumerate(marks) if m['id'] == pm['id'])
    at = marks[k]['at'] - marks[0]['at'] + 0.4; nxt = (marks[k + 1]['at'] - marks[0]['at'] + 0.4) if k + 1 < len(marks) else total
    patches.append((pj[:-5] + '.webm', pr['start'] + pm['at'], at, nxt))
for w, s0, a, b in patches: inputs += ['-ss', f'{s0:.3f}', '-t', f'{b - a:.3f}', '-i', w]
base = 2 + len(overlays)
fc = "[0:v]fps=30,scale=1280:720,setsar=1,tpad=stop_mode=clone:stop_duration=3,trim=0:%.3f,setpts=PTS-STARTPTS[b0]" % total
for j, (w, s0, a, b) in enumerate(patches):
    fc += f";[{base + j}:v]fps=30,scale=1280:720,setsar=1,tpad=stop_mode=clone:stop_duration=2,setpts=PTS-STARTPTS+{a:.3f}/TB[p{j}];[b{j}][p{j}]overlay=0:0:eof_action=pass:enable='between(t,{a:.3f},{b:.3f})'[b{j + 1}]"
fc += f";[b{len(patches)}]{','.join(draw)}[v0]"
for k, (_, a, b) in enumerate(overlays):
    fc += f";[v{k}][{k + 2}:v]overlay=37:677:enable='between(t,{a:.2f},{b:.2f})'[v{k + 1}]"
body = os.path.join(TMP, 'body.mp4')
script = os.path.join(TMP, 'fc.txt'); open(script, 'w').write(fc)
run('ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex_script', script, '-map', f'[v{len(overlays)}]', '-map', '1:a', '-af', 'loudnorm=I=-12.5:TP=-1.0:LRA=11', '-ar', str(SR), '-t', f'{total:.3f}', *VENC, *AENC, body)

parts = []
for name, a, b in [('intro', 0, INTRO_END), ('outro', OUTRO_START, None)]:
    o = os.path.join(TMP, name + '.mp4')
    run('ffmpeg', '-v', 'error', '-y', '-ss', f'{a:.3f}', *(['-to', f'{b:.3f}'] if b else []), '-i', OLD, '-vf', 'fps=30,scale=1280:720,setsar=1', *VENC, *AENC, o)
    parts.append(o)
parts.insert(1, body)
lst = os.path.join(TMP, 'list.txt'); open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
run('ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', OUT)
print('written', OUT)
