# BetterSidebar

Closed, the sidebar is gone entirely, with no icon strip left at the edge: it slides out to the left whole, rows and all, and back in, on a curve.

## What it does

- **The curve.** Thymer toggles the sidebar by changing the width of the window's first column at once and animating only the sidebar box, so the page snaps to its new place. Here the column and the sidebar move together: opening takes 0.5s and lands softly, closing takes 0.42s and answers the click at once.
- **All the way out.** Closed, the sidebar takes no room: Thymer's 48px icon strip is hidden and the page runs to the window's edge. The toggle stays just inside the page's left edge (⌘\ works too).
- **It slides whole.** The list keeps its full width and moves with the edge, so nothing reflows or squeezes: closing, a copy of the list as it was slides off the left (Thymer has already rebuilt the rows as the strip); opening, the list Thymer has rebuilt is laid out at its final width and slides in. Mascot's knight card rides along and is hidden while the sidebar is closed.
- **The chevron** of the toggle turns on the same curve.

Dragging the sidebar's edge follows the pointer at once; only the jump when a drag crosses Thymer's 150px limit and the sidebar collapses (or opens again) moves on the curve. Phones and tablets keep Thymer's own drawer, and with reduced motion turned on in the system nothing animates.

## Install

A global plugin: paste `plugin.js` into the code tab, `plugin.css` into the CSS tab and `plugin.json` into the Configuration tab.
