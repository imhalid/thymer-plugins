# Achievement pictures

One 720 x 480 banner per achievement (68), a hand-drawn pencil-and-ink sketch with gouache colours, the knight mascot in most of them.

| What | Where |
| --- | --- |
| The prompts (copy-and-paste, one per achievement, with the whole style, the hero's look, the scene and the tier colour); written by [`source/make_prompts.py`](source/make_prompts.py) from the plugin's list, so edit the scenes there | [`prompts.md`](prompts.md) |
| Real in-game images: the hero from the front, the side and the back, his sword and shield up close, the gremlins, a Stranger, Snipes, a Scuttlebot, a Jelly Cube, a Bloogato and the energy symbol (the first sheets made in Blender, with a wrong blue shield and round green gremlins, are in `reference/old-blender/`) | [`reference/`](reference) |
| The pictures, `NN-id-slug.png` in the order of `prompts.md`, full size, and the same cut to 3:2 and scaled to 720 x 480 in `720x480/` (git-ignored: 100+ MB) | `generated/` |
| The script that makes them with Gemini through the `agy` CLI | [`generate_with_agy.py`](generate_with_agy.py) |
| How the reference sheets are made (Blender renders of the costume rig) | [`source/`](source) |

## Making the pictures

```sh
python3 generate_with_agy.py                 # every picture that is still missing, in order
python3 generate_with_agy.py --only w1 back  # just these achievement ids
python3 generate_with_agy.py --workers 3     # how many at a time (default 2)
python3 source/make_prompts.py               # after changing a scene (or the plugin's list): rewrites prompts.md
```

For each picture it starts a separate `agy --dangerously-skip-permissions -p ...` session, tells the agent to look at the files in `reference/`
and give them to its image generator (so the hero and his **sword**, a broad curved tan-copper blade with a green guard, come out as in the
game model), and to save `generated/NN-id-slug.png`. Run it again to fill in what failed; `generated/generation-log.json` says what happened
to each. `--dangerously-skip-permissions` lets the agent act without asking, so read the prompt in the script first.

Changing a prompt: edit it in `prompts.md` (keep the `### Name  ·  \`id\`  ·  Tier` heading and the one code block under it), delete the
picture and run the script for that id.

## The hero

A big round tan-beige helmet with a swept-back crest, dark dots on top and small pale spikes along the brow; a black visor with two tall white
pill eyes; round blue-grey ear pieces; a periwinkle scarf; a white tabard; blue-grey armour with cream-and-gold spiral shoulder plates;
a heater shield with a thick green rim and a white ram's-head emblem on navy and lavender; and the Proto Blade. The look comes from the Kozmas costume "Proto Blade" with the eye glow turned
white, like the mascot in the plugin (see `tools/costume2thymer`). The images are Spiral Knights assets (c) Grey Havens; see
`../model/LICENSE.md`.

## Putting them in the plugin

The plugin shows no emoji any more: an achievement is its picture, in the list (a gallery of pictures, blurred behind a lock while locked; a click on an unlocked one shows it big with its details under it, arrow keys go through them) and in the announcement (a small note at the top right shows the picture grey and half hidden; on a click it opens as a card over the screen, where it develops under a shader). There are five opening styles (Iris, Shards, Blocks, Ink, Burn); each
achievement always opens in its own, picked from its id, and the panel's test row has a button for each style and a Tour.
`art/demo.webp` stands in for every achievement that has no picture yet (the plugin falls back to a coloured plate without it); delete it once all 68 exist.

```sh
python3 generate_with_agy.py          # the full-size pictures -> generated/
python3 source/pack_images.py         # -> webp/<id>.webp, 384 x 256, ~16 KB each
node ../build.mjs                     # bakes webp/ into ../achievements.js (68 pictures: about 1.5 MB more)
```

The pictures are baked into the plugin file, so it needs no network, but the file grows to about 2 MB; Thymer's limit, if any, is unknown. If it is
too big: `pack_images.py --quality 60`, or host the WebP files elsewhere and load them by URL in `pictureOf()` (achievements.src.js).
