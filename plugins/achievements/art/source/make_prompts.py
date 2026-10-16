#!/usr/bin/env python3
"""Writes ../prompts.md: one image prompt per achievement.

    python3 make_prompts.py

The list (id, name, text, tier) is read from ../../achievements.src.js, so prompts.md never drifts from the plugin; the scenes live here
(SCENES, one entry per id; the script stops if one is missing or left over). The creatures and objects a scene mentions (a gremlin, a Stranger,
a crown, energy, a token...) are found in its text and their description is added to the prompt, so every picture draws them the same way.
generate_with_agy.py picks the matching reference images from the same words.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "achievements.src.js")
OUT = os.path.join(HERE, "..", "prompts.md")

TIER_COLOR = {"Easy": ("soft mint-green", "#5ee6a0"), "Medium": ("bright cyan", "#4fd8ff"), "Hard": ("soft violet", "#b98cff"), "Legendary": ("golden-orange", "#ffb347")}
TIER_MOOD = {
    "Easy": "a calm, intimate composition with one clear focal subject",
    "Medium": "a lively composition with a clear focal subject and good depth",
    "Hard": "a dramatic composition with strong depth, strong light and a lot of atmosphere",
    "Legendary": "an epic, cinematic wide composition with a huge sense of scale and dramatic, almost heavenly light",
}

STYLE = (
    "Hand-drawn fantasy video-game achievement artwork, landscape 3:2 banner (720x480 px). Style: the chunky, toy-like cartoon look of a colourful 3D "
    "action-RPG about little knights (big round helmets, small round bodies, thick simple shapes), redrawn as a loose pencil-and-ink sketch: visible "
    "graphite sketch lines with slightly wobbly double strokes, thick dark-brown outlines, light cross-hatching in the shadows, then painted with soft "
    "gouache and watercolour fills with uneven brush edges, a subtle paper grain and a soft vignette. Storybook composition with real depth (a detailed "
    "foreground, a midground, a hazy painted background) and warm cinematic lighting."
)
PANELS = (
    "A single comic page in a 2 x 2 grid of four panels (landscape 3:2, 720x480 px), thick dark-brown ink panel borders with thin cream-white gutters, a "
    "four-beat mini story told without speech bubbles or any text, big expressive eyes, speed lines and impact stars for action, light halftone dots in the "
    "backgrounds, the same hero in every panel."
)
HERO = (
    "The hero is always the same small knight, drawn exactly like the character in the reference images: a big rounded tan-beige helmet with a swept-back "
    "crest ridge, a few dark round dots on top and small pale tooth-like spikes along the brow; a black visor with two tall PURE WHITE pill-shaped glowing "
    "eyes (never green, cyan, pink or tinted by the accent colour); round blue-grey ear pieces; a periwinkle-blue scarf at the neck; a white-cream tabard "
    "hanging at the front with a grey stripe; brown leather belts, pouches and straps; blue-grey armour with cream-and-gold shoulder plates and gauntlets "
    "carved with glowing golden spirals; tan knee plates and brown boots. On his left arm a rounded heater shield with a thick bright-green rim: its face is "
    "split into a dark-purple half (a glowing magenta dot above a riveted silver-grey metal plate) and a lavender-and-navy half with a cream-white ram's-head "
    "emblem (swept crest, spiral horn). His sword (the Proto Blade) is a broad, gently curved pale peach-tan cleaver-like blade with a squared-off tip and two "
    "small rivets near the tip, a dark grey guard plate with a glowing mint-green slot, a bright lime-green looped hand guard and a dark red-brown wrapped "
    "grip: always draw this exact sword, never a plain straight sword."
)
ENDING = (
    "The painting is full-bleed: it fills the whole canvas edge to edge with no white paper margin, no deckle or torn edge, no border and no frame. No text, "
    "no letters, no numbers, no logos, no watermark."
)

# What a word in a scene brings with it: (regex on the scene, description). Order = order in the prompt.
CAST = [
    ("gremlin", r"gremlin",
     "Gremlins are small, scrappy, hunched, fox-like mechanics (never round or green): tall pointed ears, a long snarling snout with a few sharp teeth, a dark "
     "bandit-mask patch around the eyes, short red-pink or grey fur, scraps of dark armour with a round orange emblem on one shoulder, a tool belt, and an "
     "oversized wrench or gear-topped club as a weapon."),
    ("stranger", r"stranger",
     "A Stranger (a friendly race of tall merchants of Haven) is drawn like the reference image: a tall hooded figure with a big pale-cream pointed hat-mask "
     "carrying a few small glowing yellow-green lights, a dark face with two glowing green dots for eyes, a purple wrapped scarf, a tattered ochre-gold "
     "poncho patterned with honeycomb hexagons, a chain with a small charm at the chest and a big dark-blue backpack."),
    ("snipe", r"snipe",
     "Snipes are small, round, fluffy chick-like birds with black bead eyes, a tiny golden heart-shaped beak and a little tuft on the head, in peach, white, "
     "lavender or pale blue."),
    ("scuttlebot", r"scuttlebot",
     "A Scuttlebot is a small boxy robot: a grey-white metal body with one glowing magenta dot, six little claw legs and a brown strap."),
    ("jelly cube", r"jelly cube",
     "A Jelly Cube is a translucent hot-pink cube of jelly with small dark spikes and bits suspended inside it."),
    ("bloogato", r"bloogato",
     "A Bloogato is a small floating pale lavender-white ghost with a pointed hood and two ear tufts, a carved dark-purple jack-o'-lantern face and a faint blue wisp."),
    ("owl", r"\bowl\b",
     "The owl is a round brown owl with big pale-yellow eyes and a cream belly."),
    ("vanaduke", r"vanaduke",
     "Lord Vanaduke, the boss, is a towering dark-iron armoured lord with a horned helmet, ember-red light glowing in the seams of his armour and a long "
     "tattered cloak."),
    ("crown", r"crown",
     "In this world a crown is a coin, the currency: a thick round gold coin with a small crown emblem stamped on its face and a milled edge. Draw crowns as "
     "coins, never as royal headwear."),
    ("energy", r"energy",
     "Energy, the other currency, is drawn like the reference image: a glowing cyan-blue round symbol, a thick bright ring with one short horizontal bar across "
     "its middle, giving off soft cyan light; energy also appears as small chunky glowing cyan blocks and bars drifting in the air. It is only a symbol, with no "
     "letters or numbers."),
    ("boss token", r"boss token",
     "Boss tokens are small glowing collectibles that spin and flash, one for each boss: a round red-gold wax-seal medallion, a curved white fang, a green "
     "jelly gem and a little green circuit board."),
    ("spirit spark", r"spirit spark",
     "Spirit sparks are small glowing wisps of spirit energy that float up from broken treasure boxes: orange for the forge, violet for the grim and green for "
     "the primal kind."),
    ("krogmo", r"krogmo",
     "A Krogmo Coin is a round bronze-gold arcade coin stamped with a small crowned face, a little different from a crown coin."),
]

# One entry per achievement id: a scene (one sentence block) or four panels (a list).
SCENES = {
    "w1": "An open meadow at golden hour, just outside Haven. In the foreground the hero stands on the left, seen from a low angle, as a tall Stranger merchant on the right, a round peach Snipe riding on his shoulder, pays him his very first crown: one large gold crown coin flipping through the air between them, catching the low sun and glowing. Rolling hills, a far windmill, wildflowers, long soft shadows, pollen drifting in the light.",
    "w25": [
        "The hero stretches his arms in a sunny village yard at dawn beside a wooden writing desk, a quill and an empty scroll; morning mist, a cottage.",
        "He shakes out his wrists and cracks his knuckles while a round white Snipe watches him from the desk.",
        "Close-up of his determined white eyes and the quill rising in his hand.",
        "He sits at the desk and writes the first line, tiny sparks of ink and the happy Snipe hopping beside him.",
    ],
    "w100": "The hero sits cross-legged on a grassy hill counting gold crown coins from a wooden bowl into neat little stacks; a curious gremlin peeks out from behind a rock and reaches for one coin. Late-afternoon light, a winding road far below, a few clouds.",
    "w500": "Inside an old mine tunnel a mine cart has tipped over and a river of gold crown coins pours down the rails; the hero leaps aside laughing, a lantern swinging above him. Glittering dust in the lamplight, chunky glowing cyan energy blocks embedded in the rock walls, wooden beams and cobwebs.",
    "w1000": "Low-angle view: the hero stands on a stone podium in a sunny town square holding a giant glowing gold crown coin high above his head like a trophy, a glowing cyan energy symbol floating beside it, while a crowd of cheering knights and tall Strangers waves banners and throws confetti. Timber houses, bunting, blue sky.",
    "w5000": "The hero stands knee-deep in a flood of gold crown coins inside a vast cavern vault, eyes wide, while more coins rain down through holes in the ceiling in shafts of violet light, mixed with drifting cyan energy blocks; gremlins tunnel through the heap with tiny shovels. Gleaming coins everywhere, deep shadows around.",
    "w10000": "A grand treasury hall. A dignified Stranger banker carries a heavy open chest brimming with gold crown coins along a long red carpet toward the hero, who waits at the top of the steps; tall glass tanks along the walls glow with cyan energy. Stained-glass windows throw violet light across the floor, banners hang from stone pillars, stacks of coin sacks line the walls.",
    "w25000": "A colossal round vault door stands open on a mountain of gold crown coins with one gigantic coin on the very top, and above it a giant glowing cyan energy symbol hangs like a second sun; the hero, tiny, stands in the doorway looking up. Golden god rays pour through the dust, glittering light, the scale is enormous.",
    "w50000": "A cavern as big as a cathedral filled with treasure chests, gems, heaps of glowing cyan energy blocks and dunes of gold crown coins; the hero stands small on a gold dune while the silhouette of an enormous sleeping clockwork beast, a giant cousin of the little Scuttlebot robot, curls in the background. Warm golden glow, floating dust, long shadows.",
    "w100000": "The hero stands on a spiral staircase of pure light climbing into a night sky, a giant spiral galaxy swirling behind him, one hand raised in a salute, a legendary glowing aura around him; crown coins and cyan energy blocks drift upward around him like stars. Far below, tiny gremlins and Strangers cheer and wave small flags. Low angle, dramatic stars.",
    "d250": [
        "Wide shot of a green meadow: the hero turns his head and a pale exclamation mark appears over him; a small gremlin has appeared in the distance.",
        "The gremlin leaps toward the viewer with its wrench raised and its mouth open, bold speed lines, the hero small and startled in the corner.",
        "Extreme close-up of the hero's visor with two white glinting eyes, focus lines, a flash of light on the glass.",
        "The hero in a full slash, a huge white-and-cyan crescent arc cutting the panel, a yellow impact burst, the gremlin tumbling away with stars.",
    ],
    "d500": "The Energy Depot in the town square of Haven at dusk: a Stranger behind a stone counter hands the hero a handful of glowing cyan energy blocks and a big glowing energy symbol floats above the counter, a lantern-lit crowd and a round lavender Snipe on the counter. The hero holds out his gauntlets, the cyan light playing over his helmet. Cobblestones, hanging lamps, a fountain.",
    "d1000": "The hero stands in a wide stance on a windswept hill, his sword pulled back behind him wrapped in a swirling cyan ring of energy (the ring-with-a-bar symbol), a circular shockwave spreading on the grass, storm clouds and violet lightning above, grass and scarf blown flat. Low side-on camera.",
    "d2500": "Close-up of the sword blade crackling with lightning and gathered energy, held up beside the hero's face so that his white eyes and the visor are lit by it; a glowing cyan energy ring surrounds the blade like a full charge gauge, cyan energy blocks swirling around it. Dark violet background, flying sparks, dramatic contrast.",
    "d5000": "The hero in mid-air, mid-slash, releasing a gigantic energy blade that splits the clouds and cuts a mountain in half behind him; a golden-orange shockwave rolls outward with cyan energy blocks flying like shrapnel, birds scatter, the sun blazes through the gap. Huge scale, dynamic diagonal composition.",
    "m500": "Deep in the Clockworks the hero steps through a tall stone energy gate whose arch glows with a big cyan energy symbol, cyan light rippling across the floor around his boots; a few Scuttlebots wait frozen behind the closed bars on the other side. Cracked tiles, brass pipes, a lamp swinging.",
    "m1000": "Chase view from behind and to the side: the hero runs along a narrow conveyor-belt bridge between giant interlocking gears, steam jets bursting, cogs spinning in every direction, a pack of Scuttlebots scuttling after him, motion streaks behind him. Violet haze and warm lamps deep in a clockwork tower.",
    "m3000": "Looking straight down a bottomless shaft of gears, pipes and chains: the hero dives headfirst with his scarf streaming upward, cyan energy blocks rising past him like bubbles, a golden light glowing far below, sparks and steam rushing past. Vertigo composition, strong perspective lines.",
    "p25": "Close-up of the hero's hands blurring over a parchment with a quill, tiny ink splashes and sparks, a small desk lamp casting a warm circle, a cup and an inkwell, a round white Snipe watching wide-eyed from beside the lamp. Cosy night desk, soft focus background.",
    "p40": [
        "The hero tightens his scarf at the start of a sun-dappled forest path.",
        "He sprints, dust kicking up, three gremlins tumbling and chasing behind him with their wrenches.",
        "Side view: his legs a blur, trees streaking by, the gremlins getting smaller.",
        "He skids to a stop in a cloud of dust at a finish line banner, the gremlins piled up behind him.",
    ],
    "p60": "A stormy field at dusk: the hero frozen mid-leap dodging three lightning bolts striking the ground, violet afterimages trailing behind him, raindrops hanging in the air, scorched grass. Dramatic low camera.",
    "p80": "The hero as a streak of light racing through a tunnel of speed lines and stars, only his white eyes and the trail of gold-and-violet light clear, cyan energy blocks streaming past, the world melting into lines around him. Strong central perspective.",
    "ln50": "A long straight corridor of gears and glowing lamps stretching to a vanishing point; the hero stands small in the centre reading a scroll that unrolls across the stone floor. Perfect one-point perspective, warm lamps, brass pipes.",
    "ln200": "An impossibly long corridor with doors on every side that seems to loop back on itself; the hero walks tiny along a scroll that unrolls for miles across the floor. Surreal, M. C. Escher-like perspective, violet light, floating papers.",
    "l10": "On a sunny village road the hero bashes a small gremlin with his shield, a bright impact star at the hit and the gremlin flying away comically with its ears flapping and its wrench spinning. Cottages, a fence, flower pots, a dust cloud.",
    "l1000": "A workshop between two huge grinding gears; the hero feeds sheets of scroll through them while sparks fly and oil lamps swing, a broken Scuttlebot on the floor, purple smoke curling in the rafters. Brass, iron, warm orange light against violet shadows.",
    "l5000": "A vast clockwork factory hall with towering machines, conveyor belts carrying glowing scrolls and rows of Scuttlebots being assembled, glowing cyan energy cables in the pipes; the hero stands on a high catwalk looking out over it. Golden furnace light, steam, epic scale.",
    "s3": "A quiet cave where the hero kneels before a single glowing cyan energy crystal block floating above a stone pedestal, his lantern at his side, the light reflecting in a small pool. A feeling of wonder, soft mist.",
    "s7": "Seven floating crystals, each a different colour of the rainbow (one of them the cyan of energy), circle the hero inside a ruined stone circle at dusk, a violet energy ring on the ground beneath them. Mystical, glowing, ancient mossy stones.",
    "s14": "A huge cluster of cyan energy crystals grows from a cavern wall catching all the light; the hero reaches out to touch the largest one while small gremlins watch warily from the rocks. Violet glow, reflections, sparkling dust.",
    "s30": "The hero walks steadily through a desert of shimmering heat and rivers of lava, golden-orange embers rising around him, a huge sun low on the horizon. Determined posture, wavy heat haze, cracked ground.",
    "s60": "Deep inside a vast crystal cavern the hero crosses a rope bridge over a glowing abyss with a lantern in his hand, golden-orange light rising from below, cyan energy blocks floating in the dark. Giant crystals, tiny bridge, tremendous depth.",
    "s100": "A grand hall lined with statues of knights and long banners; the hero walks down the aisle toward the last empty pedestal, which has his silhouette carved into it. Beams of golden dust-filled light fall from high windows.",
    "s365": "A giant floating crystal radiating gold and cyan, orbited by a ring of three hundred and sixty-five tiny lights; the hero stands below on a quiet hill, saluting. Starry night, soft mist, epic scale.",
    "t1": [
        "The hero walks across a meadow and a tiny gremlin jumps out of the grass.",
        "The gremlin swings a big wrench; the hero blocks it with his shield.",
        "A quick slash and the gremlin sits dazed with stars circling its head.",
        "The hero gives a small proud thumbs-up beside it while the gremlin shrugs.",
    ],
    "t5": "In a village square five gremlins stand in a line facing the hero, who smirks with his sword ready. A comic stand-off, villagers peeking from windows, a fountain, sunny day.",
    "t10": "At the end of a cleared dungeon room a treasure door swings open, pouring cyan light, and smashed treasure boxes release glowing spirit sparks that float upward; the hero rests on his sword among defeated, dizzy gremlins. Cracked stone floor, torches, relief and satisfaction.",
    "t25": "A stone counter at the Clockworks trading post: the hero lays a handful of glowing boss tokens on it (a red-gold wax seal, a white fang, a green gem and a little circuit board) while a tall Stranger token trader reaches out for them, a round pale-blue Snipe on his hat. Lantern light, shelves of rewards, tokens sparkling.",
    "t50": "The hero reaches the top of a finished dungeon staircase and plants a flag, a lowered clockwork landscape stretching away behind him under a violet sky, a single glowing boss token spinning and flashing in the air beside the flag. Wind in the flag, a feeling of progress.",
    "t100": "The hero plants a flag on top of a smashed giant clockwork machine, gears scattered everywhere, a few dead Scuttlebots on the ground and cyan energy leaking from broken pipes. Evening violet light, a proud low-angle view.",
    "t250": "The hero stands on a heap of defeated gremlins, silhouetted against a blazing golden sunset, his scarf blowing in the wind and his sword planted beside him, a few crown coins scattered among them. Epic low angle, dramatic sky.",
    "t1000": "Lord Vanaduke lies defeated with a cracked horned helmet and smoke rising from his armour; the tiny hero stands on his chest with his sword raised toward the golden light of dawn, four glowing red-gold boss tokens floating up from the fallen boss and crown coins spilling around them. Smoke, rubble, shafts of sunlight.",
    "td5": "The hero in a dynamic combo, five hit sparks along one sweeping arc, five hot-pink Jelly Cubes bouncing off in different directions. Cyan accent trails, speed lines, a comic-book energy.",
    "td10": "The hero runs through a Clockworks room smashing treasure boxes with his sword, and glowing spirit sparks in orange, violet and green swirl in a ribbon around him and into his hands; broken crate planks fly. Torches, a cyan light from a door, quick and joyful.",
    "td20": "The hero dashes through an arena past several huge boss silhouettes looming in violet smoke, glowing boss tokens spinning in the air behind him, tiny but fearless. Sand, broken weapons, dust clouds, dramatic backlight.",
    "night": "A moonlit plain: the hero sits by a campfire writing on a scroll with a quill, his tent behind him, while an owl watches from a dead tree under a huge moon and a small Bloogato ghost drifts shyly at the edge of the firelight. The Milky Way across the sky, fireflies in the grass, warm firelight on his armour, cool blue moonlight on the rest.",
    "night1k": "At a desk lit by a single lamp in a dark clock tower the hero writes, a giant clock face glowing behind him with the moon showing through the gears; an owl sleeps on a beam and a Scuttlebot is curled up asleep under the desk. Violet shadows, warm lamplight.",
    "early": "The hero sits at a window at sunrise with a scroll and a steaming mug, a peach Snipe and a white Snipe singing on the sill. Dew on the glass, warm light, a calm village outside.",
    "early1k": "The hero stands on a castle wall at sunrise above a hill town, saluting, a row of round Snipes perched along the wall beside him, with mist in the valleys and banners waving. A violet-gold sky, rooftops catching the first light.",
    "midnight": "A moonlit courtyard in front of a huge clock tower whose hands strike twelve; the hero in silhouette holds a lantern while Bloogato ghosts drift over the roofs, the cyan-white moon glowing above. Long shadows, quiet and magical.",
    "h12": "The hero sits on a rooftop watching a sunset sky in which twelve small suns are arranged like the numbers of a clock face. Warm gradients, chimneys, a cat beside him.",
    "h24": "A great circle split into day and night: the left half a sunny sky, the right half a starry night, with a giant 24-hour clock face as the sky; the hero stands on the line between them. Golden light, dreamy and symmetrical.",
    "wkend": "The hero strolls through a sunny market town on a relaxed weekend patrol, shield on his back, eating a fruit while villagers and Strangers wave from their stalls, a round lavender Snipe following him. Bunting, stalls piled with goods.",
    "wk7": "A long hall with seven doors in a row, each open on a different landscape (meadow, desert, snow, cave, sea, city, sky); the hero walks along the hall. Cyan light from the doors, a patterned floor, a sense of a journey.",
    "ny": "New Year's Eve: fireworks and gold crown coins fall like confetti above a clock striking midnight while the hero cheers on a rooftop among paper lanterns. Colourful sparks, a crowd below, a deep blue night.",
    "back": [
        "The hero sleeps on his back under a tree at dusk, a little 'Z' drifting up.",
        "A glowing pink heart falls from a starry night sky toward him, a streak of light behind it, and a small cyan energy symbol dissolves into it.",
        "He sits up with wide eyes, the heart glowing in his chest and sparkles around him.",
        "He stands tall at sunrise, saluting, the heart floating above his helmet.",
    ],
    "a3": "At dawn the hero stands at the beginning of a long winding road with three footprints behind him, a hopeful light on the horizon. A meadow, a signpost, a small satchel on his back.",
    "a10": "The hero stands in front of a cosy small house with ten little lanterns along the roof edge, neighbours waving from their windows. A golden afternoon, a garden, a smoking chimney.",
    "a30": "The hero at the door of a familiar workshop, a calendar page full of marks pinned on the wall, gears turning behind the window, a Stranger shopkeeper nodding at him from inside. A violet dusk and warm lamplight.",
    "a50": "A huge glass reserve tank in a quiet Haven workshop, filled to the brim with glowing cyan energy blocks and a big energy symbol glowing on its glass; the hero rests a hand on the tank with his satchel beside him, a Stranger checking a gauge, and a round white Snipe asleep on top. The energy never fades, calm and steady.",
    "a100": "A veteran hero with scarred armour and many medals stands before a giant spiral tower at sunset, calm and wise, his shadow long on the grass. Golden light, birds, weathered banners.",
    "a200": "A town-square statue of the hero is being unveiled while the real hero stands beside it, embarrassed, with a crowd of cheering villagers and Strangers, and confetti. Golden light, flower garlands, a brass band.",
    "a365": "The hero stands inside a ring of golden constellations shaped like a year-wheel, twelve glowing sections for the months, in a vast night sky, one hand raised in a salute. Epic and quiet.",
    "peek": [
        "The hero tiptoes toward a closed treasure chest in a cave.",
        "He lifts the lid a crack and golden light spills out onto his face.",
        "A gremlin sneaks up beside him and peeks in too.",
        "Both jump back as crown coins and cyan energy blocks burst out of the chest like a fountain.",
    ],
    "got10": "A guild hall interior with ten banners and a shelf of trophies, a warm hearth, the hero pinning the tenth badge to the wall. Cyan light through the windows, wooden beams, comrades cheering.",
    "got20": "Inside the Haven arcade the hero holds up a gleaming prize while a Stranger prize-keeper hands him a stack of Krogmo Coins; glowing machines, a dropped coin spinning in the air and a pale-blue Snipe sitting on a cabinet. Neon cyan light, a happy crowd.",
    "got30": "A wall of golden trophies in a guild hall, the hero on a ladder polishing one with a rag, sunbeams across the dust. Violet shadows, warm wood, a gremlin holding the ladder.",
    "all": "Winged and haloed, the hero in glowing Heavenly Guardian armour salutes above a sea of clouds at sunrise, huge feathered wings spread behind him, a tiny gremlin saluting on a cloud beside him. Distant floating islands with towers, golden god rays, crown coins and cyan energy blocks drifting up like stars.",
}


def read_list():
    text = open(SRC, encoding="utf-8").read()
    items = []
    for m in re.finditer(r"\{ id: '([^']+)', name: '([^']*)', desc: (\"[^\"]*\"|'[^']*'), stat: '[^']*', target: [^,]+, crowns: (\d+)", text):
        pid, name, desc, crowns = m.groups()
        crowns = int(crowns)
        tier = "Easy" if crowns <= 10 else "Medium" if crowns <= 40 else "Hard" if crowns <= 150 else "Legendary"
        items.append({"id": pid, "name": name, "desc": desc[1:-1], "tier": tier})
    return items


def prompt(item, scene):
    four = isinstance(scene, list)
    body = scene if not four else " ".join(f"Panel {i + 1} ({pos}): {t}" for i, (pos, t) in enumerate(zip(["top-left", "top-right", "bottom-left", "bottom-right"], scene)))
    text = (PANELS + " " + body) if four else ("Scene: " + body)
    parts = [STYLE, text, HERO]
    low = body.lower()
    for _, rx, desc in CAST:
        if re.search(rx, low):
            parts.append(desc)
    word, hexa = TIER_COLOR[item["tier"]]
    parts.append(
        f"Composition and mood: {TIER_MOOD[item['tier']]}. Use {word} ({hexa}) as the colour accent of the picture, in a soft glow, a rim light or small magical "
        f"details, so it feels like {'an' if item['tier'] == 'Easy' else 'a'} {item['tier'].lower()}-tier reward; the accent never changes the colour of the hero's "
        "eyes, which stay pure white. " + ENDING)
    return " ".join(parts)


def main():
    items = read_list()
    ids = [i["id"] for i in items]
    missing = [i for i in ids if i not in SCENES]
    extra = [i for i in SCENES if i not in ids]
    if missing or extra:
        sys.exit(f"scenes missing for {missing}; scenes without an achievement: {extra}")
    n = len(items)
    out = [
        "# Achievement banners: copy-and-paste image prompts", "",
        f"One ready prompt per achievement ({n}), for any image generator. **720 x 480** (3:2). Copy a prompt as it is, nothing to fill in. Each prompt carries",
        "the whole style, the hero's look, the scene, the light and the tier's colour accent. Ask for the aspect ratio **3:2** (for example 1536 x 1024) and",
        "downscale to 720 x 480 afterwards.", "",
        "Generated by [`source/make_prompts.py`](source/make_prompts.py) from the list in the plugin; edit the scenes there, not here.", "",
        "* **Negative prompt** (if the tool has one): `text, letters, numbers, watermark, signature, border, frame, photograph, realistic, 3d render, blurry, extra limbs, deformed hands, deformed face`",
        "* The same hero appears in every picture, so give the tool the images in [`reference/`](reference) (the hero from every side, his sword and his shield, the gremlins, a Stranger, Snipes, three monsters and the energy symbol) as character references.",
        "* Pictures marked **four panels** are a small comic page (2 x 2), the others are single scenes.",
        "* If a tool limits the prompt length, drop the sentences that describe the hero and the creatures once you use the reference images; the rest still works.",
        "* The tier decides the colour accent and the mood: Easy soft mint-green `#5ee6a0` (calm), Medium bright cyan `#4fd8ff` (lively), Hard soft violet `#b98cff` (dramatic), Legendary golden-orange `#ffb347` (epic).",
        "* Crowns (gold coins) and energy (a cyan ring with a bar across it, and cyan blocks) are the game's two currencies and show up in many pictures, tokens and spirit sparks in a few.",
        "* The pictures contain no text or numbers (image models draw them badly); the plugin writes the names and numbers.", "", "",
        "| id | name | what it asks | tier | picture |", "| --- | --- | --- | --- | --- |",
    ]
    for it in items:
        out.append(f"| `{it['id']}` | {it['name']} | {it['desc']} | {it['tier']} | {'four panels' if isinstance(SCENES[it['id']], list) else 'single scene'} |")
    out += ["", "---", ""]
    for it in items:
        out += [f"### {it['name']}  ·  `{it['id']}`  ·  {it['tier']}", f"*{it['desc']}*", "", "```", prompt(it, SCENES[it["id"]]), "```", ""]
    open(OUT, "w", encoding="utf-8").write("\n".join(out))
    print(f"wrote {n} prompts to {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
