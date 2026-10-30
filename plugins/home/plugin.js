/**
 * Home
 *
 * A dashboard of your own, opened from a Home button beside Tasks in the sidebar. Its header is a wide view into deep space,
 * drawn with WebGL, in which every day on which something changed in the workspace is a star, brighter and bigger the more
 * changed that day; days in a row are joined by soft lines along which light travels from the older day to the newer, like
 * data being sent. The sky has three shapes, picked in its corner:
 *
 *   - Nebula: close in front of a cloud of glowing gas in layers, dark dust before its bright hearts, sliding slowly along
 *     it; no dots.
 *   - Neural: a living field of glowing filaments, like a nervous system, across the whole sky (the shader by zozuar - see
 *     BG.neural); no dots.
 *   - Star atlas: a flat chart with a grid, the ecliptic and drifting gas, every week a labelled constellation, panning slowly.
 *
 * and six biomes (Nebula, Ember, Aurora, Ice, Gold, Abyss), the colours any shape is drawn in. Under the sky: the last 30
 * days, today's journal and the pages edited last.
 *
 * The shape and the biome are kept per device.
 *
 * Under a theme that is paper rather than sky (the skeuomorphic ones, Notebook, Blueprint, Herbarium: SKINS) there is no WebGL
 * sky and no picker: the days are an SVG chart on the page's own ground, a column a week, which the theme's CSS colours (see
 * paper(), and data-skin / data-home-skin in plugin.css). Home is drawn again when the theme changes.
 *
 * What changed when is read from the workspace when Home opens: each page counts on the day it was made, and each line on the
 * day it was written and the day it was last changed. Lines written while Home is open brighten today's star as they come.
 *
 * The Home button is a copy of Thymer's own Tasks row (so it looks like the rest of the sidebar), set beside it: the two share
 * the line, the rest of the sidebar's top block is laid out as before, and in a collapsed sidebar they stack. Nothing of
 * Thymer's is moved. While a panel shows Home, its title bar is hidden (the sky starts at the top). Off on phones and tablets.
 */

const PANEL_TYPE = 'home';
const CACHE_MS = 120000;   // the workspace is read again when Home opens after this long
const LOOK_KEY = 'home:look';   // { shape, biome }
const MAX_INSTANCES = 4096;

const SHAPES = [
	{ id: 'nebula', name: 'Nebula', icon: 'ti-cloud' },
	{ id: 'neural', name: 'Neural', icon: 'ti-brain' },
	{ id: 'atlas', name: 'Star atlas', icon: 'ti-map-2' },
];
// The biomes: hot (the brightest parts), mid and cold (the faint outer parts), and the colour of the links between days.
const BIOMES = [
	{ id: 'nebula', name: 'Nebula', hot: [1.00, 0.55, 0.78], mid: [0.55, 0.30, 0.95], cold: [0.16, 0.42, 0.95], link: [0.55, 0.80, 1.00] },
	{ id: 'ember', name: 'Ember', hot: [1.00, 0.80, 0.45], mid: [1.00, 0.38, 0.16], cold: [0.55, 0.08, 0.20], link: [1.00, 0.70, 0.45] },
	{ id: 'aurora', name: 'Aurora', hot: [0.75, 1.00, 0.82], mid: [0.18, 0.88, 0.58], cold: [0.08, 0.32, 0.68], link: [0.55, 1.00, 0.80] },
	{ id: 'ice', name: 'Ice', hot: [0.94, 0.98, 1.00], mid: [0.52, 0.80, 1.00], cold: [0.18, 0.32, 0.78], link: [0.72, 0.90, 1.00] },
	{ id: 'gold', name: 'Gold', hot: [1.00, 0.95, 0.74], mid: [1.00, 0.74, 0.28], cold: [0.58, 0.32, 0.10], link: [1.00, 0.86, 0.52] },
	{ id: 'abyss', name: 'Abyss', hot: [0.62, 1.00, 0.94], mid: [0.10, 0.62, 0.80], cold: [0.04, 0.16, 0.46], link: [0.42, 0.92, 1.00] },
];

// Themes that are paper rather than sky: under them Home is drawn on the page (paper()), the theme's CSS colouring it.
const SKINS = { 'thymer-leather': 'leather', 'thymer-folder': 'folder', 'thymer-desk': 'desk', 'thymer-binder': 'binder', 'thymer-notebook': 'notebook', 'thymer-blueprint': 'blueprint', 'thymer-herbarium': 'herbarium' };
const skinOf = () => SKINS[document.documentElement.dataset.theme] || '';

/** Thymer on a phone or tablet: <html data-device="mobile|desktop">, or the user agent without it. */
const onMobile = () => {
	const d = document.documentElement.dataset.device;
	return d ? d === 'mobile' : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
};

const DAY = 86400000;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const keyDate = (k) => new Date(k + 'T00:00:00');
const daysAgo = (n) => new Date(dayStart(new Date()).getTime() - n * DAY);
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const css = (rgb) => `rgb(${rgb.map((c) => Math.round(c * 255)).join(',')})`;
const wordsIn = (line) => (line.segments || []).reduce((n, s) => n + (s && typeof s.text === 'string' ? s.text.trim().split(/\s+/).filter(Boolean).length : 0), 0);
const ago = (date) => {
	const s = (Date.now() - date.getTime()) / 1000;
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
	const d = Math.floor(s / 86400);
	return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
/** A first name to greet with: the display name's first word, or - when Thymer gives an email there - the part before the @. */
const firstName = (name) => {
	name = String(name || '').trim();
	if (name.includes('@')) name = name.split('@')[0].split(/[._+-]/)[0];
	name = name.split(/\s+/)[0] || '';
	return name ? name[0].toUpperCase() + name.slice(1) : '';
};
/** The week of the year (ISO 8601: weeks start on Monday, week 1 holds the year's first Thursday). */
const isoWeek = (d) => {
	const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
	return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
};

// ---- The sky's shaders -------------------------------------------------------------------------------------------------------
// One background shader per shape, sharing a head: the camera (eye and axes; a ray per pixel), the biome's colours, noise, and
// the far sky (dark, a faint tilted band of the galaxy, far stars in two layers).
const BG_VERT = `#version 300 es
in vec2 aQuad;
void main() { gl_Position = vec4(aQuad, 0.0, 1.0); }`;
const BG_HEAD = `#version 300 es
precision highp float;
uniform vec2 uRes, uCenter; uniform float uT, uDpr, uF, uPan, uK; uniform vec3 uEye, uRight, uUp, uFwd, uHot, uMid, uCold;
out vec4 o;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float fbm3o(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.875; }
float farStars(vec2 p, float cell) {
	vec2 g = floor(p / cell), f = fract(p / cell) - 0.5;
	float r = h21(g);
	if (r < 0.8) return 0.0;
	vec2 at = vec2(h21(g + 3.1), h21(g + 7.7)) - 0.5;
	float d = length(f - at * 0.8) * cell;
	return smoothstep(1.3, 0.0, d) * (r - 0.8) * 5.0 * (0.65 + 0.35 * sin(uT * (0.8 + r * 2.5) + r * 40.0));
}
vec2 pixel() { return vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr; }   // CSS px, y down
vec3 ray(vec2 px) { return normalize(uFwd + uRight * (px.x - uCenter.x) / uF - uUp * (px.y - uCenter.y) / uF); }
vec3 farSky(vec3 d) {
	float lon = atan(d.x, d.z), lat = asin(clamp(d.y, -1.0, 1.0));
	vec2 sky = vec2(lon, lat) * 520.0;
	float band = exp(-pow((lat - 0.35 * sin(lon + 0.8)) / 0.22, 2.0));
	vec3 col = mix(vec3(0.010, 0.011, 0.024), vec3(0.026, 0.030, 0.064), band) + uCold * band * 0.02;
	col += vec3(0.60, 0.66, 0.85) * farStars(sky, 9.0) * 0.45;
	col += vec3(0.85, 0.88, 1.00) * farStars(sky + 31.0, 17.0) * 0.75;
	return col;
}
`;
const BG = {
	// A nebula: sheets of glowing gas at depths z = 0.9 to -0.9, each warped noise, gathered front to back - so as the camera
	// slides along, the near ones move past the far ones; ionised hearts where it is thickest, dark dust drifting in front.
	nebula: `
void main() {
	vec3 d = ray(pixel()), col = farSky(d), acc = vec3(0.0);
	float trans = 1.0;
	for (int k = 0; k < 5; k++) {
		float z = 0.9 - float(k) * 0.45, t = (z - uEye.z) / d.z;
		if (t <= 0.0) continue;
		vec3 q = uEye + d * t;
		vec2 p = q.xy * 0.95 + vec2(float(k) * 3.7, float(k) * 1.3);
		vec2 w = vec2(fbm3o(p * 1.2 + uT * 0.012), fbm3o(p * 1.2 + 5.2 - uT * 0.009));
		float n = fbm2(p * 1.5 + w * 1.9);
		float shape = exp(-q.y * q.y / 0.5);   // the cloud's reach: endless sideways (the camera slides along it), not tall
		float dens = smoothstep(0.42, 0.9, n) * shape, heart = smoothstep(0.62, 0.92, n) * exp(-q.y * q.y * 1.6);
		vec3 tint = mix(mix(uCold, uMid, smoothstep(0.38, 0.72, n)), uHot, heart);
		acc += trans * (tint * dens * 0.5 + uHot * heart * 0.5);
		float dust = (k == 0 || k == 2) ? smoothstep(0.56, 0.82, fbm3o(p * 2.4 + 9.1 + w)) * shape : 0.0;
		trans *= 1.0 - min(0.85, dens * 0.32 + dust * 0.7);
	}
	o = vec4(col * trans + acc, 1.0);
}`,
	// A neural field, after zozuar (https://twitter.com/zozuar/status/1625182758745128981; on Shadertoy as mlBXRK, by gena):
	// thirty octaves of turning, warped sine waves whose sum glows where it bunches up into filaments. In the biome's
	// colours (the original is vec3(1, 2, 4)); no sky behind it. The days set it: uK (0 to 1, from how many there are) makes
	// it denser and quicker, a few days give a slow field of a few wide filaments. neuralField() is the same sum in JavaScript.
	neural: `
mat2 rotate2D(float r) { return mat2(cos(r), sin(r), -sin(r), cos(r)); }
void main() {
	vec2 size = uRes / uDpr, uv = (pixel() - 0.5 * size) / size.y * mix(0.55, 1.1, uK);
	uv.y = -uv.y;
	float t = uT * mix(0.12, 0.32, uK);
	vec2 n = vec2(0.0), q, N = vec2(0.0), p = uv + sin(t * 0.1) / 10.0;
	float S = 10.0;
	mat2 m = rotate2D(1.0);
	for (float j = 0.0; j++ < 30.0;) {
		p *= m; n *= m;
		q = p * S + j + n + t;
		n += sin(q);
		N += cos(q) / S;
		S *= 1.2;
	}
	vec3 tint = (uCold * 0.6 + uMid * 0.4) * 4.0;
	o = vec4(tint * mix(0.7, 1.0, uK) * pow(max(0.0, N.x + N.y + 0.2) + 0.005 / length(N), 2.1), 1.0);
}`,
	// A star atlas: deep blue paper, gas drifting behind it (slower than the chart: further off), a fine grid that moves as
	// the chart pans (uPan, in px), heavier lines at the weeks, the ecliptic dashed across it, and faint stars.
	atlas: `
void main() {
	vec2 px = pixel(), w = px + vec2(uPan, 0.0);
	float H = uRes.y / uDpr;
	vec3 col = mix(vec3(0.018, 0.026, 0.06), uCold * 0.09, 0.5) * (1.0 - 0.25 * px.y / H) + (fbm2(px * 0.6) - 0.5) * 0.018;
	vec2 gp = (px + vec2(uPan * 0.55, 0.0)) / 240.0, gw = vec2(fbm3o(gp * 1.3 + uT * 0.01), fbm3o(gp * 1.3 + 4.1));
	float gas = fbm2(gp + gw * 1.2), cloud = smoothstep(0.42, 0.9, gas);
	col += mix(uCold, uMid, smoothstep(0.5, 0.85, gas)) * cloud * 0.22 + uHot * smoothstep(0.78, 0.95, gas) * 0.06;
	float dec = abs(fract(w.y / 46.0) - 0.5) * 46.0, ra = abs(fract((w.x - 60.0) / 120.0) - 0.5) * 120.0, fine = abs(fract(w.x / 30.0) - 0.5) * 30.0;
	col += uMid * (smoothstep(0.9, 0.0, dec) * 0.11 + smoothstep(0.9, 0.0, ra) * 0.16 + smoothstep(0.7, 0.0, fine) * 0.04);
	float ecl = abs(w.y - (H * 0.47 + 42.0 * sin(w.x / 380.0)));
	col += uHot * smoothstep(1.1, 0.0, ecl) * step(0.45, fract(w.x / 16.0)) * 0.32;
	col += vec3(0.80, 0.85, 1.0) * farStars(w + 13.0, 11.0) * 0.4;
	col += vec3(0.80, 0.85, 1.0) * farStars(w * 0.55 + 71.0, 19.0) * 0.3;
	o = vec4(col, 1.0);
}`,
};
// One instance: a star (kind 0) at a with size s, a link (kind 1) from a to b, or today's ring (kind 2). In CSS px, y down.
const FX_VERT = `#version 300 es
in vec2 aQuad;
in vec2 iA; in vec2 iB; in float iS; in float iKind; in float iSeed; in vec4 iCol;
uniform vec2 uView;
out vec2 vL; out float vLen; out float vS; out vec4 vCol; flat out float vKind; out float vSeed;
void main() {
	vec2 c = iA, hs = vec2(iS * 9.0);   // (half is a reserved word in GLSL)
	float ang = 0.0;
	vLen = 0.0;
	if (iKind > 0.5 && iKind < 1.5) {   // a link: a quad along the segment
		vec2 d = iB - iA;
		vLen = length(d) * 0.5;
		c = (iA + iB) * 0.5; hs = vec2(vLen, 6.0); ang = atan(d.y, d.x);
	}
	vec2 q = aQuad * hs;
	vL = q;
	float cs = cos(ang), sn = sin(ang);
	vec2 w = c + vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);
	vec2 clip = w / uView * 2.0 - 1.0;
	gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
	vS = iS; vCol = iCol; vKind = iKind; vSeed = iSeed;
}`;
const FX_FRAG = `#version 300 es
precision highp float;
in vec2 vL; in float vLen; in float vS; in vec4 vCol; flat in float vKind; in float vSeed;
uniform float uT;
out vec4 o;
void main() {
	vec3 c;
	if (vKind < 0.5) {
		// a star: a hot core, a soft halo, and for the bright ones the four spikes a telescope gives them
		float r = length(vL), s = vS, b = vCol.a;
		float core = exp(-r * r / (s * s * 0.32)), halo = exp(-r / (s * 1.7)) * 0.32;
		float spikes = (exp(-abs(vL.y) * 1.3) * exp(-abs(vL.x) / (s * 6.5)) + exp(-abs(vL.x) * 1.3) * exp(-abs(vL.y) / (s * 6.5))) * smoothstep(0.5, 0.9, b) * 1.1;
		float tw = 0.88 + 0.12 * sin(uT * (1.3 + vSeed * 2.0) + vSeed * 50.0);
		c = (vCol.rgb * (core * 1.25 + halo + spikes) + vec3(1.0) * core * 0.7) * tw * min(1.0, b * 1.2 + 0.5);
	} else if (vKind < 1.5) {
		// a link: a faint thread, and pulses of light running along it from the older day to the newer
		float across = abs(vL.y), along = vL.x + vLen, len = vLen * 2.0;
		float ends = smoothstep(0.0, 10.0, along) * smoothstep(0.0, 10.0, len - along);   // it does not cross the stars' cores
		float thread = exp(-across * across / 1.6) * 0.3;
		float period = len + 90.0, at = mod(uT * 40.0 + vSeed * 997.0, period) - 45.0;
		float pulse = exp(-pow((along - at) / 9.0, 2.0)) * exp(-across * across / 3.0);
		c = vCol.rgb * (thread + pulse * 1.5) * ends * vCol.a;
	} else {
		// today's ring: it breathes
		float r = length(vL), R = vS * 3.2 + 2.0 * sin(uT * 2.2);
		c = vCol.rgb * exp(-pow((r - R) / 1.1, 2.0)) * 0.6 * vCol.a;
	}
	o = vec4(c, 1.0);
}`;
const FLOATS = 11;   // per instance: a.x, a.y, b.x, b.y, size, kind, seed, r, g, b, a

// Star colours, by temperature: blue-white, white, yellow-white, yellow, orange.
const STAR_COLORS = [[0.70, 0.80, 1.00], [0.92, 0.95, 1.00], [1.00, 0.96, 0.86], [1.00, 0.88, 0.66], [1.00, 0.74, 0.50]];

class Sky {
	constructor(canvas) {
		this.canvas = canvas;
		const gl = this.gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
		this.ok = !!gl;
		if (!this.ok) return;
		this.fx = this.program(FX_VERT, FX_FRAG);
		if (!this.fx) { this.ok = false; return; }
		this.bgs = {};   // the shapes' background programs, made when first shown
		const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		this.quad = quad;
		this.fxVao = gl.createVertexArray(); gl.bindVertexArray(this.fxVao);
		const loc = gl.getAttribLocation(this.fx, 'aQuad'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
		this.data = new Float32Array(MAX_INSTANCES * FLOATS);
		gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
		let off = 0;
		for (const [name, n] of [['iA', 2], ['iB', 2], ['iS', 1], ['iKind', 1], ['iSeed', 1], ['iCol', 4]]) {
			const l = gl.getAttribLocation(this.fx, name);
			gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, FLOATS * 4, off * 4); gl.vertexAttribDivisor(l, 1);
			off += n;
		}
		gl.bindVertexArray(null);
		this.fxU = Object.fromEntries(['uView', 'uT'].map((n) => [n, gl.getUniformLocation(this.fx, n)]));
	}

	program(vs, fs) {
		const gl = this.gl, sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
		const p = gl.createProgram();
		gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
		return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
	}

	/** The background program for a shape, made the first time it is asked for. */
	bg(shape) {
		if (this.bgs[shape] !== undefined) return this.bgs[shape];
		const gl = this.gl, p = this.program(BG_VERT, BG_HEAD + BG[shape]);
		if (!p) return (this.bgs[shape] = null);
		const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		const loc = gl.getAttribLocation(p, 'aQuad'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
		const u = Object.fromEntries(['uRes', 'uCenter', 'uT', 'uDpr', 'uF', 'uPan', 'uK', 'uEye', 'uRight', 'uUp', 'uFwd', 'uHot', 'uMid', 'uCold'].map((n) => [n, gl.getUniformLocation(p, n)]));
		return (this.bgs[shape] = { p, vao, u });
	}

	/** Draws the shape's background as the camera `cam` sees it, in the biome's colours, then the `n` instances in this.data. */
	draw(t, cam, n, scene) {
		const gl = this.gl, c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
		if (w && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
		gl.viewport(0, 0, c.width, c.height);
		gl.disable(gl.BLEND);
		const bg = this.bg(scene.shape);
		if (bg) {
			const u = bg.u, bi = scene.biome;
			gl.useProgram(bg.p);
			gl.uniform2f(u.uRes, c.width, c.height); gl.uniform1f(u.uT, t); gl.uniform1f(u.uDpr, c.width / (c.clientWidth || 1));
			gl.uniform1f(u.uF, cam.f); gl.uniform2f(u.uCenter, cam.cx, cam.cy); gl.uniform1f(u.uPan, cam.pan || 0); gl.uniform1f(u.uK, scene.k || 0);
			gl.uniform3fv(u.uEye, cam.eye); gl.uniform3fv(u.uRight, cam.right); gl.uniform3fv(u.uUp, cam.up); gl.uniform3fv(u.uFwd, cam.fwd);
			gl.uniform3fv(u.uHot, bi.hot); gl.uniform3fv(u.uMid, bi.mid); gl.uniform3fv(u.uCold, bi.cold);
			gl.bindVertexArray(bg.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		} else { gl.clearColor(0.02, 0.02, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
		if (n) {
			gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);   // light adds up
			gl.useProgram(this.fx);
			gl.uniform2f(this.fxU.uView, c.clientWidth, c.clientHeight); gl.uniform1f(this.fxU.uT, t);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, n * FLOATS);
			gl.bindVertexArray(this.fxVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
		}
		gl.bindVertexArray(null);
	}

	destroy() { try { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* ignore */ } }
}

/** How dense and quick the neural field is (0 to 1) for this many days. */
const neuralK = (days) => Math.min(1, days / 240);

/**
 * The neural field at the shader's uv (y up) at time `t` (in seconds) for density `k`: the sum BG.neural draws, worked out
 * the same way, so the days can light up when a filament passes them and drift with it. `fire` is the brightness (0 to 1),
 * `nx` and `ny` the sum's direction there.
 */
function neuralField(x, y, t, k) {
	const z = 0.55 + 0.55 * k;
	t *= 0.12 + 0.2 * k; x *= z; y *= z;
	const c = Math.cos(1), s = Math.sin(1), drift = Math.sin(t * 0.1) / 10;
	let px = x + drift, py = y + drift, nx = 0, ny = 0, Nx = 0, Ny = 0, S = 10;
	for (let j = 1; j <= 30; j++) {
		[px, py] = [px * c + py * s, -px * s + py * c];   // p *= m (a row vector times the matrix, as GLSL does it)
		[nx, ny] = [nx * c + ny * s, -nx * s + ny * c];
		const qx = px * S + j + nx + t, qy = py * S + j + ny + t;
		nx += Math.sin(qx); ny += Math.sin(qy);
		Nx += Math.cos(qx) / S; Ny += Math.cos(qy) / S;
		S *= 1.2;
	}
	return { fire: Math.min(1, Math.pow(Math.max(0, Nx + Ny + 0.2) + 0.005 / (Math.hypot(Nx, Ny) || 1e-3), 2.1) * 1.1), nx: Nx, ny: Ny };
}

// ---- The plugin ------------------------------------------------------------------------------------------------------------
class Plugin extends AppPlugin {
	cleanup = [];
	views = new Set();   // the open Home panels: { root, canvas, sky, raf, ... }
	activity = null;     // { days: { key: score }, recent: [...], at }
	look = { shape: 'nebula', biome: 'nebula' };

	onLoad() {
		if (onMobile()) { this.off = true; return; }
		try { this.look = { ...this.look, ...JSON.parse(localStorage.getItem(LOOK_KEY) || '{}') }; } catch (e) { /* the default */ }
		this.ui.registerCustomPanelType(PANEL_TYPE, (panel) => this.render(panel));
		this.ui.addCommandPaletteCommand({ label: 'Home: open', icon: 'ti-home', onSelected: () => this.open() });
		this.ui.addCommandPaletteCommand({ label: 'Home: next sky shape', icon: 'ti-planet', onSelected: () => this.setLook({ shape: SHAPES[(SHAPES.findIndex((s) => s.id === this.look.shape) + 1) % SHAPES.length].id }) });
		this.ui.addCommandPaletteCommand({ label: 'Home: next biome', icon: 'ti-palette', onSelected: () => this.setLook({ biome: BIOMES[(BIOMES.findIndex((b) => b.id === this.look.biome) + 1) % BIOMES.length].id }) });

		// Lines written while Home is open brighten today's star.
		const bump = (ev) => {
			if (!ev.source?.isLocal || !this.activity) return;
			const k = dayKey(new Date());
			this.activity.days[k] = (this.activity.days[k] || 0) + 1;
			this.views.forEach((v) => { this.layoutStars(v); this.fillChart(v); });
		};
		this.events.on('lineitem.created', bump, { collection: '*' });
		this.events.on('lineitem.updated', bump, { collection: '*' });

		// The Home button beside Tasks, put back whenever Thymer redraws the sidebar.
		let queued = false;
		const ensure = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; this.placeButton(); }); };
		const mo = new MutationObserver(ensure);
		mo.observe(document.body, { childList: true, subtree: true });
		this.cleanup.push(() => mo.disconnect());
		ensure();

		// The theme changing to or from a paper one: Home is drawn again, the other way.
		const skins = new MutationObserver(() => [...this.views].forEach((v) => { if (v.skin !== skinOf() && v.root.isConnected) this.render(v.panel); }));
		skins.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		this.cleanup.push(() => skins.disconnect());
	}

	onUnload() {
		if (this.off) return;
		this.cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
		this.cleanup = [];
		this.views.forEach((v) => this.closeView(v));
		this.removeButton();
	}

	// ---- The Home button -------------------------------------------------------------------------------------------------

	/** Finds Thymer's Tasks row and keeps a Home row (a copy of it) right after it, the two sharing one line. */
	placeButton() {
		const top = document.querySelector('.panels-grid-sidebar > .sidebar .sidebar--top') || document.querySelector('.sidebar--top');
		const rows = top ? [...top.querySelectorAll('.sidebar-item')] : [];
		const tasks = rows.find((e) => e !== this.button && (e.querySelector('.sidebar-item-label')?.textContent || '').trim().toLowerCase() === 'tasks');
		if (!tasks) return;
		if (this.button && this.button.isConnected && this.button.previousElementSibling === tasks && tasks.hasAttribute('data-home-half')) return;
		this.removeButton();
		const b = this.button = tasks.cloneNode(true);
		b.removeAttribute('id');
		b.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
		b.classList.remove('active', 'is-active', 'selected', 'is-selected');
		b.classList.add('home-button');
		const label = b.querySelector('.sidebar-item-label');
		if (label) {
			label.textContent = 'Home';
			// anything after the label (a count, a badge) belongs to Tasks
			let next = label.nextElementSibling; while (next) { const n = next.nextElementSibling; next.remove(); next = n; }
		}
		const icon = b.querySelector('[class*="ti-"]');
		if (icon) icon.className = [...icon.classList].filter((c) => !/^ti-/.test(c)).concat('ti-home').join(' ');
		b.title = 'Home';
		b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.open(); }, true);
		tasks.after(b);
		// the line the two share: their parent becomes a two-column grid where every other row spans both columns; when the
		// sidebar is collapsed to its icons, one column, so they stack
		const box = this.grid = tasks.parentElement;
		const gap = getComputedStyle(box).rowGap;
		box.style.setProperty('--home-row-gap', gap === 'normal' ? '0px' : gap);
		box.setAttribute('data-home-grid', '');
		tasks.setAttribute('data-home-half', ''); b.setAttribute('data-home-half', '');
		this.tasks = tasks;
		const narrow = () => { if (box.isConnected) box.toggleAttribute('data-home-stack', box.clientWidth < 150); };
		this.ro = new ResizeObserver(narrow); this.ro.observe(box); narrow();
	}

	removeButton() {
		this.ro?.disconnect(); this.ro = null;
		this.button?.remove(); this.button = null;
		this.tasks?.removeAttribute('data-home-half'); this.tasks = null;
		if (this.grid) { ['data-home-grid', 'data-home-stack'].forEach((a) => this.grid.removeAttribute(a)); this.grid.style.removeProperty('--home-row-gap'); this.grid = null; }
	}

	/** Shows Home in the panel being worked in (or a new one). */
	async open() {
		const panel = this.ui.getActivePanel() || await this.ui.createPanel();
		panel?.navigateToCustomType(PANEL_TYPE);
	}

	// ---- The page --------------------------------------------------------------------------------------------------------

	render(panel) {
		const el = panel.getElement();
		if (!el) return;
		panel.setTitle?.('Home');
		[...this.views].filter((v) => v.panel === panel || !v.root.isConnected).forEach((v) => this.closeView(v));
		el.innerHTML = `<div-scrollable class="home-scroll force-active-scrollbar" style="overflow-y: scroll; height: 100%"><div class="home">
			<header class="home-sky"><canvas></canvas><svg class="home-paper"></svg><div class="home-labels"></div>
				<div class="home-hello"><h1></h1><p></p></div>
				<div class="home-tip"></div><div class="home-quiet">Your stars will appear here as you write.</div>
				<div class="home-tools"><button class="home-look"></button></div>
				<div class="home-pick"><div class="home-pick-label">Shape</div><div class="home-shapes"></div><div class="home-pick-label">Biome</div><div class="home-biomes"></div></div>
			</header>
			<main class="home-body">
				<div class="home-row">
					<section class="home-card home-journal"></section>
					<section class="home-card home-chart"><div class="home-head"><span class="home-label">Last 30 days</span><span class="home-meta"></span></div><div class="home-bars"></div><div class="home-axis"><span></span><span>Today</span></div></section>
				</div>
				<section class="home-card home-recent"><div class="home-head"><span class="home-label">Recently edited</span></div><div class="home-list"><div class="home-empty">Loading…</div></div></section>
			</main></div></div-scrollable>`;
		const root = el.querySelector('.home');
		// Thymer puts a custom panel's content in a padded, centred box: take that back, so the sky reaches the panel's edges
		el.style.padding = '0'; el.style.margin = '0'; el.style.display = 'block'; el.style.minHeight = '100%';
		// the page's own background, for the sky to fade into
		let bg = '', n = el;
		while (n && (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement; }
		root.style.setProperty('--home-bg', bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : getComputedStyle(document.body).backgroundColor);
		const v = { panel, el, root, canvas: root.querySelector('canvas'), stars: [], links: [], fade: 0, t0: performance.now(), labels: new Map() };
		this.views.add(v);
		v.skin = skinOf();   // on paper: no sky, the days drawn by paper() (see SKINS)
		if (v.skin) root.dataset.skin = v.skin;
		this.buildPicker(v);
		this.fit(v);
		// the sidebar opening or closing, or panels being resized: fit to the panel's edges again and place the stars anew
		v.ro = new ResizeObserver(() => { if (this.views.has(v)) { this.fit(v); this.layoutStars(v); } });
		v.ro.observe(el);
		const host = v.host = el.closest('.panel');
		if (host) {   // its title bar is not needed here (see plugin.css); the theme styles the panel by the skin
			v.ro.observe(host); host.setAttribute('data-home-panel', '');
			if (v.skin) host.setAttribute('data-home-skin', v.skin); else host.removeAttribute('data-home-skin');
		}
		const hour = new Date().getHours(), name = firstName(this.data.getActiveUsers?.()[0]?.getDisplayName?.());
		root.querySelector('.home-hello h1').textContent = `${hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${name ? ', ' + name : ''}`;
		root.querySelector('.home-hello p').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
		if (v.skin) {
			root.querySelector('.home-quiet').textContent = 'Your days will appear here as you write.';
		} else {
			v.sky = new Sky(v.canvas);
			if (v.sky.ok) this.animate(v); else v.canvas.style.background = '#05060d';
			v.canvas.addEventListener('mousemove', (e) => this.hover(v, e));
			v.canvas.addEventListener('mouseleave', () => { root.querySelector('.home-tip').classList.remove('on'); });
		}
		this.showLook(v);
		this.load().then(() => { if (this.views.has(v)) this.fill(v); });
		this.fillJournal(v);
	}

	/**
	 * Whatever is still between the page and the panel's sides (padding further up), the page reaches past it: it is made
	 * that much wider and moved left, so the sky goes from edge to edge.
	 */
	fit(v) {
		const scroll = v.root.parentElement, panel = v.el.closest('.panel');
		if (!scroll || !panel) return;
		scroll.style.marginLeft = ''; scroll.style.width = '';
		const p = panel.getBoundingClientRect(), r = scroll.getBoundingClientRect(), left = Math.max(0, r.left - p.left), right = Math.max(0, p.right - r.right);
		if (left < 1 && right < 1) return;
		scroll.style.marginLeft = `${-left}px`; scroll.style.width = `calc(100% + ${left + right}px)`;
	}

	// ---- The look: shape and biome ---------------------------------------------------------------------------------------

	/** The sky's picker: a button in its corner opens the shapes and the biomes; a click outside closes it. */
	buildPicker(v) {
		const root = v.root, pick = root.querySelector('.home-pick');
		const shapes = root.querySelector('.home-shapes'), biomes = root.querySelector('.home-biomes');
		for (const s of SHAPES) {
			const b = document.createElement('button');
			b.className = 'home-shape'; b.dataset.v = s.id;
			b.innerHTML = `<span class="ti ${s.icon}"></span><span></span>`; b.lastChild.textContent = s.name;
			b.onclick = () => this.setLook({ shape: s.id });
			shapes.appendChild(b);
		}
		for (const bi of BIOMES) {
			const b = document.createElement('button');
			b.className = 'home-biome'; b.dataset.v = bi.id; b.title = bi.name;
			b.style.background = `radial-gradient(circle at 35% 30%, ${css(bi.hot)}, ${css(bi.mid)} 55%, ${css(bi.cold)})`;
			b.innerHTML = '<span></span>'; b.firstChild.textContent = bi.name;
			b.onclick = () => this.setLook({ biome: bi.id });
			biomes.appendChild(b);
		}
		root.querySelector('.home-look').onclick = (e) => { e.stopPropagation(); pick.classList.toggle('on'); };
		pick.addEventListener('click', (e) => e.stopPropagation());
		const close = () => pick.classList.remove('on');
		document.addEventListener('click', close);
		v.closePicker = () => document.removeEventListener('click', close);
	}

	/** Changes the shape or the biome (kept on this device); Home shows it at once. */
	setLook(patch) {
		this.look = { ...this.look, ...patch };
		try { localStorage.setItem(LOOK_KEY, JSON.stringify(this.look)); } catch (e) { /* this session only */ }
		this.views.forEach((v) => { if (patch.shape) { v.fade = 0; v.t0 = performance.now(); } this.showLook(v); this.layoutStars(v); });
	}

	showLook(v) {
		const shape = SHAPES.find((s) => s.id === this.look.shape) || SHAPES[0], biome = this.biome();
		const b = v.root.querySelector('.home-look');
		b.innerHTML = `<span class="ti ${shape.icon}"></span><span></span><i></i>`;
		b.children[1].textContent = shape.name;
		b.lastChild.style.background = `linear-gradient(135deg, ${css(biome.hot)}, ${css(biome.mid)} 55%, ${css(biome.cold)})`;
		v.root.querySelectorAll('.home-shape').forEach((e) => e.classList.toggle('on', e.dataset.v === shape.id));
		v.root.querySelectorAll('.home-biome').forEach((e) => e.classList.toggle('on', e.dataset.v === biome.id));
		v.root.style.setProperty('--sky-hot', css(biome.hot)); v.root.style.setProperty('--sky-mid', css(biome.mid));
		v.root.querySelector('.home-labels').classList.toggle('on', shape.id === 'atlas');
	}

	shape() { return (SHAPES.find((s) => s.id === this.look.shape) || SHAPES[0]).id; }
	biome() { return BIOMES.find((b) => b.id === this.look.biome) || BIOMES[0]; }

	/** The days the sky and the chart show. */
	days() { return this.activity?.days || {}; }

	closeView(v) {
		cancelAnimationFrame(v.raf);
		if (v.host && ![...this.views].some((o) => o !== v && o.host === v.host)) { v.host.removeAttribute('data-home-panel'); v.host.removeAttribute('data-home-skin'); }   // the panel shows something else: its bar comes back
		v.ro?.disconnect();
		v.closePicker?.();
		v.sky?.destroy();
		this.views.delete(v);
	}

	/** The frame loop of one Home panel: about 40 frames a second, none while hidden; it ends when the panel shows something else. */
	animate(v) {
		const frame = (now) => {
			if (!v.root.isConnected) { this.closeView(v); return; }
			v.raf = requestAnimationFrame(frame);
			if (document.hidden || now - (v.last || 0) < 24) return;
			v.last = now;
			const t = (now - v.t0) / 1000;
			v.fade = Math.min(1, v.fade + (v.stars.length ? 0.03 : 0));
			if (v.canvas.clientWidth !== v.w || v.canvas.clientHeight !== v.h) { this.fit(v); this.layoutStars(v); }   // the panel was resized
			const cam = this.camera(v, t);
			v.sky.draw(t, cam, this.instances(v, cam, t), { shape: v.shape, biome: this.biome(), k: neuralK(v.stars.length) });
		};
		v.raf = requestAnimationFrame(frame);
	}

	/**
	 * Where the camera is at time t, for the shape on show.
	 *   nebula: close in front of the cloud, sliding slowly along the stream of days and back (starting at today's end), so
	 *     the near layers of gas pass the far ones.
	 *   neural: no camera - the field fills the sky, still.
	 *   star atlas: no camera - the chart pans from today's end to the oldest week and back.
	 */
	camera(v, t) {
		const W = v.canvas.clientWidth || 900, H = v.canvas.clientHeight || 340;
		if (v.shape === 'neural') return { pan: 0, f: 1, cx: 0, cy: 0, eye: [0, 0, 1], fwd: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], flat: true };
		if (v.shape === 'atlas') {
			const room = Math.max(0, (v.chartW || 0) - W + 80), period = Math.max(60, room / 9);   // about 9px a second
			return { pan: room ? room * (0.5 + 0.5 * Math.cos((t / period) * Math.PI)) - 40 : -(W - (v.chartW || 0)) / 2, f: 1, cx: 0, cy: 0, eye: [0, 0, 1], fwd: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], flat: true };
		}
		// the nebula: close in front, about 1.8 units of it across the panel, sliding along the stream (x -1.7 to 1.7) and back
		const dist = 1.7, f = Math.min((W / 2) * dist / 0.9, H * 0.45 * dist / 0.3), slide = 1.7 * Math.cos((t / 160) * Math.PI);
		return { eye: [slide, 0.02 * Math.sin(t * 0.05), dist], fwd: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], f, cx: W * 0.5, cy: H * 0.42, dist };
	}

	// ---- What changed when -----------------------------------------------------------------------------------------------

	/** Reads the workspace (at most every CACHE_MS): a score per day, and the pages edited last. */
	async load() {
		if (this.activity && Date.now() - this.activity.at < CACHE_MS) return this.activity;
		if (this.loading) return this.loading;
		this.loading = (async () => {
			const days = {}, add = (date, n) => { if (!date) return; const k = dayKey(date); days[k] = (days[k] || 0) + n; };
			const recent = [];
			let cols = [];
			try { cols = await this.data.getAllCollections(); } catch (e) { /* none */ }
			for (const col of cols) {
				let recs = [];
				try { recs = await col.getAllRecords(); } catch (e) { continue; }
				for (const rec of recs) {
					const made = rec.getCreatedAt?.(), changed = rec.getUpdatedAt?.();
					add(made, 2);
					if (changed) recent.push({ guid: rec.guid, title: rec.getName() || 'Untitled', where: col.getName(), journal: !!col.isJournalPlugin?.(), at: changed });
				}
				for (let i = 0; i < recs.length; i += 8) {   // each page's lines: on the day written, and the day last changed
					await Promise.all(recs.slice(i, i + 8).map(async (rec) => {
						let lines = [];
						try { lines = await rec.getLineItems(); } catch (e) { return; }
						for (const ln of lines) {
							const made = ln.getCreatedAt?.(), changed = ln.getUpdatedAt?.();
							add(made, 1);
							if (changed && (!made || dayKey(changed) !== dayKey(made))) add(changed, 1);
						}
					}));
				}
			}
			recent.sort((a, b) => b.at - a.at);
			this.activity = { days, recent: recent.slice(0, 10), at: Date.now() };
			this.loading = null;
			return this.activity;
		})();
		return this.loading;
	}

	fill(v) {
		this.layoutStars(v);
		this.fillChart(v);
		const list = v.root.querySelector('.home-list');
		list.textContent = '';
		if (!this.activity.recent.length) { list.innerHTML = '<div class="home-empty">Nothing yet.</div>'; return; }
		for (const r of this.activity.recent) {
			const a = document.createElement('button');
			a.className = 'home-item';
			a.innerHTML = `<span class="home-ico ti ${r.journal ? 'ti-notebook' : 'ti-file-text'}"></span><span class="home-item-text"><b></b><small></small></span><em></em>`;
			a.querySelector('b').textContent = r.title; a.querySelector('small').textContent = r.where; a.querySelector('em').textContent = ago(r.at);
			a.onclick = () => v.panel.navigateTo({ type: 'edit_panel', rootId: r.guid, subId: null, workspaceGuid: this.getWorkspaceGuid() });
			list.appendChild(a);
		}
	}

	/** The last 30 days, a bar each, and the count of active days under the greeting. */
	fillChart(v) {
		if (!this.activity) return;
		const days = this.days(), today = dayStart(new Date());
		const score = (d) => days[dayKey(d)] || 0;
		const active = Object.keys(days).filter((k) => days[k] > 0).length;
		v.root.querySelector('.home-hello p').textContent = `${today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${fmt(active)} ${active === 1 ? 'day' : 'days'} ${v.skin === 'blueprint' ? 'on the sheet' : v.skin ? 'on the page' : 'among the stars'}`;
		const bars = v.root.querySelector('.home-bars'), last = [...Array(30)].map((_, i) => daysAgo(29 - i)), most = Math.max(1, ...last.map(score));
		bars.textContent = '';
		let total = 0;
		for (const d of last) {
			const s = score(d), bar = document.createElement('i');
			total += s;
			bar.style.height = `${s ? Math.max(6, (s / most) * 100) : 3}%`;
			bar.title = `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${fmt(s)} change${s === 1 ? '' : 's'}`;
			if (!s) bar.classList.add('none');
			if (d.getTime() === today.getTime()) bar.classList.add('today');
			bars.appendChild(bar);
		}
		v.root.querySelector('.home-meta').textContent = `${fmt(total)} changes`;
		v.root.querySelector('.home-axis span').textContent = last[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	async fillJournal(v) {
		const box = v.root.querySelector('.home-journal');
		const user = this.data.getActiveUsers?.()[0];
		let words = 0, lines = 0;
		try {
			const journal = (await this.data.getAllCollections()).find((c) => c.isJournalPlugin?.());
			const page = journal && user ? await journal.getJournalRecord(user) : null;
			if (page) for (const ln of await page.getLineItems()) { lines++; words += wordsIn(ln); }
		} catch (e) { /* show it empty */ }
		if (!this.views.has(v)) return;
		const today = new Date();
		box.innerHTML = `<div class="home-head"><span class="home-label">Today's journal</span></div>
			<div class="home-day"><b></b><span><strong></strong><small></small></span></div>
			<div class="home-journal-count"></div>
			<button class="home-go"><span class="ti ti-notebook"></span><span>Open today's journal</span><span class="ti ti-arrow-right"></span></button>`;
		box.querySelector('.home-day b').textContent = today.getDate();
		box.querySelector('.home-day strong').textContent = today.toLocaleDateString(undefined, { weekday: 'long' });
		box.querySelector('.home-day small').textContent = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
		box.querySelector('.home-journal-count').textContent = lines ? `${fmt(words)} words in ${fmt(lines)} ${lines === 1 ? 'line' : 'lines'} so far` : 'Nothing written yet today';
		box.querySelector('.home-go').onclick = () => { if (user) v.panel.navigateToJournal(user); };
	}

	// ---- The stars -------------------------------------------------------------------------------------------------------

	/**
	 * Places a star for every day with changes, as the shape on show has them (see the shapes in the header). Each star has
	 * `p` (a fixed place in the world), or in the atlas and the neural field a place on the sky (`w`, px). Days in a row are
	 * linked (in the atlas, only within their week; in the neural field, not at all: its filaments are the links).
	 */
	layoutStars(v) {
		const sky = v.root.querySelector('.home-sky');   // the canvas's size too, where there is one
		v.w = sky.clientWidth; v.h = sky.clientHeight;
		v.shape = v.skin ? 'paper' : this.shape();
		const days = this.days(), shape = v.shape;
		const keys = Object.keys(days).filter((k) => days[k] > 0).sort();
		v.root.querySelector('.home-quiet').classList.toggle('on', !!this.activity && !keys.length);
		v.labels.forEach((l) => l.remove()); v.labels.clear();
		v.stars = []; v.links = [];
		if (!keys.length) { v.root.querySelector('.home-paper').innerHTML = ''; return; }
		const first = keyDate(keys[0]).getTime(), span = Math.round((dayStart(new Date()).getTime() - first) / DAY) + 1;
		const max = Math.max(...keys.map((k) => days[k])), todayKey = dayKey(new Date()), now = new Date();
		const star = (k, i) => {
			const b = 0.5 * Math.log1p(days[k]) / Math.log1p(max) + 0.5 * Math.sqrt(days[k] / max);
			const tint = STAR_COLORS[Math.min(STAR_COLORS.length - 1, Math.floor(hash(i + 17) * (b > 0.7 ? 2 : STAR_COLORS.length)))];
			return { key: k, i, b, s: 1.1 + 3.6 * Math.pow(b, 1.3), tint, score: days[k], today: k === todayKey };
		};
		if (shape === 'paper') { this.paper(v, keys, star); return; }
		if (shape === 'nebula') {   // young stars on a stream that winds through the cloud, from the oldest (left, far) to today
			for (const k of keys) {
				const i = Math.round((keyDate(k).getTime() - first) / DAY), s = star(k, i), u = span > 1 ? i / (span - 1) : 1;
				s.p = [-2.05 + 4.1 * u + (hash(i + 41) - 0.5) * 0.12, 0.16 * Math.sin(u * 7.3 + 1.0) * (0.6 + 0.4 * Math.sin(u * 3.1)) + (hash(i + 7) - 0.5) * 0.09,
					-0.1 + 0.4 * Math.sin(u * 5.3 + 2.0) + (hash(i + 23) - 0.5) * 0.2];
				v.stars.push(s);
			}
		} else if (shape === 'neural') {   // points scattered across the sky, the oldest at the left, clear of the greeting and the cards
			const W = v.w || 900, H = v.h || 340;
			for (const k of keys) {
				const i = Math.round((keyDate(k).getTime() - first) / DAY), s = star(k, i), u = span > 1 ? i / (span - 1) : 1;
				s.w = [W * (0.03 + 0.94 * u) + (hash(i + 41) - 0.5) * 18, H * (0.07 + 0.62 * hash(i + 5))];
				s.tint = s.tint.map((c) => 0.55 + 0.45 * c);
				v.stars.push(s);
			}
		} else {   // the atlas: a column for each week, the oldest on the left; in it, the week's days scattered into a constellation
			const W = 120, H = v.h || 340, monday = (d) => { const x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); };
			const week0 = monday(keyDate(keys[0])), weeks = Math.round((monday(new Date()) - week0) / (7 * DAY)) + 1;
			v.chartW = weeks * W;
			for (const k of keys) {
				const d = keyDate(k), i = Math.round((d.getTime() - first) / DAY), s = star(k, i), wk = Math.round((monday(d) - week0) / (7 * DAY));
				s.week = wk;
				s.w = [wk * W + 18 + hash(i + 3) * (W - 36), H * 0.12 + hash(i + 5) * H * 0.5];
				s.tint = [1, 0.94, 0.84];
				v.stars.push(s);
			}
			const label = new Map();   // under each week's constellation: its number and month
			for (const s of v.stars) { const l = label.get(s.week) || { x: 0, y: 0, n: 0, date: keyDate(s.key) }; l.x += s.w[0]; l.y = Math.max(l.y, s.w[1]); l.n++; label.set(s.week, l); }
			const box = v.root.querySelector('.home-labels');
			for (const [wk, l] of label) {
				const e = document.createElement('span');
				e.textContent = `Wk ${isoWeek(l.date)} · ${l.date.toLocaleDateString(undefined, { month: 'short' })}`;
				e.dataset.x = l.x / l.n; e.dataset.y = l.y + 18;
				box.appendChild(e); v.labels.set(wk, e);
			}
		}
		for (let j = 1; j < v.stars.length; j++) {
			const a = v.stars[j - 1], b = v.stars[j];
			if (b.i - a.i === 1 && shape !== 'neural' && (shape !== 'atlas' || a.week === b.week)) v.links.push([a, b]);   // the field is the network's links
		}
	}

	/**
	 * On paper (a theme with a skin): the days as an SVG chart in the sky's place, which the theme's CSS colours. A column for
	 * each week, the newest at the right and as many older ones as fit (the rest counted at the left); in it the week's days
	 * scattered, sized by how much changed, days in a row joined, today ringed, the week's number and month under them.
	 * Pointing at a day tells it, as on the sky.
	 */
	paper(v, keys, star) {
		const svg = v.root.querySelector('.home-paper'), W = v.w || 900, H = v.h || 300;
		const monday = (d) => { const x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); };
		const first = keyDate(keys[0]), week0 = monday(first), weeks = Math.round((monday(new Date()) - week0) / (7 * DAY)) + 1;
		const colW = 84, fit = Math.max(1, Math.floor((W - 56) / colW)), shown = Math.min(weeks, fit), skip = weeks - shown;
		const x0 = W - 28 - shown * colW, top = H * 0.1;
		// the weeks stay clear of the greeting: beside it they may use half the sky, over it (a narrow panel) only what is above it
		const hello = v.root.querySelector('.home-hello'), sky = v.root.querySelector('.home-sky');
		const hr = hello.getBoundingClientRect(), sr = sky.getBoundingClientRect(), helloTop = hr.top - sr.top, helloRight = hr.right - sr.left;
		const span = x0 > helloRight + 16 ? H * 0.44 : Math.max(50, Math.min(H * 0.44, helloTop - top - 40));
		const cols = new Map();   // each shown week: a day in it, for its label
		for (const k of keys) {
			const d = keyDate(k), wk = Math.round((monday(d) - week0) / (7 * DAY)) - skip;
			if (wk < 0) continue;
			const i = Math.round((d.getTime() - first.getTime()) / DAY), s = star(k, i);
			s.week = wk; s.w = [x0 + wk * colW + 16 + hash(i + 3) * (colW - 32), top + hash(i + 5) * span];
			v.stars.push(s);
			if (!cols.has(wk)) cols.set(wk, d);
		}
		const n = (x) => x.toFixed(1);
		let out = '';
		for (let j = 1; j < v.stars.length; j++) {
			const a = v.stars[j - 1], b = v.stars[j];
			if (b.i - a.i === 1 && a.week === b.week) out += `<line class="home-pl" x1="${n(a.w[0])}" y1="${n(a.w[1])}" x2="${n(b.w[0])}" y2="${n(b.w[1])}"/>`;
		}
		for (const s of v.stars) {   // a rect, so the theme may round it into a dot or keep it square
			const r = 2.6 + 5 * s.b, [x, y] = s.w;
			if (s.today) out += `<rect class="home-pm-today" x="${n(x - r - 4)}" y="${n(y - r - 4)}" width="${n(2 * r + 8)}" height="${n(2 * r + 8)}"/>`;
			out += `<rect class="home-pm${s.today ? ' today' : ''}" data-i="${s.i}" x="${n(x - r)}" y="${n(y - r)}" width="${n(2 * r)}" height="${n(2 * r)}"/>`;
		}
		for (const [wk, d] of cols) out += `<text class="home-plabel" x="${n(x0 + wk * colW + colW / 2)}" y="${n(top + span + 26)}">Wk ${isoWeek(d)} · ${d.toLocaleDateString(undefined, { month: 'short' })}</text>`;
		if (skip) out += `<text class="home-plabel home-pmore" x="${n(x0 - 12)}" y="${n(top + span + 26)}">+${skip} wk</text>`;
		svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
		svg.innerHTML = out;
		const tip = v.root.querySelector('.home-tip');
		for (const e of svg.querySelectorAll('.home-pm')) {
			const s = v.stars.find((o) => o.i === Number(e.dataset.i));
			e.addEventListener('mouseenter', () => {
				tip.textContent = `${keyDate(s.key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${fmt(s.score)} change${s.score === 1 ? '' : 's'}`;
				tip.classList.add('on');
				const half = tip.offsetWidth / 2 + 8;   // the tip is centred on the day, and kept inside the sky
				tip.style.left = `${Math.min(W - half, Math.max(half, s.w[0]))}px`; tip.style.top = `${s.w[1] - 14}px`;
			});
			e.addEventListener('mouseleave', () => tip.classList.remove('on'));
		}
	}

	/** Writes this frame's stars, links and ring, as the camera sees them, into the sky's buffer; returns how many. */
	instances(v, cam, t) {
		const out = v.sky.data, W = v.canvas.clientWidth, H = v.canvas.clientHeight, a = v.fade, link = this.biome().link;
		let n = 0;
		const put = (ax, ay, bx, by, s, kind, seed, rgb, alpha) => {
			if (n >= MAX_INSTANCES) return;
			const o = n * FLOATS;
			out[o] = ax; out[o + 1] = ay; out[o + 2] = bx; out[o + 3] = by; out[o + 4] = s; out[o + 5] = kind; out[o + 6] = seed;
			out[o + 7] = rgb[0]; out[o + 8] = rgb[1]; out[o + 9] = rgb[2]; out[o + 10] = alpha;
			n++;
		};
		v.screen = [];
		if (!v.stars.length) return 0;
		if (v.shape === 'nebula' || v.shape === 'neural') return 0;   // these two skies are the gas and the field alone: no dots
		if (v.shape === 'neural') {   // each day drifts about its place with the field, and fires when a filament passes it
			const k = neuralK(v.stars.length), amp = H * (0.07 + 0.05 * k);
			for (const s of v.stars) {
				const f = neuralField((s.w[0] - W / 2) / H, -(s.w[1] - H / 2) / H, t, k), r = hash(s.i + 61) * 6.283, sp = 0.05 + 0.04 * k;
				const x = s.w[0] + f.nx * amp * 2 + Math.sin(t * sp + r) * amp * 0.35, y = s.w[1] - f.ny * amp * 2 + Math.cos(t * sp * 0.8 + r) * amp * 0.25;
				s.q = { x, y, k: 1, near: 1, fire: neuralField((x - W / 2) / H, -(y - H / 2) / H, t, k).fire };
			}
		} else if (cam.flat) {   // the atlas: on the chart, panned; the labels go with it
			for (const s of v.stars) s.q = { x: s.w[0] - cam.pan, y: s.w[1], k: 1, near: 1 };
			v.labels.forEach((e) => { const x = Number(e.dataset.x) - cam.pan; e.style.transform = `translate(${Math.round(x)}px, ${Math.round(Number(e.dataset.y))}px) translateX(-50%)`; e.style.opacity = x < -60 || x > W + 60 ? '0' : '1'; });
		} else {
			// world to screen along the camera's axes; `near` is 1 on the side facing the camera and 0 on the far side, where
			// the stars are smaller and dimmer
			const D = cam.dist;
			const project = (p) => {
				const dx = p[0] - cam.eye[0], dy = p[1] - cam.eye[1], dz = p[2] - cam.eye[2];
				const z = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
				return z <= 0.3 ? null : {
					x: cam.cx + (cam.f * (dx * cam.right[0] + dy * cam.right[1] + dz * cam.right[2])) / z,
					y: cam.cy - (cam.f * (dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2])) / z,
					k: D / z, near: Math.min(1, Math.max(0, (D + 0.9 - z) / 1.8)),
				};
			};
			for (const s of v.stars) s.q = project(s.p);
		}
		for (const s of v.stars) {
			const q = s.q;
			if (!q || q.x < -40 || q.x > W + 40 || q.y < -40 || q.y > H + 40) continue;
			let size = s.s * q.k * (0.65 + 0.35 * q.near), shade = 0.3 + 0.7 * q.near;
			if (v.shape === 'neural') { shade = 0.3 + 1.1 * q.fire; size *= 0.8 + 0.5 * q.fire; }
			put(q.x, q.y, 0, 0, size, 0, hash(s.i + 9), s.tint, s.b * a * shade);
			if (s.today) put(q.x, q.y, 0, 0, size, 2, 0, link, a * shade);
			v.screen.push({ x: q.x, y: q.y, star: s, near: q.near });
		}
		for (const [p, q] of v.links) {
			if (!p.q || !q.q || Math.max(p.q.x, q.q.x) < -40 || Math.min(p.q.x, q.q.x) > W + 40) continue;
			const shade = 0.2 + 0.8 * Math.min(p.q.near, q.q.near);
			put(p.q.x, p.q.y, q.q.x, q.q.y, 1, 1, hash(p.i + 3), link, (0.5 + 0.5 * Math.min(p.b, q.b)) * a * shade);
		}
		return n;
	}

	/** Pointing at a star tells its day and how much changed. */
	hover(v, e) {
		const tip = v.root.querySelector('.home-tip'), r = v.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
		let best = null, bd = 14;
		for (const p of v.screen || []) { const d = Math.hypot(p.x - mx, p.y - my) + (1 - p.near) * 6; if (d < bd) { bd = d; best = p; } }   // the near side first
		if (!best) { tip.classList.remove('on'); return; }
		const s = best.star;
		tip.textContent = `${keyDate(s.key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${fmt(s.score)} change${s.score === 1 ? '' : 's'}`;
		tip.classList.add('on');
		const half = tip.offsetWidth / 2 + 8;   // the tip is centred on the star, and kept inside the sky
		tip.style.left = `${Math.min(r.width - half, Math.max(half, best.x))}px`; tip.style.top = `${best.y - 14}px`;
	}
}
