#!/usr/bin/env python3
"""Draws Herbarium's pressed plants as SVGs: a sprig of small flowers, a
thyme sprig for h2, a leaf for bullets and a trailing stem for rules. They
are built from curves and a few proportions rather than drawn by hand, so
they can be redrawn.

    python3 themes/herbarium/draw.py

then build the theme with kit/build.py as usual. The cloth, the parchment
and the label are plain SVG files beside this one.
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def write(name, body, w, h):
    open(os.path.join(HERE, name), 'w').write(
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}' viewBox='0 0 {w} {h}'>\n"
        + body + '\n</svg>\n')


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return tuple(u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d
                 for a, b, c, d in zip(p0, p1, p2, p3))


def leaf(cx, cy, length, width, angle, fill, stroke, vein=True):
    """A pointed leaf from (cx, cy) along angle (degrees)."""
    a = math.radians(angle)
    ux, uy = math.cos(a), math.sin(a)
    nx, ny = -uy, ux
    tip = (cx + ux * length, cy + uy * length)
    c1 = (cx + ux * length * .3 + nx * width, cy + uy * length * .3 + ny * width)
    c2 = (cx + ux * length * .75 + nx * width * .7, cy + uy * length * .75 + ny * width * .7)
    c3 = (cx + ux * length * .75 - nx * width * .7, cy + uy * length * .75 - ny * width * .7)
    c4 = (cx + ux * length * .3 - nx * width, cy + uy * length * .3 - ny * width)
    f = lambda p: '%.1f %.1f' % p
    d = f"M{f((cx, cy))}C{f(c1)} {f(c2)} {f(tip)}C{f(c3)} {f(c4)} {f((cx, cy))}Z"
    out = f"<path d='{d}' fill='{fill}' stroke='{stroke}' stroke-width='.5'/>"
    if vein:
        out += (f"<path d='M{f((cx, cy))}L{f((cx + ux * length * .85, cy + uy * length * .85))}' "
                f"stroke='{stroke}' stroke-width='.45' stroke-opacity='.7'/>")
    return out


# ---- a sprig of small flowers -------------------------------------------------

parts = []
stem = "M20 210C24 160 40 110 76 70C92 52 110 40 128 32"
parts.append(f"<path d='{stem}' fill='none' stroke='#5f6d3c' stroke-width='1.6' stroke-linecap='round'/>")
parts.append("<path d='M44 128C58 120 70 104 80 100M30 170C18 156 12 140 14 126' fill='none' "
             "stroke='#5f6d3c' stroke-width='1.1' stroke-linecap='round'/>")
for x, y, a, l in ((34, 150, -40, 26), (30, 172, 200, 24), (52, 112, -70, 22), (60, 100, 150, 20), (96, 52, -20, 18)):
    parts.append(leaf(x, y, l, 6, a, '#7a8550', '#4b5530'))


def flower(cx, cy, r, petal, centre):
    out = []
    for k in range(5):
        a = math.radians(k * 72 + 10)
        px, py = cx + math.cos(a) * r * .55, cy + math.sin(a) * r * .55
        out.append(f"<ellipse cx='{px:.1f}' cy='{py:.1f}' rx='{r * .5:.1f}' ry='{r * .34:.1f}' "
                   f"transform='rotate({k * 72 + 10} {px:.1f} {py:.1f})' fill='{petal}' stroke='#8a5a5a' stroke-width='.4'/>")
    out.append(f"<circle cx='{cx}' cy='{cy}' r='{r * .22:.1f}' fill='{centre}'/>")
    return ''.join(out)


parts.append(flower(128, 32, 16, '#c9969a', '#c9a24a'))
parts.append(flower(80, 100, 12, '#b9a3c6', '#c9a24a'))
parts.append(flower(14, 124, 11, '#c9969a', '#c9a24a'))
write('flowers.svg', "  <!-- A sprig of small pressed flowers, rose and lilac, faded. -->\n  " + '\n  '.join(parts), 150, 215)

# ---- small pieces ------------------------------------------------------------

parts = ["<path d='M4 21C7 15 11 9 18 3' fill='none' stroke='#3f5e3c' stroke-width='1.3' stroke-linecap='round'/>"]
for t, sz in ((.25, 4.5), (.5, 4), (.72, 3.4), (.9, 2.6)):
    x, y = bezier((4, 21), (7, 15), (11, 9), (18, 3), t)
    parts.append(leaf(x, y, sz, 1.6, -150, '#5b7f4f', '#3f5e3c', vein=False))
    parts.append(leaf(x, y, sz, 1.6, -10, '#5b7f4f', '#3f5e3c', vein=False))
write('sprig.svg', "  <!-- A sprig of thyme, for h2. -->\n  " + ''.join(parts), 22, 24)

write('leaf.svg', "  <!-- A small leaf, for bullets. -->\n  " + leaf(1.5, 10.5, 11, 3.6, -45, '#5b7f4f', '#3f5e3c'), 12, 12)

parts = ["<path d='M0 8C20 3 40 13 60 8S100 3 120 8' fill='none' stroke='#5f6d3c' stroke-width='1.1'/>"]
for x, side in ((14, -1), (36, 1), (58, -1), (80, 1), (102, -1)):
    # Both halves of the stem run evenly in x, so x fixes the point on them.
    seg = ((0, 8), (20, 3), (40, 13), (60, 8)) if x < 60 else ((60, 8), (80, 3), (100, 3), (120, 8))
    y = bezier(*seg, (x % 60) / 60)[1]
    parts.append(leaf(x, y, 8, 2.6, -35 if side < 0 else 35, '#7a8550', '#4b5530', vein=False))
write('vine.svg', "  <!-- A trailing stem, for rules; it tiles sideways. -->\n  " + ''.join(parts), 120, 16)

print('drew', ', '.join(sorted(f for f in os.listdir(HERE) if f.endswith('.svg'))))
