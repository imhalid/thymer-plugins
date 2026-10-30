/**
 * Caret FX
 *
 * Animated caret effects while you type: a glow that flares on each key, a neovide-style hop, a comet ribbon the
 * caret draws behind itself as it moves, and signature effects (lightning, falling petals and leaves).
 * Inspired by the Ghostty cursor_blaze / cursor_lightning shaders.
 *
 * Four more effects - Motion smear, Fresh ink, Bracket tether and Back-man (the caret that eats what
 * Backspace and Delete take) - are ported from Cursor-Smith by Sadsnake1
 * (https://github.com/Sadsnake1/cursor-smith, MIT License). See THIRD-PARTY NOTICE below.
 * They are off until chosen on the "Caret FX: open settings" page: Motion smear is a switch there (with the block
 * cursor), and so is Bracket tether; Fresh ink and Back-man are special presets, like Lightning and the falling petals.
 *
 * Six special presets are original to this plugin, with colors of their own like Sakura and Lightning: Holy
 * (tiny star glints that twinkle on the caret, like a gem), Prism (two crescents of spectrum flanking the caret, light
 * through a lens), Health (tiny pluses rising out of the caret as you write, each with a trail of light, as if you were gaining health) and Zephyr (an anime-style wind skill: speed lines and leaves swept up round the caret) and Tide
 * (a stylized water skill: sprays of teardrops and drifting bubbles), and Stitch (a running stitch sewn under the line
 * as you write, in the thread of the theme). Pick them on the "Caret FX: open settings" page under Special.
 *
 * Two more are switches like Motion smear: Sleepy caret (the caret dozes off when you stop writing, z's floating up,
 * and wakes with a stretch) and Confetti (a task ticked off bursts into confetti from its checkbox). Both start off.
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
 * choose on the settings page and with the commands is kept per device and wins over it.
 *
 * The settings page ("Caret FX: open settings") is a page in a panel, opened the way a note is (registerCustomPanelType):
 * a scratch area to type in, where the caret and its effects run for real, then the presets, the switches and the
 * intensity. See "THE SETTINGS PAGE" in the Plugin class.
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

// The switches on the settings page, in its order: [key, label, caption]. 'style' is the block cursor (cfg.style is
// 'block' when on); every other key is the id of an 'always' effect. An effect here has no toggle command of its own.
// (Fresh ink and Back-man are not here: they are special presets, one at a time like Lightning.)
const PAGE_SWITCHES = [
	['style', 'Block cursor', 'A box the width of the letter'],
	['smear', 'Motion smear', 'Stretches as it moves, snaps back'],
	['trail', 'Trail', 'A comet ribbon behind the caret'],
	['bounce', 'Bounce', 'A hop on every letter'],
	['sleep', 'Sleepy caret', 'Dozes off when you stop writing'],
	['confetti', 'Confetti', 'A burst when you tick off a task'],
	['tether', 'Bracket tether', 'A line under the span between matching brackets or quotes'],
];

// The settings page
const PAGE_TYPE = 'caretfx';          // its panel type (registerCustomPanelType)
const NOTE_KEY = 'caretfx.note';      // what was typed in its scratch area, kept on this device
const NOTE_DEFAULT = ['Type here to see the caret and its effects.', 'Skip words with the arrow keys, press Enter, delete something; (a bracket) and "a quote" for the tether.', ''];
const INTENSITY_MIN = 0.3, INTENSITY_MAX = 2;

// Stacking: the effects (canvas, block cursor) sit above the editor, whose layers top out at 11, and below Thymer's own
// menus, command palette and dialogs (z-index 998 and up), so nothing of the caret shows through or over them. The
// settings page of this plugin is a page in a panel, like a note, and its own caret element is followed like Thymer's.

// What the settings page and the commands choose is kept in this device's localStorage and laid over the configuration JSON, which
// stays the place for defaults and tuning. (Saving the plugin's configuration reloads the plugin - the page would
// be torn down at every click - and AppPlugin has no way to save it quietly.)
const CHOICES_KEY = 'caretfx.choices';
function loadChoices() {
	try { return JSON.parse(localStorage.getItem(CHOICES_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function saveChoices(patch) {
	try { localStorage.setItem(CHOICES_KEY, JSON.stringify({ ...loadChoices(), ...patch })); } catch (e) { /* keep the in-memory value */ }
}

// Thymer DOM the plugin relies on (same hooks Thymer's own caret CSS uses).
const CARET_SEL = 'div.listview-caret-self, div.cfx-pcaret';   // Thymer's caret, and the settings page's own (see renderPage)
const FOCUSED_PANEL_SEL = '.panel.focused-panel, .panel.has-focus';
const LISTITEM_SEL = '.listitem[data-guid], .cfx-row[data-guid]';   // an editor row, and a row of the settings page's scratch area
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

/** Thymer marks the theme on <html> (is-dark / is-light; theme-dark / theme-light on older builds); fall back to the
 * body background luminance. (A custom theme may leave the body transparent, so the classes come first.) */
function isDarkTheme() {
	const h = document.documentElement.classList, b = document.body.classList;
	if (h.contains('is-dark')) return true;
	if (h.contains('is-light')) return false;
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
	const line = lineDivOf(row);
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
const lineDivOf = (row) => (row instanceof HTMLElement ? row.querySelector(':scope > .line-div, :scope > .cfx-line') || row.querySelector('.line-div, .cfx-line') : null);

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
const rowByGuid = (guid) => (guid ? document.querySelector(`.listitem[data-guid="${CSS.escape(guid)}"], .cfx-row[data-guid="${CSS.escape(guid)}"]`) : null);

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

// =====================================================================================
// EFFECT REGISTRY
//
// HOW TO ADD AN EFFECT
//   EFFECTS.myfx = { id, label, mode, defaults, blend, onMove, draw, preview, ... };
//   - mode 'always': runs whenever cfg[id] is true (toggle command generated; toggleable:false = always on).
//     mode 'signature': runs when cfg.fx === id; needs preset { name, color, accent } for the settings page's Special grid.
//   - defaults: extra config keys, merged into DEFAULTS automatically.
//     defaultOn: false keeps an 'always' effect off until it is toggled (new effects should not change a look that exists).
//   - onMove(plugin, prev, cur, info): after the caret moved; info = { typed, dist, dx, dy, now }.
//     Push items onto plugin.items as { effect: id, t0, dur, ...own fields } (dur: Infinity for long-lived ones).
//   - onSample(plugin, cur, info): after every look at the caret, moved or not, with cur null when there is no caret;
//     info = { typed, moved, now }. For effects that watch the text (what was typed, what is bracketed).
//   - onKey(plugin, e, now): on a keydown in the editor, before the editor has acted on it (the DOM is still as it was).
//   - onTaskDone(plugin, box, now): a task was ticked off by a click or a key; box = { x, y, w, h } of its checkbox on screen.
//   - onDrop(plugin): the effect is switched off or the plugin unloads (keepsState effects): clear timers it set.
//   - onPulse(plugin, rect, now): optional; a gentle "show the current look" trigger (theme/config change).
//   - onShift(plugin, dx, dy, now): optional; the page scrolled under a still caret, which moved by (dx, dy) on screen
//     without moving in the text. An effect that keeps screen positions (the trail's path) moves them along; it is not a move.
//   - draw(plugin, ctx, item, p, k, now, dt): p = progress 0..1, k = intensity, dt = ms since last frame.
//     Items are removed when p >= 1 or item.done = true. blend: 'lighter' | 'source-over' (set by the core).
//     A still item (item.rest = true) is redrawn whenever a frame runs but does not ask for frames of its own.
//   - preview(plugin, pv, caret, now): optional; a demo on a preview canvas (unused since the settings page has a real scratch
//     area to type in; kept for a preview elsewhere). Without one, such a
//     preview types for the effect: onMove is called with a letter's step (typed) now and then and a jump once in a while.
//   - Effects that keep state or take over the caret: plugin.state(id) is their state bag, plugin.ensureItem(id) their one
//     long-lived item, plugin.hideCaret(id, on) hides Thymer's caret while they draw their own; ownsCaret: true says the
//     effect is the caret whenever it runs (Motion smear then stands aside). keepsState: true has the
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

	if (!plugin.dark) ctx.globalCompositeOperation = 'source-over';   // adding light to a light page shows nothing
	if (!small) {   // where the bolt lands, a flash that fades with it
		const R = Math.max(to.h, 16) * 1.3 * k, g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
		g.addColorStop(0, rgba(plugin.col(), 0.5 * flash));
		g.addColorStop(0.4, rgba(plugin.acc(), 0.22 * flash));
		g.addColorStop(1, rgba(plugin.acc(), 0));
		ctx.fillStyle = g;
		ctx.fillRect(b.x - R, b.y - R, R * 2, R * 2);
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
// A soft halo opens round the caret with each key - taller than it is wide, so it hugs the caret rather than sitting on it
// like a coin - and the caret itself flares white-hot for an instant.
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
		if (!plugin.dark) ctx.globalCompositeOperation = 'source-over';   // adding light to a light page shows nothing: a fainter halo of color instead
		const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, K = Math.min(k, 1.5) * (plugin.dark ? 1 : 0.6);
		const r = rect.h * (0.9 + p * 1.6) * k, a = (1 - p) * (1 - p) * 0.55 * K;
		ctx.save();
		ctx.translate(cx, cy);
		ctx.scale(0.7, 1);
		const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
		g.addColorStop(0, rgba(plugin.col(), a));
		g.addColorStop(0.45, rgba(plugin.acc(), a * 0.35));
		g.addColorStop(1, rgba(plugin.acc(), 0));
		ctx.fillStyle = g;
		ctx.fillRect(-r, -r, r * 2, r * 2);
		ctx.restore();
		// The flare, on the caret for a few frames - not while an effect draws the caret in a shape of its own (Slime, the smear, Back-man).
		const flare = Math.pow(1 - p, 4) * (plugin.cfg.style === 'block' ? 0.3 : 0.8) * K;
		if (flare > 0.02 && !plugin.caretHolders.size) {
			ctx.fillStyle = plugin.dark ? `rgba(255,255,255,${flare})` : rgba(plugin.col(), flare);
			ctx.fillRect(rect.x - 0.5, rect.y, rect.w + 1, rect.h);
		}
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
		if (!plugin.dark) ctx.globalCompositeOperation = 'source-over';   // adding light to a light page shows nothing
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

// ---- Effect: Trail (a comet ribbon the caret draws behind itself) ----------------------------------------------------
// The caret's path is kept for a moment and drawn as one ribbon: the caret's full height where it is now, narrowing to a
// point and fading toward where it was, never taller than the caret, a soft halo in the accent color round it and a bright
// thread down its middle. The
// tail flutters a little as it fades, like a ribbon let go in the air. Typing draws it out letter by letter behind the
// caret, and so does any move along the line (a word skipped, a click farther on); a move to another line (Enter, a click
// elsewhere) is one sweep, short-lived, that collapses toward where the caret landed. A line up or down by arrow key lets
// go of the ribbon, which fades where it is. When the page scrolls the ribbon goes along with the text.
// Settings: trailMs (how long the ribbon lingers; 900 is normal), trailReach (how far back it reaches while typing, in caret
// heights; 3 is normal - a sweep keeps its whole length), trailMinWidths (a move farther than this many caret
// heights is a jump).
const TRAIL_PIECE_PX = 9;     // the ribbon is drawn in pieces about this long, each with its own width and fade
const TRAIL_MAX_PTS = 160;    // the most points of the path kept
const TRAIL_EDGE_PX = 1.5;    // half the width of a stretch that runs straight up or down (it has no caret height to spread over)
const TRAIL_HOLD = 0.35;      // the share of its time a piece of the ribbon stays at full strength before it eases away
const TRAIL_END = 0.72;       // from this share of a ribbon's reach back, its tail eases out to nothing
const TRAIL_SWEEP = 0.55;     // a sweep (to another line) lives this share of the ribbon's time: a flash of a blaze, not a stripe left on the page

/** How long the ribbon lingers, from the settings. */
const trailDur = (plugin) => clamp(Number(plugin.cfg.trailMs) || 900, 200, 5000);

/** The item that holds the path of `host` (the plugin, or a preview host). */
function trailOf(host) {
	const item = host.ensureItem('trail');
	if (!item.pts) { item.pts = []; item.broken = false; item.attached = false; }
	return item;
}

/** A point of the path: the caret's left edge and middle, its height, when it was there; `gap` begins a new ribbon there. */
const trailPoint = (r, t, gap) => ({ x: r.x + 1, y: r.y + r.h / 2, h: r.h, t, gap });

/**
 * One ribbon of the path (two points or more, oldest first), resampled into short pieces. Each piece has its own half
 * height - the caret's at the head, down to nothing at the tail, by its age and by how far back along the ribbon it is -
 * its own fade, and its own flutter, a wave that grows toward the tail as the ribbon ages. Its edge runs up and down over
 * the caret's height where the ribbon runs along the line, and a little sideways where it runs up or down the page.
 * Three passes: the halo, the body, the thread.
 */
function drawRibbon(ctx, ribbon, now, dur, reach, K, col, acc, core) {
	const nodes = [];
	for (let a = 0; a + 1 < ribbon.length; a++) {
		const p = ribbon[a], q = ribbon[a + 1], n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / TRAIL_PIECE_PX));
		for (let s = a ? 1 : 0; s <= n; s++) { const f = s / n; nodes.push({ x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f), h: lerp(p.h, q.h, f), t: lerp(p.t, q.t, f) }); }
	}
	const last = nodes.length - 1;
	let L = 0;
	for (let a = last; a >= 0; a--) { if (a < last) L += Math.hypot(nodes[a + 1].x - nodes[a].x, nodes[a + 1].y - nodes[a].y); nodes[a].d = L; }   // the way back from the head
	const span = Math.min(Math.max(L, nodes[last].h * 2), reach);   // a short ribbon (a letter or two) is hardly tapered at all; a long one is cut to its reach
	for (let a = 0; a <= last; a++) {
		const n = nodes[a], u = clamp01((now - n.t) / dur), s = Math.min(1, n.d / span);
		const f = u < TRAIL_HOLD ? 1 : 1 - smoothStep((u - TRAIL_HOLD) / (1 - TRAIL_HOLD));   // full for a while, then eased away
		n.hh = n.h * 0.46 * (0.08 + 0.92 * Math.sqrt(f) * Math.pow(1 - s, 0.7));   // a little inside the caret's height at the head
		n.a = f * (1 - 0.5 * s) * (s < TRAIL_END ? 1 : 1 - smoothStep((s - TRAIL_END) / (1 - TRAIL_END)));   // and out to nothing at the end of its reach
		n.yy = n.y + Math.sin(now * 0.012 + n.d * 0.08) * n.h * 0.18 * Math.min(1, u * 1.5) * s;
		const b = nodes[Math.min(last, a + 1)], c = nodes[Math.max(0, a - 1)], dx = b.x - c.x, dy = b.y - c.y, len = Math.hypot(dx, dy);
		let nx = 0, ny = 1;
		if (len > 1e-6) { nx = -dy / len; ny = dx / len; if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; } }   // always the same side up, so a ribbon that turns back never twists
		n.ex = nx * TRAIL_EDGE_PX; n.ey = ny;
	}
	const quad = (p, q, wp, wq, m) => {
		ctx.beginPath();
		ctx.moveTo(p.x - p.ex * m, p.yy - p.ey * wp); ctx.lineTo(q.x - q.ex * m, q.yy - q.ey * wq);
		ctx.lineTo(q.x + q.ex * m, q.yy + q.ey * wq); ctx.lineTo(p.x + p.ex * m, p.yy + p.ey * wp);
		ctx.closePath();
		ctx.fill();
	};
	for (let a = 0; a < last; a++) {   // the halo, wide and faint
		const p = nodes[a], q = nodes[a + 1], al = (p.a + q.a) / 2;
		if (al < 0.01) continue;
		ctx.fillStyle = rgba(acc, 0.18 * al * K);
		quad(p, q, Math.min(p.hh * 1.25 + 0.5, p.h / 2), Math.min(q.hh * 1.25 + 0.5, q.h / 2), 2.2);   // never taller than the caret
	}
	for (let a = 0; a < last; a++) {   // the body
		const p = nodes[a], q = nodes[a + 1], al = (p.a + q.a) / 2;
		if (al < 0.01) continue;
		ctx.fillStyle = rgba(col, 0.52 * al * K);
		quad(p, q, p.hh, q.hh, 1);
	}
	ctx.lineWidth = 1;
	ctx.lineCap = 'butt';
	for (let a = 0; a < last; a++) {   // the thread
		const p = nodes[a], q = nodes[a + 1], al = Math.pow((p.a + q.a) / 2, 1.6) * 0.9 * K;
		if (al < 0.01) continue;
		ctx.strokeStyle = rgba(core, al);
		ctx.beginPath(); ctx.moveTo(p.x, p.yy); ctx.lineTo(q.x, q.yy); ctx.stroke();
	}
}

EFFECTS.trail = {
	id: 'trail', label: 'Trail', mode: 'always',
	defaults: { trailMinWidths: 1.5, trailMs: 900, trailReach: 3 },
	blend: 'lighter',
	onMove(plugin, prev, cur, info) {
		const item = trailOf(plugin), dur = trailDur(plugin), pts = item.pts, now = info.now;
		const sameLine = Math.abs(info.dy) < cur.h * 0.6, far = info.dist > cur.h * plugin.cfg.trailMinWidths;
		if (sameLine) {
			// Along the line the ribbon simply follows the caret - a letter typed, a word skipped with the arrow keys, a click
			// farther along: one ribbon, reaching a few letters back (a stub left at every word would not be a trail).
			if (item.broken || !pts.length) { pts.push(trailPoint(prev, now - dur * 0.3, true)); item.broken = false; }
			pts.push(trailPoint(cur, now, false));
		} else if (far || info.typed) {
			// Another line: a sweep, a short-lived ribbon of its own from where the caret was - given some age at once, so it
			// collapses toward the caret from its first frame - to where it landed. The next move along the line starts afresh.
			const life = dur * TRAIL_SWEEP;
			pts.push({ ...trailPoint(prev, now - life * 0.4, true), sweep: true });
			pts.push({ ...trailPoint(cur, now, false), sweep: true });
			item.broken = true;
		} else { item.broken = true; item.attached = false; return; }   // a line up or down by arrow key: nothing, the ribbon lets go
		item.attached = true;   // the newest point is the caret
		if (pts.length > TRAIL_MAX_PTS) pts.splice(0, pts.length - TRAIL_MAX_PTS);
	},
	onShift(plugin, dx, dy) {   // the page scrolled: the ribbon goes with the text
		const item = plugin.items.find((it) => it.effect === 'trail' && !it.done);
		if (item && item.pts) for (const q of item.pts) { q.x += dx; q.y += dy; }
	},
	onSample(plugin, cur) {   // the caret gone (another page): nothing may stay drawn where it was
		if (cur) return;
		const item = plugin.items.find((it) => it.effect === 'trail' && !it.done);
		if (item) { item.pts = []; item.done = true; }
	},
	draw(plugin, ctx, item, p, k, now) {
		const dur = trailDur(plugin), reach = Math.max(0.5, Number(plugin.cfg.trailReach) || 3);
		// A point past its time goes - unless the point after it, in the same ribbon, is still alive: then it stays as the far
		// end of that stretch, which fades toward the live end rather than vanishing whole.
		const dead = (q) => now - q.t >= (q.sweep ? dur * TRAIL_SWEEP : dur), all = item.pts, pts = [];
		for (let i = 0; i < all.length; i++) {
			const q = all[i], next = all[i + 1];
			if (!dead(q) || (next && !next.gap && !dead(next))) pts.push(q);
			else if (q.gap && next) next.gap = true;   // the ribbon still begins where it began
		}
		item.pts = pts;
		if (!pts.length) { item.done = true; return; }
		const dark = plugin.dark, K = Math.min(k, 1.5) * (dark ? 1 : 0.55), col = plugin.col(), acc = plugin.acc(), core = dark ? '#ffffff' : lighten(col, 0.45);
		if (!dark) ctx.globalCompositeOperation = 'source-over';   // adding light to a light page shows nothing: drawn as a (fainter) band of color instead
		// While Motion smear carries the caret across (its leading point still on its way), the ribbon ends on the smear, not
		// ahead of it at the place the caret will arrive.
		const sm = plugin.fxState.smear, lead = sm && sm.lead && plugin.items.some((it) => it.effect === 'smear' && !it.done) ? sm.lead : null;
		for (let i = 0; i < pts.length;) {   // ribbon by ribbon: a gap begins a new one
			let j = i + 1;
			while (j < pts.length && !pts[j].gap) j++;
			if (j - i >= 2) {
				const ribbon = pts.slice(i, j);
				if (lead && item.attached && j === pts.length) { const head = ribbon[ribbon.length - 1]; ribbon[ribbon.length - 1] = { ...head, x: lead.x + 1, y: lead.y + head.h / 2 }; }
				const sweep = ribbon.some((q) => q.sweep);
				drawRibbon(ctx, ribbon, now, sweep ? dur * TRAIL_SWEEP : dur, sweep ? Infinity : reach * ribbon[ribbon.length - 1].h, K, col, acc, core);
			}
			i = j;
		}
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
	// `n` petals or leaves off the caret `r`; a `gust` (a new line) flings them up and out, one after another.
	const spawn = (host, r, n, now, gust) => {
		const k = Math.min(host.cfg.intensity, 1.6);
		let item = host.items.find((i) => i.effect === id && !i.done);
		if (!item) { item = { effect: id, t0: now, dur: Infinity, parts: [] }; host.items.push(item); }
		for (let i = 0; i < n && item.parts.length < 40; i++) {
			item.parts.push({
				def: pd, tone: pd.tones[Math.floor(Math.random() * pd.tones.length)],
				x: r.x + (Math.random() - 0.5) * 6, y: r.y + r.h * (0.15 + Math.random() * 0.5),
				vx: gust ? (Math.random() - 0.5) * 0.3 : (Math.random() - 0.25) * 0.09,   // px/ms, pops up a little first; a gust flings it
				vy: gust ? -0.1 - Math.random() * 0.16 : -0.05 - Math.random() * 0.1,
				size: (pd.size[0] + Math.random() * (pd.size[1] - pd.size[0])) * (0.8 + 0.25 * k),
				rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.006,
				flip: Math.random() * 6, flipSpd: 0.004 + Math.random() * 0.005,       // flutter: turns edge-on
				phase: Math.random() * 6.28, sway: (0.00022 + Math.random() * 0.00022) * pd.sway,
				t0: now + (gust ? i * 30 : 0), life: 1700 + Math.random() * 1500,
			});
		}
	};
	return {
		id, label: def.label, mode: 'signature', preset: def.preset, defaults: {}, blend: 'source-over',
		onMove(plugin, prev, cur, info) {
			if (!info.typed) return;
			if (info.dy >= cur.h * 0.8) spawn(plugin, cur, 3 + Math.floor(Math.random() * 3), info.now, true);   // a new line shakes a few loose
			else if (Math.random() < 0.18 + 0.12 * Math.min(plugin.cfg.intensity, 1.6)) spawn(plugin, cur, 1, info.now, false);   // roughly one letter in three drops one
		},
		draw(plugin, ctx, item, p, k, now, dt) {
			item.parts = item.parts.filter((q) => now - q.t0 < q.life && q.y < window.innerHeight + 20);
			if (!item.parts.length) { item.done = true; return; }
			for (const q of item.parts) {
				if (now < q.t0) continue;   // not yet loose
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
			spawn(pv, caret, 1, now, false);
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
// face sweeps, so the shape is a parallelogram in every frame. A move to another line is smeared like any other. While it
// moves, Thymer's caret (or the block cursor) is hidden and the quad is drawn in its place; when it has arrived, the real
// caret is shown again.
// Not ported: Tapered trail, Max length and Conserve area, which Cursor-Smith leaves off by default.
// Settings: smearStiffness (the leading point), smearTrailingStiffness, smearDamping, each 0..1.
const SMEAR_MAX_STEP = 1 / 240;     // s: the spring is integrated in steps this small, so every frame rate swings alike
const SMEAR_SETTLE_V = 30;          // px/s: slower than this and within half a pixel of the caret, the smear has arrived
const SMEAR_KEY_STEP_CHARS = 2.5;   // a move along the row by at most this many letters is the keyboard's (typing, an arrow)...
const SMEAR_KEY_STEP_MS = 200;      // ...and for this long after one the leading edge sits on the caret: only the tail trails

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

/** Whether another effect has the caret - Back-man while it eats, or the signature effect in use when it draws the caret itself (Slime): Motion smear stands aside, or there would be two carets. */
function caretTaken(plugin) { return backManBusy(plugin) || !!(EFFECTS[plugin.cfg.fx] && EFFECTS[plugin.cfg.fx].ownsCaret); }

EFFECTS.smear = {
	id: 'smear', label: 'Motion smear', mode: 'always', defaultOn: false, keepsState: true, blend: 'source-over',
	defaults: { smearStiffness: 0.6, smearTrailingStiffness: 0.4, smearDamping: 0.8 },
	onMove(plugin, prev, cur, info) {
		if (caretTaken(plugin)) return;   // the creature, or the jelly, has the caret
		const S = plugin.state('smear');
		const dx = Math.abs(cur.x - prev.x), dy = Math.abs(cur.y - prev.y);
		// A letter's step: along the row (a little jitter in the text's box allowed) by at most a couple of letters, measured
		// against the line height as well as the letter under the caret, which may be a narrow one when the one just typed was wide.
		if (dy < cur.h * 0.5 && dx > 0.5 && dx <= SMEAR_KEY_STEP_CHARS * Math.max(cur.cw, cur.h * 0.5)) S.stepT = info.now;
		if (dy > cur.h * 0.5) S.stepT = 0;   // another line (Enter right after a letter, say): the leading edge is not held on the caret, the whole caret stretches across
		if (plugin.items.some((i) => i.effect === 'smear' && !i.done)) return;   // already under way: it chases the caret by itself
		S.lead = { x: prev.x, y: prev.y, vx: 0, vy: 0 };
		S.trail = { x: prev.x, y: prev.y };
		S.cx = prev.x + prev.w / 2; S.cy = prev.y + prev.h / 2; S.dir = null;
		plugin.items.push({ effect: 'smear', t0: info.now, dur: Infinity });
	},
	onShift(plugin, dx, dy) {   // the page scrolled: the smear's points go along, so nothing seems to have moved
		const S = plugin.state('smear');
		if (!S.lead) return;
		S.lead.x += dx; S.lead.y += dy; S.trail.x += dx; S.trail.y += dy; S.cx += dx; S.cy += dy;
	},
	draw(plugin, ctx, item, p, k, now, dt) {
		const S = plugin.state('smear'), rect = caretBox(plugin);
		if (!rect || !S.lead || caretTaken(plugin)) return finishSmear(plugin, item);
		const { corners, moving } = stepSmear(S, rect, dt / 1000, plugin.cfg, now - (S.stepT || 0) < SMEAR_KEY_STEP_MS);
		if (!moving) return finishSmear(plugin, item);
		plugin.hideCaret('smear', true);   // hidden only in a frame that draws the quad, so the caret never blinks out between the two
		item.hidesCaret = true;
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
// How it is drawn follows the preset (see TETHER_STYLES): a plain line, crackling lightning, petals, glints, a spectrum, a pulse...
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
 * { left, right, top, bottom }. The text measures itself - a span that wraps comes back already split at its wrap points -
 * and the boxes of one baseline (a bold stretch, a link) are folded into a single rule rather than a dashed row.
 */
function tetherSegments(line, from, to) {
	const rows = [];
	for (const r of line.rects(from, to + 1)) {
		const bottom = r.y + r.h;
		const row = rows.find((o) => Math.abs(o.bottom - bottom) < 1.5);
		if (row) { row.left = Math.min(row.left, r.x); row.right = Math.max(row.right, r.x + r.w); row.top = Math.min(row.top, r.y); }
		else rows.push({ left: r.x, right: r.x + r.w, top: r.y, bottom });
	}
	return rows.sort((a, b) => a.bottom - b.bottom || a.left - b.left);
}

EFFECTS.tether = {
	id: 'tether', label: 'Bracket tether', mode: 'always', defaultOn: false, keepsState: true, blend: 'source-over',
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
		const sig = segs ? segs.map((s) => `${Math.round(s.left)},${Math.round(s.right)},${Math.round(s.top)},${Math.round(s.bottom)}`).join('|') : '';
		const style = TETHER_STYLES[plugin.cfg.fx] || TETHER_STYLES.default, gk = sig + '#' + (span ? S.key : '') + (style.glyphs ? 'g' : '');
		if (gk === S.gk) return;
		S.gk = gk;
		S.segs = segs && segs.length ? segs : null;
		S.glyphs = S.segs && style.glyphs && span.to - span.from < TETHER_GLYPHS_MAX ? tetherGlyphs(cl.line, span.from, span.to) : null;   // the letters, for the styles that light them
		if (S.segs) tetherLay(S);
		S.bg = S.glyphs && style.patch ? tetherBackground(cl.line.el) : null;   // what a letter is painted out with, for the styles that redraw letters in the place of their own
		S.len = S.segs ? S.segs.reduce((n, s) => n + s.right - s.left, 0) : 0;
		if (!S.segs) { S.parts = []; tetherUnhide(S); }
		// A still item: it is redrawn whenever a frame runs, and asks for none of its own.
		if (S.segs) plugin.ensureItem('tether').rest = !style.animated;
		plugin.kick();
	},
	onDrop(plugin) { tetherUnhide(plugin.fxState.tether); },
	onShift(plugin, dx, dy) {   // the page scrolled: the pieces in the air go with the text (the rules themselves are measured afresh at the next look)
		const S = plugin.fxState.tether;
		if (S && S.parts) for (const q of S.parts) { q.x += dx; q.y += dy; }
	},
	draw(plugin, ctx, item, p, k, now, dt) {
		const S = plugin.state('tether');
		if (!S.segs) { tetherUnhide(S); item.done = true; return; }
		const alpha = clamp01(plugin.cfg.tetherStrength * Math.min(k, 1.5)), style = TETHER_STYLES[plugin.cfg.fx] || TETHER_STYLES.default;
		item.rest = !style.animated;   // an animated style asks for frames while the caret is inside a span
		if (style !== TETHER_STYLES.zephyr) tetherUnhide(S);
		if (alpha <= 0.01 || S.len < 2) { tetherUnhide(S); return; }   // the caret sits on its own match, an empty pair: nothing to mark
		const s = Math.min(0.05, Math.max(0, (dt || 16) / 1000));
		if (!S.parts) S.parts = [];
		S.parts = S.parts.filter((q) => now - q.t0 < q.life);
		for (const q of S.parts) { q.x += q.vx * s; q.y += q.vy * s; q.vx += (q.ax || 0) * s; q.vy += (q.ay || 0) * s; q.rot += (q.spin || 0) * s; }
		ctx.save();
		try { style.draw(plugin, ctx, S, now, s, Math.min(2.5, alpha / 0.35)); } catch (err) { tetherUnhide(S); throw err; }   // whatever goes wrong, the page's own letters come back
		ctx.restore();
	},
};

// How the span is marked follows the preset. Each style washes the whole of it - a highlight behind the text, faint enough
// to read through - and then does what the preset does: petals fall through it, glints twinkle in it, letters light up in
// turn, a jelly swallows it, water fills it. The canvas lies over the page, so what is drawn over a letter is drawn with
// care: a wash is a few hundredths of alpha, and a letter that glows is that letter again, in its own font, on itself.
// A style is { animated, glyphs, draw(plugin, ctx, S, now, dt, m) }: `animated` asks for frames of its own while the caret
// is inside a span, `glyphs` has the letters measured, S holds segs (a rule per visual line: left, right, top, bottom),
// glyphs, parts (pieces in the air) and acc (what each emitter has stored up), dt is in seconds and m the strength setting
// (1 at its default of 0.35).
const TETHER_GLYPHS_MAX = 700;   // a longer span has no letters lit one by one
const TETHER_PARTS_MAX = 36;
const TETHER_STYLES = {};
const tetherY = (s) => s.bottom + TETHER_DROP;

/** Lays the span's rules end to end: each gets `cum`, how far along the span it begins, and each letter its `pos`, how far along the span it is - so that what sweeps through a span reads it in order, line after line. */
function tetherLay(S) {
	let cum = 0;
	for (const s of S.segs) { s.cum = cum; cum += s.right - s.left; }
	if (!S.glyphs) return;
	for (const g of S.glyphs) {
		const mid = g.top + g.h / 2;
		let row = S.segs[S.segs.length - 1];
		for (const s of S.segs) if (mid <= s.bottom + 2) { row = s; break; }
		g.pos = row.cum + clamp(g.x + g.w / 2 - row.left, 0, row.right - row.left);
	}
}

/** How far along the span (its rules laid end to end) a point of rule `s` at `x` is. */
const tetherAlong = (s, x) => (s.cum || 0) + clamp(x - s.left, 0, s.right - s.left);

/** Where a sweep of `speed` px a second is along a span of `len` px: it comes in 60 px before the start and goes out 60 px past the end, then again. */
const tetherSweep = (now, len, speed) => ((now * speed * 0.001) % (len + 120)) - 60;

/** The two ends of a span: [x, y] of the start of its first rule and of the end of its last. */
const tetherEnds = (segs) => [[segs[0].left, tetherY(segs[0])], [segs[segs.length - 1].right, tetherY(segs[segs.length - 1])]];

let TETHER_SCRATCH = null;
const tetherScratch = () => TETHER_SCRATCH || (TETHER_SCRATCH = document.createElement('canvas').getContext('2d'));

/** The letters of characters [from, to] of `line`, each with where it is drawn, the baseline it sits on, and the font and color it is drawn in. */
function tetherGlyphs(line, from, to) {
	const ctx = tetherScratch(), hosts = new Map(), metrics = new Map(), out = [], text = line.text;
	for (let i = from; i <= to && i < text.length; i++) {
		let ch = text[i];
		if (!ch.trim()) continue;
		if (ch >= '\ud800' && ch <= '\udbff') ch = text.slice(i, i + 2);   // a surrogate pair is one letter
		else if (ch >= '\udc00' && ch <= '\udfff') continue;
		const r = line.charRect(i, ch.length);
		if (!r) continue;
		const host = line.styleHost(i);
		let st = hosts.get(host);
		if (!st) { const cs = getComputedStyle(host); st = { font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, color: cs.color }; hosts.set(host, st); }
		let mt = metrics.get(st.font);
		if (!mt) { ctx.font = st.font; const t = ctx.measureText('M'); mt = { a: t.fontBoundingBoxAscent ?? 11, d: t.fontBoundingBoxDescent ?? 3 }; metrics.set(st.font, mt); }
		let k = line.nodes.length - 1;
		while (k > 0 && line.starts[k] > i) k--;
		out.push({ ch, node: line.nodes[k], off: i - line.starts[k], x: r.x, w: r.w, h: r.h, top: r.y, y: r.y + mt.a + (r.h - mt.a - mt.d) / 2, st, n: out.length, h1: hash(out.length * 1.93 + from * 0.37), h2: hash(out.length * 4.71 + 9.1) });
	}
	return out;
}

/** Lets go of the letters Zephyr has hidden (they are drawn by the canvas while they lean). */
function tetherUnhide(S) {
	if (S && S.hlKey !== undefined) { S.hlKey = undefined; try { CSS.highlights.delete('cfx-gust'); } catch (e) { /* none to delete */ } }
}

/** The color of the page behind `el` as a CSS color, or null when it cannot be told (a gradient, an image). Any color syntax the browser reads is read, by painting it on a pixel. */
function tetherBackground(el) {
	const ctx = tetherScratch();
	for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
		const cs = getComputedStyle(n);
		if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
		const c = cs.backgroundColor;
		if (!c || c === 'transparent') continue;
		ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'copy'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); ctx.restore();
		const px = ctx.getImageData(0, 0, 1, 1).data;
		if (px[3] >= 250) return `rgb(${px[0]},${px[1]},${px[2]})`;
		if (px[3] > 0) return null;   // a see-through color: what is behind it is not known from here
	}
	return null;
}

/** One letter drawn again over itself: with `o.color` instead of its own, a glow (`o.blur`), a shift (`o.dx`) and a lean (`o.skew`, to the right at the top); `o.exact` leaves it off the pixel grid, for letters that are moving. */
function tetherGlyph(ctx, g, a, o = {}) {
	if (a < 0.02) return;
	const dpr = window.devicePixelRatio || 1;
	ctx.save();
	ctx.font = g.st.font; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
	ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = o.color || g.st.color;
	if (o.blur) { ctx.shadowColor = o.glow || o.color || g.st.color; ctx.shadowBlur = o.blur; }
	ctx.translate(o.exact ? g.x + (o.dx || 0) : Math.round((g.x + (o.dx || 0)) * dpr) / dpr, o.exact ? g.y : Math.round(g.y * dpr) / dpr);
	if (o.skew) ctx.transform(1, 0, -o.skew, 1, 0, 0);
	ctx.fillText(g.ch, 0, 0);
	ctx.restore();
}

/** The path of a rule's highlight: the line's box, a little proud of the text, its corners rounded. */
function tetherPill(ctx, s, pad = 2) {
	const x = s.left - pad, y = s.top - 1, w = s.right - s.left + pad * 2, h = s.bottom - s.top + 3;
	ctx.beginPath();
	if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(5, h / 2)); else ctx.rect(x, y, w, h);
}

/** Fills every rule's highlight with `fill` (a style, or a function of the rule that gives one). */
function tetherWash(ctx, segs, fill) {
	for (const s of segs) { tetherPill(ctx, s); ctx.fillStyle = typeof fill === 'function' ? fill(s) : fill; ctx.fill(); }
}

/** Clips to the highlights, for what must stay inside the span. */
function tetherClip(ctx, segs) {
	ctx.beginPath();
	for (const s of segs) { const x = s.left - 2, y = s.top - 1, w = s.right - s.left + 4, h = s.bottom - s.top + 3; ctx.rect(x, y, w, h); }
	ctx.clip();
}

/** A point inside the span, chosen by width: { s, x }. `u` and `v` are 0..1. */
function tetherPoint(S, u, v) {
	let at = u * S.len;
	for (const s of S.segs) { const w = s.right - s.left; if (at <= w || s === S.segs[S.segs.length - 1]) return { s, x: s.left + Math.min(at, w), y: s.top + (s.bottom - s.top) * v }; at -= w; }
	return null;
}

/** Lets an emitter that makes `rate` pieces a second (per 120 px of span) throw the pieces it has stored up: `make(point)` each. */
function tetherEmit(S, key, rate, dt, make) {
	S.acc = S.acc || {};
	S.acc[key] = (S.acc[key] || 0) + rate * dt * Math.max(0.5, Math.min(4, S.len / 120));
	while (S.acc[key] >= 1) {
		S.acc[key] -= 1;
		if (S.parts.length >= TETHER_PARTS_MAX) continue;
		const q = make(tetherPoint(S, Math.random(), Math.random()));
		if (q) S.parts.push(q);
	}
}

/** Strokes the plain rule of each segment, with the ticks at the two ends. */
function tetherRule(ctx, segs, ticks) {
	ctx.beginPath();
	segs.forEach((s, i) => {
		const y = tetherY(s);
		ctx.moveTo(s.left, y); ctx.lineTo(s.right, y);
		if (ticks && i === 0) { ctx.moveTo(s.left, y); ctx.lineTo(s.left, y - TETHER_TICK); }
		if (ticks && i === segs.length - 1) { ctx.moveTo(s.right, y); ctx.lineTo(s.right, y - TETHER_TICK); }
	});
	ctx.stroke();
}

/** A four-pointed glint of radius `r` at (x, y), filled with the current fill style. */
function tetherGlint(ctx, x, y, r) {
	ctx.beginPath();
	ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
	ctx.fill();
}

/** A leaf or petal of length `len` (width `wid`) at (x, y) turned by `rot`: two curves meeting at both tips. */
function tetherPetal(ctx, x, y, len, wid, rot) {
	ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
	ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -wid, len / 2, 0); ctx.quadraticCurveTo(0, wid, -len / 2, 0); ctx.fill();
	ctx.restore();
}

/** A plus of arm `r` at (x, y), stroked with the current stroke style. */
function tetherPlus(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); }

/** The fade of a piece over its life: in quickly, out slowly. */
const tetherLife = (q, now) => { const f = (now - q.t0) / q.life; return Math.min(1, f * 8) * (1 - Math.pow(f, 2)); };

// Colors with no preset of their own, and Fresh ink: a highlighter and the plain rule.
TETHER_STYLES.default = {
	draw(plugin, ctx, S, now, dt, m) {
		tetherWash(ctx, S.segs, rgba(plugin.col(), 0.16 * m));
		ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(plugin.col(), 0.35 * m);
		tetherRule(ctx, S.segs, true);
	},
};

// Lightning: a storm over the span. Most of the time it is a faint blue glow; every second or two a bolt comes down into it, the
// rule and the highlight blaze white-blue and die away - a second, weaker flash a moment after the first - and the letters are
// struck outward from where the bolt landed, a few at a time.
TETHER_STYLES.lightning = {
	animated: true, glyphs: true,
	draw(plugin, ctx, S, now, dt, m) {
		const col = plugin.col(), acc = plugin.acc(), a = Math.min(1, m), CYC = 2400, c = Math.floor(now / CYC), ts = now - c * CYC - (400 + hash(c * 3.7) * 900);
		const f = ts < 0 ? 0 : ts < 160 ? Math.exp(-ts / 70) : 0.7 * Math.exp(-(ts - 160) / 110), shape = c * 2 + (ts > 160 ? 1 : 0);   // the flash, and which of its two beats this is
		tetherWash(ctx, S.segs, rgba(acc, (0.06 + 0.2 * f) * m));
		ctx.lineJoin = 'round'; ctx.lineCap = 'round';
		ctx.strokeStyle = rgba(acc, 0.28 * a); ctx.lineWidth = 1;
		tetherRule(ctx, S.segs, false);
		if (f < 0.03) return;
		const jag = (s, y, k) => {   // a jagged line along a rule, the same for the length of one beat
			const n = Math.max(2, Math.round((s.right - s.left) / 7)), pts = [];
			for (let i = 0; i <= n; i++) pts.push([s.left + ((s.right - s.left) * i) / n, y + (i === 0 || i === n ? 0 : (hash(shape * 13.7 + i * 3.1 + k) * 2 - 1) * 1.8)]);
			ctx.beginPath(); pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
		};
		S.segs.forEach((s, si) => {
			ctx.shadowColor = rgba(acc, f * a); ctx.shadowBlur = 8;
			jag(s, tetherY(s), si * 50); ctx.lineWidth = 2.6; ctx.strokeStyle = rgba(acc, 0.6 * f * a); ctx.stroke();
			ctx.shadowBlur = 0;
			jag(s, tetherY(s), si * 50); ctx.lineWidth = 1; ctx.strokeStyle = rgba('#eaf4ff', Math.min(1, f * 1.1) * a); ctx.stroke();
		});
		const strike = tetherPoint(S, hash(c * 9.1), 0.5);
		if (strike) {   // the bolt itself: down from above the span to where it lands, with a fork
			const top = strike.s.top - 13, n = 6;
			let x = strike.x + (hash(c * 2.3) - 0.5) * 16, y = top;
			ctx.beginPath(); ctx.moveTo(x, y);
			for (let i = 1; i <= n; i++) { x += (strike.x - x) / (n - i + 1) + (i < n ? (hash(shape * 7.7 + i * 5.3) - 0.5) * 9 : 0); y = top + ((strike.y - top) * i) / n; ctx.lineTo(x, y); }
			ctx.shadowColor = rgba(acc, f * a); ctx.shadowBlur = 8; ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(acc, 0.55 * f * a); ctx.stroke();
			ctx.shadowBlur = 0; ctx.lineWidth = 1; ctx.strokeStyle = rgba('#ffffff', Math.min(1, f * 1.2) * a); ctx.stroke();
			if (S.glyphs && S.glyphs.length) {   // the letters it strikes, spreading out from the landing, not all of them
				const front = Math.max(0, ts) * 0.5, reach = Math.max(60, S.len * 0.6), at = tetherAlong(strike.s, strike.x);
				for (const g of S.glyphs) {
					const d = Math.abs(g.pos - at);
					if (d > front || hash(g.n * 1.7 + c * 4.1) < 0.4) continue;
					tetherGlyph(ctx, g, Math.min(1, 1.1 * f * (1 - 0.7 * d / reach) * a), { color: '#eaf4ff', blur: 9, glow: acc });
				}
			}
		}
	},
};

// Sakura, Autumn, Paper: a tint behind the span, a rule, and now and then a petal or a leaf comes away from the top of it and
// falls, swaying, through the letters and out below.
const tetherFalling = (tint, round, palette) => ({
	animated: true,
	draw(plugin, ctx, S, now, dt, m) {
		const col = plugin.col(), acc = plugin.acc(), a = Math.min(1, m), colors = palette ? palette(col, acc) : [col, acc];
		tetherWash(ctx, S.segs, rgba(tint(col, acc), 0.2 * m));
		ctx.lineWidth = 1; ctx.strokeStyle = rgba(acc, 0.3 * a); ctx.lineCap = 'round';
		tetherRule(ctx, S.segs, false);
		tetherEmit(S, 'fall', 2.2, dt, (pt) => pt && ({ x: pt.x, y: pt.s.top + 1, vx: (Math.random() - 0.3) * 10, vy: 16 + Math.random() * 12, ay: 0, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 3, size: 4 + Math.random() * 3, t0: now, life: 2800 + Math.random() * 1400, c: Math.random() < 0.5 ? 0 : 1, ph: Math.random() * 6.28 }));
		for (const q of S.parts) {
			const al = tetherLife(q, now) * a;
			if (al < 0.03) continue;
			ctx.fillStyle = rgba(colors[q.c], 0.9 * al);
			tetherPetal(ctx, q.x + Math.sin(q.ph + (now - q.t0) * 0.0023) * 5, q.y, q.size, q.size * (round ? 0.6 : 0.42) * (0.5 + 0.5 * Math.abs(Math.cos(q.rot * 2))), q.rot + Math.sin(q.ph + (now - q.t0) * 0.003) * 0.6);
		}
	},
});
TETHER_STYLES.sakura = tetherFalling((col, acc) => acc, true);
TETHER_STYLES.autumn = tetherFalling((col, acc) => col, false, (col, acc) => [col, acc, lighten(col, 0.25)]);
TETHER_STYLES.paper = tetherFalling((col) => col, false, (col, acc) => [acc, lighten(acc, 0.3)]);

// Holy: a golden glow behind the span, glints that twinkle all through it, and a light that passes over the letters.
TETHER_STYLES.holy = {
	animated: true, glyphs: true,
	draw(plugin, ctx, S, now, dt, m) {
		const col = plugin.col(), acc = plugin.acc(), a = Math.min(1, m);
		for (const s of S.segs) {
			const g = ctx.createLinearGradient(s.left - 2, 0, s.right + 2, 0);
			g.addColorStop(0, rgba(acc, 0.07 * m)); g.addColorStop(0.5, rgba(acc, 0.24 * m)); g.addColorStop(1, rgba(acc, 0.07 * m));
			tetherPill(ctx, s); ctx.fillStyle = g; ctx.fill();
		}
		ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(col, 0.55 * a); ctx.shadowColor = rgba(acc, 0.8 * a); ctx.shadowBlur = 6;
		tetherRule(ctx, S.segs, false);
		if (S.glyphs && S.glyphs.length) {   // a light moving left to right over the letters, lighting each as it passes
			const span = Math.max(40, S.len), wx = tetherSweep(now, span, 110), wid = 18 + Math.min(span, 300) * 0.07;
			for (const g of S.glyphs) {
				const d = (g.pos - wx) / wid, w = Math.exp(-d * d);
				if (w > 0.05) tetherGlyph(ctx, g, 0.85 * w * a, { color: lighten(col, 0.4), blur: 7, glow: acc });
			}
		}
		ctx.shadowBlur = 5;
		const n = Math.max(2, Math.round(S.len / 38));
		for (let i = 0; i < n; i++) {   // glints: each at a place of its own for a moment, then another
			const cyc = 2000 + 900 * hash(i * 3.1), t = now + hash(i * 7.7) * 5000, c = Math.floor(t / cyc), f = (t % cyc) / cyc, pt = tetherPoint(S, hash(c * 5.3 + i * 11.7), hash(c * 2.9 + i * 4.3));
			if (!pt) continue;
			const tw = Math.sin(Math.PI * f);
			ctx.fillStyle = rgba(lighten(col, 0.3), tw * a); tetherGlint(ctx, pt.x, pt.y, 1.5 + 3.2 * tw);
		}
		tetherEnds(S.segs).forEach(([x, y], e) => { const tw = 0.6 + 0.4 * Math.sin(now * 0.0035 + e * 2); ctx.fillStyle = rgba(col, 0.95 * a); tetherGlint(ctx, x, y - 1.5, 3.4 * tw + 1); });
		ctx.shadowBlur = 0;
	},
};

// Prism: holographic foil - pastel bands of aqua, lavender, pink, peach, yellow and mint running diagonally across the span, slowly
// sliding, a silver sheen sweeping over them, letters that catch the light here and there, and the same foil for a rule.
const HOLO = ['#8ff0e6', '#9fb6ff', '#d7a6ff', '#ffa9d6', '#ffcfa3', '#fff1a0', '#b7f2a8', '#8ff0e6'];
const HOLO_DEEP = ['#0e9f94', '#3b5bdb', '#8a3ffc', '#d6336c', '#e8590c', '#a37800', '#2b8a3e'];   // the same colors for letters on a light page, where light ones would fade
const HOLO_PERIOD = 150;   // px: one run through the colors, across
/** A gradient of the foil over [x0, x1] at height y, slanted, shifted by `phase` (0..1 a period) and `a` strong. */
function holoGradient(ctx, x0, x1, y, slant, phase, a) {
	const P = HOLO_PERIOD, start = x0 - P + phase * P, n = Math.ceil((x1 - start) / P) + 1, g = ctx.createLinearGradient(start, y, start + n * P, y + n * P * slant);
	for (let k = 0; k < n; k++) for (let i = 0; i < HOLO.length - 1; i++) g.addColorStop(Math.min(1, (k + i / (HOLO.length - 1)) / n), rgba(HOLO[i], a));
	g.addColorStop(1, rgba(HOLO[0], a));
	return g;
}
TETHER_STYLES.prism = {
	animated: true, glyphs: true,
	draw(plugin, ctx, S, now, dt, m) {
		const a = Math.min(1, m), dark = plugin.dark, phase = (now * 0.00007) % 1, sheenAt = tetherSweep(now, Math.max(40, S.len), 160);
		for (const s of S.segs) {
			if (dark) { tetherPill(ctx, s); ctx.fillStyle = `rgba(255,255,255,${0.08 * m})`; ctx.fill(); }   // silver underneath
			ctx.globalCompositeOperation = dark ? 'lighter' : 'multiply';   // light added to a dark page glows; on a light one the foil is a tint the letters show through
			tetherPill(ctx, s); ctx.fillStyle = holoGradient(ctx, s.left, s.right, s.top, 0.45, phase, (dark ? 0.26 : 0.8) * m); ctx.fill();
			ctx.globalCompositeOperation = 'source-over';
			const sheen = s.left + sheenAt - (s.cum || 0), g = ctx.createLinearGradient(sheen - 30, 0, sheen + 30, 0);   // a band of silver light
			g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${(dark ? 0.2 : 0.4) * m})`); g.addColorStop(1, 'rgba(255,255,255,0)');
			tetherPill(ctx, s); ctx.fillStyle = g; ctx.fill();
		}
		if (S.glyphs) for (const g of S.glyphs) {   // each letter has a rhythm of its own and catches the light at the top of it
			const f = Math.pow(Math.max(0, Math.sin(now * (0.0012 + 0.0016 * g.h2) + g.h1 * 6.28)), 7);
			if (f > 0.05) { const k = Math.floor((g.h1 * 7 + now * 0.0004) % 7), c = HOLO[k]; tetherGlyph(ctx, g, 0.95 * f * a, { color: dark ? lighten(c, 0.35) : HOLO_DEEP[k], blur: dark ? 9 : 5, glow: c }); }
		}
		ctx.lineCap = 'round'; ctx.lineWidth = 1.7;
		for (const s of S.segs) { const y = tetherY(s); ctx.strokeStyle = holoGradient(ctx, s.left, s.right, y, 0, phase, 0.95 * a); ctx.beginPath(); ctx.moveTo(s.left, y); ctx.lineTo(s.right, y); ctx.stroke(); }
	},
};

// Health: a green glow behind the span, a plain rule, and pluses rising out of it.
TETHER_STYLES.health = {
	animated: true,
	draw(plugin, ctx, S, now, dt, m) {
		const col = plugin.col(), acc = plugin.acc(), a = Math.min(1, m);
		tetherWash(ctx, S.segs, rgba(acc, 0.15 * m));
		ctx.lineCap = 'round'; ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(col, 0.6 * a);
		tetherRule(ctx, S.segs, false);
		tetherEmit(S, 'plus', 2.4, dt, (pt) => pt && ({ x: pt.x, y: pt.y, vx: (Math.random() - 0.5) * 6, vy: -(14 + Math.random() * 12), size: 1.8 + Math.random() * 1.6, t0: now, life: 1500 + Math.random() * 700, ph: Math.random() * 6.28 }));
		ctx.shadowColor = rgba(acc, 0.9 * a); ctx.shadowBlur = 4; ctx.lineWidth = 1.1;
		for (const q of S.parts) { const al = tetherLife(q, now) * a; if (al < 0.03) continue; ctx.strokeStyle = rgba(lighten(col, 0.2), 0.95 * al); tetherPlus(ctx, q.x + Math.sin(q.ph + (now - q.t0) * 0.004) * 2, q.y, q.size); }
		ctx.shadowBlur = 0;
	},
};

/**
 * A wisp of wind, drawn as the anime ones are: a long soft ribbon, thin at the tail and strongest at the head, that ripples as
 * it goes and ends in a small curl (up when `side` is -1, down when 1). `x`, `y` is the tail, `len` how far it runs, `ph` where
 * the ripple is: it runs along the wisp from tail to head as `ph` grows.
 */
function drawWindWisp(ctx, x, y, len, color, a, width, side, ph) {
	if (a < 0.03) return;
	const r = Math.max(2.5, len * 0.12), g = ctx.createLinearGradient(x, 0, x + len + r, 0);
	g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.5, rgba(color, a * 0.7)); g.addColorStop(1, rgba(color, a));
	ctx.strokeStyle = g; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
	ctx.beginPath();
	let ey = y;
	for (let px = 0; px <= len + 0.1; px += 3) {
		ey = y + side * (1.2 + 2.4 * (px / len)) * Math.sin(px * 0.11 - ph);
		px ? ctx.lineTo(x + px, ey) : ctx.moveTo(x + px, ey);
	}
	if (side > 0) ctx.arc(x + len, ey + r, r, -Math.PI / 2, -Math.PI / 2 + 4.3, false); else ctx.arc(x + len, ey - r, r, Math.PI / 2, Math.PI / 2 - 4.3, true);   // the curl: a small loop that goes on forward, then round
	ctx.stroke();
}

// Zephyr: a breeze through the span - a lighter band of air sweeping over it, streaks of wind, a few leaves carried along, and
// the letters in the gust leaning to the right and coming back (the letters of the span are hidden where they are and drawn again, upright in still air and slanted in the gust).
TETHER_STYLES.zephyr = {
	animated: true, glyphs: true, patch: true,
	draw(plugin, ctx, S, now, dt, m) {
		const col = plugin.col(), acc = plugin.acc(), a = Math.min(1, m), span = Math.max(40, S.len), gp = tetherSweep(now, span, 70), gw = 26 + Math.min(span, 300) * 0.08;
		const lean = S.glyphs ? S.glyphs.map((g) => { const d = (g.pos - gp) / gw; return Math.exp(-d * d * 0.7); }) : [];
		// The letters of the span are taken out of the page - made transparent where they are, all at once, by a highlight
		// (::highlight(cfx-gust) in the plugin's CSS) - and drawn on the canvas instead, upright where the air is still and
		// leaning in the gust. Hiding only the letters in the gust would change the highlight at every few frames, which makes
		// the page restyle its text each time. Failing that (no highlights), the letters in the gust are painted out with the
		// page's color, or only echoed.
		const hl = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
		let hidden = false;
		if (hl && S.glyphs) {
			if (S.hlKey !== S.gk) {
				S.hlKey = S.gk;
				const byNode = new Map();
				for (const g of S.glyphs) { if (!g.node || !g.node.isConnected) continue; const e = byNode.get(g.node); if (e) e[1] = g.off + g.ch.length; else byNode.set(g.node, [g.off, g.off + g.ch.length]); }
				const ranges = [];
				for (const [node, [from, to]] of byNode) { const r = document.createRange(); try { r.setStart(node, from); r.setEnd(node, to); ranges.push(r); } catch (e) { /* the text moved on */ } }
				if (ranges.length) CSS.highlights.set('cfx-gust', new Highlight(...ranges)); else CSS.highlights.delete('cfx-gust');
			}
			hidden = true;
		} else {
			tetherUnhide(S);   // no letters to draw in their place (a span too long for that): the page's own are left as they are
			if (S.bg && S.glyphs) S.glyphs.forEach((g, i) => { if (lean[i] > 0.05) { ctx.fillStyle = S.bg; ctx.fillRect(g.x - 0.5, g.top, g.w + 1, g.h); hidden = true; } });
		}
		tetherWash(ctx, S.segs, rgba(acc, 0.15 * m));
		ctx.save();
		tetherClip(ctx, S.segs);
		for (const s of S.segs) {   // the gust: a soft slanted band, in the line it has reached
			const gx = s.left + gp - s.cum;
			if (gx < s.left - gw - 8 || gx > s.right + gw + 8) continue;
			const g = ctx.createLinearGradient(gx - gw, 0, gx + gw, 0);
			g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(col, 0.22 * m)); g.addColorStop(1, rgba(col, 0));
			ctx.fillStyle = g;
			ctx.beginPath(); ctx.moveTo(gx - gw + 6, s.top - 2); ctx.lineTo(gx + gw + 6, s.top - 2); ctx.lineTo(gx + gw - 6, s.bottom + 3); ctx.lineTo(gx - gw - 6, s.bottom + 3); ctx.closePath(); ctx.fill();
		}
		ctx.lineCap = 'round';
		S.segs.forEach((s, si) => {   // wisps of wind, along the top and the bottom of the line (not through the letters). Each flows the whole length of the line at its own gentle pace, its body rippling as it goes, a curl at its head, and fades only as it leaves; the next one comes at another height
			const len = s.right - s.left, n = Math.max(2, Math.round(len / 55));
			for (let i = 0; i < n; i++) {
				const h = hash(i * 2.9 + si * 31), size = 36 + 24 * hash(i * 7.1 + si), speed = 32 + 24 * h, travel = len + size + 20, u = (now * 0.001 * speed) / travel + h, k = Math.floor(u), t = u - k;
				const r = hash(i * 3.7 + si * 5.1 + k * 11.3), env = smoothStep(t / 0.1) * smoothStep((1 - t) / 0.1);
				const hx = s.left - 10 + t * travel, y0 = s.top + (s.bottom - s.top) * (r < 0.5 ? 0.05 + 0.3 * r : 0.65 + 0.3 * (r - 0.5)) + Math.sin(now * 0.0016 + h * 6.28) * 1.4;
				drawWindWisp(ctx, hx - size, y0, size, (h < 0.5 ? col : acc), a * (0.55 + 0.4 * h) * env, 0.9 + 0.5 * h, r < 0.5 ? -1 : 1, now * 0.004 + h * 6.28);
			}
		});
		ctx.restore();
		ctx.strokeStyle = rgba(acc, 0.35 * a); ctx.lineWidth = 1;
		tetherRule(ctx, S.segs, false);
		if (S.glyphs && hl) {   // the letters of the span, in place of the page's own: upright in a run of one font and color, each of those in the gust on its own, leaning
			const dpr = window.devicePixelRatio || 1, vh = window.innerHeight + 20;
			let font = null, color = null;
			ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
			S.glyphs.forEach((g, i) => {
				if (g.top > vh || g.top + g.h < -20) return;
				if (lean[i] > 0.004) { tetherGlyph(ctx, g, 1, { dx: 2.6 * lean[i], skew: 0.34 * lean[i], exact: true }); return; }
				if (g.st.font !== font) { font = g.st.font; ctx.font = font; }
				if (g.st.color !== color) { color = g.st.color; ctx.fillStyle = color; }
				ctx.fillText(g.ch, Math.round(g.x * dpr) / dpr, Math.round(g.y * dpr) / dpr);
			});
			ctx.restore();
		} else if (S.glyphs) S.glyphs.forEach((g, i) => { if (lean[i] > 0.05) tetherGlyph(ctx, g, hidden ? 1 : 0.5 * lean[i] * a, { dx: 2.6 * lean[i], skew: 0.34 * lean[i], exact: true }); });
		tetherEmit(S, 'leaf', 0.8, dt, (pt) => pt && ({ x: S.segs[0].left - 4, y: pt.y, vx: 28 + Math.random() * 20, vy: (Math.random() - 0.5) * 12, rot: Math.random() * 6.28, spin: 3 + Math.random() * 4, size: 3.5 + Math.random() * 2.5, t0: now, life: Math.max(1500, (span + 30) / 38 * 1000), ph: Math.random() * 6.28, c: Math.random() < 0.5 ? 0 : 1 }));
		for (const q of S.parts) { const al = tetherLife(q, now) * a; if (al < 0.03 || q.x > S.segs[S.segs.length - 1].right + 6) continue; ctx.fillStyle = rgba(q.c ? acc : col, 0.9 * al); tetherPetal(ctx, q.x, q.y + Math.sin(q.ph + (now - q.t0) * 0.007) * 3, q.size, q.size * 0.45, q.rot); }
	},
};

// Tide: the span is under water - a blue tint that deepens toward the bottom of each line, a slow ripple of light passing over it
// and a quiet wave for a rule. Nothing else: on a span of many lines it stays calm.
TETHER_STYLES.tide = {
	animated: true,
	draw(plugin, ctx, S, now, dt, m) {
		const col = plugin.col(), acc = plugin.acc(), a = Math.min(1, m), span = Math.max(40, S.len), rp = tetherSweep(now, span, 70), rw = 30 + Math.min(span, 300) * 0.1;
		for (const s of S.segs) {
			const g = ctx.createLinearGradient(0, s.top, 0, s.bottom + 3);
			g.addColorStop(0, rgba(col, 0.12 * m)); g.addColorStop(1, rgba(acc, 0.24 * m));
			tetherPill(ctx, s); ctx.fillStyle = g; ctx.fill();
		}
		ctx.save();
		tetherClip(ctx, S.segs);
		for (const s of S.segs) {   // the ripple of light, in the line it has reached
			const rx = s.left + rp - s.cum;
			if (rx < s.left - rw || rx > s.right + rw) continue;
			const g = ctx.createLinearGradient(rx - rw, 0, rx + rw, 0);
			g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(lighten(col, 0.4), 0.16 * m)); g.addColorStop(1, rgba(col, 0));
			ctx.fillStyle = g; ctx.fillRect(rx - rw, s.top - 2, rw * 2, s.bottom - s.top + 5);
		}
		ctx.restore();
		ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(col, 0.7 * a);
		for (const s of S.segs) { ctx.beginPath(); for (let x = s.left; x <= s.right + 0.1; x += 2) { const y = tetherY(s) + 1 + Math.sin((x - now * 0.02) * 0.4) * 1; x === s.left ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
	},
};

// Slime: as if swallowed by it - a jelly round the whole span with a wobbling edge and a gloss, bubbles inside, and drops
// that swell under it and let go.
TETHER_STYLES.slime = {
	animated: true,
	draw(plugin, ctx, S, now, dt, m) {
		const col = plugin.col(), acc = plugin.acc(), a = Math.min(1, m);
		for (const s of S.segs) {
			const L = s.left - 3, R = s.right + 3, T = s.top - 1, B = s.bottom + 2.5, mid = (T + B) / 2, pts = [];
			const wob = (x, k) => Math.sin(x * 0.13 + now * 0.0038 * k) * 1.3 + Math.sin(x * 0.29 - now * 0.0027 * k) * 0.7;
			for (let x = L + 3; x < R - 2; x += 6) pts.push([x, T + wob(x, 1) - 0.5]);
			pts.push([R + 2 + Math.sin(now * 0.004) * 0.8, mid]);
			for (let x = R - 3; x > L + 2; x -= 6) pts.push([x, B + wob(x, -1) * 0.8 + 0.5]);
			pts.push([L - 2 - Math.sin(now * 0.004 + 1) * 0.8, mid]);
			const n = pts.length, md = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
			ctx.beginPath(); let m0 = md(pts[n - 1], pts[0]); ctx.moveTo(m0[0], m0[1]);
			for (let i = 0; i < n; i++) { const e = md(pts[i], pts[(i + 1) % n]); ctx.quadraticCurveTo(pts[i][0], pts[i][1], e[0], e[1]); }
			ctx.closePath();
			ctx.fillStyle = rgba(col, 0.26 * m); ctx.fill();
			ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(acc, 0.6 * a); ctx.stroke();
			ctx.strokeStyle = `rgba(255,255,255,${0.35 * a})`; ctx.lineWidth = 1.6; ctx.lineCap = 'round';   // the gloss
			ctx.beginPath(); ctx.moveTo(L + 8, T + 2.2 + wob(L, 1) * 0.3); ctx.lineTo(Math.min(R - 8, L + 8 + (R - L) * 0.45), T + 2.2 + wob(L + 30, 1) * 0.3); ctx.stroke();
			// the drops: each swells below the jelly, hangs by a thread, lets go and falls
			const nd = s === S.segs[S.segs.length - 1] ? Math.max(1, Math.round((s.right - s.left) / 60)) : 0;   // drops only under the last line of the span
			for (let i = 0; i < nd; i++) {
				const h = hash(i * 6.1 + s.top * 0.13), cyc = 3000 + 1500 * h, t = now + h * 9000, f = (t % cyc) / cyc, x = s.left + (s.right - s.left) * (0.12 + 0.76 * h);
				ctx.fillStyle = rgba(col, 0.5 * a); ctx.strokeStyle = rgba(col, 0.5 * a);
				if (f < 0.72) { const len = 1 + 7 * Math.pow(f / 0.72, 2), r = 1.2 + 1.2 * (f / 0.72); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x, B); ctx.lineTo(x, B + len); ctx.stroke(); ctx.beginPath(); ctx.arc(x, B + len + r * 0.6, r, 0, Math.PI * 2); ctx.fill(); }
				else { const u = (f - 0.72) / 0.28; ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.ellipse(x, B + 9 + u * 16, 2.1, 2.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
			}
		}
		tetherEmit(S, 'bub', 2, dt, (pt) => pt && ({ x: pt.x, y: pt.s.bottom, vx: 0, vy: -(8 + Math.random() * 8), size: 1 + Math.random() * 1.6, t0: now, life: 1300 + Math.random() * 800, top: pt.s.top, ph: Math.random() * 6.28 }));
		ctx.lineWidth = 0.8;
		for (const q of S.parts) { const al = tetherLife(q, now) * a; if (al < 0.03 || q.y < q.top) continue; ctx.strokeStyle = `rgba(255,255,255,${0.7 * al})`; ctx.beginPath(); ctx.arc(q.x + Math.sin(q.ph + (now - q.t0) * 0.005) * 1.4, q.y, q.size, 0, Math.PI * 2); ctx.stroke(); }
	},
};

// Combo: a highlight in the color of the rank that heats with it, sparks rising off the top from rank C, and from B the letters glow in turn.
TETHER_STYLES.combo = {
	animated: true, glyphs: true,
	draw(plugin, ctx, S, now, dt, m) {
		const it = plugin.items.find((q) => q.effect === 'combo' && !q.done), tier = comboTier(it ? it.n : 0), c = comboHue(tier, now), a = Math.min(1, m), L = plugin.dark ? 0 : -22;
		const hsl = (al, dl = 0) => `hsla(${c[0]}, ${c[1]}%, ${c[2] + L + dl}%, ${al})`, flick = 0.85 + 0.15 * Math.sin(now * 0.02 * (1 + tier));
		tetherWash(ctx, S.segs, hsl((0.14 + 0.04 * tier) * flick * m));
		ctx.lineCap = 'round';
		ctx.lineWidth = 1.4 + 0.35 * tier; ctx.strokeStyle = hsl((0.55 + 0.1 * tier) * flick * a); ctx.shadowColor = hsl(0.9 * a); ctx.shadowBlur = 3 + 3 * tier;
		tetherRule(ctx, S.segs, true);
		ctx.shadowBlur = 0;
		if (tier >= 2 && S.glyphs) {   // a glow that runs through the letters, left to right and round again
			const span = Math.max(40, S.len), wx = tetherSweep(now, span, 70 + 25 * tier), wid = 16 + Math.min(span, 300) * 0.06;
			for (const g of S.glyphs) { const d = (g.pos - wx) / wid, w = Math.exp(-d * d); if (w > 0.06) tetherGlyph(ctx, g, 0.85 * w * a, { color: hsl(1, 12), blur: 7, glow: hsl(1) }); }
		}
		if (tier >= 1) tetherEmit(S, 'spark', 1.5 * tier, dt, (pt) => pt && ({ x: pt.x, y: pt.s.top, vx: (Math.random() - 0.5) * 24, vy: -(24 + Math.random() * 30), ay: 30, size: 0.8 + Math.random() * 1.1, t0: now, life: 600 + Math.random() * 500 }));
		ctx.shadowColor = hsl(0.9 * a); ctx.shadowBlur = 5;
		for (const q of S.parts) { const al = tetherLife(q, now) * a; if (al < 0.03) continue; ctx.fillStyle = hsl(al, 8); ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2); ctx.fill(); }
		ctx.shadowBlur = 0;
	},
};

// Back-man: a yellow wash and a plain rule.
TETHER_STYLES.backman = {
	draw(plugin, ctx, S, now, dt, m) {
		const col = plugin.col();
		tetherWash(ctx, S.segs, rgba(col, 0.16 * m));
		ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(col, 0.6 * Math.min(1, m));
		tetherRule(ctx, S.segs, false);
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
// SPECIAL PRESETS ORIGINAL TO CARET FX: Holy, Prism, Health, Zephyr, Tide, Stitch
//
// Written for this plugin, not ported. They are special presets like Sakura and Lightning: each brings its own colors and
// is picked in the settings page's Special grid (or by "next preset"), one at a time. Like the falling petals they
// keep everything in their one long-lived item, so a preview can run them on a canvas of its own, and they answer
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

/** The item that holds the glints of `host` (the plugin, or a preview host). */
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
// A burst of light through glass: each letter sets off a flash on the caret with a thin anamorphic lens streak through it
// (a run of the holographic foil's pastels - aqua, lavender, pink, peach, yellow, mint - round a white heart) and a small pink
// lens-orb on the streak, and flings a few chunky glowing stars out in those same colors, now and then aqua with a tail, that
// slow down, spin and fade, with pearly embers drifting among them. A new line or a
// jump is a big burst. Everything is additive light.
// Settings: prismStrength (1 is normal).
const PRISM_GAP_MS = 80;                 // the least time between two bursts, so a fast typist does not bury the page in them
const PRISM_STARS_MAX = 18;              // the most stars alive at once
const PRISM_EMBERS_MAX = 26;             // the most embers alive at once
const PRISM_STAR_MS = [750, 1150];       // how long a star flies
const PRISM_FLASH_MS = 380;              // how long the flash and its streak last
const PRISM_HUES = [[172, 85, 72], [228, 100, 80], [275, 100, 82], [330, 100, 78], [28, 100, 78], [52, 100, 72], [108, 75, 76]];   // holographic foil - aqua, lavender, violet, pink, peach, yellow, mint: [h, s, l]

/** The outline of a five-pointed star of outer radius `r`, turned by `rot`. */
function traceStar(ctx, r, rot) {
	ctx.beginPath();
	for (let i = 0; i < 10; i++) {
		const a = rot - Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.46 : r;
		if (i) ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); else ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
	}
	ctx.closePath();
}

// A star with its glow is costly to draw - a blurred shadow for each, dozens of times a frame - so each kind is drawn once,
// glow and all, into a small canvas and stamped from then on, turned and scaled as the star needs.
const PRISM_SPRITE = 112;    // a sprite's side, in CSS px...
const PRISM_SPRITE_R = 16;   // ...and the star's outer radius in it (the ember's core is 0.3 of that)
const prismSprites = new Map();

/** The sprite of a star of hue `i` (an index into PRISM_HUES; -1 for an ember), for a dark or a light page. */
function prismSprite(i, dark) {
	const key = i + (dark ? 'd' : 'l');
	let cv = prismSprites.get(key);
	if (cv) return cv;
	const dpr = Math.min(2, window.devicePixelRatio || 1), S = PRISM_SPRITE, R = PRISM_SPRITE_R;
	cv = document.createElement('canvas');
	cv.width = cv.height = Math.round(S * dpr);
	const g = cv.getContext('2d');
	g.scale(dpr, dpr);
	g.translate(S / 2, S / 2);
	if (i < 0) {   // an ember: a soft orange dot
		const light = dark ? 62 : 42, grad = g.createRadialGradient(0, 0, 0, 0, 0, R);
		grad.addColorStop(0, `hsl(190, 100%, ${light + 24}%)`);
		grad.addColorStop(0.3, `hsla(190, 100%, ${light + 22}%, 0.9)`);
		grad.addColorStop(0.5, 'hsla(305, 100%, 78%, 0.35)');
		grad.addColorStop(1, 'hsla(305, 100%, 78%, 0)');
		g.fillStyle = grad;
		g.fillRect(-R, -R, 2 * R, 2 * R);
	} else {   // a chunky star with rounded points, its glow, and a bright heart
		const [hh, ss, ll] = PRISM_HUES[i], col = `hsl(${hh}, ${ss}%, ${ll + (dark ? 0 : -18)}%)`;
		g.shadowColor = `hsla(${hh}, 100%, 60%, 0.95)`;
		g.shadowBlur = R * 2.2;
		traceStar(g, R, 0);
		g.fillStyle = col; g.fill();
		g.lineJoin = 'round'; g.lineWidth = R * 0.28; g.strokeStyle = col; g.stroke();
		g.shadowBlur = 0;
		traceStar(g, R * 0.5, 0);
		g.fillStyle = `hsla(${hh}, 100%, ${dark ? 90 : 75}%, 0.9)`; g.fill();
	}
	prismSprites.set(key, cv);
	return cv;
}

/** The item that holds the burst of `host` (the plugin, or a preview host). */
function prismOf(host) {
	const item = host.ensureItem('prism');
	if (!item.stars) { item.stars = []; item.embers = []; item.flashAt = -1e9; item.big = 0; item.lastAt = 0; }
	return item;
}

/** Sets off a burst at the caret `rect`: the flash, a few stars and embers; a big burst for `big`. */
function kindlePrism(host, rect, big, now) {
	const item = prismOf(host);
	item.flashAt = now; item.big = big ? 1 : 0;
	if (!big && now - item.lastAt < PRISM_GAP_MS) return;
	item.lastAt = now;
	const u = Math.max(rect.h, 16) / 24, cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
	for (let i = 0; i < (big ? 8 : 1 + (Math.random() < 0.45 ? 1 : 0)) && item.stars.length < PRISM_STARS_MAX; i++) {
		const hi = Math.floor(Math.random() * PRISM_HUES.length), hue = PRISM_HUES[hi], a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 90) * u;
		item.stars.push({
			x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 15 * u, r: (2.6 + Math.random() * 3.4) * u, hue, hi,
			spin: (Math.random() - 0.5) * 6, rot: Math.random() * 6.28, tail: hi === 0, t0: now + i * 25, life: lerp(PRISM_STAR_MS[0], PRISM_STAR_MS[1], Math.random()),
		});
	}
	for (let i = 0; i < (big ? 10 : 2) && item.embers.length < PRISM_EMBERS_MAX; i++) {
		const a = Math.random() * Math.PI * 2, v = (15 + Math.random() * 45) * u;
		item.embers.push({ x: cx + Math.cos(a) * 3 * u, y: cy + Math.sin(a) * 3 * u, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14 * u, r: (0.7 + Math.random() * 1.1) * u, ph: Math.random() * 6.28, t0: now, life: 900 + Math.random() * 700 });
	}
}

function drawPrism(plugin, ctx, item, now, k) {
	const alive = (q) => now - q.t0 < q.life;
	item.stars = item.stars.filter(alive); item.embers = item.embers.filter(alive);
	const flash = (now - item.flashAt) / PRISM_FLASH_MS;
	if (!item.stars.length && !item.embers.length && flash >= 1) { item.done = true; return; }
	const rect = plugin.last;
	if (!rect) return;
	const dark = plugin.dark, h = Math.max(rect.h, 16), u = h / 24, cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
	const power = (plugin.cfg.prismStrength ?? 1) * Math.min(k, 1.5) * (dark ? 1 : 0.6), light = dark ? 62 : 42;
	const scale = PRISM_SPRITE / PRISM_SPRITE_R;   // a sprite's side for a star of radius 1
	if (!dark) ctx.globalCompositeOperation = 'source-over';   // adding light to a light page shows nothing
	ctx.save();

	if (flash >= 0 && flash < 1) {   // the flash, its anamorphic streak and the lens-orb on it
		const f = 1 - flash, a = f * f * power * (item.big ? 1.3 : 1), reach = h * (item.big ? 4.5 : 3) * (0.6 + 0.4 * flash + 0.3);
		const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 1.1);
		glow.addColorStop(0, `rgba(255,${dark ? 240 : 215},${dark ? 250 : 235},${0.55 * a})`);
		glow.addColorStop(1, 'rgba(190,150,255,0)');
		ctx.fillStyle = glow;
		ctx.fillRect(cx - h * 1.1, cy - h * 1.1, h * 2.2, h * 2.2);
		const g = ctx.createLinearGradient(cx - reach, cy, cx + reach, cy);
		const holo = (h) => `hsla(${h}, 100%, ${light + 12}%, ${0.75 * a})`;   // the streak runs through the foil's colors: aqua, lavender and pink to either side of the white heart
		g.addColorStop(0, 'rgba(160,200,255,0)');
		g.addColorStop(0.2, holo(172)); g.addColorStop(0.32, holo(228)); g.addColorStop(0.42, holo(330));
		g.addColorStop(0.5, `rgba(255,255,255,${a})`);
		g.addColorStop(0.58, holo(52)); g.addColorStop(0.68, holo(28)); g.addColorStop(0.8, holo(108));
		g.addColorStop(1, 'rgba(160,255,230,0)');
		ctx.fillStyle = g;
		ctx.fillRect(cx - reach, cy - 1.1 * u, reach * 2, 2.2 * u);
		ctx.fillRect(cx - 0.8 * u, cy - reach * 0.22, 1.6 * u, reach * 0.44);   // and a short vertical one across it
		const ox = cx + reach * 0.7, orb = ctx.createRadialGradient(ox, cy, 0, ox, cy, 5 * u);
		orb.addColorStop(0, `hsla(305, 100%, 82%, ${0.7 * a})`);
		orb.addColorStop(0.6, `hsla(275, 100%, 78%, ${0.25 * a})`);
		orb.addColorStop(1, 'hsla(275, 100%, 78%, 0)');
		ctx.fillStyle = orb;
		ctx.fillRect(ox - 5 * u, cy - 5 * u, 10 * u, 10 * u);
	}

	const ember = prismSprite(-1, dark);
	for (const q of item.embers) {   // embers: tiny, slowing, flickering - a stamp each
		const t = (now - q.t0) / 1000, f = (now - q.t0) / q.life, drag = Math.exp(-2.2 * t);
		const x = q.x + (q.vx * (1 - drag)) / 2.2, y = q.y + (q.vy * (1 - drag)) / 2.2 - 6 * t * t * u * 6;
		const a = Math.sin(Math.PI * f) * (0.65 + 0.35 * Math.sin(q.ph + t * 14)) * power;
		if (a < 0.02) continue;
		const s = (scale * q.r) / 0.3;   // the sprite's core is 0.3 of its star radius: that core is the ember
		ctx.globalAlpha = Math.min(1, a);
		ctx.drawImage(ember, x - s / 2, y - s / 2, s, s);
	}

	for (const q of item.stars) {   // stars: flung out, slowing down, spinning, then shrinking away - a stamp each, turned
		const t = (now - q.t0) / 1000, f = t * 1000 / q.life;
		if (f < 0) continue;
		const drag = Math.exp(-3 * t), x = q.x + (q.vx * (1 - drag)) / 3, y = q.y + (q.vy * (1 - drag)) / 3;
		const alpha = Math.min(1, f / 0.08) * (f < 0.55 ? 1 : 1 - (f - 0.55) / 0.45) * power, r = q.r * (f < 0.12 ? easeOutBack(f / 0.12) : 1 - 0.35 * f);
		if (alpha <= 0.01) continue;
		ctx.globalAlpha = alpha;
		if (q.tail) {   // the cyan ones trail a tapering tail behind them
			const [hh] = q.hue, sp = Math.hypot(q.vx, q.vy) * drag || 1, tl = Math.min(18 * u, sp * 0.16), ux = (q.vx * drag) / sp, uy = (q.vy * drag) / sp;
			const tg = ctx.createLinearGradient(x, y, x - ux * tl, y - uy * tl);
			tg.addColorStop(0, `hsla(${hh}, 100%, 70%, 0.8)`); tg.addColorStop(1, `hsla(${hh}, 100%, 70%, 0)`);
			ctx.strokeStyle = tg; ctx.lineWidth = r * 0.7; ctx.lineCap = 'round';
			ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * tl, y - uy * tl); ctx.stroke();
		}
		const s = scale * r;
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(q.rot + q.spin * t);
		ctx.drawImage(prismSprite(q.hi, dark), -s / 2, -s / 2, s, s);
		ctx.restore();
	}
	ctx.restore();
}

EFFECTS.prism = {
	id: 'prism', label: 'Prism', mode: 'signature', keepsState: true, blend: 'lighter',
	preset: { name: 'Prism', color: '#c9ecff', accent: '#e0a8ff' },
	defaults: { prismStrength: 1 },
	onMove(plugin, prev, cur, info) {
		const big = info.typed ? info.dy >= cur.h * 0.8 : info.dist > cur.h * 4;   // a new line, or a jump
		if (!big && !isWriting(info)) return;
		kindlePrism(plugin, cur, big, info.now);
	},
	draw(plugin, ctx, item, p, k, now) { drawPrism(plugin, ctx, item, now, k); },
	preview(plugin, pv, caret, now) {
		if (now < (pv.prismNext || 0)) return;
		pv.prismNext = now + 800;
		kindlePrism(pv, caret, false, now);
	},
};

// ---- Effect: Health ------------------------------------------------------------------------------------------------
// Writing heals, quietly: tiny pluses - a few pixels across, like Holy's glints - rise slowly out of the caret as you
// write, swaying a little, each with a short trail of light behind it, and a soft glow opens on the caret. Nothing more.
// All of it is in the preset's colors, green; with other colors it is whatever you like (a red cross, say).
// Settings: healthSize (1 is normal).
const HEALTH_LIFE_MS = [1500, 2400];  // how long a plus floats: the shortest and the longest
const HEALTH_MAX = 12;                // the most pluses alive at once
const HEALTH_GAP_MS = 160;            // the least time between two pluses, so a fast typist is not buried in them
const HEALTH_PULSE_MS = 900;          // how long the caret's glow takes to open and fade
const HEALTH_PX = [1.5, 2.6];         // a plus's arm length, in px: tiny, like stars
const HEALTH_TRAIL_STEPS = 7;         // how many steps back along its path the trail of a plus is drawn...
const HEALTH_TRAIL_MS = 45;           // ...each this far back in time

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

/** The item that holds the pluses of `host` (the plugin, or a preview host). */
function pluses(host) {
	const item = host.ensureItem('health');
	if (!item.parts) { item.parts = []; item.lastAt = 0; item.pulseAt = -1e9; }
	return item;
}

/** Where a plus is `age` ms into its life: rising, a little slower as it goes, swaying. Pure, so its trail can be read off its past. */
function healthPos(q, age) {
	const f = age / q.life;
	return { x: q.x + q.drift * f + Math.sin(q.phase + age / 420) * q.sway, y: q.y - q.rise * f * (1.3 - 0.3 * f) };
}

/** A plus (two with `twin`) out of the caret `rect`, from a little off its middle; and the glow. */
function healPlus(host, rect, now, twin) {
	const item = pluses(host);
	item.pulseAt = now;
	if (now - item.lastAt < HEALTH_GAP_MS) return;
	item.lastAt = now;
	const h = rect.h, cx = rect.x + rect.w / 2;
	for (let i = 0; i < (twin ? 2 : 1) && item.parts.length < HEALTH_MAX; i++) {
		item.parts.push({
			x: cx + (Math.random() - 0.5) * h * 1.1, y: rect.y + h * (0.2 + Math.random() * 0.5),
			rise: h * (1.1 + Math.random() * 0.9),                      // how far it floats in all
			drift: (Math.random() - 0.5) * h * 0.5,                     // and how far it wanders sideways
			sway: h * (0.03 + Math.random() * 0.04), phase: Math.random() * 6.28,
			r: lerp(HEALTH_PX[0], HEALTH_PX[1], Math.random()),         // an arm's length
			t0: now, life: lerp(HEALTH_LIFE_MS[0], HEALTH_LIFE_MS[1], Math.random()),
		});
	}
}

EFFECTS.health = {
	id: 'health', label: 'Health', mode: 'signature', keepsState: true, blend: 'lighter',
	preset: { name: 'Health', color: '#7dff9b', accent: '#12b04a' },
	defaults: { healthSize: 1 },
	onMove(plugin, prev, cur, info) {
		if (!isWriting(info)) return;
		healPlus(plugin, cur, info.now, Math.random() < 0.25);
	},
	draw(plugin, ctx, item, p, k, now) {
		item.parts = item.parts.filter((q) => now - q.t0 < q.life);
		const pulse = (now - item.pulseAt) / HEALTH_PULSE_MS;
		if (!item.parts.length && pulse >= 1) { item.done = true; return; }
		const pal = healthPalette(plugin), rect = plugin.last, dark = plugin.dark;
		const size = (plugin.cfg.healthSize || 1) * (0.85 + 0.2 * Math.min(k, 1.6)), power = Math.min(1, 0.55 + 0.45 * k);
		if (!dark) ctx.globalCompositeOperation = 'source-over';   // adding light to a light page shows nothing
		if (rect && pulse < 1) {   // the caret's glow: small, it opens and fades
			const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, e = easeOutCubic(pulse), fade = 1 - pulse, r = rect.h * (0.7 + 0.5 * e);
			const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
			g.addColorStop(0, rgba(pal.mid, (dark ? 0.22 : 0.12) * power * fade * fade));
			g.addColorStop(1, rgba(pal.mid, 0));
			ctx.fillStyle = g;
			ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
		}
		ctx.save();
		ctx.lineCap = 'round';
		for (const q of item.parts) {
			const age = now - q.t0, f = age / q.life;
			const alpha = Math.min(1, f / 0.08) * (f < 0.55 ? 1 : 1 - (f - 0.55) / 0.45) * power;
			if (alpha <= 0.01) continue;
			const l = q.r * size * easeOutBack(clamp01(age / 240)), t = Math.max(0.5, l * 0.3), at = healthPos(q, age);
			// The trail: its path over the last moments, thinner and fainter the farther back.
			let from = at;
			for (let i = 1; i <= HEALTH_TRAIL_STEPS && age - i * HEALTH_TRAIL_MS > 0; i++) {
				const to = healthPos(q, age - i * HEALTH_TRAIL_MS), back = 1 - i / (HEALTH_TRAIL_STEPS + 1);
				ctx.strokeStyle = rgba(i < 3 ? pal.top : pal.mid, alpha * 0.55 * back * back);
				ctx.lineWidth = Math.max(0.5, l * 0.55 * back);
				ctx.beginPath();
				ctx.moveTo(from.x, from.y);
				ctx.lineTo(to.x, to.y);
				ctx.stroke();
				from = to;
			}
			// The plus: the preset's green, lit at the top, with a white heart.
			ctx.save();
			ctx.translate(at.x, at.y);
			ctx.globalAlpha = alpha;
			ctx.shadowColor = rgba(pal.mid, 0.9);
			ctx.shadowBlur = l * 1.2;
			tracePlus(ctx, l, t);
			const g = ctx.createLinearGradient(0, -l, 0, l);
			g.addColorStop(0, pal.top);
			g.addColorStop(1, pal.mid);
			ctx.fillStyle = g;
			ctx.fill();
			ctx.shadowBlur = 0;
			tracePlus(ctx, l * 0.5, t * 0.55);
			ctx.fillStyle = dark ? 'rgba(255,255,255,0.95)' : rgba(lighten(pal.top, 0.5), 0.95);
			ctx.fill();
			ctx.restore();
		}
		ctx.restore();
	},
	preview(plugin, pv, caret, now) {
		if (now < (pv.healthNext || 0)) return;
		pv.healthNext = now + 650;
		healPlus(pv, caret, now, Math.random() < 0.3);
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

/** The item that holds the wind of `host` (the plugin, or a preview host). */
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
		const u = h / 24, head = cx - (5 + 18 * easeOutCubic(f)) * u, tail = head - q.len * u * (1 - 0.4 * f), y = cy + q.dy;
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

/** The item that holds the water of `host` (the plugin, or a preview host). */
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


// ---- Effect: Stitch ------------------------------------------------------------------------------------------------
// A running stitch sewn along the line as you write, as if the words were being stitched down: each letter puts the
// thread under itself, the newest stitch pulled through as you watch, a needle-hole at either end of each. The stitches
// hold a moment, then the thread is drawn out and they fade, the oldest first; Backspace unpicks the ones it passes
// back over, and a new line ties a small cross-stitch knot where the last one ended. The thread is the theme's - saddle
// tan on Leather's paper, jeans gold on Folder's, red on Desk's, the binder's tan, Notebook's ballpoint blue, Herbarium's
// sepia, Blueprint's line blue - and on any other theme the caret's own color. It lies just under the letters, above the
// line's own rule.
// Settings: stitchSize (1 is normal).
const STITCH_HOLD_MS = 1500;    // how long a stitch stays whole after it is sewn
const STITCH_FADE_MS = 700;     // how long the thread takes to draw out
const STITCH_SEW_MS = 130;      // how long the newest stitch takes to pull through
const STITCH_MAX = 160;         // the most lengths of thread kept at once
const STITCH_KNOT_MS = 2200;    // how long a knot stays before it fades with the thread
// The thread for each theme, by Thymer's data-theme; themes not here use the caret's color.
const STITCH_THREADS = {
	'thymer-leather': '#b06c33',
	'thymer-folder': '#cf8a1f',
	'thymer-desk': '#c0372f',
	'thymer-binder': '#9a6634',
	'thymer-notebook': '#3563c9',
	'thymer-herbarium': '#8a6526',
	'thymer-blueprint': '#9bd8ff',
	'thymer-sakura': '#ff8fb3',
	'thymer-meadow': '#9fcc5f',
};

/** The thread's color: the theme's own, or the caret's. */
const stitchThread = (plugin) => STITCH_THREADS[document.documentElement.dataset.theme] || plugin.col();

/** The item that holds the thread of `host` (the plugin, or a preview host). */
function stitchOf(host) {
	const item = host.ensureItem('stitch');
	if (!item.runs) { item.runs = []; item.knots = []; }
	return item;
}

/** Where the thread lies under a caret `rect`: just below its foot, between the letters and the line's rule. */
const stitchY = (rect) => rect.y + rect.h + 1.5;

/** Sews thread from `x0` to `x1` along the line at `y`. */
function sewStitch(host, x0, x1, y, now) {
	const item = stitchOf(host);
	if (x1 - x0 < 0.5) return;
	item.runs.push({ x0, x1, y, t0: now });
	if (item.runs.length > STITCH_MAX) item.runs.splice(0, item.runs.length - STITCH_MAX);
}

function drawStitch(plugin, ctx, item, now, k) {
	const life = STITCH_HOLD_MS + STITCH_FADE_MS;
	item.runs = item.runs.filter((r) => now - r.t0 < life);
	item.knots = item.knots.filter((q) => now - q.t0 < STITCH_KNOT_MS + STITCH_FADE_MS);
	if (!item.runs.length && !item.knots.length) { item.done = true; return; }
	const rect = plugin.last, h = Math.max(rect ? rect.h : 20, 14), u = h / 20 * (plugin.cfg.stitchSize ?? 1);
	const dash = 5 * u, gap = 3.4 * u, period = dash + gap, width = Math.max(1.1, 1.3 * u);
	const thread = stitchThread(plugin), hi = lighten(thread, 0.5), dark = plugin.dark;
	const shadow = dark ? 'rgba(0,0,0,0.5)' : 'rgba(40,24,10,0.22)', hole = dark ? 'rgba(0,0,0,0.55)' : 'rgba(30,18,8,0.3)';
	const power = Math.min(1, 0.75 + 0.25 * k);
	const fade = (t0, hold) => { const age = now - t0; return age < hold ? 1 : Math.max(0, 1 - (age - hold) / STITCH_FADE_MS); };
	// How far each line has been sewn so far (the newest length still being pulled through), so a stitch begun under one
	// letter runs on under the next one as it is written.
	const reach = new Map();
	for (const r of item.runs) {
		const key = Math.round(r.y), x1 = r.x0 + (r.x1 - r.x0) * Math.min(1, (now - r.t0) / STITCH_SEW_MS);
		reach.set(key, Math.max(reach.get(key) ?? -Infinity, x1));
	}
	ctx.save();
	ctx.lineCap = 'round';
	for (const r of item.runs) {
		const a = fade(r.t0, STITCH_HOLD_MS) * power;
		if (a <= 0.01) continue;
		const end = reach.get(Math.round(r.y));
		ctx.globalAlpha = a;
		// The stitches that begin under this length of thread, on the seam's one pattern: each stitch is drawn once, by
		// the length it begins in, and runs on as far as the line has been sewn.
		for (let s = Math.ceil(r.x0 / period) * period; s < r.x1; s += period) {
			const a1 = Math.min(s + dash, end);
			if (a1 - s < 0.6) continue;
			const y = r.y + Math.sin(s * 0.9) * 0.25;   // a hand-sewn seam is never quite straight
			ctx.lineWidth = width;
			ctx.beginPath();   // its shadow on the page
			ctx.moveTo(s, y + 0.7); ctx.lineTo(a1, y + 0.7);
			ctx.strokeStyle = shadow;
			ctx.stroke();
			ctx.beginPath();   // the thread
			ctx.moveTo(s, y); ctx.lineTo(a1, y);
			ctx.strokeStyle = thread;
			ctx.stroke();
			if (a1 - s > width * 1.6) {   // the light along its twist
				ctx.beginPath();
				ctx.moveTo(s + width * 0.5, y - width * 0.2); ctx.lineTo(a1 - width * 0.5, y - width * 0.2);
				ctx.strokeStyle = rgba(hi, 0.6);
				ctx.lineWidth = width * 0.34;
				ctx.stroke();
			}
			ctx.fillStyle = hole;   // the needle-holes it goes in and out of
			for (const hx of a1 >= s + dash ? [s - width * 0.6, s + dash + width * 0.6] : [s - width * 0.6]) {
				ctx.beginPath();
				ctx.arc(hx, y, Math.max(0.45, 0.45 * u), 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
	ctx.lineWidth = width;
	for (const q of item.knots) {   // a knot: a small cross-stitch where a line of stitching was tied off
		const a = fade(q.t0, STITCH_KNOT_MS) * power;
		if (a <= 0.01) continue;
		const s = 2.6 * u;
		ctx.globalAlpha = a;
		for (const [off, col] of [[0.7, shadow], [0, thread]]) {
			ctx.beginPath();
			ctx.moveTo(q.x - s, q.y - s + off); ctx.lineTo(q.x + s, q.y + s + off);
			ctx.moveTo(q.x + s, q.y - s + off); ctx.lineTo(q.x - s, q.y + s + off);
			ctx.strokeStyle = col;
			ctx.lineWidth = width;
			ctx.stroke();
		}
	}
	ctx.restore();
}

EFFECTS.stitch = {
	id: 'stitch', label: 'Stitch', mode: 'signature', keepsState: true, blend: 'source-over',
	preset: { name: 'Stitch', color: '#e3a33a', accent: '#8a5a2b' },
	defaults: { stitchSize: 1 },
	onMove(plugin, prev, cur, info) {
		if (!prev) return;
		const now = info.now;
		if (isWriting(info)) { sewStitch(plugin, prev.x, cur.x, stitchY(cur), now); return; }
		if (!info.typed) return;
		const item = stitchOf(plugin);
		if (info.dx < -0.5 && Math.abs(info.dy) < 1) {   // Backspace: the stitches it passes back over are unpicked
			const y = stitchY(cur);
			item.runs = item.runs.filter((r) => Math.abs(r.y - y) > 1 || r.x0 < cur.x - 0.5);
			for (const r of item.runs) if (Math.abs(r.y - y) <= 1 && r.x1 > cur.x) r.x1 = cur.x;
		} else if (info.dy >= cur.h * 0.8) {   // a new line: a knot where the stitching ended
			if (item.runs.some((r) => now - r.t0 < STITCH_HOLD_MS)) item.knots.push({ x: prev.x + 3, y: stitchY(prev), t0: now });
		}
	},
	onShift(plugin, dx, dy) {   // the page scrolled: the seam goes with the text
		const item = plugin.items.find((it) => it.effect === 'stitch' && !it.done);
		if (!item) return;
		for (const r of item.runs || []) { r.x0 += dx; r.x1 += dx; r.y += dy; }
		for (const q of item.knots || []) { q.x += dx; q.y += dy; }
	},
	onSample(plugin, cur) {   // the caret gone (another page): nothing may stay drawn where it was
		if (cur) return;
		const item = plugin.items.find((it) => it.effect === 'stitch' && !it.done);
		if (item) { item.runs = []; item.knots = []; item.done = true; }
	},
	draw(plugin, ctx, item, p, k, now) { drawStitch(plugin, ctx, item, now, k); },
	preview(plugin, pv, caret, now) {
		if (now < (pv.stitchNext || 0)) return;
		pv.stitchNext = now + 160;
		const x = pv.stitchX ?? caret.x;
		sewStitch(pv, x, x + 9, stitchY(caret), now);
		pv.stitchX = x + 9 > caret.x + 140 ? caret.x : x + 9;
	},
};


// ---- Effect: Slime (jelly rectangle caret) -------------------------------------------------------------------------
// The caret is always a rectangle - the box of the letter it stands on - made of jelly: its base stays put and its body
// is a little chain of springs, so the top lags behind and rocks like a bone in a rig. Standing still it sways gently
// from side to side and breathes; every letter (or step) kicks it the way it moves, so it leans, stretches, overshoots
// and wobbles back; a new line or a jump squashes it flat and lets it spring up, and the body is drawn out from where it
// was to where it landed, its foot arriving first and its top after it. Drawn as one soft shape: the sides bend with the
// sway and bulge out when it is squashed.
// Settings: slimeIdle (how far it sways at rest; 1 is normal, 0 holds it still).
const SLIME_STEP = 1 / 240;   // s: the springs are integrated in steps this small, so every frame rate wobbles alike

/**
 * The spring state of the jelly of `item`: m (the middle's sideways offset), t (the top's, chasing m), sx and sy (scales),
 * each with its velocity; and the way it is still on its journey to a new line or place: the foot's offset from the caret
 * (ax, ay) and the top's (bx, by), which chases the foot's.
 */
function slimeState(item) {
	return item.S || (item.S = { m: 0, vm: 0, j: 0, vj: 0, t: 0, vt: 0, sx: 1, vx: 0, sy: 1, vy: 0, ax: 0, ay: 0, avx: 0, avy: 0, bx: 0, by: 0, bvx: 0, bvy: 0 });
}

/** A kick from the caret moving from `prev` to `cur`: lean the way it went, stretch along the move; squash for a leap. */
function wobbleSlime(plugin, prev, cur) {
	const item = plugin.ensureItem('slime'), S = slimeState(item);
	const dx = cur.x - prev.x, dy = cur.y - prev.y, dist = Math.hypot(dx, dy);
	if (dist < 0.2) return;
	const dir = dx >= 0 ? 1 : -1;
	if (Math.abs(dy) > cur.h * 0.6 || dist > cur.h * 2.5) {   // a new line or a jump: lands flat, then springs up
		S.sy = 0.55; S.sx = 1.4; S.vy = 6; S.vx = -4;
		S.vm += dir * 110; S.vj += dir * 130; S.vt += dir * 160;
		S.ax -= dx; S.ay -= dy; S.bx -= dx; S.by -= dy;   // the jelly stays where it was and is drawn across to the caret
	} else {
		S.vm += dir * 45; S.vj += dir * 60; S.vt += dir * 80;
		S.sx = Math.min(1.35, S.sx + 0.16); S.sy = Math.max(0.7, S.sy - 0.1);
	}
	plugin.kick();
}

/**
 * The jelly drawn out between where its head is and where its tail still is (`tx`, `ty` from the head): the tail is the
 * head's own shape, `scale` smaller (a jelly pulled long gets thinner, it does not keep its width), and the body is the
 * hull of the two, its corners rounded off. Leaves the path closed, for the caller to paint.
 */
function slimeDrip(ctx, head, tx, ty, scale) {
	let cx = 0, cy = 0;
	for (const q of head) { cx += q.x / head.length; cy += q.y / head.length; }
	const all = head.concat(head.map((q) => ({ x: cx + (q.x - cx) * scale + tx, y: cy + (q.y - cy) * scale + ty })));
	all.sort((a, b) => a.x - b.x || a.y - b.y);
	const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const hull = [];
	for (const pass of [all, all.slice().reverse()]) {   // Andrew's monotone chain: the lower hull, then the upper
		const start = hull.length;
		for (const q of pass) {
			while (hull.length >= start + 2 && cross(hull[hull.length - 2], hull[hull.length - 1], q) <= 0) hull.pop();
			hull.push(q);
		}
		hull.pop();
	}
	const n = hull.length, mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
	if (n < 3) return;
	const m0 = mid(hull[n - 1], hull[0]);
	ctx.moveTo(m0.x, m0.y);
	for (let i = 0; i < n; i++) { const m = mid(hull[i], hull[(i + 1) % n]); ctx.quadraticCurveTo(hull[i].x, hull[i].y, m.x, m.y); }
	ctx.closePath();
}

function drawSlime(plugin, ctx, item, now, dt) {
	const rect = caretBox(plugin);
	if (!rect) { item.done = true; plugin.hideCaret('slime', false); return; }
	const S = slimeState(item), idle = plugin.cfg.slimeIdle ?? 1;
	const w = Math.max(rect.cw || 9, 8), h = rect.h, cx = rect.x + w / 2, base = rect.y + h;
	// What the middle is pulled toward: nothing but the rest sway, which is two slow waves out of step.
	const drive = idle * w * (0.13 * Math.sin(now * 0.0057) + 0.05 * Math.sin(now * 0.0093 + 1));
	const breathe = 1 + idle * 0.03 * Math.sin(now * 0.0057 + 1);
	const wm = 20, zm = 0.2, wj = 24, wt = 30, zt = 0.16, ws = 26, zs = 0.2, wf = 24, wb = 15, zf = 0.8;   // spring speeds (rad/s) and dampings: underdamped, so it overshoots
	let left = Math.min((dt || 16) / 1000, 0.05);
	while (left > 1e-6) {
		const s = Math.min(SLIME_STEP, left);
		left -= s;
		S.vm += (-wm * wm * (S.m - drive) - 2 * zm * wm * S.vm) * s; S.m += S.vm * s;
		S.vj += (-wj * wj * (S.j - S.m) - 2 * zt * wj * S.vj) * s; S.j += S.vj * s;
		S.vt += (-wt * wt * (S.t - S.j) - 2 * zt * wt * S.vt) * s; S.t += S.vt * s;
		S.vx += (-ws * ws * (S.sx - 1) - 2 * zs * ws * S.vx) * s; S.sx += S.vx * s;
		S.vy += (-ws * ws * (S.sy - breathe) - 2 * zs * ws * S.vy) * s; S.sy += S.vy * s;
		S.avx += (-wf * wf * S.ax - 2 * zf * wf * S.avx) * s; S.ax += S.avx * s;   // the foot comes in first...
		S.avy += (-wf * wf * S.ay - 2 * zf * wf * S.avy) * s; S.ay += S.avy * s;
		S.bvx += (-wb * wb * (S.bx - S.ax) - 2 * zf * wb * S.bvx) * s; S.bx += S.bvx * s;   // ...and the top after it
		S.bvy += (-wb * wb * (S.by - S.ay) - 2 * zf * wb * S.bvy) * s; S.by += S.bvy * s;
	}
	item.hidesCaret = true;
	plugin.hideCaret('slime', true);   // only the jelly is seen, never the line caret under it
	const hw = (w * S.sx) / 2, hh = h * S.sy;
	const bulge = clamp((1 - S.sy) * w * 0.9, -w * 0.5, w * 0.6);
	// The spine: the base fixed, then three joints that each lag the one below, so the body bends in a soft curve. The
	// two edges are drawn through points along it, and bow out a little when the jelly is squashed.
	const lim = w * 1.2, spine = [[0, 0], [0.35, clamp(S.m, -lim, lim)], [0.7, clamp(S.j, -lim, lim)], [1, clamp(S.t, -lim, lim)]];
	const edge = (side) => spine.map(([f, off]) => ({ x: side * (hw + bulge * Math.sin(Math.PI * f)) + off, y: -hh * f }));
	const L = edge(-1), R = edge(1).reverse();
	const curve = (pts) => { for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2); ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); };
	ctx.save();
	ctx.translate(cx + S.ax, base + S.ay);   // the body's head: the part that is first to arrive
	ctx.beginPath();
	const tx = S.bx - S.ax, ty = S.by - S.ay, reach = Math.hypot(tx, ty);
	if (reach < 0.5) {
		ctx.moveTo(L[0].x, L[0].y);
		curve(L);
		ctx.lineTo(R[0].x, R[0].y);
		curve(R);
		ctx.closePath();
	} else {
		slimeDrip(ctx, [...L, ...R], tx, ty, 1 / (1 + reach / (3 * h)));
	}
	paintCaretBody(ctx, plugin.col(), 0.45, 1);
	ctx.restore();
	plugin.kick();   // it never rests: standing still it is still swaying
}

EFFECTS.slime = {
	id: 'slime', label: 'Slime', mode: 'signature', keepsState: true, ownsCaret: true, blend: 'source-over',   // ownsCaret: it is the caret, so Motion smear stands aside
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

// ---- Effect: Combo -------------------------------------------------------------------------------------------------
// Typing as a game: every letter in a run adds one to a counter that floats above the caret and pops with each hit. The
// run lives while the next letter comes within a moment; stop and it breaks. The higher the count, the hotter the caret:
//   0-9    the caret as it is, white counter
//   10     rank C: the caret turns red and sparks fly off it
//   25     rank B: orange, more sparks
//   50     rank A: blue, with blue sparks
//   100    rank S: white-hot blue, sparks all over
// A new mark is announced (NICE, GREAT, SUPER, ULTRA) with a shockwave that races out from the caret, a flash, a burst of sparks and
// its rank letter, which lands beside the counter and stays. The counter follows the caret on a spring, its digits roll as
// they change and it shakes a little at the higher ranks; a thin bar under it shows how long the run has left (and flashes
// red when it is nearly out). A broken run of ten or more shatters: the number comes apart and its pieces fall.
// Settings: comboWindowMs (how long a run waits for the next letter; 1400 is normal).
const COMBO_TIERS = [
	{ at: 0, hue: null, word: '', rank: '' }, { at: 10, hue: 8, word: 'NICE', rank: 'C' }, { at: 25, hue: 30, word: 'GREAT', rank: 'B' },
	{ at: 50, hue: 215, word: 'SUPER', rank: 'A' }, { at: 100, hue: -1, word: 'ULTRA', rank: 'S' },   // hue -1: white-hot blue, shifting toward violet
];
const COMBO_SPARKS_PER_S = [0, 7, 14, 22, 40];   // sparks a second, by tier, on top of those a letter throws
const COMBO_SPARKS_MAX = 90;
const COMBO_TINTS = [null, '#ff4d3a', '#ff9a2e', '#4da3ff', '#bfe3ff'];   // the caret's color by tier (null: its own)
const COMBO_SHARDS = 7;         // the pieces a broken number comes apart in
const COMBO_WAVE_MS = 650;      // a shockwave's life
const COMBO_ROLL_MS = 150;      // a digit that changes rolls in over this long
const COMBO_FOLLOW = 24;        // rad/s: how quickly the counter catches up with the caret (a spring, nearly critically damped)

/** The tier a count has reached: an index into COMBO_TIERS. Pure. */
const comboTier = (n) => COMBO_TIERS.reduce((t, c, i) => (n >= c.at ? i : t), 0);

/** The color of a tier at time `now`, as [h, s, l]. Pure. */
function comboHue(tier, now) {
	const h = COMBO_TIERS[tier].hue;
	return h === null ? [0, 0, 96] : h === -1 ? [200 + 50 * Math.sin(now * 0.002), 100, 70] : [h, 100, 60];
}

/** The item that holds the run of `host` (the plugin, or a preview host). */
function comboOf(host) {
	const item = host.ensureItem('combo');
	if (item.n === undefined) {
		Object.assign(item, { n: 0, prevN: 0, lastAt: 0, popAt: -1e9, wordAt: -1e9, word: '', flashAt: -1e9, flashTier: 0, rankAt: -1e9, seed: 0, size: 18, fallen: [], sparks: [], rings: [], acc: 0, placed: false, ax: 0, ay: 0, avx: 0, avy: 0 });
	}
	return item;
}

/** Throws one spark: `vx`, `vy` px/s at the start; `ember` ones are slow, big and drift up for a second or more. */
function comboSpark(item, x, y, vx, vy, r, tier, now, ember) {
	if (item.sparks.length >= COMBO_SPARKS_MAX) return;
	item.sparks.push({ x, y, vx, vy, r, cool: tier >= 3, t0: now, life: ember ? 900 + Math.random() * 700 : 500 + Math.random() * 600, ph: Math.random() * 6.28, ember });
}

/** Flicks `n` sparks up out of the caret at (x, y) of the tier `tier`: mostly quick streaks, from the second rank some embers that float. */
function comboSparks(item, x, y, h, tier, n, now) {
	const u = h / 24;
	for (let i = 0; i < n; i++) {
		const px = x + (Math.random() - 0.5) * h * 0.25;
		if (tier >= 2 && Math.random() < 0.3) { comboSpark(item, px, y, (Math.random() - 0.5) * 26 * u, -(16 + Math.random() * 22) * u, (1.1 + Math.random() * 0.9) * u, tier, now, true); continue; }
		const a = -Math.PI / 2 + (Math.random() - 0.5) * (tier >= 3 ? 2.4 : 1.7), v = (35 + Math.random() * 70) * u * (tier >= 4 ? 1.4 : 1);
		comboSpark(item, px, y, Math.cos(a) * v, Math.sin(a) * v, (0.6 + Math.random() * 1.1) * u, tier, now, false);
	}
}

/** A ring of sparks thrown out all round (x, y), for a new mark. */
function comboBurst(item, x, y, h, tier, now) {
	const u = h / 24, n = 14 + 4 * tier;
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, v = (90 + Math.random() * 90) * u;
		comboSpark(item, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.8, (0.8 + Math.random() * 1.2) * u, tier, now, false);
	}
}

/** One more letter for the run at the caret `rect` - or a new run, if the last one has run out. */
function comboHit(host, rect, now) {
	const item = comboOf(host), win = host.cfg.comboWindowMs || 1400;
	if (item.n && now - item.lastAt > win) comboBreak(item, rect, now);
	if (!item.n) item.placed = false;   // a new run: the counter starts at the caret
	const before = comboTier(item.n);
	item.prevN = item.n;
	item.n++;
	item.lastAt = now; item.popAt = now; item.seed = Math.random() * 1000;
	const tier = comboTier(item.n), x = rect.x + rect.w / 2, h = Math.max(rect.h, 16);
	if (tier > before) {
		item.word = COMBO_TIERS[tier].word; item.wordAt = now; item.flashAt = now; item.flashTier = tier; item.rankAt = now;
		item.rings.push({ t0: now, tier, x, y: rect.y + rect.h / 2, h, delay: 0 });
		if (tier >= 3) item.rings.push({ t0: now, tier, x, y: rect.y + rect.h / 2, h, delay: 110 });
		comboBurst(item, x, rect.y + rect.h / 2, h, tier, now);
	}
	if (tier >= 1) comboSparks(item, x, rect.y + rect.h * 0.3, h, tier, 2 + tier, now);
}

/** The run ends: a count of ten or more shatters where its counter was. */
function comboBreak(item, rect, now) {
	if (item.n >= 10) {
		const shards = [];
		for (let i = 0; i < COMBO_SHARDS; i++) shards.push({ vx: (Math.random() - 0.5) * 90 + (i - COMBO_SHARDS / 2) * 9, vy: -(25 + Math.random() * 55), rot: (Math.random() - 0.5) * 5 });
		item.fallen.push({ n: item.n, x: item.placed ? item.ax : rect.x + rect.w / 2, y: item.placed ? item.ay : rect.y - 6, size: item.size, tier: comboTier(item.n), t0: now, life: 950, shards });
	}
	item.n = 0;
}

/** The counter's text with digits that roll: a character that differs from the count before it slides up out and the new one in from below. */
function drawComboNumber(ctx, item, cx, y, size, now, power, dark, hsl, c) {
	const str = `×${item.n}`, prevStr = item.prevN ? `×${item.prevN}` : '';
	const total = ctx.measureText(str).width, x0 = cx - total / 2, roll = prevStr ? easeOutBack(clamp01((now - item.popAt) / COMBO_ROLL_MS)) : 1, slide = size * 0.6;
	ctx.textAlign = 'left';
	const put = (ch, x, yy, a) => {
		if (a < 0.02) return;
		ctx.globalAlpha = a * power;
		ctx.strokeText(ch, x, yy);
		ctx.fillStyle = hsl(c);
		ctx.fillText(ch, x, yy);
	};
	for (let i = 0; i < str.length; i++) {
		const x = x0 + ctx.measureText(str.slice(0, i)).width, j = i - (str.length - prevStr.length), old = j >= 0 ? prevStr[j] : '';
		if (roll >= 1 || old === str[i]) { put(str[i], x, y, 1); continue; }
		const e = clamp01(roll);
		put(str[i], x, y + (1 - roll) * slide, e);
		if (old) put(old, x, y - roll * slide, 1 - e);
	}
	ctx.textAlign = 'center';
	return total;
}

function drawCombo(plugin, ctx, item, now, k, dt) {
	const alive = (q) => now - q.t0 < q.life;
	item.fallen = item.fallen.filter(alive); item.sparks = item.sparks.filter(alive); item.rings = item.rings.filter((q) => now - q.t0 < COMBO_WAVE_MS + q.delay);
	const rect = plugin.last, win = plugin.cfg.comboWindowMs || 1400, s = Math.min((dt || 16) / 1000, 0.05);
	if (rect && item.n && now - item.lastAt > win) comboBreak(item, rect, now);
	const tier = comboTier(item.n);
	// the caret itself takes the tier's color (the line or the block, whichever is in use)
	const tint = COMBO_TINTS[item.n ? tier : 0];
	if (!plugin.isPreview && plugin.tint !== tint) { plugin.tint = tint; plugin.applyCaretStyle(); }
	item.acc += s * COMBO_SPARKS_PER_S[tier];
	if (rect && item.n && item.acc >= 1) { const nn = Math.floor(item.acc); item.acc -= nn; comboSparks(item, rect.x + rect.w / 2, rect.y + rect.h * 0.3, Math.max(rect.h, 16), tier, nn, now); }
	if (!item.n) item.acc = 0;
	if (!item.n && !item.fallen.length && !item.sparks.length && !item.rings.length && (now - item.flashAt) > 400) { item.done = true; return; }
	const dark = plugin.dark, power = Math.min(1, 0.75 + 0.25 * k), L = dark ? 0 : -22;
	const hsl = (c, a = 1, dl = 0) => `hsla(${c[0]}, ${c[1]}%, ${c[2] + L + dl}%, ${a})`;
	if (!dark) ctx.globalCompositeOperation = 'source-over';
	ctx.save();
	ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

	for (const q of item.sparks) {   // sparks: thrown up, slowing, flickering - streaks along their flight, embers that drift
		const t = (now - q.t0) / 1000, f = (now - q.t0) / q.life;
		if (q.ember) {
			const x = q.x + q.vx * t + Math.sin(q.ph + t * 5) * 4, y = q.y + q.vy * t - 6 * t * t, a = Math.sin(Math.PI * Math.min(1, f)) * (0.7 + 0.3 * Math.sin(q.ph + t * 17)) * power;
			if (a < 0.03) continue;
			const c = q.cool ? [210, 100, 76] : [f < 0.5 ? 38 : 12, 100, f < 0.5 ? 62 : 52];
			ctx.globalAlpha = Math.min(1, a);
			ctx.shadowColor = hsl(c, 0.9); ctx.shadowBlur = 9;
			ctx.fillStyle = hsl(c);
			ctx.beginPath(); ctx.arc(x, y, q.r * (1 - 0.5 * f), 0, Math.PI * 2); ctx.fill();
			continue;
		}
		const drag = Math.exp(-1.8 * t), x = q.x + (q.vx * (1 - drag)) / 1.8, y = q.y + (q.vy * (1 - drag)) / 1.8 - 10 * t * t;
		const a = Math.sin(Math.PI * Math.min(1, f * 1.15)) * (0.6 + 0.4 * Math.sin(q.ph + t * 22)) * power;
		if (a < 0.03) continue;
		const vx = q.vx * drag, vy = q.vy * drag - 20 * t, tail = Math.min(0.045, 0.012 + 0.0005 * Math.hypot(vx, vy)) * (1 - 0.5 * f);   // the tail is the last few hundredths of a second of its flight
		const c = q.cool ? [205, 100, f < 0.4 ? 82 : 68] : [f < 0.4 ? 44 : 14, 100, f < 0.4 ? 66 : 56];   // blue sparks from 50, hot ones before
		ctx.globalAlpha = Math.min(1, a);
		ctx.shadowColor = hsl(c, 0.9); ctx.shadowBlur = 5;
		ctx.strokeStyle = hsl(c); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(0.8, q.r * (1.5 - 0.7 * f));
		ctx.beginPath(); ctx.moveTo(x - vx * tail, y - vy * tail); ctx.lineTo(x, y); ctx.stroke();
	}
	ctx.shadowBlur = 0; ctx.globalAlpha = 1;

	for (const q of item.fallen) {   // a broken run: the number comes apart in strips that tumble down and fade
		const t = (now - q.t0) / 1000, f = (now - q.t0) / q.life, c = comboHue(q.tier, now), u = q.size / 20, txt = `×${q.n}`;
		ctx.font = `800 ${q.size}px system-ui, sans-serif`;
		const W = ctx.measureText(txt).width, sw = W / COMBO_SHARDS;
		ctx.globalAlpha = Math.min(1, (1 - f) * 1.3) * 0.85 * power;
		ctx.fillStyle = hsl([c[0], 25, 62], 1);
		for (let i = 0; i < COMBO_SHARDS; i++) {
			const sh = q.shards[i], mx = -W / 2 + sw * (i + 0.5), g = 520 * u;
			ctx.save();
			ctx.translate(q.x + mx + sh.vx * t * u, q.y - q.size * 0.35 + sh.vy * t * u + 0.5 * g * t * t);
			ctx.rotate(sh.rot * t);
			ctx.beginPath(); ctx.rect(-sw / 2 - 0.5, -q.size * 0.7, sw + 1, q.size * 1.1); ctx.clip();
			ctx.fillText(txt, -mx, q.size * 0.35);
			ctx.restore();
		}
	}
	ctx.globalAlpha = 1;

	if (rect && item.n) {
		const h = Math.max(rect.h, 16), u = h / 24, cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, c = comboHue(tier, now);
		const left = clamp01(1 - (now - item.lastAt) / win), fl = (now - item.flashAt) / 400;
		ctx.save();
		if (dark) ctx.globalCompositeOperation = 'lighter';
		for (const q of item.rings) {   // a shockwave at a new mark: a thin bright front racing out, with a soft wake behind it that thins as it goes
			const f = (now - q.t0 - q.delay) / COMBO_WAVE_MS;
			if (f < 0 || f >= 1) continue;
			const rc = comboHue(q.tier, now), e = 1 - Math.pow(1 - f, 2.8), R = q.h * (0.5 + 3.6 * e), band = q.h * (0.14 + 0.9 * (1 - f)), fade = Math.pow(1 - f, 1.4) * power * (q.delay ? 0.6 : 1);
			const g = ctx.createRadialGradient(q.x, q.y, Math.max(0, R - band), q.x, q.y, R + band * 0.15);
			g.addColorStop(0, hsl(rc, 0, 0)); g.addColorStop(0.75, hsl(rc, 0.28 * fade, 0)); g.addColorStop(0.97, hsl(rc, 0.75 * fade, 14)); g.addColorStop(1, hsl(rc, 0, 14));
			ctx.fillStyle = g;
			ctx.beginPath(); ctx.arc(q.x, q.y, R + band * 0.15, 0, Math.PI * 2); ctx.fill();
			ctx.globalAlpha = fade; ctx.strokeStyle = hsl(rc, 1, 24); ctx.lineWidth = Math.max(0.5, (1 - f) * 2.2 * u);
			ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, Math.PI * 2); ctx.stroke();
			ctx.globalAlpha = 1;
		}
		ctx.restore();
		ctx.shadowBlur = 0; ctx.globalAlpha = 1;
		if (fl >= 0 && fl < 1) {   // a flash at a mark
			const r = h * (1.2 + 1.4 * fl), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r), fc = comboHue(item.flashTier, now);
			g.addColorStop(0, hsl(fc, 0.5 * (1 - fl) * power)); g.addColorStop(1, hsl(fc, 0));
			ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
		}
		if (tier >= 1) {   // a glow round the caret, hotter with the tier
			const gr = h * (1 + 0.25 * tier), glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
			glow.addColorStop(0, hsl(c, (0.16 + 0.07 * tier) * power)); glow.addColorStop(1, hsl(c, 0));
			ctx.fillStyle = glow; ctx.fillRect(cx - gr, cy - gr, gr * 2, gr * 2);
		}

		// the counter: it follows the caret on a spring, snapping to it at the start of a run
		const tx = cx, ty = rect.y - 6 * u;
		if (!item.placed) { item.ax = tx; item.ay = ty; item.avx = item.avy = 0; item.placed = true; }
		for (let left2 = s; left2 > 1e-6;) {
			const st = Math.min(1 / 120, left2); left2 -= st;
			item.avx += (-COMBO_FOLLOW * COMBO_FOLLOW * (item.ax - tx) - 2 * 0.85 * COMBO_FOLLOW * item.avx) * st; item.ax += item.avx * st;
			item.avy += (-COMBO_FOLLOW * COMBO_FOLLOW * (item.ay - ty) - 2 * 0.85 * COMBO_FOLLOW * item.avy) * st; item.ay += item.avy * st;
		}
		const age = now - item.popAt, pop = 1 + 0.55 * Math.max(0, 1 - age / 220) * Math.sin(Math.min(1, age / 220) * Math.PI * 0.5 + 1.2);
		const size = (15 + 3 * tier) * u * (0.9 + 0.1 * Math.min(k, 1.5)) * pop;
		item.size = size / pop;
		const amp = tier >= 2 ? 0.7 * (tier - 1) * u * Math.max(0, 1 - age / 140) : 0;   // from the second rank the number shakes at a hit
		const x = item.ax + (hash(item.seed) * 2 - 1) * amp, y = item.ay + (hash(item.seed + 7.7) * 2 - 1) * amp;
		ctx.font = `800 ${size}px system-ui, sans-serif`;
		ctx.shadowColor = hsl(c, 0.9, 0); ctx.shadowBlur = 6 + 4 * tier;
		ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.16; ctx.strokeStyle = dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
		const total = drawComboNumber(ctx, item, x, y, size, now, power, dark, hsl, c);
		ctx.shadowBlur = 0; ctx.globalAlpha = power;
		const bw = 26 * u, by = y + 3 * u, low = left < 0.3, blink = 0.5 + 0.5 * Math.sin(now * 0.035);   // the bar: how long the run has left
		ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
		ctx.fillRect(x - bw / 2, by, bw, 2 * u);
		ctx.fillStyle = low ? `hsla(2, 100%, ${dark ? 62 : 45}%, ${0.55 + 0.45 * blink})` : hsl(c, 0.95);
		ctx.fillRect(x - bw / 2, by, bw * left, 2 * u);
		if (tier >= 1) {   // its rank, beside the counter: it lands with a pop when it is earned
			const ra = now - item.rankAt, rs = size * 1.25 * (ra < 420 ? lerp(2.4, 1, easeOutBack(clamp01(ra / 420))) : 1);
			ctx.font = `900 italic ${rs}px system-ui, sans-serif`;
			ctx.shadowColor = hsl(c, 0.95, 0); ctx.shadowBlur = 8 + 4 * tier;
			ctx.lineWidth = rs * 0.14; ctx.globalAlpha = (ra < 0 ? 1 : clamp01(ra / 80)) * power;
			const rx = x + total / 2 + size * 0.62, ry = y + size * 0.1;
			ctx.strokeText(COMBO_TIERS[tier].rank, rx, ry);
			ctx.fillStyle = hsl(c, 1, 6);
			ctx.fillText(COMBO_TIERS[tier].rank, rx, ry);
			ctx.shadowBlur = 0;
		}
		const wf2 = (now - item.wordAt) / 1000;   // the word of the mark, for a second
		if (item.word && wf2 < 1) {
			const wp = easeOutBack(clamp01(wf2 / 0.2));
			ctx.globalAlpha = (wf2 < 0.7 ? 1 : 1 - (wf2 - 0.7) / 0.3) * power;
			ctx.font = `900 ${11 * u * wp}px system-ui, sans-serif`;
			ctx.fillStyle = hsl(c, 1, 8);
			ctx.fillText(item.word, x, y - size - 2 * u - wf2 * 6 * u);
		}
	}
	ctx.restore();
	plugin.kick();   // the bar runs down and the sparks fly on their own
}

EFFECTS.combo = {
	id: 'combo', label: 'Combo', mode: 'signature', keepsState: true, blend: 'source-over',
	preset: { name: 'Combo', color: '#ffe14d', accent: '#ff7a1a' },
	defaults: { comboWindowMs: 1400 },
	onMove(plugin, prev, cur, info) { if (isWriting(info)) comboHit(plugin, cur, info.now); },
	onShift(plugin, dx, dy) {   // the page scrolled: the counter goes with the text rather than chasing it
		const item = plugin.items.find((it) => it.effect === 'combo' && !it.done);
		if (item && item.placed) { item.ax += dx; item.ay += dy; }
	},
	draw(plugin, ctx, item, p, k, now, dt) { drawCombo(plugin, ctx, item, now, k, dt); },
	preview(plugin, pv, caret, now) {
		if (now < (pv.comboNext || 0)) return;
		pv.comboNext = now + 110;
		const item = comboOf(pv);
		if (item.n >= 130) item.lastAt = 0;   // the preview runs up through the tiers, lets go, and starts again
		comboHit(pv, caret, now);
	},
};

// ---- Effect: Sleepy caret --------------------------------------------------------------------------------------------
// Stop writing for a while and the caret nods off: it sinks to a droop, dims and breathes slowly, and little z's float up
// from it. Any key or move wakes it with a stretch (a bounce back to its full height) and the z's pop away.
// Settings: sleepAfterMs (how long it waits before it dozes off; 15000 is normal).
const SLEEP_FALL_MS = 900;       // the sinking into sleep
const SLEEP_WAKE_MS = 420;       // the stretch on waking
const SLEEP_DROOP = 0.62;        // the share of its height the sleeping caret keeps, at the bottom of a breath
const SLEEP_BREATH_MS = 3600;    // one breath
const SLEEP_Z_EVERY_MS = 1500;   // a new z this often
const SLEEP_Z_LIFE_MS = 3200;

/** The caret has done something: whatever it was, it is awake and the clock starts again. */
function sleepNudge(plugin, now) {
	const S = plugin.state('sleep');
	clearTimeout(S.timer);
	if (S.asleep) { S.asleep = false; S.wakeAt = now; plugin.kick(); }
	S.timer = setTimeout(() => sleepDoze(plugin), Math.max(1000, Number(plugin.cfg.sleepAfterMs) || 15000));
}

/** The timer ran out: the caret falls asleep, unless something else has the caret or there is none to put to bed. */
function sleepDoze(plugin) {
	const S = plugin.state('sleep');
	S.timer = 0;
	if (!plugin.last || caretTaken(plugin) || document.hidden) { S.timer = setTimeout(() => sleepDoze(plugin), 5000); return; }   // look again in a while
	S.asleep = true; S.sleepAt = performance.now(); S.wakeAt = 0; S.zs = []; S.zNext = S.sleepAt + 700;
	plugin.ensureItem('sleep');
	plugin.kick();
}

function drawSleep(plugin, ctx, item, now, dt) {
	const S = plugin.state('sleep'), rect = caretBox(plugin);
	if (!rect || caretTaken(plugin)) { S.asleep = false; plugin.hideCaret('sleep', false); item.done = true; return; }
	const waking = !S.asleep, wake = waking ? (now - (S.wakeAt || now)) / SLEEP_WAKE_MS : 0;
	if (waking && (wake >= 1 || !S.wakeAt)) {   // awake again: the real caret is back, and the z's are gone
		plugin.hideCaret('sleep', false);
		if (!(S.zs || []).length) { item.done = true; return; }
	}
	const col = plugin.col(), dark = plugin.dark, w = Math.max(rect.w, 2), h = rect.h, u = h / 24;
	let scale = 1, alpha = 1;
	if (S.asleep) {
		const fall = easeInOutSine(clamp01((now - S.sleepAt) / SLEEP_FALL_MS)), breath = 0.5 + 0.5 * Math.sin((now - S.sleepAt) / SLEEP_BREATH_MS * Math.PI * 2);
		scale = lerp(1, SLEEP_DROOP + (1 - SLEEP_DROOP) * 0.45 * breath, fall);   // it settles, then rises and sinks with each breath
		alpha = lerp(1, 0.5 + 0.35 * breath, fall);
	} else if (wake < 1) {
		scale = lerp(SLEEP_DROOP, 1, easeOutBack(clamp01(wake)));   // up again, a little past full height and back
		alpha = lerp(0.5, 1, clamp01(wake * 2));
	}
	if (S.asleep || wake < 1) {
		plugin.hideCaret('sleep', true);
		item.hidesCaret = true;
		const bh = h * scale, block = plugin.cfg.style === 'block';
		ctx.save();
		ctx.globalAlpha = clamp01(alpha);
		ctx.beginPath();
		if (block) { const r = Math.min(2, w / 3); ctx.roundRect ? ctx.roundRect(rect.x, rect.y + h - bh, w, bh, r) : ctx.rect(rect.x, rect.y + h - bh, w, bh); } else ctx.rect(rect.x, rect.y + h - bh, w, bh);
		paintCaretBody(ctx, col, block ? 0.42 : 1, block ? 1 : 0);
		ctx.restore();
	}
	// the z's: one now and then from above the caret, each bigger than the last, drifting up and a little right
	const zs = S.zs || (S.zs = []);
	if (S.asleep && now >= S.zNext) { S.zNext = now + SLEEP_Z_EVERY_MS; zs.push({ t0: now, n: (S.zCount = (S.zCount || 0) + 1) % 3, ph: Math.random() * 6.28 }); }
	S.zs = zs.filter((z) => now - z.t0 < SLEEP_Z_LIFE_MS && (S.asleep || now - (S.wakeAt || now) < 220));
	if (S.zs.length) {
		ctx.save();
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
		for (const z of S.zs) {
			const f = (now - z.t0) / SLEEP_Z_LIFE_MS, grow = 0.7 + 0.5 * z.n * 0.5 + 0.35 * f, size = 16 * u * grow;
			const x = rect.x + w + (6 + 20 * f) * u + Math.sin(f * 7 + z.ph) * 3 * u, y = rect.y + h * 0.2 - 30 * u * f;
			const popOut = S.asleep ? 1 : 1 - clamp01((now - S.wakeAt) / 220);
			ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, f * 1.1)) * 0.9 * popOut;
			ctx.font = `800 italic ${size}px system-ui, sans-serif`;
			ctx.lineWidth = size * 0.18; ctx.strokeStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.75)';
			ctx.shadowColor = rgba(col, 0.7); ctx.shadowBlur = 5;
			ctx.save();
			ctx.translate(x, y); ctx.rotate(Math.sin(f * 5 + z.ph) * 0.18);
			ctx.strokeText('z', 0, 0);
			ctx.fillStyle = dark ? lighten(col, 0.35) : col;
			ctx.fillText('z', 0, 0);
			ctx.restore();
		}
		ctx.restore();
	}
	plugin.kick();   // it breathes, the z's rise
}

EFFECTS.sleep = {
	id: 'sleep', label: 'Sleepy caret', mode: 'always', defaultOn: false, keepsState: true, blend: 'source-over',
	defaults: { sleepAfterMs: 15000 },
	onMove(plugin, prev, cur, info) { sleepNudge(plugin, info.now); },
	onKey(plugin, e, now) { sleepNudge(plugin, now); },
	onSample(plugin, cur, info) {
		const S = plugin.state('sleep');
		if (!cur) { if (S.asleep) sleepNudge(plugin, info.now); return; }
		if (!S.timer && !S.asleep) sleepNudge(plugin, info.now);   // first sight of the caret since the effect came on
	},
	onPulse(plugin, rect, now) { sleepNudge(plugin, now); },
	onDrop(plugin) { const S = plugin.fxState.sleep; if (S) clearTimeout(S.timer); },
	draw(plugin, ctx, item, p, k, now, dt) { drawSleep(plugin, ctx, item, now, dt); },
};

// ---- Effect: Confetti ------------------------------------------------------------------------------------------------
// A task ticked off bursts into confetti from its checkbox: paper strips and dots thrown up, tumbling as they fall, in the
// caret's colors and a few more; a ring opens where the box is. Only a tick you make (a click on the box or a key) counts - a
// task that is already done, or one a sync ticks on another device, stays quiet.
// Settings: confettiCount (pieces in a burst; 46 is normal).
const CONFETTI_MAX = 220;
const CONFETTI_PALETTE = ['#ff4d6d', '#ffb629', '#4dd6a0', '#4da3ff', '#b57bff', '#ffe14d'];

/** Throws a burst from (x, y); `h` the height of the box it comes out of. */
function confettiBurst(plugin, x, y, h, now) {
	const item = plugin.ensureItem('confetti');
	if (!item.pieces) { item.pieces = []; item.rings = []; }
	const u = Math.max(0.7, h / 18), n = clamp(Math.round(Number(plugin.cfg.confettiCount) || 46), 8, 120), colors = [plugin.col(), plugin.acc(), ...CONFETTI_PALETTE];
	item.rings.push({ x, y, t0: now, u });
	for (let i = 0; i < n && item.pieces.length < CONFETTI_MAX; i++) {
		const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.5, v = (170 + Math.random() * 380) * u;
		item.pieces.push({
			x: x + (Math.random() - 0.5) * 6 * u, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
			w: (5 + Math.random() * 5) * u, h: (2.4 + Math.random() * 2.4) * u, dot: Math.random() < 0.25,
			rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 16, flip: Math.random() * 6.28, flipSpeed: 6 + Math.random() * 9,
			color: colors[Math.floor(Math.random() * colors.length)], t0: now, life: 1300 + Math.random() * 1100, sway: Math.random() * 6.28,
		});
	}
	plugin.kick();
}

function drawConfetti(plugin, ctx, item, now, dt) {
	if (!item.pieces) { item.done = true; return; }
	const s = Math.min((dt || 16) / 1000, 0.05);
	item.pieces = item.pieces.filter((q) => now - q.t0 < q.life);
	item.rings = item.rings.filter((r) => now - r.t0 < 480);
	if (!item.pieces.length && !item.rings.length) { item.done = true; return; }
	ctx.save();
	for (const r of item.rings) {   // the ring where the box is
		const f = (now - r.t0) / 480, e = 1 - Math.pow(1 - f, 3);
		ctx.globalAlpha = (1 - f) * 0.8; ctx.lineWidth = Math.max(0.6, (1 - f) * 3 * r.u);
		ctx.strokeStyle = plugin.col(); ctx.shadowColor = plugin.col(); ctx.shadowBlur = 8;
		ctx.beginPath(); ctx.arc(r.x, r.y, (6 + 26 * e) * r.u, 0, Math.PI * 2); ctx.stroke();
	}
	ctx.shadowBlur = 0;
	for (const q of item.pieces) {
		const drag = Math.exp(-2.1 * s);   // air: the burst slows at once and then the paper drifts down
		q.vx *= drag; q.vy = q.vy * drag + 880 * s * (0.55 + 0.45 * Math.min(1, (now - q.t0) / 400));
		q.x += q.vx * s + Math.sin(q.sway + (now - q.t0) * 0.006) * 0.35; q.y += q.vy * s;
		q.rot += q.spin * s; q.flip += q.flipSpeed * s;
		const f = (now - q.t0) / q.life, a = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
		ctx.globalAlpha = a;
		ctx.fillStyle = q.color;
		ctx.save();
		ctx.translate(q.x, q.y); ctx.rotate(q.rot);
		if (q.dot) { ctx.beginPath(); ctx.arc(0, 0, q.h * 0.9, 0, Math.PI * 2); ctx.fill(); }
		else { ctx.scale(1, Math.max(0.12, Math.abs(Math.cos(q.flip)))); ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); }   // the strip tumbles: seen edge-on now and then
		ctx.restore();
	}
	ctx.restore();
	plugin.kick();
}

EFFECTS.confetti = {
	id: 'confetti', label: 'Confetti', mode: 'always', defaultOn: false, keepsState: true, blend: 'source-over',
	defaults: { confettiCount: 46 },
	onTaskDone(plugin, box, now) { confettiBurst(plugin, box.x + box.w / 2, box.y + box.h / 2, box.h, now); },
	draw(plugin, ctx, item, p, k, now, dt) { drawConfetti(plugin, ctx, item, now, dt); },
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


let EFFECT_ORDER = null;   // each effect's place in the registry, for the draw order (filled on the first frame)

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
		listen(document, 'input', (e) => { if (this.page && this.page.note.contains(e.target)) this.noteInput(); requestAnimationFrame(() => this.sample(true)); }, cap);
		listen(document, 'keydown', (e) => {
			if (!this.caretEl) return; // typing in the palette, a rename field or another plugin: not ours
			const key = e.key || '', typing = (key.length === 1 && !e.ctrlKey && !e.metaKey) || key === 'Backspace' || key === 'Delete' || key === 'Enter';
			if (typing) { this.lastTypeKey = performance.now(); setTimeout(() => this.sample(true), 0); }
			if (document.querySelector(MODAL_SEL)) return;
			const now = performance.now();
			for (const fx of this.activeEffects()) this.callHook(fx, 'onKey', e, now);
		}, cap);
		listen(document, 'keyup', nav, cap);
		listen(document, 'click', nav, cap);
		listen(document, 'selectionchange', () => { this.placePageCaret(); nav(); });
		listen(document, 'scroll', () => { this.clipT = 0; this.scrollAt = performance.now(); nav(); }, cap);   // a move seen right after this is the page moving, not the caret (see sample)
		listen(window, 'resize', () => { this.resize(); this.clipT = 0; this.placePageCaret(); nav(); });

		this.installCaretObserver();
		this.installThemeObserver();
		this.installTaskObserver();

		this.ui.registerCustomPanelType(PAGE_TYPE, (panel) => this.renderPage(panel));
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: open settings', icon: 'ti-palette', onSelected: () => this.openPage() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: next preset', icon: 'ti-color-swatch', onSelected: () => this.nextPreset() });
		for (const e of Object.values(EFFECTS)) {
			if (e.mode !== 'always' || e.toggleable === false || PAGE_SWITCHES.some(([key]) => key === e.id)) continue;
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
		this.closePage();
		this.caretHolders.clear();
		document.body.classList.remove('cfx-caret-off');
		this.caretStyle?.remove();
		this.block?.remove();
		this.block = null;
	}

	// ---- observers ---------------------------------------------------------------------

	// Thymer moves its caret element with style/data attributes; watch only those elements, not the whole document.
	installCaretObserver() {
		const attached = new WeakSet();
		const observers = [];   // [observer, caret element] for each one watched
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
			observers.push([mo, el]);
			poke();
		};
		const tree = new MutationObserver((muts) => {
			let gone = false;
			for (const m of muts) {
				for (const node of m.addedNodes) {
					if (!(node instanceof Element)) continue;
					if (node.matches(CARET_SEL)) attach(node);
					else node.querySelectorAll?.(CARET_SEL).forEach(attach);
				}
				if (m.removedNodes.length) gone = true;
			}
			if (!gone) return;
			for (let i = observers.length - 1; i >= 0; i--) {   // a page closed: its caret's observer goes with it (and the element may be watched afresh if it comes back)
				const [mo, el] = observers[i];
				if (el.isConnected) continue;
				mo.disconnect(); attached.delete(el); observers.splice(i, 1);
			}
			if (this.caretEl && !this.caretEl.isConnected) { this.caretEl = null; this.clipT = 0; poke(); }   // look again: its page may be gone
		});
		tree.observe(document.body, { childList: true, subtree: true });
		document.querySelectorAll(CARET_SEL).forEach(attach);
		this.cleanup.push(() => { tree.disconnect(); observers.forEach(([o]) => o.disconnect()); observers.length = 0; });
	}

	// A task ticked off: its checkbox (.listitem-task) gains .state-done. Only a tick the user made counts - a click or a key
	// a moment before - so a row that is drawn already done, or recycled by the list, stays quiet.
	installTaskObserver() {
		let gesture = 0, fired = 0, boxClick = 0;
		const mark = (e) => { gesture = performance.now(); if (e.type === 'pointerdown' && e.target.closest && e.target.closest('.listitem-task')) boxClick = gesture; };
		document.addEventListener('pointerdown', mark, { capture: true, passive: true });
		document.addEventListener('keydown', mark, { capture: true, passive: true });
		const fire = (el) => {
			const now = performance.now(), b = el.getBoundingClientRect();
			if (now - fired < 400 || !(b.width > 0) || !(b.height > 0)) return;
			fired = now;
			for (const e of this.activeEffects()) this.callHook(e, 'onTaskDone', { x: b.left, y: b.top, w: b.width, h: b.height }, now);
			this.kick();
		};
		const done = (el) => el.classList && el.classList.contains('listitem-task') && el.classList.contains('state-done');
		const mo = new MutationObserver((muts) => {
			if (performance.now() - gesture > 1200) return;
			for (const m of muts) {
				if (m.type === 'attributes') { if (done(m.target) && !/\bstate-done\b/.test(m.oldValue || '')) fire(m.target); continue; }
				if (performance.now() - boxClick > 1200) continue;   // a box that is drawn anew: only after a click on a box
				for (const n of m.addedNodes) {
					if (!(n instanceof Element)) continue;
					if (done(n)) fire(n); else { const el = n.querySelector && n.querySelector('.listitem-task.state-done'); if (el) fire(el); }
				}
			}
		});
		mo.observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, childList: true, subtree: true });
		this.cleanup.push(() => { mo.disconnect(); document.removeEventListener('pointerdown', mark, true); document.removeEventListener('keydown', mark, true); });
	}

	installThemeObserver() {
		const check = () => {
			const dark = isDarkTheme();
			if (dark === this.dark) return;
			this.dark = dark;
			this.applyCaretStyle();
			this.refreshPage();
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

	col() { const c = this.tint || this.cfg.color; return this.dark ? c : lightVariant(c); }
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
		if (!this.isPreview) document.body.classList.toggle('cfx-caret-off', this.caretHolders.size > 0);   // a preview host keeps its own count and touches no caret of the page
	}

	// What an effect that keeps state leaves behind when it stops: its items, its state, its hold on the caret.
	dropEffect(id) {
		if (id === 'combo' && this.tint) { this.tint = null; this.applyCaretStyle(); }
		this.callHook(EFFECTS[id] || {}, 'onDrop');
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
		const col = this.col();
		const block = this.cfg.style === 'block';
		this.caretStyle.textContent = block
			? `div.listview-caret-self, div.cfx-pcaret { opacity: 0 !important; animation: none !important; transition: none !important; }
.app-chrome-panels .panel .listitem, .app-chrome-panels .panel .listitem [contenteditable="true"] { caret-color: transparent !important; }`
			: `body, div.listview-caret-self, div.cfx-pcaret { --ed-caret-self-fg: ${col} !important; }`;
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
		if (this.cfg.fx === 'tether') { this.cfg.fx = null; this.cfg.tether = true; }   // Bracket tether used to be a preset; it is a switch now
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

	// Apply right away (and remember it).
	live(patch) {
		this.cfg = { ...this.cfg, ...patch };
		saveChoices(patch);
		this.syncEffects();
		this.applyCaretStyle();
		this.refreshPage();
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

	// ---- THE SETTINGS PAGE ----------------------------------------------------------------------------------------------------
	// "Caret FX: open settings" opens a page in the panel being worked in (registerCustomPanelType), the way a note opens. On
	// it: a scratch area to type in, where the caret and its effects run for real - the page keeps a caret element of its own
	// (div.cfx-pcaret), placed on the selection, which the plugin follows like Thymer's (CARET_SEL), and its rows are read
	// like editor rows (.cfx-row / .cfx-line, in LISTITEM_SEL and lineDivOf) so Fresh ink, Bracket tether and Back-man work
	// there too - then the color presets, the special presets, the switches and the intensity slider. What is typed in the
	// scratch area is kept on this device. Thymer draws the page's bar and title; when the panel goes on to something else
	// the page is simply gone, and the plugin notices by its root being disconnected.

	/** Opens the page in the panel being worked in (or a new one); Thymer then calls renderPage. */
	async openPage() {
		const panel = this.ui.getActivePanel() || await this.ui.createPanel();
		panel?.navigateToCustomType(PAGE_TYPE);
	}

	renderPage(panel) {
		const host = panel.getElement();
		if (!host) return;
		this.closePage();
		panel.setTitle?.('Caret FX');
		const html = (h) => { const t = document.createElement('div'); t.innerHTML = h; return t.firstElementChild; };
		host.innerHTML = `<div-scrollable class="cfx-scroll force-active-scrollbar" style="overflow-y: scroll; height: 100%"><div class="cfx-page">
<div class="cfx-hero"><h1>Caret FX</h1><p>The caret in a color of your choice, with effects as you write. Pick a look below and try it right here.</p></div>
<div class="cfx-label">Try it</div>
<div class="cfx-notebox"><div class="cfx-note" contenteditable="true" spellcheck="false"></div><div class="cfx-pcaret"></div></div>
<div class="cfx-hint">A scratch pad: type, skip words with the arrow keys, press Enter, delete something. It is kept on this device.</div>
<div class="cfx-label">Colors</div><div class="cfx-presets cfx-colors"></div>
<div class="cfx-label">Special</div><div class="cfx-presets cfx-special"></div>
<div class="cfx-label">Effects</div><div class="cfx-opts"></div>
<div class="cfx-label">Intensity</div>
<div class="cfx-readout"><span class="cfx-big"></span><span class="cfx-mode"></span></div>
<div class="cfx-sl" tabindex="0"><div class="cfx-sl-track"></div><div class="cfx-sl-fill"></div><div class="cfx-sl-thumb"></div></div>
<div class="cfx-ticks"><span>Subtle</span><span>Normal</span><span>Intense</span></div>
</div></div-scrollable>`;
		const root = host.querySelector('.cfx-page'), note = root.querySelector('.cfx-note');
		this.page = { root, note, box: root.querySelector('.cfx-notebox'), caret: root.querySelector('.cfx-pcaret'), n: 0 };
		let saved = null;
		try { saved = localStorage.getItem(NOTE_KEY); } catch (e) { /* the default text */ }
		this.fillNote(saved !== null ? saved.split('\n') : NOTE_DEFAULT);
		note.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData)?.getData('text/plain') || ''); });   // plain text only
		note.addEventListener('focus', () => this.placePageCaret());
		note.addEventListener('blur', () => this.placePageCaret());
		// the presets
		const colors = root.querySelector('.cfx-colors'), special = root.querySelector('.cfx-special');
		this.presetList().forEach(([name, color, accent, fx], i) => {
			const b = html(`<button class="cfx-pre" data-i="${i}" title="${name}"><div class="cfx-dot" style="background:linear-gradient(135deg, ${color} 0%, ${color} 38%, ${accent} 100%)"></div><span>${name}</span></button>`);
			b.onclick = () => this.live({ color, accent, fx });
			(fx ? special : colors).appendChild(b);
		});
		// the switches
		const opts = root.querySelector('.cfx-opts');
		for (const [key, label, caption] of PAGE_SWITCHES) {
			const b = html(`<button class="cfx-opt" role="switch" data-key="${key}"><span><span class="cfx-opt-name"></span><span class="cfx-opt-note"></span></span><span class="cfx-sw"></span></button>`);
			b.querySelector('.cfx-opt-name').textContent = label;
			b.querySelector('.cfx-opt-note').textContent = caption;
			b.onclick = () => { this.update({ [key]: key === 'style' ? (this.switchOn(key) ? 'line' : 'block') : !this.switchOn(key) }); this.refreshPage(); };
			opts.appendChild(b);
		}
		// the slider
		const sl = root.querySelector('.cfx-sl');
		const set = (v) => this.live({ intensity: Math.round(clamp(v, INTENSITY_MIN, INTENSITY_MAX) * 10) / 10 });
		this.drag(sl, (x) => set(INTENSITY_MIN + x * (INTENSITY_MAX - INTENSITY_MIN)));
		sl.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(this.cfg.intensity + 0.1); }
			if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(this.cfg.intensity - 0.1); }
		});
		// A preset or a switch clicked while writing in the scratch area must not take the caret away: the look is tried as it is picked.
		root.addEventListener('mousedown', (e) => { if (document.activeElement === note && e.target.closest('.cfx-pre, .cfx-opt')) e.preventDefault(); });
		this.refreshPage();
	}

	/** Whether a switch of the page is on. */
	switchOn(key) { return key === 'style' ? this.cfg.style === 'block' : !!this.cfg[key]; }

	/** The page brought up to date with the settings: the colors, which preset and switches are on, the slider. */
	refreshPage() {
		const pg = this.page;
		if (!pg) return;
		if (!pg.root.isConnected) { this.closePage(); return; }
		const { root } = pg, list = this.presetList();
		root.style.setProperty('--c', this.col());
		root.style.setProperty('--a', this.acc());
		root.querySelectorAll('.cfx-pre').forEach((b) => { const p = list[b.dataset.i]; b.classList.toggle('on', p[1] === this.cfg.color && p[2] === this.cfg.accent && (p[3] || null) === (this.cfg.fx || null)); });
		root.querySelectorAll('.cfx-opt').forEach((b) => b.setAttribute('aria-checked', String(this.switchOn(b.dataset.key))));
		const v = this.cfg.intensity, f = (v - INTENSITY_MIN) / (INTENSITY_MAX - INTENSITY_MIN);
		root.querySelector('.cfx-sl-fill').style.width = f * 100 + '%';
		root.querySelector('.cfx-sl-thumb').style.left = f * 100 + '%';
		root.querySelector('.cfx-big').textContent = v.toFixed(1) + '×';
		root.querySelector('.cfx-mode').textContent = v < 0.7 ? 'Subtle' : v < 1.25 ? 'Normal' : v < 1.7 ? 'Strong' : 'Intense';
	}

	/** The scratch area filled with `lines`, one row each. */
	fillNote(lines) {
		const pg = this.page, esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
		pg.note.innerHTML = lines.map((l) => `<div class="cfx-row" data-guid="cfx-${++pg.n}"><span class="cfx-line">${esc(l) || '<br>'}</span></div>`).join('');
	}

	/**
	 * After an edit in the scratch area, its rows are put back in order - the browser edits the DOM its own way - and the
	 * text is kept. Enter splits a row into two with the same guid (each must be its own); Backspace at a row's start joins two
	 * rows, leaving the second's text beside the first's span (gathered into it, the caret kept at the join); a row wiped is
	 * given its line span back.
	 */
	noteInput() {
		const pg = this.page;
		if (!pg || !pg.root.isConnected) return;
		const { note } = pg, sel = window.getSelection();
		if (!note.children.length) {   // everything wiped: one empty row to write in
			this.fillNote(['']);
			const r = document.createRange(); r.setStart(note.querySelector('.cfx-line'), 0); r.collapse(true);
			sel.removeAllRanges(); sel.addRange(r);
		}
		const seen = new Set();
		for (const row of Array.from(note.childNodes)) {
			if (!(row instanceof HTMLElement)) { row.remove(); continue; }
			row.classList.add('cfx-row');
			// Everything in a row belongs in its one line span. The browser leaves things beside it - the text of a row joined
			// to this one, a second span, a stray <br> - so the row is rebuilt around one span, in reading order, and the caret
			// is put back at the same place in its text.
			const line = row.querySelector(':scope > .cfx-line');
			if (!line || row.childNodes.length !== 1) {
				let at = -1;
				if (sel && sel.focusNode && row.contains(sel.focusNode)) { const r = document.createRange(); r.setStart(row, 0); r.setEnd(sel.focusNode, sel.focusOffset); at = r.toString().length; }
				const frag = document.createDocumentFragment();
				const take = (n) => { if (n.nodeType === 1 && n.classList.contains('cfx-line')) { while (n.firstChild) take(n.firstChild); n.remove(); } else frag.appendChild(n); };
				for (const n of Array.from(row.childNodes)) take(n);
				const one = document.createElement('span');
				one.className = 'cfx-line';
				one.appendChild(frag);
				if (one.textContent) one.querySelectorAll('br').forEach((br) => br.remove());
				if (!one.childNodes.length) one.appendChild(document.createElement('br'));
				one.normalize();
				row.appendChild(one);
				if (at >= 0) this.setCaretIn(one, at);
			}
			const g = row.getAttribute('data-guid');
			if (!g || seen.has(g)) row.setAttribute('data-guid', `cfx-${++pg.n}`);
			seen.add(row.getAttribute('data-guid'));
		}
		try { localStorage.setItem(NOTE_KEY, Array.from(note.querySelectorAll('.cfx-line')).map((l) => l.textContent).join('\n')); } catch (e) { /* kept for this visit only */ }
		this.placePageCaret();
	}

	/** Puts the caret `index` characters into `el`. */
	setCaretIn(el, index) {
		const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		let node = walk.nextNode(), left = index;
		while (node && left > node.data.length) { left -= node.data.length; node = walk.nextNode(); }
		const sel = window.getSelection();
		if (node) sel.collapse(node, left); else sel.collapse(el, 0);
	}

	/** The page's caret element onto the selection in the scratch area (hidden when the selection is elsewhere); the plugin follows it from there. */
	placePageCaret() {
		const pg = this.page;
		if (!pg) return;
		if (!pg.root.isConnected) { this.closePage(); return; }
		const { note, caret, box } = pg, sel = window.getSelection();
		if (document.activeElement !== note || !sel || !sel.rangeCount || !sel.focusNode || !note.contains(sel.focusNode)) { caret.style.display = 'none'; return; }
		const node = sel.focusNode, off = sel.focusOffset;
		const box1 = (a, b) => { try { const q = document.createRange(); q.setStart(node, a); q.setEnd(node, b); const c = q.getClientRects()[0]; return c && c.height > 0.5 ? c : null; } catch (e) { return null; } };
		let r = null;
		if (node.nodeType === 3) {   // in text: the box of the letter after the caret, else the right edge of the one before
			const c = off < node.data.length ? box1(off, off + 1) : null;
			if (c) r = { x: c.left, y: c.top, h: c.height };
			else { const d = off > 0 ? box1(off - 1, off) : null; if (d) r = { x: d.right, y: d.top, h: d.height }; }
		}
		if (!r) {   // an empty row (the caret by its <br>), or a position between elements: the row's left edge
			const el = node.nodeType === 3 ? node.parentElement : node, row = (el && el.closest && el.closest('.cfx-row')) || el;
			const b = row.getBoundingClientRect(), cs = getComputedStyle(row), lh = parseFloat(cs.lineHeight);
			r = { x: b.left + (parseFloat(cs.paddingLeft) || 0), y: b.top + (parseFloat(cs.paddingTop) || 0), h: Number.isFinite(lh) && lh > 0 ? Math.min(lh, b.height || lh) : b.height };
		}
		const bb = box.getBoundingClientRect(), left = `${r.x - bb.left}px`, top = `${r.y - bb.top}px`;
		const moved = caret.style.left !== left || caret.style.top !== top;
		Object.assign(caret.style, { display: 'block', left, top, height: `${r.h}px` });
		if (moved) { caret.style.animation = 'none'; void caret.offsetWidth; caret.style.animation = ''; }   // solid while moving, blinks when idle
	}

	/** The page is gone (its panel shows something else, or the plugin is going): the plugin lets go of its caret. */
	closePage() {
		if (!this.page) return;
		this.page = null;
		if (this.caretEl && this.caretEl.classList.contains('cfx-pcaret')) { this.caretEl = null; this.last = null; this.clipT = 0; }
	}

	// Cycles the colour presets, then the special presets from the registry, from the one in use (a custom color: from the first).
	nextPreset() {
		const list = this.presetList();
		const cur = list.findIndex(([, color, accent, fx]) => color === this.cfg.color && accent === this.cfg.accent && (fx || null) === (this.cfg.fx || null));
		this.preset = (cur + 1) % list.length;
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
		if (panel) {   // content scrolls under the panel's own title bar; its box can be empty when its contents are laid over the page, so what is in it is measured too
			const pt = panel.getBoundingClientRect().top;
			for (const el of panel.querySelectorAll('.panel-bar, .panel-bar *')) {
				const b = el.getBoundingClientRect();
				if (b.height > 0 && b.width > 0 && b.top < pt + 90 && b.bottom < pt + 140) top = Math.max(top, b.bottom);
			}
		}
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
		if (!cur) { this.last = null; this.updateBlock(null); this.notifySample(null, typed, false); return; }   // gone (another page): nothing may stay drawn where it was
		const prev = this.last;
		this.last = cur;
		const moved = !prev || Math.hypot(cur.x - prev.x, cur.y - prev.y) >= 0.5;
		this.updateBlock(cur, moved);
		this.notifySample(cur, typed, moved);
		if (!prev) return this.addPulse(cur);

		const dx = cur.x - prev.x, dy = cur.y - prev.y;
		const dist = Math.hypot(dx, dy);
		if (!moved) return; // same position: key repeat/blink/duplicate events must not stack effects

		const now = performance.now();
		// The page scrolled under a still caret: on screen it moved, in the text it did not. That is no move - it would draw a
		// sweep at every turn of the wheel - but what keeps screen positions (the trail's path, the smear) goes along with it.
		if (!typed && now - (this.scrollAt || 0) < 150) {
			for (const e of this.activeEffects()) this.callHook(e, 'onShift', dx, dy, now);
			this.kick();
			return;
		}
		const info = { typed, dist, dx, dy, now };
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

	// Draws every live item through its effect's draw(); the blend mode comes from the effect. Also used by a preview host.
	renderItems(now) {
		const ctx = this.ctx, k = this.cfg.intensity;
		const dt = Math.min(48, this.lastT ? now - this.lastT : 16);
		this.lastT = now;
		this.items = this.items.filter((it) => !it.done && now - it.t0 < it.dur);
		// Draw in registry order (not insertion order): a long-lived particle item must not sink under newer items.
		const order = EFFECT_ORDER || (EFFECT_ORDER = new Map(Object.keys(EFFECTS).map((id, i) => [id, i])));
		this.items.sort((a, b) => (order.get(a.effect) ?? 99) - (order.get(b.effect) ?? 99));
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

