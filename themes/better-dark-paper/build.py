#!/usr/bin/env python3
"""Builds better-dark-paper.css, the Better Dark Paper theme: Thymer's Dark Paper without its green cast.

A theme in Thymer is a rule `html[data-theme="<id>"]` in the custom CSS; its label in the theme picker is
the id without its first word ("thymer-better-dark-paper" -> "Better Dark Paper") and `color-scheme` says
whether it is dark or light. Such a theme gets none of the built-in themes' rules, so every rule Thymer
writes for Dark Paper (`thymer-dark-paper`, the shared dark rules included) is copied to the new id, its
assets pointed at Thymer's /css/ folder.

Dark Paper's own colours sit between 130 and 185 degrees of hue (moss to teal): the paper, the ink, the
accent, the pencil lines and the sidebar icons all lean green. So every colour of the copy is turned in
OKLCH, its lightness kept, to a charcoal night: the paper a charcoal grey a little lifted, with only a
breath of night blue in it (neither green nor brown), the ink a soft paper white, the accent a muted
fountain-pen blue, the lines graphite. Tag, banner and board colours (named after a colour) keep their hue.
extra.css (hand-written) goes on top: the paper scan made grey and its grain visible on a dark sheet, and
the details.

    python3 themes/better-dark-paper/build.py [app.css]

Without an argument it reads app.css from the Thymer desktop app's cache. Push with push.py, then pick
"Better Dark Paper" in Thymer's theme picker.
"""
import glob
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = 'Better Dark Paper'  # the block's name in the custom CSS (push.py's markers)
THEME, BASE = 'thymer-better-dark-paper', 'thymer-dark-paper'
CACHES = [os.path.expanduser(d + '/Thymer/Partitions/thymer.com/Service Worker/CacheStorage')
          for d in ('~/.config', '~/Library/Application Support')]  # Linux, macOS


def read_app_css():
    if len(sys.argv) > 1:
        return open(sys.argv[1], encoding='utf-8', errors='replace').read()
    paths = [p for c in CACHES for p in glob.glob(c + '/*/*/*') if os.path.isfile(p)]
    for path in sorted(paths, key=os.path.getmtime, reverse=True):
        with open(path, 'rb') as f:
            head = f.read(400)
        if b'/css/app-' in head and b'.css' in head:
            raw = open(path, 'rb').read().decode('utf-8', 'replace')
            return raw[raw.index('@font-face'):].replace('\0', '')
    sys.exit('app.css not found in the Thymer cache; pass its path')


def parse(s, i=0, ctx=()):
    """Flat list of (at-rule context, selector, body)."""
    out = []
    while i < len(s):
        j, k = s.find('{', i), s.find('}', i)
        if k != -1 and (j == -1 or k < j):
            return out, k + 1
        if j == -1:
            break
        pre = s[i:j].strip()
        if pre.startswith('@'):
            inner, i = parse(s, j + 1, ctx + (pre,))
            out += inner
        else:
            k = s.find('}', j)
            out.append((ctx, pre, s[j + 1:k]))
            i = k + 1
    return out, i


# ---- colour ----------------------------------------------------------------

def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def delin(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def to_oklch(r, g, b):
    r, g, b = lin(r), lin(g), lin(b)
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360


def from_oklch(L, C, H):
    A, B = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
    return (delin(4.0767416621 * l - 3.3077085654 * m + 0.2309667510 * s),
            delin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            delin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s))


def fmt(r, g, b, a):
    rgb = ''.join('%02x' % round(x * 255) for x in (r, g, b))
    return '#' + rgb + ('' if a >= 0.999 else '%02x' % round(a * 255))


# Variables named after a colour (tag, banner and board colours) keep their hue.
NAMED = re.compile(r'-(red|orange|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|'
                   r'stone|zinc|gray|slate|neutral|amber)(-|$)')

# A charcoal night: the sheet and the graphite lines keep only a trace of chroma, at a night-blue hue
# (a dark grey drifts to green or brown at the slightest tint of those hues); the ink is a soft paper white;
# the accent is fountain-pen ink.
NIGHT_H, INK_H, ACCENT_H = 262, 85, 255


def remap(var, r, g, b, a):
    """One colour of Dark Paper, turned to Better Dark Paper's."""
    L, C, H = to_oklch(r, g, b)
    if C < 0.004:  # greys, black and white (shadows, scrims) stay as they are
        return fmt(r, g, b, a)
    if var.startswith('--color-bg-'):
        # the sheet: lifted a little from Dark Paper's near-black, charcoal with a breath of night
        L, C, H = L + 0.03, min(0.004 + C * 0.2, 0.008), NIGHT_H
    elif var.startswith(('--color-text-', '--color-blackwhite-', '--color-primary-text-', '--panel-white-title-fg')):
        L, C, H = L, min(C * 0.3, 0.007), INK_H  # paper white, the faintest warmth
    elif var.startswith('--color-primary-'):
        L, C, H = L, C * 0.55, ACCENT_H  # Dark Paper's teal becomes a muted ink blue
    elif var.startswith('--paper-line') or var == 'svg':
        L, C, H = L, min(C, 0.012), NIGHT_H  # graphite
    elif var.startswith('--flame-'):
        L, C, H = L, C * 0.9, 62  # an ember, not a green flame
    else:
        L, C, H = L, min(C * 0.6, 0.06), ACCENT_H
    return fmt(*from_oklch(L, C, H), a)


HEX = re.compile(r'(%23|#)([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b')
RGB = re.compile(r'rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)')
P3 = re.compile(r'color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*/\s*([\d.]+%?))?\s*\)')


def alpha(s):
    if s is None:
        return 1.0
    return float(s[:-1]) / 100 if s.endswith('%') else float(s)


def recolor(text, var):
    def hexc(m):
        h = m.group(2)
        if len(h) in (3, 4):
            h = ''.join(c * 2 for c in h)
        rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        out = remap(var if m.group(1) == '#' else 'svg', *rgb, a)
        return out.replace('#', m.group(1))

    def rgbc(m):
        return remap(var, *(float(m.group(i)) / 255 for i in (1, 2, 3)), alpha(m.group(4)))

    def p3c(m):
        # p3 primaries are close enough to sRGB's for these muted colours; the remap gives an sRGB colour
        return remap(var, *(float(m.group(i)) for i in (1, 2, 3)), alpha(m.group(4)))

    return P3.sub(p3c, RGB.sub(rgbc, HEX.sub(hexc, text)))


def recolor_body(body):
    """Each declaration on its own, so a variable named after a colour keeps its hue."""
    out = []
    for d in body.split(';'):
        prop = d.split(':', 1)[0].strip()
        out.append(d if NAMED.search(prop) else recolor(d, prop))
    return ';'.join(out)


def copy_theme(app):
    """Every rule that names Dark Paper, moved to the new id, recoloured, assets pointed at /css/."""
    rules, _ = parse(re.sub(r'/\*.*?\*/', '', app, flags=re.S))
    own = '[data-theme=%s]' % BASE
    css, n = '', 0
    for ctx, sel, body in rules:
        comps = [c.strip() for c in sel.split(',') if own in c]
        if not comps:
            continue
        sel = ','.join(c.replace(own, '[data-theme="%s"]' % THEME) for c in comps)
        body = re.sub(r'url\((["\']?)\./', r'url(\1/css/', recolor_body(body))
        rule = '%s{%s}' % (sel, body)
        for at in reversed(ctx):
            rule = '%s{%s}' % (at, rule)
        css += rule + '\n'
        n += 1
    return css, n


def main():
    app = read_app_css()
    part, n = copy_theme(app)
    scan = re.search(r'body:before\{[^}]*?(url\([^)]*\))', part)  # Dark Paper's paper scan
    if not scan:
        sys.exit("Dark Paper's paper scan (body:before) not found in app.css")
    extra = (open(os.path.join(HERE, 'extra.css')).read()
             .replace('ROOT', 'html[data-theme="%s"]' % THEME).replace('PATTERN', scan.group(1)))
    css = ('/* ===== %s theme start =====\n'
           '   Generated by themes/better-dark-paper/build.py: Thymer\'s Dark Paper in charcoal night tones,\n'
           '   no green cast. Do not edit by hand; edit build.py or extra.css and build again. */\n' % NAME
           + part + '\n/* ---- extra.css ---- */\n' + extra.strip() + '\n'
           + '/* ===== %s theme end ===== */\n' % NAME)
    out = os.path.join(HERE, 'better-dark-paper.css')
    open(out, 'w').write(css)
    print('%s: %d bytes (%d copied rules)' % (out, len(css), n))


if __name__ == '__main__':
    main()
