# Achievement pictures

One 720 x 480 banner per achievement (62), a hand-drawn pencil-and-ink sketch with gouache colours, the knight mascot in most of them.

| What | Where |
| --- | --- |
| The prompts (copy-and-paste, one per achievement, with the whole style, the hero's look, the scene and the tier colour) | [`prompts.md`](prompts.md) |
| Character reference sheets drawn from the real 3D costumes: the hero from every side, his sword up close, a gremlin and an owl | [`reference/`](reference) |
| The pictures, `NN-id-slug.png` in the order of `prompts.md`, full size, and the same cut to 3:2 and scaled to 720 x 480 in `720x480/` (git-ignored: 100+ MB) | `generated/` |
| The script that makes them with Gemini through the `agy` CLI | [`generate_with_agy.py`](generate_with_agy.py) |
| How the reference sheets are made (Blender renders of the costume rig) | [`source/`](source) |

## Making the pictures

```sh
python3 generate_with_agy.py                 # every picture that is still missing, in order
python3 generate_with_agy.py --only w1 back  # just these achievement ids
python3 generate_with_agy.py --workers 3     # how many at a time (default 2)
```

For each picture it starts a separate `agy --dangerously-skip-permissions -p ...` session, tells the agent to look at the files in `reference/`
and give them to its image generator (so the hero and his **sword**, a broad curved tan-copper blade with a green guard, come out as in the
game model), and to save `generated/NN-id-slug.png`. Run it again to fill in what failed; `generated/generation-log.json` says what happened
to each. `--dangerously-skip-permissions` lets the agent act without asking, so read the prompt in the script first.

Changing a prompt: edit it in `prompts.md` (keep the `### Name  ·  \`id\`  ·  Tier` heading and the one code block under it), delete the
picture and run the script for that id.

## The hero

A big round tan-beige helmet with a swept-back crest, dark dots on top and small pale spikes along the brow; a black visor with two tall white
pill eyes and a small diamond; blue-grey ear pieces; a light-blue scarf; a white sash; blue-grey armour with cream-and-gold shoulder plates;
a blue heater shield with a silver rim; and the Proto Blade. The look comes from the Kozmas costume "Proto Blade" with the eye glow turned
white, like the mascot in the plugin (see `tools/costume2thymer`). The images are Spiral Knights assets (c) Grey Havens; see
`../model/LICENSE.md`.

## Putting them in the plugin (not done yet)

62 pictures cost 1.5-3 MB even as WebP and the plugin is 0.4 MB now (Thymer's limit, if any, is unknown), and a 720 x 480 banner does not fit
the small emoji box of the cards (`.ach-ic`): the card and the unlock notification need a banner area. Options: load only the opened
achievement's picture, or host the files elsewhere.
