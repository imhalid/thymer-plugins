#!/usr/bin/env python3
"""Builds premium.css, the Premium theme, from Thymer's own stylesheet.

A theme in Thymer is a rule `html[data-theme="<id>"]` in the custom CSS; its
label is the id without its first word ("thymer-premium" -> "Premium") and
`color-scheme` says whether it is dark or light. Such a theme gets none of the
built-in themes' rules, so this script copies every rule of Dark Sans and
Light Sans into the new ids, turns their neutral greys into the Pano design
system's greys and their teal into its blue, and puts the Pano tokens and
material (raised controls, frosted popovers, gradient-edged panels) on top.

    python3 themes/premium/build.py [app.css]

Without an argument it reads app.css from the Thymer desktop app's cache.
"""
import glob
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CACHES = [os.path.expanduser(d + '/Thymer/Partitions/thymer.com/Service Worker/CacheStorage')
          for d in ('~/.config', '~/Library/Application Support')]  # Linux, macOS

BASES = {'thymer-premium': 'thymer-dark-sans', 'thymer-premium-light': 'thymer-light-sans'}


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
    """Flat list of (at-rule context, selector, body), comments removed."""
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


# Pano's greys carry a trace of blue (Apple's system greys); its accent is
# color-accent-500. Teal is what Dark Sans and Light Sans use as primary.
NEUTRAL_HUE, NEUTRAL_CHROMA = 286, 0.005
ACCENT_HUE = to_oklch(0x0a / 255, 0x84 / 255, 1)[2]


# Variables named after a colour (tag, banner and board colours) keep their hue.
NAMED = re.compile(r'-(red|orange|yellow|lime|green|teal|cyan|sky|blue|indigo|purple|fuchsia|pink|rose|stone|zinc)(-|$)')


def remap(r, g, b, a, named=False):
    L, C, H = to_oklch(r, g, b)
    if named:
        return fmt(r, g, b, a)
    if C < 0.035:
        C, H = min(C, NEUTRAL_CHROMA), NEUTRAL_HUE
    elif 150 <= H <= 230:
        H, C = ACCENT_HUE, max(C, 0.06)
    return fmt(*from_oklch(L, C, H), a)


NUM = r'\s*([0-9.]+%?)\s*'
COLOR = re.compile(
    r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b'
    r'|rgba?\(' + NUM + r',' + NUM + r',' + NUM + r'(?:,' + NUM + r')?\)'
    r'|color\(display-p3' + NUM + NUM + NUM + r'(?:/' + NUM + r')?\)')


def chan(v, scale):
    return float(v[:-1]) / 100 if v.endswith('%') else float(v) / scale


def recolor(text, named=False):
    def sub(m):
        if m.group(1):
            h = m.group(1)
            if len(h) in (3, 4):
                h = ''.join(c * 2 for c in h)
            r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
            a = int(h[6:8], 16) / 255 if len(h) == 8 else 1
        elif m.group(2):
            r, g, b = (chan(m.group(i), 255) for i in (2, 3, 4))
            a = chan(m.group(5), 1) if m.group(5) else 1
        else:  # display-p3 is read as sRGB: close enough for a hue swap
            r, g, b = (chan(m.group(i), 1) for i in (6, 7, 8))
            a = chan(m.group(9), 1) if m.group(9) else 1
        return remap(r, g, b, a, named)
    return COLOR.sub(sub, text)


def decls(body):
    out = {}
    for d in body.split(';'):
        if ':' in d:
            k, v = d.split(':', 1)
            out[k.strip()] = v.strip()
    return out


# ---- the theme -------------------------------------------------------------

def build(rules, theme, base, tokens):
    exact = re.compile(r'html\[data-theme=%s\]' % re.escape(base))
    own = '[data-theme=%s]' % base
    block, others = {}, []
    for ctx, sel, body in rules:
        comps = [c.strip() for c in sel.split(',') if own in c]
        if not comps:
            continue
        if any(exact.fullmatch(c) for c in comps):
            block.update(decls(body))  # p3 blocks too: the tokens replace them anyway
        rest = [c for c in comps if not exact.fullmatch(c) and 'banner-' not in c]
        if rest:
            sel = ','.join(c.replace(own, '[data-theme="%s"]' % theme) for c in rest)
            others.append((ctx, sel, recolor(body)))
    block = {k: recolor(v, bool(NAMED.search(k))) for k, v in block.items()}
    block.update(tokens)
    scheme = block.pop('color-scheme')
    head = 'html[data-theme="%s"]{color-scheme:%s;\n' % (theme, scheme)
    css = head + ''.join('  %s: %s;\n' % kv for kv in block.items()) + '}\n'
    for ctx, sel, body in others:
        rule = '%s{%s}' % (sel, body)
        for at in reversed(ctx):
            rule = '%s{%s}' % (at, rule)
        css += rule + '\n'
    return css


def main():
    rules, _ = parse(re.sub(r'/\*.*?\*/', '', read_app_css(), flags=re.S))
    tokens = json.load(open(os.path.join(HERE, 'tokens.json')))
    css = open(os.path.join(HERE, 'header.css')).read()
    for theme, base in BASES.items():
        css += '\n' + build(rules, theme, base, tokens[theme])
    css += '\n' + open(os.path.join(HERE, 'material.css')).read()
    css += '/* ===== Premium theme end ===== */\n'
    open(os.path.join(HERE, 'premium.css'), 'w').write(css)
    print('premium.css: %d bytes' % len(css))


if __name__ == '__main__':
    main()
