"""Runs INSIDE Blender (headless):  blender -b --python blender_export.py -- <cache_dir> <out_dir> [--no-blend]

Reads the costume pieces and the knight's skeleton poses downloaded by costume2thymer.py and
  1. rebuilds the knight's skeleton (41 bones) from knight-idle.gltf, because the pieces carry no usable rig: the game skins by bone
     *name* onto the shared skeleton and the exported inverse-bind matrices are identity,
  2. skins the armor to it, bone-parents every other piece (helm, eyes, weapon, shield) where its placement matrix says,
  3. bakes the Idle and Salute actions onto the rig,
  4. writes <out_dir>/parts.json: per mesh the idle pose and the salute pose per vertex (same topology), head weights, UVs;
     the head pivot, and a costume.blend to look at.
Coordinates leave Blender as OpenGL Y-up with the knight facing +z (what the plugin's WebGL renderer wants).
"""
import json, math, os, re, sys

import bpy
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
CACHE, OUT = argv[0], argv[1]
SAVE_BLEND = "--no-blend" not in argv
MODELS, GAME = os.path.join(CACHE, "models"), os.path.join(CACHE, "game-data")
meta = json.load(open(os.path.join(CACHE, "costume.json")))
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24

# glTF (Z-up game space, exported as-is) -> Blender import space, and import space -> GL Y-up facing +z
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
G = Matrix(((1, 0, 0, 0), (0, -1, 0, 0), (0, 0, -1, 0), (0, 0, 0, 1)))
HEAD_BONES = ("bone_helmet", "Bip01 Head", "Bip01 Head Adjust")


def base(name):
    return re.sub(r"\.\d{3}$", "", name)


def clean(m):  # drop scale
    return Matrix.Translation(m.translation) @ m.to_quaternion().to_matrix().to_4x4()


def log(*a):
    print("[blender_export]", *a, flush=True)


# ---------------------------------------------------------------------------------------------------------------------
# 1. the skeleton, from the knight's reference pose
g = json.load(open(os.path.join(GAME, "knight-idle.gltf")))
N = g["nodes"]


def local(n):
    if "matrix" in n:
        return Matrix([n["matrix"][i::4] for i in range(4)])
    t = Vector(n.get("translation", (0, 0, 0)))
    r = n.get("rotation", (0, 0, 0, 1))
    q = Quaternion((r[3], r[0], r[1], r[2]))
    return Matrix.Translation(t) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((*n.get("scale", (1, 1, 1)), 1))


parent = {c: i for i, n in enumerate(N) for c in n.get("children", [])}
_w = {}


def world(i):
    if i not in _w:
        _w[i] = (world(parent[i]) if i in parent else Matrix.Identity(4)) @ local(N[i])
    return _w[i]


is_bone = lambda n: n["name"].startswith(("Bip01", "Bone ", "bone_"))
bone_idx = [i for i, n in enumerate(N) if is_bone(n)]


def bone_parent(i):
    p = parent.get(i)
    while p is not None and not is_bone(N[p]):
        p = parent.get(p)
    return p


rest = {N[i]["name"]: clean(C @ world(i) @ C.inverted()) for i in bone_idx}
adata = bpy.data.armatures.new("Knight_Rig")
rig = bpy.data.objects.new("Knight_Rig", adata)
sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for i in bone_idx:
    nm = N[i]["name"]
    eb = adata.edit_bones.new(nm)
    eb.head = (0, 0, 0); eb.tail = (0, 0.03, 0); eb.matrix = rest[nm]
for i in bone_idx:
    p = bone_parent(i)
    if p is not None:
        adata.edit_bones[N[i]["name"]].parent = adata.edit_bones[N[p]["name"]]
bpy.ops.object.mode_set(mode="OBJECT")
order = []


def walk(b):
    order.append(b.name)
    [walk(c) for c in b.children]


[walk(b) for b in adata.bones if b.parent is None]
Bm = {b.name: b.matrix_local.copy() for b in adata.bones}
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"
log("rig:", len(adata.bones), "bones")


# ---------------------------------------------------------------------------------------------------------------------
# 2. the costume pieces
def import_gltf(path):
    bo, ba = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in bo], [a for a in bpy.data.actions if a not in ba]


skinned, static_roots, piece_of = [], [], {}
for fname in meta["files"]:
    objs, acts = import_gltf(os.path.join(MODELS, fname))
    for a in acts:
        bpy.data.actions.remove(a)
    arms = [o for o in objs if o.type == "ARMATURE"]
    meshes = [o for o in objs if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]
    if meshes:  # skinned (armor): bind to our rig by vertex-group names
        for o in meshes:
            missing = [vg.name for vg in o.vertex_groups if vg.name not in adata.bones]
            if missing:
                log("WARNING: bones not in the knight skeleton:", missing)
            o.parent = rig
            o.matrix_parent_inverse = Matrix.Identity(4)
            for m in o.modifiers:
                if m.type == "ARMATURE":
                    m.object = rig
            piece_of[o.name] = fname
        skinned += meshes
        keep = set(meshes)
        for o in objs:  # the importer's own skeleton, its bone-shape sphere and anchors
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
    else:       # a placed piece (helm, eyes, weapon, shield): everything hangs off one placement empty
        roots = [o for o in objs if o.parent is None and o.type == "EMPTY"]
        for o in arms:
            bpy.data.objects.remove(o, do_unlink=True)
        for r in roots:
            static_roots.append(r)
            for o in objs:
                if o.type == "MESH":
                    piece_of[o.name] = fname
log("skinned meshes:", [o.name for o in skinned], "| placed pieces:", [r.name for r in static_roots])

# bone-parent each placed piece to the bone whose rest transform its placement matrix equals
bone_for = {}
cands = [n for n in Bm if n.startswith("bone_") or n in HEAD_BONES]
for root in static_roots:
    W0 = root.matrix_world.copy()
    best = min(cands, key=lambda n: (Bm[n].translation - W0.translation).length)
    d = (Bm[best].translation - W0.translation).length
    if d > 0.05:
        log("WARNING: placement of", root.name, "is", round(d, 3), "from the nearest bone", best)
    b = adata.bones[best]
    Pm = rig.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))
    root.parent = rig; root.parent_type = "BONE"; root.parent_bone = best
    root.matrix_parent_inverse = Pm.inverted(); root.matrix_basis = W0
    bone_for[root.name] = best
log("placed on bones:", bone_for)


# ---------------------------------------------------------------------------------------------------------------------
# 3. the poses: bake Idle and Salute from the game's own skeleton animations
def basis_of(emp):
    P = {nm: clean(emp[nm].matrix_world) for nm in order}
    out = {}
    for nm in order:
        b = adata.bones[nm]
        if b.parent:
            rel = Bm[b.parent.name].inverted() @ Bm[nm]
            out[nm] = rel.inverted() @ P[b.parent.name].inverted() @ P[nm]
        else:
            out[nm] = Bm[nm].inverted() @ P[nm]
    return out


def key_pose(act, basis, frame):
    rig.animation_data.action = act
    for nm, m in basis.items():
        pb = rig.pose.bones[nm]
        pb.matrix_basis = m
        pb.keyframe_insert("location", frame=frame); pb.keyframe_insert("rotation_quaternion", frame=frame); pb.keyframe_insert("scale", frame=frame)


def pose_empties(name):
    objs, acts = import_gltf(os.path.join(GAME, f"knight-{name}.gltf"))
    emp = {base(o.name): o for o in objs if base(o.name) in Bm}
    assert len(emp) == len(Bm), (name, len(emp), len(Bm))
    end = max(a.frame_range[1] for a in acts) if acts else 0
    return objs, acts, emp, int(math.ceil(end))


rig.animation_data_create()
idle_objs, idle_acts, idle_emp, idle_end = pose_empties("idle")
act_idle = bpy.data.actions.new("Idle")
sc.frame_set(0)
basis_idle0 = basis_of(idle_emp)
for f in range(0, idle_end + 1):
    sc.frame_set(f)
    key_pose(act_idle, basis_of(idle_emp), f)
sal_json = json.load(open(os.path.join(GAME, "knight-salute.gltf")))
snames = {i: n["name"] for i, n in enumerate(sal_json["nodes"])}
SAL = {snames[c["target"]["node"]] for c in sal_json["animations"][0]["channels"]}
sal_objs, sal_acts, sal_emp, sal_end = pose_empties("salute")
act_sal = bpy.data.actions.new("Salute")
for f in range(0, sal_end + 1):
    sc.frame_set(f)
    cur = basis_of(sal_emp)
    key_pose(act_sal, {nm: (cur[nm] if nm in SAL else basis_idle0[nm]) for nm in order}, f)
for o in idle_objs + sal_objs:
    bpy.data.objects.remove(o, do_unlink=True)
for a in idle_acts + sal_acts:
    bpy.data.actions.remove(a)
act_idle.use_fake_user = act_sal.use_fake_user = True
log("baked Idle 0-%d, Salute 0-%d (animates %d bones)" % (idle_end, sal_end, len(SAL)))


# ---------------------------------------------------------------------------------------------------------------------
# 4. evaluate the meshes in both poses and write them out
def evaluate(act, frame):
    rig.animation_data.action = act
    sc.frame_set(frame)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    meshes = {}
    for o in skinned + [m for m in bpy.data.objects if m.type == "MESH" and m not in skinned]:
        oe = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(oe, depsgraph=dg)
        me.transform(G @ oe.matrix_world)
        me.calc_loop_triangles()
        meshes[o.name] = me
    pivot = (G @ rig.matrix_world @ rig.pose.bones["Bip01 Head"].head).to_tuple()
    return meshes, pivot


mi, pivot_i = evaluate(act_idle, 0)
ms, pivot_s = evaluate(act_sal, sal_end)
result = {"pivot_idle": pivot_i, "pivot_salute": pivot_s, "parts": []}
head_bone_of = lambda o: bone_for.get((o.parent.name if o.parent else ""), None)
for name, a in mi.items():
    o = bpy.data.objects[name]
    b = ms[name]
    assert len(a.loops) == len(b.loops) and len(a.vertices) == len(b.vertices), name
    # a placed piece is part of the head when its placement bone is a head bone
    anc = o
    while anc.parent and anc.parent != rig:
        anc = anc.parent
    placed_on = bone_for.get(anc.name)
    is_head_piece = placed_on in HEAD_BONES if placed_on else False
    vg = o.vertex_groups.get("Bip01 Head") if o in skinned else None

    def head_weight(vi):
        if is_head_piece:
            return 1.0
        if vg is None:
            return 0.0
        for gr in o.data.vertices[vi].groups:
            if gr.group == vg.index:
                return gr.weight
        return 0.0

    mat = o.material_slots[0].material
    img = next(n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
    uv = a.uv_layers.active.data
    keymap, P, Nn, P2, N2, U, H, I = {}, [], [], [], [], [], [], []
    for tri in a.loop_triangles:
        for li in tri.loops:
            vi = a.loops[li].vertex_index
            nl = a.corner_normals[li].vector
            u = uv[li].uv
            key = (vi, round(nl.x, 3), round(nl.y, 3), round(nl.z, 3), round(u.x, 5), round(u.y, 5))
            if key not in keymap:
                keymap[key] = len(P) // 3
                P += list(a.vertices[vi].co); Nn += list(nl)
                P2 += list(b.vertices[vi].co); N2 += list(b.corner_normals[li].vector)
                U += [u.x, u.y]; H.append(head_weight(vi))
            I.append(keymap[key])
    result["parts"].append({"name": name, "piece": piece_of.get(name, ""), "tex": img.name, "pos": P, "nrm": Nn, "pos2": P2,
                            "nrm2": N2, "uv": U, "hw": H, "idx": I})
for m in list(mi.values()) + list(ms.values()):
    bpy.data.meshes.remove(m)
json.dump(result, open(os.path.join(OUT, "parts.json"), "w"))
log("parts.json:", {p["name"]: (len(p["pos"]) // 3, len(p["idx"]) // 3) for p in result["parts"]})

# ---------------------------------------------------------------------------------------------------------------------
# 5. a .blend to look at: standing up (Z-up), Idle playing
if SAVE_BLEND:
    root = bpy.data.objects.new("Costume_Root", None)
    sc.collection.objects.link(root)
    rig.parent = root
    root.rotation_euler = (-math.pi / 2, 0, 0)
    rig.animation_data.action = act_idle
    sc.frame_start, sc.frame_end = 0, idle_end
    sc.frame_set(0)
    for img in bpy.data.images:
        if img.source == "FILE" and not img.packed_file:
            img.pack()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "costume.blend"))
    log("saved costume.blend")
