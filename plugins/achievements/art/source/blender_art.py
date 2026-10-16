"""Runs INSIDE Blender (headless):  blender -b --factory-startup <costume.blend> --python blender_art.py -- <jobs.json>

Renders transparent, ink-outlined sprites of a costume (the knight rig built by tools/costume2thymer/blender_export.py) in any of the
game's poses, plus a few small invented characters and props (gremlin, owl, crown, chest) built from primitives in the same style.
The sprites are then painted into scenes by scenes_paint.js.

jobs.json: { "out": dir, "gamedata": dir, "size": 1024, "whiten": {"eyes": [image-name prefixes], "helm": [..]},
             "jobs": [ {"name", "kind": "hero"|"gremlin"|"owl"|"crown"|"chest", "pose", "frame", "rot": [[axis, degrees], ...],
                        "cam": {"scale", "pitch", "target": [x, y, z]}, "size": [w, h], "variant"} ] }
"""
import json, math, os, re, sys

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

cfg = json.load(open(sys.argv[sys.argv.index("--") + 1]))
OUT, GAME = cfg["out"], cfg["gamedata"]
SIZE = cfg.get("size", 1024)
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
log = lambda *a: print("[art]", *a, flush=True)
INK = (0.12, 0.085, 0.06)


# ------------------------------------------------------------------------------------------------ render setup
def setup_render():
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.eevee.taa_render_samples = 48
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.86, 1.0, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.85
    sc.world = w
    key = bpy.data.lights.new("key", "SUN"); key.energy = 3.4; key.color = (1.0, 0.95, 0.86)
    ko = bpy.data.objects.new("key", key); sc.collection.objects.link(ko); ko.rotation_euler = (math.radians(52), 0, math.radians(-38))
    rim = bpy.data.lights.new("rim", "SUN"); rim.energy = 1.6; rim.color = (0.8, 0.9, 1.0)
    ro = bpy.data.objects.new("rim", rim); sc.collection.objects.link(ro); ro.rotation_euler = (math.radians(70), 0, math.radians(150))
    cd = bpy.data.cameras.new("cam"); cd.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
    sc.render.use_freestyle = True
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(105)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("ink")
    ls.select_silhouette = ls.select_border = ls.select_crease = ls.select_contour = ls.select_external_contour = True
    ls.linestyle = bpy.data.linestyles.new("ink")
    ls.linestyle.color = INK
    ls.linestyle.thickness = 5.0
    return cam


def frame_camera(cam, scale, pitch, target):
    cam.data.ortho_scale = scale
    t = Vector(target)
    p = math.radians(pitch)
    cam.location = t + Vector((0, -10 * math.cos(p), 10 * math.sin(p)))
    cam.rotation_euler = (math.radians(90) - p, 0, 0)


# ------------------------------------------------------------------------------------------------ the costume's poses
rig = bpy.data.objects.get("Knight_Rig")
if rig:
    root = rig.parent
    Bm = {b.name: b.matrix_local.copy() for b in rig.data.bones}
    order = []

    def walk(b):
        order.append(b.name)
        [walk(c) for c in b.children]

    [walk(b) for b in rig.data.bones if b.parent is None]

    def clean(m):
        return Matrix.Translation(m.translation) @ m.to_quaternion().to_matrix().to_4x4()

    def base(n):
        return re.sub(r"\.\d{3}$", "", n)

    def basis_of(emp):
        P = {nm: clean(emp[nm].matrix_world) for nm in order}
        out = {}
        for nm in order:
            b = rig.data.bones[nm]
            if b.parent:
                rel = Bm[b.parent.name].inverted() @ Bm[nm]
                out[nm] = rel.inverted() @ P[b.parent.name].inverted() @ P[nm]
            else:
                out[nm] = Bm[nm].inverted() @ P[nm]
        return out

    def bake_pose(pose):
        """An action named `pose`, baked from the game's own skeleton animation; bones the file leaves alone keep the idle pose."""
        if pose in bpy.data.actions:
            return bpy.data.actions[pose]
        idle = bpy.data.actions["Idle"]
        jd = json.load(open(os.path.join(GAME, f"knight-{pose}.gltf")))
        names = {i: n["name"] for i, n in enumerate(jd["nodes"])}
        animated = {names[c["target"]["node"]] for c in jd["animations"][0]["channels"]}
        bo, ba = set(bpy.data.objects), set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=os.path.join(GAME, f"knight-{pose}.gltf"))
        new = [o for o in bpy.data.objects if o not in bo]
        acts = [a for a in bpy.data.actions if a not in ba]
        emp = {base(o.name): o for o in new if base(o.name) in Bm}
        end = int(math.ceil(max(a.frame_range[1] for a in acts))) if acts else 0
        # idle frame 0 for the bones the pose does not animate
        rig.animation_data.action = idle
        sc.frame_set(0)
        # the idle's own empties are gone; take its basis from the pose bones of the idle action
        idle_basis = {pb.name: pb.matrix_basis.copy() for pb in rig.pose.bones}
        act = bpy.data.actions.new(pose)
        rig.animation_data.action = act
        for f in range(0, end + 1):
            sc.frame_set(f)
            cur = basis_of(emp)
            for nm in order:
                pb = rig.pose.bones[nm]
                pb.matrix_basis = cur[nm] if nm in animated else idle_basis[nm]
                pb.keyframe_insert("location", frame=f); pb.keyframe_insert("rotation_quaternion", frame=f); pb.keyframe_insert("scale", frame=f)
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
        for a in acts:
            bpy.data.actions.remove(a)
        act.use_fake_user = True
        log("baked", pose, "0-%d (animates %d bones)" % (end, len(animated)))
        return act


# ------------------------------------------------------------------------------------------------ small invented characters
COLL = {}


def coll(name):
    if name not in COLL:
        c = bpy.data.collections.new(name)
        sc.collection.children.link(c)
        COLL[name] = c
    return COLL[name]


def mat(name, rgb, rough=0.85, metal=0.0, emit=None, dark=0.62):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*[c * dark for c in rgb], 1)   # the lights are bright: paint the props a little darker
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 0.6
    return m


def prim(kind, c, m, loc, scale=(1, 1, 1), rot=(0, 0, 0), **kw):
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=18, location=loc, **kw)
    elif kind == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=24, location=loc, **kw)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, location=loc, **kw)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(location=loc, **kw)
    elif kind == "cube":
        bpy.ops.mesh.primitive_cube_add(location=loc, **kw)
    o = bpy.context.active_object
    o.scale = scale
    o.rotation_euler = [math.radians(a) for a in rot]
    o.data.materials.append(m)
    if kind in ("sphere", "cyl", "cone", "torus"):
        bpy.ops.object.shade_smooth()
    for cc in list(o.users_collection):
        cc.objects.unlink(o)
    c.objects.link(o)
    return o


def limb(c, m, a, b, r):
    """A capsule-like limb from a to b."""
    a, b = Vector(a), Vector(b)
    mid = (a + b) / 2
    d = b - a
    o = prim("cyl", c, m, mid, (r, r, d.length / 2))
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    prim("sphere", c, m, a, (r, r, r)); prim("sphere", c, m, b, (r, r, r))


def build_gremlin(variant="threat"):
    c = coll("gremlin")
    g1, g2, dk = mat("g1", (0.55, 0.69, 0.47)), mat("g2", (0.48, 0.62, 0.41)), mat("gd", (0.14, 0.1, 0.1))
    pink, white, yel, steel = mat("pink", (0.91, 0.62, 0.62)), mat("w", (1, 1, 0.92)), mat("y", (1, 0.95, 0.6), 0.5), mat("steel", (0.6, 0.63, 0.7), 0.5, 0.5)
    prim("sphere", c, g2, (0, 0, 0.3), (0.26, 0.22, 0.3))                       # body
    prim("sphere", c, g1, (0, 0, 0.7), (0.34, 0.3, 0.3))                        # head
    for s in (-1, 1):
        prim("cone", c, g1, (s * 0.38, 0, 0.9), (0.075, 0.03, 0.22), rot=(0, 0, 0), radius1=1, depth=2)
        o = c.objects[-1]; o.rotation_euler = (0, math.radians(s * -38), 0)
        prim("cone", c, pink, (s * 0.365, -0.014, 0.89), (0.05, 0.022, 0.16), radius1=1, depth=2)
        c.objects[-1].rotation_euler = (0, math.radians(s * -38), 0)
        prim("sphere", c, white, (s * 0.125, -0.25, 0.74), (0.105, 0.07, 0.105))
        prim("sphere", c, dk, (s * 0.125, -0.31, 0.74), (0.05, 0.03, 0.055))
        limb(c, g2, (s * 0.2, 0, 0.42), (s * 0.34, -0.03, 0.62) if variant == "threat" else (s * 0.3, -0.05, 0.22), 0.05)
        limb(c, g2, (s * 0.1, 0, 0.12), (s * 0.12, -0.02, 0.02), 0.06)
        prim("sphere", c, g2, (s * 0.13, -0.06, -0.01), (0.1, 0.13, 0.05))
    prim("sphere", c, dk, (0, -0.29, 0.58), (0.12, 0.04, 0.05))                 # mouth
    for s in (-1, 1):
        prim("cone", c, white, (s * 0.05, -0.32, 0.605), (0.02, 0.02, 0.035), radius1=1, depth=2)
        c.objects[-1].rotation_euler = (math.radians(180), 0, 0)
    prim("cyl", c, steel, (0, 0, 1.02), (0.05, 0.05, 0.05)); prim("cyl", c, steel, (0, 0, 1.08), (0.075, 0.075, 0.02))   # the bolt
    return c


def build_owl():
    c = coll("owl")
    br, bl, belly, eye, dk, beak = mat("ob", (0.62, 0.45, 0.27)), mat("obl", (0.72, 0.55, 0.34)), mat("obe", (0.93, 0.83, 0.64)), mat("oey", (1, 0.93, 0.5), 0.4), mat("od", (0.1, 0.08, 0.08)), mat("obk", (0.95, 0.62, 0.2))
    prim("sphere", c, br, (0, 0, 0.45), (0.38, 0.32, 0.46))
    prim("sphere", c, belly, (0, -0.2, 0.4), (0.26, 0.16, 0.34))
    prim("sphere", c, bl, (0, 0, 0.98), (0.4, 0.34, 0.34))
    for s in (-1, 1):
        prim("cone", c, br, (s * 0.26, 0, 1.28), (0.09, 0.05, 0.14), radius1=1, depth=2); c.objects[-1].rotation_euler = (0, math.radians(s * -22), 0)
        prim("sphere", c, eye, (s * 0.15, -0.26, 1.0), (0.14, 0.08, 0.14))
        prim("sphere", c, dk, (s * 0.15, -0.33, 1.0), (0.06, 0.035, 0.065))
        prim("sphere", c, br, (s * 0.38, 0.02, 0.5), (0.12, 0.26, 0.36)); c.objects[-1].rotation_euler = (0, math.radians(s * 12), 0)
        prim("cone", c, beak, (s * 0.1, -0.1, 0.0), (0.04, 0.05, 0.08), radius1=1, depth=2)
    prim("cone", c, beak, (0, -0.33, 0.9), (0.06, 0.07, 0.09), radius1=1, depth=2); c.objects[-1].rotation_euler = (math.radians(-100), 0, 0)
    prim("sphere", c, br, (0, 0.28, 0.1), (0.2, 0.1, 0.34))
    return c


def build_crown():
    c = coll("crown")
    gold, gold2, red, blue = mat("gold", (1.0, 0.76, 0.2), 0.35, 0.35), mat("gold2", (0.95, 0.62, 0.12), 0.4, 0.35), mat("red", (0.9, 0.12, 0.25), 0.2), mat("blue", (0.15, 0.4, 0.95), 0.2)
    prim("cyl", c, gold2, (0, 0, 0.11), (0.5, 0.5, 0.11))
    for i in range(5):
        a = i / 5 * math.tau
        x, y = 0.5 * math.cos(a), 0.5 * math.sin(a)
        prim("cone", c, gold, (x, y, 0.4), (0.12, 0.12, 0.2), radius1=1, depth=2)
        prim("sphere", c, gold, (x, y, 0.62), (0.075, 0.075, 0.075))
    for i, a in enumerate([0.0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6]):
        prim("sphere", c, red if i % 2 else blue, (0.5 * math.cos(a), 0.5 * math.sin(a), 0.11), (0.06, 0.06, 0.06))
    return c


def build_wings():
    """Layered 3D feathers and a halo, in the hero's own frame (feet at the origin, facing -Y), to be drawn behind the hero."""
    c = coll("wings")
    white, cream = mat("wf", (1.0, 0.98, 0.95), 0.9, dark=0.8), mat("wf2", (0.97, 0.9, 0.76), 0.9, dark=0.78)
    gold = mat("halo", (1.0, 0.78, 0.2), 0.3, 0.3, emit=(1.0, 0.7, 0.1), dark=1.0)
    rows = [(13, 0.92, 0.07, -52, 62, 0.00, cream), (12, 0.66, 0.066, -34, 66, 0.05, white), (10, 0.43, 0.062, -12, 70, 0.1, white), (8, 0.26, 0.058, 10, 72, 0.14, white)]
    for s in (-1, 1):
        base = Vector((s * 0.13, 0.2, 0.92))
        for (n, L0, wid, a0, a1, tilt, m) in rows:
            for i in range(n):
                phi = math.radians(a0 + (a1 - a0) * i / (n - 1))
                L = L0 * (0.7 + 0.3 * math.cos((phi - math.radians(2)) * 1.1))
                d = Vector((s * math.cos(phi), 0.1 + tilt, math.sin(phi))).normalized()
                o = prim("sphere", c, m, base + d * (L / 2), (wid, 0.014, L / 2))
                o.rotation_mode = "QUATERNION"
                o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    prim("torus", c, gold, (0, 0.06, 1.66), (1, 1, 1), major_radius=0.22, minor_radius=0.032)
    return c


def build_chest():
    c = coll("chest")
    wood, wood2, band, gold = mat("wood", (0.5, 0.3, 0.16)), mat("wood2", (0.6, 0.38, 0.2)), mat("band", (0.35, 0.33, 0.3), 0.5, 0.5), mat("gold", (1.0, 0.76, 0.2), 0.35, 0.35)
    prim("cube", c, wood, (0, 0, 0.25), (0.6, 0.38, 0.25), size=2)
    prim("cyl", c, wood2, (0, 0, 0.58), (0.38, 0.6, 0.5), rot=(0, 90, 0)); c.objects[-1].scale = (0.38, 0.38, 0.6)
    for x in (-0.38, 0.38):
        prim("cube", c, band, (x, 0, 0.3), (0.05, 0.4, 0.52), size=2)
    prim("cube", c, gold, (0, -0.4, 0.45), (0.08, 0.04, 0.1), size=2)
    for i in range(7):
        prim("cyl", c, gold, (-0.3 + i * 0.1, -0.05 + 0.1 * math.sin(i), 0.5 + 0.05 * (i % 3)), (0.09, 0.09, 0.02), rot=(90, 0, 20 * i))
    return c


# ------------------------------------------------------------------------------------------------ pictures
EYE_IMG = EYE_BASE = None


def set_eyes(mode):
    """open / closed (the pill squashed to a line) / wide (a little taller)."""
    import numpy as np
    if EYE_IMG is None:
        return
    base = EYE_BASE
    lum = base[:, :, :3].max(axis=2)
    ys = np.where((lum > 0.6).any(axis=1))[0]
    cy, H = (ys.min() + ys.max()) / 2, base.shape[0]
    k = {"open": 1.0, "closed": 5.0, "wide": 0.82}[mode]
    rows = np.clip(np.round(cy + (np.arange(H) - cy) * k).astype(int), 0, H - 1)
    EYE_IMG.pixels.foreach_set(base[rows].reshape(-1).astype(np.float32))
    EYE_IMG.update()


def whiten():
    """The costume's magenta eye glow (and the helm's accents) become white, as in the plugin."""
    import numpy as np
    for kind, prefixes in cfg.get("whiten", {}).items():
        for img in bpy.data.images:
            if not any(img.name.startswith(p) for p in prefixes):
                continue
            px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
            if kind == "eyes":
                px[:, :3] = px[:, :3].max(axis=1, keepdims=True)
                global EYE_IMG, EYE_BASE
                EYE_IMG, EYE_BASE = img, px.reshape(img.size[1], img.size[0], 4).copy()
            else:
                r, g, b = px[:, 0], px[:, 1], px[:, 2]
                m = (r > 0.27) & (b > 0.27) & (g < 0.55 * np.minimum(r, b))
                v = np.minimum(1.0, np.maximum(r, b) * 1.7)
                for k in range(3):
                    px[m, k] = v[m]
            img.pixels.foreach_set(px.ravel())
            img.update()
            log("whitened", img.name, kind)


cam = setup_render()
if rig:
    whiten()
built = {}
for job in cfg["jobs"]:
    kind = job.get("kind", "hero")
    if kind != "hero" and kind not in built:
        {"gremlin": lambda: build_gremlin(job.get("variant", "threat")), "owl": build_owl, "crown": build_crown, "chest": build_chest, "wings": build_wings}[kind]()
        built[kind] = True
for name, c in COLL.items():
    c.hide_render = True
    c.hide_viewport = True

for job in cfg["jobs"]:
    kind = job.get("kind", "hero")
    w, h = job.get("size", [SIZE, SIZE])
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = job.get("line", 1.0)
    for lineset in bpy.context.view_layer.freestyle_settings.linesets:
        lineset.linestyle.thickness = job.get("ink", 6.5) * w / 1024
    cm = job.get("cam", {})
    if not isinstance(cm.get("target"), str):
        frame_camera(cam, cm.get("scale", 2.0), cm.get("pitch", 4), cm.get("target", [0, 0, 0.62]))
    if kind == "hero":
        for c in COLL.values():
            c.hide_render = True
        for o in bpy.data.objects:
            if o.type in ("MESH", "ARMATURE", "EMPTY") and not any(o.name in c.objects for c in COLL.values()):
                o.hide_render = False
        set_eyes(job.get("eyes", "open"))
        act = bake_pose(job["pose"]) if job["pose"] not in ("Idle", "Salute") else bpy.data.actions[job["pose"]]
        rig.animation_data.action = act
        sc.frame_set(int(job.get("frame", act.frame_range[1] if job["pose"] != "Idle" else 0)))
        rig.parent.rotation_mode = "XYZ"
        M = Matrix.Rotation(math.radians(-90), 4, "X")
        for axis, deg in job.get("rot", []):
            M = Matrix.Rotation(math.radians(deg), 4, axis) @ M
        rig.parent.matrix_world = M
        bpy.context.view_layer.update()
        for o in bpy.data.objects:
            if o.type == "MESH" and not any(o.name in c.objects for c in COLL.values()):
                o.hide_render = bool(job.get("only")) and o.name not in job["only"]
        if isinstance(cm.get("target"), str):
            ob = bpy.data.objects[cm["target"][4:]]
            pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
            ctr = sum(pts, Vector()) / 8
            frame_camera(cam, cm.get("scale", 1.0), cm.get("pitch", 0), ctr)
    else:
        for c in COLL.values():
            c.hide_render = c.name != kind
        for o in bpy.data.objects:
            if o.type in ("MESH", "ARMATURE", "EMPTY") and not any(o.name in c.objects for c in COLL.values()):
                o.hide_render = True
        cobj = COLL[kind]
        M = Matrix.Identity(4)
        for axis, deg in job.get("rot", []):
            M = Matrix.Rotation(math.radians(deg), 4, axis) @ M
        pivot = Vector(job.get("pivot", [0, 0, 0]))
        for o in cobj.objects:
            if "base" not in o:
                o["base"] = [list(r) for r in o.matrix_world]
            o.matrix_world = M @ Matrix([list(r) for r in o["base"]])
    # twice: without ink (a clean silhouette, to cut the ghost outlines of see-through planes) and with
    sc.render.use_freestyle = False
    sc.render.filepath = os.path.join(OUT, job["name"] + "_clean.png")
    bpy.ops.render.render(write_still=True)
    sc.render.use_freestyle = True
    sc.render.filepath = os.path.join(OUT, job["name"] + ".png")
    bpy.ops.render.render(write_still=True)
    log("rendered", job["name"])
