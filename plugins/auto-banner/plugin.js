/**
 * Auto Banner
 *
 * A page without a banner of its own gets a picture drawn at the top, in the banner's place, from its title: a canvas the
 * plugin draws while the page is shown. Nothing is generated into the workspace: no image is uploaded, the page is not
 * changed, and turning the plugin off leaves every page as it was. The title is the seed: what is drawn is left to chance,
 * but the same title always gives the same scene.
 *
 * The scenes: layered mountains, rolling hills, the sea with a sun on the water, a lake mirroring its mountains, waves in
 * rows, dunes, buttes and saguaros, a sea of clouds with peaks, a forest in fog, a skyline, a synthwave grid, a contour map,
 * an aurora over mountains, a nebula full of stars, cherry branches in blossom, lines flowing in a field, a lighthouse on a
 * headland, windmills in the polders, a snowed village, rain, a smoking volcano, palm islands and fireflies in a meadow.
 * Three more are drawn in flat tones with crisp edges: a fire lookout among ranges of mountains and firs cut out of paper,
 * each range paler the farther it is; tall grass under towering clouds, as a still from an animated film; and a grove as
 * pixel art, firs and bushes in clumps of leaves. They came later and take their share of the pages by a draw of their own,
 * so every other page keeps the scene it had.
 *
 * The clouds are heaps of round puffs and long thin bands, each puff lit on the side the light comes from with a dark seam
 * where it meets the next, a flat shaded underside and a bright rim: white and lit from above by day, warm underneath from a
 * low sun at dawn and dusk, dark with a silver edge by the moon at night, grey and hanging low in the rain; they turn their
 * lit side to the sun as they pass it and sink into shadow away from it. The sea of clouds is banks of the same puffs. At
 * night the moon is in tonight's phase, its seas on it and the rest of the disc faint in earthshine.
 *
 * Each moves a little, and only in ways that mean something: clouds drift, birds now and then cross, the sun shimmers on
 * the water and the lake's reflection wavers, waves roll in, sand blows off the dunes' crests, fog drifts through the
 * forest, windows in the city go on and off, the grid runs towards you, the sun moves over the contour map, the aurora
 * folds, stars twinkle and a shooting star passes, petals fall, sparks run along the flow lines, the lighthouse's beam
 * sweeps, the sails turn, snow and rain fall, the volcano smokes, palms sway, fireflies wander and blink, the lookout's
 * lamp flickers at night, gusts run across the grass and show its light side, the grove's trees sway. The frame rate is
 * low and stops while the strip is out of sight or the app is in the background; with "reduce motion" the picture is
 * still.
 *
 * The palette follows the time of day (dawn, day, dusk, night) unless that is turned off: one of the scene's palettes that
 * suits the hour, chosen by the seed. They are drawn in a fine ordered dither (Bayer 8x8, a dot to a CSS pixel, ten shades
 * a channel) or smooth with a little grain. Sizes and frequencies go by the strip's height, so a wide panel shows more of
 * the land, not a stretched one.
 *
 * A page with a banner (its own or its collection's) shows that, as before. The strip takes a banner's height while it
 * shows a picture. The picture follows the title (once it has stayed the same for a moment) and the panel's width.
 *
 * Commands:
 *   - Auto Banner: another picture for this page (another seed; kept on this device)
 *   - Auto Banner: back to this page's own picture
 *   - Auto Banner: switch between dither and smooth
 *   - Auto Banner: motion on or off
 *   - Auto Banner: follow the time of day or not
 *   - Auto Banner: turn on or off (on this device)
 *
 * Configuration (`custom`, all optional): "exclude": ["Journal", ...] collection names to skip; "style": "dither"|"smooth"
 * (the command's choice, kept per device, wins).
 */

const STYLE_KEY = 'autobanner:style';
const VARIANT_KEY = 'autobanner:variants';   // { record guid: variant } for pages given another picture
const OFF_KEY = 'autobanner:off';
const STILL_KEY = 'autobanner:still';       // motion off
const CLOCKLESS_KEY = 'autobanner:clockless';   // the palette does not follow the time of day
const ASPECT = 3;          // the scenes' frequencies are set for a strip this many heights wide
const LEVELS = 10;         // shades per colour channel in the dither
const SETTLE_MS = 700;     // a title has to stay the same this long before the picture follows it
const FPS = 10;            // frames a second, unless the scene asks for more
const STORE_MAX = 24;      // cached layers (a nebula, a contour field, flow lines, cloud shapes, grain)

// ---------------------------------------------------------------------------------------------------------- randomness

const fnv = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry = (seed) => () => {
	seed = (seed + 0x6D2B79F5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash1 = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

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

// sky: top, middle, horizon; land: far to near; glow: lights, grid lines, windows; clouds: how they are lit (by day from
// above when not given, 'glow' by a low sun from below, 'moon' dark with a bright rim, 'storm' grey); moon: the light is the moon
const PALETTES = {
	dusk: { sky: ['#2a1f4e', '#9c4a78', '#f4a571'], sun: '#ffe1a6', land: ['#9a5a7c', '#6b3a66', '#40264f', '#1f1530'], glow: '#ff8fa3', dark: true, clouds: 'glow' },
	dawn: { sky: ['#4f6ea8', '#c7a3c6', '#fdd5b8'], sun: '#fff4e0', land: ['#b29bc0', '#857199', '#584d7a', '#302a4f'], glow: '#ffd0a8', clouds: 'glow' },
	day: { sky: ['#2f74c9', '#86bde8', '#e2f1f7'], sun: '#fffbea', land: ['#97bccd', '#6694ab', '#3f6c82', '#21445a'], glow: '#ffffff' },
	meadow: { sky: ['#4a8cc6', '#a6d3e5', '#eef6e2'], sun: '#fffdf0', land: ['#a3c7b2', '#73a789', '#4b855f', '#2a5639'], glow: '#fff6c8' },
	desert: { sky: ['#cf6f45', '#f0ae78', '#fde4b6'], sun: '#fff3d4', land: ['#e9a66b', '#cf8450', '#a5603b', '#683824'], glow: '#ffe0a0', clouds: 'glow' },
	night: { sky: ['#050816', '#121a42', '#2b3a6e'], sun: '#eef1ff', land: ['#283461', '#1b2449', '#111733', '#080c1c'], glow: '#9fb7ff', dark: true, moon: true, clouds: 'moon' },
	moonlit: { sky: ['#020d14', '#0b2b3a', '#1f5266'], sun: '#e8f4ff', land: ['#21495a', '#163644', '#0d2430', '#06141c'], glow: '#8fe3ff', dark: true, moon: true, clouds: 'moon' },
	ice: { sky: ['#1d3c6a', '#6ea1c6', '#dbeef4'], sun: '#ffffff', land: ['#bcd8e6', '#8ab5cd', '#5c8cac', '#305a7a'], glow: '#e6f6ff' },
	ember: { sky: ['#160911', '#541826', '#c4472e'], sun: '#ffb56d', land: ['#6e2b2a', '#4b1c22', '#2d1118', '#16090d'], glow: '#ff7a3d', dark: true, clouds: 'glow' },
	teal: { sky: ['#0e3a4e', '#2e7f8b', '#bfe3d4'], sun: '#fff2cb', land: ['#47918d', '#2d6d70', '#1d4f56', '#0f3239'], glow: '#9ff5e0' },
	synth: { sky: ['#0b0220', '#3a0e5c', '#ff4f8b'], sun: '#ffd36e', land: ['#5b1c7c', '#3e1060', '#260a42', '#13052a'], glow: '#ff5fd2', dark: true, clouds: 'glow' },
	autumn: { sky: ['#6689b0', '#deb08a', '#f8ddb0'], sun: '#fff1d0', land: ['#bc8058', '#935a3a', '#633c2b', '#351f19'], glow: '#ffcf8a', clouds: 'glow' },
	lavender: { sky: ['#3a3772', '#8e7dc0', '#ecc9dd'], sun: '#fff0f4', land: ['#a68fc2', '#7a67a3', '#524780', '#2c2752'], glow: '#ffd6ec', clouds: 'glow' },
	storm: { sky: ['#1c2530', '#3d4b5a', '#7d8b98'], sun: '#dfe6ee', land: ['#5d6b78', '#46535f', '#2f3a44', '#1a2128'], glow: '#ffd98a', clouds: 'storm' },
	azure: { sky: ['#0b4cb0', '#3a8be0', '#d6ebff'], sun: '#ffffff', land: ['#a6cff6', '#5a9ae2', '#2766c4', '#0c3a8c'], glow: '#ffffff', late: true },
	spring: { sky: ['#7aa3bb', '#8fb4c4', '#d2e2d6'], sun: '#fffbe2', land: ['#b8cf72', '#8cb056', '#55874a', '#2c573b'], glow: '#f4f1c8', late: true },
};
for (const p of Object.values(PALETTES)) { p.sky = p.sky.map(hex); p.land = p.land.map(hex); p.sun = hex(p.sun); p.glow = hex(p.glow); }

/** A colour along the land colours, t from 0 (far) to 1 (near). */
const landAt = (pal, t) => { const x = Math.max(0, Math.min(1, t)) * 3, i = Math.min(2, Math.floor(x)); return mix(pal.land[i], pal.land[i + 1], x - i); };

// The palettes that suit each part of the day.
const PERIODS = {
	dawn: ['dawn', 'lavender', 'ice', 'teal', 'storm'],
	day: ['day', 'meadow', 'teal', 'desert', 'ice', 'autumn', 'storm', 'azure', 'spring'],
	dusk: ['dusk', 'autumn', 'ember', 'lavender', 'desert', 'synth'],
	night: ['night', 'moonlit', 'synth', 'ember', 'storm'],
};
const periodOf = (d = new Date()) => {
	const hr = d.getHours() + d.getMinutes() / 60;
	return hr >= 5 && hr < 8 ? 'dawn' : hr >= 8 && hr < 17 ? 'day' : hr >= 17 && hr < 20.5 ? 'dusk' : 'night';
};

// --------------------------------------------------------------------------------------------------------- choosing

const fold = (s) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').normalize('NFD').replace(/[̀-ͯ]/g, '');

// the palettes there were before the late ones, for the scenes drawn in any palette
const ALL = Object.keys(PALETTES).filter((k) => !PALETTES[k].late);
// The scenes, how often each comes, the palettes it is drawn in, and how many frames a second its motion needs. The `added`
// ones came later: they take their share of the pages without moving the others from the scene they had.
const SCENES = {
	mountains: { weight: 1.3, palettes: ['dusk', 'dawn', 'day', 'ice', 'autumn', 'lavender', 'teal', 'night', 'moonlit'] },
	hills: { weight: 1, palettes: ['dawn', 'day', 'meadow', 'autumn', 'lavender', 'dusk', 'night', 'moonlit'] },
	sea: { weight: 1, palettes: ['day', 'dusk', 'dawn', 'teal', 'lavender', 'night', 'moonlit'] },
	forest: { weight: 1, palettes: ['meadow', 'autumn', 'teal', 'dawn', 'ice', 'day', 'night', 'moonlit', 'storm'] },
	dunes: { weight: 1, palettes: ['desert', 'dusk', 'ember', 'dawn', 'night'] },
	topo: { weight: 1, palettes: ALL },
	city: { weight: 1, palettes: ['dusk', 'night', 'synth', 'dawn', 'lavender', 'ember', 'day', 'storm'] },
	grid: { weight: 1, palettes: ['synth', 'night', 'ember', 'dusk', 'teal', 'moonlit'] },
	aurora: { weight: 1, palettes: ['night', 'moonlit'] },
	space: { weight: 1, palettes: ['night', 'synth', 'ember', 'moonlit'] },
	lake: { weight: 1.2, palettes: ['dawn', 'dusk', 'day', 'ice', 'lavender', 'autumn', 'teal', 'night', 'moonlit'] },
	waves: { weight: 1, palettes: ['teal', 'day', 'dusk', 'lavender', 'ice', 'night', 'moonlit', 'storm'], fps: 12 },
	mesas: { weight: 1, palettes: ['desert', 'dusk', 'ember', 'autumn', 'dawn', 'night'] },
	clouds: { weight: 1, palettes: ['dawn', 'dusk', 'lavender', 'day', 'autumn', 'ice', 'moonlit'] },
	sakura: { weight: 1, palettes: ['dawn', 'lavender', 'day', 'dusk', 'night', 'meadow'], fps: 14 },
	flow: { weight: 1, palettes: ALL, fps: 12 },
	lighthouse: { weight: 1, palettes: ['night', 'moonlit', 'dusk', 'storm', 'lavender', 'dawn'], fps: 15 },
	windmills: { weight: 1, palettes: ['day', 'meadow', 'dawn', 'autumn', 'dusk', 'lavender', 'moonlit'], fps: 12 },
	snow: { weight: 1, palettes: ['ice', 'night', 'dawn', 'lavender', 'moonlit', 'day', 'storm'], fps: 16 },
	rain: { weight: 1, palettes: ['storm', 'night', 'teal', 'lavender', 'dusk', 'moonlit'], fps: 20 },
	volcano: { weight: 1, palettes: ['ember', 'dusk', 'night', 'synth', 'storm'], fps: 12 },
	islands: { weight: 1, palettes: ['day', 'teal', 'dusk', 'dawn', 'meadow', 'lavender', 'moonlit'] },
	fireflies: { weight: 1, palettes: ['night', 'moonlit', 'dusk', 'lavender'], fps: 14 },
	lookout: { weight: 1.3, added: true, palettes: ['day', 'azure', 'dawn', 'dusk', 'autumn', 'ice', 'lavender', 'teal', 'ember', 'night', 'moonlit', 'storm'] },
	field: { weight: 1.3, added: true, palettes: ['azure', 'day', 'meadow', 'spring', 'dawn', 'dusk', 'autumn', 'lavender', 'night', 'moonlit'], fps: 15 },
	grove: { weight: 1.3, added: true, palettes: ['spring', 'meadow', 'autumn', 'day', 'dawn', 'dusk', 'lavender', 'night', 'moonlit'], fps: 10 },
};

const pickWeighted = (rand, entries) => {
	let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
	for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
	return entries[entries.length - 1][0];
};

/** A scene by the seed, and one of its palettes that suits the part of the day (any of them when period is null). */
function choose(rand, period, seed) {
	const all = Object.entries(SCENES), first = all.filter(([, s]) => !s.added), added = all.filter(([, s]) => s.added);
	let scene = pickWeighted(rand, first.map(([k, s]) => [k, s.weight]));
	// the scenes added later take their share by a draw of their own, so the stream above (and every other page) is as it was
	const late = mulberry(seed ^ 0x2545f491), share = added.reduce((sm, [, s]) => sm + s.weight, 0) / all.reduce((sm, [, s]) => sm + s.weight, 0);
	if (added.length && late() < share) scene = pickWeighted(late, added.map(([k, s]) => [k, s.weight]));
	const own = SCENES[scene].palettes, fit = period ? own.filter((p) => PERIODS[period].includes(p)) : own;
	const list = fit.length ? fit : own;
	return { scene, palette: list[(rand() * list.length) | 0] };
}

/** What a title gives: its seed, scene, palette and noise. */
function makeBanner(title, { variant = 0, period = null, scene: only = null } = {}) {
	const seed = fnv(fold(title.trim()) + (variant ? '#' + variant : ''));
	const R = mulberry(seed);
	let { scene, palette } = choose(R, period, seed);
	if (only && SCENES[only]) {
		scene = only;
		const own = SCENES[only].palettes, fit = period ? own.filter((p) => PERIODS[period].includes(p)) : own, list = fit.length ? fit : own;
		palette = list[(R() * list.length) | 0];
	}
	return { seed, scene, palette, id: `${seed}|${scene}|${palette}`, N: makeNoise(mulberry(seed ^ 0x9e3779b9)) };
}

// ---------------------------------------------------------------------------------------------------------- the parts

// The time of the frame being drawn, in seconds. Scenes place everything that moves by it, and take the same numbers from
// their random stream on every frame, so that only what moves moves.
let T = 0;
const TAU = Math.PI * 2;
const wrapX = (x, span) => ((x % span) + span) % span;
const unit = (h) => Math.max(1, h / 210);

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

// Where the sun (or the moon) of the frame is, for the clouds to be lit from its side; above the middle until one is drawn.
let SUN = { x: 0, y: 0 };
// The moon's phase in the frame: 0 new, 0.5 full.
let PHASE = 0.5;

/** The moon's phase on a day, from a known new moon (6 January 2000, 18:14 UTC) and the synodic month. */
const moonPhase = (d = new Date()) => { const p = ((d.getTime() / 864e5 - 10962.7597) / 29.530588853) % 1; return p < 0 ? p + 1 : p; };

// The moon's seas, as seen from the north: x, y and radius in moon radii.
const MARIA = [[-0.32, -0.36, 0.3], [0.14, -0.38, 0.18], [0.32, -0.04, 0.22], [0.64, -0.24, 0.11], [-0.56, 0.08, 0.3], [-0.16, 0.42, 0.18], [0.5, 0.26, 0.13]];

function sun(g, x, y, r, pal, glow = 0.45) {
	SUN = { x, y };
	if (pal.moon) { moon(g, x, y, r * 0.92, pal, glow); return; }
	const halo = g.createRadialGradient(x, y, r * 0.5, x, y, r * 7);
	halo.addColorStop(0, css(pal.sun, glow));
	halo.addColorStop(0.35, css(pal.sun, glow * 0.25));
	halo.addColorStop(1, css(pal.sun, 0));
	g.fillStyle = halo;
	g.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
	g.fillStyle = css(pal.sun);
	g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

/** The moon in tonight's phase: the lit part with its grey seas, the rest faint in earthshine, a halo as bright as it is full. */
function moon(g, x, y, r, pal, glow) {
	const k = Math.cos(PHASE * TAU), lit = (1 - k) / 2, waning = PHASE > 0.5;
	const halo = g.createRadialGradient(x, y, r * 0.9, x, y, r * 6.5);
	halo.addColorStop(0, css(pal.sun, glow * (0.2 + 0.8 * lit)));
	halo.addColorStop(0.3, css(pal.sun, glow * 0.22 * (0.2 + 0.8 * lit)));
	halo.addColorStop(1, css(pal.sun, 0));
	g.fillStyle = halo;
	g.fillRect(x - r * 6.5, y - r * 6.5, r * 13, r * 13);
	g.save();
	g.translate(x, y);
	g.fillStyle = css(mix(pal.sky[1], pal.sun, 0.14));
	g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
	// the lit part: half the disc on the sun's side, closed by the terminator, an ellipse as wide as the phase is far from a half
	if (waning) g.scale(-1, 1);
	g.beginPath();
	g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
	g.ellipse(0, 0, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
	g.closePath();
	g.fillStyle = css(pal.sun);
	g.fill();
	g.clip();
	if (waning) g.scale(-1, 1);
	g.filter = `blur(${Math.max(0.5, r * 0.08)}px)`;
	g.fillStyle = css(mix(pal.sun, pal.sky[1], 0.3), 0.55);
	for (const [mx, my, mr] of MARIA) { g.beginPath(); g.arc(mx * r, my * r, mr * r, 0, TAU); g.fill(); }
	g.filter = 'none';
	g.restore();
}

/** Stars, twinkling. */
function stars(g, w, h, rand, count, maxY, size) {
	for (let i = 0, k = count * w / (h * ASPECT); i < k; i++) {
		const x = rand() * w, y = Math.pow(rand(), 1.4) * maxY, s = size * (rand() < 0.08 ? 2 : 1);
		const a = 0.25 + rand() * 0.75 * (1 - y / maxY), tw = 0.6 + 0.4 * Math.sin(T * (0.8 + rand() * 2.2) + rand() * TAU);
		g.fillStyle = css(WHITE, a * tw);
		g.fillRect(x, y, s, s);
	}
}

/** Stars when the palette is a dark one; they take one number from the scene's stream either way, so that the rest of the
 * scene stays where it is whatever the time of day. */
function nightStars(g, w, h, R, pal, count, maxY, size) {
	const r = mulberry((R() * 4294967296) >>> 0);
	if (pal.dark) stars(g, w, h, r, count, maxY, size);
}

// ------------------------------------------------------------------------------------------------------------- clouds

/**
 * The colours a palette's clouds are lit in: the shadowed body, the half-lit and the lit puffs, the rim where the light
 * grazes the edge, and the shade gathering underneath. ly is where the light comes from (up -1, below +1), lean how much
 * it comes from the side the sun is on, fade how much a cloud far from the sun sinks into its shadow colour, bands how
 * many of the clouds are long thin bands instead of heaps.
 */
function cloudTones(pal, style = pal.clouds) {
	if (style === 'moon') return {
		shadow: mix(pal.sky[0], pal.sky[1], 0.8), mid: mix(pal.sky[1], pal.sky[2], 0.3), lit: mix(pal.sky[2], pal.sun, 0.35),
		rim: pal.sun, rimA: 0.85, under: mix(pal.sky[0], BLACK, 0.2), ly: -0.6, lean: 0.8, fade: 0.75, bands: 0.5,
	};
	if (style === 'glow') return {
		shadow: mix(mix(pal.sky[0], pal.sky[1], 0.65), pal.land[1], 0.2), mid: mix(pal.sky[1], pal.glow, 0.6), lit: mix(pal.glow, pal.sun, 0.6),
		rim: mix(pal.sun, WHITE, 0.3), rimA: 0.8, under: null, ly: 0.6, lean: 0.75, fade: 0.45, bands: 0.55,
	};
	if (style === 'storm') return {
		shadow: mix(pal.sky[0], pal.land[3], 0.25), mid: mix(pal.sky[0], pal.sky[1], 0.55), lit: mix(pal.sky[1], pal.sky[2], 0.35),
		rim: pal.sky[2], rimA: 0.3, under: mix(pal.sky[0], BLACK, 0.35), ly: -1, lean: 0.25, fade: 0, bands: 0.2,
	};
	return {
		shadow: mix(mix(pal.sky[1], pal.land[1], 0.35), WHITE, 0.25), mid: mix(pal.sky[2], WHITE, 0.6), lit: mix(WHITE, pal.sun, 0.5),
		rim: mix(WHITE, pal.sun, 0.5), rimA: 0.45, under: mix(pal.sky[1], pal.land[2], 0.35), ly: -1, lean: 0.4, fade: 0.1, bands: 0.3,
	};
}

/** The same tones, gone some way into the haze of the horizon. */
const hazed = (L, pal, k) => ({ ...L, shadow: mix(L.shadow, pal.sky[2], k), mid: mix(L.mid, pal.sky[2], k * 0.8), lit: mix(L.lit, pal.sky[2], k * 0.6), under: L.under && mix(L.under, pal.sky[2], k) });

// One canvas lent out for in-between work (a rim, a cross-fade); it grows to the largest size asked of it.
let SCRATCH = null;
function scratch(w, h) {
	if (!SCRATCH || SCRATCH.width < w || SCRATCH.height < h) SCRATCH = canvasOf(Math.max(w, SCRATCH?.width || 0), Math.max(h, SCRATCH?.height || 0));
	const c = SCRATCH.getContext('2d');
	c.setTransform(1, 0, 0, 1, 0, 0);
	c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
	c.clearRect(0, 0, w + 2, h + 2);   // and a little beyond: a drawImage from it at a fractional place samples its edge
	return c;
}

/** All the puffs as one path; each moved by (ox, oy) of its radius and (dx, dy) pixels, and its radius scaled by k. */
function puffPath(c, puffs, ox, oy, k, dx = 0, dy = 0) {
	c.beginPath();
	for (const p of puffs) {
		const sy = p.sy || 1, rx = p.r * k, x = p.x + ox * p.r + dx, y = p.y + oy * p.r * sy + dy;
		c.moveTo(x + rx, y);
		c.ellipse(x, y, rx, rx * sy, 0, 0, TAU);
	}
}

/**
 * Lights a heap of puffs drawn in c (W by H): the whole in shadow, then each puff again, smaller and moved towards the light,
 * half-lit and lit, so every puff is round with a dark seam where it meets the next; then the shade underneath and a thin
 * rim on the side the light comes from. `below`: points, left to right, through which the heap is solid down to the bottom
 * (a bank of cloud, not one cloud).
 */
function shadePuffs(c, W, H, puffs, L, lx, ly, u, below = null, top = 0, base = H) {
	const body = (cc, dx = 0, dy = 0) => {
		puffPath(cc, puffs, 0, 0, 1, dx, dy);
		if (!below) return;
		// clockwise, as the puffs are, so that the two add up
		cc.moveTo(below[0][0] + dx, H * 2);
		for (const [x, y] of below) cc.lineTo(x + dx, y + dy);
		cc.lineTo(below[below.length - 1][0] + dx, H * 2);
		cc.closePath();
	};
	c.save();
	body(c);
	c.fillStyle = css(L.shadow);
	c.fill();
	c.globalCompositeOperation = 'source-atop';
	if (!L.crisp) c.filter = `blur(${u * 1.4}px)`;
	puffPath(c, puffs, lx * 0.16, ly * 0.16, 0.92);
	c.fillStyle = css(L.mid);
	c.fill();
	if (!L.crisp) c.filter = `blur(${u * 1.1}px)`;
	puffPath(c, puffs, lx * 0.45, ly * 0.45, 0.66);
	c.fillStyle = css(L.lit);
	c.fill();
	c.filter = 'none';
	if (L.crisp) {   // flat as dabs of paint: a highlight on the lit tops, and pockets of shade in them
		puffPath(c, puffs, lx * 0.62, ly * 0.62, 0.36);
		c.fillStyle = css(L.hi);
		c.fill();
		c.beginPath();
		puffs.forEach((p, i) => {
			if (hash1(i * 7.13 + p.r) > L.pockets) return;
			const pr = p.r * (0.16 + hash1(i * 9.31) * 0.2), px = p.x + (hash1(i * 3.17) - 0.5) * p.r * 1.1, py = p.y + (hash1(i * 5.71) - 0.35) * p.r * 0.8;
			c.moveTo(px + pr, py); c.arc(px, py, pr, 0, TAU);
		});
		c.fillStyle = css(L.mid);
		c.fill();
	}
	if (L.under) {
		const gr = c.createLinearGradient(0, top + (base - top) * 0.45, 0, base);
		gr.addColorStop(0, css(L.under, 0)); gr.addColorStop(1, css(L.under, 0.5));
		c.fillStyle = gr;
		c.fillRect(0, 0, W, H);
	}
	// the rim: the shape, less itself moved away from the light
	const s = scratch(W, H), rw = u * 1.6;
	body(s);
	s.fillStyle = css(L.rim);
	s.fill();
	s.globalCompositeOperation = 'destination-out';
	body(s, -lx * rw, -ly * rw);
	s.fill();
	c.globalAlpha = L.rimA;
	c.drawImage(s.canvas, 0, 0, W, H, 0, 0, W, H);
	c.restore();
}

/** A heap: puffs along a flat base rising into one to three towers, with small lumps along its top. Coordinates from the
 * base's left end, y up being negative. */
function heapPuffs(r, W, least) {
	const puffs = [], towers = [];
	for (let i = 0, m = 1 + ((r() * 3) | 0); i < m; i++) towers.push([0.2 + r() * 0.6, 0.1 + r() * 0.14, 0.5 + r() * 0.5]);
	const env = (t) => {
		let e = 0.28;
		for (const [c, wd, ht] of towers) e = Math.max(e, ht * Math.exp(-((t - c) ** 2) / (2 * wd * wd)));
		return e * Math.min(1, 0.35 + t * 5, 0.35 + (1 - t) * 5);
	};
	const n = 7 + ((r() * 6) | 0);
	for (let i = 0; i < n; i++) {
		const t = (i + 0.5 + (r() - 0.5) * 0.5) / n, rad = Math.max(least * 1.5, W * (0.025 + 0.12 * env(t)) * (0.85 + r() * 0.3));
		puffs.push({ x: W * t, y: -rad * (0.45 + r() * 0.2), r: rad });
	}
	for (let i = 0, m = 6 + ((r() * 8) | 0); i < m; i++) {
		const p = puffs[(r() * n) | 0], a = -Math.PI * (0.15 + r() * 0.7);
		puffs.push({ x: p.x + Math.cos(a) * p.r * 0.75, y: p.y + Math.sin(a) * p.r * 0.75, r: Math.max(least, p.r * (0.28 + r() * 0.3)) });
	}
	for (let x = W * 0.05; x < W * 0.95; x += W * 0.045) puffs.push({ x, y: -W * 0.018, r: Math.max(least, W * (0.022 + r() * 0.014)), sy: 0.7 });
	return puffs;
}

/**
 * A tower: tiers of lobes, each tier narrower than the one under it and leaning a little, every lobe sprouting smaller ones
 * on its upper side and those smaller ones again, like a cauliflower; a flat base.
 */
function towerPuffs(r, W, least) {
	const puffs = [], tiers = 3 + ((r() * 3) | 0);
	const sprout = (x, y, rad, depth) => {
		puffs.push({ x, y, r: rad });
		if (!depth || rad < least * 2.2) return;
		for (let i = 0, n = 2 + ((r() * 3) | 0); i < n; i++) {
			const a = -Math.PI * (0.08 + r() * 0.84), d = rad * (0.75 + r() * 0.2);
			sprout(x + Math.cos(a) * d, y + Math.sin(a) * d, rad * (0.38 + r() * 0.24), depth - 1);
		}
	};
	let cx = W * 0.5, wd = W, y = 0;
	for (let j = 0; j < tiers; j++) {
		const rad = Math.max(least * 2, wd * 0.1);
		y -= rad * (j ? 1.8 : 0.7);
		for (let x = cx - wd / 2 + rad; x <= cx + wd / 2 - rad * 0.5; x += rad * (0.65 + r() * 0.45)) {
			sprout(x, y - r() * rad * 0.5, rad * (0.8 + r() * 0.4), j === tiers - 1 ? 3 : 2);
			if (j < tiers - 1 && r() < 0.6) puffs.push({ x: x + (r() - 0.5) * rad, y: y + rad * (0.4 + r() * 0.5), r: rad * (0.7 + r() * 0.3) });   // fill under
		}
		cx += (r() - 0.5) * wd * 0.35;
		wd *= 0.58 + r() * 0.22;
	}
	for (let x = W * 0.04; x < W * 0.96; x += W * 0.035) puffs.push({ x, y: -W * 0.015, r: Math.max(least, W * 0.024), sy: 0.7 });
	return puffs;
}

/** A band: a long, thin streak of flattened puffs, each overlapping the next, thickest in its middle, along a gentle wave,
 * with a few lumps on its back. */
function bandPuffs(r, W, least) {
	const puffs = [], wave = r() * TAU, thick = 0.03 + r() * 0.025;
	for (let x = W * 0.02; x < W * 0.98;) {
		const t = x / W, env = Math.pow(Math.sin(Math.PI * t), 0.6), rad = Math.max(least, W * thick * (0.3 + 0.7 * env) * (0.75 + r() * 0.5));
		puffs.push({ x, y: -rad * 0.4 + Math.sin(t * 5 + wave) * W * 0.01, r: rad, sy: 0.45 });
		x += rad * (0.6 + r() * 0.5);
	}
	for (let i = 0, n = puffs.length, m = 3 + ((r() * 5) | 0); i < m; i++) {
		const p = puffs[((0.2 + r() * 0.6) * n) | 0];
		puffs.push({ x: p.x + (r() - 0.5) * p.r, y: p.y - p.r * 0.3, r: p.r * (0.7 + r() * 0.4), sy: 0.55 });
	}
	return puffs;
}

/** A sum of a few sines that repeats every `span`: heights along a bank that wraps round. */
const periodic = (r, span) => {
	const waves = [1, 2, 3, 5, 8, 13].map((k) => [k, r() * TAU, (0.5 + r()) / Math.sqrt(k)]), norm = waves.reduce((sm, [, , a]) => sm + a, 0);
	return (x) => 0.5 + 0.5 * waves.reduce((sm, [k, ph, a]) => sm + a * Math.sin((x / span) * k * TAU + ph), 0) / norm;
};

/**
 * A bank of cloud as wide as the picture, wrapping round as it drifts: lumps of size r0 along its top over a solid body,
 * lit from (lx, ly), darkening downwards. Drawn once into a canvas w wide and `deep` tall; its lumps' tops are near `lump`
 * from the canvas' top.
 */
function bankSprite(r, w, deep, r0, L, lx, ly, u) {
	const rise = r0 * (1.6 + r() * 1.2), top = r0 * 1.5 + rise, hgt = periodic(r, w), main = [], lumps = [];
	for (let x = 0; x < w;) {
		const e = hgt(x), rad = r0 * (0.5 + 0.7 * e) * (0.75 + r() * 0.5), y = top - rise * e + rad * 0.3;
		main.push({ x, y, r: rad });
		if (r() < 0.55) lumps.push({ x: x + (r() - 0.5) * rad, y: y - rad * (0.5 + r() * 0.3), r: rad * (0.35 + r() * 0.3) });
		x += rad * (0.65 + r() * 0.55);
	}
	// drawn with a margin each side, so the blur of the lighting does not fade the edges where the bank meets itself
	const m = Math.ceil(r0 * 3), wrap = (list) => list.flatMap((p) => [-w, 0, w].map((k) => ({ ...p, x: p.x + k + m }))).filter((p) => p.x > -r0 * 3 && p.x < w + m * 2 + r0 * 3);
	const body = wrap(main).sort((a, b) => a.x - b.x), puffs = [...body, ...wrap(lumps)];
	const c = canvasOf(w + m * 2, Math.ceil(deep)), cg = c.getContext('2d');
	shadePuffs(cg, c.width, c.height, puffs, L, lx, ly, u, body.map((p) => [p.x, p.y]));
	const gr = cg.createLinearGradient(0, top + r0, 0, c.height);
	gr.addColorStop(0, css(L.shadow, 0)); gr.addColorStop(1, css(mix(L.shadow, BLACK, 0.1), 0.6));
	cg.globalCompositeOperation = 'source-atop';
	cg.fillStyle = gr;
	cg.fillRect(0, 0, c.width, c.height);
	return { c, top, m, w };
}

/** Draws a bank sprite wrapped round at offset x (and upside down, hanging from y, when `hang`). */
function drawBank(g, w, bank, x, y, hang = false) {
	const off = wrapX(x, w);
	g.save();
	if (hang) { g.translate(0, y); g.scale(1, -1); g.translate(0, -y); }
	const { c, m } = bank, H = c.height;
	g.drawImage(c, m, 0, w, H, off - w, y - bank.top, w, H);
	g.drawImage(c, m, 0, w, H, off, y - bank.top, w, H);
	g.restore();
}

/** A cloud drawn once into its own canvas, lit from (lx, ly); `by` is its base's height in it. */
function cloudSprite(puffs, L, lx, ly, u) {
	let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
	for (const p of puffs) { x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r); y0 = Math.min(y0, p.y - p.r * (p.sy || 1)); }
	const pad = Math.ceil(u * 4), W = Math.ceil(x1 - x0) + pad * 2, by = Math.ceil(-y0) + pad, H = by + pad;
	const c = canvasOf(W, H), cg = c.getContext('2d'), moved = puffs.map((p) => ({ ...p, x: p.x - x0 + pad, y: p.y + by }));
	cg.beginPath(); cg.rect(0, 0, W, by + u * 0.5); cg.clip();   // a flat underside
	shadePuffs(cg, W, H, moved, L, lx, ly, u, null, pad, by);
	return { c, by };
}

/**
 * Clouds drifting with the wind: heaps and long bands, the far ones low, small and pale, each lit from the side the sun or
 * the moon is on (they are drawn lit from the left and from the right, and cross-fade as they pass it) and sinking into
 * their shadow colour away from it. Their shapes are drawn once per picture. `overcast`: a low ceiling of cloud instead.
 */
function clouds(g, w, h, S, pal, horizon, n, { style = pal.clouds, overcast = false, crisp = false, low = false, size = 1, name = 'clouds' } = {}) {
	const U = h * ASPECT, u = unit(h), L0 = cloudTones(pal, style);
	const L = crisp ? { ...L0, crisp: true, mid: mix(L0.mid, L0.shadow, 0.3), hi: mix(L0.lit, pal.dark ? pal.sun : WHITE, pal.dark ? 0.25 : 0.45), pockets: 0, rimA: L0.rimA * (pal.dark ? 1 : 0.4), under: L0.under && mix(L0.under, L0.shadow, 0.5) } : L0;
	if (overcast) {   // banks upside down, their lumps hanging, lit from below; the lower ones farther and paler
		const decks = S.memo(name, (r) => [0, 1, 2].map((i) => bankSprite(r, w, h * 0.75, h * (0.04 + i * 0.018), hazed(L, pal, 0.35 - i * 0.17), 0, -1, u)));
		decks.forEach((d, i) => drawBank(g, w, d, T * h * (0.004 + i * 0.006), horizon * (0.55 - i * 0.17), true));
		return;
	}
	const set = S.memo(name, (r) => {
		const list = [], dir = r() < 0.5 ? 1 : -1;
		for (let i = 0, k = Math.max(1, Math.round(n * 1.4 * w / U)); i < k; i++) {
			const z = r(), band = !low && r() < L.bands * (1.2 - z * 0.6);
			const W = U * (low ? 0.22 + r() * 0.3 : band ? 0.22 + r() * 0.25 : 0.12 + r() * 0.16) * (0.5 + z * 0.7) * size;
			const puffs = low ? towerPuffs(r, W, u * 2) : band ? bandPuffs(r, W, u * 2.4) : heapPuffs(r, W, u * 2);
			list.push({
				z, at: r(), sp: h * (0.003 + z * 0.012) * dir * (low ? 0.5 : 1),
				y: low ? horizon * (1.01 + r() * 0.05) : horizon * (band ? 0.22 + (1 - z) * 0.55 : 0.2 + (1 - z) * 0.42),
				left: cloudSprite(puffs, L, -L.lean, L.ly, u), right: cloudSprite(puffs, L, L.lean, L.ly, u),
			});
		}
		return list.sort((a, b) => a.z - b.z);
	});
	for (const cl of set) {
		const { c, by } = cl.left, cw = c.width, ch = c.height, span = w + cw;
		const x = wrapX(cl.at * span + T * cl.sp, span) - cw, y = (low ? cl.y + cw * 0.05 : Math.max(cl.y, by * 0.85)) - by, cx = x + cw / 2;
		const t = Math.max(0, Math.min(1, 0.5 + (SUN.x - cx) / (w * 0.5))), right = t * t * (3 - 2 * t);
		const far = Math.min(1, Math.hypot((SUN.x - cx) / (w * 0.45), (SUN.y - cl.y) / (h * 1.2)));
		const s = scratch(cw, ch);
		s.drawImage(c, 0, 0);
		s.globalAlpha = right;
		s.drawImage(cl.right.c, 0, 0);
		if (L.fade) {
			s.globalAlpha = L.fade * far * far * (3 - 2 * far);
			s.globalCompositeOperation = 'source-atop';
			s.fillStyle = css(L.shadow);
			s.fillRect(0, 0, cw, ch);
			s.globalCompositeOperation = 'source-over';
		}
		g.globalAlpha = low ? 0.8 + 0.2 * cl.z : 0.6 + 0.4 * cl.z;
		g.drawImage(s.canvas, 0, 0, cw, ch, x, y, cw, ch);
		g.globalAlpha = 1;
	}
}

/** Now and then a few birds (or `many`) cross the sky. */
function birds(g, w, h, rand, color, yMax, many = 0) {
	const period = 45 + rand() * 50, phase = rand() * period, y0 = yMax * (0.25 + rand() * 0.45), few = 3 + ((rand() * 4) | 0), dir = rand() < 0.5 ? 1 : -1, n = many || few;
	const flock = [];
	for (let i = 0; i < n; i++) flock.push([rand(), rand(), rand()]);
	const p = ((T + phase) % period) / (period * 0.45);
	if (p >= 1) return;
	const u = unit(h), x0 = dir > 0 ? -w * 0.05 + p * w * 1.1 : w * 1.05 - p * w * 1.1;
	g.strokeStyle = css(color, 0.75); g.lineWidth = u; g.lineCap = 'round';
	flock.forEach(([a, b, c], i) => {
		const s = u * (2.5 + c * 1.5), x = x0 - dir * (i * h * 0.04 + a * h * 0.03), y = y0 + (b - 0.5) * h * 0.08 + Math.sin(p * 5 + i) * h * 0.01;
		const flap = Math.sin(T * 7 + i * 1.7) * 0.6;
		g.beginPath(); g.moveTo(x - s, y - s * flap); g.quadraticCurveTo(x - s * 0.4, y - s * 0.3, x, y); g.quadraticCurveTo(x + s * 0.4, y - s * 0.3, x + s, y - s * flap); g.stroke();
	});
}

/** Soft wisps of fog drifting along a height. */
function wisps(g, w, h, rand, y, color, n, alpha) {
	const U = h * ASPECT;
	for (let i = 0, k = n * w / U; i < k; i++) {
		const len = U * (0.1 + rand() * 0.2), span = w + len * 2, sp = h * (0.008 + rand() * 0.012) * (rand() < 0.5 ? -1 : 1);
		const x = wrapX(rand() * span + T * sp, span) - len, yy = y + (rand() - 0.5) * h * 0.06, a = alpha * (0.5 + rand() * 0.5);
		g.save();
		g.translate(x, yy); g.scale(1, 0.12);
		const gr = g.createRadialGradient(0, 0, 0, 0, 0, len * 0.5);
		gr.addColorStop(0, css(color, a)); gr.addColorStop(1, css(color, 0));
		g.fillStyle = gr; g.fillRect(-len * 0.5, -len * 0.5, len, len);
		g.restore();
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
	g.beginPath(); g.arc(x, y - height * 0.62, height * 0.32, 0, TAU); g.fill();
}

/** Water below the horizon: the sun's path shimmering on it, and waves drifting towards the shore. */
function water(g, w, h, R, pal, horizon, sx, sr) {
	const wg = g.createLinearGradient(0, horizon, 0, h);
	wg.addColorStop(0, css(mix(pal.land[0], pal.sky[2], 0.5)));
	wg.addColorStop(1, css(pal.land[3]));
	g.fillStyle = wg;
	g.fillRect(0, horizon, w, h - horizon);
	let row = 0;
	for (let y = horizon + 2; y < h; y += Math.max(2, (y - horizon) * 0.08), row++) {
		const d = (y - horizon) / (h - horizon), jitter = R(), off = R();
		const shimmer = 0.55 + 0.45 * Math.sin(T * (1.2 + jitter) + row * 1.3);
		const half = sr * (0.6 + d * 2.2) * (0.5 + jitter) * shimmer;
		g.fillStyle = css(pal.sun, 0.7 * (1 - d * 0.6));
		g.fillRect(sx - half + (off - 0.5) * sr + Math.sin(T * 0.7 + row) * sr * 0.2, y, half * 2, Math.max(1, h * 0.004 * (1 + d * 2)));
	}
	const wave = mix(pal.sky[2], WHITE, 0.2), U = h * ASPECT;
	for (let i = 0, k = 140 * w / U; i < k; i++) {
		const d = Math.pow(R(), 1.6), y = horizon + d * (h - horizon), len = U * (0.005 + d * 0.03), span = w + len;
		const x = wrapX(R() * span + T * h * (0.01 + d * 0.05), span) - len;
		g.fillStyle = css(wave, 0.12 + 0.2 * R());
		g.fillRect(x, y, len, Math.max(1, h * 0.003 * (1 + d)));
	}
}

/**
 * A Dutch mill s tall, standing at (x, base): a brick foot, a gallery round it on struts, a tapering smock lit on the sun's
 * side, a boat-shaped cap, and four lattice sails turned to `turn`; a lit window at night when `lamp`.
 */
function windmill(g, x, base, s, color, pal, turn, u, lamp) {
	const side = SUN.x >= x ? 1 : -1, lit = mix(color, pal.sun, pal.dark ? 0.1 : 0.16), deep = mix(color, BLACK, 0.12);
	const lw = Math.max(1, s * 0.012), detail = s > 30 * u;
	const footW = s * 0.17, footH = s * 0.17, galY = base - footH, botW = s * 0.15, topW = s * 0.075, topY = base - s * 0.62;
	// the foot
	g.fillStyle = css(deep);
	g.fillRect(x - footW, galY, footW * 2, footH);
	// the smock: slightly hollow sides, the lit half a shade lighter
	const smock = new Path2D();
	smock.moveTo(x - botW, galY);
	smock.quadraticCurveTo(x - botW * 0.82, (galY + topY) / 2, x - topW, topY);
	smock.lineTo(x + topW, topY);
	smock.quadraticCurveTo(x + botW * 0.82, (galY + topY) / 2, x + botW, galY);
	smock.closePath();
	g.fillStyle = css(color); g.fill(smock);
	g.save(); g.clip(smock);
	g.fillStyle = css(lit); g.fillRect(side > 0 ? x + botW * 0.15 : x - botW * 1.2, topY, botW * 1.05, galY - topY);
	if (detail) {   // the edges of its eight sides
		g.fillStyle = css(deep, 0.5);
		for (const f of [-0.55, 0.15]) g.fillRect(x + botW * f, topY, lw, galY - topY);
	}
	g.restore();
	// door and window
	g.fillStyle = css(mix(deep, BLACK, 0.3));
	g.fillRect(x - s * 0.025, base - s * 0.09, s * 0.05, s * 0.09);
	const wy = galY - (galY - topY) * 0.55, ws = Math.max(1, s * 0.03);
	if (lamp) {
		const warm = hex('#ffcf7a');
		glow(g, x, wy, s * 0.08, warm, 0.35);
		g.fillStyle = css(warm, 0.95);
	}
	g.fillRect(x - ws / 2, wy - ws / 2, ws, ws * 1.3);
	// the gallery: a deck, a railing and struts
	const gw = s * 0.27;
	g.fillStyle = css(deep);
	g.fillRect(x - gw, galY - lw, gw * 2, lw * 1.6);
	if (detail) {
		g.fillRect(x - gw, galY - s * 0.045, gw * 2, Math.max(1, lw * 0.7));
		for (let px = -gw; px <= gw + 0.1; px += gw / 4) g.fillRect(x + px - lw / 2, galY - s * 0.045, Math.max(1, lw * 0.7), s * 0.045);
		g.strokeStyle = css(deep); g.lineWidth = Math.max(1, lw * 0.8);
		g.beginPath();
		for (const sd of [-1, 1]) { g.moveTo(x + sd * gw * 0.9, galY); g.lineTo(x + sd * footW, galY + footH * 0.45); }
		g.stroke();
	}
	// the cap
	g.fillStyle = css(color);
	g.beginPath(); g.ellipse(x, topY + 1, topW * 1.45, s * 0.075, 0, Math.PI, TAU); g.fill();
	g.fillStyle = css(lit, 0.8);
	g.beginPath(); g.ellipse(x + side * topW * 0.5, topY - s * 0.02, topW * 0.6, s * 0.035, 0, Math.PI, TAU); g.fill();
	// the sails: a stock through the hub, and on each arm a frame of laths with cloth between
	const hx = x, hy = topY - s * 0.025, L = s * 0.56, sw = s * 0.1, cloth = mix(color, pal.sky[2], pal.dark ? 0.1 : 0.3);
	for (let a = 0; a < 4; a++) {
		const an = turn + a * TAU / 4, dx = Math.cos(an), dy = Math.sin(an), px = -dy * sw, py = dx * sw;
		const p0x = hx + dx * L * 0.16, p0y = hy + dy * L * 0.16, p1x = hx + dx * L, p1y = hy + dy * L;
		g.fillStyle = css(cloth, detail ? 0.28 : 0.75);
		g.beginPath(); g.moveTo(p0x, p0y); g.lineTo(p1x, p1y); g.lineTo(p1x + px, p1y + py); g.lineTo(p0x + px, p0y + py); g.closePath(); g.fill();
		g.strokeStyle = css(color); g.lineCap = 'butt';
		if (detail) {
			g.lineWidth = Math.max(1, lw * 0.7);
			g.beginPath();
			g.moveTo(p0x + px, p0y + py); g.lineTo(p1x + px, p1y + py); g.lineTo(p1x, p1y);
			g.moveTo(p0x + px * 0.5, p0y + py * 0.5); g.lineTo(p1x + px * 0.5, p1y + py * 0.5);
			for (let k = 0; k <= 7; k++) {
				const q = 0.16 + 0.84 * k / 7, bx = hx + dx * L * q, by = hy + dy * L * q;
				g.moveTo(bx, by); g.lineTo(bx + px, by + py);
			}
			g.stroke();
		}
		g.lineWidth = Math.max(1, s * 0.018);
		g.beginPath(); g.moveTo(hx, hy); g.lineTo(p1x, p1y); g.stroke();
	}
	g.fillStyle = css(deep);
	g.beginPath(); g.arc(hx, hy, Math.max(1, s * 0.022), 0, TAU); g.fill();
}

/**
 * A fir cut out of paper, added to the current path: a tall narrow spire of drooping tiers, a little ragged by `seed`, on a
 * short trunk, its foot at (x, y). Clockwise like the rest, so that a row of them fills as one.
 */
function firPath(g, x, y, ht, seed, wide = 0.34) {
	const tiers = 7, wd = ht * wide, tip = y - ht, trunk = Math.max(0.5, ht * 0.025), droop = ht * 0.035, back = ht * 0.008;
	const half = (k, side) => wd * 0.5 * Math.pow(k / tiers, 0.9) * (0.8 + 0.4 * hash1(seed + k * 1.7 + side * 9.1));
	const at = (k) => tip + ht * 0.86 * (k / tiers);
	g.moveTo(x, tip);
	for (let k = 1; k <= tiers; k++) {
		const hw = half(k, 1);
		g.lineTo(x + hw, at(k) + droop);
		if (k < tiers) g.lineTo(x + hw * 0.38, at(k) - back);
	}
	g.lineTo(x + trunk, at(tiers)); g.lineTo(x + trunk, y); g.lineTo(x - trunk, y); g.lineTo(x - trunk, at(tiers));
	for (let k = tiers; k >= 1; k--) {
		const hw = half(k, -1);
		g.lineTo(x - hw, at(k) + droop);
		if (k > 1) g.lineTo(x - half(k - 1, -1) * 0.38, at(k - 1) - back);
	}
	g.closePath();
}

/**
 * A fire lookout th tall at (x, base), as a silhouette: splayed legs braced in X's, a cabin with a row of windows (filled
 * with `glass`) on a railed catwalk, a pyramid roof and an aerial. Returns its windows and where its wires leave it.
 */
function lookoutTower(g, x, base, th, color, glass, u) {
	const lw = Math.max(1, th * 0.012), bw = th * 0.2, tw = th * 0.11, top = base - th * 0.72, cw = th * 0.26, ch = th * 0.15;
	const legX = (side, q) => x + side * (bw + (tw - bw) * q), legY = (q) => base + (top - base) * q;
	g.strokeStyle = css(color); g.fillStyle = css(color); g.lineCap = 'butt';
	g.lineWidth = lw * 1.8;
	g.beginPath();
	for (const sd of [-1, 1]) { g.moveTo(legX(sd, 0), base); g.lineTo(legX(sd, 1), top); }
	g.stroke();
	g.lineWidth = lw;
	g.beginPath();
	const qs = [0, 0.3, 0.55, 0.78, 1];
	for (let i = 0; i < qs.length - 1; i++) {
		const a = qs[i], b = qs[i + 1];
		g.moveTo(legX(-1, a), legY(a)); g.lineTo(legX(1, b), legY(b));
		g.moveTo(legX(1, a), legY(a)); g.lineTo(legX(-1, b), legY(b));
		g.moveTo(legX(-1, b), legY(b)); g.lineTo(legX(1, b), legY(b));
	}
	g.stroke();
	// the catwalk, its railing and posts
	const deck = cw * 0.68, rail = top - ch * 0.38, post = Math.max(1, lw * 0.8);
	g.fillRect(x - deck, top - lw, deck * 2, lw * 2.2);
	g.fillRect(x - deck, rail, deck * 2, post);
	for (let k = 0; k <= 8; k++) g.fillRect(x - deck + deck * 2 * k / 8 - post / 2, rail, post, ch * 0.38);
	// the cabin, its windows, the roof and the aerial
	const cx = x - cw / 2, cy = top - ch, nw = 4, gap = cw * 0.06, ww = (cw - gap * (nw + 1)) / nw, wy = cy + ch * 0.16, wh = ch * 0.38;
	g.fillRect(cx, cy, cw, ch);
	const wins = [];
	g.fillStyle = css(glass);
	for (let k = 0; k < nw; k++) { const wx = cx + gap + k * (ww + gap); wins.push([wx, wy, ww, wh]); g.fillRect(wx, wy, ww, wh); }
	g.fillStyle = css(color);
	g.beginPath(); g.moveTo(x - cw * 0.66, cy + lw); g.lineTo(x + cw * 0.66, cy + lw); g.lineTo(x + cw * 0.12, cy - ch * 0.45); g.lineTo(x - cw * 0.12, cy - ch * 0.45); g.closePath(); g.fill();
	g.fillRect(x - lw / 2, cy - ch * 1.05, lw, ch * 0.62);
	g.fillRect(x - lw * 2, cy - ch * 0.95, lw * 4, post);
	return { wins, wires: [[cx, cy + ch * 0.55], [cx + cw, cy + ch * 0.55]] };
}

/**
 * A tree as pixel art, drawn once into a sprite: a fir is a spire of clumps of needles on a short trunk, a bush a dome of
 * leaf clumps; the clumps are lit as cloud puffs are, crisp (flat tones, a highlight, pockets of shade), from the side lx.
 * Draw it with its foot at (ax, by).
 */
function foliage(r, kind, ht, L, lx, u) {
	const puffs = [], cl = Math.max(u * 1.5, ht * (kind === 'fir' ? 0.045 : 0.065));
	if (kind === 'fir') {
		const wd = ht * 0.56, levels = Math.max(3, Math.ceil(ht * 0.95 / (cl * 0.7)));
		for (let k = 0; k < levels; k++) {
			const q = k / (levels - 1), y = -ht * 0.1 - ht * 0.9 * q, half = wd * 0.5 * Math.pow(1 - q, 0.85) + cl * 0.4;
			for (let x = -half; x <= half + 0.01; x += cl * (0.7 + r() * 0.4)) puffs.push({ x: x + (r() - 0.5) * cl * 0.6, y: y + (r() - 0.5) * cl * 0.7, r: cl * (0.7 + r() * 0.5) });
		}
	} else {
		const rx = ht * 0.6, ry = ht * 0.5;
		for (let k = 0, n = Math.ceil((rx * ry) / (cl * cl) * 2.4); k < n; k++) {
			const a = r() * TAU, d = Math.sqrt(r());
			puffs.push({ x: Math.cos(a) * d * rx, y: -ry * 0.92 + Math.sin(a) * d * ry, r: cl * (0.7 + r() * 0.6) });
		}
	}
	let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
	for (const p of puffs) { x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r); y0 = Math.min(y0, p.y - p.r); }
	const pad = Math.ceil(u * 3), ax = Math.ceil(-x0) + pad, by = Math.ceil(-y0) + pad, W = ax + Math.ceil(x1) + pad, H = by + pad;
	const c = canvasOf(W, H), cg = c.getContext('2d'), seed = r() * 100;
	cg.beginPath();
	if (kind === 'fir') firPath(cg, ax, by, ht, seed, 0.5); else cg.rect(0, 0, W, by);   // a fir's spire of tiers; nothing below the ground
	cg.clip();
	shadePuffs(cg, W, H, puffs.map((p) => ({ ...p, x: p.x + ax, y: p.y + by })), L, lx, -0.75, u);
	if (kind === 'fir') {
		cg.globalCompositeOperation = 'destination-over';
		cg.fillStyle = css(mix(L.shadow, BLACK, 0.3));
		cg.fillRect(ax - cl * 0.35, by - ht * 0.2, cl * 0.7, ht * 0.2);
	}
	return { c, ax, by };
}

/** Fills under a line y = f(x) down to the bottom. */
function fillUnder(g, w, h, f, step = 2) {
	g.beginPath(); g.moveTo(0, h);
	for (let x = 0; x <= w + step; x += step) g.lineTo(x, f(x));
	g.lineTo(w, h); g.closePath();
	g.fill();
}

/** A soft round glow. */
function glow(g, x, y, r, color, alpha) {
	const gr = g.createRadialGradient(x, y, 0, x, y, r);
	gr.addColorStop(0, css(color, alpha)); gr.addColorStop(1, css(color, 0));
	g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

// --------------------------------------------------------------------------------------------------------- the scenes

const DRAW = {
	mountains(g, w, h, R, N, pal, S) {
		const horizon = h * (0.5 + R() * 0.1);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.7, unit(h));
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.35 + R() * 0.45), h * (0.05 + R() * 0.03), pal);
		clouds(g, w, h, S, pal, horizon, 2 + ((R() * 4) | 0));
		const layers = 5, trees = R() < 0.5, flock = R() < 0.6;
		for (let i = 0; i < layers; i++) {
			const t = i / (layers - 1);
			const color = mix(landAt(pal, t), pal.sky[2], (1 - t) * 0.35);
			const base = h * (0.42 + t * 0.4), amp = h * (0.3 - t * 0.17);
			const f = ridge(g, w, h, { base, amp, freq: 2 + t * 2.6, phase: R() * 50, sharp: i < 3, color, N });
			if (trees && i === layers - 1) {
				for (let x = R() * 20; x < w; x += h * ASPECT * (0.006 + R() * 0.012)) pine(g, x, f(x) + h * 0.02, h * (0.05 + R() * 0.07), color);
			}
			if (i < layers - 1) {
				mist(g, w, base + h * 0.02, h * 0.16, pal.sky[2], 0.25);
				wisps(g, w, h, R, base, pal.sky[2], 2, 0.35);
			}
		}
		if (flock) birds(g, w, h, R, landAt(pal, 1), horizon);
	},

	hills(g, w, h, R, N, pal, S) {
		const horizon = h * (0.55 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.7, unit(h));
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.3 + R() * 0.5), h * (0.05 + R() * 0.03), pal);
		clouds(g, w, h, S, pal, horizon, 3 + ((R() * 4) | 0));
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
		birds(g, w, h, R, landAt(pal, 1), horizon);
	},

	sea(g, w, h, R, N, pal, S) {
		const horizon = h * (0.56 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, unit(h));
		const sx = w * (0.2 + R() * 0.6), sr = h * (0.05 + R() * 0.03), sy = horizon - sr * (1.2 + R() * 4);
		sun(g, sx, sy, sr, pal, 0.55);
		clouds(g, w, h, S, pal, horizon, 2 + ((R() * 4) | 0));
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
		water(g, w, h, R, pal, horizon, sx, sr);
		if (R() < 0.6) {   // a sail, bobbing and moving slowly on
			const s = h * (0.05 + R() * 0.04), span = w + s * 2;
			const bx = wrapX(sx + (R() < 0.5 ? -1 : 1) * h * ASPECT * (0.08 + R() * 0.2) + T * s * 0.05, span) - s;
			const by = horizon + (h - horizon) * (0.15 + R() * 0.3) + Math.sin(T * 1.1) * s * 0.06, tilt = Math.sin(T * 0.9 + 1) * 0.04;
			g.save(); g.translate(bx, by); g.rotate(tilt);
			g.fillStyle = css(pal.land[3]);
			g.beginPath(); g.moveTo(-s * 0.5, 0); g.lineTo(s * 0.5, 0); g.lineTo(s * 0.35, s * 0.15); g.lineTo(-s * 0.35, s * 0.15); g.fill();
			g.fillStyle = css(mix(pal.sun, pal.sky[2], 0.3));
			g.beginPath(); g.moveTo(0, -s * 1.1); g.lineTo(s * 0.45, -s * 0.05); g.lineTo(0, -s * 0.05); g.fill();
			g.restore();
		}
		birds(g, w, h, R, landAt(pal, 1), horizon);
	},

	dunes(g, w, h, R, N, pal, S) {
		const horizon = h * (0.55 + R() * 0.06), u = unit(h);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 160, horizon * 0.8, u);
		sun(g, w * (0.2 + R() * 0.6), horizon * (0.45 + R() * 0.4), h * (0.07 + R() * 0.05), pal, 0.6);
		const lit = R() < 0.5 ? 1 : -1;   // the side the sun lights, and the wind
		for (let i = 0; i < 4; i++) {
			const t = i / 3, color = mix(landAt(pal, t), pal.sky[2], (1 - t) * 0.3);
			const base = h * (0.6 + t * 0.3), amp = h * (0.22 + R() * 0.1 - t * 0.06);
			const phase = R() * 50, freq = 1.8 + t * 1.4, sk = 0.35 * lit;
			// a dune's crest leans away from the wind: a skewed bump
			const f = (x) => { const u2 = x / (h * ASPECT) * freq + phase, v = N.fbm1(u2 + sk * N.n1(u2 * 2), 2); return base - amp * 1.6 * Math.pow(v, 2.2); };
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
			// sand blown off the crest
			const grain = mix(color, pal.sun, 0.5);
			for (let k = 0, n = 50 * w / (h * ASPECT); k < n; k++) {
				const x0 = R() * w, ph = R(), sp = 0.3 + R() * 0.4, p = (T * sp + ph) % 1;
				const x = x0 + lit * p * h * 0.25, y = f(x0) - p * h * 0.05 - Math.sin(p * 3) * h * 0.012;
				g.fillStyle = css(grain, (1 - p) * 0.55 * Math.min(1, p * 8));
				g.fillRect(x, y, u, u);
			}
		}
	},

	forest(g, w, h, R, N, pal, S) {
		const horizon = h * (0.5 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, unit(h));
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
			if (i < rows - 1) {
				mist(g, w, base + h * 0.03, h * 0.12, pal.sky[2], 0.35);
				wisps(g, w, h, R, base - h * 0.02, pal.sky[2], 3, 0.45);
			}
		}
		birds(g, w, h, R, landAt(pal, 1), horizon);
	},

	city(g, w, h, R, N, pal, S) {
		const horizon = h * (0.6 + R() * 0.08), u = unit(h);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 120, horizon * 0.8, u);
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.3 + R() * 0.4), h * (0.05 + R() * 0.03), pal);
		clouds(g, w, h, S, pal, horizon, 2);
		// an aeroplane crossing now and then, its light blinking
		const pp = 70 + R() * 60, pph = R() * pp, py = horizon * (0.15 + R() * 0.3), pdir = R() < 0.5 ? 1 : -1;
		const p = ((T + pph) % pp) / (pp * 0.6);
		if (p < 1) {
			const x = pdir > 0 ? -w * 0.05 + p * w * 1.1 : w * 1.05 - p * w * 1.1;
			g.fillStyle = css(WHITE, 0.8); g.fillRect(x, py, u, u);
			if ((T * 1.3) % 1 < 0.15) glow(g, x - pdir * u * 3, py, u * 4, [255, 90, 90], 0.9);
		}
		const lit = pal.dark ? 0.85 : 0.35;
		let wi = 0;
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
							// a window that was lit may go dark for a while, a dark one now and then lights up
							const r1 = R(), r2 = R(), a = R(), turn = Math.floor((T + r2 * 90) / (25 + r2 * 50));
							const on = r1 < 0.35 ? hash1(wi * 3.7 + turn) < 0.85 : hash1(wi * 5.3 + turn) < 0.04;
							wi++;
							if (on) { g.fillStyle = css(pal.glow, lit * (0.4 + a * 0.6)); g.fillRect(wx, wy, cell * 0.8, cell); }
						}
					}
				}
				x += bw + (R() < 0.3 ? h * ASPECT * R() * 0.03 : 0);
			}
			if (i < 2) mist(g, w, horizon + h * t * 0.14, h * 0.18, pal.sky[2], 0.3);
		}
	},

	grid(g, w, h, R, N, pal, S) {
		const horizon = h * (0.58 + R() * 0.06);
		sky(g, w, h, pal, horizon);
		stars(g, w, h, R, 90, horizon * 0.7, unit(h));
		const sx = w * (0.3 + R() * 0.4), sr = h * (0.2 + R() * 0.08), sy = horizon - sr * (0.35 + R() * 0.3);
		g.save();
		g.beginPath(); g.rect(0, 0, w, horizon); g.clip();
		const halo = g.createRadialGradient(sx, sy, sr * 0.8, sx, sy, sr * 2.6);
		halo.addColorStop(0, css(pal.glow, 0.35)); halo.addColorStop(1, css(pal.glow, 0));
		g.fillStyle = halo; g.fillRect(0, 0, w, horizon);
		g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.clip();
		const disc = g.createLinearGradient(0, sy - sr, 0, sy + sr);
		disc.addColorStop(0, css(pal.sun)); disc.addColorStop(1, css(pal.glow));
		g.fillStyle = disc; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
		for (let k = 0; k < 7; k++) {   // stripes cut out of its lower half, thicker towards the bottom, sinking slowly
			const y = sy + sr * (0.05 + ((k + (T * 0.08) % 1) * 0.14)), th = sr * (0.015 + k * 0.012);
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
		// the floor runs towards us
		for (let i = 0; i < 14; i++) { const y = horizon + (h - horizon) * Math.pow((i + (T * 0.25) % 1) / 14, 2.2); line(0, y, w, y); }
		const span = Math.ceil(w / (h * ASPECT * 0.09)) + 4;
		for (let j = -span; j <= span; j++) line(vx + j * h * ASPECT * 0.012, horizon, vx + j * h * ASPECT * 0.09, h);
		mist(g, w, horizon + h * 0.03, h * 0.05, pal.glow, 0.35);
	},

	topo(g, w, h, R, N, pal, S) {
		// a height field of a few large, calm forms with thin contour lines (every fifth one stronger), lit by a sun that
		// goes slowly round it
		const sc = 0.8 + R() * 0.5, ox = R() * 100, oy = R() * 100, levels = 12 + ((R() * 8) | 0), a0 = R() * TAU;
		const M = S.memo('topo', () => {
			const n = w * h, F = new Float32Array(n);
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const u = x / h * sc + ox, v = y / h * sc + oy;
					const wu = N.fbm2(u * 0.5 + 9, v * 0.5, 2) - 0.5, wv = N.fbm2(u * 0.5, v * 0.5 + 9, 2) - 0.5;
					F[y * w + x] = N.fbm2(u + wu * 1.2, v + wv * 1.2, 3);
				}
			}
			const low = mix(pal.land[3], pal.sky[0], 0.3), high = mix(pal.land[1], pal.sky[1], 0.4), lw = unit(h) * 0.8;
			const base = new Uint8ClampedArray(n * 3), line = new Uint8Array(n), gx = new Float32Array(n), gy = new Float32Array(n);
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const k = y * w + x, f = F[k];
					const fx = (F[y * w + Math.min(w - 1, x + 1)] - F[y * w + Math.max(0, x - 1)]) * 0.5;
					const fy = (F[Math.min(h - 1, y + 1) * w + x] - F[Math.max(0, y - 1) * w + x]) * 0.5;
					const e = Math.max(0, Math.min(1, (f - 0.3) * 2.2));
					base[k * 3] = low[0] + (high[0] - low[0]) * e; base[k * 3 + 1] = low[1] + (high[1] - low[1]) * e; base[k * 3 + 2] = low[2] + (high[2] - low[2]) * e;
					gx[k] = fx * h * 0.9; gy[k] = fy * h * 0.9;
					const t = f * levels, fr = t - Math.floor(t), dist = Math.min(fr, 1 - fr);
					const px = dist / Math.max(1e-6, Math.hypot(fx, fy) * levels), major = Math.round(t) % 5 === 0;
					const cover = Math.max(0, Math.min(1, (major ? lw * 1.6 : lw) - px + 0.5));
					line[k] = cover * (major ? 0.7 : 0.35) * 255;
				}
			}
			return { base, line, gx, gy };
		});
		const img = g.createImageData(w, h), d = img.data, a = a0 + T * 0.04, ca = Math.cos(a), sa = Math.sin(a);
		const L = mix(pal.sky[2], WHITE, 0.25), { base, line, gx, gy } = M;
		for (let k = 0, n = w * h; k < n; k++) {
			let s = (gx[k] * ca + gy[k] * sa) * 0.7;
			s = s > 1 ? 1 : s < -1 ? -1 : s;
			const t = s * 0.14, la = line[k] / 255;
			let r = base[k * 3], gg = base[k * 3 + 1], b = base[k * 3 + 2];
			if (t > 0) { r += (255 - r) * t; gg += (255 - gg) * t; b += (255 - b) * t; } else { r *= 1 + t; gg *= 1 + t; b *= 1 + t; }
			const i = k * 4;
			d[i] = r + (L[0] - r) * la; d[i + 1] = gg + (L[1] - gg) * la; d[i + 2] = b + (L[2] - b) * la; d[i + 3] = 255;
		}
		g.putImageData(img, 0, 0);
	},

	aurora(g, w, h, R, N, pal, S) {
		const horizon = h * (0.6 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		stars(g, w, h, R, 260, horizon, unit(h));
		const sets = [[[90, 255, 170], [120, 90, 255]], [[80, 230, 255], [210, 90, 255]], [[150, 255, 120], [60, 160, 255]]];
		const [lo, hi] = sets[(R() * sets.length) | 0];
		// a curtain's colours from its top to its foot, drawn once and stretched over each column
		const strip = S.memo('aurora', () => {
			const c = canvasOf(1, 256), cg = c.getContext('2d'), gr = cg.createLinearGradient(0, 0, 0, 256);
			gr.addColorStop(0, css(hi, 0)); gr.addColorStop(0.64, css(mix(hi, lo, 0.6), 0.6)); gr.addColorStop(0.86, css(lo, 1)); gr.addColorStop(0.91, css(lo, 0)); gr.addColorStop(1, css(lo, 0));
			cg.fillStyle = gr; cg.fillRect(0, 0, 1, 256);
			return c;
		});
		g.save();
		g.globalCompositeOperation = 'lighter';
		const step = Math.max(1, w / 480);
		for (let c = 0; c < 3; c++) {
			const ph = R() * 50, f1 = 1.5 + R() * 2, f2 = 6 + R() * 6, top0 = horizon * (0.38 + R() * 0.14);
			for (let x = 0; x < w; x += step) {
				const u = x / (h * ASPECT);
				// the curtain folds slowly, its rays shiver
				const base = top0 + horizon * 0.3 * N.fbm1(u * f1 + ph + T * 0.015, 3);
				const len = horizon * (0.25 + 0.45 * N.n1(u * f2 + ph * 2 + T * 0.05)) * (0.6 + 0.4 * N.n1(u * 30 + ph - T * 0.25));
				g.globalAlpha = Math.min(1, 0.9 * Math.pow(N.fbm1(u * f2 * 0.5 + ph + 9 + T * 0.04, 2), 1.2));
				g.drawImage(strip, 0, 0, 1, 256, x, base - len, step + 0.5, len * 1.1);
			}
		}
		g.restore();
		g.globalAlpha = 1;
		const far = mix(pal.land[2], lo, 0.1);
		ridge(g, w, h, { base: horizon + h * 0.08, amp: h * 0.4, freq: 2.4, phase: R() * 50, sharp: true, peak: 2.5, color: far, N });
		mist(g, w, horizon + h * 0.1, h * 0.1, mix(pal.sky[2], lo, 0.2), 0.3);
		ridge(g, w, h, { base: horizon + h * 0.2, amp: h * 0.22, freq: 3.5, phase: R() * 50, sharp: true, peak: 2, color: pal.land[3], N });
	},

	space(g, w, h, R, N, pal, S) {
		const ox = R() * 100, oy = R() * 100, sc = 0.9 + R() * 0.7;
		g.drawImage(S.memo('nebula', () => {
			const c = canvasOf(w, h), cg = c.getContext('2d'), img = cg.createImageData(w, h), d = img.data;
			const a = pal.glow, b = pal.sky[2];
			for (let y = 0; y < h; y++) {
				const bg = mix(pal.sky[0], pal.sky[1], (y / h) * 0.6);
				for (let x = 0; x < w; x++) {
					const u = x / h * sc + ox, v = y / h * sc + oy;
					const n = N.fbm2(u, v, 5), m = N.fbm2(u * 1.7 + 30, v * 1.7, 3);
					const dens = Math.max(0, n - 0.45) * 2.2;
					let col = mix(bg, mix(a, b, m), Math.min(1, dens * dens * 1.6));
					col = mix(col, BLACK, Math.max(0, m - 0.55) * 1.2);   // dust
					const i = (y * w + x) * 4;
					d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
				}
			}
			cg.putImageData(img, 0, 0);
			return c;
		}), 0, 0);
		stars(g, w, h, R, 320, h, unit(h));
		// a few bright stars with glints, breathing
		const u = unit(h);
		for (let k = 0, n = 3 + ((R() * 4) | 0); k < n; k++) {
			const x = R() * w, y = R() * h * 0.8, r = u * (2 + R() * 2.5) * (0.85 + 0.15 * Math.sin(T * (0.8 + R()) + k)), c = mix(WHITE, pal.glow, R() * 0.4);
			glow(g, x, y, r * 1.8, c, 0.45);
			g.fillStyle = css(c, 0.85);
			g.fillRect(x - r, y - u * 0.5, r * 2, u); g.fillRect(x - u * 0.5, y - r, u, r * 2);
		}
		// a shooting star every so often
		const per = 8 + R() * 10, ph = R() * per, x0 = w * (0.1 + R() * 0.7), y0 = h * (0.05 + R() * 0.3), len = h * (0.6 + R() * 0.5), ang = 0.3 + R() * 0.35;
		const p = ((T + ph) % per) / 1.1;
		if (p < 1) {
			const hx = x0 + Math.cos(ang) * len * p, hy = y0 + Math.sin(ang) * len * p, tail = len * 0.35 * Math.min(1, p * 3);
			const tr = g.createLinearGradient(hx, hy, hx - Math.cos(ang) * tail, hy - Math.sin(ang) * tail);
			const a = Math.sin(p * Math.PI);
			tr.addColorStop(0, css(WHITE, 0.9 * a)); tr.addColorStop(1, css(WHITE, 0));
			g.strokeStyle = tr; g.lineWidth = u * 1.2;
			g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - Math.cos(ang) * tail, hy - Math.sin(ang) * tail); g.stroke();
		}
	},

	lake(g, w, h, R, N, pal, S) {
		const horizon = h * (0.5 + R() * 0.06), u = unit(h);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, u);
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.35 + R() * 0.4), h * (0.05 + R() * 0.03), pal);
		clouds(g, w, h, S, pal, horizon, 2 + ((R() * 3) | 0));
		for (let i = 0; i < 3; i++) {
			const t = i / 2, color = mix(landAt(pal, 0.2 + t * 0.6), pal.sky[2], (1 - t) * 0.35);
			ridge(g, w, h, { base: horizon, amp: h * (0.42 - t * 0.14), freq: 2.2 + t * 2, phase: R() * 50, sharp: true, peak: 1.6, color, N });
			if (i < 2) mist(g, w, horizon, h * 0.1, pal.sky[2], 0.3);
		}
		const shore = landAt(pal, 1);
		for (let x = R() * 10; x < w; x += h * ASPECT * (0.004 + R() * 0.006)) pine(g, x, horizon + 1, h * (0.03 + R() * 0.05) * (0.5 + N.n1(x / h * 3)), shore);
		// the water: what is above, upside down, wavering a little more the nearer it is
		const top = Math.ceil(horizon) + 1, rows = h - top;
		const above = S.memo('above', () => canvasOf(w, top)), ag = above.getContext('2d');
		ag.clearRect(0, 0, w, top);
		ag.drawImage(g.canvas, 0, 0, w, top, 0, 0, w, top);
		g.fillStyle = css(mix(pal.sky[2], pal.land[3], 0.4));
		g.fillRect(0, top, w, rows);
		for (let y = top; y < h; y++) {
			const dy = y - top, src = top - 2 - dy;
			if (src < 0) break;
			const dx = Math.sin(dy * 0.45 + T * 1.4) * u * (0.5 + (dy / rows) * 2.5);
			g.drawImage(above, 0, src, w, 1, dx, y, w, 1);
		}
		const wtr = g.createLinearGradient(0, horizon, 0, h);
		wtr.addColorStop(0, css(mix(pal.sky[2], pal.land[3], 0.4), 0.35));
		wtr.addColorStop(1, css(pal.land[3], 0.75));
		g.fillStyle = wtr;
		g.fillRect(0, horizon, w, h - horizon);
		const ripple = mix(pal.sky[2], WHITE, 0.3);
		for (let i = 0, k = 160 * w / (h * ASPECT); i < k; i++) {
			const d = Math.pow(R(), 1.4), y = horizon + 2 + d * (h - horizon), len = h * ASPECT * (0.01 + d * 0.04), span = w + len;
			g.fillStyle = css(ripple, 0.08 + 0.15 * R());
			g.fillRect(wrapX(R() * span + T * h * (0.004 + d * 0.012), span) - len, y, len, Math.max(1, h * 0.003));
		}
		birds(g, w, h, R, shore, horizon);
	},

	waves(g, w, h, R, N, pal, S) {
		const horizon = h * (0.42 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, unit(h));
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.4 + R() * 0.4), h * (0.07 + R() * 0.04), pal, 0.5);
		clouds(g, w, h, S, pal, horizon, 2 + ((R() * 3) | 0));
		const rows = 6, foam = mix(pal.sky[2], WHITE, 0.55), u = unit(h), dir = R() < 0.5 ? 1 : -1;
		for (let i = 0; i < rows; i++) {
			const t = i / (rows - 1), color = mix(landAt(pal, t), pal.sky[2], (1 - t) * 0.35);
			const base = horizon + (h - horizon) * (0.05 + t * 0.85), amp = h * (0.02 + t * 0.07);
			// the rows roll on, the nearer the faster
			const f1 = (5 - t * 2.5) / (h * ASPECT), ph = R() * 50 + T * (0.15 + t * 0.35) * dir, skew = 0.6;
			const f = (x) => { const a = x * f1 * TAU + ph; return base - amp * (Math.sin(a + skew * Math.sin(a)) * 0.8 + 0.4 * N.n1(x * f1 * 3 + ph * 0.2)); };
			const step = Math.max(1, w / 640);
			g.beginPath(); g.moveTo(0, h);
			for (let x = 0; x <= w + step; x += step) g.lineTo(x, f(x));
			g.lineTo(w, h); g.closePath();
			g.fillStyle = css(color); g.fill();
			g.strokeStyle = css(foam, 0.35 + t * 0.45); g.lineWidth = u * (1 + t);
			g.beginPath();
			for (let x = 0; x <= w + step; x += step) x ? g.lineTo(x, f(x)) : g.moveTo(x, f(x));
			g.stroke();
			// inner lines that follow the crest, and spray on the tallest crests
			g.strokeStyle = css(foam, 0.12 + t * 0.12); g.lineWidth = u;
			for (let k = 1; k <= 2; k++) {
				g.beginPath();
				for (let x = 0; x <= w + step; x += step) { const y = f(x) + amp * 0.35 * k + h * 0.01 * k; x ? g.lineTo(x, y) : g.moveTo(x, y); }
				g.stroke();
			}
			g.fillStyle = css(foam, 0.7);
			for (let x = R() * 20; x < w; x += step * 3) {
				const y = f(x), r1 = R(), r2 = R(), r3 = R();
				if (y < base - amp * 0.75 && r1 < 0.35) g.fillRect(x + (r2 - 0.5) * 6 * u, y - r3 * amp * 0.4, u * 1.5, u * 1.5);
			}
		}
	},

	mesas(g, w, h, R, N, pal, S) {
		const horizon = h * (0.58 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, unit(h));
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.35 + R() * 0.4), h * (0.06 + R() * 0.04), pal, 0.55);
		clouds(g, w, h, S, pal, horizon, 1 + ((R() * 3) | 0));
		const U = h * ASPECT, u = unit(h);
		// a hawk circling high up
		const hx = w * (0.2 + R() * 0.6), hy = horizon * (0.25 + R() * 0.25), hr = h * (0.12 + R() * 0.1), hs = 0.18 + R() * 0.12;
		for (let i = 0; i < 2; i++) {
			const t = i, color = mix(landAt(pal, 0.2 + t * 0.45), pal.sky[2], (1 - t) * 0.35);
			const base = horizon + h * t * 0.12;
			for (let x = -R() * U * 0.2; x < w; x += U * (0.18 + R() * 0.35)) {
				// a flat-topped butte: steep sides with scree at the foot, a ragged top, a few strata
				const wd = U * (R() < 0.3 ? 0.03 + R() * 0.04 : 0.08 + R() * 0.16), top = base - h * (0.12 + R() * 0.2) * (1 + t * 0.3);
				const foot = wd * (0.25 + R() * 0.2), cliff = (base - top) * (0.55 + R() * 0.2);
				g.beginPath();
				g.moveTo(x - foot, base + 1);
				g.quadraticCurveTo(x - foot * 0.2, base - (base - top - cliff) * 0.2, x, top + cliff);
				g.lineTo(x + wd * 0.04, top);
				for (let k = 1; k < 10; k++) g.lineTo(x + wd * (0.04 + 0.92 * k / 10), top + (N.n1(x * 0.05 + k * 1.7) - 0.5) * h * 0.012);
				g.lineTo(x + wd * 0.96, top);
				g.lineTo(x + wd, top + cliff);
				g.quadraticCurveTo(x + wd + foot * 0.2, base - (base - top - cliff) * 0.2, x + wd + foot, base + 1);
				g.closePath();
				g.fillStyle = css(color); g.fill();
				g.save(); g.clip();
				for (let k = 1; k < 4; k++) {   // strata
					g.fillStyle = css(k % 2 ? mix(color, pal.sun, 0.12) : mix(color, BLACK, 0.08));
					g.fillRect(x - foot, top + cliff * (k / 4), wd + foot * 2, cliff * 0.08);
				}
				g.fillStyle = css(mix(color, BLACK, 0.12));   // the shaded side
				g.fillRect(x + wd * 0.78, top, wd * 0.22 + foot, base - top);
				g.restore();
			}
			g.fillStyle = css(color);
			g.fillRect(0, base, w, h - base);
			mist(g, w, base + h * 0.03, h * 0.12, pal.sky[2], 0.3);
		}
		const ground = landAt(pal, 0.85), gy = horizon + h * 0.2;
		ridge(g, w, h, { base: gy, amp: h * 0.04, freq: 2, phase: R() * 50, oct: 2, color: ground, N });
		const near = pal.land[3];
		for (let x = R() * U * 0.1; x < w; x += U * (0.06 + R() * 0.2)) {   // saguaros
			if (R() < 0.35) continue;
			const ch = h * (0.1 + R() * 0.12), cw = u * (2 + R() * 2), by = gy + h * 0.04 + R() * h * 0.08;
			g.fillStyle = css(near);
			g.fillRect(x - cw / 2, by - ch, cw, ch);
			for (const side of [-1, 1]) {
				if (R() < 0.3) continue;
				const ay = by - ch * (0.35 + R() * 0.3), ah = ch * (0.2 + R() * 0.25), ax = x + side * cw * 1.6;
				g.fillRect(Math.min(x, ax), ay, Math.abs(ax - x) + cw / 2, cw);
				g.fillRect(ax - cw / 2, ay - ah, cw, ah + cw);
			}
		}
		const a = T * hs, bx = hx + Math.cos(a) * hr * 1.6, by = hy + Math.sin(a) * hr * 0.35, s = u * 4;
		const flap = Math.sin(T * 0.5) > 0.85 ? Math.sin(T * 8) * 0.5 : 0.12;
		g.strokeStyle = css(landAt(pal, 1), 0.85); g.lineWidth = u * 1.2; g.lineCap = 'round';
		g.beginPath(); g.moveTo(bx - s, by - s * flap); g.quadraticCurveTo(bx - s * 0.4, by - s * 0.15, bx, by); g.quadraticCurveTo(bx + s * 0.4, by - s * 0.15, bx + s, by - s * flap); g.stroke();
	},

	clouds(g, w, h, R, N, pal, S) {
		// above a sea of cloud: far peaks standing out of it, banks rolling towards us, the nearer the bigger and faster, lit
		// from the sun's side, with long bands overhead
		const horizon = h * (0.42 + R() * 0.08), u = unit(h);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, u);
		const sx = w * (0.15 + R() * 0.7), sr = h * (0.06 + R() * 0.03), sy = horizon - sr * (0.3 + R() * 1.5);
		sun(g, sx, sy, sr, pal, 0.6);
		clouds(g, w, h, S, pal, horizon * 0.9, 1 + ((R() * 2) | 0), { name: 'high' });
		ridge(g, w, h, { base: horizon + h * 0.12, amp: h * 0.4, freq: 2.4, phase: R() * 50, sharp: true, peak: 1.8, color: mix(pal.land[2], pal.sky[1], 0.35), N });
		const L = cloudTones(pal), rows = 5, lean = Math.max(-1, Math.min(1, (sx - w / 2) / (w * 0.4))) * 0.5;
		const banks = S.memo('banks', (r) => Array.from({ length: rows }, (_, i) => {
			const t = i / (rows - 1);
			return bankSprite(r, w, h, h * (0.022 + t * 0.06), hazed({ ...L, under: null }, pal, (1 - t) * 0.55), lean, -0.9, u);
		}));
		for (let i = 0; i < rows; i++) {
			const t = i / (rows - 1), y = horizon + (h - horizon) * (0.02 + Math.pow(t, 1.1) * 0.8);
			drawBank(g, w, banks[i], T * h * (0.004 + t * 0.014), y);
			if (i === 0) glow(g, sx, y, h * 0.5, mix(pal.sun, pal.glow, 0.4), pal.dark ? 0.12 : 0.22);
			if (i < rows - 1) mist(g, w, y + h * 0.05, h * 0.06, pal.sky[2], 0.25 * (1 - t));
		}
	},

	sakura(g, w, h, R, N, pal, S) {
		const horizon = h * (0.62 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, unit(h));
		sun(g, w * (0.3 + R() * 0.4), horizon * (0.45 + R() * 0.35), h * (0.08 + R() * 0.04), pal, 0.4);
		for (let i = 0; i < 2; i++) ridge(g, w, h, { base: horizon + h * i * 0.12, amp: h * (0.12 - i * 0.04), freq: 1.6 + i, phase: R() * 50, oct: 2, color: mix(landAt(pal, 0.3 + i * 0.4), pal.sky[2], 0.4 - i * 0.2), N });
		const bark = mix(pal.land[3], BLACK, 0.3), u = unit(h), U = h * ASPECT;
		const pinks = [hex('#ffc2d6'), hex('#ff9fbf'), hex('#ffe1ea'), hex('#f78fb3')];
		const blossoms = [];
		const branch = (x, y, ang, len, wd, depth) => {
			// the branches sway a little in the breeze, the thin ones more
			const a = ang + Math.sin(T * 0.6 + depth * 0.7) * 0.012 * (6 - depth);
			const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
			const mx = (x + ex) / 2 + Math.cos(a + Math.PI / 2) * len * 0.12 * (R() - 0.5), my = (y + ey) / 2 + Math.sin(a + Math.PI / 2) * len * 0.12 * (R() - 0.5);
			g.strokeStyle = css(bark); g.lineWidth = wd; g.lineCap = 'round';
			g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
			if (depth <= 2) for (let k = 0; k < 4; k++) blossoms.push([x + (ex - x) * R(), y + (ey - y) * R()]);
			if (depth === 0) { for (let k = 0; k < 5; k++) blossoms.push([ex + (R() - 0.5) * len * 0.6, ey + (R() - 0.5) * len * 0.6]); return; }
			const n = 2 + (R() < 0.4 ? 1 : 0);
			for (let k = 0; k < n; k++) branch(ex, ey, a + (R() - 0.5) * 1.1, len * (0.6 + R() * 0.2), Math.max(u, wd * 0.65), depth - 1);
		};
		const fromLeft = R() < 0.5;
		const sides = R() < 0.4 ? [true, false] : [fromLeft];
		for (const left of sides) {
			const x0 = left ? -h * 0.1 : w + h * 0.1, y0 = h * (0.05 + R() * 0.25);
			branch(x0, y0, left ? 0.15 + R() * 0.3 : Math.PI - 0.15 - R() * 0.3, h * (0.45 + R() * 0.25), u * (6 + R() * 3), 5);
		}
		for (const [x, y] of blossoms) {
			for (let k = 0; k < 3; k++) {
				const r = u * (1.5 + R() * 2.5);
				g.fillStyle = css(pinks[(R() * pinks.length) | 0], 0.85);
				g.beginPath(); g.arc(x + (R() - 0.5) * r * 3, y + (R() - 0.5) * r * 3, r, 0, TAU); g.fill();
			}
		}
		// petals falling, fluttering and turning
		const wind = fromLeft ? 1 : -1;
		for (let i = 0, k = 60 * w / U; i < k; i++) {
			const x0 = R() * w, y0 = R() * h, vx = h * (0.02 + R() * 0.05) * wind, vy = h * (0.04 + R() * 0.05), ph = R() * TAU, spin = 0.6 + R();
			const col = pinks[(R() * pinks.length) | 0], al = 0.5 + R() * 0.4, sz = R();
			const x = wrapX(x0 + T * vx + Math.sin(T * 0.9 + ph) * h * 0.03, w + 8) - 4, y = wrapX(y0 + T * vy, h + 8) - 4;
			g.fillStyle = css(col, al);
			g.beginPath(); g.ellipse(x, y, u * (1.2 + sz), u * (0.6 + sz * 0.5) * Math.abs(Math.cos(T * spin + ph)) + u * 0.2, ph + T * spin * 0.5, 0, TAU); g.fill();
		}
	},

	flow(g, w, h, R, N, pal, S) {
		const ramp = [pal.sky[2], pal.glow, pal.sun, pal.land[0], pal.sky[1]];
		const sc = 0.7 + R() * 0.6, ox = R() * 100, turn = 2 + R() * 2, u = unit(h), step = u * 2, U = h * ASPECT;
		const field = (x, y) => (N.fbm2(x / h * sc + ox, y / h * sc, 3) - 0.5) * Math.PI * turn;
		g.drawImage(S.memo('lines', (r) => {
			const c = canvasOf(w, h), cg = c.getContext('2d');
			const bg = cg.createLinearGradient(0, 0, w * 0.3, h);
			bg.addColorStop(0, css(pal.sky[0])); bg.addColorStop(0.6, css(mix(pal.sky[1], pal.land[3], 0.5))); bg.addColorStop(1, css(pal.land[3]));
			cg.fillStyle = bg; cg.fillRect(0, 0, w, h);
			cg.lineCap = 'round';
			for (let i = 0, n = 420 * w / U; i < n; i++) {
				let x = r() * w, y = r() * h;
				cg.strokeStyle = css(ramp[(r() * ramp.length) | 0], 0.08 + r() * 0.3);
				cg.lineWidth = u * (0.6 + r() * 1.4);
				cg.beginPath(); cg.moveTo(x, y);
				for (let k = 0, len = 30 + r() * 60; k < len; k++) { const a = field(x, y); x += Math.cos(a) * step; y += Math.sin(a) * step; cg.lineTo(x, y); }
				cg.stroke();
			}
			return c;
		}), 0, 0);
		// sparks running along the lines
		g.lineCap = 'round';
		for (let i = 0, n = 70 * w / U; i < n; i++) {
			const x0 = R() * w, y0 = R() * h, ph = R(), life = 3 + R() * 3, c = ramp[(R() * ramp.length) | 0];
			const p = (T / life + ph) % 1, steps = Math.floor(p * 50), a = Math.sin(p * Math.PI);
			let x = x0, y = y0;
			const trail = [];
			for (let k = 0; k < steps; k++) { const an = field(x, y); x += Math.cos(an) * step; y += Math.sin(an) * step; if (k >= steps - 7) trail.push(x, y); }
			if (trail.length < 4) continue;
			g.strokeStyle = css(mix(c, WHITE, 0.4), 0.5 * a); g.lineWidth = u * 1.3;
			g.beginPath(); g.moveTo(trail[0], trail[1]);
			for (let k = 2; k < trail.length; k += 2) g.lineTo(trail[k], trail[k + 1]);
			g.stroke();
			g.fillStyle = css(WHITE, 0.8 * a); g.fillRect(x - u * 0.6, y - u * 0.6, u * 1.2, u * 1.2);
		}
	},

	lighthouse(g, w, h, R, N, pal, S) {
		const horizon = h * (0.58 + R() * 0.06), U = h * ASPECT, u = unit(h);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 180, horizon * 0.85, u);
		const sx = w * (0.2 + R() * 0.6), sr = h * (0.04 + R() * 0.02);
		sun(g, sx, horizon * (0.3 + R() * 0.3), sr, pal, 0.35);
		clouds(g, w, h, S, pal, horizon, 2 + ((R() * 3) | 0));
		water(g, w, h, R, pal, horizon, sx, sr * 0.6);
		// a headland on one side
		const left = R() < 0.5, reach = U * (0.2 + R() * 0.1), topY = horizon - h * (0.06 + R() * 0.06), seaY = horizon + h * 0.16, cph = R() * 50;
		const X = (fx) => left ? fx * reach : w - fx * reach;
		const rock = mix(pal.land[3], BLACK, 0.25);
		g.beginPath(); g.moveTo(X(0), h);
		for (let k = 0; k <= 48; k++) {
			const fx = k / 48 * 1.35, drop = fx < 0.62 ? 0 : Math.pow((fx - 0.62) / 0.73, 1.4);
			g.lineTo(X(fx), topY + (seaY - topY) * drop + (N.n1(fx * 9 + cph) - 0.5) * h * 0.02);
		}
		g.lineTo(X(1.35), h); g.closePath();
		g.fillStyle = css(rock); g.fill();
		// the tower, in bands, with its lantern
		const lx = X(0.4), th = h * (0.24 + R() * 0.06), bw = th * 0.2, tw = th * 0.13, by = topY + h * 0.01;
		const light = mix(WHITE, pal.sky[2], pal.dark ? 0.55 : 0.2), red = mix(hex('#b8433f'), pal.sky[1], pal.dark ? 0.45 : 0.15);
		const bands = 4;
		for (let k = 0; k < bands; k++) {
			const y0 = by - th * k / bands, y1 = by - th * (k + 1) / bands, w0 = bw + (tw - bw) * k / bands, w1 = bw + (tw - bw) * (k + 1) / bands;
			g.fillStyle = css(k % 2 ? red : light);
			g.beginPath(); g.moveTo(lx - w0 / 2, y0); g.lineTo(lx + w0 / 2, y0); g.lineTo(lx + w1 / 2, y1); g.lineTo(lx - w1 / 2, y1); g.fill();
		}
		const ly = by - th - th * 0.07, lamp = hex('#fff2b8');
		g.fillStyle = css(rock); g.fillRect(lx - tw * 0.75, by - th - u, tw * 1.5, u * 1.5);
		g.fillStyle = css(lamp, 0.95); g.fillRect(lx - tw * 0.35, ly - th * 0.05, tw * 0.7, th * 0.1);
		g.fillStyle = css(rock);
		g.beginPath(); g.moveTo(lx - tw * 0.55, ly - th * 0.05); g.lineTo(lx + tw * 0.55, ly - th * 0.05); g.lineTo(lx, ly - th * 0.16); g.fill();
		// its two beams sweep round: long and faint when crossing the view, a flash when one turns to us
		const rate = 0.55 + R() * 0.25, ph = R() * TAU, beamLen = U * 0.55, strength = pal.dark ? 1 : 0.55;
		g.save(); g.globalCompositeOperation = 'lighter';
		for (const off of [0, Math.PI]) {
			const th2 = T * rate + ph + off, c = Math.cos(th2), toward = Math.sin(th2);
			const L = beamLen * Math.abs(c), dir = Math.sign(c) || 1, spread = h * (0.035 + 0.06 * (1 - Math.abs(c)));
			if (L > 2) {
				const gr = g.createLinearGradient(lx, ly, lx + dir * L, ly);
				gr.addColorStop(0, css(lamp, 0.6 * strength * (0.5 + 0.5 * Math.abs(c))));
				gr.addColorStop(0.6, css(lamp, 0.18 * strength));
				gr.addColorStop(1, css(lamp, 0));
				g.fillStyle = gr;
				g.beginPath(); g.moveTo(lx, ly - u); g.lineTo(lx + dir * L, ly - spread * 1.2); g.lineTo(lx + dir * L, ly + spread); g.lineTo(lx, ly + u); g.fill();
			}
			if (toward > 0) glow(g, lx, ly, h * (0.05 + 0.15 * Math.pow(1 - Math.abs(c), 8)), lamp, 0.25 + 0.6 * Math.pow(1 - Math.abs(c), 8) * strength);
		}
		g.restore();
		glow(g, lx, ly, h * 0.05, lamp, 0.35);
	},

	windmills(g, w, h, R, N, pal, S) {
		const horizon = h * (0.6 + R() * 0.08), U = h * ASPECT, u = unit(h);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, u);
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.3 + R() * 0.4), h * (0.05 + R() * 0.03), pal);
		clouds(g, w, h, S, pal, horizon, 3 + ((R() * 3) | 0));
		const far = mix(pal.land[1], pal.sky[2], 0.45);
		ridge(g, w, h, { base: horizon + 1, amp: h * 0.035, freq: 7, phase: R() * 50, oct: 3, color: far, N });
		// poplars in rows along the far dykes
		const pph = R() * 50;
		g.fillStyle = css(mix(far, pal.land[2], 0.25));
		for (let x = 0; x < w; x += U * (0.006 + R() * 0.01)) {
			const ht = h * (0.025 + R() * 0.035);
			if (N.n1(x / h * 1.6 + pph) < 0.55) continue;
			g.beginPath(); g.ellipse(x, horizon + h * 0.02 - ht * 0.5, ht * 0.17, ht * 0.5, 0, 0, TAU); g.fill();
		}
		// flat fields in bands, ditches of sky between them, one a canal; some of them tulips in rows of colour
		const tulips = ['#d9354a', '#f2c230', '#ef7aa4', '#f3efe6', '#9b4fc4', '#ee6a2c'].map(hex), mute = pal.dark ? 0.82 : 0.2;
		const nb = 4 + ((R() * 3) | 0), canal = 1 + ((R() * (nb - 2)) | 0), ditch = mix(pal.sky[2], pal.sky[1], 0.3), bloom = canal === nb - 1 ? nb - 2 : nb - 1;
		for (let k = 0; k < nb; k++) {
			const y0 = horizon + h * 0.02 + (h - horizon) * Math.pow(k / nb, 1.8), y1 = horizon + h * 0.02 + (h - horizon) * Math.pow((k + 1) / nb, 1.8) + 1;
			const field = mix(landAt(pal, 0.35 + 0.65 * k / nb), k % 2 ? pal.sun : BLACK, 0.06), flowers = k === bloom || R() < 0.5, rows = 3 + ((R() * 4) | 0), c0 = (R() * tulips.length) | 0;
			if (k === canal) {
				g.fillStyle = css(mix(pal.sky[2], pal.sky[1], 0.35)); g.fillRect(0, y0, w, y1 - y0);
				g.fillStyle = css(mix(pal.sky[2], WHITE, 0.4), 0.4 + 0.2 * Math.sin(T * 0.8)); g.fillRect(0, y0 + (y1 - y0) * 0.3, w, u);
				continue;
			}
			g.fillStyle = css(field); g.fillRect(0, y0, w, y1 - y0);
			if (flowers && k > 0) {
				const haze = (1 - k / nb) * 0.5;
				for (let j = 0; j < rows; j++) {
					const a = y0 + (y1 - y0) * (j + 0.2) / rows, b = y0 + (y1 - y0) * (j + 0.75) / rows;
					const col = mix(mix(tulips[(c0 + j) % tulips.length], field, mute), pal.sky[2], haze);
					g.fillStyle = css(col);
					g.fillRect(0, a, w, Math.max(1, b - a));
					if (b - a > 4 * u) {   // near, the row is heads of flowers over the leaves
						g.fillStyle = css(mix(col, WHITE, 0.25));
						for (let fx = (j * 3.7) % 4 * u; fx < w; fx += u * 4) g.fillRect(fx, a - u, u * 2, u * 1.5);
						g.fillStyle = css(mix(col, field, 0.55));
						g.fillRect(0, b - (b - a) * 0.3, w, (b - a) * 0.3);
					}
				}
			}
			g.fillStyle = css(ditch, pal.dark ? 0.25 : 0.4); g.fillRect(0, y0, w, Math.max(1, u * 0.6));
		}
		const mills = [];
		for (let k = 0, n = (2 + ((R() * 3) | 0)) * w / U; k < n; k++) mills.push({ x: R() * w, depth: R(), speed: (0.25 + R() * 0.35) * (R() < 0.5 ? 1 : -1), ph: R() * TAU, lamp: R() });
		mills.sort((a, b) => a.depth - b.depth);
		for (const m of mills) {
			const s = h * (0.16 + m.depth * 0.3), base = horizon + h * 0.02 + (h - horizon) * m.depth * 0.35;
			windmill(g, m.x, base, s, mix(landAt(pal, 0.65 + m.depth * 0.35), pal.sky[2], (1 - m.depth) * 0.4), pal, m.ph + T * m.speed, u, pal.dark && m.lamp < 0.6);
		}
		birds(g, w, h, R, landAt(pal, 1), horizon);
	},

	snow(g, w, h, R, N, pal, S) {
		const horizon = h * (0.52 + R() * 0.06), U = h * ASPECT, u = unit(h);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 160, horizon * 0.8, u);
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.3 + R() * 0.4), h * (0.05 + R() * 0.03), pal, 0.4);
		const snowC = mix(WHITE, pal.sky[2], 0.3), shadeC = mix(pal.sky[1], pal.land[1], 0.45);
		ridge(g, w, h, { base: horizon + h * 0.05, amp: h * 0.4, freq: 2.4, phase: R() * 50, sharp: true, peak: 1.4, color: mix(snowC, shadeC, 0.6), N });
		mist(g, w, horizon + h * 0.05, h * 0.1, pal.sky[2], 0.3);
		const warm = hex('#ffcf7a'), lit = pal.dark ? 1 : 0.35;
		const smokes = [];
		for (let i = 0; i < 3; i++) {
			const t = i / 2, color = mix(mix(shadeC, snowC, 0.45), snowC, t * 0.7);
			const base = h * (0.6 + t * 0.26), amp = h * (0.12 - t * 0.03);
			const f = ridge(g, w, h, { base, amp, freq: 1.5 + t, phase: R() * 50, oct: 2, color, N });
			if (i === 1) {
				const tree = landAt(pal, 0.95);
				for (let x = R() * 20; x < w; x += U * (0.006 + R() * 0.016)) {
					if (R() < 0.4) continue;
					const th = h * (0.08 + R() * 0.08), y = f(x) + th * 0.1;
					pine(g, x, y, th, tree);
					g.fillStyle = css(snowC);
					g.beginPath(); g.moveTo(x, y - th); g.lineTo(x + th * 0.08, y - th * 0.82); g.lineTo(x - th * 0.08, y - th * 0.82); g.fill();
				}
			}
			if (i === 2) {
				for (let x = R() * U * 0.1; x < w; x += U * (0.05 + R() * 0.1)) {
					if (R() < 0.35) continue;
					const hw = h * (0.09 + R() * 0.05), hh = hw * 0.6, y = f(x + hw / 2) + h * 0.01, wall = mix(pal.land[2], pal.sky[1], 0.3);
					g.fillStyle = css(wall); g.fillRect(x, y - hh, hw, hh);
					g.fillStyle = css(snowC);
					g.beginPath(); g.moveTo(x - hw * 0.12, y - hh); g.lineTo(x + hw * 1.12, y - hh); g.lineTo(x + hw / 2, y - hh - hw * 0.45); g.fill();
					g.fillStyle = css(wall); g.fillRect(x + hw * 0.7, y - hh - hw * 0.38, hw * 0.1, hw * 0.2);
					const win = R() < 0.8;
					if (win) { glow(g, x + hw * 0.3, y - hh * 0.5, hw * 0.4, warm, 0.25 * lit); g.fillStyle = css(warm, 0.4 + 0.5 * lit); g.fillRect(x + hw * 0.22, y - hh * 0.62, hw * 0.16, hh * 0.28); }
					smokes.push([x + hw * 0.75, y - hh - hw * 0.4, R()]);
				}
			}
		}
		// chimney smoke rising, then snow falling, the near flakes bigger and faster
		const smoke = mix(pal.sky[2], WHITE, 0.3);
		for (const [cx, cy, ph] of smokes) {
			for (let k = 0; k < 6; k++) {
				const p = (T * 0.12 + ph + k / 6) % 1;
				glow(g, cx + p * h * 0.06 + Math.sin(p * 6 + ph * 9) * h * 0.01, cy - p * h * 0.18, h * (0.01 + p * 0.03), smoke, 0.35 * (1 - p));
			}
		}
		const wind = (R() - 0.5) * 0.6;
		for (let i = 0, k = 170 * w / U; i < k; i++) {
			const x0 = R() * w, y0 = R() * h, z = R(), ph = R() * TAU;
			const x = wrapX(x0 + T * h * wind * 0.05 * (0.5 + z) + Math.sin(T * (0.5 + z) + ph) * h * 0.02 * (0.3 + z), w), y = wrapX(y0 + T * h * (0.04 + z * 0.1), h);
			g.fillStyle = css(WHITE, 0.55 + z * 0.45);
			const s = u * (1 + z * 1.6);
			g.fillRect(x, y, s, s);
		}
	},

	rain(g, w, h, R, N, pal, S) {
		const horizon = h * (0.62 + R() * 0.06), U = h * ASPECT, u = unit(h);
		sky(g, w, h, pal, horizon);
		// now and then lightning far away lights the clouds, twice
		const per = 14 + R() * 12, ph = R() * per, p = (T + ph) % per;
		const flash = p < 0.12 ? 1 - p / 0.12 : p > 0.25 && p < 0.33 ? (1 - (p - 0.25) / 0.08) * 0.6 : 0;
		if (flash > 0) { g.fillStyle = css(WHITE, 0.14 * flash); g.fillRect(0, 0, w, horizon); }
		clouds(g, w, h, S, pal, horizon, 7, { style: 'storm', overcast: true });
		if (flash > 0) { g.fillStyle = css(mix(WHITE, pal.glow, 0.15), 0.1 * flash); g.fillRect(0, 0, w, horizon); }
		if (R() < 0.5) {
			for (let i = 0; i < 2; i++) {
				const t = i, color = mix(landAt(pal, 0.3 + t * 0.4), pal.sky[2], 0.5 - t * 0.25);
				for (let x = -R() * 40; x < w; ) {
					const bw = U * (0.02 + R() * 0.04), bh = h * (0.08 + R() * 0.2 + t * 0.05), top = horizon + h * t * 0.1 - bh;
					g.fillStyle = css(color); g.fillRect(x, top, bw, h);
					if (R() < 0.35) g.fillRect(x + bw * 0.2, top - bh * 0.15, bw * 0.6, bh * 0.15 + 1);
					if (R() < 0.2) g.fillRect(x + bw * 0.47, top - bh * 0.4, Math.max(1, bw * 0.06), bh * 0.4);
					const cell = Math.max(2, h * 0.016);
					for (let wy = top + cell; wy < horizon + h * 0.2; wy += cell * 2) for (let wx = x + cell * 0.6; wx < x + bw - cell; wx += cell * 1.7) {
						const r1 = R();
						if (r1 < 0.12 * (1 + t)) { g.fillStyle = css(pal.glow, 0.25 + 0.25 * t); g.fillRect(wx, wy, cell * 0.8, cell); }
					}
					g.fillStyle = css(color);
					x += bw + (R() < 0.3 ? U * R() * 0.03 : 0);
				}
				mist(g, w, horizon + h * t * 0.1, h * 0.2, pal.sky[2], 0.45);
			}
		} else {
			for (let i = 0; i < 2; i++) {
				ridge(g, w, h, { base: horizon + h * i * 0.1, amp: h * (0.2 - i * 0.06), freq: 1.6 + i, phase: R() * 50, oct: 3, color: mix(landAt(pal, 0.3 + i * 0.4), pal.sky[2], 0.5 - i * 0.25), N });
				mist(g, w, horizon + h * i * 0.1, h * 0.2, pal.sky[2], 0.45);
			}
		}
		const gy = horizon + h * 0.22;
		g.fillStyle = css(mix(pal.land[3], pal.sky[2], 0.15)); g.fillRect(0, gy, w, h - gy);
		const sheen = mix(pal.sky[2], WHITE, 0.3);
		g.fillStyle = css(sheen, 0.12); g.fillRect(0, gy, w, u);
		// rings in the puddles
		g.lineWidth = u * 0.8;
		for (let i = 0, k = 18 * w / U; i < k; i++) {
			const cx = R() * w, cy = gy + h * 0.02 + R() * (h - gy - h * 0.04), pr = 0.9 + R() * 0.8, pp = ((T / pr) + R()) % 1;
			g.strokeStyle = css(sheen, 0.45 * (1 - pp));
			g.beginPath(); g.ellipse(cx, cy, u * (1 + pp * 9), u * (0.3 + pp * 2.5), 0, 0, TAU); g.stroke();
		}
		// the rain
		const slant = 0.15 + R() * 0.2;
		for (let i = 0, k = 240 * w / U; i < k; i++) {
			const z = R(), len = h * (0.04 + z * 0.06), x0 = R() * (w + len), y0 = R() * (h + len), vy = h * (0.9 + z * 0.8);
			const y = wrapX(y0 + T * vy, h + len) - len, x = wrapX(x0 + T * vy * slant, w + len) - len;
			g.strokeStyle = css(sheen, 0.12 + z * 0.25); g.lineWidth = u * (0.5 + z * 0.6);
			g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * slant, y + len); g.stroke();
		}
	},

	volcano(g, w, h, R, N, pal, S) {
		const horizon = h * (0.64 + R() * 0.06), u = unit(h);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.7, u);
		ridge(g, w, h, { base: horizon + 1, amp: h * 0.12, freq: 3, phase: R() * 50, sharp: true, color: mix(pal.land[1], pal.sky[2], 0.4), N });
		const cx = w * (0.2 + R() * 0.6), top = horizon - h * (0.3 + R() * 0.08), cw = h * (0.05 + R() * 0.03), bw = h * (1.1 + R() * 0.5), foot = horizon + h * 0.08;
		const lava = mix(pal.glow, hex('#ff6a2a'), 0.5);
		glow(g, cx, top, h * 0.35, lava, 0.25 + 0.12 * Math.sin(T * 1.1));
		const cone = landAt(pal, 0.75);
		g.beginPath(); g.moveTo(-10, foot + h * 0.02); g.lineTo(cx - bw * 1.6, foot + h * 0.02);
		g.bezierCurveTo(cx - bw * 0.9, foot, cx - cw * 2.5, foot - (foot - top) * 0.3, cx - cw, top);
		g.lineTo(cx - cw * 0.3, top + h * 0.015); g.lineTo(cx + cw * 0.3, top + h * 0.012); g.lineTo(cx + cw, top);
		g.bezierCurveTo(cx + cw * 2.5, foot - (foot - top) * 0.3, cx + bw * 0.9, foot, cx + bw * 1.6, foot + h * 0.02);
		g.lineTo(w + 10, foot + h * 0.02); g.lineTo(w + 10, h); g.lineTo(-10, h); g.closePath();
		g.fillStyle = css(cone); g.fill();
		// lava down the flanks, breathing
		g.lineCap = 'round';
		for (let k = 0, n = 2 + ((R() * 2) | 0); k < n; k++) {
			const side = R() < 0.5 ? -1 : 1, len = 0.3 + R() * 0.4, wob = R() * 10;
			g.strokeStyle = css(lava, 0.55 + 0.3 * Math.sin(T * 0.8 + k * 2)); g.lineWidth = u * (1 + R());
			g.beginPath(); g.moveTo(cx + side * cw * 0.6, top + h * 0.01);
			for (let s = 1; s <= 12; s++) {
				const q = s / 12 * len, y = top + (foot - top) * q, x = cx + side * (cw + (bw - cw) * Math.pow(q, 1.6) * 0.5) + (N.n1(q * 8 + wob) - 0.5) * h * 0.04;
				g.lineTo(x, y);
			}
			g.stroke();
		}
		g.fillStyle = css(lava, 0.9); g.fillRect(cx - cw * 0.5, top + h * 0.004, cw, u * 1.5);
		// smoke billowing from the crater and spreading with the wind: lumpy puffs, lit by the lava from below while they are
		// low, by the sky on top, thinning as they go; embers thrown up
		const wind = (R() < 0.5 ? -1 : 1) * (0.3 + R() * 0.4), smoke = mix(mix(pal.land[1], pal.sky[1], 0.5), WHITE, 0.08);
		const dark = mix(smoke, BLACK, 0.3), lit = mix(smoke, pal.sky[2], 0.35), puffs = [];
		for (let k = 0, n = 22; k < n; k++) puffs.push({ p: (T * 0.035 + k / n) % 1, wob: R() * TAU, lumps: [0, 1, 2, 3].map(() => [R() - 0.5, R() - 0.5, 0.45 + R() * 0.35]) });
		puffs.sort((a, b) => b.p - a.p);
		for (const { p, wob, lumps } of puffs) {
			const x = cx + p * h * 1.1 * wind + Math.sin(p * 5 + wob) * h * 0.03, y = top - p * h * 0.45 * (1 - p * 0.4), r = h * (0.035 + p * 0.13);
			const size = Math.ceil(r * 3), mid = size / 2, heat = Math.pow(1 - p, 3), s = scratch(size, size);
			s.filter = `blur(${u * (0.8 + p * 2)}px)`;
			s.fillStyle = css(mix(dark, lava, heat * 0.5));
			s.beginPath();
			for (const [ox, oy, rs] of lumps) { s.moveTo(mid + ox * r + r * rs, mid + oy * r * 0.6); s.arc(mid + ox * r, mid + oy * r * 0.6, r * rs, 0, TAU); }
			s.fill();
			s.globalCompositeOperation = 'source-atop';
			s.fillStyle = css(mix(lit, lava, heat * 0.3), 0.85);
			s.beginPath();
			for (const [ox, oy, rs] of lumps) { const lx = mid + ox * r - wind * r * rs * 0.2, ly = mid + oy * r * 0.6 - r * rs * 0.3; s.moveTo(lx + r * rs * 0.7, ly); s.arc(lx, ly, r * rs * 0.7, 0, TAU); }
			s.fill();
			if (heat > 0.05) {
				const gr = s.createLinearGradient(0, mid, 0, mid + r);
				gr.addColorStop(0, css(lava, 0)); gr.addColorStop(1, css(lava, heat * 0.8));
				s.fillStyle = gr; s.fillRect(0, 0, size, size);
			}
			g.globalAlpha = 0.9 * Math.pow(1 - p, 1.2) * Math.min(1, p * 8);
			g.drawImage(s.canvas, 0, 0, size, size, x - mid, y - mid, size, size);
			g.globalAlpha = 1;
		}
		for (let k = 0; k < 24; k++) {
			const sp = 0.4 + R() * 0.5, ph = R(), dx = (R() - 0.5) * h * 0.18, hgt = h * (0.08 + R() * 0.12), p = (T * sp + ph) % 1;
			const x = cx + dx * p, y = top - hgt * (4 * p * (1 - p));
			g.fillStyle = css(lava, 0.9 * (1 - p)); g.fillRect(x, y, u, u);
		}
		ridge(g, w, h, { base: h * 0.95, amp: h * 0.1, freq: 2.5, phase: R() * 50, oct: 3, color: pal.land[3], N });
	},

	islands(g, w, h, R, N, pal, S) {
		const horizon = h * (0.52 + R() * 0.06), U = h * ASPECT, u = unit(h);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, u);
		const sx = w * (0.2 + R() * 0.6), sr = h * (0.05 + R() * 0.03);
		sun(g, sx, horizon * (0.35 + R() * 0.45), sr, pal, 0.55);
		clouds(g, w, h, S, pal, horizon, 2 + ((R() * 3) | 0));
		water(g, w, h, R, pal, horizon, sx, sr);
		const isles = [];
		for (let k = 0, n = (1 + ((R() * 3) | 0)) * w / U; k < n; k++) isles.push({ x: R() * w, d: R(), wd: R(), ht: R(), palms: 1 + ((R() * 3) | 0), seeds: [R(), R(), R(), R(), R(), R()] });
		isles.sort((a, b) => a.d - b.d);
		const sand = mix(pal.land[0], pal.sun, 0.3), green = landAt(pal, 0.85), dark = landAt(pal, 1);
		for (const is of isles) {
			const sc = 0.5 + is.d * 0.8, y = horizon + (h - horizon) * (0.08 + is.d * 0.35), wd = U * (0.05 + is.wd * 0.08) * sc, ht = h * (0.03 + is.ht * 0.04) * sc;
			g.fillStyle = css(sand);
			g.beginPath(); g.ellipse(is.x, y, wd, ht * 0.5, 0, Math.PI, TAU); g.fill();
			g.fillStyle = css(green);
			g.beginPath(); g.ellipse(is.x, y - ht * 0.1, wd * 0.7, ht, 0, Math.PI, TAU); g.fill();
			for (let p = 0; p < is.palms; p++) {
				const s = is.seeds, px = is.x + (s[p] - 0.5) * wd, ph = h * (0.1 + s[p + 1] * 0.08) * sc, lean = (s[p + 2] - 0.5) * 0.7;
				const tx = px + lean * ph, ty = y - ht * 0.5 - ph;
				g.strokeStyle = css(dark); g.lineWidth = u * 1.8 * sc; g.lineCap = 'round';
				g.beginPath(); g.moveTo(px, y - ht * 0.3); g.quadraticCurveTo(px + lean * ph * 0.2, y - ph * 0.6, tx, ty); g.stroke();
				// fronds that sway in the wind
				const sway = Math.sin(T * 0.9 + s[p] * 9) * 0.09;
				g.lineWidth = u * 1.4 * sc;
				for (let f = 0; f < 7; f++) {
					const a = -Math.PI / 2 + (f - 3) * 0.5 + sway, L = ph * 0.45;
					const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.6 + L * 0.35;
					g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - L * 0.15, ex, ey); g.stroke();
				}
			}
		}
		birds(g, w, h, R, dark, horizon);
	},

	fireflies(g, w, h, R, N, pal, S) {
		const horizon = h * (0.55 + R() * 0.08), U = h * ASPECT, u = unit(h);
		sky(g, w, h, pal, horizon);
		stars(g, w, h, R, 200, horizon * 0.85, u);
		sun(g, w * (0.15 + R() * 0.7), horizon * (0.25 + R() * 0.35), h * (0.045 + R() * 0.02), pal, 0.35);
		for (let i = 0; i < 3; i++) {
			const t = i / 2;
			ridge(g, w, h, { base: h * (0.58 + t * 0.22), amp: h * (0.22 - t * 0.06), freq: 1.4 + t, phase: R() * 50, oct: 2, color: mix(landAt(pal, 0.3 + t * 0.7), pal.sky[2], (1 - t) * 0.3), N });
			if (i < 2) mist(g, w, h * (0.6 + t * 0.22), h * 0.1, pal.sky[2], 0.25);
		}
		const fly = mix(hex('#e8ff8a'), pal.glow, 0.2), grass = mix(pal.land[3], BLACK, 0.3);
		const bugs = [];
		for (let i = 0, k = 80 * w / U; i < k; i++) bugs.push([R() * w, horizon + R() * (h - horizon) * 0.9 - h * 0.05, 0.15 + R() * 0.25, 0.12 + R() * 0.2, R() * TAU, R() * TAU, 0.6 + R() * 1.2, R() * TAU, R()]);
		// fireflies wandering and blinking, among grass that bends in the breeze
		const drawBugs = (front) => {
			for (const [x0, y0, f1, f2, p1, p2, bf, bp, z] of bugs) {
				if ((z > 0.5) !== front) continue;
				const x = x0 + Math.sin(T * f1 + p1) * h * 0.18, y = y0 + Math.cos(T * f2 + p2) * h * 0.06;
				const b = Math.pow(Math.max(0, Math.sin(T * bf + bp)), 3);
				if (b < 0.02) continue;
				glow(g, x, y, u * (6 + z * 6), fly, 0.7 * b);
				g.fillStyle = css(fly, b); g.fillRect(x - u * 0.6, y - u * 0.6, u * 1.2, u * 1.2);
			}
		};
		drawBugs(false);
		g.strokeStyle = css(grass); g.lineCap = 'round';
		for (let i = 0, k = 300 * w / U; i < k; i++) {
			const x = R() * w, by = h + R() * h * 0.02, len = h * (0.05 + R() * 0.1), lean = (R() - 0.5) * len * 0.4;
			const sway = Math.sin(T * 0.8 + x * 0.01) * u * 2.5 * (len / (h * 0.15));
			g.lineWidth = u * (0.6 + R() * 0.6);
			g.beginPath(); g.moveTo(x, by); g.quadraticCurveTo(x + lean * 0.3, by - len * 0.6, x + lean + sway, by - len); g.stroke();
		}
		drawBugs(true);
	},
	lookout(g, w, h, R, N, pal, S) {
		// a fire lookout on a ridge among ranges of mountains and firs, flat as cut paper, each range paler and hazier the
		// farther it is; its wires run down from pole to pole; birds now and then cross; at night its windows are lit
		const U = h * ASPECT, u = unit(h), horizon = h * (0.5 + R() * 0.06);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 160, horizon * 0.8, u);
		const sx = w * (0.15 + R() * 0.7), sy = horizon * (0.25 + R() * 0.4), sr = h * (0.05 + R() * 0.03), shown = R() < 0.65;
		if (shown || pal.moon) sun(g, sx, sy, sr, pal, 0.4);
		const layers = 7, at = 3 + ((R() * 2) | 0), dir = R() < 0.5 ? 1 : -1, tx = w * (0.22 + R() * 0.56);
		const haze = mix(pal.sky[2], pal.sky[1], 0.2), dark = mix(landAt(pal, 1), BLACK, 0.2);
		const land = S.memo('ranges', (r) => {
			const c = canvasOf(w, h), cg = c.getContext('2d');
			let tower = null;
			for (let i = 0; i < layers; i++) {
				const t = i / (layers - 1), color = mix(landAt(pal, 0.1 + t * 0.9), haze, Math.pow(1 - t, 1.4) * 0.8);
				const base = h * (0.4 + t * 0.5), amp = h * (0.3 - t * 0.15), freq = 1.4 + t * 2.4, ph = r() * 50;
				// far: sharp peaks; middle: rock in steps and cliffs; near: rounded and wooded
				const f = (x) => {
					const v0 = x / U * freq + ph;
					if (i < 2) return base - amp * 1.6 * Math.pow(N.ridge1(v0, 4), 1.5);
					if (i < 5) {   // rock: knolls and buttresses, stepped into ledges and cliffs
						const q = N.fbm1(v0 * 1.8, 4) * 0.55 + Math.pow(N.ridge1(v0 * 1.1 + 3, 3), 2) * 0.55, s0 = q * 5, fr = s0 - Math.floor(s0), step = Math.max(0, Math.min(1, (fr - 0.55) / 0.45));
						return base - amp * 1.9 * (q * 0.5 + 0.5 * (Math.floor(s0) + step * step * (3 - 2 * step)) / 5);
					}
					return base - amp * 1.6 * N.fbm1(v0, 3);
				};
				cg.fillStyle = css(color);
				cg.beginPath(); cg.moveTo(0, h);
				for (let x = 0; x <= w + 2; x += 2) cg.lineTo(x, f(x));
				cg.lineTo(w, h); cg.closePath();
				// firs along the ridge, in the range's own colour: in clumps far away, a wall near by
				if (i > 0) {
					const th = h * (0.018 + t * 0.12), cut = 0.62 - t * 0.6;
					for (let x = -th; x < w + th; x += th * (0.22 + r() * 0.3) / (0.35 + t * 0.65)) {
						const ht = th * (0.6 + r() * 0.8), y = f(x) + ht * (0.12 + r() * 0.5 * t), sd = r() * 100;
						if (N.n1(x / U * 6 + ph) >= cut) firPath(cg, x, y, ht, sd);
					}
					if (i >= layers - 2) for (let x = r() * th; x < w; x += th * (0.4 + r() * 0.8)) firPath(cg, x, f(x) + th * (0.4 + r() * 0.5), th * (0.7 + r() * 0.6), r() * 100);
				}
				cg.fill();
				if (i < layers - 1) mist(cg, w, base + h * 0.02, h * 0.12, haze, 0.35 * (1 - t));
				if (i === at) {
					const th = h * (0.34 + (at - 3) * 0.06);
					tower = lookoutTower(cg, tx, f(tx) + th * 0.04, th, dark, mix(pal.sky[2], WHITE, 0.25), u);
					// the wires run down to three poles, each farther, lower and smaller
					let [px, py] = tower.wires[dir > 0 ? 1 : 0];
					cg.strokeStyle = css(dark); cg.fillStyle = css(dark);
					for (let k = 1; k <= 3; k++) {
						const qx = tx + dir * U * 0.05 * k * (1 + k * 0.25), pole = th * (0.42 - k * 0.07), qb = f(qx) + th * 0.06 * k, qy = qb - pole;
						cg.lineWidth = Math.max(1, u); cg.beginPath(); cg.moveTo(qx, qb); cg.lineTo(qx, qy); cg.stroke();
						cg.fillRect(qx - pole * 0.09, qy + pole * 0.05, pole * 0.18, Math.max(1, u * 0.8));
						cg.lineWidth = Math.max(1, u * 0.55);
						cg.beginPath(); cg.moveTo(px, py); cg.quadraticCurveTo((px + qx) / 2, Math.max(py, qy) + Math.abs(qx - px) * 0.14, qx, qy + pole * 0.05); cg.stroke();
						[px, py] = [qx, qy + pole * 0.05];
					}
				}
			}
			return { c, tower };
		});
		g.drawImage(land.c, 0, 0);
		if (pal.dark && land.tower) {   // the lamp in the cabin, flickering a little
			const warm = hex('#ffcf7a'), fl = 0.85 + 0.15 * Math.sin(T * 2.3) * Math.sin(T * 5.1);
			for (const [x, y, ww, wh] of land.tower.wins) { glow(g, x + ww / 2, y + wh / 2, wh * 3, warm, 0.18 * fl); g.fillStyle = css(warm, 0.9 * fl); g.fillRect(x, y, ww, wh); }
		}
		wisps(g, w, h, R, horizon + h * 0.12, haze, 2, 0.25);
		birds(g, w, h, R, dark, horizon * 0.95, 12);
	},

	field(g, w, h, R, N, pal, S) {
		// tall grass to the horizon under towering clouds, flat-shaded like a still from an animated film: gusts run across
		// the grass and bend it, the plumes nod, light flickers on the near grass, birds now and then cross
		const U = h * ASPECT, u = unit(h), horizon = h * (0.5 + R() * 0.08);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, u);
		const sx = w * (0.55 + R() * 0.4), sy = R() < 0.5 ? -h * 0.15 : horizon * (0.12 + R() * 0.3);   // high up, often out of sight
		sun(g, sx, sy, h * 0.07, pal, 0.5);
		clouds(g, w, h, S, pal, horizon, 2 + ((R() * 2) | 0), { crisp: true, low: true, size: 1.1, name: 'wall' });
		clouds(g, w, h, S, pal, horizon * 0.85, 1 + ((R() * 2) | 0), { crisp: true, name: 'high' });
		birds(g, w, h, R, mix(WHITE, pal.sky[2], 0.3), horizon * 0.8, 9);
		const far = mix(pal.sky[2], WHITE, pal.dark ? 0.04 : 0.3), deep = pal.land[3];
		const gr = g.createLinearGradient(0, horizon, 0, h);
		gr.addColorStop(0, css(far)); gr.addColorStop(0.15, css(mix(far, pal.land[0], 0.6))); gr.addColorStop(0.5, css(pal.land[1])); gr.addColorStop(1, css(deep));
		g.fillStyle = gr;
		g.fillRect(0, horizon - 1, w, h - horizon + 1);
		// the blades, made once: where, how deep, how long, how they lean, which tone, whether they carry a plume
		const B = S.memo('blades', (r) => {
			const n = Math.round(2800 * w / U), a = new Float32Array(n * 6);
			for (let i = 0; i < n; i++) {
				const d = Math.pow(r(), 1.4);
				a.set([r() * (w + 40) - 20, d, h * (0.01 + 0.3 * d * d) * (0.5 + r()), (r() - 0.5) * 0.5, r() < 0.3 ? 1 : 0, d > 0.3 && r() < 0.05 ? 1 : 0], i * 6);
			}
			return a;
		});
		// the wind: a slow swell running across, gusts riding on it, a flutter
		const gust = (x) => 0.22 + 0.32 * Math.sin(x / (U * 0.42) * TAU - T * 1.1) * (0.6 + 0.4 * Math.sin(x / (U * 0.13) - T * 0.7)) + 0.06 * Math.sin(T * 3.1 + x * 0.05);
		const tone = (d, light) => light ? mix(mix(far, pal.land[1], d * 0.8), WHITE, pal.dark ? 0.05 : 0.18) : mix(mix(far, pal.land[1], 0.4 + d * 0.3), deep, Math.pow(d, 0.8));
		const bands = 6, plumes = [], paths = Array.from({ length: bands * 2 }, () => new Path2D());
		for (let i = 0; i < B.length; i += 6) {
			const x = B[i], d = B[i + 1], len = B[i + 2], y = horizon + (h - horizon) * Math.pow(d, 1.5) + 1, gu = gust(x);
			const bend = len * Math.max(-0.9, Math.min(0.9, B[i + 3] * 0.6 + gu * (0.5 + d)));
			const tx = x + bend, ty = y - len * (1 - 0.35 * (bend / len) ** 2), cx = x + bend * 0.15, cy = y - len * 0.6;
			// a blade bent far over by a gust shows its light side: bright waves run across the field with the wind
			const light = B[i + 4] || gu > 0.42 + hash1(i) * 0.25 ? 1 : 0, path = paths[Math.min(bands - 1, (d * bands) | 0) * 2 + light];
			path.moveTo(x, y); path.quadraticCurveTo(cx, cy, tx, ty);
			if (B[i + 5]) plumes.push([tx, ty, cx, cy, len, d]);
		}
		const blades = (lo, hi) => {
			g.lineCap = 'round';
			for (let k = lo; k < hi; k++) for (const light of [0, 1]) {
				g.strokeStyle = css(tone((k + 0.5) / bands, light));
				g.lineWidth = u * (0.5 + (k / bands) * 2.2);
				g.stroke(paths[k * 2 + light]);
			}
		};
		blades(0, 4);
		// light falling through onto the near grass, in dabs that flicker
		const fleck = mix(far, WHITE, pal.dark ? 0.1 : 0.4);
		for (let i = 0, k = 45 * w / U; i < k; i++) {
			const x = R() * w, y = horizon + (h - horizon) * (0.45 + R() * 0.55), s = h * (0.006 + R() * 0.02), ph = R() * TAU, a = 0.25 + 0.3 * R();
			const fx = x + Math.sin(T * 1.1 + ph) * s * 0.3;
			g.fillStyle = css(fleck, a * (0.6 + 0.4 * Math.sin(T * 1.5 + ph)));
			g.beginPath();
			g.moveTo(fx + s, y); g.ellipse(fx, y, s, s * 0.7, 0, 0, TAU);
			g.moveTo(fx + s * 1.4, y - s * 0.3); g.ellipse(fx + s * 0.8, y - s * 0.3, s * 0.6, s * 0.5, 0, 0, TAU);
			g.fill();
		}
		blades(4, bands);
		// plumes: feathered heads on the last stretch of a few stems
		for (const [tx, ty, cx, cy, len, d] of plumes) {
			const L = len * 0.3, wd = Math.max(u * 1.2, len * 0.05);
			g.save(); g.translate(tx, ty); g.rotate(Math.atan2(ty - cy, tx - cx));
			g.fillStyle = css(tone(d, 0));
			g.beginPath(); g.ellipse(-L * 0.5, 0, L * 0.5, wd, 0, 0, TAU); g.fill();
			g.strokeStyle = css(tone(d, 1)); g.lineWidth = Math.max(1, u * 0.6);
			g.beginPath();
			for (let k = 1; k < 6; k++) { const px = -L * k / 6; g.moveTo(px, -wd * 0.7); g.lineTo(px - L * 0.08, wd * 0.7); }
			g.stroke();
			g.restore();
		}
		// long dark leaves right in front, bending the most
		g.fillStyle = css(mix(deep, BLACK, 0.15));
		for (let i = 0, k = 7 * w / U; i < k; i++) {
			const x = R() * w, len = h * (0.25 + R() * 0.45), wd = u * (2 + R() * 3), lean = (R() - 0.3) * 0.6, ph = R() * TAU;
			const bend = len * Math.max(-0.9, Math.min(0.9, lean + gust(x) * 0.6 + 0.04 * Math.sin(T * 2 + ph)));
			const tx = x + bend, ty = h - len * (1 - 0.35 * (bend / len) ** 2), cx = x + bend * 0.1, cy = h - len * 0.6;
			g.beginPath(); g.moveTo(x - wd, h + 2); g.quadraticCurveTo(cx - wd * 0.5, cy, tx, ty); g.quadraticCurveTo(cx + wd * 0.5, cy, x + wd, h + 2); g.closePath(); g.fill();
		}
	},

	grove(g, w, h, R, N, pal, S) {
		// a clearing as pixel art: firs and round bushes in clumps of leaves lit on the sun's side, meadows in flat bands with
		// a lit crest, a tower of cloud behind; the trees sway a little, the clouds drift, birds now and then cross
		const U = h * ASPECT, u = unit(h), horizon = h * (0.56 + R() * 0.06);
		sky(g, w, h, pal, horizon);
		nightStars(g, w, h, R, pal, 140, horizon * 0.8, u);
		const sx = w * (0.1 + R() * 0.8);
		sun(g, sx, horizon * (0.15 + R() * 0.35), h * (0.05 + R() * 0.02), pal, 0.4);
		clouds(g, w, h, S, pal, horizon + h * 0.06, 1 + ((R() * 2) | 0), { crisp: true, low: true, size: 1.2, name: 'wall' });
		birds(g, w, h, R, landAt(pal, 1), horizon * 0.8);
		const haze = pal.sky[2];
		// the leaves' tones on the ground i (0 far .. 2 near), bushes a shade darker, the far ones gone into the haze
		const tones = (i, bush) => {
			const t = i / 2 + (bush ? 0.2 : 0), hz = (1 - i / 2) * 0.35, H = (c) => mix(c, mix(haze, pal.sky[1], 0.4), hz);
			return {
				shadow: H(mix(landAt(pal, 0.85 + t * 0.15), BLACK, 0.15 + t * 0.15)), mid: H(landAt(pal, 0.6 + t * 0.3)), lit: H(mix(landAt(pal, 0.3 + t * 0.35), pal.sun, 0.06)),
				hi: H(mix(landAt(pal, 0.1 + t * 0.3), pal.sun, 0.2)), rim: WHITE, rimA: 0, under: null, crisp: true, pockets: 0.25,
			};
		};
		const world = S.memo('grove', (r) => {
			const grounds = [];
			for (let i = 0; i < 3; i++) {
				const t = i / 2, base = horizon + h * (0.02 + t * 0.24), amp = h * (0.05 + 0.04 * (1 - t)), ph = r() * 50, freq = 1.2 + t;
				const f = (x) => base - amp * 1.6 * N.fbm1(x / U * freq + ph, 2);
				const c = canvasOf(w, h), cg = c.getContext('2d');
				const lit = mix(mix(landAt(pal, 0.05 + t * 0.4), pal.sun, 0.12), haze, (1 - t) * 0.35), body = mix(landAt(pal, 0.25 + t * 0.55), haze, (1 - t) * 0.3);
				cg.fillStyle = css(lit); fillUnder(cg, w, h, f);
				cg.fillStyle = css(body); fillUnder(cg, w, h, (x) => f(x) + h * (0.02 + 0.025 * N.n1(x / U * 4 + ph)));
				// the trees standing on it, and their shadows on it
				const trees = [], count = (i === 0 ? 16 : i === 1 ? 6 : 4) * w / U;
				for (let k = 0; k < count; k++) {
					const x = r() * w, bush = i === 2 ? r() < 0.7 : r() < 0.2;
					const ht = h * (i === 0 ? 0.1 + r() * 0.1 : i === 1 ? 0.26 + r() * 0.2 : 0.3 + r() * 0.25) * (bush ? 0.65 : 1);
					const y = f(x) + h * (0.012 + r() * (i === 2 ? 0.2 : 0.04));
					trees.push({ x, y, ht, bush, ph: r() * TAU, sp: foliage(r, bush ? 'bush' : 'fir', ht, tones(i, bush), x < sx ? 0.6 : -0.6, u) });
				}
				trees.sort((a, b) => a.y - b.y);
				cg.globalCompositeOperation = 'source-atop';
				for (let k = 0, m = 10 * w / U * (0.5 + t); k < m; k++) {   // long patches of shade and of light across it
					const x = r() * w, y = f(x) + h * (0.04 + r() * 0.3), rx = h * (0.08 + r() * 0.2) * (0.5 + t), shade = r() < 0.65;
					cg.fillStyle = css(shade ? mix(body, BLACK, 0.1) : mix(body, lit, 0.35));
					cg.beginPath();
					for (let j = 0; j < 4; j++) { const ex = x + (j - 1.5) * rx * 0.5, ey = y + (r() - 0.5) * rx * 0.06, er = rx * (0.4 + r() * 0.3); cg.moveTo(ex + er, ey); cg.ellipse(ex, ey, er, er * 0.12, 0, 0, TAU); }
					cg.fill();
				}
				cg.fillStyle = css(mix(body, BLACK, 0.25));
				for (const tr of trees) { cg.beginPath(); cg.ellipse(tr.x + (tr.x < sx ? -1 : 1) * tr.ht * 0.15, tr.y, tr.ht * (tr.bush ? 0.6 : 0.35), tr.ht * 0.06, 0, 0, TAU); cg.fill(); }
				grounds.push({ c, trees });
			}
			return grounds;
		});
		for (const { c, trees } of world) {
			g.drawImage(c, 0, 0);
			for (const tr of trees) {
				const k = 0.025 * Math.sin(T * 0.8 + tr.ph) * (tr.bush ? 0.4 : 1);   // a sway: the top leans, the foot stays
				g.save();
				g.translate(tr.x, tr.y);
				g.transform(1, 0, k, 1, 0, 0);
				g.drawImage(tr.sp.c, -tr.sp.ax, -tr.sp.by);
				g.restore();
			}
		}
	},
};

// ------------------------------------------------------------------------------------------------------------ drawing

const BAYER = (() => {
	const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
		[3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
	return m.map((r) => Float32Array.from(r, (v) => (v + 0.5) / 64));
})();

/** Ordered dither: each channel to a few levels, the Bayer matrix deciding which way each pixel rounds. */
function dither(g, w, h, levels) {
	const img = g.getImageData(0, 0, w, h), d = img.data, q = (levels - 1) / 255, iq = 255 / (levels - 1), top = levels - 1;
	for (let y = 0, i = 0; y < h; y++) {
		const row = BAYER[y & 7];
		for (let x = 0; x < w; x++, i += 4) {
			const b = row[x & 7];
			let v = (d[i] * q + b) | 0; d[i] = (v > top ? top : v) * iq;
			v = (d[i + 1] * q + b) | 0; d[i + 1] = (v > top ? top : v) * iq;
			v = (d[i + 2] * q + b) | 0; d[i + 2] = (v > top ? top : v) * iq;
		}
	}
	g.putImageData(img, 0, 0);
}

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

const STORE = new Map();   // cached layers and fields, newest last
function stored(key, make) {
	let v = STORE.get(key);
	if (v === undefined) {
		v = make();
		STORE.set(key, v);
		if (STORE.size > STORE_MAX) STORE.delete(STORE.keys().next().value);
	} else { STORE.delete(key); STORE.set(key, v); }
	return v;
}

/** A fixed grain, laid over a smooth picture. */
const grainOf = (w, h) => stored(`grain|${w}x${h}`, () => {
	const c = canvasOf(w, h), cg = c.getContext('2d'), img = cg.createImageData(w, h), d = img.data, r = mulberry(7);
	for (let i = 0; i < d.length; i += 4) { const v = 128 + (r() - 0.5) * 60; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
	cg.putImageData(img, 0, 0);
	return c;
});

/**
 * Draws one frame of a banner, at time t (seconds), into a canvas of the size it has; with `post`, dithered (or grained)
 * on the CPU too. The moon is in today's phase unless another is given.
 */
function drawFrame(canvas, b, style, t, post = true, phase = moonPhase()) {
	T = t;
	const w = canvas.width, h = canvas.height, g = canvas.getContext('2d', { willReadFrequently: post });
	SUN = { x: w / 2, y: -h };
	PHASE = phase;
	g.setTransform(1, 0, 0, 1, 0, 0);
	g.globalAlpha = 1;
	g.globalCompositeOperation = 'source-over';
	const S = { memo: (name, make) => stored(`${b.id}|${w}x${h}|${name}`, () => make(mulberry(b.seed ^ fnv(name)))) };
	DRAW[b.scene](g, w, h, mulberry(b.seed ^ 0x5bd1e995), b.N, PALETTES[b.palette], S);
	g.setTransform(1, 0, 0, 1, 0, 0);
	g.globalAlpha = 1;
	g.globalCompositeOperation = 'source-over';
	if (post) finish(g, w, h, style);
}

/** The CPU's dither, or the grain over a smooth picture. */
function finish(g, w, h, style) {
	if (style !== 'smooth') { dither(g, w, h, LEVELS); return; }
	g.globalCompositeOperation = 'overlay';
	g.globalAlpha = 0.35;
	g.drawImage(grainOf(w, h), 0, 0);
	g.globalAlpha = 1;
	g.globalCompositeOperation = 'source-over';
}

// The same dither as dither() (an 8x8 Bayer matrix, built recursively), or a fixed grain, done on the GPU.
const VERT = 'attribute vec2 p; varying vec2 uv; void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
uniform float levels, grained;
float b2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float b4(vec2 a) { return b2(0.5 * a) * 0.25 + b2(a); }
float b8(vec2 a) { return b4(0.5 * a) * 0.25 + b2(a); }
float hash(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
	vec3 c = texture2D(tex, uv).rgb;
	if (grained > 0.5) c += (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.05;
	else { float l = levels - 1.0; c = min(floor(c * l + b8(gl_FragCoord.xy)), vec3(l)) / l; }
	gl_FragColor = vec4(c, 1.0);
}`;

/** Puts a frame drawn in 2D on the visible canvas, through the GPU's dither when WebGL is there, else the CPU's. */
class Presenter {
	constructor(view) {
		this.view = view;
		this.gl = view.getContext('webgl', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false });
		if (!this.gl) { this.g2 = view.getContext('2d', { willReadFrequently: true }); return; }
		view.addEventListener('webglcontextlost', (e) => e.preventDefault());
		view.addEventListener('webglcontextrestored', () => this.init());
		this.init();
	}

	init() {
		const gl = this.gl, sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
		const prog = gl.createProgram();
		gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
		gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
		gl.linkProgram(prog);
		gl.useProgram(prog);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		const at = gl.getAttribLocation(prog, 'p');
		gl.enableVertexAttribArray(at);
		gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
		gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
		for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		this.uLevels = gl.getUniformLocation(prog, 'levels');
		this.uGrained = gl.getUniformLocation(prog, 'grained');
	}

	present(src, style) {
		const { view, gl } = this, w = src.width, h = src.height;
		if (view.width !== w) view.width = w;
		if (view.height !== h) view.height = h;
		if (!gl) { this.g2.drawImage(src, 0, 0); finish(this.g2, w, h, style); return; }
		if (gl.isContextLost()) return;
		gl.viewport(0, 0, w, h);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
		gl.uniform1f(this.uLevels, LEVELS);
		gl.uniform1f(this.uGrained, style === 'smooth' ? 1 : 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	dispose() { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
}

// ------------------------------------------------------------------------------------------------------------- plugin

const readJSON = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window */ } };
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

class Plugin extends AppPlugin {
	onLoad() {
		this.variants = readJSON(VARIANT_KEY, {});
		this.watched = new Map();    // .panel-heading -> { mo, ro }
		this.strips = new Map();     // .panel-heading -> { wrap, view, draw, presenter, b, style, visible, last, cost }
		this.titleTimers = new Map();   // panel id -> timer
		this.raf = 0;
		this.io = new IntersectionObserver((entries) => {
			for (const e of entries) for (const s of this.strips.values()) if (s.wrap === e.target) s.visible = e.isIntersecting;
			this.kick();
		});
		this.period = periodOf();
		this.clock = setInterval(() => { const p = periodOf(); if (p !== this.period) { this.period = p; this.syncAll(); } }, 60000);

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

		const toggle = (key) => () => { writeJSON(key, !readJSON(key, false)); this.syncAll(); };
		this.ui.addCommandPaletteCommand({ label: 'Auto Banner: another picture for this page', icon: 'ti-dice-5', onSelected: () => this.setVariant(1 + ((Math.random() * 1e6) | 0)) });
		this.ui.addCommandPaletteCommand({ label: "Auto Banner: back to this page's own picture", icon: 'ti-arrow-back-up', onSelected: () => this.setVariant(0) });
		this.ui.addCommandPaletteCommand({ label: 'Auto Banner: switch between dither and smooth', icon: 'ti-grain', onSelected: () => {
			writeJSON(STYLE_KEY, this.style() === 'dither' ? 'smooth' : 'dither');
			this.syncAll();
		} });
		this.ui.addCommandPaletteCommand({ label: 'Auto Banner: motion on or off', icon: 'ti-player-play', onSelected: toggle(STILL_KEY) });
		this.ui.addCommandPaletteCommand({ label: 'Auto Banner: follow the time of day or not', icon: 'ti-clock', onSelected: toggle(CLOCKLESS_KEY) });
		this.ui.addCommandPaletteCommand({ label: 'Auto Banner: turn on or off', icon: 'ti-photo', onSelected: toggle(OFF_KEY) });

		soon();
	}

	onUnload() {
		for (const t of this.titleTimers.values()) clearTimeout(t);
		clearInterval(this.clock);
		cancelAnimationFrame(this.raf);
		this.io.disconnect();
		for (const heading of [...this.watched.keys()]) this.clear(heading);
	}

	style() {
		const own = readJSON(STYLE_KEY, null);
		if (own) return own;
		return this.getConfiguration()?.custom?.style === 'smooth' ? 'smooth' : 'dither';
	}

	moving() { return !readJSON(STILL_KEY, false) && !reducedMotion(); }

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
		const cw = wrap.offsetWidth, ch = wrap.offsetHeight;
		if (cw < 2 || ch < 2) return heading;
		const style = this.style(), variant = this.variants[record.guid] || 0;
		const period = readJSON(CLOCKLESS_KEY, false) ? null : this.period, moving = this.moving();
		const key = [title, style, variant, period, cw, ch, moving].join('|');
		const old = this.strips.get(heading);
		if (old && old.key === key && old.view.isConnected) return heading;

		const same = old?.wrap === wrap && old.view.isConnected;
		const view = same ? old.view : canvasOf(cw, ch), draw = same ? old.draw : canvasOf(cw, ch);
		draw.width = cw; draw.height = ch;
		view.className = 'ab-canvas' + (style === 'smooth' ? '' : ' ab-dots');
		if (view.parentNode !== wrap) wrap.replaceChildren(view);
		const presenter = same ? old.presenter : new Presenter(view);
		if (old && !same) { old.presenter.dispose(); this.io.unobserve(old.wrap); }
		const b = makeBanner(title, { variant, period });
		const strip = { key, wrap, view, draw, presenter, b, style, visible: same ? old.visible : true, last: 0, cost: 0 };
		this.strips.set(heading, strip);
		this.io.observe(wrap);
		this.render(strip, moving ? performance.now() / 1000 : 0);
		this.kick();
		return heading;
	}

	render(s, t) {
		try {
			drawFrame(s.draw, s.b, s.style, t, false);
			s.presenter.present(s.draw, s.style);
		} catch (e) { console.warn('[Auto Banner]', e); s.visible = false; }
	}

	/** Runs the frames while some strip is in sight and motion is on. */
	kick() {
		if (this.raf || !this.moving()) return;
		const tick = (now) => {
			this.raf = 0;
			if (!this.moving()) return;
			let any = false;
			for (const s of this.strips.values()) {
				if (!s.visible || !s.view.isConnected) continue;
				any = true;
				// a frame that takes long lowers the rate, so the picture never costs more than a fifth of the time
				const fps = Math.min(SCENES[s.b.scene].fps || FPS, s.cost ? 1000 / (s.cost * 5) : FPS);
				if (now - s.last < 1000 / fps) continue;
				const t0 = performance.now();
				this.render(s, now / 1000);
				const dt = performance.now() - t0;
				s.cost = s.cost ? s.cost * 0.9 + dt * 0.1 : dt;
				s.last = now;
			}
			if (any) this.raf = requestAnimationFrame(tick);
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

	take(heading) {
		const s = this.strips.get(heading);
		if (s) { this.io.unobserve(s.wrap); s.presenter.dispose(); this.strips.delete(heading); }
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
