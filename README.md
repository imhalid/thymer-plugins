# thymer-plugins

Personal plugins for [Thymer](https://thymer.com).

| Plugin | What it does |
| --- | --- |
| [`caret-fx`](plugins/caret-fx) | Animated typing caret: glow, Neovide-style hop, blaze trail and lightning on long jumps |
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

Other commands: `Daily Garden: set daily word goal`, `Daily Garden: reset today's plant` (does not touch the collection).

## Caret FX

Effects follow the caret in the editor and in modal inputs:

- **Glow** – soft pulse around the caret on each keystroke
- **Bounce** – caret hops with a damped spring while typing
- **Trail** – blaze-style smear when the caret moves more than ~1.5 caret heights
- **Lightning** – forked bolt when the caret jumps 3+ lines

### Changing the color

Command palette:

- `Caret FX: set color…` – enter a hex color, optionally followed by an accent color (`#ffb929 #ff3b1f`)
- `Caret FX: next color preset` – cycles Amber, Ice, Violet, Mint, Rose, Lightning
- `Caret FX: set intensity…` – 0.3 (subtle) to 2 (strong)
- `Caret FX: toggle glow | bounce | trail | lightning`

Or edit `custom` in the plugin's Configuration JSON (applies immediately):

```json
{
  "color": "#ffb929",
  "accent": "#ff3b1f",
  "glow": true,
  "bounce": true,
  "trail": true,
  "lightning": true,
  "intensity": 1
}
```

`color` is the caret/glow color, `accent` is the trail edge and lightning glow.

Troubleshooting: `Caret FX: test effects` draws every effect in the middle of the screen, and `Caret FX: debug info` shows which events and caret source the plugin sees.

### Credits

The trail and lightning effects are Canvas 2D re-implementations of the Ghostty cursor shaders `cursor_blaze` (based on [this gist](https://gist.github.com/chardskarth/95874c54e29da6b5a36ab7b50ae2d088)) and `cursor_lightning`. Finding Thymer's custom caret element and measuring carets in inputs follows the approach in [akaready/thymer-cursor-tweaks](https://github.com/akaready/thymer-cursor-tweaks).
