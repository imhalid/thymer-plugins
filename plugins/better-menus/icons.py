#!/usr/bin/env python3
"""Builds BetterMenus' duotone icon block and writes it into plugin.css between the ICONS markers.

    python3 plugins/better-menus/icons.py

Each icon is two 24x24 masks: a soft back layer (drawn at low opacity) and a crisp front layer, both
painted with the icon's hue, so light and dark themes only change the color. Icons not listed here
keep Tabler's glyph, sitting in the same chip.
"""
import os
import re
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
CSS = os.path.join(HERE, 'plugin.css')

HUES = {
    'blue': '#60a5fa', 'green': '#34d399', 'violet': '#a78bfa', 'cyan': '#22d3ee', 'amber': '#fbbf24',
    'red': '#f87171', 'orange': '#fb923c', 'pink': '#f472b6', 'zinc': '#a1a1aa',
}

S = "fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'"


def p(d):
    return f"<path d='{d}' {S}/>"


def f(d):
    return f"<path d='{d}' fill='black'/>"


def rect(x, y, w, h, r, fill=False):
    return f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='{r}' " + ("fill='black'/>" if fill else f"{S}/>")


def circ(cx, cy, r, fill=False):
    return f"<circle cx='{cx}' cy='{cy}' r='{r}' " + ("fill='black'/>" if fill else f"{S}/>")


DOC = 'M7 3.5h7l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z'
H = 'M4.5 6v12 M11.5 6v12 M4.5 12h7'
STAR = 'M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z'
TRI = 'M10.3 4.3L2.9 17.2a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z'

# name: (hue, back layer, front layer)
ICONS = {
    # text and formatting
    'letter-t': ('blue', rect(4, 4, 16, 16, 4, True), p('M8.5 8.5h7 M12 8.5v8')),
    'letter-case': ('blue', circ(16.5, 14.3, 2.6, True), p('M3.5 17.5l4-10 4 10 M5 14h5') + circ(16.5, 14.3, 2.6) + p('M19.1 11.5v6')),
    'h-1': ('blue', rect(2.5, 4.5, 11, 15, 3, True), p(H) + p('M16.5 9.5l2.2-1.5v10')),
    'h-2': ('blue', rect(2.5, 4.5, 11, 15, 3, True), p(H) + p('M15.8 10a2.1 2.1 0 0 1 4.2.3c0 1.7-4.2 3.6-4.2 7.2h4.2')),
    'h-3': ('blue', rect(2.5, 4.5, 11, 15, 3, True), p(H) + p('M15.8 8.8h4.2l-2.4 3.2a2.5 2.5 0 1 1-2 4.3')),
    'h-4': ('blue', rect(2.5, 4.5, 11, 15, 3, True), p(H) + p('M18.8 17.5V8.5l-3.6 6h4.8')),
    'h-5': ('blue', rect(2.5, 4.5, 11, 15, 3, True), p(H) + p('M20 8.8h-3.8l-.4 3.6a2.6 2.6 0 1 1-.3 3.9')),
    'h-6': ('blue', rect(2.5, 4.5, 11, 15, 3, True), p(H) + circ(17.9, 15.2, 2.3) + p('M19.6 9.1a2.3 2.3 0 0 0-3.9 1.7v4.4')),
    'quote': ('blue', rect(3.5, 4.5, 17, 15, 3.5, True), p('M7.5 8v8 M11.5 9.5h5.5 M11.5 14.5h3.5')),
    'bold': ('blue', f('M7 5h6a3.5 3.5 0 0 1 0 7H7z M7 12h7a3.5 3.5 0 0 1 0 7H7z'), p('M7 5h6a3.5 3.5 0 0 1 0 7H7z M7 12h7a3.5 3.5 0 0 1 0 7H7z')),
    'italic': ('blue', f('M10.6 5h3.6l-3.9 14H6.7z'), p('M11 5h6 M7 19h6 M14 5l-4 14')),
    # lists and tasks
    'list': ('green', rect(8.5, 4.5, 13, 15, 3, True), p('M11 7.5h8 M11 12h8 M11 16.5h8') + circ(5, 7.5, 1.4, True) + circ(5, 12, 1.4, True) + circ(5, 16.5, 1.4, True)),
    'list-numbers': ('green', rect(9, 4.5, 12.5, 15, 3, True), p('M11.5 7.5h7.5 M11.5 12h7.5 M11.5 16.5h7.5 M4.5 6.2l1.6-1v4.6 M4 14.6a1.6 1.6 0 0 1 3.2.2c0 1-3.2 2-3.2 3.7h3.2')),
    'checkbox': ('green', rect(4, 4, 16, 16, 4.5, True), rect(4, 4, 16, 16, 4.5) + p('M8.4 12.3l2.5 2.5 4.8-5.3')),
    'check': ('green', circ(12, 12, 8.5, True), p('M7.5 12.5l3 3 6-6.5')),
    # blocks you insert
    'photo': ('violet', f('M3.5 16l4.6-4.6a1.5 1.5 0 0 1 2.1 0l3.3 3.3 1.8-1.8a1.5 1.5 0 0 1 2.1 0l3.1 3.1v1.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5z'), rect(3.5, 4.5, 17, 15, 3) + circ(9, 9.5, 1.5, True)),
    'paperclip': ('violet', f(DOC), p('M15 8.5l-5.6 5.6a1.4 1.4 0 0 0 2 2l5.6-5.6a2.8 2.8 0 0 0-4-4l-5.6 5.6a4.2 4.2 0 0 0 6 6l5.6-5.6')),
    'table': ('violet', f('M3.5 7a2.5 2.5 0 0 1 2.5-2.5h12A2.5 2.5 0 0 1 20.5 7v3h-17z'), rect(3.5, 4.5, 17, 15, 2.5) + p('M3.5 10h17 M10 10v9.5')),
    'code': ('violet', rect(2.5, 4, 19, 16, 4, True), p('M8.5 8.5L5 12l3.5 3.5 M15.5 8.5L19 12l-3.5 3.5 M13.3 7l-2.6 10')),
    'terminal': ('violet', rect(3, 4.5, 18, 15, 3.5, True), rect(3, 4.5, 18, 15, 3.5) + p('M7.5 9.5l2.5 2.5-2.5 2.5 M12.5 15H16.5')),
    'filter-search': ('violet', f('M4 5h16l-6 7v3.5l-4 2V12z'), p('M4 5h16l-6 7v2 M10 12v5.5l2-1') + circ(17.5, 17, 2.3) + p('M19.2 18.7l1.8 1.8')),
    'blocks': ('violet', rect(13, 13, 7.5, 7.5, 2, True), rect(3.5, 3.5, 7.5, 7.5, 2) + rect(13, 3.5, 7.5, 7.5, 2) + rect(3.5, 13, 7.5, 7.5, 2) + rect(13, 13, 7.5, 7.5, 2)),
    'line-dotted': ('violet', rect(2, 8, 20, 8, 4, True), ''.join(circ(x, 12, 1.35, True) for x in (5, 9.5, 14.5, 19))),
    'app-window': ('violet', f('M3.5 7a2.5 2.5 0 0 1 2.5-2.5h12A2.5 2.5 0 0 1 20.5 7v2h-17z'), rect(3.5, 4.5, 17, 15, 2.5) + p('M3.5 9h17') + circ(6.3, 6.8, 0.9, True) + circ(9, 6.8, 0.9, True)),
    'arrows-diagonal': ('violet', rect(6, 6, 12, 12, 3, True), p('M15 4h5v5 M20 4l-5.5 5.5 M9 20H4v-5 M4 20l5.5-5.5')),
    'box': ('violet', f('M12 3.2l8 4.3v9l-8 4.3-8-4.3v-9z'), p('M12 3.2l8 4.3v9l-8 4.3-8-4.3v-9z M4 7.5l8 4.3 8-4.3 M12 11.8v9')),
    # pages and navigation
    'file-text': ('cyan', f(DOC), p(DOC + ' M14 3.5V8a.5.5 0 0 0 .5.5H19 M9 13h6 M9 16.5h4')),
    'files': ('cyan', f('M9 6.5h5.5l4 4V18a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 18V8A1.5 1.5 0 0 1 9 6.5z'), p('M9 6.5h5.5l4 4V18a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 18V8A1.5 1.5 0 0 1 9 6.5z M14.5 6.5v4h4 M15.5 6.5V5A1.5 1.5 0 0 0 14 3.5H6A1.5 1.5 0 0 0 4.5 5v10A1.5 1.5 0 0 0 6 16.5h1.5')),
    'file-plus': ('cyan', f(DOC), p(DOC + ' M14 3.5V8a.5.5 0 0 0 .5.5H19 M12 11.5v6 M9 14.5h6')),
    'notebook': ('cyan', rect(5, 4, 4.5, 16, 1.5, True), p('M6.5 4H17a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6.5A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4z M9.5 4v16 M13 8.5h3 M13 12h3')),
    'search': ('cyan', circ(10.5, 10.5, 6.2, True), circ(10.5, 10.5, 6.2) + p('M15.2 15.2l4.8 4.8')),
    'arrow-up-right': ('cyan', circ(12, 12, 8.5, True), p('M8.5 15.5l7-7 M9.5 8.5h6v6')),
    'external-link': ('cyan', rect(4.5, 7.5, 12, 12, 2.5, True), p('M13.5 4.5h6v6 M19.5 4.5L11 13 M16.5 14v3.5a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2H10')),
    'link': ('cyan', f('M8.6 10.2l-2 2a3.4 3.4 0 0 0 4.8 4.8l2-2z M15.4 13.8l2-2a3.4 3.4 0 0 0-4.8-4.8l-2 2z'), p('M9.5 14.5l5-5 M11 6.5l.6-.6a4.2 4.2 0 0 1 6 6l-.6.6 M13 17.5l-.6.6a4.2 4.2 0 0 1-6-6l.6-.6')),
    'plus': ('cyan', circ(12, 12, 8.5, True), p('M12 8v8 M8 12h8')),
    # dates and people
    'calendar': ('amber', f('M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5V10H4z'), rect(4, 5, 16, 15, 2.5) + p('M8 3v4 M16 3v4 M4 10h16') + circ(12, 14.8, 1.3, True)),
    'user': ('amber', circ(12, 8, 3.6, True) + f('M5.5 20a6.5 6.5 0 0 1 13 0z'), circ(12, 8, 3.6) + p('M5.5 20a6.5 6.5 0 0 1 13 0')),
    'at': ('amber', circ(12, 12, 3.8, True), circ(12, 12, 3.8) + p('M15.8 12v1.4a2.4 2.4 0 0 0 4.8 0V12a8.6 8.6 0 1 0-5.2 7.9')),
    'star': ('amber', f(STAR), p(STAR)),
    # task flags
    'player-play': ('amber', f('M8 5.5v13l10-6.5z'), p('M8 5.5v13l10-6.5z')),
    'player-pause': ('zinc', rect(6.5, 5, 4, 14, 1.4, True) + rect(13.5, 5, 4, 14, 1.4, True), rect(6.5, 5, 4, 14, 1.4) + rect(13.5, 5, 4, 14, 1.4)),
    'currency-dollar': ('green', circ(12, 12, 8.5, True), p('M15 9.3a2.8 2.4 0 0 0-2.8-1.6h-.9a2.2 2.2 0 0 0 0 4.4h1.4a2.2 2.2 0 0 1 0 4.4h-1a2.8 2.4 0 0 1-2.8-1.6 M12 6v1.7 M12 16.5v1.6')),
    'alert-square': ('red', rect(4, 4, 16, 16, 4, True), rect(4, 4, 16, 16, 4) + p('M12 8.5v4') + circ(12, 15.6, 1, True)),
    'alert-triangle': ('orange', f(TRI), p(TRI + ' M12 9.5v3.8') + circ(12, 16.6, 1, True)),
    'help': ('pink', circ(12, 12, 8.5, True), circ(12, 12, 8.5) + p('M9.8 9.8a2.3 2.3 0 1 1 3.3 2.1c-.7.4-1.1.9-1.1 1.6') + circ(12, 16.4, 1, True)),
    'slash': ('zinc', circ(12, 12, 8.5, True), circ(12, 12, 8.5) + p('M15 7.5L9 16.5')),
    # misc
    'info-circle': ('zinc', circ(12, 12, 8.5, True), circ(12, 12, 8.5) + p('M12 11v5') + circ(12, 8, 1, True)),
    'clipboard': ('zinc', f('M7 5h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'), p('M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2') + rect(9, 3, 6, 4, 1.5)),
    'copy': ('zinc', rect(8.5, 8.5, 12, 12, 2.5, True), rect(8.5, 8.5, 12, 12, 2.5) + p('M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5')),
    'trash': ('red', f('M5.5 7.5h13l-1 11.5a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8z'), p('M4 7.5h16 M10 11v5.5 M14 11v5.5 M5.5 7.5l1 11.5a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-11.5 M9 7.5V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.5')),
}


def uri(inner):
    svg = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>{inner}</svg>"
    return 'url("data:image/svg+xml,' + quote(svg, safe=" =:/'.,-()") + '")'


def block():
    scope = 'html:not([data-device=mobile]) body.bme-on .cmdpal--inline .autocomplete--option-icon > .ti'
    out = ['/* ICONS:BEGIN - generated by icons.py, do not edit by hand */']
    names = list(ICONS)
    out.append(f"{scope}:is({', '.join('.ti-' + n for n in names)}) {{ font-size: 0; }}")
    out.append(f"{scope}:is({', '.join('.ti-' + n for n in names)})::before,")
    out.append(f"{scope}:is({', '.join('.ti-' + n for n in names)})::after {{")
    out.append('\tcontent: "";\n\tposition: absolute;\n\tinset: 2px;\n\tbackground: currentColor;')
    out.append('\t-webkit-mask: var(--bme-ia) center / contain no-repeat;\n\tmask: var(--bme-ia) center / contain no-repeat;\n}')
    out.append(f"{scope}:is({', '.join('.ti-' + n for n in names)})::before {{")
    out.append('\t-webkit-mask-image: var(--bme-ib);\n\tmask-image: var(--bme-ib);\n\topacity: 0.34;\n}')
    for name, (hue, back, front) in ICONS.items():
        out.append(f"{scope}.ti-{name} {{ --bme-hue: var(--bme-{hue}); --bme-ib: {uri(back)}; --bme-ia: {uri(front)}; }}")
    # the row takes its icon's hue too (--bme-row), so the selected row glows in the icon's colour
    row = 'html:not([data-device=mobile]) body.bme-on .cmdpal--inline .autocomplete--option'
    by_hue = {}
    for name, (hue, _, _) in ICONS.items():
        by_hue.setdefault(hue, []).append(name)
    for hue, group in by_hue.items():
        out.append(f"{row}:has(.autocomplete--option-icon > .ti:is({', '.join('.ti-' + n for n in group)})) {{ --bme-row: var(--bme-{hue}); }}")
    out.append('/* ICONS:END */')
    return '\n'.join(out)


if __name__ == '__main__':
    css = open(CSS).read()
    new = block()
    if '/* ICONS:BEGIN' in css:
        css = re.sub(r'/\* ICONS:BEGIN.*?/\* ICONS:END \*/', lambda m: new, css, flags=re.S)
    else:
        css = css.rstrip('\n') + '\n\n' + new + '\n'
    open(CSS, 'w').write(css)
    print(f'{len(ICONS)} icons written to {CSS}')
