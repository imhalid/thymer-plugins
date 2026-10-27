#!/usr/bin/env python3
"""Builds wallpaper themes (Sakura, Meadow, ...) from a picture and a few colours.

A wallpaper theme is a folder themes/<name>/ holding a wallpaper and a
theme.json. From the theme's accent (and, if it gives them, its ground and
text colours) this script derives every colour scale in OKLCH, copies
Thymer's Dark Sans into the theme's id with premium/build.py (its greys take
the ground's hue, its teal the accent's), sets the tokens every wallpaper
theme shares, and adds kit/material.css (the veil, the bars, chips, syntax,
glass) and the theme's own extra.css, if it has one. The pictures are
embedded as data URIs, so a theme is one block of custom CSS, written to
themes/<name>/<name>.css.

    python3 themes/kit/build.py [name ...] [--app-css app.css]

Without names it builds every folder in themes/ that has a theme.json.
Without --app-css it reads app.css from the Thymer desktop app's cache.
Start a new theme with kit/new.py.

theme.json (only "name", "accent" and "wallpaper" are required):

    name            the label in Thymer's theme picker; the id is thymer-<name in lower case>
    description     a line for the header comment
    accent          the accent, as #rrggbb; its scale is primary-50 .. primary-950
    ground          the veil's colour (default: a very dark tint of the accent)
    text            the body text (default: a pale tint of the accent)
    sidebar         the sidebar's colour (default: the ground, a little darker)
    wallpaper       {"file", "position", "size"}: the picture and its CSS framing
                    (default position "50% 50%", size "cover")
    veil            {"direction", "stops": [[alpha, "pos"], ...]}: the page's veil,
                    the ground at each alpha (0..1) along the direction
    selected        "solid" (the open page is an accent fill) or "soft" (a tint)
    title           "italic" or "upright"
    icons           {"h2": name, "h3": name}: kit/icons/<name>.svg before those headings
    portrait        a picture behind Achievements' character, vignetted in the sidebar's colour
    syntax          {"meta", "keyword", "type", "title", "string", "number", "comment"}
    code_alpha      how solid code blocks are, 0..1 (default 0.7)
    hide_banners    hide banners and Auto Banner's scenes (default true)
    tokens          any Thymer variable, set last
"""
import argparse
import base64
import importlib.util
import json
import math
import os
import re
import sys
import urllib.parse

KIT = os.path.dirname(os.path.abspath(__file__))
THEMES = os.path.dirname(KIT)

spec = importlib.util.spec_from_file_location('premium_build', os.path.join(THEMES, 'premium', 'build.py'))
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)


# ---- colour ----------------------------------------------------------------

def oklch(hex_):
    h = hex_.lstrip('#')
    return pb.to_oklch(*(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)))


def linear(L, C, H):
    """Linear sRGB of an OKLCH colour, unclamped."""
    A, B = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
    return (4.0767416621 * l - 3.3077085654 * m + 0.2309667510 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def hexc(L, C, H):
    """#rrggbb of an OKLCH colour, its chroma lowered until it fits in sRGB."""
    L = max(0.0, min(1.0, L))
    while C > 0 and not all(-1e-4 <= c <= 1 + 1e-4 for c in linear(L, C, H)):
        C -= 0.002
    return pb.fmt(*pb.from_oklch(L, max(C, 0), H), 1)


def alpha(hex_, a):
    return hex_[:7] + '%02x' % round(a * 255)


def luminance(hex_):
    return sum(w * pb.lin(int(hex_[i:i + 2], 16) / 255) for w, i in ((0.2126, 1), (0.7152, 3), (0.0722, 5)))


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# The steps of each scale, as Sakura and Meadow have them: lightness (absolute,
# or for the accent relative to its own) and chroma relative to the base.
STEPS = [50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950]
BG_L = [.82, .72, .625, .55, .455, .39, .345, .305, .275, .245, .215, .18]
BG_C = [.68, .84, .92, .98, 1, .96, .88, .8, .72, .65, .56, .45]
ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
ACCENT_DL = [.26, .22, .17, .112, .057, 0, -.082, -.173, -.263, -.358, -.45]
ACCENT_C = [.14, .33, .6, .84, .95, 1, .95, .82, .67, .5, .35]
TEXT_L = [.988, .965, .944, .925, .905, .845, .781, .7, .614, .5, .368]
TEXT_C = [.45, .7, .88, 1, 1.12, 1.3, 1.45, 1.5, 1.48, 1.4, 1.1]


def scales(ground, accent, text):
    gL, gC, gH = oklch(ground)
    aL, aC, aH = oklch(accent)
    tL, tC, tH = oklch(text)
    peak = max(gC * 1.7, 0.03)
    bg = {s: hexc(L, peak * c, gH) for s, L, c in zip(STEPS, BG_L, BG_C)}
    primary = {s: hexc(aL + d, aC * c, aH) for s, d, c in zip(ACCENT_STEPS, ACCENT_DL, ACCENT_C)}
    tx = {s: hexc(L, tC * c, tH) for s, L, c in zip(ACCENT_STEPS, TEXT_L, TEXT_C)}
    return bg, primary, tx


def shade(hex_, dl, a=1.0):
    L, C, H = oklch(hex_)
    return alpha(hexc(L + dl, C, H), a)


# ---- the theme -------------------------------------------------------------

FONT = ('"JetBrainsMonoNL Nerd Font", "JetBrains Mono", "Cascadia Mono", ui-monospace, '
        '"SF Mono", Menlo, Consolas, monospace')


def tokens(cfg):
    accent = cfg['accent']
    aL, aC, aH = oklch(accent)
    ground = cfg.get('ground') or hexc(.21, min(aC * .2, .03), aH)
    text = cfg.get('text') or hexc(.933, min(aC * .15, .025), aH)
    bg, p, tx = scales(ground, accent, text)
    side = cfg.get('sidebar') or shade(ground, -.01)
    on = tx[50]
    # The fill under white text: the accent's 600, or its 700 if the 600 is too light for it.
    strong, strong_hover = (p[600], p[500]) if contrast(p[600], on) >= 3.6 else (p[700], p[600])
    solid = cfg.get('selected', 'solid') == 'solid'
    muted, subtle = tx[700], tx[600]
    t = {
        'color-scheme': 'dark',
        '--font-weight-normal': '400',
        '--font-sans': FONT,
        '--font-mono': FONT,
        '--ed-variable-width-font': 'var(--font-sans)',
        '--ed-monospace-font': 'var(--font-mono)',
    }
    for s, c in bg.items():
        t['--color-bg-%d' % s] = c
    t['--color-bg-500-50'] = alpha(bg[500], .5)
    t['--color-bg-950-50'] = alpha(bg[950], .65)
    for s, c in p.items():
        t['--color-primary-%d' % s] = c
    t.update({
        '--color-primary-400-10': alpha(p[400], .1),
        '--color-primary-400-70': alpha(p[400], .7),
        '--color-primary-200-50': alpha(p[200], .5),
        '--color-primary-950-20': alpha(p[950], .6),
        '--color-primary-text-100': on,
    })
    for s, c in tx.items():
        t['--color-text-%d' % s] = c
    stops = ', '.join('%s %s' % (alpha(ground, a), pos) for a, pos in cfg['veil']['stops'])
    t.update({
        '--text-default': text, '--text-subtle': subtle, '--text-muted': muted, '--text-xmuted': bg[200],
        '--text-hilite': tx[50], '--text-error': '#ff7a8a', '--text-ok': '#9ee0b4', '--text-warning': '#ffc58a',
        '--panel-fg-color': text, '--titlebar-fg-color': muted,

        '--wt-ground': ground,
        '--wt-chrome': shade(ground, -.025, .95),
        '--wt-side': alpha(side, .97),
        '--wt-veil': 'linear-gradient(%s, %s)' % (cfg['veil'].get('direction', 'to top right'), stops),
        '--wt-card': shade(ground, -.015, .72),
        '--wt-fill': alpha(p[100], .06), '--wt-fill-strong': alpha(p[100], .1),
        '--wt-hairline': alpha(p[200], .14), '--wt-hairline-strong': alpha(p[200], .25),
        '--wt-accent': p[400], '--wt-accent-soft': p[200],
        '--wt-chip-bg': alpha(p[500], .16), '--wt-chip-fg': p[100], '--wt-chip-border': alpha(p[300], .25),
        '--wt-pop': alpha(bg[800], .92),
        '--wt-shadow-pop': '0 0 0 0.5px %s, 0 2px 6px #0000007a, 0 18px 40px #000000a3' % alpha(p[200], .12),
        '--wt-thumb': alpha(p[200], .18), '--wt-thumb-active': alpha(p[200], .35),
        '--wt-focused-icon': '#ffffff' if solid else p[200],
        '--wt-title-style': 'italic' if cfg.get('title') == 'italic' else 'normal',
        '--wt-vignette-in': alpha(side, .28), '--wt-vignette-out': alpha(side, .88),

        '--panel-bg-color': bg[800], '--side-bg-color': bg[900], '--sidepanel-bg-color': bg[800],
        '--status-bg-color': 'transparent', '--titlebar-bg-color': 'transparent', '--tab-bg-color': 'transparent',
        '--tab-focused-bg-color': 'var(--wt-fill)', '--crumbnav-bg-color': 'transparent',
        '--banner-empty-bg': 'transparent',
        '--modal-bg': 'var(--wt-pop)', '--modal-bg-color': shade(ground, -.06, .65), '--modal-opaque-bg-color': bg[800],
        '--cmdpal-bg-color': 'var(--wt-pop)', '--cmdpal-inline-bg-color': 'var(--wt-pop)',
        '--cmdpal-border-color': 'var(--wt-hairline)', '--cmdpal-inline-border-color': 'var(--wt-hairline)',
        '--cmdpal-box-shadow': 'var(--wt-shadow-pop)',
        '--cmdpal-hover-bg-color': 'var(--wt-fill)', '--cmdpal-current-bg-color': 'var(--wt-fill)',
        '--cmdpal-selected-bg-color': alpha(strong, .85), '--cmdpal-selected-fg-color': on,
        '--cmdpal-inline-selected-bg': alpha(strong, .85), '--cmdpal-inline-selected-fg': on,
        '--cmdpal-hilite-color': p[200],
        '--cards-bg': 'var(--wt-card)', '--cards-hover-bg': alpha(bg[800], .8), '--cards-bg-focused': alpha(bg[700], .85),
        '--cards-border-color': 'var(--wt-hairline)', '--cards-border-color-focused': 'var(--wt-hairline-strong)',
        '--toaster-bg-color': 'var(--wt-pop)', '--toaster-border-color': 'var(--wt-hairline)',
        '--tooltip-bg-color': 'var(--wt-pop)', '--tooltip-border-color': 'var(--wt-hairline)', '--tooltip-fg-color': text,
        '--link-menu-bg-color': 'var(--wt-pop)',

        '--input-bg-color': 'var(--wt-fill)', '--input-border-color': 'var(--wt-hairline)',
        '--input-border': '1px solid var(--wt-hairline)', '--input-border-focus': '1px solid var(--wt-accent)',
        '--button-fg-color': text, '--button-bg-color': 'var(--wt-fill)',
        '--button-bg-hover-color': 'var(--wt-fill-strong)', '--button-bg-active-color': 'var(--wt-fill-strong)',
        '--button-border-color': 'var(--wt-hairline)', '--button-border-hover-color': 'var(--wt-hairline-strong)',
        '--button-minimal-bg-color': 'transparent', '--button-minimal-bg-active-color': 'var(--wt-fill-strong)',
        '--button-minimal-hover-color': 'var(--wt-fill)',
        '--button-primary-bg-color': strong, '--button-primary-bg-hover-color': strong_hover,
        '--button-primary-border-color': alpha(p[200], .2), '--button-primary-fg-color': on,
        '--button-group-bg': 'var(--wt-fill)', '--button-group-border': 'transparent',

        '--selection-bg': strong, '--selection-fg': on, '--select-bg-color': strong,
        '--ed-selection-self-bg': alpha(p[500], .32), '--ed-caret-self-fg': p[300],
        '--focus-outline-color': alpha(p[400], .6),
        '--link-color': p[300], '--link-hover-color': p[200], '--ed-link-color': p[300], '--switch-active-bg': p[600],

        '--side-fg-color': tx[500], '--side-icon-color': muted, '--sidebar-heading': muted,
        '--side-fg-focus': on, '--side-fg-active-focus': on, '--sidebar-fg-hover': tx[100],
        '--sidebar-bg-hover': 'var(--wt-fill)',
        '--side-bg-focus': alpha(strong, .78) if solid else alpha(p[300], .14),
        '--side-bg-active-focus': alpha(strong, .88) if solid else alpha(p[300], .2),
        '--sidebar-toggler-bg': 'transparent', '--sidebar-toggler-border': 'transparent',
        '--sidebar-toggler-color': muted,
        '--hover-subtle': 'var(--wt-fill)', '--table-header-bg': 'var(--wt-fill)', '--table-row-hover-bg': 'var(--wt-fill)',
        '--prop-bg-hover': 'var(--wt-fill)', '--prop-bg-focused': 'var(--wt-fill-strong)',
        '--prop-bg-focused-focused': 'var(--wt-fill-strong)', '--prop-bg-focused-inactive-panel': 'var(--wt-fill)',
        '--prop-table-cell-border': 'var(--wt-hairline)',

        '--divider-color': 'var(--wt-hairline)', '--thin-divider-color': alpha(p[200], .09),
        '--faint-divider-color': alpha(p[200], .04), '--sidebar-divider-color': 'var(--wt-hairline)',
        '--panel-title-bottom-border': 'transparent', '--panel-sizer-bg-color': 'transparent',
        '--panel-sizer-border-color': 'var(--wt-hairline)', '--panel-sizer-hover-border-color': p[400],
        '--status-border-color': 'var(--wt-hairline)', '--titlebar-border-color': 'var(--wt-hairline)',
        '--statusbar-fg': muted, '--statusbar-hover-bg': 'var(--wt-fill)',
        '--kbd-bg': 'var(--wt-fill-strong)', '--kbd-fg': subtle, '--shadow-dialog': 'var(--wt-shadow-pop)',

        '--ed-code-bg': 'var(--wt-chip-bg)', '--ed-code-border': 'var(--wt-chip-border)',
        '--ed-container-bg-color': shade(ground, -.06, cfg.get('code_alpha', .7)),
        '--ed-container-bg-color-hover': shade(ground, -.06, min(1, cfg.get('code_alpha', .7) + .08)),
        '--ed-container-border-color': 'var(--wt-hairline)', '--ed-quote-border-color': p[400],
        '--ed-hashtag-color': p[200], '--ed-hashtag-bg': 'var(--wt-chip-bg)',
        '--ed-datetime-color': p[200], '--ed-datetime-bg': 'var(--wt-chip-bg)',
        '--ed-mention-color': p[200], '--ed-mention-bg': 'var(--wt-chip-bg)',
        '--ed-ref-icon-fg': p[300], '--ed-inlineref-fg': p[300], '--ed-inlineref-icon-fg': p[300],
        '--ed-inlineref-underline': p[300], '--ed-check-div-border': p[400], '--ed-check-done-bg': p[600],
        '--ed-indent-line-color': alpha(p[200], .15), '--ed-gray-text': muted, '--ed-list-counter-color': p[400],

        '--radius-normal': '7px', '--radius-larger': '10px', '--radius-xlarge': '14px', '--modal-radius': '16px',
        '--prop-status-radius': '7px', '--scrollbar-radius': '999px',
    })
    syntax = {'meta': p[300], 'keyword': p[300], 'type': '#9fdcc4', 'title': tx[200],
              'string': p[200], 'number': '#ffc98f', 'comment': muted}
    syntax.update(cfg.get('syntax', {}))
    for k, v in syntax.items():
        t['--wt-syn-' + k] = v
    wp = cfg['wallpaper']
    t['--wt-wallpaper-position'] = wp.get('position', '50% 50%')
    t['--wt-wallpaper-size'] = wp.get('size', 'cover')
    t.update(cfg.get('tokens', {}))
    return t, ground


def data_uri(path):
    ext = os.path.splitext(path)[1].lower().lstrip('.')
    mime = {'jpg': 'jpeg', 'jpeg': 'jpeg', 'png': 'png', 'webp': 'webp'}[ext]
    return 'url("data:image/%s;base64,%s")' % (mime, base64.b64encode(open(path, 'rb').read()).decode())


def svg_uri(name):
    svg = open(os.path.join(KIT, 'icons', name + '.svg')).read().strip()
    return 'url("data:image/svg+xml,%s")' % urllib.parse.quote(svg, safe=" ='/:;,.-")


def material(theme_id, flags):
    css = open(os.path.join(KIT, 'material.css')).read()
    css = re.sub(r'/\* @if (\w+) \*/\n(.*?)/\* @end \*/\n',
                 lambda m: m.group(2) if flags.get(m.group(1)) else '', css, flags=re.S)
    return css.replace('THEME', theme_id)


def build_theme(folder, rules):
    cfg = json.load(open(os.path.join(folder, 'theme.json')))
    name = cfg['name']
    theme_id = 'thymer-' + name.lower()
    tok, ground = tokens(cfg)
    pb.NEUTRAL_HUE, pb.NEUTRAL_CHROMA = oklch(ground)[2], 0.02
    pb.ACCENT_HUE = oklch(cfg['accent'])[2]

    images = {'--wt-wallpaper': data_uri(os.path.join(folder, cfg['wallpaper']['file']))}
    if cfg.get('portrait'):
        images['--wt-portrait'] = data_uri(os.path.join(folder, cfg['portrait']))
    icons = cfg.get('icons', {})
    for h in ('h2', 'h3'):
        if icons.get(h):
            images['--wt-%s-icon' % h] = svg_uri(icons[h])

    css = '/* ===== %s theme start =====\n   Generated by themes/kit/build.py from themes/%s/theme.json%s.\n' % (
        name, os.path.basename(folder), ': ' + cfg['description'] if cfg.get('description') else '')
    css += '   Do not edit by hand; edit theme.json (or extra.css) and build again. */\n'
    css += '\n' + pb.build(rules, theme_id, 'thymer-dark-sans', tok)
    css += '\nhtml[data-theme="%s"]{%s}\n' % (theme_id, ';'.join('%s:%s' % kv for kv in images.items()))
    css += '\n' + material(theme_id, {
        'hide_banners': cfg.get('hide_banners', True),
        'portrait': bool(cfg.get('portrait')),
        'h2_icon': bool(icons.get('h2')),
        'h3_icon': bool(icons.get('h3')),
    })
    extra = os.path.join(folder, 'extra.css')
    if os.path.exists(extra):
        css += '\n' + open(extra).read()
    css += '/* ===== %s theme end ===== */\n' % name
    out = os.path.join(folder, name.lower() + '.css')
    open(out, 'w').write(css)
    print('%s: %d bytes' % (os.path.relpath(out), len(css)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('names', nargs='*', help='theme folders in themes/ (default: all with a theme.json)')
    ap.add_argument('--app-css', help="Thymer's app.css (default: from the desktop app's cache)")
    a = ap.parse_args()
    names = a.names or sorted(d for d in os.listdir(THEMES) if os.path.exists(os.path.join(THEMES, d, 'theme.json')))
    sys.argv[1:] = [a.app_css] if a.app_css else []  # read_app_css takes its path from argv
    rules, _ = pb.parse(re.sub(r'/\*.*?\*/', '', pb.read_app_css(), flags=re.S))
    for n in names:
        folder = os.path.join(THEMES, n)
        if not os.path.exists(os.path.join(folder, 'theme.json')):
            sys.exit('no theme.json in ' + folder)
        build_theme(folder, rules)


if __name__ == '__main__':
    main()
