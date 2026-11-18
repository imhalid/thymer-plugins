#!/usr/bin/env python3
"""Puts better-dark-paper.css into Thymer's custom CSS through the desktop app's local MCP server.

    python3 themes/better-dark-paper/push.py [--workspace NAME] [--remove] [--port 13100]

The theme lives between its start and end markers in the custom CSS: a push replaces that block (or appends
it) and leaves the rest of the custom CSS as it is; --remove takes the block out. The live custom CSS is
saved to .backups/ first. Needs Thymer open, with the workspace's MCP access set to readwrite. Then pick
"Better Dark Paper" in Thymer's theme picker (the MCP server's set_theme only knows the built-in themes).
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
NAME, FILE = 'Better Dark Paper', 'better-dark-paper.css'
H = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}


def block(name):
    """The theme's own stretch of the custom CSS, between its start and end markers."""
    return re.compile(r'\n*/\* ===== %s theme start =====.*?/\* ===== %s theme end ===== \*/\n?'
                      % (re.escape(name), re.escape(name)), re.S)


class Mcp:
    """A small client for Thymer's local MCP server (streamable HTTP, JSON-RPC)."""

    def __init__(self, port):
        self.url = f'http://127.0.0.1:{port}/mcp'
        self.sid, _ = self._rpc({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
            'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'thymer-themes', 'version': '1'}}})
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--workspace', help='workspace name (default: the focused one)')
    ap.add_argument('--remove', action='store_true', help='take the theme out of the custom CSS')
    ap.add_argument('--port', type=int, default=13100)
    a = ap.parse_args()

    mcp = Mcp(a.port)
    ws_list = mcp.call('list_workspaces')['workspaces']
    ws = next((w for w in ws_list if (w['name'] == a.workspace if a.workspace else w.get('is_focused'))), None)
    if not ws:
        sys.exit('workspace not found: ' + str([w['name'] for w in ws_list]))
    if ws['mcp_access'] != 'readwrite':
        sys.exit(f"MCP access of '{ws['name']}' is '{ws['mcp_access']}': set it to readwrite (command palette -> MCP Settings)")

    live = mcp.call('get_custom_css', workspace=ws['guid'])['custom_css']
    os.makedirs(os.path.join(HERE, '.backups'), exist_ok=True)
    bak = os.path.join(HERE, '.backups', 'custom-' + time.strftime('%Y%m%d-%H%M%S') + '.css')
    open(bak, 'w').write(live)
    print('backed up the live custom CSS to', bak)

    rest = block(NAME).sub('\n', live).rstrip()
    theme = open(os.path.join(HERE, FILE)).read()
    css = rest + '\n' if a.remove else (rest + '\n\n' if rest else '') + theme
    mcp.call('set_custom_css', workspace=ws['guid'], css=css)
    back = mcp.call('get_custom_css', workspace=ws['guid'])['custom_css']
    if back != css:
        sys.exit('the custom CSS read back differs from what was written')
    print('custom CSS of %s: %d bytes (%s)' % (ws['name'], len(css), 'theme removed' if a.remove else 'theme in place'))


if __name__ == '__main__':
    main()
