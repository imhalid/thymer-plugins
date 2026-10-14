# thymer-plugins

Personal plugins for [Thymer](https://thymer.com).

| Plugin | What it does |
| --- | --- |
| [`caret-fx`](plugins/caret-fx) | Animated typing caret: glow, Neovide-style hop and trail, themed presets (Sakura, Autumn, Paper, Lightning) with their own effects |
| [`digital-garden`](plugins/digital-garden) | Sidebar plant that grows with your daily word count, plus 12 collectible flowers (Common → Legendary) |

## Install a plugin

1. In Thymer, create a new **global plugin** (Plugins → New → Global plugin).
2. Open **Edit Code** and paste the contents of the plugin's `plugin.js` into the code tab.
3. Paste the plugin's `plugin.json` into the **Configuration** tab and save.

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

The sidebar plant can be hidden: run `Daily Garden: toggle sidebar plant`, or set `"showSidebar": false` under `custom` in the plugin's Configuration JSON (default `true`). Word counting, the status bar counter and the collection keep working.

Other commands: `Daily Garden: set daily word goal`, `Daily Garden: reset today's plant` (does not touch the collection).

## Caret FX

The caret itself takes your chosen color, even when you are not typing, and reacts while you type:

- **Glow** – soft pulse around the caret on each keystroke
- **Bounce** – caret hops with a damped spring
- **Trail** – every typed character leaves a short blaze-style streak; long jumps leave a full one

### Color and special presets

Run `Caret FX: set color…` from the command palette. The dialog has:

- **Colors** – plain presets: Amber, Sunset, Rose, Violet, Ice, Ocean, Mint, Lime, Mono
- **Special** – presets that bring their own effect, previewed live in the dialog:

  | Preset | Effect |
  | --- | --- |
  | Lightning | blue crackles jump off the caret now and then while typing, and a bolt strikes when the caret changes line |
  | Sakura | pink petals drift off the caret |
  | Autumn | orange and red leaves fall |
  | Paper | green leaves fall |

- **Customize** – pick the caret/glow color or the trail/accent color with a saturation/brightness square, hue slider or hex field

Other commands:

- `Caret FX: next color preset` – cycles through every preset
- `Caret FX: set intensity…` – slider from 0.3× (subtle) to 2× (intense); it also scales petals, leaves and crackles
- `Caret FX: toggle bounce`, `Caret FX: toggle trail`

Settings are saved in the plugin's Configuration JSON under `custom` and can be edited there:

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

`fx` is `null`, `"lightning"`, `"sakura"`, `"autumn"` or `"paper"`; choosing a preset in the dialog sets it for you.

### How it works

Thymer draws its caret as the left border of `div.listview-caret-self`, colored by the `--ed-caret-self-fg` CSS variable, so the plugin only overrides that variable and `caret-color` (inputs and modals). Effects are drawn on a transparent canvas above the app, and nothing in the editor's DOM is modified.

### Credits

The trail and lightning are Canvas 2D re-implementations of the Ghostty cursor shaders `cursor_blaze` (based on [this gist](https://gist.github.com/chardskarth/95874c54e29da6b5a36ab7b50ae2d088)) and `cursor_lightning`. Finding Thymer's caret element and variables, and measuring carets in inputs, follows the approach in [akaready/thymer-cursor-tweaks](https://github.com/akaready/thymer-cursor-tweaks).
