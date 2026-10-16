#!/usr/bin/env python3
"""Writes the built plugin (../../achievements.js) and ../../plugin.css into Thymer through the desktop app's local MCP server.

    python3 push_thymer.py [--workspace NAME] [--plugin Achievements] [--preview] [--port 13100]

Needs Thymer open, with MCP access of the workspace set to readwrite (command palette -> MCP Settings). The live code and CSS are
saved to .cache/backups/ first, so a bad push is one `--restore <file>` away.
"""
import argparse, json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN_DIR = os.path.abspath(os.path.join(HERE, "..", ".."))
H = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}


class Mcp:
    def __init__(self, port):
        self.url = f"http://127.0.0.1:{port}/mcp"
        self.sid, _ = self._rpc({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "costume2thymer", "version": "1"}}})
        self.n = 1

    def _rpc(self, payload):
        h = dict(H)
        if getattr(self, "sid", None):
            h["MCP-Session-Id"] = self.sid
        try:
            r = urllib.request.urlopen(urllib.request.Request(self.url, json.dumps(payload).encode(), h), timeout=180)
        except OSError as e:
            sys.exit(f"cannot reach Thymer's MCP server at {self.url} ({e}): is Thymer open?")
        return r.headers.get("MCP-Session-Id"), r.read().decode()

    def call(self, tool, **args):
        self.n += 1
        _, body = self._rpc({"jsonrpc": "2.0", "id": self.n, "method": "tools/call", "params": {"name": tool, "arguments": args}})
        r = json.loads(body[body.index("{"):])
        if "error" in r:
            sys.exit(f"{tool}: {r['error']}")
        text = "".join(c.get("text", "") for c in r["result"].get("content", []))
        if r["result"].get("isError"):
            sys.exit(f"{tool}: {text}")
        try:
            return json.loads(text)
        except ValueError:
            return text


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workspace", help="workspace name (default: the focused one)")
    ap.add_argument("--plugin", default="Achievements", help="global plugin name")
    ap.add_argument("--port", type=int, default=13100)
    ap.add_argument("--preview", action="store_true", help="hot-reload without saving")
    ap.add_argument("--restore", help="restore a backup file made by an earlier push")
    a = ap.parse_args()

    mcp = Mcp(a.port)
    ws_list = mcp.call("list_workspaces")["workspaces"]
    ws = next((w for w in ws_list if (w["name"] == a.workspace if a.workspace else w.get("is_focused"))), None)
    if not ws:
        sys.exit("workspace not found: " + str([w["name"] for w in ws_list]))
    if ws["mcp_access"] != "readwrite":
        sys.exit(f"MCP access of '{ws['name']}' is '{ws['mcp_access']}': set it to readwrite (command palette -> MCP Settings)")
    plugins = mcp.call("list_plugins", workspace=ws["guid"])
    pl = next((p for p in plugins["global_plugins"] if p["name"] == a.plugin), None)
    if not pl:
        sys.exit("no global plugin named " + a.plugin)

    if a.restore:
        old = json.load(open(a.restore))
        code, css = old["code"], old["css"]
    else:
        code = open(os.path.join(PLUGIN_DIR, "achievements.js")).read()
        css = open(os.path.join(PLUGIN_DIR, "plugin.css")).read()
        live = mcp.call("get_plugin_code", workspace=ws["guid"], plugin=pl["guid"])
        os.makedirs(os.path.join(HERE, ".cache", "backups"), exist_ok=True)
        bak = os.path.join(HERE, ".cache", "backups", time.strftime("%Y%m%d-%H%M%S") + ".json")
        json.dump({"code": live["code"], "css": live["css"]}, open(bak, "w"))
        print("backed up the live plugin to", bak)

    if a.preview:
        mcp.call("preview_plugin", workspace=ws["guid"], plugin=pl["guid"], code=code, css=css)
        print("preview active (not saved)")
        return
    mcp.call("update_plugin_code", workspace=ws["guid"], plugin=pl["guid"], code=code)
    mcp.call("update_plugin_css", workspace=ws["guid"], plugin=pl["guid"], css=css)
    live = mcp.call("get_plugin_code", workspace=ws["guid"], plugin=pl["guid"])
    ok = live["code"] == code and live["css"] == css
    print(f"pushed {len(code)} chars of code and {len(css)} of CSS to '{ws['name']}' / {a.plugin}; read back identical: {ok}")
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
