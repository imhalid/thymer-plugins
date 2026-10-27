#!/usr/bin/env python3
"""Puts a wallpaper theme into Thymer's custom CSS through the desktop app's local MCP server.

    python3 themes/kit/push.py NAME [--workspace NAME] [--remove] [--port 13100]

NAME is the theme's folder in themes/ (sakura, meadow, ...); build it first with
kit/build.py. Works like premium/push.py (whose code it runs): the theme's block in the
custom CSS is replaced or appended, the rest is left as it is, and the live custom CSS is
saved to the theme's .backups/ first. The theme is then chosen in Thymer's theme picker.
"""
import importlib.util
import json
import os
import sys

THEMES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

spec = importlib.util.spec_from_file_location('premium_push', os.path.join(THEMES, 'premium', 'push.py'))
pp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pp)

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1].startswith('-'):
        sys.exit(__doc__)
    folder = os.path.join(THEMES, sys.argv.pop(1))
    name = json.load(open(os.path.join(folder, 'theme.json')))['name']
    pp.main(name, folder, __doc__)
