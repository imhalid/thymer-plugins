#!/usr/bin/env python3
"""Kozmas costume -> the Achievements plugin's mascot.

    python3 costume2thymer.py https://www.kozmas.gg/costumes/proto-blade [--build] [--push]

Stages (each can be re-run alone with --only):
  fetch   read the costume page, download its pieces and the knight skeleton's poses into .cache/<costume>/   (no browser needed)
  blender run blender_export.py headless: rebuild the rig, skin and place the pieces, bake Idle + Salute, export both poses
  model   build_model.py: split head/body, crop, quantize textures, frame the head  ->  ../../knight.json
  build   node build.mjs  ->  ../../achievements.js                                                     (with --build or --push)
  push    push_thymer.py: back up the live plugin, then write achievements.js + plugin.css to Thymer       (with --push)

The downloaded assets are Spiral Knights game assets (c) Grey Havens; they stay in .cache/ (git-ignored). knight.json, which
embeds them, is derived from them: see ../../model/LICENSE.md before this repository is ever made public.
"""
import argparse, json, os, re, shutil, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = "https://assets.kozmas.gg/catalog/models/"
GAME = "https://www.kozmas.gg/game-data/"
UA = {"User-Agent": "Mozilla/5.0 (costume2thymer)"}
BLENDERS = ["/Applications/Blender.app/Contents/MacOS/Blender", "blender"]


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def download(base, rel, root):
    dst = os.path.join(root, rel)
    if not os.path.exists(dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as f:
            f.write(get(base + rel))
        print("  downloaded", rel)
    return dst


def parse_pieces(html):
    """The page's data lists the costume's pieces as ["/assets/models/bare-....gltf", ...] right before its "pose"."""
    for m in re.finditer(r'\\*"pose\\*"', html):
        seg = html[html.rfind("[", 0, m.start()):m.start()]
        names = re.findall(r"/assets/models/([A-Za-z0-9_\-]+\.gltf)", seg)
        if names:
            pose = re.match(r'\\*"pose\\*"\s*:\s*\\*"([\w-]+)', html[m.start():m.start() + 60])
            return list(dict.fromkeys(names)), pose.group(1) if pose else None
    sys.exit("could not find the costume's pieces on the page; pass them with --pieces a.gltf,b.gltf")


def fetch(url, cache, pieces):
    models, game = os.path.join(cache, "models"), os.path.join(cache, "game-data")
    if not pieces:
        pieces, pose = parse_pieces(get(url).decode("utf-8", "replace"))
    else:
        pose = None
    print("pieces:", pieces)
    for name in pieces:
        path = download(ASSETS, name, models)
        g = json.load(open(path))
        for b in g.get("buffers", []):
            download(ASSETS, b["uri"], models)
        for uri in {i["uri"] for i in g.get("images", [])}:
            download(ASSETS, uri, models)
    for pose_name in ("idle", "salute"):
        path = download(GAME, f"knight-{pose_name}.gltf", game)
        for b in json.load(open(path)).get("buffers", []):
            download(GAME, b["uri"], game)
    json.dump({"url": url, "files": pieces, "pose": pose}, open(os.path.join(cache, "costume.json"), "w"), indent=1)


def find_blender(given):
    for c in ([given] if given else []) + [os.environ.get("BLENDER", "")] + BLENDERS:
        if c and (shutil.which(c) or os.path.exists(c)):
            return shutil.which(c) or c
    sys.exit("Blender not found: pass --blender /path/to/Blender or set $BLENDER")


def run(cmd, **kw):
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True, **kw)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", help="a Kozmas costume page, e.g. https://www.kozmas.gg/costumes/proto-blade")
    ap.add_argument("--only", choices=["fetch", "blender", "model", "build", "push"], help="run just this stage")
    ap.add_argument("--pieces", help="comma-separated gltf names, instead of reading them from the page")
    ap.add_argument("--blender", help="path to the Blender executable")
    ap.add_argument("--eyes", choices=["white", "original"], default="white", help="eye glow colour (default: white)")
    ap.add_argument("--out", default=os.path.join(PLUGIN, "knight.json"), help="where the model goes (default: ../../knight.json)")
    ap.add_argument("--build", action="store_true", help="also build achievements.js")
    ap.add_argument("--push", action="store_true", help="also build it and push it to Thymer (backs up the live plugin first)")
    ap.add_argument("--with-equipment", action="store_true", help="keep the weapon and shield in the model (they are outside the head window)")
    ap.add_argument("--no-blend", action="store_true", help="do not save costume.blend")
    a = ap.parse_args()

    slug = a.url.rstrip("/").split("/")[-1]
    cache = os.path.join(HERE, ".cache", slug)
    work = os.path.join(cache, "work")
    stages = ["fetch", "blender", "model"] + (["build"] if a.build or a.push else []) + (["push"] if a.push else [])
    if a.only:
        stages = [a.only]
    os.makedirs(work, exist_ok=True)

    if "fetch" in stages:
        print("== fetch", a.url)
        fetch(a.url, cache, a.pieces.split(",") if a.pieces else None)
    if "blender" in stages:
        print("== blender")
        run([find_blender(a.blender), "-b", "--factory-startup", "--python", os.path.join(HERE, "blender_export.py"), "--",
             cache, work] + (["--no-blend"] if a.no_blend else []))
        if not os.path.exists(os.path.join(work, "parts.json")):
            sys.exit("Blender did not write parts.json")
    if "model" in stages:
        print("== model")
        run([sys.executable, os.path.join(HERE, "build_model.py"), os.path.join(work, "parts.json"), os.path.join(cache, "models"),
             a.out, "--eyes", a.eyes] + (["--with-equipment"] if a.with_equipment else []), cwd=HERE)
    if "build" in stages:
        print("== build")
        run(["node", "build.mjs"], cwd=PLUGIN)
    if "push" in stages:
        print("== push")
        run([sys.executable, os.path.join(HERE, "push_thymer.py")], cwd=HERE)
    print("done. costume.blend:", os.path.join(work, "costume.blend"))


if __name__ == "__main__":
    main()
