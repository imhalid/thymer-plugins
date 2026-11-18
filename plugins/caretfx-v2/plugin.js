/**
 * CaretFx-v2
 *
 * 24 physics-driven and reactive carets ported from Ryudit (Celestine) for Thymer:
 *   Slime, Mizan, Line, CRT, Back-man, Portal, Speed Demon, Torch, Mario, Tamagotchi,
 *   Plant, Firefly, Mood Face, Punctuation, Kawaii, UwU, Echo, Wind, Jelly Line,
 *   Neon Sign, Robot, Marine, Ink, and Lock-on.
 *
 * Plus shared modifiers from Ryudit:
 *   - Jelly (two-face spring smear body with tail tapering on any caret except Slime)
 *   - Sleepy caret (breathes and floats z's after 5s of rest, sleeping cleanly at 0% CPU)
 *   - Caret style from text (split horizontally inside strikethrough; rounded/square/chamfered inside (), [], {})
 *
 * Settings page ("CaretFx-v2: open settings") includes a live scratch pad and 24 live animated preview tiles.
 */

const CFX2_PAGE_TYPE = 'caretfx-v2';
const CFX2_CHOICES_KEY = 'caretfx-v2.choices';
const CFX2_NOTE_KEY = 'caretfx-v2.note';
const CFX2_NOTE_DEFAULT = [
	'Type here to try every caret — press Space, Enter, Backspace/Delete.',
	'Try great, sad, or repeat a word twice for Echo; wrap (parens) [brackets] {braces}.',
	'',
];

const CARET_SEL = 'div.listview-caret-self, div.cfx2-pcaret';
const FOCUSED_PANEL_SEL = '.panel.focused-panel, .panel.has-focus';
const LISTITEM_SEL = '.listitem[data-guid], .cfx2-row[data-guid]';
const MODAL_SEL = '.cmdpal--dialog, .dropdown, .modal-container, .link-menu-visible';
const HIGHLIGHT_NAME = 'cfx2-hide-glyphs';

// ---- Pure Math & Color Helpers ------------------------------------------------------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const smoothstep = (x) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const easeSine = (x) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const easeOut = (x) => { const c = clamp01(x); return 1 - (1 - c) * (1 - c) * (1 - c); };
const degToRad = (d) => (d * Math.PI) / 180;
const rnd = () => Math.random();

function cubicBezier(x1, y1, x2, y2) {
	const bx = (t) => 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t;
	const by = (t) => 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t;
	const dbx = (t) => 3 * x1 * (1 - t) * (1 - t) + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
	return (x) => {
		if (x <= 0) return 0;
		if (x >= 1) return 1;
		let t = x;
		for (let i = 0; i < 8; i++) {
			const d = dbx(t);
			if (Math.abs(d) < 1e-6) break;
			t = clamp(t - (bx(t) - x) / d, 0, 1);
		}
		return by(t);
	};
}

function hexCol(str, a = 1) {
	let h = String(str || '').replace('#', '').trim();
	if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	const n = parseInt(h.slice(0, 6), 16);
	if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255, a };
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };

function rgbaCol(r, g, b, a = 1) {
	return { r: Math.round(clamp(r, 0, 255)), g: Math.round(clamp(g, 0, 255)), b: Math.round(clamp(b, 0, 255)), a: clamp01(a) };
}

function withAlpha(c, a) {
	return { r: c.r, g: c.g, b: c.b, a: clamp01(a * (c.a ?? 1)) };
}

function mixCol(a, b, t) {
	return {
		r: Math.round(a.r + (b.r - a.r) * t),
		g: Math.round(a.g + (b.g - a.g) * t),
		b: Math.round(a.b + (b.b - a.b) * t),
		a: 1,
	};
}

// Oklab color interpolation so contrasting gradients (like Mario red->blue) stay vibrant without grey midpoints.
function srgbToLin(u) { const s = u / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
function linToSrgb(u) { const c = clamp01(u); return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255); }
function rgbToOklab(c) {
	const r = srgbToLin(c.r), g = srgbToLin(c.g), b = srgbToLin(c.b);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
	];
}
function oklabToRgb(L, a, b, alpha = 1) {
	const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
	const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
	const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
	return {
		r: linToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		g: linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		b: linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
		a: alpha,
	};
}
function mixOklab(a, b, t) {
	const A = rgbToOklab(a), B = rgbToOklab(b);
	return oklabToRgb(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t), lerp(a.a ?? 1, b.a ?? 1, t));
}

function cssCol(c) {
	if (TUNE) c = tunedCol(c, TUNE);
	return `rgba(${c.r},${c.g},${c.b},${(c.a ?? 1).toFixed(4)})`;
}

// ---- Per-Caret Tune (OKLCH) -----------------------------------------------------------
// Each caret may be tuned from the gear on its tile: its hues turned (h, degrees), its chroma scaled (c), its lightness
// shifted (l) and its opacity scaled (a). The tune is relative, so a caret with a palette of its own (Mario, Marine, Mood
// Face, Ink) keeps it, turned as a whole. It is set only while that caret draws (withTune), and every colour it paints goes
// through cssCol, so that is where it is applied. Colours with next to no chroma (white gloss, black shadows, the text a
// caret redraws) keep their hue and lightness and change only in opacity.

const TUNE_ID = { h: 0, c: 1, l: 0, a: 1 };
const TUNE_RANGE = { h: [-180, 180], c: [0, 2], l: [-0.4, 0.4], a: [0.15, 1] };
let TUNE = null;
const TUNE_MEMO = new WeakMap();

/** A stored tune made safe, or null when it changes nothing. */
function cleanTune(t) {
	if (!t || typeof t !== 'object') return null;
	const out = {};
	for (const k of Object.keys(TUNE_ID)) {
		const v = Number(t[k]);
		out[k] = Number.isFinite(v) ? clamp(v, TUNE_RANGE[k][0], TUNE_RANGE[k][1]) : TUNE_ID[k];
	}
	return Object.keys(TUNE_ID).every((k) => Math.abs(out[k] - TUNE_ID[k]) < 1e-4) ? null : out;
}

/** The stored tunes (caret name -> tune), each made safe; carets whose tune changes nothing are left out. */
function cleanTunes(map) {
	const out = {};
	if (map && typeof map === 'object') {
		for (const [name, t] of Object.entries(map)) {
			const c = cleanTune(t);
			if (c && CARET_SPECS.some((sp) => sp.name === name)) out[name] = c;
		}
	}
	return out;
}

/** Runs fn with `tune` applied to every colour it paints. */
function withTune(tune, fn) {
	const prev = TUNE;
	TUNE = tune || null;
	try { return fn(); } finally { TUNE = prev; }
}

function oklabToLin(L, a, b) {
	const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
	const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
	const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
	return [
		+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
	];
}

/** An OKLCH colour as sRGB, its chroma lowered until it fits (rather than clipping each channel, which shifts the hue). */
function oklchToRgb(L, C, hRad, alpha = 1) {
	L = clamp01(L);
	const fits = (c) => oklabToLin(L, c * Math.cos(hRad), c * Math.sin(hRad)).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
	let c = Math.max(0, C);
	if (!fits(c)) {
		let lo = 0, hi = c;
		for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
		c = lo;
	}
	const [r, g, b] = oklabToLin(L, c * Math.cos(hRad), c * Math.sin(hRad));
	return { r: linToSrgb(r), g: linToSrgb(g), b: linToSrgb(b), a: alpha };
}

/** A colour as OKLCH: [L, C, hue in degrees]. */
function colOklch(c) {
	const [L, a, b] = rgbToOklab(c);
	return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

function tunedCol(c, t) {
	let memo = TUNE_MEMO.get(t);
	if (!memo) TUNE_MEMO.set(t, memo = new Map());
	const key = (Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b);
	let o = memo.get(key);
	if (!o) {
		o = c;
		if (t.h !== 0 || t.c !== 1 || t.l !== 0) {
			const [L, a, b] = rgbToOklab(c), C = Math.hypot(a, b);
			const w = smoothstep((C - 0.015) / 0.035);   // how colourful it is: neutrals are left alone
			if (w > 0) {
				const h = Math.atan2(b, a) + (t.h * Math.PI) / 180;
				const L2 = lerp(L, clamp01(L + t.l), w), C2 = lerp(C, C * t.c, w);
				const hm = Math.atan2(lerp(b / C, Math.sin(h), w), lerp(a / C, Math.cos(h), w));
				o = oklchToRgb(L2, C2, w >= 1 ? h : hm, 1);
			}
		}
		if (memo.size > 4096) memo.clear();
		memo.set(key, o);
	}
	return { r: o.r, g: o.g, b: o.b, a: (c.a ?? 1) * t.a };
}

/** A colour with a tune applied outside a draw (the confetti's tint, the tile's swatch). */
function applyTune(c, t) { return t ? tunedCol(c, t) : c; }

function hslCol(h, s, l) {
	h = ((h % 360) + 360) % 360;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0, g = 0, b = 0;
	const sec = Math.floor(h / 60);
	if (sec === 0) { r = c; g = x; }
	else if (sec === 1) { r = x; g = c; }
	else if (sec === 2) { g = c; b = x; }
	else if (sec === 3) { g = x; b = c; }
	else if (sec === 4) { r = x; b = c; }
	else { r = c; b = x; }
	return rgbaCol((r + m) * 255, (g + m) * 255, (b + m) * 255, 1);
}

const cursorColor = (dark) => (dark ? hexCol('#31edae') : hexCol('#147133'));
const boxRadius = (w, h) => Math.min(w, h) * 0.25;
const textSize = (f) => f.r.h / 1.25;
const boxOf = (f) => ({ x: f.r.x, y: f.r.y, w: Math.max(f.cw || 6, 6), h: f.r.h });
const faceInk = (dark, light) => (dark ? hexCol('#fafaf9') : light);

function movedBy(prev, cur) {
	const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
	return [d > 0.5, d];
}

// ---- Turkish-aware Word & Text Folding Helpers ---------------------------------------

const TURKISH_MAP = {
	'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ı': 'i', 'İ': 'i',
	'ö': 'o', 'Ö': 'o', 'ş': 's', 'Ş': 's', 'ü': 'u', 'Ü': 'u',
};
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const isWordChar = (ch) => !!ch && WORD_CHAR_RE.test(ch);

function foldText(s) {
	let out = '';
	for (const ch of String(s || '')) {
		out += TURKISH_MAP[ch] || ch.toLowerCase();
	}
	return out;
}

function foldChars(s) {
	return Array.from(foldText(s));
}

function wordAt(chars, wordChars) {
	const out = [];
	const wlen = wordChars.length;
	if (!wlen) return out;
	for (let i = 0; i + wlen <= chars.length; i++) {
		if ((i > 0 && isWordChar(chars[i - 1])) || (i + wlen < chars.length && isWordChar(chars[i + wlen]))) continue;
		let ok = true;
		for (let k = 0; k < wlen; k++) {
			if (chars[i + k] !== wordChars[k]) { ok = false; break; }
		}
		if (ok) out.push(i);
	}
	return out;
}

function lineEdit(before, after, caret) {
	if (before === after) return null;
	const d = after.length - before.length;
	if (d < 0 && caret >= 0 && before.slice(0, caret) + before.slice(caret - d) === after) {
		return { at: caret, removed: before.slice(caret, caret - d), inserted: '' };
	}
	if (d > 0 && caret >= d && after.slice(0, caret - d) + after.slice(caret) === before) {
		return { at: caret - d, removed: '', inserted: after.slice(caret - d, caret) };
	}
	const max = Math.min(before.length, after.length);
	let head = 0;
	while (head < max && before.charCodeAt(head) === after.charCodeAt(head)) head++;
	let tail = 0;
	while (tail < max - head && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
	return { at: head, removed: before.slice(head, before.length - tail), inserted: after.slice(head, after.length - tail) };
}

// ---- Canvas 2D Painter Primitives (mirroring MyGo ui.Painter) ------------------------

function traceRRect(ctx, x, y, w, h, r) {
	r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
	ctx.beginPath();
	if (r < 0.1) {
		ctx.rect(x, y, w, h);
		return;
	}
	const k = 0.5523;
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.bezierCurveTo(x + w - r + r * k, y, x + w, y + r - r * k, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.bezierCurveTo(x + w, y + h - r + r * k, x + w - r + r * k, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.bezierCurveTo(x + r - r * k, y + h, x, y + h - r + r * k, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.bezierCurveTo(x, y + r - r * k, x + r - r * k, y, x + r, y);
	ctx.closePath();
}

function tracePill(ctx, x, y, w, h) {
	traceRRect(ctx, x, y, w, h, Math.min(w, h) / 2);
}

function fillRectR(ctx, x, y, w, h, col, r = 0) {
	if (w <= 0 || h <= 0 || (col.a ?? 1) <= 0.002) return;
	ctx.fillStyle = cssCol(col);
	traceRRect(ctx, x, y, w, h, r);
	ctx.fill();
}

function strokeRectR(ctx, x, y, w, h, col, r = 0, lw = 1) {
	if (w <= 0 || h <= 0 || (col.a ?? 1) <= 0.002) return;
	ctx.strokeStyle = cssCol(col);
	ctx.lineWidth = lw;
	traceRRect(ctx, x, y, w, h, r);
	ctx.stroke();
}

function bracketRadius(box, bracket) {
	if (bracket === '(') return Math.min(box.w, box.h) / 2;
	if (bracket === '[') return 0.6;
	return boxRadius(box.w, box.h);
}

function traceShapeBody(ctx, box, bracket) {
	const { x, y, w, h } = box;
	if (bracket === '{') {
		const c = Math.min(w, h) * 0.32;
		ctx.beginPath();
		ctx.moveTo(x + c, y);
		ctx.lineTo(x + w - c, y);
		ctx.lineTo(x + w, y + c);
		ctx.lineTo(x + w, y + h - c);
		ctx.lineTo(x + w - c, y + h);
		ctx.lineTo(x + c, y + h);
		ctx.lineTo(x, y + h - c);
		ctx.lineTo(x, y + c);
		ctx.closePath();
		return;
	}
	traceRRect(ctx, x, y, w, h, bracketRadius(box, bracket));
}

function styledDraw(ctx, f, box, drawFn) {
	if (f.style && f.style.strike) {
		const gap = box.h * 0.2;
		const half = (box.h - gap) / 2;
		for (const band of [
			[box.x - 40, box.y - 40, box.w + 80, half + 40],
			[box.x - 40, box.y + half + gap, box.w + 80, half + 40],
		]) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(band[0], band[1], band[2], band[3]);
			ctx.clip();
			drawFn();
			ctx.restore();
		}
		return;
	}
	drawFn();
}

function glowAround(ctx, r, col, alpha) {
	if (alpha <= 0.002) return;
	for (const k of [10, 7.5, 5, 2.5]) {
		fillRectR(ctx, r.x - k, r.y - k, r.w + 2 * k, r.h + 2 * k, withAlpha(col, alpha * 0.12 * (1 - k / 12)), boxRadius(r.w, r.h) + k);
	}
}

function glassFill(ctx, traceFn, top, bottom, box, alpha = 1) {
	const light = mixCol(top, WHITE, 0.45);
	const mid = top === bottom ? top : mixOklab(top, bottom, 0.5);
	const g = ctx.createLinearGradient(0, box.y, 0, box.y + Math.max(1, box.h));
	g.addColorStop(0.0, cssCol(withAlpha(light, 0.62 * alpha)));
	g.addColorStop(0.4, cssCol(withAlpha(top, 0.40 * alpha)));
	g.addColorStop(0.5, cssCol(withAlpha(mid, 0.41 * alpha)));
	g.addColorStop(0.65, cssCol(withAlpha(bottom, 0.42 * alpha)));
	g.addColorStop(1.0, cssCol(withAlpha(bottom, 0.52 * alpha)));
	traceFn(ctx);
	ctx.fillStyle = g;
	ctx.fill();

	const sg = ctx.createLinearGradient(0, box.y, 0, box.y + Math.max(1, box.h));
	sg.addColorStop(0.3, cssCol(withAlpha(top, 0.95 * alpha)));
	sg.addColorStop(0.7, cssCol(withAlpha(bottom, 0.95 * alpha)));
	traceFn(ctx);
	ctx.lineWidth = 1.25;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.strokeStyle = sg;
	ctx.stroke();
}

function glassGloss(ctx, box, dark, alpha = 1, gaze = 1, insetFrac = 0.22) {
	const a = dark ? 0.55 : 0.8;
	const u = clamp01(((gaze ?? 1) + 1) / 2);
	const inset = Math.min(box.w * 0.45, Math.max(1.4, box.w * insetFrac));
	const gx = lerp(box.x + inset, box.x + box.w - inset, u);
	ctx.save();
	ctx.beginPath();
	ctx.moveTo(gx, box.y + box.h * 0.14);
	ctx.lineTo(gx, box.y + box.h * 0.36);
	ctx.lineWidth = 1.4;
	ctx.lineCap = 'round';
	ctx.strokeStyle = cssCol(rgbaCol(255, 255, 255, a * alpha));
	ctx.stroke();
	ctx.restore();
}

function restBodyTrace(f, box) {
	if (f.jelly) return (c) => traceRoundedQuad(c, f.jelly.corners, f.jelly.r);
	return (c) => traceShapeBody(c, box, f.style?.bracket || '');
}

function glassBody(ctx, f, box, col, alpha = 1, glow = 1, gloss = true) {
	styledDraw(ctx, f, box, () => {
		const trace = restBodyTrace(f, box);
		if (!f.jelly) {
			glowAround(ctx, box, col, glow * 0.8);
		} else {
			ctx.save();
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			const alphas = [0.035, 0.06, 0.09];
			const widths = [9, 6, 3.5];
			for (let i = 0; i < 3; i++) {
				trace(ctx);
				ctx.lineWidth = widths[i];
				ctx.strokeStyle = cssCol(withAlpha(col, glow * alphas[i]));
				ctx.stroke();
			}
			ctx.restore();
		}
		glassFill(ctx, trace, col, col, box, alpha);
		if (gloss) glassGloss(ctx, box, f.dark, alpha, f.gaze ?? 1);
	});
}

function glassPath(ctx, traceFn, box, col, dark) {
	const glow = dark ? 1.0 : 0.6;
	ctx.save();
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	const alphas = [0.035, 0.06, 0.09];
	const widths = [9, 6, 3.5];
	for (let i = 0; i < 3; i++) {
		traceFn(ctx);
		ctx.lineWidth = widths[i];
		ctx.strokeStyle = cssCol(withAlpha(col, glow * alphas[i]));
		ctx.stroke();
	}
	const top = mixCol(col, WHITE, 0.45);
	const g = ctx.createLinearGradient(0, box.y, 0, box.y + Math.max(1, box.h));
	g.addColorStop(0.0, cssCol(withAlpha(top, 0.62)));
	g.addColorStop(0.55, cssCol(withAlpha(col, 0.38)));
	g.addColorStop(1.0, cssCol(withAlpha(col, 0.50)));
	traceFn(ctx);
	ctx.fillStyle = g;
	ctx.fill();
	traceFn(ctx);
	ctx.lineWidth = 1.25;
	ctx.strokeStyle = cssCol(withAlpha(col, 0.95));
	ctx.stroke();
	ctx.restore();
}

function glyphAt(ctx, s, cx, cy, size, col, bold = false, angleDeg = 0, sc = 1, fontFamily = 'system-ui, sans-serif') {
	if ((col.a ?? 1) <= 0.002) return;
	ctx.save();
	ctx.font = `${bold ? 750 : 400} ${size}px ${fontFamily}`;
	ctx.fillStyle = cssCol(col);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.translate(cx, cy);
	if (angleDeg) ctx.rotate(degToRad(angleDeg));
	if (sc !== 1) ctx.scale(sc, sc);
	ctx.fillText(s, 0, 0);
	ctx.restore();
}

function traceRoundedQuad(ctx, corners, r) {
	const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
	const toward = (a, b, d) => {
		const l = dist(a, b);
		return l === 0 ? [a[0], a[1]] : [a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l];
	};
	ctx.beginPath();
	for (let i = 0; i < 4; i++) {
		const prev = corners[(i + 3) % 4], cur = corners[i], next = corners[(i + 1) % 4];
		const d = Math.min(r, Math.min(dist(prev, cur), dist(cur, next)) / 2);
		const [x0, y0] = toward(cur, prev, d);
		const [x1, y1] = toward(cur, next, d);
		if (i === 0) ctx.moveTo(x0, y0);
		else ctx.lineTo(x0, y0);
		ctx.quadraticCurveTo(cur[0], cur[1], x1, y1);
	}
	ctx.closePath();
}

function goneLetters(ctx, f, k) {
	if (k.goneCells && k.goneCells.length) return k.goneCells;
	const sz = textSize(f);
	ctx.save();
	ctx.font = `400 ${sz}px ${f.fontFamily || 'system-ui, sans-serif'}`;
	const out = [];
	let off = 0;
	for (const ch of String(k.gone || '')) {
		const w = Math.max(2, ctx.measureText(ch).width);
		if (ch.trim()) out.push({ ch, x: f.r.x + off, w });
		off += w;
	}
	ctx.restore();
	if (k.dir >= 0 && k.dir !== 0) return out;
	out.reverse();
	return out;
}

// ---- Shared Jelly Body (Smear, caretfx_look.go) --------------------------------------

class SmearBody {
	constructor() {
		this.lx = 0; this.ly = 0; this.lvx = 0; this.lvy = 0;
		this.tx = 0; this.ty = 0;
		this.dx = 1; this.dy = 0;
		this.pcx = 0; this.pcy = 0;
		this.placed = false;
		this.last = 0;
	}
	reset() { this.placed = false; }
	shift(dy) {
		this.ly += dy; this.ty += dy; this.pcy += dy;
	}
	body(nowMs, f) {
		const dt = this.last ? Math.min(0.05, Math.max(0.001, (nowMs - this.last) / 1000)) : 0.016;
		this.last = nowMs;
		const T = f.r;
		const w = Math.max(f.cw || 6, 6), h = T.h;
		const tx = T.x, ty = T.y;
		const cx = tx + w / 2, cy = ty + h / 2;
		if (!this.placed) {
			this.lx = tx; this.ly = ty; this.tx = tx; this.ty = ty;
			this.lvx = 0; this.lvy = 0; this.pcx = cx; this.pcy = cy; this.placed = true;
		}
		const md = Math.hypot(cx - this.pcx, cy - this.pcy);
		if (md > 0.01) {
			this.dx = (cx - this.pcx) / md;
			this.dy = (cy - this.pcy) / md;
			this.pcx = cx; this.pcy = cy;
		}
		const stiff = 0.65, trailStiff = 0.15, damp = 0.4;
		const wL = 2 + stiff * 38;
		const wT = 2 + trailStiff * 38;
		const zeta = 0.15 + damp * 1.15;
		const steps = Math.min(16, Math.max(1, Math.ceil(dt * 240)));
		const hh = dt / steps;
		for (let i = 0; i < steps; i++) {
			this.lvx += (wL * wL * (tx - this.lx) - 2 * zeta * wL * this.lvx) * hh;
			this.lx += this.lvx * hh;
			this.lvy += (wL * wL * (ty - this.ly) - 2 * zeta * wL * this.lvy) * hh;
			this.ly += this.lvy * hh;
			const fexp = 1 - Math.exp(-wT * hh);
			this.tx += (this.lx - this.tx) * fexp;
			this.ty += (this.ly - this.ty) * fexp;
		}
		if (!Number.isFinite(this.lx) || !Number.isFinite(this.ly) || !Number.isFinite(this.tx) || !Number.isFinite(this.ty)) {
			this.lx = tx; this.ly = ty; this.tx = tx; this.ty = ty; this.lvx = 0; this.lvy = 0;
		}
		const capLen = 150;
		for (const q of [['lx', 'ly'], ['tx', 'ty']]) {
			const d = Math.hypot(this[q[0]] - tx, this[q[1]] - ty);
			if (d > capLen) {
				this[q[0]] = tx + ((this[q[0]] - tx) * capLen) / d;
				this[q[1]] = ty + ((this[q[1]] - ty) * capLen) / d;
			}
		}
		const offs = [[0, 0], [w, 0], [w, h], [0, h]];
		const corners = [[0, 0], [0, 0], [0, 0], [0, 0]];
		const lag = [0, 0, 0, 0];
		let maxLag = 0;
		const ax = Math.abs(this.dx), ay = Math.abs(this.dy);
		const hx = Math.pow(h * ax, 4), wy = Math.pow(w * ay, 4);
		const u = hx + wy > 0 ? hx / (hx + wy) : 0.5;
		for (let i = 0; i < 4; i++) {
			const o = offs[i];
			const sx = o[0] > 0 ? 1 : -1;
			const sy = o[1] > 0 ? 1 : -1;
			const front = sx * sgn(this.dx) * u + sy * sgn(this.dy) * (1 - u);
			const fr = (1 - front) / 2;
			corners[i] = [this.lx + (this.tx - this.lx) * fr + o[0], this.ly + (this.ty - this.ly) * fr + o[1]];
			lag[i] = Math.hypot(corners[i][0] - (tx + o[0]), corners[i][1] - (ty + o[1]));
			if (lag[i] > maxLag) maxLag = lag[i];
		}
		if (maxLag < 0.5 && Math.hypot(this.lvx, this.lvy) < 8) {
			this.lx = tx; this.ly = ty; this.tx = tx; this.ty = ty; this.lvx = 0; this.lvy = 0;
			return null;
		}
		const reach = clamp01((maxLag - 4) / 20);
		for (let i = 0; i < 4; i++) {
			const offx = corners[i][0] - cx, offy = corners[i][1] - cy;
			const along = offx * this.dx + offy * this.dy;
			const px = offx - along * this.dx, py = offy - along * this.dy;
			const k = maxLag > 0 ? (lag[i] / maxLag) * reach * 0.7 : 0;
			corners[i][0] -= px * k;
			corners[i][1] -= py * k;
		}
		return { corners, r: boxRadius(w, h) };
	}
}

// ---- Shared Sleeper (caretextras.go) -------------------------------------------------

const SLEEP_Z_LIFE = 3800;
const SLEEP_Z_GAP = 1600;
const SLEEP_FOR = 90000;
const SLEEP_BREATH = 4.0;
const CARET_LIVELY = 2000;

class Sleeper {
	constructor() {
		this.at = { x: 0, y: 0, w: 0, h: 0 };
		this.since = 0;
		this.zs = [];
		this.next = 0;
		this.seen = false;
		this.n = 0;
		this.amp = 0;
		this.sleepAfterMs = 5000;
	}
	wake() {
		this.seen = false; this.zs = []; this.next = 0; this.amp = 0;
	}
	shift(dy) {
		this.at.y += dy;
	}
	rested(nowMs) {
		return this.seen ? Math.max(0, nowMs - this.since) : 0;
	}
	caretRestsMs() {
		return this.sleepAfterMs + SLEEP_FOR + 3000;
	}
	observe(nowMs, f, k, scheduleAfterFn) {
		const moved = !this.seen || Math.abs(f.r.x - this.at.x) > 0.5 || Math.abs(f.r.y - this.at.y) > 0.5;
		if (moved || k.wrote > 0 || k.edited || k.erased > 0) {
			this.seen = true;
			this.at = { ...f.r };
			this.since = nowMs;
			this.zs = [];
			this.next = 0;
			this.amp = 0;
			scheduleAfterFn?.(this.sleepAfterMs + 30);
			return 'idle';
		}
		const rest = nowMs - this.since;
		if (rest < this.sleepAfterMs) {
			this.amp = 0;
			scheduleAfterFn?.(this.sleepAfterMs - rest + 30);
			return 'idle';
		}
		const asleep = rest - this.sleepAfterMs;
		this.amp = smoothstep(asleep / 1500) * (1 - smoothstep((asleep - SLEEP_FOR) / 3000));
		if (asleep < SLEEP_FOR && (!this.next || nowMs >= this.next)) {
			this.n++;
			this.zs.push({ t0: nowMs, seed: this.n * 1.7 });
			this.next = nowMs + SLEEP_Z_GAP;
		}
		return this.amp > 0 || this.zs.length > 0 ? '30' : 'idle';
	}
	breathe(nowMs, f) {
		if (this.amp <= 0.001) return null;
		const b = Math.sin((2 * Math.PI * ((nowMs - this.since) / 1000)) / SLEEP_BREATH);
		const sy = 1 - 0.16 * (0.5 - 0.5 * b) * this.amp;
		const box = boxOf(f);
		return { sx: 1, sy, px: box.x + box.w / 2, py: box.y + box.h };
	}
	draw(ctx, nowMs, f, ink) {
		if (!this.zs.length) return;
		const box = boxOf(f);
		const size = textSize(f);
		const out = [];
		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		for (const z of this.zs) {
			const age = (nowMs - z.t0) / SLEEP_Z_LIFE;
			if (age >= 1) continue;
			out.push(z);
			const fade = smoothstep(age / 0.18) * (1 - smoothstep((age - 0.55) / 0.45));
			const x = Math.round(box.x + box.w + 3 + age * 30 + Math.sin(age * 5 + z.seed) * 3);
			const y = Math.round(box.y - 2 - age * 38);
			const sc = 0.6 + 0.8 * (Math.round(age * 7) / 7);
			const hs = size * 0.19 * sc;
			const tilt = -0.18 + 0.12 * Math.round(Math.sin(age * 4 + z.seed));
			const sin = Math.sin(tilt), cos = Math.cos(tilt);
			const pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
			ctx.beginPath();
			for (let i = 0; i < 4; i++) {
				const px = pts[i][0] * hs, py = pts[i][1] * hs;
				const X = x + px * cos - py * sin;
				const Y = y + px * sin + py * cos;
				if (i === 0) ctx.moveTo(X, Y);
				else ctx.lineTo(X, Y);
			}
			ctx.lineWidth = Math.max(2, hs * 0.55);
			ctx.strokeStyle = cssCol(withAlpha(ink, 0.85 * fade));
			ctx.stroke();
		}
		ctx.restore();
		this.zs = out;
	}
}

// ---- Shared Base & Motes (caretfx_game.go) -------------------------------------------

function gazeWant(was, k) {
	if (k.erased > 0 && k.dir <= 0) return -1;
	if (k.erased > 0 || k.wrote > 0) return 1;
	return was;
}

class GazeTracker {
	constructor() { this.reset(); }
	reset() { this.look = 1; this.want = 1; this.last = 0; }
	step(nowMs, k) {
		const dt = this.last ? Math.min(0.1, Math.max(0.001, (nowMs - this.last) / 1000)) : 0.016;
		this.last = nowMs;
		this.want = gazeWant(this.want, k);
		this.look += (this.want - this.look) * (1 - Math.exp(-dt / 0.07));
		if (Math.abs(this.want - this.look) < 0.004) this.look = this.want;
		return this.look;
	}
	settling() { return Math.abs(this.want - this.look) >= 0.004; }
}

class FxBase {
	constructor() {
		this.t0 = 0;
		this.prev = { x: 0, y: 0, w: 0, h: 0 };
		this.have = false;
		this.last = 0;
		this.active = 0;
		this.look = 1;
		this.want = 1;
	}
	at(nowMs) {
		if (!this.t0) this.t0 = nowMs;
		return nowMs - this.t0;
	}
	step(nowMs, f, k) {
		const tn = this.at(nowMs);
		const dt = Math.min(0.1, Math.max(0.001, (tn - this.last) / 1000));
		this.last = tn;
		let moved = false, dist = 0;
		if (this.have) [moved, dist] = movedBy(this.prev, f.r);
		this.want = gazeWant(this.want, k);
		this.look += (this.want - this.look) * (1 - Math.exp(-dt / 0.09));
		this.prev = { ...f.r };
		this.have = true;
		if (moved || k.wrote > 0 || k.erased > 0) this.active = tn;
		return { tn, dt, moved, dist };
	}
	gaze() { return this.look; }
	idle(tn) { return (tn - this.active) / 1000; }
}

function stepDrawMotes(list, tn, dt, drawFn) {
	const out = [];
	for (const m of list) {
		const age = (tn - m.t0) / m.life;
		if (age >= 1) continue;
		m.vy += (m.grav || 0) * dt;
		m.x += (m.vx || 0) * dt;
		m.y += (m.vy || 0) * dt;
		m.ang = (m.ang || 0) + (m.spin || 0) * dt;
		drawFn(m, age);
		out.push(m);
	}
	return out;
}

function shiftMotes(list, dy) {
	for (const m of list) m.y += dy;
}

function idleRate(f) {
	if (f.rest < CARET_LIVELY) return 'raf';
	if (f.rest < f.caretRestsMs) return '30';
	return 'idle';
}

// ---- 1. Slime (slime.go: SDF + Smooth-Min + Marching Squares) ------------------------

const SLIME_BREATHES = 60000;
const SLIME_STEP = 1 / 240;

function catmull(v, u) {
	const x = u * 3;
	const i = Math.min(Math.floor(x), 2);
	const t = x - i;
	const at = (k) => v[clamp(k, 0, 3)];
	const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
	return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

function roundBoxSdf(x, y, hx, hy, rc) {
	rc = Math.min(rc, Math.min(hx, hy));
	const qx = Math.abs(x) - hx + rc;
	const qy = Math.abs(y) - hy + rc;
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc;
}

function smin(a, b, k) {
	const h = clamp01(0.5 + (0.5 * (b - a)) / k);
	return b + (a - b) * h - k * h * (1 - h);
}

class SlimeCaret {
	constructor() { this.reset(); }
	reset() {
		this.m = 0; this.vm = 0; this.j = 0; this.vj = 0; this.t = 0; this.vt = 0;
		this.sx = 1; this.vx = 0; this.sy = 1; this.vy = 0;
		this.ax = 0; this.ay = 0; this.avx = 0; this.avy = 0;
		this.bx = 0; this.by = 0; this.bvx = 0; this.bvy = 0;
		this.last = 0; this.prev = null; this.placed = false; this.flying = false; this.kicked = 0;
	}
	shift(dy) {
		if (this.prev) this.prev.y += dy;
	}
	tint(dark) { return hexCol(dark ? '#59f939' : '#2f9a1c'); }
	moved(prev, cur) {
		const dx = cur.x - prev.x, dy = cur.y - prev.y;
		const dist = Math.hypot(dx, dy);
		if (dist < 0.2) return;
		const dir = dx < 0 ? -1 : 1;
		const h = cur.h;
		if (Math.abs(dy) > h * 0.6 || dist > h * 2.5) {
			this.flying = true;
			this.vy += 2.5; this.vx -= 1.5;
			this.vm += dir * 110; this.vj += dir * 130; this.vt += dir * 160;
			this.ax -= dx; this.ay -= dy; this.bx -= dx; this.by -= dy;
			return;
		}
		this.vm += dir * 45; this.vj += dir * 60; this.vt += dir * 80;
		this.sx = Math.min(1.35, this.sx + 0.16);
		this.sy = Math.max(0.7, this.sy - 0.1);
	}
	step(nowMs, dt, idle, w) {
		const drive = idle * w * (0.13 * Math.sin(nowMs * 0.0057) + 0.05 * Math.sin(nowMs * 0.0093 + 1));
		const breathe = 1 + idle * 0.03 * Math.sin(nowMs * 0.0057 + 1);
		const wm = 20, zm = 0.2, wj = 24, wt = 30, zt = 0.16, ws = 26, zs = 0.2, wf = 24, wb = 21, zf = 0.8;
		for (let left = Math.min(dt, 0.05); left > 1e-6;) {
			const h = Math.min(SLIME_STEP, left);
			left -= h;
			this.vm += (-wm * wm * (this.m - drive) - 2 * zm * wm * this.vm) * h; this.m += this.vm * h;
			this.vj += (-wj * wj * (this.j - this.m) - 2 * zt * wj * this.vj) * h; this.j += this.vj * h;
			this.vt += (-wt * wt * (this.t - this.j) - 2 * zt * wt * this.vt) * h; this.t += this.vt * h;
			this.vx += (-ws * ws * (this.sx - 1) - 2 * zs * ws * this.vx) * h; this.sx += this.vx * h;
			this.vy += (-ws * ws * (this.sy - breathe) - 2 * zs * ws * this.vy) * h; this.sy += this.vy * h;
			this.avx += (-wf * wf * this.ax - 2 * zf * wf * this.avx) * h; this.ax += this.avx * h;
			this.avy += (-wf * wf * this.ay - 2 * zf * wf * this.avy) * h; this.ay += this.avy * h;
			this.bvx += (-wb * wb * (this.bx - this.ax) - 2 * zf * wb * this.bvx) * h; this.bx += this.bvx * h;
			this.bvy += (-wb * wb * (this.by - this.ay) - 2 * zf * wb * this.bvy) * h; this.by += this.bvy * h;
		}
	}
	buildJelly(fx, fy, W, H) {
		const hh = H * this.sy;
		const ws = clamp(this.sx * Math.sqrt(1 / Math.max(this.sy, 0.3)), 0.75, 1.6);
		const lim = W * 1.1;
		const j = {
			fx: fx + this.ax, fy: fy + this.ay, hh, hw: (W * ws) / 2,
			bulge: clamp((1 - this.sy) * W * 0.7, -W * 0.3, W * 0.45),
			sway: [0, clamp(this.m, -lim, lim), clamp(this.j, -lim, lim), clamp(this.t, -lim, lim)],
			k: Math.max(2.5, H * 0.18),
			rb: 0, rt: 0, travel: false, a: null, b: null, ra: 0, rbk: 0, neck: 0, thw: 0, thh: 0,
		};
		j.rb = Math.min(2.5, j.hw * 0.5);
		j.rt = Math.min(j.hw * 0.85, hh * 0.3);
		let vx = this.bx - this.ax, vy = this.by - this.ay;
		let d = Math.hypot(vx, vy);
		const maxL = 1.7 * H;
		if (d > maxL) { vx = (vx * maxL) / d; vy = (vy * maxL) / d; d = maxL; }
		if (d > 1) {
			const tail = clamp(1 / (1 + d / (2.5 * H)), 0.5, 1);
			j.travel = true;
			j.a = { x: j.fx + catmull(j.sway, 0.5), y: j.fy - hh / 2 };
			j.b = { x: j.a.x + vx, y: j.a.y + vy };
			j.thw = j.hw * tail; j.thh = (hh / 2) * tail;
			j.ra = Math.min(j.hw, hh / 2) * 0.95;
			j.rbk = Math.min(j.thw, j.thh) * 0.9;
			j.neck = clamp(d / (d + 2 * H), 0, 0.5);
		}
		return j;
	}
	fieldAt(j, x, y) {
		const u = clamp((j.fy - y) / j.hh, 0, 1);
		const cx = j.fx + catmull(j.sway, u);
		const hw = j.hw + j.bulge * Math.sin(Math.PI * u);
		const rc = y < j.fy - j.hh / 2 ? j.rt : j.rb;
		const d = roundBoxSdf(x - cx, y - (j.fy - j.hh / 2), hw, j.hh / 2, rc);
		if (!j.travel) return d;
		const drop = roundBoxSdf(x - j.b.x, y - j.b.y, j.thw, j.thh, Math.min(j.thw, j.thh) * 0.7);
		const ex = j.b.x - j.a.x, ey = j.b.y - j.a.y;
		const t = clamp(((x - j.a.x) * ex + (y - j.a.y) * ey) / (ex * ex + ey * ey), 0, 1);
		const rr = (j.ra + (j.rbk - j.ra) * t) * (1 - j.neck * Math.sin(Math.PI * t));
		const strand = Math.hypot(x - j.a.x - ex * t, y - j.a.y - ey * t) - Math.max(rr, 0.8);
		return smin(d, smin(strand, drop, j.k), j.k);
	}
	traceOutline(j) {
		const st = 1.0;
		const m = j.hw + Math.abs(j.bulge) + 4;
		let x0 = j.fx - m - Math.abs(j.sway[3]) - 2, x1 = j.fx + m + Math.abs(j.sway[3]) + 2;
		let y0 = j.fy - j.hh - 4, y1 = j.fy + 4;
		if (j.travel) {
			x0 = Math.min(x0, j.b.x - j.thw - 4); x1 = Math.max(x1, j.b.x + j.thw + 4);
			y0 = Math.min(y0, j.b.y - j.thh - 4); y1 = Math.max(y1, j.b.y + j.thh + 4);
		}
		const nx = Math.floor((x1 - x0) / st) + 1, ny = Math.floor((y1 - y0) / st) + 1;
		if (nx < 2 || ny < 2 || nx * ny > 120000) return null;
		const w = nx + 1;
		const g = new Float64Array(w * (ny + 1));
		for (let yi = 0; yi <= ny; yi++) {
			const py = y0 + yi * st;
			for (let xi = 0; xi <= nx; xi++) {
				g[yi * w + xi] = this.fieldAt(j, x0 + xi * st, py);
			}
		}
		const point = (key) => {
			const n = key >> 1, down = (key & 1) === 1;
			const xi = n % w, yi = Math.floor(n / w);
			const a = g[n], b = down ? g[n + w] : g[n + 1];
			const t = a / (a - b);
			return down ? [x0 + xi * st, y0 + (yi + t) * st] : [x0 + (xi + t) * st, y0 + yi * st];
		};
		const adj = new Map();
		const link = (a, b) => {
			let la = adj.get(a); if (!la) { la = []; adj.set(a, la); } la.push(b);
			let lb = adj.get(b); if (!lb) { lb = []; adj.set(b, lb); } lb.push(a);
		};
		for (let yi = 0; yi < ny; yi++) {
			for (let xi = 0; xi < nx; xi++) {
				const n = yi * w + xi;
				let c = 0;
				if (g[n] < 0) c |= 1;
				if (g[n + 1] < 0) c |= 2;
				if (g[n + w + 1] < 0) c |= 4;
				if (g[n + w] < 0) c |= 8;
				if (c === 0 || c === 15) continue;
				const top = 2 * n, bottom = 2 * (n + w), left = 2 * n + 1, right = 2 * (n + 1) + 1;
				const mid = (g[n] + g[n + 1] + g[n + w] + g[n + w + 1]) / 4 < 0;
				if (c === 1 || c === 14) link(left, top);
				else if (c === 2 || c === 13) link(top, right);
				else if (c === 3 || c === 12) link(left, right);
				else if (c === 4 || c === 11) link(right, bottom);
				else if (c === 6 || c === 9) link(top, bottom);
				else if (c === 7 || c === 8) link(left, bottom);
				else if (c === 5) { if (mid) { link(top, right); link(bottom, left); } else { link(left, top); link(right, bottom); } }
				else if (c === 10) { if (mid) { link(left, top); link(right, bottom); } else { link(top, right); link(bottom, left); } }
			}
		}
		const seen = new Set();
		const loops = [];
		for (const start of adj.keys()) {
			if (seen.has(start)) continue;
			const loop = [];
			let prev = -1, cur = start;
			while (!seen.has(cur)) {
				seen.add(cur);
				loop.push(point(cur));
				const nbrs = adj.get(cur);
				let next = -1;
				for (const q of nbrs) { if (q !== prev && !seen.has(q)) { next = q; break; } }
				if (next < 0) break;
				prev = cur; cur = next;
			}
			if (loop.length >= 4) loops.push(loop);
		}
		if (!loops.length) return null;
		let minY = Infinity, maxY = -Infinity;
		for (const lp of loops) for (const p of lp) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
		const traceFn = (ctx) => {
			ctx.beginPath();
			for (const loop of loops) {
				const n = loop.length;
				const m0x = (loop[n - 1][0] + loop[0][0]) / 2, m0y = (loop[n - 1][1] + loop[0][1]) / 2;
				ctx.moveTo(m0x, m0y);
				for (let i = 0; i < n; i++) {
					const q = loop[i], nxPt = loop[(i + 1) % n];
					ctx.quadraticCurveTo(q[0], q[1], (q[0] + nxPt[0]) / 2, (q[1] + nxPt[1]) / 2);
				}
				ctx.closePath();
			}
		};
		return { traceFn, box: { x: x0, y: minY, w: x1 - x0, h: Math.max(1, maxY - minY) } };
	}
	draw(ctx, nowMs, f) {
		const r = f.r;
		if (!this.placed) {
			this.prev = { ...r }; this.last = nowMs; this.placed = true; this.kicked = nowMs;
		} else if (r.x !== this.prev.x || r.y !== this.prev.y || r.h !== this.prev.h) {
			this.moved(this.prev, r);
			this.prev = { ...r }; this.kicked = nowMs;
		}
		const dt = Math.max(0, (nowMs - this.last) / 1000);
		this.last = nowMs;
		const W = Math.max(f.cw || 0, 7), H = r.h;
		if (this.flying || nowMs - this.kicked < SLIME_BREATHES) {
			this.step(nowMs, dt, 1, W);
		}
		if (this.flying && Math.hypot(this.ax, this.ay) < 0.25 * H) {
			this.flying = false;
			this.vy -= 11; this.vx += 8;
		}
		const col = this.tint(f.dark);
		const j = this.buildJelly(r.x + W / 2, r.y + H, W, H);
		const out = this.traceOutline(j);
		if (out) {
			styledDraw(ctx, f, boxOf(f), () => {
				glassPath(ctx, out.traceFn, out.box, col, f.dark);
				if (j.hw >= 3 && j.hh >= 8) {
					ctx.save();
					ctx.beginPath();
					const gazeSide = f.gaze ?? 1;
					for (let i = 0; i <= 8; i++) {
						const u = 0.42 + (0.42 * i) / 8;
						const hw = j.hw + j.bulge * Math.sin(Math.PI * u);
						const gx = j.fx + catmull(j.sway, u) + gazeSide * hw * 0.5;
						const gy = j.fy - j.hh * u;
						if (i === 0) ctx.moveTo(gx, gy); else ctx.lineTo(gx, gy);
					}
					ctx.lineCap = 'round';
					ctx.lineWidth = 1.4;
					ctx.strokeStyle = cssCol(rgbaCol(255, 255, 255, f.dark ? 0.55 : 0.8));
					ctx.stroke();
					ctx.restore();
				}
			});
		}
		const rest = nowMs - this.kicked;
		if (this.flying || rest < CARET_LIVELY) return 'raf';
		if (rest < SLIME_BREATHES) return '30';
		return 'idle';
	}
}

// ---- 2. Mizan (mizan.go) -------------------------------------------------------------

const MIZAN_POINTS = 28;
const MIZAN_HOLD = 1100;
const MIZAN_FADE = 450;
const MIZAN_IN = 180;
const MIZAN_GLIDE_DUR = 250;
const MIZAN_BEAM = 4000;
const MIZAN_BREATHES = 60000;
const mizanSpring = cubicBezier(0.3, 1.2, 0.4, 1);
const mizanEase = cubicBezier(0.2, 0.8, 0.2, 1);
const MIZAN_TOP = hexCol('#2d8afc');
const MIZAN_BOTTOM = hexCol('#0371e0');
const MIZAN_DARK = {
	pop: { r: 44, g: 44, b: 47, a: 0.97 }, edgeTop: { r: 255, g: 255, b: 255, a: 0.16 }, edgeBottom: { r: 255, g: 255, b: 255, a: 0.03 },
	text: hexCol('#f5f5f7'), muted: hexCol('#a1a1a6'), good: hexCol('#4cd97b'), bad: hexCol('#ff6b5e'), shadow: { r: 0, g: 0, b: 0, a: 0.55 },
};
const MIZAN_LIGHT = {
	pop: { r: 255, g: 255, b: 255, a: 0.98 }, edgeTop: { r: 0, g: 0, b: 0, a: 0.10 }, edgeBottom: { r: 0, g: 0, b: 0, a: 0.04 },
	text: hexCol('#1d1d1f'), muted: hexCol('#6e6e73'), good: hexCol('#1d7d44'), bad: hexCol('#c63527'), shadow: { r: 0, g: 0, b: 0, a: 0.16 },
};

class MizanCaret {
	constructor() { this.reset(); }
	reset() {
		this.pace = []; this.keys = []; this.base = 0; this.lastAt = -1e9; this.openAt = 0;
		this.glide = null; this.x = 0; this.y = 0; this.placed = false; this.beam = 0;
		this.prev = null; this.seen = false; this.last = 0;
	}
	shift(dy) {
		if (this.prev) this.prev.y += dy;
		if (this.glide) this.glide.from.y += dy;
	}
	tint(dark, theme) { return theme?.accent || MIZAN_TOP; }
	key(nowMs) {
		if (nowMs - this.lastAt > MIZAN_HOLD + MIZAN_FADE) {
			this.openAt = nowMs; this.pace = []; this.keys = []; this.base = 0; this.placed = false;
		}
		this.lastAt = nowMs;
		this.keys.push(nowMs);
		while (this.keys.length && nowMs - this.keys[0] > 3000) this.keys.shift();
		if (this.keys.length < 3) return;
		const span = (nowMs - this.keys[0]) / 1000;
		if (span <= 0) return;
		const wpm = ((this.keys.length - 1) / 5) * (60 / span);
		const prev = this.pace.length ? this.pace[this.pace.length - 1] : wpm;
		this.pace.push(prev + (wpm - prev) * 0.35);
		if (this.pace.length > MIZAN_POINTS) this.pace.shift();
		if (this.base === 0 && this.pace.length >= 4) this.base = this.pace[this.pace.length - 1];
	}
	draw(ctx, nowMs, f, k, scheduleAfterFn) {
		const dt = this.last ? Math.min(48, Math.max(0.5, nowMs - this.last)) : 16;
		this.last = nowMs;
		const r = f.r;
		if (k.wrote > 0) {
			for (let i = 0; i < k.wrote; i++) this.key(nowMs);
		} else if (k.edited) {
			this.lastAt = nowMs;
		} else if (this.seen && (r.x !== this.prev.x || r.y !== this.prev.y) && Math.hypot(r.x - this.prev.x, r.y - this.prev.y) > r.h * 0.5) {
			this.glide = { from: { ...this.prev }, t0: nowMs };
		}
		this.prev = { ...r }; this.seen = true;
		const tk = f.dark ? MIZAN_DARK : MIZAN_LIGHT;
		const idle = Math.max(0, nowMs - this.lastAt);
		let busy = false;
		if (this.glide) {
			const u = (nowMs - this.glide.t0) / MIZAN_GLIDE_DUR;
			if (u >= 1) {
				this.glide = null;
			} else {
				busy = true;
				const s = mizanSpring(u);
				const w = boxOf(f).w;
				const h = lerp(this.glide.from.h, r.h, s);
				const x = lerp(this.glide.from.x, r.x, s);
				const y = lerp(this.glide.from.y, r.y, s);
				const a = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
				ctx.save();
				tracePill(ctx, x - 3, y - 2, w + 6, h + 4);
				ctx.lineWidth = 4;
				ctx.strokeStyle = cssCol(withAlpha(MIZAN_TOP, 0.26 * a));
				ctx.stroke();
				glassFill(ctx, (c) => tracePill(c, x, y, w, h), MIZAN_TOP, MIZAN_BOTTOM, { x, y, w, h }, a);
				ctx.restore();
			}
		}
		let breathing = false;
		if (!this.glide) {
			let a = 1;
			if (idle > 600 && idle < MIZAN_BREATHES) {
				a = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(((idle - 600) / 1000) * Math.PI * 2 / 1.1));
				breathing = true;
			}
			const c = boxOf(f);
			styledDraw(ctx, f, c, () => {
				glowAround(ctx, c, MIZAN_TOP, 0.7 * a);
				glassFill(ctx, restBodyTrace(f, c), MIZAN_TOP, MIZAN_BOTTOM, c, a);
				glassGloss(ctx, c, f.dark, a, f.gaze ?? 1);
			});
		}
		const fade = (idle - MIZAN_HOLD) / MIZAN_FADE;
		if (fade < 1 && this.pace.length > 0) {
			busy = true;
			const show = mizanEase((nowMs - this.openAt) / MIZAN_IN) * (1 - easeInOutSine(clamp01(fade)));
			this.drawStat(ctx, f, tk, show, dt);
		}
		if (busy) return 'raf';
		if (breathing) return '30';
		if (idle <= 600) scheduleAfterFn?.(600 - idle + 2);
		return 'idle';
	}
	drawStat(ctx, f, tk, show, dt) {
		const r = f.r;
		const wpm = Math.round(this.pace[this.pace.length - 1]);
		const change = this.base > 0 ? (wpm - this.base) / this.base : 0;
		let tone = tk.muted, badge = '';
		if (this.base > 0) {
			if (Math.abs(change) < 0.03) badge = '■ 0%';
			else if (change > 0) { tone = tk.good; badge = `▲ ${Math.round(change * 100)}%`; }
			else { tone = tk.bad; badge = `▼ ${Math.round(-change * 100)}%`; }
		}
		ctx.save();
		const numStr = String(wpm), unitStr = 'wpm';
		ctx.font = '600 12px system-ui, sans-serif'; const numW = ctx.measureText(numStr).width;
		ctx.font = '500 11px system-ui, sans-serif'; const unitW = ctx.measureText(unitStr).width;
		let badgeW = 0;
		if (badge) { ctx.font = '600 10.5px system-ui, sans-serif'; badgeW = ctx.measureText(badge).width + 12; }
		const H = 26, sparkW = 46, pad = 9, gap = 7;
		const W = pad + sparkW + gap + numW + 3 + unitW + (badge ? gap + badgeW + 5 : pad);
		const b = f.bounds;
		let tx = r.x - W * 0.35, ty = r.y - H - 8;
		if (ty < b.y + 4) ty = r.y + r.h + 8;
		tx = clamp(tx, b.x + 6, Math.max(b.x + 6, b.x + b.w - W - 6));
		if (!this.placed) { this.x = tx; this.y = ty; this.placed = true; }
		const follow = 1 - Math.pow(1 - 0.22, dt / 16);
		this.x += (tx - this.x) * follow;
		this.y += (ty - this.y) * follow;
		const x = Math.round(this.x), y = Math.round(this.y + (1 - show) * 4);
		const a = show;

		// Shadow + opaque backdrop + frosted glass pop
		ctx.save();
		ctx.shadowColor = cssCol(withAlpha(tk.shadow, a));
		ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 6; ctx.shadowBlur = 18;
		fillRectR(ctx, x, y, W, H, withAlpha(f.bg, a), H / 2);
		ctx.restore();
		fillRectR(ctx, x, y, W, H, withAlpha(tk.pop, a), H / 2);

		const eg = ctx.createLinearGradient(0, y, 0, y + H);
		eg.addColorStop(0, cssCol(withAlpha(tk.edgeTop, a)));
		eg.addColorStop(1, cssCol(withAlpha(tk.edgeBottom, a)));
		tracePill(ctx, x + 0.5, y + 0.5, W - 1, H - 1);
		ctx.lineWidth = 1; ctx.strokeStyle = eg; ctx.stroke();

		this.beam = (this.beam + (dt / MIZAN_BEAM) * (1 + Math.min(3, wpm / 40))) % 1;
		const head = f.dark ? mixCol(MIZAN_TOP, WHITE, 0.55) : MIZAN_TOP;
		if (ctx.createConicGradient) {
			const cg = ctx.createConicGradient(this.beam * Math.PI * 2 - Math.PI / 2, x + W / 2, y + H / 2);
			cg.addColorStop(0, cssCol(withAlpha(MIZAN_TOP, 0)));
			cg.addColorStop(0.06, cssCol(withAlpha(MIZAN_TOP, 0.45 * a)));
			cg.addColorStop(0.10, cssCol(withAlpha(head, 0.95 * a)));
			cg.addColorStop(0.14, cssCol(withAlpha(MIZAN_TOP, 0.45 * a)));
			cg.addColorStop(0.20, cssCol(withAlpha(MIZAN_TOP, 0)));
			cg.addColorStop(1, cssCol(withAlpha(MIZAN_TOP, 0)));
			tracePill(ctx, x + 0.5, y + 0.5, W - 1, H - 1);
			ctx.lineWidth = 1.2; ctx.strokeStyle = cg; ctx.stroke();
		}

		let cx = x + pad;
		this.drawSpark(ctx, cx, y + 7, sparkW, H - 15, tk, a);
		cx += sparkW + gap;
		const mid = y + H / 2 + 0.5;
		ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
		ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = cssCol(withAlpha(tk.text, a));
		ctx.fillText(numStr, cx, mid);
		cx += numW + 3;
		ctx.font = '500 11px system-ui, sans-serif'; ctx.fillStyle = cssCol(withAlpha(tk.muted, a));
		ctx.fillText(unitStr, cx, mid);
		cx += unitW + gap;
		if (badge) {
			const bgA = f.dark ? 0.16 : 0.12;
			fillRectR(ctx, cx, y + 5, badgeW, H - 10, withAlpha(tone, bgA * a), (H - 10) / 2);
			ctx.font = '600 10.5px system-ui, sans-serif'; ctx.fillStyle = cssCol(withAlpha(tone, a));
			ctx.fillText(badge, cx + 6, mid);
		}
		ctx.restore();
	}
	drawSpark(ctx, x, y, w, h, tk, a) {
		ctx.fillStyle = cssCol(withAlpha(tk.muted, 0.35 * a));
		for (let gx = x; gx <= x + w; gx += 4) {
			ctx.beginPath(); ctx.arc(gx, y + h + 0.5, 0.5, 0, Math.PI * 2); ctx.fill();
		}
		const v = this.pace;
		if (v.length < 2) return;
		let lo = v[0], hi = v[0];
		for (const q of v) { if (q < lo) lo = q; if (q > hi) hi = q; }
		const rng = Math.max(hi - lo, 12), mid = (lo + hi) / 2;
		const step = w / (MIZAN_POINTS - 1);
		const px = (i) => x + (i + MIZAN_POINTS - v.length) * step;
		const py = (q) => y + h / 2 - ((q - mid) / rng) * h * 0.9;
		ctx.beginPath();
		for (let i = 0; i < v.length; i++) {
			if (i === 0) ctx.moveTo(px(i), py(v[i])); else ctx.lineTo(px(i), py(v[i]));
		}
		const lx = px(v.length - 1), ly = py(v[v.length - 1]);
		ctx.save();
		ctx.lineTo(lx, y + h); ctx.lineTo(px(0), y + h); ctx.closePath();
		const ag = ctx.createLinearGradient(0, y, 0, y + h);
		ag.addColorStop(0, cssCol(withAlpha(MIZAN_TOP, 0.27 * a)));
		ag.addColorStop(1, cssCol(withAlpha(MIZAN_TOP, 0.015 * a)));
		ctx.fillStyle = ag; ctx.fill();
		ctx.restore();

		ctx.beginPath();
		for (let i = 0; i < v.length; i++) {
			if (i === 0) ctx.moveTo(px(i), py(v[i])); else ctx.lineTo(px(i), py(v[i]));
		}
		ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 1.6;
		ctx.strokeStyle = cssCol(withAlpha(MIZAN_TOP, a)); ctx.stroke();

		ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
		ctx.fillStyle = cssCol(withAlpha(MIZAN_TOP, a)); ctx.fill();
	}
}

// ---- 3. Line (caretfx.go) ------------------------------------------------------------

class LineCaret {
	reset() {}
	shift() {}
	tint(dark, theme) { return theme?.accent || cursorColor(dark); }
	draw(ctx, nowMs, f) {
		const col = f.theme?.accent || cursorColor(f.dark);
		styledDraw(ctx, f, boxOf(f), () => {
			fillRectR(ctx, f.r.x - 1, f.r.y, 2, f.r.h, col, 1);
		});
		return 'idle';
	}
}

// ---- 4. CRT (caretfx_look.go) --------------------------------------------------------

const CRT_FADE = 450, CRT_JUMP = 120, CRT_GHOSTS = 10, CRT_GLITCH_T = 220;

function glitchNoise(a, b, c) {
	let n = (Math.imul(a >>> 0, 374761393) + Math.imul(b >>> 0, 668265263) + Math.imul(c >>> 0, 2246822519)) >>> 0;
	n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
	return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

class CRTCaret {
	constructor() { this.reset(); }
	reset() { this.ghosts = []; this.prev = null; this.placed = false; this.glitch = { on: false, at: 0, dist: 0, seed: 0 }; }
	shift(dy) {
		for (const g of this.ghosts) g.y += dy;
		if (this.prev) this.prev.y += dy;
	}
	tint(dark) { return cursorColor(dark); }
	draw(ctx, nowMs, f, k) {
		const T = f.r;
		const w = Math.max(f.cw || 6, 6);
		if (!this.placed) { this.prev = { ...T }; this.placed = true; }
		if (T.x !== this.prev.x || T.y !== this.prev.y || T.h !== this.prev.h) {
			const dist = Math.hypot(T.x - this.prev.x, T.y - this.prev.y);
			if (dist > 0.5) {
				this.ghosts.push({ x: this.prev.x, y: this.prev.y, w, h: this.prev.h, at: nowMs });
				if (dist >= CRT_JUMP) this.glitch = { on: true, at: nowMs, dist, seed: (nowMs * 1000) >>> 0 };
			}
			this.prev = { ...T };
		}
		if (k.typed.includes('\n')) this.glitch = { on: true, at: nowMs, dist: CRT_JUMP, seed: (nowMs * 1000) >>> 0 };
		else if (k.typed.includes(' ')) this.glitch = { on: true, at: nowMs, dist: CRT_JUMP * 0.5, seed: (nowMs * 1000) >>> 0 };
		if (this.ghosts.length > CRT_GHOSTS) this.ghosts = this.ghosts.slice(-CRT_GHOSTS);
		const col = cursorColor(f.dark);
		const out = [];
		for (const g of this.ghosts) {
			const age = (nowMs - g.at) / CRT_FADE;
			if (age >= 1) continue;
			out.push(g);
			const a = 1 - age;
			glassFill(ctx, (c) => traceRRect(c, g.x, g.y, g.w, g.h, boxRadius(g.w, g.h)), col, col, g, a * 0.8);
		}
		this.ghosts = out;
		const box = { x: T.x, y: T.y, w, h: T.h };
		if (this.glitch.on) {
			const el = nowMs - this.glitch.at;
			const pr = el / CRT_GLITCH_T;
			if (pr >= 1) this.glitch.on = false;
			else {
				this.drawGlitch(ctx, box, col, pr, el);
				return 'raf';
			}
		}
		glassBody(ctx, f, box, col, 1, 0.9);
		return this.ghosts.length > 0 || this.glitch.on ? 'raf' : 'idle';
	}
	drawGlitch(ctx, box, col, pr, el) {
		const reach = this.glitch.dist >= CRT_JUMP ? Math.min(2.2, 0.7 + this.glitch.dist / 420) : 0.8;
		const env = (1 - pr) * (1 - pr);
		const bucket = Math.floor(el / 45) >>> 0;
		const amp = 14 * reach * env;
		const ab = 3.2 * env;
		const S = Math.min(12, Math.max(3, Math.round(box.h / 3)));
		const sh = box.h / S;
		const seed = this.glitch.seed;
		for (let i = 0; i < S; i++) {
			const n1 = glitchNoise(seed, i, bucket);
			const n2 = glitchNoise(seed + 101, i, bucket);
			const n3 = glitchNoise(seed + 977, i, bucket);
			if (n3 < 0.13 * env) continue;
			const d = (n1 - 0.5) * 2;
			const dx = d * d * d * amp;
			const sw = Math.max(1, box.w * (1 + (n2 - 0.5) * 0.55 * env));
			const sx = box.x + dx - (sw - box.w) / 2;
			const sy = box.y + i * sh;
			for (const ch of [
				[-ab, { r: col.r, g: 0, b: 0, a: 1 }],
				[0, { r: 0, g: col.g, b: 0, a: 1 }],
				[ab, { r: 0, g: 0, b: col.b, a: 1 }],
			]) {
				fillRectR(ctx, sx + ch[0], sy, sw, sh + 0.5, withAlpha(mixCol(ch[1], col, 0.45), 0.6), 0);
			}
		}
		if (glitchNoise(seed + 5501, 0, bucket) < 0.55) {
			const ly = box.y + glitchNoise(seed + 31, 1, bucket) * box.h;
			const lw = box.w * (1.2 + glitchNoise(seed + 77, 2, bucket) * 1.6);
			fillRectR(ctx, box.x - (lw - box.w) / 2, ly, lw, Math.max(1, 0.06 * box.h), { r: 255, g: 255, b: 255, a: 0.55 * env }, 0);
		}
	}
}

// ---- 5. Back-man (caretfx_delete.go) -------------------------------------------------

const BM_CHOMP = 140, BM_GULP = 220, BM_SQUINT = 420, BM_GROW = 0.18;
const BM_HZ = 6, BM_DAMP = 0.62, BM_KICK = 26, BM_MAX = 0.6, BM_SLIDE = 70, BM_GULP_AT = 0.6, BM_BIG_CHEW = 1.5;

function bmBite(tn, tk, big) {
	let ch = BM_CHOMP, gulp = BM_GULP, grow = BM_GROW, sq = BM_SQUINT;
	if (big) { ch *= BM_BIG_CHEW; gulp *= 1.4; grow *= 1.9; sq *= 1.4; }
	const end = Math.ceil((tk + 0.4 * ch) / ch) * ch;
	let open = 0;
	if (tn >= 0 && tn < end) open = Math.sin((Math.PI * (tn % ch)) / ch);
	const from = tn - (end - ch) - BM_GULP_AT * ch;
	const g = from / gulp, q = from / sq;
	const hump = (v, a, b) => (v <= a || v >= b ? 0 : Math.sin((Math.PI * (v - a)) / (b - a)));
	let squint = 0;
	if (q > 0 && q < 1) {
		if (q < 0.2) squint = smoothstep(q / 0.2);
		else if (q < 0.7) squint = 1;
		else squint = smoothstep((1 - q) / 0.3);
	}
	return { open, front: grow * hump(g, 0, 0.55), back: grow * hump(g, 0.35, 1), squint, end, done: g >= 1 && q >= 1 };
}

class BackmanCaret {
	constructor() { this.reset(); }
	reset() {
		this.t0 = 0; this.has = false; this.c0 = 0; this.t = 0; this.big = false;
		this.dir = 1; this.bend = 0; this.v = 0; this.at = 0; this.eye = 0; this.shut = false;
		this.meal = []; this.lastShape = [];
	}
	shift(dy) { for (const m of this.meal) m.cy += dy; }
	tint(dark) { return cursorColor(dark); }
	spring(dtMs) {
		const dt = Math.max(0, Math.min(dtMs / 1000, 2));
		const steps = Math.max(1, Math.ceil(dt * 480));
		const h = dt / steps;
		const w = 2 * Math.PI * BM_HZ;
		for (let i = 0; i < steps; i++) {
			this.v += (-w * w * this.bend - 2 * BM_DAMP * w * this.v) * h;
			this.bend += this.v * h;
			if (Math.abs(this.bend) > BM_MAX) {
				this.bend = Math.sign(this.bend) * BM_MAX;
				if (this.v * this.bend > 0) this.v = 0;
			}
		}
	}
	key(ctx, f, k, tn) {
		const big = k.erased > 1;
		const dir = k.dir || -1;
		let kk = dir * BM_KICK;
		if (big) kk *= 1.6;
		if (this.has) {
			this.spring(tn - this.at);
			for (const m of this.meal) m.t1 = Math.min(m.t1, tn);
			if (big || tn - this.c0 >= bmBite(0, this.t - this.c0, big).end) { this.c0 = tn; this.big = big; }
			this.t = tn; this.at = Math.max(this.at, tn); this.v += kk;
		} else {
			this.has = true; this.c0 = tn; this.t = tn; this.big = big;
			this.bend = 0; this.v = kk; this.at = tn; this.eye = 0; this.shut = false; this.meal = [];
		}
		this.dir = dir;
		let ch = BM_CHOMP;
		if (big) ch *= BM_BIG_CHEW;
		const t1 = this.c0 + Math.ceil((tn - this.c0 + 0.4 * ch) / ch) * ch;
		const size = textSize(f);
		const cy = f.r.y + f.r.h / 2;
		for (const l of goneLetters(ctx, f, k)) {
			this.meal.push({ ch: l.ch, cx: l.x + l.w / 2, cy, size, t0: tn, t1 });
		}
	}
	traceOutline(ctx, box, bt) {
		const w = box.w, h = box.h;
		const jaw = 0.36 * bt.open, depth = 0.78 * bt.open;
		const ps = [
			[0, 0, false], [1, 0, true], [1, 0.5 - jaw, true], [1 - depth, 0.5, true],
			[1, 0.5 + jaw, true], [1, 1, true], [0, 1, false], [0, 0.5, false],
		];
		const fdir = this.dir < 0 ? -1 : 1;
		const xy = ps.map(([qx, qy, front]) => {
			const mid = 1 - Math.abs(2 * qy - 1);
			const sx = fdir < 0 ? 1 - qx : qx;
			const grow = front ? fdir * bt.front : -fdir * bt.back;
			const X = sx + (this.bend + grow) * mid;
			return [box.x + X * w, box.y + qy * h];
		});
		this.lastShape = xy;
		const c = boxRadius(w, h), jawPx = jaw * h;
		const rad = [c, c, Math.min(0.24 * w, 0.5 * jawPx), Math.min(0.14 * w, 0.3 * jawPx), Math.min(0.24 * w, 0.5 * jawPx), c, c, 0];
		const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
		const unit = (a, b) => { const d = dist(a, b); return d === 0 ? [0, 0] : [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
		ctx.beginPath();
		ctx.moveTo((xy[0][0] + xy[1][0]) / 2, (xy[0][1] + xy[1][1]) / 2);
		for (let k = 1; k <= 8; k++) {
			const i = k % 8;
			const p0 = xy[(i + 7) % 8], p = xy[i], n = xy[(i + 1) % 8];
			const d = Math.min(rad[i], Math.min(dist(p0, p), dist(n, p)) / 2);
			if (d < 0.05) { ctx.lineTo(p[0], p[1]); continue; }
			const u1 = unit(p, p0), u2 = unit(p, n);
			ctx.lineTo(p[0] + u1[0] * d, p[1] + u1[1] * d);
			ctx.quadraticCurveTo(p[0], p[1], p[0] + u2[0] * d, p[1] + u2[1] * d);
		}
		ctx.closePath();
	}
	drawEye(ctx, f, box) {
		const w = box.w, h = box.h, fd = this.dir < 0 ? -1 : 1;
		const size = Math.min(0.6 * w, 0.24 * h);
		const cy = 0.05 * h + size / 2;
		let cx = fd < 0 ? w - 0.7 * w + size / 2 : 0.7 * w - size / 2;
		cx += this.bend * w * (1 - Math.abs((2 * cy) / h - 1));
		const ox = box.x, oy = box.y, s = this.eye, hole = f.bg;
		if (s >= 0.55) {
			const R = size / 2, a = 0.3 * size, t = Math.max(1, 0.22 * size);
			ctx.beginPath();
			ctx.moveTo(ox + cx - R, oy + cy + a);
			ctx.lineTo(ox + cx, oy + cy - a);
			ctx.lineTo(ox + cx + R, oy + cy + a);
			ctx.lineTo(ox + cx + R, oy + cy + a + t);
			ctx.lineTo(ox + cx, oy + cy - a + t);
			ctx.lineTo(ox + cx - R, oy + cy + a + t);
			ctx.closePath();
			ctx.fillStyle = cssCol(hole);
			ctx.fill();
			return;
		}
		const hh = (size * (1 - (0.75 * s) / 0.55)) / 2;
		fillRectR(ctx, ox + cx - size / 2, oy + cy - hh, size, 2 * hh, hole, 1);
		if (s < 0.25) {
			const g = Math.max(1, 0.28 * size), inset = 0.16 * size;
			const gx = fd < 0 ? cx - size / 2 + inset : cx + size / 2 - inset - g;
			fillRectR(ctx, ox + gx, oy + cy - size / 2 + inset, g, g, withAlpha(WHITE, 0.95), 0);
		}
	}
	draw(ctx, nowMs, f, k) {
		if (k.wrote > 0 && k.erased === 0) this.dir = 1;
		if (!this.t0) this.t0 = nowMs;
		const tn = nowMs - this.t0;
		const box = boxOf(f);
		const col = cursorColor(f.dark);
		if (k.erased > 0 && k.gone) this.key(ctx, f, k, tn);
		if (!this.has) {
			styledDraw(ctx, f, box, () => {
				glassPath(ctx, restBodyTrace(f, box), box, col, f.dark);
				glassGloss(ctx, box, f.dark, 1, f.gaze ?? this.dir);
			});
			return 'idle';
		}
		const bt = bmBite(Math.max(0, tn - this.c0), this.t - this.c0, this.big);
		if (bt.squint >= 0.55) this.shut = true;
		const target = this.shut ? 1 : bt.squint;
		const tau = target > this.eye ? 30 : 80;
		this.eye = target + (this.eye - target) * Math.exp(-Math.max(0, tn - this.at) / tau);
		if (Math.abs(this.eye - target) < 0.005) this.eye = target;
		this.spring(tn - this.at);
		this.at = tn;
		this.meal = this.meal.filter((m) => tn < m.t1);
		if (bt.done && Math.abs(this.bend) < 0.004 && Math.abs(this.v) < 0.05 && this.meal.length === 0) {
			this.has = false; this.shut = false;
			styledDraw(ctx, f, box, () => {
				glassPath(ctx, restBodyTrace(f, box), box, col, f.dark);
				glassGloss(ctx, box, f.dark, 1, f.gaze ?? this.dir);
			});
			return 'idle';
		}
		// Compute lastShape for meal target before drawing letters
		this.traceOutline(ctx, box, bt);
		const textCol = f.theme?.text || (f.dark ? WHITE : BLACK);
		for (const m of this.meal) {
			const u = clamp01((tn - m.t0) / Math.max(1, Math.min(m.t1 - m.t0, BM_SLIDE)));
			const e = 1 - (1 - u) * (1 - u);
			const [mx, my] = this.lastShape[3];
			glyphAt(ctx, m.ch, m.cx + (mx - m.cx) * e, m.cy + (my - m.cy) * e, m.size, textCol, false, 0, Math.max(0.05, 1 - 0.8 * e), f.fontFamily);
		}
		styledDraw(ctx, f, box, () => glassPath(ctx, (c) => this.traceOutline(c, box, bt), box, col, f.dark));
		this.drawEye(ctx, f, box);
		return idleRate(f) === 'idle' && !this.has ? 'idle' : 'raf';
	}
}

// ---- 6. Portal (caretfx_delete.go) ---------------------------------------------------

const PO_FALL = 420, PO_TALL = 2.5, PO_HOLD = 200, PO_RUSH = 60;

class PortalCaret {
	constructor() { this.reset(); }
	reset() { this.t0 = 0; this.letters = []; this.at = -1e9; }
	shift(dy) { for (const l of this.letters) l.cy += dy; }
	tint(dark) { return cursorColor(dark); }
	draw(ctx, nowMs, f, k) {
		if (!this.t0) this.t0 = nowMs;
		const tn = nowMs - this.t0;
		const box = boxOf(f);
		const col = cursorColor(f.dark);
		if (k.erased > 0 && k.gone) {
			this.at = tn;
			for (const l of this.letters) if (!l.rushed) { l.rush = tn; l.rushed = true; }
			const size = textSize(f);
			for (const l of goneLetters(ctx, f, k)) {
				this.letters.push({ ch: l.ch, cx: l.x + l.w / 2, cy: f.r.y + f.r.h / 2, half: 0.3 * size, ax: f.r.x, t0: tn, rush: 0, rushed: false, size });
			}
			this.at = Math.max(this.at, tn + PO_FALL);
		}
		if (this.letters.length === 0 && tn - this.at >= PO_HOLD) {
			glassBody(ctx, f, box, col, 1, 0.9);
			return 'idle';
		}
		const uh = Math.max(2, Math.min(4, 0.1 * box.h));
		const floorTop = box.y + box.h - uh;
		const floorLeft = box.x;
		const textCol = f.theme?.text || (f.dark ? WHITE : BLACK);
		let glow = 0;
		let right = box.x + box.w;
		const out = [];
		for (const l of this.letters) {
			const u = clamp01((tn - l.t0) / PO_FALL);
			let v = Math.min(1, u / 0.85);
			if (l.rushed) v = Math.max(v, clamp01((tn - l.rush) / PO_RUSH));
			if (u >= 1 || (l.rushed && tn - l.rush >= PO_RUSH)) continue;
			out.push(l);
			const foot0 = l.cy + l.half;
			const tall = PO_TALL * l.half;
			const foot = foot0 + (Math.max(0, floorTop - foot0) + tall + 1) * smoothstep(v);
			const through = clamp01((foot - floorTop) / tall);
			const x = l.cx + (floorLeft - l.ax);
			if (through > 0 && through < 1) glow = Math.max(glow, Math.sin(Math.PI * through));
			const span = smoothstep(u / 0.15) * (1 - smoothstep((u - 0.85) / 0.15));
			right = Math.max(right, box.x + box.w + Math.max(0, x + l.half - (box.x + box.w)) * span);
			const cy = foot - l.half;
			ctx.save();
			ctx.beginPath(); ctx.rect(x - 40, cy - 80, 80, Math.max(0, floorTop - (cy - 80))); ctx.clip();
			glyphAt(ctx, l.ch, x, cy, l.size, textCol, false, 0, 1, f.fontFamily);
			ctx.restore();
			const band = 0.45 * PO_TALL * l.half;
			ctx.save();
			ctx.beginPath(); ctx.rect(x - 40, floorTop - band, 80, band); ctx.clip();
			glyphAt(ctx, l.ch, x, cy, l.size, withAlpha(col, 0.9), false, 0, 1, f.fontFamily);
			ctx.restore();
		}
		this.letters = out;
		fillRectR(ctx, floorLeft, floorTop, right - floorLeft, uh, withAlpha(col, 0.95), uh / 2);
		if (glow > 0.01) fillRectR(ctx, floorLeft, floorTop, right - floorLeft, uh, withAlpha(WHITE, 0.6 * glow), uh / 2);
		return 'raf';
	}
}

// ---- 7. Speed Demon (caretfx_ambient.go) ---------------------------------------------

const HEAT_STOPS = [
	[0, hexCol('#8a8a8a')], [0.3, hexCol('#d9a441')], [0.55, hexCol('#ff8c1a')],
	[0.8, hexCol('#ff5a1f')], [1, hexCol('#fff4e0')],
];

function heatColor(h) {
	h = clamp01(h);
	for (let i = 1; i < HEAT_STOPS.length; i++) {
		if (h <= HEAT_STOPS[i][0]) {
			const a = HEAT_STOPS[i - 1], b = HEAT_STOPS[i];
			return mixCol(a[1], b[1], (h - a[0]) / (b[0] - a[0]));
		}
	}
	return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

class SpeedDemonCaret {
	constructor() { this.reset(); }
	reset() { this.t0 = 0; this.heat = 0; this.last = 0; this.lastSpawn = 0; this.sparks = []; this.prev = null; this.have = false; }
	shift(dy) {
		for (const s of this.sparks) s.y += dy;
		if (this.prev) this.prev.y += dy;
	}
	tint() { return heatColor(0.75); }
	draw(ctx, nowMs, f, k) {
		if (!this.t0) this.t0 = nowMs;
		const tn = nowMs - this.t0;
		const dt = Math.min(0.1, Math.max(0.001, (tn - this.last) / 1000));
		this.last = tn;
		const box = boxOf(f);
		if (k.wrote > 0) this.heat = Math.min(1, this.heat + 0.08 * k.wrote);
		if (this.have && k.wrote === 0) {
			const [mv, d] = movedBy(this.prev, f.r);
			if (mv) this.heat = Math.min(1, this.heat + Math.min(0.12, d / 900));
		}
		this.prev = { ...f.r }; this.have = true;
		this.heat *= Math.exp(-dt / 1.6);
		if (this.heat < 0.01) this.heat = 0;
		if (this.heat >= 0.4 && this.sparks.length < 120) {
			const gap = 70 - 55 * this.heat;
			if (tn - this.lastSpawn >= gap) {
				this.lastSpawn = tn;
				const n = 1 + Math.floor(this.heat * 3);
				for (let i = 0; i < n; i++) {
					const base = heatColor(Math.min(1, this.heat + 0.1));
					const c = rgbaCol(base.r + (rnd() - 0.5) * 40, base.g + (rnd() - 0.5) * 30, base.b + (rnd() - 0.5) * 20, 1);
					this.sparks.push({
						x: box.x + rnd() * box.w, y: box.y + rnd() * box.h * 0.4,
						vx: (rnd() - 0.5) * 12, vy: -20 - rnd() * 30 - this.heat * 20,
						size: 1.5 + rnd() * 2, t0: tn, life: 400, col: c,
					});
				}
			}
		}
		const out = [];
		for (const s of this.sparks) {
			const el = tn - s.t0;
			if (el > s.life) continue;
			out.push(s);
			const t = el / s.life;
			fillRectR(ctx, s.x + (s.vx * el) / 1000, s.y + (s.vy * el) / 1000, s.size, s.size, withAlpha(s.col, 1 - t * t), 0);
		}
		this.sparks = out;
		const col = heatColor(this.heat);
		glassBody(ctx, f, box, col, 1, 0.9 * (1 + 1.6 * this.heat));
		return this.heat > 0 || this.sparks.length > 0 ? 'raf' : 'idle';
	}
}

// ---- 8. Torch (caretfx_ambient.go) ---------------------------------------------------

class TorchCaret {
	constructor() { this.reset(); }
	reset() { this.t0 = 0; this.x = 0; this.y = 0; this.placed = false; this.last = 0; }
	shift(dy) { this.y += dy; }
	tint(dark) { return cursorColor(dark); }
	draw(ctx, nowMs, f) {
		if (!this.t0) this.t0 = nowMs;
		const tn = nowMs - this.t0;
		const dt = Math.min(0.1, Math.max(0.001, (tn - this.last) / 1000));
		this.last = tn;
		const box = boxOf(f);
		const tx = box.x + box.w / 2, ty = box.y + box.h / 2;
		if (!this.placed) { this.x = tx; this.y = ty; this.placed = true; }
		const a = 1 - Math.pow(0.78, dt * 60);
		this.x += (tx - this.x) * a;
		this.y += (ty - this.y) * a;
		if (Math.abs(tx - this.x) < 0.25 && Math.abs(ty - this.y) < 0.25) { this.x = tx; this.y = ty; }
		const b = f.bounds;
		if (b.w > 0 && b.h > 0) {
			const R = b.w < 260 ? Math.max(55, b.w * 0.55) : 250;
			const dark = 0.7;
			const rg = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, R);
			rg.addColorStop(0, cssCol(rgbaCol(0, 0, 0, 0)));
			rg.addColorStop(0.4, cssCol(rgbaCol(0, 0, 0, 0.52 * dark)));
			rg.addColorStop(0.7, cssCol(rgbaCol(0, 0, 0, 0.91 * dark)));
			rg.addColorStop(1, cssCol(rgbaCol(0, 0, 0, dark)));
			ctx.fillStyle = rg;
			ctx.fillRect(b.x, b.y, b.w, b.h);

			const wg = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, R * 0.6);
			wg.addColorStop(0, cssCol(rgbaCol(255, 150, 60, 0.04)));
			wg.addColorStop(0.45, cssCol(rgbaCol(255, 150, 60, 0.012)));
			wg.addColorStop(0.75, cssCol(rgbaCol(255, 150, 60, 0)));
			ctx.fillStyle = wg;
			ctx.fillRect(b.x, b.y, b.w, b.h);
		}
		glassBody(ctx, f, box, cursorColor(f.dark), 1, 0.9);
		return Math.hypot(tx - this.x, ty - this.y) > 0.25 ? 'raf' : 'idle';
	}
}

// ---- 9. Mario (caretfx_mario.go) -----------------------------------------------------

const MARIO_HOP_T = 230, MARIO_COIN_T = 520;
function marioColors(dark) {
	return dark ? [hexCol('#ff4b3e'), hexCol('#5b7cff')] : [hexCol('#e52521'), hexCol('#2b4bd8')];
}

class MarioCaret {
	constructor() { this.reset(); }
	reset() { this.t0 = 0; this.left = false; this.hop = -1; this.coins = []; }
	shift(dy) { for (const c of this.coins) c.y += dy; }
	tint(dark) { return marioColors(dark)[0]; }
	draw(ctx, nowMs, f, k) {
		if (!this.t0) this.t0 = nowMs;
		const tn = nowMs - this.t0;
		const box = boxOf(f);
		const h = box.h;
		this.left = gazeWant(this.left ? -1 : 1, k) < 0;
		if (k.typed.includes(' ')) {
			this.hop = tn;
			this.coins.push({ x: box.x + box.w / 2, y: box.y, t0: tn });
			if (this.coins.length > 24) this.coins = this.coins.slice(-24);
		}
		let lift = 0;
		if (this.hop >= 0) {
			const t = (tn - this.hop) / MARIO_HOP_T;
			if (t >= 1) this.hop = -1;
			else lift = 0.32 * h * 4 * t * (1 - t);
		}
		this.drawCoins(ctx, tn, h);
		const body = { ...box, y: box.y - lift };
		this.drawBody(ctx, f, body, lift > 0);
		return this.hop >= 0 || this.coins.length > 0 ? 'raf' : 'idle';
	}
	drawBody(ctx, f, box, air) {
		const [cap, overalls] = marioColors(f.dark);
		const trace = !air && f.jelly ? (c) => traceRoundedQuad(c, f.jelly.corners, f.jelly.r) : (c) => traceShapeBody(c, box, f.style?.bracket || '');
		styledDraw(ctx, f, box, () => {
			if (air || !f.jelly) glowAround(ctx, box, cap, 0.9);
			else {
				ctx.save();
				ctx.lineJoin = 'round'; ctx.lineCap = 'round';
				const alphas = [0.035, 0.06, 0.09], widths = [9, 6, 3.5];
				for (let i = 0; i < 3; i++) { trace(ctx); ctx.lineWidth = widths[i]; ctx.strokeStyle = cssCol(withAlpha(cap, 0.9 * alphas[i])); ctx.stroke(); }
				ctx.restore();
			}
			const top = mixCol(cap, WHITE, 0.45);
			const mid = mixOklab(cap, overalls, 0.5);
			const g = ctx.createLinearGradient(0, box.y, 0, box.y + Math.max(1, box.h));
			g.addColorStop(0.0, cssCol(withAlpha(top, 0.62)));
			g.addColorStop(0.3, cssCol(withAlpha(cap, 0.42)));
			g.addColorStop(0.5, cssCol(withAlpha(mid, 0.41)));
			g.addColorStop(0.7, cssCol(withAlpha(overalls, 0.40)));
			g.addColorStop(1.0, cssCol(withAlpha(overalls, 0.50)));
			trace(ctx); ctx.fillStyle = g; ctx.fill();

			const sg = ctx.createLinearGradient(0, box.y, 0, box.y + Math.max(1, box.h));
			sg.addColorStop(0.3, cssCol(withAlpha(cap, 0.95)));
			sg.addColorStop(0.5, cssCol(withAlpha(mid, 0.95)));
			sg.addColorStop(0.7, cssCol(withAlpha(overalls, 0.95)));
			trace(ctx); ctx.lineWidth = 1.25; ctx.strokeStyle = sg; ctx.stroke();

			const d = this.left ? -1 : 1;
			const r = Math.max(1.5, Math.min(box.w * 0.15, 2.6));
			const ex = box.x + box.w / 2 + d * box.w * 0.14;
			const ey = box.y + box.h * 0.24;
			fillRectR(ctx, ex - r, ey - r, 2 * r, 2 * r, hexCol('#1a0e08'), r);
			fillRectR(ctx, ex - r * 0.2, ey - r * 0.6, r * 0.7, r * 0.7, withAlpha(WHITE, 0.9), r * 0.35);
		});
	}
	drawCoins(ctx, tn, h) {
		const gold = hexCol('#f8b800'), shine = hexCol('#fcf0b0'), rim = hexCol('#ac7c00');
		const out = [];
		for (const c of this.coins) {
			const el = tn - c.t0;
			if (el > MARIO_COIN_T) continue;
			out.push(c);
			const t = el / MARIO_COIN_T;
			let rise = 1.5 * h * (1 - (1 - t) * (1 - t));
			if (t > 0.7) rise -= 0.35 * h * smoothstep((t - 0.7) / 0.3);
			const alpha = 1 - smoothstep((t - 0.6) / 0.4);
			const ch = 0.62 * h;
			const cw = ch * 0.72 * Math.max(0.12, Math.abs(Math.cos((el / 1000) * 14)));
			const cx = c.x, cy = c.y - rise - ch / 2;
			const body = { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch };
			fillRectR(ctx, body.x, body.y, body.w, body.h, withAlpha(rim, alpha), cw / 2);
			const inn = { x: body.x + body.w * 0.18, y: body.y + body.h * 0.1, w: body.w * 0.64, h: body.h * 0.8 };
			fillRectR(ctx, inn.x, inn.y, inn.w, inn.h, withAlpha(gold, alpha), inn.w / 2);
			if (cw > ch * 0.3) fillRectR(ctx, cx - cw * 0.08, inn.y + inn.h * 0.18, cw * 0.16, inn.h * 0.64, withAlpha(shine, alpha), 0);
		}
		this.coins = out;
	}
}

// ---- 10. Tamagotchi (caretfx_game.go) ------------------------------------------------

class TamagotchiCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.have = false; this.fed = 40; this.total = 0; this.hearts = []; this.bob = 0; }
	shift(dy) { shiftMotes(this.hearts, dy); this.prev.y += dy; }
	tint() { return hslCol(300 - 120 * (this.fed / 400), 0.35 + 0.5 * (this.fed / 400), 0.62); }
	draw(ctx, nowMs, f, k) {
		const { tn, dt } = this.step(nowMs, f, k);
		const box = boxOf(f);
		if (k.wrote > 0) {
			this.fed = Math.min(400, this.fed + k.wrote);
			const was = Math.floor(this.total / 100);
			this.total += k.wrote;
			if (Math.floor(this.total / 100) > was) {
				for (let i = 0; i < 4; i++) {
					this.hearts.push({ x: box.x + box.w / 2, y: box.y, vx: (rnd() - 0.5) * 50, vy: -50 - rnd() * 30, t0: tn, life: 1300, size: box.h * 0.4 });
				}
			}
		}
		if (this.idle(tn) > 2) this.fed = Math.max(0, this.fed - dt * 4);
		const well = this.fed / 400;
		const grow = 1 + 0.45 * well;
		this.bob += dt * (1.5 + 3 * well);
		const bob = Math.sin(this.bob) * box.h * 0.05;
		const w = box.w * grow, h = box.h * grow;
		const b = { x: box.x + box.w / 2 - w / 2, y: box.y + box.h - h + bob, w, h };
		const col = hslCol(300 - 120 * well, 0.35 + 0.5 * well, 0.62);
		glassBody(ctx, { ...f, jelly: null }, b, col, 0.95, 0.6 + 0.8 * well, false);
		const ink = faceInk(f.dark, hexCol('#1f1530'));
		const er = Math.max(1, b.w * 0.11);
		for (const ox of [0.3, 0.7]) {
			const ex = b.x + b.w * ox + this.gaze() * b.w * 0.07, ey = b.y + b.h * 0.38;
			fillRectR(ctx, ex - er, ey - er, 2 * er, 2 * er, ink, er);
		}
		const mx = b.x + b.w / 2, my = b.y + b.h * 0.66, mw = b.w * 0.24;
		const curve = b.h * 0.12 * (well * 2 - 1);
		ctx.save();
		ctx.beginPath(); ctx.moveTo(mx - mw, my); ctx.quadraticCurveTo(mx, my + curve, mx + mw, my);
		ctx.lineWidth = Math.max(1, b.w * 0.07); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
		ctx.restore();
		this.hearts = stepDrawMotes(this.hearts, tn, dt, (m, age) => {
			glyphAt(ctx, '♥', m.x, m.y, m.size, withAlpha(hexCol('#f43f5e'), 1 - age), true, 0, 1 + 0.3 * age, f.fontFamily);
		});
		return idleRate(f);
	}
}

// ---- 11. Plant (caretfx_nature.go) ---------------------------------------------------

class PlantCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.leaves = []; this.bloom = -1; this.falls = []; this.have = false; }
	shift(dy) { shiftMotes(this.falls, dy); this.prev.y += dy; }
	tint() { return hexCol('#22c55e'); }
	draw(ctx, nowMs, f, k) {
		const { tn, dt } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h;
		const leaf = hexCol('#22c55e'), stem = hexCol('#15803d');
		if (this.bloom >= 0 && tn - this.bloom > 1600) { this.leaves = []; this.bloom = -1; }
		const spaces = (k.typed.match(/ /g) || []).length;
		if (spaces > 0 && this.leaves.length < 8 && this.bloom < 0) {
			for (let i = 0; i < spaces && this.leaves.length < 8; i++) this.leaves.push(tn);
		}
		if (k.typed.includes('\n') && this.bloom < 0) this.bloom = tn;
		for (let i = 0; i < k.erased && this.leaves.length > 0; i++) {
			this.leaves.pop();
			this.falls.push({
				x: box.x + box.w / 2, y: box.y - h * 0.2 * (this.leaves.length + 1),
				vx: 18, vy: 10, spin: 3, t0: tn, life: 1200, size: h * 0.28, grav: 40, col: leaf,
			});
		}
		const cx = box.x + box.w / 2, top = box.y;
		let tall = h * (0.25 + 0.22 * this.leaves.length);
		if (this.bloom >= 0) tall += h * 0.2;
		const sway = Math.sin((tn / 1000) * 1.6) * h * 0.06;
		if (this.leaves.length > 0 || this.bloom >= 0) {
			ctx.save();
			ctx.beginPath(); ctx.moveTo(cx, top); ctx.quadraticCurveTo(cx + sway, top - tall / 2, cx + sway * 1.5, top - tall);
			ctx.lineWidth = Math.max(1.2, box.w * 0.14); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(stem); ctx.stroke();
			ctx.restore();
		}
		for (let i = 0; i < this.leaves.length; i++) {
			const grow = clamp01((tn - this.leaves[i]) / 280);
			const y = top - h * 0.22 * (i + 1);
			const side = i % 2 === 1 ? -1 : 1;
			const x = cx + (sway * (i + 1)) / (this.leaves.length + 1);
			const l = h * 0.3 * easeOut(grow);
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.quadraticCurveTo(x + side * l * 0.6, y - l * 0.5, x + side * l, y - l * 0.15);
			ctx.quadraticCurveTo(x + side * l * 0.5, y + l * 0.15, x, y);
			ctx.closePath();
			ctx.fillStyle = cssCol(withAlpha(leaf, 0.95));
			ctx.fill();
			ctx.restore();
		}
		if (this.bloom >= 0) {
			const bk = easeOut(clamp01((tn - this.bloom) / 450));
			const fx = cx + sway * 1.5, fy = top - tall, r = h * 0.22 * bk;
			const petal = hexCol('#f472b6');
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * 2 * Math.PI + tn / 3000;
				const px = fx + Math.cos(a) * r, py = fy + Math.sin(a) * r, pr = r * 0.75;
				fillRectR(ctx, px - pr, py - pr, 2 * pr, 2 * pr, petal, pr);
			}
			const cr = r * 0.6;
			fillRectR(ctx, fx - cr, fy - cr, 2 * cr, 2 * cr, hexCol('#facc15'), cr);
		}
		this.falls = stepDrawMotes(this.falls, tn, dt, (m, age) => {
			m.vx = 18 * Math.sin((tn - m.t0) / 180);
			const s = m.size;
			ctx.save();
			ctx.translate(m.x, m.y);
			ctx.rotate(m.ang);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.quadraticCurveTo(s * 0.6, -s * 0.5, s, -s * 0.15);
			ctx.quadraticCurveTo(s * 0.5, s * 0.15, 0, 0);
			ctx.closePath();
			ctx.fillStyle = cssCol(withAlpha(m.col, 1 - age));
			ctx.fill();
			ctx.restore();
		});
		glassBody(ctx, f, box, leaf, 1, 0.8);
		return idleRate(f);
	}
}

// ---- 12. Firefly (caretfx_nature.go) -------------------------------------------------

class FireflyCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.flies = []; this.count = 0; this.have = false; }
	shift(dy) { this.prev.y += dy; }
	tint() { return mixCol(hexCol('#fde047'), hexCol('#a16207'), 0.35); }
	draw(ctx, nowMs, f, k) {
		const { tn, dt } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h;
		this.count += k.wrote;
		while (this.count >= 4 && this.flies.length < 14) {
			this.count -= 4;
			this.flies.push({
				ang: rnd() * 2 * Math.PI, r: h * (0.9 + rnd() * 1.2),
				speed: (0.6 + rnd()) * (rnd() > 0.5 ? 1 : -1), phase: rnd() * 6, born: tn, away: false, leaving: 0,
			});
		}
		if (this.idle(tn) > 2.2) {
			for (const fl of this.flies) if (!fl.away) { fl.away = true; fl.leaving = tn + rnd() * 600; }
		}
		if (k.wrote > 0) for (const fl of this.flies) fl.away = false;
		const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
		const yellow = hexCol('#fde047');
		const out = [];
		for (const fl of this.flies) {
			fl.ang += fl.speed * dt;
			let a = clamp01((tn - fl.born) / 400);
			if (fl.away && tn > fl.leaving) {
				fl.r += h * 2 * dt;
				a *= 1 - clamp01((tn - fl.leaving) / 1200);
				if (a <= 0) continue;
			}
			const x = cx + Math.cos(fl.ang) * fl.r;
			const y = cy + Math.sin(fl.ang * 1.3 + fl.phase) * fl.r * 0.55;
			const pulse = 0.55 + 0.45 * Math.sin((tn / 1000) * 4 + fl.phase);
			const sizes = [5, 3, 1.6], alphas = [0.12, 0.3, 1];
			for (let i = 0; i < 3; i++) {
				const s = sizes[i];
				fillRectR(ctx, x - s, y - s, 2 * s, 2 * s, withAlpha(yellow, a * pulse * alphas[i]), s);
			}
			out.push(fl);
		}
		this.flies = out;
		glassBody(ctx, f, box, this.tint(), 1, 1.1);
		return this.flies.length > 0 ? 'raf' : 'idle';
	}
}

// ---- 13. Mood Face (caretfx_mood.go) -------------------------------------------------

const MOOD_WORDS = {
	harika: 1, guzel: 1, super: 1, mutlu: 1, mutluyum: 1, sevgi: 1, seviyorum: 1, tesekkur: 1, tesekkurler: 1, iyi: 1,
	muhtesem: 1, bravo: 1, yasasin: 1, sevindim: 1, great: 1, good: 1, happy: 1, love: 1, thanks: 1, nice: 1, yay: 1,
	uzgun: 2, uzuldum: 2, kotu: 2, maalesef: 2, agladim: 2, yorgun: 2, yoruldum: 2, keske: 2, sad: 2, bad: 2, tired: 2, sorry: 2,
	kizgin: 3, sinir: 3, sinirli: 3, nefret: 3, ofkeli: 3, angry: 3, hate: 3,
};
const MOOD_COLORS = ['#a78bfa', '#facc15', '#60a5fa', '#f87171', '#fb923c', '#2dd4bf', '#f9a8d4'].map((h) => hexCol(h));

class MoodFaceCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.word = ''; this.mood = 0; this.since = 0; this.blink = 1500; this.have = false; }
	shift(dy) { this.prev.y += dy; }
	tint() { return MOOD_COLORS[this.mood] || MOOD_COLORS[0]; }
	feel(m, tn) { this.mood = m; this.since = tn; }
	draw(ctx, nowMs, f, k) {
		const { tn } = this.step(nowMs, f, k);
		const box = boxOf(f);
		for (const ch of k.typed) {
			if (ch === '!') this.feel(4, tn);
			else if (ch === '?') this.feel(5, tn);
			else if (ch === ' ' || ch === '\n' || ch === '.' || ch === ',' || ch === ';' || ch === ':') {
				const m = MOOD_WORDS[foldText(this.word)];
				if (m) this.feel(m, tn);
				this.word = '';
			} else if (this.word.length < 24) {
				this.word += ch;
			}
		}
		if (k.erased > 0) {
			this.feel(6, tn);
			const chars = Array.from(this.word);
			this.word = chars.slice(0, Math.max(0, chars.length - k.erased)).join('');
		}
		if (tn - this.since > 2600 && this.mood !== 0) this.mood = 0;
		const col = MOOD_COLORS[this.mood] || MOOD_COLORS[0];
		glassBody(ctx, f, box, col, 1, 0.9, false);
		const ink = faceInk(f.dark, hexCol('#1c1917'));
		const er = Math.max(1, box.w * 0.11);
		let blinking = false;
		if (tn > this.blink) {
			blinking = tn - this.blink < 120;
			if (!blinking) this.blink = tn + 2000 + rnd() * 2500;
		}
		const look = this.gaze();
		for (let i = 0; i < 2; i++) {
			const ox = i === 0 ? 0.3 : 0.7;
			const ex = box.x + box.w * ox + look * box.w * 0.06, ey = box.y + box.h * 0.36;
			if (blinking) {
				fillRectR(ctx, ex - er, ey, 2 * er, Math.max(0.8, er * 0.4), ink, 0);
			} else if (this.mood === 4) {
				fillRectR(ctx, ex - er * 1.3, ey - er * 1.3, er * 2.6, er * 2.6, ink, er * 1.3);
				const gx = ex + look * er * 0.45;
				fillRectR(ctx, gx - er * 0.4, ey - er * 0.8, er * 0.8, er * 0.8, withAlpha(WHITE, 0.9), er * 0.4);
			} else if (this.mood === 1) {
				ctx.save();
				ctx.beginPath(); ctx.moveTo(ex - er, ey + er * 0.4); ctx.quadraticCurveTo(ex, ey - er * 1.2, ex + er, ey + er * 0.4);
				ctx.lineWidth = Math.max(1, er * 0.6); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
				ctx.restore();
			} else {
				fillRectR(ctx, ex - er, ey - er, 2 * er, 2 * er, ink, er);
			}
			const by = box.y + box.h * 0.2;
			if (this.mood === 3 || (this.mood === 5 && i === 1) || this.mood === 2) {
				ctx.save();
				ctx.beginPath();
				if (this.mood === 3) {
					if (i === 0) { ctx.moveTo(ex - er * 1.3, by - er * 0.6); ctx.lineTo(ex + er, by + er * 0.3); }
					else { ctx.moveTo(ex - er, by + er * 0.3); ctx.lineTo(ex + er * 1.3, by - er * 0.6); }
				} else if (this.mood === 5) {
					ctx.moveTo(ex - er, by - er * 0.4); ctx.quadraticCurveTo(ex, by - er * 1.6, ex + er, by - er * 0.6);
				} else {
					if (i === 0) { ctx.moveTo(ex - er * 1.2, by + er * 0.2); ctx.lineTo(ex + er, by - er * 0.6); }
					else { ctx.moveTo(ex - er, by - er * 0.6); ctx.lineTo(ex + er * 1.2, by + er * 0.2); }
				}
				ctx.lineWidth = Math.max(0.8, er * 0.45); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
				ctx.restore();
			}
		}
		const mx = box.x + box.w / 2, my = box.y + box.h * 0.68, mw = box.w * 0.26;
		if (this.mood === 4) {
			const r = box.w * 0.14;
			fillRectR(ctx, mx - r, my - r, 2 * r, 2.2 * r, ink, r);
		} else {
			ctx.save();
			ctx.beginPath();
			if (this.mood === 1) { ctx.moveTo(mx - mw, my - box.h * 0.04); ctx.quadraticCurveTo(mx, my + box.h * 0.16, mx + mw, my - box.h * 0.04); }
			else if (this.mood === 2 || this.mood === 3) { ctx.moveTo(mx - mw, my + box.h * 0.06); ctx.quadraticCurveTo(mx, my - box.h * 0.1, mx + mw, my + box.h * 0.06); }
			else if (this.mood === 5) { ctx.moveTo(mx - mw, my + box.h * 0.02); ctx.lineTo(mx + mw, my - box.h * 0.04); }
			else { ctx.moveTo(mx - mw * 0.7, my); ctx.quadraticCurveTo(mx, my + box.h * 0.05, mx + mw * 0.7, my); }
			ctx.lineWidth = Math.max(0.9, box.w * 0.07); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
			ctx.restore();
		}
		if (this.mood === 6) {
			for (const ox of [0.18, 0.82]) {
				const cx = box.x + box.w * ox;
				fillRectR(ctx, cx - er * 1.2, box.y + box.h * 0.52, er * 2.4, er * 1.2, { r: 244, g: 63, b: 94, a: 0.55 }, er * 0.6);
			}
		}
		return idleRate(f);
	}
}

// ---- 14. Punctuation (caretfx_mood.go) -----------------------------------------------

class PunctCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.bump = -1e9; this.tail = -1e9; this.ask = -1e9; this.colon = -1e9; this.dash = -1e9; this.burst = []; this.have = false; }
	shift(dy) { shiftMotes(this.burst, dy); this.prev.y += dy; }
	tint() { return hexCol('#8b5cf6'); }
	draw(ctx, nowMs, f, k) {
		const { tn, dt } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h, accent = hexCol('#8b5cf6');
		const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
		for (const r of k.typed) {
			if (r === '.') this.bump = tn;
			else if (r === ',') this.tail = tn;
			else if (r === '?') this.ask = tn;
			else if (r === ':' || r === ';') this.colon = tn;
			else if (r === '-') this.dash = tn;
			else if (r === '!') {
				for (let i = 0; i < 12; i++) {
					const a = (i / 12) * 2 * Math.PI, sp = 110 + rnd() * 60;
					this.burst.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: tn, life: 420, size: 1.6 + rnd(), col: hslCol(rnd() * 360, 0.9, 0.6) });
				}
			}
		}
		const b = { ...box };
		const bk = (tn - this.bump) / 240;
		if (bk >= 0 && bk < 1) {
			const s = Math.sin(bk * Math.PI);
			b.h *= 1 - 0.22 * s;
			b.y += box.h - b.h;
			b.x -= s * 1.2;
			b.w += s * 2.4;
			const dust = s * box.w;
			fillRectR(ctx, box.x - dust, box.y + box.h, box.w + 2 * dust, 1.2, withAlpha(accent, 0.4 * (1 - bk)), 0.6);
		}
		this.burst = stepDrawMotes(this.burst, tn, dt, (m, age) => {
			m.vx *= 0.9; m.vy *= 0.9;
			const s = m.size * (1 - age * 0.5);
			fillRectR(ctx, m.x - s, m.y - s, 2 * s, 2 * s, withAlpha(m.col, 1 - age), s);
		});
		glassBody(ctx, { ...f, jelly: null }, b, accent, 1, 0.9);
		const tk = (tn - this.tail) / 420;
		if (tk >= 0 && tk < 1) {
			const l = easeOut(tk), x0 = b.x + b.w * 0.6, y0 = b.y + b.h;
			ctx.save();
			ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + b.w * 0.3, y0 + h * 0.25 * l, x0 - b.w * 0.3, y0 + h * 0.35 * l);
			ctx.lineWidth = Math.max(1.2, b.w * 0.25); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(withAlpha(accent, 1 - tk * tk)); ctx.stroke();
			ctx.restore();
		}
		const ak = (tn - this.ask) / 1000;
		if (ak >= 0 && ak < 1) {
			glyphAt(ctx, '?', b.x + b.w / 2, b.y - h * (0.3 + 0.4 * easeOut(ak)), h * 0.6, withAlpha(accent, 1 - ak * ak), true, 0, 1, f.fontFamily);
		}
		const ck = (tn - this.colon) / 500;
		if (ck >= 0 && ck < 1) {
			for (const oy of [0.3, 0.7]) {
				const r = h * 0.08 * Math.sin(Math.min(1, ck * 2) * Math.PI);
				const x = b.x + b.w + h * 0.25, y = b.y + b.h * oy;
				if (r > 0) fillRectR(ctx, x - r, y - r, 2 * r, 2 * r, withAlpha(accent, 1 - ck), r);
			}
		}
		const dk = (tn - this.dash) / 300;
		if (dk >= 0 && dk < 1) {
			const w = box.w * 3 * easeOut(dk);
			fillRectR(ctx, b.x - w, b.y + b.h * 0.5, w, Math.max(1, b.h * 0.07), withAlpha(accent, 0.6 * (1 - dk)), 1);
		}
		return this.burst.length > 0 || tn - this.bump < 240 || tn - this.tail < 420 || tn - this.ask < 1000 || tn - this.colon < 500 || tn - this.dash < 300 ? 'raf' : 'idle';
	}
}

// ---- 15. Kawaii (caretfx_cute.go + multi-mode expressions) ----------------------------

const KAWAII_MODES = [
	{ id: 'auto', label: 'Auto (Reactive)' },
	{ id: 'classic', label: 'Classic' },
	{ id: 'happy', label: 'Joy ^ ^' },
	{ id: 'neko', label: 'Neko :3' },
	{ id: 'love', label: 'Love ♥ ♥' },
	{ id: 'starry', label: 'Starry ✦ ✦' },
	{ id: 'shy', label: 'Teary >_<' },
	{ id: 'curious', label: 'Curious ?' },
	{ id: 'dizzy', label: 'Dizzy @ @' },
	{ id: 'cozy', label: 'Cozy ♪' },
];

const CUTE_LOVE_WORDS = new Set(['sevgi', 'seviyorum', 'kalp', 'ask', 'love', 'cute', 'kawaii', 'uwu', 'owo', 'heart', 'canim']);
const CUTE_JOY_WORDS = new Set(['harika', 'guzel', 'mutlu', 'super', 'bravo', 'yay', 'great', 'happy', 'nice', 'yasasin', 'good']);

function drawMiniHeart(ctx, x, y, r, col) {
	ctx.save();
	ctx.beginPath();
	ctx.moveTo(x, y + r * 0.72);
	ctx.bezierCurveTo(x - r * 1.15, y - r * 0.1, x - r * 0.65, y - r * 0.95, x, y - r * 0.3);
	ctx.bezierCurveTo(x + r * 0.65, y - r * 0.95, x + r * 1.15, y - r * 0.1, x, y + r * 0.72);
	ctx.closePath();
	ctx.fillStyle = cssCol(col);
	ctx.fill();
	ctx.restore();
}

function drawFourStar(ctx, x, y, s, rot, col) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.beginPath();
	ctx.moveTo(0, -s);
	ctx.quadraticCurveTo(0, 0, s, 0);
	ctx.quadraticCurveTo(0, 0, 0, s);
	ctx.quadraticCurveTo(0, 0, -s, 0);
	ctx.quadraticCurveTo(0, 0, 0, -s);
	ctx.closePath();
	ctx.fillStyle = cssCol(col);
	ctx.fill();
	ctx.restore();
}

class KawaiiCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() {
		this.t0 = 0; this.have = false; this.joy = -1e9; this.love = -1e9;
		this.shy = -1e9; this.curious = -1e9; this.dizzy = -1e9; this.nekoUntil = -1e9;
		this.starUntil = -1e9; this.blink = 1800; this.sparkle = []; this.hearts = [];
		this.tears = []; this.notes = []; this.hue = 0; this.rate = 0; this.streak = 0;
		this.word = ''; this.bigShy = false; this.lastNote = 0;
	}
	shift(dy) {
		shiftMotes(this.sparkle, dy); shiftMotes(this.hearts, dy);
		shiftMotes(this.tears, dy); shiftMotes(this.notes, dy);
		this.prev.y += dy;
	}
	tint(dark) { return hexCol(dark ? '#f472b6' : '#f9a8d4'); }
	draw(ctx, nowMs, f, k) {
		const { tn, dt, moved, dist } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h;
		const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
		this.rate += (k.wrote / dt - this.rate) * Math.min(1, dt * 3.5);

		if (!k.edited && moved && dist > h * 3.8) this.dizzy = tn;
		for (const ch of k.typed) {
			if (ch === '!') {
				this.love = tn;
				for (let i = 0; i < 3; i++) {
					this.hearts.push({ x: cx + (rnd() - 0.5) * h * 0.6, y: cy - h * 0.4, vx: (rnd() - 0.5) * 30, vy: -55 - rnd() * 25, t0: tn, life: 1100, size: h * 0.4 });
				}
			} else if (ch === '?') {
				this.curious = tn;
				this.notes.push({ ch: '?', x: cx + h * 0.35, y: cy - h * 0.45, vx: 12, vy: -42, t0: tn, life: 950, size: h * 0.5, col: hexCol('#f472b6') });
			} else if (ch === ':' || ch === ';' || ch === '~') {
				this.nekoUntil = tn + 2800;
			}
			if (ch === ' ' || ch === '\n') {
				const fw = foldText(this.word);
				if (CUTE_LOVE_WORDS.has(fw)) this.love = tn;
				else if (CUTE_JOY_WORDS.has(fw)) this.joy = tn;
				else this.joy = tn;
				this.word = '';
			} else if (isWordChar(ch) && this.word.length < 24) {
				this.word += ch;
			} else if (!isWordChar(ch)) {
				this.word = '';
			}
		}
		if (k.wrote > 0) {
			this.streak += k.wrote;
			if (this.rate > 6.2) this.starUntil = tn + 1100;
			if (this.streak >= 16) this.nekoUntil = Math.max(this.nekoUntil, tn + 2400);
		} else if (this.idle(tn) > 1.8) {
			this.streak = 0;
		}
		if (k.erased > 0) {
			this.shy = tn;
			this.bigShy = k.erased > 1;
			this.word = Array.from(this.word).slice(0, Math.max(0, Array.from(this.word).length - k.erased)).join('');
			this.tears.push({
				x: cx + (rnd() > 0.5 ? 1 : -1) * h * 0.3, y: cy,
				vx: (rnd() - 0.5) * 26, vy: -15, grav: 160, t0: tn, life: 700, size: Math.max(1.4, h * 0.08),
			});
		}

		const sub = f.subMode || 'auto';
		let mode = sub;
		if (mode === 'auto') {
			if (tn - this.dizzy < 950) mode = 'dizzy';
			else if (tn - this.shy < 1100) mode = 'shy';
			else if (tn - this.love < 1800) mode = 'love';
			else if (tn - this.curious < 1300) mode = 'curious';
			else if (tn < this.starUntil) mode = 'starry';
			else if (tn - this.joy < 750) mode = 'happy';
			else if (tn < this.nekoUntil) mode = 'neko';
			else if (this.idle(tn) > 2.6) mode = 'cozy';
			else mode = 'classic';
		}

		if (mode === 'love' && rnd() < dt * 2.4 && this.hearts.length < 10) {
			this.hearts.push({ x: cx + (rnd() - 0.5) * h * 0.7, y: cy - h * 0.35, vx: (rnd() - 0.5) * 22, vy: -42 - rnd() * 20, t0: tn, life: 1000, size: h * 0.34 });
		}
		if (mode === 'cozy' && f.rest < f.caretRestsMs && tn - this.lastNote > 1100) {
			this.lastNote = tn;
			this.notes.push({ ch: '♪', x: cx + h * 0.3, y: cy - h * 0.35, vx: 16, vy: -28, t0: tn, life: 1200, size: h * 0.42, col: hexCol('#f9a8d4') });
		}
		for (let i = 0; i < k.wrote && i < 2; i++) {
			const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
			this.sparkle.push({
				x: cx, y: cy - h * 0.3, vx: Math.cos(a) * 45, vy: Math.sin(a) * 45 - 10,
				spin: 4, t0: tn, life: 650, size: h * (0.16 + rnd() * 0.12),
				col: mode === 'starry' ? hslCol(45 + rnd() * 40, 0.95, 0.72) : hslCol(300 + rnd() * 80, 0.9, 0.75),
			});
		}

		this.sparkle = stepDrawMotes(this.sparkle, tn, dt, (m, age) => {
			drawFourStar(ctx, m.x, m.y, m.size * (1 - age * 0.6), m.ang, withAlpha(m.col, 1 - age));
		});
		this.hearts = stepDrawMotes(this.hearts, tn, dt, (m, age) => {
			glyphAt(ctx, '♥', m.x, m.y, m.size, withAlpha(hexCol('#fb7185'), 1 - age), true, 0, 1 + 0.25 * age, f.fontFamily);
		});
		this.tears = stepDrawMotes(this.tears, tn, dt, (m, age) => {
			fillRectR(ctx, m.x - m.size, m.y - m.size, 2 * m.size, 2.4 * m.size, withAlpha(hexCol('#7dd3fc'), 1 - age), m.size);
		});
		this.notes = stepDrawMotes(this.notes, tn, dt, (m, age) => {
			glyphAt(ctx, m.ch, m.x, m.y, m.size, withAlpha(m.col, 1 - age), true, Math.sin(age * 5) * 10, 1, f.fontFamily);
		});

		const pink = hexCol(f.dark ? '#f472b6' : '#f9a8d4');
		this.hue += dt * 30;
		let bodyCol = mixCol(pink, hslCol(290 + 20 * Math.sin(this.hue / 40), 0.7, 0.8), 0.25);
		if (mode === 'love') bodyCol = mixCol(bodyCol, hexCol('#fb7185'), 0.45);
		else if (mode === 'starry') bodyCol = mixCol(bodyCol, hslCol((tn * 0.12) % 360, 0.82, 0.75), 0.35);
		else if (mode === 'shy') bodyCol = mixCol(bodyCol, hexCol('#f43f5e'), 0.3);
		else if (mode === 'cozy') bodyCol = mixCol(bodyCol, hexCol('#c4b5fd'), 0.3);

		const w = Math.max(box.w * 2.4, h * 1.25);
		let hopY = 0, tilt = 0, scaleY = 1;
		if (mode === 'happy') {
			const j = tn - this.joy;
			hopY = j >= 0 && j < 420 ? -Math.sin((j / 420) * Math.PI) * h * 0.14 : Math.sin(tn * 0.008) * h * 0.04;
		} else if (mode === 'curious') {
			tilt = 0.1;
		} else if (mode === 'dizzy') {
			tilt = Math.sin(tn * 0.025) * 0.12;
		} else if (mode === 'cozy') {
			scaleY = 0.96 + 0.04 * Math.sin(tn * 0.004);
		}
		const b = {
			x: Math.max(box.x - w * 0.15, box.x + box.w / 2 - w / 2),
			y: box.y + hopY + (box.h * (1 - scaleY)),
			w, h: box.h * scaleY,
		};

		ctx.save();
		if (tilt) {
			const px = b.x + b.w / 2, py = b.y + b.h / 2;
			ctx.translate(px, py); ctx.rotate(tilt); ctx.translate(-px, -py);
		}

		if (mode === 'neko') {
			const earH = b.h * 0.28, earW = b.w * 0.26;
			const innerCol = hexCol('#fbcfe8');
			// Swaying cat tail behind left side
			ctx.save();
			const tx0 = b.x + 1, ty0 = b.y + b.h * 0.78;
			const wag = Math.sin(tn * 0.007) * h * 0.16;
			ctx.beginPath();
			ctx.moveTo(tx0, ty0);
			ctx.quadraticCurveTo(tx0 - h * 0.32, ty0 - h * 0.08 + wag, tx0 - h * 0.22, ty0 - h * 0.42 + wag * 0.6);
			ctx.lineWidth = Math.max(1.5, h * 0.1); ctx.lineCap = 'round';
			ctx.strokeStyle = cssCol(withAlpha(bodyCol, 0.9)); ctx.stroke();
			ctx.restore();
			for (const [ex, dir] of [[b.x + b.w * 0.12, 1], [b.x + b.w * 0.88, -1]]) {
				ctx.beginPath();
				ctx.moveTo(ex, b.y + 2);
				ctx.lineTo(ex + dir * earW * 0.45, b.y - earH);
				ctx.lineTo(ex + dir * earW, b.y + 2);
				ctx.closePath();
				ctx.fillStyle = cssCol(withAlpha(bodyCol, 0.82)); ctx.fill();
				ctx.lineWidth = 1.1; ctx.strokeStyle = cssCol(withAlpha(bodyCol, 0.95)); ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(ex + dir * earW * 0.18, b.y + 1);
				ctx.lineTo(ex + dir * earW * 0.45, b.y - earH * 0.55);
				ctx.lineTo(ex + dir * earW * 0.76, b.y + 1);
				ctx.closePath();
				ctx.fillStyle = cssCol(withAlpha(innerCol, 0.75)); ctx.fill();
			}
		}

		glassBody(ctx, { ...f, jelly: null }, b, bodyCol, 1, mode === 'starry' ? 1.3 : 1, false);
		const ink = faceInk(f.dark, hexCol('#3b0764'));
		let blinking = false;
		if (tn > this.blink) {
			blinking = tn - this.blink < 130;
			if (!blinking) this.blink = tn + 2200 + rnd() * 2600;
		}
		const er = Math.max(1.2, b.h * 0.11);
		const look = this.gaze();

		for (let i = 0; i < 2; i++) {
			const ox = i === 0 ? 0.28 : 0.72;
			const ex = b.x + b.w * ox + look * b.w * 0.05;
			const ey = b.y + b.h * 0.4;
			if (mode === 'happy') {
				ctx.save();
				ctx.beginPath(); ctx.moveTo(ex - er, ey + er * 0.3); ctx.lineTo(ex, ey - er * 0.7); ctx.lineTo(ex + er, ey + er * 0.3);
				ctx.lineWidth = Math.max(0.9, er * 0.5); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
				ctx.restore();
			} else if (mode === 'love') {
				const pulse = 1 + 0.12 * Math.sin(tn * 0.012);
				drawMiniHeart(ctx, ex, ey, er * 1.25 * pulse, hexCol('#fb7185'));
			} else if (mode === 'starry') {
				drawFourStar(ctx, ex, ey, er * 1.45, tn * 0.004 + i * 0.5, hexCol('#fde047'));
			} else if (mode === 'dizzy') {
				ctx.save();
				ctx.beginPath();
				const ang0 = tn * 0.014 * (i === 0 ? 1 : -1);
				for (let s = 0; s <= 18; s++) {
					const a = ang0 + (s / 18) * Math.PI * 3.2;
					const rr = (s / 18) * er * 1.2;
					const px = ex + Math.cos(a) * rr, py = ey + Math.sin(a) * rr;
					if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
				}
				ctx.lineWidth = Math.max(0.85, er * 0.35); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
				ctx.restore();
			} else if (mode === 'shy' && this.bigShy) {
				ctx.save();
				ctx.beginPath();
				if (i === 0) { ctx.moveTo(ex - er, ey - er * 0.6); ctx.lineTo(ex + er * 0.8, ey); ctx.lineTo(ex - er, ey + er * 0.6); }
				else { ctx.moveTo(ex + er, ey - er * 0.6); ctx.lineTo(ex - er * 0.8, ey); ctx.lineTo(ex + er, ey + er * 0.6); }
				ctx.lineWidth = Math.max(0.9, er * 0.48); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
				ctx.restore();
			} else if (mode === 'cozy') {
				ctx.save();
				ctx.beginPath(); ctx.moveTo(ex - er, ey); ctx.quadraticCurveTo(ex, ey + er * 0.85, ex + er, ey);
				ctx.lineWidth = Math.max(0.9, er * 0.48); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
				ctx.restore();
			} else if (blinking) {
				fillRectR(ctx, ex - er, ey, 2 * er, Math.max(0.8, er * 0.35), ink, 0);
			} else {
				const eyeScale = mode === 'curious' && i === 1 ? 1.25 : 1;
				fillRectR(ctx, ex - er * eyeScale, ey - er * 1.2 * eyeScale, 2 * er * eyeScale, 2.4 * er * eyeScale, ink, er * eyeScale);
				const gx = ex + look * er * 0.45, sx = ex - look * er * 0.5;
				fillRectR(ctx, gx - er * 0.35, ey - er * 0.95, er * 0.7, er * 0.7, withAlpha(WHITE, 0.95), er * 0.35);
				fillRectR(ctx, sx - er * 0.17, ey + er * 0.25, er * 0.35, er * 0.35, withAlpha(WHITE, 0.85), er * 0.2);
				if (mode === 'shy') {
					fillRectR(ctx, ex - er * 0.8, ey + er * 0.5, er * 1.6, er * 0.55, withAlpha(hexCol('#7dd3fc'), 0.85), er * 0.25);
				}
			}
			if (mode === 'shy') {
				ctx.save();
				ctx.beginPath();
				const by = ey - er * 1.4;
				if (i === 0) { ctx.moveTo(ex - er, by + er * 0.3); ctx.lineTo(ex + er * 0.8, by - er * 0.2); }
				else { ctx.moveTo(ex - er * 0.8, by - er * 0.2); ctx.lineTo(ex + er, by + er * 0.3); }
				ctx.lineWidth = Math.max(0.8, er * 0.35); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
				ctx.restore();
			} else if (mode === 'curious' && i === 1) {
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(ex - er * 0.8, ey - er * 1.6); ctx.quadraticCurveTo(ex, ey - er * 2.2, ex + er * 0.8, ey - er * 1.6);
				ctx.lineWidth = Math.max(0.8, er * 0.35); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
				ctx.restore();
			}
		}

		const blushA = mode === 'shy' ? 0.88 : 0.6;
		const blushW = mode === 'shy' ? er * 2.4 : er * 2;
		for (const ox of [0.14, 0.86]) {
			const x = b.x + b.w * ox;
			fillRectR(ctx, x - blushW / 2, b.y + b.h * 0.6, blushW, er * 0.9, { r: 251, g: 113, b: 133, a: blushA }, er * 0.45);
		}
		if (mode === 'neko') {
			ctx.save();
			ctx.lineWidth = Math.max(0.7, b.h * 0.03); ctx.strokeStyle = cssCol(withAlpha(ink, 0.5)); ctx.lineCap = 'round';
			for (const side of [-1, 1]) {
				const wx = side < 0 ? b.x - b.w * 0.12 : b.x + b.w * 1.12;
				const ix = side < 0 ? b.x + b.w * 0.04 : b.x + b.w * 0.96;
				for (const dy of [-0.08, 0.06]) {
					ctx.beginPath(); ctx.moveTo(ix, b.y + b.h * (0.58 + dy)); ctx.lineTo(wx, b.y + b.h * (0.54 + dy * 1.4)); ctx.stroke();
				}
			}
			ctx.restore();
		}

		const mx = b.x + b.w / 2, my = b.y + b.h * 0.66, mw = b.h * 0.07;
		ctx.save();
		ctx.lineWidth = Math.max(0.8, b.h * 0.05); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink);
		if (mode === 'curious') {
			ctx.beginPath(); ctx.arc(mx, my + mw * 0.4, mw * 0.75, 0, Math.PI * 2); ctx.stroke();
		} else if (mode === 'shy') {
			ctx.beginPath();
			ctx.moveTo(mx - 2 * mw, my + mw * 0.3);
			ctx.quadraticCurveTo(mx - mw, my - mw * 0.8, mx, my + mw * 0.3);
			ctx.quadraticCurveTo(mx + mw, my - mw * 0.8, mx + 2 * mw, my + mw * 0.3);
			ctx.stroke();
		} else {
			ctx.beginPath();
			ctx.moveTo(mx - 2 * mw, my);
			ctx.quadraticCurveTo(mx - mw, my + mw * 1.4, mx, my);
			ctx.quadraticCurveTo(mx + mw, my + mw * 1.4, mx + 2 * mw, my);
			ctx.stroke();
		}
		ctx.restore();
		ctx.restore();

		const busy = mode === 'love' || mode === 'starry' || mode === 'dizzy' || mode === 'neko' || mode === 'happy' || mode === 'shy' || mode === 'curious' || this.sparkle.length > 0 || this.hearts.length > 0 || this.tears.length > 0 || this.notes.length > 0;
		return busy ? 'raf' : idleRate(f);
	}
}

// ---- 16. UwU (caretfx_cute.go + multi-mode expressions) -------------------------------

const UWU_MODES = [
	{ id: 'auto', label: 'Auto (Reactive)' },
	{ id: 'uwu', label: 'u w u' },
	{ id: 'happy', label: '^ w ^' },
	{ id: 'owo', label: 'O w O' },
	{ id: 'turbo', label: '> w <' },
	{ id: 'love', label: '♥ w ♥' },
	{ id: 'cry', label: 'T w T' },
	{ id: 'smug', label: '¬ w ¬' },
	{ id: 'dizzy', label: 'X w X' },
	{ id: 'cozy', label: '~ w ~' },
];

class UwuCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() {
		this.t0 = 0; this.have = false; this.rate = 0; this.shock = -1e9; this.ask = -1e9;
		this.sad = -1e9; this.happy = -1e9; this.love = -1e9; this.smug = -1e9; this.dizzy = -1e9;
		this.blink = 2400; this.tildes = []; this.hearts = []; this.tears = []; this.word = '';
	}
	shift(dy) {
		shiftMotes(this.tildes, dy); shiftMotes(this.hearts, dy); shiftMotes(this.tears, dy);
		this.prev.y += dy;
	}
	tint(dark) { return hexCol(dark ? '#a78bfa' : '#c4b5fd'); }
	draw(ctx, nowMs, f, k) {
		const { tn, dt, moved, dist } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h;
		const cx = box.x + box.w / 2, cyBox = box.y + box.h / 2;
		this.rate += (k.wrote / dt - this.rate) * Math.min(1, dt * 4);

		if (!k.edited && moved && dist > h * 3.8) this.dizzy = tn;
		for (const ch of k.typed) {
			if (ch === '!') { this.shock = tn; this.ask = -1e9; }
			else if (ch === '?') { this.ask = tn; this.shock = tn; }
			else if (ch === ';' || ch === ':' || ch === '-') this.smug = tn;
			if (ch === ' ' || ch === '\n') {
				const fw = foldText(this.word);
				if (CUTE_LOVE_WORDS.has(fw)) this.love = tn;
				else this.happy = tn;
				this.word = '';
			} else if (isWordChar(ch) && this.word.length < 24) {
				this.word += ch;
			} else if (!isWordChar(ch)) {
				this.word = '';
			}
		}
		if (k.erased > 0) {
			this.sad = tn;
			this.word = Array.from(this.word).slice(0, Math.max(0, Array.from(this.word).length - k.erased)).join('');
			for (const sx of [-0.3, 0.3]) {
				this.tears.push({ x: cx + h * sx, y: cyBox + h * 0.15, vx: sx * 18, vy: 28, grav: 150, t0: tn, life: 680, size: Math.max(1.3, h * 0.08) });
			}
		}
		if (k.wrote > 0 && rnd() < 0.38) {
			this.tildes.push({ x: box.x + box.w, y: box.y + h * 0.2, vx: 25 + rnd() * 20, vy: -30 - rnd() * 20, t0: tn, life: 900, size: h * 0.45 });
		}

		const sub = f.subMode || 'auto';
		let mode = sub;
		if (mode === 'auto') {
			if (tn - this.dizzy < 900) mode = 'dizzy';
			else if (tn - this.sad < 1050) mode = 'cry';
			else if (tn - this.love < 1800) mode = 'love';
			else if (tn - this.shock < 950) mode = 'owo';
			else if (this.rate > 6.5) mode = 'turbo';
			else if (tn - this.smug < 1100) mode = 'smug';
			else if (tn - this.happy < 750) mode = 'happy';
			else if (this.idle(tn) > 2.6) mode = 'cozy';
			else mode = 'uwu';
		}

		let lilac = this.tint(f.dark);
		if (mode === 'love') lilac = mixCol(lilac, hexCol('#fb7185'), 0.48);
		else if (mode === 'cry') lilac = mixCol(lilac, hexCol('#60a5fa'), 0.42);
		else if (mode === 'turbo') lilac = mixCol(lilac, hexCol('#e879f9'), 0.45);
		else if (mode === 'happy') lilac = mixCol(lilac, hexCol('#f472b6'), 0.28);

		if (mode === 'love' && rnd() < dt * 2.2 && this.hearts.length < 10) {
			this.hearts.push({ x: cx + (rnd() - 0.5) * h * 0.7, y: box.y - h * 0.1, vx: (rnd() - 0.5) * 24, vy: -42 - rnd() * 20, t0: tn, life: 950, size: h * 0.36 });
		}

		this.tildes = stepDrawMotes(this.tildes, tn, dt, (m, age) => {
			glyphAt(ctx, '~', m.x, m.y, m.size, withAlpha(lilac, 1 - age), true, 0, 1, f.fontFamily);
		});
		this.hearts = stepDrawMotes(this.hearts, tn, dt, (m, age) => {
			glyphAt(ctx, '♥', m.x, m.y, m.size, withAlpha(hexCol('#fb7185'), 1 - age), true, 0, 1 + 0.2 * age, f.fontFamily);
		});
		this.tears = stepDrawMotes(this.tears, tn, dt, (m, age) => {
			fillRectR(ctx, m.x - m.size, m.y - m.size, 2 * m.size, 2.4 * m.size, withAlpha(hexCol('#7dd3fc'), 1 - age), m.size);
		});

		let winking = false;
		if (tn > this.blink) {
			winking = tn - this.blink < 240;
			if (!winking) this.blink = tn + 2800 + rnd() * 2600;
		}

		let left = 'u', right = 'u', mouth = 'w', hopY = 0, shakeX = 0, tilt = 0;
		if (mode === 'cry') { left = 'T'; right = 'T'; }
		else if (mode === 'owo') {
			const isAsk = sub === 'auto' && tn - this.ask < 950;
			left = isAsk ? 'o' : 'O'; right = 'O';
			if (isAsk) tilt = 0.08;
		} else if (mode === 'turbo') {
			left = '>'; right = '<';
			shakeX = Math.sin(tn * 0.07) * h * 0.04;
		} else if (mode === 'happy') {
			left = '^'; right = '^';
			const j = tn - this.happy;
			hopY = j >= 0 && j < 380 ? -Math.sin((j / 380) * Math.PI) * h * 0.13 : Math.sin(tn * 0.008) * h * 0.03;
		} else if (mode === 'smug') {
			left = '¬'; right = '¬'; mouth = 'ω';
		} else if (mode === 'dizzy') {
			left = 'X'; right = 'X';
			tilt = Math.sin(tn * 0.025) * 0.11;
		} else if (mode === 'cozy') {
			left = '~'; right = '~';
			hopY = Math.sin(tn * 0.004) * h * 0.04;
		} else if (mode === 'uwu' && winking) {
			right = '^';
		}

		const w = Math.max(box.w * 2.65, h * 1.55);
		const b = { x: Math.max(box.x - w * 0.15, box.x + box.w / 2 - w / 2) + shakeX, y: box.y + hopY, w, h: box.h };

		ctx.save();
		if (tilt) {
			const px = b.x + b.w / 2, py = b.y + b.h / 2;
			ctx.translate(px, py); ctx.rotate(tilt); ctx.translate(-px, -py);
		}
		glassBody(ctx, { ...f, jelly: null }, b, lilac, 0.95, mode === 'turbo' || mode === 'love' ? 1.2 : 0.9, false);
		const ink = faceInk(f.dark, hexCol('#2e1065'));
		const size = box.h * 0.62, cy = b.y + b.h * 0.48;
		const lx = this.gaze() * b.w * 0.05;

		if (mode === 'love') {
			const pulse = 1 + 0.12 * Math.sin(tn * 0.012);
			const hCol = hexCol('#fb7185');
			drawMiniHeart(ctx, b.x + b.w * 0.2 + lx, cy, box.h * 0.15 * pulse, hCol);
			drawMiniHeart(ctx, b.x + b.w * 0.8 + lx, cy, box.h * 0.15 * pulse, hCol);
		} else {
			glyphAt(ctx, left, b.x + b.w * 0.2 + lx, cy, size, ink, true, 0, 1, f.fontFamily);
			glyphAt(ctx, right, b.x + b.w * 0.8 + lx, cy, size, ink, true, 0, 1, f.fontFamily);
		}
		glyphAt(ctx, mouth, b.x + b.w * 0.5 + lx, cy + box.h * 0.06, size * 0.85, ink, true, 0, 1, f.fontFamily);

		if (mode === 'cry') {
			const stream = ((tn * 0.025) % 1);
			const tc = withAlpha(hexCol('#7dd3fc'), 0.85);
			for (const ox of [0.2, 0.8]) {
				const tx = b.x + b.w * ox + lx;
				fillRectR(ctx, tx - 1, cy + box.h * 0.15, 2, box.h * (0.2 + 0.15 * stream), tc, 1);
			}
		}

		for (const ox of [0.08, 0.92]) {
			const x = b.x + b.w * ox;
			fillRectR(ctx, x - b.h * 0.08, b.y + b.h * 0.66, b.h * 0.16, b.h * 0.08, { r: 244, g: 114, b: 182, a: mode === 'love' ? 0.9 : 0.7 }, b.h * 0.04);
		}
		ctx.restore();

		const busy = mode === 'love' || mode === 'cry' || mode === 'turbo' || mode === 'dizzy' || mode === 'happy' || mode === 'owo' || mode === 'smug' || this.tildes.length > 0 || this.hearts.length > 0 || this.tears.length > 0;
		return busy ? 'raf' : idleRate(f);
	}
}

// ---- 17. Echo (caretfx_repeat.go) ----------------------------------------------------

const REPEAT_COLORS = ['#f59e0b', '#ec4899', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6'].map((h) => hexCol(h));
const REPEAT_HOLD = 450, REPEAT_FADE = 3200, REPEAT_SIGN = 2600;

class EchoCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.glows = []; this.sign = { word: '', n: 0, t0: -1e9, col: REPEAT_COLORS[0] }; this.have = false; }
	shift(dy) {
		for (const gl of this.glows) for (const rc of gl.rects) rc.y += dy;
		this.prev.y += dy;
	}
	tint() { return hexCol('#94a3b8'); }
	draw(ctx, nowMs, f, k) {
		const { tn } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h;
		let ended = false;
		for (const ch of k.typed) if (!isWordChar(ch)) { ended = true; break; }
		if (ended && f.words) {
			const w = f.words.last();
			if (Array.from(w).length >= 2) {
				const { rects, total } = f.words.find(w);
				if (total >= 2) {
					let live = 0, same = -1;
					const wf = foldText(w);
					for (let i = 0; i < this.glows.length; i++) {
						if (tn - this.glows[i].t0 < REPEAT_HOLD + REPEAT_FADE) live++;
						if (foldText(this.glows[i].word) === wf) same = i;
					}
					let col = REPEAT_COLORS[0];
					if (same >= 0) { col = this.glows[same].col; this.glows.splice(same, 1); }
					else if (live > 0) col = REPEAT_COLORS[live % REPEAT_COLORS.length];
					this.glows.push({ rects, t0: tn, col, word: w });
					this.sign = { word: w, n: total, t0: tn, col };
				}
			}
		}
		const out = [];
		for (const gl of this.glows) {
			const age = tn - gl.t0;
			if (age > REPEAT_HOLD + REPEAT_FADE) continue;
			const a = age > REPEAT_HOLD ? 1 - easeSine((age - REPEAT_HOLD) / REPEAT_FADE) : 1;
			const pop = 1 + 0.12 * Math.max(0, 1 - age / 220);
			for (const r of gl.rects) {
				const cxr = r.x + r.w / 2, cyr = r.y + r.h / 2;
				const rw = r.w * pop + 4, rh = r.h * pop;
				const rr = { x: cxr - rw / 2, y: cyr - rh / 2, w: rw, h: rh };
				fillRectR(ctx, rr.x - 3, rr.y - 2, rr.w + 6, rr.h + 4, withAlpha(gl.col, 0.12 * a), 7);
				fillRectR(ctx, rr.x, rr.y, rr.w, rr.h, withAlpha(gl.col, 0.30 * a), 4);
				fillRectR(ctx, rr.x + 1, rr.y + rr.h - 2, rr.w - 2, 2, withAlpha(gl.col, 0.85 * a), 1);
			}
			out.push(gl);
		}
		this.glows = out;
		let col = hexCol('#94a3b8');
		if (tn - this.sign.t0 < REPEAT_SIGN) {
			col = mixCol(col, this.sign.col, 1 - clamp01((tn - this.sign.t0 - REPEAT_SIGN * 0.6) / (REPEAT_SIGN * 0.4)));
		}
		glassBody(ctx, f, box, col, 1, 0.9);
		this.drawSign(ctx, f, box, h, tn);
		return this.glows.length > 0 || tn - this.sign.t0 < REPEAT_SIGN + 400 ? 'raf' : 'idle';
	}
	drawSign(ctx, f, box, h, tn) {
		const age = tn - this.sign.t0;
		if (age > REPEAT_SIGN + 400) return;
		let up = 1 - Math.exp(-age / 90) * Math.cos((age / 1000) * 16);
		if (age > REPEAT_SIGN) up *= 1 - easeSine((age - REPEAT_SIGN) / 400);
		if (up <= 0.01) return;
		const a = clamp01(up);
		const ink = faceInk(f.dark, hexCol('#1f2937'));
		const label = '×' + this.sign.n;
		const chars = Array.from(this.sign.word);
		const word = chars.length > 14 ? chars.slice(0, 13).join('') + '…' : this.sign.word;
		const size = Math.max(10, h * 0.55);
		ctx.save();
		ctx.font = `560 ${size * 0.85}px ${f.fontFamily || 'system-ui, sans-serif'}`;
		const ww = ctx.measureText(word).width;
		ctx.font = `760 ${size}px ${f.fontFamily || 'system-ui, sans-serif'}`;
		const nw = ctx.measureText(label).width;
		const wh = size * 1.15;
		const bw = ww + nw + h * 0.9, bh = wh + h * 0.45;
		const sway = Math.sin((age / 1000) * 3.2) * h * 0.06 * up;
		const hx = box.x + box.w, hy = box.y + box.h * 0.45;
		const bx = box.x + box.w + h * 0.5 + sway;
		const by = box.y - bh - h * 0.55 * up + (1 - up) * h * 1.4;
		const gx = bx + h * 0.35, gy = by + bh;
		const ex = hx + (gx - hx) * 0.4 + h * 0.35, ey = hy + (gy - hy) * 0.5;
		ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(ex, ey, gx, gy);
		ctx.lineWidth = Math.max(1.5, h * 0.12); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(withAlpha(this.sign.col, a)); ctx.stroke();
		fillRectR(ctx, gx - h * 0.12, gy - h * 0.12, h * 0.24, h * 0.24, withAlpha(this.sign.col, a), h * 0.12);
		const board = { x: bx, y: by, w: bw, h: bh };
		fillRectR(ctx, gx - 0.75, by + bh - 2, 1.5, 4, withAlpha(ink, 0.6 * a), 0);
		glowAround(ctx, board, this.sign.col, 0.8 * a);
		glassFill(ctx, (c) => traceRRect(c, board.x, board.y, board.w, board.h, 6), this.sign.col, this.sign.col, board, a);
		ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
		const ty = by + bh / 2;
		ctx.font = `560 ${size * 0.85}px ${f.fontFamily || 'system-ui, sans-serif'}`;
		ctx.fillStyle = cssCol(withAlpha(ink, a));
		ctx.fillText(word, bx + h * 0.3, ty);
		ctx.font = `760 ${size}px ${f.fontFamily || 'system-ui, sans-serif'}`;
		ctx.fillStyle = cssCol(withAlpha(mixCol(this.sign.col, ink, 0.25), a));
		ctx.fillText(label, bx + h * 0.3 + ww + h * 0.3, ty - 0.5);
		ctx.restore();
	}
}

// ---- 18 & 19. Wind & Jelly Line (caretfx_letters.go) ---------------------------------

function moveLetter(ctx, f, gl, dx, dy, angleRad, scale, col, hideRanges) {
	if (hideRanges && gl.range) {
		hideRanges.push(gl.range);
	} else {
		fillRectR(ctx, gl.r.x - 0.5, gl.r.y - 0.5, gl.r.w + 1, gl.r.h + 1, f.bg, 0);
	}
	ctx.save();
	ctx.font = gl.font || `400 ${gl.size}px ${f.fontFamily || 'system-ui, sans-serif'}`;
	ctx.fillStyle = gl.color || cssCol(col);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.translate(gl.r.x + gl.r.w / 2 + dx, gl.r.y + gl.r.h / 2 + dy);
	if (angleRad) ctx.rotate(angleRad);
	if (scale !== 1) ctx.scale(scale, scale);
	ctx.fillText(gl.ch, 0, 0);
	ctx.restore();
}

class WindCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() {
		this.t0 = 0; this.energy = 0; this.dir = -1; this.wantDir = -1;
		this.gust = -1e9; this.gustX = 0; this.gustY = 0; this.lines = []; this.have = false;
	}
	shift(dy) { shiftMotes(this.lines, dy); this.gustY += dy; this.prev.y += dy; }
	tint(dark) { return hexCol(dark ? '#7dd3fc' : '#0284c7'); }
	spawnRibbon(x, y, h, d, blow, tn, colA, colB, opts = {}) {
		if (this.lines.length >= 40) return;
		const speedScale = opts.gust ? (1.05 + rnd() * 0.45) : (0.7 + 0.65 * blow);
		const spd = (145 + rnd() * 135) * speedScale;
		this.lines.push({
			kind: 'ribbon',
			x, y, startX: x,
			vx: d * spd, vy: (rnd() - 0.5) * (opts.gust ? 24 : 14),
			t0: tn, life: (opts.gust ? 480 : 380) + rnd() * 220,
			size: h * ((opts.gust ? 1.4 : 1.0) + rnd() * 1.3),
			amp: Math.max(1.2, h * (0.06 + rnd() * 0.08)),
			freq: 2.0 + rnd() * 1.1,
			phase: rnd() * Math.PI * 2,
			curl: rnd() < (opts.gust ? 0.55 : 0.36) ? (rnd() < 0.5 ? -1 : 1) : 0,
			curlR: Math.max(1.8, h * (0.14 + rnd() * 0.09)),
			thick: 1.0 + rnd() * 0.5,
			col: mixCol(colA, colB, 0.35 + rnd() * 0.65),
		});
	}
	spawnFleck(x, y, h, d, blow, tn, col) {
		if (this.lines.length >= 40) return;
		this.lines.push({
			kind: 'fleck',
			x, y,
			vx: d * (120 + rnd() * 145) * (0.7 + 0.65 * blow),
			vy: (rnd() - 0.5) * 32,
			t0: tn, life: 420 + rnd() * 280,
			size: Math.max(1.3, h * (0.09 + rnd() * 0.07)),
			phase: rnd() * Math.PI * 2,
			ang: rnd() * Math.PI * 2, spin: (rnd() - 0.5) * 10,
			col,
		});
	}
	draw(ctx, nowMs, f, k, _sched, hideRanges) {
		const was = { ...this.prev };
		const { tn, dt, moved } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h;
		const dxMove = (was.h > 0) ? (f.r.x - was.x) : 0;

		if (k.wrote > 0) {
			this.wantDir = -1;
			const boost = /[ .,!?;:]/.test(k.typed) ? 0.1 : 0;
			this.energy = Math.min(1.3, this.energy + 0.24 * Math.min(2.5, k.wrote) + boost);
		}
		if (k.erased > 0) {
			this.wantDir = (k.dir <= 0 || dxMove < -0.5) ? 1 : -1;
			this.energy = Math.min(1.2, this.energy + 0.2 * Math.min(2, k.erased));
		}
		if (k.wrote === 0 && k.erased === 0 && moved && Math.abs(dxMove) > h * 0.4 && was.h > 0 && Math.abs(f.r.y - was.y) < h * 0.6) {
			this.wantDir = dxMove > 0 ? -1 : 1;
			this.energy = Math.min(1.0, Math.max(this.energy, 0.28));
		}
		this.dir += (this.wantDir - this.dir) * (1 - Math.exp(-dt * 12));
		this.energy *= Math.exp(-dt * 2.3);
		if (this.energy < 0.002) this.energy = 0;

		const blow = clamp01(this.energy);
		const d = this.dir >= 0 ? 1 : -1;
		const baseCol = hexCol(f.dark ? '#94a3b8' : '#64748b');
		const galeCol = hexCol(f.dark ? '#38bdf8' : '#0284c7');
		const mistCol = hexCol(f.dark ? '#bae6fd' : '#0ea5e9');
		const glintCol = hexCol(f.dark ? '#e0f2fe' : '#0369a1');
		const bodyCol = mixCol(baseCol, galeCol, blow);

		if (k.typed.includes('\n') && was.h > 0) {
			this.gust = tn;
			this.gustX = was.x;
			this.gustY = was.y + was.h / 2;
			this.energy = Math.min(1.3, Math.max(this.energy, 0.9) + 0.35);
			for (let i = 0; i < 5; i++) {
				this.spawnRibbon(was.x, was.y + was.h * (0.1 + rnd() * 0.8), was.h, -1, 1, tn, galeCol, mistCol, { gust: true });
			}
			for (let i = 0; i < 4; i++) {
				this.spawnFleck(was.x - rnd() * was.h * 0.5, was.y + was.h * rnd(), was.h, -1, 1, tn, glintCol);
			}
		}

		const edgeX = box.x + box.w / 2;
		if (k.wrote > 0 || k.erased > 0) {
			this.spawnRibbon(edgeX, box.y + h * (0.12 + rnd() * 0.76), h, d, blow, tn, baseCol, galeCol);
			if (blow > 0.35 && rnd() < 0.6) {
				this.spawnFleck(edgeX, box.y + h * (0.15 + rnd() * 0.7), h, d, blow, tn, mistCol);
			}
		}
		if (blow > 0.08 && rnd() < Math.min(0.85, (1.2 + 13 * blow) * dt)) {
			this.spawnRibbon(edgeX, box.y + h * (0.08 + rnd() * 0.84), h, d, blow, tn, baseCol, galeCol);
		}
		if (blow > 0.2 && rnd() < Math.min(0.65, (0.6 + 7 * blow) * dt)) {
			this.spawnFleck(edgeX, box.y + h * (0.12 + rnd() * 0.76), h, d, blow, tn, glintCol);
		}

		const gk = (tn - this.gust) / 900;
		const gustActive = gk >= 0 && gk < 1;
		if (f.near && (blow > 0.03 || gustActive)) {
			const movedLetters = [];
			const front = gustActive ? this.gustX - gk * h * 22 : 0;
			for (const gl of f.near(36)) {
				let wake = 0, swayDir = d;
				if (d < 0 && gl.off < 0) wake = blow * Math.exp(gl.off / 11);
				else if (d > 0 && gl.off > 0) wake = blow * Math.exp(-gl.off / 9);
				let gustPush = 0;
				if (gustActive && gl.r.x <= this.gustX + h * 0.5) {
					const dist = (gl.r.x - front) / (h * 3.5);
					gustPush = 0.75 * Math.exp(-dist * dist) * (1 - gk);
					if (gustPush > wake) swayDir = -1;
				}
				const w = Math.min(1, wake + gustPush);
				if (w <= 0.015) continue;
				const wave = 0.72 + 0.28 * Math.sin(tn * 0.017 + gl.off * 0.75);
				const mag = w * wave;
				const dx = swayDir * mag * h * 0.18;
				const dy = -mag * h * 0.09;
				const ang = swayDir * mag * 0.26;
				if (Math.abs(dx) > 0.12 || Math.abs(dy) > 0.12 || Math.abs(ang) > 0.008) {
					movedLetters.push({ gl, dx, dy, ang });
				}
			}
			if (movedLetters.length > 0) {
				const textCol = f.theme?.text || (f.dark ? WHITE : BLACK);
				for (const it of movedLetters) {
					if (hideRanges && it.gl.range) hideRanges.push(it.gl.range);
					else fillRectR(ctx, it.gl.r.x - 0.5, it.gl.r.y - 0.5, it.gl.r.w + 1, it.gl.r.h + 1, f.bg, 0);
				}
				for (const it of movedLetters) {
					const gl = it.gl;
					ctx.save();
					ctx.font = gl.font || `400 ${gl.size}px ${f.fontFamily || 'system-ui, sans-serif'}`;
					ctx.fillStyle = gl.color || cssCol(textCol);
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.translate(gl.r.x + gl.r.w / 2 + it.dx, gl.r.y + gl.r.h / 2 + it.dy);
					ctx.rotate(it.ang);
					ctx.fillText(gl.ch, 0, 0);
					ctx.restore();
				}
			}
		}

		this.lines = stepDrawMotes(this.lines, tn, dt, (m, age) => {
			const env = Math.sin(age * Math.PI);
			if (m.kind === 'fleck') {
				const waveY = Math.sin(tn * 0.009 + m.phase) * 0.35;
				const sx = m.size * 1.45, sy = Math.max(0.9, m.size * 0.45);
				ctx.save();
				ctx.translate(m.x, m.y);
				ctx.rotate((m.ang || 0) * 0.35 + waveY);
				ctx.beginPath();
				ctx.moveTo(-sx, 0); ctx.lineTo(0, -sy); ctx.lineTo(sx, 0); ctx.lineTo(0, sy);
				ctx.closePath();
				ctx.fillStyle = cssCol(withAlpha(m.col, 0.72 * env));
				ctx.fill();
				ctx.restore();
				return;
			}
			const md = m.vx < 0 ? -1 : 1;
			const traveled = Math.abs(m.x - m.startX);
			const len = Math.min(m.size, traveled * 0.92 + 3);
			const pts = [];
			const N = 10;
			for (let i = 0; i <= N; i++) {
				const u = 1 - i / N; // 1 = tail, 0 = head
				const px = m.x - md * u * len;
				const py = m.y + Math.sin(u * Math.PI * m.freq - tn * 0.014 + m.phase) * m.amp * (0.35 + 0.65 * Math.sin(u * Math.PI));
				pts.push([px, py]);
			}
			if (m.curl) {
				const [x0, y0] = pts[pts.length - 1];
				const r0 = m.curlR * (0.55 + 0.45 * env);
				const cy = y0 + m.curl * r0;
				const theta0 = -m.curl * Math.PI * 0.5;
				const sweep = md * m.curl * Math.PI * 1.55;
				const C = 10;
				for (let j = 1; j <= C; j++) {
					const s = j / C;
					const th = theta0 + sweep * s;
					const rr = r0 * (1 - 0.68 * s);
					pts.push([x0 + Math.cos(th) * rr, cy + Math.sin(th) * rr]);
				}
			}
			const a = (f.dark ? 0.68 : 0.62) * env;
			ctx.save();
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();
			ctx.moveTo(pts[0][0], pts[0][1]);
			for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
			ctx.lineWidth = m.thick;
			ctx.strokeStyle = cssCol(withAlpha(m.col, a * 0.55));
			ctx.stroke();

			const mid = Math.floor(pts.length * 0.45);
			ctx.beginPath();
			ctx.moveTo(pts[mid][0], pts[mid][1]);
			for (let i = mid + 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
			ctx.lineWidth = m.thick * 1.25;
			ctx.strokeStyle = cssCol(withAlpha(mixCol(m.col, glintCol, 0.4), a * 0.9));
			ctx.stroke();
			ctx.restore();
		});

		if (blow > 0.04) {
			const wakeW = h * (0.65 + 0.9 * blow);
			const xStart = box.x + box.w / 2;
			const xEnd = xStart + this.dir * wakeW;
			const wg = ctx.createLinearGradient(xStart, 0, xEnd, 0);
			wg.addColorStop(0, cssCol(withAlpha(galeCol, 0.24 * blow)));
			wg.addColorStop(0.55, cssCol(withAlpha(mistCol, 0.08 * blow)));
			wg.addColorStop(1, cssCol(withAlpha(mistCol, 0)));
			ctx.save();
			ctx.fillStyle = wg;
			ctx.fillRect(Math.min(xStart, xEnd), box.y + h * 0.08, Math.abs(xEnd - xStart), h * 0.84);
			ctx.restore();
		}

		ctx.save();
		if (!f.jelly && blow > 0.02) {
			const px = box.x + box.w / 2, py = box.y + box.h;
			const skew = -this.dir * blow * 0.13;
			ctx.translate(px, py);
			ctx.transform(1, 0, skew, 1, 0, 0);
			ctx.translate(-px, -py);
		}
		glassBody(ctx, f, box, bodyCol, 1, 0.8 + 0.45 * blow);
		ctx.restore();

		const busy = this.energy > 0.015 || Math.abs(this.dir - this.wantDir) > 0.02 || this.lines.length > 0 || gustActive;
		return busy ? 'raf' : 'idle';
	}
}

class JellyLineCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.energy = 0; this.have = false; }
	shift(dy) { this.prev.y += dy; }
	tint() { return hexCol('#f472b6'); }
	draw(ctx, nowMs, f, k, _sched, hideRanges) {
		const { tn, dt } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h;
		this.energy = Math.min(1, this.energy + 0.35 * (k.wrote + k.erased));
		this.energy *= Math.exp(-dt * 3);
		const pink = hexCol('#f472b6');
		if (f.near && this.energy > 0.01) {
			const textCol = f.theme?.text || (f.dark ? WHITE : BLACK);
			for (const gl of f.near(25)) {
				const n = Math.abs(gl.off + 0.5);
				const fall = Math.exp(-n / 6);
				const y = Math.sin((tn / 1000) * 28 + gl.off * 0.9) * this.energy * fall * h * 0.12;
				const sq = 1 + Math.sin((tn / 1000) * 28 + gl.off * 0.9 + 1.4) * this.energy * fall * 0.08;
				moveLetter(ctx, f, gl, 0, y, 0, sq, textCol, hideRanges);
			}
		}
		glassBody(ctx, f, box, pink, 1, 0.8);
		return this.energy > 0.01 ? 'raf' : 'idle';
	}
}

// ---- 20. Neon Sign (caretfx_light.go) ------------------------------------------------

class NeonCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.off = -1e9; this.darkDur = 0; this.next = 2500; this.flash = -1e9; this.buzz = []; this.have = false; }
	shift(dy) { shiftMotes(this.buzz, dy); this.prev.y += dy; }
	tint() { return hexCol('#ff3ea5'); }
	draw(ctx, nowMs, f, k) {
		const { tn, dt } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h, pink = hexCol('#ff3ea5');
		if (k.typed.includes('\n')) this.flash = tn;
		if (tn > this.next) {
			this.off = tn; this.darkDur = 60 + rnd() * 160;
			this.next = tn + 2500 + rnd() * 5000;
			for (let i = 0; i < 3; i++) {
				this.buzz.push({ x: box.x + box.w + 2, y: box.y + rnd() * h, vx: 30 + rnd() * 20, vy: (rnd() - 0.5) * 20, t0: tn + this.darkDur, life: 350, size: h * 0.3 });
			}
		}
		let lit = 1.0;
		const el = tn - this.off;
		if (el >= 0 && el < this.darkDur) lit = 0.12 + 0.2 * Math.max(0, Math.sin(el / 9));
		let glow = 1.2 * lit;
		const fk = (tn - this.flash) / 350;
		if (fk >= 0 && fk < 1) glow += 2.5 * (1 - fk);
		const widths = [8, 5, 3], alphas = [0.08, 0.16, 0.3];
		ctx.save();
		for (let i = 0; i < 3; i++) {
			strokeRectR(ctx, box.x, box.y, box.w, box.h, withAlpha(pink, glow * alphas[i]), boxRadius(box.w, box.h), widths[i]);
		}
		ctx.restore();
		glassBody(ctx, f, box, mixCol(hexCol('#4a0e2e'), pink, lit), 1, glow);
		strokeRectR(ctx, box.x + 1, box.y + 1, Math.max(1, box.w - 2), Math.max(1, box.h - 2), withAlpha(hexCol('#ffd1ec'), lit), boxRadius(box.w, box.h), 1.2);
		this.buzz = stepDrawMotes(this.buzz, tn, dt, (m, age) => {
			if (age < 0) return;
			const s = m.size;
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + s * 0.4, m.y - s * 0.3); ctx.lineTo(m.x + s * 0.2, m.y); ctx.lineTo(m.x + s * 0.6, m.y - s * 0.3);
			ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(withAlpha(pink, 1 - age)); ctx.stroke();
			ctx.restore();
		});
		return idleRate(f);
	}
}

// ---- 21. Robot (caretfx_arcade.go) ---------------------------------------------------

class RobotCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.blink = -1e9; this.oops = -1e9; this.bang = []; this.have = false; }
	shift(dy) { shiftMotes(this.bang, dy); this.prev.y += dy; }
	tint() { return hexCol('#94a3b8'); }
	draw(ctx, nowMs, f, k) {
		const { tn, dt } = this.step(nowMs, f, k);
		const box = boxOf(f), h = box.h;
		if (k.wrote > 0) this.blink = tn;
		if (k.erased > 0) {
			if (tn - this.oops > 500) {
				this.bang.push({ x: box.x + box.w / 2, y: box.y - h * 0.6, vy: -20, t0: tn, life: 700, size: h * 0.6 });
			}
			this.oops = tn;
		}
		const steel = hexCol('#94a3b8'), ax = box.x + box.w / 2;
		fillRectR(ctx, ax - 0.6, box.y - h * 0.3, 1.2, h * 0.3, steel, 0);
		const lit = clamp01(1 - (tn - this.blink) / 220);
		const lr = Math.max(1.4, h * 0.09);
		const red = hexCol('#ef4444');
		glowAround(ctx, { x: ax - lr, y: box.y - h * 0.3 - lr, w: 2 * lr, h: 2 * lr }, red, lit * 1.5);
		fillRectR(ctx, ax - lr, box.y - h * 0.3 - lr, 2 * lr, 2 * lr, mixCol(hexCol('#7f1d1d'), red, lit), lr);
		glassBody(ctx, f, box, steel, 1, 0.8, false);
		const ink = faceInk(f.dark, hexCol('#0f172a'));
		const oops = tn - this.oops < 700;
		const er = Math.max(1, box.w * 0.13);
		for (const ox of [0.3, 0.7]) {
			const ex = box.x + box.w * ox + this.gaze() * box.w * 0.08, ey = box.y + box.h * 0.36;
			if (oops) {
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(ex - er, ey - er); ctx.lineTo(ex + er, ey + er);
				ctx.moveTo(ex + er, ey - er); ctx.lineTo(ex - er, ey + er);
				ctx.lineWidth = Math.max(0.8, er * 0.5); ctx.lineCap = 'round'; ctx.strokeStyle = cssCol(ink); ctx.stroke();
				ctx.restore();
			} else {
				fillRectR(ctx, ex - er, ey - er, 2 * er, 2 * er, hexCol('#22d3ee'), 0.5);
			}
		}
		for (let i = 0; i < 3; i++) {
			fillRectR(ctx, box.x + box.w * (0.28 + 0.18 * i), box.y + box.h * 0.68, Math.max(0.8, box.w * 0.08), box.h * 0.12, withAlpha(ink, 0.7), 0);
		}
		this.bang = stepDrawMotes(this.bang, tn, dt, (m, age) => {
			glyphAt(ctx, '!', m.x, m.y, m.size, withAlpha(red, 1 - age), true, 0, 1 + 0.3 * (1 - age), f.fontFamily);
		});
		return lit > 0 || oops || this.bang.length > 0 ? 'raf' : 'idle';
	}
}

// ---- 22. Marine (caretfx_marine.go) --------------------------------------------------

const MARINE_FACE = [
	'..rrrrrrrrr..',
	'.rRRRqqRRRRr.',
	'rRRqRRRRRqRRr',
	'rRRRRRRRRRRRr',
	'rkSLLWWWLLSkr',
	'kSLLLWWWLLLSk',
	'kKrrKSLSKrrKk',
	'kSEEEkLkEEESk',
	'kSKKkSLSkKKSk',
	'kSLLSkWkSLLSk',
	'kSLLSkLkSLLSk',
	'kkSLKkkkKLSkk',
	'kkSSSSSSSSSkk',
	'kkSSmmmmmSSkk',
	'kKSSSkkkSSSKk',
	'.KkSSSSSSSkK.',
	'.KKkkSSSkkKK.',
	'..KKKkkkKKK..',
];
const MARINE_COLS = 13, MARINE_EYE_ROW = 7, MARINE_MOUTH_ROW = 13;
const MARINE_COLORS = {
	r: hexCol('#2e1c0e'), R: hexCol('#4e3016'), q: hexCol('#704a26'),
	K: hexCol('#542c16'), k: hexCol('#7c4422'), S: hexCol('#aa6838'), L: hexCol('#ce8c54'), W: hexCol('#e8b47c'),
	E: hexCol('#ece6d6'), M: hexCol('#46160e'), m: hexCol('#5e2814'),
	B: hexCol('#343438'), b: hexCol('#56565c'),
};

class MarineCaret extends FxBase {
	constructor() { super(); this.reset(); }
	reset() { this.t0 = 0; this.rate = 0; this.fast = -1; this.ouch = -1e9; this.shot = -1e9; this.blink = 0; this.gibs = []; this.have = false; }
	shift(dy) { shiftMotes(this.gibs, dy); this.prev.y += dy; }
	tint() { return hexCol('#56565c'); }
	draw(ctx, nowMs, f, k, scheduleAfterFn) {
		const { tn, dt } = this.step(nowMs, f, k);
		const box = boxOf(f);
		this.rate += (k.wrote / dt - this.rate) * Math.min(1, dt * 4);
		if (this.rate > 6 && this.fast < 0) this.fast = tn;
		else if (this.rate < 3) this.fast = -1;
		if (k.erased > 0) {
			this.ouch = tn;
			const cell = (box.h * 1.1) / MARINE_FACE.length;
			for (const l of goneLetters(ctx, f, k)) {
				for (let i = 0; i < 6; i++) {
					const col = i % 3 === 0 ? faceInk(f.dark, hexCol('#1f2937')) : hexCol('#b3121a');
					const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4, v = 40 + rnd() * 90;
					this.gibs.push({
						x: l.x + rnd() * l.w, y: box.y + box.h / 2 + (rnd() - 0.5) * box.h * 0.5,
						vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 420, t0: tn, life: 520 + rnd() * 300,
						size: cell * (0.8 + rnd() * 0.6), col,
					});
				}
			}
			if (this.gibs.length > 240) this.gibs = this.gibs.slice(-240);
		}
		if (k.typed === ' ') this.shot = tn;
		if (tn > this.blink + 120) this.blink = tn + 2600 + rnd() * 3000;
		const ouch = clamp01(1 - (tn - this.ouch) / 450);
		const shot = clamp01(1 - (tn - this.shot) / 140);
		const god = this.fast >= 0 && tn - this.fast > 1500;
		const grin = this.rate > 4 && ouch === 0;
		const blinking = tn > this.blink && tn - this.blink < 120 && ouch === 0;
		const idleSec = this.idle(tn);
		const hurt = idleSec > 90 ? 3 : idleSec > 45 ? 2 : idleSec > 20 ? 1 : 0;

		const rows = MARINE_FACE.length + 2;
		const cell = Math.max(1, (box.h * 1.25) / rows);
		const fw = cell * (MARINE_COLS + 2), fh = cell * rows;
		let x0 = box.x - cell;
		if (f.bounds.w > fw && x0 + fw > f.bounds.x + f.bounds.w) x0 = f.bounds.x + f.bounds.w - fw;
		let y0 = box.y + box.h / 2 - fh / 2;
		if (shot > 0) {
			x0 += Math.sin(tn * 0.9) * 1.4 * shot;
			y0 += Math.cos(tn * 1.3) * 0.8 * shot;
		}
		fillRectR(ctx, x0, y0, fw, fh, MARINE_COLORS.B, cell * 0.6);
		strokeRectR(ctx, x0, y0, fw, fh, MARINE_COLORS.b, cell * 0.6, Math.max(1, cell * 0.5));
		let fx0 = x0 + cell, fy0 = y0 + cell;
		if (ouch > 0) fx0 -= this.gaze() * cell * 0.7 * ouch;
		const cellAt = (c, r, w, col) => fillRectR(ctx, fx0 + c * cell, fy0 + r * cell, w * cell, cell, col, 0);

		ctx.save();
		traceRRect(ctx, x0 + cell * 0.5, y0 + cell * 0.5, fw - cell, fh - cell, cell * 0.4);
		ctx.clip();
		for (let r = 0; r < MARINE_FACE.length; r++) {
			const row = MARINE_FACE[r];
			for (let c = 0; c < row.length; c++) {
				const col = MARINE_COLORS[row[c]];
				if (col) fillRectR(ctx, fx0 + c * cell, fy0 + r * cell, cell + 0.2, cell + 0.2, col, 0);
			}
		}
		const dark = MARINE_COLORS.K, look = this.gaze();
		for (const ex of [2, 8]) {
			if (blinking) cellAt(ex, MARINE_EYE_ROW, 3, MARINE_COLORS.k);
			else if (ouch > 0.3) { cellAt(ex, MARINE_EYE_ROW, 3, dark); cellAt(ex, MARINE_EYE_ROW - 0.5, 3, MARINE_COLORS.r); }
			else {
				let pupil = hexCol('#34425f');
				if (god) {
					pupil = hexCol('#ffd23f');
					glowAround(ctx, { x: fx0 + (ex + 1 + look) * cell, y: fy0 + MARINE_EYE_ROW * cell, w: cell, h: cell }, pupil, 0.5);
				}
				cellAt(ex + 1 + look * 0.9, MARINE_EYE_ROW, 1, pupil);
			}
		}
		if (grin || god) { cellAt(4, MARINE_EYE_ROW - 1, 1, MARINE_COLORS.r); cellAt(8, MARINE_EYE_ROW - 1, 1, MARINE_COLORS.r); }
		const mouth = MARINE_COLORS.M, teeth = hexCol('#eee6d0');
		if (ouch > 0.3) {
			cellAt(4, MARINE_MOUTH_ROW - 1, 5, mouth); cellAt(4, MARINE_MOUTH_ROW, 5, mouth); cellAt(5, MARINE_MOUTH_ROW + 1, 3, mouth);
			cellAt(5, MARINE_MOUTH_ROW - 1, 3, teeth);
		} else if (grin) {
			cellAt(2, MARINE_MOUTH_ROW, 9, mouth); cellAt(2, MARINE_MOUTH_ROW - 1, 1, mouth); cellAt(10, MARINE_MOUTH_ROW - 1, 1, mouth);
			for (let c = 3; c < 10; c++) {
				fillRectR(ctx, fx0 + c * cell + cell * 0.1, fy0 + MARINE_MOUTH_ROW * cell, cell * 0.8, cell * 0.42, teeth, 0);
				fillRectR(ctx, fx0 + c * cell + cell * 0.1, fy0 + MARINE_MOUTH_ROW * cell + cell * 0.58, cell * 0.8, cell * 0.42, teeth, 0);
			}
		}
		const blood = hexCol('#9e1018');
		if (hurt >= 1) { cellAt(9, 4, 1, blood); cellAt(9, 5, 1, blood); cellAt(10, 6, 0.6, blood); }
		if (hurt >= 2) { cellAt(1, 9, 1, blood); cellAt(1, 10, 1, blood); cellAt(2, 11, 1, withAlpha(blood, 0.8)); cellAt(6, 10, 1, blood); }
		if (hurt >= 3) { cellAt(3, 4, 2, blood); cellAt(10, 12, 1, blood); cellAt(6, 15, 1, withAlpha(blood, 0.85)); }
		if (ouch > 0) fillRectR(ctx, x0, y0, fw, fh, withAlpha(hexCol('#ff2a1f'), 0.45 * ouch), 0);
		ctx.restore();

		if (shot > 0) {
			const fx = x0 + fw + cell * 1.2, fy = y0 + fh * 0.62, r = cell * (1.6 + 1.4 * shot);
			glowAround(ctx, { x: fx - r, y: fy - r, w: 2 * r, h: 2 * r }, hexCol('#ffb000'), 1.6 * shot);
			fillRectR(ctx, fx - r, fy - cell / 2, 2 * r, cell, withAlpha(hexCol('#ffe066'), shot), 0);
			fillRectR(ctx, fx - cell / 2, fy - r * 0.7, cell, 1.4 * r, withAlpha(hexCol('#ffe066'), shot), 0);
			fillRectR(ctx, fx - cell / 2, fy - cell / 2, cell, cell, withAlpha(WHITE, shot), 0);
		}
		this.gibs = stepDrawMotes(this.gibs, tn, dt, (m, age) => {
			fillRectR(ctx, m.x - m.size / 2, m.y - m.size / 2, m.size, m.size, withAlpha(m.col, 1 - age * age), 0);
		});
		if (ouch > 0 || shot > 0 || this.gibs.length > 0 || this.rate > 0.5 || god) return 'raf';
		if (f.rest < f.caretRestsMs) scheduleAfterFn?.(800);
		return 'idle';
	}
}

// ---- 23 & 24. Ink & Lock-on (caretfx_ink.go) -----------------------------------------

const INK_RAMP = '.,:;t%SX8#@';
const INK_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const INK_HUES = [
	['#4fb57a', '#5a93d8', '#e46b68', '#8f73d9'].map((h) => hexCol(h)),
	['#a3dbb2', '#a1c5ea', '#eea0a0', '#c2afe6'].map((h) => hexCol(h)),
];
const INK_ROSE = 2;
const PIXEL_FONT = {
	'0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '### ..# ### #.. ###', '3': '### ..# .## ..# ###',
	'4': '#.# #.# ### ..# ..#', '5': '### #.. ### ..# ###', '6': '### #.. ### #.# ###', '7': '### ..# .#. .#. .#.',
	'8': '### #.# ### #.# ###', '9': '### #.# ### ..# ###', 'X': '#.# #.# .#. #.# #.#', 'Y': '#.# #.# .#. .#. .#.',
	':': '... .#. ... .#. ...',
};

function inkHue(dark, h) { return INK_HUES[dark ? 1 : 0][h & 3]; }

function drawBrackets(ctx, r, col, alpha, hatch) {
	const rx = Math.round(r.x), ry = Math.round(r.y), rw = Math.round(r.w), rh = Math.round(r.h);
	const arm = Math.max(4, Math.min(rw, rh, 40) * 0.28), k = 1;
	const l = rx, t = ry, rt = rx + rw, b = ry + rh;
	const c = withAlpha(col, alpha);
	for (const bar of [
		[l, t, arm, k], [l, t, k, arm], [rt - arm, t, arm, k], [rt - k, t, k, arm],
		[l, b - k, arm, k], [l, b - arm, k, arm], [rt - arm, b - k, arm, k], [rt - k, b - arm, k, arm],
	]) fillRectR(ctx, bar[0], bar[1], bar[2], bar[3], c, 0);
	if (!hatch || rw < 2 || rh < 2) return;
	ctx.save();
	ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
	ctx.beginPath();
	for (let x = l - rh; x < rt; x += 4) { ctx.moveTo(x, b); ctx.lineTo(x + rh, t); }
	ctx.lineWidth = 1; ctx.strokeStyle = cssCol(withAlpha(col, 0.12 * alpha)); ctx.stroke();
	ctx.restore();
}

function drawPixelTag(ctx, x, y, s, col, bg, alpha) {
	const dot = 1.5, pad = 3;
	let n = 0;
	for (const r of s) if (PIXEL_FONT[r] || r === ' ') n++;
	const w = n * 4 * dot - dot + 2 * pad, h = 5 * dot + 2 * pad;
	const left = Math.round(x), top = Math.round(y - h);
	fillRectR(ctx, left, top, w, h, withAlpha(col, alpha), 1);
	const knock = withAlpha(bg, alpha);
	let i = 0;
	for (const r of s) {
		const pat = PIXEL_FONT[r];
		if (!pat && r !== ' ') continue;
		if (pat) {
			const rows = pat.split(' ');
			for (let row = 0; row < rows.length; row++) {
				for (let c = 0; c < rows[row].length; c++) {
					if (rows[row][c] === '#') fillRectR(ctx, left + pad + (i * 4 + c) * dot, top + pad + row * dot, dot, dot, knock, 0);
				}
			}
		}
		i++;
	}
}

class InkCaret extends FxBase {
	constructor(field = true) { super(); this.field = field; this.reset(); }
	reset() {
		this.t0 = 0; this.have = false; this.cw = 0; this.ch = 0; this.gs = 0; this.oy = 0;
		this.cells = new Map(); this.ripples = []; this.fish = []; this.streaks = []; this.locks = [];
		this.hue = 0; this.combo = 0; this.inWord = false; this.lastType = 0;
	}
	shift(dy) {
		this.oy += dy;
		for (const r of this.ripples) r.y += dy;
		for (const f of this.fish) f.y += dy;
		for (const s of this.streaks) { s.ay += dy; s.by += dy; }
		for (const l of this.locks) l.r.y += dy;
		this.prev.y += dy;
	}
	tint(dark, theme) { return this.field ? inkHue(dark, this.hue) : (theme?.accent || cursorColor(dark)); }
	alive() { return this.cells.size > 0 || this.ripples.length > 0 || this.fish.length > 0 || this.streaks.length > 0 || this.locks.length > 0; }
	layGrid(size) {
		this.gs = Math.max(7, size * 0.58);
		this.cw = Math.round(this.gs * 0.64);
		this.ch = Math.round(this.gs * 1.1);
		this.cells.clear();
	}
	cellOf(x, y) { return [Math.floor(x / this.cw), Math.floor((y - this.oy) / this.ch)]; }
	centre(cx, cy) { return [(cx + 0.5) * this.cw, (cy + 0.5) * this.ch + this.oy]; }
	deposit(cx, cy, v, hue) {
		if (v <= 0.02) return;
		const key = `${cx},${cy}`;
		const c = this.cells.get(key);
		if (!c && this.cells.size >= 1600) return;
		if (!c || v > c.v) this.cells.set(key, { cx, cy, v: Math.min(v, 1), hue });
	}
	blob(x, y, r, v, hue) {
		const [cx0, cy0] = this.cellOf(x, y);
		this.deposit(cx0, cy0, v, hue);
		const [ax, ay] = this.cellOf(x - r, y - r);
		const [bx, by] = this.cellOf(x + r, y + r);
		for (let cy = ay; cy <= by; cy++) {
			for (let cx = ax; cx <= bx; cx++) {
				const [px, py] = this.centre(cx, cy);
				const k = 1 - Math.hypot(px - x, py - y) / r;
				if (k > 0) this.deposit(cx, cy, v * Math.sqrt(k), hue);
			}
		}
	}
	ring(x, y, r, w, v, hue) {
		const flat = 0.55;
		const [ax, ay] = this.cellOf(x - r - w, y - r * flat - w);
		const [bx, by] = this.cellOf(x + r + w, y + r * flat + w);
		for (let cy = ay; cy <= by; cy++) {
			for (let cx = ax; cx <= bx; cx++) {
				const [px, py] = this.centre(cx, cy);
				const k = 1 - Math.abs(Math.hypot(px - x, (py - y) / flat) - r) / w;
				if (k > 0) this.deposit(cx, cy, v * k, hue);
			}
		}
	}
	line(ax, ay, bx, by, v, hue) {
		const n = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay) / (this.cw * 0.6)));
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			const [cx, cy] = this.cellOf(ax + (bx - ax) * t, ay + (by - ay) * t);
			this.deposit(cx, cy, v, hue);
		}
	}
	splash(x, y, power, n) {
		if (!this.field) return;
		this.blob(x, y, 13 * power, 0.95, this.hue);
		if (this.ripples.length < 32) this.ripples.push({ x, y, t: 0, power, hue: this.hue });
		for (let i = 0; i < n && this.fish.length < 160; i++) {
			const a = rnd() * 2 * Math.PI, s = (110 + rnd() * 150) * power;
			const hue = rnd() > 0.6 ? Math.floor(rnd() * 4) : this.hue;
			this.fish.push({
				x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6,
				turn: (rnd() - 0.5) * 10, t: 0, life: 0.35 + rnd() * 0.35, hue,
			});
		}
	}
	tag(f, x, y) {
		return `X:${Math.max(0, Math.round(x - f.bounds.x))} Y:${Math.max(0, Math.round(y - f.bounds.y))}`;
	}
	lockOn(r, kind, tag) {
		if (kind !== 2) {
			for (const l of this.locks) {
				if (l.kind !== 2) {
					l.tag = '';
					if (l.t >= 0.7) l.t = Math.max(l.t, 1.5);
				}
			}
		}
		if (this.locks.length >= 24) this.locks.shift();
		this.locks.push({ r: { ...r }, t: 0, kind, tag: kind === 2 ? '' : tag });
	}
	lockWord(f, word, u) {
		if (!word || !f.words) return;
		const { rects } = f.words.find(word);
		let best = null;
		for (const rc of rects) {
			if (rc.y > f.r.y + f.r.h || rc.y + rc.h < f.r.y || rc.x + rc.w > f.r.x + 2) continue;
			if (!best || rc.x > best.x) best = rc;
		}
		if (!best) return;
		const pad = 4 * u;
		this.lockOn({ x: best.x - pad, y: best.y - pad / 2, w: best.w + 2 * pad, h: best.h + pad }, 0, this.tag(f, best.x, best.y));
	}
	onWrote(f, k, tn, x, mid, u) {
		const runes = Array.from(k.typed);
		const last = runes.length ? runes[runes.length - 1] : ' ';
		if (k.wrote > 3) {
			this.splash(x, mid, 1.3 * u, 6);
			this.inWord = false;
			return;
		}
		this.combo = tn - this.lastType < 260 ? this.combo + 1 : 1;
		this.lastType = tn;
		const inWord = isWordChar(last);
		if (!inWord && this.inWord && f.words) this.lockWord(f, f.words.last(), u);
		if (last === '\n') {
			this.hue = (this.hue + 1) & 3;
		} else if (/\s/.test(last)) {
			this.hue = (this.hue + 1) & 3;
			this.splash(x, mid, 0.4 * u, 0);
		} else {
			const c = Math.min(this.combo, 16);
			this.splash(x - textSize(f) * 0.25, mid, (0.65 + c * 0.035) * u, 1 + Math.floor(c / 6));
		}
		this.inWord = inWord;
	}
	dissolve(ctx, f, k, u) {
		const gone = goneLetters(ctx, f, k);
		if (!gone.length) return;
		const right = f.bounds.x + f.bounds.w, mid = f.r.y + f.r.h * 0.55;
		let x0 = Infinity, x1 = -Infinity;
		for (let i = 0; i < gone.length; i++) {
			const l = gone[i];
			if (l.x > right) continue;
			x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x + l.w);
			if (!this.field) continue;
			const cx = l.x + l.w / 2;
			this.blob(cx, mid, 9 * u, 1, INK_ROSE);
			if (i < 40 && this.fish.length < 160) {
				const hue = rnd() > 0.7 ? 3 : INK_ROSE;
				this.fish.push({
					x: cx, y: mid, vx: (rnd() - 0.5) * 160 * u, vy: (30 + rnd() * 100) * u,
					turn: (rnd() - 0.5) * 8, t: 0, life: 0.3 + rnd() * 0.3, hue,
				});
			}
		}
		if (x1 <= x0) return;
		const pad = 4 * u;
		this.lockOn({ x: x0 - pad, y: f.r.y, w: x1 - x0 + 2 * pad, h: f.r.h }, 2, '');
	}
	stepField(dt, u) {
		const fade = Math.exp(-dt * 3.4);
		for (const [key, c] of this.cells) {
			c.v *= fade;
			if (c.v < 0.025) this.cells.delete(key);
		}
		const rippleLife = 0.42;
		const nextRipples = [];
		for (const r of this.ripples) {
			r.t += dt;
			if (r.t > rippleLife) continue;
			const k = r.t / rippleLife;
			this.ring(r.x, r.y, 5 * u + (1 - (1 - k) * (1 - k)) * 60 * r.power, 8 * u, 0.85 * (1 - k), r.hue);
			nextRipples.push(r);
		}
		this.ripples = nextRipples;
		const nextFish = [];
		for (const s of this.fish) {
			s.t += dt;
			if (s.t > s.life) continue;
			const ox = s.x, oy = s.y;
			const sin = Math.sin(s.turn * dt), cos = Math.cos(s.turn * dt);
			const nvx = s.vx * cos - s.vy * sin, nvy = s.vx * sin + s.vy * cos;
			const drag = Math.exp(-2.2 * dt);
			s.vx = nvx * drag; s.vy = nvy * drag;
			s.x += s.vx * dt; s.y += s.vy * dt;
			this.line(ox, oy, s.x, s.y, 0.9 * (1 - s.t / s.life), s.hue);
			nextFish.push(s);
		}
		this.fish = nextFish;
		const streakLife = 0.22;
		const nextStreaks = [];
		for (const s of this.streaks) {
			const k0 = clamp01(s.t / streakLife);
			s.t += dt;
			const k1 = clamp01(s.t / streakLife);
			this.line(s.ax + (s.bx - s.ax) * k0, s.ay + (s.by - s.ay) * k0, s.ax + (s.bx - s.ax) * k1, s.ay + (s.by - s.ay) * k1, 1, s.hue);
			if (s.t <= streakLife + 0.02) nextStreaks.push(s);
		}
		this.streaks = nextStreaks;
	}
	drawField(ctx, f) {
		if (!this.cells.size) return;
		const n = INK_RAMP.length;
		ctx.save();
		ctx.font = `700 ${Math.round(this.gs)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		for (const c of this.cells.values()) {
			const q = c.v * n;
			let i = Math.floor(q);
			if (q - i > (INK_BAYER[(c.cy & 3) * 4 + (c.cx & 3)] + 0.5) / 16) i++;
			if (i === 0) continue;
			const ch = INK_RAMP[Math.min(i, n) - 1];
			const x = (c.cx + 0.5) * this.cw, y = (c.cy + 0.5) * this.ch + this.oy;
			ctx.fillStyle = cssCol(withAlpha(inkHue(f.dark, c.hue), 0.3 + 0.45 * c.v));
			ctx.fillText(ch, x, y);
		}
		ctx.restore();
	}
	draw(ctx, nowMs, f, k) {
		const was = { ...this.prev }, had = this.have;
		const { tn, dt: rawDt } = this.step(nowMs, f, k);
		const dt = Math.min(rawDt, 0.05);
		const h = f.r.h, u = h / 34;
		if (this.cw === 0 || this.cells.size === 0) this.layGrid(textSize(f));
		const mid = f.r.y + h * 0.55, x = f.r.x;

		if (k.erased > 0 && k.gone) {
			this.dissolve(ctx, f, k, u);
		} else if (k.wrote > 0) {
			this.onWrote(f, k, tn, x, mid, u);
		} else if (had && !k.edited) {
			const dx = f.r.x - was.x, dy = f.r.y - was.y;
			if (Math.abs(dy) > h * 1.5 || Math.abs(dx) > 130 * u) {
				if (this.field && this.streaks.length < 8) {
					this.streaks.push({ ax: was.x, ay: was.y + was.h / 2, bx: x, by: f.r.y + h / 2, t: 0, hue: this.hue });
				}
				this.splash(x, f.r.y + h / 2, u, 4);
				const pad = 11 * u;
				this.lockOn({ x: f.r.x - pad, y: f.r.y - pad / 2, w: 2 * pad, h: f.r.h + pad }, 1, this.tag(f, f.r.x, f.r.y));
			}
		}

		const nextLocks = [];
		for (const l of this.locks) {
			l.t += dt;
			if ((l.kind === 2 && l.t < 0.7) || (l.kind !== 2 && l.t < 2)) nextLocks.push(l);
		}
		this.locks = nextLocks;
		if (this.field) {
			this.stepField(dt, u);
			this.drawField(ctx, f);
		}
		const lockingCol = hexCol(f.dark ? '#ff5c50' : '#ff4034');
		const settledCol = hexCol(f.dark ? '#ecebe6' : '#1c1c1e');
		for (const l of this.locks) {
			const lk = clamp01(l.t / 0.7), locking = lk < 1;
			let col = lockingCol, alpha = 1, hatch = locking, s = 1;
			if (l.kind === 2) { s = 1 - 0.85 * lk * lk; alpha = 1 - lk; hatch = true; }
			else if (locking) { s = 1 + 0.8 * (1 - lk) * (1 - lk); }
			else { col = settledCol; alpha = 0.6 * (1 - clamp01((l.t - 1.5) / 0.5)); }
			if (alpha <= 0.01) continue;
			const cx = l.r.x + l.r.w / 2, cy = l.r.y + l.r.h / 2;
			const hw = (l.r.w / 2) * s, hh = (l.r.h / 2) * s;
			const r = { x: cx - hw, y: cy - hh, w: 2 * hw, h: 2 * hh };
			drawBrackets(ctx, r, col, alpha, hatch);
			if (l.tag) drawPixelTag(ctx, r.x, r.y - 2, l.tag, col, f.bg, alpha);
		}
		const col = this.field ? inkHue(f.dark, this.hue) : (f.theme?.accent || cursorColor(f.dark));
		styledDraw(ctx, f, boxOf(f), () => fillRectR(ctx, f.r.x - 1, f.r.y, 2, f.r.h, col, 1));
		return this.alive() ? 'raf' : 'idle';
	}
}

// ---- Registry of all 24 Ryudit Carets ------------------------------------------------

const CARET_SPECS = [
	{ name: 'Slime', tag: 'SDF Jelly', make: () => new SlimeCaret() },
	{ name: 'Mizan', tag: 'WPM Stat', make: () => new MizanCaret() },
	{ name: 'line', label: 'Line', tag: 'Plain', make: () => new LineCaret() },
	{ name: 'CRT', tag: 'Glitch', make: () => new CRTCaret() },
	{ name: 'Back-man', tag: 'Eater', make: () => new BackmanCaret() },
	{ name: 'portal', label: 'Portal', tag: 'Drop', make: () => new PortalCaret() },
	{ name: 'speedDemon', label: 'Speed Demon', tag: 'Heat', make: () => new SpeedDemonCaret() },
	{ name: 'torch', label: 'Torch', tag: 'Spotlight', make: () => new TorchCaret() },
	{ name: 'Mario', tag: 'Coins', make: () => new MarioCaret() },
	{ name: 'Tamagotchi', tag: 'Pet', make: () => new TamagotchiCaret() },
	{ name: 'plant', label: 'Plant', tag: 'Bloom', make: () => new PlantCaret() },
	{ name: 'firefly', label: 'Firefly', tag: 'Orbit', make: () => new FireflyCaret() },
	{ name: 'moodFace', label: 'Mood Face', tag: 'Words', make: () => new MoodFaceCaret() },
	{ name: 'punctuation', label: 'Punctuation', tag: 'Marks', make: () => new PunctCaret() },
	{ name: 'Kawaii', tag: 'Cute', make: () => new KawaiiCaret() },
	{ name: 'UwU', tag: 'Face', make: () => new UwuCaret() },
	{ name: 'echo', label: 'Echo', tag: 'Repeats', make: () => new EchoCaret() },
	{ name: 'wind', label: 'Wind', tag: 'Gust', make: () => new WindCaret() },
	{ name: 'jellyLine', label: 'Jelly Line', tag: 'Wave', make: () => new JellyLineCaret() },
	{ name: 'neonSign', label: 'Neon Sign', tag: 'Flicker', make: () => new NeonCaret() },
	{ name: 'Robot', tag: 'Bot', make: () => new RobotCaret() },
	{ name: 'Marine', tag: 'Doom', make: () => new MarineCaret() },
	{ name: 'ink', label: 'Ink', tag: 'ASCII', make: () => new InkCaret(true) },
	{ name: 'lockOn', label: 'Lock-on', tag: 'Brackets', make: () => new InkCaret(false) },
];

function findCaretSpec(name) {
	const target = String(name || '').toLowerCase();
	return CARET_SPECS.find((s) => s.name.toLowerCase() === target || (s.label && s.label.toLowerCase() === target)) || CARET_SPECS[0];
}

// ---- Thymer DOM Text, Style & Color Reading ------------------------------------------

const lineDivOf = (row) => (row instanceof HTMLElement ? row.querySelector(':scope > .line-div, :scope > .cfx2-line') || row.querySelector('.line-div, .cfx2-line') : null);
const rowByGuid = (guid) => (guid ? document.querySelector(`.listitem[data-guid="${CSS.escape(guid)}"], .cfx2-row[data-guid="${CSS.escape(guid)}"]`) : null);

class LineText {
	constructor(row) {
		this.row = row;
		this.guid = row.getAttribute('data-guid') || '';
		this.el = lineDivOf(row);
		this.nodes = [];
		this.starts = [];
		let text = '';
		if (this.el) {
			const walk = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
			for (let n = walk.nextNode(); n; n = walk.nextNode()) {
				this.nodes.push(n);
				this.starts.push(text.length);
				text += n.data;
			}
		}
		this.text = text;
	}
	indexOf(node, off) {
		if (!this.el || !node || !this.el.contains(node)) return -1;
		try {
			const r = document.createRange();
			r.setStart(this.el, 0);
			r.setEnd(node, off);
			return r.toString().length;
		} catch (e) { return -1; }
	}
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
	rects(i, j) {
		const out = [];
		for (let k = 0; k < this.nodes.length; k++) {
			const node = this.nodes[k], from = this.starts[k];
			const a = Math.max(i, from), b = Math.min(j, from + node.data.length);
			if (b <= a) continue;
			const r = document.createRange();
			r.setStart(node, a - from);
			r.setEnd(node, b - from);
			for (const c of r.getClientRects()) {
				if (c.width > 0.5 && c.height > 0.5) out.push({ x: c.left, y: c.top, w: c.width, h: c.height });
			}
		}
		return out;
	}
	charRange(i, len = 1) {
		let k = this.nodes.length - 1;
		while (k > 0 && this.starts[k] > i) k--;
		if (k < 0) return null;
		const node = this.nodes[k], off = i - this.starts[k];
		if (off < 0 || off + len > node.data.length) return null;
		const r = document.createRange();
		r.setStart(node, off);
		r.setEnd(node, off + len);
		return r;
	}
	charRect(i, n = 1) { return this.rects(i, i + n)[0] || null; }
	styleHost(i) {
		let k = this.nodes.length - 1;
		while (k > 0 && this.starts[k] > i) k--;
		return k >= 0 ? this.nodes[k].parentElement : this.el;
	}
}

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

let _pxCtx = null;
const pxCtx = () => _pxCtx || (_pxCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));

function parseCssCol(str, fallback = WHITE) {
	if (!str || str === 'transparent') return null;
	const c = pxCtx();
	c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
	c.clearRect(0, 0, 1, 1);
	c.fillStyle = str;
	c.fillRect(0, 0, 1, 1);
	const px = c.getImageData(0, 0, 1, 1).data;
	c.restore();
	if (px[3] === 0) return null;
	return { r: px[0], g: px[1], b: px[2], a: px[3] / 255 };
}

function resolveBgCol(el, dark) {
	for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
		const bg = parseCssCol(getComputedStyle(n).backgroundColor);
		if (bg && bg.a >= 0.96) return { r: bg.r, g: bg.g, b: bg.b, a: 1 };
	}
	return dark ? hexCol('#19191b') : hexCol('#ffffff');
}

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

function rowForCaret(caretEl, r) {
	const midY = (r.top + r.bottom) / 2;
	const inRow = (row) => {
		if (!row) return false;
		const b = row.getBoundingClientRect();
		return b.height > 0 && midY >= b.top - 2 && midY <= b.bottom + 2;
	};
	const host = caretEl.closest(LISTITEM_SEL);
	if (inRow(host)) return host;
	for (const x of [r.left + 4, r.left - 4, r.left + 24]) {
		const hit = document.elementFromPoint(x, midY);
		const row = hit && hit.closest && hit.closest(LISTITEM_SEL);
		if (inRow(row)) return row;
	}
	const ed = caretEl.closest('listview-editor, .cfx2-note') || caretEl.parentElement;
	if (ed) {
		for (const row of ed.querySelectorAll(LISTITEM_SEL)) if (inRow(row)) return row;
	}
	return null;
}

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
			let anchor = rects.find((r) => midY >= r.top - 1 && midY <= r.bottom + 1);
			if (!anchor) anchor = rects.reduce((a, r) => (Math.abs((r.top + r.bottom) / 2 - midY) < Math.abs((a.top + a.bottom) / 2 - midY) ? r : a));
			let top = anchor.top, bottom = anchor.bottom;
			for (const r of rects) if (Math.abs(r.top - anchor.top) <= 1.25) { top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); }
			if (bottom - top >= 1) return { top, height: bottom - top };
		}
	} catch (e) { /* fall through */ }
	const cs = getComputedStyle(line);
	let lh = parseFloat(cs.lineHeight);
	if (!Number.isFinite(lh) || lh <= 0) { const fs = parseFloat(cs.fontSize); lh = Number.isFinite(fs) && fs > 0 ? fs * 1.45 : 20; }
	return { top: lineBox.top + Math.max(0, (lineBox.height - lh) / 2), height: lh };
}

function caretStyleAt(line, idx) {
	let strike = false;
	if (line && line.el) {
		let node = line.styleHost(Math.max(0, Math.min(idx, Math.max(0, line.text.length - 1))));
		if (!node && idx > 0) node = line.styleHost(idx - 1);
		for (let n = node; n && n !== line.row; n = n.parentElement) {
			if (n.tagName === 'S' || n.tagName === 'DEL' || n.tagName === 'STRIKE') { strike = true; break; }
			const td = getComputedStyle(n).textDecorationLine || '';
			if (td.includes('line-through')) { strike = true; break; }
		}
	}
	let bracket = '';
	if (line && idx > 0) {
		const pairs = { ')': '(', ']': '[', '}': '{' };
		const open = [];
		const prefix = line.text.slice(0, idx);
		for (const r of prefix) {
			if (r === '(' || r === '[' || r === '{') open.push(r);
			else if (r === ')' || r === ']' || r === '}') {
				if (open.length && open[open.length - 1] === pairs[r]) open.pop();
			}
		}
		if (open.length) bracket = open[open.length - 1];
	}
	return { strike, bracket };
}

function collectNearLetters(line, idx, caretY, caretH, n) {
	if (!line || !line.el) return [];
	const text = line.text;
	const out = [];
	const styleCache = new Map();
	// Map utf-16 offsets cleanly around idx
	let start = idx;
	for (let step = 0; step < n && start > 0; step++) {
		start--;
		const code = text.charCodeAt(start);
		if (code >= 0xdc00 && code <= 0xdfff && start > 0) start--;
	}
	let end = idx;
	for (let step = 0; step < n && end < text.length; step++) {
		const code = text.charCodeAt(end);
		end += code >= 0xd800 && code <= 0xdbff ? 2 : 1;
	}
	// Count visual character offset relative to idx
	const charOffsets = [];
	let pos = start, rel = 0;
	let beforeCount = 0;
	for (let p = start; p < idx;) {
		const c = text.charCodeAt(p);
		p += c >= 0xd800 && c <= 0xdbff ? 2 : 1;
		beforeCount++;
	}
	rel = -beforeCount;
	while (pos < end) {
		const code = text.charCodeAt(pos);
		const len = code >= 0xd800 && code <= 0xdbff ? 2 : 1;
		const ch = text.slice(pos, pos + len);
		if (ch !== ' ' && ch !== '\t' && ch !== '\n') {
			const r = line.charRect(pos, len);
			if (r && Math.abs((r.y + r.h / 2) - (caretY + caretH / 2)) <= caretH * 0.7) {
				const host = line.styleHost(pos);
				let st = styleCache.get(host);
				if (!st) {
					const cs = getComputedStyle(host);
					st = { font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, color: cs.color };
					styleCache.set(host, st);
				}
				charOffsets.push({
					ch, r, off: rel, size: r.h / 1.25,
					font: st.font, color: st.color, range: line.charRange(pos, len),
				});
			}
		}
		pos += len;
		rel++;
	}
	return charOffsets;
}

function makeCaretWords(line, idx, scopeRoot, clip) {
	return {
		last() {
			if (!line) return '';
			const prefix = Array.from(line.text.slice(Math.max(0, idx - 80), idx));
			let i = prefix.length;
			while (i > 0 && !isWordChar(prefix[i - 1])) i--;
			let j = i;
			while (j > 0 && isWordChar(prefix[j - 1])) j--;
			return prefix.slice(j, i).join('');
		},
		find(word) {
			const wChars = foldChars(word);
			if (!wChars.length || !scopeRoot) return { rects: [], total: 0 };
			const rows = scopeRoot.querySelectorAll(LISTITEM_SEL);
			let total = 0;
			const rects = [];
			const wLen = wChars.length;
			for (const row of rows) {
				const lt = new LineText(row);
				if (!lt.text) continue;
				const rowChars = foldChars(lt.text);
				const hits = wordAt(rowChars, wChars);
				if (!hits.length) continue;
				total += hits.length;
				const rb = row.getBoundingClientRect();
				if (clip && (rb.bottom < clip.y - 40 || rb.top > clip.y + clip.h + 40)) continue;
				// Convert code-point indices to UTF-16 offsets
				const u16Map = [];
				let u = 0;
				for (const ch of lt.text) { u16Map.push(u); u += ch.length; }
				u16Map.push(u);
				for (const at of hits) {
					const u0 = u16Map[at] ?? 0, u1 = u16Map[at + wLen] ?? u;
					for (const rc of lt.rects(u0, u1)) rects.push(rc);
				}
			}
			return { rects, total };
		},
	};
}

// ---- Storage Helpers -----------------------------------------------------------------

function loadChoices() {
	try { return JSON.parse(localStorage.getItem(CFX2_CHOICES_KEY) || '{}') || {}; } catch (e) { return {}; }
}

function saveChoices(patch) {
	try { localStorage.setItem(CFX2_CHOICES_KEY, JSON.stringify({ ...loadChoices(), ...patch })); } catch (e) { /* ignore */ }
}

// ---- Live Tile Demo Loop (caretextras.go caretMock) ----------------------------------

const DEMO_SEQ = ['M', 'e', 'r', 'h', 'a', 'b', 'a', '!', ' ', 'h', 'i', ' ', 'h', 'i', ' '];
const DEMO_LOOP_S = 6.5;

function demoStepState(tSec) {
	// 0..2.1s: type DEMO_SEQ progressively; 2.1..3.2s: hold; 3.2..4.1s: backspace 3 chars; 4.1..5.4s: hold; 5.4..6.5s: clear
	const full = DEMO_SEQ.length;
	if (tSec < 2.1) return Math.min(full, Math.floor((tSec / 2.1) * full));
	if (tSec < 3.2) return full;
	if (tSec < 4.1) return full - Math.min(4, Math.floor(((tSec - 3.2) / 0.9) * 4));
	if (tSec < 5.4) return full - 4;
	return 0;
}

class CaretDemoTile {
	constructor(spec, canvas) {
		this.spec = spec;
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');
		this.caret = spec.make();
		this.jelly = new SmearBody();
		this.gaze = new GazeTracker();
		this.t0 = 0;
		this.n = 0;
	}
	render(nowMs, dark, theme, jellyOn, tune = null) {
		if (!this.t0) this.t0 = nowMs;
		const dpr = window.devicePixelRatio || 1;
		const cwCss = this.canvas.clientWidth || 140;
		const chCss = this.canvas.clientHeight || 76;
		const tw = Math.round(cwCss * dpr), th = Math.round(chCss * dpr);
		if (this.canvas.width !== tw || this.canvas.height !== th) {
			this.canvas.width = tw; this.canvas.height = th;
		}
		const ctx = this.ctx;
		const bg = dark ? hexCol('#24252a') : hexCol('#e9eaee');
		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = cssCol(bg);
		ctx.fillRect(0, 0, cwCss, chCss);

		const tSec = ((nowMs - this.t0) / 1000) % DEMO_LOOP_S;
		const n = demoStepState(tSec);
		const k = { wrote: 0, edited: false, erased: 0, dir: 0, gone: '', typed: '', style: { strike: false, bracket: '' } };
		const grew = n - this.n;
		if (grew > 0 && grew <= 3) {
			k.wrote = grew; k.typed = DEMO_SEQ.slice(this.n, n).join(''); k.edited = true;
		} else if (grew < 0 && grew >= -4) {
			k.erased = -grew; k.dir = -1; k.gone = DEMO_SEQ.slice(n, this.n).join(''); k.edited = true;
		} else if (grew !== 0) {
			k.edited = true;
		}
		this.n = n;

		const fontSize = 13;
		const font = `560 ${fontSize}px system-ui, sans-serif`;
		ctx.font = font;
		const shown = DEMO_SEQ.slice(0, n).join('');
		const pw = shown ? ctx.measureText(shown).width : 0;
		const lh = fontSize * 1.25;
		const x0 = 12, y0 = Math.round((chCss - lh) / 2) + 6;
		const textCol = theme.text;
		if (shown) {
			ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
			ctx.fillStyle = cssCol(textCol);
			ctx.fillText(shown, x0, y0 + lh / 2);
		}
		const nextCh = n < DEMO_SEQ.length ? DEMO_SEQ[n] : 'a';
		const charW = Math.max(7, ctx.measureText(nextCh === ' ' ? 'a' : nextCh).width);
		const r = { x: x0 + pw, y: y0, w: 1, h: lh };
		const bounds = { x: 0, y: 0, w: cwCss, h: chCss };

		const near = (lim) => {
			const out = [];
			let ox = x0;
			for (let i = Math.max(0, n - lim); i < n; i++) {
				const ch = DEMO_SEQ[i];
				const w = ctx.measureText(ch).width;
				if (ch.trim()) out.push({ ch, r: { x: ox, y: y0, w, h: lh }, off: i - n, size: lh / 1.25, font, color: cssCol(textCol) });
				ox += w;
			}
			return out;
		};
		const words = {
			last() {
				const sub = shown.replace(/[^\p{L}\p{N}]+$/u, '');
				const m = sub.match(/[\p{L}\p{N}]+$/u);
				return m ? m[0] : '';
			},
			find(word) {
				const wChars = foldChars(word);
				const hits = wordAt(foldChars(shown), wChars);
				const rects = [];
				for (const at of hits) {
					const pre = shown.slice(0, at), seg = shown.slice(at, at + wChars.length);
					const rx = x0 + ctx.measureText(pre).width, rw = ctx.measureText(seg).width;
					rects.push({ x: rx, y: y0, w: rw, h: lh });
				}
				return { rects, total: hits.length };
			},
		};

		const f = {
			r, cw: charW, dark, bg, bounds,
			theme, fontFamily: 'system-ui, sans-serif',
			gaze: this.gaze.step(nowMs, k),
			style: { strike: false, bracket: '' },
			jelly: null, near, words, rest: 0, caretRestsMs: 98000,
		};
		if (jellyOn && this.spec.name !== 'Slime' && this.spec.name !== 'line') {
			f.jelly = this.jelly.body(nowMs, f);
		}
		ctx.beginPath(); ctx.rect(0, 0, cwCss, chCss); ctx.clip();
		withTune(tune, () => this.caret.draw(ctx, nowMs, f, k, null, null));
		ctx.restore();
	}
}

// ---- Physical Confetti System (3D aerodynamic paper, streamers & foil sparks) -------

const CONFETTI_COLORS = ['#ff4d6d', '#ffbe0b', '#06d6a0', '#3a86ff', '#b57bff', '#ff70a6', '#ffd166', '#4cc9f0'];
const CONFETTI_MAX_PIECES = 240;

class ConfettiSystem {
	constructor() {
		this.pieces = [];
		this.rings = [];
		this.pops = [];
		this.last = 0;
	}
	clear() {
		this.pieces = [];
		this.rings = [];
		this.pops = [];
		this.last = 0;
	}
	active() {
		return this.pieces.length > 0 || this.rings.length > 0 || this.pops.length > 0;
	}
	shift(dy) {
		if (!dy) return;
		for (const q of this.pieces) q.y += dy;
		for (const r of this.rings) r.y += dy;
		for (const p of this.pops) p.y += dy;
	}
	pushWake(cx, cy, dx, dy) {
		if (!this.pieces.length) return;
		const distMove = Math.hypot(dx, dy);
		if (distMove < 12) return;
		for (const q of this.pieces) {
			const d = Math.hypot(q.x - cx, q.y - cy);
			if (d < 95) {
				const f = (1 - d / 95) * 0.55;
				q.vx += clamp(dx * 1.1, -180, 180) * f;
				q.vy -= (18 + Math.min(45, distMove * 0.4)) * f;
				q.vTilt += (rnd() - 0.5) * 5 * f;
			}
		}
	}
	burst(x, y, h, nowMs, accentCol) {
		const u = clamp((h || 18) / 18, 0.75, 1.9);
		const palette = accentCol ? [accentCol, ...CONFETTI_COLORS.map((c) => hexCol(c))] : CONFETTI_COLORS.map((c) => hexCol(c));
		this.rings.push({ x, y, t0: nowMs, dur: 460, u, col: accentCol || hexCol('#3a86ff') });

		// Snappy radial micro-pops right at the checkbox
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * Math.PI * 2 + rnd() * 0.35;
			const sp = (95 + rnd() * 75) * u;
			const col = palette[i % palette.length];
			this.pops.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: (1.4 + rnd() * 1.1) * u, t0: nowMs, life: 280 + rnd() * 120, col });
		}

		// Physical paper strips, curly streamers & foil stars
		const count = 48;
		for (let i = 0; i < count && this.pieces.length < CONFETTI_MAX_PIECES; i++) {
			const sideSplash = i % 7 === 0;
			const ang = sideSplash
				? -Math.PI / 2 + (rnd() > 0.5 ? 1 : -1) * (1.05 + rnd() * 0.75)
				: -Math.PI / 2 + (rnd() - 0.5) * 2.15;
			const speed = (sideSplash ? 120 + rnd() * 190 : 210 + rnd() * 410) * u;
			const rKind = rnd();
			const kind = rKind < 0.60 ? 'rect' : rKind < 0.84 ? 'streamer' : 'spark';
			const front = palette[Math.floor(rnd() * palette.length)];
			const back = mixCol(front, BLACK, 0.34);
			this.pieces.push({
				kind,
				x: x + (rnd() - 0.5) * 6 * u,
				y: y + (rnd() - 0.5) * 4 * u,
				vx: Math.cos(ang) * speed,
				vy: Math.sin(ang) * speed - 25 * u,
				w: (kind === 'streamer' ? 2.4 + rnd() * 1.1 : 5.5 + rnd() * 5) * u,
				h: (kind === 'streamer' ? 11 + rnd() * 7 : 2.8 + rnd() * 2.4) * u,
				size: (2.2 + rnd() * 1.6) * u,
				rot: rnd() * Math.PI * 2,
				tilt: rnd() * Math.PI * 2,
				bank: rnd() * Math.PI * 2,
				vRot: (rnd() - 0.5) * 12,
				vTilt: (rnd() > 0.5 ? 1 : -1) * (6 + rnd() * 11),
				vBank: (rnd() - 0.5) * 8,
				mass: kind === 'spark' ? 1.15 : kind === 'streamer' ? 0.82 : 1.0,
				sway: rnd() * Math.PI * 2,
				u,
				front,
				back,
				t0: nowMs,
				life: 1650 + rnd() * 1150,
			});
		}
	}
	draw(ctx, nowMs, bounds) {
		if (!this.active()) { this.last = 0; return 'idle'; }
		const dt = this.last ? Math.min(0.05, Math.max(0.001, (nowMs - this.last) / 1000)) : 0.016;
		this.last = nowMs;

		ctx.save();
		if (bounds) {
			ctx.beginPath();
			ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
			ctx.clip();
		}

		// 1. Expanding checkbox pulse rings
		const nextRings = [];
		for (const r of this.rings) {
			const f = (nowMs - r.t0) / r.dur;
			if (f >= 1) continue;
			nextRings.push(r);
			const e = easeOut(f);
			const a = (1 - f) * 0.85;
			ctx.save();
			ctx.beginPath();
			ctx.arc(r.x, r.y, (5 + 26 * e) * r.u, 0, Math.PI * 2);
			ctx.lineWidth = Math.max(0.75, (1 - f) * 2.8 * r.u);
			ctx.strokeStyle = cssCol(withAlpha(r.col, a));
			ctx.stroke();

			if (f < 0.7) {
				const f2 = f / 0.7;
				ctx.beginPath();
				ctx.arc(r.x, r.y, (3 + 14 * easeOut(f2)) * r.u, 0, Math.PI * 2);
				ctx.lineWidth = Math.max(0.5, (1 - f2) * 1.4 * r.u);
				ctx.strokeStyle = cssCol(withAlpha(WHITE, (1 - f2) * 0.65));
				ctx.stroke();
			}
			ctx.restore();
		}
		this.rings = nextRings;

		// 2. Radial pop sparks
		const nextPops = [];
		for (const p of this.pops) {
			const f = (nowMs - p.t0) / p.life;
			if (f >= 1) continue;
			nextPops.push(p);
			const drag = Math.exp(-5.5 * dt);
			p.vx *= drag; p.vy *= drag;
			p.x += p.vx * dt; p.y += p.vy * dt;
			fillRectR(ctx, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, withAlpha(p.col, 1 - f * f), p.r);
		}
		this.pops = nextPops;

		// 3. 3D aerodynamic paper pieces, streamers & foil stars
		const nextPieces = [];
		for (const q of this.pieces) {
			const ageMs = nowMs - q.t0;
			const f = ageMs / q.life;
			if (f >= 1) continue;
			nextPieces.push(q);

			const sinT = Math.sin(q.tilt), cosT = Math.cos(q.tilt);
			const area = 0.28 + 0.72 * Math.abs(sinT);
			const dragK = (q.kind === 'streamer' ? 3.2 : q.kind === 'spark' ? 1.8 : 2.35) * area;
			const drag = Math.exp(-dragK * dt);
			q.vx *= drag;
			q.vy *= drag;
			q.vy += 860 * q.u * q.mass * dt;

			// Aerodynamic glide & vortex-shedding flutter
			const speedY = Math.max(0, q.vy);
			const glide = -Math.sin(2 * q.tilt) * 1.35 * speedY;
			const flutter = Math.sin(q.sway + ageMs * 0.0075) * 155 * q.u * (q.kind === 'streamer' ? 1.3 : 0.9);
			q.vx += (glide + flutter) * dt;
			q.x += q.vx * dt;
			q.y += q.vy * dt;

			q.rot += q.vRot * dt;
			q.tilt += q.vTilt * dt;
			q.bank += q.vBank * dt;
			q.vRot *= Math.exp(-0.85 * dt);
			q.vTilt *= Math.exp(-0.55 * dt);
			q.vBank *= Math.exp(-0.75 * dt);

			const alpha = f < 0.72 ? 1 : 1 - smoothstep((f - 0.72) / 0.28);
			if (alpha <= 0.01) continue;

			const frontUp = cosT >= 0;
			const baseCol = frontUp ? q.front : q.back;
			const sheen = frontUp && Math.abs(cosT) > 0.22 && Math.abs(cosT) < 0.56 ? 0.35 : 0;
			const drawCol = sheen ? mixCol(baseCol, WHITE, sheen) : baseCol;

			ctx.save();
			ctx.translate(q.x, q.y);
			ctx.rotate(q.rot);

			if (q.kind === 'spark') {
				const pulse = 0.65 + 0.35 * Math.abs(cosT);
				drawFourStar(ctx, 0, 0, q.size * pulse, q.bank, withAlpha(drawCol, alpha));
			} else if (q.kind === 'streamer') {
				const sy = Math.max(0.18, Math.abs(cosT));
				const wave = Math.sin(q.sway + ageMs * 0.018) * q.w * 1.25;
				ctx.scale(1, sy);
				ctx.beginPath();
				ctx.moveTo(-q.h * 0.5, 0);
				ctx.quadraticCurveTo(-q.h * 0.16, wave, 0, 0);
				ctx.quadraticCurveTo(q.h * 0.16, -wave, q.h * 0.5, 0);
				ctx.lineWidth = q.w;
				ctx.lineCap = 'round';
				ctx.strokeStyle = cssCol(withAlpha(drawCol, alpha));
				ctx.stroke();
			} else {
				const sx = Math.max(0.28, Math.abs(Math.cos(q.bank)));
				const sy = Math.max(0.14, Math.abs(cosT));
				ctx.scale(sx, sy);
				ctx.fillStyle = cssCol(withAlpha(drawCol, alpha));
				ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
			}
			ctx.restore();
		}
		this.pieces = nextPieces;
		ctx.restore();
		return this.active() ? 'raf' : 'idle';
	}
}

// ---- Main Thymer AppPlugin -----------------------------------------------------------

class Plugin extends AppPlugin {
	cfg = { caret: 'Slime', jelly: true, sleep: true, sleepAfterMs: 5000, kawaiiMode: 'auto', uwuMode: 'auto', tune: {} };
	canvas = null;
	ctx = null;
	caretStyle = null;
	caretEl = null;
	lastRect = null;
	dark = true;
	raf = 0;
	wakeTimer = 0;
	cleanup = [];
	eventIds = [];

	carets = new Map();
	smear = new SmearBody();
	sleeper = new Sleeper();
	gaze = new GazeTracker();
	confetti = new ConfettiSystem();
	pendingKick = { wrote: 0, edited: false, erased: 0, dir: 0, gone: '', typed: '', goneCells: null };
	rowSnap = null;
	pendingKey = null;
	lastScrollTop = new WeakMap();
	scrollShift = { active: false, dy: 0, at: 0 };
	selecting = false;
	hiddenHighlightActive = false;

	clip = null;
	clipT = 0;
	page = null;
	demoTiles = [];
	demoRaf = 0;
	demoObserver = null;
	tunePop = null;

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

		listen(document, 'keydown', (e) => {
			if (!this.caretEl || document.querySelector(MODAL_SEL)) return;
			const key = e.key || '';
			if (key === 'Backspace' || key === 'Delete') {
				this.capturePreDelete(e);
			} else if (key === 'Enter' && !e.ctrlKey && !e.metaKey) {
				this.pendingKey = { type: 'enter', at: performance.now() };
			} else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
				this.pendingKey = { type: 'char', ch: key, at: performance.now() };
			}
			setTimeout(() => this.sample(true), 0);
		}, cap);

		listen(document, 'input', (e) => {
			if (this.page && this.page.note.contains(e.target)) this.noteInput();
			this.detectEditKick(true);
			requestAnimationFrame(() => this.sample(true));
		}, cap);

		listen(document, 'keyup', () => requestAnimationFrame(() => this.sample(false)), cap);
		listen(document, 'click', () => requestAnimationFrame(() => this.sample(false)), cap);
		listen(document, 'selectionchange', () => {
			this.placePageCaret();
			requestAnimationFrame(() => this.sample(false));
		});
		listen(document, 'scroll', (e) => {
			this.clipT = 0;
			const t = e.target;
			if (t instanceof Element && typeof t.scrollTop === 'number') {
				const prev = this.lastScrollTop.get(t);
				this.lastScrollTop.set(t, t.scrollTop);
				if (prev !== undefined && prev !== t.scrollTop) {
					this.scrollShift = { active: true, dy: prev - t.scrollTop, at: performance.now() };
				} else {
					this.scrollShift.at = performance.now();
				}
			} else {
				this.scrollShift.at = performance.now();
			}
			requestAnimationFrame(() => this.sample(false));
		}, cap);
		listen(window, 'resize', () => {
			this.resize(); this.clipT = 0; this.placePageCaret();
			requestAnimationFrame(() => this.sample(false));
		});

		this.installCaretObserver();
		this.installThemeObserver();
		this.installTaskObserver();

		this.ui.registerCustomPanelType(CFX2_PAGE_TYPE, (panel) => this.renderPage(panel));
		this.ui.addCommandPaletteCommand({ label: 'CaretFx-v2: open settings', icon: 'ti-palette', onSelected: () => this.openPage() });
		this.ui.addCommandPaletteCommand({ label: 'CaretFx-v2: next caret', icon: 'ti-cursor-text', onSelected: () => this.nextCaret() });
		this.ui.addCommandPaletteCommand({ label: 'CaretFx-v2: toggle jelly', icon: 'ti-droplet', onSelected: () => this.update({ jelly: !this.cfg.jelly }) });
		this.ui.addCommandPaletteCommand({ label: 'CaretFx-v2: toggle sleepy caret', icon: 'ti-bed', onSelected: () => this.update({ sleep: !this.cfg.sleep }) });
		this.ui.addCommandPaletteCommand({ label: 'CaretFx-v2: next Kawaii / UwU mode', icon: 'ti-mood-happy', onSelected: () => this.nextSubMode() });

		this.eventIds.push(this.events.on('global-plugin.updated', () => this.readConfig()));
		this.eventIds.push(this.events.on('panel.navigated', () => { this.resetCaret(); requestAnimationFrame(() => this.sample(false)); }));
		this.eventIds.push(this.events.on('panel.focused', () => { this.clipT = 0; requestAnimationFrame(() => this.sample(false)); }));

		this.sample(false);
	}

	onUnload() {
		cancelAnimationFrame(this.raf);
		cancelAnimationFrame(this.demoRaf);
		clearTimeout(this.wakeTimer);
		for (const f of this.cleanup) { try { f(); } catch (e) { /* ignore */ } }
		this.cleanup = [];
		for (const id of this.eventIds) { try { this.events.off(id); } catch (e) { /* ignore */ } }
		this.eventIds = [];
		this.clearHiddenGlyphs();
		this.canvas?.remove();
		this.caretStyle?.remove();
		this.confetti.clear();
		document.body.classList.remove('cfx2-caret-off');
		this.closePage();
	}

	// ---- Configuration & Caret Switching -----------------------------------------------

	readConfig() {
		let custom = {};
		try { custom = this.getConfiguration()?.custom || {}; } catch (e) { custom = {}; }
		const choices = loadChoices();
		const merged = { caret: 'Slime', jelly: true, sleep: true, sleepAfterMs: 5000, kawaiiMode: 'auto', uwuMode: 'auto', ...custom, ...choices };
		const spec = findCaretSpec(merged.caret);
		this.cfg = {
			caret: spec.name,
			jelly: !!merged.jelly,
			sleep: merged.sleep !== false,
			sleepAfterMs: clamp(Number(merged.sleepAfterMs) || 5000, 1000, 120000),
			kawaiiMode: KAWAII_MODES.some((m) => m.id === merged.kawaiiMode) ? merged.kawaiiMode : 'auto',
			uwuMode: UWU_MODES.some((m) => m.id === merged.uwuMode) ? merged.uwuMode : 'auto',
			tune: cleanTunes(merged.tune),
		};
		this.sleeper.sleepAfterMs = this.cfg.sleepAfterMs;
		this.refreshPage();
		this.kick();
	}

	update(patch, toast = false) {
		const next = { ...this.cfg, ...patch };
		if (patch.caret !== undefined) next.caret = findCaretSpec(patch.caret).name;
		this.cfg = next;
		this.sleeper.sleepAfterMs = this.cfg.sleepAfterMs;
		saveChoices(patch);
		if (patch.caret !== undefined) {
			this.clearHiddenGlyphs();
			this.activeCaret().reset();
			this.smear.reset();
			this.sleeper.wake();
			this.gaze.reset();
		}
		if (patch.sleep === false) this.sleeper.wake();
		this.refreshPage();
		this.kick();
		if (toast && patch.caret !== undefined) {
			const spec = findCaretSpec(this.cfg.caret);
			this.ui.addToaster({ title: 'CaretFx-v2', message: `Caret: ${spec.label || spec.name}`, dismissible: true, autoDestroyTime: 1400 });
		}
	}

	/** The tune of a caret (by its spec name), or null when it has none. */
	tuneFor(name) { return this.cfg.tune[name] || null; }

	/**
	 * Sets a caret's tune. While a slider is dragged only the live config changes (`save` false); the whole map is
	 * written to storage when it is let go, since saveChoices merges only the top level.
	 */
	setTune(name, t, save = true) {
		const tune = { ...this.cfg.tune };
		const clean = cleanTune(t);
		if (clean) tune[name] = clean; else delete tune[name];
		this.cfg = { ...this.cfg, tune };
		if (save) saveChoices({ tune });
		this.markTuned();
		this.kick();
	}

	activeCaret() {
		const spec = findCaretSpec(this.cfg.caret);
		let inst = this.carets.get(spec.name);
		if (!inst) { inst = spec.make(); this.carets.set(spec.name, inst); }
		return inst;
	}

	resetCaret() {
		this.clearHiddenGlyphs();
		for (const inst of this.carets.values()) inst.reset();
		this.smear.reset();
		this.sleeper.wake();
		this.gaze.reset();
		this.rowSnap = null;
	}

	nextCaret() {
		const cur = findCaretSpec(this.cfg.caret);
		const idx = CARET_SPECS.findIndex((s) => s.name === cur.name);
		const next = CARET_SPECS[(idx + 1) % CARET_SPECS.length];
		this.update({ caret: next.name }, true);
	}

	nextSubMode() {
		const cur = findCaretSpec(this.cfg.caret).name;
		const isK = cur === 'Kawaii';
		const list = isK ? KAWAII_MODES : UWU_MODES;
		const key = isK ? 'kawaiiMode' : 'uwuMode';
		if (!isK && cur !== 'UwU') {
			this.update({ caret: 'Kawaii' }, true);
			return;
		}
		const i = list.findIndex((m) => m.id === this.cfg[key]);
		const next = list[(i + 1) % list.length];
		this.update({ [key]: next.id });
		this.ui.addToaster({ title: `CaretFx-v2 (${cur})`, message: `Mode: ${next.label}`, dismissible: true, autoDestroyTime: 1400 });
	}

	// ---- Observers & Styling -----------------------------------------------------------

	applyCaretStyle() {
		if (!this.caretStyle) {
			this.caretStyle = document.createElement('style');
			document.head.appendChild(this.caretStyle);
		}
		this.caretStyle.textContent = `::highlight(${HIGHLIGHT_NAME}) { color: transparent !important; }`;
	}

	setCaretHidden(on) {
		document.body.classList.toggle('cfx2-caret-off', !!on);
	}

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
			for (let i = observers.length - 1; i >= 0; i--) {
				const [mo, el] = observers[i];
				if (el.isConnected) continue;
				mo.disconnect(); attached.delete(el); observers.splice(i, 1);
			}
			if (this.caretEl && !this.caretEl.isConnected) { this.caretEl = null; this.clipT = 0; poke(); }
		});
		tree.observe(document.body, { childList: true, subtree: true });
		document.querySelectorAll(CARET_SEL).forEach(attach);
		this.cleanup.push(() => { tree.disconnect(); observers.forEach(([o]) => o.disconnect()); observers.length = 0; });
	}

	taskBoxRect(el) {
		if (!(el instanceof Element)) return null;
		const boxEl = el.querySelector?.(':scope > .line-check-div, .line-check-div') || el;
		const b = boxEl.getBoundingClientRect();
		if (!(b.width > 0) || !(b.height > 0)) return null;
		return { x: b.left, y: b.top, w: b.width, h: b.height };
	}

	findTaskElByGuid(guid, cx, cy) {
		if (!guid || typeof CSS === 'undefined' || !CSS.escape) return null;
		const candidates = [...document.querySelectorAll(`.listitem-task[data-guid="${CSS.escape(guid)}"]`)]
			.filter((el) => !el.closest('.autocomplete--option-icon, .autocomplete--option, .cfx2-taskdemo, .bt-settings'));
		if (!candidates.length) return null;
		if (candidates.length === 1) return candidates[0];
		let best = candidates[0], bestScore = -1e9;
		for (const el of candidates) {
			const b = this.taskBoxRect(el);
			if (!b) continue;
			let score = el.closest('.panel.is-focused') ? 5000 : 0;
			if (Number.isFinite(cx) && Number.isFinite(cy)) {
				score -= Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy);
			}
			if (score > bestScore) { bestScore = score; best = el; }
		}
		return best;
	}

	triggerConfettiAt(box) {
		if (!box || !(box.w > 0) || !(box.h > 0)) return;
		const raw = this.activeCaret().tint ? this.activeCaret().tint(this.dark) : cursorColor(this.dark);
		const tint = applyTune(raw, this.tuneFor(findCaretSpec(this.cfg.caret).name));
		this.confetti.burst(box.x + box.w / 2, box.y + box.h / 2, box.h, performance.now(), tint);
		this.kick();
	}

	installTaskObserver() {
		let gestureAt = -1e9;
		let lastX = NaN, lastY = NaN;
		const doneStateByGuid = new Map();
		const doneFiredAtByGuid = new Map();
		const doneElStamp = new WeakMap();

		const mark = (e) => {
			gestureAt = performance.now();
			if (e.type === 'pointerdown' && typeof e.clientX === 'number') {
				lastX = e.clientX;
				lastY = e.clientY;
			}
		};
		document.addEventListener('pointerdown', mark, { capture: true, passive: true });
		document.addEventListener('keydown', mark, { capture: true, passive: true });

		const isDoneTask = (el) => (
			el instanceof Element &&
			el.classList.contains('listitem-task') &&
			el.classList.contains('state-done') &&
			!el.closest('.autocomplete--option-icon, .autocomplete--option, .cfx2-taskdemo, .bt-settings')
		);

		const fireEl = (el) => {
			const rect = this.taskBoxRect(el);
			if (rect) this.triggerConfettiAt(rect);
		};

		const tryFireGuid = (guid, elHint = null) => {
			const now = performance.now();
			const lastAt = doneFiredAtByGuid.get(guid) || -1e9;
			if (doneStateByGuid.get(guid) === true) return false;
			if (now - lastAt < 1200) return false;
			doneStateByGuid.set(guid, true);
			doneFiredAtByGuid.set(guid, now);
			const el = elHint || this.findTaskElByGuid(guid, lastX, lastY);
			if (el) {
				fireEl(el);
			} else {
				requestAnimationFrame(() => {
					const delayed = this.findTaskElByGuid(guid, lastX, lastY);
					if (delayed && isDoneTask(delayed)) fireEl(delayed);
				});
			}
			return true;
		};

		const onLineUpdate = (ev) => {
			if (!ev?.source?.isLocal || !ev.lineItemGuid || ev.status == null) return;
			if (ev.status !== 'done') {
				doneStateByGuid.set(ev.lineItemGuid, false);
				return;
			}
			tryFireGuid(ev.lineItemGuid);
		};
		this.eventIds.push(this.events.on('lineitem.updated', onLineUpdate, { collection: '*' }));

		const mo = new MutationObserver((muts) => {
			const now = performance.now();
			for (const m of muts) {
				if (m.type !== 'attributes') continue;
				const el = m.target;
				if (!(el instanceof Element) || !el.classList.contains('listitem-task')) continue;
				if (el.closest('.autocomplete--option-icon, .autocomplete--option, .cfx2-taskdemo, .bt-settings')) continue;
				const guid = el.getAttribute('data-guid');
				const wasDone = /\bstate-done\b/.test(m.oldValue || '');
				const isDone = el.classList.contains('state-done');
				if (!isDone) {
					if (wasDone && guid) doneStateByGuid.set(guid, false);
					doneElStamp.delete(el);
					continue;
				}
				if (wasDone || now - gestureAt > 750) continue;
				if (guid) {
					tryFireGuid(guid, el);
				} else if (now - (doneElStamp.get(el) || -1e9) > 1200) {
					doneElStamp.set(el, now);
					fireEl(el);
				}
			}
		});
		mo.observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });
		this.cleanup.push(() => {
			mo.disconnect();
			document.removeEventListener('pointerdown', mark, true);
			document.removeEventListener('keydown', mark, true);
		});
	}

	installThemeObserver() {
		const check = () => {
			const dark = isDarkTheme();
			if (dark === this.dark) return;
			this.dark = dark;
			this.refreshPage();
			this.kick();
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

	// ---- Caret Locating, Kick Detection & DOM Reading ----------------------------------

	caretInfo() {
		const panel = document.querySelector(FOCUSED_PANEL_SEL);
		const focusEl = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
		const focusEditor = focusEl && focusEl.closest ? focusEl.closest('listview-editor, .cfx2-note') : null;
		const focusBox = focusEl ? focusEl.getBoundingClientRect() : null;
		let best = null, bestRect = null, bestScore = -1e9;
		for (const n of document.querySelectorAll(CARET_SEL)) {
			if (n.classList.contains('caret-inactive')) continue;
			const b = n.getBoundingClientRect();
			if (!(b.height > 0.5)) continue;
			const cs = getComputedStyle(n);
			if (cs.display === 'none' || cs.visibility === 'hidden') continue;
			let score = 0;
			if (panel && panel.contains(n)) score += 2;
			if (focusEditor && focusEditor.contains(n)) score += 4;
			if (focusBox) {
				const dy = Math.max(0, focusBox.top - b.bottom, b.top - focusBox.bottom);
				score -= Math.min(dy, 5000) / 5000;
			}
			if (score > bestScore) { best = n; bestRect = b; bestScore = score; }
		}
		if (best !== this.caretEl) { this.caretEl = best; this.clipT = 0; }
		if (!best) return null;

		const midY = (bestRect.top + bestRect.bottom) / 2;
		const onLine = (lt) => lt && Math.abs(lt.top - bestRect.top) <= bestRect.height && lt.top <= midY + 1 && lt.top + lt.height >= midY - 1;
		let lt = charRectAt(bestRect.left + 1, midY);
		const row = rowForCaret(best, bestRect);
		if (!onLine(lt)) lt = lineTextRect(row, midY);
		if (!onLine(lt)) lt = null;
		const y = lt ? lt.top : bestRect.top, h = lt ? lt.height : bestRect.height;
		const cw = (lt && lt.width > 1 ? lt.width : 0) || Math.max(6, h * 0.5);

		const line = row ? new LineText(row) : null;
		let idx = -1, collapsed = true;
		if (line && line.el) {
			const sel = window.getSelection();
			if (sel && sel.rangeCount && sel.focusNode && line.el.contains(sel.focusNode)) {
				idx = line.indexOf(sel.focusNode, sel.focusOffset);
				collapsed = sel.isCollapsed;
			}
			if (idx < 0) idx = line.indexAt(bestRect.left + 1, midY);
			if (idx < 0) idx = line.text.length;
		}
		return { el: best, row, line, idx, collapsed, rect: { x: bestRect.left, y, w: 1, h }, cw };
	}

	capturePreDelete(e) {
		const info = this.caretInfo();
		if (!info || !info.line || info.idx < 0) return;
		const { line, idx } = info;
		const reach = info.collapsed && !e.ctrlKey && !e.altKey && !e.metaKey ? 2 : 40;
		const lo = Math.max(0, idx - reach), hi = Math.min(line.text.length, idx + reach);
		const cells = new Map();
		for (let i = lo; i < hi;) {
			const code = line.text.charCodeAt(i);
			const len = code >= 0xd800 && code <= 0xdbff ? 2 : 1;
			const ch = line.text.slice(i, i + len);
			const r = line.charRect(i, len);
			if (r) cells.set(i, { ch, x: r.x, w: r.w });
			i += len;
		}
		this.pendingKey = {
			type: 'delete', dir: e.key === 'Backspace' ? -1 : 1,
			row: line.row, guid: line.guid, text: line.text, lo, cells, at: performance.now(),
		};
	}

	detectEditKick(fromInput = false) {
		const now = performance.now();
		if (this.pendingKey && now - this.pendingKey.at >= 350) this.pendingKey = null;
		const info = this.caretInfo();
		if (!info || !info.line) return;
		const { line, idx } = info;
		const pk = this.pendingKey;

		// Check pre-delete snapshot first (accurate deleted letter positions & direction)
		if (pk && pk.type === 'delete' && now - pk.at < 350) {
			const pkLine = pk.row.isConnected ? new LineText(pk.row) : (pk.guid ? (() => { const r = rowByGuid(pk.guid); return r ? new LineText(r) : null; })() : null);
			if (pkLine && pkLine.text !== pk.text) {
				this.pendingKey = null;
				const pkIdx = pkLine.guid === line.guid ? idx : pkLine.text.length;
				const edit = lineEdit(pk.text, pkLine.text, pkIdx);
				if (edit && edit.removed) {
					const goneCells = [];
					for (let i = 0; i < edit.removed.length;) {
						const code = edit.removed.charCodeAt(i);
						const len = code >= 0xd800 && code <= 0xdbff ? 2 : 1;
						const ch = edit.removed.slice(i, i + len);
						const cell = pk.cells.get(edit.at + i);
						if (ch.trim() && cell) goneCells.push(cell);
						i += len;
					}
					if (pk.dir < 0) goneCells.reverse();
					this.pendingKick.erased += Array.from(edit.removed).length;
					this.pendingKick.dir = pk.dir;
					this.pendingKick.gone = edit.removed + this.pendingKick.gone;
					if (goneCells.length) this.pendingKick.goneCells = goneCells;
					this.pendingKick.edited = true;
					this.rowSnap = { guid: line.guid, text: line.text, idx };
					return;
				}
			} else if (!pkLine || pkLine.guid !== line.guid) {
				this.pendingKey = null;
				this.pendingKick.erased += 1;
				this.pendingKick.dir = pk.dir;
				this.pendingKick.edited = true;
				this.rowSnap = { guid: line.guid, text: line.text, idx };
				return;
			}
		}

		// Check Enter creating a new row
		if (pk && pk.type === 'enter' && now - pk.at < 300 && (fromInput || !this.rowSnap || this.rowSnap.guid !== line.guid || this.rowSnap.text !== line.text)) {
			this.pendingKey = null;
			this.pendingKick.wrote += 1;
			this.pendingKick.typed += '\n';
			this.pendingKick.edited = true;
			this.rowSnap = { guid: line.guid, text: line.text, idx };
			return;
		}

		// General edit diff against rowSnap
		if (this.rowSnap && this.rowSnap.guid === line.guid && this.rowSnap.text !== line.text) {
			this.pendingKey = null;
			const edit = lineEdit(this.rowSnap.text, line.text, idx);
			if (edit) {
				if (edit.inserted) {
					this.pendingKick.wrote += Array.from(edit.inserted).length;
					this.pendingKick.typed += edit.inserted;
				}
				if (edit.removed) {
					this.pendingKick.erased += Array.from(edit.removed).length;
					this.pendingKick.dir = edit.at === idx ? 1 : -1;
					this.pendingKick.gone = edit.removed + this.pendingKick.gone;
				}
				this.pendingKick.edited = true;
			}
		} else if (fromInput && pk && pk.type === 'char' && now - pk.at < 250 && (!this.rowSnap || this.rowSnap.guid !== line.guid)) {
			this.pendingKey = null;
			this.pendingKick.wrote += 1;
			this.pendingKick.typed += pk.ch;
			this.pendingKick.edited = true;
		}
		this.rowSnap = { guid: line.guid, text: line.text, idx };
	}

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
		const scroller = panel && (panel.querySelector('.panel-scroller-y, .cfx2-scroll') || panel);
		if (panel) {
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

	sample() {
		if (document.querySelector(MODAL_SEL)) {
			this.setCaretHidden(false);
			this.clearHiddenGlyphs();
			this.lastRect = null;
			this.ctx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
			return;
		}
		const info = this.caretInfo();
		if (!info) {
			this.setCaretHidden(false);
			this.clearHiddenGlyphs();
			this.lastRect = null;
			if (this.confetti.active()) {
				if (this.scrollShift.active && performance.now() - this.scrollShift.at < 150) {
					this.confetti.shift(this.scrollShift.dy);
					this.scrollShift.active = false;
				}
				this.kick();
			} else {
				this.ctx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
			}
			return;
		}
		this.setCaretHidden(true);
		this.selecting = !info.collapsed;

		// Catch edits even when Thymer handles keys without firing a native DOM input event
		if (info.line && (this.pendingKey || (this.rowSnap && this.rowSnap.guid === info.line.guid && this.rowSnap.text !== info.line.text))) {
			this.detectEditKick();
		} else if (info.line && (!this.rowSnap || this.rowSnap.guid !== info.line.guid)) {
			this.rowSnap = { guid: info.line.guid, text: info.line.text, idx: info.idx };
		}

		const prev = this.lastRect;
		const cur = info.rect;
		this.lastRect = cur;
		this.lastInfo = info;

		if (prev && this.scrollShift.active && performance.now() - this.scrollShift.at < 150 && !this.pendingKick.edited) {
			const dy = cur.y - prev.y;
			if (Math.abs(dy) > 0.5) {
				this.activeCaret().shift(dy);
				this.smear.shift(dy);
				this.sleeper.shift(dy);
				this.confetti.shift(dy);
			}
			this.scrollShift.active = false;
		} else if (prev && !this.pendingKick.edited && Math.hypot(cur.x - prev.x, cur.y - prev.y) > 12) {
			this.confetti.pushWake(cur.x, cur.y + cur.h / 2, cur.x - prev.x, cur.y - prev.y);
		}
		this.kick();
	}

	// ---- Rendering Loop (0% CPU when settled) -----------------------------------------

	mountCanvas() {
		const cv = document.createElement('canvas');
		cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:500;';
		document.body.appendChild(cv);
		this.canvas = cv;
		this.ctx = cv.getContext('2d');
		this.resize();
	}

	resize() {
		if (!this.canvas || !this.ctx) return;
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = Math.round(window.innerWidth * dpr);
		this.canvas.height = Math.round(window.innerHeight * dpr);
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		if (this.lastRect) this.kick();
	}

	kick() {
		if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
	}

	scheduleAfter(ms) {
		clearTimeout(this.wakeTimer);
		this.wakeTimer = setTimeout(() => {
			this.wakeTimer = 0;
			if (this.lastRect) this.kick();
		}, Math.max(16, Math.round(ms)));
	}

	clearHiddenGlyphs() {
		if (this.hiddenHighlightActive && typeof CSS !== 'undefined' && CSS.highlights) {
			try { CSS.highlights.delete(HIGHLIGHT_NAME); } catch (e) { /* ignore */ }
			this.hiddenHighlightActive = false;
		}
	}

	applyHiddenGlyphs(ranges) {
		if (typeof Highlight === 'undefined' || typeof CSS === 'undefined' || !CSS.highlights) return;
		if (!ranges || !ranges.length) { this.clearHiddenGlyphs(); return; }
		try {
			CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
			this.hiddenHighlightActive = true;
		} catch (e) { this.clearHiddenGlyphs(); }
	}

	frame() {
		this.raf = 0;
		const ctx = this.ctx;
		if (!ctx) return;
		ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

		const nowMs = performance.now();
		const winBounds = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
		if (document.querySelector(MODAL_SEL)) {
			this.clearHiddenGlyphs();
			return;
		}
		const clip = this.clipRect();
		const info = this.caretInfo();
		if (!info) {
			this.clearHiddenGlyphs();
			this.setCaretHidden(false);
			if (this.confetti.active()) {
				if (this.confetti.draw(ctx, nowMs, clip || winBounds) === 'raf') this.kick();
			}
			return;
		}

		this.lastRect = info.rect;
		this.lastInfo = info;
		const inScratch = !!(this.page && this.page.note.contains(info.el));
		const isTorch = findCaretSpec(this.cfg.caret).name === 'torch';
		const bounds = isTorch && !inScratch ? winBounds : (clip || winBounds);

		const themeEl = info.line?.el || info.el;
		const themeCs = getComputedStyle(themeEl);
		const caretCs = getComputedStyle(info.el);
		const accentCol = parseCssCol(caretCs.borderLeftColor) || parseCssCol(caretCs.color) || cursorColor(this.dark);
		const textCol = parseCssCol(themeCs.color) || (this.dark ? WHITE : BLACK);
		const bgCol = resolveBgCol(themeEl, this.dark);
		const theme = { accent: accentCol, text: textCol };
		const fontFamily = themeCs.fontFamily || 'system-ui, sans-serif';

		if (!info.collapsed) {
			this.clearHiddenGlyphs();
			ctx.save();
			if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
			fillRectR(ctx, info.rect.x - 1, info.rect.y, 2, info.rect.h, accentCol, 1);
			ctx.restore();
			if (this.confetti.active() && this.confetti.draw(ctx, nowMs, clip || winBounds) === 'raf') this.kick();
			return;
		}

		const k = this.pendingKick;
		this.pendingKick = { wrote: 0, edited: false, erased: 0, dir: 0, gone: '', typed: '', goneCells: null };

		const scopeRoot = (inScratch ? this.page.note : (info.el.closest('listview-editor') || info.el.closest('.panel') || document.body));
		const spec = findCaretSpec(this.cfg.caret);
		const subMode = spec.name === 'Kawaii' ? this.cfg.kawaiiMode : spec.name === 'UwU' ? this.cfg.uwuMode : 'auto';
		const f = {
			r: info.rect,
			cw: info.cw,
			dark: this.dark,
			bg: bgCol,
			bounds,
			theme,
			fontFamily,
			subMode,
			gaze: this.gaze.step(nowMs, k),
			wrote: k.wrote,
			edited: k.edited,
			style: caretStyleAt(info.line, info.idx),
			jelly: null,
			near: (n) => collectNearLetters(info.line, info.idx, info.rect.y, info.rect.h, n),
			words: makeCaretWords(info.line, info.idx, scopeRoot, clip),
			rest: 0,
			caretRestsMs: this.sleeper.caretRestsMs(),
		};

		if (this.cfg.jelly && spec.name !== 'Slime' && spec.name !== 'line') {
			f.jelly = this.smear.body(nowMs, f);
		}

		let sleepRate = 'idle';
		if (this.cfg.sleep) {
			sleepRate = this.sleeper.observe(nowMs, f, k, (ms) => this.scheduleAfter(ms));
			f.rest = this.sleeper.rested(nowMs);
		} else {
			this.sleeper.wake();
		}

		const caret = this.activeCaret();
		const hideRanges = [];
		let fxRate = 'idle';

		ctx.save();
		if (!isTorch && clip) {
			ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip();
		} else if (isTorch && inScratch && clip) {
			ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip();
		}
		const breath = this.cfg.sleep ? this.sleeper.breathe(nowMs, f) : null;
		const tune = this.tuneFor(spec.name);
		const drawBody = () => {
			fxRate = withTune(tune, () => caret.draw(ctx, nowMs, f, k, (ms) => this.scheduleAfter(ms), hideRanges)) || 'idle';
		};
		if (breath && !isTorch) {
			ctx.save();
			ctx.translate(breath.px, breath.py);
			ctx.scale(breath.sx, breath.sy);
			ctx.translate(-breath.px, -breath.py);
			drawBody();
			ctx.restore();
		} else {
			drawBody();
		}
		if (this.cfg.sleep) {
			const tint = caret.tint ? caret.tint(this.dark, theme) : accentCol;
			withTune(tune, () => this.sleeper.draw(ctx, nowMs, f, tint));
		}
		ctx.restore();

		this.applyHiddenGlyphs(hideRanges);

		let confettiRate = 'idle';
		if (this.confetti.active()) {
			confettiRate = this.confetti.draw(ctx, nowMs, clip || winBounds);
		}

		const needRaf = f.jelly !== null || fxRate === 'raf' || confettiRate === 'raf' || this.gaze.settling();
		const need30 = fxRate === '30' || sleepRate === '30';
		if (needRaf) {
			this.kick();
		} else if (need30) {
			this.scheduleAfter(33);
		}
	}

	// ---- Settings Page with Scratch Pad & 24 Live Tiles ---------------------------------

	async openPage() {
		const panel = this.ui.getActivePanel() || await this.ui.createPanel();
		panel?.navigateToCustomType(CFX2_PAGE_TYPE);
	}

	renderPage(panel) {
		const host = panel.getElement();
		if (!host) return;
		this.closePage();
		panel.setTitle?.('CaretFx-v2');
		const html = (h) => { const t = document.createElement('div'); t.innerHTML = h; return t.firstElementChild; };
		host.innerHTML = `<div class="cfx2-scroll"><div class="cfx2-page">
<div class="cfx2-hero">
  <div><h1>CaretFx-v2</h1><p>24 carets ported from Ryudit. Click any live tile to switch or type below to test it right here.</p></div>
  <div class="cfx2-pill"><span class="cfx2-pill-dot"></span><span class="cfx2-pill-name"></span></div>
</div>
<div class="cfx2-label">Try it</div>
<div class="cfx2-notebox"><div class="cfx2-note" contenteditable="true" spellcheck="false"></div><div class="cfx2-pcaret"></div></div>
<div class="cfx2-hint">Type letters, Space, Enter, Backspace/Delete. Try "great", "sad", repeat a word twice for Echo, or (brackets) [and] {braces}.</div>
<div class="cfx2-label">Modifiers</div>
<div class="cfx2-opts"></div>
<button class="cfx2-taskdemo" type="button"><span class="cfx2-taskbox"></span><span class="cfx2-tasklabel">Tick this test task to launch Confetti</span></button>
<div class="cfx2-subwrap"><div class="cfx2-subhead"><span class="cfx2-subtitle"></span><span class="cfx2-subhint">Auto reacts to typing, speed, punctuation, erase &amp; jumps</span></div><div class="cfx2-submodes"></div></div>
<div class="cfx2-label">Carets (24)</div>
<div class="cfx2-tiles"></div>
</div></div>`;
		const root = host.querySelector('.cfx2-page');
		const note = root.querySelector('.cfx2-note');
		const box = root.querySelector('.cfx2-notebox');
		const caret = root.querySelector('.cfx2-pcaret');
		this.page = { root, note, box, caret, n: 0 };

		let saved = null;
		try { saved = localStorage.getItem(CFX2_NOTE_KEY); } catch (e) { /* ignore */ }
		this.fillNote(saved !== null ? saved.split('\n') : CFX2_NOTE_DEFAULT);
		note.addEventListener('paste', (e) => {
			e.preventDefault();
			document.execCommand('insertText', false, (e.clipboardData || window.clipboardData)?.getData('text/plain') || '');
		});
		note.addEventListener('focus', () => this.placePageCaret());
		note.addEventListener('blur', () => this.placePageCaret());

		const opts = root.querySelector('.cfx2-opts');
		for (const [key, title, desc] of [
			['jelly', 'Jelly stretch', 'Two-face spring smear & tapered tail on every caret (except Slime & Line)'],
			['sleep', 'Sleepy caret', 'Breathes and floats z\'s after 5 seconds of rest'],
		]) {
			const sw = html(`<button class="cfx2-opt" role="switch" data-key="${key}"><span><span class="cfx2-opt-name"></span><span class="cfx2-opt-note"></span></span><span class="cfx2-sw"></span></button>`);
			sw.querySelector('.cfx2-opt-name').textContent = title;
			sw.querySelector('.cfx2-opt-note').textContent = desc;
			sw.onclick = () => this.update({ [key]: !this.cfg[key] });
			opts.appendChild(sw);
		}

		const grid = root.querySelector('.cfx2-tiles');
		this.demoTiles = [];
		const visibleSet = new Set();
		if (typeof IntersectionObserver !== 'undefined') {
			this.demoObserver = new IntersectionObserver((entries) => {
				for (const e of entries) {
					if (e.isIntersecting) visibleSet.add(e.target);
					else visibleSet.delete(e.target);
				}
			}, { root: host.querySelector('.cfx2-scroll'), threshold: 0.05 });
		}
		for (const spec of CARET_SPECS) {
			// the gear is the tile's sibling, not inside it: a button may not hold another
			const wrap = html(`<div class="cfx2-tilewrap" data-caret="${spec.name}"><button class="cfx2-tile" data-caret="${spec.name}"><canvas class="cfx2-tile-cv"></canvas><div class="cfx2-tile-meta"><span class="cfx2-tile-name"></span><span class="cfx2-tile-tag"></span></div></button><span class="cfx2-gear" role="button" tabindex="0" aria-haspopup="dialog"><i class="ti ti-settings"></i></span></div>`);
			const tile = wrap.querySelector('.cfx2-tile'), gear = wrap.querySelector('.cfx2-gear');
			tile.querySelector('.cfx2-tile-name').textContent = spec.label || spec.name;
			tile.querySelector('.cfx2-tile-tag').textContent = spec.tag || '';
			tile.onclick = () => this.update({ caret: spec.name });
			gear.setAttribute('aria-label', `Tune ${spec.label || spec.name}`);
			gear.title = 'Tune colour';
			const cv = tile.querySelector('canvas');
			const demo = new CaretDemoTile(spec, cv);
			const toggle = (e) => { e.preventDefault(); e.stopPropagation(); this.toggleTune(spec, wrap, demo); };
			gear.addEventListener('click', toggle);
			gear.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e); });
			grid.appendChild(wrap);
			this.demoTiles.push({ tile, demo, cv, spec });
			this.demoObserver?.observe(cv);
		}

		const taskDemo = root.querySelector('.cfx2-taskdemo');
		taskDemo.onclick = () => {
			const done = taskDemo.classList.toggle('done');
			taskDemo.querySelector('.cfx2-taskbox').textContent = done ? '✓' : '';
			if (done) {
				const tb = taskDemo.querySelector('.cfx2-taskbox').getBoundingClientRect();
				this.triggerConfettiAt({ x: tb.left, y: tb.top, w: tb.width, h: tb.height });
			}
		};

		root.addEventListener('mousedown', (e) => {
			if (document.activeElement === note && e.target.closest('.cfx2-tile, .cfx2-gear, .cfx2-opt, .cfx2-submode, .cfx2-taskdemo')) e.preventDefault();
		});

		const loopDemos = (now) => {
			if (!this.page || !this.page.root.isConnected) { this.closePage(); return; }
			const noteCs = getComputedStyle(this.page.note);
			const accent = parseCssCol(getComputedStyle(this.page.root).getPropertyValue('--c2')) || cursorColor(this.dark);
			const text = parseCssCol(noteCs.color) || (this.dark ? WHITE : BLACK);
			const theme = { accent, text };
			for (const item of this.demoTiles) {
				if (this.demoObserver && !visibleSet.has(item.cv)) continue;
				item.demo.render(now, this.dark, theme, this.cfg.jelly, this.tuneFor(item.spec.name));
			}
			this.demoRaf = requestAnimationFrame(loopDemos);
		};
		this.demoRaf = requestAnimationFrame(loopDemos);
		this.refreshPage();
	}

	refreshPage() {
		const pg = this.page;
		if (!pg) return;
		if (!pg.root.isConnected) { this.closePage(); return; }
		const active = findCaretSpec(this.cfg.caret);
		pg.root.querySelector('.cfx2-pill-name').textContent = active.label || active.name;
		pg.root.querySelectorAll('.cfx2-opt').forEach((b) => b.setAttribute('aria-checked', String(!!this.cfg[b.dataset.key])));
		pg.root.querySelectorAll('.cfx2-tile').forEach((b) => b.classList.toggle('on', b.dataset.caret === active.name));
		this.markTuned();
		const wrap = pg.root.querySelector('.cfx2-subwrap');
		if (wrap) {
			const isK = active.name === 'Kawaii', isU = active.name === 'UwU';
			wrap.classList.toggle('show', isK || isU);
			if (isK || isU) {
				const list = isK ? KAWAII_MODES : UWU_MODES;
				const key = isK ? 'kawaiiMode' : 'uwuMode';
				const cur = this.cfg[key];
				pg.root.querySelector('.cfx2-subtitle').textContent = `${active.name} Modes`;
				const box = pg.root.querySelector('.cfx2-submodes');
				if (box.dataset.for !== active.name) {
					box.dataset.for = active.name;
					box.innerHTML = '';
					for (const m of list) {
						const btn = document.createElement('button');
						btn.className = 'cfx2-submode';
						btn.dataset.id = m.id;
						btn.textContent = m.label;
						btn.onclick = () => this.update({ [key]: m.id });
						box.appendChild(btn);
					}
				}
				box.querySelectorAll('.cfx2-submode').forEach((b) => b.classList.toggle('on', b.dataset.id === cur));
			}
		}
	}

	fillNote(lines) {
		const pg = this.page;
		const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
		pg.note.innerHTML = lines.map((l) => `<div class="cfx2-row" data-guid="cfx2-${++pg.n}"><span class="cfx2-line">${esc(l) || '<br>'}</span></div>`).join('');
	}

	noteInput() {
		const pg = this.page;
		if (!pg || !pg.root.isConnected) return;
		const { note } = pg, sel = window.getSelection();
		if (!note.children.length) {
			this.fillNote(['']);
			const r = document.createRange();
			r.setStart(note.querySelector('.cfx2-line'), 0);
			r.collapse(true);
			sel.removeAllRanges(); sel.addRange(r);
		}
		const seen = new Set();
		for (const row of Array.from(note.childNodes)) {
			if (!(row instanceof HTMLElement)) { row.remove(); continue; }
			row.classList.add('cfx2-row');
			const line = row.querySelector(':scope > .cfx2-line');
			if (!line || row.childNodes.length !== 1) {
				let at = -1;
				if (sel && sel.focusNode && row.contains(sel.focusNode)) {
					const r = document.createRange(); r.setStart(row, 0); r.setEnd(sel.focusNode, sel.focusOffset); at = r.toString().length;
				}
				const frag = document.createDocumentFragment();
				const take = (n) => {
					if (n.nodeType === 1 && n.classList.contains('cfx2-line')) { while (n.firstChild) take(n.firstChild); n.remove(); }
					else frag.appendChild(n);
				};
				for (const n of Array.from(row.childNodes)) take(n);
				const one = document.createElement('span');
				one.className = 'cfx2-line';
				one.appendChild(frag);
				if (one.textContent) one.querySelectorAll('br').forEach((br) => br.remove());
				if (!one.childNodes.length) one.appendChild(document.createElement('br'));
				one.normalize();
				row.appendChild(one);
				if (at >= 0) this.setCaretIn(one, at);
			}
			const g = row.getAttribute('data-guid');
			if (!g || seen.has(g)) row.setAttribute('data-guid', `cfx2-${++pg.n}`);
			seen.add(row.getAttribute('data-guid'));
		}
		try { localStorage.setItem(CFX2_NOTE_KEY, Array.from(note.querySelectorAll('.cfx2-line')).map((l) => l.textContent).join('\n')); } catch (e) { /* ignore */ }
		this.placePageCaret();
	}

	setCaretIn(el, index) {
		const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		let node = walk.nextNode(), left = index;
		while (node && left > node.data.length) { left -= node.data.length; node = walk.nextNode(); }
		const sel = window.getSelection();
		if (node) sel.collapse(node, left); else sel.collapse(el, 0);
	}

	placePageCaret() {
		const pg = this.page;
		if (!pg) return;
		if (!pg.root.isConnected) { this.closePage(); return; }
		const { note, caret, box } = pg, sel = window.getSelection();
		if (document.activeElement !== note || !sel || !sel.rangeCount || !sel.focusNode || !note.contains(sel.focusNode)) {
			caret.style.display = 'none';
			return;
		}
		const node = sel.focusNode, off = sel.focusOffset;
		const box1 = (a, b) => {
			try {
				const q = document.createRange(); q.setStart(node, a); q.setEnd(node, b);
				const c = q.getClientRects()[0];
				return c && c.height > 0.5 ? c : null;
			} catch (e) { return null; }
		};
		let r = null;
		if (node.nodeType === 3) {
			const c = off < node.data.length ? box1(off, off + 1) : null;
			if (c) r = { x: c.left, y: c.top, h: c.height };
			else { const d = off > 0 ? box1(off - 1, off) : null; if (d) r = { x: d.right, y: d.top, h: d.height }; }
		}
		if (!r) {
			const el = node.nodeType === 3 ? node.parentElement : node;
			const row = (el && el.closest && el.closest('.cfx2-row')) || el;
			const b = row.getBoundingClientRect(), cs = getComputedStyle(row), lh = parseFloat(cs.lineHeight);
			r = { x: b.left + (parseFloat(cs.paddingLeft) || 0), y: b.top + (parseFloat(cs.paddingTop) || 0), h: Number.isFinite(lh) && lh > 0 ? Math.min(lh, b.height || lh) : b.height };
		}
		const bb = box.getBoundingClientRect();
		Object.assign(caret.style, { display: 'block', left: `${r.x - bb.left}px`, top: `${r.y - bb.top}px`, height: `${r.h}px` });
	}

	// ---- Tune Popup (the gear on each tile) --------------------------------------------

	/** Marks the tiles whose caret is tuned, so their gear stays in sight. */
	markTuned() {
		if (!this.page) return;
		this.page.root.querySelectorAll('.cfx2-tilewrap').forEach((w) => w.classList.toggle('tuned', !!this.cfg.tune[w.dataset.caret]));
	}

	toggleTune(spec, wrap, demo) {
		const open = this.tunePop;
		this.closeTune();
		if (open && open.spec === spec) return;
		this.openTune(spec, wrap, demo);
	}

	closeTune() {
		const t = this.tunePop;
		if (!t) return;
		this.tunePop = null;
		t.off.forEach((f) => f());
		t.el.remove();
		t.wrap.classList.remove('tuning');
		t.wrap.style.removeProperty('anchor-name');
		t.gear.setAttribute('aria-expanded', 'false');
	}

	/**
	 * A small popup under the gear: the caret's colour in OKLCH (its hues turned, its chroma scaled, its lightness moved,
	 * each on a slider whose track is drawn in the colours it gives) and its opacity. Changes show at once on the tile and
	 * on the caret; double-click a slider to put it back, Reset puts all back.
	 */
	openTune(spec, wrap, demo) {
		const pg = this.page;
		if (!pg) return;
		const gear = wrap.querySelector('.cfx2-gear');
		const name = spec.label || spec.name;
		const el = document.createElement('div');
		el.className = 'cfx2-pop';
		el.setAttribute('role', 'dialog');
		el.setAttribute('aria-label', `Tune ${name}`);
		el.innerHTML = `<div class="cfx2-pop-head"><span class="cfx2-pop-sw"></span><span class="cfx2-pop-name"></span><button class="cfx2-pop-reset" type="button">Reset</button></div>
<div class="cfx2-pop-sec">Colour <span>OKLCH</span></div><div class="cfx2-pop-color"></div>
<div class="cfx2-pop-sec">Fine tune</div><div class="cfx2-pop-fine"></div>`;
		el.querySelector('.cfx2-pop-name').textContent = name;
		const bg = resolveBgCol(pg.root, this.dark);
		el.style.setProperty('--cfx2-pop-bg', cssCol(withAlpha(bg, 1)));
		const pcs = getComputedStyle(pg.root);   // what it would have inherited inside the page
		el.style.setProperty('--cfx2-pop-ink', pcs.color);
		el.style.setProperty('--c2', pcs.getPropertyValue('--c2'));
		el.style.fontFamily = pcs.fontFamily;
		document.body.appendChild(el);   // fixed, over the panel, so it is not cut off by the page's scroll box

		// the caret's own colour, which the sliders' tracks start from
		const accent = parseCssCol(getComputedStyle(pg.root).getPropertyValue('--c2')) || cursorColor(this.dark);
		const raw = demo.caret.tint ? demo.caret.tint(this.dark, { accent, text: WHITE }) : accent;
		const [bL, bC0, bH] = colOklch(raw || accent);
		const bC = Math.max(bC0, 0.06);   // a grey caret still shows hues on the tracks
		const cur = () => ({ ...TUNE_ID, ...(this.cfg.tune[spec.name] || {}) });
		const ok = (L, C, H, a = 1) => `oklch(${(clamp01(L) * 100).toFixed(1)}% ${Math.max(0, C).toFixed(3)} ${(((H % 360) + 360) % 360).toFixed(1)} / ${a})`;
		const now = () => { const t = cur(); return { t, L: bL + t.l, C: bC * t.c, H: bH + t.h }; };
		const steps = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n)).join(', ');

		const sliders = [];
		const slider = (box, key, label, fmt, track, thumb) => {
			const [min, max] = TUNE_RANGE[key];
			const step = key === 'h' ? 1 : 0.01;
			const row = document.createElement('div');
			row.className = 'cfx2-sl';
			row.innerHTML = `<span class="cfx2-sl-name"></span><div class="cfx2-sl-track" role="slider" tabindex="0"><div class="cfx2-sl-mid"></div><div class="cfx2-sl-thumb"></div></div><span class="cfx2-sl-val"></span>`;
			row.querySelector('.cfx2-sl-name').textContent = label;
			const tr = row.querySelector('.cfx2-sl-track'), th = row.querySelector('.cfx2-sl-thumb'), val = row.querySelector('.cfx2-sl-val');
			tr.setAttribute('aria-label', label);
			tr.setAttribute('aria-valuemin', String(min));
			tr.setAttribute('aria-valuemax', String(max));
			const mid = row.querySelector('.cfx2-sl-mid');
			mid.style.left = `${((TUNE_ID[key] - min) / (max - min)) * 100}%`;   // where the caret's own value is
			const set = (v, save) => {
				v = clamp(Math.round(v / step) * step, min, max);
				if (Math.abs(v - TUNE_ID[key]) < step * 0.5) v = TUNE_ID[key];
				this.setTune(spec.name, { ...cur(), [key]: v }, save);
				paint();
			};
			const fromX = (x) => { const r = tr.getBoundingClientRect(); return min + clamp01((x - r.left) / r.width) * (max - min); };
			let dragging = false;
			tr.addEventListener('pointerdown', (e) => {
				e.preventDefault();
				tr.focus({ preventScroll: true });
				try { tr.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
				dragging = true;
				tr.classList.add('drag');
				set(fromX(e.clientX), false);
			});
			tr.addEventListener('pointermove', (e) => { if (dragging) set(fromX(e.clientX), false); });
			const end = (e) => {
				if (!dragging) return;
				dragging = false;
				try { tr.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
				tr.classList.remove('drag');
				set(cur()[key], true);
			};
			tr.addEventListener('pointerup', end);
			tr.addEventListener('pointercancel', end);
			tr.addEventListener('dblclick', () => set(TUNE_ID[key], true));
			tr.addEventListener('keydown', (e) => {
				const big = e.shiftKey ? 10 : 1, v = cur()[key];
				const to = { ArrowRight: v + step * big, ArrowUp: v + step * big, ArrowLeft: v - step * big, ArrowDown: v - step * big, Home: min, End: max }[e.key];
				if (to === undefined) return;
				e.preventDefault(); e.stopPropagation();
				set(to, true);
			});
			sliders.push(() => {
				const v = cur()[key];
				const u = (v - min) / (max - min);
				th.style.left = `${u * 100}%`;
				tr.style.background = `linear-gradient(to right, ${track()})`;
				th.style.setProperty('--cfx2-thumb', thumb ? thumb() : 'transparent');
				val.textContent = fmt(v);
				tr.setAttribute('aria-valuenow', String(v));
				tr.setAttribute('aria-valuetext', fmt(v));
			});
			box.appendChild(row);
		};
		const color = el.querySelector('.cfx2-pop-color'), fine = el.querySelector('.cfx2-pop-fine');
		const sign = (v, d) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
		slider(color, 'h', 'Hue', (v) => `${sign(v, 0)}°`,
			() => { const n = now(); return steps(12, (u) => ok(n.L, Math.max(n.C, 0.1), bH - 180 + 360 * u)); },
			() => { const n = now(); return ok(n.L, n.C, n.H); });
		slider(color, 'c', 'Chroma', (v) => `×${v.toFixed(2)}`,
			() => { const n = now(); return steps(4, (u) => ok(n.L, bC * 2 * u, n.H)); },
			() => { const n = now(); return ok(n.L, n.C, n.H); });
		slider(color, 'l', 'Lightness', (v) => sign(v, 2),
			() => { const n = now(); return steps(6, (u) => ok(bL - 0.4 + 0.8 * u, n.C, n.H)); },
			() => { const n = now(); return ok(n.L, n.C, n.H); });
		slider(fine, 'a', 'Opacity', (v) => `${Math.round(v * 100)}%`,
			() => { const n = now(); return `${ok(n.L, n.C, n.H, 0)}, ${ok(n.L, n.C, n.H, 1)}`; },
			() => { const n = now(); return ok(n.L, n.C, n.H, n.t.a); });

		const sw = el.querySelector('.cfx2-pop-sw');
		const paint = () => {
			const n = now();
			sw.style.background = ok(n.L, n.C, n.H, n.t.a);
			sliders.forEach((f) => f());
			el.querySelector('.cfx2-pop-reset').disabled = !this.cfg.tune[spec.name];
		};
		el.querySelector('.cfx2-pop-reset').addEventListener('click', () => { this.setTune(spec.name, null, true); paint(); });

		// Beside the tile: on its right where the screen has room, else on its left; its top on the tile's, or its bottom
		// on the tile's near the foot of the screen. CSS anchor positioning does it (plugin.css: .cfx2-pop.anchored) and
		// keeps it there as the page scrolls; without it, the same is worked out here.
		wrap.style.setProperty('anchor-name', '--cfx2-tune');
		const anchored = CSS.supports?.('position-anchor: --cfx2-tune') && CSS.supports('position-try-fallbacks: flip-inline');
		const place = () => {
			if (anchored) return;
			const wr = wrap.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, gap = 10;
			const vw = window.innerWidth, vh = window.innerHeight;
			const right = wr.right + gap + w <= vw - 8 || wr.left - gap - w < 8;
			el.dataset.side = right ? 'right' : 'left';
			el.style.left = `${right ? wr.right + gap : wr.left - gap - w}px`;
			el.style.top = `${clamp(wr.top + h <= vh - 8 ? wr.top : wr.bottom - h, 8, Math.max(8, vh - h - 8))}px`;
		};
		el.classList.add(anchored ? 'anchored' : 'placed');
		paint();
		place();

		const off = [];
		const on = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); off.push(() => t.removeEventListener(type, fn, opts)); };
		on(document, 'pointerdown', (e) => { if (!el.contains(e.target) && !gear.contains(e.target)) this.closeTune(); }, true);
		on(document, 'keydown', (e) => { if (e.key === 'Escape' && this.tunePop?.el === el) { e.stopPropagation(); this.closeTune(); gear.focus(); } }, true);
		on(window, 'resize', place);
		if (!anchored) on(pg.root.closest('.cfx2-scroll') || window, 'scroll', place, { passive: true });
		el.addEventListener('mousedown', (e) => { if (!e.target.closest('.cfx2-sl-track')) e.preventDefault(); });   // the scratch pad keeps its focus

		wrap.classList.add('tuning');
		gear.setAttribute('aria-expanded', 'true');
		this.tunePop = { el, spec, wrap, gear, off };
		requestAnimationFrame(() => el.classList.add('in'));
	}

	closePage() {
		this.closeTune();
		cancelAnimationFrame(this.demoRaf);
		this.demoRaf = 0;
		this.demoObserver?.disconnect();
		this.demoObserver = null;
		this.demoTiles = [];
		if (!this.page) return;
		this.page = null;
		if (this.caretEl && this.caretEl.classList.contains('cfx2-pcaret')) { this.caretEl = null; this.lastRect = null; this.clipT = 0; }
	}
}
