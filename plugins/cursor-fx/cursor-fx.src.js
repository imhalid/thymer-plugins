/**
 * Cursor FX
 *
 * Effects for the mouse, chosen as a whole: a preset (Frost, Arcane, Festival, Sweetheart, Quiet) puts together what happens
 * where you click (a ripple, one of seven spells, a firework, hearts), the trail the pointer leaves (a comet, fairy dust, or
 * none), a size, and two colours: the main one, and an accent that some parts of each effect take (a comet's head, a firework's
 * every third star). Arcane casts a different spell each click.
 * Everything is drawn from small grayscale textures (see fx/LICENSE.md), tinted with those colours.
 *
 * How: one transparent WebGL canvas over the whole window, which clicks pass through. Each particle is a textured quad with its
 * own position, speed, size, rotation, life and sprite; all of them are drawn in one instanced draw call. The canvas draws only
 * while something is alive, so standing still costs nothing. On a dark theme the light adds up (additive blending); on a light
 * theme the colour is darkened and painted over, so it stays visible.
 *
 * Off on phones and tablets (no mouse there) and with reduced motion. The preset picked in "Cursor FX: choose preset…" is kept
 * per device in localStorage and laid over the default in this plugin's configuration (Edit Code > Configuration, "custom").
 *
 * The textures are baked into this file at build time (see build.mjs).
 */

const FX = __FX__;   // { atlas, noise } as data URLs
let fxImgs = null;
/** The textures as images, decoded once and kept, so they are ready by the first click. */
const fxImages = () => fxImgs || (fxImgs = Object.fromEntries(Object.entries(FX).map(([k, src]) => { const i = new Image(); i.src = src; return [k, i]; })));

// The atlas: 6 x 3 cells of 128px (fx/LICENSE.md lists the sprites in this order).
const ATLAS_COLS = 6, ATLAS_ROWS = 3;
const S = {
	RING: 0, SOFTRING: 1, STAR: 2, GLOW: 3, STAR6: 4, DOT: 5, RUNE: 6, RUNE7: 7, COMPASS: 8, CROSS: 9, NOVA: 10, TWIRL: 11,
	TWIRL2: 12, TWIRL3: 13, HEART: 14, STAR5: 15, BURST: 16, STREAK: 17,
};
const KIND = { SPRITE: 0, RING: 1, SOFTRING: 2 };   // a ring is read across a ring sprite's band at a chosen width (see the shader)

const DEFAULTS = { on: true, preset: 'frost' };
const CHOICES_KEY = 'cursorfx.choices';
// The presets: each a click effect, a trail, a size, and a main colour with an accent, chosen to go together.
const PRESETS = [
	{ id: 'frost', name: 'Frost', note: 'Calm ripples, a comet of light', click: 'ripple', trail: 'comet', color: '#6fdcff', accent: '#e6fbff', size: 1 },
	{ id: 'arcane', name: 'Arcane', note: 'A different spell every click, stardust trails', click: 'magic', trail: 'dust', color: '#a98bff', accent: '#ffc6f5', size: 1.2 },
	{ id: 'festival', name: 'Festival', note: 'Fireworks and golden dust', click: 'firework', trail: 'dust', color: '#ffc443', accent: '#ff6fae', size: 1 },
	{ id: 'sweetheart', name: 'Sweetheart', note: 'Hearts pop, pink sparkles trail', click: 'hearts', trail: 'dust', color: '#ff6fae', accent: '#ffd0e4', size: 1 },
	{ id: 'quiet', name: 'Quiet', note: 'A small, soft ripple. No trail', click: 'ripple', trail: 'none', color: '#c3cbe0', accent: '#ffffff', size: 0.75 },
];
const MAX_PARTICLES = 1500;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const hexRgb = (hex) => { const n = parseInt(String(hex).replace('#', '').padStart(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255); };

/** A darker, more saturated twin of a colour, so it shows on a light background. */
const darken = ([r, g, b]) => {
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
	if (mx - mn < 0.1) return [0.22, 0.22, 0.25];
	const k = 0.62 / mx;
	return [r, g, b].map((v) => Math.min(1, (v - mn * 0.35) * k));
};

/** Thymer on a phone or tablet: <html data-device="mobile|desktop">, or the user agent without it. */
const onMobile = () => {
	const d = document.documentElement.dataset.device;
	return d ? d === 'mobile' : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
};

/** Thymer marks the theme on <html>/<body>; without that, the body's background decides. */
function isDarkTheme() {
	const h = document.documentElement.classList, b = document.body.classList;
	if (h.contains('theme-dark') || b.contains('theme-dark')) return true;
	if (h.contains('theme-light') || b.contains('theme-light')) return false;
	const m = (getComputedStyle(document.body).backgroundColor || '').match(/[\d.]+/g);
	if (m && m.length >= 3 && !(m.length > 3 && Number(m[3]) === 0)) return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] < 128;
	return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
}

// ---- Particles -------------------------------------------------------------------------------------------------------------
// One particle: where it is and how it moves (px, px/s; y down), how long it lives, what it looks like over its life (half-sizes
// w/h and alpha from start to end), and its sprite. Optional: twinkle, delay, follow (stays on the pointer), for rings their radius
// and band width from start to end. alt: it takes the preset's accent colour instead of the main one.
function particle(o) {
	return {
		x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 1, t: 0, delay: 0, rot: 0, vr: 0, cell: S.DOT, kind: KIND.SPRITE,
		w0: 8, w1: 8, h0: null, h1: null, a0: 1, a1: 0, fadeIn: 0.06, ease: easeOut, twinkle: 0, ...o,
	};
}

// ---- The effects -----------------------------------------------------------------------------------------------------------
// A click effect is spawn(at, ctx): at = { x, y, dx, dy } (the pointer's recent direction), ctx = { add(p), k, next(key, n) } (k:
// the preset's size; next: the next of n variants, never the one just shown). A trail is step(at, ctx), called for each stretch
// of movement, spaced by its own `every` px.

// Arcane's spells, one per click (see CLICKS.magic). Each is (x, y, add, k).
const springy = (t) => 1 - Math.exp(-7 * t) * Math.cos(9 * t);   // grows past its size and settles
const SPELLS = [
	(x, y, add, k) => {   // a pentagram, with a vortex under it and stars rising round
		add(particle({ x, y, cell: S.RUNE, rot: rand(0, 6.28), vr: 2.2, life: 1.0, w0: 4 * k, w1: 34 * k, ease: springy, a0: 1, a1: 0, fadeIn: 0.05 }));
		add(particle({ x, y, cell: S.TWIRL, rot: rand(0, 6.28), vr: -6, life: 0.7, w0: 10 * k, w1: 30 * k, a0: 0.8, a1: 0 }));
		add(particle({ x, y, cell: S.GLOW, life: 0.45, w0: 18 * k, w1: 4 * k, rot: rand(0, 6.28), vr: 1.5, a0: 1, a1: 0, alt: true }));
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * 6.28 + rand(-0.2, 0.2);
			add(particle({ x: x + Math.cos(a) * 22 * k, y: y + Math.sin(a) * 22 * k, vx: Math.cos(a) * 20 * k, vy: -rand(30, 70) * k, cell: S.STAR, twinkle: 1, rot: rand(0, 6.28), vr: rand(-3, 3), delay: rand(0.05, 0.3), life: rand(0.6, 1.0), w0: rand(4, 7) * k, w1: 1.5 * k, alt: i % 2 === 0 }));
		}
	},
	(x, y, add, k) => {   // a heptagram turning the other way, inside a sharp ring
		add(particle({ x, y, cell: S.RUNE7, rot: rand(0, 6.28), vr: -2.4, life: 1.0, w0: 4 * k, w1: 34 * k, ease: springy, a0: 1, a1: 0, fadeIn: 0.05 }));
		add(particle({ x, y, kind: KIND.RING, cell: S.RING, rot: rand(0, 6.28), vr: 3, life: 0.9, r0: 10 * k, r1: 40 * k, b0: 2.5 * k, b1: 1.2 * k, a0: 0.9, a1: 0, alt: true }));
		add(particle({ x, y, cell: S.TWIRL2, rot: rand(0, 6.28), vr: 7, life: 0.6, w0: 12 * k, w1: 28 * k, a0: 0.6, a1: 0 }));
		add(particle({ x, y, cell: S.DOT, life: 0.3, w0: 14 * k, w1: 3 * k, a0: 1, a1: 0, alt: true }));
	},
	(x, y, add, k) => {   // a compass that spins down into place, its four points lighting up
		add(particle({ x, y, cell: S.COMPASS, rot: rand(0, 6.28), vr: 4, life: 0.9, w0: 56 * k, w1: 28 * k, a0: 1.1, a1: 0, fadeIn: 0.08 }));
		add(particle({ x, y, kind: KIND.RING, cell: S.RING, rot: rand(0, 6.28), life: 0.7, r0: 6 * k, r1: 36 * k, b0: 3 * k, b1: 1 * k, a0: 0.8, a1: 0 }));
		for (let i = 0; i < 4; i++) {
			const a = i * 1.5708;
			add(particle({ x: x + Math.cos(a) * 34 * k, y: y + Math.sin(a) * 34 * k, cell: S.STAR, rot: 0, delay: 0.12 + i * 0.04, life: 0.6, w0: 2 * k, w1: 9 * k, ease: springy, a0: 1.2, a1: 0, alt: true }));
		}
	},
	(x, y, add, k) => {   // a nova: a soft star bursts, and sparks swirl out from it
		add(particle({ x, y, cell: S.NOVA, rot: 0.785, life: 0.6, w0: 6 * k, w1: 40 * k, ease: springy, a0: 1.2, a1: 0 }));
		add(particle({ x, y, cell: S.GLOW, rot: rand(0, 6.28), life: 0.35, w0: 22 * k, w1: 6 * k, a0: 1, a1: 0, alt: true }));
		for (let i = 0; i < 12; i++) {
			const a = (i / 12) * 6.28, out = rand(90, 150) * k, round = 140 * k;   // outward and round at once: a swirl
			add(particle({ x, y, vx: Math.cos(a) * out - Math.sin(a) * round, vy: Math.sin(a) * out + Math.cos(a) * round, drag: 3, cell: S.STAR6, rot: rand(0, 6.28), vr: 6, twinkle: 1, life: rand(0.55, 0.85), w0: rand(6, 8) * k, w1: 1.5 * k, a0: 1.5, alt: i % 3 === 0 }));
		}
	},
	(x, y, add, k) => {   // twin rings turning against each other round a cross of light
		add(particle({ x, y, kind: KIND.RING, cell: S.RING, rot: rand(0, 6.28), vr: 6, life: 0.85, r0: 12 * k, r1: 22 * k, b0: 2.4 * k, b1: 1.6 * k, a0: 1, a1: 0 }));
		add(particle({ x, y, kind: KIND.RING, cell: S.RING, rot: rand(0, 6.28), vr: -5, life: 0.85, r0: 18 * k, r1: 32 * k, b0: 2 * k, b1: 1.2 * k, a0: 0.9, a1: 0, alt: true }));
		add(particle({ x, y, cell: S.CROSS, rot: 0, vr: 1, life: 0.6, w0: 4 * k, w1: 20 * k, ease: springy, a0: 1.1, a1: 0 }));
		add(particle({ x, y, cell: S.DOT, life: 0.25, w0: 12 * k, w1: 3 * k, a0: 1, a1: 0, alt: true }));
	},
	(x, y, add, k) => {   // a vortex: two swirls pull in, stars are drawn after them, and it lets go in a flash
		add(particle({ x, y, cell: S.TWIRL2, rot: rand(0, 6.28), vr: 10, life: 0.5, w0: 44 * k, w1: 6 * k, ease: (t) => t * t, a0: 1.2, a1: 0.4, fadeIn: 0.06 }));   // slow, then faster in
		add(particle({ x, y, cell: S.TWIRL3, rot: rand(0, 6.28), vr: -8, life: 0.5, w0: 36 * k, w1: 5 * k, ease: (t) => t * t, a0: 1, a1: 0.4, fadeIn: 0.06 }));
		for (let i = 0; i < 10; i++) {
			const a = (i / 10) * 6.28 + rand(-0.2, 0.2), r = rand(38, 48) * k;
			add(particle({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.4, vy: -Math.sin(a) * r * 2.4, cell: S.STAR, rot: rand(0, 6.28), life: 0.4, w0: 4 * k, w1: 1.5 * k, a0: 1, a1: 0.3, alt: i % 2 === 0 }));
		}
		add(particle({ x, y, cell: S.GLOW, rot: rand(0, 6.28), delay: 0.42, life: 0.4, w0: 8 * k, w1: 34 * k, a0: 1.4, a1: 0, fadeIn: 0.01, alt: true }));
		add(particle({ x, y, kind: KIND.SOFTRING, cell: S.SOFTRING, delay: 0.42, life: 0.4, r0: 4 * k, r1: 40 * k, b0: 6 * k, b1: 8 * k, a0: 0.5, a1: 0 }));
	},
	(x, y, add, k) => {   // a sun sigil: a glowing disc in a ring with four marks, stars round it, and sparks left as it fades
		add(particle({ x, y, cell: S.DOT, life: 0.55, w0: 8 * k, w1: 24 * k, ease: springy, a0: 1.3, a1: 0, fadeIn: 0.02 }));
		add(particle({ x, y, cell: S.GLOW, rot: rand(0, 6.28), life: 0.5, w0: 30 * k, w1: 38 * k, a0: 0.8, a1: 0, alt: true }));
		add(particle({ x, y, kind: KIND.RING, cell: S.RING, rot: rand(0, 6.28), vr: 1, life: 1.0, r0: 20 * k, r1: 26 * k, b0: 2.2 * k, b1: 1.2 * k, a0: 1, a1: 0 }));
		const turn = rand(-0.2, 0.2);
		for (let i = 0; i < 4; i++) {
			const a = i * 1.5708 + turn;
			add(particle({ x: x + Math.cos(a) * 32 * k, y: y + Math.sin(a) * 32 * k, cell: S.STREAK, rot: Math.atan2(-Math.cos(a), Math.sin(a)), life: 0.5, w0: 1.8 * k, w1: 1.2 * k, h0: 7 * k, h1: 5 * k, a0: 1.2, a1: 0 }));
		}
		for (let i = 0; i < 6; i++) {
			const a = rand(0, 6.28), r = rand(32, 42) * k;
			add(particle({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, cell: S.STAR5, rot: rand(-0.4, 0.4), delay: rand(0.04, 0.16), life: 0.9, w0: 1 * k, w1: 4.5 * k, ease: springy, twinkle: 1, a0: 1.2, a1: 0, alt: true }));
		}
		for (let i = 0; i < 2; i++) {   // glints across the disc
			add(particle({ x: x + rand(-6, 6) * k, y: y + (i ? 6 : -7) * k, cell: S.STREAK, rot: 1.5708 + rand(-0.15, 0.15), delay: 0.05, life: 0.35, w0: 1.4 * k, w1: 1 * k, h0: 14 * k, h1: 10 * k, a0: 1.1, a1: 0, alt: true }));
		}
		for (let i = 0; i < 16; i++) {   // the sparks the disc leaves
			const a = rand(0, 6.28), r = rand(0, 22) * k;
			add(particle({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: rand(-20, 20) * k, vy: rand(-30, 10) * k, cell: S.DOT, twinkle: 1, delay: rand(0.2, 0.45), life: rand(0.6, 1.1), w0: rand(1.2, 2.4) * k, w1: 0.5 * k, a0: 1.2, a1: 0 }));
		}
	},
];

const CLICKS = {
	ripple: {
		label: 'Ripple', icon: '◎',
		spawn({ x, y }, { add, k }) {
			add(particle({ x, y, kind: KIND.RING, cell: S.RING, rot: rand(0, 6.28), life: 0.65, r0: 4 * k, r1: 46 * k, b0: 4 * k, b1: 1.6 * k, a0: 1, a1: 0 }));
			add(particle({ x, y, kind: KIND.SOFTRING, cell: S.SOFTRING, rot: rand(0, 6.28), life: 0.45, r0: 2 * k, r1: 60 * k, b0: 7 * k, b1: 10 * k, a0: 0.3, a1: 0 }));
			add(particle({ x, y, kind: KIND.RING, cell: S.RING, rot: rand(0, 6.28), life: 0.8, delay: 0.09, r0: 2 * k, r1: 28 * k, b0: 2.5 * k, b1: 1 * k, a0: 0.7, a1: 0, alt: true }));
			add(particle({ x, y, cell: S.DOT, life: 0.22, w0: 12 * k, w1: 2 * k, a0: 0.9, a1: 0, alt: true }));
		},
	},
	magic: {
		label: 'Spells', icon: '✡',
		spawn({ x, y }, { add, k, next }) { SPELLS[next('spell', SPELLS.length)](x, y, add, k); },
	},
	hearts: {
		label: 'Hearts', icon: '♥',
		spawn({ x, y }, { add, k }) {
			for (let i = 0; i < 5; i++) {
				const a = -1.57 + rand(-0.9, 0.9), v = rand(70, 170) * k, springy = (t) => 1 - Math.exp(-8 * t) * Math.cos(10 * t);
				add(particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.5, g: -30 * k, cell: S.HEART, rot: rand(-0.4, 0.4), vr: rand(-1, 1), delay: i * 0.035, life: rand(0.7, 1.05), w0: 2 * k, w1: rand(10, 14) * k, ease: springy, a0: 1, a1: 0, alt: i % 2 === 1 }));
			}
			add(particle({ x, y, kind: KIND.SOFTRING, cell: S.SOFTRING, life: 0.35, r0: 2 * k, r1: 26 * k, b0: 6 * k, b1: 8 * k, a0: 0.5, a1: 0, alt: true }));
		},
	},
	firework: {
		label: 'Firework', icon: '✺',
		spawn({ x, y }, { add, k }) {
			add(particle({ x, y, cell: S.BURST, rot: rand(0, 6.28), life: 0.3, w0: 14 * k, w1: 36 * k, a0: 1, a1: 0, alt: true }));
			const n = 26;
			for (let i = 0; i < n; i++) {
				const a = (i / n) * 6.28 + rand(-0.08, 0.08), v = rand(240, 340) * k, hue = rand(-0.12, 0.12);
				add(particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.6, g: 260 * k, cell: pick([S.STAR, S.STAR6]), rot: rand(0, 6.28), vr: rand(-5, 5), twinkle: 1, hue, life: rand(0.8, 1.25), w0: rand(6, 9) * k, w1: 2 * k, a0: 1.4, alt: i % 3 === 0 }));
			}
		},
	},
};

const TRAILS = {
	comet: {
		label: 'Comet', icon: '☄', every: 2.5,
		head: (k) => particle({ cell: S.GLOW, w0: 9 * k, w1: 9 * k, a0: 0.95, a1: 0.95, vr: 1.2, follow: true, alt: true }),
		step({ x, y }, { add, k }) {
			add(particle({ x, y, cell: S.DOT, life: 0.45, w0: 6.5 * k, w1: 0.5 * k, a0: 0.45, a1: 0, fadeIn: 0 }));
			if (Math.random() < 0.08) add(particle({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-20, 20), cell: S.STAR, twinkle: 1, rot: rand(0, 6.28), life: rand(0.3, 0.6), w0: rand(3, 5) * k, w1: 1 * k, alt: true }));
		},
	},
	dust: {
		label: 'Fairy dust', icon: '✧', every: 9,
		step({ x, y }, { add, k }) {
			const n = Math.random() < 0.5 ? 1 : 2;
			for (let i = 0; i < n; i++) {
				add(particle({ x: x + rand(-5, 5), y: y + rand(-5, 5), vx: rand(-25, 25), vy: rand(-10, 20), drag: 1.5, g: 70 * k, cell: pick([S.STAR, S.STAR6, S.DOT]), rot: rand(0, 6.28), vr: rand(-3, 3), twinkle: 1, life: rand(0.7, 1.3), w0: rand(3, 6) * k, w1: 1 * k, a0: 1.4, a1: 0, alt: Math.random() < 0.4 }));
			}
		},
	},
};

// ---- The renderer ----------------------------------------------------------------------------------------------------------
const VERT = `#version 300 es
in vec2 aQuad;
in vec2 iPos; in vec2 iHalf; in float iRot; in float iCell; in float iKind; in vec2 iRing; in vec4 iCol;
uniform vec2 uView;
out vec2 vUv; out vec2 vRing; out vec4 vCol; flat out float vCell; flat out float vKind;
void main() {
	float c = cos(iRot), s = sin(iRot);
	vec2 q = aQuad * iHalf, w = iPos + vec2(c * q.x - s * q.y, s * q.x + c * q.y);
	vec2 clip = w / uView * 2.0 - 1.0;
	gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
	vUv = aQuad; vRing = iRing; vCol = iCol; vCell = iCell; vKind = iKind;
}`;
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vRing; in vec4 vCol; flat in float vCell; flat in float vKind;
uniform sampler2D uAtlas, uNoise; uniform float uLight;
out vec4 o;
// sprite c at q (its own space, -1 to 1, y down like the screen)
float cell(float c, vec2 q) {
	float inside = step(abs(q.x), 0.999) * step(abs(q.y), 0.999);
	vec2 uv = (vec2(mod(c, ${ATLAS_COLS}.0), floor(c / ${ATLAS_COLS}.0)) + 0.5 + clamp(q, -1.0, 1.0) * 0.49) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
	return texture(uAtlas, uv).r * inside;
}
void main() {
	float v;
	if (vKind < 0.5) v = cell(vCell, vUv);	else {
		// a ring: radius vRing.x and band width vRing.y (in this quad's units); the sprite is read across its band at that width
		// (the sharp ring's band runs 0.55-0.72 of the sprite, the soft one's 0.58-0.9), broken into arcs by the noise
		float r = length(vUv), sharp = step(vKind, 1.5);
		vec2 dir = vUv / max(r, 1e-4);
		float base = mix(0.58, 0.55, sharp), span = mix(0.32, 0.17, sharp);
		v = cell(vCell, dir * clamp(base + (r - vRing.x) / vRing.y * span, 0.0, 0.98));
		float arcs = textureLod(uNoise, vec2(atan(dir.y, dir.x) / 6.2832 * 2.0, 0.37), 0.0).r;
		v *= mix(1.0, smoothstep(0.25, 0.65, arcs) * 1.4, sharp);
	}
	float i = v * vCol.a;
	if (uLight > 0.5) { i = min(i * 1.3, 1.0); o = vec4(vCol.rgb * i, i); return; }   // painted over a light page
	i *= 1.7;   // light on a dark page needs more than paint does
	vec3 c = mix(vCol.rgb, vec3(1.0), smoothstep(0.9, 1.8, i) * 0.6) * i;     // added as light, white-hot at its brightest
	o = vec4(c, min(max(c.r, max(c.g, c.b)), 1.0));
}`;
const FLOATS = 13;   // per particle: x, y, half w, half h, rot, cell, kind, ring radius, ring band, r, g, b, a

class Renderer {
	constructor(canvas) {
		this.canvas = canvas;
		const gl = this.gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
		this.ok = !!gl;
		if (!this.ok) return;
		const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
		const p = this.prog = gl.createProgram();
		gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { this.ok = false; return; }
		this.u = Object.fromEntries(['uView', 'uAtlas', 'uNoise', 'uLight'].map((n) => [n, gl.getUniformLocation(p, n)]));
		this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		const quad = gl.getAttribLocation(p, 'aQuad'); gl.enableVertexAttribArray(quad); gl.vertexAttribPointer(quad, 2, gl.FLOAT, false, 0, 0);
		this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
		this.data = new Float32Array(MAX_PARTICLES * FLOATS);
		gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
		let off = 0;
		for (const [name, n] of [['iPos', 2], ['iHalf', 2], ['iRot', 1], ['iCell', 1], ['iKind', 1], ['iRing', 2], ['iCol', 4]]) {
			const loc = gl.getAttribLocation(p, name);
			gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, FLOATS * 4, off * 4); gl.vertexAttribDivisor(loc, 1);
			off += n;
		}
		gl.bindVertexArray(null);
		const texture = (img, repeat) => {
			const t = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
			const upload = () => {
				gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
			};
			if (img.complete && img.naturalWidth) upload(); else img.addEventListener('load', upload, { once: true });
			return t;
		};
		const imgs = fxImages();
		this.atlas = texture(imgs.atlas, false); this.noise = texture(imgs.noise, true);
	}

	/** Draws `n` particles already written into this.data; `light` paints instead of adding light. */
	draw(n, light) {
		const gl = this.gl, c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
		if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
		gl.viewport(0, 0, w, h);
		gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
		if (!n) return;
		gl.useProgram(this.prog);
		gl.enable(gl.BLEND);
		if (light) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE);
		gl.uniform2f(this.u.uView, innerWidth, innerHeight); gl.uniform1f(this.u.uLight, light ? 1 : 0);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.uniform1i(this.u.uAtlas, 0);
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.noise); gl.uniform1i(this.u.uNoise, 1);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, n * FLOATS);
		gl.bindVertexArray(this.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); gl.bindVertexArray(null);
	}

	destroy() { try { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* ignore */ } }
}

// ---- The plugin ------------------------------------------------------------------------------------------------------------
class Plugin extends AppPlugin {
	cleanup = [];
	parts = [];
	head = null;     // the trail's head (Comet), riding on the pointer
	pointer = null;  // { x, y, t } where the pointer was last seen
	dir = { dx: 0, dy: 0 };
	carry = 0;       // movement not yet spent on trail steps

	onLoad() {
		if (onMobile()) { this.off = true; return; }
		this.readConfig();
		this.dark = isDarkTheme();
		fxImages();   // decode the textures now, not at the first click

		this.ui.addCommandPaletteCommand({ label: 'Cursor FX: choose preset…', icon: 'ti-pointer', onSelected: () => this.dialog() });
		this.ui.addCommandPaletteCommand({ label: 'Cursor FX: next preset', icon: 'ti-color-swatch', onSelected: () => this.choose({ preset: PRESETS[(PRESETS.indexOf(this.preset) + 1) % PRESETS.length].id, on: true }, true) });
		this.ui.addCommandPaletteCommand({ label: 'Cursor FX: turn on or off', icon: 'ti-toggle-right', onSelected: () => this.choose({ on: !this.cfg.on }, true) });

		const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.cleanup.push(() => target.removeEventListener(type, fn, opts)); };
		const cap = { capture: true, passive: true };
		listen(document, 'pointerdown', (e) => { if (e.button === 0 && e.pointerType !== 'touch') this.click(e.clientX, e.clientY); }, cap);
		listen(document, 'pointermove', (e) => { if (e.pointerType !== 'touch') this.move(e.clientX, e.clientY); }, cap);
		listen(document.documentElement, 'pointerleave', () => { this.pointer = null; }, cap);
		listen(window, 'blur', () => { this.pointer = null; });
		const theme = new MutationObserver(() => { this.dark = isDarkTheme(); });
		theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		theme.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.cleanup.push(() => theme.disconnect());
		this.events.on('global-plugin.updated', () => this.readConfig());
	}

	onUnload() {
		if (this.off) return;
		cancelAnimationFrame(this.raf); this.raf = 0;
		this.cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
		this.cleanup = [];
		this.closeDialog();
		this.renderer?.destroy(); this.renderer = null;
		this.canvas?.remove(); this.canvas = null;
	}

	// ---- Settings ----------------------------------------------------------------------------------------------------------

	readConfig() {
		let custom = {};
		try { custom = this.getConfiguration?.()?.custom || {}; } catch (e) { /* defaults */ }
		let mine = {};
		try { mine = JSON.parse(localStorage.getItem(CHOICES_KEY) || '{}') || {}; } catch (e) { /* none */ }
		this.cfg = { ...DEFAULTS, ...custom, ...mine };
		this.applyPreset();
	}

	/** The chosen preset, and its colours as RGB. */
	applyPreset() {
		this.preset = PRESETS.find((p) => p.id === this.cfg.preset) || PRESETS[0];
		this.rgb = hexRgb(this.preset.color); this.accRgb = hexRgb(this.preset.accent);
		this.head = null;   // the trail's head belongs to the preset it was made for
	}

	/** Keeps a choice on this device; `say` shows what it is now. */
	choose(patch, say) {
		try { localStorage.setItem(CHOICES_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(CHOICES_KEY) || '{}'), ...patch })); } catch (e) { /* in memory only */ }
		this.cfg = { ...this.cfg, ...patch };
		this.applyPreset();
		this.refreshDialog?.();
		if (say) this.ui.addToaster({ title: 'Cursor FX', message: this.cfg.on ? `${this.preset.name}: ${this.preset.note}` : 'Off', dismissible: true, autoDestroyTime: 1800 });
	}

	get still() { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }

	// ---- Input -------------------------------------------------------------------------------------------------------------

	click(x, y) {
		const fx = CLICKS[this.preset.click];
		if (!this.cfg.on || this.still || !fx) return;
		fx.spawn({ x, y, ...this.dir }, this.ctx());
		this.wake();
	}

	move(x, y) {
		const now = performance.now(), prev = this.pointer;
		this.pointer = { x, y, t: now };
		if (!prev) return;
		const dx = x - prev.x, dy = y - prev.y, d = Math.hypot(dx, dy);
		if (d > 0.5) this.dir = { dx: dx / d, dy: dy / d };
		const trail = this.cfg.on && !this.still ? TRAILS[this.preset.trail] : null;
		if (!trail || d > 400) return;   // a jump (another window, a new screen) leaves no trail across the gap
		if (trail.head && !this.head) this.head = trail.head(this.preset.size);
		this.carry += d;
		const ctx = this.ctx();
		while (this.carry >= trail.every) {   // steps spaced evenly along the way, however fast it moved
			this.carry -= trail.every;
			const f = 1 - this.carry / Math.max(d, 1e-3);
			trail.step({ x: prev.x + dx * f, y: prev.y + dy * f, ...this.dir }, ctx);
		}
		this.wake();
	}

	ctx() {
		// each particle keeps the colour of the preset it was made by, should the preset change while it lives
		return { k: this.preset.size || 1, next: (key, n) => this.next(key, n), add: (p) => { if (this.parts.length < MAX_PARTICLES) { p.rgb = p.alt ? this.accRgb : this.rgb; this.parts.push(p); } } };
	}

	/** The next of n variants of something (a spell): all of them in a shuffled order, never the same twice running. */
	next(key, n) {
		const bags = this.bags || (this.bags = {}), last = this.lastPick || (this.lastPick = {});
		if (!bags[key] || !bags[key].length) {
			const b = bags[key] = [...Array(n).keys()].sort(() => Math.random() - 0.5);
			if (b[0] === last[key] && n > 1) b.push(b.shift());
		}
		return (last[key] = bags[key].shift());
	}

	// ---- The frame loop ----------------------------------------------------------------------------------------------------

	/** Makes the canvas (the first time) and runs frames until nothing is left alive. */
	wake() {
		if (!this.canvas) {
			const c = this.canvas = document.createElement('canvas');
			c.className = 'cufx-canvas';
			document.body.appendChild(c);
			this.renderer = new Renderer(c);
			if (!this.renderer.ok) { this.cfg.on = false; return; }
		}
		if (this.raf) return;
		this.last = performance.now();
		const frame = (now) => {
			const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));   // a frame's time can be a hair before wake()'s
			this.last = now;
			const n = this.step(dt, now);
			this.renderer.draw(n, !this.dark);
			this.raf = n ? requestAnimationFrame(frame) : 0;   // nothing alive: stop until the next click or move
		};
		this.raf = requestAnimationFrame(frame);
	}

	/** Moves everything by dt, drops what has died, writes what is left into the renderer's buffer; returns how many. */
	step(dt, now) {
		const out = this.renderer.data, light = !this.dark;
		const main = light ? darken(this.rgb) : this.rgb, accent = light ? darken(this.accRgb) : this.accRgb;
		let n = 0;
		const put = (p, x, y, hw, hh, rot, cell, a, rgb, ringR, ringB) => {
			const o = n * FLOATS;
			out[o] = x; out[o + 1] = y; out[o + 2] = hw; out[o + 3] = hh; out[o + 4] = rot; out[o + 5] = cell; out[o + 6] = p.kind;
			out[o + 7] = ringR; out[o + 8] = ringB; out[o + 9] = rgb[0]; out[o + 10] = rgb[1]; out[o + 11] = rgb[2]; out[o + 12] = a;
			n++;
		};
		const live = [];
		for (const p of this.parts) {
			if (p.delay > 0) { p.delay -= dt; live.push(p); continue; }
			p.t += dt;
			if (p.t >= p.life) continue;
			live.push(p);
			const f = p.t / p.life, e = p.ease(f);
			p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt); p.vy += p.g * dt;
			p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
			let a = (p.a0 + (p.a1 - p.a0) * f) * Math.min(1, p.fadeIn ? p.t / p.fadeIn : 1);
			if (p.twinkle) a *= 0.55 + 0.45 * Math.sin(p.t * 26 + p.x * 0.7);
			const hw = p.w0 + (p.w1 - p.w0) * e;
			const hh = p.h0 == null ? hw : p.h0 + (p.h1 - p.h0) * e;
			let rgb = light ? (p.drk || (p.drk = darken(p.rgb))) : p.rgb;
			if (p.hue) rgb = rgb.map((v, i) => Math.min(1, v * (1 + p.hue * (i - 1))));   // fireworks: a little hue spread
			if (p.kind === KIND.RING || p.kind === KIND.SOFTRING) {   // rings: the quad holds the ring and its band
				const r = p.r0 + (p.r1 - p.r0) * e, b = p.b0 + (p.b1 - p.b0) * e, half = r + b * 2 + 2;
				put(p, p.x, p.y, half, half, p.rot, p.cell, a, rgb, r / half, b / half);
			} else put(p, p.x, p.y, hw, hh, p.rot, p.cell, a, rgb, 0, 0);
			if (n >= MAX_PARTICLES) break;
		}
		this.parts = live;
		// the trail's head rides on the pointer, and fades once it stops
		if (this.head && this.pointer && n < MAX_PARTICLES) {
			const h = this.head, idle = (now - this.pointer.t) / 1000, a = h.a0 * Math.max(0, 1 - Math.max(0, idle - 0.12) / 0.35);
			h.rot += h.vr * dt;
			if (a > 0.01) put(h, this.pointer.x, this.pointer.y, h.w0, h.w0, h.rot, h.cell, a * (0.85 + 0.15 * Math.sin(now / 90)), h.alt ? accent : main, 0, 0);
		}
		return n;
	}

	// ---- The settings dialog -----------------------------------------------------------------------------------------------

	closeDialog() {
		if (this.dlgKey) document.removeEventListener('keydown', this.dlgKey, true);
		this.dlgKey = null; this.refreshDialog = null;
		this.dlg?.remove(); this.dlg = null;
	}

	/** The presets as cards. Picking one plays its click effect there and then (clicking is the preview); moving shows its trail. */
	dialog() {
		this.closeDialog();
		const cs = getComputedStyle(document.body);
		const ov = this.dlg = document.createElement('div');
		ov.className = 'cufx-ov';
		ov.innerHTML = `<div class="cufx-box"><div class="cufx-head"><div class="cufx-title">Cursor FX</div><button class="cufx-x" aria-label="Close">✕</button></div>
			<button class="cufx-opt cufx-on" role="switch"><span>Effects on</span><span class="cufx-sw"></span></button>
			<div class="cufx-presets"></div>
			<div class="cufx-note">Pick one to try it, then move the pointer.</div></div>`;
		const box = ov.querySelector('.cufx-box');
		box.style.color = cs.color;
		box.style.background = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'Canvas';
		const list = ov.querySelector('.cufx-presets');
		for (const p of PRESETS) {
			const b = document.createElement('button');
			b.className = 'cufx-preset'; b.dataset.v = p.id;
			b.style.setProperty('--pc', p.color); b.style.setProperty('--pa', p.accent);
			b.innerHTML = '<i></i><span><b></b><small></small></span><em></em>';
			b.querySelector('b').textContent = p.name;
			b.querySelector('small').textContent = p.note;
			b.querySelector('em').textContent = CLICKS[p.click].icon + (TRAILS[p.trail] ? ' ' + TRAILS[p.trail].icon : '');
			b.onclick = () => this.choose({ preset: p.id, on: true });
			list.appendChild(b);
		}
		ov.querySelector('.cufx-on').onclick = () => this.choose({ on: !this.cfg.on });
		ov.querySelector('.cufx-x').onclick = () => this.closeDialog();
		ov.addEventListener('mousedown', (e) => { if (e.target === ov) this.closeDialog(); });
		this.dlgKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.closeDialog(); } };
		document.addEventListener('keydown', this.dlgKey, true);
		this.refreshDialog = () => {
			ov.querySelector('.cufx-on').setAttribute('aria-checked', String(!!this.cfg.on));
			ov.querySelectorAll('.cufx-preset').forEach((b) => b.classList.toggle('on', b.dataset.v === this.preset.id));
			box.style.setProperty('--c', this.preset.color);
		};
		this.refreshDialog();
		document.body.appendChild(ov);
	}
}
