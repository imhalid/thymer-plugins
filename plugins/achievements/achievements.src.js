/**
 * Achievements
 *
 * Trophies for writing, and a character card in the top-left corner: a window onto the mascot's head, looking out at you (it
 * follows the pointer with its head, nods while you type, and salutes when something unlocks), with its name, level, an
 * achievement progress bar and three buttons below - search, jump to, and the full list. The head is a low-poly model
 * drawn with plain WebGL (no libraries, no network); everything else is HTML and CSS.
 *
 * The model is baked into this file at build time (see build.mjs); it is not part of the source in the repository.
 * Everything is kept per device in localStorage ("achievements:v1").
 */

const KNIGHT = __KNIGHT__;   // the mascot: parts, textures and framing, baked by build.mjs from knight.json

const STORE_KEY = 'achievements:v1';
const HIDE_KEY = 'achievements:hidden';
const STREAK_MIN_WORDS = 30;   // a day counts toward the streak from this many words

// ---- The list ------------------------------------------------------------------------------------------------------------
// stat: what is measured; target: where it unlocks; crowns: what it pays. Each one has a picture (IMAGES[id], see pictureOf).
const ACHIEVEMENTS = [
	{ id: 'w1', name: 'First Crown', desc: 'Write your first word', stat: 'words', target: 1, crowns: 5 },
	{ id: 'w25', name: 'Warm Up', desc: 'Write 25 words', stat: 'words', target: 25, crowns: 5 },
	{ id: 'w100', name: 'Crown Collector', desc: 'Write 100 words', stat: 'words', target: 100, crowns: 10 },
	{ id: 'w500', name: 'Gold Rush', desc: 'Write 500 words', stat: 'words', target: 500, crowns: 20 },
	{ id: 'w1000', name: 'Crown Master', desc: 'Write 1,000 words', stat: 'words', target: 1000, crowns: 40 },
	{ id: 'w5000', name: 'Crowns Everywhere', desc: 'Write 5,000 words', stat: 'words', target: 5000, crowns: 80 },
	{ id: 'w10000', name: 'Royal Crowns', desc: 'Write 10,000 words', stat: 'words', target: 10000, crowns: 150 },
	{ id: 'w25000', name: 'Crown Vault', desc: 'Write 25,000 words', stat: 'words', target: 25000, crowns: 300 },
	{ id: 'w50000', name: 'Treasure Hoard', desc: 'Write 50,000 words', stat: 'words', target: 50000, crowns: 500 },
	{ id: 'w100000', name: 'Spiral Legend', desc: 'Write 100,000 words', stat: 'words', target: 100000, crowns: 1000 },
	{ id: 'd250', name: 'Quick Slash', desc: 'Write 250 words in one day', stat: 'bestDay', target: 250, crowns: 15 },
	{ id: 'd500', name: 'Energy Depot', desc: 'Write 500 words in one day', stat: 'bestDay', target: 500, crowns: 25 },
	{ id: 'd1000', name: 'Charge Attack', desc: 'Write 1,000 words in one day', stat: 'bestDay', target: 1000, crowns: 50 },
	{ id: 'd2500', name: 'Full Charge', desc: 'Write 2,500 words in one day', stat: 'bestDay', target: 2500, crowns: 120 },
	{ id: 'd5000', name: 'Proto Blade Unleashed', desc: 'Write 5,000 words in one day', stat: 'bestDay', target: 5000, crowns: 250 },
	{ id: 'm500', name: 'Energy Gate', desc: 'Write 500 words without a 10-minute break', stat: 'bestSession', target: 500, crowns: 25 },
	{ id: 'm1000', name: 'Clockwork Sprint', desc: 'Write 1,000 words without a 10-minute break', stat: 'bestSession', target: 1000, crowns: 60 },
	{ id: 'm3000', name: 'Deep Dive', desc: 'Write 3,000 words without a 10-minute break', stat: 'bestSession', target: 3000, crowns: 180 },
	{ id: 'p25', name: 'Quick Hands', desc: '25 words in a minute', stat: 'peak', target: 25, crowns: 10 },
	{ id: 'p40', name: 'Gremlin Dash', desc: '40 words in a minute', stat: 'peak', target: 40, crowns: 30 },
	{ id: 'p60', name: 'Lightning Reflexes', desc: '60 words in a minute', stat: 'peak', target: 60, crowns: 80 },
	{ id: 'p80', name: 'Light Speed', desc: '80 words in a minute', stat: 'peak', target: 80, crowns: 150 },
	{ id: 'ln50', name: 'Clockwork Corridor', desc: 'Write 50 words in a single line', stat: 'longLine', target: 50, crowns: 10 },
	{ id: 'ln200', name: 'Endless Corridor', desc: 'Write 200 words in a single line', stat: 'longLine', target: 200, crowns: 50 },
	{ id: 'l10', name: 'Shield Bash', desc: 'Add 10 lines', stat: 'lines', target: 10, crowns: 5 },
	{ id: 'l1000', name: 'Gear Grinder', desc: 'Add 1,000 lines', stat: 'lines', target: 1000, crowns: 60 },
	{ id: 'l5000', name: 'Clockwork Factory', desc: 'Add 5,000 lines', stat: 'lines', target: 5000, crowns: 200 },
	{ id: 's3', name: 'First Crystal', desc: 'Write 3 days in a row', stat: 'bestStreak', target: 3, crowns: 15 },
	{ id: 's7', name: 'Seven Crystals', desc: 'Write 7 days in a row', stat: 'bestStreak', target: 7, crowns: 50 },
	{ id: 's14', name: 'Crystal Cluster', desc: 'Write 14 days in a row', stat: 'bestStreak', target: 14, crowns: 100 },
	{ id: 's30', name: 'Heat Wave', desc: 'Write 30 days in a row', stat: 'bestStreak', target: 30, crowns: 250 },
	{ id: 's60', name: 'Depth Delver', desc: 'Write 60 days in a row', stat: 'bestStreak', target: 60, crowns: 400 },
	{ id: 's100', name: 'Hall of Heroes', desc: 'Write 100 days in a row', stat: 'bestStreak', target: 100, crowns: 600 },
	{ id: 's365', name: 'Everlasting Crystal', desc: 'Write 365 days in a row', stat: 'bestStreak', target: 365, crowns: 2000 },
	{ id: 't1', name: 'First Gremlin', desc: 'Finish a task', stat: 'tasks', target: 1, crowns: 5 },
	{ id: 't5', name: 'Gremlin Pack', desc: 'Finish 5 tasks', stat: 'tasks', target: 5, crowns: 10 },
	{ id: 't10', name: 'Floor Cleared', desc: 'Finish 10 tasks', stat: 'tasks', target: 10, crowns: 20 },
	{ id: 't25', name: 'Token Trader', desc: 'Finish 25 tasks', stat: 'tasks', target: 25, crowns: 40 },
	{ id: 't50', name: 'Depth Complete', desc: 'Finish 50 tasks', stat: 'tasks', target: 50, crowns: 60 },
	{ id: 't100', name: 'Clockworks Conqueror', desc: 'Finish 100 tasks', stat: 'tasks', target: 100, crowns: 120 },
	{ id: 't250', name: 'Gremlin Slayer', desc: 'Finish 250 tasks', stat: 'tasks', target: 250, crowns: 200 },
	{ id: 't1000', name: 'Vanaduke Down', desc: 'Finish 1,000 tasks', stat: 'tasks', target: 1000, crowns: 700 },
	{ id: 'td5', name: 'Combo', desc: 'Finish 5 tasks in one day', stat: 'bestTaskDay', target: 5, crowns: 15 },
	{ id: 'td10', name: 'Spark Collector', desc: 'Finish 10 tasks in one day', stat: 'bestTaskDay', target: 10, crowns: 40 },
	{ id: 'td20', name: 'Boss Rush', desc: 'Finish 20 tasks in one day', stat: 'bestTaskDay', target: 20, crowns: 80 },
	{ id: 'night', name: 'Night Owl', desc: 'Write 100 words between 22:00 and 04:00', stat: 'night', target: 100, crowns: 25 },
	{ id: 'night1k', name: 'Midnight Clockworks', desc: 'Write 1,000 words between 22:00 and 04:00', stat: 'night', target: 1000, crowns: 80 },
	{ id: 'early', name: 'Early Bird', desc: 'Write 100 words between 04:00 and 08:00', stat: 'early', target: 100, crowns: 25 },
	{ id: 'early1k', name: 'Dawn Over Haven', desc: 'Write 1,000 words between 04:00 and 08:00', stat: 'early', target: 1000, crowns: 80 },
	{ id: 'midnight', name: 'Midnight Knight', desc: 'Write a word at midnight sharp (00:00)', stat: 'midnight', target: 1, crowns: 40 },
	{ id: 'h12', name: 'Sunset Over Haven', desc: 'Write in 12 different hours of the day', stat: 'hours', target: 12, crowns: 40 },
	{ id: 'h24', name: 'Day and Night', desc: 'Write in every hour of the day, 00 to 23', stat: 'hours', target: 24, crowns: 200 },
	{ id: 'wkend', name: 'Weekend Patrol', desc: 'Write 500 words on weekends', stat: 'weekend', target: 500, crowns: 25 },
	{ id: 'wk7', name: 'Grand Tour', desc: 'Write on every day of the week, Monday to Sunday', stat: 'weekdays', target: 7, crowns: 30 },
	{ id: 'ny', name: 'New Game', desc: "Write on New Year's Day", stat: 'newYear', target: 1, crowns: 30 },
	{ id: 'back', name: 'Extra Life', desc: 'Come back and write after 7 or more days away', stat: 'comeback', target: 7, crowns: 20 },
	{ id: 'a3', name: 'First Steps', desc: 'Write on 3 different days', stat: 'daysActive', target: 3, crowns: 10 },
	{ id: 'a10', name: 'Haven Resident', desc: 'Write on 10 different days', stat: 'daysActive', target: 10, crowns: 30 },
	{ id: 'a30', name: 'Clockworks Regular', desc: 'Write on 30 different days', stat: 'daysActive', target: 30, crowns: 90 },
	{ id: 'a50', name: 'Energy Reserve', desc: 'Write on 50 different days', stat: 'daysActive', target: 50, crowns: 120 },
	{ id: 'a100', name: 'Spiral Veteran', desc: 'Write on 100 different days', stat: 'daysActive', target: 100, crowns: 300 },
	{ id: 'a200', name: 'Haven Hero', desc: 'Write on 200 different days', stat: 'daysActive', target: 200, crowns: 500 },
	{ id: 'a365', name: 'Eternal Knight', desc: 'Write on 365 different days', stat: 'daysActive', target: 365, crowns: 1000 },
	{ id: 'peek', name: 'Crown Chest', desc: 'Open the achievements list', stat: 'opens', target: 1, crowns: 2 },
	{ id: 'got10', name: 'Guild Hall', desc: 'Unlock 10 achievements', stat: 'got', target: 10, crowns: 30 },
	{ id: 'got20', name: 'Arcade Champion', desc: 'Unlock 20 achievements', stat: 'got', target: 20, crowns: 80 },
	{ id: 'got30', name: 'Trophy Hunter', desc: 'Unlock 30 achievements', stat: 'got', target: 30, crowns: 150 },
];
ACHIEVEMENTS.push({ id: 'all', name: 'Heavenly Guardian', desc: 'Unlock every other achievement', stat: 'got', target: ACHIEVEMENTS.length, crowns: 1500 });

/** How hard an achievement is, read from what it pays. */
const tier = (a) => (a.crowns <= 10 ? 'Easy' : a.crowns <= 40 ? 'Medium' : a.crowns <= 150 ? 'Hard' : 'Legendary');

// ---- Small helpers -------------------------------------------------------------------------------------------------------
/**
 * Thymer on a phone or tablet: the plugin stays off there (the card, the WebGL and the listeners are too much for it). Thymer
 * marks the device on <html data-device="mobile|desktop">; without that, the user agent decides.
 */
const onMobile = () => {
	const d = document.documentElement.dataset.device;
	return d ? d === 'mobile' : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
};
/** Thymer's focus mode (body.focusmode): the card stays out of sight then, and what unlocks waits until it is over. */
const inFocusMode = () => document.body.classList.contains('focusmode');
const SLEEP_AFTER_MS = 3 * 60 * 1000;   // no key or pointer for this long: the knight dozes off
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ease = (t) => 1 - Math.pow(1 - t, 3);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function freshState() {
	return { words: 0, tasks: 0, lines: 0, peak: 0, night: 0, early: 0, midnight: 0, longLine: 0, session: 0, bestSession: 0, lastWordAt: 0, opens: 0, days: {}, taskDays: {}, hours: {}, unlocked: {}, doneGuids: [], pending: [] };
}

/** The measures the list is checked against, from the saved state. Pure (apart from today's date). */
function measures(st) {
	const day = (k) => new Date(k + 'T00:00:00');
	const keys = Object.keys(st.days).filter((k) => st.days[k] >= STREAK_MIN_WORDS).sort();
	let best = 0, run = 0, prev = null;
	for (const k of keys) {
		const d = day(k);
		run = prev && Math.round((d - prev) / 86400000) === 1 ? run + 1 : 1;
		best = Math.max(best, run); prev = d;
	}
	const active = Object.keys(st.days).filter((k) => st.days[k] > 0).sort();
	let away = 0;   // the longest stretch of days without writing that ended in writing again
	for (let i = 1; i < active.length; i++) away = Math.max(away, Math.round((day(active[i]) - day(active[i - 1])) / 86400000) - 1);
	const weekend = active.reduce((n, k) => n + ([0, 6].includes(day(k).getDay()) ? st.days[k] : 0), 0);
	return {
		words: st.words, tasks: st.tasks, lines: st.lines, peak: st.peak, night: st.night, early: st.early, midnight: st.midnight, longLine: st.longLine, bestSession: st.bestSession, opens: st.opens,
		bestDay: Math.max(0, ...Object.values(st.days)), bestTaskDay: Math.max(0, ...Object.values(st.taskDays)), daysActive: active.length, bestStreak: best,
		hours: Object.keys(st.hours).length, weekdays: new Set(active.map((k) => day(k).getDay())).size, weekend, comeback: away, newYear: active.some((k) => k.endsWith('-01-01')) ? 1 : 0,
		got: ACHIEVEMENTS.filter((a) => st.unlocked[a.id]).length,
	};
}

// ---- The mascot: a tiny WebGL renderer for the baked model (a knight; the head turns on its own, the body stays) -----------------------------------------------------------------
const mat = {
	mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
	persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f); return o; },
	trans(x, y, z) { const o = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); return o; },
	scale(s) { return new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]); },
	roty(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
	rotx(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
	rot3(m) { return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]); },
};
const unb64 = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };

const VERT = `#version 300 es
in vec3 aPos; in vec3 aNrm; in vec3 aPos2; in vec3 aNrm2; in vec2 aUv;
uniform mat4 uMVP; uniform mat3 uRot; uniform float uMix;
out vec3 vN; out vec2 vUv;
void main() { vN = uRot * normalize(mix(aNrm, aNrm2, uMix)); vUv = aUv; gl_Position = uMVP * vec4(mix(aPos, aPos2, uMix), 1.0); }`;
const FRAG = `#version 300 es
precision mediump float;
in vec3 vN; in vec2 vUv;
uniform sampler2D uTex; uniform vec3 uColor; uniform float uHasTex; uniform float uGlow;
out vec4 o;
void main() {
	vec4 t = uHasTex > 0.5 ? texture(uTex, vUv) : vec4(1.0);
	if (t.a < 0.5) discard;
	vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
	float d = max(dot(n, normalize(vec3(0.4, 0.7, 0.8))), 0.0), rim = pow(1.0 - max(n.z, 0.0), 2.0) * 0.22;
	o = vec4(t.rgb * uColor * (0.66 + 0.62 * d) + rim + uGlow, 1.0);
}`;
// God rays behind the knight: a few wide, soft shafts of light fanning down from the card's top left, drifting slowly (and their light shivers a little).
// A full-card quad drawn before the model, premultiplied; the shafts are a few sines of the angle round the light, fading with distance.
const RAY_VERT = `#version 300 es
in vec2 aP; out vec2 vP;
void main() { vP = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;
const RAY_FRAG = `#version 300 es
precision mediump float;
in vec2 vP; uniform vec2 uRes; uniform float uTime;
out vec4 o;
void main() {
	vec2 d = (vP - vec2(0.04, 1.25)) * vec2(uRes.x / uRes.y, 1.0);   // the light: just above the card's top left corner
	float r = length(d), a = atan(d.x, -d.y) - 0.5;   // a = 0 is the middle of the cone, which points down and to the right
	// a few wide shafts (5 and 8 per turn of the angle, thresholded so there is dark between them) that drift slowly across the card
	float w1 = 0.5 + 0.5 * sin(a * 5.0 + uTime * 0.16 + 0.8), w2 = 0.5 + 0.5 * sin(a * 8.0 - uTime * 0.11 + 2.1);
	float s = smoothstep(0.35, 1.0, w1) + 0.6 * smoothstep(0.55, 1.0, w2);
	float shiver = 0.93 + 0.07 * sin(uTime * 1.1 + a * 13.0) * sin(uTime * 0.7 + 1.0);   // and their light shivers a little
	float v = s * 0.2 * shiver * (1.0 - smoothstep(0.1, 0.9, abs(a))) * exp(-r * 1.1) * (1.0 - smoothstep(0.9, 1.0, vP.y));
	o = vec4(vec3(0.8, 0.9, 1.0) * v, v * 0.7);
}`;

const SALUTE_MS = 1700;   // a notification: the knight snaps a salute, holds it, and lowers its hand
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

class Mascot {
	constructor(canvas, head = true) {
		this.canvas = canvas; this.head = head; this.look = { x: 0, y: 0 }; this.lx = 0; this.ly = 0; this.nod = 0;
		this.gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
		this.ok = !!this.gl;
		this.t0 = performance.now(); this.hop = null; this.speed = 0; this.sl = 0; this.sleepTo = 0; this.hover = false; this.zoom = 1;
		if (!this.ok) return;
		const gl = this.gl, sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
		const link = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null; };
		const p = this.prog = link(VERT, FRAG);
		if (!p) { this.ok = false; return; }
		this.u = Object.fromEntries(['uMVP', 'uRot', 'uTex', 'uColor', 'uHasTex', 'uGlow', 'uMix'].map((n) => [n, gl.getUniformLocation(p, n)]));
		const rp = link(RAY_VERT, RAY_FRAG);   // the rays are a nicety: without them it is just the knight
		if (rp) {
			const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
			const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
			const loc = gl.getAttribLocation(rp, 'aP'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
			gl.bindVertexArray(null);
			this.ray = { p: rp, vao, u: Object.fromEntries(['uRes', 'uTime'].map((n) => [n, gl.getUniformLocation(rp, n)])) };
		}
		const [lo, hi] = KNIGHT.box;
		this.center = head ? KNIGHT.head.center : [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2);   // the head, or the whole body
		this.fit = head ? 1 / KNIGHT.head.span : 1 / Math.max(hi[1] - lo[1], hi[0] - lo[0]);   // scaled to a unit tall
		this.pivot = KNIGHT.pivot;   // where the head turns (idle pose, salute pose)
		this.textures = KNIGHT.textures.map((src) => {
			const t = gl.createTexture(), img = new Image();
			gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
			const rec = { t, ready: false };
			img.onload = () => {
				gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
				gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
				rec.ready = true;
			};
			img.src = src;
			return rec;
		});
		this.parts = KNIGHT.parts.map((q) => {
			const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
			const buf = (data, loc, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
			buf(unb64(q.pos, Float32Array), gl.getAttribLocation(p, 'aPos'), 3); buf(unb64(q.nrm, Float32Array), gl.getAttribLocation(p, 'aNrm'), 3);
			buf(unb64(q.pos2 || q.pos, Float32Array), gl.getAttribLocation(p, 'aPos2'), 3); buf(unb64(q.nrm2 || q.nrm, Float32Array), gl.getAttribLocation(p, 'aNrm2'), 3);
			if (q.uv) buf(unb64(q.uv, Float32Array), gl.getAttribLocation(p, 'aUv'), 2);
			const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, unb64(q.idx, Uint16Array), gl.STATIC_DRAW);
			gl.bindVertexArray(null);
			return { vao, n: q.n, tex: q.tex, color: q.color, head: !!q.h };
		});
	}

	/** A celebration: the knight salutes. */
	celebrate(now) { this.hop = { t0: now, ms: SALUTE_MS }; }

	/** Draws one frame at `now`; `speed` (0..1) is how busy the writing is (the head nods), `glow` lights it up. `sleepTo` (0..1): dozing. */
	draw(now, speed, glow = 0) {
		if (!this.ok) return;
		const gl = this.gl, c = this.canvas, dt = Math.min(50, now - (this.last || now)); this.last = now;
		this.speed += (speed - this.speed) * Math.min(1, dt / 250);
		this.sl += (this.sleepTo - this.sl) * Math.min(1, dt / 700);
		this.zoom += ((this.hover ? 1.04 : 1) - this.zoom) * Math.min(1, dt / 90);   // the pointer over the card brings the knight (not the light behind it) a little closer
		this.lx += (this.look.x - this.lx) * Math.min(1, dt / 140); this.ly += (this.look.y - this.ly) * Math.min(1, dt / 140);
		let y = 0.008 * (1 - this.sl) * Math.sin(now / 520) + 0.012 * this.sl * Math.sin(now / 1500), sal = 0;
		if (this.hop) {   // 0 -> 1 quickly, held, then back down
			const f = (now - this.hop.t0) / this.hop.ms;
			if (f >= 1) this.hop = null; else sal = f < 0.12 ? ease(f / 0.12) : f < 0.72 ? 1 : 1 - ease((f - 0.72) / 0.28);
		}
		// the body stays put (a faint sway); only the head turns toward the pointer and nods while it writes. At the salute it faces
		// front; asleep it stops looking and lets its head drop.
		const free = (1 - 0.85 * sal) * (1 - 0.9 * this.sl), lx = this.lx * free, ly = this.ly * free;
		const bodyYaw = lx * 0.1 + 0.04 * Math.sin(now / 1100), bodyPitch = 0.05;
		const headYaw = lx * 0.75, headPitch = 0.02 + ly * 0.4 + this.speed * 0.07 * Math.sin(now / 95) + this.sl * 0.45;
		if (c.width !== c.clientWidth * 2 && c.clientWidth) { c.width = c.clientWidth * 2; c.height = c.clientHeight * 2; }
		gl.viewport(0, 0, c.width, c.height);
		gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		if (this.ray) {   // the light behind it
			const r = this.ray;
			gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.useProgram(r.p);
			gl.uniform2f(r.u.uRes, c.width, c.height); gl.uniform1f(r.u.uTime, reducedMotion() ? 3 : now / 1000);
			gl.bindVertexArray(r.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
			gl.disable(gl.BLEND);
		}
		gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
		gl.useProgram(this.prog);
		const rot = mat.mul(mat.rotx(bodyPitch), mat.roty(bodyYaw));
		const model = mat.mul(mat.trans(0, y, 0), mat.mul(rot, mat.mul(mat.scale(this.fit * this.zoom), mat.trans(-this.center[0], -this.center[1], -this.center[2]))));
		const mvp = mat.mul(mat.persp(0.5, c.width / c.height, 0.1, 10), mat.mul(mat.trans(0, 0, -2.15), model));
		const [pa, pb] = this.pivot, pv = [0, 1, 2].map((i) => pa[i] + (pb[i] - pa[i]) * sal);
		const headRot = mat.mul(mat.rotx(headPitch), mat.roty(headYaw));
		const headMvp = mat.mul(mvp, mat.mul(mat.trans(pv[0], pv[1], pv[2]), mat.mul(headRot, mat.trans(-pv[0], -pv[1], -pv[2]))));
		const bodyN = mat.rot3(rot), headN = mat.rot3(mat.mul(rot, headRot));
		gl.uniform1f(this.u.uGlow, glow); gl.uniform1f(this.u.uMix, sal);
		for (const q of this.parts) {
			gl.uniformMatrix4fv(this.u.uMVP, false, q.head ? headMvp : mvp);
			gl.uniformMatrix3fv(this.u.uRot, false, q.head ? headN : bodyN);
			const tx = q.tex >= 0 ? this.textures[q.tex] : null;
			gl.uniform1f(this.u.uHasTex, tx && tx.ready ? 1 : 0);
			if (tx && tx.ready) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx.t); gl.uniform1i(this.u.uTex, 0); }
			gl.uniform3fv(this.u.uColor, tx && tx.ready ? [1, 1, 1] : q.color);
			gl.bindVertexArray(q.vao); gl.drawElements(gl.TRIANGLES, q.n, gl.UNSIGNED_SHORT, 0);
		}
		gl.bindVertexArray(null);
	}

	destroy() { try { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* ignore */ } }
}

// ---- The notification's settings ----------------------------------------------------------------------------------------
const IMAGES = __IMAGES__;   // { achievement id: a 3:2 WebP as a data URL }, baked in by build.mjs from art/webp (see art/source/pack_images.py)
const SOUND = __SOUND__;     // sound/unlock.mp3 as a data URL, baked in by build.mjs
const MUTE_KEY = 'achievements:muted';
const FX_MAX = 6;            // cards in one opening; more are summed up in a line
const TIER_FX = { Easy: ['#5ee6a0', 0.5], Medium: ['#4fd8ff', 1], Hard: ['#b98cff', 1.4], Legendary: ['#ffb347', 2] };

/** The tier's colour turned a random way round the hue wheel (up to 28 degrees) and a little brighter or darker: no two openings have the same tone. */
function jitterHue([r, g, b]) {
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
	let h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h = (h * 60 + (Math.random() - 0.5) * 56 + 360) % 360;
	const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), L = Math.min(0.8, Math.max(0.5, l + (Math.random() - 0.5) * 0.14));
	const c = (1 - Math.abs(2 * L - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = L - c / 2, k = Math.floor(h / 60);
	const [R, G, B] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k % 6];
	return [R + m, G + m, B + m];
}

// ---- The pictures: a coloured plate while one is missing, and the shader that opens a picture in the notification --------------
const PLATES = {};
/** The picture of an achievement as a data URL; one that is not made yet gets the demo picture, or (without one) a plate in its tier's colour with faint spiral rings. */
function pictureOf(a) {
	if (IMAGES[a.id]) return IMAGES[a.id];
	if (IMAGES._demo) return IMAGES._demo;   // art/demo.webp: stands in for every picture that is not made yet
	const t = tier(a);
	if (PLATES[t]) return PLATES[t];
	const c = document.createElement('canvas'); c.width = 384; c.height = 256;
	const g = c.getContext('2d'), col = TIER_FX[t][0];
	const bg = g.createRadialGradient(192, 118, 8, 192, 128, 250); bg.addColorStop(0, col + 'aa'); bg.addColorStop(0.45, '#1a2850'); bg.addColorStop(1, '#070b1c');
	g.fillStyle = bg; g.fillRect(0, 0, 384, 256);
	g.strokeStyle = col + '55'; g.lineWidth = 3; g.lineCap = 'round';
	for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(192, 128, 30 + i * 26, 0.6 + i, 4.9 + i); g.stroke(); }
	return (PLATES[t] = c.toDataURL('image/png'));
}

/** How an achievement opens: the style asked for (a number, or a list, one for each picture) or, by default, its own, the same every time (from its id). */
const revealStyle = (a, style, i = 0) => { const v = Array.isArray(style) ? style[i % style.length] : style; return Number.isInteger(v) ? v : [...a.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % REVEAL_STYLES.length; };

/**
 * The opening of a picture: it shows the closed look (grey, blurred) until start(), then opens in REVEAL_MS and at the end it is only the picture. One fragment shader, five styles (REVEAL_STYLES): every one makes a `mask` (where the picture shows), may bend
 * the picture (`duv`), light its edge in the tier's colour (`rim`) and hide what is not open yet under a `cover` (doors, paper).
 */
const REVEAL_MS = 1400;
const REVEAL_STYLES = ['Iris', 'Shards', 'Blocks', 'Ink', 'Burn'];
const REVEAL_VERT = `#version 300 es
in vec2 aPos; out vec2 vUv; void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const REVEAL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uP, uT, uSeed; uniform vec3 uCol; uniform int uM;   // uP: how open it is, 0..1; uT: seconds since it began to open; uM: the style
const float PI = 3.14159265;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }
void vor(vec2 x, out float f1, out float f2, out vec2 rb, out float id) {   // voronoi: the nearest and second nearest distance, the way to the nearest point, its id
	vec2 n = floor(x), f = fract(x); f1 = 8.0; f2 = 8.0; rb = vec2(0.0); id = 0.0;
	for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
		vec2 g = vec2(float(i), float(j)), c = n + g, r = g + vec2(hash(c + uSeed), hash(c + uSeed + 31.7)) - f; float d = dot(r, r);
		if (d < f1) { f2 = f1; f1 = d; rb = r; id = hash(c + 7.1); } else if (d < f2) f2 = d;
	}
	f1 = sqrt(f1); f2 = sqrt(f2);
}
void main() {
	vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;   // y from -0.5 to 0.5, x about -0.75 to 0.75
	float p = clamp(uP, 0.0, 1.0), e = 1.0 - pow(1.0 - p, 1.9);
	float mask = 0.0, rim = 0.0, coverA = 0.0, flatc = 0.0, lift = 0.0, zoom = mix(1.14, 1.0, e);
	vec2 duv = vec2(0.0); vec3 cover = vec3(0.0), rimc = uCol; float spark = 0.0;
	if (uM == 0) {   // IRIS: a wide ellipse of light opens from a slit, its edge torn and glowing
		float n = fbm(q * 4.5 + uSeed) - 0.5, sdf = length(vec2(q.x * mix(0.95, 0.52, smoothstep(0.0, 0.5, p)), q.y * 1.15)) - e * 1.12 - n * 0.3 * (1.0 - p);
		mask = 1.0 - smoothstep(-0.012, 0.012, sdf);
		rim = exp(-abs(sdf) * 34.0) * (1.0 - smoothstep(0.55, 1.0, p)); zoom = mix(1.24, 1.0, e);
		duv = normalize(q + 1e-4) * rim * 0.014;
		vec2 g = q * 30.0, gi = floor(g), gf = fract(g) - 0.5; float hh = hash(gi + uSeed * 3.0);
		spark = step(0.9, hh) * (1.0 - smoothstep(0.0, 0.34, length(gf))) * (0.5 + 0.5 * sin(uT * 20.0 + hh * 40.0)) * exp(-abs(sdf) * 14.0) * (1.0 - smoothstep(0.7, 1.0, p));
	} else if (uM == 1) {   // SHARDS: the picture is a pane of glass; shards fly in from the middle outward and the cracks close
		float f1, f2, id; vec2 rb; vor(q * 7.0, f1, f2, rb, id);
		vec2 c = (q * 7.0 + rb) / 7.0;
		float delay = length(c * vec2(0.8, 1.0)) * 0.85 + id * 0.25, cp = clamp((p * 1.3 - delay) / 0.5, 0.0, 1.0);
		float thr = (1.0 - cp) * 1.0 - 0.06 * cp, b = f2 - f1;
		mask = smoothstep(thr - 0.012, thr + 0.012, b);
		rim = exp(-abs(b - thr) * 12.0) * smoothstep(0.0, 0.1, cp) * (1.0 - smoothstep(0.8, 1.0, cp));
		duv = rb * (1.0 - cp) * 0.03; lift = sin(cp * PI) * 0.35 * id;
		rimc = mix(uCol, vec3(1.0), 0.45); zoom = 1.0;
		spark = step(0.97, hash(floor(q * 40.0) + uSeed)) * smoothstep(0.1, 0.5, cp) * (1.0 - smoothstep(0.7, 1.0, cp)) * 1.2;
	} else if (uM == 2) {   // BLOCKS: the picture builds itself out of glowing blocks of energy that pop in and settle into it
		vec2 g = q * 14.0, gi = floor(g), gf = fract(g);
		vec2 cq = (gi + 0.5) / 14.0;
		float delay = hash(gi + uSeed) * 0.5 + length(cq) * 0.4, cp = clamp((p * 1.35 - delay) / 0.4, 0.0, 1.0);
		float gapw = (1.0 - cp) * 0.42 - 0.02 * cp, bi = max(abs(gf.x - 0.5), abs(gf.y - 0.5));
		mask = (1.0 - smoothstep(0.5 - gapw - 0.02, 0.5 - gapw + 0.02, bi)) * step(0.001, cp);
		flatc = (1.0 - smoothstep(0.15, 0.75, cp)) * (0.7 + 0.3 * hash(gi + 5.0));
		rim = (1.0 - smoothstep(0.0, 0.9, cp)) * step(0.001, cp) * 0.7;
		vec2 uvc = vec2(cq.x * uRes.y / uRes.x + 0.5, cq.y + 0.5); duv = (uvc - vUv) * (1.0 - cp); zoom = 1.0;
		spark = step(0.985, hash(gi + floor(uT * 12.0) + uSeed)) * step(0.001, cp) * (1.0 - cp) * 1.5;
	} else if (uM == 3) {   // INK: wet paint blooms from a point, pooling darker at its edge, washed pale until it dries into the picture
		vec2 o2 = (vec2(hash(vec2(uSeed, 1.0)), hash(vec2(uSeed, 2.0))) - 0.5) * 0.5;
		float f = length((q - o2) * vec2(0.75, 1.0)) + (fbm(q * 3.5 + uSeed) - 0.5) * 0.55 + (fbm(q * 9.0 + uSeed) - 0.5) * 0.12;
		float ei = 1.0 - pow(1.0 - p, 1.6), sdf = f - mix(-0.1, 1.8, ei);
		mask = 1.0 - smoothstep(-0.02, 0.02, sdf); flatc = 0.0;
		float ring = exp(-pow(sdf / 0.035, 2.0)), washed = smoothstep(-0.25, 0.0, sdf);
		rim = ring * 0.22; lift = -ring * 0.3 + washed * 0.25 * (1.0 - smoothstep(0.7, 1.0, p));
		duv = vec2(fbm(q * 6.0 + uSeed), fbm(q * 6.0 + 9.0)) * 0.02 * washed; zoom = mix(1.06, 1.0, e);
		spark = 0.0;
	} else {   // BURN: a sheet of scorched parchment burns away from the middle, an ember line eating outward
		float f = length(q * vec2(0.62, 1.0)) + (fbm(q * 5.0 + uSeed) - 0.5) * 0.35 + (fbm(q * 14.0 + uSeed) - 0.5) * 0.08;
		float sdf = f - mix(-0.05, 1.25, e);
		mask = 1.0 - smoothstep(-0.008, 0.008, sdf);
		vec3 parch = vec3(0.64, 0.5, 0.33) * (0.6 + 0.4 * fbm(q * 8.0 + uSeed));
		cover = mix(parch, vec3(0.05, 0.03, 0.025), 1.0 - smoothstep(0.02, 0.18, sdf)); coverA = 1.0;
		float flick = 0.75 + 0.25 * sin(uT * 30.0 + fbm(q * 9.0) * 12.0);
		rim = exp(-abs(sdf) * 26.0) * flick * (1.0 - smoothstep(0.8, 1.0, p));
		rimc = mix(vec3(1.0, 0.45, 0.1), uCol, 0.22); zoom = mix(1.08, 1.0, e);
		vec2 g = vec2(q.x * 26.0, q.y * 18.0 + uT * 4.0), gi = floor(g), gf = fract(g) - 0.5; float hh = hash(gi + uSeed);
		spark = step(0.92, hh) * (1.0 - smoothstep(0.0, 0.3, length(gf))) * exp(-abs(sdf) * 9.0) * (1.0 - smoothstep(0.75, 1.0, p)) * flick;
	}
	mask *= step(0.002, p); rim *= step(0.002, p); spark *= step(0.002, p);   // nothing shows before it begins to open (a cover, if the style has one, does)
	// the picture itself, treated the same way in every style
	vec2 uv = (vUv + duv - 0.5) / zoom + 0.5, fr = normalize(q + 1e-4) * rim * 0.01;
	vec3 img = vec3(textureLod(uTex, uv + fr, 0.0).r, textureLod(uTex, uv, 0.0).g, textureLod(uTex, uv - fr, 0.0).b);   // level 0: as sharp as the picture it hands over to
	img = mix(vec3(dot(img, vec3(0.3, 0.59, 0.11)) * 0.55), img, smoothstep(0.1, 0.8, p)) * mix(0.7, 1.0, smoothstep(0.0, 0.7, p));
	img = mix(img, uCol * 1.1 + 0.12, flatc) + vec3(lift);
	float sp = clamp((p - 0.62) / 0.38, 0.0, 1.0);   // a shine sweeps across at the end, and is gone when it is open
	img += vec3(1.0, 0.95, 0.85) * exp(-pow((q.x + q.y * 0.55 - mix(-1.0, 1.0, sp)) * 9.0, 2.0)) * sin(sp * PI) * 0.38;
	vec3 glow = rimc * rim * 1.3 + vec3(1.0) * (spark * 1.4 + rim * rim * 0.5);
	// what is not open yet shows the picture as the note did: grey, blurred and dim, and it fades as the picture opens
	vec3 sd = textureLod(uTex, vUv, 2.2).rgb, sealed = vec3(dot(sd, vec3(0.3, 0.59, 0.11))) * 0.62 + uCol * 0.05;
	float ua = (1.0 - mask) * (1.0 - coverA) * (1.0 - smoothstep(0.2, 0.9, p)) * 0.96;
	float a = clamp(max(max(mask + coverA * (1.0 - mask), ua), max(glow.r, max(glow.g, glow.b))), 0.0, 1.0);
	o = vec4(min(img * mask + cover * coverA * (1.0 - mask) + sealed * ua + glow, vec3(a)), a);
}`;

/** Draws REVEAL_FRAG over one picture in one of REVEAL_STYLES. start(now) opens it; done(now) says when it is just the picture again. */
class Reveal {
	constructor(canvas, img, color, mode = 0) {
		this.canvas = canvas; this.t1 = 0; this.seed = Math.random() * 40; this.mode = mode;
		this.rgb = jitterHue([1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255));
		const gl = this.gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
		this.ok = !!gl;
		if (!this.ok) return;
		const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
		const pr = this.prog = gl.createProgram();
		gl.attachShader(pr, sh(gl.VERTEX_SHADER, REVEAL_VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, REVEAL_FRAG)); gl.linkProgram(pr);
		if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { this.ok = false; return; }
		this.u = Object.fromEntries(['uTex', 'uRes', 'uP', 'uT', 'uSeed', 'uCol', 'uM'].map((n) => [n, gl.getUniformLocation(pr, n)]));
		const tex = this.tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
		const upload = () => {
			gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		};
		if (img.complete && img.naturalWidth) upload(); else img.addEventListener('load', upload, { once: true });
		this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		const loc = gl.getAttribLocation(pr, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
	}
	start(now) { this.t1 = now; }
	done(now) { return this.t1 > 0 && now - this.t1 > REVEAL_MS + 60; }
	draw(now) {
		if (!this.ok) return;
		const gl = this.gl, c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
		if (w && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
		gl.viewport(0, 0, c.width, c.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
		const p = this.t1 > 0 ? Math.min(1, (now - this.t1) / REVEAL_MS) : 0, t = this.t1 > 0 ? (now - this.t1) / 1000 : 0;   // before start() it is the closed look
		gl.useProgram(this.prog);
		gl.uniform2f(this.u.uRes, c.width, c.height); gl.uniform1f(this.u.uP, p); gl.uniform1f(this.u.uT, t); gl.uniform1f(this.u.uSeed, this.seed); gl.uniform3fv(this.u.uCol, this.rgb); gl.uniform1i(this.u.uM, this.mode);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(this.u.uTex, 0);
		gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
	}
	destroy() { try { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* ignore */ } }
}

/**
 * The change from one picture to the next in the viewer: a fragment shader over the picture, a liquid wipe in the direction you are going
 * with a white, light-bending front. At the end it is exactly the new picture.
 */
const MORPH_MS = 1000;
const MORPH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uA, uB; uniform vec2 uRes; uniform float uP, uSeed, uDir;   // uA: the picture on screen, uB: the next; uP: 0..1; uDir: -1 or 1
const float PI = 3.14159265;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
void main() {
	vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
	float p = uP, fade = 1.0 - smoothstep(0.82, 1.0, p);
	// a wavy front sweeps across in the direction you are going; the pictures bend where it passes, and a white light runs along it
	float n = fbm(q * 3.0 + uSeed) - 0.5, f = q.x * uDir + n * 0.42 + q.y * 0.12, sdf = f - mix(-1.1, 1.3, p * p * (3.0 - 2.0 * p));
	float m = 1.0 - smoothstep(-0.03, 0.03, sdf), edge = exp(-abs(sdf) * 22.0);
	vec2 disp = vec2(uDir, n * 0.6) * exp(-abs(sdf) * 9.0) * 0.045 * fade * sign(-sdf);
	vec3 a = texture(uA, vUv - disp).rgb, b = texture(uB, vUv + disp).rgb;
	vec3 c = mix(a, b, m) + vec3(edge * 0.95 + edge * edge * 0.4) * fade;
	o = vec4(min(c, vec3(1.0)), 1.0);
}`;

/** Draws MORPH_FRAG over a canvas that covers the picture: start(now), then draw(now) every frame until done(now). */
class Morph {
	constructor(canvas, imgA, imgB, dir) {
		this.canvas = canvas; this.t0 = 0; this.dir = dir; this.seed = Math.random() * 40;
		const gl = this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
		this.ok = !!gl;
		if (!this.ok) return;
		const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
		const pr = this.prog = gl.createProgram();
		gl.attachShader(pr, sh(gl.VERTEX_SHADER, REVEAL_VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, MORPH_FRAG)); gl.linkProgram(pr);
		if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { this.ok = false; return; }
		this.u = Object.fromEntries(['uA', 'uB', 'uRes', 'uP', 'uSeed', 'uDir'].map((n) => [n, gl.getUniformLocation(pr, n)]));
		const texture = (img) => {
			const t = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			return t;
		};
		this.ta = texture(imgA); this.tb = texture(imgB);
		this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		const loc = gl.getAttribLocation(pr, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
	}
	start(now) { this.t0 = now; }
	done(now) { return now - this.t0 > MORPH_MS + 30; }
	draw(now) {
		if (!this.ok) return;
		const gl = this.gl, c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
		if (w && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
		gl.viewport(0, 0, c.width, c.height);
		gl.useProgram(this.prog);
		gl.uniform2f(this.u.uRes, c.width, c.height); gl.uniform1f(this.u.uP, Math.min(1, Math.max(0, (now - this.t0) / MORPH_MS))); gl.uniform1f(this.u.uSeed, this.seed);
		gl.uniform1f(this.u.uDir, this.dir || 1);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.ta); gl.uniform1i(this.u.uA, 0);
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tb); gl.uniform1i(this.u.uB, 1);
		gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
	}
	destroy() { try { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* ignore */ } }
}

class Plugin extends AppPlugin {
	cleanup = [];
	revT = [];
	held = [];   // what unlocked in focus mode, to be shown when it ends
	native = {};   // Thymer's own sidebar rows the card takes over: search, jump, and the workspace row

	onLoad() {
		if (onMobile()) { this.off = true; return; }
		this.st = this.load();
		this.lineWords = new Map();
		this.wordTimes = [];
		this.lastType = 0;
		if (localStorage.getItem(HIDE_KEY) !== '1') this.mountWidget();

		this.ui.addCommandPaletteCommand({ label: 'Achievements: open', icon: 'trophy', onSelected: () => this.openPanel() });
		this.ui.addCommandPaletteCommand({ label: 'Achievements: show or hide the mascot', icon: 'eye', onSelected: () => this.toggleWidget() });
		this.ui.addCommandPaletteCommand({ label: 'Achievements: replay the last unlock', icon: 'sparkles', onSelected: () => {
			const last = ACHIEVEMENTS.filter((a) => this.claimed(a)).sort((a, b) => this.st.unlocked[b.id] - this.st.unlocked[a.id])[0];
			this.reveal([last || ACHIEVEMENTS[0]]);
		} });
		this.ui.addCommandPaletteCommand({ label: 'Achievements: mute or unmute the sound', icon: 'volume', onSelected: () => {
			const off = localStorage.getItem(MUTE_KEY) !== '1';
			try { localStorage.setItem(MUTE_KEY, off ? '1' : '0'); } catch (e) { /* ignore */ }
			if (!off) this.chime();
		} });

		const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.cleanup.push(() => target.removeEventListener(type, fn, opts)); };
		on(document, 'input', () => requestAnimationFrame(() => this.countLive()), true);
		this.lastActive = performance.now();
		on(document, 'keydown', () => { this.lastType = this.lastActive = performance.now(); }, true);
		on(document, 'mousemove', (e) => { this.pointer = { x: e.clientX, y: e.clientY }; this.lastActive = performance.now(); }, { passive: true });
		// Into focus mode: a notification on screen goes. Out of it: what unlocked meanwhile is shown, all together.
		let focus = inFocusMode();
		const watch = new MutationObserver(() => {
			if (inFocusMode() === focus) return;
			focus = !focus;
			this.layout();   // the card goes or comes back now, not at the next frame
			if (focus) { this.endNote(false); this.endReveal(false); }
			else if (this.held.length) { const list = this.held; this.held = []; this.announce(list); }
		});
		watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		this.cleanup.push(() => watch.disconnect());

		// Words are also counted as they are typed; the saved-line events below add what the typing missed (a paste, another device).
		const track = (ev, isCreate) => {
			if (!ev.source.isLocal) return;
			let changed = false;
			if (isCreate) { this.st.lines++; changed = true; }
			if (ev.status === 'done' && !this.st.doneGuids.includes(ev.lineItemGuid)) { this.st.doneGuids.push(ev.lineItemGuid); if (this.st.doneGuids.length > 3000) this.st.doneGuids.shift(); this.st.tasks++; this.st.taskDays[dayKey()] = (this.st.taskDays[dayKey()] || 0) + 1; changed = true; }
			const segs = ev.getSegments();
			if (segs) {
				const now = segs.reduce((n, s) => n + (s && typeof s.text === 'string' ? s.text.trim().split(/\s+/).filter(Boolean).length : 0), 0);
				const known = this.lineWords.has(ev.lineItemGuid), prev = known ? this.lineWords.get(ev.lineItemGuid) : (isCreate ? 0 : now);
				this.lineWords.set(ev.lineItemGuid, now);
				if (now > prev) { this.addWords(now - prev, now); changed = true; }
			}
			if (changed) this.changed();
		};
		this.events.on('lineitem.created', (ev) => track(ev, true), { collection: '*' });
		this.events.on('lineitem.updated', (ev) => track(ev, false), { collection: '*' });
		this.events.on('lineitem.deleted', (ev) => this.lineWords.delete(ev.lineItemGuid), { collection: '*' });
		this.changed();
	}

	onUnload() {
		if (this.off) return;
		cancelAnimationFrame(this.raf);
		this.cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
		this.cleanup = [];
		this.closePanel();
		this.unmountWidget();
		this.padStyle?.remove();
		this.endNote(false);
		this.endReveal(false);
	}

	// ---- State -------------------------------------------------------------------------------------------------------------

	load() {
		try { return { ...freshState(), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch (e) { return freshState(); }
	}

	save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.st)); } catch (e) { /* keep in memory */ } }

	/** `n` more words, written now, into a line that now holds `lineWords`. */
	addWords(n, lineWords = 0) {
		const st = this.st, now = new Date(), h = now.getHours(), t = now.getTime();
		st.words += n; st.days[dayKey(now)] = (st.days[dayKey(now)] || 0) + n;
		if (h >= 22 || h < 4) st.night += n; else if (h >= 4 && h < 8) st.early += n;
		if (h === 0 && now.getMinutes() === 0) st.midnight += n;
		st.hours[h] = (st.hours[h] || 0) + n;
		st.longLine = Math.max(st.longLine, lineWords);
		if (t - st.lastWordAt > 10 * 60000) st.session = 0;   // a 10-minute pause ends a session
		st.session += n; st.lastWordAt = t; st.bestSession = Math.max(st.bestSession, st.session);
		for (let i = 0; i < n; i++) this.wordTimes.push(t);
		this.wordTimes = this.wordTimes.filter((x) => t - x < 60000);
		st.peak = Math.max(st.peak, this.wordTimes.length);
	}

	/** The words of the line the caret is in, read from the page as they are typed. */
	countLive() {
		try {
			const node = window.getSelection()?.focusNode, row = node && (node.nodeType === 1 ? node : node.parentElement)?.closest('.listitem[data-guid]');
			if (!row) return;
			const guid = row.getAttribute('data-guid');
			let text = '';
			const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement?.closest('.listitem[data-guid]') === row ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
			for (let t = walk.nextNode(); t; t = walk.nextNode()) text += t.nodeValue + ' ';
			const now = text.trim().split(/\s+/).filter(Boolean).length;
			const prev = this.lineWords.has(guid) ? this.lineWords.get(guid) : (now <= 1 ? 0 : now);
			this.lineWords.set(guid, now);
			if (now > prev) { this.addWords(now - prev, now); this.changed(); }
		} catch (e) { /* the saved-line events still count */ }
	}

	/** Something moved: save, check the list, refresh what is shown. */
	changed() {
		const fresh = [];
		for (let more = true; more;) {   // again after anything unlocks: some count the others
			const m = measures(this.st);
			more = false;
			for (const a of ACHIEVEMENTS) if (!this.st.unlocked[a.id] && m[a.stat] >= a.target) { this.st.unlocked[a.id] = Date.now(); fresh.push(a); more = true; }
		}
		clearTimeout(this.saveT);
		this.saveT = setTimeout(() => this.save(), 600);
		if (fresh.length) { this.st.pending.push(...fresh.map((a) => a.id)); this.save(); if (inFocusMode()) this.held.push(...fresh); else this.announce(fresh); }
		this.refreshUi();
	}

	/** What is shown counts only what was opened: one that is still waiting (st.pending) is not in the totals, nor named in the list. */
	claimed(a) { return !!this.st.unlocked[a.id] && !this.st.pending.includes(a.id); }
	crowns() { return ACHIEVEMENTS.reduce((n, a) => n + (this.claimed(a) ? a.crowns : 0), 0); }
	unlockedCount() { return ACHIEVEMENTS.filter((a) => this.claimed(a)).length; }

	// ---- The mascot and the notification ---------------------------------------------------------------------------------------

	mountWidget() {
		if (this.widget) return;
		const ICONS = {
			search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
			jump: '<svg viewBox="0 0 24 24"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>',
			trophy: '<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3"/><path d="M12 13v4M9 20h6M10 17h4"/></svg>',
		};
		const w = document.createElement('div');
		w.className = 'ach-card';
		w.innerHTML = `<div class="ach-por" title="Achievements"><canvas></canvas><span class="ach-rg"></span></div>
			<div class="ach-nm"><div class="ach-slot"></div></div>
			<div class="ach-btns">
				<button class="ach-btn" data-a="search" title="Search everything">${ICONS.search}<span>Search</span></button>
				<button class="ach-btn" data-a="jump" title="Jump to a page">${ICONS.jump}<span>Jump to</span></button></div>`;
		w.querySelector('.ach-por').addEventListener('click', () => { if (this.st.pending.length) this.claim(); else this.openPanel(); });   // something is waiting: open that first
		for (const [ev, on] of [['pointerenter', true], ['pointerleave', false]]) w.querySelector('.ach-por').addEventListener(ev, () => { if (this.mascot) this.mascot.hover = on; });
		w.querySelector('[data-a="search"]').onclick = () => { const n = this.native.search; if (n && n.isConnected) n.click(); else this.openSearch(); };
		w.querySelector('[data-a="jump"]').onclick = () => { const n = this.native.jump; if (n && n.isConnected) n.click(); else this.openJump(); };
		document.body.appendChild(w);
		this.widget = w;
		this.mascot = new Mascot(w.querySelector('canvas'));
		if (!this.mascot.ok) w.querySelector('canvas').style.display = 'none';
		this.refreshUi();
		this.layout();
		// the card grows as it fills in and when the sidebar is resized: keep the room made for it right
		if (window.ResizeObserver) { this.ro = new ResizeObserver(() => this.layout()); this.ro.observe(w); const sb = document.querySelector('.panels-grid-sidebar > .sidebar'); if (sb) this.ro.observe(sb); }
		const loop = (now) => {
			this.raf = requestAnimationFrame(loop);
			if (document.hidden || now - (this.lastFrame || 0) < 33) return;   // about 30 frames a second, none in the background
			this.lastFrame = now;
			const typing = Math.max(0, 1 - (performance.now() - this.lastType) / 1500);
			this.layout();
			if (inFocusMode()) return;   // out of sight: nothing to draw
			if (this.pointer && this.mascot) {   // it looks at the pointer
				const r = this.widget.querySelector('.ach-por').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.4;
				this.mascot.look.x = Math.max(-1, Math.min(1, (this.pointer.x - cx) / 420)); this.mascot.look.y = Math.max(-1, Math.min(1, (this.pointer.y - cy) / 320));
			}
			const sleepy = now - (this.lastActive || now) > SLEEP_AFTER_MS;   // dozes off after a while, wakes at the first key or pointer move
			if (sleepy !== !!this.asleep) { this.asleep = sleepy; this.mascot.sleepTo = sleepy ? 1 : 0; }
			this.mascot.draw(now, Math.min(1, typing * 0.6 + this.wordTimes.length / 90), this.glow || 0);
			if (this.panelMascot) { this.panelMascot.look = this.mascot.look; this.panelMascot.draw(now, 0.1); }
		};
		this.raf = requestAnimationFrame(loop);
	}

	unmountWidget() {
		cancelAnimationFrame(this.raf);
		this.closePop();
		this.mascot?.destroy(); this.mascot = null;
		this.widget?.remove(); this.widget = null;
		this.ro?.disconnect(); this.ro = null;
		this.takeOver(null, false);   // give the rows back
		this.native = {};
		this.padStyle?.remove(); this.padStyle = null; this.pad = undefined;
	}

	toggleWidget() {
		const hide = !!this.widget;
		try { localStorage.setItem(HIDE_KEY, hide ? '1' : '0'); } catch (e) { /* ignore */ }
		if (hide) this.unmountWidget(); else this.mountWidget();
	}

	/**
	 * Puts the card at the top of Thymer's sidebar and makes room for it: the sidebar's own content gets padding the height of
	 * the card, so its menus start underneath instead of behind. A collapsed (narrow) sidebar gets just the portrait.
	 */
	layout() {
		const w = this.widget;
		if (!w) return;
		const away = inFocusMode();   // the card hides, and Thymer's rows and sidebar are as they were
		w.classList.toggle('ach-away', away);
		if (away) { this.takeOver(null, false); this.setPad(0); return; }
		const sb = document.querySelector('.panels-grid-sidebar > .sidebar') || document.querySelector('.sidebar'), r = sb && sb.getBoundingClientRect();
		const ok = r && r.width > 20 && r.height > 100, mini = !!ok && r.width < 150;
		w.classList.toggle('ach-mini', mini);
		this.takeOver(r, ok && !mini);
		// the card lines up with the sidebar's rows: the inside of the box Tasks sits in (Tasks itself may share its line, see Home)
		const tasks = this.native.tasks && this.native.tasks.isConnected ? this.native.tasks : null;
		let row = null;
		if (tasks) {
			const box = tasks.parentElement, br = box.getBoundingClientRect(), cs = getComputedStyle(box);
			const l = br.left + parseFloat(cs.paddingLeft || 0), r = br.right - parseFloat(cs.paddingRight || 0);
			row = { left: l, width: r - l };
		}
		const width = mini ? 46 : row && row.width > 100 ? Math.round(row.width) : ok ? Math.max(150, Math.min(230, r.width - 20)) : 124;
		if (!mini && w.style.width !== width + 'px') w.style.width = width + 'px'; else if (mini) w.style.width = '';
		const left = ok ? (row && !mini ? Math.round(row.left) : r.left + 10) : 12, top = ok ? r.top + 8 : 46;
		if (w.style.left !== left + 'px') w.style.left = left + 'px';
		if (w.style.top !== top + 'px') w.style.top = top + 'px';
		this.setPad(ok ? Math.round(w.getBoundingClientRect().height + 14) : 0);
	}

	/** The room made for the card at the top of the sidebar (0: none). */
	setPad(pad) {
		if (pad === this.pad) return;
		this.pad = pad;
		if (!this.padStyle) { this.padStyle = document.createElement('style'); document.head.appendChild(this.padStyle); }
		this.padStyle.textContent = pad ? `.panels-grid-sidebar > .sidebar { padding-top: ${pad}px !important; box-sizing: border-box; }` : '';
	}

	/**
	 * Thymer's own Search and Jump To rows are hidden and the card's buttons press them instead; the workspace row (the first
	 * row of the sidebar's top block) is laid over the name plate. Nothing is moved in the page: rows are found by their label,
	 * hidden by an attribute, and the workspace row is positioned over the plate's slot.
	 */
	takeOver(sb, on) {
		
		const top = document.querySelector('.panels-grid-sidebar > .sidebar .sidebar--top');
		const all = top ? [...top.querySelectorAll('.sidebar-item')] : [];
		const label = (e) => (e.querySelector('.sidebar-item-label')?.textContent || '').trim().toLowerCase();
		const find = (re) => all.find((e) => re.test(label(e)));
		const n = this.native;
		if (!n.search || !n.search.isConnected) n.search = find(/^search$/);
		if (!n.jump || !n.jump.isConnected) n.jump = find(/^jump to$/);
		if (!n.tasks || !n.tasks.isConnected) n.tasks = find(/^tasks$/);
		if (!n.host || !n.host.isConnected) n.host = all.find((e) => e !== n.search && e !== n.jump && !/^(quick add|tasks)$/.test(label(e)) && e.getBoundingClientRect().height > 0) || n.host;
		for (const el of [n.search, n.jump]) if (el) { if (on) el.setAttribute('data-ach-hide', ''); else el.removeAttribute('data-ach-hide'); }
		const host = n.host, slot = this.widget && this.widget.querySelector('.ach-slot');
		if (host && host.isConnected) {
			if (on && slot) {
				const r = slot.getBoundingClientRect();
				host.classList.add('ach-hosted');
				host.style.left = r.left + 'px'; host.style.top = r.top + 'px'; host.style.width = r.width + 'px';
			} else { host.classList.remove('ach-hosted'); host.style.left = host.style.top = host.style.width = ''; }
		}
	}

	refreshUi() {
		const w = this.widget, got = this.unlockedCount(), total = ACHIEVEMENTS.length;
		if (w) {
			w.querySelector('.ach-rg').textContent = `◎ ${fmt(this.crowns())}`;
			const m = measures(this.st), next = ACHIEVEMENTS.filter((a) => !this.claimed(a)).sort((a, b) => m[b.stat] / b.target - m[a.stat] / a.target)[0];
			const waiting = this.st.pending.length > 0 && !this.note;   // the note itself is the announcement; the glow takes over when it is gone
			w.classList.toggle('ach-pending', waiting);
			w.querySelector('.ach-por').title = waiting ? 'A new achievement is waiting: click to open it' : `Achievements ${got}/${total}` + (next ? ` - next: ${next.name}` : '');   // what it asks for stays secret until it unlocks
		}
		if (this.panel) this.renderPanel();
	}

	// ---- Search and jump to --------------------------------------------------------------------------------------------------

	closePop() {
		clearTimeout(this.popT);
		if (this.popKey) document.removeEventListener('keydown', this.popKey, true);
		if (this.popDown) document.removeEventListener('mousedown', this.popDown, true);
		this.popKey = this.popDown = null;
		this.pop?.remove(); this.pop = null;
	}

	/**
	 * A small popup beside the card: a field and a list. \`fetch(query)\` answers with groups [{ label, items: [{ title, sub, run }] }];
	 * arrows move, Enter picks, Escape or a click outside closes.
	 */
	openPop(placeholder, fetch) {
		this.closePop();
		const cs = getComputedStyle(document.body), r = this.widget.getBoundingClientRect();
		const pop = document.createElement('div');
		pop.className = 'ach-pop';
		pop.style.color = cs.color; pop.style.background = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'Canvas';
		pop.style.left = `${r.right + 10}px`; pop.style.top = `${Math.max(8, r.top + 70)}px`;
		pop.innerHTML = '<input spellcheck="false"><div-scrollable class="ach-scroll force-active-scrollbar" style="overflow-y: scroll; height: 100%"><div class="ach-res"></div></div-scrollable>';
		document.body.appendChild(pop);
		this.pop = pop;
		const input = pop.querySelector('input'), res = pop.querySelector('.ach-res');
		input.placeholder = placeholder;
		let flat = [], sel = 0, token = 0;
		const paint = () => res.querySelectorAll('.ach-it').forEach((el, i) => el.classList.toggle('on', i === sel));
		const show = (groups) => {
			res.textContent = ''; flat = [];
			for (const g of groups) {
				if (!g.items.length) continue;
				const lab = document.createElement('div'); lab.className = 'ach-lab'; lab.textContent = g.label; res.appendChild(lab);
				for (const it of g.items) {
					const el = document.createElement('div'); el.className = 'ach-it';
					el.innerHTML = '<span></span><small></small>'; el.firstChild.textContent = it.title || '(untitled)'; el.lastChild.textContent = it.sub || '';
					const i = flat.length; flat.push(it);
					el.addEventListener('mousemove', () => { sel = i; paint(); });
					el.addEventListener('click', () => { this.closePop(); it.run(); });
					res.appendChild(el);
				}
			}
			if (!flat.length) { const e = document.createElement('div'); e.className = 'ach-empty'; e.textContent = input.value.trim() ? 'Nothing found' : 'Type to look'; res.appendChild(e); }
			sel = 0; paint();
		};
		const query = async () => { const mine = ++token; let groups = []; try { groups = await fetch(input.value.trim()); } catch (e) { groups = []; } if (mine === token) show(groups); };
		input.addEventListener('input', () => { clearTimeout(this.popT); this.popT = setTimeout(query, 140); });
		this.popKey = (e) => {
			if (!this.pop) return;
			if (e.key === 'Escape') { e.stopPropagation(); this.closePop(); }
			else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); if (flat.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length; paint(); res.querySelectorAll('.ach-it')[sel]?.scrollIntoView({ block: 'nearest' }); } }
			else if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); e.stopPropagation(); const it = flat[sel]; if (it) { this.closePop(); it.run(); } }
		};
		this.popDown = (e) => { if (this.pop && !this.pop.contains(e.target) && !this.widget?.contains(e.target)) this.closePop(); };
		document.addEventListener('keydown', this.popKey, true);
		document.addEventListener('mousedown', this.popDown, true);
		input.focus();
		query();
	}

	/** Opens a page, or a line inside one, in the panel the user is working in. */
	go(target) {
		const panel = this.ui.getActivePanel();
		if (!panel) return;
		if (target.itemGuid) panel.navigateTo({ type: 'edit_panel', rootId: null, subId: null, workspaceGuid: null, itemGuid: target.itemGuid, highlight: true });
		else panel.navigateTo({ type: 'edit_panel', rootId: target.guid, subId: null, workspaceGuid: this.getWorkspaceGuid() });
	}

	/** Full-text search of the workspace: pages and lines. */
	openSearch() {
		this.openPop('Search pages and lines...', async (q) => {
			if (!q) return [];
			const r = await this.data.searchByQuery(q, 14);
			if (r.error) return [];
			const pages = (r.records || []).slice(0, 7).map((rec) => ({ title: rec.getName(), sub: 'Page', run: () => this.go({ guid: rec.guid }) }));
			const lines = (r.lines || []).slice(0, 8).map((ln) => {
				let rec = null; try { rec = ln.getRecord(); } catch (e) { /* ignore */ }
				return { title: (ln.segments || []).map((s) => (s && s.text) || '').join('').trim().slice(0, 140), sub: rec ? rec.getName() : '', run: () => this.go({ itemGuid: ln.guid }) };
			});
			return [{ label: 'Pages', items: pages }, { label: 'Lines', items: lines }];
		});
	}

	/** Jump to a page by name (the most recently changed first). */
	openJump() {
		let cache = this.jumpCache && Date.now() - this.jumpCache.at < 30000 ? this.jumpCache : null;
		const load = async () => {
			if (cache) return cache.items;
			const items = [];
			for (const c of await this.data.getAllCollections()) {
				let recs = []; try { recs = await c.getAllRecords(); } catch (e) { /* skip it */ }
				for (const rec of recs) items.push({ title: rec.getName(), sub: c.getName(), guid: rec.guid, at: (rec.getUpdatedAt() || new Date(0)).getTime() });
			}
			items.sort((a, b) => b.at - a.at);
			cache = this.jumpCache = { at: Date.now(), items };
			return items;
		};
		this.openPop('Jump to...', async (q) => {
			const all = await load(), words = q.toLowerCase().split(/\s+/).filter(Boolean);
			const hit = (all.filter((it) => words.every((w) => it.title.toLowerCase().includes(w)))).slice(0, 14);
			return [{ label: q ? 'Pages' : 'Recent', items: hit.map((it) => ({ title: it.title, sub: it.sub, run: () => this.go({ guid: it.guid }) })) }];
		});
	}

	/** The sound of a new achievement (a soft synth chime, sound/unlock.mp3), unless it was muted (`Achievements: mute or unmute the sound`). */
	chime(volume = 0.55) {
		try {
			if (localStorage.getItem(MUTE_KEY) === '1') return;
			const a = new Audio(SOUND); a.volume = volume; a.play().catch(() => { /* the browser may not allow sound yet */ });
		} catch (e) { /* no sound */ }
	}

	/**
	 * A new achievement is only announced, never shown in the middle of your writing: a small note comes down at the top right with its
	 * picture half hidden, grey and frosted under a gradient from the right that says "Unlock new achievement" - not which one. Click it and
	 * the achievement opens (claim, below). Ignore it and it slides away after a few seconds; the mascot keeps a faint glow until it is
	 * claimed. `preview` is for the panel's test buttons: nothing is recorded.
	 */
	announce(list, opts = {}) {
		this.endNote(false);
		if (!opts.preview) { for (const a of list) if (!this.st.pending.includes(a.id)) this.st.pending.push(a.id); this.save(); }
		const n = this.note = document.createElement('div');
		n.className = 'ach-note';
		n.innerHTML = '<img alt=""><i class="ach-nsh"></i><div class="ach-nt"><b></b></div>';
		n.querySelector('img').src = pictureOf(list[0]);
		n.querySelector('b').textContent = list.length > 1 ? `Unlock new achievements · ${list.length}` : 'Unlock new achievement';
		n.addEventListener('click', () => this.claim(list, opts));
		const arm = (ms) => { clearTimeout(this.noteT); this.noteT = setTimeout(() => this.endNote(true), ms); };
		n.addEventListener('pointerenter', () => clearTimeout(this.noteT));
		n.addEventListener('pointerleave', () => arm(3000));
		document.body.appendChild(n);
		n.getBoundingClientRect();   // its starting place, so that 'on' animates from it
		n.classList.add('on');
		arm(8000);
		this.chime();
		this.refreshUi();
	}

	endNote(animated) {
		clearTimeout(this.noteT);
		const n = this.note;
		this.note = null;
		if (n) { if (animated) { n.classList.add('out'); setTimeout(() => n.remove(), 700); } else n.remove(); }
		if (this.widget) this.refreshUi();
	}

	/** Opens what is waiting (or `list`): the note goes and the achievements open as cards over the screen. */
	claim(list, opts = {}) {
		const l = list || ACHIEVEMENTS.filter((a) => this.st.pending.includes(a.id));
		this.endNote(true);
		if (!l.length) return;
		this.reveal(l, opts.style);
		if (!opts.preview) { this.st.pending = this.st.pending.filter((id) => !l.some((a) => a.id === id)); this.save(); }
		this.refreshUi();
	}

	/** Writes what an achievement is into a card (its tier, name, what it asks and, in the viewer, when it was won and what it paid). */
	fillCard(el, a, date) {
		el.style.setProperty('--c', TIER_FX[tier(a)][0]);
		el.querySelector('small').textContent = tier(a);
		el.querySelector('b').textContent = a.name;
		el.querySelector('span').textContent = a.desc;
		const em = el.querySelector('em');
		em.textContent = date ? `${new Date(date).toLocaleDateString()} \u00b7 \u25ce +${fmt(a.crowns)}` : '';
	}

	/** One achievement as a card: its picture (the shader's canvas goes over it while it opens) and, under it, what it is. */
	card(a, date) {
		const el = document.createElement('div');
		el.className = 'ach-cd';
		el.style.setProperty('--c', TIER_FX[tier(a)][0]);
		el.innerHTML = '<div class="ach-cdi"><div class="ach-cd-ph"><img alt=""><canvas></canvas></div><div class="ach-cd-tx"><small></small><b></b><span></span><em></em></div></div>';
		el.querySelector('img').src = pictureOf(a);
		this.fillCard(el, a, date);
		return el;
	}

	/** The dark screen both the opening and the viewer use; a click, or Escape, closes it. `onKey` gets the other keys. */
	stage(onKey) {
		this.endReveal(false);
		const ov = this.rev = document.createElement('div');
		ov.className = 'ach-rv';
		document.body.appendChild(ov);
		this.revKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.endReveal(true); } else if (onKey && onKey(e)) e.stopPropagation(); };
		document.addEventListener('keydown', this.revKey, true);
		return ov;
	}

	/**
	 * The opening: the achievements fly in from the top right, turning to face you, and land scattered over the screen (one big in the
	 * middle when it is alone), each a picture with what it is written under it. The pictures develop under their own shader
	 * (REVEAL_STYLES, in the tier's colour) from the grey, frosted look of the note, and the cards lean towards the pointer with a
	 * soft glare. A click, Escape or ten seconds closes it. Without WebGL, or with reduced motion, the pictures are simply there.
	 */
	reveal(list, style) {
		const ov = this.stage();
		const shown = list.slice(0, FX_MAX), more = list.length - shown.length, n = shown.length, vw = window.innerWidth, vh = window.innerHeight;
		const cols = Math.max(1, Math.round(Math.sqrt(n * vw / vh))), rows = Math.ceil(n / cols), cw = vw / cols, chh = (vh - 40) / rows;
		const W = Math.round(Math.max(130, Math.min(520, cw * 0.82, (chh * 0.84 - 92) / 0.667)));
		const cells = [...Array(cols * rows).keys()].sort(() => Math.random() - 0.5).slice(0, n).sort((x, y) => x - y);   // which cells of the grid they take
		const tilt = [-3, 2.4, -1.4, 3.2, -2.2, 1.6];
		const cards = shown.map((a, i) => {
			const el = this.card(a), c = cells[i];
			const x = (c % cols) * cw + cw / 2 + (n > 1 ? (Math.random() - 0.5) * cw * 0.1 : 0), y = 20 + Math.floor(c / cols) * chh + chh / 2 + (n > 1 ? (Math.random() - 0.5) * chh * 0.1 : 0);
			el.style.cssText += `;--w:${W}px;--fs:${Math.round(Math.max(14, Math.min(24, W * 0.058)))}px;--x:${Math.round(x)}px;--y:${Math.round(y)}px;--rot:${n > 1 ? tilt[i % 6] : 0}deg;--fx:${Math.round(vw - 70 - x)}px;--fy:${Math.round(46 - y)}px;--d:${(i * 0.15).toFixed(2)}s`;
			ov.appendChild(el);
			return { a, el };
		});
		if (more > 0) { const m = document.createElement('div'); m.className = 'ach-more'; m.textContent = `+${more} more`; ov.appendChild(m); }
		this.revCards = cards;
		const still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		for (const [i, c] of cards.entries()) {
			const cv = c.el.querySelector('canvas'), rv = still ? null : new Reveal(cv, c.el.querySelector('img'), TIER_FX[tier(c.a)][0], revealStyle(c.a, style, i));
			if (rv && rv.ok) { c.rv = rv; c.el.classList.add('fx'); } else cv.remove();
		}
		ov.getBoundingClientRect();
		ov.classList.add('on');
		const born = performance.now();
		const tick = (ts) => {
			if (this.rev !== ov) return;
			this.revRaf = requestAnimationFrame(tick);
			for (const c of cards) if (c.rv) { c.rv.draw(ts); if (c.rv.done(ts)) { c.el.classList.remove('fx'); c.rv.destroy(); c.rv = null; c.el.querySelector('canvas').remove(); } }
		};
		this.revRaf = requestAnimationFrame(tick);
		ov.addEventListener('pointermove', (e) => {   // the cards lean towards the pointer, a glare follows it
			for (const c of cards) {
				const r = c.el.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height, near = Math.abs(dx) < 0.9 && Math.abs(dy) < 0.9;
				const inner = c.el.firstChild;
				inner.style.setProperty('--ry', `${near ? Math.max(-1, Math.min(1, dx)) * 7 : 0}deg`); inner.style.setProperty('--rx', `${near ? -Math.max(-1, Math.min(1, dy)) * 7 : 0}deg`);
				inner.style.setProperty('--gx', `${Math.round(((e.clientX - r.left) / r.width) * 100)}%`); inner.style.setProperty('--gy', `${Math.round(((e.clientY - r.top) / r.height) * 100)}%`); inner.style.setProperty('--go', near ? '1' : '0');
			}
		});
		const at = (ms, fn) => this.revT.push(setTimeout(fn, ms));
		let last = 0;
		cards.forEach((c, i) => {
			const open = 640 + i * 150, lit = open + 420;
			last = lit;
			at(open, () => c.rv?.start(performance.now()));
			at(lit, () => { c.el.classList.add('lit'); if (i === 0) this.mascot?.celebrate(performance.now()); });
		});
		ov.addEventListener('click', () => { if (performance.now() - born > 600) this.endReveal(true); });
		at(last + 9000, () => this.endReveal(true));
	}

	/**
	 * One unlocked achievement, looked at: the picture big, nothing moving, and under it what it is, when it was won and what it paid.
	 * Left and right (or the arrows) go through `list`, the ones the list shows.
	 */
	view(a, list = [a]) {
		let i = Math.max(0, list.findIndex((x) => x.id === a.id));
		const vw = window.innerWidth, vh = window.innerHeight, W = Math.round(Math.max(200, Math.min(700, vw * 0.84, (vh * 0.82 - 110) / 0.667)));
		let morph = null, turn = 0;
		const finish = () => {   // a change that is not over yet jumps to its end
			if (!morph) return;
			const m = morph; morph = null;
			cancelAnimationFrame(this.morphRaf);
			m.final();
		};
		const go = async (d) => {
			i = (i + d + list.length) % list.length;
			const mine = ++turn, next = list[i];
			finish();
			const el = ov.querySelector('.ach-cd');
			if (!el) return;
			const nb = new Image();
			nb.src = pictureOf(next);
			try { await nb.decode(); } catch (e) { /* shown anyway */ }
			if (mine !== turn || this.rev !== ov) return;
			const ph = el.querySelector('.ach-cd-ph'), img = ph.querySelector('img'), tx = el.querySelector('.ach-cd-tx'), cv = document.createElement('canvas');
			ph.appendChild(cv);
			const m = new Morph(cv, img, nb, d);
			tx.classList.add('swap');   // the words fade out, change, and fade in again while the picture changes
			setTimeout(() => { if (mine !== turn) return; this.fillCard(el, next, this.st.unlocked[next.id]); tx.classList.remove('swap'); }, 300);
			if (!m.ok) { m.destroy(); cv.remove(); img.src = nb.src; return; }
			m.final = () => { img.src = nb.src; img.decode().then(() => cv.remove(), () => cv.remove()); m.destroy(); this.fillCard(el, next, this.st.unlocked[next.id]); tx.classList.remove('swap'); };
			morph = m;
			m.start(performance.now());
			const tick = (ts) => { if (morph !== m) return; m.draw(ts); if (m.done(ts)) finish(); else this.morphRaf = requestAnimationFrame(tick); };
			this.morphRaf = requestAnimationFrame(tick);
		};
		const ov = this.stage((e) => { if (list.length > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { go(e.key === 'ArrowLeft' ? -1 : 1); return true; } return false; });
		this.morphKill = () => { cancelAnimationFrame(this.morphRaf); morph?.destroy(); morph = null; };   // set after stage(), which clears the last one
		const first = this.card(list[i], this.st.unlocked[list[i].id]);
		first.classList.add('view', 'enter');
		first.style.cssText += `;--w:${W}px;--fs:${Math.round(Math.max(16, Math.min(26, W * 0.04)))}px;--x:${Math.round(vw / 2)}px;--y:${Math.round(vh / 2)}px`;
		first.querySelector('canvas').remove();
		ov.appendChild(first);
		void first.offsetWidth;
		first.classList.remove('enter');
		if (list.length > 1) for (const d of [-1, 1]) {
			const b = document.createElement('button');
			b.className = 'ach-arr ' + (d < 0 ? 'l' : 'r'); b.setAttribute('aria-label', d < 0 ? 'Previous' : 'Next');
			b.innerHTML = `<svg viewBox="0 0 24 24"><path d="${d < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
			b.addEventListener('click', (e) => { e.stopPropagation(); go(d); });
			ov.appendChild(b);
		}
		ov.addEventListener('click', () => this.endReveal(true));
		ov.getBoundingClientRect();
		ov.classList.add('on');
	}

	endReveal(animated) {
		this.revT.forEach(clearTimeout); this.revT = [];
		cancelAnimationFrame(this.revRaf);
		this.morphKill?.(); this.morphKill = null;
		if (this.revKey) document.removeEventListener('keydown', this.revKey, true);
		this.revKey = null;
		const ov = this.rev, cards = this.revCards || [];
		this.rev = null; this.revCards = null;
		if (!ov) return;
		const gone = () => { cards.forEach((c) => c.rv?.destroy()); ov.remove(); };
		if (animated) { ov.classList.add('out'); setTimeout(gone, 450); } else gone();
	}

	// ---- The list ----------------------------------------------------------------------------------------------------------

	openPanel() {
		this.closePanel();
		const cs = getComputedStyle(document.body);
		const ov = document.createElement('div');
		ov.className = 'ach-ov';
		this.pf = this.pf || { show: 'all', tiers: new Set() };   // the list's filters
		ov.innerHTML = `<div class="ach-box"><div-scrollable class="ach-scroll force-active-scrollbar" style="overflow-y: scroll; height: 100%"><div class="ach-in">
<div class="ach-head"><div class="ach-por"><canvas></canvas></div><div class="ach-ht"><div class="ach-title">Achievements</div><div class="ach-sub"></div></div><button class="ach-tg" data-a="test">Test</button><button class="ach-x" aria-label="Close">✕</button></div>
<div class="ach-pbar"><i></i></div>
<div class="ach-tools"><div class="ach-seg">${[['all', 'All'], ['done', 'Done'], ['todo', 'To do']].map(([k, l]) => `<button data-f="${k}">${l}<em></em></button>`).join('')}</div><div class="ach-chips">${Object.keys(TIER_FX).map((t) => `<button data-tf="${t}" data-tier="${t.toLowerCase()}"><i></i>${t}</button>`).join('')}</div></div>
<div class="ach-testbox" hidden><div class="ach-test"><span>Test</span><button data-t="one">Notify</button><button data-t="three">Notify x3</button><button data-t="unlock">Unlock next</button><button data-t="relock">Re-lock last</button></div><div class="ach-test"><span>Opening</span>${REVEAL_STYLES.map((n, i) => `<button data-t="fx${i}">${n}</button>`).join('')}<button data-t="tour">Tour</button></div></div>
<div class="ach-grid"></div></div></div-scrollable></div>`;
		const box = ov.querySelector('.ach-box');
		box.style.color = cs.color;
		box.style.background = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'Canvas';
		ov.addEventListener('mousedown', (e) => { if (e.target === ov) this.closePanel(); });
		ov.querySelector('.ach-x').onclick = () => this.closePanel();
		ov.addEventListener('click', (e) => {
			const hit = (sel) => e.target.closest(sel);
			let el;
			if ((el = hit('[data-t]'))) this.test(el.dataset.t);
			else if ((el = hit('[data-f]'))) { this.pf.show = el.dataset.f; this.renderPanel(); }
			else if ((el = hit('[data-tf]'))) { const t = el.dataset.tf; this.pf.tiers.has(t) ? this.pf.tiers.delete(t) : this.pf.tiers.add(t); this.renderPanel(); }
			else if (hit('[data-a="test"]')) { const tb = ov.querySelector('.ach-testbox'); tb.hidden = !tb.hidden; }
			else if ((el = hit('.ach-t.got'))) { const a = ACHIEVEMENTS.find((x) => x.id === el.dataset.id); if (a) this.view(a, this.panelList); }   // an unlocked one is looked at, big
		});
		this.panelKey = (e) => { if (e.key === 'Escape' && !this.rev) { e.stopPropagation(); this.closePanel(); } };   // while a card is open, Escape closes only that
		document.addEventListener('keydown', this.panelKey, true);
		document.body.appendChild(ov);
		this.panel = ov;
		this.panelMascot = new Mascot(ov.querySelector('canvas'));
		for (const [ev, on] of [['pointerenter', true], ['pointerleave', false]]) ov.querySelector('.ach-por').addEventListener(ev, () => { if (this.panelMascot) this.panelMascot.hover = on; });
		if (!this.widget) { this.loopPanel(); }
		this.st.opens++;
		this.changed();   // which draws the list
	}

	/** The panel's test buttons: show the notification without changing anything, or really unlock (and re-lock) one. */
	test(what) {
		const pick = (n) => [...ACHIEVEMENTS].sort(() => Math.random() - 0.5).slice(0, n);
		if (what === 'one') this.announce(pick(1), { preview: true });   // the note, and then the opening on a click
		else if (what === 'three') this.announce(pick(3), { preview: true });
		else if (what.startsWith('fx')) this.reveal(pick(1), +what.slice(2));   // straight to the opening, in this style
		else if (what === 'tour') this.reveal(pick(FX_MAX), [...REVEAL_STYLES.keys()].sort(() => Math.random() - 0.5));   // as many pictures as fit, each in another style
		else if (what === 'unlock') {
			const a = ACHIEVEMENTS.find((x) => !this.st.unlocked[x.id]);
			if (!a) return;
			this.st.unlocked[a.id] = Date.now(); this.st.pending.push(a.id); this.save(); this.announce([a]); this.refreshUi();
		} else if (what === 'relock') {
			const last = ACHIEVEMENTS.filter((x) => this.st.unlocked[x.id]).sort((x, y) => this.st.unlocked[y.id] - this.st.unlocked[x.id])[0];
			if (!last) return;
			delete this.st.unlocked[last.id]; this.st.pending = this.st.pending.filter((id) => id !== last.id); this.save(); this.refreshUi();
		}
	}

	/** The panel animates its own mascot when the corner one is hidden. */
	loopPanel() {
		const tick = (now) => { if (!this.panel || this.widget) return; this.panelRaf = requestAnimationFrame(tick); this.panelMascot?.draw(now, 0.15); };
		this.panelRaf = requestAnimationFrame(tick);
	}

	closePanel() {
		cancelAnimationFrame(this.panelRaf);
		if (this.panelKey) document.removeEventListener('keydown', this.panelKey, true);
		this.panelKey = null;
		this.panelMascot?.destroy(); this.panelMascot = null;
		this.panel?.remove(); this.panel = null;
	}

	renderPanel() {
		const p = this.panel;
		if (!p) return;
		const m = measures(this.st), got = this.unlockedCount(), pf = this.pf, pr = (a) => Math.min(1, m[a.stat] / a.target), un = {};
		for (const a of ACHIEVEMENTS) if (this.claimed(a)) un[a.id] = this.st.unlocked[a.id];   // one that is still waiting looks locked here
		p.querySelector('.ach-sub').innerHTML = `${got} of ${ACHIEVEMENTS.length} unlocked · <span>◎ ${fmt(this.crowns())} crowns</span> · ${fmt(this.st.words)} words`;
		p.querySelector('.ach-pbar i').style.width = `${(got / ACHIEVEMENTS.length) * 100}%`;
		const counts = { all: ACHIEVEMENTS.length, done: got, todo: ACHIEVEMENTS.length - got };
		p.querySelectorAll('[data-f]').forEach((b) => { b.classList.toggle('on', pf.show === b.dataset.f); b.querySelector('em').textContent = counts[b.dataset.f]; });
		p.querySelectorAll('[data-tf]').forEach((b) => b.classList.toggle('on', pf.tiers.has(b.dataset.tf)));
		const grid = p.querySelector('.ach-grid');
		grid.textContent = '';
		const rows = ACHIEVEMENTS.filter((a) => (pf.show === 'all' || (pf.show === 'done') === !!un[a.id]) && (!pf.tiers.size || pf.tiers.has(tier(a))))
			.sort((a, b) => (un[b.id] ? 1 : 0) - (un[a.id] ? 1 : 0) || (un[a.id] && un[b.id] ? un[b.id] - un[a.id] : pr(b) - pr(a)));   // the newest unlock first, then the nearest to unlocking
		this.panelList = rows.filter((a) => un[a.id]);   // what the viewer goes through
		for (const a of rows) {
			const on = !!un[a.id], c = document.createElement('div');
			c.className = 'ach-t ' + (on ? 'got' : 'lock'); c.dataset.tier = tier(a).toLowerCase(); c.dataset.id = a.id;
			c.innerHTML = '<img alt="" loading="lazy" decoding="async"><div class="ach-tc"><b></b><span></span></div>';
			c.querySelector('img').src = pictureOf(a);
			c.querySelector('b').textContent = on ? a.name : '???';   // a locked one keeps its name, task and target secret, so it is found rather than speedrun
			c.querySelector('span').textContent = `◎ ${fmt(a.crowns)}`;
			if (!on) { const bar = document.createElement('div'); bar.className = 'ach-tp'; bar.innerHTML = '<i></i>'; bar.firstChild.style.width = `${pr(a) * 100}%`; c.appendChild(bar); }
			grid.appendChild(c);
		}
		if (!rows.length) { const e = document.createElement('div'); e.className = 'ach-none'; e.textContent = 'Nothing here'; grid.appendChild(e); }
	}
}
