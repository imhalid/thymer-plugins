#!/usr/bin/env python3
"""Puts a plugin's code and CSS into Thymer through the desktop app's local MCP server.

    python3 plugins/push.py NAME [--workspace NAME] [--port 13100]

NAME is the plugin's folder in plugins/ (home, caret-fx, ...): its plugin.js and plugin.css go to the plugin of the
name in its plugin.json. The live code and CSS are saved to the folder's .backups/ first. Needs Thymer open, with the
workspace's MCP access set to readwrite (command palette -> MCP Settings). Works through themes/premium/push.py's client.
"""
import argparse, importlib.util, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('premium_push', os.path.join(os.path.dirname(HERE), 'themes', 'premium', 'push.py'))
pp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pp)

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('name', help="the plugin's folder in plugins/")
ap.add_argument('--workspace', help='workspace name (default: the focused one)')
ap.add_argument('--port', type=int, default=13100)
a = ap.parse_args()

folder = os.path.join(HERE, a.name)
meta = json.load(open(os.path.join(folder, 'plugin.json')))
code = open(os.path.join(folder, 'plugin.js')).read()
css_path = os.path.join(folder, 'plugin.css')
css = open(css_path).read() if os.path.exists(css_path) else None

mcp = pp.Mcp(a.port)
ws_list = mcp.call('list_workspaces')['workspaces']
ws = next((w for w in ws_list if (w['name'] == a.workspace if a.workspace else w.get('is_focused'))), None)
if not ws:
    sys.exit('workspace not found: ' + str([w['name'] for w in ws_list]))
if ws['mcp_access'] != 'readwrite':
    sys.exit(f"MCP access of '{ws['name']}' is '{ws['mcp_access']}': set it to readwrite")
plugins = mcp.call('list_plugins', workspace=ws['guid'])
plugin = next((p for p in plugins.get('global_plugins', []) + plugins.get('collection_plugins', []) if p['name'] == meta['name']), None)
if not plugin:
    sys.exit(f"no plugin named {meta['name']!r} in {ws['name']}")

live = mcp.call('get_plugin_code', workspace=ws['guid'], plugin=plugin['guid'])
os.makedirs(os.path.join(folder, '.backups'), exist_ok=True)
bak = os.path.join(folder, '.backups', 'live-' + time.strftime('%Y%m%d-%H%M%S') + '.json')
json.dump(live, open(bak, 'w'), indent=1, ensure_ascii=False)
print('backed up the live plugin to', bak)

mcp.call('update_plugin_code', workspace=ws['guid'], plugin=plugin['guid'], code=code)
print(f"{meta['name']} ({plugin['guid']}): code {len(code)} bytes")
if css is not None:
    mcp.call('update_plugin_css', workspace=ws['guid'], plugin=plugin['guid'], css=css)
    print(f"{meta['name']}: css {len(css)} bytes")
