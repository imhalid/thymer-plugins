#!/usr/bin/env python3
"""Builds wallpaper themes (Sakura, Meadow, ...) from a picture and a few colours.

A wallpaper theme is a folder themes/<name>/ holding a theme.json and,
usually, a wallpaper; a theme drawn in CSS and SVG alone (Blueprint) leaves the
wallpaper out and lays its own ground in extra.css. From the theme's accent (and, if it gives them, its ground and
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

theme.json (only "name" and "accent" are required):

    name            the label in Thymer's theme picker; the id is thymer-<name in lower case>
    description     a line for the header comment
    accent          the accent, as #rrggbb; its scale is primary-50 .. primary-950
    scheme          "dark" (default: Dark Sans, a veil of the ground over the wallpaper)
                    or "light" (Light Sans, ink on paper)
    ground          the veil's colour (default: a very dark tint of the accent); in a
                    light theme what lies around the page (default: the paper, darker)
    paper           a light theme's page, and the veil's colour (default #fbf8f1)
    text            the body text (default: a pale tint of the accent; a light theme's ink)
    sidebar         the sidebar's colour (default: the ground, a little darker)
    wallpaper       {"file", "position", "size"}: the picture and its CSS framing
                    (default position "50% 50%", size "cover"); without one the
                    ground is a plain colour, for extra.css to draw on
    veil            {"direction", "stops": [[alpha, "pos"], ...]}: the page's veil,
                    the ground at each alpha (0..1) along the direction
    selected        "solid" (the open page is an accent fill) or "soft" (a tint)
    title           "italic" or "upright"
    icons           {"h2": name, "h3": name}: kit/icons/<name>.svg before those headings
    portrait        a picture behind Achievements' character, vignetted in the sidebar's colour
    syntax          {"meta", "keyword", "type", "title", "string", "number", "comment"}
    code_alpha      how solid code blocks are, 0..1 (default 0.7; in a light theme
                    how much ink tints them, default 0.05)
    hide_banners    hide banners and Auto Banner's scenes (default true)
    images          {"--variable": "file"}: pictures in the theme's folder (SVG too),
                    embedded as data URIs for extra.css to use
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


def mix(a, b, t):
    """The colour t of the way from a to b, in OKLCH."""
    (aL, aC, aH), (bL, bC, bH) = oklch(a), oklch(b)
    dh = (bH - aH + 180) % 360 - 180
    return hexc(aL + (bL - aL) * t, aC + (bC - aC) * t, aH + dh * t)


def dark_palette(cfg):
    """Every colour a dark theme needs: the page a veil over the ground."""
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
    scale = {}
    for s, c in bg.items():
        scale['--color-bg-%d' % s] = c
    scale['--color-bg-500-50'] = alpha(bg[500], .5)
    scale['--color-bg-950-50'] = alpha(bg[950], .65)
    for s, c in p.items():
        scale['--color-primary-%d' % s] = c
    scale.update({
        '--color-primary-400-10': alpha(p[400], .1),
        '--color-primary-400-70': alpha(p[400], .7),
        '--color-primary-200-50': alpha(p[200], .5),
        '--color-primary-950-20': alpha(p[950], .6),
        '--color-primary-text-100': on,
    })
    for s, c in tx.items():
        scale['--color-text-%d' % s] = c
    return {
        'scheme': 'dark', 'scale': scale, 'p': p, 'ground': ground, 'veil_colour': ground,
        'text': text, 'subtle': subtle, 'muted': muted, 'xmuted': bg[200], 'hilite': tx[50], 'on': on,
        'error': '#ff7a8a', 'ok': '#9ee0b4', 'warning': '#ffc58a',
        'strong': strong, 'strong_hover': strong_hover,
        'chrome': shade(ground, -.025, .95), 'side': alpha(side, .97), 'card': shade(ground, -.015, .72),
        'fill': alpha(p[100], .06), 'fill_strong': alpha(p[100], .1),
        'hairline': alpha(p[200], .14), 'hairline_strong': alpha(p[200], .25),
        'thin': alpha(p[200], .09), 'faint': alpha(p[200], .04),
        'accent': p[400], 'accent_soft': p[200],
        'chip_bg': alpha(p[500], .16), 'chip_fg': p[100], 'chip_border': alpha(p[300], .25),
        'pop': alpha(bg[800], .92),
        'shadow_pop': '0 0 0 0.5px %s, 0 2px 6px #0000007a, 0 18px 40px #000000a3' % alpha(p[200], .12),
        'thumb': alpha(p[200], .18), 'thumb_active': alpha(p[200], .35),
        'focused_icon': '#ffffff' if solid else p[200],
        'vignette_in': alpha(side, .28), 'vignette_out': alpha(side, .88),
        'panel_bg': bg[800], 'side_bg': bg[900], 'modal_bg': shade(ground, -.06, .65), 'opaque': bg[800],
        'cards_hover': alpha(bg[800], .8), 'cards_focused': alpha(bg[700], .85),
        'primary_border': alpha(p[200], .2), 'self_selection': alpha(p[500], .32), 'caret': p[300],
        'focus': alpha(p[400], .6), 'link': p[300], 'link_hover': p[200], 'switch': p[600],
        'side_fg': tx[500], 'side_fg_hover': tx[100],
        'side_focus': alpha(strong, .78) if solid else alpha(p[300], .14),
        'side_active_focus': alpha(strong, .88) if solid else alpha(p[300], .2),
        'sizer_hover': p[400],
        'container': shade(ground, -.06, cfg.get('code_alpha', .7)),
        'container_hover': shade(ground, -.06, min(1, cfg.get('code_alpha', .7) + .08)),
        'tint': p[200], 'ref': p[300], 'mark': p[400], 'check_done': p[600], 'indent': alpha(p[200], .15),
        'syntax': {'meta': p[300], 'keyword': p[300], 'type': '#9fdcc4', 'title': tx[200],
                   'string': p[200], 'number': '#ffc98f', 'comment': muted},
    }


def light_palette(cfg):
    """Every colour a light theme needs: ink on a paper page over the ground.
    Light Sans keeps its own grey scales (warmed to the paper's hue); only
    the accent's scale is the theme's."""
    accent = cfg['accent']
    paper = cfg.get('paper') or '#fbf8f1'
    ground = cfg.get('ground') or shade(paper, -.08)
    ink = cfg.get('text') or '#2b2723'
    _, p, _ = scales(ground, accent, ink)
    side = cfg.get('sidebar') or shade(paper, -.03)
    on = '#ffffff'
    strong, strong_hover = (p[600], p[700]) if contrast(p[600], on) >= 3.6 else (p[700], p[800])
    solid = cfg.get('selected', 'solid') == 'solid'
    muted, subtle = mix(ink, paper, .45), mix(ink, paper, .25)
    scale = {}
    for s, c in p.items():
        scale['--color-primary-%d' % s] = c
    scale.update({
        '--color-primary-400-10': alpha(p[400], .1),
        '--color-primary-400-70': alpha(p[400], .7),
        '--color-primary-200-50': alpha(p[200], .5),
        '--color-primary-950-20': alpha(p[950], .2),
        '--color-primary-text-100': ink,
    })
    code_alpha = cfg.get('code_alpha', .05)
    return {
        'scheme': 'light', 'scale': scale, 'p': p, 'ground': ground, 'veil_colour': paper,
        'text': ink, 'subtle': subtle, 'muted': muted, 'xmuted': mix(ink, paper, .62), 'hilite': shade(ink, -.06),
        'on': on, 'error': '#c8323f', 'ok': '#2f8a4c', 'warning': '#b8650f',
        'strong': strong, 'strong_hover': strong_hover,
        'chrome': shade(ground, -.03), 'side': side, 'card': alpha(paper, .92),
        'fill': alpha(ink, .05), 'fill_strong': alpha(ink, .09),
        'hairline': alpha(ink, .12), 'hairline_strong': alpha(ink, .22),
        'thin': alpha(ink, .08), 'faint': alpha(ink, .04),
        'accent': p[500], 'accent_soft': p[700],
        'chip_bg': alpha(p[400], .16), 'chip_fg': p[800], 'chip_border': alpha(p[500], .3),
        'pop': alpha(paper, .98),
        'shadow_pop': '0 0 0 1px %s, 0 2px 6px #0000001a, 0 16px 36px #00000024' % alpha(ink, .1),
        'thumb': alpha(ink, .18), 'thumb_active': alpha(ink, .32),
        'focused_icon': '#ffffff' if solid else p[700],
        'vignette_in': alpha(side, .2), 'vignette_out': alpha(side, .8),
        'panel_bg': paper, 'side_bg': side, 'modal_bg': alpha(ink, .25), 'opaque': paper,
        'cards_hover': shade(paper, -.02), 'cards_focused': shade(paper, -.04),
        'primary_border': alpha(p[800], .25), 'self_selection': alpha(p[300], .45), 'caret': p[700],
        'focus': alpha(p[500], .55), 'link': p[700], 'link_hover': p[800], 'switch': p[600],
        'side_fg': mix(ink, side, .12), 'side_fg_hover': ink,
        'side_focus': alpha(strong, .9) if solid else alpha(p[400], .22),
        'side_active_focus': strong if solid else alpha(p[400], .3),
        'sizer_hover': p[500],
        'container': alpha(ink, code_alpha), 'container_hover': alpha(ink, code_alpha + .02),
        'tint': p[700], 'ref': p[700], 'mark': p[600], 'check_done': p[600], 'indent': alpha(ink, .12),
        'syntax': {'meta': p[700], 'keyword': p[700], 'type': '#2f7d6d', 'title': ink,
                   'string': '#a3452f', 'number': '#b5651d', 'comment': muted},
    }


def tokens(cfg):
    c = (light_palette if cfg.get('scheme') == 'light' else dark_palette)(cfg)
    p, text, muted, subtle, on, strong = c['p'], c['text'], c['muted'], c['subtle'], c['on'], c['strong']
    t = {
        'color-scheme': c['scheme'],
        '--font-weight-normal': '400',
        '--font-sans': FONT,
        '--font-mono': FONT,
        '--ed-variable-width-font': 'var(--font-sans)',
        '--ed-monospace-font': 'var(--font-mono)',
    }
    t.update(c['scale'])
    stops = ', '.join('%s %s' % (alpha(c['veil_colour'], a), pos) for a, pos in cfg['veil']['stops'])
    t.update({
        '--text-default': text, '--text-subtle': subtle, '--text-muted': muted, '--text-xmuted': c['xmuted'],
        '--text-hilite': c['hilite'], '--text-error': c['error'], '--text-ok': c['ok'], '--text-warning': c['warning'],
        '--panel-fg-color': text, '--titlebar-fg-color': muted,

        '--wt-ground': c['ground'],
        '--wt-chrome': c['chrome'],
        '--wt-side': c['side'],
        '--wt-veil': 'linear-gradient(%s, %s)' % (cfg['veil'].get('direction', 'to top right'), stops),
        '--wt-card': c['card'],
        '--wt-fill': c['fill'], '--wt-fill-strong': c['fill_strong'],
        '--wt-hairline': c['hairline'], '--wt-hairline-strong': c['hairline_strong'],
        '--wt-accent': c['accent'], '--wt-accent-soft': c['accent_soft'],
        '--wt-chip-bg': c['chip_bg'], '--wt-chip-fg': c['chip_fg'], '--wt-chip-border': c['chip_border'],
        '--wt-pop': c['pop'],
        '--wt-shadow-pop': c['shadow_pop'],
        '--wt-thumb': c['thumb'], '--wt-thumb-active': c['thumb_active'],
        '--wt-focused-icon': c['focused_icon'],
        '--wt-title-style': 'italic' if cfg.get('title') == 'italic' else 'normal',
        '--wt-vignette-in': c['vignette_in'], '--wt-vignette-out': c['vignette_out'],

        '--panel-bg-color': c['panel_bg'], '--side-bg-color': c['side_bg'], '--sidepanel-bg-color': c['panel_bg'],
        '--status-bg-color': 'transparent', '--titlebar-bg-color': 'transparent', '--tab-bg-color': 'transparent',
        '--tab-focused-bg-color': 'var(--wt-fill)', '--crumbnav-bg-color': 'transparent',
        '--banner-empty-bg': 'transparent',
        '--modal-bg': 'var(--wt-pop)', '--modal-bg-color': c['modal_bg'], '--modal-opaque-bg-color': c['opaque'],
        '--cmdpal-bg-color': 'var(--wt-pop)', '--cmdpal-inline-bg-color': 'var(--wt-pop)',
        '--cmdpal-border-color': 'var(--wt-hairline)', '--cmdpal-inline-border-color': 'var(--wt-hairline)',
        '--cmdpal-box-shadow': 'var(--wt-shadow-pop)',
        '--cmdpal-hover-bg-color': 'var(--wt-fill)', '--cmdpal-current-bg-color': 'var(--wt-fill)',
        '--cmdpal-selected-bg-color': alpha(strong, .85), '--cmdpal-selected-fg-color': on,
        '--cmdpal-inline-selected-bg': alpha(strong, .85), '--cmdpal-inline-selected-fg': on,
        '--cmdpal-hilite-color': c['tint'],
        '--cards-bg': 'var(--wt-card)', '--cards-hover-bg': c['cards_hover'], '--cards-bg-focused': c['cards_focused'],
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
        '--button-primary-bg-color': strong, '--button-primary-bg-hover-color': c['strong_hover'],
        '--button-primary-border-color': c['primary_border'], '--button-primary-fg-color': on,
        '--button-group-bg': 'var(--wt-fill)', '--button-group-border': 'transparent',

        '--selection-bg': strong, '--selection-fg': on, '--select-bg-color': strong,
        '--ed-selection-self-bg': c['self_selection'], '--ed-caret-self-fg': c['caret'],
        '--focus-outline-color': c['focus'],
        '--link-color': c['link'], '--link-hover-color': c['link_hover'], '--ed-link-color': c['link'],
        '--switch-active-bg': c['switch'],

        '--side-fg-color': c['side_fg'], '--side-icon-color': muted, '--sidebar-heading': muted,
        '--side-fg-focus': on, '--side-fg-active-focus': on, '--sidebar-fg-hover': c['side_fg_hover'],
        '--sidebar-bg-hover': 'var(--wt-fill)',
        '--side-bg-focus': c['side_focus'],
        '--side-bg-active-focus': c['side_active_focus'],
        '--sidebar-toggler-bg': 'transparent', '--sidebar-toggler-border': 'transparent',
        '--sidebar-toggler-color': muted,
        # The page's own buttons (back, forward, lock, split, close): bare glyphs in the
        # muted ink, a tint of the theme's fill under the one the mouse is on.
        '--panel-title-icon-inactive-bg': 'transparent', '--panel-title-icon-active-bg': 'transparent',
        '--panel-title-icon-disabled-bg': 'transparent',
        '--panel-title-icon-inactive-fg': alpha(text, .3), '--panel-title-icon-active-fg': muted,
        '--panel-title-icon-disabled-fg': alpha(text, .2),
        '--panel-icon-hover-bg': 'var(--wt-fill-strong)', '--panel-icon-hover-color': text,
        '--crumbnav-icon-hover-bg': 'var(--panel-icon-hover-bg)',
        '--hover-subtle': 'var(--wt-fill)', '--table-header-bg': 'var(--wt-fill)', '--table-row-hover-bg': 'var(--wt-fill)',
        '--prop-bg-hover': 'var(--wt-fill)', '--prop-bg-focused': 'var(--wt-fill-strong)',
        '--prop-bg-focused-focused': 'var(--wt-fill-strong)', '--prop-bg-focused-inactive-panel': 'var(--wt-fill)',
        '--prop-table-cell-border': 'var(--wt-hairline)',

        '--divider-color': 'var(--wt-hairline)', '--thin-divider-color': c['thin'],
        '--faint-divider-color': c['faint'], '--sidebar-divider-color': 'var(--wt-hairline)',
        '--panel-title-bottom-border': 'transparent', '--panel-sizer-bg-color': 'transparent',
        '--panel-sizer-border-color': 'var(--wt-hairline)', '--panel-sizer-hover-border-color': c['sizer_hover'],
        '--status-border-color': 'var(--wt-hairline)', '--titlebar-border-color': 'var(--wt-hairline)',
        '--statusbar-fg': muted, '--statusbar-hover-bg': 'var(--wt-fill)',
        '--kbd-bg': 'var(--wt-fill-strong)', '--kbd-fg': subtle, '--shadow-dialog': 'var(--wt-shadow-pop)',

        '--ed-code-bg': 'var(--wt-chip-bg)', '--ed-code-border': 'var(--wt-chip-border)',
        '--ed-container-bg-color': c['container'],
        '--ed-container-bg-color-hover': c['container_hover'],
        '--ed-container-border-color': 'var(--wt-hairline)', '--ed-quote-border-color': c['mark'],
        '--ed-hashtag-color': c['tint'], '--ed-hashtag-bg': 'var(--wt-chip-bg)',
        '--ed-datetime-color': c['tint'], '--ed-datetime-bg': 'var(--wt-chip-bg)',
        '--ed-mention-color': c['tint'], '--ed-mention-bg': 'var(--wt-chip-bg)',
        '--ed-ref-icon-fg': c['ref'], '--ed-inlineref-fg': c['ref'], '--ed-inlineref-icon-fg': c['ref'],
        '--ed-inlineref-underline': c['ref'], '--ed-check-div-border': c['mark'], '--ed-check-done-bg': c['check_done'],
        '--ed-indent-line-color': c['indent'], '--ed-gray-text': muted, '--ed-list-counter-color': c['mark'],

        '--radius-normal': '7px', '--radius-larger': '10px', '--radius-xlarge': '14px', '--modal-radius': '16px',
        '--prop-status-radius': '7px', '--scrollbar-radius': '999px',
    })
    syntax = dict(c['syntax'])
    syntax.update(cfg.get('syntax', {}))
    for k, v in syntax.items():
        t['--wt-syn-' + k] = v
    wp = cfg.get('wallpaper', {})
    t['--wt-wallpaper-position'] = wp.get('position', '50% 50%')
    t['--wt-wallpaper-size'] = wp.get('size', 'cover')
    t.update(cfg.get('tokens', {}))
    return t, c['ground']


def data_uri(path):
    ext = os.path.splitext(path)[1].lower().lstrip('.')
    if ext == 'svg':
        return svg_data(open(path).read())
    mime = {'jpg': 'jpeg', 'jpeg': 'jpeg', 'png': 'png', 'webp': 'webp'}[ext]
    return 'url("data:image/%s;base64,%s")' % (mime, base64.b64encode(open(path, 'rb').read()).decode())


def svg_data(svg):
    svg = re.sub(r'>\s+<', '><', svg.strip())
    return 'url("data:image/svg+xml,%s")' % urllib.parse.quote(svg, safe=" ='/:;,.-")


def svg_uri(name):
    return svg_data(open(os.path.join(KIT, 'icons', name + '.svg')).read())


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
    light = cfg.get('scheme') == 'light'
    # Thymer's greys take the hue of what is under the writing: the ground, or a light theme's paper.
    pb.NEUTRAL_HUE, pb.NEUTRAL_CHROMA = oklch(cfg.get('paper') or ground if light else ground)[2], 0.02
    pb.ACCENT_HUE = oklch(cfg['accent'])[2]

    wallpaper = cfg.get('wallpaper')
    images = {'--wt-wallpaper': data_uri(os.path.join(folder, wallpaper['file'])) if wallpaper else 'none'}
    for var, f in cfg.get('images', {}).items():
        images[var] = data_uri(os.path.join(folder, f))
    if cfg.get('portrait'):
        images['--wt-portrait'] = data_uri(os.path.join(folder, cfg['portrait']))
    icons = cfg.get('icons', {})
    for h in ('h2', 'h3'):
        if icons.get(h):
            images['--wt-%s-icon' % h] = svg_uri(icons[h])

    css = '/* ===== %s theme start =====\n   Generated by themes/kit/build.py from themes/%s/theme.json%s.\n' % (
        name, os.path.basename(folder), ': ' + cfg['description'] if cfg.get('description') else '')
    css += '   Do not edit by hand; edit theme.json (or extra.css) and build again. */\n'
    css += '\n' + pb.build(rules, theme_id, 'thymer-light-sans' if light else 'thymer-dark-sans', tok)
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
