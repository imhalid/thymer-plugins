"""Cuts the ghost outlines out of the rendered sprites: ink is kept only near the clean silhouette (render without ink, grown a few px).
usage: clean_sprites.py <dir> [grow_px]"""
import os, sys
from PIL import Image, ImageFilter, ImageChops

d = sys.argv[1]
grow = int(sys.argv[2]) if len(sys.argv) > 2 else 7
for f in sorted(os.listdir(d)):
    if not f.endswith("_clean.png"):
        continue
    name = f[:-len("_clean.png")]
    clean = Image.open(os.path.join(d, f)).convert("RGBA")
    inked = Image.open(os.path.join(d, name + ".png")).convert("RGBA")
    a = clean.getchannel("A").point(lambda v: 255 if v > 24 else 0)
    mask = a.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    r, g, b, ia = inked.split()
    inked.putalpha(ImageChops.multiply(ia, mask))
    inked.save(os.path.join(d, name + ".png"))
    print("cleaned", name)
