/**
 * Caret FX
 *
 * Animated caret effects while you type: glow pulse, neovide-style hop, a blaze
 * trail when the caret moves, and signature effects (lightning, falling petals and leaves).
 * Inspired by the Ghostty cursor_blaze / cursor_lightning shaders.
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
 * Settings live in this plugin's config under "custom" (Edit Code > Configuration), or use
 * the command palette: "Caret FX: ...".
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

const UI_CSS = `
.cfx-ov { position: fixed; inset: 0; z-index: 2147483100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.4); backdrop-filter: blur(3px); animation: cfx-in .14s ease-out; }
@keyframes cfx-in { from { opacity: 0; } to { opacity: 1; } }
.cfx-box { width: 340px; max-width: 92vw; padding: 18px; border-radius: 18px; border: 1px solid rgba(127,127,127,.28); box-shadow: 0 28px 80px rgba(0,0,0,.5); font: 13px/1.4 system-ui, sans-serif; animation: cfx-pop .18s cubic-bezier(.2,1.2,.4,1); }
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
.cfx-preview canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cfx-presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 8px 4px; }
.cfx-pre { all: unset; box-sizing: border-box; cursor: pointer; text-align: center; }
.cfx-dot { width: 34px; height: 34px; margin: 0 auto 3px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(127,127,127,.35); transition: transform .12s; }
.cfx-pre:hover .cfx-dot { transform: scale(1.1); }
.cfx-pre.on .cfx-dot { box-shadow: 0 0 0 2px var(--c); }
.cfx-pre span { font-size: 9px; opacity: .6; white-space: nowrap; }
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
.cfx-block { position: fixed; pointer-events: none; z-index: 2147482999; box-sizing: border-box; border-radius: 2px; animation: cfx-blockblink 1.1s steps(1) .6s infinite; }
@keyframes cfx-blockblink { 50% { opacity: .3; } }
`;

// =====================================================================================
// EFFECT REGISTRY
//
// HOW TO ADD AN EFFECT
//   EFFECTS.myfx = { id, label, mode, defaults, blend, onMove, draw, preview, ... };
//   - mode 'always': runs whenever cfg[id] is true (toggle command generated; toggleable:false = always on).
//     mode 'signature': runs when cfg.fx === id; needs preset { name, color, accent } for the dialog's Special grid.
//   - defaults: extra config keys, merged into DEFAULTS automatically.
//   - onMove(plugin, prev, cur, info): after the caret moved; info = { typed, dist, dx, dy, now }.
//     Push items onto plugin.items as { effect: id, t0, dur, ...own fields } (dur: Infinity for long-lived ones).
//   - onPulse(plugin, rect, now): optional; a gentle "show the current look" trigger (theme/config change).
//   - draw(plugin, ctx, item, p, k, now, dt): p = progress 0..1, k = intensity, dt = ms since last frame.
//     Items are removed when p >= 1 or item.done = true. blend: 'lighter' | 'source-over' (set by the core).
//   - preview(plugin, pv, caret, now): optional; spawn demo items into pv.items for the dialog preview.
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

// ---- Defaults: core keys + every effect's keys (toggle key per 'always' effect, plus its own defaults) ----
const DEFAULTS = {
	color: '#ffb929',       // main caret / glow color (dark theme)
	accent: '#ff3b1f',      // trail edge + lightning glow color (dark theme)
	style: 'line',          // 'line' | 'block'
	fx: null,               // signature effect id set by the preset (a 'signature' effect id), or null
	intensity: 1,           // 0.3 (subtle) .. 2 (strong)
};
for (const e of Object.values(EFFECTS)) {
	if (e.mode === 'always') DEFAULTS[e.id] = true;
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
		}, cap);
		listen(document, 'keyup', nav, cap);
		listen(document, 'click', nav, cap);
		listen(document, 'selectionchange', nav);
		listen(document, 'scroll', () => { this.clipT = 0; nav(); }, cap);
		listen(window, 'resize', () => { this.resize(); this.clipT = 0; nav(); });

		this.installCaretObserver();
		this.installThemeObserver();

		this.ui.addCommandPaletteCommand({ label: 'Caret FX: set color…', icon: 'ti-palette', onSelected: () => this.colorDialog() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: next color preset', icon: 'ti-color-swatch', onSelected: () => this.nextPreset() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: set intensity…', icon: 'ti-adjustments', onSelected: () => this.intensityDialog() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: toggle block cursor', icon: 'ti-square', onSelected: () => this.update({ style: this.cfg.style === 'block' ? 'line' : 'block' }) });
		for (const e of Object.values(EFFECTS)) {
			if (e.mode !== 'always' || e.toggleable === false) continue;
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
			this.cfg = { ...DEFAULTS, ...custom };
		} catch (e) { this.cfg = { ...DEFAULTS }; }
		// Effects that cannot be toggled (no command) must not stay off because of an old saved value.
		for (const e of Object.values(EFFECTS)) if (e.mode === 'always' && e.toggleable === false) this.cfg[e.id] = true;
		if (this.canvas) this.applyCaretStyle();
	}

	update(patch) {
		this.cfg = { ...this.cfg, ...patch };
		this.applyCaretStyle();
		try {
			const conf = this.getConfiguration();
			conf.custom = { ...(conf.custom || {}), ...patch };
			this.saveConfiguration(conf);
		} catch (e) { /* keep in-memory value */ }
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

	// Apply right away, write the configuration once editing pauses.
	live(patch) {
		this.cfg = { ...this.cfg, ...patch };
		this.pendingSave = { ...(this.pendingSave || {}), ...patch };
		this.applyCaretStyle();
		this.dlgBox?.style.setProperty('--c', this.col());
		this.dlgBox?.style.setProperty('--a', this.acc());
		clearTimeout(this.saveT);
		this.saveT = setTimeout(() => {
			try {
				const conf = this.getConfiguration();
				conf.custom = { ...(conf.custom || {}), ...this.pendingSave };
				this.saveConfiguration(conf);
			} catch (e) { /* keep in-memory value */ }
			this.pendingSave = null;
		}, 400);
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
		pv.items = []; pv.lastT = 0;
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

	colorDialog() {
		this.dialog('Caret color', (box) => {
			const html = (h) => { const t = document.createElement('div'); t.innerHTML = h; return t.firstElementChild; };
			const preview = html('<div class="cfx-preview"><span>Typing something…</span><div class="cfx-trail"></div><div class="cfx-caret"></div></div>');
			box.appendChild(preview);
			this.startPreview(preview);

			box.appendChild(html('<div class="cfx-label">Colors</div>'));
			const grid = html('<div class="cfx-presets"></div>');
			box.appendChild(grid);
			const specialNames = Object.values(EFFECTS).filter((e) => e.mode === 'signature' && e.preset).map((e) => e.preset.name.toLowerCase()).join(', ');
			box.appendChild(html(`<div class="cfx-label">Special · ${specialNames}</div>`));
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
		return { x: bestRect.left, y, w: this.cfg.style === 'block' ? cw : 2, h };
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
		if (!cur) { this.updateBlock(null); return; }
		const prev = this.last;
		this.last = cur;
		const moved = !prev || Math.hypot(cur.x - prev.x, cur.y - prev.y) >= 0.5;
		this.updateBlock(cur, moved);
		if (!prev) return this.addPulse(cur);

		const dx = cur.x - prev.x, dy = cur.y - prev.y;
		const dist = Math.hypot(dx, dy);
		if (!moved) return; // same position: key repeat/blink/duplicate events must not stack effects

		const info = { typed, dist, dx, dy, now: performance.now() };
		for (const e of this.activeEffects()) e.onMove?.(this, prev, cur, info);
		this.kick();
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
		cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;';
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
		if (this.items.length) this.kick();
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
			e.draw(this, ctx, it, (now - it.t0) / it.dur, k, now, dt);
		}
		ctx.globalCompositeOperation = 'source-over';
		this.items = this.items.filter((it) => !it.done);
		if (!this.items.length) this.lastT = 0;
	}
}
