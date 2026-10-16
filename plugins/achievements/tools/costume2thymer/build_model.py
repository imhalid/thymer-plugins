"""parts.json (from blender_export.py) -> knight.json, the model the Achievements plugin embeds.

usage: build_model.py <parts.json> <models_dir> <out knight.json> [--eyes white|original] [--with-equipment]

What it does to the Blender export:
  * splits every mesh into a head part and a body part (a triangle is head when its vertices are weighted to the head bone, or the
    whole piece sits on a head bone), so the plugin can turn the head on its own;
  * crops the body below the shoulders (the card is a window onto the head), keeping everything the salute raises;
  * packs positions/normals/UVs (idle pose + salute pose, blended by the shader) as base64 float32 and indices as uint16;
  * downscales the textures to 256 px and quantizes them to a palette PNG (data URLs);
  * works out the framing of the head (centre, span) from the head's own bounds, and the pivot it turns around;
  * leaves out weapons and shields (never in the window) unless --with-equipment;
  * --eyes white: the costume's magenta eye glow (the eyes texture, and the accents on the helm texture) becomes white.
"""
import base64, io, json, os, struct, sys

from PIL import Image

parts_json, models_dir, out_path = sys.argv[1:4]
EYES = "white" if "--eyes" not in sys.argv else sys.argv[sys.argv.index("--eyes") + 1]
WITH_EQUIPMENT = "--with-equipment" in sys.argv
CROP_BELOW_PIVOT = 0.525   # keep body triangles above (head pivot - this); the hands, raised for the salute, are kept too
HEAD_SPAN = 1.59           # window height as a multiple of the head's height
HEAD_LIFT = 0.117          # the window is centred this much of the head's height below the head's middle (some neck and shoulders)

src = json.load(open(parts_json))
b64 = lambda raw: base64.b64encode(raw).decode()
f32 = lambda a: b64(struct.pack("<%df" % len(a), *a))
tex_dir = os.path.join(models_dir, "tex")


def is_magenta(p):
    r, g, b, a = p
    return a > 127 and r > 70 and b > 70 and g < 0.55 * min(r, b)


def tex_uri(name, piece):
    im = Image.open(os.path.join(tex_dir, name)).convert("RGBA")
    if EYES == "white":
        if piece.startswith("eyes-"):   # an additive glow on black: keep its brightness, drop the hue
            im.putdata([(v, v, v, a) for (r, g, b, a) in im.getdata() for v in [max(r, g, b)]])
        elif "helm" in piece:           # accents on the helm
            def w(p):
                if is_magenta(p):
                    v = min(255, int(max(p[0], p[2]) * 1.7))
                    return (v, v, v, p[3])
                return p
            im.putdata([w(p) for p in im.getdata()])
    if max(im.size) > 256:
        k = 256 / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    q = im.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE)
    buf = io.BytesIO()
    q.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + b64(buf.getvalue())


pivot_idle, pivot_salute = src["pivot_idle"], src["pivot_salute"]
min_y = pivot_idle[1] - CROP_BELOW_PIVOT
textures, tex_index, parts = [], {}, []
lo = [1e9] * 3
hi = [-1e9] * 3
head_lo = [1e9] * 3
head_hi = [-1e9] * 3
for p in src["parts"]:
    if not WITH_EQUIPMENT and any(k in p["piece"] for k in ("weapon", "shield")):
        continue
    pos, nrm, pos2, nrm2, uv, hw, idx = (p[k] for k in ("pos", "nrm", "pos2", "nrm2", "uv", "hw", "idx"))
    groups = {0: [], 1: []}   # 0 body, 1 head
    for t in range(0, len(idx), 3):
        tri = idx[t:t + 3]
        cy = max(sum(pos[v * 3 + 1] for v in tri) / 3, sum(pos2[v * 3 + 1] for v in tri) / 3)
        head = all(hw[v] > 0.5 for v in tri)
        if head or cy >= min_y:
            groups[1 if head else 0].append(tri)
    for head, tris in groups.items():
        if not tris:
            continue
        remap, A, I = {}, {k: [] for k in ("pos", "nrm", "pos2", "nrm2", "uv")}, []
        for tri in tris:
            for v in tri:
                if v not in remap:
                    remap[v] = len(A["pos"]) // 3
                    A["pos"] += pos[v * 3:v * 3 + 3]; A["nrm"] += nrm[v * 3:v * 3 + 3]
                    A["pos2"] += pos2[v * 3:v * 3 + 3]; A["nrm2"] += nrm2[v * 3:v * 3 + 3]
                    A["uv"] += uv[v * 2:v * 2 + 2]
                I.append(remap[v])
        for arr in (A["pos"], A["pos2"]):
            for i in range(0, len(arr), 3):
                for k in range(3):
                    lo[k] = min(lo[k], arr[i + k]); hi[k] = max(hi[k], arr[i + k])
        if head:
            for i in range(0, len(A["pos"]), 3):
                for k in range(3):
                    head_lo[k] = min(head_lo[k], A["pos"][i + k]); head_hi[k] = max(head_hi[k], A["pos"][i + k])
        key = (p["tex"], p["piece"])
        if key not in tex_index:
            tex_index[key] = len(textures)
            textures.append(tex_uri(*key))
        parts.append({"tex": tex_index[key], "color": [1, 1, 1], "h": head, "pos": f32(A["pos"]), "nrm": f32(A["nrm"]),
                      "pos2": f32(A["pos2"]), "nrm2": f32(A["nrm2"]), "uv": f32(A["uv"]),
                      "idx": b64(struct.pack("<%dH" % len(I), *I)), "n": len(I)})
        print("  %-22s %-4s verts %5d tris %5d" % (p["name"], "head" if head else "body", len(A["pos"]) // 3, len(I) // 3))

if head_hi[1] < head_lo[1]:
    sys.exit("no head parts found: is a helm/eyes piece attached to the head bone?")
H = head_hi[1] - head_lo[1]
head = {"center": [round((head_lo[0] + head_hi[0]) / 2, 4), round((head_lo[1] + head_hi[1]) / 2 - HEAD_LIFT * H, 4), 0],
        "span": round(HEAD_SPAN * H, 4)}
model = {"box": [lo, hi], "pivot": [pivot_idle, pivot_salute], "head": head, "textures": textures, "parts": parts}
with open(out_path, "w") as f:
    json.dump(model, f, separators=(",", ":"))
print("knight.json: %d bytes, %d parts, %d textures, head %s" % (os.path.getsize(out_path), len(parts), len(textures), head))
