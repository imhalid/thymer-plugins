# thymer-plugins

Personal plugins for [Thymer](https://thymer.com).

| Plugin | What it does |
| --- | --- |
| [`caret-fx`](plugins/caret-fx) | Animated typing caret: glow, Neovide-style hop and trail, themed presets (Sakura, Autumn, Paper, Lightning, Holy, Prism, Health, Zephyr, Tide) with their own effects, plus motion smear, fresh ink, bracket tether and a caret that eats what you delete (ported from Cursor-Smith) |
| [`achievements`](plugins/achievements) | 68 writing achievements, from easy to legendary (words, speed, streaks, tasks, night owl, ...) that pay crowns, with a small 3D knight drawn in plain WebGL in the top-left corner: its head follows the pointer, nods while you type, and it salutes with a banner when something unlocks |
| [`digital-garden`](plugins/digital-garden) | Sidebar plant that grows with your daily word count, plus 12 collectible flowers (Common → Legendary) |
| [`cursor-fx`](plugins/cursor-fx) | Mouse effects in ready-made presets (Frost, Arcane, Festival, Sweetheart, Quiet): a click effect (Arcane casts one of seven spells), a pointer trail and two colours, drawn from particle textures |
| [`home`](plugins/home) | A dashboard opened from a Home button beside Tasks: a full-width WebGL sky (a nebula, a neural field or a star atlas, in one of six biomes) in which every day you changed something is a star, brighter the more changed, days in a row joined by lines that pass light along; then the last 30 days, today's journal and recently edited pages |
| [`bookmarks`](plugins/bookmarks) | A collection for saved sites with a view of cards under their category: each with the site's preview image as its cover, its favicon, domain and description, category chips to filter by, and a field to paste a new link into |
| [`auto-banner`](plugins/auto-banner) | A page without a banner gets a picture drawn in the banner's place on a canvas (nothing is uploaded, the page is not changed): the title is the seed for one of 23 scenes (mountains, a lake, waves, a lighthouse, windmills, snow, rain, a volcano, islands, fireflies, an aurora, a nebula, cherry blossom, ...), each moving a little in a way that belongs to it, in a palette that follows the time of day, in a fine dither or smooth |

## Install a plugin

1. In Thymer, create a new **global plugin** (Plugins → New → Global plugin).
2. Open **Edit Code** and paste the contents of the plugin's `plugin.js` into the code tab.
3. Paste the plugin's `plugin.css` into the **CSS** tab.
4. Paste the plugin's `plugin.json` into the **Configuration** tab and save.

## Achievements

A character card at the top of the sidebar and 68 achievements for writing: total words, words in a day, in a minute and in one sitting, long lines, lines added, day streaks, finished tasks (in total and in a day), night, early and midnight writing, hours of the day, weekends, days written, comebacks, and unlocking the others. Each pays crowns, and each is marked Easy, Medium, Hard or Legendary by what it pays.

The card is a window onto the knight's head (low-poly, drawn with plain WebGL: the head turns to the pointer on its own while the body stays put, and nods while you type; at an unlock the knight salutes, the model blending between its idle and salute poses). The portrait has no frame or background: the canvas fades out at the bottom (a CSS mask) and a few wide, faint god rays (a small fragment shader in the same WebGL context) fan down from the top left behind the knight, drifting slowly and shivering a little. It dozes off (head down) after three minutes without a key or pointer move, waking at the first one. Below it sits Thymer's own workspace row, and the card's Search and Jump to buttons press Thymer's own Search and Jump To rows (hidden while the card is on); the sidebar's content is pushed down to make room. Click the portrait (or run `Achievements: open`) for the full list, which opens as a page in the panel you are working in (a custom panel type, not a dialog) and goes when the panel shows something else; `Achievements: show or hide the mascot` hides the card. When something unlocks nothing is shown in the middle of your writing: a small note slides in at the top right (with a soft chime) with its picture half hidden, grey and frosted under a gradient that says "Unlock new achievement", not which one. Click it and the achievements open as cards over the screen, one per family (its highest new step; one big in the middle when it is alone, scattered when there are several): each flies in from the top right, its name and what it asks are written under it, and the cards lean towards the pointer. The ceremony grows with the grandest card: an Easy one simply appears and goes after a few seconds, with a soft chime; from Medium the picture develops under a WebGL fragment shader in the tier's metal (five styles: Iris, Shards, Blocks, Ink and Burn, each achievement with its own; the list's test row plays them; skipped with reduced motion) and the mascot salutes; from Hard the knight himself stands in the first card, live (the whole model, not just the head): he looks at the pointer, snaps a salute when the card lights up, and holds the pose; a Legendary one also turns a burst of light behind everything.

The 68 achievements are the steps of 20 families, one per thing measured (words, words in a day, one sitting, words a minute, long lines, lines, streak, tasks, tasks in a day, night owl, early bird, midnight, hours of the day, weekends, every weekday, New Year, comeback, days written, the list, achievements). The list shows one card per family that ranks up as its steps unlock: it wears the last unlocked step's emblem, so its metal climbs from bronze to diamond, with its rank (steps unlocked over steps) and a bar to the next step; a family not started yet is blurred behind a lock and keeps its name secret; one at its last step glows. The filters are All, In progress and Complete, and the tier chips pick families by the metal they stand at. A click on a started family shows its rank big, with when it was won and what it paid; the arrow keys go down and up its ranks, the picture changing under a transition shader (a liquid wipe with a white light along its front). Ignore the note and it slides away, and the mascot keeps a faint glow until you click it (the portrait then opens what is waiting, otherwise the list). The portrait also wears a small hexagonal badge at its bottom left with the mark of the latest achievement, in its tier's metal; a click on it shows that achievement big.

The pictures are drawn by the plugin itself, in the page, from the list: no image files, no emoji, nothing generated. Each is a level-up emblem: a hexagon in the tier's metal (bronze for Easy, silver for Medium, gold for Hard, diamond for Legendary; the same metals colour the tiers everywhere in the plugin), bevelled, with a glossy band and wings (one feather for Easy, two for Medium, three for Hard and Legendary, which also glows), on a warm dark plate behind which a burst of light fans out, with a bright ring and dust. On the face: the tier's name, a line-drawn mark of what the achievement measures (a crown for words, a sun for a day's words, an hourglass for a sitting, lightning for words a minute, a crystal for streaks, a ticked box for tasks, a moon for the night, a rising sun for the morning, a clock for the hours, a week of squares, a calendar of dots for days, a trophy for achievements, and so on), its number, and a chevron at the foot. Drawing all 68 takes a few milliseconds; they are kept as canvases, never encoded. The knight model has no legs (the costume pipeline brings the armour, helm, weapon and shield, not a body), so in the opening's card he stands in a mist at the foot of the picture, cut at the belt by its edge. `Achievements: mute or unmute the sound` turns the chime off. `Achievements: replay the last unlock` plays it again. Progress is kept per device in the app's local storage.

To install: paste `achievements.js` (the built plugin, model and sound included) into a new global plugin's code tab and `plugin.css` into its CSS tab. To rebuild after editing `achievements.src.js`: `node build.mjs` (it embeds `knight.json` and `sound/unlock.mp3`); with Thymer open and the workspace's MCP access set to readwrite, `python3 tools/costume2thymer/push_thymer.py` writes the build straight into the live plugin. The model is a Spiral Knights asset; see `model/LICENSE.md` for its credits and for what to remove before this repository is ever made public.

### Changing the mascot

The knight is made from a [Kozmas](https://www.kozmas.gg) costume by `tools/costume2thymer`, so another costume is one command:

```sh
python3 plugins/achievements/tools/costume2thymer/costume2thymer.py https://www.kozmas.gg/costumes/proto-blade --push
```

It reads the costume's pieces from the page and downloads them (into the git-ignored `tools/costume2thymer/.cache/`), rebuilds the knight's skeleton and poses in headless Blender, writes `knight.json`, builds `achievements.js` and pushes it to Thymer through the desktop app's MCP server (backing up the live plugin first). Without `--push` it stops after writing `knight.json`; `--build` also builds. See `tools/costume2thymer/README.md`.

## Digital Garden

A sidebar plant grows with every word you write today and blooms with every task you finish. Hit the daily goal to keep a streak.

Click the word counter in the status bar (or run `Daily Garden: open flower collection`) to open the collection. Flowers unlock by **lifetime words written**:

| Rarity | Flowers (words) |
| --- | --- |
| Common | Daisy (100), Dandelion (300), White Clover (600) |
| Uncommon | Tulip (1,200), Hibiscus (1,800), Sunflower (2,500) |
| Rare | Lavender (5,000), Poppy (8,000) |
| Epic | Orchid (15,000), Lotus (25,000) |
| Legendary | Celestial Rose (50,000), Moonflower (100,000) |

Click an unlocked flower to plant it in the sidebar garden. Progress is stored in the app's local storage, so it is per device. Thresholds live in the `FLOWERS` list at the top of `plugin.js`.

The sidebar plant is hidden by default. Run `Daily Garden: toggle sidebar plant` to show or hide it; the choice is remembered on this device (the app's local storage). Without a choice, `"showSidebar": true` under `custom` in the plugin's Configuration JSON shows it. Word counting, the status bar counter and the collection work either way.

Other commands: `Daily Garden: set daily word goal`, `Daily Garden: reset today's plant` (does not touch the collection).

## Caret FX

The caret itself takes your chosen color, even when you are not typing, and reacts while you type:

- **Glow** – a soft halo opens round the caret on each keystroke (taller than wide, hugging the caret) and the caret flares for an instant
- **Bounce** – caret hops with a damped spring
- **Trail** – a comet ribbon the caret draws behind itself: the caret's full height where it is, narrowing and fading toward where it was, fluttering a little as it goes; it follows the caret along the line (typing, a word skipped with the arrow keys, a click farther on) reaching a few letters back (`trailReach`, in caret heights), a new line or a click elsewhere is one short-lived sweep that collapses toward the caret, and it fades within a second (`trailMs`). When the page scrolls it goes along with the text

### Effects from Cursor-Smith

Four more effects are ported from [Cursor-Smith](https://github.com/Sadsnake1/cursor-smith) by Sadsnake1, an Obsidian plugin (MIT). They are off until you choose them on the `Caret FX: open settings` page: Motion smear is a switch there, the other three are Special presets (one at a time, like Lightning).

- **Motion smear** (a switch on the settings page) – the caret stretches as it moves and snaps back when it arrives, on a spring. While you type, only its tail trails.
- **Fresh ink** (Special preset) – the letters you just typed stay wet in the caret color and dry into the text over a second or two.
- **Bracket tether** (Special preset) – a line under the span between the matching brackets or quotes around the caret; it follows a span that wraps onto more lines.
- **Back-man** (Special preset) – while Backspace or Delete eats text, the caret becomes a little creature that takes one bite per letter and gulps it down. A word or a selection is one big bite.

Their settings go under `custom` in the Configuration JSON, all optional:

```json
{
  "smear": false,
  "smearStiffness": 0.6,
  "smearTrailingStiffness": 0.4,
  "smearDamping": 0.8,
  "inkMs": 1500,
  "inkStrength": 0.8,
  "tetherStrength": 0.35
}
```

The plugin SDK has no caret, selection or text-layout API, so Fresh ink, Bracket tether and Back-man read the caret's line from the DOM: what was typed or deleted is worked out by comparing the line before and after each key.

### The settings page

Run `Caret FX: open settings` from the command palette: it opens a page in the panel you are working in, the way a note opens. On it:

- **Try it** – a scratch area to type in, where the caret and its effects run for real (skip words, press Enter, delete something); what you type there is kept on this device
- **Colors** – plain presets: Amber, Sunset, Rose, Violet, Ice, Ocean, Mint, Lime, Mono
- **Special** – presets that bring their own effect:

  | Preset | Effect |
  | --- | --- |
  | Lightning | blue crackles jump off the caret now and then while typing, and a bolt strikes when the caret changes line, with a flash where it lands |
  | Sakura | pink petals drift off the caret; a new line shakes a few loose at once |
  | Autumn | orange and red leaves fall, likewise |
  | Paper | green leaves fall, likewise |
  | Fresh ink | what you type stays wet in the caret color, then dries (see above) |
  | Bracket tether | a line under the matching brackets or quotes around the caret (see above) |
  | Back-man | the caret eats what Backspace and Delete take (see above) |
  | Holy | tiny golden star glints (a couple of pixels) twinkle slowly on and around the caret, in place, like light catching a gem, and the caret keeps glinting for a moment after you stop |
  | Prism | a burst of light through glass: every letter flashes on the caret with a thin blue-white lens streak and a violet lens-orb, and flings chunky glowing stars (gold, orange, some cyan with tails, some violet) that slow down, spin and fade, with embers drifting among them; a new line or a jump is a big burst |
  | Health | tiny glowing pluses, a few pixels across like Holy's glints, rise slowly out of the caret as you write, each with a short trail of light behind it, and a soft glow opens on the caret; in the preset's greens, or a red cross if you pick red colors |
  | Zephyr | an anime-style wind skill: pointed, cel-shaded leaves are swept up round the caret and off behind it, fluttering, while thin speed lines streak back from the caret; a new line or a jump is a full gust |
  | Tide | a stylized water skill: every letter flicks a small spray of teardrops (round head, tapering tail, white glint) out of the caret to arc up and fall back, and now and then a bubble drifts up and pops; a new line or a jump is a big splash |
  | Combo | typing as a game: every letter in a run adds one to a counter above the caret that pops with each hit and runs down if you pause (NICE, GREAT, SUPER, ULTRA at 10, 25, 50, 100); the caret itself changes color with the count - red from 10, orange from 25, blue from 50, white-hot blue from 100 - and throws sparks, more of them the higher you go; a broken run of ten or more drops away |

  Holy, Prism, Health, Zephyr and Tide answer writing, not deleting.

- **Effects** – four switches: **Block cursor** (a box the width of the letter instead of the line caret), **Motion smear**, **Trail** and **Bounce**
- **Intensity** – a slider from 0.3× (subtle) to 2× (intense); it also scales petals, leaves, crackles, glints, prism stars and pluses

Other commands: `Caret FX: next preset` cycles through every preset.

What you choose on the page and with the commands (preset, switches, intensity) is remembered per device, in the app's local storage, and wins over the Configuration JSON, which is the place for defaults and tuning under `custom`:

```json
{
  "color": "#ffb929",
  "accent": "#ff3b1f",
  "fx": null,
  "bounce": true,
  "trail": true,
  "trailMs": 900,
  "trailReach": 3,
  "intensity": 1
}
```

`fx` is `null`, `"lightning"`, `"sakura"`, `"autumn"`, `"paper"`, `"ink"`, `"tether"`, `"backman"`, `"holy"`, `"prism"`, `"health"`, `"zephyr"`, `"tide"`, or `"combo"`; `style` is `"line"` or `"block"`; choosing a preset in the dialog sets it for you. Holy, Prism, Zephyr and Tide have a setting each, `"holySize"`, `"prismStrength"`, `"zephyrSize"` and `"tideSize"` (1 is normal).

### How it works

Thymer draws its caret as the left border of `div.listview-caret-self`, colored by the `--ed-caret-self-fg` CSS variable, so the plugin only overrides that variable and `caret-color` (inputs and modals). Effects are drawn on a transparent canvas above the app, and nothing in the editor's DOM is modified.

### Credits

The trail and lightning are Canvas 2D re-implementations of the Ghostty cursor shaders `cursor_blaze` (based on [this gist](https://gist.github.com/chardskarth/95874c54e29da6b5a36ab7b50ae2d088)) and `cursor_lightning`. Finding Thymer's caret element and variables, and measuring carets in inputs, follows the approach in [akaready/thymer-cursor-tweaks](https://github.com/akaready/thymer-cursor-tweaks).

Motion smear, Fresh ink, Bracket tether and Back-man are ported from [Sadsnake1/cursor-smith](https://github.com/Sadsnake1/cursor-smith) (MIT, version 1.8.1) and adapted to Thymer's editor. Cursor-Smith's copyright and license notice are kept at the top of `plugin.js`, and each effect names the files it follows.

## Cursor FX

Effects for the mouse, in presets made to go together: each puts a click effect, a trail behind the pointer (a comet, fairy dust, or none), a size and two colours (a main one and an accent some parts take). Frost (a ripple, a comet), Arcane (one of seven spells each click: pentagram, heptagram, compass, nova, twin rings, vortex, sun sigil), Festival (fireworks), Sweetheart (hearts) and Quiet (a small ripple). The spells come in a shuffled order, never the same twice running. Pick a preset in `Cursor FX: choose preset…` (picking it plays it); `Cursor FX: next preset` and `Cursor FX: turn on or off` work from the command palette. The choice is kept per device.

Everything is drawn from small grayscale CC0 textures (Kenney's Particle Pack and a Screaming Brain Studios noise, see `fx/LICENSE.md`) as instanced WebGL particles on one canvas that clicks pass through; it draws only while something is alive. On a dark theme the light adds up; on a light theme the colour is darkened and painted. It stays off on phones and tablets and with reduced motion.

To install: paste `cursor-fx.js` (the built plugin, textures included) into a new global plugin's code tab and `plugin.css` into its CSS tab. To rebuild after editing `cursor-fx.src.js`: `node build.mjs`.

## Home

A dashboard of your own. A Home button sits beside Tasks in the sidebar (a copy of Thymer's Tasks row, so it looks the same; the two share the line, and stack when the sidebar is collapsed), and `Home: open` works from the command palette. Home opens in the panel you are working in, without the panel's title bar (it comes back when the panel shows something else).

Its header, across the whole top of the panel, is deep space drawn with WebGL, in which every day on which something changed in the workspace is a star, bigger and brighter the more changed that day, the brightest with four diffraction spikes; days in a row are joined by soft lines along which pulses of light run from the older day to the newer, like data being sent. Today's star has a ring that breathes; pointing at a star tells its date and how much changed. A picker in the sky's corner chooses its shape:

- **Nebula** – close in front of a cloud of glowing gas in layers at different depths, bright ionised hearts, dark dust drifting in front; the camera slides slowly along it (the near layers pass the far ones), from today's end to the oldest and back. The days are young stars on a stream that winds through it.
- **Neural** – a living field of glowing filaments, like a nervous system, across the whole sky (a port of [zozuar's shader](https://twitter.com/zozuar/status/1625182758745128981), on Shadertoy as [mlBXRK](https://www.shadertoy.com/view/mlBXRK)), in the biome's colours; the days are points scattered over it, the oldest at the left, and each lights up as a filament passes it.
- **Star atlas** – a flat chart on deep blue paper, gas drifting behind it, with a fine grid and the dashed ecliptic; every week is a constellation labelled with its number and month. It pans slowly from today to the oldest week and back.

and its biome, the colours any shape is drawn in: Nebula, Ember, Aurora, Ice, Gold or Abyss. The page follows the panel's width (not the window's): in a narrow panel the sky's centrepiece moves to the middle and the cards stack. Under the header: a bar for each of the last 30 days, today's journal, and the pages edited last. `Home: next sky shape` and `Home: next biome` work from the command palette; the shape and the biome are kept per device.

What changed when is read from the workspace when Home opens (again after two minutes): a page counts on the day it was made, a line on the day it was written and the day it was last changed. Lines written while Home is open brighten today's star. Off on phones and tablets.

To install: paste `plugin.js` into a new global plugin's code tab and `plugin.css` into its CSS tab.

## Bookmarks

The code of a **collection** (not a global plugin) for saved sites, with fields URL (url), Description (text) and Category (choice, one per bookmark). Its Bookmarks view lays them out as cards, one section per category in the order the Category field lists them: the record's banner is the card's cover, fading into the card (without one, a cover drawn for the site: soft shapes placed by its domain, ordered-dithered in the category's colour), then the favicon and the title on one line (the favicon is the title's initial when the site has none at `/favicon.ico`), the domain when the title does not already say it, and two lines of description. Each card takes the most vivid colour of its cover (or the category's, for a cover with little colour): it is tinted with it, and its edge takes it under the pointer. A click opens the site; the page button in the cover's corner, or a Cmd/Ctrl-click, opens the record in the other panel. A chip per category, with its count, shows only that category; Thymer's own search bar above the view filters the cards.

A link pasted into the field beside the chips becomes a bookmark (in the chosen category, if one is chosen); `Bookmarks: add from clipboard` does the same with the link on the clipboard. The page is read for its title, description and preview image, which become the record's title, Description and banner, but most sites do not let a page in Thymer read them (CORS), and then the bookmark is saved with its domain as the title and no cover. A link already saved is not added twice.

To install: create a collection, open **Edit as Code**, paste `plugin.json` into the Configuration tab (it holds the fields, the custom view and the Gallery, Table and List views), `plugin.js` into the code tab and `plugin.css` into the CSS tab.

## Auto Banner

A page without a banner of its own gets a picture at the top, in the banner's place, drawn from its title on a canvas while the page is shown. Nothing is generated into the workspace: no image is uploaded and the page is not changed, so turning the plugin off leaves every page as it was, and a page with a banner (its own or its collection's) keeps showing that. The title is the seed: which of the 23 scenes comes is left to chance, but the same title always gives the same one.

The scenes, and how each moves: mountains (clouds drift, fog drifts between the ridges, birds now and then cross), hills, the sea (the sun shimmers on the water, a sail bobs on), a lake (its reflection wavers), waves (the rows roll in, the nearer the faster), dunes (sand blows off the crests), buttes and saguaros (a hawk circles), a sea of clouds (the rows drift), a forest in fog, a skyline (windows go on and off, an aeroplane blinks across), a synthwave grid (the floor runs towards you), a contour map (the sun goes slowly round it), an aurora (it folds), a nebula (stars twinkle, a shooting star passes), cherry blossom (branches sway, petals fall), flow lines (sparks run along them), a lighthouse (its beams sweep), windmills (the sails turn), a snowed village (snow falls, chimneys smoke), rain (puddles ring, lightning far away), a volcano (it smokes and throws embers), palm islands (fronds sway) and fireflies (they wander and blink). It runs at 10 to 20 frames a second, dithered on the GPU (about a millisecond a frame), and stops while the strip is out of sight, the app is in the background or the system asks for reduced motion.

The palette follows the time of day (dawn, day, dusk, night): one of the scene's palettes that suits the hour, so a page shows the same scene at noon and at night, in other colours. The strip takes a banner's height while it shows a picture; the picture follows the title once it settles and the panel's width.

Commands: `Auto Banner: another picture for this page` (another seed, kept on this device), `Auto Banner: back to this page's own picture`, `Auto Banner: switch between dither and smooth`, `Auto Banner: motion on or off`, `Auto Banner: follow the time of day or not`, `Auto Banner: turn on or off` (all kept per device). Under `custom` in the Configuration: `"exclude": ["Journal"]` skips collections by name, `"style": "smooth"` sets the default style.
