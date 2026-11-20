/**
 * DontSpy - a lock in every panel's title bar (left of the split-view button) that keeps what you write from being read
 * over your shoulder.
 *
 * A locked panel hides its text. What stays readable is a window around the caret - its word, its sentence, its
 * paragraph, or everything - and while you type, the word you are typing shows only its last letter. The page itself
 * is never touched: the hiding is a layer over it.
 *
 *   - The real glyphs are made transparent with the CSS Custom Highlight API (CSS.highlights, ::highlight() in plugin.css),
 *     a highlight over every stretch of text that is to be hidden. Nothing in the editor's DOM changes, so editing, undo,
 *     sync and the other plugins see the text as it is.
 *   - What is drawn in its place is a canvas over the window (the same trick Caret FX uses): each hidden character's box
 *     is read back from the DOM (Range.getBoundingClientRect) and a mask is painted on it: a bar, a pixelated copy, a
 *     scribble, code rain, and so on. Thymer's editor draws its caret and its selection as layers of their own
 *     (.listview-carets, .listview-selections), so the caret is found from its element, and the selection's rectangles
 *     are painted again on top of the masks.
 *
 * HOW IT WORKS
 *   refresh() runs on every change that could show or hide something (a DOM mutation inside a locked panel - run
 *   synchronously, before the browser paints -, the selection moving, scrolling, resizing). It works out per line what is
 *   revealed (revealFor), turns the rest into highlight ranges and, for the canvas styles, into runs of character boxes
 *   that draw() paints. Typing mode (see onKey) is entered on an edit key and left when the caret is moved on purpose.
 *
 * HOW TO ADD A STYLE
 *   STYLES.myid = { label, note, animated?, draw(ctx, run, env) }. The real glyphs are always made transparent; draw() paints the stand-in on the canvas, one box-run at a time:
 *   run = { chars: [{ ch, x, y, w, h, key }], x0, y0, x1, y1, st: { font, color, size }, seed }.
 */

// What the popover and the commands choose is kept in this device's localStorage and laid over the configuration JSON, which
// stays the place for defaults (saving the plugin's configuration reloads the plugin, so a click cannot do it).
const CHOICES_KEY = 'dontspy.choices';
const DEFAULTS = { style: 'bars', color: null, scope: 'word', typing: 'last', pause: 0, startLocked: false };
const COLORS = [['#22c05a', 'Green'], ['#22d3ee', 'Cyan'], ['#f5a524', 'Amber'], ['#ef4444', 'Red'], ['#ec4899', 'Pink'], ['#8b5cf6', 'Violet'], ['#f4f4f5', 'White']];
function loadChoices() {
	try { return JSON.parse(localStorage.getItem(CHOICES_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function saveChoices(patch) {
	try { localStorage.setItem(CHOICES_KEY, JSON.stringify({ ...loadChoices(), ...patch })); } catch (e) { /* kept for this visit only */ }
}

// Thymer DOM this relies on.
const PANEL_SEL = '.panel';
const BAR_ICONS_SEL = '.panel-bar--icons';       // the row of buttons at the right of a panel's title bar
const SPLIT_SEL = '.panel-options-icon';         // its "Panel Options" (split view) button
const LINE_SEL = '.line-div, .ds-line';          // the element that holds a line's text (.ds-line: a line of the settings page's pad)
const LOCK_SEL = '.panel, .ds-pad';              // what can be locked: a panel, or the pad on the settings page
const PAGE_TYPE = 'dontspy';                     // the settings page's panel type (registerCustomPanelType)
const PAD_KEY = 'dontspy.pad';                   // what was typed in the pad, kept on this device
const PAD_DEFAULT = ['Type here: all of this is hidden except the word at the caret, and the word you are typing shows only its last letter.', 'A second paragraph. Click into it and the first one goes dark.', 'Pick another look below; it applies to every locked panel.'];
const FOCUSED_PANEL_SEL = '.panel.focused-panel, .panel.has-focus';   // the panel being written in
const SCROLLER_SEL = '.panel-scroller-y';        // the area in which a panel's lines scroll

const MAX_CHARS = 9000;     // most characters laid out per refresh; the rest of a very long page is hidden without a mask drawn on it
const FRAME_MS = 70;        // the shuffle's tick

const SCOPES = [['word', 'Word'], ['sentence', 'Sentence'], ['paragraph', 'Paragraph'], ['all', 'Everything']];

// =====================================================================================
// TEXT: WHAT IS AROUND THE CARET
// =====================================================================================

const isLetter = (ch) => /[\p{L}\p{N}\p{M}_]/u.test(ch);

/** Is the character at i part of a word? An apostrophe or a hyphen is, between two letters. */
function wordChar(t, i) {
	if (i < 0 || i >= t.length) return false;
	const c = t[i];
	if (isLetter(c)) return true;
	if ((c === "'" || c === '’' || c === '-') && i > 0 && i < t.length - 1) return isLetter(t[i - 1]) && isLetter(t[i + 1]);
	return false;
}

/** The word touching the caret ([from, to) in the line's text), the one on its left first; null between words. */
function wordAt(t, idx) {
	let a, b;
	if (wordChar(t, idx - 1)) { a = idx - 1; b = idx; }
	else if (wordChar(t, idx)) { a = idx; b = idx; }
	else return null;
	while (wordChar(t, a - 1)) a--;
	while (wordChar(t, b)) b++;
	return [a, b];
}

/** The sentence the caret is in; the space after a sentence belongs to it, so a caret about to start the next one still sees the last. */
function sentenceAt(t, idx) {
	const re = /[.!?…]+["'”’)\]]*(?=\s|$)|\n/g;
	let start = 0, last = null, m;
	while ((m = re.exec(t))) {
		const end = m.index + m[0].length;
		let next = end;
		while (next < t.length && /\s/.test(t[next])) next++;
		last = [start, end];
		if (idx < next) return last;
		start = next;
		if (re.lastIndex < next) re.lastIndex = next;
	}
	if (start < t.length) return [start, t.length];
	return last || [0, t.length];
}

/** Takes [x, y) out of a list of intervals. */
function subtract(list, [x, y]) {
	const out = [];
	for (const [a, b] of list) {
		if (y <= a || x >= b) out.push([a, b]);
		else { if (x > a) out.push([a, x]); if (y < b) out.push([y, b]); }
	}
	return out;
}

/** What is left of [0, len) once the revealed intervals are taken out. */
function complement(reveal, len) {
	const out = [];
	let pos = 0;
	for (const [a, b] of reveal.filter(([p, q]) => q > p).sort((p, q) => p[0] - q[0])) {
		if (a > pos) out.push([pos, a]);
		pos = Math.max(pos, b);
	}
	if (pos < len) out.push([pos, len]);
	return out;
}

/** A line's text nodes, in reading order, where each begins in the line's text, and the text itself. */
function lineInfo(line) {
	const nodes = [], starts = [];
	let text = '';
	const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
	for (let n = walk.nextNode(); n; n = walk.nextNode()) { nodes.push(n); starts.push(text.length); text += n.data; }
	return { nodes, starts, text };
}

// =====================================================================================
// MASKS
// =====================================================================================

const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; };
/** A number in [0, 1) from an integer seed; the same seed always gives the same number. */
const rand = (seed) => {
	let t = (seed + 0x6d2b79f5) | 0;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SHOWN = 1;      // the share of a word's letters that Matrix shows a glyph for (lower it, e.g. 0.6, for a sparser look)
const MATRIX = Array.from('0123456789ZXCVBNMQWERTYUIOPASDFGHJKL');   // letters and digits only: no symbols
const HEX = Array.from('0123456789ABCDEF');
const BRAILLE = Array.from({ length: 192 }, (_, i) => String.fromCharCode(0x2840 + i));

/** A character from a pool that changes by itself every so often (lo..hi ms, a different rhythm per key). The same key and time always give the same one. */
function flick(pool, key, now, lo, hi) {
	const period = lo + rand(key ^ 0x9e37) * (hi - lo), phase = rand(key ^ 0x7f4a) * period;
	const step = Math.floor((now + phase) / period);
	return pool[Math.floor(rand((Math.imul(key, 31) + step) | 0) * pool.length)];
}

/** A style made of one glyph per character: pick(c, i, now, run) names the glyph; opts: color, alpha. */
/** A #rrggbb colour mixed towards white by t (0..1). */
function lighten(hex, t) {
	const n = parseInt(String(hex).replace('#', '').padStart(6, '0').slice(0, 6), 16);
	const m = (v) => Math.round(v + (255 - v) * t);
	return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
}

/** The colour a style paints in: the one chosen in the settings, else the text's own. */
const colorOf = (run, env) => (env && env.color) || run.st.color;

function glyphStyle(pick, opts = {}) {
	return (ctx, run, env) => {
		ctx.font = run.st.font;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = colorOf(run, env);
		ctx.globalAlpha = opts.alpha || 0.9;
		run.chars.forEach((c, i) => ctx.fillText(pick(c, i, env.now, run), c.x + c.w / 2, c.y + c.h * 0.54, Math.max(1, c.w * 1.15)));
		ctx.globalAlpha = 1;
	};
}

function pill(ctx, x, y, w, h, r) {
	ctx.beginPath();
	if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
	ctx.fill();
}

function drawBars(ctx, run, env) {
	const h = run.y1 - run.y0;
	ctx.fillStyle = colorOf(run, env);
	ctx.globalAlpha = 0.86;
	pill(ctx, run.x0 - 1, run.y0 + h * 0.15, run.x1 - run.x0 + 2, h * 0.7, h * 0.3);
	ctx.globalAlpha = 1;
}

let mosaicCanvas = null;
/** The word drawn at its true size onto a tiny canvas (one pixel per block), then stretched back up without smoothing. */
function drawMosaic(ctx, run, env) {
	const w = run.x1 - run.x0, h = run.y1 - run.y0;
	const B = Math.max(4, Math.round(run.st.size * 0.55));
	const sw = Math.ceil(w / B) + 1, sh = Math.ceil(h / B) + 1;
	if (!mosaicCanvas) mosaicCanvas = document.createElement('canvas');
	mosaicCanvas.width = sw;
	mosaicCanvas.height = sh;
	const m = mosaicCanvas.getContext('2d');
	m.setTransform(1 / B, 0, 0, 1 / B, 0, 0);
	m.font = run.st.font;
	m.fillStyle = colorOf(run, env);
	m.textAlign = 'left';
	m.textBaseline = 'middle';
	for (const c of run.chars) m.fillText(c.ch, c.x - run.x0, c.y - run.y0 + c.h * 0.54);
	const smooth = ctx.imageSmoothingEnabled;
	ctx.imageSmoothingEnabled = false;
	ctx.globalAlpha = 0.95;
	ctx.drawImage(mosaicCanvas, 0, 0, sw, sh, run.x0, run.y0, sw * B, sh * B);
	ctx.globalAlpha = 1;
	ctx.imageSmoothingEnabled = smooth;
}

/**
 * Code that rewrites itself: every word is a still run of green glyphs (letters and digits only), and now and then - each word at its own, rare,
 * random moment (every 6 to 20 seconds) - it is typed over, left to right, a bright cursor passing along it, and
 * settles into new glyphs.
 */
function drawMatrix(ctx, run, env) {
	const base = env.color || '#22c05a', bright = lighten(base, 0.78);
	const period = 6000 + rand(run.seed ^ 0x51) * 14000, u = (env.now + rand(run.seed ^ 0x2b) * period) / period;
	const cycle = Math.floor(u), ms = (u - cycle) * period;   // ms: how long ago this word's rewrite began
	const STEP = 85;   // ms per letter
	ctx.font = run.st.font;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	run.chars.forEach((c, i) => {
		const due = i * STEP, fresh = ms >= due;   // the rewrite has reached this letter
		const gen = Math.imul(c.key, 31) + (fresh ? cycle : cycle - 1) * 7;
		if (rand((gen ^ 0x3c6e) | 0) > SHOWN) return;   // only some of the letters carry a glyph, and which ones changes with each rewrite
		const glyph = MATRIX[Math.floor(rand(gen | 0) * MATRIX.length)];
		const cursor = fresh && ms < due + STEP * 2.2;
		ctx.fillStyle = cursor ? bright : base;
		ctx.globalAlpha = cursor ? 1 : 0.82;
		ctx.fillText(glyph, c.x + c.w / 2, c.y + c.h * 0.54, Math.max(c.w * 1.15, run.st.size * 0.6));   // a narrow slot (an i) does not squash a wide glyph
	});
	ctx.globalAlpha = 1;
}

/** One to three bars per character, of different widths, like a barcode. */
function drawBarcode(ctx, run, env) {
	const h = run.y1 - run.y0;
	ctx.fillStyle = colorOf(run, env);
	ctx.globalAlpha = 0.88;
	for (const c of run.chars) {
		const bars = 1 + Math.floor(rand(c.key) * 3), unit = (c.w * 0.86) / (bars * 2 - 1);
		for (let b = 0; b < bars; b++) {
			const w = unit * (0.7 + rand(c.key + 11 * b + 5) * 1.3);
			ctx.fillRect(c.x + c.w * 0.07 + b * unit * 2, run.y0 + h * 0.17, Math.min(w, unit * 1.9), h * 0.66);
		}
	}
	ctx.globalAlpha = 1;
}

const noisePatterns = new WeakMap();
/** Snow: a tile of grey noise, shifted to a new place every tick, shown through each word's box. */
function drawStatic(ctx, run, env) {
	let pat = noisePatterns.get(ctx);
	if (!pat) {
		const tile = document.createElement('canvas');
		tile.width = tile.height = 96;
		const n = tile.getContext('2d'), d = n.createImageData(96, 96);
		for (let i = 0; i < 96 * 96; i++) {
			const v = rand(i * 7919 + 13) < 0.5 ? 20 : 235;
			d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v;
			d.data[i * 4 + 3] = 70 + rand(i * 104729 + 5) * 170;
		}
		n.putImageData(d, 0, 0);
		pat = ctx.createPattern(tile, 'repeat');
		noisePatterns.set(ctx, pat);
	}
	const h = run.y1 - run.y0, tick = Math.floor(env.now / 65) ^ run.seed;
	const ox = Math.floor(rand(tick) * 96), oy = Math.floor(rand(tick + 977) * 96);
	ctx.save();
	ctx.translate(ox, oy);
	ctx.fillStyle = pat;
	ctx.globalAlpha = 0.85;
	pill(ctx, run.x0 - 1 - ox, run.y0 + h * 0.13 - oy, run.x1 - run.x0 + 2, h * 0.74, h * 0.18);
	ctx.restore();
}

/** A wavy scrawl in place of the word, like unreadable handwriting. */
function drawSquiggle(ctx, run, env) {
	const h = run.y1 - run.y0, mid = run.y0 + h * 0.58, unit = run.st.size * 0.55;
	const p1 = rand(run.seed) * 6.28, p2 = rand(run.seed + 1) * 6.28;
	ctx.strokeStyle = colorOf(run, env);
	ctx.lineWidth = Math.max(1.1, run.st.size * 0.09);
	ctx.lineCap = ctx.lineJoin = 'round';
	ctx.globalAlpha = 0.82;
	ctx.beginPath();
	for (let x = run.x0; x <= run.x1 + 1; x += 1.5) {
		const k = (x - run.x0) / unit;
		const amp = 0.3 + 0.7 * Math.abs(Math.sin(k * 0.8 + p1));
		const y = mid + Math.sin(k * 3.4 + p2) * h * 0.27 * amp;
		if (x === run.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.stroke();
	ctx.globalAlpha = 1;
}

/** A permanent marker: a thick uneven stroke, twice over. */
function drawMarker(ctx, run, env) {
	const h = run.y1 - run.y0, r = Math.max(h * 0.25, 2);
	const x0 = run.x0 + r * 0.6, x1 = Math.max(x0 + 1, run.x1 - r * 0.6), mid = run.y0 + h * 0.52;
	const j = (k) => (rand(run.seed + k) - 0.5) * h * 0.18;
	ctx.strokeStyle = colorOf(run, env);
	ctx.lineCap = 'round';
	ctx.lineWidth = h * 0.52;
	ctx.globalAlpha = 0.9;
	ctx.beginPath(); ctx.moveTo(x0, mid + j(1)); ctx.lineTo(x1, mid + j(2)); ctx.stroke();
	ctx.lineWidth = h * 0.4;
	ctx.globalAlpha = 0.55;
	ctx.beginPath(); ctx.moveTo(x1, mid + j(3) + h * 0.07); ctx.lineTo(x0, mid + j(4) - h * 0.05); ctx.stroke();
	ctx.globalAlpha = 1;
}

/** The styles. `mask` is the highlight that makes the real glyphs go; `draw` paints what stands in their place. */
const STYLES = {
	bars: { label: 'Bars', note: 'A bar over each word', draw: drawBars },
	mosaic: { label: 'Mosaic', note: 'A pixelated silhouette', draw: drawMosaic },
	matrix: { label: 'Matrix', note: 'Words rewrite themselves now and then', animated: true, frame: 45, draw: drawMatrix },
	braille: { label: 'Braille', note: 'Dots that are not words', draw: glyphStyle((c) => BRAILLE[Math.floor(rand(c.key) * BRAILLE.length)], { alpha: 0.85 }) },
	hex: { label: 'Hex', note: 'Flickering hex digits', animated: true, draw: glyphStyle((c, i, now) => flick(HEX, c.key, now, 220, 900)) },
	barcode: { label: 'Barcode', note: 'Bars of different widths', draw: drawBarcode },
	static: { label: 'Static', note: 'TV snow', animated: true, draw: drawStatic },
	squiggle: { label: 'Squiggle', note: 'An unreadable scrawl', draw: drawSquiggle },
	marker: { label: 'Marker', note: 'Permanent marker', draw: drawMarker },
};

/** A run of characters laid out along a line, for the popover's samples (no DOM to read the boxes from). */
function syntheticRun(ctx, text, x, y, st) {
	ctx.font = st.font;
	const chars = [];
	let cx = x, i = 0;
	for (const ch of text) {
		const w = ctx.measureText(ch).width;
		if (ch !== ' ') chars.push({ ch, x: cx, y, w, h: st.size * 1.25, key: 7 + i });
		cx += w;
		i++;
	}
	return { chars, x0: x, y0: y, x1: cx, y1: y + st.size * 1.25, st, seed: 3 };
}

/** A word of one style drawn on a canvas that is not the window's (the style chips); each word of the text is a run of its own, as on a page. */
function drawSample(ctx, id, text, x, y, st, now, color) {
	const style = STYLES[id];
	if (style.draw) {
		let cx = x;
		for (const word of text.split(' ')) {
			ctx.font = st.font;
			style.draw(ctx, syntheticRun(ctx, word, cx, y, st), { now, color });
			ctx.font = st.font;
			cx += ctx.measureText(word + ' ').width;
		}
		return;
	}
}

// =====================================================================================
// THE PLUGIN
// =====================================================================================

class Plugin extends AppPlugin {
	cfg = { ...DEFAULTS };
	locked = new Set();         // the panel elements that are locked
	seen = new WeakSet();       // the panels the lock button has been put in (startLocked applies to a panel once)
	typing = false;             // typing mode: the word being typed shows only its last letter
	pauseTimer = 0;
	watching = false;           // the loop that notices the caret moving (see watchCaret)
	watchRaf = 0;
	lastSig = '';
	nodeIds = new WeakMap();
	nodeCount = 0;
	canvas = null;
	ctx = null;
	layout = [];                // what the canvas shows: { clip, runs } per locked panel
	raf = 0;
	rafPending = 0;
	lastTick = 0;
	pop = null;
	popRaf = 0;
	cleanup = [];
	styleCache = new Map();     // element -> its font and colour, for one refresh
	clipCache = new Map();      // element -> the part of the window it shows, for one refresh

	onLoad() {
		this.readConfig();
		this.supported = !!(window.CSS && CSS.highlights && window.Highlight);
		if (!this.supported) this.ui.addToaster({ title: 'DontSpy', message: 'This version of Thymer cannot hide text (no CSS Custom Highlight API).', dismissible: true });
		this.mountCanvas();

		const listen = (target, type, fn, opts) => {
			target.addEventListener(type, fn, opts);
			this.cleanup.push(() => target.removeEventListener(type, fn, opts));
		};
		const cap = { capture: true, passive: true };
		listen(document, 'keydown', (e) => this.onKey(e), cap);
		listen(document, 'input', () => this.refresh(), cap);
		listen(document, 'pointerdown', (e) => this.onPointer(e), cap);
		listen(document, 'selectionchange', () => this.schedule());
		listen(document, 'scroll', () => this.schedule(), cap);
		listen(window, 'resize', () => { this.sizeCanvas(); this.schedule(); });
		listen(document, 'keydown', (e) => { if (e.key === 'Escape' && this.pop) this.closePop(); }, cap);

		// Thymer rebuilds a panel's button row whenever it refreshes it, so the lock is put back each time; and a mutation inside a
		// locked panel is handled here, in the microtask after it, before the browser paints (a typed letter must not show for a frame).
		this.tree = new MutationObserver((muts) => {
			let bars = false, text = false;
			for (const m of muts) {
				const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
				if (!el || !el.closest) continue;
				if (!bars && (el.closest('.panel-bar') || (m.addedNodes.length && Array.from(m.addedNodes).some((n) => n.nodeType === 1 && (n.matches?.('.panel, .panel-bar, .panel-bar--icons') || n.querySelector?.('.panel-bar--icons')))))) bars = true;
				if (!text && this.lockRootOf(el)) text = true;
			}
			if (bars) this.ensureButtons();
			if (text) this.refresh();
		});
		this.tree.observe(document.body, { childList: true, subtree: true, characterData: true });
		this.cleanup.push(() => this.tree.disconnect());

		this.ro = new ResizeObserver(() => this.schedule());
		this.cleanup.push(() => this.ro.disconnect());

		this.ui.registerCustomPanelType(PAGE_TYPE, (panel) => this.renderPage(panel));
		this.ui.addCommandPaletteCommand({ label: 'DontSpy: open settings', icon: 'ti-adjustments', onSelected: () => this.openPage() });
		this.ui.addCommandPaletteCommand({ label: 'DontSpy: lock or unlock this panel', icon: 'ti-lock', onSelected: () => { const p = this.activePanelEl(); if (p) this.toggle(p); } });
		this.ui.addCommandPaletteCommand({ label: 'DontSpy: lock all panels', icon: 'ti-lock', onSelected: () => this.setAll(true) });
		this.ui.addCommandPaletteCommand({ label: 'DontSpy: unlock all panels', icon: 'ti-eye', onSelected: () => this.setAll(false) });
		this.ui.addCommandPaletteCommand({ label: 'DontSpy: quick options', icon: 'ti-settings', onSelected: () => this.openPop(this.activeButton()) });
		this.ui.addCommandPaletteCommand({ label: 'DontSpy: next style', icon: 'ti-palette', onSelected: () => { const ids = Object.keys(STYLES); this.update({ style: ids[(ids.indexOf(this.cfg.style) + 1) % ids.length] }); } });

		this.events.on('global-plugin.updated', () => this.readConfig());
		this.ensureButtons();
	}

	onUnload() {
		cancelAnimationFrame(this.raf);
		cancelAnimationFrame(this.rafPending);
		cancelAnimationFrame(this.watchRaf);
		this.watching = false;
		clearTimeout(this.pauseTimer);
		this.closePop();
		cancelAnimationFrame(this.pageRaf);
		this.cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
		this.cleanup = [];
		for (const p of this.locked) p.removeAttribute('data-dontspy');
		this.locked.clear();
		this.clearHighlights();
		document.querySelectorAll('.dontspy-btn').forEach((b) => b.remove());
		if (this.canvas) this.canvas.remove();
		this.canvas = null;
	}

	// ---------------------------------------------------------------- settings

	readConfig() {
		try {
			const custom = this.getConfiguration()?.custom || {};
			this.cfg = { ...DEFAULTS, ...custom, ...loadChoices() };
		} catch (e) { this.cfg = { ...DEFAULTS, ...loadChoices() }; }
		if (!STYLES[this.cfg.style]) this.cfg.style = DEFAULTS.style;
		this.refresh();
	}

	update(patch) {
		this.cfg = { ...this.cfg, ...patch };
		saveChoices(patch);
		if ('typing' in patch || 'pause' in patch) { this.typing = false; clearTimeout(this.pauseTimer); }
		this.renderPop();
		this.refresh();
	}

	// ---------------------------------------------------------------- the lock button

	ensureButtons() {
		let locked = false;
		for (const bar of document.querySelectorAll(BAR_ICONS_SEL)) {
			const panel = bar.closest(PANEL_SEL);
			if (!panel) continue;
			if (!this.seen.has(panel) && bar.querySelector(SPLIT_SEL)) {
				this.seen.add(panel);
				if (this.cfg.startLocked) { this.lock(panel, true, true); locked = true; }
			}
			if (bar.querySelector('.dontspy-btn')) continue;
			const split = bar.querySelector(SPLIT_SEL);
			if (!split) continue;   // the sidebar's panel has no split button, and no lock
			const btn = document.createElement('span');
			btn.className = 'tooltip no-selection panel-icon-button ti ti-lock dontspy-btn';   // Thymer's icon font has ti-lock but no ti-lock-open: an unlocked panel shows the same lock, dimmed
			btn.setAttribute('data-tooltip-dir', 'bottom');
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (e.shiftKey || e.altKey) this.openPop(btn); else this.toggle(btn.closest(PANEL_SEL));
			});
			btn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.openPop(btn); });
			split.parentNode.insertBefore(btn, split);
			this.syncButton(btn, panel);
		}
		if (locked) this.refresh();
	}

	syncButton(btn, panel = btn.closest(PANEL_SEL)) {
		const on = !!panel && this.locked.has(panel);
		btn.classList.toggle('on', on);
		btn.setAttribute('data-tooltip', on ? 'Locked: click to unlock (right-click for options)' : 'Hide this panel from onlookers (right-click for options)');
	}

	syncButtons() { document.querySelectorAll('.dontspy-btn').forEach((b) => this.syncButton(b)); }

	activePanelEl() {
		const sel = window.getSelection();
		const n = sel && sel.focusNode;
		const fromSel = n && (n.nodeType === 1 ? n : n.parentElement)?.closest?.(PANEL_SEL);
		if (fromSel) return fromSel;
		try { const el = this.ui.getActivePanel()?.getElement(); return el ? el.closest(PANEL_SEL) || el : null; } catch (e) { return null; }
	}

	activeButton() { const p = this.activePanelEl(); return (p && p.querySelector('.dontspy-btn')) || document.querySelector('.dontspy-btn'); }

	toggle(panel) { if (panel) this.lock(panel, !this.locked.has(panel)); }

	lock(panel, on, quiet = false) {
		if (on) { this.locked.add(panel); panel.setAttribute('data-dontspy', ''); this.ro.observe(panel); this.watchCaret(); }
		else { this.locked.delete(panel); panel.removeAttribute('data-dontspy'); this.ro.unobserve(panel); }
		this.typing = false;
		if (quiet) return;
		this.syncButtons();
		this.refresh();
	}

	/**
	 * Thymer moves its caret element itself (no selectionchange from the browser, no DOM mutation in the text), so what
	 * the caret is on is looked at once a frame while anything is locked, and refresh() runs when it has changed.
	 */
	watchCaret() {
		if (this.watching) return;
		this.watching = true;
		const tick = () => {
			if (!this.locked.size) { this.watching = false; return; }
			const sig = this.caretSig();
			if (sig !== this.lastSig) { this.lastSig = sig; this.refresh(); }
			this.watchRaf = requestAnimationFrame(tick);
		};
		this.watchRaf = requestAnimationFrame(tick);
	}

	/** Where the carets of the locked panels stand, and the browser's selection, as a string that changes when either does. */
	caretSig() {
		let sig = '';
		for (const c of document.querySelectorAll('div.listview-caret-self')) {
			if (!this.lockRootOf(c)) continue;
			const r = c.getBoundingClientRect();
			sig += `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.height)};`;
		}
		const sel = window.getSelection();
		if (sel && sel.focusNode) {
			let id = this.nodeIds.get(sel.focusNode);
			if (!id) { id = ++this.nodeCount; this.nodeIds.set(sel.focusNode, id); }
			sig += `|${id}:${sel.focusOffset}`;
		}
		return sig;
	}

	setAll(on) {
		for (const bar of document.querySelectorAll(BAR_ICONS_SEL)) { const p = bar.closest(PANEL_SEL); if (p && bar.querySelector(SPLIT_SEL)) this.lock(p, on, true); }
		this.syncButtons();
		this.refresh();
	}

	// ---------------------------------------------------------------- typing mode

	/** Typing mode starts at an edit key and ends when the caret is moved on purpose (arrows, a click) or, if chosen, after a pause. */
	onKey(e) {
		if (!this.locked.size) return;
		const root = this.lockRootOf(e.target) || this.focusedLockRoot(e.target);
		if (!root) return;
		const k = e.key || '';
		if (/^(Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(k)) {
			if (this.typing) { this.typing = false; clearTimeout(this.pauseTimer); this.schedule(); }
			return;
		}
		const printable = k.length === 1 && (!(e.ctrlKey || e.metaKey) || e.getModifierState?.('AltGraph'));
		const edit = printable || k === 'Backspace' || k === 'Delete' || k === 'Enter' || k === 'Dead' || k === 'Process' || ((e.ctrlKey || e.metaKey) && /^[vxzy]$/i.test(k));
		if (!edit) return;
		this.typing = true;
		clearTimeout(this.pauseTimer);
		if (this.cfg.pause > 0) this.pauseTimer = setTimeout(() => { this.typing = false; this.refresh(); }, this.cfg.pause);
	}

	onPointer(e) {
		if (this.pop && !e.target.closest?.('.dontspy-pop, .dontspy-btn')) this.closePop();
		if (!this.typing) return;
		if (this.lockRootOf(e.target)) { this.typing = false; clearTimeout(this.pauseTimer); this.schedule(); }
	}

	/** The locked panel (or pad) a node is in. The locked elements are asked rather than walked up to, so a panel nested in another element of the same class cannot be missed. */
	lockRootOf(node) {
		if (!node) return null;
		let found = null;
		for (const p of this.locked) if (p.contains(node) && (!found || found.contains(p))) found = p;   // the innermost
		return found;
	}

	/** Keys typed with the focus outside the editor (Thymer's editor takes keys on an element of its own): the focused panel, when it is locked and no menu is open. */
	focusedLockRoot(target) {
		if (target && target.closest && target.closest('.cmdpal--dialog, .dropdown, .modal-container, .link-menu-visible')) return null;
		const f = document.querySelector(FOCUSED_PANEL_SEL);
		return f && this.locked.has(f) ? f : null;
	}

	// ---------------------------------------------------------------- what is shown

	/** The line the caret is in, and where in it, when that is in a locked panel: from the browser's selection when that is in a line, else from Thymer's own caret element. */
	caretState() {
		const sel = window.getSelection();
		if (sel && sel.rangeCount && sel.focusNode) {
			const node = sel.focusNode;
			const el = node.nodeType === 1 ? node : node.parentElement;
			let line = el && el.closest ? el.closest(LINE_SEL) : null, idx = 0;
			if (line) {
				const r = document.createRange();
				r.setStart(line, 0);
				r.setEnd(node, sel.focusOffset);
				idx = r.toString().length;
				const panel = this.lockRootOf(line);
				if (panel) return { panel, line, idx, text: lineInfo(line).text };
			}
		}
		return this.caretElementState();
	}

	/** Thymer draws its caret as an element of its own (div.listview-caret-self, in .listview-carets); the row it is in carries .listitem-with-caret, and its position gives the index in the line. */
	caretElementState() {
		const focused = document.querySelector(FOCUSED_PANEL_SEL);
		for (const caret of document.querySelectorAll('div.listview-caret-self')) {
			const panel = this.lockRootOf(caret);
			if (!panel) continue;
			if (focused && !focused.contains(caret) && !panel.contains(focused)) continue;   // the caret of a panel that is not the one being written in
			const r = caret.getBoundingClientRect();
			if (r.height < 1) continue;
			const x = r.left + 1, midY = r.top + r.height / 2;
			const within = (ln) => { const b = ln.getBoundingClientRect(); return midY >= b.top - 2 && midY <= b.bottom + 2; };
			const row = panel.querySelector('.listitem.listitem-with-caret[data-guid]');
			let line = row && row.querySelector(LINE_SEL);
			if (!line || !within(line)) {
				const hit = document.elementFromPoint(x, midY);
				line = hit && hit.closest ? hit.closest(LINE_SEL) || hit.closest('.listitem')?.querySelector(LINE_SEL) : null;
				if (line && !panel.contains(line)) line = null;
			}
			if (!line) continue;
			const info = lineInfo(line);
			return { panel, line, idx: this.indexAt(line, x, midY, info.text.length), text: info.text };
		}
		return null;
	}

	/** The index in a line's text of the boundary nearest a point (the browser's own hit-testing, so wrapped lines are right). */
	indexAt(line, x, y, len) {
		let range = null;
		try {
			if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(x, y);
			else if (document.caretPositionFromPoint) {
				const pos = document.caretPositionFromPoint(x, y);
				if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
			}
		} catch (e) { range = null; }
		if (range && range.startContainer && line.contains(range.startContainer)) {
			const r = document.createRange();
			r.setStart(line, 0);
			r.setEnd(range.startContainer, range.startOffset);
			return r.toString().length;
		}
		return x >= line.getBoundingClientRect().right - 4 ? len : 0;
	}

	/** The intervals of the caret's line that stay readable. */
	revealFor(st) {
		const { text, idx } = st, len = text.length;
		const scope = this.cfg.scope;
		let reveal;
		if (scope === 'word') { const w = wordAt(text, idx); reveal = w ? [w] : []; }
		else if (scope === 'sentence') reveal = [sentenceAt(text, idx)];
		else reveal = [[0, len]];
		if (this.typing && this.cfg.typing === 'last') {
			// The word being typed keeps only its last letter; the rest of what the scope shows is left as it is.
			const w = wordAt(text, idx);
			if (w) {
				reveal = subtract(reveal, w);
				if (idx - 1 >= w[0]) reveal.push([idx - 1, idx]);
			}
		}
		return reveal;
	}

	schedule() {
		if (this.rafPending || !this.locked.size) return;
		this.rafPending = requestAnimationFrame(() => { this.rafPending = 0; this.refresh(); });
	}

	clearHighlights() {
		if (!this.supported) return;
		CSS.highlights.delete('dontspy-ink');
	}

	/** Works out what to hide and paints it. Everything that can change what is shown ends up here. */
	refresh() {
		for (const p of this.locked) if (!p.isConnected) { this.locked.delete(p); this.ro.unobserve(p); }
		if (!this.supported) return;
		const style = STYLES[this.cfg.style];
		if (!this.locked.size) {
			this.clearHighlights();
			this.layout = [];
			this.paint();
			if (this.canvas) this.canvas.style.display = 'none';
			return;
		}
		this.styleCache.clear();
		this.clipCache.clear();
		const st = this.caretState();
		const ranges = [];
		const layout = [];
		const env = { count: 0, rng: document.createRange() };
		for (const panel of this.locked) {
			const lines = panel.querySelectorAll(LINE_SEL);
			const scroller = panel.querySelector(SCROLLER_SEL) || panel;
			let cr = scroller.getBoundingClientRect();
			if (panel.matches(PANEL_SEL)) {   // content scrolls under the panel's title bar: nothing is painted over it
				const pr = panel.getBoundingClientRect();
				const top = Math.max(cr.top, pr.top, this.barBottom(panel, pr)), bottom = Math.min(cr.bottom, pr.bottom);
				cr = { left: cr.left, right: cr.right, top, bottom: Math.max(top, bottom), width: cr.width, height: Math.max(0, bottom - top) };
			} else {   // the pad sits in a page that scrolls: show it only where that page is
				const body = panel.closest(PANEL_SEL)?.querySelector('.panel-body')?.getBoundingClientRect();
				if (body) {
					const l = Math.max(cr.left, body.left), t = Math.max(cr.top, body.top), r = Math.min(cr.right, body.right), b = Math.min(cr.bottom, body.bottom);
					cr = { left: l, top: t, right: Math.max(l, r), bottom: Math.max(t, b), width: Math.max(0, r - l), height: Math.max(0, b - t) };
				}
			}
			const group = { clip: { x: cr.left, y: cr.top, w: cr.width, h: cr.height }, runs: [], sel: [] };
			for (const line of lines) {
				let hidden = null;   // null: the whole line
				if (st && line === st.line) hidden = complement(this.revealFor(st), st.text.length);
				else if (this.cfg.scope === 'all') continue;
				if (hidden && !hidden.length) continue;
				this.addRanges(ranges, line, hidden);
				if (style.draw && env.count < MAX_CHARS) {
					// A line shows only where everything it sits in lets it (a card in a gallery clips its preview).
					const clip = this.clipOf(line, panel, group.clip);
					const lr = line.getBoundingClientRect();
					if (clip.w > 0 && clip.h > 0 && lr.bottom >= clip.y && lr.top <= clip.y + clip.h && lr.right >= clip.x && lr.left <= clip.x + clip.w) this.addRuns(group.runs, line, hidden, env, clip);
				}
			}
			group.sel = this.selectionRects(panel);
			layout.push(group);
		}
		const hl = new Highlight();
		for (const r of ranges) hl.add(r);
		CSS.highlights.set('dontspy-ink', hl);
		this.layout = layout;
		if (this.canvas) this.canvas.style.display = '';
		this.paint();
		this.ensureLoop();
	}

	/** The highlight ranges for the hidden part of a line (null: all of it). */
	addRanges(out, line, hidden) {
		if (hidden === null) {
			const r = document.createRange();
			r.selectNodeContents(line);
			out.push(r);
			return;
		}
		const info = lineInfo(line);
		for (let k = 0; k < info.nodes.length; k++) {
			const node = info.nodes[k], from = info.starts[k], to = from + node.data.length;
			for (const [a0, b0] of hidden) {
				const a = Math.max(a0, from), b = Math.min(b0, to);
				if (b <= a) continue;
				const r = document.createRange();
				r.setStart(node, a - from);
				r.setEnd(node, b - from);
				out.push(r);
			}
		}
	}

	/** Where a panel's title bar ends: the lowest edge of the bar and of everything in it near the panel's top (the bar's own box can be empty when its contents are laid over the page). */
	barBottom(panel, pr) {
		let bottom = pr.top;
		for (const el of panel.querySelectorAll('.panel-bar, .panel-bar *')) {
			const b = el.getBoundingClientRect();
			if (b.height > 0 && b.width > 0 && b.top < pr.top + 90 && b.bottom < pr.top + 140) bottom = Math.max(bottom, b.bottom);
		}
		return bottom;
	}

	/** The part of the window a line is shown in: the panel's area cut down by every ancestor that clips (overflow) or hides (opacity 0) its content. The rects are shared by lines in the same container. */
	clipOf(line, root, base) {
		const empty = { x: 0, y: 0, w: 0, h: 0 };
		if (getComputedStyle(line).visibility === 'hidden') return empty;
		const walk = (node) => {
			if (!node || node === root) return base;
			let c = this.clipCache.get(node);
			if (c) return c;
			const parent = walk(node.parentElement);
			const cs = getComputedStyle(node);
			if (cs.opacity === '0' || cs.display === 'none') c = empty;
			else if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
				const r = node.getBoundingClientRect();
				const x = Math.max(parent.x, r.left), y = Math.max(parent.y, r.top);
				c = { x, y, w: Math.max(0, Math.min(parent.x + parent.w, r.right) - x), h: Math.max(0, Math.min(parent.y + parent.h, r.bottom) - y) };
			} else c = parent;
			this.clipCache.set(node, c);
			return c;
		};
		return walk(line.parentElement);
	}

	/** The rectangles of Thymer's selection layer in a panel, with their colours. */
	selectionRects(panel) {
		const out = [];
		for (const el of panel.querySelectorAll('.listview-selections *')) {
			const r = el.getBoundingClientRect();
			if (r.width < 1 || r.height < 1) continue;
			const bg = getComputedStyle(el).backgroundColor;
			if (!bg || bg === 'transparent' || /,\s*0\)$/.test(bg)) continue;
			out.push({ x: r.left, y: r.top, w: r.width, h: r.height, color: bg });
		}
		return out;
	}

	/** A text node's font and colour as the canvas wants them. */
	styleOf(el) {
		let s = this.styleCache.get(el);
		if (!s) {
			const cs = getComputedStyle(el);
			const size = parseFloat(cs.fontSize) || 15;
			s = { font: `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`, color: cs.color, size };
			this.styleCache.set(el, s);
		}
		return s;
	}

	/** The boxes of the hidden characters of a line, in runs (a word, or the part of it on one visual line). */
	addRuns(out, line, hidden, env, clip) {
		const info = lineInfo(line);
		const ivs = hidden === null ? [[0, info.text.length]] : hidden;
		const guid = (line.closest('[data-guid]') || line).getAttribute('data-guid') || '';
		const seed0 = strHash(guid);
		// A character's key comes from its word's text (and which of the same words in the line it is), not from where it stands, so
		// typing earlier in the line does not shuffle the masks of the words after it.
		const wordKey = [], wordStart = [], seen = new Map();
		for (const m of info.text.matchAll(/\S+/g)) {
			const n = seen.get(m[0]) || 0;
			seen.set(m[0], n + 1);
			const h = (strHash(m[0]) + Math.imul(n + 1, 0x9e3779b1) + seed0) | 0;
			for (let k = m.index; k < m.index + m[0].length; k++) { wordKey[k] = h; wordStart[k] = m.index; }
		}
		const keyAt = (fi) => (Math.imul(wordKey[fi] | 0, 31) + (fi - (wordStart[fi] || 0)) * 977) | 0;
		for (let k = 0; k < info.nodes.length; k++) {
			const node = info.nodes[k], from = info.starts[k], data = node.data, to = from + data.length;
			const host = node.parentElement;
			if (!host) continue;
			const st = this.styleOf(host);
			for (const [a0, b0] of ivs) {
				const a = Math.max(a0, from), b = Math.min(b0, to);
				if (b <= a) continue;
				let run = null;
				for (let i = a - from; i < b - from;) {
					const cp = data.codePointAt(i), n = cp > 0xffff ? 2 : 1, ch = data.substr(i, n);
					if (/\s/.test(ch)) { run = null; i += n; continue; }
					env.rng.setStart(node, i);
					env.rng.setEnd(node, i + n);
					const rc = env.rng.getBoundingClientRect();
					if (rc.width < 0.1 && rc.height < 0.1) { i += n; continue; }
					const c = { ch, x: rc.left, y: rc.top, w: rc.width, h: rc.height, key: keyAt(from + i) };
					if (!run || Math.abs(c.y - run.ref) > c.h * 0.6) {
						run = { chars: [], ref: c.y, x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h, st, seed: keyAt(from + i), clip };
						out.push(run);
					}
					run.chars.push(c);
					run.x1 = Math.max(run.x1, c.x + c.w);
					run.y0 = Math.min(run.y0, c.y);
					run.y1 = Math.max(run.y1, c.y + c.h);
					i += n;
					if (++env.count >= MAX_CHARS) return;
				}
			}
		}
	}

	// ---------------------------------------------------------------- the canvas

	mountCanvas() {
		const cv = document.createElement('canvas');
		cv.className = 'dontspy-canvas';
		cv.style.display = 'none';
		document.body.appendChild(cv);
		this.canvas = cv;
		this.ctx = cv.getContext('2d');
		this.sizeCanvas();
	}

	sizeCanvas() {
		if (!this.canvas) return;
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = Math.round(window.innerWidth * dpr);
		this.canvas.height = Math.round(window.innerHeight * dpr);
		this.dpr = dpr;
	}

	paint(now = performance.now()) {
		const ctx = this.ctx;
		if (!ctx) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		const style = STYLES[this.cfg.style];
		if (!style.draw) return;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		const env = { now, color: this.cfg.color };
		for (const g of this.layout) {
			if (!g.runs.length) continue;
			ctx.save();
			ctx.beginPath();
			ctx.rect(g.clip.x, g.clip.y, g.clip.w, g.clip.h);
			ctx.clip();
			let cur = null;   // runs of one container share their clip
			for (const run of g.runs) {
				if (run.clip !== cur) {
					if (cur) ctx.restore();
					ctx.save();
					ctx.beginPath();
					ctx.rect(run.clip.x, run.clip.y, run.clip.w, run.clip.h);
					ctx.clip();
					cur = run.clip;
				}
				style.draw(ctx, run, env);
			}
			if (cur) ctx.restore();
			// Thymer's selection is a layer under the text, which the masks now cover: its rectangles are painted again on top.
			for (const q of g.sel) { ctx.fillStyle = q.color; ctx.fillRect(q.x, q.y, q.w, q.h); }
			ctx.restore();
		}
	}

	/** The shuffle needs a tick; the other styles are painted when something changes. */
	ensureLoop() {
		if (this.raf || !STYLES[this.cfg.style].animated || !this.layout.some((g) => g.runs.length)) return;
		const tick = (t) => {
			this.raf = 0;
			if (!STYLES[this.cfg.style].animated || !this.layout.some((g) => g.runs.length)) return;
			if (t - this.lastTick >= (STYLES[this.cfg.style].frame || FRAME_MS)) { this.lastTick = t; this.paint(t); }
			this.raf = requestAnimationFrame(tick);
		};
		this.raf = requestAnimationFrame(tick);
	}

	// ---------------------------------------------------------------- the controls (shared by the popover and the settings page)

	/** The segmented choices of a settings group. */
	seg(key, items) {
		return `<div class="ds-seg" role="radiogroup">${items.map(([v, label]) => `<button type="button" class="ds-segbtn" data-key="${key}" data-value="${v}">${label}</button>`).join('')}</div>`;
	}

	/** The colour choices: Auto, a few swatches and a picker. */
	colorRow() {
		return `<div class="ds-colors"><button type="button" class="ds-swatch auto" data-color="" title="Each look's own colour (the text's, or green for Matrix)">Auto</button>${COLORS.map(([c, n]) => `<button type="button" class="ds-swatch" data-color="${c}" title="${n}" style="--c:${c}"></button>`).join('')}<label class="ds-swatch custom" title="Pick a colour"><input type="color" data-color-input value="#22c05a"></label></div>`;
	}

	/** Reflects the settings in the buttons of a controls root. */
	syncControls(root) {
		const c = this.cfg;
		root.querySelectorAll('[data-style]').forEach((b) => { if (b.tagName === 'BUTTON') b.classList.toggle('on', b.dataset.style === c.style); });
		root.querySelectorAll('.ds-segbtn').forEach((b) => b.classList.toggle('on', String(c[b.dataset.key]) === b.dataset.value));
		root.querySelectorAll('button[data-color]').forEach((b) => b.classList.toggle('on', (b.dataset.color || '') === (c.color || '')));
		root.querySelectorAll('.ds-swatch.custom').forEach((l) => {
			const input = l.querySelector('input'), own = !!c.color && !COLORS.some(([v]) => v === c.color);
			l.classList.toggle('on', own);
			l.style.setProperty('--c', own ? c.color : 'transparent');
			if (own && input.value !== c.color) input.value = c.color;
		});
		root.querySelectorAll('input[data-key]').forEach((i) => { i.checked = !!c[i.dataset.key]; });
		root.querySelectorAll('.ds-when-last').forEach((e) => { e.hidden = c.typing !== 'last'; });
	}

	/** One click handler for a controls root: a style, a segment, a switch. */
	wireControls(root) {
		root.addEventListener('click', (e) => {
			const style = e.target.closest('button[data-style]');
			if (style) { this.update({ style: style.dataset.style }); return; }
			const sw = e.target.closest('button[data-color]');
			if (sw) { this.update({ color: sw.dataset.color || null }); return; }
			const b = e.target.closest('.ds-segbtn');
			if (b) this.update({ [b.dataset.key]: b.dataset.key === 'pause' ? Number(b.dataset.value) : b.dataset.value });
		});
		root.addEventListener('change', (e) => { const i = e.target.closest('input[data-key]'); if (i) this.update({ [i.dataset.key]: i.checked }); });
		root.addEventListener('input', (e) => { const i = e.target.closest('input[data-color-input]'); if (i) this.update({ color: i.value }); });
	}

	/** Draws every sample canvas under a root: each carries its style, text and size in data attributes. */
	drawSamples(root, now) {
		const fg = getComputedStyle(root).color;
		for (const cv of root.querySelectorAll('canvas[data-style]')) {
			const w = Number(cv.dataset.w), h = Number(cv.dataset.h), size = Number(cv.dataset.size);
			if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
			const ctx = cv.getContext('2d');
			ctx.setTransform(2, 0, 0, 2, 0, 0);
			ctx.clearRect(0, 0, w, h);
			drawSample(ctx, cv.dataset.style, cv.dataset.text, 10, (h - size * 1.25) / 2, { font: `600 ${size}px system-ui, sans-serif`, color: fg, size }, now, this.cfg.color);
		}
	}

	// ---------------------------------------------------------------- the options popover

	openPop(anchor) {
		this.closePop();
		const pop = document.createElement('div');
		pop.className = 'dontspy-pop';
		this.pop = pop;
		this.popAnchor = anchor || null;
		document.body.appendChild(pop);
		pop.innerHTML = `
			<div class="ds-head"><span class="ti ti-lock"></span><b>DontSpy</b><span class="ds-sub">hide your writing from onlookers</span></div>
			<div class="ds-sec">Look</div>
			<div class="ds-styles">${Object.entries(STYLES).map(([id, s]) => `<button type="button" class="ds-chip" data-style="${id}" title="${s.note}"><canvas data-style="${id}" data-w="88" data-h="26" data-size="14" data-text="Secret plan"></canvas><span>${s.label}</span></button>`).join('')}</div>
			<div class="ds-sec">Colour</div>
			${this.colorRow()}
			<div class="ds-sec">Readable around the caret</div>
			${this.seg('scope', SCOPES)}
			<div class="ds-sec">While you type</div>
			${this.seg('typing', [['last', 'Last letter only'], ['scope', 'Same as above']])}
			<div class="ds-when-last"><div class="ds-sec">When you pause</div>${this.seg('pause', [[0, 'Stay hidden'], [3000, 'Show after 3 s']])}</div>
			<label class="ds-row"><input type="checkbox" data-key="startLocked"><span>Lock every panel as it opens</span></label>
			<button type="button" class="ds-more">All settings…</button>`;
		this.wireControls(pop);
		pop.querySelector('.ds-more').addEventListener('click', () => { this.closePop(); this.openPage(); });
		this.syncControls(pop);
		this.placePop();
		const loop = (t) => {
			if (!this.pop) return;
			if (t - (this.popTick || 0) > 90) { this.popTick = t; this.drawSamples(this.pop, t); }
			this.popRaf = requestAnimationFrame(loop);
		};
		this.popRaf = requestAnimationFrame(loop);
	}

	closePop() {
		cancelAnimationFrame(this.popRaf);
		if (this.pop) this.pop.remove();
		this.pop = null;
	}

	placePop() {
		const pop = this.pop;
		if (!pop) return;
		const a = this.popAnchor && this.popAnchor.isConnected ? this.popAnchor.getBoundingClientRect() : null;
		const w = pop.offsetWidth, h = pop.offsetHeight;
		let left = a ? a.right - w : window.innerWidth - w - 16, top = a ? a.bottom + 8 : 48;
		left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
		top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
		pop.style.left = left + 'px';
		pop.style.top = top + 'px';
	}

	/** Called after a setting changed. */
	renderPop() {
		if (this.pop) { this.syncControls(this.pop); this.placePop(); }
		if (this.page && this.page.root.isConnected) this.syncControls(this.page.root);
	}

	// ---------------------------------------------------------------- the settings page
	// "DontSpy: open settings" opens a page in the panel being worked in (registerCustomPanelType), the way a note opens. On it: a
	// pad to type in, locked for real (the pad is a lockable region of its own, like a panel), a gallery of the looks with
	// live samples, and the other choices. The page is simply gone when the panel goes on to something else; the plugin
	// notices by its root being disconnected.

	async openPage() {
		const panel = this.ui.getActivePanel() || await this.ui.createPanel();
		panel?.navigateToCustomType(PAGE_TYPE);
	}

	closePage() {
		cancelAnimationFrame(this.pageRaf);
		if (this.page) {
			const pad = this.page.pad;
			if (this.locked.has(pad)) this.lock(pad, false, true);
			this.page = null;
			this.refresh();
		}
	}

	renderPage(panel) {
		const host = panel.getElement();
		if (!host) return;
		this.closePage();
		panel.setTitle?.('DontSpy');
		const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
		let lines = PAD_DEFAULT;
		try { const saved = JSON.parse(localStorage.getItem(PAD_KEY) || 'null'); if (Array.isArray(saved) && saved.length) lines = saved; } catch (e) { /* the default text */ }
		const card = ([id, s]) => `<button type="button" class="ds-card" data-style="${id}"><canvas data-style="${id}" data-w="224" data-h="46" data-size="17" data-text="Meet me at midnight"></canvas><b>${s.label}</b><span>${s.note}</span></button>`;
		host.innerHTML = `<div-scrollable class="ds-scroll force-active-scrollbar" style="overflow-y: scroll; height: 100%"><div class="ds-page">
<div class="ds-hero"><h1><span class="ti ti-lock"></span>DontSpy</h1><p>A lock in each panel's title bar. A locked panel hides its text from anyone glancing at the screen, and keeps readable only what is around your caret.</p></div>
<div class="ds-label">Try it</div>
<div class="ds-pad">${lines.map((t, i) => `<div class="ds-padrow" data-guid="dontspy-pad-${i}"><div class="ds-line" contenteditable="plaintext-only" spellcheck="false">${esc(t)}</div></div>`).join('')}</div>
<div class="ds-hint">This pad is locked like a panel is. It is kept on this device.</div>
<div class="ds-label">Look</div>
<div class="ds-gallery">${Object.entries(STYLES).map(card).join('')}</div>
<div class="ds-label">Colour</div>${this.colorRow()}
<div class="ds-hint">The colour the looks are painted in. Auto uses the text's own colour (green for Matrix).</div>
<div class="ds-label">Readable around the caret</div>${this.seg('scope', SCOPES)}
<div class="ds-hint">What stays readable while the rest is hidden: the word the caret is in, its sentence, its paragraph, or everything (then only what you are typing is hidden).</div>
<div class="ds-label">While you type</div>${this.seg('typing', [['last', 'Last letter only'], ['scope', 'Same as above']])}
<div class="ds-hint">The word you are typing shows only the letter you just typed. It stays hidden until you move the caret with the arrow keys or a click.</div>
<div class="ds-when-last"><div class="ds-label">When you pause</div>${this.seg('pause', [[0, 'Stay hidden'], [3000, 'Show after 3 s']])}</div>
<div class="ds-label">Panels</div>
<label class="ds-row"><input type="checkbox" data-key="startLocked"><span>Lock every panel as it opens</span></label>
<div class="ds-hint">Lock or unlock one panel with the lock beside its split-view button (right-click it for these options), or with the commands "DontSpy: lock all panels" and "DontSpy: unlock all panels".</div>
</div></div-scrollable>`;
		const root = host.querySelector('.ds-page'), pad = root.querySelector('.ds-pad');
		this.page = { root, pad };
		pad.addEventListener('input', () => {
			try { localStorage.setItem(PAD_KEY, JSON.stringify(Array.from(pad.querySelectorAll('.ds-line')).map((l) => l.textContent))); } catch (e) { /* kept for this visit only */ }
		});
		pad.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData)?.getData('text/plain') || ''); });
		this.wireControls(root);
		this.syncControls(root);
		this.lock(pad, true, true);
		this.refresh();
		const loop = (t) => {
			if (!this.page || this.page.root !== root) return;
			if (!root.isConnected) { this.closePage(); return; }
			if (t - (this.pageTick || 0) > 90) { this.pageTick = t; this.drawSamples(root, t); }
			this.pageRaf = requestAnimationFrame(loop);
		};
		this.pageRaf = requestAnimationFrame(loop);
	}
}
