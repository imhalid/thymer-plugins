#!/usr/bin/env python3
"""Makes the plugin's pictures: art/webp/<id>.webp (3:2, 384 x 256), from the finished pictures in art/generated/.

    python3 pack_images.py                 # the ones that are new or changed
    python3 pack_images.py --quality 70    # smaller files

build.mjs bakes every art/webp/*.webp into achievements.js (an achievement with no file there gets a coloured plate). Needs Pillow with WebP.
"""
import argparse, glob, os, re
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "..")
SRC = os.path.join(ART, "generated")
OUT = os.path.join(ART, "webp")
W, H = 384, 256


def cut(im):
    w, h = im.size
    want = W / H
    if w / h > want:
        nw = round(h * want); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = round(w / want); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((W, H), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--quality", type=int, default=78)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    made = total = 0
    for f in sorted(glob.glob(os.path.join(SRC, "*.png"))):
        m = re.match(r"\d+-([a-z0-9]+)-", os.path.basename(f))
        if not m:
            continue
        dest = os.path.join(OUT, m.group(1) + ".webp")
        total += 1
        if not os.path.exists(dest) or os.path.getmtime(dest) < os.path.getmtime(f):
            cut(Image.open(f).convert("RGB")).save(dest, "WEBP", quality=a.quality, method=6)
            made += 1
    size = sum(os.path.getsize(f) for f in glob.glob(os.path.join(OUT, "*.webp")))
    print(f"{made} made, {total} pictures in generated/; art/webp: {len(glob.glob(os.path.join(OUT, '*.webp')))} files, {size // 1024} KB")


if __name__ == "__main__":
    main()
