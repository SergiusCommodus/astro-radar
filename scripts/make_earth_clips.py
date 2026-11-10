"""The hero's and the footer's planet: real Earth from the International Space Station, cut from NASA's public domain 4K reel
"4K Earth Views Extended Cut for Earth Day 2021" (NASA Johnson Space Center, jsc2021m000138; see assets/earth/SOURCES.md).

    python3 scripts/make_earth_clips.py [--cache DIR] [hero-wide hero-phone foot-wide foot-phone]

Each clip is a short seamless loop: SECONDS + FADE seconds are cut from the original at its timecode, and over the loop's first FADE
seconds the frames from just past its end fade into it, so the last frame runs straight on into the first (the camera is steady over
these shots, so only the clouds and the ground cross fade). The frame is turned (the astronaut held the camera any way up: in orbit
there is no up, so turning it is honest; the footer's shot is turned 194 degrees), cropped to the part of the picture the page shows
(the horizon 30 percent down the hero's frames, matching the CSS), scaled with Lanczos and its top rows faded into the page color
(--bg, #03050B), so the video's edge disappears into the page. Encoded twice:
  <name>.av1.mp4  AV1 (SVT-AV1, 10 bit, so the dark sky does not band), for browsers that decode AV1 in hardware
  <name>.mp4      H.264 high profile, for everything else (every iPhone before the 15 Pro, older Android, older Safari)
plus the poster (the loop's first frame): <name>.avif and <name>.webp. Writes into assets/earth/.
Needs ffmpeg with libsvtav1 and libx264 (FFMPEG=, else ffmpeg on the PATH) and Pillow 11.3 or later (AVIF).
The original is read over https with byte ranges (about 300 MB per shot); --cache keeps those cuts.
"""
import os, subprocess, sys, tempfile, argparse
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'earth')
FF = os.environ.get('FFMPEG', 'ffmpeg')
SRC = ('https://images-assets.nasa.gov/video/jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_%202021_210422-4KMP4/'
       'jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_%202021_210422-4KMP4~orig.mp4')
BG = (3, 5, 11)
SECONDS, FADE = 12, 2
# shot: [start in the original, seconds; turn in degrees, clockwise]
SHOTS = {'hero': [2905, 180 * 0], 'foot': [580, 194]}
# name: shot, crop in the turned 3840 by 2160 frame (x, y, w, h; y may be negative: black space is added above), output size,
# fade (the share of the height at the top that fades into the page), H.264 and AV1 quality (CRF), cap in MB for each file
CLIPS = {
    'hero-wide':  dict(shot='hero', crop=(0, -332, 3840, 1620), size=(2560, 1080), fade=.27, crf264=20, crfav1=22, cap=4.2),
    'hero-phone': dict(shot='hero', crop=(1110, -332, 1620, 1620), size=(1080, 1080), fade=.27, crf264=20, crfav1=22, cap=2.2),
    'foot-wide':  dict(shot='foot', crop=(560, 94, 2720, 1020), size=(2560, 960), fade=.42, crf264=21, crfav1=25, cap=3.6),
    'foot-phone': dict(shot='foot', crop=(1550, 73, 1700, 1090), size=(1080, 692), fade=.42, crf264=21, crfav1=25, cap=1.6),
}


def run(args):
    subprocess.run([FF, '-hide_banner', '-v', 'error', '-y'] + args, check=True)


def cut(shot, cache):
    """the shot's SECONDS + FADE seconds (and a second more), copied out of the original without re-encoding"""
    t0, _ = SHOTS[shot]
    path = os.path.join(cache, f'{shot}-{t0}.mp4')
    if not os.path.exists(path):
        run(['-ss', str(t0 - 1), '-i', SRC, '-t', str(SECONDS + FADE + 3), '-c', 'copy', '-an', path])
    return path


def fade_png(w, h, share, path):
    """the page color over the top rows, opaque at the top edge and gone at share of the height (smoothstep)"""
    im = Image.new('RGBA', (w, h), BG + (0,))
    px = im.load()
    end = max(1, int(h * share))
    for y in range(end):
        k = 1 - y / end
        a = int(round(255 * k * k * (3 - 2 * k)))
        for x in range(w):
            px[x, y] = BG + (a,)
    im.save(path)


def make(name, cache, tmp):
    c = CLIPS[name]
    raw = cut(c['shot'], cache)
    turn = SHOTS[c['shot']][1]
    x, y, w, h = c['crop']
    W, H = c['size']
    # space is black: the deepest shadows (sensor noise, the faint glow off the limb) go to black first, so the corner a turned frame
    # leaves empty matches the space beside it
    geo = ["curves=all='0/0 0.035/0 0.08/0.06 1/1'"]
    if turn >= 180:
        geo.append('hflip,vflip')
    if turn % 180:
        geo.append(f'rotate={(turn % 180) * 3.14159265 / 180:.6f}:ow=iw:oh=ih:c=black:bilinear=1')
    if y < 0:
        geo.append(f'pad=iw:ih+{-y}:0:{-y}:black')
        y = 0
    geo.append(f'crop={w}:{h}:{x}:{y}')
    geo.append(f'scale={W}:{H}:flags=lanczos+accurate_rnd+full_chroma_int')
    fp = os.path.join(tmp, name + '-fade.png')
    fade_png(W, H, c['fade'], fp)
    L, F = SECONDS, FADE
    graph = (f"[0:v]trim=start=1:duration={L + F},setpts=PTS-STARTPTS,format=rgb48le,{','.join(geo)},format=yuv444p10le,split=3[a][b][c];"
             f"[a]trim=0:{F},setpts=PTS-STARTPTS[head];[b]trim={F}:{L},setpts=PTS-STARTPTS[body];[c]trim={L}:{L + F},setpts=PTS-STARTPTS[tail];"
             f"[tail][head]xfade=transition=fade:duration={F}:offset=0[xf];[xf][body]concat=n=2:v=1[lp];"
             f"[lp][1:v]overlay=0:0:format=auto,format=yuv444p10le[out]")
    mez = os.path.join(tmp, name + '-mez.mkv')
    run(['-i', raw, '-loop', '1', '-i', fp, '-filter_complex', graph, '-map', '[out]', '-t', str(L), '-c:v', 'libx264', '-qp', '4',
         '-preset', 'veryfast', '-pix_fmt', 'yuv444p10le', mez])
    os.makedirs(OUT, exist_ok=True)
    av1 = os.path.join(OUT, name + '.av1.mp4')
    h264 = os.path.join(OUT, name + '.mp4')
    run(['-i', mez, '-c:v', 'libsvtav1', '-preset', '3', '-crf', str(c['crfav1']), '-g', '180', '-pix_fmt', 'yuv420p10le',
         '-svtav1-params', 'tune=0:enable-overlays=1', '-movflags', '+faststart', '-an', av1])
    run(['-i', mez, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', str(c['crf264']), '-profile:v', 'high', '-tune', 'film',
         '-pix_fmt', 'yuv420p', '-g', '180', '-movflags', '+faststart', '-an', h264])
    png = os.path.join(tmp, name + '.png')
    run(['-i', mez, '-frames:v', '1', '-pix_fmt', 'rgb24', png])
    im = Image.open(png).convert('RGB')
    im.save(os.path.join(OUT, name + '.avif'), quality=58, subsampling='4:2:0')
    im.save(os.path.join(OUT, name + '.webp'), quality=86, method=6)
    for f in (av1, h264):
        mb = os.path.getsize(f) / 1048576
        print(f'{os.path.basename(f)}: {mb:.2f} MB' + ('' if mb <= c['cap'] else f'  OVER the {c["cap"]} MB cap: raise the CRF'))
    for ext in ('avif', 'webp'):
        print(f'{name}.{ext}: {os.path.getsize(os.path.join(OUT, name + "." + ext)) // 1024} KB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*')
    ap.add_argument('--cache', default='')
    a = ap.parse_args()
    names = a.names or list(CLIPS)
    with tempfile.TemporaryDirectory() as tmp:
        cache = a.cache or tmp
        os.makedirs(cache, exist_ok=True)
        for n in names:
            make(n, cache, tmp)


if __name__ == '__main__':
    sys.exit(main())
