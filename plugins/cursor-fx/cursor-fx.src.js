/**
 * Cursor FX
 *
 * Effects for the mouse: something happens where you click (a ripple, a spark burst, a magic circle, electricity, hearts, a
 * slash, a firework, a puff of smoke, or a random one of them each time), and the pointer can leave a trail as it moves (a
 * comet, fairy dust, or flame). Everything is drawn from small grayscale textures (see fx/LICENSE.md), tinted with the chosen
 * colour.
 *
 * How: one transparent WebGL canvas over the whole window, which clicks pass through. Each particle is a textured quad with its
 * own position, speed, size, rotation, life and sprite; all of them are drawn in one instanced draw call. The canvas draws only
 * while something is alive, so standing still costs nothing. On a dark theme the light adds up (additive blending); on a light
 * theme the colour is darkened and painted over, so it stays visible.
 *
 * Off on phones and tablets (no mouse there) and with reduced motion. The choices made in "Cursor FX: settings…" are kept per
 * device in localStorage and laid over the defaults in this plugin's configuration (Edit Code > Configuration, "custom").
 *
 * The textures are baked into this file at build time (see build.mjs).
 */

const FX = __FX__;   // { atlas, noise } as data URLs
let fxImgs = null;
/** The textures as images, decoded once and kept, so they are ready by the first click. */
const fxImages = () => fxImgs || (fxImgs = Object.fromEntries(Object.entries(FX).map(([k, src]) => { const i = new Image(); i.src = src; return [k, i]; })));

// The atlas: 6 x 4 cells of 128px (fx/LICENSE.md lists the sprites in this order).
const ATLAS_COLS = 6, ATLAS_ROWS = 4;
const S = {
	ZAP: 0, BOLT: 4, RING: 5, SOFTRING: 6, STAR: 7, STREAK: 8, GLOW: 9, STAR6: 10, RUNE: 11, RUNE7: 12, TWIRL: 13, DOT: 14,
	HEART: 15, CRESCENT: 16, SCRATCH: 17, SMOKE: 18, FLAME: 19, FLAME_TALL: 20, WISP: 21, STAR5: 22, BURST: 23,
};
const KIND = { SPRITE: 0, RING: 1, SOFTRING: 2, ARC: 3 };   // rings and arcs are read across a ring sprite's band (see the shader)

const DEFAULTS = { on: true, click: 'ripple', trail: 'comet', color: '#5fd8ff', size: 1 };
const CHOICES_KEY = 'cursorfx.choices';
const COLORS = [['Ice', '#5fd8ff'], ['Gold', '#ffc94a'], ['Violet', '#b98cff'], ['Emerald', '#5ee6a0'], ['Rose', '#ff7ab6'], ['Ember', '#ff8a3d'], ['White', '#f4f6ff']];
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
// w/h and alpha from start to end), and its sprite. Optional: frames (cells it flicks through at fps), align (turns along its
// flight; for streaks, which stretch with speed), twinkle, delay, follow (stays on the pointer), and for rings their radius
// and band width from start to end. An arc (a blade's swing) also has its span (radians), how long its tip takes to sweep it,
// and when its tail starts to follow.
function particle(o) {
	return {
		x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 1, t: 0, delay: 0, rot: 0, vr: 0, cell: S.DOT, kind: KIND.SPRITE,
		w0: 8, w1: 8, h0: null, h1: null, a0: 1, a1: 0, fadeIn: 0.06, ease: easeOut, twinkle: 0, stretch: 0, tint: 1, ...o,
	};
}

// ---- The effects -----------------------------------------------------------------------------------------------------------
// A click effect is spawn(at, ctx): at = { x, y, dx, dy } (the pointer's recent direction), ctx = { add(p), k } (k: the size
// setting). A trail is step(at, ctx), called for each stretch of movement, spaced by its own `every` px.
const CLICKS = {
	ripple: {
		label: 'Ripple', icon: '◎',
		spawn({ x, y }, { add, k }) {
			add(particle({ x, y, kind: KIND.RING, cell: S.RING, rot: rand(0, 6.28), life: 0.65, r0: 4 * k, r1: 46 * k, b0: 4 * k, b1: 1.6 * k, a0: 1, a1: 0 }));
			add(particle({ x, y, kind: KIND.SOFTRING, cell: S.SOFTRING, rot: rand(0, 6.28), life: 0.45, r0: 2 * k, r1: 60 * k, b0: 7 * k, b1: 10 * k, a0: 0.3, a1: 0 }));
			add(particle({ x, y, kind: KIND.RING, cell: S.RING, rot: rand(0, 6.28), life: 0.8, delay: 0.09, r0: 2 * k, r1: 28 * k, b0: 2.5 * k, b1: 1 * k, a0: 0.7, a1: 0 }));
			add(particle({ x, y, cell: S.DOT, life: 0.22, w0: 12 * k, w1: 2 * k, a0: 0.9, a1: 0 }));
		},
	},
	sparks: {
		label: 'Spark burst', icon: '✦',
		spawn({ x, y }, { add, k }) {
			add(particle({ x, y, cell: S.GLOW, life: 0.28, w0: 30 * k, w1: 6 * k, rot: rand(0, 6.28), a0: 1, a1: 0 }));
			for (let i = 0; i < 16; i++) {
				const a = rand(0, 6.28), v = rand(260, 700) * k;
				add(particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 5, g: 420 * k, cell: S.STREAK, align: true, stretch: 0.045, life: rand(0.35, 0.7), w0: 3.2 * k, w1: 1.4 * k, h0: 8 * k, h1: 3 * k, a0: 1.4, a1: 0 }));
			}
			for (let i = 0; i < 7; i++) {
				const a = rand(0, 6.28), v = rand(80, 240) * k;
				add(particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3, g: 160 * k, cell: S.STAR, rot: rand(0, 6.28), vr: rand(-4, 4), twinkle: 1, life: rand(0.5, 0.9), w0: rand(5, 9) * k, w1: 2 * k }));
			}
		},
	},
	magic: {
		label: 'Magic circle', icon: '✡',
		spawn({ x, y }, { add, k }) {
			const springy = (t) => 1 - Math.exp(-7 * t) * Math.cos(9 * t);   // grows past its size and settles
			add(particle({ x, y, cell: pick([S.RUNE, S.RUNE7]), rot: rand(0, 6.28), vr: 2.2, life: 1.0, w0: 4 * k, w1: 34 * k, ease: springy, a0: 1, a1: 0, fadeIn: 0.05 }));
			add(particle({ x, y, cell: S.TWIRL, rot: rand(0, 6.28), vr: -6, life: 0.7, w0: 10 * k, w1: 30 * k, a0: 0.8, a1: 0 }));
			add(particle({ x, y, cell: S.GLOW, life: 0.45, w0: 18 * k, w1: 4 * k, rot: rand(0, 6.28), vr: 1.5, a0: 1, a1: 0 }));
			for (let i = 0; i < 8; i++) {
				const a = (i / 8) * 6.28 + rand(-0.2, 0.2);
				add(particle({ x: x + Math.cos(a) * 22 * k, y: y + Math.sin(a) * 22 * k, vx: Math.cos(a) * 20 * k, vy: -rand(30, 70) * k, cell: S.STAR, twinkle: 1, rot: rand(0, 6.28), vr: rand(-3, 3), delay: rand(0.05, 0.3), life: rand(0.6, 1.0), w0: rand(4, 7) * k, w1: 1.5 * k }));
			}
		},
	},
	zap: {
		label: 'Electric zap', icon: 'ϟ',
		spawn({ x, y }, { add, k }) {
			add(particle({ x, y, cell: S.ZAP, frames: [S.ZAP, S.ZAP + 1, S.ZAP + 2, S.ZAP + 3], fps: 22, jitter: true, life: 0.42, w0: 26 * k, w1: 36 * k, a0: 1.2, a1: 0, fadeIn: 0.02 }));
			add(particle({ x, y, cell: S.DOT, life: 0.18, w0: 16 * k, w1: 4 * k, a0: 1, a1: 0, fadeIn: 0.01 }));
			const n = 5;
			for (let i = 0; i < n; i++) {   // bolts shooting out, pointing away from the click
				const a = (i / n) * 6.28 + rand(-0.4, 0.4), len = rand(16, 26) * k;
				add(particle({ x: x + Math.cos(a) * len, y: y + Math.sin(a) * len, cell: S.BOLT, rot: Math.atan2(-Math.cos(a), Math.sin(a)), delay: rand(0, 0.12), life: rand(0.1, 0.2), w0: 5 * k, w1: 4 * k, h0: len, h1: len * 1.2, a0: 1.3, a1: 0.2, fadeIn: 0.01 }));
			}
		},
	},
	hearts: {
		label: 'Hearts', icon: '♥',
		spawn({ x, y }, { add, k }) {
			for (let i = 0; i < 5; i++) {
				const a = -1.57 + rand(-0.9, 0.9), v = rand(70, 170) * k, springy = (t) => 1 - Math.exp(-8 * t) * Math.cos(10 * t);
				add(particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.5, g: -30 * k, cell: S.HEART, rot: rand(-0.4, 0.4), vr: rand(-1, 1), delay: i * 0.035, life: rand(0.7, 1.05), w0: 2 * k, w1: rand(10, 14) * k, ease: springy, a0: 1, a1: 0 }));
			}
			add(particle({ x, y, kind: KIND.SOFTRING, cell: S.SOFTRING, life: 0.35, r0: 2 * k, r1: 26 * k, b0: 6 * k, b1: 8 * k, a0: 0.5, a1: 0 }));
		},
	},
	slash: {
		label: 'Slash', icon: '⟋',
		spawn({ x, y, dx, dy }, { add, k }) {
			// A blade's swing across the way the pointer was going: the arc's middle passes through the click, and its tip sweeps
			// along the movement. ψ is the angle (from the arc's centre) of that middle; screen y is down, so the sweep turns with ψ.
			if (Math.hypot(dx, dy) < 0.5) { const a = rand(0, 6.28); dx = Math.cos(a); dy = Math.sin(a); }
			const swing = (r, band, span, delay, a0, tilt) => {
				const psi = Math.atan2(-dx, dy) + tilt;
				add(particle({ x: x - Math.cos(psi) * r, y: y - Math.sin(psi) * r, kind: KIND.ARC, cell: S.RING, rot: psi - span / 2, span, sweep: 0.09, tailAt: 0.12, delay, life: 0.34, r0: r, r1: r * 1.08, b0: band, b1: band * 0.6, a0, a1: 0.6, fadeIn: 0 }));
			};
			swing(36 * k, 8 * k, 2.3, 0, 1.5, rand(-0.2, 0.2));
			swing(25 * k, 4.5 * k, 2.0, 0.05, 1.0, rand(0.2, 0.45));   // an echo, a moment later
			const along = Math.atan2(-dx, dy);   // a thin flash along the cut
			add(particle({ x, y, cell: S.STREAK, rot: along, life: 0.16, w0: 2.2 * k, w1: 0.6 * k, h0: 40 * k, h1: 58 * k, a0: 1.6, a1: 0, fadeIn: 0.01 }));
			add(particle({ x, y, cell: S.STAR, rot: along, life: 0.2, w0: 11 * k, w1: 2 * k, a0: 1.2, a1: 0, fadeIn: 0.01 }));
			for (let i = 0; i < 7; i++) {
				const b = Math.atan2(dy, dx) + rand(-0.35, 0.35), v = rand(250, 560) * k;
				add(particle({ x, y, vx: Math.cos(b) * v, vy: Math.sin(b) * v, drag: 6, cell: S.STREAK, align: true, stretch: 0.04, delay: rand(0.02, 0.08), life: rand(0.18, 0.35), w0: 2.4 * k, w1: 0.8 * k, h0: 7 * k, h1: 2 * k, a0: 1.3 }));
			}
		},
	},
	firework: {
		label: 'Firework', icon: '✺',
		spawn({ x, y }, { add, k }) {
			add(particle({ x, y, cell: S.BURST, rot: rand(0, 6.28), life: 0.3, w0: 14 * k, w1: 36 * k, a0: 1, a1: 0 }));
			const n = 26;
			for (let i = 0; i < n; i++) {
				const a = (i / n) * 6.28 + rand(-0.08, 0.08), v = rand(240, 340) * k, hue = rand(-0.25, 0.25);
				add(particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.6, g: 260 * k, cell: pick([S.STAR, S.STAR6]), rot: rand(0, 6.28), vr: rand(-5, 5), twinkle: 1, hue, life: rand(0.8, 1.25), w0: rand(6, 9) * k, w1: 2 * k, a0: 1.4 }));
			}
		},
	},
	puff: {
		label: 'Smoke puff', icon: '☁',
		spawn({ x, y }, { add, k }) {
			for (let i = 0; i < 6; i++) {
				const a = rand(0, 6.28), v = rand(20, 70) * k;
				add(particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25 * k, drag: 2, cell: S.SMOKE, rot: rand(0, 6.28), vr: rand(-1.5, 1.5), life: rand(0.6, 0.95), w0: 6 * k, w1: rand(18, 26) * k, a0: 0.55, a1: 0, fadeIn: 0.1 }));
			}
			add(particle({ x, y, cell: S.DOT, life: 0.2, w0: 10 * k, w1: 3 * k, a0: 0.7, a1: 0 }));
		},
	},
};
const CLICK_IDS = Object.keys(CLICKS);

const TRAILS = {
	comet: {
		label: 'Comet', icon: '☄', every: 2.5,
		head: (k) => particle({ cell: S.GLOW, w0: 9 * k, w1: 9 * k, a0: 0.95, a1: 0.95, vr: 1.2, follow: true }),
		step({ x, y }, { add, k }) {
			add(particle({ x, y, cell: S.DOT, life: 0.45, w0: 6.5 * k, w1: 0.5 * k, a0: 0.45, a1: 0, fadeIn: 0 }));
			if (Math.random() < 0.08) add(particle({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-20, 20), cell: S.STAR, twinkle: 1, rot: rand(0, 6.28), life: rand(0.3, 0.6), w0: rand(3, 5) * k, w1: 1 * k }));
		},
	},
	dust: {
		label: 'Fairy dust', icon: '✧', every: 9,
		step({ x, y }, { add, k }) {
			const n = Math.random() < 0.5 ? 1 : 2;
			for (let i = 0; i < n; i++) {
				add(particle({ x: x + rand(-5, 5), y: y + rand(-5, 5), vx: rand(-25, 25), vy: rand(-10, 20), drag: 1.5, g: 70 * k, cell: pick([S.STAR, S.STAR6, S.DOT]), rot: rand(0, 6.28), vr: rand(-3, 3), twinkle: 1, life: rand(0.7, 1.3), w0: rand(3, 6) * k, w1: 1 * k, a0: 1.4, a1: 0 }));
			}
		},
	},
	flame: {
		label: 'Flame', icon: '🔥', every: 7,
		step({ x, y }, { add, k }) {
			add(particle({ x: x + rand(-3, 3), y, vx: rand(-15, 15), vy: rand(-90, -50) * k, drag: 1, cell: pick([S.FLAME, S.FLAME_TALL, S.WISP]), rot: rand(-0.25, 0.25), life: rand(0.35, 0.55), w0: rand(6, 9) * k, w1: 2 * k, h0: rand(9, 13) * k, h1: 6 * k, a0: 0.9, a1: 0, fadeIn: 0.05, ease: (t) => t }));
			if (Math.random() < 0.3) add(particle({ x: x + rand(-4, 4), y, vx: rand(-20, 20), vy: rand(-140, -80) * k, cell: S.DOT, life: rand(0.4, 0.7), w0: 1.6 * k, w1: 0.4 * k, a0: 1, a1: 0, twinkle: 1, tint: 1.2 }));
		},
	},
};
const TRAIL_IDS = Object.keys(TRAILS);

// ---- The renderer ----------------------------------------------------------------------------------------------------------
const VERT = `#version 300 es
in vec2 aQuad;
in vec2 iPos; in vec2 iHalf; in float iRot; in float iCell; in float iKind; in vec2 iRing; in vec3 iArc; in vec4 iCol;
uniform vec2 uView;
out vec2 vUv; out vec2 vRing; out vec3 vArc; out vec4 vCol; flat out float vCell; flat out float vKind;
void main() {
	float c = cos(iRot), s = sin(iRot);
	vec2 q = aQuad * iHalf, w = iPos + vec2(c * q.x - s * q.y, s * q.x + c * q.y);
	vec2 clip = w / uView * 2.0 - 1.0;
	gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
	vUv = aQuad; vRing = iRing; vArc = iArc; vCol = iCol; vCell = iCell; vKind = iKind;
}`;
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vRing; in vec3 vArc; in vec4 vCol; flat in float vCell; flat in float vKind;
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
	if (vKind < 0.5) v = cell(vCell, vUv);
	else if (vKind > 2.5) {
		// a blade's swing: an arc of radius vRing.x over the angles 0 to vArc.z, lit from its tail vArc.y to its tip vArc.x,
		// brightest at the tip; thickest in the middle and pointed at the ends; read across the sharp ring's band from the
		// outside in, so the outer edge is a clean cut and the light fades inward
		float r = length(vUv), a = mod(atan(vUv.y, vUv.x), 6.2832), span = vArc.z;
		vec2 dir = vUv / max(r, 1e-4);
		float band = vRing.y * (0.12 + 0.88 * sin(3.1416 * clamp(a / span, 0.0, 1.0)));
		float lit = step(vArc.y, a) * step(a, vArc.x) * pow(clamp((a - vArc.y) / max(vArc.x - vArc.y, 1e-3), 0.0, 1.0), 1.3);
		v = cell(vCell, dir * clamp(0.55 + (vRing.x - r) / max(band, 1e-4) * 0.17, 0.0, 0.98)) * lit * step(r, vRing.x + 0.02);
	} else {
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
const FLOATS = 16;   // per particle: x, y, half w, half h, rot, cell, kind, ring radius, ring band, arc tip, tail, span, r, g, b, a

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
		for (const [name, n] of [['iPos', 2], ['iHalf', 2], ['iRot', 1], ['iCell', 1], ['iKind', 1], ['iRing', 2], ['iArc', 3], ['iCol', 4]]) {
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

		this.ui.addCommandPaletteCommand({ label: 'Cursor FX: settings…', icon: 'ti-pointer', onSelected: () => this.dialog() });
		this.ui.addCommandPaletteCommand({ label: 'Cursor FX: next click effect', icon: 'ti-click', onSelected: () => this.choose({ click: CLICK_IDS.concat('random')[(CLICK_IDS.concat('random').indexOf(this.cfg.click) + 1) % (CLICK_IDS.length + 1)] }, true) });
		this.ui.addCommandPaletteCommand({ label: 'Cursor FX: next trail', icon: 'ti-route', onSelected: () => this.choose({ trail: TRAIL_IDS.concat('none')[(TRAIL_IDS.concat('none').indexOf(this.cfg.trail) + 1) % (TRAIL_IDS.length + 1)] }, true) });
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
		this.rgb = hexRgb(this.cfg.color);
	}

	/** Keeps a choice on this device; `say` shows what it is now. */
	choose(patch, say) {
		try { localStorage.setItem(CHOICES_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(CHOICES_KEY) || '{}'), ...patch })); } catch (e) { /* in memory only */ }
		this.cfg = { ...this.cfg, ...patch };
		this.rgb = hexRgb(this.cfg.color);
		if (!this.cfg.on || this.cfg.trail === 'none') this.head = null;
		this.refreshDialog?.();
		if (say) {
			const what = !this.cfg.on ? 'Off' : `Click: ${this.cfg.click === 'random' ? 'Random' : CLICKS[this.cfg.click]?.label || 'None'} · Trail: ${TRAILS[this.cfg.trail]?.label || 'None'}`;
			this.ui.addToaster({ title: 'Cursor FX', message: what, dismissible: true, autoDestroyTime: 1600 });
		}
	}

	get still() { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }

	// ---- Input -------------------------------------------------------------------------------------------------------------

	click(x, y) {
		if (!this.cfg.on || this.still || this.cfg.click === 'none') return;
		const id = this.cfg.click === 'random' ? pick(CLICK_IDS) : this.cfg.click, fx = CLICKS[id];
		if (!fx) return;
		fx.spawn({ x, y, ...this.dir }, this.ctx());
		this.wake();
	}

	move(x, y) {
		const now = performance.now(), prev = this.pointer;
		this.pointer = { x, y, t: now };
		if (!prev) return;
		const dx = x - prev.x, dy = y - prev.y, d = Math.hypot(dx, dy);
		if (d > 0.5) this.dir = { dx: dx / d, dy: dy / d };
		const trail = this.cfg.on && !this.still ? TRAILS[this.cfg.trail] : null;
		if (!trail || d > 400) return;   // a jump (another window, a new screen) leaves no trail across the gap
		if (trail.head && !this.head) this.head = trail.head(this.cfg.size);
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
		return { k: this.cfg.size || 1, add: (p) => { if (this.parts.length < MAX_PARTICLES) this.parts.push(p); } };
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
			const dt = Math.min(0.05, (now - this.last) / 1000);
			this.last = now;
			const n = this.step(dt, now);
			this.renderer.draw(n, !this.dark);
			this.raf = n ? requestAnimationFrame(frame) : 0;   // nothing alive: stop until the next click or move
		};
		this.raf = requestAnimationFrame(frame);
	}

	/** Moves everything by dt, drops what has died, writes what is left into the renderer's buffer; returns how many. */
	step(dt, now) {
		const out = this.renderer.data, base = this.rgb, light = !this.dark;
		const col = light ? darken(base) : base;
		let n = 0;
		const put = (p, x, y, hw, hh, rot, cell, a, rgb, ringR, ringB, arc) => {
			const o = n * FLOATS;
			out[o] = x; out[o + 1] = y; out[o + 2] = hw; out[o + 3] = hh; out[o + 4] = rot; out[o + 5] = cell; out[o + 6] = p.kind;
			out[o + 7] = ringR; out[o + 8] = ringB; out[o + 9] = arc ? arc[0] : 0; out[o + 10] = arc ? arc[1] : 0; out[o + 11] = arc ? arc[2] : 0;
			out[o + 12] = rgb[0]; out[o + 13] = rgb[1]; out[o + 14] = rgb[2]; out[o + 15] = a;
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
			let hh = p.h0 == null ? hw : p.h0 + (p.h1 - p.h0) * e, rot = p.rot;
			if (p.align) { rot = Math.atan2(-p.vx, p.vy); hh *= 1 + Math.hypot(p.vx, p.vy) * p.stretch * 0.1; }
			let cell = p.cell;
			if (p.frames) { const i = Math.floor(p.t * p.fps); cell = p.frames[i % p.frames.length]; if (p.jitter) rot = i * 2.4; }
			let rgb = col;
			if (p.hue) rgb = col.map((v, i) => Math.min(1, v * (1 + p.hue * (i - 1))));   // fireworks: a little hue spread
			if (p.tint !== 1) rgb = rgb.map((v) => Math.min(1, v * p.tint));
			if (p.kind === KIND.ARC) {   // the tip sweeps the span, then the tail follows it in
				const r = p.r0 + (p.r1 - p.r0) * e, b = p.b0 + (p.b1 - p.b0) * e, half = r + 4;
				const tip = easeOut(Math.min(1, p.t / p.sweep)) * p.span, tail = easeOut(Math.max(0, (p.t - p.tailAt) / (p.life - p.tailAt))) * p.span;
				put(p, p.x, p.y, half, half, rot, cell, a, rgb, r / half, b / half, [tip, tail, p.span]);
			} else if (p.kind !== KIND.SPRITE) {   // rings: the quad holds the ring and its band
				const r = p.r0 + (p.r1 - p.r0) * e, b = p.b0 + (p.b1 - p.b0) * e, half = r + b * 2 + 2;
				put(p, p.x, p.y, half, half, rot, cell, a, rgb, r / half, b / half);
			} else put(p, p.x, p.y, hw, hh, rot, cell, a, rgb, 0, 0);
			if (n >= MAX_PARTICLES) break;
		}
		this.parts = live;
		// the trail's head rides on the pointer, and fades once it stops
		if (this.head && this.pointer && n < MAX_PARTICLES) {
			const h = this.head, idle = (now - this.pointer.t) / 1000, a = h.a0 * Math.max(0, 1 - Math.max(0, idle - 0.12) / 0.35);
			h.rot += h.vr * dt;
			if (a > 0.01) put(h, this.pointer.x, this.pointer.y, h.w0, h.w0, h.rot, h.cell, a * (0.85 + 0.15 * Math.sin(now / 90)), col, 0, 0);
		}
		return n;
	}

	// ---- The settings dialog -----------------------------------------------------------------------------------------------

	closeDialog() {
		if (this.dlgKey) document.removeEventListener('keydown', this.dlgKey, true);
		this.dlgKey = null; this.refreshDialog = null;
		this.dlg?.remove(); this.dlg = null;
	}

	/** Pick a click effect, a trail and a colour. Picking one plays it there and then (clicking is the preview). */
	dialog() {
		this.closeDialog();
		const cs = getComputedStyle(document.body);
		const ov = this.dlg = document.createElement('div');
		ov.className = 'cufx-ov';
		ov.innerHTML = `<div class="cufx-box"><div class="cufx-head"><div class="cufx-title">Cursor FX</div><button class="cufx-x" aria-label="Close">✕</button></div>
			<button class="cufx-opt cufx-on" role="switch"><span>Effects on</span><span class="cufx-sw"></span></button>
			<div class="cufx-label">Click</div><div class="cufx-grid" data-k="click"></div>
			<div class="cufx-label">Trail</div><div class="cufx-grid" data-k="trail"></div>
			<div class="cufx-label">Colour</div><div class="cufx-colors"></div>
			<div class="cufx-label">Size</div><div class="cufx-grid cufx-sizes" data-k="size"></div>
			<div class="cufx-note">Click anywhere in here to try it.</div></div>`;
		const box = ov.querySelector('.cufx-box');
		box.style.color = cs.color;
		box.style.background = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'Canvas';
		const fill = (k, items) => {
			const grid = ov.querySelector(`[data-k="${k}"]`);
			for (const [id, icon, label] of items) {
				const b = document.createElement('button');
				b.className = 'cufx-pick'; b.dataset.v = id;
				b.innerHTML = '<i></i><span></span>'; b.firstChild.textContent = icon; b.lastChild.textContent = label;
				b.onclick = () => this.choose({ [k]: k === 'size' ? Number(id) : id });
				grid.appendChild(b);
			}
		};
		fill('click', [...CLICK_IDS.map((id) => [id, CLICKS[id].icon, CLICKS[id].label]), ['random', '⚄', 'Random'], ['none', '∅', 'None']]);
		fill('trail', [...TRAIL_IDS.map((id) => [id, TRAILS[id].icon, TRAILS[id].label]), ['none', '∅', 'None']]);
		fill('size', [['0.75', 'S', 'Small'], ['1', 'M', 'Medium'], ['1.4', 'L', 'Large']]);
		const colors = ov.querySelector('.cufx-colors');
		for (const [name, hex] of COLORS) {
			const b = document.createElement('button');
			b.className = 'cufx-color'; b.title = name; b.dataset.v = hex; b.style.background = hex;
			b.onclick = () => this.choose({ color: hex });
			colors.appendChild(b);
		}
		ov.querySelector('.cufx-on').onclick = () => this.choose({ on: !this.cfg.on });
		ov.querySelector('.cufx-x').onclick = () => this.closeDialog();
		ov.addEventListener('mousedown', (e) => { if (e.target === ov) this.closeDialog(); });
		this.dlgKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.closeDialog(); } };
		document.addEventListener('keydown', this.dlgKey, true);
		this.refreshDialog = () => {
			ov.querySelector('.cufx-on').setAttribute('aria-checked', String(!!this.cfg.on));
			for (const k of ['click', 'trail', 'size']) ov.querySelectorAll(`[data-k="${k}"] .cufx-pick`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(this.cfg[k])));
			ov.querySelectorAll('.cufx-color').forEach((b) => b.classList.toggle('on', b.dataset.v === this.cfg.color));
			box.style.setProperty('--c', this.cfg.color);
		};
		this.refreshDialog();
		document.body.appendChild(ov);
	}
}
