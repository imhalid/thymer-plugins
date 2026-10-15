# thymer-plugins

Personal plugins for [Thymer](https://thymer.com).

| Plugin | What it does |
| --- | --- |
| [`caret-fx`](plugins/caret-fx) | Animated typing caret: glow, Neovide-style hop and trail, themed presets (Sakura, Autumn, Paper, Lightning, Holy, Prism, Health, Zephyr, Tide) with their own effects, plus motion smear, fresh ink, bracket tether and a caret that eats what you delete (ported from Cursor-Smith) |
| [`achievements`](plugins/achievements) | 62 writing achievements, from easy to legendary (words, speed, streaks, tasks, night owl, ...) that pay rings, with a small 3D mascot drawn in plain WebGL in the top-left corner: it spins, runs faster while you type, and hops with a banner when something unlocks |
| [`digital-garden`](plugins/digital-garden) | Sidebar plant that grows with your daily word count, plus 12 collectible flowers (Common → Legendary) |
| [`cursor-fx`](plugins/cursor-fx) | Mouse effects drawn from particle textures: a ripple, spark burst, magic circle, electric zap, hearts, slash, firework or smoke puff where you click, and a comet, fairy-dust or flame trail behind the pointer |

## Install a plugin

1. In Thymer, create a new **global plugin** (Plugins → New → Global plugin).
2. Open **Edit Code** and paste the contents of the plugin's `plugin.js` into the code tab.
3. Paste the plugin's `plugin.css` into the **CSS** tab.
4. Paste the plugin's `plugin.json` into the **Configuration** tab and save.

## Achievements

A character card at the top of the sidebar and 62 achievements for writing: total words, words in a day, in a minute and in one sitting, long lines, lines added, day streaks, finished tasks (in total and in a day), night, early and midnight writing, hours of the day, weekends, days written, comebacks, and unlocking the others. Each pays rings, and each is marked Easy, Medium, Hard or Legendary by what it pays.

The card is a window onto the mascot's head (low-poly, drawn with plain WebGL, looking at the pointer, nodding while you type). Below it sits Thymer's own workspace row, and the card's Search and Jump to buttons press Thymer's own Search and Jump To rows (hidden while the card is on); the sidebar's content is pushed down to make room. Click the portrait (or run `Achievements: open`) for the full list; `Achievements: show or hide the mascot` hides the card. When something unlocks, a notification drops in at the top centre of the screen on a black radial glow: each badge gathers a ring of energy in its tier's colour while the icon waits small, then bursts into a shockwave and sparks as the icon springs open and the words bounce in (a WebGL fragment shader drawing from small CC0 textures by Kenney and Screaming Brain Studios, see `fx/LICENSE.md`; skipped with reduced motion). Several unlocks at once open as a staggered stack, top to bottom. `Achievements: replay the last unlock` plays it again. Progress is kept per device in the app's local storage.

To install: paste `achievements.js` (the built plugin, model included) into a new global plugin's code tab and `plugin.css` into its CSS tab. To rebuild after editing `achievements.src.js`: `node build.mjs` (it embeds `sonic.json`). The model is a ripped Sonic Adventure asset; see `model/LICENSE.md` for its credits and for what to remove before this repository is ever made public.

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

- **Glow** – soft pulse around the caret on each keystroke
- **Bounce** – caret hops with a damped spring
- **Trail** – every typed character leaves a short blaze-style streak; long jumps leave a full one

### Effects from Cursor-Smith

Four more effects are ported from [Cursor-Smith](https://github.com/Sadsnake1/cursor-smith) by Sadsnake1, an Obsidian plugin (MIT). They are off until you choose them in the `Caret FX: set preset…` dialog: Motion smear is a switch there, the other three are Special presets (one at a time, like Lightning).

- **Motion smear** (a switch in the dialog) – the caret stretches as it moves and snaps back when it arrives, on a spring. While you type, only its tail trails.
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

### Color and special presets

Run `Caret FX: set preset…` from the command palette. The dialog has:

- **Colors** – plain presets: Amber, Sunset, Rose, Violet, Ice, Ocean, Mint, Lime, Mono
- **Special** – presets that bring their own effect, previewed live in the dialog:

  | Preset | Effect |
  | --- | --- |
  | Lightning | blue crackles jump off the caret now and then while typing, and a bolt strikes when the caret changes line |
  | Sakura | pink petals drift off the caret |
  | Autumn | orange and red leaves fall |
  | Paper | green leaves fall |
  | Fresh ink | what you type stays wet in the caret color, then dries (see above) |
  | Bracket tether | a line under the matching brackets or quotes around the caret (see above) |
  | Back-man | the caret eats what Backspace and Delete take (see above) |
  | Holy | tiny golden star glints (a couple of pixels) twinkle slowly on and around the caret, in place, like light catching a gem, and the caret keeps glinting for a moment after you stop |
  | Prism | a burst of light through glass: every letter flashes on the caret with a thin blue-white lens streak and a violet lens-orb, and flings chunky glowing stars (gold, orange, some cyan with tails, some violet) that slow down, spin and fade, with embers drifting among them; a new line or a jump is a big burst |
  | Health | thin glowing pluses float slowly up out of the caret as you write, with thin beams of light and tiny motes, like a healing spell, a few at a time; in the preset's greens, or a red cross if you pick red colors |
  | Zephyr | an anime-style wind skill: pointed, cel-shaded leaves are swept up round the caret and off behind it, fluttering, while thin speed lines streak back from the caret; a new line or a jump is a full gust |
  | Tide | a stylized water skill: every letter flicks a small spray of teardrops (round head, tapering tail, white glint) out of the caret to arc up and fall back, and now and then a bubble drifts up and pops; a new line or a jump is a big splash |
  | Combo | typing as a game: every letter in a run adds one to a counter above the caret that pops with each hit and runs down if you pause (NICE, GREAT, SUPER, ULTRA at 10, 25, 50, 100); the caret itself changes color with the count - red from 10, orange from 25, blue from 50, white-hot blue from 100 - and throws sparks, more of them the higher you go; a broken run of ten or more drops away |

  Holy, Prism, Health, Zephyr and Tide answer writing, not deleting.

- **Effects** – two switches: **Block cursor** (a box the width of the letter instead of the line caret) and **Motion smear**
- **Customize** – pick the caret/glow color or the trail/accent color with a saturation/brightness square, hue slider or hex field

Other commands:

- `Caret FX: next preset` – cycles through every preset
- `Caret FX: set intensity…` – slider from 0.3× (subtle) to 2× (intense); it also scales petals, leaves, crackles, glints, prism fans and pluses
- `Caret FX: toggle bounce`, `Caret FX: toggle trail`

What you choose in the dialogs and commands (preset, switches, intensity) is remembered per device, in the app's local storage, and wins over the Configuration JSON, which is the place for defaults and tuning under `custom`:

```json
{
  "color": "#ffb929",
  "accent": "#ff3b1f",
  "fx": null,
  "bounce": true,
  "trail": true,
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

Effects for the mouse. Clicking plays a click effect where you clicked (Ripple, Spark burst, Magic circle, Electric zap, Hearts, Slash, Firework, Smoke puff, or Random), and moving the pointer can leave a trail (Comet, Fairy dust, Flame, or none). Pick them, the colour and the size in `Cursor FX: settings…` (clicking in there is the preview); `Cursor FX: next click effect`, `Cursor FX: next trail` and `Cursor FX: turn on or off` work from the command palette. Choices are kept per device.

Everything is drawn from small grayscale CC0 textures (Kenney's Particle Pack and a Screaming Brain Studios noise, see `fx/LICENSE.md`) as instanced WebGL particles on one canvas that clicks pass through; it draws only while something is alive. On a dark theme the light adds up; on a light theme the colour is darkened and painted. It stays off on phones and tablets and with reduced motion.

To install: paste `cursor-fx.js` (the built plugin, textures included) into a new global plugin's code tab and `plugin.css` into its CSS tab. To rebuild after editing `cursor-fx.src.js`: `node build.mjs`.
