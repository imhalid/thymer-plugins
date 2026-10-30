#!/usr/bin/env python3
"""Builds a local preview of every theme, to compare them before any goes into Thymer.

    python3 themes/kit/preview.py [--host WORKSPACE.thymer.com] [--app-css app.css] [--out DIR]

It builds every theme in themes/ (kit/build.py's way), and writes themes/.preview/ (or --out):

    index.html   a gallery: every theme side by side on the same page
    frame.html   one theme full size (index.html links to it); ?theme=<id>,
                 with buttons to open the date picker and the command palette
    app.css      Thymer's own stylesheet, its fonts and icons (fonts/) fetched once from --host
    themes.css   every theme's CSS
    plugins.css  the stylesheets of the plugins the page shows (Calendar Plus's date picker)

Open themes/.preview/index.html in a browser. The page is kit/preview/page.html: a copy
of Thymer's DOM with neutral sample content (headings, a paragraph with inline code and
tags, lists, a quote, a rule, a code block), and kit/preview/calendar.html and palette.html
are its two popovers. Themes whose theme.json has "draft": true are marked as drafts;
nothing here touches Thymer. The host is remembered in themes/.preview/host.
"""
import argparse
import html
import importlib.util
import json
import os
import re
import sys
import urllib.request

KIT = os.path.dirname(os.path.abspath(__file__))
THEMES = os.path.dirname(KIT)
OUT = os.path.join(THEMES, '.preview')  # main() may point it elsewhere (--out)
FIXTURES = os.path.join(KIT, 'preview')

spec = importlib.util.spec_from_file_location('kit_build', os.path.join(KIT, 'build.py'))
kb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kb)

# Plugins whose look shows on the page (Calendar Plus's date picker, DontSpy's lock);
# their stylesheets are loaded as Thymer would.
PLUGINS = ['calendar-plus', 'dontspy']

# Thymer's own themes, and Premium's, are in the gallery too, for comparison.
FIXED = [
    {'id': 'thymer-dark-sans', 'name': 'Thymer Dark', 'scheme': 'dark', 'note': 'Thymer'},
    {'id': 'thymer-light-sans', 'name': 'Thymer Light', 'scheme': 'light', 'note': 'Thymer'},
    {'id': 'thymer-premium', 'name': 'Premium', 'scheme': 'dark', 'css': 'premium/premium.css'},
    {'id': 'thymer-premium-light', 'name': 'Premium Light', 'scheme': 'light', 'css': None},
]


def themes():
    out = []
    for d in sorted(os.listdir(THEMES)):
        p = os.path.join(THEMES, d, 'theme.json')
        if os.path.exists(p):
            cfg = json.load(open(p))
            out.append({'id': 'thymer-' + cfg['name'].lower(), 'name': cfg['name'], 'folder': d,
                        'scheme': cfg.get('scheme', 'dark'), 'description': cfg.get('description', ''),
                        'note': 'draft' if cfg.get('draft') else 'theme'})
    return out


def app_css(host):
    """Thymer's stylesheet, its fonts kept beside it: a page opened from disk may not load
    fonts from another origin, so each is fetched from the workspace's host once."""
    css = kb.pb.read_app_css()
    fonts = os.path.join(OUT, 'fonts')
    os.makedirs(fonts, exist_ok=True)

    def local(m):
        name = m.group(2)
        path = os.path.join(fonts, name)
        if not os.path.exists(path) and host:
            try:
                req = urllib.request.Request('https://%s/css/%s' % (host, name),
                                             headers={'User-Agent': 'Mozilla/5.0'})  # the default one is refused
                data = urllib.request.urlopen(req, timeout=30).read()
                open(path, 'wb').write(data)
            except OSError as e:
                print('could not fetch %s: %s' % (name, e), file=sys.stderr)
        return 'url(%sfonts/%s' % (m.group(1), name)
    return re.sub(r'url\((["\']?)\./([^"\')]+\.(?:woff2?|ttf|otf))', local, css)


FRAME = '''<!doctype html>
<html lang="en" data-theme="thymer-dark-sans" data-device="desktop" data-viewport="wide" data-has-mouse>
<head>
<meta charset="utf-8">
<title>Theme preview</title>
<link rel="stylesheet" href="app.css">
<link rel="stylesheet" href="plugins.css">
<link rel="stylesheet" href="themes.css">
<style>
%(vars)s
#pv-bar { position: fixed; z-index: 100000; left: 50%%; bottom: 40px; transform: translateX(-50%%);
  display: flex; gap: 6px; align-items: center; padding: 6px; border-radius: 12px;
  background: #111c; color: #eee; font: 500 13px system-ui, sans-serif; backdrop-filter: blur(10px);
  box-shadow: 0 8px 30px #0006; }
#pv-bar button, #pv-bar select { all: unset; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
#pv-bar button:hover, #pv-bar select:hover { background: #fff2; }
#pv-bar button[aria-pressed=true] { background: #fff3; }
#pv-bar a { color: #eee; text-decoration: none; padding: 6px 10px; }
html.pv-thumb #pv-bar { display: none; }
</style>
</head>
<body>
%(page)s
<template id="pv-calendar">%(calendar)s</template>
<template id="pv-palette">%(palette)s</template>
<div id="pv-bar">
  <a href="index.html">&larr; All</a>
  <button id="pv-prev" title="Previous (&larr;)">&lsaquo;</button>
  <select id="pv-theme"></select>
  <button id="pv-next" title="Next (&rarr;)">&rsaquo;</button>
  <button id="pv-cal" aria-pressed="false">Date picker</button>
  <button id="pv-pal" aria-pressed="false">Command palette</button>
</div>
<script>
const THEMES = %(themes)s;
const params = new URLSearchParams(location.search);
const root = document.documentElement;
const select = document.getElementById('pv-theme');
if (params.has('thumb')) root.classList.add('pv-thumb');
THEMES.forEach(t => select.add(new Option(t.name + (t.note === 'draft' ? ' (draft)' : ''), t.id)));
function show(id) {
  const t = THEMES.find(t => t.id === id) || THEMES[0];
  root.dataset.theme = t.id;
  root.classList.toggle('is-light', t.scheme === 'light');
  root.classList.toggle('is-dark', t.scheme !== 'light');
  select.value = t.id;
  document.title = t.name + ' \\u2013 theme preview';
  if (!params.has('thumb')) {
    params.set('theme', t.id);
    history.replaceState(null, '', '?' + params);
  }
}
function step(d) {
  const i = THEMES.findIndex(t => t.id === root.dataset.theme);
  show(THEMES[(i + d + THEMES.length) %% THEMES.length].id);
}
function toggle(button, template) {
  const open = document.querySelector('[data-pv=' + template + ']');
  if (open) {
    open.remove();
    button.setAttribute('aria-pressed', 'false');
    params.delete('popover');
    history.replaceState(null, '', '?' + params);
    return;
  }
  const node = document.getElementById('pv-' + template).content.firstElementChild.cloneNode(true);
  node.dataset.pv = template;
  document.querySelector('.sidebar').appendChild(node);
  button.setAttribute('aria-pressed', 'true');
  params.set('popover', template);
  history.replaceState(null, '', '?' + params);
}
select.onchange = () => show(select.value);
document.getElementById('pv-prev').onclick = () => step(-1);
document.getElementById('pv-next').onclick = () => step(1);
const cal = document.getElementById('pv-cal'), pal = document.getElementById('pv-pal');
cal.onclick = () => toggle(cal, 'calendar');
pal.onclick = () => toggle(pal, 'palette');
addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});
show(params.get('theme'));
if (params.has('popover')) toggle(params.get('popover') === 'palette' ? pal : cal, params.get('popover'));
</script>
</body>
</html>
'''

INDEX = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Thymer themes</title>
<style>
:root { color-scheme: dark; }
body { margin: 0; padding: 28px 32px 60px; background: #131417; color: #e8e8ea; font: 14px/1.45 system-ui, sans-serif; }
h1 { margin: 0 0 4px; font-size: 22px; font-weight: 650; }
p.lead { margin: 0 0 22px; color: #9a9ba3; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 26px; }
.card { display: block; color: inherit; text-decoration: none; }
.shot { position: relative; aspect-ratio: 1192 / 820; overflow: hidden; border-radius: 10px;
  background: #000; box-shadow: 0 0 0 1px #ffffff14, 0 10px 30px #0008; }
.shot iframe { position: absolute; left: 0; top: 0; width: 1192px; height: 820px; border: 0;
  transform-origin: 0 0; pointer-events: none; }
.card:hover .shot { box-shadow: 0 0 0 2px #8ab4ff, 0 10px 30px #0008; }
.meta { display: flex; align-items: baseline; gap: 8px; margin: 10px 2px 0; }
.name { font-weight: 650; font-size: 15px; }
.tag { font-size: 11px; padding: 1px 7px; border-radius: 99px; background: #ffffff14; color: #b8b9c0; }
.tag.draft { background: #f5c54226; color: #f5c542; }
.tag.theme { background: #6fd39a22; color: #6fd39a; }
.desc { margin: 4px 2px 0; color: #8d8e96; font-size: 12.5px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
</style>
</head>
<body>
<h1>Thymer themes</h1>
<p class="lead">Every theme on the same page. Click one to see it full size, with its date picker and command palette; nothing here touches Thymer.</p>
<div class="grid">
%(cards)s
</div>
<script>
// Each thumbnail is the full page, scaled to its card.
function fit() {
  document.querySelectorAll('.shot').forEach(s => {
    s.querySelector('iframe').style.transform = 'scale(' + s.clientWidth / 1192 + ')';
  });
}
addEventListener('resize', fit);
fit();
</script>
</body>
</html>
'''

CARD = '''<a class="card" href="frame.html?theme=%(id)s">
  <div class="shot"><iframe src="frame.html?theme=%(id)s&amp;thumb=1" tabindex="-1"></iframe></div>
  <div class="meta"><span class="name">%(name)s</span><span class="tag %(note)s">%(note)s</span></div>
  <div class="desc">%(description)s</div>
</a>'''


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--host', help="the workspace's host, for Thymer's fonts and icons (remembered)")
    ap.add_argument('--app-css', help="Thymer's app.css (default: from the desktop app's cache)")
    ap.add_argument('--out', help='where to write the preview (default: themes/.preview)')
    a = ap.parse_args()
    global OUT
    if a.out:
        OUT = os.path.abspath(a.out)
    os.makedirs(OUT, exist_ok=True)
    host_file = os.path.join(OUT, 'host')
    host = a.host or (open(host_file).read().strip() if os.path.exists(host_file) else None)
    if a.host:
        open(host_file, 'w').write(a.host)
    if not host:
        print('note: no --host given; Thymer\'s icons will be missing', file=sys.stderr)

    sys.argv[1:] = [a.app_css] if a.app_css else []  # read_app_css takes its path from argv
    rules, _ = kb.pb.parse(re.sub(r'/\*.*?\*/', '', kb.pb.read_app_css(), flags=re.S))
    own = themes()
    for t in own:
        kb.build_theme(os.path.join(THEMES, t['folder']), rules)

    css = [open(os.path.join(THEMES, f['css'])).read() for f in FIXED if f.get('css')]
    css += [open(os.path.join(THEMES, t['folder'], t['name'].lower() + '.css')).read() for t in own]
    open(os.path.join(OUT, 'themes.css'), 'w').write('\n'.join(css))
    open(os.path.join(OUT, 'app.css'), 'w').write(app_css(host))
    plugins = os.path.join(os.path.dirname(THEMES), 'plugins')
    open(os.path.join(OUT, 'plugins.css'), 'w').write('\n'.join(
        open(os.path.join(plugins, p, 'plugin.css')).read() for p in PLUGINS))

    listed = own + [dict(f, description=f.get('description', ''), note=f.get('note', 'theme')) for f in FIXED]
    listed.sort(key=lambda t: ({'draft': 0, 'theme': 1, 'Thymer': 2}[t['note']], t['name']))
    fixture = lambda n: open(os.path.join(FIXTURES, n)).read()
    open(os.path.join(OUT, 'frame.html'), 'w').write(FRAME % {
        'vars': fixture('html-vars.css'),
        'page': fixture('page.html'),
        'calendar': fixture('calendar.html'),
        'palette': fixture('palette.html'),
        'themes': json.dumps([{k: t[k] for k in ('id', 'name', 'scheme', 'note')} for t in listed]),
    })
    open(os.path.join(OUT, 'index.html'), 'w').write(INDEX % {
        'cards': '\n'.join(CARD % {k: html.escape(t[k]) for k in ('id', 'name', 'note', 'description')}
                           for t in listed),
    })
    print('open', os.path.relpath(os.path.join(OUT, 'index.html')))


if __name__ == '__main__':
    main()
