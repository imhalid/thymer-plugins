#!/usr/bin/env python3
"""Rebuilds ../reference/*.png: character sheets drawn from the real 3D costumes (rendered by blender_art.py), which agy / the image
generator is told to copy. Needs the costumes processed by tools/costume2thymer (proto-blade) and Blender.

    python3 make_references.py
"""
import json, os, subprocess, tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
CACHE = os.path.join(ART, "..", "tools", "costume2thymer", ".cache")
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
cam = lambda scale=2.0, pitch=4, t=(0, 0, 0.62): {"scale": scale, "pitch": pitch, "target": t}
WHITEN = {"eyes": ["personal-b40ee0"], "helm": ["personal-7b75d3"]}


def run(blend, jobs, out, game):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump({"out": out, "gamedata": game, "size": 1100, "whiten": WHITEN, "jobs": jobs}, f)
    cmd = [BLENDER, "-b", "--factory-startup"] + ([blend] if blend else []) + ["--python", os.path.join(HERE, "blender_art.py"), "--", f.name]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["python3", os.path.join(HERE, "clean_sprites.py"), out, "7"], check=True, stdout=subprocess.DEVNULL)


def crop(p, pad=18):
    im = Image.open(p).convert("RGBA"); bb = im.getchannel("A").getbbox()
    return im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad)))


def sheet(files, cols, cell, out):
    rows = (len(files) + cols - 1) // cols; W, H = cell
    s = Image.new("RGB", (cols * W + (cols + 1) * 16, rows * H + (rows + 1) * 16), (239, 230, 207))
    for i, p in enumerate(files):
        im = crop(p); k = min(W / im.width, H / im.height); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        s.paste(im, (16 + (i % cols) * (W + 16) + (W - im.width) // 2, 16 + (i // cols) * (H + 16) + (H - im.height) // 2), im)
    s.save(os.path.join(ART, "reference", out)); print("wrote", out, s.size)


tmp = tempfile.mkdtemp()
hero_blend, hero_game = [os.path.join(CACHE, "proto-blade", p) for p in ("work/costume.blend", "game-data")]
h = os.path.join(tmp, "hero"); p = os.path.join(tmp, "props"); s = os.path.join(tmp, "sword")
run(hero_blend, [
    {"name": "hero_idle_front", "pose": "Idle", "cam": cam()},
    {"name": "hero_idle_34", "pose": "Idle", "rot": [["Z", -30]], "cam": cam()},
    {"name": "hero_idle_side", "pose": "Idle", "rot": [["Z", -70]], "cam": cam()},
    {"name": "hero_face", "pose": "Idle", "rot": [["Z", -14]], "cam": cam(0.78, 2, (0, 0, 1.13)), "ink": 9},
    {"name": "hero_sword_34", "pose": "sword", "rot": [["Z", -32]], "cam": cam()},
    {"name": "hero_charge_34", "pose": "sword-charge", "rot": [["Z", -32]], "cam": cam(2.2)}], h, os.path.join(hero_game))
run(hero_blend, [
    {"name": "sword_b", "pose": "Idle", "only": ["protoblade_mesh"], "rot": [["Z", -90]], "cam": {"scale": 1.1, "pitch": 0, "target": "obj:protoblade_mesh"}, "ink": 8},
    {"name": "sword_c", "pose": "Idle", "only": ["protoblade_mesh"], "rot": [["Z", -45]], "cam": {"scale": 1.1, "pitch": 6, "target": "obj:protoblade_mesh"}, "ink": 8}], s, hero_game)
run(None, [
    {"name": "gremlin_threat", "kind": "gremlin", "rot": [["Z", -25]], "cam": cam(1.7, 8, (0, 0, 0.55))},
    {"name": "gremlin_down", "kind": "gremlin", "variant": "down", "rot": [["Z", 20]], "cam": cam(1.7, 8, (0, 0, 0.55))},
    {"name": "owl", "kind": "owl", "rot": [["Z", 14]], "cam": cam(1.9, 8, (0, 0, 0.66))}], p, hero_game)
os.makedirs(os.path.join(ART, "reference"), exist_ok=True)
sheet([f"{h}/hero_idle_front.png", f"{h}/hero_idle_34.png", f"{h}/hero_idle_side.png", f"{h}/hero_face.png", f"{s}/sword_b.png", f"{s}/sword_c.png", f"{h}/hero_sword_34.png", f"{h}/hero_charge_34.png"], 4, (520, 520), "hero-character-sheet.png")
sheet([f"{h}/hero_face.png"], 1, (900, 900), "hero-face.png")
sheet([f"{s}/sword_b.png", f"{s}/sword_c.png"], 1, (1000, 420), "hero-sword.png")
sheet([f"{p}/gremlin_threat.png", f"{p}/gremlin_down.png", f"{p}/owl.png"], 3, (460, 520), "gremlin-and-owl.png")
