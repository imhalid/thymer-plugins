# BetterSidebar

The sidebar opens and closes on a curve instead of jumping, and its rows stay where they are while it moves.

## What it does

- **The curve.** Thymer toggles the sidebar by changing the width of the window's first column at once and animating only the sidebar box, so the page snaps to its new place. Here the column and the sidebar move together: opening takes 0.5s and lands softly, closing takes 0.42s and answers the click at once.
- **The rows stay.** On a toggle Thymer rebuilds the sidebar's rows in the other layout right away, so on closing the labels, headings and pages vanished before the sidebar had moved. The plugin keeps a copy of the rows as they are and lays it over the sidebar during the move, clipped to its width: closing, the page slides over the rows and only then do they give way to the icon strip; opening, the full list is laid out at its final width from the start and the edge uncovers it, so the labels do not reflow.
- **The chevron** of the toggle turns on the same curve.

Dragging the sidebar's edge follows the pointer at once; only the jump when a drag crosses Thymer's 150px limit and the sidebar collapses (or opens again) moves on the curve. Phones and tablets keep Thymer's own drawer, and with reduced motion turned on in the system nothing animates.

## Install

A global plugin: paste `plugin.js` into the code tab, `plugin.css` into the CSS tab and `plugin.json` into the Configuration tab.
