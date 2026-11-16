#!/usr/bin/env python3
"""Puts square.css (the Dark and Light Square themes) into Thymer's custom CSS through the desktop app's local MCP server.

    python3 themes/square/push.py [--workspace NAME] [--remove] [--port 13100]

Works like premium/push.py (whose code it runs): the theme's block in the custom CSS is replaced or
appended, the rest is left as it is, and the live custom CSS is saved to .backups/ first. Then pick
"Dark Square" or "Light Square" in Thymer's theme picker.
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('premium_push', os.path.join(os.path.dirname(HERE), 'premium', 'push.py'))
pp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pp)

if __name__ == '__main__':
    pp.main('Square', HERE, __doc__)
