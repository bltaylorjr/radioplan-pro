#!/usr/bin/env python3
"""Splices newly recorded parts into the introduction video.

1. Finds where each existing narration segment is in the old video (envelope cross-correlation of its WAV).
2. Cuts the old video in the quiet gap after each group's `after` segment.
3. Builds each new part: the recorded clip (trimmed to its first segment), its narration WAVs at their
   times, and captions in the video's style (page name, title, one line), burned in.
4. Joins old and new parts and encodes one H.264 / AAC MP4 at 1280 × 720, 30 fps.

Usage: splice-intro.py <old intro.mp4> <narration dir> <clips dir> <captions.json> <out.mp4>
The narration dir holds full/, p1/, p2/ and out/ (newest wins: out, p2, p1, full).
"""
import json, os, subprocess, sys, tempfile
import numpy as np, scipy.io.wavfile as wf, scipy.signal as ss

OLD, NARR, CLIPS, CAPS, OUT = sys.argv[1:6]
SCRIPT = os.path.join(os.path.dirname(__file__), 'intro-narration.json')
FONT_B = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
FONT_R = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
run = lambda *a: subprocess.run(a, check=True)

def wav_path(i):
    for d in ('out', 'p2', 'p1', 'full'):
        f = os.path.join(NARR, d, i + '.wav')
        if os.path.exists(f): return f
    raise SystemExit('no narration for ' + i)

def env(x, hop=80):
    n = len(x) // hop; e = np.log(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-9)); return (e - e.mean()) / (e.std() + 1e-9)

def load8k(f):
    r, x = wf.read(f); x = x.astype(np.float32)
    if x.ndim > 1: x = x.mean(1)
    from math import gcd
    g = gcd(r, 8000); return ss.resample_poly(x, 8000 // g, r // g)

def align(groups):
    tmp = tempfile.mktemp(suffix='.wav'); run('ffmpeg', '-v', 'error', '-y', '-i', OLD, '-ac', '1', '-ar', '8000', tmp)
    _, v = wf.read(tmp); V = env(v.astype(np.float32)); os.remove(tmp)
    new = {s['id'] for g in groups for s in g['marks']}
    ids = [x['id'] for x in json.load(open(SCRIPT)) if x['id'] not in new]
    pos, out = 0, {}
    for i in ids:
        E = env(load8k(wav_path(i))); L = len(E); lo = pos; hi = min(len(V) - L, pos + 100 * 120)
        c = ss.correlate(V[lo:hi + L], E, mode='valid', method='fft') / L; k = int(np.argmax(c))
        out[i] = ((lo + k) / 100, (lo + k + L) / 100, float(c[k])); pos = lo + k + L
    return ids, out

def esc(t): return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", "’")

def build_part(g, caps, tmpdir):
    clip = os.path.join(CLIPS, g['id'] + '.webm'); start = g['start']; marks = g['marks']
    total = marks[-1]['at'] + marks[-1]['dur'] + 1.0
    inputs = ['-ss', f'{start:.3f}', '-t', f'{total:.3f}', '-i', clip]
    for m in marks: inputs += ['-i', wav_path(m['id'])]
    mix = ''.join(f"[{k + 1}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={int(m['at'] * 1000)}|{int(m['at'] * 1000)}[a{k}];" for k, m in enumerate(marks))
    mix += ''.join(f'[a{k}]' for k in range(len(marks))) + f'amix=inputs={len(marks)}:normalize=0,apad,atrim=0:{total:.3f}[aout]'
    draw = []
    for m in marks:
        c = caps.get(m['id'])
        if not c: continue
        t0, t1 = m['at'], m['at'] + m['dur'] + 0.5; en = f"enable='between(t,{t0:.2f},{t1:.2f})'"
        draw.append(f"drawtext=fontfile={FONT_B}:text='{esc(c['page'].upper())}':expansion=none:fontsize=17:fontcolor=white:borderw=3:bordercolor=black@0.85:x=40:y=h-100:{en}")
        draw.append(f"drawtext=fontfile={FONT_B}:text='{esc(c['title'])}':expansion=none:fontsize=30:fontcolor=white:borderw=4:bordercolor=black@0.85:x=40:y=h-78:{en}")
        draw.append(f"drawtext=fontfile={FONT_R}:text='{esc(c['line'])}':expansion=none:fontsize=19:fontcolor=white:borderw=3:bordercolor=black@0.85:x=40:y=h-40:{en}")
    vf = f"[0:v]fps=30,scale=1280:720,setsar=1,{','.join(draw) if draw else 'null'}[vout]"
    out = os.path.join(tmpdir, g['id'] + '.mp4')
    run('ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', vf + ';' + mix, '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', out)
    return out

def main():
    groups = []
    for f in sorted(os.listdir(CLIPS)):
        if f.endswith('.json'): g = json.load(open(os.path.join(CLIPS, f))); g['id'] = f[:-5]; groups.append(g)
    caps = json.load(open(CAPS))
    ids, at = align(groups)
    low = [i for i, (_, _, q) in at.items() if q < 0.5]
    if low: print('warning: low alignment confidence for', low)
    # cut in the middle of the gap after each anchor
    cuts = []
    for g in groups:
        a = g['after']; nxt = ids[ids.index(a) + 1] if ids.index(a) + 1 < len(ids) else None
        end = at[a][1]; cut = (end + at[nxt][0]) / 2 if nxt else end + 0.5
        cuts.append((cut, g))
    cuts.sort(key=lambda x: x[0])
    tmpdir = tempfile.mkdtemp(); parts, prev = [], 0.0
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OLD]).decode())
    for k, (cut, g) in enumerate(cuts):
        o = os.path.join(tmpdir, f'old{k}.mp4')
        run('ffmpeg', '-v', 'error', '-y', '-ss', f'{prev:.3f}', '-to', f'{cut:.3f}', '-i', OLD, '-vf', 'fps=30,scale=1280:720,setsar=1', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', o)
        parts += [o, build_part(g, caps, tmpdir)]; prev = cut; print(f'cut at {cut:.2f}s after {g["after"]} → {g["id"]}')
    o = os.path.join(tmpdir, 'oldend.mp4')
    run('ffmpeg', '-v', 'error', '-y', '-ss', f'{prev:.3f}', '-i', OLD, '-vf', 'fps=30,scale=1280:720,setsar=1', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', o); parts.append(o)
    lst = os.path.join(tmpdir, 'list.txt'); open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    run('ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', OUT)
    print('written', OUT, f'(old {dur:.0f}s)')

main()
