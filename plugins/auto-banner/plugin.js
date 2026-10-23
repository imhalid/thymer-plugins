/**
 * Auto Banner
 *
 * A page without a banner of its own gets a picture drawn at the top, in the banner's place, from its title: a canvas the
 * plugin draws each time the page is shown. Nothing is generated into the workspace: no image is uploaded, the page is not
 * changed, and turning the plugin off leaves every page as it was. The title is the seed: what is drawn and in which
 * colours is left to chance, but the same title always gives the same picture.
 *
 * The scenes: layered mountains, rolling hills, the sea with a sun on the water, dunes, a forest in fog, a skyline, a
 * synthwave grid, a contour map, an aurora over mountains, and a planet in space; each in one of twelve palettes (dusk,
 * dawn, day, meadow, desert, night, ice, ember, teal, synth, autumn, lavender). They are drawn in a fine ordered dither (Bayer 8x8, a dot to a CSS pixel, ten shades a channel) or smooth with a
 * little grain. Sizes and frequencies go by the strip's height, so a wide panel shows more of the land, not a stretched one.
 *
 * A page with a banner (its own or its collection's) shows that, as before. The strip takes a banner's height while it
 * shows a picture. The picture follows the title (once it has stayed the same for a moment) and the panel's width; pictures
 * drawn before are kept for the session, so going back to a page shows its picture at once.
 *
 * Commands:
 *   - Auto Banner: another picture for this page (another seed; kept on this device)
 *   - Auto Banner: back to this page's own picture
 *   - Auto Banner: switch between dither and smooth
 *   - Auto Banner: turn on or off (on this device)
 *
 * Configuration (`custom`, all optional): "exclude": ["Journal", ...] collection names to skip; "style": "dither"|"smooth"
 * (the command's choice, kept per device, wins).
 */

const STYLE_KEY = 'autobanner:style';
const VARIANT_KEY = 'autobanner:variants';   // { record guid: variant } for pages given another picture
const OFF_KEY = 'autobanner:off';
const ASPECT = 3;          // the scenes' frequencies are set for a strip this many heights wide
const DOT = 1;             // CSS pixels to a dither dot
const LEVELS = 10;         // shades per colour channel in the dither
const SETTLE_MS = 700;     // a title has to stay the same this long before the picture follows it
const CACHE_MAX = 40;

// ---------------------------------------------------------------------------------------------------------- randomness

const fnv = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry = (seed) => () => {
	seed = (seed + 0x6D2B79F5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function makeNoise(rand) {
	const T = new Float32Array(512), P = new Uint8Array(512);
	for (let i = 0; i < 256; i++) { T[i] = rand(); P[i] = i; }
	for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [P[i], P[j]] = [P[j], P[i]]; }
	for (let i = 0; i < 256; i++) { T[i + 256] = T[i]; P[i + 256] = P[i]; }
	const s = (t) => t * t * (3 - 2 * t);
	const n1 = (x) => { const i = Math.floor(x), f = s(x - i); return T[i & 255] + (T[(i + 1) & 255] - T[i & 255]) * f; };
	const h2 = (i, j) => T[(P[i & 255] + j) & 255];
	const n2 = (x, y) => {
		const i = Math.floor(x), j = Math.floor(y), u = s(x - i), v = s(y - j);
		const a = h2(i, j), b = h2(i + 1, j), c = h2(i, j + 1), d = h2(i + 1, j + 1);
		return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
	};
	const fbm = (f, oct) => { let sum = 0, amp = 0.5, norm = 0, k = 1; for (let o = 0; o < oct; o++) { sum += f(k) * amp; norm += amp; amp *= 0.5; k *= 2.03; } return sum / norm; };
	return {
		n1, n2,
		fbm1: (x, oct = 4) => fbm((k) => n1(x * k + k * 7.3), oct),
		fbm2: (x, y, oct = 4) => fbm((k) => n2(x * k + k * 5.1, y * k - k * 3.7), oct),
		ridge1: (x, oct = 4) => fbm((k) => { const v = 1 - Math.abs(2 * n1(x * k + k * 7.3) - 1); return v * v; }, oct),
	};
}

// ------------------------------------------------------------------------------------------------------------- colours

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

// sky: top, middle, horizon; land: far to near; glow: lights, grid lines, windows
const PALETTES = {
	dusk: { sky: ['#2a1f4e', '#9c4a78', '#f4a571'], sun: '#ffe1a6', land: ['#9a5a7c', '#6b3a66', '#40264f', '#1f1530'], glow: '#ff8fa3', dark: true },
	dawn: { sky: ['#4f6ea8', '#c7a3c6', '#fdd5b8'], sun: '#fff4e0', land: ['#b29bc0', '#857199', '#584d7a', '#302a4f'], glow: '#ffd0a8' },
	day: { sky: ['#2f74c9', '#86bde8', '#e2f1f7'], sun: '#fffbea', land: ['#97bccd', '#6694ab', '#3f6c82', '#21445a'], glow: '#ffffff' },
	meadow: { sky: ['#4a8cc6', '#a6d3e5', '#eef6e2'], sun: '#fffdf0', land: ['#a3c7b2', '#73a789', '#4b855f', '#2a5639'], glow: '#fff6c8' },
	desert: { sky: ['#cf6f45', '#f0ae78', '#fde4b6'], sun: '#fff3d4', land: ['#e9a66b', '#cf8450', '#a5603b', '#683824'], glow: '#ffe0a0' },
	night: { sky: ['#050816', '#121a42', '#2b3a6e'], sun: '#eef1ff', land: ['#283461', '#1b2449', '#111733', '#080c1c'], glow: '#9fb7ff', dark: true },
	ice: { sky: ['#1d3c6a', '#6ea1c6', '#dbeef4'], sun: '#ffffff', land: ['#bcd8e6', '#8ab5cd', '#5c8cac', '#305a7a'], glow: '#e6f6ff' },
	ember: { sky: ['#160911', '#541826', '#c4472e'], sun: '#ffb56d', land: ['#6e2b2a', '#4b1c22', '#2d1118', '#16090d'], glow: '#ff7a3d', dark: true },
	teal: { sky: ['#0e3a4e', '#2e7f8b', '#bfe3d4'], sun: '#fff2cb', land: ['#47918d', '#2d6d70', '#1d4f56', '#0f3239'], glow: '#9ff5e0' },
	synth: { sky: ['#0b0220', '#3a0e5c', '#ff4f8b'], sun: '#ffd36e', land: ['#5b1c7c', '#3e1060', '#260a42', '#13052a'], glow: '#ff5fd2', dark: true },
	autumn: { sky: ['#6689b0', '#deb08a', '#f8ddb0'], sun: '#fff1d0', land: ['#bc8058', '#935a3a', '#633c2b', '#351f19'], glow: '#ffcf8a' },
	lavender: { sky: ['#3a3772', '#8e7dc0', '#ecc9dd'], sun: '#fff0f4', land: ['#a68fc2', '#7a67a3', '#524780', '#2c2752'], glow: '#ffd6ec' },
};
for (const p of Object.values(PALETTES)) { p.sky = p.sky.map(hex); p.land = p.land.map(hex); p.sun = hex(p.sun); p.glow = hex(p.glow); }

/** A colour along the land colours, t from 0 (far) to 1 (near). */
const landAt = (pal, t) => { const x = Math.max(0, Math.min(1, t)) * 3, i = Math.min(2, Math.floor(x)); return mix(pal.land[i], pal.land[i + 1], x - i); };

// --------------------------------------------------------------------------------------------------------- choosing

const fold = (s) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// The scenes, how often each comes, and the palettes it is drawn in.
const SCENES = {
	mountains: { weight: 2, palettes: ['dusk', 'dawn', 'day', 'ice', 'autumn', 'lavender', 'teal'] },
	hills: { weight: 1, palettes: ['dawn', 'day', 'meadow', 'autumn', 'lavender', 'dusk'] },
	sea: { weight: 1.5, palettes: ['day', 'dusk', 'dawn', 'teal', 'lavender'] },
	forest: { weight: 1, palettes: ['meadow', 'autumn', 'teal', 'dawn', 'ice', 'day'] },
	dunes: { weight: 1, palettes: ['desert', 'dusk', 'ember', 'dawn'] },
	topo: { weight: 1, palettes: Object.keys(PALETTES) },
	city: { weight: 1, palettes: ['dusk', 'night', 'synth', 'dawn', 'lavender', 'ember'] },
	grid: { weight: 1, palettes: ['synth', 'night', 'ember', 'dusk', 'teal'] },
	aurora: { weight: 1, palettes: ['night'] },
	space: { weight: 1, palettes: ['night', 'synth', 'ember'] },
};

const pickWeighted = (rand, entries) => {
	let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
	for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
	return entries[entries.length - 1][0];
};

/** A scene and a palette, by the seed alone. */
function choose(rand) {
	const scene = pickWeighted(rand, Object.entries(SCENES).map(([k, s]) => [k, s.weight]));
	const palettes = SCENES[scene].palettes;
	return { scene, palette: palettes[(rand() * palettes.length) | 0] };
}

// ---------------------------------------------------------------------------------------------------------- the parts

function sky(g, w, h, pal, horizon) {
	const gr = g.createLinearGradient(0, 0, 0, horizon);
	gr.addColorStop(0, css(pal.sky[0]));
	gr.addColorStop(0.55, css(pal.sky[1]));
	gr.addColorStop(1, css(pal.sky[2]));
	g.fillStyle = gr;
	g.fillRect(0, 0, w, horizon + 1);
	g.fillStyle = css(pal.sky[2]);
	g.fillRect(0, horizon, w, h - horizon);
}

/** The sky's colour at a height, for cutting stripes out of a sun. */
const skyAt = (pal, y, horizon) => { const t = Math.max(0, Math.min(1, y / horizon)); return t < 0.55 ? mix(pal.sky[0], pal.sky[1], t / 0.55) : mix(pal.sky[1], pal.sky[2], (t - 0.55) / 0.45); };

function sun(g, x, y, r, pal, glow = 0.45) {
	const halo = g.createRadialGradient(x, y, r * 0.5, x, y, r * 7);
	halo.addColorStop(0, css(pal.sun, glow));
	halo.addColorStop(0.35, css(pal.sun, glow * 0.25));
	halo.addColorStop(1, css(pal.sun, 0));
	g.fillStyle = halo;
	g.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
	g.fillStyle = css(pal.sun);
	g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

function stars(g, w, h, rand, count, maxY, size) {
	for (let i = 0, k = count * w / (h * ASPECT); i < k; i++) {
		const x = rand() * w, y = Math.pow(rand(), 1.4) * maxY, s = size * (rand() < 0.08 ? 2 : 1);
		g.fillStyle = css(WHITE, 0.25 + rand() * 0.75 * (1 - y / maxY));
		g.fillRect(x, y, s, s);
	}
}

function clouds(g, w, h, rand, pal, horizon, n) {
	const c = mix(pal.sky[1], WHITE, 0.35);
	for (let i = 0, k = n * w / (h * ASPECT); i < k; i++) {
		const cx = rand() * w, cy = horizon * (0.15 + rand() * 0.55), len = h * ASPECT * (0.08 + rand() * 0.16), th = h * (0.012 + rand() * 0.02);
		g.fillStyle = css(c, 0.18 + rand() * 0.2);
		for (let k = 0; k < 6; k++) {
			const ex = cx + (rand() - 0.5) * len, ey = cy + (rand() - 0.5) * th * 2;
			g.beginPath(); g.ellipse(ex, ey, len * (0.25 + rand() * 0.35), th * (0.6 + rand() * 0.8), 0, 0, Math.PI * 2); g.fill();
		}
	}
}

/** A ridge filled down to the bottom; returns its height at x. */
function ridge(g, w, h, { base, amp, freq, phase, sharp, oct = 4, peak = 1, color, N }) {
	const f = (x) => base - amp * Math.pow(sharp ? N.ridge1(x / (h * ASPECT) * freq + phase, oct) : N.fbm1(x / (h * ASPECT) * freq + phase, oct), peak);
	const step = Math.max(1, w / 480);
	g.beginPath(); g.moveTo(0, h);
	for (let x = 0; x <= w + step; x += step) g.lineTo(x, f(x));
	g.lineTo(w, h); g.closePath();
	g.fillStyle = css(color);
	g.fill();
	return f;
}

/** A band of mist rising from y. */
function mist(g, w, y, height, color, alpha) {
	const gr = g.createLinearGradient(0, y - height, 0, y);
	gr.addColorStop(0, css(color, 0));
	gr.addColorStop(1, css(color, alpha));
	g.fillStyle = gr;
	g.fillRect(0, y - height, w, height);
}

function pine(g, x, y, height, color) {
	const wd = height * 0.36;
	g.fillStyle = css(color);
	g.fillRect(x - wd * 0.06, y - height * 0.15, wd * 0.12, height * 0.2);
	for (let k = 0; k < 3; k++) {
		const top = y - height * (1 - k * 0.22), bot = y - height * (0.42 - k * 0.16), half = wd * (0.55 + k * 0.25) * 0.5;
		g.beginPath(); g.moveTo(x, top); g.lineTo(x + half, bot); g.lineTo(x - half, bot); g.closePath(); g.fill();
	}
}

function roundTree(g, x, y, height, color) {
	g.fillStyle = css(color);
	g.fillRect(x - height * 0.04, y - height * 0.45, height * 0.08, height * 0.5);
	g.beginPath(); g.arc(x, y - height * 0.62, height * 0.32, 0, Math.PI * 2); g.fill();
}

// --------------------------------------------------------------------------------------------------------- the scenes

const DRAW = {
	mountains(g, w, h, R, N, pal) {
		const horizon = h * (0.5 + R() * 0.1);
		sky(g, w, h, pal, horizon);
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.35 + R() * 0.45), h * (0.05 + R() * 0.03), pal);
		clouds(g, w, h, R, pal, horizon, 2 + ((R() * 4) | 0));
		const layers = 5, trees = R() < 0.5;
		for (let i = 0; i < layers; i++) {
			const t = i / (layers - 1);
			const color = mix(landAt(pal, t), pal.sky[2], (1 - t) * 0.35);
			const base = h * (0.42 + t * 0.4), amp = h * (0.3 - t * 0.17);
			const f = ridge(g, w, h, { base, amp, freq: 2 + t * 2.6, phase: R() * 50, sharp: i < 3, color, N });
			if (trees && i === layers - 1) {
				for (let x = R() * 20; x < w; x += h * ASPECT * (0.006 + R() * 0.012)) pine(g, x, f(x) + h * 0.02, h * (0.05 + R() * 0.07), color);
			}
			if (i < layers - 1) mist(g, w, base + h * 0.02, h * 0.16, pal.sky[2], 0.25);
		}
	},

	hills(g, w, h, R, N, pal) {
		const horizon = h * (0.55 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.3 + R() * 0.5), h * (0.05 + R() * 0.03), pal);
		clouds(g, w, h, R, pal, horizon, 3 + ((R() * 4) | 0));
		const layers = 4, kind = R();
		for (let i = 0; i < layers; i++) {
			const t = i / (layers - 1);
			const color = mix(landAt(pal, t), pal.sky[2], (1 - t) * 0.3);
			const base = h * (0.56 + t * 0.3), amp = h * (0.3 - t * 0.08);
			const f = ridge(g, w, h, { base, amp, freq: 1.4 + t * 1.4, phase: R() * 50, oct: 2, color, N });
			if (i >= layers - 2) {
				const near = i === layers - 1, gap = h * ASPECT * (near ? 0.03 + R() * 0.05 : 0.015 + R() * 0.03);
				for (let x = R() * gap; x < w; x += gap * (0.4 + R() * 1.4)) {
					if (R() < 0.45) continue;
					const th = h * (near ? 0.07 + R() * 0.06 : 0.035 + R() * 0.03);
					(kind < 0.5 ? roundTree : pine)(g, x, f(x) + th * 0.12, th, color);
				}
			}
		}
	},

	sea(g, w, h, R, N, pal) {
		const horizon = h * (0.56 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		const sx = w * (0.2 + R() * 0.6), sr = h * (0.05 + R() * 0.03), sy = horizon - sr * (1.2 + R() * 4);
		sun(g, sx, sy, sr, pal, 0.55);
		clouds(g, w, h, R, pal, horizon, 2 + ((R() * 4) | 0));
		// a coast far away, on one side
		const side = R() < 0.5, reach = 0.3 + R() * 0.35, camp = h * (0.08 + R() * 0.08), cph = R() * 50;
		g.beginPath(); g.moveTo(0, horizon + 1);
		for (let x = 0; x <= w; x += Math.max(1, w / 480)) {
			const u = side ? x / w : 1 - x / w, fall = Math.max(0, 1 - u / reach);
			g.lineTo(x, horizon + 1 - camp * fall * fall * (3 - 2 * fall) * (0.4 + 0.6 * N.ridge1(x / (h * ASPECT) * 3 + cph, 3)));
		}
		g.lineTo(w, horizon + 1); g.closePath();
		g.fillStyle = css(mix(pal.land[0], pal.sky[2], 0.35));
		g.fill();
		const water = g.createLinearGradient(0, horizon, 0, h);
		water.addColorStop(0, css(mix(pal.land[0], pal.sky[2], 0.5)));
		water.addColorStop(1, css(pal.land[3]));
		g.fillStyle = water;
		g.fillRect(0, horizon, w, h - horizon);
		// the sun on the water: dashes that widen towards us
		for (let y = horizon + 2; y < h; y += Math.max(2, (y - horizon) * 0.08)) {
			const d = (y - horizon) / (h - horizon), half = sr * (0.6 + d * 2.2) * (0.5 + R());
			g.fillStyle = css(pal.sun, 0.7 * (1 - d * 0.6));
			g.fillRect(sx - half + (R() - 0.5) * sr, y, half * 2, Math.max(1, h * 0.004 * (1 + d * 2)));
		}
		// waves
		const wave = mix(pal.sky[2], WHITE, 0.2);
		for (let i = 0, k = 140 * w / (h * ASPECT); i < k; i++) {
			const d = Math.pow(R(), 1.6), y = horizon + d * (h - horizon), len = h * ASPECT * (0.005 + d * 0.03);
			g.fillStyle = css(wave, 0.12 + 0.2 * R());
			g.fillRect(R() * w, y, len, Math.max(1, h * 0.003 * (1 + d)));
		}
		if (R() < 0.5) {   // a sail
			const bx = sx + (R() < 0.5 ? -1 : 1) * h * ASPECT * (0.08 + R() * 0.2), by = horizon + (h - horizon) * (0.15 + R() * 0.3), s = h * (0.05 + R() * 0.04);
			g.fillStyle = css(pal.land[3]);
			g.beginPath(); g.moveTo(bx - s * 0.5, by); g.lineTo(bx + s * 0.5, by); g.lineTo(bx + s * 0.35, by + s * 0.15); g.lineTo(bx - s * 0.35, by + s * 0.15); g.fill();
			g.fillStyle = css(mix(pal.sun, pal.sky[2], 0.3));
			g.beginPath(); g.moveTo(bx, by - s * 1.1); g.lineTo(bx + s * 0.45, by - s * 0.05); g.lineTo(bx, by - s * 0.05); g.fill();
		}
	},

	dunes(g, w, h, R, N, pal) {
		const horizon = h * (0.55 + R() * 0.06);
		sky(g, w, h, pal, horizon);
		sun(g, w * (0.2 + R() * 0.6), horizon * (0.45 + R() * 0.4), h * (0.07 + R() * 0.05), pal, 0.6);
		const lit = R() < 0.5 ? 1 : -1;   // the side the sun lights
		for (let i = 0; i < 4; i++) {
			const t = i / 3, color = mix(landAt(pal, t), pal.sky[2], (1 - t) * 0.3);
			const base = h * (0.6 + t * 0.3), amp = h * (0.22 + R() * 0.1 - t * 0.06);
			const phase = R() * 50, freq = 1.8 + t * 1.4, sk = 0.35 * lit;
			// a dune's crest leans away from the wind: a skewed bump
			const f = (x) => { const u = x / (h * ASPECT) * freq + phase, v = N.fbm1(u + sk * N.n1(u * 2), 2); return base - amp * 1.6 * Math.pow(v, 2.2); };
			const step = Math.max(1, w / 480);
			g.beginPath(); g.moveTo(0, h);
			for (let x = 0; x <= w + step; x += step) g.lineTo(x, f(x));
			g.lineTo(w, h); g.closePath();
			const gr = g.createLinearGradient(0, base - amp, 0, h);
			gr.addColorStop(0, css(mix(color, pal.sun, 0.25)));
			gr.addColorStop(0.5, css(color));
			gr.addColorStop(1, css(mix(color, BLACK, 0.2)));
			g.fillStyle = gr;
			g.fill();
			g.strokeStyle = css(pal.sun, 0.35);
			g.lineWidth = Math.max(1, h * 0.003);
			g.beginPath();
			for (let x = 0; x <= w + step; x += step) x ? g.lineTo(x, f(x)) : g.moveTo(x, f(x));
			g.stroke();
		}
	},

	forest(g, w, h, R, N, pal) {
		const horizon = h * (0.5 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.4 + R() * 0.45), h * (0.05 + R() * 0.03), pal);
		ridge(g, w, h, { base: horizon + h * 0.04, amp: h * 0.14, freq: 2, phase: R() * 50, sharp: true, color: mix(pal.land[0], pal.sky[2], 0.45), N });
		mist(g, w, horizon + h * 0.08, h * 0.12, pal.sky[2], 0.5);
		const rows = 4;
		for (let i = 0; i < rows; i++) {
			const t = i / (rows - 1), color = mix(landAt(pal, t), pal.sky[2], (1 - t) * 0.4);
			const base = h * (0.6 + t * 0.3), tall = h * (0.1 + t * 0.14);
			for (let x = -R() * 20; x < w + 20; x += tall * (0.18 + R() * 0.22)) pine(g, x, base + R() * h * 0.02, tall * (0.6 + R() * 0.6), color);
			g.fillStyle = css(color);
			g.fillRect(0, base, w, h - base);
			if (i < rows - 1) mist(g, w, base + h * 0.03, h * 0.12, pal.sky[2], 0.35);
		}
	},

	city(g, w, h, R, N, pal) {
		const horizon = h * (0.6 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		if (pal.dark) stars(g, w, h, R, 120, horizon * 0.8, Math.max(1, h / 320));
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.3 + R() * 0.4), h * (0.05 + R() * 0.03), pal);
		const lit = pal.dark ? 0.85 : 0.35;
		for (let i = 0; i < 3; i++) {
			const t = i / 2, color = mix(landAt(pal, 0.2 + t * 0.8), pal.sky[2], (1 - t) * 0.35);
			for (let x = -R() * 40; x < w; ) {
				const tall = R() < 0.15 ? 1.8 : 1;
				const bw = h * ASPECT * (0.018 + R() * 0.04), bh = h * (0.06 + R() * 0.16 + t * 0.06) * tall, top = horizon + h * t * 0.14 - bh;
				g.fillStyle = css(color);
				g.fillRect(x, top, bw, h - top);
				if (R() < 0.25) g.fillRect(x + bw * 0.45, top - bh * 0.2, Math.max(1, bw * 0.06), bh * 0.2);
				if (i === 2) {
					const cell = Math.max(2, h * 0.018);
					for (let wy = top + cell; wy < h - cell; wy += cell * 1.8) {
						for (let wx = x + cell * 0.6; wx < x + bw - cell; wx += cell * 1.6) {
							if (R() < 0.35) { g.fillStyle = css(pal.glow, lit * (0.4 + R() * 0.6)); g.fillRect(wx, wy, cell * 0.8, cell); }
						}
					}
				}
				x += bw + (R() < 0.3 ? h * ASPECT * R() * 0.03 : 0);
			}
			if (i < 2) mist(g, w, horizon + h * t * 0.14, h * 0.18, pal.sky[2], 0.3);
		}
	},

	grid(g, w, h, R, N, pal) {
		const horizon = h * (0.58 + R() * 0.06);
		sky(g, w, h, pal, horizon);
		stars(g, w, h, R, 90, horizon * 0.7, Math.max(1, h / 320));
		const sx = w * (0.3 + R() * 0.4), sr = h * (0.2 + R() * 0.08), sy = horizon - sr * (0.35 + R() * 0.3);
		g.save();
		g.beginPath(); g.rect(0, 0, w, horizon); g.clip();
		const halo = g.createRadialGradient(sx, sy, sr * 0.8, sx, sy, sr * 2.6);
		halo.addColorStop(0, css(pal.glow, 0.35)); halo.addColorStop(1, css(pal.glow, 0));
		g.fillStyle = halo; g.fillRect(0, 0, w, horizon);
		g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.clip();
		const disc = g.createLinearGradient(0, sy - sr, 0, sy + sr);
		disc.addColorStop(0, css(pal.sun)); disc.addColorStop(1, css(pal.glow));
		g.fillStyle = disc; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
		for (let k = 0; k < 7; k++) {   // stripes cut out of its lower half, thicker towards the bottom
			const y = sy + sr * (0.05 + k * 0.14), th = sr * (0.015 + k * 0.012);
			g.fillStyle = css(skyAt(pal, y, horizon));
			g.fillRect(sx - sr, y, sr * 2, th);
		}
		g.restore();
		ridge(g, w, h, { base: horizon + 1, amp: h * 0.12, freq: 3, phase: R() * 50, sharp: true, color: pal.land[1], N });
		ridge(g, w, h, { base: horizon + 1, amp: h * 0.06, freq: 5, phase: R() * 50, sharp: true, color: pal.land[2], N });
		g.fillStyle = css(pal.land[3]);
		g.fillRect(0, horizon, w, h - horizon);
		const lw = Math.max(1, h * 0.003), vx = sx;
		const line = (x0, y0, x1, y1) => {
			g.strokeStyle = css(pal.glow, 0.25); g.lineWidth = lw * 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
			g.strokeStyle = css(pal.glow, 0.9); g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
		};
		for (let i = 1; i <= 14; i++) { const y = horizon + (h - horizon) * Math.pow(i / 14, 2.2); line(0, y, w, y); }
		const span = Math.ceil(w / (h * ASPECT * 0.09)) + 4;
		for (let j = -span; j <= span; j++) line(vx + j * h * ASPECT * 0.012, horizon, vx + j * h * ASPECT * 0.09, h);
		mist(g, w, horizon + h * 0.03, h * 0.05, pal.glow, 0.35);
	},

	topo(g, w, h, R, N, pal) {
		// a height field of a few large, calm forms, lit from the top left, with thin contour lines (every fifth one stronger)
		const sc = 0.8 + R() * 0.5, ox = R() * 100, oy = R() * 100, levels = 12 + ((R() * 8) | 0);
		const F = new Float32Array(w * h);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const u = x / h * sc + ox, v = y / h * sc + oy;
				const wu = N.fbm2(u * 0.5 + 9, v * 0.5, 2) - 0.5, wv = N.fbm2(u * 0.5, v * 0.5 + 9, 2) - 0.5;
				F[y * w + x] = N.fbm2(u + wu * 1.2, v + wv * 1.2, 3);
			}
		}
		const low = mix(pal.land[3], pal.sky[0], 0.3), high = mix(pal.land[1], pal.sky[1], 0.4);
		const line = mix(pal.sky[2], WHITE, 0.25), lw = Math.max(1, h / 210) * 0.8;
		const img = g.createImageData(w, h), d = img.data;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const k = y * w + x, f = F[k];
				const fx = (F[y * w + Math.min(w - 1, x + 1)] - F[y * w + Math.max(0, x - 1)]) * 0.5;
				const fy = (F[Math.min(h - 1, y + 1) * w + x] - F[Math.max(0, y - 1) * w + x]) * 0.5;
				const e = Math.max(0, Math.min(1, (f - 0.3) * 2.2));
				let c = mix(low, high, e);
				const shade = Math.max(-1, Math.min(1, (-fx - fy) * h * 0.9));   // light from the top left
				c = mix(c, shade > 0 ? WHITE : BLACK, Math.abs(shade) * 0.12);
				const t = f * levels, fr = t - Math.floor(t), dist = Math.min(fr, 1 - fr);
				const px = dist / Math.max(1e-6, Math.hypot(fx, fy) * levels);   // distance to the line, in pixels
				const major = Math.round(t) % 5 === 0;
				const cover = Math.max(0, Math.min(1, (major ? lw * 1.6 : lw) - px + 0.5));
				if (cover > 0) c = mix(c, line, cover * (major ? 0.7 : 0.35));
				const i = k * 4;
				d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
			}
		}
		g.putImageData(img, 0, 0);
	},

	aurora(g, w, h, R, N, pal) {
		const horizon = h * (0.6 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		stars(g, w, h, R, 260, horizon, Math.max(1, h / 320));
		const sets = [[[90, 255, 170], [120, 90, 255]], [[80, 230, 255], [210, 90, 255]], [[150, 255, 120], [60, 160, 255]]];
		const [lo, hi] = sets[(R() * sets.length) | 0];
		g.save();
		g.globalCompositeOperation = 'lighter';
		const step = Math.max(1, w / 640);
		for (let c = 0; c < 3; c++) {
			const ph = R() * 50, f1 = 1.5 + R() * 2, f2 = 6 + R() * 6, top0 = horizon * (0.38 + R() * 0.14);
			for (let x = 0; x < w; x += step) {
				const u = x / (h * ASPECT);
				const base = top0 + horizon * 0.3 * N.fbm1(u * f1 + ph, 3);
				const len = horizon * (0.25 + 0.45 * N.n1(u * f2 + ph * 2)) * (0.6 + 0.4 * N.n1(u * 30 + ph));
				const a = 0.9 * Math.pow(N.fbm1(u * f2 * 0.5 + ph + 9, 2), 1.2);
				const gr = g.createLinearGradient(0, base - len, 0, base + len * 0.1);
				gr.addColorStop(0, css(hi, 0));
				gr.addColorStop(0.7, css(mix(hi, lo, 0.6), a * 0.6));
				gr.addColorStop(0.95, css(lo, a));
				gr.addColorStop(1, css(lo, 0));
				g.fillStyle = gr;
				g.fillRect(x, base - len, step, len * 1.1);
			}
		}
		g.restore();
		const far = mix(pal.land[2], lo, 0.1);
		ridge(g, w, h, { base: horizon + h * 0.08, amp: h * 0.4, freq: 2.4, phase: R() * 50, sharp: true, peak: 2.5, color: far, N });
		mist(g, w, horizon + h * 0.1, h * 0.1, mix(pal.sky[2], lo, 0.2), 0.3);
		ridge(g, w, h, { base: horizon + h * 0.2, amp: h * 0.22, freq: 3.5, phase: R() * 50, sharp: true, peak: 2, color: pal.land[3], N });
	},

	space(g, w, h, R, N, pal) {
		const img = g.createImageData(w, h), d = img.data;
		const a = pal.glow, b = pal.sky[2], ox = R() * 100, oy = R() * 100, sc = 0.9 + R() * 0.7;
		for (let y = 0; y < h; y++) {
			const bg = mix(pal.sky[0], pal.sky[1], (y / h) * 0.6);
			for (let x = 0; x < w; x++) {
				const u = x / h * sc + ox, v = y / h * sc + oy;
				const n = N.fbm2(u, v, 5), m = N.fbm2(u * 1.7 + 30, v * 1.7, 3);
				const dens = Math.max(0, n - 0.45) * 2.2;
				let c = mix(bg, mix(a, b, m), Math.min(1, dens * dens * 1.6));
				c = mix(c, BLACK, Math.max(0, m - 0.55) * 1.2);   // dust
				const i = (y * w + x) * 4;
				d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
			}
		}
		g.putImageData(img, 0, 0);
		stars(g, w, h, R, 320, h, Math.max(1, h / 320));
		// a planet rising from the bottom
		const px = w * (0.2 + R() * 0.6), pr = h * (0.75 + R() * 0.35), py = h + pr * (0.35 + R() * 0.3);
		const lx = px + pr * (R() - 0.5) * 0.8, ly = py - pr * 0.9;
		const body = g.createRadialGradient(lx, ly, pr * 0.1, px, py, pr);
		body.addColorStop(0, css(mix(pal.land[0], pal.sun, 0.35)));
		body.addColorStop(0.7, css(pal.land[2]));
		body.addColorStop(1, css(pal.land[3]));
		g.save();
		g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fillStyle = body; g.fill(); g.clip();
		for (let k = 0; k < 9; k++) {
			g.fillStyle = css(k % 2 ? pal.land[1] : pal.sun, 0.06 + R() * 0.08);
			g.fillRect(px - pr, py - pr + pr * 2 * R(), pr * 2, pr * (0.02 + R() * 0.06));
		}
		g.restore();
		g.strokeStyle = css(pal.glow, 0.6);
		g.lineWidth = Math.max(1, h * 0.006);
		g.beginPath(); g.arc(px, py, pr, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
		if (R() < 0.6) {   // a ring
			g.strokeStyle = css(mix(pal.sun, pal.glow, 0.5), 0.45);
			g.lineWidth = Math.max(1, h * 0.012);
			g.beginPath(); g.ellipse(px, py - pr * 0.1, pr * 1.6, pr * 0.22, -0.12, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
		}
		if (R() < 0.7) {   // a moon
			const mx = (px + w * 0.5 + R() * w * 0.4) % w, my = h * (0.15 + R() * 0.3), mr = h * (0.025 + R() * 0.03);
			g.fillStyle = css(mix(pal.sun, pal.land[0], 0.4));
			g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
			g.fillStyle = css(pal.sky[0], 0.6);
			g.beginPath(); g.arc(mx + mr * 0.4, my - mr * 0.2, mr * 0.95, 0, Math.PI * 2); g.fill();
		}
	},
};

// ------------------------------------------------------------------------------------------------------------ drawing

const BAYER = (() => {
	const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
		[3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
	return m.map((r) => r.map((v) => (v + 0.5) / 64 - 0.5));
})();

/** Ordered dither: each channel to a few levels, the Bayer matrix deciding which way each pixel rounds. */
function dither(g, w, h, levels) {
	const img = g.getImageData(0, 0, w, h), d = img.data, q = (levels - 1) / 255;
	for (let y = 0; y < h; y++) {
		const row = BAYER[y & 7];
		for (let x = 0; x < w; x++) {
			const b = row[x & 7], i = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) d[i + c] = Math.round(Math.max(0, Math.min(levels - 1, d[i + c] * q + b))) / q;
		}
	}
	g.putImageData(img, 0, 0);
}

function grain(g, w, h, rand, amount) {
	const img = g.getImageData(0, 0, w, h), d = img.data;
	for (let i = 0; i < d.length; i += 4) {
		const n = (rand() - 0.5) * amount;
		d[i] += n; d[i + 1] += n; d[i + 2] += n;
	}
	g.putImageData(img, 0, 0);
}

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/**
 * Draws the picture for a title into a canvas of the given size (in canvas pixels) and returns what was drawn.
 * `variant` gives another picture for the same words.
 */
function paintBanner(canvas, title, { style = 'dither', variant = 0, levels = LEVELS } = {}) {
	const seed = fnv(fold(title.trim()) + (variant ? '#' + variant : ''));
	const R = mulberry(seed), N = makeNoise(mulberry(seed ^ 0x9e3779b9));
	const { scene, palette } = choose(R);
	const w = canvas.width, h = canvas.height, g = canvas.getContext('2d', { willReadFrequently: true });
	DRAW[scene](g, w, h, R, N, PALETTES[palette]);
	if (style === 'smooth') grain(g, w, h, R, 10);
	else dither(g, w, h, levels);
	return { scene, palette };
}

// ------------------------------------------------------------------------------------------------------------- plugin

const readJSON = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window */ } };

class Plugin extends AppPlugin {
	onLoad() {
		this.variants = readJSON(VARIANT_KEY, {});
		this.cache = new Map();      // key -> canvas drawn before, newest last
		this.watched = new Map();    // .panel-heading -> { mo, ro }
		this.titleTimers = new Map();   // panel id -> timer

		const soon = () => { this.syncAll(); setTimeout(() => this.syncAll(), 120); setTimeout(() => this.syncAll(), 450); };
		this.events.on('panel.navigated', soon);
		this.events.on('panel.focused', soon);
		this.events.on('panel.closed', soon);
		this.events.on('record.updated', (ev) => {
			for (const panel of this.ui.getPanels()) {
				if (panel.getActiveRecord()?.guid !== ev.recordGuid) continue;
				clearTimeout(this.titleTimers.get(panel.getId()));
				this.titleTimers.set(panel.getId(), setTimeout(() => this.sync(panel), SETTLE_MS));
			}
		}, { collection: '*' });

		this.ui.addCommandPaletteCommand({ label: 'Auto Banner: another picture for this page', icon: 'ti-dice-5', onSelected: () => this.setVariant(1 + ((Math.random() * 1e6) | 0)) });
		this.ui.addCommandPaletteCommand({ label: "Auto Banner: back to this page's own picture", icon: 'ti-arrow-back-up', onSelected: () => this.setVariant(0) });
		this.ui.addCommandPaletteCommand({ label: 'Auto Banner: switch between dither and smooth', icon: 'ti-grain', onSelected: () => {
			writeJSON(STYLE_KEY, this.style() === 'dither' ? 'smooth' : 'dither');
			this.syncAll();
		} });
		this.ui.addCommandPaletteCommand({ label: 'Auto Banner: turn on or off', icon: 'ti-photo', onSelected: () => {
			writeJSON(OFF_KEY, !readJSON(OFF_KEY, false));
			this.syncAll();
		} });

		soon();
	}

	onUnload() {
		for (const t of this.titleTimers.values()) clearTimeout(t);
		for (const heading of [...this.watched.keys()]) this.clear(heading);
	}

	style() {
		const own = readJSON(STYLE_KEY, null);
		if (own) return own;
		return this.getConfiguration()?.custom?.style === 'smooth' ? 'smooth' : 'dither';
	}

	excluded(collection) {
		const list = this.getConfiguration()?.custom?.exclude;
		return Array.isArray(list) && !!collection && list.some((n) => fold(String(n)) === fold(collection.getName()));
	}

	setVariant(variant) {
		const record = this.ui.getActivePanel()?.getActiveRecord();
		if (!record) return;
		if (variant) this.variants[record.guid] = variant;
		else delete this.variants[record.guid];
		writeJSON(VARIANT_KEY, this.variants);
		this.syncAll();
	}

	syncAll() {
		const live = new Set();
		for (const panel of this.ui.getPanels()) {
			const heading = this.sync(panel);
			if (heading) live.add(heading);
		}
		for (const heading of [...this.watched.keys()]) if (!live.has(heading) && !heading.isConnected) this.clear(heading);
	}

	/** Shows, redraws or takes away the picture in one panel; returns its heading. */
	sync(panel) {
		const el = panel.getElement();   // the editor inside the panel; the heading is its sibling
		const heading = (el?.closest('.panel') || el)?.querySelector('.panel-heading');
		if (!heading) return null;
		this.watch(heading, panel);
		const record = panel.getActiveRecord();
		const collection = record ? panel.getActiveCollection() : null;
		const title = record?.getName().trim() || '';
		const want = !readJSON(OFF_KEY, false) && !!record && !!title && heading.classList.contains('banner-is-empty') && !this.excluded(collection);
		if (!want) { this.take(heading); return heading; }

		const container = heading.querySelector('.banner-container');
		if (!container) return heading;
		let wrap = container.querySelector(':scope > .ab-wrap');
		if (!wrap) {
			wrap = document.createElement('div');
			wrap.className = 'ab-wrap';
			container.prepend(wrap);
		}
		if (!heading.classList.contains('ab-on')) heading.classList.add('ab-on');

		// layout size: the container is scaled by Thymer's scroll animation, which a bounding rect would count
		const box = { width: wrap.offsetWidth, height: wrap.offsetHeight };
		if (box.width < 2 || box.height < 2) return heading;
		const style = this.style(), variant = this.variants[record.guid] || 0;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const cw = style === 'smooth' ? Math.round(box.width * dpr) : Math.ceil(box.width / DOT);
		const ch = style === 'smooth' ? Math.round(box.height * dpr) : Math.ceil(box.height / DOT);
		const key = [title, style, variant, cw, ch].join('|');
		if (wrap.dataset.key === key) return heading;

		let canvas = this.cache.get(key);
		if (canvas) { this.cache.delete(key); this.cache.set(key, canvas); }
		else {
			canvas = canvasOf(cw, ch);
			try { paintBanner(canvas, title, { style, variant }); } catch (e) { console.warn('[Auto Banner]', e); return heading; }
			this.cache.set(key, canvas);
			if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
		}
		canvas.className = 'ab-canvas' + (style === 'smooth' ? '' : ' ab-dots');
		wrap.replaceChildren(canvas);
		wrap.dataset.key = key;
		return heading;
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

	take(heading) {
		if (heading.classList.contains('ab-on')) heading.classList.remove('ab-on');
		heading.querySelectorAll('.ab-wrap').forEach((n) => n.remove());
	}

	clear(heading) {
		const w = this.watched.get(heading);
		if (w) { w.mo.disconnect(); w.ro.disconnect(); }
		this.watched.delete(heading);
		this.take(heading);
	}
}
