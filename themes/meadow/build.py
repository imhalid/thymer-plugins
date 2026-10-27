#!/usr/bin/env python3
"""Builds meadow.css, the Meadow theme, from Thymer's own stylesheet.

Meadow is a dark theme over a summer valley: the window is a forest-green
veil that opens on the lake and the village towards the right, the accent is
a leaf green and every text is monospaced. Like Sakura it copies Dark Sans's
rules into its own id with premium/build.py, turning the greys green and the
teal leaf green, then puts tokens.json and material.css on top; the wallpaper
and the porch behind Achievements' character (portrait.jpg) are embedded as
data URIs, so the theme is one block of custom CSS.

    python3 themes/meadow/build.py [app.css]

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

# Greys take the veil's forest green; teal, Dark Sans's primary, takes the leaf green.
pb.NEUTRAL_HUE, pb.NEUTRAL_CHROMA = 150, 0.02
pb.ACCENT_HUE = pb.to_oklch(0x8c / 255, 0xba / 255, 0x45 / 255)[2]

THEME, BASE = 'thymer-meadow', 'thymer-dark-sans'


def main():
    rules, _ = pb.parse(re.sub(r'/\*.*?\*/', '', pb.read_app_css(), flags=re.S))
    tokens = json.load(open(os.path.join(HERE, 'tokens.json')))
    css = open(os.path.join(HERE, 'header.css')).read()
    css += '\n' + pb.build(rules, THEME, BASE, tokens[THEME])
    for var, name in (('--md-wallpaper', 'wallpaper.jpg'), ('--md-portrait', 'portrait.jpg')):
        data = base64.b64encode(open(os.path.join(HERE, name), 'rb').read()).decode()
        css += '\nhtml[data-theme="%s"]{%s:url("data:image/jpeg;base64,%s")}\n' % (THEME, var, data)
    css += '\n' + open(os.path.join(HERE, 'material.css')).read()
    css += '/* ===== Meadow theme end ===== */\n'
    open(os.path.join(HERE, 'meadow.css'), 'w').write(css)
    print('meadow.css: %d bytes' % len(css))


if __name__ == '__main__':
    main()
