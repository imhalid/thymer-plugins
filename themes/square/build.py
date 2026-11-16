#!/usr/bin/env python3
"""Builds square.css, the Square themes: Thymer's default Dark and Light themes with every corner square.

A theme in Thymer is a rule `html[data-theme="<id>"]` in the custom CSS and gets none of the built-in
themes' rules, so every rule Thymer writes for its Dark theme (`thymer-dark`) is copied as it is into the
id `thymer-dark-square` ("Dark Square" in the theme picker), and every rule of its Light theme
(`thymer-light`) into `thymer-light-square` ("Light Square"). Then every radius token is set to 0, and,
for the corners Thymer writes as plain values (50% dots, 8px cards, inline styles) and those plugins draw,
every element and pseudo-element under either theme gets `border-radius: 0 !important`.

    python3 themes/square/build.py [app.css]

Without an argument it reads app.css from the Thymer desktop app's cache. Push it with
themes/square/push.py, then pick "Dark Square" or "Light Square" in Thymer's theme picker.
"""
import importlib.util
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
THEMES = os.path.dirname(HERE)
spec = importlib.util.spec_from_file_location('premium_build', os.path.join(THEMES, 'premium', 'build.py'))
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)

NAME = 'Square'  # the block's name in the custom CSS (push.py's markers)
# theme id -> (the built-in theme it copies, BetterTask's started stroke color and glow there)
SQUARES = {
    'thymer-dark-square': ('thymer-dark', '#67e8f9', 'rgba(103, 232, 249, 0.7)'),
    'thymer-light-square': ('thymer-light', '#0891b2', 'rgba(8, 145, 178, 0.35)'),
}


# Plugins' circles that turn read as a spinning square here, so they get a square motion instead.
# BetterTask's started ring becomes a stroke that runs along the square's edge: an SVG rect whose dash pattern
# moves (stroke-dashoffset, SMIL), with pathLength 100 so it runs at one speed along the whole perimeter. A long
# dim dash and a short bright one end at the same point: a head with a fading tail.
def stroke_svg(color):
    rect = ("<rect x='.8' y='.8' width='22.4' height='22.4' pathLength='100' %s>"
            "<animate attributeName='stroke-dashoffset' from='0' to='-100' dur='1.8s' repeatCount='indefinite'/></rect>")
    return ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>"
            "<g fill='none' stroke='%s' stroke-width='1.6' stroke-linecap='square'>" % color
            + rect % "stroke-opacity='.18' stroke-dasharray='0 0 40 60'"
            + rect % "stroke-opacity='.45' stroke-dasharray='0 16 24 60'"
            + rect % "stroke-dasharray='0 30 10 60'"
            + "</g></svg>")


def data_uri(svg):
    return "url(\"data:image/svg+xml,%s\")" % svg.replace('#', '%23').replace('<', '%3C').replace('>', '%3E')


EXTRA = """
/* BetterTask's started status: its ring turned (a turning square shows its corners going round); here the
   square stays still and a stroke runs along its edge, a bright head with a fading tail (an SVG dash).
   :root lifts it above BetterTask's own rule, which has the same weight and loads after the custom CSS. */
ROOT:root body.bt-on.bt-anim .listitem-task.state-started > .line-check-div::after {
	transform: none;
	border: 0;
	background: STROKE center / 100% 100% no-repeat;
	filter: drop-shadow(0 0 2px GLOW);
	animation: none;
}
@media (prefers-reduced-motion: reduce) {
	ROOT:root body.bt-on.bt-anim .listitem-task.state-started > .line-check-div::after {
		background: none;
		filter: none;
	}
}
"""


def copy_theme(app, rules, theme, base):
    """The base theme's variables (one block) and its other rules, moved to the theme's id."""
    exact = re.compile(r'html\[data-theme=%s\]' % re.escape(base))
    own = '[data-theme=%s]' % base
    block, others = {}, []
    for ctx, sel, body in rules:
        comps = [c.strip() for c in sel.split(',') if own in c]
        if not comps:
            continue
        if not ctx and any(exact.fullmatch(c) for c in comps):
            block.update(pb.decls(body))
            rest = [c for c in comps if not exact.fullmatch(c)]
        else:
            rest = comps  # inside @media (e.g. the p3 accent) the rule stays in its context
        if rest:
            others.append((ctx, ','.join(c.replace(own, '[data-theme="%s"]' % theme) for c in rest), body))
    # Every radius token Thymer has, at 0
    for v in sorted(set(re.findall(r'(--[\w-]*radius[\w-]*)\s*:', app))):
        block[v] = '0'
    scheme = block.pop('color-scheme', 'dark' if 'dark' in base else 'light')
    root = 'html[data-theme="%s"]' % theme
    css = '%s{color-scheme:%s;\n' % (root, scheme) + ''.join('  %s: %s;\n' % kv for kv in block.items()) + '}\n'
    for ctx, sel, body in others:
        rule = '%s{%s}' % (sel, body)
        for at in reversed(ctx):
            rule = '%s{%s}' % (at, rule)
        css += rule + '\n'
    return css, len(others)


def main():
    app = pb.read_app_css()
    rules, _ = pb.parse(app)
    css = ('/* ===== %s theme start =====\n'
           '   Generated by themes/square/build.py: Thymer\'s Dark and Light themes as Dark Square and Light Square,\n'
           '   every corner square. Do not edit by hand; edit build.py and build again. */\n' % NAME)
    report = []
    for theme, (base, color, glow) in SQUARES.items():
        part, n = copy_theme(app, rules, theme, base)
        root = 'html[data-theme="%s"]' % theme
        css += '\n/* ---- %s, from %s ---- */\n' % (theme, base) + part
        css += ('\n/* Every corner square: the ones Thymer and plugins write as plain values or inline styles too */\n'
                '%(r)s,%(r)s *,%(r)s *::before,%(r)s *::after,'
                '%(r)s ::-webkit-scrollbar,%(r)s ::-webkit-scrollbar-thumb,%(r)s ::-webkit-scrollbar-track,'
                '%(r)s ::-webkit-scrollbar-corner,%(r)s ::-webkit-resizer'
                '{border-radius:0!important}\n' % {'r': root})
        css += EXTRA.replace('ROOT', root).replace('STROKE', data_uri(stroke_svg(color))).replace('GLOW', glow)
        report.append('%s: %d copied rules' % (theme, n))
    css += '/* ===== %s theme end ===== */\n' % NAME
    out = os.path.join(HERE, NAME.lower() + '.css')
    open(out, 'w').write(css)
    print('%s: %d bytes (%s)' % (out, len(css), ', '.join(report)))


if __name__ == '__main__':
    main()
