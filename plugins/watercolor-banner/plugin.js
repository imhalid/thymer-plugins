/**
 * Watercolor Banner
 *
 * Every page gets two drawings in pencil and watercolour: a landscape at the top in the banner's place (when the page
 * has no banner of its own), drawn from the page, and a page of an engineer's sketchbook at its foot behind the end of
 * the content (gears, a neural network, a flask, a letter on its grid, a listing, geometry studies, notes, the date),
 * laid out by the title. An empty panel gets a sheet of geometry studies around its start screen. Nothing is written into the workspace: no image is uploaded, the page is not changed, and turning the plugin
 * off leaves every page as it was. The technique follows lucumr.pocoo.org (Armin Ronacher's "Ridgeline and strata" header
 * and "Sketchbook margins" footer), written anew for Thymer:
 *
 *   1. The geometry is drawn with seeded 2D canvases into two layers, a wash (the watercolour, as premultiplied pigment)
 *      and a pencil, in "world" pixels: x from the middle of the strip, the strip a fixed height. Everything stands at a
 *      fixed world x, so a wider panel shows more of the same picture instead of a stretched or reshuffled one.
 *   2. A fragment shader turns the two layers into the medium: the wash's edge wanders and bleeds (a domain warp), pigment
 *      collects at its rim (found by sampling around each pixel), granulates in the paper's tooth and multiplies the paper
 *      as pigment does; the pencil catches on the same tooth. It also paints the picture in: the pencil sweeps from left to
 *      right, then the washes bloom after it. The previous picture first soaks into the paper, in patches.
 *   3. The finished picture is kept in a texture, and a second, small shader draws only what moves over it, a dozen
 *      frames a second and nothing while the strip is out of sight: the shadows of clouds, and what belongs to the scene
 *      (the lighthouse's beam turning, glints on the sea, the lake's reflection wavering, gusts in the grass, mist drifting
 *      between the trees).
 *
 * On a dark theme the same picture is drawn with light instead of pigment: the washes glow on the page's colour and the
 * pencil is chalk.
 *
 * The header is one of seven scenes: mountains, a coast, a lighthouse on a headland at dusk, a meadow, a lake mirroring its
 * mountains, a forest in mist, dunes. Words in the title or the tags pick one (sea, beach, light, idea, garden, lake,
 * journal, forest, desert, mountain, ... in English and Turkish), else the title's seed does; a command picks another.
 *
 * What the page decides, in every scene:
 *   title       the seed: where everything stands
 *   #tags       one range (hills, dunes, a row of trees, an island) per tag, the most used in front, in the tag's pigment
 *               and the tag's own form; more tags tint the sky
 *   collection  the house colour: the sky, and the ranges no tag claims
 *   words       the viewing distance: a short note is a close view, a long text a wide one
 *   tasks       trees, boats, bushes or cacti, the done ones painted in; how many are done sets the weather (a low warm
 *               sun when most are done, cloud when few are)
 *   headings    cairns (a flag on the first for a top heading)
 *   code        masts with a wire, a pier, a windmill or a lookout
 *   quotes      birds
 *   lists       a fence, or reeds
 *   images      a lake, a pond, an island or a boat
 *   created     the season (snow on the heights in winter, autumn trees) and how yellowed the paper is
 *
 * Commands:
 *   - Watercolor Banner: another scene for this page (kept on this device)
 *   - Watercolor Banner: back to this page's own scene
 *   - Watercolor Banner: another footer sketch for this page (kept on this device)
 *   - Watercolor Banner: paint this page again
 *   - Watercolor Banner: motion on or off
 *   - Watercolor Banner: footer on or off
 *   - Watercolor Banner: turn on or off (on this device)
 *
 * Configuration (`custom`, optional): "exclude": ["Journal", ...] collection names to skip.
 */

const WCB_OFF_KEY = 'wcbanner:off';
const WCB_STILL_KEY = 'wcbanner:still';
const WCB_NOFOOT_KEY = 'wcbanner:nofoot';
const WCB_KIND_KEY = 'wcbanner:kinds';     // { record guid: scene kind } for pages given another scene
const WCB_FOOT_KEY = 'wcbanner:feet';      // { record guid: n } for pages turned to another sketchbook page
const HEAD_H = 150;           // the header's height in world pixels
const FOOT_H = 300;           // the footer's (one world pixel to a CSS pixel)
const PAINT_S = 2.6;          // painting in: the pencil, then the washes
const SOAK_S = 0.9;           // the old colour soaking into the paper
const QUICK_S = 1.3;          // an edit of the same page: the new picture comes through in patches
const AIR_FPS = 12;
const AIR_FADE_S = 3;
const RELOAD_MS = 1500;       // after an edit, the page is read again this much later
const SETTLE_MS = 700;        // a title has to stay the same this long
const MAX_W = 3200;           // device pixels
const PAGE_CACHE = 200;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------- randomness

const wcbFnv = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function wcbRng(seed) {
	let s = seed >>> 0;
	const r = () => {
		s = (s + 0x6D2B79F5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	r.range = (a, b) => a + (b - a) * r();
	r.int = (n) => Math.floor(r() * n);
	r.chance = (p) => r() < p;
	r.pick = (list) => list[Math.floor(r() * list.length)];
	r.gauss = () => (r() + r() + r() - 1.5) * 1.15;
	return r;
}
const hashI = (i, s) => {
	let h = Math.imul((i | 0) ^ Math.imul(s | 0, 0x27d4eb2d), 0x9E3779B1);
	h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
};
const noise1 = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = hashI(i, s); return a + (hashI(i + 1, s) - a) * u; };
const fbm1 = (x, s, oct = 4) => { let sum = 0, amp = 0.5, norm = 0, k = 1; for (let o = 0; o < oct; o++) { sum += noise1(x * k + o * 7.3, s + o * 101) * amp; norm += amp; amp *= 0.5; k *= 2.03; } return sum / norm; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------------------- colours

const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const cssC = (c, a = 1) => `rgba(${Math.round(clamp(c[0], 0, 1) * 255)},${Math.round(clamp(c[1], 0, 1) * 255)},${Math.round(clamp(c[2], 0, 1) * 255)},${a})`;
const WHITE = [1, 1, 1];

// pigments for white paper
const PIGMENTS = {
	ultramarine: [0.25, 0.32, 0.66], cerulean: [0.30, 0.56, 0.76], indigo: [0.21, 0.25, 0.40], payne: [0.31, 0.36, 0.44],
	sap: [0.43, 0.57, 0.24], viridian: [0.17, 0.51, 0.44], ochre: [0.82, 0.62, 0.30], sienna: [0.74, 0.39, 0.22],
	umber: [0.46, 0.36, 0.26], rose: [0.83, 0.34, 0.48], violet: [0.49, 0.31, 0.54], orange: [0.93, 0.52, 0.20],
	lemon: [0.94, 0.83, 0.36], teal: [0.19, 0.54, 0.60], olive: [0.52, 0.52, 0.24], madder: [0.68, 0.20, 0.25],
};
const SAND = [0.88, 0.74, 0.5];
const HOUSE = ['ultramarine', 'cerulean', 'indigo', 'teal', 'payne'];
const TAG_PIGMENT = {
	work: 'indigo', job: 'indigo', is: 'indigo', meeting: 'payne', meetings: 'payne', toplanti: 'payne', idea: 'ochre', ideas: 'ochre',
	fikir: 'ochre', todo: 'orange', bug: 'madder', urgent: 'madder', acil: 'madder', book: 'sap', books: 'sap', kitap: 'sap',
	reading: 'sap', read: 'sap', travel: 'cerulean', seyahat: 'cerulean', health: 'viridian', saglik: 'viridian', sport: 'viridian',
	project: 'ultramarine', projects: 'ultramarine', proje: 'ultramarine', personal: 'rose', life: 'rose', hayat: 'rose',
	journal: 'sienna', diary: 'sienna', gunluk: 'sienna', music: 'violet', muzik: 'violet', art: 'violet', sanat: 'violet',
	code: 'teal', kod: 'teal', dev: 'teal', ai: 'violet', finance: 'olive', money: 'olive', para: 'olive', family: 'rose',
	aile: 'rose', home: 'umber', ev: 'umber', learn: 'lemon', learning: 'lemon', ders: 'lemon', ogrenme: 'lemon',
};
const PIGMENT_NAMES = Object.keys(PIGMENTS);
const plain = (s) => String(s).toLowerCase().replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '');
function tagPigment(name) {
	const known = TAG_PIGMENT[plain(name)];
	if (known) return PIGMENTS[known];
	const h = wcbFnv(name);
	const base = PIGMENTS[PIGMENT_NAMES[h % PIGMENT_NAMES.length]], other = PIGMENTS[PIGMENT_NAMES[(h >>> 8) % PIGMENT_NAMES.length]];
	return mixC(base, other, ((h >>> 16) % 100) / 100 * 0.35);   // a tag nobody named still has a colour of its own
}

/** The light of a pigment, for the dark theme: its hue at a high lightness; a grey becomes moonlight. */
function glow(c) {
	const mx = Math.max(c[0], c[1], c[2], 0.01), mn = Math.min(c[0], c[1], c[2]);
	let g = c.map((v) => v / mx * 0.94);
	if (mx - mn < 0.12) g = mixC(g, [0.62, 0.72, 0.98], 0.7);
	const m = (g[0] + g[1] + g[2]) / 3;
	return g.map((v) => clamp(m + (v - m) * 1.2, 0, 1));
}
const lightnessOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/**
 * A computed CSS colour as [r, g, b] (0..1), or null when it is transparent or unreadable. Themes may give their colours
 * in Display-P3 (`color(display-p3 ...)`, Basalt Bedrock does), oklch() or lab(): those are resolved by painting a pixel.
 */
let colorProbe = null;
function parseColor(s) {
	s = String(s || '').trim();
	if (!s || s === 'transparent') return null;
	const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
	if (m) {
		const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
		return a < 0.05 ? null : [m[1] / 255, m[2] / 255, m[3] / 255];
	}
	try {
		if (!colorProbe) { colorProbe = document.createElement('canvas'); colorProbe.width = colorProbe.height = 1; }
		const g = colorProbe.getContext('2d', { willReadFrequently: true });
		g.fillStyle = '#010203';
		g.fillStyle = s;
		if (g.fillStyle === '#010203') return null;      // not a colour the canvas knows
		g.clearRect(0, 0, 1, 1);
		g.fillRect(0, 0, 1, 1);
		const d = g.getImageData(0, 0, 1, 1).data;
		return d[3] < 13 ? null : [d[0] / 255, d[1] / 255, d[2] / 255];
	} catch {
		return null;
	}
}
/** The paper a band is painted on: the panel's colour, else a plain one for the page's light or dark scheme. */
function paperOf(el) {
	for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
		const c = parseColor(getComputedStyle(n).backgroundColor);
		if (c) return c;
	}
	const dark = /dark/.test(getComputedStyle(document.documentElement).colorScheme || '') || document.documentElement.classList.contains('is-dark');
	return dark ? [0.07, 0.075, 0.085] : [1, 1, 1];
}

// ----------------------------------------------------------------------------------------------------- reading a page

const wordsIn = (s) => (s.match(/\S+/g) || []).length;

/** What the pictures are drawn from: the title, the tags, how the page is made up, its collection and date. */
function readPage(record, collection, items) {
	const title = (record.getName() || '').trim();
	const tags = new Map();
	const c = { words: 0, headings: 0, h1: 0, tasks: 0, done: 0, code: 0, quotes: 0, lists: 0, images: 0, tables: 0, paras: 0 };
	for (const it of items || []) {
		let words = 0;
		for (const s of it.segments || []) {
			if (s?.type === 'hashtag') {
				const name = String(typeof s.text === 'string' ? s.text : '').replace(/^#/, '').trim().toLowerCase();
				if (!name) continue;
				const e = tags.get(name) || { name, count: 0, first: tags.size };
				e.count++;
				tags.set(name, e);
			} else if (typeof s?.text === 'string') {
				words += wordsIn(s.text);
			}
		}
		c.words += words;
		switch (it.type) {
			case 'heading': {
				c.headings++;
				let size = 1;
				try { size = it.getHeadingSize?.() || 1; } catch { /* not a heading after all */ }
				if (size <= 1) c.h1++;
				break;
			}
			case 'task': {
				c.tasks++;
				let done = false;
				try { done = !!it.isTaskCompleted?.(); } catch { /* no status */ }
				if (done) c.done++;
				break;
			}
			case 'block': c.code++; break;
			case 'quote': c.quotes++; break;
			case 'ulist': case 'olist': c.lists++; break;
			case 'image': case 'media': c.images++; break;
			case 'table': c.tables++; break;
			case 'text': if (words) c.paras++; break;
		}
	}
	let created = null;
	try { created = record.getCreatedAt?.() || null; } catch { /* none */ }
	const list = [...tags.values()].sort((a, b) => b.count - a.count || a.first - b.first);
	const page = { guid: record.guid, title, seed: wcbFnv(title), tags: list, c, created, collection: collection?.getName?.() || '' };
	// what changes the pictures: an edit that only adds a word or two to a long text does not
	page.key = JSON.stringify([
		title, list.slice(0, 8).map((t) => t.name), Math.round(Math.log2(1 + c.words) * 2), Math.min(c.headings, 6), c.h1 > 0,
		Math.min(c.tasks, 24), Math.min(c.done, 24), Math.min(c.code, 3), Math.min(c.quotes, 7), Math.min(c.lists, 10),
		c.images > 0, page.collection, created ? created.getFullYear() * 12 + created.getMonth() : 0,
	]);
	return page;
}

// ------------------------------------------------------------------------------------------------------- the scenes

const KINDS = ['mountains', 'coast', 'lighthouse', 'meadow', 'lake', 'forest', 'dunes'];
// words in the title or the tags that call for a scene (matched on the text without accents, lower case)
const KIND_HINTS = [
	['lighthouse', /lighthouse|fener|beacon|idea|fikir|light|isik|guide|rehber|vision|vizyon/],
	['coast', /\bsea\b|deniz|sahil|beach|coast|plaj|tatil|holiday|vacation|ocean|okyanus|sail|yelken|island|summer/],
	['lake', /lake|\bgol\b|journal|gunluk|diary|reflect|dusun|calm|sakin|mirror|ayna|retro/],
	['meadow', /garden|bahce|meadow|cayir|grass|spring|bahar|health|saglik|farm|ciftlik|flower|cicek|picnic|piknik/],
	['forest', /forest|orman|tree|agac|nature|doga|camp|kamp|wood|hike|yuruyus/],
	['dunes', /desert|\bcol\b|dune|sahara|travel|seyahat|yolculuk|journey|trip|\bgezi/],
	['mountains', /mountain|\bdag|climb|tirman|goal|hedef|summit|zirve|project|proje|plan/],
];
function kindOf(page) {
	const text = plain([page.title, ...page.tags.map((t) => t.name)].join(' '));
	for (const [kind, re] of KIND_HINTS) if (re.test(text)) return kind;
	return KINDS[page.seed % KINDS.length];
}

// The forms of a range: height 0..1 at world x (already divided by the zoom), for a seed. A tag always has the same form.
const FAMILIES = {
	rolling: (x, s) => 0.62 * fbm1(x / 95, s, 3) + 0.38 * fbm1(x / 38, s + 7, 3),
	jagged: (x, s) => {
		let v = 0, amp = 0.55, k = 1;
		for (let o = 0; o < 4; o++) { const n = 1 - Math.abs(2 * noise1(x / 70 * k + o * 3.1, s + o * 31) - 1); v += n * n * amp; amp *= 0.5; k *= 2.1; }
		return clamp(v * 1.08, 0, 1);
	},
	mesa: (x, s) => {
		const v = fbm1(x / 85, s, 3);
		return 0.12 + 0.62 * smooth(0.42, 0.49, v) + 0.24 * smooth(0.6, 0.66, v) + 0.05 * noise1(x / 6, s + 5);
	},
	terrace: (x, s) => {
		const v = fbm1(x / 90, s, 3) * 5;
		const q = Math.floor(v), f = v - q;
		return clamp((q + smooth(0, 0.3, f)) / 5 * 1.25 - 0.15 + 0.03 * noise1(x / 5, s + 9), 0, 1);
	},
	cone: (x, s) => {
		const cell = 120, c = Math.floor(x / cell);
		let v = 0;
		for (let k = c - 1; k <= c + 1; k++) {
			const px = (k + 0.2 + 0.6 * hashI(k, s)) * cell, ph = 0.45 + 0.55 * hashI(k, s + 1), pw = 34 + 30 * hashI(k, s + 2);
			const d = Math.max(0, 1 - Math.abs(x - px) / pw);
			v = Math.max(v, ph * Math.pow(d, 1.25));
		}
		return clamp(v + 0.12 * fbm1(x / 30, s + 3, 3), 0, 1);
	},
	dunes: (x, s) => {
		const p = x / 62 + 0.8 * fbm1(x / 210, s, 2), f = p - Math.floor(p);
		const a = f < 0.72 ? f / 0.72 : (1 - f) / 0.28;
		return 0.15 + 0.4 * a * a * (3 - 2 * a) * (0.6 + 0.6 * fbm1(Math.floor(p), s + 4, 2)) + 0.3 * fbm1(x / 160, s + 8, 2);
	},
};
const FAMILY_NAMES = Object.keys(FAMILIES);
const FAMILY_AMP = { rolling: 0.8, jagged: 1, mesa: 0.85, terrace: 0.85, cone: 1.05, dunes: 0.7 };

function makeRange(S, o) {
	const fn = FAMILIES[o.family], off = o.off ?? S.R.range(-500, 500), mask = o.mask || null;
	return {
		tag: o.tag || null, family: o.family, seed: o.seed, depth: o.depth, amp: o.amp, base: o.base, color: o.color,
		density: o.density, mask,
		h(x) { return fn((x + off) / S.zoom, this.seed) * (mask ? mask(x) : 1); },
		y(x) { return this.base - this.amp * this.h(x); },
	};
}

/** Everything the header is, in world units, before it is painted at a size and in a theme. */
function buildScene(page, kindOverride) {
	const R = wcbRng(page.seed ^ 0x5bd1e995), c = page.c;
	const house = PIGMENTS[HOUSE[wcbFnv(page.collection || 'house') % HOUSE.length]];
	const lead = page.tags.slice(0, 4), rest = page.tags.slice(4, 10);
	const zw = clamp(Math.log10(1 + c.words) / 3.4, 0, 1);
	const lineish = c.headings + c.code + c.tables + c.lists, proseish = c.paras + c.quotes;
	const month = page.created ? page.created.getMonth() : -1;
	const done = c.tasks ? c.done / c.tasks : null;
	const clear = done === null ? R() : done;            // how fair the weather is
	const kind = KINDS.includes(kindOverride) ? kindOverride : kindOf(page);
	const S = {
		page, R, kind, house, lead, rest, zw,
		zoom: lerp(1.3, 0.78, zw),                       // a short note is a close view, a long text a wide one
		loose: clamp(0.35 + 0.35 * (proseish - lineish) / Math.max(4, proseish + lineish) + R.range(-0.12, 0.12), 0.05, 0.85),
		season: month < 0 ? 'summer' : [11, 0, 1].includes(month) ? 'winter' : [2, 3, 4].includes(month) ? 'spring' : [5, 6, 7].includes(month) ? 'summer' : 'autumn',
		years: page.created ? (Date.now() - page.created.getTime()) / 3.156e10 : 0,
		clear, sky: mixC(house, PIGMENTS.cerulean, 0.35), tints: rest.map((t) => tagPigment(t.name)),
		horizon: 76, dusk: false, ranges: [],
		windSpeed: lerp(7, 16, clamp((c.tasks - c.done) / 8, 0, 1)) * (R() < 0.5 ? -1 : 1),
		air: { water: null, glitter: 0, wobble: 0, beam: null, grass: null, mist: null },
	};
	S.sun = { x: R.range(-230, 230), y: lerp(26, 46, clear) + R.range(-4, 4), r: R.range(8, 12) };
	S.pig = (i, fallback) => (lead[i] ? tagPigment(lead[i].name) : fallback);
	S.formOf = (i, fallback) => (lead[i] ? FAMILY_NAMES[wcbFnv('form:' + lead[i].name) % FAMILY_NAMES.length] : fallback);
	S.seedOf = (i) => (page.seed ^ wcbFnv('range' + i + (lead[i] ? lead[i].name : ''))) >>> 0;
	BUILD[kind](S);
	return S;
}

const aerial = (S, color, depth) => mixC(color, mixC(S.sky, WHITE, 0.4), 0.55 * depth);

const BUILD = {
	mountains(S) {
		const n = S.lead.length ? clamp(S.lead.length + 1, 2, 5) : 3;
		for (let i = 0; i < n; i++) {
			const depth = n > 1 ? (n - 1 - i) / (n - 1) : 0, t = n - 1 - i;
			const family = S.formOf(t, i % 2 ? 'rolling' : S.R.pick(['jagged', 'cone', 'rolling']));
			S.ranges.push(makeRange(S, {
				tag: S.lead[t], family, seed: S.seedOf(t), depth, density: lerp(0.82, 0.32, depth),
				amp: lerp(30, 50, depth) * FAMILY_AMP[family] * lerp(1.12, 0.88, S.zw), base: lerp(120, 76, depth) + S.R.range(-3, 3),
				color: aerial(S, S.pig(t, mixC(S.house, PIGMENTS.payne, 0.3)), depth),
			}));
		}
		S.front = S.ranges[n - 1];
		S.middle = S.ranges[Math.max(0, n - 2)];
		S.air.mist = S.ranges.slice(0, 4).map((r) => r.base - r.amp * 0.15);
	},
	coast(S) {
		S.horizon = S.R.range(70, 80);
		// islands and headlands far out, one per tag after the first
		const isl = clamp(S.lead.length - 1, 1, 3);
		for (let i = 0; i < isl; i++) {
			const t = i + 1, seed = S.seedOf(t), depth = 1 - i / Math.max(1, isl) * 0.4;
			S.ranges.push(makeRange(S, {
				tag: S.lead[t], family: S.formOf(t, 'rolling'), seed, depth, density: 0.4, amp: S.R.range(10, 18), base: S.horizon + 0.6,
				color: aerial(S, S.pig(t, mixC(S.house, PIGMENTS.payne, 0.4)), 0.8),
				mask: (x) => smooth(0.52, 0.66, fbm1(x / 260, seed + 1, 2)),
			}));
		}
		S.beach = makeRange(S, {
			tag: S.lead[0], family: 'dunes', seed: S.seedOf(0), depth: 0, density: 0.62, amp: S.R.range(8, 12), base: 124,
			color: S.lead[0] ? mixC(tagPigment(S.lead[0].name), SAND, 0.6) : SAND,
		});
		S.air.water = [S.horizon, 130];
		S.air.glitter = 1;
	},
	lighthouse(S) {
		BUILD.coast(S);
		S.dusk = true;
		S.sun = { x: S.R.range(-160, 160), y: S.horizon - 3, r: S.R.range(10, 13) };
		S.side = S.R() < 0.5 ? -1 : 1;
		S.edge = S.R.range(55, 105);
		const plateau = S.horizon - S.R.range(14, 22), seed = S.seedOf(0), side = S.side, edge = S.edge;
		// the headland: a plateau that ends in a cliff over the sea, on one side
		S.cliffY = (x) => {
			const into = side * x - edge;
			if (into < -14) return null;
			const top = plateau - 5 * fbm1(x / 40, seed, 3);
			const foot = S.horizon + 30;
			return lerp(foot, top, smooth(-14, 2, into + 3 * (noise1(x / 7, seed + 3) - 0.5)));
		};
		const lx = side * (edge + 22);
		S.lamp = { x: lx, base: S.cliffY(lx), h: 36 };
		S.air.beam = [lx, S.lamp.base - S.lamp.h + 3];
	},
	meadow(S) {
		S.horizon = S.R.range(72, 82);
		S.ranges.push(makeRange(S, {
			family: 'rolling', seed: S.seedOf(9), depth: 1, density: 0.32, amp: 16, base: S.horizon + 4,
			color: aerial(S, PIGMENTS.cerulean, 0.9),
		}));
		const n = clamp(S.lead.length, 2, 4);
		for (let i = 0; i < n; i++) {
			const depth = n > 1 ? (n - 1 - i) / (n - 1) * 0.75 : 0, t = n - 1 - i;
			const green = mixC(PIGMENTS.sap, PIGMENTS.viridian, hashI(t, S.page.seed) * 0.6);
			const color = S.lead[t] ? mixC(tagPigment(S.lead[t].name), green, 0.5) : green;
			S.ranges.push(makeRange(S, {
				tag: S.lead[t], family: 'rolling', seed: S.seedOf(t), depth, density: lerp(0.66, 0.38, depth),
				amp: lerp(14, 24, depth), base: lerp(116, 88, depth), color: aerial(S, color, depth * 0.7),
			}));
		}
		S.front = S.ranges[S.ranges.length - 1];
		S.middle = S.ranges[S.ranges.length - 2];
		S.air.grass = S.front.base - S.front.amp - 4;
	},
	lake(S) {
		S.water = S.R.range(92, 100);
		const n = S.lead.length ? clamp(S.lead.length, 2, 3) : 2;
		for (let i = 0; i < n; i++) {
			const depth = n > 1 ? (n - 1 - i) / (n - 1) : 0, t = n - 1 - i;
			const family = S.formOf(t, S.R.pick(['jagged', 'cone', 'rolling']));
			S.ranges.push(makeRange(S, {
				tag: S.lead[t], family, seed: S.seedOf(t), depth, density: lerp(0.72, 0.36, depth),
				amp: lerp(28, 44, depth) * FAMILY_AMP[family], base: S.water + 0.5 - depth * 5,
				color: aerial(S, S.pig(t, mixC(S.house, PIGMENTS.viridian, 0.35)), depth),
			}));
		}
		S.front = S.ranges[n - 1];
		S.air.water = [S.water, HEAD_H + 10];
		S.air.wobble = 1;
		S.air.glitter = 0.35;
	},
	forest(S) {
		const n = clamp(S.lead.length + 2, 3, 5);
		for (let i = 0; i < n; i++) {
			const depth = (n - 1 - i) / (n - 1), t = n - 1 - i;
			const green = mixC(PIGMENTS.viridian, PIGMENTS.indigo, 0.3 + 0.3 * hashI(i, S.page.seed));
			const color = S.lead[t] ? mixC(tagPigment(S.lead[t].name), green, 0.45) : green;
			S.ranges.push(makeRange(S, {
				tag: S.lead[t], family: 'rolling', seed: S.seedOf(t), depth, density: lerp(0.8, 0.3, depth),
				amp: lerp(10, 22, depth), base: lerp(130, 84, depth), color: aerial(S, color, depth * 0.85),
			}));
			S.ranges[i].tree = lerp(26, 14, depth) * lerp(1.1, 0.85, S.zw);
			S.ranges[i].gap = lerp(6.5, 4.5, depth);
		}
		S.front = S.ranges[n - 1];
		S.middle = S.ranges[n - 2];
		S.air.mist = S.ranges.slice(0, 4).map((r) => r.base - r.amp * 0.4 - r.tree * 0.2);
	},
	dunes(S) {
		S.sun.y = Math.min(S.sun.y, 36);
		S.sun.r *= 1.3;
		const n = S.lead.length ? clamp(S.lead.length + 1, 3, 5) : 4;
		for (let i = 0; i < n; i++) {
			const depth = (n - 1 - i) / (n - 1), t = n - 1 - i;
			const sand = mixC(SAND, PIGMENTS.sienna, 0.15 + 0.35 * hashI(i, S.page.seed));
			const color = S.lead[t] ? mixC(tagPigment(S.lead[t].name), sand, 0.55) : sand;
			S.ranges.push(makeRange(S, {
				tag: S.lead[t], family: 'dunes', seed: S.seedOf(t), depth, density: lerp(0.7, 0.32, depth),
				amp: lerp(20, 34, depth), base: lerp(124, 82, depth), color: aerial(S, color, depth * 0.6),
			}));
		}
		S.front = S.ranges[n - 1];
		S.middle = S.ranges[n - 2];
	},
};

// ------------------------------------------------------------------------------------------------- painting: a painter

function makeLayer(w, h, k) {
	const cv = document.createElement('canvas');
	cv.width = w; cv.height = h;
	const g = cv.getContext('2d');
	g.setTransform(k, 0, 0, k, w / 2, 0);
	g.lineJoin = 'round';
	g.lineCap = 'round';
	return g;
}
function tracePts(g, pts, close = true) {
	g.moveTo(pts[0][0], pts[0][1]);
	for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
	if (close) g.closePath();
}
// a closed outline as radii: a few low harmonics, uneven but smooth
function radial(rand, n, amp, kmin, kmax, offset) {
	const out = new Float32Array(n).fill(offset);
	for (let k = kmin; k <= kmax; k++) {
		const ph = rand() * TAU, a = amp * rand.range(0.3, 1) / Math.pow(k / kmin, 0.9);
		for (let i = 0; i < n; i++) out[i] += a * Math.cos(k * i / n * TAU + ph);
	}
	return out;
}

/**
 * The tools both bands paint with, into a wash and a pencil layer of w x h device pixels. Wash colours are pigments by
 * day and light at night (the shader treats them so); the pencil is graphite by day and chalk at night.
 */
function makePainter(w, h, worldH, dark, paper, seed, loose) {
	const k = h / worldH;
	const pt = {
		k, dark, paper, seed, loose, worldH, X0: -w / 2 / k - 14, X1: w / 2 / k + 14,
		wash: makeLayer(w, h, k), pen: makeLayer(w, h, k), R: wcbRng(seed ^ 0x2545F491),
		P: (c) => (dark ? glow(c) : c),
		lead: dark ? mixC(paper, [0.93, 0.94, 0.98], 0.82) : [0.22, 0.24, 0.30],
		lw: 0.5 / Math.pow(Math.min(1, k / 2), 0.4),       // a thin pencil stays visible on a small strip
	};
	const { wash, pen } = pt;

	// a pencil line: it strays a little along its length and its pressure comes and goes; a loose hand draws it twice.
	// (seeded by where it starts, not by how many lines came before: a wider strip does not redraw the others)
	pt.line = (pts, o = {}) => {
		if (pts.length < 2) return;
		const own = (wcbFnv(Math.round(pts[0][0] * 8) + ',' + Math.round(pts[0][1] * 8) + ',' + pts.length) ^ seed) >>> 0;
		const passes = (o.twice ?? hashI(own, 1) < loose * 0.6) ? 2 : 1;
		for (let p = 0; p < passes; p++) {
			const s0 = (own + p * 7919) % (1 << 20), wob = (o.wob ?? 1) * lerp(0.25, 1.1, loose) * (p ? 1.6 : 1);
			let s = 0;
			const out = pts.map((q, i) => {
				if (i) s += Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]);
				return [q[0] + wob * (noise1(s * 0.05, s0) - 0.5) * 2, q[1] + wob * (noise1(s * 0.05, s0 + 3) - 0.5) * 2, s];
			});
			pen.strokeStyle = cssC(o.color ? (dark ? mixC(glow(o.color), pt.lead, 0.25) : o.color) : pt.lead);
			pen.lineWidth = pt.lw * (o.w ?? 1);
			const chunk = 14;
			for (let i = 0; i < out.length - 1; i += chunk) {
				const seg = out.slice(i, i + chunk + 1);
				pen.globalAlpha = clamp((o.a ?? 0.85) * (p ? 0.45 : 1) * (0.7 + 0.6 * noise1(seg[0][2] * 0.03, s0 + 9)), 0, 1);
				pen.beginPath();
				tracePts(pen, seg, false);
				pen.stroke();
			}
		}
		pen.globalAlpha = 1;
	};
	pt.arc = (cx, cy, rx, ry, a0 = 0, a1 = TAU, o = {}) => {
		const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) / 1.5)), pts = [];
		for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
		pt.line(pts, o);
		return pts;
	};
	pt.dot = (x, y, r, a = 0.8, color) => {
		pen.fillStyle = cssC(color ? pt.P(color) : pt.lead);
		pen.globalAlpha = a;
		pen.beginPath();
		pen.arc(x, y, r, 0, TAU);
		pen.fill();
		pen.globalAlpha = 1;
	};
	// a wash laid on in glazes, each with its edge a little elsewhere
	pt.glaze = (pts, color, alpha, o = {}) => {
		const passes = o.passes ?? 3;
		wash.fillStyle = o.fill || cssC(pt.P(color));
		for (let p = 0; p < passes; p++) {
			const s0 = (wcbFnv(String(color) + alpha + ',' + p + ',' + Math.round(pts[0][0])) ^ seed) % (1 << 20), amt = (o.rough ?? 0.9) * (1 + loose);
			wash.globalAlpha = alpha / passes * 1.45;
			wash.beginPath();
			tracePts(wash, pts.map((q) => [q[0] + (noise1(q[1] * 0.2, s0) - 0.5) * amt, q[1] + (noise1(q[0] * 0.18, s0 + 1) - 0.5) * amt * 2]));
			wash.fill();
		}
		wash.globalAlpha = 1;
	};
	pt.softBlob = (x, y, rx, ry, color, alpha) => {
		wash.save();
		wash.translate(x, y);
		wash.scale(rx, ry);
		const gr = wash.createRadialGradient(0, 0, 0, 0, 0, 1);
		gr.addColorStop(0, cssC(pt.P(color), alpha));
		gr.addColorStop(0.6, cssC(pt.P(color), alpha * 0.45));
		gr.addColorStop(1, cssC(pt.P(color), 0));
		wash.fillStyle = gr;
		wash.beginPath();
		wash.arc(0, 0, 1, 0, TAU);
		wash.fill();
		wash.restore();
	};
	// a wash with an uneven outline that ran a little further where it was wetter, pigment along its rim
	pt.blobWash = (x, y, rx, ry, color, alpha, r, soft = false) => {
		const n = 64, base = radial(r, n, 0.2, 2, 7, 1), rot = r.range(-0.4, 0.4), ca = Math.cos(rot), sa = Math.sin(rot);
		const shape = (grow, amp) => {
			const d = radial(r, n, amp, 2, 9, 0), pts = [];
			for (let i = 0; i < n; i++) {
				const a = i / n * TAU, q = base[i] * (1 + d[i]) * grow, ex = Math.cos(a) * rx * q, ey = Math.sin(a) * ry * q;
				pts.push([x + ex * ca - ey * sa, y + ex * sa + ey * ca]);
			}
			return pts;
		};
		wash.fillStyle = cssC(pt.P(color));
		const passes = soft ? 8 : 3;
		for (let i = 0; i < passes; i++) {
			wash.globalAlpha = (soft ? 0.32 : 0.6) * alpha;
			wash.beginPath();
			tracePts(wash, shape(soft ? 0.55 + 0.07 * i : 1 + 0.03 * i, soft ? 0.1 : 0.03));
			wash.fill();
		}
		if (!soft) {
			wash.strokeStyle = cssC(pt.P(color));
			wash.globalAlpha = 0.35 * alpha;
			wash.lineWidth = 0.9;
			wash.beginPath();
			tracePts(wash, shape(1, 0.02));
			wash.stroke();
		}
		wash.globalAlpha = 1;
	};
	// takes pigment back off the paper (paper left white: snow, foam, a cloud)
	pt.erase = (pts, alpha) => {
		wash.globalCompositeOperation = 'destination-out';
		wash.fillStyle = '#000';
		wash.globalAlpha = alpha;
		wash.beginPath();
		tracePts(wash, pts);
		wash.fill();
		wash.globalCompositeOperation = 'source-over';
		wash.globalAlpha = 1;
	};
	pt.eraseBlob = (x, y, rx, ry, alpha) => {
		wash.globalCompositeOperation = 'destination-out';
		pt.softBlob(x, y, rx, ry, [0, 0, 0], alpha);
		wash.globalCompositeOperation = 'source-over';
	};
	// white: by day the paper left bare, at night a pale light (erasing would show the dark page: a hole)
	pt.white = (pts, alpha) => (dark ? pt.glaze(pts, [0.92, 0.93, 0.96], alpha * 0.55, { rough: 0.2, passes: 1 }) : pt.erase(pts, alpha));
	pt.whiteBlob = (x, y, rx, ry, alpha) => (dark ? pt.softBlob(x, y, rx, ry, [0.92, 0.93, 0.96], alpha * 0.55) : pt.eraseBlob(x, y, rx, ry, alpha));
	// takes everything already drawn out of a shape: what stands in front hides what is behind it
	pt.cut = (pts) => {
		for (const g of [wash, pen]) {
			g.globalCompositeOperation = 'destination-out';
			g.fillStyle = '#000';
			g.globalAlpha = 1;
			g.beginPath();
			tracePts(g, pts);
			g.fill();
			g.globalCompositeOperation = 'source-over';
		}
	};
	// things spread along the band are placed per cell of world x, so a wider strip adds cells and moves none
	pt.cells = (size, fn) => {
		for (let ci = Math.floor(pt.X0 / size) - 1; ci <= Math.ceil(pt.X1 / size); ci++) {
			fn(ci, wcbRng((seed ^ Math.imul(ci, 0x9E3779B1) ^ wcbFnv(String(size))) >>> 0), ci * size);
		}
	};
	pt.text = (str, x, y, size, o = {}) => lettering(pt, str, x, y, size, o);
	pt.finish = () => {
		// grains of pigment settling into the paper's tooth (the shader adds the rest)
		wash.setTransform(1, 0, 0, 1, 0, 0);
		wash.globalCompositeOperation = 'destination-out';
		wash.globalAlpha = dark ? 0.08 : 0.12;
		wash.fillStyle = wash.createPattern(grainTile(), 'repeat');
		wash.fillRect(0, 0, w, h);
		wash.globalCompositeOperation = 'source-over';
		wash.globalAlpha = 1;
		return { wash: wash.canvas, pencil: pen.canvas };
	};
	return pt;
}

let GRAIN = null;
function grainTile() {
	if (GRAIN) return GRAIN;
	const size = 128, cv = document.createElement('canvas');
	cv.width = cv.height = size;
	const g = cv.getContext('2d'), img = g.createImageData(size, size), r = wcbRng(77), white = new Float32Array(size * size);
	for (let i = 0; i < white.length; i++) white[i] = r();
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
		let sum = 0;
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += white[((y + dy + size) % size) * size + (x + dx + size) % size];
		const v = lerp(white[y * size + x], sum / 9 * 1.6 - 0.3, 0.6), i = (y * size + x) * 4;
		img.data[i + 3] = Math.round(255 * smooth(0.45, 1, v));
	}
	g.putImageData(img, 0, 0);
	GRAIN = cv;
	return cv;
}

// ----------------------------------------------------------------------------------------------------------- lettering
// Block capitals as an engineer letters a drawing: polylines on a 4 x 6 grid, each point two digits "xy".
const GLYPHS = {
	A: ['062046', '1434'], B: ['06003041423303', '3344453606'], C: ['4130100105163645'], D: ['06002042442606'],
	E: ['40000646', '0333'], F: ['400006', '0333'], G: ['41301001051636454323'], H: ['0006', '4046', '0343'],
	I: ['1030', '2026', '1636'], J: ['204045361605'], K: ['0006', '4004', '1346'], L: ['000646'], M: ['0600234046'],
	N: ['06004640'], O: ['10300141453616050110'], P: ['06003041423303'], Q: ['10300141453616050110', '2446'],
	R: ['06003041423303', '2346'], S: ['413010010213334445361605'], T: ['0040', '2026'], U: ['000516364540'],
	V: ['002640'], W: ['0016233640'], X: ['0046', '4006'], Y: ['0023', '4023', '2326'], Z: ['00400646'],
	0: ['10300141453616050110', '4105'], 1: ['112026', '1636'], 2: ['01103041420646'], 3: ['01103041423313', '334445361605'],
	4: ['36300444'], 5: ['400003334445361605'], 6: ['30100105163645443303'], 7: ['004016'],
	8: ['130201103041423313', '1304051636454433'], 9: ['43130201103041453616'],
	'-': ['1333'], '/': ['0640'], '#': ['1016', '3036', '0242', '0444'], '+': ['1335', '0434'], '(': ['301102041536'], ')': ['103122242516'],
	'>': ['002406'], '<': ['400446'], '=': ['0242', '0444'], '_': ['0646'], '?': ['01103041422324', '2626'], '!': ['2024', '2626'],
};
/** Writes `str` in pencil from (x, y) (the top of the capitals), `size` high; returns its width. */
function lettering(pt, str, x, y, size, o = {}) {
	const u = size / 6, adv = 5.6 * u, slant = 0.14;
	const text = String(str).replace(/ı/g, 'I').toUpperCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
	let cx = x;
	for (const ch of text) {
		const g = GLYPHS[ch];
		if (ch === '.' || ch === ',' || ch === ':') {
			pt.dot(cx + 1 * u, y + 5.7 * u, 0.32 * u + 0.15, o.a ?? 0.85, o.color);
			if (ch === ':') pt.dot(cx + 1.4 * u, y + 2.5 * u, 0.32 * u + 0.15, o.a ?? 0.85, o.color);
			cx += 2.6 * u;
			continue;
		}
		if (g) {
			for (const s of g) {
				const pts = [];
				for (let i = 0; i < s.length; i += 2) {
					const gx = +s[i], gy = +s[i + 1];
					pts.push([cx + gx * u + (6 - gy) * u * slant, y + gy * u]);
				}
				if (pts.length === 1) pts.push([pts[0][0] + 0.01, pts[0][1] + 0.01]);
				pt.line(pts, { w: o.w ?? 0.8, a: o.a ?? 0.85, wob: 0.18, twice: false, color: o.color });
			}
		}
		cx += ch === ' ' ? 3.6 * u : adv;
	}
	return cx - x;
}
const textWidth = (str, size) => {
	let w = 0;
	for (const ch of String(str)) w += ch === ' ' ? 3.6 : '.,:'.includes(ch) ? 2.6 : 5.6;
	return w * size / 6;
};

// --------------------------------------------------------------------------------------------------- painting: header

function paintHeader(S, w, h, dark, paper) {
	const pt = makePainter(w, h, HEAD_H, dark, paper, S.page.seed, S.loose);
	paintSky(pt, S);
	PAINT[S.kind](pt, S);
	return pt.finish();
}

function paintSky(pt, S) {
	const { dark } = pt, sun = S.sun;
	if (S.dusk) {
		// blue hour: the sky deepens overhead and burns low along the horizon
		pt.cells(240, (ci, r, x) => {
			pt.softBlob(x + r.range(0, 240), r.range(-6, 18), r.range(170, 280), r.range(26, 40), mixC(PIGMENTS.indigo, PIGMENTS.violet, 0.35), dark ? 0.16 : 0.36);
			pt.softBlob(x + r.range(0, 240), S.horizon - r.range(8, 18), r.range(160, 260), r.range(14, 22), mixC(PIGMENTS.rose, PIGMENTS.orange, r.range(0.2, 0.7)), dark ? 0.2 : 0.42);
		});
	} else {
		pt.cells(220, (ci, r, x) => {
			pt.softBlob(x + r.range(0, 220), r.range(4, 30), r.range(140, 260), r.range(18, 34), S.sky, dark ? 0.09 : r.range(0.1, 0.18));
		});
	}
	pt.cells(220, (ci, r, x) => {
		if (S.tints.length && r() < 0.5) pt.softBlob(x + r.range(0, 220), r.range(20, 55), r.range(60, 140), r.range(10, 18), r.pick(S.tints), 0.14);
	});
	if (S.clear > 0.45 && !S.dusk) pt.softBlob(sun.x, S.horizon - 2, 360, 26, mixC(PIGMENTS.ochre, PIGMENTS.rose, 0.35), 0.28 * S.clear);
	if (S.kind === 'dunes') pt.softBlob(sun.x, S.horizon, 420, 36, mixC(PIGMENTS.ochre, PIGMENTS.orange, 0.4), 0.3);
	if (dark) {
		pt.cells(48, (ci, r, x) => {      // stars, fewer under cloud
			if (r() > 0.25 + 0.55 * S.clear + (S.dusk ? 0.3 : 0)) return;
			pt.dot(x + r.range(0, 48), r.range(3, 52), r.range(0.25, 0.55), r.range(0.35, 0.9));
		});
	}
	if (S.clear > 0.25 || S.dusk || S.kind === 'dunes') {
		const col = dark ? [0.86, 0.88, 0.95] : S.dusk ? PIGMENTS.orange : mixC(PIGMENTS.lemon, PIGMENTS.orange, 0.5 * S.clear);
		pt.softBlob(sun.x, sun.y, sun.r * 2.6, sun.r * 2.6, col, dark ? 0.35 : 0.5);
		const a0 = pt.R() * TAU;
		pt.arc(sun.x, sun.y, sun.r, sun.r, a0, a0 + TAU * 0.88, { w: 0.8, a: 0.6 });
	}
	// clouds: a heap of puffs, the sky lifted out of it, a grey wash underneath and a pencil line along its top
	const cloudy = S.kind === 'dunes' ? (1 - S.clear) * 0.4 : 1 - S.clear;
	pt.cells(260, (ci, r, x) => {
		if (r() > 0.18 + 0.75 * cloudy) return;
		const cx = x + r.range(0, 260), cy = r.range(16, Math.min(46, S.horizon - 18)), puffs = 3 + r.int(4), cw = r.range(7, 12);
		const ps = [];
		for (let p = 0; p < puffs; p++) {
			const mid = Math.abs(p - (puffs - 1) / 2) / puffs;
			ps.push([cx + (p - (puffs - 1) / 2) * cw * 1.15 + r.range(-1.5, 1.5), cw * r.range(0.75, 1.15) * (1.15 - mid * 0.9)]);
		}
		const left = ps[0][0] - ps[0][1], right = ps[ps.length - 1][0] + ps[ps.length - 1][1];
		const top = [];
		for (let xx = left; xx <= right + 0.01; xx += 0.75) {
			let y = cy;
			for (const [px, pr] of ps) { const d = pr * pr - (xx - px) * (xx - px); if (d > 0) y = Math.min(y, cy - Math.sqrt(d) * 0.8); }
			top.push([xx, y]);
		}
		const body = top.concat([[right, cy + 1.2], [left, cy + 1.2]]);
		pt.erase(body, 0.75);
		const hi = Math.min(...top.map((q) => q[1]));
		const tone = S.dusk ? mixC(PIGMENTS.violet, PIGMENTS.rose, 0.4) : mixC(PIGMENTS.payne, S.sky, 0.3);
		const shade = pt.wash.createLinearGradient(0, hi + (cy - hi) * 0.35, 0, cy + 1.2);
		shade.addColorStop(0, cssC(pt.P(tone), 0));
		shade.addColorStop(1, cssC(pt.P(tone), 1));
		pt.glaze(body, tone, (pt.dark ? 0.1 : 0.32) * (0.5 + cloudy), { fill: shade, rough: 0.4, passes: 2 });
		pt.line(top, { w: 0.7, a: 0.55, wob: 0.5 });
		pt.line([[left + cw * 0.4, cy + 1.2], [right - cw * r.range(0.4, 1.6), cy + 1.2]], { w: 0.55, a: 0.3, twice: false });
	});
	// birds, near the light
	const birds = Math.min(S.page.c.quotes, 7);
	for (let b = 0; b < birds; b++) {
		const bx = sun.x + pt.R.range(-90, 90), by = pt.R.range(14, Math.min(48, S.horizon - 12)), s = pt.R.range(1.8, 3.2);
		bird(pt, bx, by, s);
	}
}

function bird(pt, x, y, s) {
	pt.line([[x - s, y - s * 0.5], [x - s * 0.45, y - s * 0.65], [x, y]], { w: 0.75, a: 0.75, twice: false, wob: 0.3 });
	pt.line([[x, y], [x + s * 0.45, y - s * 0.65], [x + s, y - s * 0.45]], { w: 0.75, a: 0.75, twice: false, wob: 0.3 });
}

/** A range: its wash graded down from the crest, pigment heavier along the top, snow, an outline, hatching. */
function paintRange(pt, S, rg, o = {}) {
	const step = 1.5, crest = [];
	for (let x = Math.floor(pt.X0 / step) * step; x <= pt.X1; x += step) crest.push([x, rg.y(x)]);
	const bottom = o.bottom ?? HEAD_H + 20;
	let top = Infinity;
	for (const q of crest) top = Math.min(top, q[1]);
	const body = crest.concat([[pt.X1, bottom], [pt.X0, bottom]]);
	const gr = pt.wash.createLinearGradient(0, top, 0, Math.min(bottom, rg.base + 30));
	gr.addColorStop(0, cssC(pt.P(rg.color), 1));
	gr.addColorStop(1, cssC(pt.P(rg.color), 0.3));
	pt.glaze(body, rg.color, rg.density, { fill: gr });
	const band = crest.concat(crest.slice().reverse().map((q) => [q[0], q[1] + 7 + 6 * noise1(q[0] * 0.05, rg.seed)]));
	pt.glaze(band, rg.color, rg.density * 0.3, { passes: 2 });
	if (o.snow && S.season === 'winter') {
		let run = [];
		const flush = () => {
			if (run.length > 2) pt.erase(run.map((q) => [q[0], q[1] - 0.5]).concat(run.slice().reverse().map((q) => [q[0], q[1] + q[2]])), 0.85);
			run = [];
		};
		for (const q of crest) {
			const hh = rg.h(q[0]);
			if (hh > 0.6) run.push([q[0], q[1], (hh - 0.6) * rg.amp * (0.5 + 0.9 * noise1(q[0] * 0.15, rg.seed + 2))]);
			else flush();
		}
		flush();
	}
	if (o.outline !== false) {
		const a = (o.a ?? 1) * lerp(0.9, 0.38, rg.depth);
		let chunk = [], cell = null;
		const draw = () => { if (chunk.length > 1) pt.line(chunk, { a, w: lerp(1.05, 0.7, rg.depth) }); };
		for (const q of crest) {
			if (rg.mask && rg.mask(q[0]) < 0.02) { draw(); chunk = []; cell = null; continue; }
			const ci = Math.floor(q[0] / 36);
			if (ci !== cell) {
				draw();
				// the line is lifted now and then, and set down again a little further on
				chunk = hashI(ci, rg.seed + 11) < 0.18 || !chunk.length ? [] : [chunk[chunk.length - 1]];
				cell = ci;
			}
			chunk.push(q);
		}
		draw();
	}
	// hatching on the slopes that turn away from the light, on the nearer ranges
	if (o.hatch !== false && rg.depth < 0.55) {
		for (let i = 2; i < crest.length - 2; i++) {
			if (Math.round(crest[i][0] / step) % 2) continue;
			const [x, y] = crest[i], d = (crest[i + 1][1] - crest[i - 1][1]) / (2 * step);
			const away = d * (x - S.sun.x) > 0 ? Math.abs(d) : 0;
			if (away < 0.12 || noise1(x * 0.08, rg.seed + 5) < 0.35) continue;
			const len = clamp(away * 14, 3, 12) * (1 - rg.depth);
			pt.line([[x, y + 1.6], [x - len * 0.35, y + 1.6 + len]], { w: 0.55, a: 0.35, twice: false, wob: 0.2 });
		}
	}
	return crest;
}

// ---- the things that stand in the scenes

const seasonLeaf = (S, R) => ({ spring: PIGMENTS.sap, summer: mixC(PIGMENTS.sap, PIGMENTS.viridian, 0.5), winter: PIGMENTS.viridian }[S.season] || R.pick([PIGMENTS.sienna, PIGMENTS.ochre, PIGMENTS.madder]));

/** n positions spread around a centre, the done ones shuffled in among them */
function spread(R, n, done, centre, spacing) {
	const flags = Array.from({ length: n }, (_, i) => i < done);
	for (let i = flags.length - 1; i > 0; i--) { const j = R.int(i + 1); [flags[i], flags[j]] = [flags[j], flags[i]]; }
	const start = centre - spacing * (n - 1) / 2;
	return flags.map((painted, i) => ({ x: start + i * spacing + R.range(-spacing * 0.25, spacing * 0.25), painted }));
}

function fir(pt, x, baseY, th, color, painted) {
	const tw = th * 0.58, top = baseY - th;
	const outline = [
		[x, top], [x - tw * 0.24, top + th * 0.32], [x - tw * 0.1, top + th * 0.3], [x - tw * 0.38, top + th * 0.64], [x - tw * 0.2, top + th * 0.62],
		[x - tw * 0.5, baseY - 1.4], [x + tw * 0.5, baseY - 1.4], [x + tw * 0.2, top + th * 0.62], [x + tw * 0.38, top + th * 0.64],
		[x + tw * 0.1, top + th * 0.3], [x + tw * 0.24, top + th * 0.32], [x, top],
	];
	if (painted) pt.glaze(outline, color, 0.62, { rough: 0.5, passes: 2 });
	pt.line(outline, { w: 0.7, a: 0.8, wob: 0.35 });
	pt.line([[x, baseY - 1.4], [x, baseY + 1.2]], { w: 0.8, a: 0.8, twice: false, wob: 0.1 });
}
function roundTree(pt, x, baseY, size, color, painted, r) {
	const cy = baseY - size * 1.15, n = 40, rad = radial(r, n, 0.12, 3, 7, 1), pts = [];
	for (let i = 0; i <= n; i++) { const a = i / n * TAU; pts.push([x + Math.cos(a) * size * 0.85 * rad[i % n], cy + Math.sin(a) * size * 0.7 * rad[i % n]]); }
	if (painted) {
		pt.glaze(pts, color, 0.6, { rough: 0.6, passes: 3 });
		pt.softBlob(x + size * 0.25, cy + size * 0.25, size * 0.5, size * 0.35, mixC(color, PIGMENTS.indigo, 0.4), 0.35);
	}
	// a scalloped outline over the top only, as one draws foliage
	const scallop = [];
	for (let i = 0; i <= 26; i++) { const a = Math.PI * 0.95 + i / 26 * Math.PI * 1.1; const q = 1 + 0.08 * Math.sin(i * 1.9); scallop.push([x + Math.cos(a) * size * 0.85 * q * rad[Math.floor(i / 26 * n) % n], cy + Math.sin(a) * size * 0.7 * q]); }
	pt.line(scallop, { w: 0.75, a: 0.75, wob: 0.4 });
	pt.line([[x - 0.6, baseY], [x - 0.4, cy + size * 0.35]], { w: 0.8, a: 0.8, twice: false, wob: 0.1 });
	pt.line([[x + 0.8, baseY], [x + 0.5, cy + size * 0.4]], { w: 0.7, a: 0.7, twice: false, wob: 0.1 });
}
function palm(pt, x, baseY, size) {
	const top = [x + size * 0.35, baseY - size * 1.6];
	pt.line([[x, baseY], [x + size * 0.12, baseY - size * 0.8], top], { w: 0.85, a: 0.8, wob: 0.2 });
	pt.line([[x + 1.2, baseY], [x + size * 0.12 + 1, baseY - size * 0.8], [top[0] + 0.8, top[1]]], { w: 0.6, a: 0.6, wob: 0.2 });
	for (let i = 0; i < 6; i++) {
		const a = -Math.PI * 0.95 + i / 5 * Math.PI * 0.9 + (i % 2) * 0.12, len = size * (0.9 + 0.2 * (i % 2));
		const mid = [top[0] + Math.cos(a) * len * 0.5, top[1] + Math.sin(a) * len * 0.5 - size * 0.12];
		const end = [top[0] + Math.cos(a) * len, top[1] + Math.sin(a) * len * 0.7 + size * 0.35];
		pt.line([top, mid, end], { w: 0.7, a: 0.75, wob: 0.3 });
		pt.glaze([top, [mid[0], mid[1] - 1], end, [mid[0], mid[1] + 1.4]], PIGMENTS.sap, 0.5, { rough: 0.3, passes: 1 });
	}
}
function cactus(pt, x, baseY, size, painted) {
	const w = size * 0.18, top = baseY - size;
	const body = [[x - w, baseY], [x - w, top + w], [x, top], [x + w, top + w], [x + w, baseY]];
	const armL = [[x - w, baseY - size * 0.45], [x - size * 0.42, baseY - size * 0.45], [x - size * 0.42, baseY - size * 0.75]];
	const armR = [[x + w, baseY - size * 0.6], [x + size * 0.38, baseY - size * 0.6], [x + size * 0.38, baseY - size * 0.88]];
	if (painted) {
		pt.glaze(body, PIGMENTS.sap, 0.6, { rough: 0.3, passes: 2 });
		pt.glaze(armL.concat([[armL[2][0] + w * 1.6, armL[2][1]], [armL[1][0] + w * 1.6, armL[1][1] - w * 1.6]]), PIGMENTS.sap, 0.5, { rough: 0.3, passes: 1 });
	}
	pt.line(body, { w: 0.75, a: 0.8, wob: 0.2 });
	pt.line(armL, { w: 0.7, a: 0.75, wob: 0.2 });
	pt.line(armR, { w: 0.7, a: 0.75, wob: 0.2 });
	pt.line([[x, top + 2], [x, baseY - 1]], { w: 0.45, a: 0.4, twice: false, wob: 0.1 });
}
function birch(pt, x, baseY, size, color, painted, r) {
	const top = baseY - size;
	pt.line([[x, baseY], [x + 0.6, top]], { w: 0.75, a: 0.8, wob: 0.15 });
	pt.line([[x + 1.6, baseY], [x + 1.9, top + 2]], { w: 0.6, a: 0.65, wob: 0.15 });
	for (let i = 0; i < 4; i++) { const yy = baseY - size * (0.2 + 0.18 * i); pt.line([[x + 0.1, yy], [x + 1.3, yy - 0.3]], { w: 0.9, a: 0.7, twice: false, wob: 0.05 }); }
	if (painted) for (let i = 0; i < 5; i++) pt.blobWash(x + 1 + r.range(-size * 0.3, size * 0.3), top + r.range(0, size * 0.45), size * r.range(0.14, 0.24), size * r.range(0.1, 0.18), color, 0.5, r, true);
}
function boat(pt, x, y, size, color, painted) {
	const hull = [[x - size, y - size * 0.18], [x + size, y - size * 0.18], [x + size * 0.7, y + size * 0.15], [x - size * 0.65, y + size * 0.15]];
	pt.glaze(hull, PIGMENTS.umber, 0.45, { rough: 0.2, passes: 1 });
	pt.line(hull.concat([hull[0]]), { w: 0.6, a: 0.8, wob: 0.15, twice: false });
	const mast = [x - size * 0.05, y - size * 0.18], top = [x - size * 0.05, y - size * 1.9];
	pt.line([mast, top], { w: 0.6, a: 0.85, twice: false, wob: 0.05 });
	const sail = [top, [x + size * 0.85, y - size * 0.35], [x + size * 0.05, y - size * 0.35]];
	if (painted) pt.glaze(sail, color, 0.6, { rough: 0.2, passes: 2 });
	pt.line(sail, { w: 0.55, a: 0.75, wob: 0.1, twice: false });
	pt.line([[x - size * 0.8, y + size * 0.35], [x + size * 0.6, y + size * 0.35]], { w: 0.45, a: 0.4, twice: false, wob: 0.2 });
}
function cairn(pt, x, y, flag, r) {
	const stones = 3 + r.int(2);
	for (let s = 0; s < stones; s++) {
		const rw = lerp(4.4, 2.1, s / stones), rh = rw * 0.55, pts = [];
		for (let j = 0; j <= 18; j++) { const a = j / 18 * TAU; pts.push([x + Math.cos(a) * rw + r.range(-0.2, 0.2), y - rh + Math.sin(a) * rh]); }
		pt.glaze(pts, PIGMENTS.umber, 0.35, { rough: 0.2, passes: 1 });
		pt.line(pts, { w: 0.6, a: 0.75, twice: false, wob: 0.15 });
		y -= rh * 1.75;
	}
	if (flag) {
		pt.line([[x, y + 1], [x, y - 10]], { w: 0.75, a: 0.85, twice: false, wob: 0.1 });
		const f = [[x, y - 10], [x + 7, y - 8], [x, y - 6]];
		pt.glaze(f, r.pick([PIGMENTS.madder, PIGMENTS.orange, PIGMENTS.rose]), 0.75, { rough: 0.2, passes: 2 });
		pt.line(f, { w: 0.6, a: 0.7, twice: false, wob: 0.1 });
	}
}
function cairns(pt, S, yAt, span = 260) {
	const n = Math.min(S.page.c.headings, 6);
	const xs = Array.from({ length: n }, () => pt.R.range(-span, span)).sort((a, b) => a - b);
	xs.forEach((x, i) => { const y = yAt(x); if (y !== null) cairn(pt, x, y + 1, i === 0 && S.page.c.h1 > 0, pt.R); });
}
function masts(pt, S, yAt) {
	const n = Math.min(S.page.c.code, 3);
	let last = null;
	for (let i = 0; i < n; i++) {
		const x = pt.R.range(-80, 80) + (i - (n - 1) / 2) * 70, base = yAt(x) + 1, top = base - pt.R.range(18, 24);
		pt.line([[x, base], [x, top]], { w: 0.85, a: 0.85, twice: false, wob: 0.15 });
		pt.line([[x - 3.5, top + 2], [x + 3.5, top + 2]], { w: 0.7, a: 0.8, twice: false, wob: 0.1 });
		pt.line([[x - 2.2, top + 5], [x + 2.2, top + 5]], { w: 0.6, a: 0.7, twice: false, wob: 0.1 });
		pt.line([[x - 4, base], [x, top + 7], [x + 4, base]], { w: 0.5, a: 0.5, twice: false, wob: 0.15 });
		if (last) {
			const wire = [];
			for (let j = 0; j <= 20; j++) { const t = j / 20; wire.push([lerp(last[0], x - 3.5, t), lerp(last[1], top + 2, t) + Math.sin(t * Math.PI) * 4]); }
			pt.line(wire, { w: 0.45, a: 0.55, twice: false, wob: 0.1 });
		}
		last = [x + 3.5, top + 2];
	}
}
function fence(pt, S, yAt, x0) {
	if (!S.page.c.lists) return;
	const posts = Math.min(4 + S.page.c.lists, 14), sp = 6.5, tops = [];
	x0 = x0 ?? pt.R.range(-180, 120);
	for (let i = 0; i < posts; i++) {
		const x = x0 + i * sp, y = yAt(x) + 3;
		pt.line([[x, y], [x, y - 4.5]], { w: 0.65, a: 0.75, twice: false, wob: 0.1 });
		tops.push([x, y - 3.8]);
	}
	pt.line(tops, { w: 0.5, a: 0.6, twice: false, wob: 0.2 });
	pt.line(tops.map((q) => [q[0], q[1] + 2]), { w: 0.45, a: 0.45, twice: false, wob: 0.2 });
}
function pond(pt, x, y, wid) {
	const pts = [];
	for (let i = 0; i <= 30; i++) { const a = i / 30 * TAU; pts.push([x + Math.cos(a) * wid / 2, y + Math.sin(a) * 3.2]); }
	pt.glaze(pts, mixC(PIGMENTS.cerulean, WHITE, 0.2), 0.7, { rough: 0.4 });
	for (let i = 0; i < 4; i++) {
		const yy = y - 1.5 + i * 1.1, half = wid * pt.R.range(0.12, 0.35), xx = x + pt.R.range(-wid / 4, wid / 4);
		pt.line([[xx - half, yy], [xx + half, yy]], { w: 0.55, a: 0.5, twice: false });
	}
}
function lowestAt(rg, from, to) {
	let lx = 0, ly = -Infinity;
	for (let x = from; x <= to; x += 4) { const y = rg.y(x); if (y > ly) { ly = y; lx = x; } }
	return [lx, ly];
}
function windmill(pt, x, base, size) {
	const top = base - size;
	const tower = [[x - size * 0.22, base], [x - size * 0.13, top], [x + size * 0.13, top], [x + size * 0.22, base]];
	pt.glaze(tower, mixC(PIGMENTS.umber, WHITE, 0.4), 0.5, { rough: 0.2, passes: 2 });
	pt.line(tower, { w: 0.7, a: 0.85, wob: 0.15 });
	pt.line([[x - size * 0.18, top], [x, top - size * 0.16], [x + size * 0.18, top]], { w: 0.7, a: 0.85, twice: false, wob: 0.1 });
	const hub = [x, top + size * 0.05], a0 = pt.R.range(0, Math.PI / 2);
	for (let i = 0; i < 4; i++) {
		const a = a0 + i * Math.PI / 2, e = [hub[0] + Math.cos(a) * size * 0.7, hub[1] + Math.sin(a) * size * 0.7];
		pt.line([hub, e], { w: 0.65, a: 0.8, twice: false, wob: 0.1 });
		const b = a + 0.22, e2 = [hub[0] + Math.cos(b) * size * 0.66, hub[1] + Math.sin(b) * size * 0.66], m2 = [hub[0] + Math.cos(b) * size * 0.2, hub[1] + Math.sin(b) * size * 0.2];
		const blade = [[hub[0] + Math.cos(a) * size * 0.2, hub[1] + Math.sin(a) * size * 0.2], e, e2, m2];
		pt.line(blade, { w: 0.45, a: 0.55, twice: false, wob: 0.1 });
	}
	pt.dot(hub[0], hub[1], 0.8, 0.8);
}

// ---- the seven scenes

function seaPaint(pt, S, shoreY) {
	const H0 = S.horizon, deep = mixC(S.dusk ? PIGMENTS.indigo : PIGMENTS.ultramarine, S.house, 0.35);
	const body = [[pt.X0, H0], [pt.X1, H0], [pt.X1, HEAD_H + 20], [pt.X0, HEAD_H + 20]];
	const gr = pt.wash.createLinearGradient(0, H0, 0, shoreY);
	gr.addColorStop(0, cssC(pt.P(deep), 1));
	gr.addColorStop(1, cssC(pt.P(mixC(deep, PIGMENTS.cerulean, 0.6)), 0.45));
	pt.glaze(body, deep, S.dusk ? 0.7 : 0.55, { fill: gr, rough: 0.3 });
	// the horizon, ruled but by hand
	pt.cells(90, (ci, r, x) => pt.line([[x, H0 + r.range(-0.15, 0.15)], [x + 90, H0 + r.range(-0.15, 0.15)]], { w: 0.75, a: 0.75, twice: false, wob: 0.12 }));
	// waves: rows of short strokes, further apart and longer towards you
	for (let k = 1; k < 40; k++) {
		const y = H0 + 1.2 * Math.pow(k, 1.35);
		if (y > shoreY - 2) break;
		const t = (y - H0) / (shoreY - H0), len = lerp(2, 9, t), gap = lerp(10, 26, t);
		pt.cells(gap * 6, (ci, r, x) => {
			for (let j = 0; j < 6; j++) {
				if (r() < 0.45) continue;
				const xx = x + j * gap + r.range(0, gap);
				pt.line([[xx, y], [xx + len * 0.5, y - lerp(0.2, 0.9, t)], [xx + len, y]], { w: lerp(0.45, 0.65, t), a: lerp(0.3, 0.5, t), twice: false, wob: 0.1 });
			}
		});
	}
	// the sun's path on the water
	if (S.clear > 0.25 || S.dusk) {
		const col = S.dusk ? PIGMENTS.orange : PIGMENTS.lemon;
		for (let k = 0; k < 16; k++) {
			const y = H0 + 2 + k * 2.6, half = lerp(9, 2, k / 16) * pt.R.range(0.6, 1.3), x = S.sun.x + pt.R.range(-4, 4) * (1 + k * 0.2);
			pt.glaze([[x - half, y - 0.5], [x + half, y - 0.5], [x + half * 0.8, y + 0.6], [x - half * 0.8, y + 0.6]], col, 0.55, { rough: 0.2, passes: 1 });
		}
	}
}
function islands(pt, S) {
	for (const rg of S.ranges) paintRange(pt, S, rg, { bottom: S.horizon + 1.2, hatch: false });
}
function beachPaint(pt, S) {
	const b = S.beach, crest = paintRange(pt, S, b, { hatch: false });
	// foam: the paper left white along the shore, and a wavy line
	const foam = crest.map((q) => [q[0], q[1] - 1.8 - 1.2 * noise1(q[0] * 0.12, b.seed)]);
	pt.erase(foam.concat(crest.slice().reverse().map((q) => [q[0], q[1] + 0.5])), 0.9);
	pt.cells(70, (ci, r, x) => {
		const pts = [];
		for (let xx = x; xx <= x + 70 * r.range(0.55, 1); xx += 2) pts.push([xx, b.y(xx) - 2.2 - 1.1 * Math.sin(xx * 0.35 + ci)]);
		pt.line(pts, { w: 0.55, a: 0.55, twice: false, wob: 0.2 });
	});
	return crest;
}
function boats(pt, S, top, bottom) {
	const n = Math.min(S.page.c.tasks, 12);
	if (!n) return;
	const R = pt.R;
	spread(R, n, Math.min(S.page.c.done, n), R.range(-120, 120), R.range(26, 40)).forEach((b, i) => {
		const t = R.range(0.1, 0.9), y = lerp(top, bottom, t);
		boat(pt, b.x, y, lerp(2.6, 6, t), R.pick([PIGMENTS.madder, PIGMENTS.ochre, WHITE, S.house]), b.painted);
	});
}
function pier(pt, S, yAt) {
	if (!S.page.c.code) return;
	const x0 = pt.R.range(-160, 160), base = yAt(x0), far = [x0 + pt.R.range(-30, 30), S.horizon + 14];
	const rails = [[[x0 - 4, base], [far[0] - 1, far[1]]], [[x0 + 4, base], [far[0] + 1, far[1]]]];
	for (const r of rails) pt.line(r, { w: 0.65, a: 0.8, twice: false, wob: 0.1 });
	pt.glaze([rails[0][0], rails[0][1], rails[1][1], rails[1][0]], mixC(PIGMENTS.umber, SAND, 0.5), 0.18, { rough: 0.2, passes: 1 });
	for (let i = 0; i <= 8; i++) {
		const t = i / 8, x = lerp(x0, far[0], t), y = lerp(base, far[1], t), w = lerp(4, 1, t);
		pt.line([[x - w, y], [x - w, y + lerp(5, 1.5, t)]], { w: 0.55, a: 0.7, twice: false, wob: 0.05 });
		pt.line([[x + w, y], [x + w, y + lerp(5, 1.5, t)]], { w: 0.55, a: 0.7, twice: false, wob: 0.05 });
	}
}
function lighthouseTower(pt, S) {
	const { x, base, h } = S.lamp, side = S.side, top = base - h, w0 = 4.2, w1 = 2.9;
	const at = (t) => [lerp(w0, w1, t), lerp(base, top, t)];
	const body = [[x - w0, base], [x - w1, top], [x + w1, top], [x + w0, base]];
	pt.glaze(body, mixC(WHITE, SAND, 0.3), 0.4, { rough: 0.2, passes: 1 });
	for (let i = 0; i < 3; i++) {
		const t0 = 0.12 + i * 0.28, t1 = t0 + 0.13, [a, y0] = at(t0), [b, y1] = at(t1);
		pt.glaze([[x - a, y0], [x + a, y0], [x + b, y1], [x - b, y1]], PIGMENTS.madder, 0.75, { rough: 0.2, passes: 2 });
	}
	pt.line(body, { w: 0.85, a: 0.9, wob: 0.15 });
	// the lantern room, the gallery, the cap
	pt.line([[x - w1 - 1.2, top], [x + w1 + 1.2, top]], { w: 0.75, a: 0.9, twice: false, wob: 0.05 });
	const lt = top - 5;
	pt.glaze([[x - 2.2, top], [x - 2.2, lt], [x + 2.2, lt], [x + 2.2, top]], PIGMENTS.lemon, 0.8, { rough: 0.1, passes: 2 });
	pt.line([[x - 2.2, top], [x - 2.2, lt], [x + 2.2, lt], [x + 2.2, top]], { w: 0.6, a: 0.85, twice: false, wob: 0.05 });
	pt.line([[x - 3, lt], [x, lt - 3.2], [x + 3, lt]], { w: 0.7, a: 0.9, twice: false, wob: 0.05 });
	pt.glaze([[x - 3, lt], [x, lt - 3.2], [x + 3, lt]], PIGMENTS.madder, 0.7, { rough: 0.1, passes: 1 });
	// the keeper's house beside it
	const hx = x + side * 12, hb = S.cliffY(hx) ?? base, hw = 6, hh = 5;
	const house = [[hx - hw, hb], [hx - hw, hb - hh], [hx + hw, hb - hh], [hx + hw, hb]];
	pt.glaze(house, mixC(WHITE, SAND, 0.45), 0.45, { rough: 0.2, passes: 1 });
	pt.line(house, { w: 0.7, a: 0.85, wob: 0.1 });
	const roof = [[hx - hw - 1, hb - hh], [hx, hb - hh - 4.5], [hx + hw + 1, hb - hh]];
	pt.glaze(roof.concat([[hx - hw - 1, hb - hh]]), PIGMENTS.madder, 0.6, { rough: 0.2, passes: 1 });
	pt.line(roof, { w: 0.7, a: 0.85, twice: false, wob: 0.1 });
	pt.line([[hx - 1, hb], [hx - 1, hb - 2.8], [hx + 1, hb - 2.8], [hx + 1, hb]], { w: 0.5, a: 0.7, twice: false, wob: 0.05 });
}
function headland(pt, S) {
	const step = 1.5, pts = [];
	for (let x = Math.floor(pt.X0 / step) * step; x <= pt.X1; x += step) { const y = S.cliffY(x); if (y !== null) pts.push([x, y]); }
	if (pts.length < 2) return;
	const body = pts.concat([[pts[pts.length - 1][0], HEAD_H + 20], [pts[0][0], HEAD_H + 20]]);
	const rock = mixC(S.lead[0] ? mixC(tagPigment(S.lead[0].name), PIGMENTS.umber, 0.5) : mixC(PIGMENTS.umber, PIGMENTS.violet, 0.2), SAND, 0.3);
	let top = Infinity;
	for (const q of pts) top = Math.min(top, q[1]);
	const gr = pt.wash.createLinearGradient(0, top, 0, S.horizon + 40);
	gr.addColorStop(0, cssC(pt.P(rock), 1));
	gr.addColorStop(1, cssC(pt.P(rock), 0.35));
	pt.glaze(body, rock, 0.6, { fill: gr });
	// grass on the plateau
	const plateau = pts.filter((q) => S.side * q[0] - S.edge > 2);
	if (plateau.length > 2) pt.glaze(plateau.concat(plateau.slice().reverse().map((q) => [q[0], q[1] + 5 + 2 * noise1(q[0] * 0.1, 3)])), PIGMENTS.sap, 0.6, { passes: 2 });
	pt.line(pts, { w: 1, a: 0.9 });
	// the cliff face: strata and cracks, foam at its foot
	const edgeX = S.side * S.edge;
	for (let i = 0; i < 9; i++) {
		const x = edgeX + S.side * pt.R.range(-10, 30), y0 = (S.cliffY(x) ?? S.horizon) + pt.R.range(3, 8);
		pt.line([[x, y0], [x + S.side * pt.R.range(-2, 2), y0 + pt.R.range(8, 18)]], { w: 0.5, a: 0.45, twice: false, wob: 0.2 });
	}
	const foot = S.horizon + 30;
	for (let i = 0; i < 4; i++) {
		const x = edgeX - S.side * (14 - i * 3) + pt.R.range(-1, 1);
		pt.arc(x, foot + 1, 3 + i, 1.4, Math.PI, TAU, { w: 0.55, a: 0.6, twice: false });
	}
	pt.eraseBlob(edgeX - S.side * 12, foot + 2, 16, 3, 0.8);
}

const PAINT = {
	mountains(pt, S) {
		for (const rg of S.ranges) paintRange(pt, S, rg, { snow: rg.family === 'jagged' || rg.family === 'cone' || rg.depth > 0.6 });
		const front = S.front, middle = S.middle, c = S.page.c, R = pt.R;
		if (c.images > 0) { const [lx, ly] = lowestAt(front, -220, 220); pond(pt, lx, ly + 5, R.range(36, 64)); }
		const n = Math.min(c.tasks, 24);
		if (n) {
			const leaf = seasonLeaf(S, R);
			spread(R, n, Math.min(c.done, n), R.range(-90, 90), R.range(9, 13)).forEach((t) => fir(pt, t.x, middle.y(t.x) + 2.5, R.range(9, 14) * (1.1 - middle.depth * 0.3), S.season === 'autumn' ? R.pick([PIGMENTS.sienna, PIGMENTS.ochre, PIGMENTS.madder]) : leaf, t.painted));
		}
		masts(pt, S, (x) => middle.y(x));
		cairns(pt, S, (x) => front.y(x));
		fence(pt, S, (x) => front.y(x));
	},
	coast(pt, S) {
		const shore = S.beach.base - S.beach.amp * 0.6;
		seaPaint(pt, S, shore);
		islands(pt, S);
		if (S.page.c.images > 0) {        // an island with a palm
			const ix = pt.R.range(-200, 200), iy = S.horizon + 16, iw = pt.R.range(16, 26), pts = [];
			for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([ix - iw + t * iw * 2, iy - Math.sin(t * Math.PI) * 4]); }
			pt.glaze(pts, SAND, 0.65, { rough: 0.3 });
			pt.line(pts, { w: 0.7, a: 0.8 });
			palm(pt, ix + 2, iy - 3, 9);
		}
		boats(pt, S, S.horizon + 6, shore - 10);
		pier(pt, S, (x) => S.beach.y(x));
		beachPaint(pt, S);
		cairns(pt, S, (x) => S.beach.y(x) + 4);
		fence(pt, S, (x) => S.beach.y(x) + 3);
	},
	lighthouse(pt, S) {
		const shore = S.beach.base - S.beach.amp * 0.6;
		seaPaint(pt, S, shore);
		islands(pt, S);
		boats(pt, S, S.horizon + 6, shore - 10);
		headland(pt, S);
		lighthouseTower(pt, S);
		// posts along the cliff path for lists, cairns further inland for headings
		const posts = Math.min(4 + S.page.c.lists, 14);
		fence(pt, S, (x) => S.cliffY(x) ?? S.lamp.base, S.lamp.x + S.side * 22 - (S.side < 0 ? posts * 6.5 : 0));
		for (let i = 0; i < Math.min(S.page.c.headings, 3); i++) {
			const x = S.side * (S.edge + 52 + i * 11), y = S.cliffY(x);
			if (y !== null) cairn(pt, x, y + 1, i === 0 && S.page.c.h1 > 0, pt.R);
		}
		if (S.page.c.code) pier(pt, S, () => S.horizon + 34);
		beachPaint(pt, { ...S, beach: { ...S.beach, mask: (x) => (S.cliffY(x) === null ? 1 : 0), h(x) { return S.beach.h(x); }, y(x) { return S.cliffY(x) === null ? S.beach.y(x) : HEAD_H + 30; } } });
	},
	meadow(pt, S) {
		const R = pt.R;
		S.ranges.forEach((rg, i) => {
			const crest = paintRange(pt, S, rg, { hatch: false });
			if (i === 0 || i === S.ranges.length - 1) return;
			// fields on the hills: ploughed rows in some cells, hedges between them
			pt.cells(70, (ci, r, x) => {
				if (r() < 0.45) return;
				const rows = 3 + r.int(3);
				for (let k = 1; k <= rows; k++) {
					const pts = [];
					for (let xx = x + 3; xx <= x + 67; xx += 3) pts.push([xx, rg.y(xx) + k * 2.6 + 2]);
					pt.line(pts, { w: 0.45, a: 0.3, twice: false, wob: 0.15 });
				}
				const hx = x + 68;
				pt.line([[hx, rg.y(hx) + 1], [hx + 1, rg.y(hx) + 14]], { w: 0.6, a: 0.45, twice: false, wob: 0.4 });
				pt.blobWash(hx, rg.y(hx) + 3, 3, 2, mixC(PIGMENTS.viridian, PIGMENTS.indigo, 0.3), 0.5, r, true);
			});
			void crest;
		});
		const front = S.front, middle = S.middle, c = S.page.c;
		// the lone tree
		const tx = R.range(-200, 200);
		roundTree(pt, tx, middle.y(tx) + 1.5, R.range(12, 17), seasonLeaf(S, R), true, R);
		const n = Math.min(c.tasks, 18);
		if (n) spread(R, n, Math.min(c.done, n), tx + R.pick([-1, 1]) * R.range(60, 120), R.range(10, 15)).forEach((t) => {
			const rg = R() < 0.5 ? middle : S.ranges[Math.max(1, S.ranges.length - 3)];
			roundTree(pt, t.x, rg.y(t.x) + 1, R.range(4, 7), seasonLeaf(S, R), t.painted, R);
		});
		if (c.code) windmill(pt, tx + R.pick([-1, 1]) * R.range(130, 220), middle.y(tx) + 1, R.range(16, 22));
		if (c.images > 0) { const [lx, ly] = lowestAt(middle, -200, 200); pond(pt, lx, ly + 6, R.range(28, 46)); }
		// grass and flowers in front
		const flowers = S.lead.length ? S.lead.map((t) => tagPigment(t.name)) : [PIGMENTS.rose, PIGMENTS.lemon, WHITE];
		pt.cells(40, (ci, r, x) => {
			for (let i = 0; i < 26; i++) {
				const gx = x + r.range(0, 40), gy = front.y(gx) + r.range(-1, 16), len = r.range(3, 7) * lerp(0.7, 1.2, (gy - front.y(gx)) / 16), lean = S.windSpeed > 0 ? 1 : -1;
				pt.line([[gx, gy], [gx + lean * len * 0.25, gy - len * 0.6], [gx + lean * len * 0.45, gy - len]], { w: 0.45, a: 0.45, twice: false, wob: 0.05 });
			}
			for (let i = 0; i < 5; i++) {
				const fx = x + r.range(0, 40), fy = front.y(fx) + r.range(2, 18), col = r.pick(flowers);
				pt.softBlob(fx, fy, 1.6, 1.3, col, 0.8);
				pt.dot(fx, fy, 0.45, 0.6);
			}
		});
		cairns(pt, S, (x) => front.y(x) + 3);
		fence(pt, S, (x) => front.y(x) + 2);
	},
	lake(pt, S) {
		const W = S.water, R = pt.R, c = S.page.c, water = mixC(PIGMENTS.cerulean, S.house, 0.3);
		for (const rg of S.ranges) paintRange(pt, S, rg, { snow: rg.family !== 'rolling', bottom: W + 1 });
		// the reflection: each range again, upside down, paler and bluer
		for (const rg of S.ranges) {
			const pts = [];
			for (let x = Math.floor(pt.X0 / 1.5) * 1.5; x <= pt.X1; x += 1.5) pts.push([x, 2 * W - rg.y(x)]);
			const body = [[pt.X0, W], [pt.X1, W]].concat(pts.slice().reverse());
			pt.glaze(body, mixC(rg.color, water, 0.45), rg.density * 0.42, { rough: 1.6 });
			pt.cells(28, (ci, r, x) => { if (r() < 0.4) return; const xx = x + r.range(0, 20), yy = 2 * W - rg.y(xx); pt.line([[xx, yy], [xx + r.range(4, 9), yy]], { w: 0.5, a: 0.25 * (1 - rg.depth * 0.5), twice: false }); });
		}
		const gr = pt.wash.createLinearGradient(0, W, 0, HEAD_H);
		gr.addColorStop(0, cssC(pt.P(water), 0.5));
		gr.addColorStop(1, cssC(pt.P(water), 1));
		pt.glaze([[pt.X0, W], [pt.X1, W], [pt.X1, HEAD_H + 20], [pt.X0, HEAD_H + 20]], water, 0.3, { fill: gr, rough: 0.2 });
		pt.cells(80, (ci, r, x) => pt.line([[x, W + r.range(-0.2, 0.2)], [x + 80 * r.range(0.7, 1), W + r.range(-0.2, 0.2)]], { w: 0.7, a: 0.6, twice: false, wob: 0.1 }));
		// ripples
		pt.cells(36, (ci, r, x) => {
			for (let i = 0; i < 4; i++) { const y = W + r.range(4, 50), len = r.range(3, 10) * (1 + (y - W) / 40); const xx = x + r.range(0, 36); pt.line([[xx, y], [xx + len, y]], { w: 0.45, a: 0.35, twice: false, wob: 0.1 }); }
		});
		// trees on the far shore, and their reflections
		const n = Math.min(c.tasks, 18);
		if (n) spread(R, n, Math.min(c.done, n), R.range(-120, 120), R.range(8, 12)).forEach((t) => {
			const th = R.range(8, 12), col = seasonLeaf(S, R);
			fir(pt, t.x, W + 0.5, th, col, t.painted);
			pt.glaze([[t.x, W + th], [t.x - th * 0.3, W + 1], [t.x + th * 0.3, W + 1]], mixC(col, water, 0.4), t.painted ? 0.3 : 0.12, { rough: 1.2, passes: 1 });
		});
		// rocks in the water for headings
		for (let i = 0; i < Math.min(c.headings, 5); i++) {
			const x = R.range(-240, 240), y = W + R.range(12, 34), s = R.range(3, 6);
			pt.arc(x, y, s, s * 0.6, Math.PI, TAU, { w: 0.7, a: 0.8, twice: false });
			pt.glaze([[x - s, y], [x - s * 0.6, y - s * 0.5], [x + s * 0.5, y - s * 0.55], [x + s, y]], PIGMENTS.umber, 0.5, { rough: 0.2, passes: 1 });
			pt.line([[x - s * 1.4, y + 1], [x + s * 1.4, y + 1]], { w: 0.45, a: 0.4, twice: false });
		}
		if (c.code) {     // a jetty
			const x0 = R.range(-200, 200), y0 = HEAD_H, y1 = W + 22;
			for (let i = 0; i <= 6; i++) { const t = i / 6, y = lerp(y0, y1, t), x = x0 + t * 8, hw = lerp(10, 4, t); pt.line([[x - hw, y], [x + hw, y]], { w: 0.6, a: 0.7, twice: false, wob: 0.1 }); pt.line([[x - hw, y], [x - hw, y + 3]], { w: 0.5, a: 0.6, twice: false }); }
		}
		if (c.lists) pt.cells(120, (ci, r, x) => {      // reeds
			if (r() < 0.5) return;
			const rx = x + r.range(0, 120), ry = r.range(W + 30, W + 50);
			for (let i = 0; i < 9; i++) { const xx = rx + i * 1.4 + r.range(-0.5, 0.5), h2 = r.range(8, 16); pt.line([[xx, ry], [xx + r.range(-1.5, 1.5), ry - h2]], { w: 0.5, a: 0.6, twice: false, wob: 0.2 }); }
		});
		if (c.images > 0) boat(pt, R.range(-150, 150), W + R.range(18, 30), 5, PIGMENTS.madder, false);
	},
	forest(pt, S) {
		const R = pt.R, c = S.page.c;
		S.ranges.forEach((rg, i) => {
			// a row of conifers along the land: their tips make the crest
			const gap = rg.gap, tips = [];
			for (let ci = Math.floor(pt.X0 / gap) - 1; ci <= Math.ceil(pt.X1 / gap) + 1; ci++) {
				const xc = (ci + 0.5) * gap + (hashI(ci, rg.seed) - 0.5) * gap * 0.5, th = rg.tree * (0.65 + 0.6 * hashI(ci, rg.seed + 1));
				const by = rg.y(xc);
				tips.push([xc - gap * 0.5, by - th * 0.3], [xc, by - th]);
			}
			const body = tips.concat([[pt.X1 + gap, HEAD_H + 20], [pt.X0 - gap, HEAD_H + 20]]);
			let top = Infinity;
			for (const q of tips) top = Math.min(top, q[1]);
			const gr = pt.wash.createLinearGradient(0, top, 0, rg.base + 20);
			gr.addColorStop(0, cssC(pt.P(rg.color), 1));
			gr.addColorStop(1, cssC(pt.P(rg.color), 0.45));
			pt.glaze(body, rg.color, rg.density, { fill: gr, rough: 0.5 });
			if (rg.depth < 0.7) {
				let chunk = [];
				for (const q of tips) { chunk.push(q); if (chunk.length > 24) { pt.line(chunk, { w: 0.65, a: lerp(0.8, 0.35, rg.depth), wob: 0.2 }); chunk = [q]; } }
				pt.line(chunk, { w: 0.65, a: lerp(0.8, 0.35, rg.depth), wob: 0.2 });
			}
			// mist lies in the lower part of every row but the front one
			if (i < S.ranges.length - 1) pt.cells(120, (ci, r, x) => pt.eraseBlob(x + r.range(0, 120), rg.base + r.range(-4, 8), r.range(90, 160), r.range(9, 15), 0.55));
		});
		const front = S.front;
		const n = Math.min(c.tasks, 16);
		if (n) spread(R, n, Math.min(c.done, n), R.range(-140, 140), R.range(9, 14)).forEach((t) => birch(pt, t.x, front.y(t.x) + 7, R.range(13, 18), seasonLeaf(S, R), t.painted, R));
		if (c.code) {     // a lookout tower
			const x = R.range(-180, 180), base = S.middle.y(x) + 2, h = 30, top = base - h;
			pt.line([[x - 5, base], [x - 2.5, top]], { w: 0.7, a: 0.85, twice: false });
			pt.line([[x + 5, base], [x + 2.5, top]], { w: 0.7, a: 0.85, twice: false });
			for (let i = 1; i < 4; i++) { const y = lerp(base, top, i / 4), w2 = lerp(5, 2.5, i / 4); pt.line([[x - w2, y], [x + w2, y - 4]], { w: 0.45, a: 0.6, twice: false }); }
			pt.line([[x - 4.5, top], [x + 4.5, top], [x + 4.5, top - 4], [x - 4.5, top - 4], [x - 4.5, top]], { w: 0.6, a: 0.85, twice: false });
			pt.line([[x - 5.5, top - 4], [x, top - 8], [x + 5.5, top - 4]], { w: 0.6, a: 0.85, twice: false });
		}
		cairns(pt, S, (x) => front.y(x) + 6);
		fence(pt, S, (x) => front.y(x) + 5);
	},
	dunes(pt, S) {
		const R = pt.R, c = S.page.c;
		for (const rg of S.ranges) {
			const crest = paintRange(pt, S, rg, {});
			// ripples the wind left on the nearer dunes
			if (rg.depth < 0.6) pt.cells(30, (ci, r, x) => {
				for (let i = 0; i < 3; i++) {
					const xx = x + r.range(0, 30), y = rg.y(xx) + r.range(5, 22), len = r.range(6, 14);
					pt.line([[xx, y], [xx + len * 0.5, y - 1.2], [xx + len, y - 0.2]], { w: 0.45, a: 0.3, twice: false, wob: 0.1 });
				}
			});
			void crest;
		}
		const front = S.front, middle = S.middle;
		const n = Math.min(c.tasks, 16);
		if (n) spread(R, n, Math.min(c.done, n), R.range(-140, 140), R.range(14, 22)).forEach((t) => cactus(pt, t.x, middle.y(t.x) + 2, R.range(9, 14), t.painted));
		if (c.images > 0) {      // an oasis
			const [ox, oy] = lowestAt(front, -200, 200);
			pond(pt, ox, oy + 5, R.range(26, 40));
			palm(pt, ox - 14, oy + 3, 10);
			palm(pt, ox + 12, oy + 4, 8);
		}
		masts(pt, S, (x) => middle.y(x));
		cairns(pt, S, (x) => front.y(x));
		fence(pt, S, (x) => front.y(x) + 1);
	},
};

// --------------------------------------------------------------------------------------------------- painting: footer
// A picture in pencil and watercolour at the foot of every page (and the pen the start sheet draws its studies with).

function doodlePen(pt, x, y, s, color) {
	const W = (px, py) => [x + px * s, y + py * s];
	const d = {
		color,
		L: (pts, o = {}) => pt.line(pts.map((q) => W(q[0], q[1])), { w: 0.85, a: 0.85, ...o }),
		A: (cx, cy, rx, ry, a0 = 0, a1 = TAU, o = {}) => pt.arc(x + cx * s, y + cy * s, rx * s, ry * s, a0, a1 + (a1 - a0 >= TAU - 0.01 ? 0.25 : 0), { w: 0.85, a: 0.85, ...o }),
		F: (pts, alpha = 0.5, c = color) => pt.glaze(pts.map((q) => W(q[0], q[1])), c, alpha, { rough: 0.5, passes: 2 }),
		B: (cx, cy, rx, ry, alpha = 0.5, c = color) => pt.softBlob(x + cx * s, y + cy * s, rx * s, ry * s, c, alpha),
		// parallel strokes clipped to a shape, only between `from` and `to` across it
		H: (poly, angle = 0.8, gap = 0.12, from = -2, to = 2, o = {}) => {
			pt.pen.save();
			pt.pen.beginPath();
			tracePts(pt.pen, poly.map((q) => W(q[0], q[1])));
			pt.pen.clip();
			const ca = Math.cos(angle), sa = Math.sin(angle);
			for (let t = from; t <= to; t += gap) {
				const cx = -sa * t, cy = ca * t;
				d.L([[cx - ca * 1.6, cy - sa * 1.6], [cx + ca * 1.6, cy + sa * 1.6]], { w: 0.5, a: 0.5, twice: false, wob: 0.15, ...o });
			}
			pt.pen.restore();
		},
		circle: (cx, cy, r, n = 40) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * TAU) * r, cy + Math.sin(i / n * TAU) * r]),
		// a dashed line (a hidden edge), in dashes of about 0.07 with gaps of 0.05
		D: (pts, o = {}) => {
			let dash = [], len = 0, on = true;
			for (let i = 1; i < pts.length; i++) {
				const a = pts[i - 1], b = pts[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(seg / 0.02));
				for (let k = 0; k <= n; k++) {
					const t = k / n, q = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
					if (on) dash.push(q);
					len += seg / n;
					if (len > (on ? 0.07 : 0.05)) {
						if (on && dash.length > 1) d.L(dash, { w: 0.5, a: 0.5, twice: false, wob: 0.1, ...o });
						dash = []; len = 0; on = !on;
					}
				}
			}
			if (on && dash.length > 1) d.L(dash, { w: 0.5, a: 0.5, twice: false, wob: 0.1, ...o });
		},
		DA: (cx, cy, rx, ry, a0, a1) => { const pts = []; for (let i = 0; i <= 40; i++) { const a = lerp(a0, a1, i / 40); pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } d.D(pts); },
		dot: (px, py, r, c) => pt.dot(x + px * s, y + py * s, r * s, 0.85, c),
		x, y, s,
	};
	return d;
}

// ---- drawing helpers for the footer

const cub = (p0, p1, p2, p3, n = 24) => {
	const out = [];
	for (let i = 0; i <= n; i++) {
		const t = i / n, u = 1 - t;
		out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
	}
	return out;
};
const ell = (cx, cy, rx, ry, a0 = 0, a1 = TAU, n = 40, rot = 0) => {
	const out = [], ca = Math.cos(rot), sa = Math.sin(rot);
	for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n), x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([cx + x * ca - y * sa, cy + x * sa + y * ca]); }
	return out;
};
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const closed = (pts) => pts.concat([pts[0]]);
// Catmull-Rom through `pts`, closed
function loop(pts, step = 1.5) {
	const out = [], n = pts.length;
	for (let i = 0; i < n; i++) {
		const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
		const m = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
		for (let j = 0; j < m; j++) {
			const t = j / m, t2 = t * t, t3 = t2 * t;
			out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3)));
		}
	}
	return out;
}
// a band of width w(t) along a centre line
function ribbonPts(line, w) {
	const left = [], right = [];
	line.forEach((p, i) => {
		const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
		const hw = w(i / (line.length - 1)) / 2;
		left.push([p[0] - dy / l * hw, p[1] + dx / l * hw]);
		right.push([p[0] + dy / l * hw, p[1] - dx / l * hw]);
	});
	return left.concat(right.reverse());
}
function hatch(pt, poly, angle, gap, o = {}) {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
	const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 2, ca = Math.cos(angle), sa = Math.sin(angle);
	pt.pen.save();
	pt.pen.beginPath();
	tracePts(pt.pen, poly);
	pt.pen.clip();
	for (let t = -R; t <= R; t += gap) {
		const px = cx - sa * t, py = cy + ca * t;
		pt.line([[px - ca * R, py - sa * R], [px + ca * R, py + sa * R]], { w: 0.5, a: 0.42, twice: false, wob: 0.15, ...o });
	}
	pt.pen.restore();
}
function clipWash(pt, poly, fn) {
	pt.wash.save();
	pt.wash.beginPath();
	tracePts(pt.wash, poly);
	pt.wash.clip();
	fn();
	pt.wash.restore();
}
const shape = (pt, pts, color, alpha, o = {}) => {
	if (color) pt.glaze(pts, color, alpha, { rough: 0.4, passes: 2, ...o });
	pt.line(closed(pts), { w: o.w ?? 0.8, a: o.a ?? 0.85, wob: o.wob ?? 0.3 });
};

// small things shared by the pictures
// ---- the footer: a page of an engineer's sketchbook
// After lucumr.pocoo.org's footer: big overlapping washes, large technical drawings with their construction lines (gears
// in mesh, a neural network, a flask, a tree of nodes, a letter on its grid, a window, a listing, a checklist, a chart,
// a snake coiled up, a cloud), small studies above them (the start sheet's geometry), notes in a quick hand and the date.
// What goes where is drawn from the page's title, so every page has its own page; a command turns to another one.

const pastel = (c) => mixC(c, WHITE, 0.4);
const FOOT_COLORS = [PIGMENTS.rose, mixC(PIGMENTS.sap, PIGMENTS.viridian, 0.5), PIGMENTS.ochre, PIGMENTS.violet, PIGMENTS.cerulean, PIGMENTS.teal];

function dashed(pt, pts, o = {}) {
	let dash = [], len = 0, on = true;
	const dl = o.dash ?? 3, gl = o.gap ?? 2.2;
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1], b = pts[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(seg / 0.8));
		for (let k = 0; k <= n; k++) {
			const q = [lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)];
			if (on) dash.push(q);
			len += seg / n;
			if (len > (on ? dl : gl)) {
				if (on && dash.length > 1) pt.line(dash, { w: 0.45, a: 0.45, twice: false, wob: 0.08, ...o });
				dash = []; len = 0; on = !on;
			}
		}
	}
	if (on && dash.length > 1) pt.line(dash, { w: 0.45, a: 0.45, twice: false, wob: 0.08, ...o });
}
// centre lines through a part, as on a drawing
function centreLines(pt, x, y, r) {
	dashed(pt, [[x - r, y], [x + r, y]], { dash: 5, gap: 1.6 });
	dashed(pt, [[x, y - r], [x, y + r]], { dash: 5, gap: 1.6 });
}
// a dimension: the measured line with ticks, extension lines, and the figure written over it
function dimension(pt, a, b, label, off = 8) {
	const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * off, ny = dx / l * off;
	const A = [a[0] + nx, a[1] + ny], B = [b[0] + nx, b[1] + ny];
	pt.line([[a[0] + nx * 0.2, a[1] + ny * 0.2], [A[0] + nx * 0.25, A[1] + ny * 0.25]], { w: 0.4, a: 0.45, twice: false });
	pt.line([[b[0] + nx * 0.2, b[1] + ny * 0.2], [B[0] + nx * 0.25, B[1] + ny * 0.25]], { w: 0.4, a: 0.45, twice: false });
	pt.line([A, B], { w: 0.45, a: 0.55, twice: false });
	for (const P of [A, B]) pt.line([[P[0] - 1.6, P[1] + 1.6], [P[0] + 1.6, P[1] - 1.6]], { w: 0.6, a: 0.6, twice: false });
	if (label) { const size = 5, w = textWidth(label, size); pt.text(label, (A[0] + B[0]) / 2 - w / 2 + nx * 0.4, (A[1] + B[1]) / 2 - size - 1.5 + ny * 0.4, size, { a: 0.6, w: 0.6 }); }
}
// writing in a quick hand: loops along a line, words of different lengths, an ascender now and then
function scribble(pt, x, y, width, lines, r, o = {}) {
	const lh = o.lh ?? 11, h = o.h ?? 3.2;
	for (let li = 0; li < lines; li++) {
		const base = y + li * lh, end = x + width * (li === lines - 1 ? r.range(0.35, 0.8) : r.range(0.85, 1));
		let cx = x + (li === 0 && o.indent ? 8 : 0);
		while (cx < end - 6) {
			const letters = 2 + r.int(6), pts = [];
			for (let k = 0; k <= letters * 10; k++) {
				const t = k / 10, tall = Math.floor(t) % 4 === 1 && r() < 0.15 ? 2.2 : 1;
				pts.push([cx + t * 2.6 - Math.sin(t * TAU) * 1.1, base - h * tall * (1 - Math.cos(t * TAU)) / 2]);
			}
			pt.line(pts, { w: 0.5, a: o.a ?? 0.62, twice: false, wob: 0.15, color: o.color });
			cx += letters * 2.6 + r.range(3.5, 6);
		}
	}
}

const SKETCHES = {
	gears(pt, x, y, s, r, col) {
		const gear = (cx, cy, R, teeth, phase) => {
			const pts = [];
			for (let i = 0; i < teeth * 4; i++) {
				const a = phase + i / (teeth * 4) * TAU, rr = (i % 4 === 1 || i % 4 === 2) ? R : R * 0.82;
				pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
			}
			shape(pt, pts, pastel(col), 0.42, { w: 0.85 });
			pt.arc(cx, cy, R * 0.28, R * 0.28, 0, TAU, { w: 0.75 });
			shape(pt, ell(cx, cy, R * 0.12, R * 0.12, 0, TAU, 16), PIGMENTS.payne, 0.35, { w: 0.6 });
			hatch(pt, ell(cx, cy, R * 0.27, R * 0.27, 0, TAU, 24), 0.8, 1.6);
			const pc = ell(cx, cy, R * 0.91, R * 0.91, 0, TAU, 60);
			dashed(pt, pc, { dash: 4, gap: 2 });
			centreLines(pt, cx, cy, R * 1.15);
		};
		const R1 = s * 0.62, R2 = s * 0.44;
		gear(x - s * 0.36, y, R1, 12, r() * TAU);
		gear(x - s * 0.36 + (R1 + R2) * 0.9, y + s * 0.12, R2, 9, r() * TAU);
		pt.text('Z=12', x - s * 0.36 - 9, y + R1 + 10, 5.5, { a: 0.6 });
		const arcPts = ell(x - s * 0.36, y, R1 * 1.3, R1 * 1.3, -Math.PI * 0.85, -Math.PI * 0.45, 20);
		pt.line(arcPts, { w: 0.55, a: 0.55, twice: false });
		const e = arcPts[arcPts.length - 1];
		pt.line([[e[0] - 3, e[1] - 2], e, [e[0] - 1, e[1] + 3]], { w: 0.55, a: 0.55, twice: false });
	},
	network(pt, x, y, s, r, col) {
		const layers = [3, 4, 4, 3], nodes = [];
		layers.forEach((n, li) => { nodes.push([]); for (let k = 0; k < n; k++) nodes[li].push([x + (li - 1.5) * s * 0.55, y + (k - (n - 1) / 2) * s * 0.42]); });
		pt.softBlob(x, y, s * 1.1, s * 0.9, pastel(col), 0.2);
		const hot = layers.map((n) => r.int(n));
		for (let li = 0; li < layers.length - 1; li++) for (let a = 0; a < layers[li]; a++) for (let b = 0; b < layers[li + 1]; b++) {
			const red = hot[li] === a && hot[li + 1] === b;
			pt.line([nodes[li][a], nodes[li + 1][b]], { w: red ? 0.7 : 0.4, a: red ? 0.85 : 0.35, twice: false, color: red ? PIGMENTS.madder : undefined, wob: 0.1 });
		}
		nodes.flat().forEach((p) => {
			pt.glaze(ell(p[0], p[1], s * 0.075, s * 0.075, 0, TAU, 16), r() < 0.4 ? PIGMENTS.payne : WHITE, r() < 0.4 ? 0.7 : 0.6, { rough: 0.05, passes: 1 });
			pt.arc(p[0], p[1], s * 0.075, s * 0.075, 0, TAU, { w: 0.7, twice: false });
		});
		for (const p of nodes[layers.length - 1]) pt.line([[p[0] + s * 0.1, p[1]], [p[0] + s * 0.32, p[1]], [p[0] + s * 0.27, p[1] - 2], [p[0] + s * 0.32, p[1]], [p[0] + s * 0.27, p[1] + 2]], { w: 0.45, a: 0.5, twice: false });
	},
	flask(pt, x, y, s, r, col) {
		const neckW = s * 0.16, top = y - s * 0.95, sh = y - s * 0.35, bot = y + s * 0.85, bw = s * 0.62;
		const outline = [[x - neckW, top], [x - neckW, sh]].concat(cub([x - neckW, sh], [x - bw * 0.6, y + s * 0.2], [x - bw * 1.1, bot - s * 0.05], [x - bw * 0.8, bot]), cub([x + bw * 0.8, bot], [x + bw * 1.1, bot - s * 0.05], [x + bw * 0.6, y + s * 0.2], [x + neckW, sh]), [[x + neckW, top]]);
		const liquidTop = y + s * 0.22;
		clipWash(pt, outline, () => pt.glaze(rect(x - s, liquidTop, x + s, bot + 2), col, 0.6, { rough: 0.6 }));
		// the liquid hatched: inside the flask and below its surface
		pt.pen.save();
		pt.pen.beginPath();
		tracePts(pt.pen, outline);
		pt.pen.clip();
		hatch(pt, rect(x - s, liquidTop, x + s, bot + 2), 0.6, 2.2, { color: mixC(col, PIGMENTS.indigo, 0.5), a: 0.5 });
		pt.pen.restore();
		pt.line(outline, { w: 0.95 });
		pt.line(ell(x, liquidTop, bw * 0.55, 1.4, 0, TAU, 20), { w: 0.4, a: 0.5, twice: false });
		pt.arc(x, top, neckW + 1.5, 1.6, 0, TAU, { w: 0.6, twice: false });
		for (let i = 0; i < 4; i++) pt.arc(x + r.range(-neckW * 0.5, neckW * 0.5), y + s * r.range(-0.6, 0.1), s * r.range(0.04, 0.08), s * r.range(0.04, 0.08), 0, TAU, { w: 0.5, a: 0.6, twice: false });
		for (let i = 0; i < 4; i++) pt.line([[x - neckW, top + 6 + i * 5], [x - neckW + 3, top + 6 + i * 5]], { w: 0.4, a: 0.5, twice: false });
	},
	tree(pt, x, y, s, r, col) {
		const box = (cx, cy, n, w) => {
			const x0 = cx - n * w / 2, b = rect(x0, cy - 4, x0 + n * w, cy + 4);
			shape(pt, b, r() < 0.4 ? pastel(col) : null, 0.5, { w: 0.65, a: 0.8 });
			for (let k = 1; k < n; k++) pt.line([[x0 + k * w, cy - 4], [x0 + k * w, cy + 4]], { w: 0.45, a: 0.7, twice: false });
			return x0;
		};
		const root = box(x, y - s * 0.6, 3, s * 0.18);
		const kids = [-1, 0, 1].map((k) => [x + k * s * 0.72, y + s * 0.15]);
		kids.forEach(([kx, ky], i) => {
			pt.line([[root + (i + 0.5) * s * 0.18 + (i === 2 ? s * 0.18 * 0.5 : 0), y - s * 0.6 + 4], [kx, ky - 4]], { w: 0.5, a: 0.65, twice: false });
			box(kx, ky, 3, s * 0.15);
			for (const lx of [-1, 0, 1]) pt.line([[kx + lx * s * 0.15, ky + 4], [kx + lx * s * 0.22, ky + s * 0.35]], { w: 0.4, a: 0.45, twice: false });
		});
	},
	glyph(pt, x, y, s, r, col) {
		const letters = 'AEGKMQRSWZ', ch = letters[r.int(letters.length)], size = s * 1.25, w = textWidth(ch, size) - size * 0.27;
		const x0 = x - w / 2, top = y - size * 0.55, base = top + size;
		pt.softBlob(x, y, s * 0.9, s * 0.8, pastel(col), 0.22);
		for (const yy of [top, top + size * 0.42, base]) dashed(pt, [[x0 - s * 0.5, yy], [x0 + w + s * 0.5, yy]], { dash: 6, gap: 2 });
		for (const xx of [x0, x0 + w]) pt.line([[xx, top - s * 0.3], [xx, base + s * 0.3]], { w: 0.4, a: 0.4, twice: false });
		pt.text(ch, x0, top, size, { w: 1.8, a: 0.9 });
		dimension(pt, [x0 + w + s * 0.35, top], [x0 + w + s * 0.35, base], 'X', 6);
		pt.text('U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'), x0 - 2, base + s * 0.42, 5.5, { a: 0.6 });
	},
	window(pt, x, y, s, r, col) {
		const w = s * 0.95, h = s * 0.72, b = rect(x - w, y - h, x + w, y + h);
		pt.glaze(b, WHITE, 0.2, { rough: 0.3, passes: 1 });
		pt.line(closed(b), { w: 0.85 });
		pt.line([[x - w, y - h + 8], [x + w, y - h + 8]], { w: 0.6, twice: false });
		for (let k = 0; k < 3; k++) pt.arc(x - w + 4 + k * 4, y - h + 4, 1.2, 1.2, 0, TAU, { w: 0.5, twice: false });
		pt.line(closed(rect(x - w + 18, y - h + 2, x + w - 6, y - h + 6)), { w: 0.4, a: 0.5, twice: false });
		const img = rect(x - w + 6, y - h + 13, x - w * 0.05, y + h * 0.35);
		shape(pt, img, pastel(col), 0.5, { w: 0.6 });
		pt.line([img[0], img[2]], { w: 0.4, a: 0.5, twice: false });
		pt.line([img[1], img[3]], { w: 0.4, a: 0.5, twice: false });
		for (let k = 0; k < 6; k++) pt.line([[x + w * 0.08, y - h + 16 + k * 6], [x + w * r.range(0.4, 0.9), y - h + 16 + k * 6]], { w: 0.5, a: 0.55, twice: false, wob: 0.3 });
		shape(pt, rect(x - w + 6, y + h - 11, x - w + 28, y + h - 5), PIGMENTS.cerulean, 0.5, { w: 0.5 });
	},
	listing(pt, x, y, s, r, col) {
		const x0 = x - s * 0.9, top = y - s * 0.75, rows = 9;
		pt.blobWash(x, y, s, s * 0.85, pastel(col), 0.18, r, true);
		pt.line([[x0 + 8, top - 6], [x0 + 8, top + rows * 8 + 2]], { w: 0.55, a: 0.6, twice: false });
		let indent = 0;
		for (let i = 0; i < rows; i++) {
			const yy = top + i * 8;
			pt.dot(x0 + 3, yy, 0.5, 0.6);
			let cx = x0 + 13 + indent * 7;
			const words = 1 + r.int(4);
			for (let k = 0; k < words; k++) {
				const len = r.range(5, 18), hot = r() < 0.2;
				if (hot) pt.glaze(rect(cx - 1, yy - 2.4, cx + len + 1, yy + 2.4), col, 0.45, { rough: 0.2, passes: 1 });
				pt.line([[cx, yy], [cx + len, yy]], { w: 0.9, a: 0.7, twice: false, wob: 0.2 });
				cx += len + 3.5;
			}
			indent = clamp(indent + (r() < 0.35 ? 1 : r() < 0.35 ? -1 : 0), 0, 3);
		}
	},
	checklist(pt, x, y, s, r, col) {
		const x0 = x - s * 1.05, w = s * 2.1, rows = 4, lh = s * 0.42, top = y - s * 0.75;
		pt.blobWash(x, y, s * 1.2, s * 0.9, pastel(col), 0.18, r, false);
		pt.line([[x0 + 12, top - 6], [x0 + 12, top + rows * lh + 2]], { w: 0.6, a: 0.6, twice: false });
		for (let i = 0; i < rows; i++) {
			const yy = top + i * lh;
			pt.line([[x0, yy + lh * 0.55], [x0 + w, yy + lh * 0.55]], { w: 0.4, a: 0.35, twice: false });
			pt.text(String(i + 1) + '.', x0 + 2, yy - 4, 6.5, { a: 0.75 });
			scribble(pt, x0 + 16, yy + 1, w - 34, 1, r);
			const bx = x0 + w - 10;
			pt.line(closed(rect(bx, yy - 5, bx + 6, yy + 1)), { w: 0.55, twice: false });
			if (r() < 0.7) pt.line([[bx + 0.5, yy - 2.5], [bx + 2.6, yy + 0.4], [bx + 7.5, yy - 7]], { w: 0.8, twice: false, color: PIGMENTS.madder });
		}
	},
	chart(pt, x, y, s, r, col) {
		const x0 = x - s * 0.9, base = y + s * 0.65, n = 5;
		pt.line([[x0, y - s * 0.85], [x0, base], [x + s, base]], { w: 0.8 });
		let last = null;
		for (let i = 0; i < n; i++) {
			const bh = s * r.range(0.35, 1.3) * (0.6 + i * 0.12), bx = x0 + 6 + i * s * 0.36, b = rect(bx, base - bh, bx + s * 0.24, base);
			pt.glaze(b, i === n - 1 ? col : pastel(col), 0.5, { rough: 0.3 });
			hatch(pt, b, 1.1, 2.6, { a: 0.3 });
			pt.line(closed(b), { w: 0.6, twice: false });
			const tp = [bx + s * 0.12, base - bh - 5];
			if (last) pt.line([last, tp], { w: 0.6, a: 0.7, twice: false, color: PIGMENTS.ultramarine });
			last = tp;
		}
		pt.line([[last[0] - 4, last[1] - 1], last, [last[0] - 2, last[1] + 3.5]], { w: 0.6, a: 0.7, twice: false, color: PIGMENTS.ultramarine });
	},
	snake(pt, x, y, s, r, col) {
		const line = [];
		for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * 4.2 * Math.PI, rr = s * (0.12 + 0.62 * t); line.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.92]); }
		const band = ribbonPts(line, (t) => s * lerp(0.07, 0.19, Math.min(1, t * 1.4)));
		shape(pt, band, PIGMENTS.ochre, 0.55, { w: 0.65, a: 0.75 });
		for (let i = 8; i < line.length - 4; i += 4) {
			const a = line[i - 1], b = line[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, hw = s * lerp(0.07, 0.19, Math.min(1, i / 120 * 1.4)) / 2;
			pt.line([[line[i][0] - dy / l * hw, line[i][1] + dx / l * hw], [line[i][0] + dy / l * hw, line[i][1] - dx / l * hw]], { w: 0.4, a: 0.45, twice: false });
		}
		const head = line[line.length - 1];
		shape(pt, ell(head[0] + 2, head[1], s * 0.13, s * 0.09, 0, TAU, 16), PIGMENTS.ochre, 0.65, { w: 0.65 });
		pt.dot(head[0] + 4, head[1] - 1, 0.7, 0.9);
		pt.line([[head[0] + s * 0.15, head[1]], [head[0] + s * 0.25, head[1]], [head[0] + s * 0.29, head[1] - 2]], { w: 0.4, twice: false, color: PIGMENTS.madder });
		pt.line([[head[0] + s * 0.25, head[1]], [head[0] + s * 0.29, head[1] + 2]], { w: 0.4, twice: false, color: PIGMENTS.madder });
	},
	cloud(pt, x, y, s, r, col) {
		const pts = [];
		for (let i = 0; i <= 80; i++) { const a = i / 80 * TAU, rr = 1 + 0.12 * Math.abs(Math.sin(a * 4.5)); pts.push([x + Math.cos(a) * s * 0.85 * rr, y + Math.sin(a) * s * 0.55 * rr]); }
		pt.blobWash(x + 4, y + 4, s * 1.05, s * 0.75, pastel(col), 0.2, r, false);
		pt.line(pts, { w: 0.75 });
		const sw = [];
		for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * 3 * Math.PI, rr = s * 0.32 * t; sw.push([x + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr]); }
		pt.line(sw, { w: 0.5, a: 0.6, twice: false });
	},
};
const SKETCH_NAMES = Object.keys(SKETCHES);
// the start sheet's studies, as big drawings too (the busier ones only)
const BIG_STUDIES = ['prism', 'globe', 'golden', 'cube', 'matrix', 'flow', 'graph', 'octahedron'];
const SMALL_STUDIES = ['cube', 'sine', 'flower', 'venn', 'seeds', 'octahedron', 'graph', 'golden', 'globe'];

function paintFooter(S, w, h, dark, paper, variant = 0) {
	const seed = (S.page.seed ^ Math.imul(variant + 1, 0x51ED27)) >>> 0;
	const pt = makePainter(w, h, FOOT_H, dark, paper, seed, 0.45);
	pt.lw *= 1.45;      // a softer, darker pencil than the header's, as in a sketchbook
	const R = wcbRng(seed), page = S.page;
	const cols = page.tags.length ? page.tags.slice(0, 5).map((t) => tagPigment(t.name)).concat(FOOT_COLORS.slice(0, 2)) : FOOT_COLORS;
	// big washes, heaviest towards the bottom edge, a few smaller ones higher up
	pt.cells(190, (ci, r, x) => {
		for (let k = 0; k < 2; k++) pt.blobWash(x + r.range(0, 190), r.range(FOOT_H * 0.7, FOOT_H * 1.05), r.range(80, 160), r.range(30, 60), pastel(r.pick(cols)), r.range(0.12, 0.2), r, r() < 0.4);
	});
	pt.cells(260, (ci, r, x) => {
		if (r() < 0.6) pt.blobWash(x + r.range(0, 260), r.range(FOOT_H * 0.22, FOOT_H * 0.45), r.range(32, 60), r.range(18, 30), pastel(r.pick(cols)), r.range(0.13, 0.2), r, r() < 0.5);
	});
	// order of the big drawings: the sketches and the busier studies, shuffled by the page
	const shuffle = (list) => { for (let i = list.length - 1; i > 0; i--) { const j = R.int(i + 1); [list[i], list[j]] = [list[j], list[i]]; } return list; };
	const big = shuffle(SKETCH_NAMES.map((n) => ['s', n]).concat(BIG_STUDIES.map((n) => ['t', n])));
	const small = shuffle(SMALL_STUDIES.slice());
	const SLOT = 290, half = Math.max(pt.X1, -pt.X0);
	const slotX = (i) => (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * SLOT);
	for (let i = 0; Math.ceil(i / 2) * SLOT - SLOT < half; i++) {
		const x = slotX(i), r = wcbRng((seed ^ Math.imul(i + 7, 0x9E3779B1)) >>> 0);
		if (x - SLOT / 2 > pt.X1 + 40 || x + SLOT / 2 < pt.X0 - 40) continue;
		// a big drawing, low in the band
		const [kind, name] = big[i % big.length], col = r.pick(cols);
		const bx = x + r.range(-18, 18), by = FOOT_H * 0.63 + r.range(-8, 8), s = r.range(68, 82);
		if (kind === 's') SKETCHES[name](pt, bx, by, s, r, col);
		else {
			pt.blobWash(bx + r.range(-8, 8), by + s * 0.2, s * 1.2, s * 0.85, pastel(col), 0.18, r, true);
			STUDIES[name](doodlePen(pt, bx, by, s * 0.82, col), pt, r);
		}
		// above it, between the slots: a small study, a note, or the date (the slot right of the middle)
		const sx = x + SLOT / 2 + r.range(-20, 20), sy = FOOT_H * 0.3 + r.range(-8, 12);
		if (i === 0 && page.created) {
			const d = page.created, str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, size = 9, tw = textWidth(str, size);
			pt.text(str, sx - tw / 2, sy - 6, size, { w: 0.85, a: 0.8 });
			pt.line([[sx - tw / 2 - 2, sy + 6], [sx + tw / 2 + 4, sy + 5]], { w: 0.6, twice: false });
		} else if (r() < 0.55) {
			const sn = small[i % small.length], ss = r.range(20, 27);
			pt.blobWash(sx, sy + 3, ss * 1.3, ss, pastel(r.pick(cols)), 0.16, r, true);
			STUDIES[sn](doodlePen(pt, sx, sy, ss, r.pick(cols)), pt, r);
		} else {
			scribble(pt, sx - 34, sy - 8, 70, 2 + r.int(3), r, { indent: true });
		}
		// a note beside the big drawing now and then, with braces or a question
		if (r() < 0.5) {
			const nx = bx + (r() < 0.5 ? -1 : 1) * r.range(100, 120), ny = FOOT_H * 0.45 + r.range(-6, 6);
			if (r() < 0.5) { pt.line([[nx - 3, ny - 8], [nx - 5, ny - 6], [nx - 5, ny - 1], [nx - 7, ny], [nx - 5, ny + 1], [nx - 5, ny + 6], [nx - 3, ny + 8]], { w: 0.55, a: 0.6, twice: false }); scribble(pt, nx, ny + 1, 20, 1, r); }
			else { pt.text('??', nx, ny - 4, 6, { a: 0.6 }); pt.arc(nx + 6, ny - 1, 9, 6, 0, TAU, { w: 0.4, a: 0.45, twice: false }); }
		}
	}
	return pt.finish();
}

// ---------------------------------------------------------------------------------------------- painting: start sheet
// The empty panel (no page open): a sheet of geometry studies in pencil and watercolour around Thymer's start screen,
// each with its figure number: a cube, a globe, a matrix, the golden rectangle and its spiral, a prism splitting light,
// a flow chart, a graph, sine and cosine, the flower of life, an octahedron, three circles, a sunflower's seeds. They
// stand in cells around the cards (the hole), and a new day lays them out anew.

const STUDIES = {
	cube(d, pt, r) {
		const o = 0.32, front = [[-0.75, -0.45], [0.45, -0.45], [0.45, 0.75], [-0.75, 0.75]], back = front.map((q) => [q[0] + o, q[1] - o]);
		d.F([front[0], front[1], back[1], back[0]], 0.45);
		d.F([front[1], back[1], back[2], front[2]], 0.25, mixC(d.color, PIGMENTS.indigo, 0.4));
		d.H([front[1], back[1], back[2], front[2]], 1.2, 0.1);
		d.L(front.concat([front[0]]));
		d.L([back[0], back[1], back[2]]);
		d.D([back[2], back[3], back[0]]);
		d.D([front[3], back[3]]);
		for (let i = 0; i < 3; i++) d.L([front[i], back[i]]);
		d.L([[-0.75, 0.95], [0.45, 0.95]], { w: 0.5, a: 0.5, twice: false });
		d.L([[-0.75, 0.88], [-0.75, 1.02]], { w: 0.5, a: 0.5, twice: false });
		d.L([[0.45, 0.88], [0.45, 1.02]], { w: 0.5, a: 0.5, twice: false });
	},
	globe(d, pt, r) {
		const R = 0.85;
		d.F(d.circle(0, 0, R, 48), 0.4, PIGMENTS.cerulean);
		for (let i = 0; i < 4; i++) d.B(r.range(-0.45, 0.45), r.range(-0.45, 0.45), r.range(0.12, 0.28), r.range(0.08, 0.2), 0.6, PIGMENTS.sap);
		d.A(0, 0, R, R);
		for (const lon of [20, 50, 75]) {
			const rx = R * Math.sin(lon * Math.PI / 180);
			d.A(0, 0, rx, R, -Math.PI / 2, Math.PI / 2, { w: 0.55, a: 0.6, twice: false });
			d.A(0, 0, rx, R, Math.PI / 2, Math.PI * 1.5, { w: 0.55, a: 0.6, twice: false });
		}
		d.L([[0, -R], [0, R]], { w: 0.55, a: 0.6, twice: false });
		for (const lat of [-50, -20, 15, 45]) {
			const a = lat * Math.PI / 180, y = -R * Math.sin(a), rx = R * Math.cos(a);
			d.A(0, y, rx, rx * 0.2, 0, Math.PI, { w: 0.55, a: 0.6, twice: false });
			d.DA(0, y, rx, rx * 0.2, Math.PI, TAU);
		}
		d.L([[-0.18, -1.08], [0.18, 1.08]], { w: 0.6, a: 0.6, twice: false });
		pt.text('N', d.x + 0.05 * d.s, d.y - 1.32 * d.s, d.s * 0.2, { a: 0.7 });
	},
	matrix(d, pt, r) {
		const br = (x0, x1, y0, y1, dir) => d.L([[x0 + dir * 0.1, y0], [x0, y0], [x0, y1], [x0 + dir * 0.1, y1]], { w: 0.8 });
		br(-1.15, 0, -0.75, 0.75, 1);
		br(0.35, 0, -0.75, 0.75, -1);
		const cells = [['1', '0', '0'], ['0', '.6', '-.8'], ['0', '.8', '.6']], size = d.s * 0.22;
		cells.forEach((row, i) => row.forEach((v, j) => {
			const w = textWidth(v, size);
			pt.text(v, d.x + (-0.8 + j * 0.47) * d.s - w / 2, d.y + (-0.62 + i * 0.47) * d.s, size, { w: 0.75 });
		}));
		d.B(0.27 - 0.47 * 1, 0.05 + 0.47 * 0, 0.4, 0.4, 0.35);
		br(0.62, 0, -0.75, 0.75, 1);
		br(0.98, 0, -0.75, 0.75, -1);
		['X', 'Y', 'Z'].forEach((v, i) => pt.text(v, d.x + 0.72 * d.s, d.y + (-0.62 + i * 0.47) * d.s, size, { w: 0.75, color: PIGMENTS.madder }));
		pt.text('=', d.x + 1.08 * d.s, d.y - 0.12 * d.s, size, { w: 0.7 });
	},
	golden(d, pt, r) {
		const phi = 1.618034;
		let x = -1.1, y = -1.1 / phi, w = 2.2, h = 2.2 / phi;
		const spiral = [];
		const tones = [PIGMENTS.ochre, PIGMENTS.rose, PIGMENTS.lemon, PIGMENTS.orange, PIGMENTS.madder, PIGMENTS.ochre, PIGMENTS.rose, PIGMENTS.lemon];
		for (let i = 0; i < 8; i++) {
			let sq, c, a0;
			switch (i % 4) {
				case 0: sq = [x, y, h]; c = [x + h, y + h]; a0 = Math.PI; x += h; w -= h; break;
				case 1: sq = [x, y, w]; c = [x, y + w]; a0 = Math.PI * 1.5; y += w; h -= w; break;
				case 2: sq = [x + w - h, y, h]; c = [x + w - h, y]; a0 = 0; w -= h; break;
				default: sq = [x, y + h - w, w]; c = [x + w, y + h - w]; a0 = Math.PI / 2; h -= w; break;
			}
			const [sx, sy, s] = sq, box = [[sx, sy], [sx + s, sy], [sx + s, sy + s], [sx, sy + s]];
			d.F(box, 0.32 - i * 0.025, tones[i]);
			d.L(box.concat([box[0]]), { w: 0.6, a: 0.75, twice: false });
			for (let k = 0; k <= 16; k++) { const a = a0 + k / 16 * Math.PI / 2; spiral.push([c[0] + Math.cos(a) * s, c[1] + Math.sin(a) * s]); }
		}
		d.L(spiral, { w: 0.95, color: PIGMENTS.madder });
		pt.text('1.618', d.x - 0.32 * d.s, d.y + 0.82 * d.s, d.s * 0.17, { a: 0.75 });
	},
	prism(d, pt, r) {
		const W = (q) => [d.x + q[0] * d.s, d.y + q[1] * d.s];
		const front = [[-0.42, 0.6], [0.42, 0.6], [0, -0.62]], o = [0.2, -0.13], back = front.map((q) => [q[0] + o[0], q[1] + o[1]]);
		d.F(front, 0.18, PIGMENTS.cerulean);
		d.F([front[1], back[1], back[2], front[2]], 0.12, PIGMENTS.cerulean);
		const inP = [-0.21, 0.0], outP = [0.22, -0.02], start = [-1.5, 0.36], end = 1.7;
		// a fill that fades along the light: none where it begins (or ends), full where it meets the glass
		const fade = (from, to, c, a0, a1) => {
			const A = W(from), B = W(to), g = pt.wash.createLinearGradient(A[0], A[1], B[0], B[1]);
			g.addColorStop(0, cssC(pt.P(c), a0));
			g.addColorStop(0.55, cssC(pt.P(c), (a0 + a1) / 2 * 0.9));
			g.addColorStop(1, cssC(pt.P(c), a1));
			return g;
		};
		// white light in, coming out of nothing
		const light = pt.dark ? WHITE : PIGMENTS.lemon;
		pt.glaze([W(start), W(inP), W([inP[0], inP[1] + 0.06]), W([start[0], start[1] + 0.07])], light, 0.7, { fill: fade(start, inP, light, 0, 1), rough: 0.3, passes: 2 });
		for (let k = 0; k < 4; k++) {
			const t0 = k / 4, t1 = (k + 1) / 4;
			d.L([[lerp(start[0], inP[0], t0), lerp(start[1] + 0.02, inP[1], t0)], [lerp(start[0], inP[0], t1), lerp(start[1] + 0.02, inP[1], t1)]], { w: 0.7, a: 0.15 + 0.7 * t1, twice: false });
		}
		// inside the glass it begins to part
		d.L([inP, outP], { w: 0.55, a: 0.6, twice: false });
		d.L([inP, [outP[0], outP[1] + 0.07]], { w: 0.4, a: 0.35, twice: false });
		// the spectrum fans out and thins away, each band a little ragged at its far end
		const bands = [PIGMENTS.madder, PIGMENTS.orange, PIGMENTS.lemon, PIGMENTS.sap, PIGMENTS.cerulean, PIGMENTS.violet];
		const y0s = -0.42, bw = 0.2;
		for (let i = 0; i < bands.length; i++) {
			const ya = y0s + i * bw, yb = ya + bw, ex = end + r.range(-0.12, 0.08);
			const tip = [[ex, ya], [ex + 0.05, ya + bw * 0.5], [ex - 0.02, yb]];
			pt.glaze([W(outP)].concat(tip.map(W)), bands[i], 0.85, { fill: fade(outP, [ex, (ya + yb) / 2], bands[i], 0.95, 0), rough: 1.2, passes: 3 });
		}
		for (const [ya, k] of [[y0s, 0], [y0s + bands.length * bw, 1]]) {
			for (let j = 0; j < 3; j++) {
				const t0 = j / 3 * 0.6, t1 = (j + 1) / 3 * 0.6;
				d.L([[lerp(outP[0], end, t0), lerp(outP[1], ya, t0)], [lerp(outP[0], end, t1), lerp(outP[1], ya, t1)]], { w: 0.55, a: 0.6 * (1 - t0 / 0.6), twice: false });
			}
			void k;
		}
		d.L(front.concat([front[0]]), { w: 0.85 });
		d.L([front[1], back[1], back[2], front[2]], { w: 0.75 });
		d.D([front[0], back[0], back[1]]);
		d.D([back[0], back[2]]);
	},
	flow(d, pt, r) {
		const box = (cx, cy, w, h) => { const b = [[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy + h], [cx - w, cy + h]]; d.L(b.concat([b[0]]), { w: 0.75 }); return b; };
		const arrow = (a, b) => { d.L([a, b], { w: 0.65, twice: false }); const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l; d.L([[b[0] - ux * 0.1 - uy * 0.06, b[1] - uy * 0.1 + ux * 0.06], b, [b[0] - ux * 0.1 + uy * 0.06, b[1] - uy * 0.1 - ux * 0.06]], { w: 0.65, twice: false }); };
		d.F([[-0.35, -1.05], [0.35, -1.05], [0.35, -0.8], [-0.35, -0.8]], 0.4);
		box(0, -0.92, 0.35, 0.13);
		arrow([0, -0.78], [0, -0.5]);
		const dia = [[0, -0.48], [0.38, -0.15], [0, 0.18], [-0.38, -0.15]];
		d.F(dia, 0.45, PIGMENTS.ochre);
		d.L(dia.concat([dia[0]]), { w: 0.75 });
		arrow([-0.38, -0.15], [-0.85, -0.15]); arrow([-0.85, -0.15], [-0.85, 0.42]);
		arrow([0.38, -0.15], [0.85, -0.15]); arrow([0.85, -0.15], [0.85, 0.42]);
		d.F([[-1.15, 0.45], [-0.55, 0.45], [-0.55, 0.75], [-1.15, 0.75]], 0.35, PIGMENTS.sap);
		box(-0.85, 0.6, 0.3, 0.15);
		d.F([[0.55, 0.45], [1.15, 0.45], [1.15, 0.75], [0.55, 0.75]], 0.35, PIGMENTS.rose);
		box(0.85, 0.6, 0.3, 0.15);
		const size = d.s * 0.11;
		pt.text('START', d.x - textWidth('START', size) / 2, d.y - 0.97 * d.s, size, { a: 0.7 });
		pt.text('?', d.x - 0.03 * d.s, d.y - 0.22 * d.s, size * 1.2, { a: 0.8 });
		pt.text('YES', d.x - 0.98 * d.s, d.y - 0.3 * d.s, size, { a: 0.65 });
		pt.text('NO', d.x + 0.55 * d.s, d.y - 0.3 * d.s, size, { a: 0.65 });
	},
	graph(d, pt, r) {
		const n = 7, nodes = [];
		for (let i = 0; i < n; i++) { const a = i / n * TAU + r.range(-0.25, 0.25), rr = i === 0 ? 0 : r.range(0.6, 0.95); nodes.push(i === 0 ? [0, 0] : [Math.cos(a) * rr, Math.sin(a) * rr * 0.85]); }
		for (let i = 1; i < n; i++) {
			d.L([nodes[0], nodes[i]], { w: 0.6, a: 0.7, twice: false });
			if (r() < 0.6) d.L([nodes[i], nodes[i % (n - 1) + 1]], { w: 0.5, a: 0.55, twice: false });
		}
		const cols = [PIGMENTS.rose, PIGMENTS.cerulean, PIGMENTS.ochre, PIGMENTS.sap, PIGMENTS.violet];
		nodes.forEach((p, i) => { const rr = i === 0 ? 0.17 : 0.11; d.B(p[0], p[1], rr * 1.3, rr * 1.3, 0.8, i === 0 ? PIGMENTS.madder : cols[i % cols.length]); d.A(p[0], p[1], rr, rr, 0, TAU, { w: 0.7 }); });
	},
	sine(d, pt, r) {
		d.L([[-1.2, 0], [1.25, 0]], { w: 0.7 }); d.L([[1.15, -0.06], [1.25, 0], [1.15, 0.06]], { w: 0.7, twice: false });
		d.L([[-1.1, 0.8], [-1.1, -0.85]], { w: 0.7 }); d.L([[-1.16, -0.75], [-1.1, -0.85], [-1.04, -0.75]], { w: 0.7, twice: false });
		for (let i = 1; i <= 4; i++) d.L([[-1.1 + i * 0.55, -0.05], [-1.1 + i * 0.55, 0.05]], { w: 0.5, twice: false });
		const sinPts = [], cosPts = [];
		for (let i = 0; i <= 60; i++) { const t = i / 60, x = -1.1 + t * 2.2, a = t * TAU; sinPts.push([x, -Math.sin(a) * 0.6]); cosPts.push([x, -Math.cos(a) * 0.6]); }
		const area = sinPts.slice(0, 31).concat([[0, 0], [-1.1, 0]]);
		d.F(area, 0.4, PIGMENTS.cerulean);
		d.L(sinPts, { w: 0.9, color: PIGMENTS.ultramarine });
		d.D(cosPts, { color: PIGMENTS.madder });
		pt.text('SIN', d.x + 0.75 * d.s, d.y - 0.75 * d.s, d.s * 0.13, { a: 0.75, color: PIGMENTS.ultramarine });
		pt.text('COS', d.x + 0.75 * d.s, d.y - 0.55 * d.s, d.s * 0.13, { a: 0.75, color: PIGMENTS.madder });
	},
	flower(d, pt, r) {
		const rr = 0.36, centres = [[0, 0]];
		for (let i = 0; i < 6; i++) centres.push([Math.cos(i / 6 * TAU) * rr, Math.sin(i / 6 * TAU) * rr]);
		d.F(d.circle(0, 0, rr * 2, 48), 0.25, d.color);
		centres.forEach(([x, y], i) => d.A(x, y, rr, rr, 0, TAU, { w: 0.6, a: 0.75, twice: false }));
		d.A(0, 0, rr * 2, rr * 2, 0, TAU, { w: 0.8 });
		const hex = [];
		for (let i = 0; i <= 6; i++) hex.push([Math.cos(i / 6 * TAU + Math.PI / 6) * rr * 2, Math.sin(i / 6 * TAU + Math.PI / 6) * rr * 2]);
		d.D(hex);
		d.L([[0, 0], [rr * 2, 0]], { w: 0.5, a: 0.6, twice: false });
		pt.text('R', d.x + rr * d.s * 0.85, d.y - 0.18 * d.s, d.s * 0.12, { a: 0.7 });
	},
	octahedron(d, pt, r) {
		const top = [0, -1], bot = [0, 1], e = [[-0.85, 0.05], [-0.25, 0.28], [0.85, 0.02], [0.3, -0.2]];
		d.F([top, e[0], e[1]], 0.5);
		d.F([top, e[1], e[2]], 0.3);
		d.F([bot, e[0], e[1]], 0.25, mixC(d.color, PIGMENTS.indigo, 0.4));
		d.H([bot, e[1], e[2]], 1.0, 0.1);
		for (const v of [e[0], e[1], e[2]]) { d.L([top, v]); d.L([bot, v]); }
		d.L([e[0], e[1], e[2]]);
		d.D([e[2], e[3], e[0]]);
		d.D([top, e[3]]); d.D([bot, e[3]]);
	},
	venn(d, pt, r) {
		const cs = [[-0.32, -0.2, PIGMENTS.rose], [0.32, -0.2, PIGMENTS.lemon], [0, 0.32, PIGMENTS.cerulean]];
		for (const [x, y, c] of cs) d.F(d.circle(x, y, 0.58, 48), 0.45, c);
		for (const [x, y] of cs) d.A(x, y, 0.58, 0.58, 0, TAU, { w: 0.75 });
		d.dot(0, -0.03, 0.035);
	},
	seeds(d, pt, r) {
		const n = 150, golden = Math.PI * (3 - Math.sqrt(5));
		d.B(0, 0, 1, 1, 0.3, PIGMENTS.ochre);
		for (let i = 1; i < n; i++) {
			const a = i * golden, rr = 0.075 * Math.sqrt(i), x = Math.cos(a) * rr, y = Math.sin(a) * rr, sz = 0.008 + i / n * 0.022;
			d.dot(x, y, sz, i % 13 === 0 ? PIGMENTS.madder : null);
		}
		pt.text('137.5', d.x - 0.35 * d.s, d.y + 1.08 * d.s, d.s * 0.15, { a: 0.7 });
	},
};
const STUDY_NAMES = Object.keys(STUDIES);
const STUDY_COLORS = { cube: 'ultramarine', globe: 'cerulean', matrix: 'teal', golden: 'ochre', prism: 'cerulean', flow: 'violet', graph: 'rose', sine: 'cerulean', flower: 'violet', octahedron: 'teal', venn: 'rose', seeds: 'ochre' };
const STUDY_TITLES = { cube: 'CUBE', globe: 'GLOBE', matrix: 'ROTATION', golden: 'GOLDEN RATIO', prism: 'PRISM', flow: 'FLOW', graph: 'GRAPH', sine: 'WAVE', flower: 'FLOWER OF LIFE', octahedron: 'OCTAHEDRON', venn: 'SETS', seeds: 'PHYLLOTAXIS' };

/** The day's seed: a new layout every day. */
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/**
 * Paints the start sheet into w x h device pixels (world units are CSS pixels), with `hole` the cards' box in the same
 * units (x from the middle, y from the top) where nothing is drawn.
 */
function paintStart(w, h, worldH, dark, paper, hole) {
	const seed = wcbFnv('start:' + dayKey());
	const pt = makePainter(w, h, worldH, dark, paper, seed, 0.4);
	const R = wcbRng(seed), W = pt.X1 - pt.X0 - 28, L = -W / 2, Rt = W / 2;
	const hb = hole || [0, 0, 0, 0], pad = 14;
	// how far a point is outside the cards' box (negative inside)
	const outside = (x, y) => hole ? Math.max(hb[0] - pad - x, x - hb[2] - pad, hb[1] - pad - y, y - hb[3] - pad) : 1e9;
	const lights = [PIGMENTS.ultramarine, PIGMENTS.violet, PIGMENTS.teal, PIGMENTS.rose, PIGMENTS.ochre, PIGMENTS.cerulean];
	// washes spread loosely over the whole sheet: wide soft ones, and some with an edge, overlapping
	for (let y = -40; y < worldH + 80; y += 170) {
		pt.cells(230, (ci, r, x) => {
			const rr = wcbRng((seed ^ Math.imul(ci + 101, 0x85EBCA6B) ^ Math.imul(y + 977, 0xC2B2AE35)) >>> 0);
			if (rr() < 0.25) return;
			const cx = x + rr.range(0, 230), cy = y + rr.range(-50, 50), c = rr.pick(lights);
			if (rr() < 0.55) pt.softBlob(cx, cy, rr.range(110, 220), rr.range(60, 120), c, dark ? rr.range(0.08, 0.14) : rr.range(0.06, 0.11));
			else pt.blobWash(cx, cy, rr.range(70, 150), rr.range(40, 90), mixC(c, WHITE, 0.3), dark ? 0.12 : 0.1, rr, rr() < 0.4);
		});
	}
	// the studies thrown onto the sheet: random places, sizes and a slight tilt, never on the cards, seldom touching
	const unit = clamp(Math.min(W, worldH) / 7.5, 55, 100), placed = [];
	const shuffle = (list) => { for (let i = list.length - 1; i > 0; i--) { const j = R.int(i + 1); [list[i], list[j]] = [list[j], list[i]]; } return list; };
	const first = ['prism', 'cube', 'globe', 'golden', 'matrix', 'flow'];
	const order = shuffle(first.slice()).concat(shuffle(STUDY_NAMES.filter((n) => !first.includes(n))));
	for (let tries = 0; tries < 900 && placed.length < 16; tries++) {
		const big = placed.length < 6;
		const rad = unit * (big ? R.range(0.9, 1.2) : R.range(0.55, 0.95));
		const x = R.range(L + rad * 0.8, Rt - rad * 0.95), y = R.range(rad * 0.6, worldH - rad * 0.8);
		if (outside(x, y) < rad * 0.95) continue;
		if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < (q.rad + rad) * 0.8)) continue;
		placed.push({ x, y, rad });
	}
	placed.forEach((q, i) => {
		const name = order[i % order.length], r = wcbRng(seed ^ Math.imul(i + 1, 0x9E3779B1)), color = PIGMENTS[STUDY_COLORS[name]];
		const s = q.rad * 0.58, tilt = r.range(-0.2, 0.2);
		pt.blobWash(q.x + r.range(-0.5, 0.5) * s, q.y + r.range(-0.2, 0.6) * s, s * r.range(1.3, 1.8), s * r.range(0.9, 1.3), mixC(color, WHITE, 0.2), dark ? 0.16 : 0.13, r, r() < 0.6);
		for (const g of [pt.wash, pt.pen]) { g.save(); g.translate(q.x, q.y); g.rotate(tilt); g.translate(-q.x, -q.y); }
		STUDIES[name](doodlePen(pt, q.x, q.y, s, color), pt, r);
		if (r() < 0.8) {
			const label = `FIG. ${i + 1}  ${STUDY_TITLES[name]}`, size = clamp(s * 0.12, 5, 7.5);
			pt.text(label, q.x - textWidth(label, size) / 2 + r.range(-8, 8), q.y + s * 1.42, size, { a: 0.6, w: 0.7 });
		}
		for (const g of [pt.wash, pt.pen]) g.restore();
	});
	// between them: notes in a quick hand, dashed guide lines that run on past the drawings, small crosses
	for (let i = 0, made = 0; i < 300 && made < 6; i++) {
		const x = R.range(L + 20, Rt - 90), y = R.range(20, worldH - 30);
		if (outside(x, y) < 70 || outside(x + 70, y + 30) < 20) continue;
		if (placed.some((q) => Math.hypot(q.x - x - 35, q.y - y - 12) < q.rad * 0.85 + 30)) continue;
		scribble(pt, x, y, R.range(50, 80), 1 + R.int(3), wcbRng(seed ^ (i * 7919)), { indent: true, a: 0.5 });
		made++;
	}
	for (let i = 0; i < Math.min(4, placed.length - 1); i++) {
		const a = placed[i], b = placed[(i + 2) % placed.length];
		if (outside((a.x + b.x) / 2, (a.y + b.y) / 2) < 30) continue;
		const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
		dashed(pt, [[a.x - dx / l * a.rad * 0.4, a.y - dy / l * a.rad * 0.4], [b.x + dx / l * b.rad * 0.4, b.y + dy / l * b.rad * 0.4]], { dash: 7, gap: 3, a: 0.28 });
	}
	pt.cells(90, (ci, r, x) => {
		const cx = x + r.range(0, 90), cy = r.range(10, worldH - 10);
		if (r() < 0.45 || outside(cx, cy) < 10 || placed.some((q) => Math.hypot(q.x - cx, q.y - cy) < q.rad * 0.9)) return;
		const z = r.range(2, 3.5);
		pt.line([[cx - z, cy], [cx + z, cy]], { w: 0.5, a: 0.4, twice: false });
		pt.line([[cx, cy - z], [cx, cy + z]], { w: 0.5, a: 0.4, twice: false });
	});
	return pt.finish();
}

// ----------------------------------------------------------------------------------------------------------- the medium

const WCB_VERT = 'attribute vec2 a_p; void main() { gl_Position = vec4(a_p, 0.0, 1.0); }';
const WCB_COMMON = `
	#ifdef GL_FRAGMENT_PRECISION_HIGH
	precision highp float;
	#else
	precision mediump float;
	#endif
	uniform vec2 u_res;
	uniform float u_scale, u_dark;
	uniform vec3 u_paper;
	float hash(vec2 p) {
		vec3 p3 = fract(vec3(p.xyx) * .1031);
		p3 += dot(p3, p3.yzx + 33.33);
		return fract((p3.x + p3.y) * p3.z);
	}
	float vnoise(vec2 p) {
		vec2 i = floor(p), f = fract(p);
		f = f * f * (3. - 2. * f);
		return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
	}
	float fbm(vec2 p) { return .5 * vnoise(p) + .3 * vnoise(p * 2.03 + 7.1) + .2 * vnoise(p * 4.1 + 3.3); }
	vec2 worldOf(vec2 frag) { return vec2(frag.x - .5 * u_res.x, u_res.y - frag.y) / u_scale; }
`;
// The medium: the two layers become watercolour on paper (or light on the page at night), over what is left of the
// previous picture soaking away. Rendered into a texture; the air shader puts that on screen.
const WCB_MEDIUM = WCB_COMMON + `
	uniform sampler2D u_wash, u_pencil, u_prev;
	uniform float u_t, u_soak, u_hasPrev, u_quick, u_loose, u_age, u_footer;
	uniform vec4 u_hole;

	vec4 washAt(vec2 uv, float m) { return texture2D(u_wash, uv) * m; }

	void main() {
		vec2 frag = gl_FragCoord.xy, uv = frag / u_res;
		vec2 wp = worldOf(frag), sp = wp + vec2(311., 57.);
		float y01 = 1. - uv.y;
		float tooth = .55 * vnoise(sp * 1.9) + .45 * vnoise(sp * .71 + 31.);
		float blot = fbm(sp / 46.);
		float soakP = clamp((.5 * fbm(sp / 70.) + .3 * fbm(sp / 19. + 3.) + .2 * tooth - .5) * 1.8 + .5, 0., 1.);

		// the paper, a little yellowed when the page is old (by day only), most towards the band's outer edge
		vec3 paper = u_paper;
		float outer = u_footer > 1.5 ? 1. : u_footer > .5 ? smoothstep(.2, 1., y01) : 1. - smoothstep(.3, 1., y01);
		if (u_dark < .5) paper *= mix(vec3(1.), vec3(1., .955, .86), u_age * outer * (.55 + .6 * blot));
		// the previous picture soaks into the paper: in patches where the paper drinks first, thin colour before dense
		vec3 base = paper;
		if (u_hasPrev > .5 && u_soak < 1.) {
			vec3 old = texture2D(u_prev, uv).rgb;
			float ink = min(length(old - u_paper) * 3., 1.);
			float gone = u_soak * 1.4 - .3;
			float keep = smoothstep(gone - .02, gone + .3, .6 * soakP + .4 * ink) * (1. - smoothstep(.45, 1., u_soak));
			base = mix(paper, old, keep);
		}

		// painting in: the pencil from left to right, then the washes bloom after it; an edit comes through in patches
		float mp, mw;
		if (u_quick > .5) {
			mp = smoothstep(0., .25, u_t * 1.5 - .5 * soakP);
			mw = mp;
		} else {
			mp = smoothstep(0., .12, u_t * 2.5 - uv.x - .3 * vnoise(sp / 60.));
			mw = smoothstep(0., .3, (u_t - .2) * 2.2 - .5 * uv.x - .8 * fbm(sp / 110. + 5.));
		}

		// the wash: its edge wanders and bleeds, and pigment collects at the rim
		vec2 px = u_scale / u_res;
		vec2 warp = (vec2(fbm(sp / 27.), fbm(sp / 27. + vec2(41., 17.))) - .5) * (1.5 + 4.5 * u_loose)
			+ (vec2(vnoise(sp / 4.), vnoise(sp / 4. + 9.)) - .5) * (.5 + .9 * u_loose);
		vec2 wuv = uv + warp * px * vec2(1., -1.);
		vec4 c0 = washAt(wuv, mw);
		vec4 near = vec4(0.), far = vec4(0.);
		float reach = 2.5 + 4.5 * u_loose;
		for (int i = 0; i < 6; i++) {
			float a = 1.0472 * float(i) + .3;
			vec2 d = vec2(cos(a), sin(a));
			near += washAt(wuv + d * 1.5 * px, mw);
			far += washAt(wuv + vec2(d.y, -d.x) * reach * px, mw);
		}
		near /= 6.;
		far /= 6.;
		vec4 c = mix(c0, far, .2 + .4 * u_loose);
		float rim = max(c0.a - near.a, 0.) * 1.6 + max(c0.a - far.a, 0.) * .7;
		float dens = c.a * (1. + rim / (c0.a + .1));
		dens *= .78 + .44 * blot;
		dens *= 1. + (.55 + .3 * u_loose) * (tooth - .5);
		dens *= 1. + .5 * mw * (1. - mw) * 4.;
		dens = clamp(dens, 0., 1.3);
		vec3 pig = c.rgb / max(c.a, .001);
		vec3 color;
		if (u_dark > .5) {
			// at night the wash is light: it is added to the page, the rim glows
			vec3 light = clamp(pig * dens * .72, 0., 1.);
			color = 1. - (1. - base) * (1. - light);
		} else {
			// by day it is pigment: it takes light away from the paper
			color = base * pow(max(pig, vec3(.02)), vec3(dens));
		}

		// the pencil: graphite on the same tooth (chalk at night, which covers)
		vec4 p = texture2D(u_pencil, uv) * mp;
		float grain = vnoise(sp * 2.6 + 11.);
		float pa = clamp(p.a * (.5 + .95 * smoothstep(.22, .78, .6 * grain + .4 * tooth)), 0., 1.);
		vec3 pc = p.rgb / max(p.a, .001);
		if (u_dark > .5) color = mix(color, pc, pa);
		else color *= 1. - pa * (1. - pc);

		// towards the page there is only paper
		float fade = u_footer > 1.5
			? smoothstep(0., 70., max(max(u_hole.x - wp.x, wp.x - u_hole.z), max(u_hole.y - wp.y, wp.y - u_hole.w)) + (blot - .5) * 40.)
			: u_footer > .5
			? smoothstep(.02, .2, y01 + (blot - .5) * .1)
			: 1. - smoothstep(.7, 1., y01 + (blot - .5) * .14);
		gl_FragColor = vec4(mix(u_paper, color, fade), 1.);
	}
`;
// The settled picture from its texture, with what moves drawn over it.
const WCB_AIR = WCB_COMMON + `
	uniform sampler2D u_cache;
	uniform float u_clear;
	// (u_clear: a sheet laid over a page's own background shows only what is drawn; it is opaque only where it is painted)
	vec4 finish(vec3 c) {
		if (u_clear < .5) return vec4(c, 1.);
		float a = clamp(max(max(abs(c.r - u_paper.r), abs(c.g - u_paper.g)), abs(c.b - u_paper.b)) * 5., 0., 1.);
		return vec4(clamp(c - u_paper * (1. - a), 0., a), a);
	}
	uniform float u_amb, u_w, u_glit, u_wob, u_tick, u_mistOn, u_sunX;
	uniform vec4 u_off, u_beam, u_mistY;
	uniform vec2 u_water, u_grass, u_wph;
	float drifting(vec2 p, float a, float b, float w, float size) {
		float na = fbm(vec2(p.x - a, p.y) / size);
		float nb = fbm(vec2(p.x - b, p.y) / size + vec2(17.3, 9.1));
		return (mix(na, nb, w) - .5) / sqrt(w * w + (1. - w) * (1. - w)) + .5;
	}
	float valley(float y, float at) { float d = (y - at) / 9.; return exp(-d * d); }
	void main() {
		vec2 frag = gl_FragCoord.xy, uv = frag / u_res, wp = worldOf(frag);
		vec2 px = u_scale / u_res;
		float inWater = u_water.y > u_water.x ? step(u_water.x, wp.y) * step(wp.y, u_water.y) : 0.;
		// the lake's reflection wavers: the picture is read a little to the side, row by row
		vec2 suv = uv;
		if (u_wob > 0. && inWater > 0.) {
			float k = smoothstep(0., 8., wp.y - u_water.x) * u_amb * u_wob;
			float dx = sin(wp.y * 1.25 + u_wph.x) * .7 + sin(wp.y * .43 - u_wph.y + wp.x * .015) * .5;
			suv.x += dx * k * px.x;
		}
		vec3 color = texture2D(u_cache, suv).rgb;
		if (u_amb <= 0.) { gl_FragColor = finish(color); return; }
		vec3 d = color - u_paper;
		float paint = smoothstep(.015, .1, length(d));
		// the shadows of clouds passing over, and the light between them
		float c = drifting(vec2(wp.x, wp.y * 1.7), u_off.x, u_off.y, u_w, 190.);
		float shade = smoothstep(.5, .6, c) * .3 - (1. - smoothstep(.38, .48, c)) * .12;
		// gusts running through the grass, turning its pale side up
		if (u_grass.y > 0. && wp.y > u_grass.x) {
			float g = drifting(vec2(wp.x * .6, wp.y * 3.), u_off.x * 3., u_off.y * 3., u_w, 60.);
			shade += (smoothstep(.56, .7, g) * -.4 + (1. - smoothstep(.3, .44, g)) * .15) * smoothstep(0., 8., wp.y - u_grass.x);
		}
		vec3 lit;
		if (u_dark > .5) lit = u_paper + d * (1. - shade * u_amb);
		else {
			lit = u_paper + d * (1. + shade * u_amb);
			lit = mix(lit, lit * vec3(.84, .88, .96), paint * max(shade, 0.) * u_amb * 2.);
		}
		vec3 outc = mix(color, lit, paint);
		// mist drifting along the valleys
		if (u_mistOn > 0.) {
			float band = min(1., valley(wp.y, u_mistY.x) + valley(wp.y, u_mistY.y) + valley(wp.y, u_mistY.z) + valley(wp.y, u_mistY.w));
			float m = band * smoothstep(.45, .68, drifting(vec2(wp.x, wp.y * 5.), u_off.z, u_off.w, u_w, 140.)) * u_amb * u_mistOn;
			vec3 mistc = u_dark > .5 ? u_paper + vec3(.05, .07, .1) : u_paper;
			outc = mix(outc, mistc, m * .75);
		}
		// glints on the water, most under the sun
		if (u_glit > 0. && inWater > 0.) {
			vec2 cell = floor(vec2(wp.x / 2.2, wp.y * 1.4));
			float sp = step(.965, hash(cell + floor(u_tick)));
			float near = exp(-pow((wp.x - u_sunX) / 70., 2.)) * .8 + .2;
			vec3 glint = u_dark > .5 ? vec3(1., .96, .85) : vec3(1.);
			float wet = smoothstep(.0, .1, color.b - color.r);     // only where the picture is water, not a rock or a boat
			outc = mix(outc, glint, sp * near * wet * u_glit * u_amb * .85 * smoothstep(0., 3., wp.y - u_water.x));
		}
		// the lighthouse's beam: it turns, so it reaches out to one side, shortens, flashes as it faces you, and goes to the other
		if (u_beam.w > 0.) {
			vec2 dl = wp - u_beam.xy;
			float ca = cos(u_beam.z), side = ca >= 0. ? 1. : -1.;
			float along = dl.x * side;
			float len = 30. + abs(ca) * 700.;
			float hw = 1.2 + max(along, 0.) * .085;
			float perp = abs(dl.y - along * .03);
			float bm = along > 0. ? (1. - smoothstep(hw * .55, hw, perp)) * (1. - smoothstep(len * .4, len, along)) * pow(abs(ca), .6) * .6 : 0.;
			float flash = pow(max(sin(u_beam.z), 0.), 10.);
			float halo = exp(-length(dl) / (3. + 26. * flash)) * (.55 + .45 * flash);
			vec3 lightc = u_dark > .5 ? vec3(1., .94, .74) : vec3(1., .93, .68);
			outc = mix(outc, lightc, clamp((bm + halo) * u_amb * u_beam.w, 0., .92));
		}
		gl_FragColor = finish(clamp(outc, 0., 1.));
	}
`;

/** One band's canvas: the medium into a texture (two, to keep the previous picture), the air onto the screen. */
class Stage {
	constructor(canvas) {
		this.canvas = canvas;
		this.state = null;
		try {
			// (alpha: an opaque canvas is black until its first frame; the picture itself is opaque)
			this.gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true });
			if (this.gl) this.init();
		} catch (e) {
			console.warn('[Watercolor Banner] no shader, painting plainly', e);
			this.gl = null;
		}
		if (!this.gl) { this.g2 = canvas.getContext('2d'); return; }
		canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
		canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); if (this.last) this.show(this.last.layers, { ...this.last.opts, mode: 'instant' }); });
	}

	init() {
		const gl = this.gl;
		const compile = (src) => {
			const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
			const p = gl.createProgram();
			gl.attachShader(p, sh(gl.VERTEX_SHADER, WCB_VERT));
			gl.attachShader(p, sh(gl.FRAGMENT_SHADER, src));
			gl.bindAttribLocation(p, 0, 'a_p');
			gl.linkProgram(p);
			if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
			const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
			for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
			return { p, u };
		};
		this.medium = compile(WCB_MEDIUM);
		this.air = compile(WCB_AIR);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		this.tex = { wash: this.texture(), pencil: this.texture() };
		this.targets = [null, null];
		this.cur = 0;
		this.size = null;
		this.has = false;
	}

	texture() {
		const gl = this.gl, t = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, t);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return t;
	}

	target(w, h) {
		const gl = this.gl, tex = this.texture();
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		const fb = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return { tex, fb };
	}

	/**
	 * A new picture. mode: 'paint' (painted in, the old one soaking away first), 'quick' (an edit: it comes through in
	 * patches), 'instant' (a resize or another theme: at once). A picture that is painted in starts when it is first seen.
	 */
	show(layers, opts) {
		this.last = { layers, opts };
		const { canvas } = this, w = layers.wash.width, h = layers.wash.height;
		if (canvas.width !== w) canvas.width = w;
		if (canvas.height !== h) canvas.height = h;
		this.state = { opts, start: null, settledAt: null, end: opts.mode === 'paint' ? SOAK_S * 0.35 + PAINT_S : opts.mode === 'quick' ? QUICK_S : 0 };
		if (!this.gl) { this.paint2d(layers, opts); return; }
		if (this.lost) return;
		const gl = this.gl;
		const upload = (t, src) => {
			gl.bindTexture(gl.TEXTURE_2D, t);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
		};
		upload(this.tex.wash, layers.wash);
		upload(this.tex.pencil, layers.pencil);
		if (!this.size || this.size[0] !== w || this.size[1] !== h) {
			for (const t of this.targets) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
			this.targets = [this.target(w, h), this.target(w, h)];
			this.size = [w, h];
			this.has = false;
		}
		this.hasPrev = opts.mode !== 'instant' && this.has;
		if (this.hasPrev) this.cur = 1 - this.cur;      // what was shown becomes the previous picture
		if (opts.mode === 'instant') this.renderMedium(1, 1);
	}

	renderMedium(t, soak) {
		const gl = this.gl, { u, p } = this.medium, o = this.state.opts, [w, h] = this.size;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[this.cur].fb);
		gl.viewport(0, 0, w, h);
		gl.useProgram(p);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex.wash);
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex.pencil);
		gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.targets[1 - this.cur].tex);
		gl.uniform1i(u.u_wash, 0); gl.uniform1i(u.u_pencil, 1); gl.uniform1i(u.u_prev, 2);
		gl.uniform2f(u.u_res, w, h);
		gl.uniform1f(u.u_scale, h / o.worldH);
		gl.uniform1f(u.u_dark, o.dark ? 1 : 0);
		gl.uniform3f(u.u_paper, o.paper[0], o.paper[1], o.paper[2]);
		gl.uniform1f(u.u_t, t);
		gl.uniform1f(u.u_soak, soak);
		gl.uniform1f(u.u_hasPrev, this.hasPrev ? 1 : 0);
		gl.uniform1f(u.u_quick, o.mode === 'quick' ? 1 : 0);
		gl.uniform1f(u.u_loose, o.loose);
		gl.uniform1f(u.u_age, o.age);
		gl.uniform1f(u.u_footer, o.footer === 'start' ? 2 : o.footer ? 1 : 0);
		const hole = o.hole || [0, 0, 0, 0];
		gl.uniform4f(u.u_hole, hole[0], hole[1], hole[2], hole[3]);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.has = true;
	}

	renderAir(amb, now) {
		const gl = this.gl, { u, p } = this.air, o = this.state.opts, [w, h] = this.size, air = o.air || {};
		gl.viewport(0, 0, w, h);
		gl.useProgram(p);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.targets[this.cur].tex);
		gl.uniform1i(u.u_cache, 0);
		gl.uniform2f(u.u_res, w, h);
		gl.uniform1f(u.u_scale, h / o.worldH);
		gl.uniform1f(u.u_dark, o.dark ? 1 : 0);
		gl.uniform3f(u.u_paper, o.paper[0], o.paper[1], o.paper[2]);
		gl.uniform1f(u.u_amb, amb);
		gl.uniform1f(u.u_clear, o.footer === 'start' ? 1 : 0);
		// two layers of drifting noise, each starting over once a period while the other is shown: the numbers never grow
		const period = 900, phase = (now / period) % 1, phaseB = (phase + 0.5) % 1, wind = o.wind || 10;
		gl.uniform4f(u.u_off, wind * period * phase, wind * period * phaseB, wind * 0.55 * period * phase, wind * 0.55 * period * phaseB);
		gl.uniform1f(u.u_w, 1 - Math.abs(2 * phase - 1));
		const water = air.water || [0, 0];
		gl.uniform2f(u.u_water, water[0], water[1]);
		gl.uniform1f(u.u_glit, air.glitter || 0);
		gl.uniform1f(u.u_wob, air.wobble || 0);
		gl.uniform2f(u.u_wph, (now * 1.6) % TAU, (now * 1.1) % TAU);
		gl.uniform1f(u.u_tick, Math.floor(now * 5) % 997);
		gl.uniform1f(u.u_sunX, o.sunX || 0);
		const beam = air.beam;
		gl.uniform4f(u.u_beam, beam ? beam[0] : 0, beam ? beam[1] : 0, (now * 0.9) % TAU, beam ? 1 : 0);
		gl.uniform2f(u.u_grass, air.grass ?? 0, air.grass != null ? 1 : 0);
		const mist = air.mist || [];
		gl.uniform4f(u.u_mistY, mist[0] ?? -99, mist[1] ?? -99, mist[2] ?? -99, mist[3] ?? -99);
		gl.uniform1f(u.u_mistOn, mist.length ? 1 : 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	/** Draws what is due; returns ms until the next frame is wanted, or -1 when nothing moves. */
	frame(airOn) {
		const s = this.state;
		if (!s || !this.gl || this.lost || !this.size) return -1;
		const now = performance.now() / 1000;
		if (s.start === null) s.start = now;
		const el = now - s.start, mode = s.opts.mode;
		if (mode !== 'instant' && el < s.end) {
			const soak = clamp(el / SOAK_S, 0, 1);
			const t = mode === 'quick' ? clamp(el / QUICK_S, 0, 1) : clamp((el - SOAK_S * 0.35) / PAINT_S, 0, 1);
			this.renderMedium(t, soak);
			this.renderAir(0, now);
			return 0;
		}
		if (s.settledAt === null) {
			if (mode !== 'instant') this.renderMedium(1, 1);
			s.settledAt = now;
			s.airFrom = mode === 'instant' ? (s.opts.airFrom ?? now - AIR_FADE_S) : now;
		}
		if (!airOn || !s.opts.air) { this.renderAir(0, now); return -1; }
		this.renderAir(smooth(0, AIR_FADE_S, now - s.airFrom), now);
		return 1000 / AIR_FPS;
	}

	/** Without WebGL: the layers multiplied (or screened) onto the paper, at once. */
	paint2d(layers, opts) {
		const g = this.g2, w = this.canvas.width, h = this.canvas.height;
		g.globalCompositeOperation = 'source-over';
		g.globalAlpha = 1;
		g.fillStyle = cssC(opts.paper);
		g.fillRect(0, 0, w, h);
		g.globalCompositeOperation = opts.dark ? 'screen' : 'multiply';
		g.drawImage(layers.wash, 0, 0);
		g.globalCompositeOperation = 'source-over';
		g.drawImage(layers.pencil, 0, 0);
		const [a, b] = opts.footer ? [h * 0.2, 0] : [h * 0.7, h];
		const fade = g.createLinearGradient(0, a, 0, b);
		fade.addColorStop(0, cssC(opts.paper, 0));
		fade.addColorStop(1, cssC(opts.paper, 1));
		g.fillStyle = fade;
		g.fillRect(0, Math.min(a, b), w, Math.abs(b - a));
	}

	dispose() { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
}

// ------------------------------------------------------------------------------------------------------------- plugin

const wcbRead = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const wcbWrite = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window */ } };
const wcbReduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

class Plugin extends AppPlugin {
	onLoad() {
		this.watched = new Map();     // .panel-heading -> { mo, ro }
		this.feet = new Map();        // .panel-body -> { mo, ro }
		// one band per panel and place ('<panel id>|head', '<panel id>|foot'), kept across Thymer's rebuilds of the panel:
		// when Thymer replaces the heading or the page body on navigation, the same canvas (with the old picture in its
		// textures) is put into the new one, so the old picture can soak away while the new one paints in
		this.strips = new Map();      // -> { wrap, view, stage, key, guid, pageKey, kind, visible, wait, foot, parked }
		this.pages = new Map();       // record guid -> what was read of the page
		this.kinds = wcbRead(WCB_KIND_KEY, {});
		this.footArt = wcbRead(WCB_FOOT_KEY, {});
		this.loading = new Set();
		this.timers = new Map();      // record guid -> reload timer
		this.raf = 0;
		this.io = new IntersectionObserver((entries) => {
			for (const e of entries) for (const s of this.strips.values()) if (s.wrap === e.target) s.visible = e.isIntersecting;
			this.kick();
		});

		const soon = () => { this.syncAll(); setTimeout(() => this.syncAll(), 120); setTimeout(() => this.syncAll(), 450); };
		this.events.on('panel.navigated', soon);
		this.events.on('panel.focused', soon);
		this.events.on('panel.closed', soon);
		this.events.on('record.updated', (ev) => this.reloadLater(ev.recordGuid, SETTLE_MS), { collection: '*' });
		for (const name of ['lineitem.created', 'lineitem.updated', 'lineitem.deleted', 'lineitem.moved']) {
			this.events.on(name, (ev) => this.reloadLater(ev.recordGuid, RELOAD_MS), { collection: '*' });
		}
		// another theme: the paper changes, so every picture is drawn again in it
		let themeWait = 0;
		this.themeMo = new MutationObserver(() => { clearTimeout(themeWait); themeWait = setTimeout(() => this.syncAll(), 30); });
		this.themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.onVisible = () => { if (!document.hidden) this.kick(); };
		document.addEventListener('visibilitychange', this.onVisible);

		const toggle = (key) => () => { wcbWrite(key, !wcbRead(key, false)); this.syncAll(); this.kick(); };
		this.ui.addCommandPaletteCommand({ label: 'Watercolor Banner: another scene for this page', icon: 'ti-dice', onSelected: () => this.nextKind() });
		this.ui.addCommandPaletteCommand({ label: "Watercolor Banner: back to this page's own scene", icon: 'ti-arrow-back-up', onSelected: () => this.nextKind(true) });
		this.ui.addCommandPaletteCommand({ label: 'Watercolor Banner: another footer sketch for this page', icon: 'ti-palette', onSelected: () => this.nextFoot() });
		this.ui.addCommandPaletteCommand({ label: 'Watercolor Banner: paint this page again', icon: 'ti-refresh', onSelected: () => this.repaint() });
		this.ui.addCommandPaletteCommand({ label: 'Watercolor Banner: motion on or off', icon: 'ti-player-play', onSelected: toggle(WCB_STILL_KEY) });
		this.ui.addCommandPaletteCommand({ label: 'Watercolor Banner: footer on or off', icon: 'ti-layout-bottombar', onSelected: toggle(WCB_NOFOOT_KEY) });
		this.ui.addCommandPaletteCommand({ label: 'Watercolor Banner: turn on or off', icon: 'ti-photo', onSelected: toggle(WCB_OFF_KEY) });

		soon();
	}

	onUnload() {
		for (const t of this.timers.values()) clearTimeout(t);
		cancelAnimationFrame(this.raf);
		this.io.disconnect();
		this.themeMo?.disconnect();
		document.removeEventListener('visibilitychange', this.onVisible);
		for (const heading of [...this.watched.keys()]) this.unwatch(heading);
		for (const body of [...this.feet.keys()]) this.unwatchFoot(body);
		for (const sk of [...this.strips.keys()]) this.drop(sk);
		document.querySelectorAll('.wcb-on').forEach((n) => n.classList.remove('wcb-on'));
		document.querySelectorAll('.wcb-has-foot, .wcb-has-start').forEach((n) => n.classList.remove('wcb-has-foot', 'wcb-has-start'));
		document.querySelectorAll('.wcb-wrap, .wcb-foot, .wcb-start').forEach((n) => n.remove());
	}

	moving() { return !wcbRead(WCB_STILL_KEY, false) && !wcbReduced(); }

	excluded(collection) {
		const list = this.getConfiguration()?.custom?.exclude;
		return Array.isArray(list) && !!collection && list.some((n) => plain(String(n)).trim() === plain(collection.getName()).trim());
	}

	nextKind(back = false) {
		const record = this.ui.getActivePanel()?.getActiveRecord();
		const page = record && this.pages.get(record.guid);
		if (!page) return;
		if (back) delete this.kinds[record.guid];
		else {
			const cur = this.kinds[record.guid] || kindOf(page);
			this.kinds[record.guid] = KINDS[(KINDS.indexOf(cur) + 1) % KINDS.length];
		}
		wcbWrite(WCB_KIND_KEY, this.kinds);
		for (const s of this.strips.values()) if (s.guid === record.guid) s.forcePaint = true;
		this.syncAll();
	}

	nextFoot() {
		const record = this.ui.getActivePanel()?.getActiveRecord();
		const page = record && this.pages.get(record.guid);
		if (!page) return;
		this.footArt[record.guid] = (this.footArt[record.guid] || 0) + 1;
		wcbWrite(WCB_FOOT_KEY, this.footArt);
		for (const s of this.strips.values()) if (s.guid === record.guid && s.foot) s.forcePaint = true;
		this.syncAll();
	}

	/** Reads the page again a little after it changed, if a panel shows it. */
	reloadLater(guid, ms) {
		if (!guid) return;
		const shown = this.ui.getPanels().some((p) => p.getActiveRecord()?.guid === guid);
		if (!shown) { this.pages.delete(guid); return; }
		clearTimeout(this.timers.get(guid));
		this.timers.set(guid, setTimeout(() => {
			this.timers.delete(guid);
			const panel = this.ui.getPanels().find((p) => p.getActiveRecord()?.guid === guid);
			if (panel) this.load(panel.getActiveRecord(), panel.getActiveCollection());
		}, ms));
	}

	async load(record, collection) {
		const guid = record.guid;
		if (this.loading.has(guid)) return;
		this.loading.add(guid);
		let items = [];
		try { items = await record.getLineItems(); } catch (e) { /* an empty page */ }
		try {
			const page = readPage(record, collection, items);
			this.pages.delete(guid);
			this.pages.set(guid, page);
			while (this.pages.size > PAGE_CACHE) this.pages.delete(this.pages.keys().next().value);
		} catch (e) {
			console.warn('[Watercolor Banner]', e);
		} finally {
			this.loading.delete(guid);
		}
		this.syncAll();
	}

	repaint() {
		const record = this.ui.getActivePanel()?.getActiveRecord();
		if (!record) return;
		for (const s of this.strips.values()) if (s.guid === record.guid) { s.key = null; s.forcePaint = true; }
		this.syncAll();
	}

	syncAll() {
		const panels = this.ui.getPanels(), ids = new Set(panels.map((p) => String(p.getId())));
		for (const panel of panels) this.sync(panel);
		for (const heading of [...this.watched.keys()]) if (!heading.isConnected) this.unwatch(heading);
		for (const body of [...this.feet.keys()]) if (!body.isConnected) this.unwatchFoot(body);
		for (const sk of [...this.strips.keys()]) if (!ids.has(sk.split('|')[0])) this.drop(sk);
	}

	/** Shows, repaints or takes away the pictures in one panel. */
	sync(panel) {
		const el = panel.getElement(), root = el?.closest('.panel') || el;
		const id = String(panel.getId());
		const heading = root?.querySelector('.panel-heading') || null;
		// the footer lies behind the bottom of the page's scrolling content, edge to edge
		const body = root?.querySelector('.panel-scroller-y > .panel-body') || null;
		const record = panel.getActiveRecord();
		const collection = record ? panel.getActiveCollection() : null;
		const title = record?.getName()?.trim() || '';
		const on = !wcbRead(WCB_OFF_KEY, false) && !!record && !!title && !this.excluded(collection);
		let page = null;
		if (on) {
			page = this.pages.get(record.guid);
			if (!page || page.title !== title) this.load(record, collection);
		}
		if (heading) {
			this.watch(heading, panel);
			const container = heading.querySelector('.banner-container');
			if (on && container && heading.classList.contains('banner-is-empty')) {
				const wrap = this.place(id + '|head', container, 'wcb-wrap', true);
				if (!heading.classList.contains('wcb-on')) heading.classList.add('wcb-on');
				if (page) this.paintStrip(id + '|head', wrap, record, page, false);
			} else {
				if (heading.classList.contains('wcb-on')) heading.classList.remove('wcb-on');
				this.park(id + '|head');
			}
		}
		if (root) for (const old of root.querySelectorAll('.wcb-foot')) if (old.parentNode !== body) old.remove();
		if (body) {
			this.watchFoot(body, panel);
			if (on && !wcbRead(WCB_NOFOOT_KEY, false)) {
				const wrap = this.place(id + '|foot', body, 'wcb-foot', false);
				if (!body.classList.contains('wcb-has-foot')) body.classList.add('wcb-has-foot');
				if (page) this.paintStrip(id + '|foot', wrap, record, page, true);
			} else {
				if (body.classList.contains('wcb-has-foot')) body.classList.remove('wcb-has-foot');
				this.park(id + '|foot');
			}
			// no page open: Thymer's start screen gets a sheet of geometry studies around its cards
			const empty = !record && !wcbRead(WCB_OFF_KEY, false) ? body.querySelector('.empty-panel') : null;
			if (empty) {
				const wrap = this.place(id + '|start', body, 'wcb-start', true);
				if (!body.classList.contains('wcb-has-start')) body.classList.add('wcb-has-start');
				this.paintSheet(id + '|start', wrap, empty);
			} else {
				if (body.classList.contains('wcb-has-start')) body.classList.remove('wcb-has-start');
				this.park(id + '|start');
			}
		}
	}

	/** Paints the start sheet, around the box the start screen's cards take up. */
	paintSheet(sk, wrap, empty) {
		const cw = wrap.offsetWidth, ch = wrap.offsetHeight;
		if (cw < 2 || ch < 2) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2), f = Math.min(1, MAX_W / (cw * dpr));
		const w = Math.max(2, Math.round(cw * dpr * f)), h = Math.max(2, Math.round(ch * dpr * f));
		const paper = paperOf(wrap), dark = lightnessOf(paper) < 0.5;
		// the cards' box, in the sheet's units (CSS pixels, x from its middle, y from its top), a little rounded so that
		// small shifts of the cards do not paint it again
		const wr = wrap.getBoundingClientRect();
		let hole = null;
		for (const c of empty.children) {
			const r = c.getBoundingClientRect();
			if (r.width < 2 || r.height < 2) continue;
			const b = [r.left - wr.left - cw / 2, r.top - wr.top, r.right - wr.left - cw / 2, r.bottom - wr.top];
			hole = hole ? [Math.min(hole[0], b[0]), Math.min(hole[1], b[1]), Math.max(hole[2], b[2]), Math.max(hole[3], b[3])] : b;
		}
		if (hole) hole = hole.map((v, i) => (i < 2 ? Math.floor(v / 16) : Math.ceil(v / 16)) * 16);
		const key = ['start', dayKey(), w, h, paper.map((v) => v.toFixed(3)).join(','), hole && hole.join(','), this.moving()].join('|');
		let strip = this.strips.get(sk);
		if (strip && strip.wrap === wrap && strip.key === key && strip.view.isConnected) return;
		if (!strip || strip.wrap !== wrap) {
			if (strip) this.drop(sk);
			const view = document.createElement('canvas');
			view.className = 'wcb-canvas';
			wrap.replaceChildren(view);
			strip = { wrap, view, stage: new Stage(view), visible: true, wait: 0, guid: null, pageKey: null, foot: false, parked: 0 };
			this.strips.set(sk, strip);
			this.io.observe(wrap);
		}
		const mode = this.moving() && (strip.guid !== 'start:' + dayKey() || strip.forcePaint) ? 'paint' : 'instant';
		strip.forcePaint = false;
		try {
			const layers = paintStart(w, h, ch, dark, paper, hole);
			strip.stage.show(layers, { mode, dark, paper, loose: 0.35, age: 0, wind: 0, worldH: ch, footer: 'start', air: null, hole: hole || [0, 0, 0, 0], sunX: 0 });
		} catch (e) {
			console.warn('[Watercolor Banner]', e);
		}
		strip.key = key;
		strip.guid = 'start:' + dayKey();
		strip.wait = 0;
		this.kick();
	}

	/** Puts the band's element into `parent`: the one it already has, if Thymer took it out, else a new one. */
	place(sk, parent, cls, first) {
		const strip = this.strips.get(sk);
		let wrap = parent.querySelector(':scope > .' + cls);
		if (strip && wrap !== strip.wrap) {
			if (wrap) wrap.remove();
			wrap = strip.wrap;
		}
		if (!wrap) { wrap = document.createElement('div'); wrap.className = cls; }
		if (wrap.parentNode !== parent) {
			if (first) parent.prepend(wrap); else parent.appendChild(wrap);
			if (cls !== 'wcb-wrap') this.feet.get(parent)?.ro.observe(wrap);
		}
		if (strip) strip.parked = 0;
		return wrap;
	}

	/** Takes a band out of the page but keeps it a while: the next page in the panel may want it back. */
	park(sk) {
		const s = this.strips.get(sk);
		if (!s || s.parked) return;
		s.wrap.remove();
		s.parked = performance.now();
		setTimeout(() => { const t = this.strips.get(sk); if (t && t.parked && !t.wrap.isConnected) this.drop(sk); }, 5000);
	}

	drop(sk) {
		const s = this.strips.get(sk);
		if (!s) return;
		this.io.unobserve(s.wrap);
		s.stage.dispose();
		s.wrap.remove();
		this.strips.delete(sk);
	}

	/** Paints one band (header or footer) for a page, if anything about it changed. */
	paintStrip(sk, wrap, record, page, foot) {
		// layout size: the header is scaled by Thymer's scroll animation, which a bounding rect would count
		const cw = wrap.offsetWidth, ch = wrap.offsetHeight;
		if (cw < 2 || ch < 2) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2), f = Math.min(1, MAX_W / (cw * dpr));
		const w = Math.max(2, Math.round(cw * dpr * f)), h = Math.max(2, Math.round(ch * dpr * f));
		const paper = paperOf(wrap);
		const dark = lightnessOf(paper) < 0.5;
		const kind = foot ? String(this.footArt[record.guid] || 0) : this.kinds[record.guid] || '';
		const key = [page.key, kind, w, h, paper.map((v) => v.toFixed(3)).join(','), this.moving()].join('|');
		let strip = this.strips.get(sk);
		if (strip && strip.wrap === wrap && strip.key === key && strip.view.isConnected) return;

		if (!strip || strip.wrap !== wrap) {
			if (strip) this.drop(sk);
			const view = document.createElement('canvas');
			view.className = 'wcb-canvas';
			wrap.replaceChildren(view);
			strip = { wrap, view, stage: new Stage(view), visible: !foot, wait: 0, guid: null, pageKey: null, foot, parked: 0 };
			this.strips.set(sk, strip);
			this.io.observe(wrap);
		}
		let mode = 'instant';
		if (this.moving()) {
			if (strip.forcePaint || strip.guid !== record.guid || (strip.kind ?? kind) !== kind) mode = 'paint';
			else if (strip.pageKey !== page.key) mode = 'quick';
		}
		strip.forcePaint = false;
		try {
			const scene = buildScene(page, foot ? this.kinds[record.guid] || null : kind || null);
			const layers = foot ? paintFooter(scene, w, h, dark, paper, +kind) : paintHeader(scene, w, h, dark, paper);
			const airFrom = mode === 'instant' ? strip.stage.state?.airFrom : undefined;      // a resize does not fade the air in again
			strip.stage.show(layers, {
				mode, dark, paper, loose: scene.loose, age: clamp(scene.years / 6, 0, 1) * 0.65, wind: scene.windSpeed, airFrom,
				worldH: foot ? FOOT_H : HEAD_H, footer: foot, air: foot ? null : scene.air, sunX: scene.sun.x,
			});
		} catch (e) {
			console.warn('[Watercolor Banner]', e);
		}
		strip.key = key;
		strip.guid = record.guid;
		strip.pageKey = page.key;
		strip.kind = kind;
		strip.wait = 0;
		this.kick();
	}

	/** Runs the frames while some band is painting in, or has air and is in sight. */
	kick() {
		if (this.raf) return;
		const tick = (now) => {
			this.raf = 0;
			const airOn = this.moving() && !document.hidden;
			let next = -1;
			for (const s of this.strips.values()) {
				if (!s.view.isConnected || !s.stage.state) continue;
				const st = s.stage.state;
				if (!s.visible && (st.settledAt !== null || st.start === null)) continue;   // a picture is painted in where it is seen
				if (now < s.wait) { next = next < 0 ? s.wait - now : Math.min(next, s.wait - now); continue; }
				const ms = s.stage.frame(airOn);
				if (ms < 0) continue;
				s.wait = now + ms;
				next = next < 0 ? ms : Math.min(next, ms);
			}
			if (next >= 0) this.raf = requestAnimationFrame(tick);
		};
		this.raf = requestAnimationFrame(tick);
	}

	/** Follows the heading: Thymer sets banner-is-empty when it changes page, and the strip's size changes with the panel. */
	watch(heading, panel) {
		if (this.watched.has(heading)) return;
		let wait = 0;
		const later = () => { clearTimeout(wait); wait = setTimeout(() => this.sync(panel), 60); };
		const mo = new MutationObserver(later);
		mo.observe(heading, { attributes: true, attributeFilter: ['class'] });
		const ro = new ResizeObserver(later);
		ro.observe(heading);
		this.watched.set(heading, { mo, ro });
	}

	/** Follows the page body: Thymer may rebuild it and take the footer out; the footer's width changes with the panel. */
	watchFoot(body, panel) {
		if (this.feet.has(body)) return;
		let wait = 0;
		const later = () => { clearTimeout(wait); wait = setTimeout(() => this.sync(panel), 30); };
		const mo = new MutationObserver(() => {
			if (wcbRead(WCB_OFF_KEY, false)) return;
			const empty = body.querySelector('.empty-panel');
			if (empty ? !body.querySelector(':scope > .wcb-start') : !body.querySelector(':scope > .wcb-foot') && !wcbRead(WCB_NOFOOT_KEY, false)) later();
		});
		mo.observe(body, { childList: true });
		const ro = new ResizeObserver(later);
		this.feet.set(body, { mo, ro });
		const foot = body.querySelector(':scope > .wcb-foot');
		if (foot) ro.observe(foot);
	}

	unwatch(heading) {
		const w = this.watched.get(heading);
		if (w) { w.mo.disconnect(); w.ro.disconnect(); }
		this.watched.delete(heading);
	}

	unwatchFoot(body) {
		const w = this.feet.get(body);
		if (w) { w.mo.disconnect(); w.ro.disconnect(); }
		this.feet.delete(body);
	}
}
