#!/usr/bin/env python3
"""Puts a plugin's code and CSS into Thymer through the desktop app's local MCP server.

    python3 plugins/push.py NAME [--workspace NAME] [--port 13100]

NAME is the plugin's folder in plugins/ (home, caret-fx, ...): its plugin.js and plugin.css go to the plugin of the
name in its plugin.json. The live code and CSS are saved to the folder's .backups/ first. Needs Thymer open, with the
workspace's MCP access set to readwrite (command palette -> MCP Settings).
"""
import argparse, json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
H = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}


class Mcp:
    """A small client for Thymer's local MCP server (streamable HTTP, JSON-RPC)."""

    def __init__(self, port):
        self.url = f'http://127.0.0.1:{port}/mcp'
        self.sid, _ = self._rpc({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
            'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'thymer-plugins', 'version': '1'}}})
        self.n = 1

    def _rpc(self, payload):
        h = dict(H)
        if getattr(self, 'sid', None):
            h['MCP-Session-Id'] = self.sid
        try:
            r = urllib.request.urlopen(urllib.request.Request(self.url, json.dumps(payload).encode(), h), timeout=180)
        except OSError as e:
            sys.exit(f"cannot reach Thymer's MCP server at {self.url} ({e}): is Thymer open?")
        return r.headers.get('MCP-Session-Id'), r.read().decode()

    def call(self, tool, **args):
        self.n += 1
        _, body = self._rpc({'jsonrpc': '2.0', 'id': self.n, 'method': 'tools/call', 'params': {'name': tool, 'arguments': args}})
        r = json.loads(body[body.index('{'):])
        if 'error' in r:
            sys.exit(f"{tool}: {r['error']}")
        text = ''.join(c.get('text', '') for c in r['result'].get('content', []))
        if r['result'].get('isError'):
            sys.exit(f'{tool}: {text}')
        try:
            return json.loads(text)
        except ValueError:
            return text


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

mcp = Mcp(a.port)
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
