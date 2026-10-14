/**
 * Caret FX
 *
 * Animated caret effects while you type: glow pulse, neovide-style hop, a blaze
 * trail when the caret moves, and signature effects (lightning, falling petals and leaves).
 * Inspired by the Ghostty cursor_blaze / cursor_lightning shaders.
 *
 * Four more effects - Motion smear, Fresh ink, Bracket tether and Back-man (the caret that eats what
 * Backspace and Delete take) - are ported from Cursor-Smith by Sadsnake1
 * (https://github.com/Sadsnake1/cursor-smith, MIT License). See THIRD-PARTY NOTICE below.
 * They are off until chosen in the "Caret FX: set preset…" dialog: Motion smear is a switch there (with the block
 * cursor); Fresh ink, Bracket tether and Back-man are special presets, like Lightning and the falling petals.
 *
 * Five special presets are original to this plugin, with colors of their own like Sakura and Lightning: Holy
 * (tiny star glints that twinkle on the caret, like a gem), Prism (two crescents of spectrum flanking the caret, light
 * through a lens), Health (thin pluses and beams of light floating up as you write, as if you were gaining health) and Zephyr (an anime-style wind skill: speed lines and leaves swept up round the caret) and Tide
 * (a stylized water skill: sprays of teardrops and drifting bubbles). Pick them in "Caret FX: set preset…" under Special.
 *
 * Scope: the Thymer editor only. The plugin follows Thymer's own caret element
 * (div.listview-caret-self) and never touches the command palette, rename fields,
 * dropdowns or other plugins' inputs. Effects are clipped to the editor's scroll
 * area so they do not paint over the title bar, status bar or neighbouring panels.
 *
 * Caret shape: "style" is "line" (Thymer's own caret, recolored) or "block" (Thymer's caret is
 * hidden and a block the width of the character under the caret is drawn instead).
 *
 * Colors: "color"/"accent" are the dark-theme pair; on light themes they are darkened
 * automatically (lightVariant).
 *
 * Effects live in the EFFECTS registry (see "HOW TO ADD AN EFFECT"); the Plugin class knows none by name.
 *
 * Settings: defaults and tuning live in this plugin's config under "custom" (Edit Code > Configuration); what you
 * choose in the "Caret FX: ..." dialogs and commands is kept per device and wins over it.
 */

/*
 * THIRD-PARTY NOTICE
 *
 * Motion smear, Fresh ink, Bracket tether and Back-man are ported from Cursor-Smith by Sadsnake1
 * (https://github.com/Sadsnake1/cursor-smith), as of its version 1.8.1. Their algorithms, constants and design
 * decisions come from that project's source; the code here adapts them to Thymer's editor DOM and to this plugin's
 * canvas. Each of the four names the Cursor-Smith files it follows. Cursor-Smith is distributed under the MIT
 * License, reproduced here as that license asks:
 *
 *   MIT License
 *
 *   Copyright (c) 2026 Sadsnake1
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 */

// Colour-only presets: [name, caret/glow color, accent color]. Special presets come from the effect registry.
const PRESETS = [
	['Amber', '#ffb929', '#ff3b1f'],
	['Sunset', '#ff9a56', '#ff3d77'],
	['Rose', '#ffb3c7', '#ff2d6f'],
	['Violet', '#d6a6ff', '#7a2bff'],
	['Ice', '#9be7ff', '#2b7bff'],
	['Ocean', '#5ef2e0', '#0a7ea4'],
	['Mint', '#9dffcf', '#08b36b'],
	['Lime', '#e4ff6a', '#4bb800'],
	['Mono', '#ffffff', '#8a8f98'],
];

// The switches in the preset dialog, in its order: [key, label, caption]. 'style' is the block cursor (cfg.style is
// 'block' when on); every other key is the id of an 'always' effect. They have no command of their own.
// (Fresh ink, Bracket tether and Back-man are not here: they are special presets, one at a time like Lightning.)
const DIALOG_SWITCHES = [
	['style', 'Block cursor', 'A box the width of the letter'],
	['smear', 'Motion smear', 'Stretches as it moves, snaps back'],
];

// Stacking: the effects (canvas, block cursor) sit above the editor, whose layers top out at 11, and below Thymer's own
// menus, command palette and dialogs (z-index 998 and up), so nothing of the caret shows through or over them. The
// preset dialog of this plugin is itself a dialog and sits above everything.

// What the dialogs and commands choose is kept in this device's localStorage and laid over the configuration JSON, which
// stays the place for defaults and tuning. (Saving the plugin's configuration reloads the plugin - the dialog would
// close at every click - and AppPlugin has no way to save it quietly.)
const CHOICES_KEY = 'caretfx.choices';
function loadChoices() {
	try { return JSON.parse(localStorage.getItem(CHOICES_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function saveChoices(patch) {
	try { localStorage.setItem(CHOICES_KEY, JSON.stringify({ ...loadChoices(), ...patch })); } catch (e) { /* keep the in-memory value */ }
}

// Thymer DOM the plugin relies on (same hooks Thymer's own caret CSS uses).
const CARET_SEL = 'div.listview-caret-self';
const FOCUSED_PANEL_SEL = '.panel.focused-panel, .panel.has-focus';
const LISTITEM_SEL = '.listitem[data-guid]';
const MODAL_SEL = '.cmdpal--dialog, .dropdown, .modal-container, .link-menu-visible'; // typing here is not editor typing

const hash = (p) => { p = (p * 0.1031) % 1; p *= p + 33.33; p *= p + p; return p - Math.floor(p); };

const rgba = (hex, a) => {
	let h = String(hex || '').replace('#', '');
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	const n = parseInt(h, 16);
	if (!/^[0-9a-f]{6}$/i.test(h)) return `rgba(255,185,41,${a})`;
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const hexToHsv = (hex) => {
	const n = parseInt(String(hex).replace('#', '').padStart(6, '0').slice(0, 6), 16);
	const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
	let h = 0;
	if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return { h: h * 60, s: mx ? d / mx : 0, v: mx };
};
const hsvToHex = ({ h, s, v }) => {
	const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
	return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};

/** A darker, more saturated twin of a dark-theme color so it stays visible on a light background. */
const lightVariant = (hex) => {
	const c = hexToHsv(hex);
	if (c.s < 0.1) return hsvToHex({ h: c.h, s: 0, v: 0.28 });          // near-white / grey presets become dark grey
	return hsvToHex({ h: c.h, s: Math.min(1, c.s * 1.15 + 0.1), v: c.v * 0.62 });
};

/** Thymer marks the theme on <html>/<body>; fall back to the body background luminance. */
function isDarkTheme() {
	const h = document.documentElement.classList, b = document.body.classList;
	if (h.contains('theme-dark') || b.contains('theme-dark')) return true;
	if (h.contains('theme-light') || b.contains('theme-light')) return false;
	const m = (getComputedStyle(document.body).backgroundColor || '').match(/[\d.]+/g);
	if (m && m.length >= 3 && !(m.length > 3 && Number(m[3]) === 0)) {
		const [r, g, bl] = m.map(Number);
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl < 128;
	}
	return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
}

const isVisiblyRendered = (el) => {
	if (!el) return false;
	const cs = getComputedStyle(el);
	return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01;
};

/** Box of the character next to a point, via the browser's own hit-testing: the exact visual line, even inside wrapped rows. */
function charRectAt(x, y) {
	let range = null;
	try {
		if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(x, y);
		else if (document.caretPositionFromPoint) {
			const pos = document.caretPositionFromPoint(x, y);
			if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
		}
	} catch (e) { return null; }
	const node = range && range.startContainer;
	if (!node || node.nodeType !== 3) return null;
	const off = range.startOffset, len = node.data.length;
	const probe = (a, b) => {
		try {
			const q = document.createRange(); q.setStart(node, a); q.setEnd(node, b);
			const c = q.getClientRects()[0];
			return c && c.height > 0.5 ? { top: c.top, height: c.height, left: c.left, width: c.width } : null;
		} catch (e) { return null; }
	};
	return (off < len && probe(off, off + 1)) || (off > 0 && probe(off - 1, off)) || null;
}

/** Top/height of the text on a row at a given vertical position: headings and code rows have a taller line than the caret element itself. */
function lineTextRect(row, midY) {
	if (!(row instanceof HTMLElement)) return null;
	const line = row.querySelector(':scope > .line-div') || row.querySelector('.line-div');
	if (!(line instanceof HTMLElement)) return null;
	const lineBox = line.getBoundingClientRect();
	if (lineBox.width < 1 && lineBox.height < 1) return null;
	try {
		const range = document.createRange();
		range.selectNodeContents(line);
		const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
		if (rects.length) {
			// Wrapped rows report one box per visual line: keep the line the caret is on, not the first one.
			let anchor = rects.find((r) => midY >= r.top - 1 && midY <= r.bottom + 1);
			if (!anchor) anchor = rects.reduce((a, r) => (Math.abs((r.top + r.bottom) / 2 - midY) < Math.abs((a.top + a.bottom) / 2 - midY) ? r : a));
			let top = anchor.top, bottom = anchor.bottom;
			for (const r of rects) if (Math.abs(r.top - anchor.top) <= 1.25) { top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); }
			if (bottom - top >= 1) return { top, height: bottom - top };
		}
	} catch (e) { /* fall through to line-height */ }
	const cs = getComputedStyle(line);
	let lh = parseFloat(cs.lineHeight);
	if (!Number.isFinite(lh) || lh <= 0) { const fs = parseFloat(cs.fontSize); lh = Number.isFinite(fs) ? fs * 1.2 : Math.min(lineBox.height || 20, 28); }
	return { top: lineBox.top, height: Math.min(lh, lineBox.height || lh) };
}

/** The editor row under a caret rect. Caret elements live in their own layer, so hit-test instead of walking up. */
function rowForCaret(caretEl, r) {
	const own = caretEl.closest(LISTITEM_SEL);
	if (own) return own;
	const mid = (r.top + r.bottom) / 2;
	try {
		const hit = document.elementFromPoint(Math.max(0, r.left + 1), mid);
		const row = hit && hit.closest ? hit.closest(LISTITEM_SEL) : null;
		if (row) return row;
	} catch (e) { /* ignore */ }
	const panel = caretEl.closest('.panel') || document.querySelector(FOCUSED_PANEL_SEL) || document.body;
	const marked = panel.querySelector('.listitem.listitem-with-caret[data-guid]');
	if (marked) { const b = marked.getBoundingClientRect(); if (mid >= b.top - 1 && mid <= b.bottom + 1) return marked; }
	return null;
}

// =====================================================================================
// LINE TEXT
// Thymer exposes no document model to a plugin, so the text of the line the caret is on is read from the DOM:
// its characters, where each one is drawn, and where the caret stands among them. Fresh ink, Bracket tether and
// Back-man all work from this.
// =====================================================================================

/** The element that holds an editor row's text. */
const lineDivOf = (row) => (row instanceof HTMLElement ? row.querySelector(':scope > .line-div') || row.querySelector('.line-div') : null);

/** One editor row's text, with the geometry of every character in it. */
class LineText {
	constructor(row) {
		this.row = row;
		this.guid = row.getAttribute('data-guid') || '';
		this.el = lineDivOf(row);
		this.nodes = [];    // the text nodes, in reading order
		this.starts = [];   // where each of them begins in `text`
		let text = '';
		if (this.el) {
			const walk = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
			for (let n = walk.nextNode(); n; n = walk.nextNode()) { this.nodes.push(n); this.starts.push(text.length); text += n.data; }
		}
		this.text = text;
	}

	/** The index in `text` of a DOM position (a text node and an offset, or an element and a child index); -1 outside the row. */
	indexOf(node, off) {
		if (!this.el || !node || !this.el.contains(node)) return -1;
		try {
			const r = document.createRange();
			r.setStart(this.el, 0);
			r.setEnd(node, off);
			return r.toString().length;
		} catch (e) { return -1; }
	}

	/** The index of the character boundary nearest a point; -1 when the point is not over this row's text. */
	indexAt(x, y) {
		let range = null;
		try {
			if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(x, y);
			else if (document.caretPositionFromPoint) {
				const pos = document.caretPositionFromPoint(x, y);
				if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
			}
		} catch (e) { return -1; }
		return range ? this.indexOf(range.startContainer, range.startOffset) : -1;
	}

	/** Where characters [i, j) are drawn: one { x, y, w, h } per run of text on one visual line. Each text node is measured on its own, so no element box around it is counted. */
	rects(i, j) {
		const out = [];
		for (let k = 0; k < this.nodes.length; k++) {
			const node = this.nodes[k], from = this.starts[k];
			const a = Math.max(i, from), b = Math.min(j, from + node.data.length);
			if (b <= a) continue;
			const r = document.createRange();
			r.setStart(node, a - from);
			r.setEnd(node, b - from);
			for (const c of r.getClientRects()) if (c.width > 0.5 && c.height > 0.5) out.push({ x: c.left, y: c.top, w: c.width, h: c.height });
		}
		return out;
	}

	/** Where the character at `i` (`n` code units long) is drawn; null when it is not. */
	charRect(i, n = 1) { return this.rects(i, i + n)[0] || null; }

	/** The element whose style the character at `i` is drawn in. */
	styleHost(i) {
		let k = this.nodes.length - 1;
		while (k > 0 && this.starts[k] > i) k--;
		return k >= 0 ? this.nodes[k].parentElement : this.el;
	}
}

/** The row with this guid, wherever it is now (an editor may redraw its rows). */
const rowByGuid = (guid) => (guid ? document.querySelector(`.listitem[data-guid="${CSS.escape(guid)}"]`) : null);

/**
 * The line the caret is on and where in it: { line, idx, collapsed }, or null. The browser's own selection says
 * where (Thymer's editor is contenteditable); the caret element's position is the fallback. Read once per sample
 * and shared by every effect, unless `fresh`.
 */
function caretLine(plugin, fresh = false) {
	const memo = plugin.lineMemo;
	if (!fresh && memo && memo.n === plugin.sampleN) return memo.value;
	let value = null;
	const rect = plugin.last, el = plugin.caretEl;
	if (rect && el && el.isConnected) {
		const row = rowForCaret(el, { top: rect.y, bottom: rect.y + rect.h, left: rect.x });
		const line = row && new LineText(row);
		if (line && line.el) {
			const sel = window.getSelection();
			let idx = -1, collapsed = true;
			if (sel && sel.rangeCount && sel.focusNode && line.el.contains(sel.focusNode)) { idx = line.indexOf(sel.focusNode, sel.focusOffset); collapsed = sel.isCollapsed; }
			if (idx < 0) idx = line.indexAt(rect.x + 1, rect.y + rect.h / 2);
			if (idx >= 0) value = { line, idx, collapsed };
		}
	}
	plugin.lineMemo = { n: plugin.sampleN, value };
	return value;
}

/**
 * What changed in a line of text: { at, removed, inserted }, or null when nothing did. `caret` is where the caret
 * stands after the edit. Typing and deleting both leave it at the edge of the change, which settles which of
 * several identical letters was meant (the second "l" of "hello"); any other change - a paste, a selection wiped
 * - is the stretch between the text's common head and common tail.
 */
function lineEdit(before, after, caret) {
	if (before === after) return null;
	const d = after.length - before.length;
	if (d < 0 && before.slice(0, caret) + before.slice(caret - d) === after) return { at: caret, removed: before.slice(caret, caret - d), inserted: '' };
	if (d > 0 && caret >= d && after.slice(0, caret - d) + after.slice(caret) === before) return { at: caret - d, removed: '', inserted: after.slice(caret - d, caret) };
	const max = Math.min(before.length, after.length);
	let head = 0;
	while (head < max && before.charCodeAt(head) === after.charCodeAt(head)) head++;
	let tail = 0;
	while (tail < max - head && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
	return { at: head, removed: before.slice(head, before.length - tail), inserted: after.slice(head, after.length - tail) };
}

const UI_CSS = `
.cfx-ov { position: fixed; inset: 0; z-index: 2147483100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.4); backdrop-filter: blur(3px); animation: cfx-in .14s ease-out; }
@keyframes cfx-in { from { opacity: 0; } to { opacity: 1; } }
.cfx-box { width: 340px; max-width: 92vw; max-height: 92vh; overflow-y: auto; padding: 18px; border-radius: 18px; border: 1px solid rgba(127,127,127,.28); box-shadow: 0 28px 80px rgba(0,0,0,.5); font: 13px/1.4 system-ui, sans-serif; animation: cfx-pop .18s cubic-bezier(.2,1.2,.4,1); }
@keyframes cfx-pop { from { transform: translateY(8px) scale(.97); } to { transform: none; } }
.cfx-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.cfx-title { font-size: 15px; font-weight: 650; }
.cfx-x { all: unset; cursor: pointer; opacity: .55; padding: 2px 6px; border-radius: 6px; }
.cfx-x:hover { opacity: 1; background: rgba(127,127,127,.18); }
.cfx-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .55; margin: 14px 0 7px; }
.cfx-preview { position: relative; height: 84px; border-radius: 12px; overflow: hidden; background: rgba(127,127,127,.12); border: 1px solid rgba(127,127,127,.2); display: flex; align-items: center; padding: 0 16px; font-size: 15px; letter-spacing: .02em; }
.cfx-preview .cfx-trail { position: absolute; left: 118px; top: 31px; width: 70px; height: 22px; background: linear-gradient(90deg, transparent, var(--a)); opacity: .55; filter: blur(2px); }
.cfx-preview .cfx-caret { position: absolute; left: 186px; top: 28px; width: 2.5px; height: 28px; border-radius: 2px; background: var(--c); box-shadow: 0 0 10px var(--c), 0 0 22px var(--a); animation: cfx-blink 1.1s steps(1) infinite; }
@keyframes cfx-blink { 50% { opacity: .35; } }
.cfx-preview.block .cfx-caret { width: 14px; border-radius: 2px; background: color-mix(in srgb, var(--c) 42%, transparent); box-shadow: inset 0 0 0 1.5px var(--c), 0 0 8px color-mix(in srgb, var(--c) 45%, transparent); }
.cfx-preview canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cfx-opts { display: grid; gap: 1px; margin: 0 -8px; }
.cfx-opt { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 8px; border-radius: 9px; cursor: pointer; }
.cfx-opt:hover { background: rgba(127,127,127,.12); }
.cfx-opt:focus-visible { outline: 2px solid var(--c); outline-offset: -2px; }
.cfx-opt-name { display: block; font-size: 13px; }
.cfx-opt-note { display: block; font-size: 11px; opacity: .55; }
.cfx-sw { position: relative; flex: none; width: 30px; height: 18px; border-radius: 9px; background: rgba(127,127,127,.35); transition: background .15s; }
.cfx-sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.4); transition: transform .15s; }
.cfx-opt[aria-checked="true"] .cfx-sw { background: var(--c); }
.cfx-opt[aria-checked="true"] .cfx-sw::after { transform: translateX(12px); }
.cfx-presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 8px 4px; }
.cfx-pre { all: unset; box-sizing: border-box; cursor: pointer; text-align: center; }
.cfx-dot { width: 34px; height: 34px; margin: 0 auto 3px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(127,127,127,.35); transition: transform .12s; }
.cfx-pre:hover .cfx-dot { transform: scale(1.1); }
.cfx-pre.on .cfx-dot { box-shadow: 0 0 0 2px var(--c); }
.cfx-pre span { display: block; font-size: 9px; line-height: 1.15; opacity: .6; }
.cfx-sl { position: relative; height: 34px; cursor: pointer; touch-action: none; outline: none; }
.cfx-sl-track { position: absolute; left: 0; right: 0; top: 14px; height: 6px; border-radius: 3px; background: rgba(127,127,127,.28); }
.cfx-sl-fill { position: absolute; left: 0; top: 14px; height: 6px; border-radius: 3px; background: linear-gradient(90deg, var(--a), var(--c)); box-shadow: 0 0 10px var(--c); }
.cfx-sl-thumb { position: absolute; top: 7px; width: 20px; height: 20px; margin-left: -10px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px var(--c), 0 3px 10px rgba(0,0,0,.45); transition: transform .1s; }
.cfx-sl:hover .cfx-sl-thumb, .cfx-sl:focus .cfx-sl-thumb { transform: scale(1.12); }
.cfx-ticks { display: flex; justify-content: space-between; font-size: 10.5px; opacity: .55; margin-top: 2px; }
.cfx-readout { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
.cfx-big { font-size: 26px; font-weight: 650; font-variant-numeric: tabular-nums; }
.cfx-mode { font-size: 12px; opacity: .65; }
.cfx-orb { height: 90px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: rgba(127,127,127,.12); border: 1px solid rgba(127,127,127,.2); overflow: hidden; }
.cfx-orb i { display: block; width: 3px; height: 30px; border-radius: 2px; background: var(--c); transition: box-shadow .12s; }
.cfx-foot { display: flex; justify-content: space-between; margin-top: 16px; }
.cfx-btn { all: unset; cursor: pointer; padding: 6px 14px; border-radius: 9px; border: 1px solid rgba(127,127,127,.4); font-size: 12.5px; }
.cfx-btn:hover { background: rgba(127,127,127,.16); }
.cfx-btn.primary { background: var(--c); color: #111; border-color: transparent; font-weight: 600; }
.cfx-block { position: fixed; pointer-events: none; z-index: 499; box-sizing: border-box; border-radius: 2px; animation: cfx-blockblink 1.1s steps(1) .6s infinite; }
@keyframes cfx-blockblink { 50% { opacity: .3; } }
body.cfx-caret-off div.listview-caret-self, body.cfx-caret-off .cfx-block { opacity: 0 !important; animation: none !important; transition: none !important; }
`;

// =====================================================================================
// EFFECT REGISTRY
//
// HOW TO ADD AN EFFECT
//   EFFECTS.myfx = { id, label, mode, defaults, blend, onMove, draw, preview, ... };
//   - mode 'always': runs whenever cfg[id] is true (toggle command generated; toggleable:false = always on).
//     mode 'signature': runs when cfg.fx === id; needs preset { name, color, accent } for the dialog's Special grid.
//   - defaults: extra config keys, merged into DEFAULTS automatically.
//     defaultOn: false keeps an 'always' effect off until it is toggled (new effects should not change a look that exists).
//   - onMove(plugin, prev, cur, info): after the caret moved; info = { typed, dist, dx, dy, now }.
//     Push items onto plugin.items as { effect: id, t0, dur, ...own fields } (dur: Infinity for long-lived ones).
//   - onSample(plugin, cur, info): after every look at the caret, moved or not, with cur null when there is no caret;
//     info = { typed, moved, now }. For effects that watch the text (what was typed, what is bracketed).
//   - onKey(plugin, e, now): on a keydown in the editor, before the editor has acted on it (the DOM is still as it was).
//   - onPulse(plugin, rect, now): optional; a gentle "show the current look" trigger (theme/config change).
//   - draw(plugin, ctx, item, p, k, now, dt): p = progress 0..1, k = intensity, dt = ms since last frame.
//     Items are removed when p >= 1 or item.done = true. blend: 'lighter' | 'source-over' (set by the core).
//     A still item (item.rest = true) is redrawn whenever a frame runs but does not ask for frames of its own.
//   - preview(plugin, pv, caret, now): optional; spawn demo items into pv.items for the dialog preview.
//   - Effects that keep state or take over the caret: plugin.state(id) is their state bag, plugin.ensureItem(id) their one
//     long-lived item, plugin.hideCaret(id, on) hides Thymer's caret while they draw their own. keepsState: true has the
//     core drop all three when the effect is switched off or the plugin unloads.
// =====================================================================================
const EFFECTS = {};

// ---- Bolt drawing shared by the Lightning effect (small zaps and the line-change bolt) ----
// Jagged polyline with forks, flashes hard then fades to a glow.
function drawBolt(plugin, ctx, { from, to, seed, small }, p, k) {
	const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
	const b = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
	const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
	const nx = -dy / len, ny = dx / len, SEG = small ? 7 : 12, JAG = small ? 0.2 : 0.085;
	const pt = (t, s) => {
		const node = Math.floor(t * SEG + 0.5);
		const off = (hash(node * 17.17 + s) * 2 - 1) * len * JAG * Math.sin(Math.PI * t);
		return { x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off };
	};
	const flash = Math.pow(1 - p, 2) * (0.82 + 0.18 * Math.sin(p * 95 + seed)) * Math.min(k, 1.6);

	const stroke = (pts, width, color) => {
		ctx.beginPath();
		pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
		ctx.lineWidth = width;
		ctx.strokeStyle = color;
		ctx.lineJoin = 'round';
		ctx.stroke();
	};
	const main = [];
	for (let i = 0; i <= SEG; i++) main.push(pt(i / SEG, seed));
	const forks = [];
	for (let i = 0; i < 3; i++) {
		const root = pt(0.28 + i * 0.22, seed);
		const side = hash(seed + i * 41) < 0.5 ? -1 : 1;
		const reach = len * (0.055 + 0.035 * hash(seed + i * 53));
		const tip = { x: root.x + nx * side * reach + (dx / len) * reach * (hash(seed + i * 67) - 0.35), y: root.y + ny * side * reach + (dy / len) * reach * (hash(seed + i * 67) - 0.35) };
		const el = { x: (root.x + tip.x) / 2 - nx * side * reach * 0.2, y: (root.y + tip.y) / 2 - ny * side * reach * 0.2 };
		forks.push([root, el, tip]);
	}

	ctx.shadowColor = rgba(plugin.acc(), flash);
	ctx.shadowBlur = 14 * k;
	stroke(main, 5 * k, rgba(plugin.acc(), 0.35 * flash));
	forks.forEach((f) => stroke(f, 3.5 * k, rgba(plugin.acc(), 0.25 * flash)));
	ctx.shadowBlur = 0;
	stroke(main, 1.4, rgba(plugin.col(), flash));
	forks.forEach((f) => stroke(f, 1, rgba(plugin.col(), 0.8 * flash)));
}

// ---- Effect: Glow ----------------------------------------------------------------------
EFFECTS.glow = {
	id: 'glow', label: 'Glow', mode: 'always', toggleable: false, defaults: {}, blend: 'lighter',
	onMove(plugin, prev, cur, info) {
		if (!info.typed) return;
		plugin.items = plugin.items.filter((i) => i.effect !== 'glow');
		plugin.items.push({ effect: 'glow', t0: info.now, dur: 420 });
	},
	onPulse(plugin, rect, now) {
		plugin.items.push({ effect: 'glow', t0: now, dur: 420 });
	},
	draw(plugin, ctx, item, p, k) {
		const rect = plugin.last;
		if (!rect) return;
		const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
		const r = rect.h * (0.9 + p * 1.6) * k;
		const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
		const a = (1 - p) * (1 - p) * 0.55 * Math.min(k, 1.5);
		g.addColorStop(0, rgba(plugin.col(), a));
		g.addColorStop(0.45, rgba(plugin.acc(), a * 0.35));
		g.addColorStop(1, rgba(plugin.acc(), 0));
		ctx.fillStyle = g;
		ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
	},
};

// ---- Effect: Bounce (neovide-ish hop: a caret-sized ghost jumps up and settles with a damped spring) ----
EFFECTS.bounce = {
	id: 'bounce', label: 'Bounce', mode: 'always', defaults: {}, blend: 'lighter',
	onMove(plugin, prev, cur, info) {
		if (!info.typed) return;
		plugin.items = plugin.items.filter((i) => i.effect !== 'bounce');
		plugin.items.push({ effect: 'bounce', t0: info.now, dur: 260 });
	},
	draw(plugin, ctx, item, p, k) {
		const rect = plugin.last;
		if (!rect) return;
		const spring = Math.exp(-4 * p) * Math.sin(p * Math.PI * 2.5); // starts at the caret, no ghost
		const lift = -rect.h * 0.42 * k * spring;
		const stretch = 1 + 0.35 * spring * k;
		const a = (1 - p) * 0.75 * Math.min(1, Math.abs(spring) * 3);
		ctx.fillStyle = rgba(plugin.col(), a);
		ctx.shadowColor = rgba(plugin.col(), a);
		ctx.shadowBlur = 10 * k;
		ctx.fillRect(rect.x - 0.5, rect.y + lift - (rect.h * (stretch - 1)) / 2, rect.w + 1, rect.h * stretch);
		ctx.shadowBlur = 0;
	},
};

// ---- Effect: Trail (blaze: parallelogram swept between the previous and current caret, shrinking toward the new position) ----
EFFECTS.trail = {
	id: 'trail', label: 'Trail', mode: 'always',
	defaults: { trailMinWidths: 1.5 },   // trail appears for jumps farther than this many caret-heights
	blend: 'lighter',
	onMove(plugin, prev, cur, info) {
		const far = info.dist > cur.h * plugin.cfg.trailMinWidths;
		if (!(far || info.typed)) return;
		// Every typed character leaves its own short streak; long jumps get the full blaze.
		plugin.items.push({ effect: 'trail', t0: info.now, dur: far ? 500 : 420, from: prev, to: cur });
	},
	draw(plugin, ctx, { from, to }, p, k) {
		const e = Math.pow(1 - p, 3); // ease out
		const sx = to.x + (from.x - to.x) * e, sy = to.y + (from.y - to.y) * e;
		const w = 3;
		ctx.beginPath();
		ctx.moveTo(to.x, to.y);
		ctx.lineTo(to.x + w, to.y);
		ctx.lineTo(sx + w, sy);
		ctx.lineTo(sx, sy);
		ctx.lineTo(sx, sy + from.h);
		ctx.lineTo(sx + w, sy + from.h);
		ctx.lineTo(to.x + w, to.y + to.h);
		ctx.lineTo(to.x, to.y + to.h);
		ctx.closePath();
		const g = ctx.createLinearGradient(to.x, to.y, sx, sy);
		g.addColorStop(0, rgba(plugin.col(), 0.85 * (1 - p) * Math.min(k, 1.5)));
		g.addColorStop(1, rgba(plugin.acc(), 0.0));
		ctx.fillStyle = g;
		ctx.shadowColor = rgba(plugin.acc(), 0.8 * (1 - p));
		ctx.shadowBlur = 12 * k;
		ctx.fill();
		ctx.shadowBlur = 0;
	},
};

// ---- Effect: Lightning (signature) -------------------------------------------------------
// Rare short crackles jump off the caret while typing; a big bolt is drawn when the caret changes line.
const spawnZaps = (host, r, force, now) => {
	const cx = r.x + r.w / 2, cy = r.y + r.h / 2, k = Math.min(host.cfg.intensity, 1.6);
	// Rare while typing so it stays a spark, not a storm.
	if (!force && now - (host.lastZap || 0) < 220) return;
	if (!force && Math.random() > 0.3) return;
	host.lastZap = now;
	const n = force ? 2 : 1;
	for (let i = 0; i < n; i++) {
		const a = Math.random() * Math.PI * 2, len = (r.h * 0.8 + Math.random() * r.h * 1.3) * k;
		host.items.push({
			effect: 'lightning', t0: now, dur: 150 + Math.random() * 90,
			from: { x: cx, y: cy + (Math.random() - 0.5) * r.h * 0.6, w: 0, h: 0 },
			to: { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len, w: 0, h: 0 },
			seed: Math.floor(now + i * 97) * 0.013, small: true,
		});
	}
};
EFFECTS.lightning = {
	id: 'lightning', label: 'Lightning', mode: 'signature',
	preset: { name: 'Lightning', color: '#d6ecff', accent: '#2f7bff' },
	defaults: { lightningMinLines: 0.8 }, // a bolt is drawn when the caret changes line (jump of this many caret-heights)
	blend: 'lighter',
	onMove(plugin, prev, cur, info) {
		if (info.typed) spawnZaps(plugin, cur, false, info.now);
		if (Math.abs(info.dy) >= cur.h * plugin.cfg.lightningMinLines) {
			plugin.items.push({ effect: 'lightning', t0: info.now, dur: 260, from: prev, to: cur, seed: Math.floor(info.now) * 0.013 });
		}
	},
	draw(plugin, ctx, item, p, k) { drawBolt(plugin, ctx, item, p, k); },
	preview(plugin, pv, caret, now) {
		if (now < (pv.zapNext || 0)) return;
		pv.zapNext = now + 600;
		spawnZaps(pv, caret, true, now);
	},
};

// ---- Falling petals / leaves (Sakura, Autumn, Paper) -------------------------------------
// One long-lived item per effect holds the particle array; physics run inside draw().
function makeParticleEffect(def) {
	const id = def.id, pd = def.particle;
	const spawn = (host, r, force, now) => {
		const k = Math.min(host.cfg.intensity, 1.6);
		// Roughly one in three keystrokes drops a single petal or leaf.
		const n = force || Math.random() < 0.18 + 0.12 * k ? 1 : 0;
		if (!n) return;
		let item = host.items.find((i) => i.effect === id && !i.done);
		if (!item) { item = { effect: id, t0: now, dur: Infinity, parts: [] }; host.items.push(item); }
		for (let i = 0; i < n && item.parts.length < 40; i++) {
			item.parts.push({
				def: pd, tone: pd.tones[Math.floor(Math.random() * pd.tones.length)],
				x: r.x + (Math.random() - 0.5) * 6, y: r.y + r.h * (0.15 + Math.random() * 0.5),
				vx: (Math.random() - 0.25) * 0.09, vy: -0.05 - Math.random() * 0.1,   // px/ms, pops up a little first
				size: (pd.size[0] + Math.random() * (pd.size[1] - pd.size[0])) * (0.8 + 0.25 * k),
				rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.006,
				flip: Math.random() * 6, flipSpd: 0.004 + Math.random() * 0.005,       // flutter: turns edge-on
				phase: Math.random() * 6.28, sway: (0.00022 + Math.random() * 0.00022) * pd.sway,
				t0: now, life: 1700 + Math.random() * 1500,
			});
		}
	};
	return {
		id, label: def.label, mode: 'signature', preset: def.preset, defaults: {}, blend: 'source-over',
		onMove(plugin, prev, cur, info) { if (info.typed) spawn(plugin, cur, false, info.now); },
		draw(plugin, ctx, item, p, k, now, dt) {
			item.parts = item.parts.filter((q) => now - q.t0 < q.life && q.y < window.innerHeight + 20);
			if (!item.parts.length) { item.done = true; return; }
			for (const q of item.parts) {
				const age = (now - q.t0) / q.life, s = q.size, [a, b] = q.tone;
				q.vy = Math.min(q.vy + 0.00016 * dt, q.def.fall);   // gravity, capped so they float down
				q.vx += Math.sin(now * q.sway + q.phase) * 0.00005 * dt * q.def.sway;
				q.vx *= 0.995;
				q.x += q.vx * dt; q.y += q.vy * dt;
				q.rot += q.spin * dt; q.flip += q.flipSpd * dt;
				ctx.save();
				ctx.translate(q.x, q.y);
				ctx.rotate(q.rot);
				ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(q.flip)));
				ctx.globalAlpha = (age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3) * 0.95;
				const g = ctx.createLinearGradient(0, s, 0, -s);
				g.addColorStop(0, b); g.addColorStop(1, a);
				ctx.fillStyle = g; ctx.strokeStyle = b;
				ctx.beginPath();
				if (q.def.shape === 'petal') {                     // heart-shaped sakura petal, notch at the tip
					ctx.moveTo(0, -s * 0.65);
					ctx.bezierCurveTo(s * 0.55, -s * 1.35, s * 1.15, -s * 0.1, 0, s);
					ctx.bezierCurveTo(-s * 1.15, -s * 0.1, -s * 0.55, -s * 1.35, 0, -s * 0.65);
					ctx.fill();
				} else if (q.def.shape === 'leaf') {              // pointed leaf with a vein
					ctx.moveTo(0, -s * 1.15);
					ctx.quadraticCurveTo(s * 1.0, -s * 0.15, 0, s * 1.15);
					ctx.quadraticCurveTo(-s * 1.0, -s * 0.15, 0, -s * 1.15);
					ctx.fill();
					ctx.beginPath(); ctx.moveTo(0, -s * 1.05); ctx.lineTo(0, s * 1.3);
					ctx.strokeStyle = 'rgba(60,20,0,.35)'; ctx.lineWidth = 0.9; ctx.stroke();
				}
				ctx.restore();
			}
			ctx.globalAlpha = 1;
		},
		preview(plugin, pv, caret, now) {
			if (now < (pv.partNext || 0)) return;
			pv.partNext = now + 750;
			spawn(pv, caret, true, now);
		},
	};
}

// ---- Effect: Sakura (signature) ----
EFFECTS.sakura = makeParticleEffect({
	id: 'sakura', label: 'Sakura', preset: { name: 'Sakura', color: '#ffc2d4', accent: '#ff7aa2' },
	particle: { shape: 'petal', size: [4.5, 9], tones: [['#ffd9e3', '#ffa8c0'], ['#ffc4d4', '#ff8fb0'], ['#fff0f4', '#ffb7cb'], ['#ffb3c8', '#ff7aa2']], fall: 0.055, sway: 1 },
});

// ---- Effect: Autumn (signature) ----
EFFECTS.autumn = makeParticleEffect({
	id: 'autumn', label: 'Autumn', preset: { name: 'Autumn', color: '#ff9a3c', accent: '#c2410c' },
	particle: { shape: 'leaf', size: [6, 11], tones: [['#ffb347', '#e8590c'], ['#ff8c1a', '#c2410c'], ['#f2c14e', '#d9822b'], ['#e0562b', '#a32d0e']], fall: 0.075, sway: 1.6 },
});

// ---- Effect: Paper (signature) ----
EFFECTS.paper = makeParticleEffect({
	id: 'paper', label: 'Paper', preset: { name: 'Paper', color: '#e8dcc0', accent: '#5f9e4c' },
	particle: { shape: 'leaf', size: [6, 11], tones: [['#8fd18f', '#2e7d32'], ['#b5e2a8', '#43a047'], ['#6fbf73', '#1b5e20'], ['#a5d6a7', '#388e3c']], fall: 0.06, sway: 1.2 },
});

// ---- Ported from Cursor-Smith: Motion smear, Fresh ink, Bracket tether, Back-man ------------------------------------
// By Sadsnake1, MIT License; see THIRD-PARTY NOTICE at the top of this file. All four are off until switched on
// (command palette: "Caret FX: toggle ..."), and their settings live in this plugin's configuration under "custom".

/** The caret as an effect that stands in for it must match it: the block cursor's box, or the width of Thymer's own line caret. */
function caretBox(plugin) {
	const r = plugin.last;
	return r && { x: r.x, y: r.y, w: plugin.cfg.style === 'block' ? r.w : r.lw, h: r.h, cw: r.cw };
}

/**
 * Fills and rings the current path the way the block cursor is drawn (.cfx-block): a tint, a 1.5 px ring and a soft
 * glow. `fill` and `ring` are 0..1 strengths; a Line caret is all fill and no ring.
 */
function paintCaretBody(ctx, col, fill, ring) {
	if (fill > 0) {
		ctx.shadowColor = rgba(col, 0.45 * ring);
		ctx.shadowBlur = 8 * ring;
		ctx.fillStyle = rgba(col, fill);
		ctx.fill();
		ctx.shadowBlur = 0;
	}
	if (ring > 0) {
		ctx.lineWidth = 1.5;
		ctx.lineJoin = 'round';
		ctx.strokeStyle = rgba(col, ring);
		ctx.stroke();
	}
}

// ---- Effect: Motion smear ------------------------------------------------------------------------------------------
// From Cursor-Smith's src/paint/paint-smear.ts. The caret stretches as it moves and snaps back when it arrives. It is
// drawn as a quad whose four corners are blends of two tracked points: a leading point on a spring (it may overshoot
// and snap back, which is the feel) and a trailing point that lags behind it (an approach with no velocity of its own,
// so it can neither rotate nor boomerang). Whichever face of the caret trails the move is decided by the area each
// face sweeps, so the shape is a parallelogram in every frame. While it moves, Thymer's caret (or the block cursor) is
// hidden and the quad is drawn in its place; when it has arrived, the real caret is shown again.
// Not ported: Tapered trail, Max length and Conserve area, which Cursor-Smith leaves off by default.
// Settings: smearStiffness (the leading point), smearTrailingStiffness, smearDamping, each 0..1.
const SMEAR_MAX_STEP = 1 / 240;     // s: the spring is integrated in steps this small, so every frame rate swings alike
const SMEAR_SETTLE_V = 30;          // px/s: slower than this and within half a pixel of the caret, the smear has arrived
const SMEAR_KEY_STEP_CHARS = 2.5;   // a move along the row by at most this many letters is the keyboard's (typing, an arrow)...
const SMEAR_KEY_STEP_MS = 200;      // ...and for this long after one the leading edge sits on the caret: only the tail trails
const SMEAR_LINE_CHANGE = 0.6;      // a move to another line, by more than this share of a line, is not smeared (it would streak through the text between)

/**
 * One frame of the smear toward `rect` ({ x, y, w, h }), `dt` seconds on. `s` holds the two points, the centre the
 * caret had a frame ago and the direction of travel, held after the caret stops so the tail keeps pointing back the way
 * it came. `pinned` puts the leading point on the caret. Returns the corners (top-left, top-right, bottom-right,
 * bottom-left) and whether they are still on their way.
 */
function stepSmear(s, rect, dt, cfg, pinned) {
	const { lead, trail } = s;
	const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
	const dx = cx - s.cx, dy = cy - s.cy, len = Math.hypot(dx, dy);
	if (len > 0.01) s.dir = { x: dx / len, y: dy / len };
	s.cx = cx; s.cy = cy;

	const freqLead = 2 + clamp01(cfg.smearStiffness) * 38;
	const freqTrail = 2 + clamp01(cfg.smearTrailingStiffness) * 38;
	const damping = 0.15 + clamp01(cfg.smearDamping) * 1.15;
	if (pinned) { lead.x = rect.x; lead.y = rect.y; lead.vx = lead.vy = 0; }
	const steps = Math.max(1, Math.min(16, Math.ceil(dt / SMEAR_MAX_STEP))), h = dt / steps;
	const k = freqLead * freqLead, damp = 2 * damping * freqLead, f = 1 - Math.exp(-freqTrail * h);
	for (let i = 0; i < steps; i++) {
		lead.vx += (k * (rect.x - lead.x) - damp * lead.vx) * h;
		lead.vy += (k * (rect.y - lead.y) - damp * lead.vy) * h;
		lead.x += lead.vx * h;
		lead.y += lead.vy * h;
		trail.x += (lead.x - trail.x) * f;
		trail.y += (lead.y - trail.y) * f;
	}
	if (![lead.x, lead.y, lead.vx, lead.vy, trail.x, trail.y].every(Number.isFinite)) {
		lead.x = trail.x = rect.x; lead.y = trail.y = rect.y; lead.vx = lead.vy = 0;
	}

	// The rear face of the caret trails and the front face leads. Which is which is the area each face sweeps - the
	// sides sweep h*|dx|, the top and bottom w*|dy| - blended by their share (to the fourth power, so one clearly
	// dominant axis wins outright), never by a branch: a branch is where the quad used to snap between two shapes.
	const dir = s.dir;
	const hx = (rect.h * (dir ? Math.abs(dir.x) : 0)) ** 4, wy = (rect.w * (dir ? Math.abs(dir.y) : 0)) ** 4;
	const u = hx + wy > 0 ? hx / (hx + wy) : 0.5;
	const sgnX = dir ? Math.sign(dir.x) : 0, sgnY = dir ? Math.sign(dir.y) : 0;
	const tvx = (lead.x - trail.x) * freqTrail, tvy = (lead.y - trail.y) * freqTrail;   // the trailing point's speed
	let moving = false;
	const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([fx, fy]) => {
		const ox = fx * rect.w, oy = fy * rect.h;
		const front = dir ? (ox > 0 ? 1 : -1) * sgnX * u + (oy > 0 ? 1 : -1) * sgnY * (1 - u) : 0;   // +1 front face .. -1 rear face
		const lag = (1 - front) / 2;                                                                  // 0 at the leading point .. 1 at the trailing one
		const vx = lead.vx + (tvx - lead.vx) * lag, vy = lead.vy + (tvy - lead.vy) * lag;
		const c = { x: lead.x + (trail.x - lead.x) * lag + ox, y: lead.y + (trail.y - lead.y) * lag + oy };
		if (Math.abs(c.x - rect.x - ox) > 0.5 || Math.abs(c.y - rect.y - oy) > 0.5 || Math.abs(vx) > SMEAR_SETTLE_V || Math.abs(vy) > SMEAR_SETTLE_V) moving = true;
		return c;
	});
	if (moving) return { corners, moving };
	// Arrived: onto the caret exactly, with no velocity left to creep back into motion.
	lead.x = trail.x = rect.x; lead.y = trail.y = rect.y; lead.vx = lead.vy = 0;
	return { corners: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([fx, fy]) => ({ x: rect.x + fx * rect.w, y: rect.y + fy * rect.h })), moving };
}

function finishSmear(plugin, item) {
	item.done = true;
	plugin.hideCaret('smear', false);
}

EFFECTS.smear = {
	id: 'smear', label: 'Motion smear', mode: 'always', defaultOn: false, keepsState: true, blend: 'source-over',
	defaults: { smearStiffness: 0.6, smearTrailingStiffness: 0.4, smearDamping: 0.8 },
	onMove(plugin, prev, cur, info) {
		if (backManBusy(plugin)) return;   // the creature has the caret
		const S = plugin.state('smear');
		const dx = Math.abs(cur.x - prev.x), dy = Math.abs(cur.y - prev.y);
		if (dy < 1 && dx > 0.5 && dx <= SMEAR_KEY_STEP_CHARS * cur.cw) S.stepT = info.now;
		if (dy > cur.h * SMEAR_LINE_CHANGE) {
			// Another line: the caret is simply there.
			if (S.lead) { S.lead = { x: cur.x, y: cur.y, vx: 0, vy: 0 }; S.trail = { x: cur.x, y: cur.y }; }
			return;
		}
		if (plugin.items.some((i) => i.effect === 'smear' && !i.done)) return;   // already under way: it chases the caret by itself
		S.lead = { x: prev.x, y: prev.y, vx: 0, vy: 0 };
		S.trail = { x: prev.x, y: prev.y };
		S.cx = prev.x + prev.w / 2; S.cy = prev.y + prev.h / 2; S.dir = null;
		plugin.items.push({ effect: 'smear', t0: info.now, dur: Infinity });
	},
	draw(plugin, ctx, item, p, k, now, dt) {
		const S = plugin.state('smear'), rect = caretBox(plugin);
		if (!rect || !S.lead || backManBusy(plugin)) return finishSmear(plugin, item);
		const { corners, moving } = stepSmear(S, rect, dt / 1000, plugin.cfg, now - (S.stepT || 0) < SMEAR_KEY_STEP_MS);
		if (!moving) return finishSmear(plugin, item);
		plugin.hideCaret('smear', true);   // hidden only in a frame that draws the quad, so the caret never blinks out between the two
		const block = plugin.cfg.style === 'block';
		ctx.save();
		ctx.beginPath();
		corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
		ctx.closePath();
		paintCaretBody(ctx, plugin.col(), block ? 0.42 : 1, block ? 1 : 0);
		ctx.restore();
	},
};

// ---- Effect: Fresh ink ---------------------------------------------------------------------------------------------
// From Cursor-Smith's src/effects/effects-ink.ts, where it is part of Typewriter. The characters just typed stay wet in
// the caret's color and dry into the text over a second or two. Each run of typing is one mark - where it starts in its
// line, its text and when each character went in - and every frame finds each character's own box again, so the ink
// stays on its letters through a wrap, a scroll or an edit before it. A mark whose text is no longer where it was is cut
// back to what is left of it (Backspace), looked for nearby (an edit before it) or dropped. The letters are drawn over the
// real ones, in the same font, on whole device pixels.
// Not ported: the gradient ramp and "Keep text color".
// Settings: inkMs (how long the ink takes to dry), inkStrength (0..1).
const INK_MAX_RUN = 12;     // an insertion longer than this is a paste or a completion, not typing
const INK_MAX_CHARS = 80;   // the most wet characters at once; the oldest go first
const INK_SEARCH = 64;      // how far a mark is looked for after an edit before it, in characters
const INK_HOLD = 0.3;       // the share of the drying time the ink stays fully wet before it fades

const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

/** How wet a character is `age` ms after it went in: fully for the first part of the drying time `ms`, then easing to dry. */
function inkWetness(age, ms) {
	const u = age / Math.max(1, ms);
	if (u >= 1) return 0;
	return u <= INK_HOLD ? 1 : 1 - easeInOutSine((u - INK_HOLD) / (1 - INK_HOLD));
}

/** Drops `n` code units from the front of a mark, never half a surrogate pair (the halves of an emoji dry together). */
function trimInkFront(m, n) {
	if (n > 0 && n < m.text.length) {
		const c = m.text.charCodeAt(n);
		if (c >= 0xdc00 && c <= 0xdfff) n++;
	}
	m.from += n;
	m.text = m.text.slice(n);
	m.times = m.times.slice(n);
}

const cutInk = (m, keep) => { m.text = m.text.slice(0, keep); m.times = m.times.slice(0, keep); };

/** Puts `text` typed at `at` in `line` among the marks: the run before it grows when it was typed on from there. */
function addInk(S, line, at, text, now) {
	const tail = S.marks[S.marks.length - 1];
	if (tail && tail.guid === line.guid && tail.from + tail.text.length === at) {
		tail.text += text;
		for (let i = 0; i < text.length; i++) tail.times.push(now);
	} else {
		S.marks.push({ guid: line.guid, row: line.row, from: at, text, times: new Array(text.length).fill(now) });
	}
	let total = 0;
	for (const m of S.marks) total += m.text.length;
	while (total > INK_MAX_CHARS && S.marks.length) {
		const m = S.marks[0];
		const cut = Math.min(m.text.length, total - INK_MAX_CHARS);
		trimInkFront(m, cut);
		total -= cut;
		if (!m.text.length) S.marks.shift();
	}
}

/**
 * Where a mark's text is now in `line` (`head` is the caret's place in it, or -1). True with m.from - and m.text,
 * cut back - brought up to date; false when it is gone.
 */
function locateInk(line, m, head) {
	const text = line.text, len = m.text.length;
	if (m.from + len <= text.length && text.slice(m.from, m.from + len) === m.text) return true;
	// Backspace: the run's end is gone and the caret sits where it now ends.
	const here = text.slice(m.from, Math.min(text.length, m.from + len));
	let k = 0;
	while (k < here.length && here.charCodeAt(k) === m.text.charCodeAt(k)) k++;
	if (k > 0 && head === m.from + k) { cutInk(m, k); return true; }
	// An edit before it moved it: the nearest copy of its text, if it is long enough to be itself rather than any letter nearby.
	if (len >= 2) {
		const lo = Math.max(0, m.from - INK_SEARCH);
		const win = text.slice(lo, Math.min(text.length, m.from + len + INK_SEARCH));
		let best = -1;
		for (let i = win.indexOf(m.text); i >= 0; i = win.indexOf(m.text, i + 1)) {
			if (best < 0 || Math.abs(lo + i - m.from) < Math.abs(lo + best - m.from)) best = i;
		}
		if (best >= 0) { m.from = lo + best; return true; }
	}
	// Its end rewritten under it (an input method committing the characters chosen): what still stands at its start stays wet.
	if (k > 0 && k < len) {
		const hi = m.text.charCodeAt(k - 1);
		if (hi >= 0xd800 && hi <= 0xdbff) k--;   // never half an emoji
	}
	if (k <= 0) return false;
	cutInk(m, k);
	return true;
}

EFFECTS.ink = {
	id: 'ink', label: 'Fresh ink', mode: 'signature', preset: { name: 'Fresh ink', color: '#6f9cff', accent: '#1d3fbf' }, keepsState: true, blend: 'source-over',
	defaults: { inkMs: 1500, inkStrength: 0.8 },
	// What was typed is what the caret's line gained since the last sample.
	onSample(plugin, cur, info) {
		const S = plugin.state('ink');
		if (!S.marks) S.marks = [];
		const cl = cur && caretLine(plugin);
		const before = S.base;
		S.base = cl ? { guid: cl.line.guid, text: cl.line.text } : null;
		S.head = cl ? { guid: cl.line.guid, idx: cl.idx } : null;
		if (!cl || !before || !info.typed || before.guid !== cl.line.guid) return;
		const edit = lineEdit(before.text, cl.line.text, cl.idx);
		if (!edit || !edit.inserted || edit.inserted.length > INK_MAX_RUN || edit.inserted.includes('\n')) return;
		addInk(S, cl.line, edit.at, edit.inserted, info.now);
		plugin.ensureItem('ink');
		plugin.kick();
	},
	draw(plugin, ctx, item, p, k, now) {
		const S = plugin.state('ink');
		const ms = Math.max(100, Math.min(10000, Number(plugin.cfg.inkMs) || 1500));
		const strength = clamp01(Number(plugin.cfg.inkStrength ?? 0.8));
		const dpr = window.devicePixelRatio || 1, snap = (v) => Math.round(v * dpr) / dpr;
		const lines = new Map(), styles = new Map(), metrics = new Map();   // per frame: a row's text, an element's font, a font's size
		const kept = [];
		ctx.save();
		ctx.fillStyle = plugin.col();
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		for (const m of S.marks || []) {
			if (!m.row.isConnected) m.row = rowByGuid(m.guid);
			if (!m.row) continue;
			let line = lines.get(m.row);
			if (!line) lines.set(m.row, (line = new LineText(m.row)));
			if (!locateInk(line, m, S.head && S.head.guid === m.guid ? S.head.idx : -1)) continue;
			let dry = 0;   // the dry front of the run goes: only wet letters are kept
			while (dry < m.times.length && now - m.times[dry] >= ms) dry++;
			if (dry) trimInkFront(m, dry);
			if (!m.text.length) continue;
			kept.push(m);
			let i = 0;
			for (const ch of m.text) {
				const at = m.from + i, a = strength * inkWetness(now - m.times[i], ms);
				i += ch.length;
				if (a <= 0 || !ch.trim()) continue;
				const r = line.charRect(at, ch.length);
				if (!r) continue;
				const host = line.styleHost(at);
				let st = styles.get(host);
				if (!st) {
					const cs = getComputedStyle(host);
					st = { font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, size: parseFloat(cs.fontSize) || 14 };
					styles.set(host, st);
				}
				ctx.font = st.font;
				let mt = metrics.get(st.font);
				if (!mt) {
					const t = ctx.measureText('M');
					mt = { ascent: t.fontBoundingBoxAscent ?? st.size * 0.8, descent: t.fontBoundingBoxDescent ?? st.size * 0.2 };
					metrics.set(st.font, mt);
				}
				ctx.globalAlpha = a;
				ctx.fillText(ch, snap(r.x), snap(r.y + mt.ascent + (r.h - mt.ascent - mt.descent) / 2));   // centred in the line box, like the browser's own baseline
			}
		}
		ctx.restore();
		S.marks = kept;
		if (!kept.length) item.done = true;
	},
};

// ---- Effect: Bracket tether ----------------------------------------------------------------------------------------
// From Cursor-Smith's src/paint/paint-tether.ts and src/util/text.ts. A line under the span between matching brackets
// or quotes: a bracket the caret touches wins over anything it merely sits inside; failing that, the innermost enclosing
// run wins, whichever of the quote or bracket candidates opens closest to the caret. Short ticks turn up at the opening
// and the closing end only, so a span that wraps is not claimed to end at every wrap point. Only for a collapsed caret:
// over a selection the line would fight the selection highlight.
// It is a plain depth count over one line's text, not a syntax-aware match, and decorative: nothing edits from it.
// Differences from Cursor-Smith: a Thymer line is its own block, so there are no blockquote markers or code fences to
// cut a span at, and angle brackets are left out (in notes "<" and ">" are comparisons far more often than tags).
// Settings: tetherStrength (0..1, the line's opacity).
const BRACKET_OPEN = { '(': ')', '[': ']', '{': '}' };
const BRACKET_CLOSE = { ')': '(', ']': '[', '}': '{' };
const QUOTE_CHARS = ['"', "'", '`'];   // backtick too: inline code behaves like a quoted run
// Curly quotes are directional - an opener is matched to its own nearest closer - unlike the straight ones, which pair left to right.
// U+201C to U+201D (double) and U+2018 to U+2019 (single).
const CURLY_QUOTE_OPEN = { '“': '”', '‘': '’' };
const TETHER_SCAN = 4000;   // how far, in characters, a match is looked for each way; bounds a pasted wall of text
const TETHER_DROP = 1.5;    // the line runs this far under the text, not through it
const TETHER_TICK = 4;      // the ticks at its two ends

const WORD_CHAR = /[\p{L}\p{N}_]/u;
// A quote between two word characters is an apostrophe ("don't", "rock'n'roll", "don’t"), not a delimiter: without this
// the apostrophes of two words would be paired and a line drawn across the sentence between them.
const isQuoteDelimiter = (text, i) => !(WORD_CHAR.test(text[i - 1] || '') && WORD_CHAR.test(text[i + 1] || ''));

/** The index of the bracket matching the one at `at`, or -1. */
function matchingBracket(text, at) {
	const ch = text[at];
	const open = BRACKET_OPEN[ch] ? ch : BRACKET_CLOSE[ch];
	if (!open) return -1;
	const close = BRACKET_OPEN[open];
	let depth = 0;
	if (ch === open) {
		for (let i = at, end = Math.min(text.length, at + TETHER_SCAN); i < end; i++) {
			if (text[i] === open) depth++;
			else if (text[i] === close && --depth === 0) return i;
		}
	} else {
		for (let i = at, end = Math.max(0, at - TETHER_SCAN); i >= end; i--) {
			if (text[i] === close) depth++;
			else if (text[i] === open && --depth === 0) return i;
		}
	}
	return -1;
}

/** The innermost bracket pair the caret at `pos` sits inside. Each bracket type is counted apart, so an unrelated "]" in the middle of a "(...)" does not derail it. */
function enclosingBracket(text, pos) {
	const depth = { ')': 0, ']': 0, '}': 0 };
	for (let i = Math.min(pos, text.length) - 1, stop = Math.max(0, pos - TETHER_SCAN); i >= stop; i--) {
		const c = text[i];
		if (BRACKET_CLOSE[c]) { depth[c]++; continue; }
		const closer = BRACKET_OPEN[c];
		if (!closer) continue;
		if (depth[closer] > 0) { depth[closer]--; continue; }
		const to = matchingBracket(text, i);
		return to >= 0 ? { from: i, to } : null;
	}
	return null;
}

/** The innermost quoted run that contains the caret at `pos` or touches it (parked just outside either quote counts). */
function quoteSpan(text, pos) {
	let best = null;
	const consider = (a, b) => {
		if (pos < a || pos > b + 1) return;
		if (!best || a > best.from) best = { from: a, to: b };
	};
	for (const q of QUOTE_CHARS) {
		const marks = [];
		for (let i = 0; i < text.length; i++) if (text[i] === q && isQuoteDelimiter(text, i)) marks.push(i);
		for (let i = 0; i + 1 < marks.length; i += 2) consider(marks[i], marks[i + 1]);
	}
	for (const openCh in CURLY_QUOTE_OPEN) {
		const closeCh = CURLY_QUOTE_OPEN[openCh];
		for (let i = 0; i < text.length; i++) {
			if (text[i] !== openCh) continue;
			let depth = 1;
			for (let j = i + 1; j < text.length; j++) {
				if (text[j] === openCh) depth++;
				else if (text[j] === closeCh && isQuoteDelimiter(text, j) && --depth === 0) { consider(i, j); break; }
			}
		}
	}
	return best;
}

/** What the tether joins, as { from, to } indexes of the two ends (the closer included), or null. */
function tetherSpan(lineText, pos) {
	// A window around the caret, so a pathological line cannot turn one sample into a megabyte read.
	const lo = Math.max(0, pos - TETHER_SCAN), text = lineText.slice(lo, pos + TETHER_SCAN), at0 = pos - lo;
	for (const at of [at0 - 1, at0]) {
		if (at < 0 || !(BRACKET_OPEN[text[at]] || BRACKET_CLOSE[text[at]])) continue;
		const m = matchingBracket(text, at);
		if (m >= 0) return { from: lo + Math.min(at, m), to: lo + Math.max(at, m) };
	}
	const q = quoteSpan(text, at0), b = enclosingBracket(text, at0);
	const best = q && b ? (q.from > b.from ? q : b) : q || b;
	return best && { from: lo + best.from, to: lo + best.to };
}

/**
 * The rules to draw under characters [from, to] of `line`: one per visual line the span covers, top to bottom, each
 * { left, right, bottom }. The text measures itself - a span that wraps comes back already split at its wrap points -
 * and the boxes of one baseline (a bold stretch, a link) are folded into a single rule rather than a dashed row.
 */
function tetherSegments(line, from, to) {
	const rows = [];
	for (const r of line.rects(from, to + 1)) {
		const bottom = r.y + r.h;
		const row = rows.find((o) => Math.abs(o.bottom - bottom) < 1.5);
		if (row) { row.left = Math.min(row.left, r.x); row.right = Math.max(row.right, r.x + r.w); }
		else rows.push({ left: r.x, right: r.x + r.w, bottom });
	}
	return rows.sort((a, b) => a.bottom - b.bottom || a.left - b.left);
}

EFFECTS.tether = {
	id: 'tether', label: 'Bracket tether', mode: 'signature', preset: { name: 'Bracket tether', color: '#e879f9', accent: '#86198f' }, keepsState: true, blend: 'source-over',
	defaults: { tetherStrength: 0.35 },
	onSample(plugin, cur) {
		const S = plugin.state('tether');
		const cl = cur && caretLine(plugin);
		// The scan depends only on where the caret is in what text, so it is kept while that holds; the coordinates are
		// measured every time, since scrolling and wrapping move them without moving the caret.
		let span = null;
		if (cl && cl.collapsed) {
			const key = cl.line.guid + ':' + cl.idx + ':' + cl.line.text;
			if (S.key !== key) { S.key = key; S.span = tetherSpan(cl.line.text, cl.idx); }
			span = S.span;
		}
		const segs = span ? tetherSegments(cl.line, span.from, span.to) : null;
		const sig = segs ? segs.map((s) => `${Math.round(s.left)},${Math.round(s.right)},${Math.round(s.bottom)}`).join('|') : '';
		if (sig === S.sig) return;
		S.sig = sig;
		S.segs = segs && segs.length ? segs : null;
		// A still item: it is redrawn whenever a frame runs, and asks for none of its own.
		if (S.segs) plugin.ensureItem('tether').rest = true;
		plugin.kick();
	},
	draw(plugin, ctx, item, p, k) {
		const segs = plugin.state('tether').segs;
		if (!segs) { item.done = true; return; }
		const alpha = clamp01(plugin.cfg.tetherStrength * Math.min(k, 1.5));
		let total = 0;
		for (const s of segs) total += s.right - s.left;
		if (alpha <= 0.01 || total < 2) return;   // the caret sits on its own match, an empty pair: nothing to underline
		ctx.save();
		ctx.lineWidth = 1.5;
		ctx.lineCap = 'round';
		ctx.strokeStyle = rgba(plugin.col(), alpha);
		ctx.beginPath();
		segs.forEach((s, i) => {
			const y = s.bottom + TETHER_DROP;
			ctx.moveTo(s.left, y);
			ctx.lineTo(s.right, y);
			if (i === 0) { ctx.moveTo(s.left, y); ctx.lineTo(s.left, y - TETHER_TICK); }
			if (i === segs.length - 1) { ctx.moveTo(s.right, y); ctx.lineTo(s.right, y - TETHER_TICK); }
		});
		ctx.stroke();
		ctx.restore();
	},
};

// ---- Effect: Back-man ----------------------------------------------------------------------------------------------
// From Cursor-Smith's src/effects/effects-backman.ts, effects-eaters.ts and effects-delete.ts. While Backspace or Delete
// eats text, the caret is a little creature: the caret's box with a soft-lipped mouth on the side it eats from (left for
// Backspace, right for Delete) and a big square eye with a tiny glint. It takes one bite per letter - the letter slides
// into the open mouth and shrinks away as the jaws shut - then gulps (the front swells, then the back) with a happy
// squint. Letters coming faster than it chews (a held key) are chewed at its own steady pace, about seven bites a
// second; a word or a selection is one big bite, slower, with a bigger gulp. Its head and its feet (the box's top and
// bottom edges) never change; its sides bend in a V toward where it is going, on a spring each bite kicks and that eases
// back when the bites stop. A Line caret morphs into the box first, and back when the creature is done.
//
// What a deletion took is not known to a Thymer plugin (there is no document model), so it is worked out from the DOM:
// the line's text, and where its letters are drawn, are read when the key goes down and compared with the line after the
// edit (Cursor-Smith kept the previous document and read the letters back from it the same way). A change that is not
// exactly a deletion at the caret reads as nothing, and nothing is eaten.
// Not ported: Cursor-Smith's letter effects for what the creature has eaten (Burst, Evaporate), which Caret FX has no
// counterpart for.
const BACKMAN_CHOMP_MS = 140;        // one bite, the mouth open and shut: a held key's pace, about seven a second
const BACKMAN_GULP_MS = 220;         // the gulp after the last bite...
const BACKMAN_GULP_FROM = 0.6;       // ...from this share of a chomp in (the jaws closing)
const BACKMAN_SQUINT_MS = 420;       // the happy squint, from the gulp on: quick to shut, held, slow to open - outlasting the gulp
const BACKMAN_SQUINT_SHUT = 0.2, BACKMAN_SQUINT_HELD = 0.5;   // its shares: shutting, then held shut
const BACKMAN_GROW = 0.18;           // how far the gulp swells it, in box widths a side at the middle
const BACKMAN_BIG = { chomp: 1.5, gulp: 1.4, grow: 1.9, kick: 1.6 };   // a big bite (a word, a selection) against a letter's
const BACKMAN_BEND_HZ = 6;           // the bend's spring: its frequency...
const BACKMAN_BEND_DAMPING = 0.62;   // ...its damping ratio (a hair past straight on the way back, then still)...
const BACKMAN_BEND_KICK = 26;        // ...the kick a bite gives it, in box widths a second...
const BACKMAN_BEND_MAX = 0.6;        // ...and the most it bends, in box widths at the middle
const BACKMAN_SLIDE_MS = 70;         // how long a letter takes to slide into the mouth, at most: on a held key the letters it has bitten must not lag out of its back
const BACKMAN_MEAL_MAX = 12;         // the most letters one deletion feeds it
const BACKMAN_READ_MAX = 40;         // a deletion longer than this is a selection wiped, not writing undone: its letters are not laid out one by one
const BACKMAN_WATCH_MS = 300;        // how long after a key the line is watched for the deletion it made
const BACKMAN_MORPH_IN_MS = 90;      // a Line caret becoming the box: fast, so it answers the key at once...
const BACKMAN_MORPH_OUT_MS = 160;    // ...and becoming the Line again, with a little overshoot

const hump = (g, a, b) => (g > a && g < b ? Math.sin((Math.PI * (g - a)) / (b - a)) : 0);   // a bump from 0 to 1 and back over [a, b] of g, 0 outside
const smoothStep = (x) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };   // out with a little overshoot, back to rest

/** The squint `q` of its way through (0..1): shutting, held shut, opening. */
const squintAt = (q) => q <= 0 || q >= 1 ? 0
	: q < BACKMAN_SQUINT_SHUT ? smoothStep(q / BACKMAN_SQUINT_SHUT)
	: q < BACKMAN_SQUINT_SHUT + BACKMAN_SQUINT_HELD ? 1
	: smoothStep((1 - q) / (1 - BACKMAN_SQUINT_SHUT - BACKMAN_SQUINT_HELD));

/** The eye as shown, eased toward the squint over `dt` ms: shutting fast, opening slowly, so quick bites do not flick it open and shut between them. */
function backManEyeEase(cur, target, dt) {
	const next = target + (cur - target) * Math.exp(-Math.max(0, dt) / (target > cur ? 30 : 80));
	return Math.abs(next - target) < 0.005 ? target : next;
}

/**
 * The chewing `tn` ms into a run that began with a key, its last key `tk` ms in (0: one key). The mouth chomps at its
 * own pace, one chomp after another while keys keep coming, and finishes the chomp the last key fell in (one key, one
 * chomp; a held key, about seven a second, never a flicker of half bites). Then the gulp's swell - the front first, then
 * the back, as it goes down - and the squint that goes with it. `end`: when the last chomp shuts; `done`: the gulp and
 * the squint are over.
 */
function backManBite(tn, tk = 0, big = false) {
	const ch = BACKMAN_CHOMP_MS * (big ? BACKMAN_BIG.chomp : 1);
	const gulp = BACKMAN_GULP_MS * (big ? BACKMAN_BIG.gulp : 1);
	const grow = BACKMAN_GROW * (big ? BACKMAN_BIG.grow : 1);
	const end = Math.max(1, Math.ceil((Math.max(0, tk) + ch) / ch)) * ch;
	const open = tn >= 0 && tn < end ? Math.sin((Math.PI * (tn % ch)) / ch) : 0;
	const from = tn - (end - ch) - BACKMAN_GULP_FROM * ch;
	const g = from / gulp, q = from / (BACKMAN_SQUINT_MS * (big ? BACKMAN_BIG.gulp : 1));
	return { open, front: grow * hump(g, 0, 0.55), back: grow * hump(g, 0.35, 1), squint: squintAt(q), g, end, done: g >= 1 && q >= 1 };
}

/** A key at `now` on a run of chewing `c` (or none): a new run when there is none, when its last chomp has shut, or for a big bite; else the same run with this key its latest. */
function backManChew(c, now, big) {
	if (!c || big || now - c.c0 >= backManBite(0, c.t - c.c0, c.big).end) return { c0: now, t: now, big };
	return { c0: c.c0, t: now, big: c.big };
}

/** When a letter that set off at `now` is down: at the end of the chomp in progress, or of the next when this one is nearly shut. */
function backManDown(c, now) {
	const ch = BACKMAN_CHOMP_MS * (c.big ? BACKMAN_BIG.chomp : 1);
	return c.c0 + Math.ceil((now - c.c0 + 0.4 * ch) / ch) * ch;
}

/** The bend's spring from `s` over dt seconds (at most two: a longer gap - a window in the background - is long settled anyway), in small steps so any frame rate gives the same swing; held at BACKMAN_BEND_MAX. */
function backManSpring(s, dt) {
	const w = 2 * Math.PI * BACKMAN_BEND_HZ;
	dt = Math.max(0, Math.min(2, dt));
	const steps = Math.max(1, Math.ceil(dt * 480)), h = dt / steps;
	for (let i = 0; i < steps; i++) {
		s.v += (-w * w * s.bend - 2 * BACKMAN_BEND_DAMPING * w * s.v) * h;
		s.bend += s.v * h;
		if (Math.abs(s.bend) > BACKMAN_BEND_MAX) {
			s.bend = Math.sign(s.bend) * BACKMAN_BEND_MAX;
			if (s.v * s.bend > 0) s.v = 0;
		}
	}
}

/**
 * The creature's outline in a unit box (0..1 across, 0..1 down), facing right (dir 1) or left (dir -1): the box with a
 * V bitten into the front at its middle, as deep as the mouth is open (shut, the jaws meet). The four corners stay where
 * the box's are - its head and feet never change; the sides bend: every other point is pushed `bend` box widths sideways
 * (+ is right) times how near the middle it is, so each side is a V from its middle, and the front and the back swell out
 * by `front` and `back` the same way. Eight points: the head's two corners, the upper lip, the mouth's corner, the lower
 * lip, the feet's two corners, the back's middle.
 */
function backManShape(open, dir, bend = 0, front = 0, back = front) {
	const o = clamp01(open);
	const jaw = 0.36 * o, depth = 0.78 * o;
	const right = [   // facing right; the third entry marks the front's points
		[0, 0, false], [1, 0, true],
		[1, 0.5 - jaw, true], [1 - depth, 0.5, true], [1, 0.5 + jaw, true],
		[1, 1, true], [0, 1, false], [0, 0.5, false],
	];
	const f = dir >= 0 ? 1 : -1;
	return right.map(([x, y, isFront]) => {
		const mid = 1 - Math.abs(2 * y - 1);
		const sx = f > 0 ? x : 1 - x;
		return [sx + (bend + (isFront ? f * front : -f * back)) * mid, y];
	});
}

/**
 * The outline as a path in a w x h box - ["M", x, y], ["L", x, y], ["Q", cx, cy, x, y], ["Z"] - its lips soft: each lip
 * and the mouth's corner rounded (a curve through the corner), more the wider the mouth; the head's and feet's corners
 * as the box's, square or rounded by `corner` px.
 */
function backManOutline(body, open, w, h, corner = 0) {
	const jaw = 0.36 * clamp01(open) * h;
	const c = Math.max(0, corner);
	const radius = [c, c, Math.min(0.24 * w, 0.5 * jaw), Math.min(0.14 * w, 0.3 * jaw), Math.min(0.24 * w, 0.5 * jaw), c, c, 0];
	const pts = body.map(([x, y]) => [x * w, y * h]);
	const n = pts.length;
	const out = [['M', (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]];   // from halfway along the head, so its first corner can be rounded too
	for (let k = 1; k <= n; k++) {
		const i = k % n;
		const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
		const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
		const d = Math.min(radius[i], la / 2, lb / 2);
		if (d < 0.05) { out.push(['L', p[0], p[1]]); continue; }
		out.push(['L', p[0] + ((a[0] - p[0]) / la) * d, p[1] + ((a[1] - p[1]) / la) * d]);
		out.push(['Q', p[0], p[1], p[0] + ((b[0] - p[0]) / lb) * d, p[1] + ((b[1] - p[1]) / lb) * d]);
	}
	out.push(['Z']);
	return out;
}

/**
 * Its eye in a w x h box, px from the top left, as polygons: a big square up at the top, its front edge seven tenths of
 * the way to the front - just clear of the upper lip with the mouth wide open - moved with the bend; a tiny square glint
 * in its upper front corner. As it squints (the gulp) it narrows from top and bottom, and past halfway it is a happy "^"
 * (`closed`) with no glint.
 */
function backManEye(dir, bend, squint, w, h) {
	const f = dir >= 0 ? 1 : -1;
	const size = Math.min(0.6 * w, 0.24 * h);
	const top = 0.05 * h;
	const cy = top + size / 2;
	const front = 0.7 * w;
	const cx = (f > 0 ? front - size / 2 : w - front + size / 2) + bend * w * (1 - Math.abs(2 * (cy / h) - 1));
	const s = clamp01(squint);
	const closed = s >= 0.55;
	const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
	let shape;
	if (closed) {
		const R = size / 2, a = 0.3 * size, t = Math.max(1, 0.22 * size);   // a "^" band across the eye's width
		shape = [[cx - R, cy + a], [cx, cy - a], [cx + R, cy + a], [cx + R, cy + a + t], [cx, cy - a + t], [cx - R, cy + a + t]];
	} else {
		const hh = (size * (1 - (0.75 * s) / 0.55)) / 2;
		shape = rect(cx - size / 2, cy - hh, cx + size / 2, cy + hh);
	}
	const g = Math.max(1, 0.28 * size), inset = 0.16 * size;
	const gx = f > 0 ? cx + size / 2 - inset - g : cx - size / 2 + inset;
	return { shape, glint: s < 0.25 ? rect(gx, cy - size / 2 + inset, gx + g, cy - size / 2 + inset + g) : null };
}

/** How far into the box the caret is (1 all the way): `sinceIn` ms after it began, `sinceOut` ms after it began going back (or -1). In fast and smooth; back with a little overshoot. */
function backManMorph(sinceIn, sinceOut) {
	if (sinceOut >= 0) return 1 - easeOutBack(clamp01(sinceOut / BACKMAN_MORPH_OUT_MS));
	return easeOutCubic(clamp01(sinceIn / BACKMAN_MORPH_IN_MS));
}

/** A rect between `a` (k 0) and `b` (k 1). */
const lerpRect = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: Math.max(0.5, a.w + (b.w - a.w) * k), h: Math.max(0.5, a.h + (b.h - a.h) * k) });

/** A bite: Backspace (dir -1, it eats leftward) or Delete (dir 1); `big` for a word or a selection. Chewed at its own pace, each kicking the bend toward where it eats. The letters still going in are down at once: it has moved on from them. */
function biteBackMan(S, dir, big, now) {
	const kick = dir * BACKMAN_BEND_KICK * (big ? BACKMAN_BIG.kick : 1);
	const s = S.chew;
	if (!s) { S.chew = { c0: now, t: now, big, dir, bend: 0, v: kick, at: now, meal: [] }; return; }
	if (now > s.at) backManSpring(s, (now - s.at) / 1000);
	for (const m of s.meal) m.t1 = Math.min(m.t1, now);
	Object.assign(s, backManChew(s, now, big));
	s.dir = dir;
	s.at = Math.max(s.at, now);
	s.v += kick;
}

/** Where the creature is at `now`: its chewing (the mouth, the gulp, the squint), which way it faces, how far it bends (the spring, run up to now) and the letters going in - or null when it is the caret again (the gulp over and the bend settled). */
function backManPose(S, now) {
	const s = S.chew;
	if (!s) return null;
	const b = backManBite(Math.max(0, now - s.c0), s.t - s.c0, s.big);
	// The eye eases toward the squint, and once shut stays shut for the rest of the spell: opening it again just before turning back into the caret was a blink too many.
	if (b.squint >= 0.55) s.shut = true;
	const eye = backManEyeEase(s.eye ?? 0, s.shut ? 1 : b.squint, now - s.at);
	if (now > s.at) { backManSpring(s, (now - s.at) / 1000); s.eye = eye; s.at = now; }
	s.meal = s.meal.filter((m) => now < m.t1);   // a letter that is down is gone
	if (b.done && Math.abs(s.bend) < 0.004 && Math.abs(s.v) < 0.05) { S.chew = null; return null; }
	const meal = s.meal.map((m) => {
		const u = clamp01((now - m.t0) / Math.max(1, Math.min(m.t1 - m.t0, BACKMAN_SLIDE_MS)));
		return { m, e: 1 - (1 - u) * (1 - u) };
	});
	return { open: b.open, front: b.front, back: b.back, squint: eye, dir: s.dir, bend: s.bend, meal };
}

/** How far into its shape the caret is at `now`, starting the morph with the creature's first pose and the way back when its pose ends; null once back (always, at once, for a block cursor: it is the box already). */
function backManMorphNow(S, posed, now, instant) {
	let s = S.morph;
	if (posed) {
		if (!s) s = S.morph = { t0: now, exit: 0 };
		else if (s.exit) { s.t0 = now - BACKMAN_MORPH_IN_MS * (1 - backManMorph(0, now - s.exit)); s.exit = 0; }
	} else if (s) {
		if (!s.exit) s.exit = now;
		if (instant || now - s.exit >= BACKMAN_MORPH_OUT_MS) { S.morph = null; return null; }
	} else return null;
	return { back: !!s.exit, m: backManMorph(now - s.t0, s.exit ? now - s.exit : -1) };
}

/** Whether the creature has, or is about to have, the caret: Motion smear stands aside for it. */
function backManBusy(plugin) {
	const S = plugin.fxState.backman;
	return !!S && !!(S.pending || S.chew || S.morph);
}

/** The line as it stands before a deletion key does its work: its text, and where the letters near the caret are drawn and in what. */
function readDeletion(cl, e, now) {
	const { line, idx, collapsed } = cl;
	// A bare key takes the letter next to the caret; a word or a selection takes more.
	const reach = collapsed && !e.ctrlKey && !e.altKey && !e.metaKey ? 2 : BACKMAN_READ_MAX;
	const lo = Math.max(0, idx - reach), hi = Math.min(line.text.length, idx + reach);
	const styles = new Map(), cells = [];
	for (let i = lo; i < hi; i++) {
		const r = line.charRect(i);
		if (!r) { cells.push(null); continue; }
		const host = line.styleHost(i);
		let st = styles.get(host);
		if (!st) {
			const cs = getComputedStyle(host);
			st = { font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, color: cs.color };
			styles.set(host, st);
		}
		cells.push({ ...r, ...st });
	}
	return { row: line.row, guid: line.guid, text: line.text, lo, cells, dir: e.key === 'Backspace' ? -1 : 1, t: now };
}

/**
 * Looks for the deletion a key made (S.pending, from readDeletion): when the line's text has changed, and by exactly a
 * deletion, the letters it took are fed to the creature, nearest the caret first, each to slide into the mouth from
 * where it stood. Anything else - a paste, an undo, a change elsewhere - reads as nothing.
 */
function settleDeletion(plugin, S, now) {
	const pd = S.pending;
	if (!pd) return;
	if (now - pd.t > BACKMAN_WATCH_MS) { S.pending = null; return; }
	const row = pd.row.isConnected ? pd.row : rowByGuid(pd.guid);
	if (!row) { S.pending = null; return; }
	const line = new LineText(row);
	if (line.text === pd.text) return;   // the key has not been applied yet
	S.pending = null;
	const sel = window.getSelection();
	let idx = sel && sel.rangeCount && sel.focusNode ? line.indexOf(sel.focusNode, sel.focusOffset) : -1;
	if (idx < 0 && plugin.last) idx = line.indexAt(plugin.last.x + 1, plugin.last.y + plugin.last.h / 2);
	if (idx < 0) return;
	const edit = lineEdit(pd.text, line.text, idx);
	if (!edit || edit.inserted || !edit.removed || edit.removed.length > BACKMAN_READ_MAX) return;
	const letters = [];
	let off = 0;
	for (const ch of edit.removed) {
		const cell = pd.cells[edit.at + off - pd.lo];
		off += ch.length;
		if (ch.trim() && cell) letters.push({ char: ch, cx: cell.x + cell.w / 2, cy: cell.y + cell.h / 2, w: cell.w, font: cell.font, color: cell.color });
	}
	if (pd.dir < 0) letters.reverse();   // Backspace eats leftward: the letter nearest the caret is the last one
	if (!letters.length) return;
	biteBackMan(S, pd.dir, edit.removed.length > 1, now);
	const t1 = backManDown(S.chew, now);
	for (const l of letters.slice(0, BACKMAN_MEAL_MAX)) S.chew.meal.push({ ...l, t0: now, t1 });
	plugin.kick();
}

function traceOutline(ctx, cmds, x, y) {
	ctx.beginPath();
	for (const c of cmds) {
		if (c[0] === 'M') ctx.moveTo(x + c[1], y + c[2]);
		else if (c[0] === 'L') ctx.lineTo(x + c[1], y + c[2]);
		else if (c[0] === 'Q') ctx.quadraticCurveTo(x + c[1], y + c[2], x + c[3], y + c[4]);
		else ctx.closePath();
	}
}

function tracePoly(ctx, pts, x, y) {
	ctx.beginPath();
	pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py)));
	ctx.closePath();
}

/**
 * The creature in the caret's box `r`: the letters going in first, under it (they show in the mouth and go out of sight
 * behind the jaws), then the body, tinted and ringed like the block cursor, with the eye a square of the caret's own
 * color and the glint a white dot in it. `fill` and `ring` are how much of each (paintCaretBody).
 */
function drawBackMan(plugin, ctx, r, pose, fill, ring, corner) {
	const col = plugin.col();
	const inset = 0.75 * ring;   // the ring lies inside the box, as the block cursor's does
	const x = r.x + inset, y = r.y + inset, w = Math.max(1, r.w - 2 * inset), h = Math.max(1, r.h - 2 * inset);
	const body = backManShape(pose.open, pose.dir, pose.bend, pose.front, pose.back);
	// The letters going in, to the mouth's corner, in the text's color.
	const mx = x + body[3][0] * w, my = y + body[3][1] * h;
	for (const { m, e } of pose.meal) {
		const k = Math.max(0.05, 1 - 0.8 * e);
		ctx.save();
		ctx.font = m.font;
		ctx.fillStyle = m.color;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.translate(m.cx + (mx - m.cx) * e, m.cy + (my - m.cy) * e);
		ctx.scale(k, k);
		ctx.fillText(m.char, 0, 0);
		ctx.restore();
	}
	traceOutline(ctx, backManOutline(body, pose.open, w, h, corner), x, y);
	paintCaretBody(ctx, col, fill, ring);
	const eye = backManEye(pose.dir, pose.bend, pose.squint, w, h);
	ctx.fillStyle = col;
	tracePoly(ctx, eye.shape, x, y);
	ctx.fill();
	if (eye.glint) {
		ctx.fillStyle = 'rgba(255,255,255,0.9)';
		tracePoly(ctx, eye.glint, x, y);
		ctx.fill();
	}
}

EFFECTS.backman = {
	id: 'backman', label: 'Back-man', mode: 'signature', preset: { name: 'Back-man', color: '#ffe14d', accent: '#ff9500' }, keepsState: true, blend: 'source-over', defaults: {},
	// The key goes down before the editor acts on it: the line is as it was, and its letters are still where they stand.
	onKey(plugin, e, now) {
		if (e.isComposing || (e.key !== 'Backspace' && e.key !== 'Delete')) return;
		const S = plugin.state('backman');
		settleDeletion(plugin, S, now);   // a key still unanswered is answered before the next is read
		const cl = caretLine(plugin, true);
		if (!cl) return;
		S.pending = readDeletion(cl, e, now);
		plugin.ensureItem('backman');
		plugin.kick();
	},
	onSample(plugin) { settleDeletion(plugin, plugin.state('backman'), performance.now()); },
	draw(plugin, ctx, item, p, k, now) {
		const S = plugin.state('backman');
		settleDeletion(plugin, S, now);
		const block = plugin.cfg.style === 'block';
		const pose = backManPose(S, now);
		const eat = backManMorphNow(S, !!pose, now, block);
		if (!eat && !S.pending) { item.done = true; plugin.hideCaret('backman', false); return; }
		const rect = caretBox(plugin);
		if (!eat || !rect) return;   // only watching for a deletion so far
		plugin.hideCaret('backman', true);
		const m = clamp01(eat.m);
		// The caret's own shape toward the box a letter wide at the same gap; a block cursor is the box already.
		const r = lerpRect(rect, { x: rect.x, y: rect.y, w: rect.cw, h: rect.h }, eat.m);
		const fill = block ? 0.42 : 1 - 0.58 * m, ring = block ? 1 : m;
		ctx.save();
		if (pose && !eat.back) drawBackMan(plugin, ctx, r, pose, fill, ring, block ? 2 : 0);
		else {   // going back: the plain shape between the box and the caret's own
			ctx.beginPath();
			if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, block ? 2 : 0);
			else ctx.rect(r.x, r.y, r.w, r.h);
			paintCaretBody(ctx, plugin.col(), fill, ring);
		}
		ctx.restore();
	},
};

// =====================================================================================
// SPECIAL PRESETS ORIGINAL TO CARET FX: Holy, Prism, Health, Zephyr, Tide
//
// Written for this plugin, not ported. They are special presets like Sakura and Lightning: each brings its own colors and
// is picked in the preset dialog's Special grid (or by "next preset"), one at a time. Like the falling petals they
// keep everything in their one long-lived item, so the dialog's preview can run them on its own canvas, and they answer
// writing - the caret moving forward along its line as a key is typed - rather than deleting. (Holy and Prism also catch
// a new line, or the caret landing somewhere else.)
// =====================================================================================

const lerp = (a, b, t) => a + (b - a) * t;

/** A color moved toward white by `t` (0..1). */
const lighten = (hex, t) => { const c = hexToHsv(hex); return hsvToHex({ h: c.h, s: c.s * (1 - t), v: c.v + (1 - c.v) * t }); };

/** A color at `f` (0..1) of its brightness. */
const shade = (hex, f) => { const c = hexToHsv(hex); return hsvToHex({ h: c.h, s: c.s, v: c.v * f }); };

/** Whether the caret just moved the way writing moves it: with a key, forward along the same line. */
const isWriting = (info) => info.typed && info.dx > 0.5 && Math.abs(info.dy) < 1;

// ---- Effect: Holy --------------------------------------------------------------------------------------------------
// Plus-shaped glints that twinkle on and around the caret, in place, like light catching the facets of a gem: tiny
// ones, a couple of pixels across, that come and go slowly. Each one swells from nothing to a four-pointed cross - a little longer sideways than up - and fades; the caret's color is
// the gold in it and white its heart. Writing sets a few off, and for a moment after the last key the caret keeps
// glinting by itself.
// Settings: holySize (1 is normal).
const HOLY_LIFE_MS = [1400, 2400];  // how long a glint twinkles: the shortest and the longest
const HOLY_AFTERGLOW_MS = 1800;     // how long the caret keeps glinting by itself after the last key
const HOLY_MAX = 20;                // the most glints alive at once
const HOLY_PINCH = 0.2;             // how near the middle the sides of a glint pass: lower is thinner arms
const HOLY_WIDE = 1.15;             // how much longer a glint is sideways than up
const HOLY_PX = [1.4, 2.6];         // a glint's arm length at its peak, in px: tiny, like stars
const HOLY_GAP_MS = [420, 940];     // the time between two glints the caret sets off by itself

/** A glint's size over its life `p` (0..1): a quick swell to a peak, then a slower fade, nothing at either end. */
const glintSize = (p) => (p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * Math.pow(p, 0.7)));

/** The outline of a four-pointed glint with arms `r` long: two thin needles crossed, the sides curving in between. */
function traceGlint(ctx, r) {
	const c = r * HOLY_PINCH;
	ctx.beginPath();
	ctx.moveTo(0, -r);
	ctx.quadraticCurveTo(c, -c, r, 0);
	ctx.quadraticCurveTo(c, c, 0, r);
	ctx.quadraticCurveTo(-c, c, -r, 0);
	ctx.quadraticCurveTo(-c, -c, 0, -r);
	ctx.closePath();
}

/** The item that holds the glints of `host` (the plugin, or the dialog's preview). */
function glintsOf(host) {
	const item = host.ensureItem('holy');
	if (!item.parts) { item.parts = []; item.until = 0; item.next = 0; }
	return item;
}

/** Puts `n` glints round the caret `rect`, each at a place of its own, a little way out from its middle. */
function addGlints(item, rect, n, now) {
	const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
	for (let i = 0; i < n && item.parts.length < HOLY_MAX; i++) {
		const a = Math.random() * Math.PI * 2, d = rect.h * (0.4 + Math.random() * 0.75);
		item.parts.push({
			x: cx + Math.cos(a) * d * 1.35, y: cy + Math.sin(a) * d * 0.8,   // out wider than tall, like the caret's own glow
			r: lerp(HOLY_PX[0], HOLY_PX[1], Math.random()), tilt: (Math.random() - 0.5) * 0.2,
			t0: now, life: lerp(HOLY_LIFE_MS[0], HOLY_LIFE_MS[1], Math.random()),
		});
	}
}

/** Sets `n` glints off round the caret and keeps it glinting for a while after. */
function igniteGlints(host, rect, n, now) {
	const item = glintsOf(host);
	addGlints(item, rect, n, now);
	item.until = now + HOLY_AFTERGLOW_MS;
	item.next = Math.max(item.next, now + HOLY_GAP_MS[0]);
}

EFFECTS.holy = {
	id: 'holy', label: 'Holy', mode: 'signature', keepsState: true, blend: 'lighter',
	preset: { name: 'Holy', color: '#fff2c2', accent: '#f0b429' },
	defaults: { holySize: 1 },
	onMove(plugin, prev, cur, info) {
		const jump = info.dist > cur.h * 1.5 && (!info.typed || info.dy > 0);   // landing somewhere else catches the light too (not a Backspace joining two lines)
		if (!isWriting(info) && !jump) return;
		const more = Math.random() < 0.35 * Math.min(plugin.cfg.intensity, 1.6);
		igniteGlints(plugin, cur, jump ? 2 : 1 + (more ? 1 : 0), info.now);
	},
	draw(plugin, ctx, item, p, k, now) {
		const rect = plugin.last;
		if (rect && now < item.until && now >= item.next) {   // on its own, a glint now and then
			addGlints(item, rect, 1, now);
			item.next = now + lerp(HOLY_GAP_MS[0], HOLY_GAP_MS[1], Math.random());
		}
		item.parts = item.parts.filter((q) => now - q.t0 < q.life);
		if (!item.parts.length && now >= item.until) { item.done = true; return; }
		const dark = plugin.dark, col = plugin.col();
		const size = (plugin.cfg.holySize || 1) * (0.85 + 0.2 * Math.min(k, 1.6)), power = Math.min(1, 0.55 + 0.45 * k);
		if (!dark) ctx.globalCompositeOperation = 'source-over';   // adding light to a light page shows nothing
		for (const q of item.parts) {
			const e = glintSize((now - q.t0) / q.life);
			if (e < 0.02) continue;
			const R = q.r * size * (0.3 + 0.7 * e), a = e * power;
			// A soft halo, the colored cross, and the white heart of it.
			const halo = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, R * 3.2);
			halo.addColorStop(0, rgba(col, (dark ? 0.4 : 0.15) * a));   // on a light page the same halo reads as a smudge
			halo.addColorStop(1, rgba(col, 0));
			ctx.fillStyle = halo;
			ctx.fillRect(q.x - R * 3.2, q.y - R * 3.2, R * 6.4, R * 6.4);
			ctx.save();
			ctx.translate(q.x, q.y);
			ctx.rotate(q.tilt);
			// The hairlines first: a short, thin cross that fades out toward its ends.
			for (const [lx, ly] of [[R * HOLY_WIDE * 2, 0], [0, R * 1.7]]) {
				const hair = ctx.createLinearGradient(-lx, -ly, lx, ly);
				hair.addColorStop(0, rgba(col, 0));
				hair.addColorStop(0.5, dark ? `rgba(255,255,255,${0.9 * a})` : rgba(plugin.acc(), 0.8 * a));
				hair.addColorStop(1, rgba(col, 0));
				ctx.strokeStyle = hair;
				ctx.lineWidth = 0.7;
				ctx.beginPath();
				ctx.moveTo(-lx, -ly);
				ctx.lineTo(lx, ly);
				ctx.stroke();
			}
			ctx.scale(HOLY_WIDE, 1);
			ctx.shadowColor = rgba(col, 0.9 * a);
			ctx.shadowBlur = R * 0.8;
			traceGlint(ctx, R);
			ctx.fillStyle = rgba(col, 0.9 * a);
			ctx.fill();
			ctx.shadowBlur = 0;
			traceGlint(ctx, R * 0.6);
			ctx.fillStyle = dark ? `rgba(255,255,255,${0.95 * a})` : rgba(plugin.acc(), 0.9 * a);
			ctx.fill();
			ctx.restore();
		}
	},
	preview(plugin, pv, caret, now) {
		if (now < (pv.holyNext || 0)) return;
		pv.holyNext = now + 900;
		igniteGlints(pv, caret, 2, now);
	},
};

// ---- Effect: Prism -------------------------------------------------------------------------------------------------
// Light through a lens: two crescents of spectrum, one on either side of the caret with the dark between them. Each is
// a hot orange-red on its inner edge and goes through a white-cyan core to a deep blue on its outer edge, with fainter,
// dimmer echoes of itself beyond, like diffraction fringes. The pair is painted once into a sprite (pixel by pixel, from
// its distance and angle) and drawn scaled. Writing lights it; each letter sends an echo of the pair breathing out from
// the caret, slowly. A new line or a jump flashes it fully, and it fades within a moment.
// Settings: prismStrength (1 is normal).
const PRISM_DECAY_MS = 900;         // how fast the pair's light dies away
const PRISM_RISE = 0.3;             // what one written letter adds to it
const PRISM_CAP = 0.85;             // writing alone never takes it past this: only a new line or a jump flashes it fully
const PRISM_REACH = 1.9;            // the sprite's radius (where its farthest echo ends), in caret heights
const PRISM_ECHO_MS = [1100, 1600]; // how long one echo breathes out: the shortest and the longest
const PRISM_ECHO_GAP_MS = 140;      // the least time between two echoes, so a fast typist does not bury the page in them
const PRISM_ECHOES_MAX = 6;         // the most echoes alive at once
const PRISM_SPRITE = 160;           // the sprite's size in px
// The spectrum across a crescent, by distance from the middle (0..1 of the sprite's radius): [d, r, g, b].
const PRISM_RAMP = [
	[0.15, 90, 10, 0], [0.2, 255, 70, 20], [0.25, 255, 160, 60], [0.295, 235, 245, 255], [0.34, 90, 220, 255],
	[0.4, 30, 120, 255], [0.46, 20, 60, 200], [0.52, 40, 150, 120], [0.58, 200, 120, 40], [0.65, 40, 120, 200],
	[0.74, 120, 60, 200], [1, 60, 30, 120],
];

/** The spectrum's color at distance `d` from the middle of the sprite, as [r, g, b]. Pure. */
function prismRamp(d) {
	if (d <= PRISM_RAMP[0][0]) return PRISM_RAMP[0].slice(1);
	for (let i = 1; i < PRISM_RAMP.length; i++) {
		const a = PRISM_RAMP[i - 1], b = PRISM_RAMP[i];
		if (d <= b[0]) { const t = (d - a[0]) / (b[0] - a[0]); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)]; }
	}
	return PRISM_RAMP[PRISM_RAMP.length - 1].slice(1);
}

/** How bright the crescents are at distance `d` and angle `phi` off the horizontal (0..pi/2): a bright band, fringes beyond, nothing inside. Pure. */
function prismLight(d, phi) {
	const band = (c, w) => Math.exp(-Math.pow((d - c) / w, 2));
	const radial = 0.95 * band(0.31, 0.115) + 0.38 * band(0.5, 0.09) * (0.75 + 0.25 * Math.cos(d * 55)) + 0.2 * band(0.65, 0.08) + 0.1 * band(0.79, 0.07);
	const inner = clamp01((d - 0.14) / 0.07), outer = clamp01((1 - d) / 0.08);   // dark in the middle, gone at the rim
	const sides = Math.pow(Math.max(0, 1 - Math.pow(phi / 1.05, 2)), 1.2);       // a crescent: strongest level with the caret, tapering to its tips
	return clamp01(radial * inner * outer * sides);
}

let prismSpriteMade = null;
/** The pair of crescents, painted once: transparent, the spectrum in the pixels' colors and the light in their alpha. */
function prismSprite() {
	if (prismSpriteMade) return prismSpriteMade;
	const S = PRISM_SPRITE, cv = document.createElement('canvas');
	cv.width = cv.height = S;
	const c = cv.getContext('2d'), img = c.createImageData(S, S), half = S / 2;
	for (let y = 0; y < S; y++) {
		for (let x = 0; x < S; x++) {
			const dx = (x + 0.5 - half) / half, dy = (y + 0.5 - half) / half, d = Math.hypot(dx, dy);
			const a = prismLight(d, Math.atan2(Math.abs(dy), Math.abs(dx)));
			if (a <= 0.002) continue;
			const [r, g, b] = prismRamp(d), i = (y * S + x) * 4;
			img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = Math.round(a * 255);
		}
	}
	c.putImageData(img, 0, 0);
	return (prismSpriteMade = cv);
}

/** The item that holds the light of `host` (the plugin, or the dialog's preview). */
function prismOf(host) {
	const item = host.ensureItem('prism');
	if (item.e === undefined) { item.e = 0; item.hit = 0; item.echoes = []; item.lastEcho = 0; }
	return item;
}

/** Lights the pair on the caret: what is left of its light, added to (a full flash for `flash`), and an echo breathing out (two for a flash). */
function kindlePrism(host, rect, flash, now) {
	const item = prismOf(host);
	const left = item.e * Math.exp(-(now - item.hit) / PRISM_DECAY_MS);
	item.e = Math.max(left, Math.min(flash ? 1 : PRISM_CAP, left + (flash ? 1 : PRISM_RISE)));
	item.hit = now;
	if (now - item.lastEcho < PRISM_ECHO_GAP_MS) return;
	item.lastEcho = now;
	for (let i = 0; i < (flash ? 2 : 1) && item.echoes.length < PRISM_ECHOES_MAX; i++) {
		item.echoes.push({ t0: now + i * 180, life: lerp(PRISM_ECHO_MS[0], PRISM_ECHO_MS[1], Math.random()), from: flash ? 0.6 : 0.8, to: flash ? 1.7 : 1.4 });
	}
}

function drawPrism(plugin, ctx, item, now, k) {
	const age = now - item.hit, e = item.e * Math.exp(-age / PRISM_DECAY_MS);
	item.echoes = item.echoes.filter((q) => now - q.t0 < q.life);
	if (e < 0.012 && !item.echoes.length) { item.done = true; return; }   // before anything else: with no caret to draw at, it must still die away
	const rect = plugin.last;
	if (!rect) return;
	const dark = plugin.dark;
	const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, R = Math.max(rect.h, 16) * PRISM_REACH;
	const power = (plugin.cfg.prismStrength ?? 1) * Math.min(k, 1.5) * (dark ? 1 : 0.6);
	if (!dark) ctx.globalCompositeOperation = 'source-over';   // adding light to a light page shows nothing
	const sprite = prismSprite();
	ctx.save();
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	const paint = (scale, alpha) => {
		if (alpha < 0.01) return;
		const r = R * scale;
		ctx.globalAlpha = Math.min(1, alpha);
		ctx.drawImage(sprite, cx - r, cy - r, r * 2, r * 2);
	};
	for (const q of item.echoes) {   // an echo: the pair opening out from the caret as it fades
		const f = (now - q.t0) / q.life;
		if (f < 0) continue;
		paint(lerp(q.from, q.to, easeOutCubic(f)), 0.6 * power * Math.pow(1 - f, 1.4) * Math.min(1, f / 0.1));
	}
	if (e >= 0.012) paint(0.9 + 0.1 * Math.min(1, e * 1.5) + 0.02 * Math.sin(now * 0.004), e * power);   // the pair itself, breathing a little
	ctx.restore();
}

EFFECTS.prism = {
	id: 'prism', label: 'Prism', mode: 'signature', keepsState: true, blend: 'lighter',
	preset: { name: 'Prism', color: '#c8f4ff', accent: '#b983ff' },
	defaults: { prismStrength: 1 },
	onMove(plugin, prev, cur, info) {
		const flash = info.typed ? info.dy >= cur.h * 0.8 : info.dist > cur.h * 4;   // a new line, or a jump
		if (!flash && !isWriting(info)) return;
		kindlePrism(plugin, cur, flash, info.now);
	},
	draw(plugin, ctx, item, p, k, now) { drawPrism(plugin, ctx, item, now, k); },
	preview(plugin, pv, caret, now) {
		if (now < (pv.prismNext || 0)) return;
		pv.prismNext = now + 900;
		kindlePrism(pv, caret, false, now);
	},
};

// ---- Effect: Health ------------------------------------------------------------------------------------------------
// Writing heals, slowly: thin glowing pluses float up out of the caret, thin beams of light rise through them, tiny
// motes drift up - the look of a healing spell in a game. All of it
// is in the preset's colors, green; with other colors it is whatever you like (a red cross, say).
const HEALTH_LIFE_MS = [2200, 3400];  // how long a plus floats: the shortest and the longest
const HEALTH_MAX = 8;                 // the most pluses alive at once
const HEALTH_GAP_MS = 320;            // the least time between two bursts, so a fast typist is not buried in them
const HEALTH_PULSE_MS = 1100;         // how long the caret's glow takes to open and fade
const HEALTH_ARM = 0.14;              // a plus's arm half-thickness against its arm length: lower is thinner
const HEALTH_BEAMS_MAX = 5;           // the most beams of light alive at once
const HEALTH_MOTES_MAX = 22;          // the most motes alive at once

/** The colors of a plus, from the caret's: its top, its body (the glow's too) and its edge. */
function healthPalette(plugin) {
	const body = plugin.acc();
	return { top: lighten(plugin.col(), 0.35), mid: body, edge: shade(body, 0.65) };
}

/** The outline of a plus with arms `l` long from the middle and `t` thick (half-widths), the ends rounded. */
function tracePlus(ctx, l, t) {
	ctx.beginPath();
	if (ctx.roundRect) { ctx.roundRect(-l, -t, 2 * l, 2 * t, t * 0.9); ctx.roundRect(-t, -l, 2 * t, 2 * l, t * 0.9); }
	else { ctx.rect(-l, -t, 2 * l, 2 * t); ctx.rect(-t, -l, 2 * t, 2 * l); }
}

/** The item that holds the pluses, beams and motes of `host` (the plugin, or the dialog's preview). */
function pluses(host) {
	const item = host.ensureItem('health');
	if (!item.parts) { item.parts = []; item.beams = []; item.motes = []; item.lastAt = 0; item.pulseAt = -1e9; }
	return item;
}

/** A burst out of the caret `rect` (two pluses with `twin`): pluses floating up from a little off its middle, now and then a beam, a mote or two; and the ring. */
function healPlus(host, rect, now, twin) {
	const item = pluses(host);
	item.pulseAt = now;
	if (now - item.lastAt < HEALTH_GAP_MS) return;
	item.lastAt = now;
	const h = rect.h, cx = rect.x + rect.w / 2;
	for (let i = 0; i < (twin ? 2 : 1) && item.parts.length < HEALTH_MAX; i++) {
		item.parts.push({
			x: cx + (Math.random() - 0.5) * h * 1.6, y: rect.y + h * 0.15,
			rise: h * (1.8 + Math.random() * 1.2),                     // how far it floats in all
			drift: (Math.random() - 0.5) * h * 0.8,                    // and how far it wanders sideways
			sway: h * (0.05 + Math.random() * 0.06), phase: Math.random() * 6.28,
			l: h * (0.22 + Math.random() * 0.16),                      // an arm's length
			t0: now, life: lerp(HEALTH_LIFE_MS[0], HEALTH_LIFE_MS[1], Math.random()),
		});
	}
	if (item.beams.length < HEALTH_BEAMS_MAX && Math.random() < 0.45) {
		item.beams.push({
			x: cx + (Math.random() - 0.5) * h * 2.4, y: rect.y + h,
			len: h * (2.2 + Math.random() * 2), rise: h * (0.8 + Math.random() * 0.8), w: 0.8 + Math.random() * 0.8,
			t0: now, life: lerp(1800, 2800, Math.random()),
		});
	}
	for (let i = 0, n = Math.random() < 0.5 ? 2 : 1; i < n && item.motes.length < HEALTH_MOTES_MAX; i++) {
		item.motes.push({
			x: cx + (Math.random() - 0.5) * h * 2.6, y: rect.y + h * (0.3 + Math.random() * 0.7),
			rise: h * (1.2 + Math.random() * 1.4), drift: (Math.random() - 0.5) * h * 0.5,
			phase: Math.random() * 6.28, r: 0.7 + Math.random() * 0.9,
			t0: now, life: lerp(2400, 3800, Math.random()),
		});
	}
}

EFFECTS.health = {
	id: 'health', label: 'Health', mode: 'signature', keepsState: true, blend: 'lighter',
	preset: { name: 'Health', color: '#7dff9b', accent: '#12b04a' },
	defaults: {},
	onMove(plugin, prev, cur, info) {
		if (!isWriting(info)) return;
		healPlus(plugin, cur, info.now, false);
	},
	draw(plugin, ctx, item, p, k, now) {
		const alive = (q) => now - q.t0 < q.life;
		item.parts = item.parts.filter(alive); item.beams = item.beams.filter(alive); item.motes = item.motes.filter(alive);
		const pulse = (now - item.pulseAt) / HEALTH_PULSE_MS;
		if (!item.parts.length && !item.beams.length && !item.motes.length && pulse >= 1) { item.done = true; return; }
		const pal = healthPalette(plugin), rect = plugin.last, power = Math.min(1, 0.6 + 0.4 * k);
		if (!plugin.dark) ctx.globalCompositeOperation = 'source-over';   // adding light to a light page shows nothing
		if (rect && pulse < 1) {   // the caret's glow: it opens and fades slowly
			const cx = rect.x + rect.w / 2, e = easeOutCubic(pulse), fade = 1 - pulse;
			const r = rect.h * (1 + 0.8 * e), cy = rect.y + rect.h / 2;
			const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
			g.addColorStop(0, rgba(pal.mid, 0.24 * power * fade * fade));
			g.addColorStop(1, rgba(pal.mid, 0));
			ctx.fillStyle = g;
			ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
		}
		for (const q of item.beams) {   // thin beams of light, bright in the middle of their length, rising and fading
			const f = (now - q.t0) / q.life, a = Math.sin(Math.PI * f) * power;
			const y1 = q.y - q.rise * f, y0 = y1 - q.len;
			const g = ctx.createLinearGradient(0, y0, 0, y1);
			g.addColorStop(0, rgba(pal.top, 0));
			g.addColorStop(0.6, rgba(pal.top, 0.8 * a));
			g.addColorStop(1, rgba(pal.mid, 0));
			ctx.fillStyle = g;
			ctx.fillRect(q.x - q.w / 2, y0, q.w, q.len);
			ctx.globalAlpha = 0.18;   // and a wider, fainter one round it
			ctx.fillRect(q.x - q.w * 2, y0, q.w * 4, q.len);
			ctx.globalAlpha = 1;
		}
		for (const q of item.motes) {   // tiny glowing specks drifting up
			const age = now - q.t0, f = age / q.life, a = Math.sin(Math.PI * f) * power;
			ctx.save();
			ctx.shadowColor = rgba(pal.mid, 0.9);
			ctx.shadowBlur = 4;
			ctx.fillStyle = rgba(pal.top, 0.9 * a);
			ctx.beginPath();
			ctx.arc(q.x + q.drift * f + Math.sin(q.phase + age / 520) * 1.5, q.y - q.rise * f, q.r, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
		for (const q of item.parts) {
			const age = now - q.t0, f = age / q.life;
			const pop = easeOutBack(clamp01(age / 320)) * (1 - 0.15 * f);   // pops out a little too big, then settles and shrinks as it goes
			const alpha = Math.min(1, f / 0.1) * (f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4) * power;
			if (alpha <= 0.01) continue;
			const l = q.l * pop * (0.9 + 0.15 * Math.min(k, 1.6)), t = Math.max(0.55, l * HEALTH_ARM);
			ctx.save();
			ctx.translate(q.x + q.drift * f + Math.sin(q.phase + age / 480) * q.sway, q.y - q.rise * f * (1.25 - 0.25 * f));
			ctx.globalAlpha = alpha;
			ctx.shadowColor = rgba(pal.mid, 0.8);
			ctx.shadowBlur = l * 0.8;
			tracePlus(ctx, l, t);
			const g = ctx.createLinearGradient(0, -l, 0, l);
			g.addColorStop(0, pal.top);
			g.addColorStop(0.5, pal.mid);
			g.addColorStop(1, pal.edge);
			ctx.fillStyle = g;
			ctx.fill();
			ctx.shadowBlur = 0;
			tracePlus(ctx, l * 0.55, t * 0.5);   // a lighter plus inside: the shine
			ctx.fillStyle = rgba(pal.top, 0.7);
			ctx.fill();
			ctx.restore();
		}
	},
	preview(plugin, pv, caret, now) {
		if (now < (pv.healthNext || 0)) return;
		pv.healthNext = now + 1100;
		healPlus(pv, caret, now, false);
	},
};

// ---- Effect: Zephyr ------------------------------------------------------------------------------------------------
// An anime-style wind skill, the kind a game plays when a character calls the wind. Pointed leaves caught in the gust
// are swept round the caret and off behind it, fluttering - cel-shaded, a dark rim, a body in the preset's color and a
// light vein - while thin speed lines streak back from the caret and a soft glow shows where the wind was called. A new
// line or a jump is a full gust: a burst of speed lines and a swirl of leaves.
// Settings: zephyrSize (1 is normal).
const ZEPHYR_GAP_MS = 100;              // the least time between two gusts, so a fast typist does not bury the page in them
const ZEPHYR_LEAVES_MAX = 12;           // the most leaves alive at once
const ZEPHYR_LEAF_MS = [1500, 2400];    // how long a leaf is in the air
const ZEPHYR_STREAKS_MAX = 5;           // the most speed lines alive at once
const ZEPHYR_STREAK_MS = 420;           // how long a speed line lasts
const ZEPHYR_GLOW_MS = 420;             // how long the soft glow a gust leaves on the caret lasts

/** The outline of a pointed leaf `len` from its middle to each tip and `wid` out to each side. */
function traceLeaf(ctx, len, wid) {
	ctx.beginPath();
	ctx.moveTo(-len, 0);
	ctx.quadraticCurveTo(-len * 0.15, -wid, len, 0);
	ctx.quadraticCurveTo(-len * 0.15, wid, -len, 0);
	ctx.closePath();
}

/** The item that holds the wind of `host` (the plugin, or the dialog's preview). */
function zephyrOf(host) {
	const item = host.ensureItem('zephyr');
	if (!item.leaves) { item.leaves = []; item.streaks = []; item.lastAt = 0; item.glowAt = -1e9; }
	return item;
}

/** Calls the wind at the caret `rect`: a speed line, a leaf (most letters) and a glow; a full gust for `big`. */
function callZephyr(host, rect, big, now) {
	const item = zephyrOf(host);
	item.glowAt = now;
	if (!big && now - item.lastAt < ZEPHYR_GAP_MS) return;
	item.lastAt = now;
	for (let i = 0; i < (big ? 4 : 1) && item.streaks.length < ZEPHYR_STREAKS_MAX; i++) {
		item.streaks.push({ dy: (Math.random() - 0.5) * rect.h * 0.8, len: 9 + Math.random() * 16, t0: now + i * 50, life: ZEPHYR_STREAK_MS });
	}
	const leaves = big ? 6 : Math.random() < 0.7 ? 1 : 0;
	for (let i = 0; i < leaves && item.leaves.length < ZEPHYR_LEAVES_MAX; i++) {
		item.leaves.push({
			a0: Math.random() * Math.PI * 2, dir: Math.random() < 0.5 ? -1 : 1, turns: 0.9 + Math.random() * 0.8,
			r0: 0.4 + Math.random() * 0.3, r1: 0.9 + Math.random() * 0.7, size: 0.2 + Math.random() * 0.14,
			phase: Math.random() * 6.28, rise: (Math.random() - 0.3) * 0.6, t0: now + i * 40, life: lerp(ZEPHYR_LEAF_MS[0], ZEPHYR_LEAF_MS[1], Math.random()),
		});
	}
}

function drawZephyr(plugin, ctx, item, now, k) {
	const alive = (q) => now - q.t0 < q.life;
	item.leaves = item.leaves.filter(alive); item.streaks = item.streaks.filter(alive);
	const glow = (now - item.glowAt) / ZEPHYR_GLOW_MS;
	if (!item.leaves.length && !item.streaks.length && glow >= 1) { item.done = true; return; }
	const rect = plugin.last;
	if (!rect) return;
	const dark = plugin.dark, h = Math.max(rect.h, 16), cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
	const size = (plugin.cfg.zephyrSize ?? 1) * (0.9 + 0.15 * Math.min(k, 1.6)), power = Math.min(1, 0.7 + 0.3 * k);
	const body = plugin.col(), rim = plugin.acc(), core = dark ? '#ffffff' : lighten(body, 0.75);
	ctx.save();

	if (glow >= 0 && glow < 1) {   // a soft glow where the wind is called
		const r = h * (0.9 + 0.5 * glow), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
		g.addColorStop(0, rgba(body, 0.3 * power * (1 - glow) * (1 - glow)));
		g.addColorStop(1, rgba(body, 0));
		ctx.fillStyle = g;
		ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
	}

	for (const q of item.streaks) {   // speed lines: thin, straight back from the caret, sliding away as they fade
		const f = (now - q.t0) / q.life;
		if (f < 0) continue;
		const head = cx - 5 - 18 * easeOutCubic(f), tail = head - q.len * (1 - 0.4 * f), y = cy + q.dy;
		const g = ctx.createLinearGradient(tail, y, head, y);
		g.addColorStop(0, rgba(core, 0));
		g.addColorStop(1, rgba(core, 0.85 * power * (1 - f)));
		ctx.strokeStyle = g;
		ctx.lineWidth = 1.1;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(tail, y);
		ctx.lineTo(head, y);
		ctx.stroke();
	}

	for (const q of item.leaves) {   // leaves: round the caret on a widening spiral, swept off behind, turning over as they go
		const age = now - q.t0, f = age / q.life;
		if (f < 0) continue;
		const ang = q.a0 + q.dir * q.turns * Math.PI * 2 * easeOutCubic(f), rho = lerp(q.r0, q.r1, f) * h;
		const x = cx + Math.cos(ang) * rho * 1.2 - f * h * 2.2, y = cy + Math.sin(ang) * rho * 0.75 - f * q.rise * h * 2;
		const alpha = Math.min(1, f / 0.1) * (f < 0.65 ? 1 : 1 - (f - 0.65) / 0.35) * power;
		if (alpha <= 0.01) continue;
		const len = q.size * h * size, flutter = 0.35 + 0.65 * Math.abs(Math.cos(q.phase + age / 150));
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(ang + (q.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(q.phase + age / 260) * 0.5);
		ctx.scale(1, flutter);
		ctx.globalAlpha = alpha;
		const g = ctx.createLinearGradient(-len, 0, len, 0);
		g.addColorStop(0, rim);
		g.addColorStop(1, body);
		traceLeaf(ctx, len, len * 0.5);
		ctx.fillStyle = g;
		ctx.fill();
		ctx.strokeStyle = core;   // a light outline and a vein, as a cel-shaded leaf has
		ctx.lineWidth = 0.7;
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(-len * 0.8, 0);
		ctx.lineTo(len * 0.7, 0);
		ctx.stroke();
		ctx.restore();
	}
	ctx.restore();
}

EFFECTS.zephyr = {
	id: 'zephyr', label: 'Zephyr', mode: 'signature', keepsState: true, blend: 'source-over',
	preset: { name: 'Zephyr', color: '#9ff5e1', accent: '#13b5a0' },
	defaults: { zephyrSize: 1 },
	onMove(plugin, prev, cur, info) {
		const big = info.typed ? info.dy >= cur.h * 0.8 : info.dist > cur.h * 4;   // a new line, or a jump
		if (!big && !isWriting(info)) return;
		callZephyr(plugin, cur, big, info.now);
	},
	draw(plugin, ctx, item, p, k, now) { drawZephyr(plugin, ctx, item, now, k); },
	preview(plugin, pv, caret, now) {
		if (now < (pv.zephyrNext || 0)) return;
		pv.zephyrNext = now + 750;
		callZephyr(pv, caret, false, now);
	},
};

// ---- Effect: Tide --------------------------------------------------------------------------------------------------
// A stylized water skill, drawn the way an anime draws it: every letter flicks a small spray of teardrops out of the
// caret that arc up and fall back, each a round head with a tapering tail, a darker rim and a white glint; now and then a
// bubble - a thin ring with a glare - drifts up, wobbling, and pops. A soft aqua glow shows where the water was called.
// A new line or a jump is a big splash: a fan of drops and a handful of bubbles.
// Settings: tideSize (1 is normal).
const TIDE_GAP_MS = 90;                // the least time between two sprays, so a fast typist does not bury the page in them
const TIDE_DROPS_MAX = 26;             // the most drops alive at once
const TIDE_DROP_MS = [900, 1400];      // how long a drop is in the air
const TIDE_GRAVITY = 270;              // px/s^2 at a 24 px caret; scaled with the caret
const TIDE_BUBBLES_MAX = 10;           // the most bubbles alive at once
const TIDE_BUBBLE_MS = [1800, 2800];   // how long a bubble drifts before it pops
const TIDE_GLOW_MS = 450;              // how long the soft glow a spray leaves on the caret lasts

/** The outline of a drop in its own frame: a round head of radius `r` toward +x and a tail drawn out to a point behind. */
function traceDrop(ctx, r) {
	ctx.beginPath();
	ctx.moveTo(-r * 2.7, 0);
	ctx.quadraticCurveTo(-r * 0.8, -r * 0.95, 0, -r);
	ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
	ctx.quadraticCurveTo(-r * 0.8, r * 0.95, -r * 2.7, 0);
	ctx.closePath();
}

/** The item that holds the water of `host` (the plugin, or the dialog's preview). */
function tideOf(host) {
	const item = host.ensureItem('tide');
	if (!item.drops) { item.drops = []; item.bubbles = []; item.lastAt = 0; item.glowAt = -1e9; }
	return item;
}

/** Flicks water out of the caret `rect`: a few drops and now and then a bubble; a splash for `big`. */
function callTide(host, rect, big, now) {
	const item = tideOf(host);
	item.glowAt = now;
	if (!big && now - item.lastAt < TIDE_GAP_MS) return;
	item.lastAt = now;
	const u = Math.max(rect.h, 16) / 24, ox = rect.x + rect.w / 2, oy = rect.y + rect.h * 0.25;
	const drops = big ? 9 : 2 + (Math.random() < 0.5 ? 1 : 0);
	for (let i = 0; i < drops && item.drops.length < TIDE_DROPS_MAX; i++) {
		const ang = -Math.PI / 2 + (Math.random() - 0.5) * (big ? 2.6 : 1.9), speed = (big ? 110 : 70) + Math.random() * (big ? 110 : 80);
		item.drops.push({
			x: ox, y: oy, vx: Math.cos(ang) * speed * u, vy: Math.sin(ang) * speed * u, g: TIDE_GRAVITY * u,
			r: (1.5 + Math.random() * 1.5) * u, t0: now + i * 18, life: lerp(TIDE_DROP_MS[0], TIDE_DROP_MS[1], Math.random()),
		});
	}
	const bubbles = big ? 4 : Math.random() < 0.4 ? 1 : 0;
	for (let i = 0; i < bubbles && item.bubbles.length < TIDE_BUBBLES_MAX; i++) {
		item.bubbles.push({
			x: ox + (Math.random() - 0.5) * rect.h * 1.4, y: rect.y + rect.h * (0.2 + Math.random() * 0.6),
			rise: rect.h * (1.2 + Math.random() * 1.4), drift: (Math.random() - 0.5) * rect.h * 0.6, wob: 1 + Math.random() * 1.6,
			phase: Math.random() * 6.28, r: (2 + Math.random() * 3) * u, t0: now + i * 60, life: lerp(TIDE_BUBBLE_MS[0], TIDE_BUBBLE_MS[1], Math.random()),
		});
	}
}

function drawTide(plugin, ctx, item, now, k) {
	const alive = (q) => now - q.t0 < q.life;
	item.drops = item.drops.filter(alive); item.bubbles = item.bubbles.filter(alive);
	const glow = (now - item.glowAt) / TIDE_GLOW_MS;
	if (!item.drops.length && !item.bubbles.length && glow >= 1) { item.done = true; return; }
	const rect = plugin.last;
	if (!rect) return;
	const dark = plugin.dark, h = Math.max(rect.h, 16), cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
	const size = (plugin.cfg.tideSize ?? 1) * (0.9 + 0.15 * Math.min(k, 1.6)), power = Math.min(1, 0.7 + 0.3 * k);
	const body = plugin.col(), deep = plugin.acc(), foam = dark ? '#ffffff' : lighten(body, 0.7), edge = shade(deep, 0.7);
	ctx.save();

	if (glow >= 0 && glow < 1) {   // a soft glow where the water is called
		const r = h * (0.9 + 0.6 * glow), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
		g.addColorStop(0, rgba(body, 0.28 * power * (1 - glow) * (1 - glow)));
		g.addColorStop(1, rgba(body, 0));
		ctx.fillStyle = g;
		ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
	}

	for (const q of item.bubbles) {   // bubbles: a thin ring with a glare, drifting up and wobbling; at the end, a pop
		const age = now - q.t0, f = age / q.life;
		if (f < 0) continue;
		const x = q.x + q.drift * f + Math.sin(q.phase + age / 380) * q.wob, y = q.y - q.rise * f;
		const popAt = 0.88, r = q.r * size * (0.8 + 0.3 * Math.min(f, popAt));
		const a = Math.min(1, f / 0.12) * power;
		ctx.save();
		if (f < popAt) {
			ctx.globalAlpha = a;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fillStyle = rgba(body, 0.16);
			ctx.fill();
			ctx.strokeStyle = rgba(foam, 0.85);
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.strokeStyle = rgba(foam, 0.95);   // the glare, a short arc at the upper left
			ctx.lineWidth = 1.2;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.arc(x, y, r * 0.62, Math.PI * 1.05, Math.PI * 1.45);
			ctx.stroke();
		} else {   // the pop: the ring flies apart and thins out
			const pf = (f - popAt) / (1 - popAt);
			ctx.globalAlpha = a * (1 - pf);
			ctx.strokeStyle = rgba(foam, 0.9);
			ctx.lineWidth = 1 * (1 - 0.5 * pf);
			ctx.beginPath();
			ctx.arc(x, y, r * (1 + 0.9 * pf), 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.restore();
	}

	for (const q of item.drops) {   // drops: thrown up, pulled down, the tail always trailing behind
		const t = (now - q.t0) / 1000, f = (now - q.t0) / q.life;
		if (f < 0) continue;
		const x = q.x + q.vx * t, y = q.y + q.vy * t + 0.5 * q.g * t * t, vy = q.vy + q.g * t;
		const alpha = Math.min(1, f / 0.08) * (f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4) * power;
		if (alpha <= 0.01) continue;
		const r = q.r * size;
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(Math.atan2(vy, q.vx));
		ctx.globalAlpha = alpha;
		const g = ctx.createLinearGradient(-r * 2.7, 0, r, 0);   // light at the tail, deep at the head
		g.addColorStop(0, body);
		g.addColorStop(1, deep);
		traceDrop(ctx, r);
		ctx.fillStyle = g;
		ctx.fill();
		ctx.strokeStyle = edge;
		ctx.lineWidth = 0.8;
		ctx.stroke();
		ctx.beginPath();   // the glint
		ctx.ellipse(r * 0.28, -r * 0.4, r * 0.38, r * 0.2, -0.5, 0, Math.PI * 2);
		ctx.fillStyle = foam;
		ctx.fill();
		ctx.restore();
	}
	ctx.restore();
}

EFFECTS.tide = {
	id: 'tide', label: 'Tide', mode: 'signature', keepsState: true, blend: 'source-over',
	preset: { name: 'Tide', color: '#8fe6ff', accent: '#1f7ae0' },
	defaults: { tideSize: 1 },
	onMove(plugin, prev, cur, info) {
		const big = info.typed ? info.dy >= cur.h * 0.8 : info.dist > cur.h * 4;   // a new line, or a jump
		if (!big && !isWriting(info)) return;
		callTide(plugin, cur, big, info.now);
	},
	draw(plugin, ctx, item, p, k, now) { drawTide(plugin, ctx, item, now, k); },
	preview(plugin, pv, caret, now) {
		if (now < (pv.tideNext || 0)) return;
		pv.tideNext = now + 800;
		callTide(pv, caret, false, now);
	},
};


// ---- Effect: Slime (jelly rectangle caret) -------------------------------------------------------------------------
// The caret is always a rectangle - the box of the letter it stands on - made of jelly: its base stays put and its body
// is a little chain of springs, so the top lags behind and rocks like a bone in a rig. Standing still it sways gently
// from side to side and breathes; every letter (or step) kicks it the way it moves, so it leans, stretches, overshoots
// and wobbles back; a new line or a jump squashes it flat and lets it spring up. Drawn as one soft shape: the sides
// bend with the sway and bulge out when it is squashed.
// Settings: slimeIdle (how far it sways at rest; 1 is normal, 0 holds it still).
const SLIME_STEP = 1 / 240;   // s: the springs are integrated in steps this small, so every frame rate wobbles alike

/** The spring state of the jelly of `item`: m (the middle's sideways offset), t (the top's, chasing m), sx and sy (scales), each with its velocity. */
function slimeState(item) {
	return item.S || (item.S = { m: 0, vm: 0, t: 0, vt: 0, sx: 1, vx: 0, sy: 1, vy: 0 });
}

/** A kick from the caret moving from `prev` to `cur`: lean the way it went, stretch along the move; squash for a leap. */
function wobbleSlime(plugin, prev, cur) {
	const item = plugin.ensureItem('slime'), S = slimeState(item);
	const dx = cur.x - prev.x, dy = cur.y - prev.y, dist = Math.hypot(dx, dy);
	if (dist < 0.2) return;
	const dir = dx >= 0 ? 1 : -1;
	if (Math.abs(dy) > cur.h * 0.6 || dist > cur.h * 2.5) {   // a new line or a jump: lands flat, then springs up
		S.sy = 0.55; S.sx = 1.4; S.vy = 6; S.vx = -4;
		S.vm += dir * 110; S.vt += dir * 160;
	} else {
		S.vm += dir * 45; S.vt += dir * 80;
		S.sx = Math.min(1.35, S.sx + 0.16); S.sy = Math.max(0.7, S.sy - 0.1);
	}
	plugin.kick();
}

function drawSlime(plugin, ctx, item, now, dt) {
	const rect = caretBox(plugin);
	if (!rect) { item.done = true; if (!plugin.isPreview) plugin.hideCaret('slime', false); return; }
	const S = slimeState(item), idle = plugin.cfg.slimeIdle ?? 1;
	const w = Math.max(rect.cw || 9, 8), h = rect.h, cx = rect.x + w / 2, base = rect.y + h;
	// What the middle is pulled toward: nothing but the rest sway, which is two slow waves out of step.
	const drive = idle * w * (0.13 * Math.sin(now * 0.0057) + 0.05 * Math.sin(now * 0.0093 + 1));
	const breathe = 1 + idle * 0.03 * Math.sin(now * 0.0057 + 1);
	const wm = 20, zm = 0.2, wt = 28, zt = 0.16, ws = 26, zs = 0.2;   // spring speeds (rad/s) and dampings: underdamped, so it overshoots
	let left = Math.min((dt || 16) / 1000, 0.05);
	while (left > 1e-6) {
		const s = Math.min(SLIME_STEP, left);
		left -= s;
		S.vm += (-wm * wm * (S.m - drive) - 2 * zm * wm * S.vm) * s; S.m += S.vm * s;
		S.vt += (-wt * wt * (S.t - S.m) - 2 * zt * wt * S.vt) * s; S.t += S.vt * s;
		S.vx += (-ws * ws * (S.sx - 1) - 2 * zs * ws * S.vx) * s; S.sx += S.vx * s;
		S.vy += (-ws * ws * (S.sy - breathe) - 2 * zs * ws * S.vy) * s; S.sy += S.vy * s;
	}
	if (!plugin.isPreview) plugin.hideCaret('slime', true);   // only the jelly is seen, never the line caret under it
	const hw = (w * S.sx) / 2, hh = h * S.sy, top = clamp(S.t, -w * 1.2, w * 1.2), mid = S.m * 0.5 + top * 0.35;
	const bulge = clamp((1 - S.sy) * w * 0.9, -w * 0.5, w * 0.6);
	const sag = clamp(S.vt * 0.004, -3, 3);
	ctx.save();
	ctx.translate(cx, base);
	ctx.beginPath();
	ctx.moveTo(-hw, 0);
	ctx.quadraticCurveTo(-hw - bulge + mid, -hh / 2, -hw + top, -hh);
	ctx.quadraticCurveTo(top, -hh + sag, hw + top, -hh);
	ctx.quadraticCurveTo(hw + bulge + mid, -hh / 2, hw, 0);
	ctx.closePath();
	paintCaretBody(ctx, plugin.col(), 0.45, 1);
	ctx.restore();
	plugin.kick();   // it never rests: standing still it is still swaying
}

EFFECTS.slime = {
	id: 'slime', label: 'Slime', mode: 'signature', keepsState: true, blend: 'source-over',
	preset: { name: 'Slime', color: '#59f939', accent: '#15803d' },
	defaults: { slimeIdle: 1 },
	onSample(plugin, cur) { if (cur) plugin.ensureItem('slime'); },   // alive whenever there is a caret
	onMove(plugin, prev, cur) { wobbleSlime(plugin, prev, cur); },
	onPulse(plugin) { const S = slimeState(plugin.ensureItem('slime')); S.sx = 1.3; S.sy = 0.7; plugin.kick(); },
	draw(plugin, ctx, item, p, k, now, dt) { drawSlime(plugin, ctx, item, now, dt); },
	preview(plugin, pv, caret, now) {
		pv.ensureItem('slime');
		if (now < (pv.slimeNext || 0)) return;
		pv.slimeNext = now + 1600;
		wobbleSlime(pv, { x: caret.x - 10, y: caret.y, w: caret.w, h: caret.h }, caret);
	},
};

// ---- Defaults: core keys + every effect's keys (toggle key per 'always' effect, plus its own defaults) ----
const DEFAULTS = {
	color: '#ffb929',       // main caret / glow color (dark theme)
	accent: '#ff3b1f',      // trail edge + lightning glow color (dark theme)
	style: 'line',          // 'line' | 'block'
	fx: null,               // signature effect id set by the preset (a 'signature' effect id), or null
	intensity: 1,           // 0.3 (subtle) .. 2 (strong)
};
for (const e of Object.values(EFFECTS)) {
	if (e.mode === 'always') DEFAULTS[e.id] = e.defaultOn !== false;
	Object.assign(DEFAULTS, e.defaults);
}


class Plugin extends AppPlugin {
	cfg = { ...DEFAULTS };
	canvas = null;
	ctx = null;
	items = [];         // live effect items (each tagged with its effect id)
	lastT = 0;          // time of the previous frame, for dt
	last = null;        // last caret rect {x,y,w,h}
	caretEl = null;     // Thymer caret element the effects follow
	block = null;       // block cursor element (style: 'block')
	clip = null;        // cached clip rect (editor scroll area)
	clipT = 0;
	dark = true;
	raf = 0;
	preset = 0;
	cleanup = [];
	fxState = {};              // each effect's own state, by id (see state())
	caretHolders = new Set();  // the effects that have hidden Thymer's caret to draw their own (see hideCaret())
	running = new Set();       // ids of the effects that were active at the last syncEffects()
	sampleN = 0;               // counts sample() calls, so what is read from the DOM is read once per sample
	lineMemo = null;           // caretLine()'s answer for the current sample

	onLoad() {
		this.readConfig();
		this.dark = isDarkTheme();
		this.mountCanvas();
		this.applyCaretStyle();

		const listen = (target, type, fn, opts) => {
			target.addEventListener(type, fn, opts);
			this.cleanup.push(() => target.removeEventListener(type, fn, opts));
		};
		const cap = { capture: true, passive: true };
		const nav = () => requestAnimationFrame(() => this.sample(false));
		listen(document, 'input', () => requestAnimationFrame(() => this.sample(true)), cap);
		listen(document, 'keydown', (e) => {
			if (!this.caretEl) return; // typing in the palette, a rename field or another plugin: not ours
			const typing = (e.key.length === 1 && !e.ctrlKey && !e.metaKey) || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter';
			if (typing) { this.lastTypeKey = performance.now(); setTimeout(() => this.sample(true), 0); }
			if (document.querySelector(MODAL_SEL)) return;
			const now = performance.now();
			for (const fx of this.activeEffects()) this.callHook(fx, 'onKey', e, now);
		}, cap);
		listen(document, 'keyup', nav, cap);
		listen(document, 'click', nav, cap);
		listen(document, 'selectionchange', nav);
		listen(document, 'scroll', () => { this.clipT = 0; nav(); }, cap);
		listen(window, 'resize', () => { this.resize(); this.clipT = 0; nav(); });

		this.installCaretObserver();
		this.installThemeObserver();

		this.ui.addCommandPaletteCommand({ label: 'Caret FX: set preset…', icon: 'ti-palette', onSelected: () => this.presetDialog() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: next preset', icon: 'ti-color-swatch', onSelected: () => this.nextPreset() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: set intensity…', icon: 'ti-adjustments', onSelected: () => this.intensityDialog() });
		for (const e of Object.values(EFFECTS)) {
			if (e.mode !== 'always' || e.toggleable === false || DIALOG_SWITCHES.some(([key]) => key === e.id)) continue;
			this.ui.addCommandPaletteCommand({ label: `Caret FX: toggle ${e.label.toLowerCase()}`, icon: 'ti-toggle-right', onSelected: () => this.update({ [e.id]: !this.cfg[e.id] }) });
		}

		// Picks up edits made in the plugin's configuration JSON.
		this.events.on('global-plugin.updated', () => this.readConfig());
		this.sample(false);
	}

	onUnload() {
		cancelAnimationFrame(this.raf);
		this.cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
		this.cleanup = [];
		for (const id of this.running) if (EFFECTS[id]?.keepsState) this.dropEffect(id);
		this.running = new Set();
		this.canvas?.remove();
		this.closeDialog();
		this.uiStyle?.remove();
		this.caretStyle?.remove();
		this.block?.remove();
		this.block = null;
	}

	// ---- observers ---------------------------------------------------------------------

	// Thymer moves its caret element with style/data attributes; watch only those elements, not the whole document.
	installCaretObserver() {
		const attached = new WeakSet();
		const observers = [];
		let pending = false;
		const poke = () => {
			if (pending) return;
			pending = true;
			requestAnimationFrame(() => { pending = false; this.sample(false); });
		};
		const attach = (el) => {
			if (attached.has(el)) return;
			attached.add(el);
			const mo = new MutationObserver(poke);
			mo.observe(el, { attributes: true, attributeFilter: ['data-x', 'data-y', 'style', 'class'] });
			observers.push(mo);
			poke();
		};
		const tree = new MutationObserver((muts) => {
			for (const m of muts) {
				for (const node of m.addedNodes) {
					if (!(node instanceof Element)) continue;
					if (node.matches(CARET_SEL)) attach(node);
					else node.querySelectorAll?.(CARET_SEL).forEach(attach);
				}
				if (m.removedNodes.length && this.caretEl && !this.caretEl.isConnected) { this.caretEl = null; this.clipT = 0; }
			}
		});
		tree.observe(document.body, { childList: true, subtree: true });
		document.querySelectorAll(CARET_SEL).forEach(attach);
		this.cleanup.push(() => { tree.disconnect(); observers.forEach((o) => o.disconnect()); observers.length = 0; });
	}

	installThemeObserver() {
		const check = () => {
			const dark = isDarkTheme();
			if (dark === this.dark) return;
			this.dark = dark;
			this.applyCaretStyle();
			this.dlgBox?.style.setProperty('--c', this.col());
			this.dlgBox?.style.setProperty('--a', this.acc());
			if (this.last) this.addPulse(this.last);
		};
		const mo = new MutationObserver(check);
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.cleanup.push(() => mo.disconnect());
		const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
		if (mq && mq.addEventListener) {
			mq.addEventListener('change', check);
			this.cleanup.push(() => mq.removeEventListener('change', check));
		}
	}

	// ---- colors ------------------------------------------------------------------------

	col() { return this.dark ? this.cfg.color : lightVariant(this.cfg.color); }
	acc() { return this.dark ? this.cfg.accent : lightVariant(this.cfg.accent); }

	// ---- effect registry access ---------------------------------------------------------

	// 'always' effects whose toggle is on, plus the signature effect chosen by cfg.fx.
	activeEffects() {
		return Object.values(EFFECTS).filter((e) => (e.mode === 'always' ? e.toggleable === false || !!this.cfg[e.id] : e.id === this.cfg.fx));
	}

	// Colour presets followed by the registry's signature presets: [name, color, accent, fx].
	presetList() {
		const special = Object.values(EFFECTS).filter((e) => e.mode === 'signature' && e.preset).map((e) => [e.preset.name, e.preset.color, e.preset.accent, e.id]);
		return PRESETS.map(([n, c, a]) => [n, c, a, null]).concat(special);
	}

	// An effect's hook must never break typing: a failure is logged once and the effect carries on without it.
	callHook(e, hook, ...args) {
		try { e[hook]?.(this, ...args); } catch (err) { this.warnOnce(e, hook, err); }
	}

	warnOnce(e, where, err) {
		if (e.warned) return;
		e.warned = true;
		console.warn(`[Caret FX] ${e.id}.${where} failed; the effect keeps going without it`, err);
	}

	// The state bag of an effect that keeps some (keepsState: true); dropped when it is switched off.
	state(id) { return this.fxState[id] || (this.fxState[id] = {}); }

	// The one long-lived item an effect keeps in the draw list, made on first need.
	ensureItem(id) {
		let item = this.items.find((it) => it.effect === id && !it.done);
		if (!item) { item = { effect: id, t0: performance.now(), dur: Infinity }; this.items.push(item); }
		return item;
	}

	// An effect that draws the caret itself (Motion smear, Back-man) takes Thymer's caret and the block cursor out of
	// sight while it does; they come back when the last of them lets go.
	hideCaret(id, on) {
		if (on) this.caretHolders.add(id); else this.caretHolders.delete(id);
		document.body.classList.toggle('cfx-caret-off', this.caretHolders.size > 0);
	}

	// What an effect that keeps state leaves behind when it stops: its items, its state, its hold on the caret.
	dropEffect(id) {
		this.items = this.items.filter((it) => it.effect !== id);
		delete this.fxState[id];
		this.hideCaret(id, false);
	}

	// Called when the settings may have changed which effects run: one that was on and is now off lets go.
	syncEffects() {
		const on = new Set(this.activeEffects().map((e) => e.id));
		let dropped = false;
		for (const id of this.running) {
			if (on.has(id) || !EFFECTS[id]?.keepsState) continue;
			this.dropEffect(id);
			dropped = true;
		}
		this.running = on;
		if (dropped) this.kick();
	}


	// Thymer draws its caret as the left border of div.listview-caret-self, colored by --ed-caret-self-fg.
	// Only that variable is overridden, so nothing outside the editor changes.
	// In block mode Thymer's caret is hidden with opacity (never display/visibility: its box is still
	// measured every move) and a block element follows it instead.
	applyCaretStyle() {
		if (!this.caretStyle) {
			this.caretStyle = document.createElement('style');
			document.head.appendChild(this.caretStyle);
		}
		if (!this.uiStyle) { this.uiStyle = document.createElement('style'); this.uiStyle.textContent = UI_CSS; document.head.appendChild(this.uiStyle); }
		const col = this.col();
		const block = this.cfg.style === 'block';
		this.caretStyle.textContent = block
			? `div.listview-caret-self { opacity: 0 !important; animation: none !important; transition: none !important; }
.app-chrome-panels .panel .listitem, .app-chrome-panels .panel .listitem [contenteditable="true"] { caret-color: transparent !important; }`
			: `body, div.listview-caret-self { --ed-caret-self-fg: ${col} !important; }`;
		if (block) {
			if (!this.block) { this.block = document.createElement('div'); this.block.className = 'cfx-block'; this.block.style.display = 'none'; document.body.appendChild(this.block); }
			this.block.style.background = rgba(col, 0.42);
			this.block.style.boxShadow = `inset 0 0 0 1.5px ${col}, 0 0 8px ${rgba(col, 0.45)}`;
		} else if (this.block) {
			this.block.remove();
			this.block = null;
		}
	}

	// Moves the block cursor onto the caret rect; hidden when the caret is scrolled out of the editor area.
	updateBlock(rect, moved) {
		if (!this.block) return;
		const clip = this.clipRect();
		const visible = rect && (!clip || (rect.y + rect.h > clip.y && rect.y < clip.y + clip.h && rect.x + rect.w > clip.x && rect.x < clip.x + clip.w));
		if (!visible) { this.block.style.display = 'none'; return; }
		Object.assign(this.block.style, { display: 'block', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
		if (moved) { this.block.style.animation = 'none'; void this.block.offsetWidth; this.block.style.animation = ''; } // solid while moving, blinks when idle
	}

	// ---- settings ----------------------------------------------------------------------

	readConfig() {
		try {
			const custom = this.getConfiguration()?.custom || {};
			this.cfg = { ...DEFAULTS, ...custom, ...loadChoices() };
		} catch (e) { this.cfg = { ...DEFAULTS, ...loadChoices() }; }
		// Effects that cannot be toggled (no command) must not stay off because of an old saved value.
		for (const e of Object.values(EFFECTS)) if (e.mode === 'always' && e.toggleable === false) this.cfg[e.id] = true;
		if (this.canvas) this.applyCaretStyle();
		this.syncEffects();
	}

	update(patch) {
		this.cfg = { ...this.cfg, ...patch };
		this.syncEffects();
		this.applyCaretStyle();
		saveChoices(patch);
		// Show the new look right away at the current caret.
		if ('style' in patch) { this.last = null; this.sample(false); }
		else if (this.last) this.addPulse(this.last);
	}

	// ---- themed dialogs ----------------------------------------------------------------

	dialog(title, build) {
		this.closeDialog();
		if (!this.uiStyle) { this.uiStyle = document.createElement('style'); this.uiStyle.textContent = UI_CSS; document.head.appendChild(this.uiStyle); }
		const cs = getComputedStyle(document.body);
		const ov = document.createElement('div');
		ov.className = 'cfx-ov';
		const box = document.createElement('div');
		box.className = 'cfx-box';
		box.style.color = cs.color;
		box.style.background = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'Canvas';
		box.style.setProperty('--c', this.col());
		box.style.setProperty('--a', this.acc());
		box.innerHTML = `<div class="cfx-head"><div class="cfx-title"></div><button class="cfx-x" aria-label="Close">✕</button></div>`;
		box.querySelector('.cfx-title').textContent = title;
		box.querySelector('.cfx-x').onclick = () => this.closeDialog();
		ov.appendChild(box);
		ov.addEventListener('mousedown', (e) => { if (e.target === ov) this.closeDialog(); });
		this.dlgKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.closeDialog(); } };
		document.addEventListener('keydown', this.dlgKey, true);
		document.body.appendChild(ov);
		this.dlg = ov;
		this.dlgBox = box;
		build(box);
	}

	closeDialog() {
		if (this.dlgKey) document.removeEventListener('keydown', this.dlgKey, true);
		this.dlg?.remove();
		this.dlg = this.dlgBox = this.dlgKey = null;
	}

	// Apply right away (and remember it).
	live(patch) {
		this.cfg = { ...this.cfg, ...patch };
		saveChoices(patch);
		this.syncEffects();
		this.applyCaretStyle();
		this.dlgBox?.style.setProperty('--c', this.col());
		this.dlgBox?.style.setProperty('--a', this.acc());
	}

	// Pointer-drag helper: calls fn(x, y) in 0..1 coordinates of el while dragging.
	drag(el, fn) {
		const move = (e) => { const r = el.getBoundingClientRect(); fn(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)); };
		el.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			el.setPointerCapture(e.pointerId);
			move(e);
			const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
			el.addEventListener('pointermove', move);
			el.addEventListener('pointerup', up);
		});
	}

	// Plays the active effects' previews inside the dialog, on a mini canvas, through the same registry draw().
	startPreview(host) {
		const cv = document.createElement('canvas');
		host.appendChild(cv);
		const dpr = window.devicePixelRatio || 1, W = host.offsetWidth, H = host.offsetHeight;
		cv.width = W * dpr; cv.height = H * dpr;
		const pv = Object.create(this);              // shares cfg (colors, effect) with the plugin, owns its drawing state
		pv.ctx = cv.getContext('2d');
		pv.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		pv.items = []; pv.lastT = 0; pv.isPreview = true;
		const caret = { x: 186, y: 28, w: 2.5, h: 28 };
		pv.last = caret;
		const tick = () => {
			if (!this.dlg || !cv.isConnected) return;
			const now = performance.now();
			for (const e of this.activeEffects()) e.preview?.(this, pv, caret, now);
			pv.ctx.clearRect(0, 0, W, H);
			pv.renderItems(now);
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	presetDialog() {
		this.dialog('Caret preset', (box) => {
			const html = (h) => { const t = document.createElement('div'); t.innerHTML = h; return t.firstElementChild; };
			const preview = html('<div class="cfx-preview"><span>Typing something…</span><div class="cfx-trail"></div><div class="cfx-caret"></div></div>');
			box.appendChild(preview);
			this.startPreview(preview);

			box.appendChild(html('<div class="cfx-label">Colors</div>'));
			const grid = html('<div class="cfx-presets"></div>');
			box.appendChild(grid);
			box.appendChild(html('<div class="cfx-label">Special</div>'));
			const special = html('<div class="cfx-presets"></div>');
			box.appendChild(special);

			const list = this.presetList();
			const refreshPresets = () => box.querySelectorAll('.cfx-pre').forEach((b) => { const p = list[b.dataset.i]; b.classList.toggle('on', p[1] === this.cfg.color && p[2] === this.cfg.accent && (p[3] || null) === (this.cfg.fx || null)); });
			list.forEach(([name, color, accent, fx], i) => {
				const b = html(`<button class="cfx-pre" data-i="${i}" title="${name}"><div class="cfx-dot" style="background:linear-gradient(135deg, ${color} 0%, ${color} 38%, ${accent} 100%)"></div><span>${name}</span></button>`);
				b.onclick = () => { this.live({ color, accent, fx }); refreshPresets(); };
				(fx ? special : grid).appendChild(b);
			});
			refreshPresets();

			box.appendChild(html('<div class="cfx-label">Effects</div>'));
			const opts = html('<div class="cfx-opts"></div>');
			box.appendChild(opts);
			const isOn = (key) => (key === 'style' ? this.cfg.style === 'block' : !!this.cfg[key]);
			const refreshSwitches = () => {
				preview.classList.toggle('block', this.cfg.style === 'block');
				opts.querySelectorAll('.cfx-opt').forEach((b) => b.setAttribute('aria-checked', String(isOn(b.dataset.key))));
			};
			for (const [key, label, note] of DIALOG_SWITCHES) {
				const b = html(`<button class="cfx-opt" role="switch" data-key="${key}"><span><span class="cfx-opt-name"></span><span class="cfx-opt-note"></span></span><span class="cfx-sw"></span></button>`);
				b.querySelector('.cfx-opt-name').textContent = label;
				b.querySelector('.cfx-opt-note').textContent = note;
				b.onclick = () => {
					this.update({ [key]: key === 'style' ? (isOn(key) ? 'line' : 'block') : !isOn(key) });
					refreshSwitches();
				};
				opts.appendChild(b);
			}
			refreshSwitches();
		});
	}

	intensityDialog() {
		this.dialog('Effect intensity', (box) => {
			const MIN = 0.3, MAX = 2;
			const name = (v) => (v < 0.7 ? 'Subtle' : v < 1.25 ? 'Normal' : v < 1.7 ? 'Strong' : 'Intense');
			box.insertAdjacentHTML('beforeend', `
				<div class="cfx-orb"><i></i></div>
				<div class="cfx-label">Strength</div>
				<div class="cfx-readout"><span class="cfx-big"></span><span class="cfx-mode"></span></div>
				<div class="cfx-sl" tabindex="0"><div class="cfx-sl-track"></div><div class="cfx-sl-fill"></div><div class="cfx-sl-thumb"></div></div>
				<div class="cfx-ticks"><span>Subtle</span><span>Normal</span><span>Intense</span></div>
				<div class="cfx-foot"><button class="cfx-btn" data-r>Reset</button><button class="cfx-btn primary" data-d>Done</button></div>`);
			const sl = box.querySelector('.cfx-sl'), fill = box.querySelector('.cfx-sl-fill'), thumb = box.querySelector('.cfx-sl-thumb');
			const big = box.querySelector('.cfx-big'), mode = box.querySelector('.cfx-mode'), orb = box.querySelector('.cfx-orb i');
			const show = (v) => {
				const f = (v - MIN) / (MAX - MIN);
				fill.style.width = f * 100 + '%'; thumb.style.left = f * 100 + '%';
				big.textContent = v.toFixed(1) + '×'; mode.textContent = name(v);
				orb.style.boxShadow = `0 0 ${6 + v * 14}px ${v * 3}px ${rgba(this.col(), Math.min(0.9, 0.25 + v * 0.3))}, 0 0 ${10 + v * 34}px ${v * 6}px ${rgba(this.acc(), 0.35)}`;
			};
			const set = (v) => { v = Math.round(Math.min(MAX, Math.max(MIN, v)) * 10) / 10; this.live({ intensity: v }); show(v); };
			this.drag(sl, (x) => set(MIN + x * (MAX - MIN)));
			sl.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(this.cfg.intensity + 0.1); }
				if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(this.cfg.intensity - 0.1); }
			});
			box.querySelector('[data-r]').onclick = () => set(1);
			box.querySelector('[data-d]').onclick = () => this.closeDialog();
			show(this.cfg.intensity);
			sl.focus();
		});
	}

	// Cycles the colour presets, then the special presets from the registry.
	nextPreset() {
		const list = this.presetList();
		this.preset = (this.preset + 1) % list.length;
		const [name, color, accent, fx] = list[this.preset];
		this.update({ color, accent, fx });
		this.ui.addToaster({ title: 'Caret FX', message: `Color: ${name}`, dismissible: true, autoDestroyTime: 1500 });
	}

	// ---- caret tracking ----------------------------------------------------------------

	// Only Thymer's own caret element counts. A page can hold several editors (a journal has one
	// per day), each with its own caret element; unfocused ones are marked .caret-inactive.
	// Form fields, the command palette and other plugins' inputs are deliberately ignored.
	caretRect() {
		const panel = document.querySelector(FOCUSED_PANEL_SEL);
		const focusEl = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
		const focusEditor = focusEl && focusEl.closest ? focusEl.closest('listview-editor') : null;
		const focusBox = focusEl ? focusEl.getBoundingClientRect() : null;
		let best = null, bestRect = null, bestScore = -1e9;
		for (const n of document.querySelectorAll(CARET_SEL)) {
			if (n.classList.contains('caret-inactive')) continue;
			const b = n.getBoundingClientRect();
			if (!(b.height > 0.5)) continue;
			const cs = getComputedStyle(n);
			if (cs.display === 'none' || cs.visibility === 'hidden') continue; // not opacity: the blink animation toggles it
			let score = 0;
			if (panel && panel.contains(n)) score += 2;
			if (focusEditor && focusEditor.contains(n)) score += 4;
			if (focusBox) { const dy = Math.max(0, focusBox.top - b.bottom, b.top - focusBox.bottom); score -= Math.min(dy, 5000) / 5000; } // nearer to the focused element wins ties
			if (score > bestScore) { best = n; bestRect = b; bestScore = score; }
		}
		if (best !== this.caretEl) { this.caretEl = best; this.clipT = 0; }
		if (!best) return null;
		// x from the caret element. Top/height from the text next to the caret (exact visual line), else from the
		// row's text, and only when that box actually sits on the caret's line: anything farther is the wrong row
		// or another wrapped line, and the caret element's own box is used instead.
		const midY = (bestRect.top + bestRect.bottom) / 2;
		const onLine = (lt) => lt && Math.abs(lt.top - bestRect.top) <= bestRect.height && lt.top <= midY + 1 && lt.top + lt.height >= midY - 1;
		let lt = charRectAt(bestRect.left + 1, midY);
		if (!onLine(lt)) lt = lineTextRect(rowForCaret(best, bestRect), midY);
		if (!onLine(lt)) lt = null;
		const y = lt ? lt.top : bestRect.top, h = lt ? lt.height : bestRect.height;
		// Block cursor: as wide as the character under the caret; a sensible width at an empty spot.
		const cw = (lt && lt.width > 1 ? lt.width : 0) || Math.max(6, h * 0.5);
		// cw: the character's width, in either style. lw: the line caret's own width, for the effects that stand in for it.
		const lw = bestRect.width >= 0.5 && bestRect.width <= 8 ? bestRect.width : 2;
		return { x: bestRect.left, y, w: this.cfg.style === 'block' ? cw : 2, h, cw, lw };
	}

	// Effects are confined to the editor's scroll area, between the title bar and the status bar.
	clipRect() {
		const now = performance.now();
		if (this.clipT && now - this.clipT < 100) return this.clip;
		this.clipT = now;
		let top = 0, bottom = window.innerHeight, left = 0, right = window.innerWidth;
		const tb = document.querySelector('.title-bar');
		if (tb) { const b = tb.getBoundingClientRect(); if (b.height > 0 && b.top <= b.height) top = Math.max(top, b.bottom); }
		const sb = document.querySelector('.statusbar--status-bar');
		if (sb && isVisiblyRendered(sb)) { const b = sb.getBoundingClientRect(); if (b.height > 0) bottom = Math.min(bottom, b.top); }
		const panel = (this.caretEl && this.caretEl.closest('.panel')) || document.querySelector(FOCUSED_PANEL_SEL);
		const scroller = panel && (panel.querySelector('.panel-scroller-y') || panel);
		if (scroller) {
			const b = scroller.getBoundingClientRect();
			top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom);
			left = Math.max(left, b.left); right = Math.min(right, b.right);
		}
		this.clip = bottom > top && right > left ? { x: left, y: top, w: right - left, h: bottom - top } : null;
		return this.clip;
	}

	sample(typed) {
		// Whichever event notices the caret move first (input, selection, DOM change) may not know it was typing.
		typed = typed || performance.now() - (this.lastTypeKey || 0) < 220;
		if (document.querySelector(MODAL_SEL)) return; // command palette / dropdown open: leave the editor caret alone
		const cur = this.caretRect();
		this.sampleN++;
		if (!cur) { this.updateBlock(null); this.notifySample(null, typed, false); return; }
		const prev = this.last;
		this.last = cur;
		const moved = !prev || Math.hypot(cur.x - prev.x, cur.y - prev.y) >= 0.5;
		this.updateBlock(cur, moved);
		this.notifySample(cur, typed, moved);
		if (!prev) return this.addPulse(cur);

		const dx = cur.x - prev.x, dy = cur.y - prev.y;
		const dist = Math.hypot(dx, dy);
		if (!moved) return; // same position: key repeat/blink/duplicate events must not stack effects

		const info = { typed, dist, dx, dy, now: performance.now() };
		for (const e of this.activeEffects()) this.callHook(e, 'onMove', prev, cur, info);
		this.kick();
	}

	// Every look at the caret, moved or not (a Delete key moves nothing): the effects that watch the text read it here.
	notifySample(cur, typed, moved) {
		const info = { typed, moved, now: performance.now() };
		for (const e of this.activeEffects()) this.callHook(e, 'onSample', cur, info);
	}

	// Shows the current look at the caret (first sight of the caret, theme or config change).
	addPulse(rect) {
		const now = performance.now();
		for (const e of this.activeEffects()) e.onPulse?.(this, rect, now);
		this.kick();
	}

	// ---- rendering ---------------------------------------------------------------------

	mountCanvas() {
		const cv = document.createElement('canvas');
		cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:500;';
		document.body.appendChild(cv);
		this.canvas = cv;
		this.ctx = cv.getContext('2d');
		this.resize();
	}

	resize() {
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = Math.round(window.innerWidth * dpr);
		this.canvas.height = Math.round(window.innerHeight * dpr);
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		if (this.items.length) this.kick();   // resizing clears the canvas: a still item (the tether) would not come back by itself
	}

	kick() { if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame()); }

	frame() {
		this.raf = 0;
		const ctx = this.ctx, now = performance.now();
		ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
		const clip = this.clipRect();
		ctx.save();
		if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
		this.renderItems(now);
		ctx.restore();
		if (this.items.some((it) => !it.rest)) this.kick();   // a still item is redrawn with the others but needs no frames of its own
	}

	// Draws every live item through its effect's draw(); the blend mode comes from the effect. Also used by the dialog preview.
	renderItems(now) {
		const ctx = this.ctx, k = this.cfg.intensity;
		const dt = Math.min(48, this.lastT ? now - this.lastT : 16);
		this.lastT = now;
		this.items = this.items.filter((it) => !it.done && now - it.t0 < it.dur);
		// Draw in registry order (not insertion order): a long-lived particle item must not sink under newer items.
		const order = Object.keys(EFFECTS);
		this.items.sort((a, b) => order.indexOf(a.effect) - order.indexOf(b.effect));
		for (const it of this.items) {
			const e = EFFECTS[it.effect];
			if (!e) { it.done = true; continue; }
			ctx.globalCompositeOperation = e.blend || 'source-over';
			try { e.draw(this, ctx, it, (now - it.t0) / it.dur, k, now, dt); } catch (err) { it.done = true; this.warnOnce(e, 'draw', err); }
		}
		ctx.globalCompositeOperation = 'source-over';
		this.items = this.items.filter((it) => !it.done);
		if (!this.items.some((it) => !it.rest)) this.lastT = 0;   // nothing animating: the next frame starts a fresh clock
	}
}

