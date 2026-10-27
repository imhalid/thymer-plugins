#!/usr/bin/env python3
"""Starts a wallpaper theme from a picture and an accent.

    python3 themes/kit/new.py NAME PICTURE --accent '#rrggbb' [--ground '#rrggbb'] [--text '#rrggbb']
                              [--portrait PICTURE] [--light-from top-right|right|top|top-left|left]

Makes themes/<name>/ with the picture as wallpaper (and, if given, a portrait for
Achievements' character) and a theme.json that kit/build.py turns into a theme. Only the
accent is needed: the ground (the veil's colour) and the text colour default to a very dark
and a pale tint of it. --light-from says where the picture should show through the page's
veil (default top-right). Everything else in theme.json (framing, syntax colours, heading
icons, ...) can be tuned afterwards; kit/build.py's docstring lists it.
"""
import argparse
import json
import os
import re
import shutil
import sys

THEMES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWARDS = {'top-right': 'to top right', 'right': 'to right', 'top': 'to top',
           'top-left': 'to top left', 'left': 'to left'}
HEX = re.compile(r'#[0-9a-fA-F]{6}')


def colour(v):
    if not HEX.fullmatch(v):
        raise argparse.ArgumentTypeError('expected #rrggbb, got ' + v)
    return v.lower()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('name', help='the label in the theme picker, e.g. Dunes')
    ap.add_argument('picture', help='the wallpaper (.jpg, .png or .webp)')
    ap.add_argument('--accent', required=True, type=colour)
    ap.add_argument('--ground', type=colour)
    ap.add_argument('--text', type=colour)
    ap.add_argument('--portrait', help="a picture behind Achievements' character")
    ap.add_argument('--light-from', choices=TOWARDS, default='top-right')
    a = ap.parse_args()

    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9]*', a.name):
        sys.exit('the name is one word of letters and digits (it becomes the id thymer-%s)' % a.name.lower())
    folder = os.path.join(THEMES, a.name.lower())
    if os.path.exists(folder):
        sys.exit(folder + ' exists already')
    os.makedirs(folder)
    wallpaper = 'wallpaper' + os.path.splitext(a.picture)[1].lower()
    shutil.copyfile(a.picture, os.path.join(folder, wallpaper))
    cfg = {'name': a.name, 'accent': a.accent}
    if a.ground:
        cfg['ground'] = a.ground
    if a.text:
        cfg['text'] = a.text
    cfg.update({
        'wallpaper': {'file': wallpaper, 'position': '50% 50%', 'size': 'cover'},
        'veil': {'direction': TOWARDS[a.light_from],
                 'stops': [[0.97, '0%'], [0.95, '30%'], [0.86, '58%'], [0.8, '82%'], [0.75, '100%']]},
        'selected': 'solid',
        'title': 'upright',
    })
    if a.portrait:
        portrait = 'portrait' + os.path.splitext(a.portrait)[1].lower()
        shutil.copyfile(a.portrait, os.path.join(folder, portrait))
        cfg['portrait'] = portrait
    with open(os.path.join(folder, 'theme.json'), 'w') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    with open(os.path.join(folder, '.gitignore'), 'w') as f:
        f.write('.backups/\n')
    rel = os.path.relpath(folder)
    print('made %s; next:\n  python3 themes/kit/build.py %s\n  python3 themes/kit/push.py %s'
          % (rel, a.name.lower(), a.name.lower()))


if __name__ == '__main__':
    main()
