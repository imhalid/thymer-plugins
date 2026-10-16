# Notes: how the knight mascot was made (and how to redo any step)

Working notes written after the fact, so that nobody has to rediscover this. Everything below was observed, not guessed, unless it
says "assumed". Dates are 2026-10-16. For the one-command usage see `README.md`; this file is the *why* and the *where from*.

## 0. Overview

Goal: replace the Sonic mascot of the Achievements plugin (Thymer) with a knight from a Kozmas costume ("Proto Blade"), with a
head that turns on its own, a salute at unlocks, white eyes, a picture as the card background, and no Sonic wording.

```
kozmas.gg costume page ──► pieces list ──► assets.kozmas.gg gltf/bin/png + kozmas.gg/game-data/knight-*.gltf
        │ fetch (costume2thymer.py)
        ▼
  .cache/<costume>/{models,game-data,costume.json}
        │ blender_export.py   (headless Blender: rig + skin + place + bake Idle/Salute + evaluate 2 poses)
        ▼
  .cache/<costume>/work/{parts.json,costume.blend}
        │ build_model.py      (head/body split, crop, pack, textures, framing)
        ▼
  plugins/achievements/knight.json ──► build.mjs (replaces __KNIGHT__) ──► achievements.js ──► push_thymer.py ──► Thymer (MCP :13100)
```

## 1. Sources (where everything came from)

### 1.1 Kozmas (https://www.kozmas.gg)
An independent fan site for **Spiral Knights** (footer: "Spiral Knights game assets (c) Grey Havens. Independent fan project.").
A Next.js app. Pages used:

| Page | Use |
| --- | --- |
| `/items/<slug>` (e.g. `/items/airbraker-shield`) | an item; shows "Item reference" like `Gear/Shield/Airbraker Shield`; "Try it on" opens the dressing room |
| `/costumes/<slug>` (e.g. `/costumes/proto-blade`) | a costume: 4 pieces (armour, helmet, weapon, shield) |
| `/dressing-room?item=<id>` / `?costume=<uuid>` | the 3D viewer (three.js); its network requests were how the file names were first found |

**The costume page's server-rendered HTML lists the pieces**, in a JSON-escaped payload, as an array right before `"pose"`:
`["/assets/models/bare-costume-armor-heavenly_guardian_armor.gltf", "...helm...", "...weapon-sword-proto_blade.gltf",
"...gear-shield-honor_shield_1.gltf", "/assets/models/eyes-pill-personal.gltf"], "pose": "sword"`. `parse_pieces()` in
`costume2thymer.py` reads exactly that. No browser is needed (`curl -A "Mozilla/5.0"` is enough; the HTML is ~570 KB).
Item entries in the same payload carry `"file":"bare-weapon-sword-proto_blade.gltf"`, `"slot":"Weapon"`, `"slug":"proto-blade"`.

Proto Blade costume ("Op-Src" is the creator shown): Heavenly Guardian Armor (`Costume/Armor/...`), Heavenly Guardian Helm
(`Costume/Helm/...`), Proto Blade (`Weapon/Sword/Proto Blade`), Honor Guard shield (`Gear/Shield/Honor Shield 1`), eyes `pill`,
personal colour `Silver`, pose `sword`.

### 1.2 Model files
* Pieces: `https://assets.kozmas.gg/catalog/models/<file>.gltf`; its `.bin` and `tex/<name>.png` are relative to it. Names are
  `bare-<family>-<slug>.gltf` (`family` from the item reference: `Weapon/Sword/Proto Blade` -> `weapon-sword-proto_blade`).
  The site's own viewer appends `?v=<hash>` (cache busting); not needed. Un-prefixed names (`gear-shield-airbraker_shield.gltf`)
  are the same models with the site's own costume variants. The `.bin` names can belong to a *different* item
  (the helm uses `bare-costume-game_master-gm_helmet_nose_open.bin`, the shield `...test_shield_bash-defender_shield_bash.bin`):
  always follow the gltf's `buffers[].uri`, never derive it.
* Skeleton poses: `https://www.kozmas.gg/game-data/knight-<pose>.gltf` (+ `.bin`). Poses (id: seconds): `idle` 2.40, `onhip` 2.67,
  `salute` 0.27, `sit` 5.60, `sword` 1.00, `gun` 1.00, `bomb` 1.00, `sword-charge` 1.03, `gun-charge` 1.03, `bomb-charge` 0.67.
  `neutral` has no file (the site maps it to `idle`). Also `knight-hands-closed.gltf` (fingers, used when the shield is "in hand").
  The site's pose menu (`KNIGHT_POSES` in its JS): Automatic, Relaxed idle, Neutral (still), Hand on hip, Salute, Sitting, Sword
  ready, Gun ready, Bomb ready, Sword/Gun/Bomb charge hold. "Automatic" picks sword/gun/bomb from the weapon.
* Other `game-data`: `knight-preview/{backing.png,shadow.png,spotlight-scene.gltf}`, `mannequin/{head,body}-scene.gltf`.
* Exporter signature in every gltf: `"generator": "skah/assets ExportModels"`; the game is Spiral Knights ("skah" assets).
* Not scripted but known: a file's textures can be `personal-<hash>-0.png` (a baked recolour; `-index.png`, `-palette.png`, `.json`
  are the recolour sources), `item-...png` (plain), `particle-texture-*.png` (effects).

### 1.3 The picture for the card background
Supplied by the user in chat (226 x 263, a dark teal spotlight with a faint helm emblem; it looks like Kozmas'
`game-data/knight-preview/backing.png`, assumed). It was used as the card background for one iteration (`card-bg.jpg`, inlined in
`plugin.css`), then **replaced at the user's request** by a mask + god rays (section 4) and deleted; it is in git history (commit `eda5785`).

## 2. What the game files are like (findings that drive the code)

1. **No shaders.** Every `materials[].extras.meshPasses[].shaderState` is `{"type":"Disabled"}`. The game's look is fixed-function:
   a named material template in `materials[].extras.mode` and its expanded states in `meshPasses` (alpha test `GEQUAL 0.6`, blend
   factors, cull, depth, textures, `texturePremultiply`). Modes seen: `Model/Two-Sided/Opaque` (sword),
   `Model/Two-Sided/Masked (Soft) (Dark Back)` (Airbraker; two passes, the second a dark back face at 0.4 grey),
   `Model/Skinned/Two-Sided/Masked (Soft) (Dark Back)` (armor), `Model/Two-Sided/Masked (Soft)` (helm),
   `Model/Sphere Overlay/Additive Mask (Alt)` (Honor Shield, with a `-spec_` sphere-map texture), `Model/Additive` (eyes).
2. **Effects are data, not meshes**: `extras.effects[]` of kind `particles` hang off a `particles` node.
   * Sword glow (`attach_%ROOT%`, translation (0,-0.07,0.16), scale 0.67): 8 billboards, lifespan 1.25 s with `timeScale` 0.5
     (so 2.5 s), rate 5/s, speed 0, size three-point 0.25 -> 1 -> 0.25 (in 0.25 / out 0.25), colour three-point
     (0.2,0.6,0,a0) -> (0,1,0.7725,a0.1) -> (0.2,0.6,0,a0) (in/out 0.5), additive, texture `flare_twopoint.png`
     (256x256, **alpha is 1 everywhere, the shape is in RGB**: an additive streak).
   * Armor: two of them at the hands (nodes `Bip01 L Hand` (0.14,0,0) / `Bip01 R Hand` (0.14,-0.04,0), scale 0.75), gold
     (1,0.8,0,0) -> (1,1,1,a0.15), `flare_nopoint.png` (64x64, shape in alpha), random roll.
   These were rebuilt once in Blender (Track-To billboards, Object-Info colour driven additive material, cycling keyframes)
   and then **removed at the user's request** ("parilti efektleri olmamis"); they are *not* in the pipeline or the plugin.
3. **Coordinates:** the files are the game's Z-up space written into glTF as-is. Blender's importer therefore lays the knight on
   its back along **-Y** (height = -Y, the face points to -Z in import space). Import space -> GL Y-up facing +z is
   `diag(1,-1,-1)` (a 180° turn about X); `blender_export.py` calls it `G`. For a standing knight in Blender, parent the rig to an empty
   rotated -90° about X.
4. **The armor has no usable skeleton.** Its three skins have 22 / 12 / 13 joints (30 distinct), the joint nodes have no TRS and the
   `inverseBindMatrices` are all identity, so the importer puts every bone at the origin (armature 0.18 m big). The game skins by bone
   *name* onto the shared knight skeleton in `knight-idle.gltf` (49 nodes, **41 of them bones**: names starting `Bip01`, `Bone `,
   `bone_`; the rest are camera/shadow/pivot nodes). The mesh vertices are in model space at that skeleton's **reference (node)
   transforms**, which is the bind pose. => `blender_export.py` rebuilds the 41 bones from `knight-idle.gltf`'s node transforms and
   reuses the armor's vertex groups (named after the bones).
5. **Placed pieces** (helm, eyes, weapon, shield) are a root node with a `matrix` (called `placement`, or `eye attachment`) and no
   skin. **That matrix equals the rest world transform of the bone they attach to**: helm and eyes = `bone_helmet` (0,0.003,0.984),
   sword = `bone_weapon_r` (-0.463,-0.062,0.536), shield = `bone_shield` (0.517,0.026,0.748) (game coordinates). So: bone-parent each
   to the nearest `bone_*`.
6. **Which bones salute animates** (from `knight-salute.gltf`'s channels, 22 nodes): Head, Neck, Spine, Spine1, both Clavicle /
   UpperArm / Forearm / Hand, both Finger0/01/1/11, `bone_weapon_l`, `bone_weapon_r`. The rest of the body is not in the file:
   a standalone salute takes idle for those (done in `blender_export.py`).
7. The face is not in the armor mesh: the dark visor and the eyes are the `eyes-pill-personal` mesh (texture 128x256, a magenta pill on
   black, alpha 255 everywhere: additive art), the hat is the helm mesh. Only ~2 % of the armor's vertices are weighted to
   `Bip01 Head`.
8. The helm texture has ~167 magenta-ish pixels (e.g. (154,52,155)): the chin diamond and the side marks next to the eyes.

## 3. Rebuilding the rig (the maths, so it need not be re-derived)

`C` = glTF -> Blender import space = `[[1,0,0],[0,0,-1],[0,1,0]]`. For each bone node: `N0 = C·W·C⁻¹` (W = glTF world transform
from the node TRS chain), scale dropped. Bone matrix `B = N0` (so a bone's axes are the node's axes), head at the node origin, length 0.03.
Parent = nearest bone ancestor. Animation: for a frame, read each pose empty's world matrix `P` (import the pose gltf; it creates
animated empties), then the local basis is

```
root bone:   basis = B⁻¹ · P
child bone:  basis = (Bp⁻¹ · B)⁻¹ · Pp⁻¹ · P          (Bp, Pp = the parent's rest matrix and posed matrix)
```
Baked at 24 fps: Idle frames 0-58 (the gltf action is 57.6 frames long), Salute 0-7. Salute's non-animated bones take their
**idle frame-0 basis** (not their salute-file value). Check used: the armature's posed bone positions vs the empties' = 1e-6.
Placed pieces: `matrix_parent_inverse = (arm · B · T(0, length, 0))⁻¹`, `matrix_basis = placement`. (Bone parenting uses the bone's
*tail*, hence the `T(0,length,0)`.) Skinned armor: set the Armature modifier object to the new rig, parent with identity.

## 4. The model the plugin embeds (`knight.json`)

```jsonc
{ "box": [[x,y,z],[x,y,z]],          // bounds of everything kept (GL Y-up)
  "pivot": [[x,y,z],[x,y,z]],         // Bip01 Head origin in the idle pose, in the salute pose: where the head turns
  "head": { "center": [x,y,0], "span": s },   // the window: centre of the head's view, and the world height it spans
  "textures": ["data:image/png;base64,..."],  // 256 px max, 256-colour palette PNG
  "parts": [ { "tex": i, "color": [1,1,1], "h": 0|1,        // h = a head part (turns on its own)
               "pos","nrm","pos2","nrm2","uv": base64 float32 (pos/nrm: idle pose, pos2/nrm2: salute pose, same vertices),
               "idx": base64 uint16, "n": index count } ] }
```
* The renderer is the plugin's own tiny WebGL2 (`Mascot` in `achievements.src.js`): vertex shader
  `mix(aPos, aPos2, uMix)`, fragment alpha test `a < 0.5 -> discard`, light `0.66 + 0.62·max(dot(n, (0.4,0.7,0.8)),0)` plus a rim,
  `UNPACK_FLIP_Y_WEBGL = true` (so Blender's UVs go in unchanged), perspective 0.5 rad, camera at z = -2.15, canvas = 2x CSS px.
* Head vs body: a triangle is head if all three vertices have `Bip01 Head` weight > 0.5, or if its piece sits on a head bone
  (`bone_helmet`, `Bip01 Head`, `Bip01 Head Adjust`). The head turns around `pivot` (lerped idle -> salute by the salute blend);
  the body only sways slightly.
* Crop: body triangles whose centroid (idle or salute pose) is below `pivot.y - 0.525` are dropped (the card shows head and
  shoulders; the raised salute hand is kept). Weapon and shield pieces are skipped (never in the window; `--with-equipment` keeps them).
* Framing: with `H` = head height, `span = 1.59·H`, `center.y = middle - 0.117·H`, `center.x` = head middle, `center.z = 0`.
  For Proto Blade: head y 0.864..1.48 (H = 0.616), pivot (-0.027, 0.975, -0.004), centre (-0.0266, 1.1002, 0), span 0.9799.
  (Those were first hand-tuned to (-0.03, 1.1, 0, 0.98) by looking, then confirmed identical by the formulas.)
* Eyes white: eyes texture `v = max(r,g,b)` -> `(v,v,v,a)`; helm texture magenta rule `r>70 && b>70 && g<0.55·min(r,b)` ->
  grey `min(255, 1.7·max(r,b))`. Armor texture 512 -> 256.
* Size: the model is ~267 KB (it was 167 KB for Sonic); the whole plugin 305 KB -> 407 KB. Thymer accepted it; no limit was hit
  (a limit, if any, is unknown).

### Plugin behaviour (in `achievements.src.js`)
* Pointer: head only: `headYaw = lx·0.75`, `headPitch = 0.02 + ly·0.4 + speed·0.07·sin(now/95)` (the nod while typing); body
  `yaw = lx·0.1 + 0.04·sin(now/1100)`, `pitch = 0.05`. The pointer influence is multiplied by `1 - 0.85·salute`.
* Salute: `celebrate(now)` is called by the notification (and the old unlock path); `SALUTE_MS = 1700`; blend 0 -> 1 over the first
  12 % (ease-out cubic), held to 72 %, back to 0 over the last 28 %. The vertex shader does the morph.
* Card CSS (`plugin.css`): `.ach-por` has no background and no frame (the old inset ring and bottom shadow, `::after`, and the
  `::before` stripes are gone); `.ach-por canvas` carries the user's mask `linear-gradient(to top, transparent 0%, black 20%, black 100%)`
  (both `-webkit-mask-image` and `mask-image`), on the canvas only so the crown counter `.ach-rg` (bottom right of the portrait) stays
  readable. `.ach-por` is 124 x 118 px in the card and 84 x 84 in the list's header. **Hover zoom**: the portrait used to scale the whole canvas 1.04× in CSS (`.ach-por:hover canvas`, 0.2 s), which also zoomed the god rays; the user wanted the knight only, so the CSS rule is gone and `Mascot` does it: `hover` (set by `pointerenter`/`pointerleave` on `.ach-por`, for the card's and the list header's mascot) eases `zoom` toward 1.04 (time constant 90 ms) and the model scale is `fit·zoom`; the rays are drawn separately and do not scale.
* **God rays**: a second tiny program in the same WebGL context (`RAY_VERT`/`RAY_FRAG`), a full-canvas quad drawn before the model with
  premultiplied blending (`ONE, ONE_MINUS_SRC_ALPHA`) and no depth. A light just above the card's top left corner, (0.04, 1.25) in card UV
  (aspect-corrected); the angle `a` round it (0 = the middle of a cone that points down and to the right, offset 0.5 rad) feeds two
  waves, `w1 = sin(5a + 0.16t + 0.8)` and `w2 = sin(8a - 0.11t + 2.1)`, thresholded with `smoothstep(0.35,1,w1) + 0.6·smoothstep(0.55,1,w2)`
  so that there are a few **wide shafts with dark between them** that **drift slowly** (the phase moves 0.16 / 0.11 rad per second, in
  opposite directions); a cone window and `exp(-1.1·r)` fade them; tint (0.8,0.9,1.0), strength `0.2`; the light also shivers faintly,
  `0.93 + 0.07·sin(1.1t + 13a)·sin(0.7t + 1)`. History of the user's wishes, in order: thin lines that drifted and leaned with the
  pointer (too strong, and "the rays move"); then fixed and lighter, from the top left; then a faint shiver kept (the user's "titreme"
  that had to go was the *head* on hover, not the light); then "sparser and wider lines, and let them move, gently". They do not lean
  with the pointer and do not react to a salute or sleep. With `prefers-reduced-motion` the time is frozen. If the program fails to link
  the knight is drawn without it.
* **Pet behaviour**: only the doze. Asleep after `SLEEP_AFTER_MS` = 3 min without a key or `mousemove` (`lastActive`): `Mascot.sleepTo = 1`
  (the head drops 0.45 rad, a slower bob, no looking); any activity wakes it. **Tried and removed at the user's request**: a speech
  bubble ("Hello!" at load, random lines on hover, "Zzz...", "Oh, hi!"), and a head wiggle plus small hop when the pointer entered the
  portrait (a roll of `0.2·sin(30f)·e^(-3.5f)` over 800 ms: "hover olunca adamin kafasi titriyor"). Not done: blinking (the eyes mesh
  also draws the dark visor, so squashing it would squash the face).

## 5. Thymer

* App: `/Applications/Thymer.app` 1.0.20 (Electron). Data lives per workspace on the web (`almasada.thymer.com`); local app state in
  `~/Library/Application Support/Thymer`.
* **MCP server of the desktop app**: `http://127.0.0.1:13100/mcp` (also answers on `/`), *streamable HTTP*. `POST` JSON-RPC with headers
  `Content-Type: application/json` and `Accept: application/json, text/event-stream`; `initialize` returns an `MCP-Session-Id`
  response header that must be sent on every later request; then `tools/call` with `{name, arguments}`. Replies are plain JSON.
  `GET /sse` is a 404 (it is not the old SSE transport). It is not registered in Claude Code's own MCP list; `push_thymer.py`
  (and `scratch mcpcall.py` earlier) speak the protocol directly.
* **Access gate**: a workspace's `mcp_access` is `off` / `readonly` / `readwrite` (shown by `list_workspaces`). With `off` every call
  answers "MCP access is disabled for this workspace. The workspace owner can enable it in MCP Settings (available via the command
  palette)." The user switched it to readwrite by hand; do not try to get around it.
* Ids here: org `almasada.thymer.com` (orgId `T4QNQZDP9M`), workspace `almasada` = `WCZK89KZ135KKXVMZF8DFRTZHE`,
  global plugins: Home `16FGBW44H1X2TKY3BZ9FFD8V2D`, Cursor FX `1QWQRP4BJVVAVQN4E1W9M64YQY`, **Achievements
  `10HCH8FBA8M3NRDC5TPRKBFQC3`**, Digital Garden `1JYWWFV3BHQ3XZ2NHV48659EDM`, Caret FX `1QXQ5XXT508GYNA9WFTPPBB5V7`; collection
  plugins Reading Log, Journal, Notes, Examples.
* Tools used: `list_connected_organizations`, `list_workspaces`, `list_plugins`, `get_plugin_code` (returns `code`, `css`, `config`),
  `preview_plugin` (hot reload, not saved; `code`/`css`/`config` optional), `update_plugin_code`, `update_plugin_css`.
  Others exist (records, collections, themes, files...): ~70 tools, listed by `tools/list`. `update_plugin_code` echoes `previous_code`
  (after a `preview_plugin` that is the previewed code, not the saved one: take backups with `get_plugin_code` before previewing).
* The live plugin is the **built** file (`achievements.js`, the model baked in); in the repo the source is `achievements.src.js`
  with placeholders `__KNIGHT__` and `__FX__`, built by `node build.mjs` (non-ASCII is written as `\u{...}`). Always change the
  source and rebuild; `push_thymer.py` replaces the whole plugin (code + CSS), after saving the live one to `.cache/backups/`.
* The plugin's config (`plugin.json`): `{"ver":1,"name":"Achievements","icon":"ti-trophy",...}`; not touched.

## 6. The repo
`/Users/imhalid/Documents/thymer-plugins` (origin `git@github.com:imhalid/thymer-plugins.git`, private; plugins: achievements,
caret-fx, cursor-fx, digital-garden, home). `achievements.js` (the built file) *is* tracked although `build.mjs`'s comment says never
to commit it. Copyright: see `plugins/achievements/model/LICENSE.md` (Spiral Knights (c) Grey Havens). The Sonic model (`sonic.json`,
`model/sonic-adventure-sonic/`) was deleted from the tree after the knight replaced it; it is in the history. Raw downloads stay in
`.cache/` (git-ignored).

## 7. Environment gotchas met along the way
* `python3 -I` ignores the user site-packages, where Pillow lives: run PIL scripts without `-I` (from a neutral directory: the
  cwd should not contain downloaded files). System Python has no numpy; Blender's has numpy and mathutils.
* macOS `sed -i` needs an argument (`sed -i '' ...`).
* Blender 5.2: `Action.fcurves` is gone (slotted actions: `action.layers[0].strips[0].channelbags[...].fcurves`);
  `Mesh.calc_normals_split()` is gone (use `me.corner_normals`, 4.1+); `bpy.ops.import_scene.gltf` works headless; the importer
  adds an `Icosphere` bone-shape mesh, a skeleton and anchor empties that must be deleted; imported names get `.001` suffixes
  when they clash. The glTF exporter warns that an NLA track with several strips is not exported in ACTIONS mode (each action
  is still exported).
* Blender MCP tool parameter names: `get_screenshot_of_area_as_image(area_ui_type)`, `jump_to_view3d_object_by_name(name)`,
  `render_viewport_to_path(output_path)`. The viewport had to be set to Material Preview in every window's screen to show textures.
* Headless run: `Blender -b --factory-startup --python blender_export.py -- <cache> <out>` takes a few seconds.
* The shell prints `/Users/imhalid/.zshenv: ... .cargo/env: no such file` on every call: harmless.

## 8. What was verified, and what was not
Verified: fetch of all pieces; headless Blender (41 bones, rig vs animation 1e-6, the same vertex/triangle counts as the
interactive run); the baked model drawn by the plugin's real `Mascot` code in a test page (head turn, salute, white eyes,
background); code and CSS pushed to Thymer and read back identical; `node --check` of the built plugin; zero "sonic" in it.
Not verified: the live Thymer window by Claude (the user confirmed the first version by sight); a single-command
`--push` run and a second costume; any size limit in Thymer; the 10-pose Blender file below.

## 9. Not in the pipeline (done by hand earlier, in a Blender session via MCP)
A full `.blend`/`.glb` of the Proto Blade costume with **10 poses** (Idle, Hand_On_Hip, Salute, Sitting, Sword_Ready, Gun_Ready,
Bomb_Ready, Sword_Charge, Gun_Charge, Bomb_Charge; one action each, laid out in a single NLA track with a marker per pose) was made
interactively and verified against the game's skeletons; it lived in the session's scratch folder, not in this repo. The pipeline
bakes only Idle and Salute; to get the others, run `blender_export.py`'s `pose_empties(name)` + `basis_of` + `key_pose` for each
`knight-<pose>.gltf` (all ten files are downloadable as in section 1.2). The glTF exporter drops the Track-To effects and the NLA layout.
