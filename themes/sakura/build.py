#!/usr/bin/env python3
"""Builds sakura.css, the Sakura theme, from Thymer's own stylesheet.

Sakura is a dark theme over a cherry-blossom wallpaper: the window is a plum
veil the picture shows through, the accent is blossom pink and every text is
monospaced. Like Premium it copies Dark Sans's rules into its own id, turning
the greys plum and the teal pink (premium/build.py does the copying), then
puts tokens.json and material.css on top; the wallpaper is embedded as a
data URI, so the theme is one block of custom CSS.

    python3 themes/sakura/build.py [app.css]

Without an argument it reads app.css from the Thymer desktop app's cache.
"""
import base64
import importlib.util
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))

spec = importlib.util.spec_from_file_location('premium_build', os.path.join(HERE, '..', 'premium', 'build.py'))
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)

# Greys take the veil's plum; teal, Dark Sans's primary, takes the blossom pink.
pb.NEUTRAL_HUE, pb.NEUTRAL_CHROMA = 345, 0.02
pb.ACCENT_HUE = pb.to_oklch(0xe8 / 255, 0x6f / 255, 0x97 / 255)[2]

THEME, BASE = 'thymer-sakura', 'thymer-dark-sans'


def main():
    rules, _ = pb.parse(re.sub(r'/\*.*?\*/', '', pb.read_app_css(), flags=re.S))
    tokens = json.load(open(os.path.join(HERE, 'tokens.json')))
    wallpaper = base64.b64encode(open(os.path.join(HERE, 'wallpaper.jpg'), 'rb').read()).decode()
    css = open(os.path.join(HERE, 'header.css')).read()
    css += '\n' + pb.build(rules, THEME, BASE, tokens[THEME])
    css += '\nhtml[data-theme="%s"]{--sk-wallpaper:url("data:image/jpeg;base64,%s")}\n' % (THEME, wallpaper)
    css += '\n' + open(os.path.join(HERE, 'material.css')).read()
    css += '/* ===== Sakura theme end ===== */\n'
    open(os.path.join(HERE, 'sakura.css'), 'w').write(css)
    print('sakura.css: %d bytes' % len(css))


if __name__ == '__main__':
    main()
