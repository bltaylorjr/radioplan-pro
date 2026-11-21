"""Renders one caption line to a transparent PNG, white with a dark outline, falling back to other fonts
for symbols Inter does not have (⛶ ⤢ ⟲ ⟳ ⛰ 🗂 …). Usage: capline.py "<text>" <size> <out.png>"""
import sys
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
FONTS = ['/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
         '/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf', '/usr/share/fonts/truetype/freefont/FreeSerif.ttf']
EMOJI = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
import os
FONTS = [f for f in FONTS if os.path.exists(f)]
cmaps = {f: TTFont(f, lazy=True, fontNumber=0).getBestCmap() for f in FONTS}
def pick(ch):
    for f in FONTS:
        if ord(ch) in cmaps[f]: return f
    return None
def render(text, size, out, stroke=3):
    runs = []
    for ch in text:
        f = pick(ch) if ord(ch) < 0x1F000 else None
        f = f or 'emoji'
        if runs and runs[-1][0] == f: runs[-1][1] += ch
        else: runs.append([f, ch])
    base = ImageFont.truetype(FONTS[0], size); asc, desc = base.getmetrics()
    W = int(size * len(text) * 0.9) + 40; H = asc + desc + 2 * stroke + 6
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(img); x = stroke
    for f, s in runs:
        if f == 'emoji':
            for ch in s:
                e = ImageFont.truetype(EMOJI, 109); g = Image.new('RGBA', (136, 128), (0, 0, 0, 0))
                ImageDraw.Draw(g).text((0, 0), ch, font=e, embedded_color=True); g = g.crop(g.getbbox() or (0, 0, 1, 1))
                h = int(size * 1.05); g = g.resize((max(1, int(g.width * h / g.height)), h), Image.LANCZOS)
                img.alpha_composite(g, (int(x), stroke + asc - h + int(size * 0.12))); x += g.width + size * 0.15
            continue
        ft = ImageFont.truetype(f, size)
        d.text((x, stroke + asc), s, font=ft, anchor='ls', fill=(255, 255, 255, 255), stroke_width=stroke, stroke_fill=(0, 0, 0, 217))
        x += d.textlength(s, font=ft)
    img.crop((0, 0, int(x) + stroke + 2, H)).save(out)
if __name__ == '__main__': render(sys.argv[1], int(sys.argv[2]), sys.argv[3])
