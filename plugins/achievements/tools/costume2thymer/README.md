# costume2thymer

Turns a [Kozmas](https://www.kozmas.gg) costume into the Achievements plugin's mascot (`../../knight.json`), and optionally builds and
pushes the plugin to Thymer.

```sh
python3 costume2thymer.py https://www.kozmas.gg/costumes/proto-blade           # fetch -> blender -> model  (-> ../../knight.json)
python3 costume2thymer.py https://www.kozmas.gg/costumes/proto-blade --push    # ... then node build.mjs, then into Thymer
python3 costume2thymer.py <url> --only model --eyes original                   # re-run one stage
```

Needs: Python 3 with Pillow (`pip install pillow`), Blender 4.1+ (found at `/Applications/Blender.app`, on `PATH`, or `--blender`),
Node (for `build.mjs`), and, for `--push`, Thymer open with the workspace's MCP access set to **readwrite** (command palette ->
MCP Settings).

| Stage | Script | What it does |
| --- | --- | --- |
| fetch | `costume2thymer.py` | reads the costume page (its data lists the pieces, e.g. `bare-costume-armor-heavenly_guardian_armor.gltf`), downloads them and the knight skeleton's idle and salute poses into `.cache/<costume>/` |
| blender | `blender_export.py` | headless: rebuilds the 41-bone skeleton from `knight-idle.gltf`, skins the armor to it by bone name, bone-parents the helm, eyes, weapon and shield where their placement matrix says, bakes Idle and Salute, writes both poses per vertex (`parts.json`) and a `costume.blend` to look at |
| model | `build_model.py` | splits head and body (by head-bone weights, or a piece placed on a head bone), crops below the shoulders, packs the poses, quantizes the textures, frames the head from its own bounds, whitens the eye glow (`--eyes white`, the default) -> `knight.json` |
| build | `../../build.mjs` | embeds `knight.json` and the effect textures -> `achievements.js` |
| push | `push_thymer.py` | backs up the live plugin to `.cache/backups/`, writes `achievements.js` and `plugin.css`, reads them back to check; `--restore <backup>` undoes it, `--preview` hot-reloads without saving |

## Why a rig is rebuilt

The costume files carry no usable skeleton: the game skins the armor onto one shared knight skeleton *by bone name*, and the exported
inverse-bind matrices are identity. So `blender_export.py` builds the skeleton itself, with each bone's rest transform taken from
the node transforms in `knight-idle.gltf`, and bakes the poses from the game's own skeleton animations.

## What may need a hand for another costume

* Pieces other than armor, helm, eyes, weapon and shield (hair, auras, tails) are exported like the others if they are plain meshes;
  particle effects (the sword's glow) are not, and neither are materials' additive/masked modes: the plugin draws every part
  alpha-tested and lit.
* Costumes whose head is skinned into the armor mesh rather than a separate helm are split by the head bone's weights, which may
  leave a visible seam at the neck.
* The window (centre and size of the head) is computed from the head's bounds; tweak `HEAD_SPAN` and `HEAD_LIFT` in `build_model.py`.
* `push_thymer.py` replaces the whole plugin, so edit `achievements.src.js`, not the live copy.

The costume's files are Spiral Knights game assets (c) Grey Havens; see `../../model/LICENSE.md`.

## More

`NOTES.md` has everything found along the way: where the files come from (URLs, formats), what the game files are like (no shaders, identity bind matrices, placement = bone transform, which bones the salute moves), the rig maths, the model format, how Thymer's local MCP server works, ids, gotchas, and what was and was not verified.
