# HUD Sounds

Short synthesized sounds for what happens in Thymer, from Spaceship IDE's sound board: a task done, a status, a new or deleted line, the command palette and the / and @ menus opening, moving through them and picking a row, another page opened. Each sound is panned to where it happens on screen, and nothing is loaded: every sound is built in the browser as it plays. The plugin draws nothing, so there is no picture here.

## The sounds

The hand's actions are clicks (filtered-noise transients), the app answers in FM blips, and a settled state ends on a plain sine; the pitches share one E-major pentatonic scale.

| When | Sound |
| --- | --- |
| A task is done | a click and two notes resolving upward, with a little room reverb |
| A task gets another status (started, waiting, important, alert, starred, discuss, billable, canceled) | a click and a note of that status's own |
| A task is undone | two falling clicks |
| A new line | a soft click |
| Lines are deleted | two falling clicks |
| The command palette opens | a double click and a pip |
| A / or @ menu opens | an FM blip |
| Moving through a menu with the arrow keys | a tick, its pitch set by the row |
| Picking a row (Enter, Tab or a click) | a latch and two notes |
| A menu closes without a pick | two falling clicks |
| Another page opens in a panel | a hand-off: two clicks and an FM note |

Sounds for lines and tasks are panned to the caret, menu sounds to the menu, the page sound to the panel. Only changes made on this device play a sound, never a sync from elsewhere, and a burst of the same sound within 70 ms (a paste, a multi-line delete) plays once.

## Commands

- `HUD Sounds: turn on/off` (kept per device; a latch sound plays when it is turned on).
- `HUD Sounds: play every sound` plays the board in turn.

Browsers only let a page start audio after a key press or a click, so the sounds start after the first one.

## Settings

The volume, from 0 to 1, is under `custom` in the Configuration JSON:

```json
"custom": {
  "volume": 0.7
}
```

## How it works

Every sound is made of oscillators and noise in Web Audio (Spaceship's engine, in plain JS): one shared context with a master gain, a limiter and a small dark-room reverb, a stereo panner per sound, at most 48 voices at a time, and the nodes freed when each sound ends. Task and line sounds come from Thymer's `lineitem.updated`, `lineitem.created` and `lineitem.deleted` events, the page sound from `panel.navigated`, and the menus are noticed when Thymer adds them to the page.

## Credits

The sound engine and sound board are from [Spaceship IDE](https://github.com/chuanqisun/spaceship) by Chuanqi Sun (`src/text/sound`, MIT licence).

## Install

A global plugin: create one (Plugins → New → Global plugin), open **Edit Code**, paste `plugin.js` into the code tab and `plugin.json` into the **Configuration** tab, and save. There is no CSS.
