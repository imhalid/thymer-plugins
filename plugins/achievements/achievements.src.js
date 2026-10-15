/**
 * Achievements
 *
 * Trophies for writing, and a character card in the top-left corner: a window onto the mascot's head, looking out at you (it
 * follows the pointer, nods while you type, and spins when something unlocks), with its name, level, an
 * achievement progress bar and three buttons below - search, jump to, and the full list. The head is a low-poly model
 * drawn with plain WebGL (no libraries, no network); everything else is HTML and CSS.
 *
 * The model is baked into this file at build time (see build.mjs); it is not part of the source in the repository.
 * Everything is kept per device in localStorage ("achievements:v1").
 */

const SONIC = __SONIC__;

const STORE_KEY = 'achievements:v1';
const HIDE_KEY = 'achievements:hidden';
const STREAK_MIN_WORDS = 30;   // a day counts toward the streak from this many words

// ---- The list ------------------------------------------------------------------------------------------------------------
// stat: what is measured; target: where it unlocks; rings: what it pays.
const ACHIEVEMENTS = [
	{ id: 'w1', name: 'First Ring', desc: 'Write your first word', stat: 'words', target: 1, rings: 5, icon: '💍' },
	{ id: 'w25', name: 'Warm Up', desc: 'Write 25 words', stat: 'words', target: 25, rings: 5, icon: '🏃' },
	{ id: 'w100', name: 'Ring Collector', desc: 'Write 100 words', stat: 'words', target: 100, rings: 10, icon: '💍' },
	{ id: 'w500', name: 'Gold Rush', desc: 'Write 500 words', stat: 'words', target: 500, rings: 20, icon: '🥇' },
	{ id: 'w1000', name: 'Ring Master', desc: 'Write 1,000 words', stat: 'words', target: 1000, rings: 40, icon: '🏅' },
	{ id: 'w5000', name: 'Rings Everywhere', desc: 'Write 5,000 words', stat: 'words', target: 5000, rings: 80, icon: '🌟' },
	{ id: 'w10000', name: 'Super Rings', desc: 'Write 10,000 words', stat: 'words', target: 10000, rings: 150, icon: '👑' },
	{ id: 'w25000', name: 'Hyper Rings', desc: 'Write 25,000 words', stat: 'words', target: 25000, rings: 300, icon: '💫' },
	{ id: 'w50000', name: 'Hyper Form', desc: 'Write 50,000 words', stat: 'words', target: 50000, rings: 500, icon: '🌈' },
	{ id: 'w100000', name: 'Ultimate Life Form', desc: 'Write 100,000 words', stat: 'words', target: 100000, rings: 1000, icon: '🖤' },
	{ id: 'd250', name: 'Spin Dash', desc: 'Write 250 words in one day', stat: 'bestDay', target: 250, rings: 15, icon: '🌀' },
	{ id: 'd1000', name: 'Boost', desc: 'Write 1,000 words in one day', stat: 'bestDay', target: 1000, rings: 50, icon: '🚀' },
	{ id: 'd2500', name: 'Super Form', desc: 'Write 2,500 words in one day', stat: 'bestDay', target: 2500, rings: 120, icon: '✨' },
	{ id: 'd5000', name: 'Sonic Boom', desc: 'Write 5,000 words in one day', stat: 'bestDay', target: 5000, rings: 250, icon: '💥' },
	{ id: 'm1000', name: 'Speed Highway', desc: 'Write 1,000 words without a 10-minute break', stat: 'bestSession', target: 1000, rings: 60, icon: '🛣️' },
	{ id: 'm3000', name: 'Final Rush', desc: 'Write 3,000 words without a 10-minute break', stat: 'bestSession', target: 3000, rings: 180, icon: '☄️' },
	{ id: 'p25', name: 'Fast Enough', desc: '25 words in a minute', stat: 'peak', target: 25, rings: 10, icon: '👟' },
	{ id: 'p40', name: 'Gotta Go Fast', desc: '40 words in a minute', stat: 'peak', target: 40, rings: 30, icon: '⚡' },
	{ id: 'p60', name: 'Faster Than Sound', desc: '60 words in a minute', stat: 'peak', target: 60, rings: 80, icon: '💨' },
	{ id: 'p80', name: 'Light Speed', desc: '80 words in a minute', stat: 'peak', target: 80, rings: 150, icon: '🌠' },
	{ id: 'ln50', name: 'Rail Grind', desc: 'Write 50 words in a single line', stat: 'longLine', target: 50, rings: 10, icon: '🛤️' },
	{ id: 'ln200', name: 'Rail Canyon', desc: 'Write 200 words in a single line', stat: 'longLine', target: 200, rings: 50, icon: '🚂' },
	{ id: 'l10', name: 'Spring', desc: 'Add 10 lines', stat: 'lines', target: 10, rings: 5, icon: '🦘' },
	{ id: 'l1000', name: 'Loop-de-Loop', desc: 'Add 1,000 lines', stat: 'lines', target: 1000, rings: 60, icon: '➰' },
	{ id: 'l5000', name: 'Carnival Night', desc: 'Add 5,000 lines', stat: 'lines', target: 5000, rings: 200, icon: '🎡' },
	{ id: 's3', name: 'First Emerald', desc: 'Write 3 days in a row', stat: 'bestStreak', target: 3, rings: 15, icon: '💚' },
	{ id: 's7', name: 'Seven Emeralds', desc: 'Write 7 days in a row', stat: 'bestStreak', target: 7, rings: 50, icon: '💎' },
	{ id: 's14', name: 'Master Emerald', desc: 'Write 14 days in a row', stat: 'bestStreak', target: 14, rings: 100, icon: '🔷' },
	{ id: 's30', name: 'Chaos Control', desc: 'Write 30 days in a row', stat: 'bestStreak', target: 30, rings: 250, icon: '🌌' },
	{ id: 's60', name: 'Angel Island', desc: 'Write 60 days in a row', stat: 'bestStreak', target: 60, rings: 400, icon: '🏝️' },
	{ id: 's100', name: 'Hidden Palace', desc: 'Write 100 days in a row', stat: 'bestStreak', target: 100, rings: 600, icon: '🏛️' },
	{ id: 's365', name: 'Super Emeralds', desc: 'Write 365 days in a row', stat: 'bestStreak', target: 365, rings: 2000, icon: '🔮' },
	{ id: 't1', name: 'Checkpoint', desc: 'Finish a task', stat: 'tasks', target: 1, rings: 5, icon: '🚩' },
	{ id: 't5', name: 'Starpost', desc: 'Finish 5 tasks', stat: 'tasks', target: 5, rings: 10, icon: '📍' },
	{ id: 't10', name: 'Zone Clear', desc: 'Finish 10 tasks', stat: 'tasks', target: 10, rings: 20, icon: '✅' },
	{ id: 't50', name: 'Act Complete', desc: 'Finish 50 tasks', stat: 'tasks', target: 50, rings: 60, icon: '🏁' },
	{ id: 't100', name: 'Time Attack', desc: 'Finish 100 tasks', stat: 'tasks', target: 100, rings: 120, icon: '⏱️' },
	{ id: 't250', name: 'Badnik Buster', desc: 'Finish 250 tasks', stat: 'tasks', target: 250, rings: 200, icon: '🤖' },
	{ id: 't1000', name: 'Death Egg Down', desc: 'Finish 1,000 tasks', stat: 'tasks', target: 1000, rings: 700, icon: '💣' },
	{ id: 'td5', name: 'Combo', desc: 'Finish 5 tasks in one day', stat: 'bestTaskDay', target: 5, rings: 15, icon: '🔗' },
	{ id: 'td20', name: 'Boss Rush', desc: 'Finish 20 tasks in one day', stat: 'bestTaskDay', target: 20, rings: 80, icon: '⚔️' },
	{ id: 'night', name: 'Night Owl', desc: 'Write 100 words between 22:00 and 04:00', stat: 'night', target: 100, rings: 25, icon: '🌙' },
	{ id: 'night1k', name: 'Mystic Cave', desc: 'Write 1,000 words between 22:00 and 04:00', stat: 'night', target: 1000, rings: 80, icon: '🦇' },
	{ id: 'early', name: 'Early Bird', desc: 'Write 100 words between 04:00 and 08:00', stat: 'early', target: 100, rings: 25, icon: '🌅' },
	{ id: 'early1k', name: 'Sky Sanctuary', desc: 'Write 1,000 words between 04:00 and 08:00', stat: 'early', target: 1000, rings: 80, icon: '☀️' },
	{ id: 'midnight', name: 'Werehog', desc: 'Write a word at midnight sharp (00:00)', stat: 'midnight', target: 1, rings: 40, icon: '🐺' },
	{ id: 'h12', name: 'Sunset Hill', desc: 'Write in 12 different hours of the day', stat: 'hours', target: 12, rings: 40, icon: '🌇' },
	{ id: 'h24', name: 'Day and Night', desc: 'Write in every hour of the day, 00 to 23', stat: 'hours', target: 24, rings: 200, icon: '🌗' },
	{ id: 'wkend', name: 'Casino Night', desc: 'Write 500 words on weekends', stat: 'weekend', target: 500, rings: 25, icon: '🎰' },
	{ id: 'wk7', name: 'Zone Tour', desc: 'Write on every day of the week, Monday to Sunday', stat: 'weekdays', target: 7, rings: 30, icon: '📅' },
	{ id: 'ny', name: 'New Game', desc: "Write on New Year's Day", stat: 'newYear', target: 1, rings: 30, icon: '🎆' },
	{ id: 'back', name: 'Extra Life', desc: 'Come back and write after 7 or more days away', stat: 'comeback', target: 7, rings: 20, icon: '🆙' },
	{ id: 'a3', name: 'Emerald Coast', desc: 'Write on 3 different days', stat: 'daysActive', target: 3, rings: 10, icon: '🏖️' },
	{ id: 'a10', name: 'Green Hill', desc: 'Write on 10 different days', stat: 'daysActive', target: 10, rings: 30, icon: '🌿' },
	{ id: 'a30', name: 'Chemical Plant', desc: 'Write on 30 different days', stat: 'daysActive', target: 30, rings: 90, icon: '🧪' },
	{ id: 'a100', name: 'Final Egg', desc: 'Write on 100 different days', stat: 'daysActive', target: 100, rings: 300, icon: '🥚' },
	{ id: 'a200', name: 'Station Square', desc: 'Write on 200 different days', stat: 'daysActive', target: 200, rings: 500, icon: '🏙️' },
	{ id: 'a365', name: 'Space Colony ARK', desc: 'Write on 365 different days', stat: 'daysActive', target: 365, rings: 1000, icon: '🛰️' },
	{ id: 'peek', name: 'Ring Box', desc: 'Open the achievements list', stat: 'opens', target: 1, rings: 2, icon: '📦' },
	{ id: 'got10', name: 'Chao Garden', desc: 'Unlock 10 achievements', stat: 'got', target: 10, rings: 30, icon: '🐣' },
	{ id: 'got30', name: 'Emblem Hunter', desc: 'Unlock 30 achievements', stat: 'got', target: 30, rings: 150, icon: '🎖️' },
];
ACHIEVEMENTS.push({ id: 'all', name: 'Super Sonic', desc: 'Unlock every other achievement', stat: 'got', target: ACHIEVEMENTS.length, rings: 1500, icon: '🦔' });

/** How hard an achievement is, read from what it pays. */
const tier = (a) => (a.rings <= 10 ? 'Easy' : a.rings <= 40 ? 'Medium' : a.rings <= 150 ? 'Hard' : 'Legendary');

// ---- Small helpers -------------------------------------------------------------------------------------------------------
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ease = (t) => 1 - Math.pow(1 - t, 3);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function freshState() {
	return { words: 0, tasks: 0, lines: 0, peak: 0, night: 0, early: 0, midnight: 0, longLine: 0, session: 0, bestSession: 0, lastWordAt: 0, opens: 0, days: {}, taskDays: {}, hours: {}, unlocked: {}, doneGuids: [] };
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

// ---- The mascot: a tiny WebGL renderer for the baked model -----------------------------------------------------------------
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
in vec3 aPos; in vec3 aNrm; in vec2 aUv;
uniform mat4 uMVP; uniform mat3 uRot;
out vec3 vN; out vec2 vUv;
void main() { vN = uRot * aNrm; vUv = aUv; gl_Position = uMVP * vec4(aPos, 1.0); }`;
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

class Mascot {
	constructor(canvas, head = true) {
		this.canvas = canvas; this.head = head; this.look = { x: 0, y: 0 }; this.lx = 0; this.ly = 0; this.nod = 0;
		this.gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
		this.ok = !!this.gl;
		this.yaw = 0.6; this.t0 = performance.now(); this.hop = null; this.speed = 0;
		if (!this.ok) return;
		const gl = this.gl, sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
		const p = this.prog = gl.createProgram();
		gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { this.ok = false; return; }
		this.u = Object.fromEntries(['uMVP', 'uRot', 'uTex', 'uColor', 'uHasTex', 'uGlow'].map((n) => [n, gl.getUniformLocation(p, n)]));
		const [lo, hi] = SONIC.box;
		this.center = head ? [-0.6, 2.45, 0] : [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2);   // the head, or the whole body
		this.fit = head ? 1 / 4.9 : 1 / Math.max(hi[1] - lo[1], hi[0] - lo[0]);   // scaled to a unit tall
		this.textures = SONIC.textures.map((src) => {
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
		this.parts = SONIC.parts.map((q) => {
			const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
			const buf = (data, loc, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
			buf(unb64(q.pos, Float32Array), gl.getAttribLocation(p, 'aPos'), 3); buf(unb64(q.nrm, Float32Array), gl.getAttribLocation(p, 'aNrm'), 3);
			if (q.uv) buf(unb64(q.uv, Float32Array), gl.getAttribLocation(p, 'aUv'), 2);
			const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, unb64(q.idx, Uint16Array), gl.STATIC_DRAW);
			gl.bindVertexArray(null);
			return { vao, n: q.n, tex: q.tex, color: q.color };
		});
	}

	/** A celebration: a hop with a double spin. */
	celebrate(now) { this.hop = { t0: now, ms: 1100 }; }

	/** Draws one frame at `now`; `speed` (0..1) is how busy the writing is (it nods), `glow` lights it up. */
	draw(now, speed, glow = 0) {
		if (!this.ok) return;
		const gl = this.gl, c = this.canvas, dt = Math.min(50, now - (this.last || now)); this.last = now;
		this.speed += (speed - this.speed) * Math.min(1, dt / 250);
		this.lx += (this.look.x - this.lx) * Math.min(1, dt / 140); this.ly += (this.look.y - this.ly) * Math.min(1, dt / 140);
		let y = 0.008 * Math.sin(now / 520), spin = 0, hopY = 0;
		if (this.hop) {
			const f = (now - this.hop.t0) / this.hop.ms;
			if (f >= 1) this.hop = null; else { hopY = 0.1 * 4 * f * (1 - f); spin = ease(Math.min(1, f * 1.1)) * Math.PI * 2; }
		}
		// front on (this model's nose points down -x), turned a little toward the pointer, swaying, nodding while it writes
		const yaw = Math.PI / 2 + this.lx * 0.55 + 0.05 * Math.sin(now / 1100) + spin, pitch = 0.06 + this.ly * 0.3 + this.speed * 0.07 * Math.sin(now / 95);
		if (c.width !== c.clientWidth * 2 && c.clientWidth) { c.width = c.clientWidth * 2; c.height = c.clientHeight * 2; }
		gl.viewport(0, 0, c.width, c.height);
		gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
		gl.useProgram(this.prog);
		const rot = mat.mul(mat.rotx(pitch), mat.roty(yaw));
		const model = mat.mul(mat.trans(0, y + hopY, 0), mat.mul(rot, mat.mul(mat.scale(this.fit), mat.trans(-this.center[0], -this.center[1], -this.center[2]))));
		const mvp = mat.mul(mat.persp(0.5, c.width / c.height, 0.1, 10), mat.mul(mat.trans(0, 0, -2.15), model));
		gl.uniformMatrix4fv(this.u.uMVP, false, mvp);
		gl.uniformMatrix3fv(this.u.uRot, false, mat.rot3(rot));
		gl.uniform1f(this.u.uGlow, glow);
		for (const q of this.parts) {
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

// ---- The unlock effect: one fragment shader over every badge of the notification ---------------------------------------
// Round each badge, while the icon waits small, energy gathers: a vortex turns, a ring of flame licks outward and electricity
// crackles round it, and stars are drawn in. At BURST_MS it bursts: a flash, a shockwave broken into arcs, a softer faster
// ring, and a spray of streaking sparks and twinkling embers, as the icon springs open. It is drawn from small grayscale
// textures (see fx/LICENSE.md): a sprite atlas and a tiling noise, tinted with the tier's colour. Coordinates are in badge
// radii; one canvas (one WebGL context) covers the whole stack, so any number of unlocks costs the same.
const FX = __FX__;   // { atlas, noise } as data URLs, baked in by build.mjs
const BURST_MS = 800;
const FX_MAX = 6;            // badges in one notification; more are summed up in a line
const FX_REACH = 130;        // how far (CSS px) an effect reaches from its badge
const FX_STAGGER_MS = 160;   // between one row's opening and the next
const GLOW_BELOW = 100;     // how far (px) the notification's glow reaches below its last row
const TIER_FX = { Easy: ['#5ee6a0', 0.5], Medium: ['#4fd8ff', 1], Hard: ['#b98cff', 1.4], Legendary: ['#ffb347', 2] };
let fxImgs = null;
/** The textures as images, decoded once and kept, so they are ready when something unlocks. */
const fxImages = () => fxImgs || (fxImgs = Object.fromEntries(Object.entries(FX).map(([k, src]) => { const i = new Image(); i.src = src; return [k, i]; })));
const FX_VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FX_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uDpr; uniform int uN; uniform sampler2D uAtlas, uNoise;
uniform vec2 uC[${FX_MAX}]; uniform float uR[${FX_MAX}], uT[${FX_MAX}], uPow[${FX_MAX}]; uniform vec3 uCol[${FX_MAX}];
out vec4 o;
const float B = ${(BURST_MS / 1000).toFixed(2)};
// the atlas, 4 x 3 cells: 0-3 electricity, 4 vortex, 5 sharp ring, 6 soft ring, 7 four-point star, 8 streak, 9 burst, 10 six-point star, 11 glow star
const float ZAP = 0.0, VORTEX = 4.0, RING = 5.0, SOFTRING = 6.0, STAR = 7.0, STREAK = 8.0, BURST = 9.0, STAR6 = 10.0, GLOW = 11.0;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float nz(vec2 uv) { return textureLod(uNoise, uv, 0.0).r; }
// sprite c at q (its own space, -1 to 1, y up), size its half-width in radii; pxr is device px per radius, for the mip level
float spr(float c, vec2 q, float size, float pxr) {
	if (abs(q.x) >= 1.0 || abs(q.y) >= 1.0) return 0.0;
	vec2 uv = (vec2(mod(c, 4.0), floor(c / 4.0)) + 0.5 + vec2(q.x, -q.y) * 0.49) / vec2(4.0, 3.0);
	return textureLod(uAtlas, uv, clamp(log2(64.0 / max(size * pxr, 1.0)), 0.0, 4.0)).r;
}
// the light of one badge at p (in its radii, y up), t seconds into its sequence; pw is how big its tier makes it
float fx(vec2 p, float t, float pw, float pxr) {
	float r = length(p), ang = atan(p.y, p.x), after = t - B, e = 0.0;
	float charge = smoothstep(0.05, B, t) * (1.0 - smoothstep(0.0, 0.15, after));
	if (charge > 0.0) {
		float c15 = pow(charge, 1.5);
		e += spr(VORTEX, rot(t * 5.0) * p / 2.3, 2.3, pxr) * 0.3 * charge;   // the vortex, turning faster as it charges
		// flame: the noise wrapped round the ring (3 times, so it meets itself) and flowing outward
		float u = ang / 6.2832 * 3.0, edge = r - 1.0;
		float n = nz(vec2(u, edge * 0.9 - t * 1.4)), n2 = nz(vec2(u * 2.0 + 0.37, edge * 1.7 - t * 2.3)), fl = n * n2 * 2.0;
		float flame = smoothstep(-0.08, 0.0, edge) * exp(-max(edge, 0.0) / (0.05 + 0.6 * charge * fl)) * (0.25 + fl);
		float rim = exp(-pow((r - 1.03) / 0.04, 2.0)) * (0.45 + n);
		e += (flame * 2.4 + rim * 1.1) * c15;
		for (int k = 0; k < 3; k++) {   // electricity: three crackles going round, flicking through the four frames
			float fk = float(k), a = fk * 2.094 + t * (1.4 + 0.5 * fk), tick = floor(t * 16.0 + fk * 5.0), frame = mod(tick + fk, 4.0);
			vec2 q = rot(-a + 1.5708 + tick * 1.7) * (p - vec2(cos(a), sin(a)) * 1.2) / 0.8;
			e += spr(ZAP + frame, q, 0.8, pxr) * 1.5 * c15 * step(0.3, h11(tick * 3.1 + fk));
		}
		for (int i = 0; i < 14; i++) {   // stars drawn in
			float s = float(i) + 100.0, a = h11(s) * 6.2832, ph = fract(t * 0.9 + h11(s + 1.3));
			vec2 q = rot(ph * 3.0) * (p - vec2(cos(a), sin(a)) * (2.6 - 1.5 * ph * ph)) / 0.16;
			e += spr(STAR, q, 0.16, pxr) * sin(ph * 3.1416) * charge;
		}
	}
	if (after > 0.0) {
		float flash = exp(-after * 6.0);   // the flash: a burst and a glowing star
		e += spr(BURST, rot(after * 1.2) * p / 2.7, 2.7, pxr) * 1.7 * flash;
		float gs = 1.7 + after * 2.0;
		e += spr(GLOW, rot(-after * 0.8) * p / gs, gs, pxr) * 1.3 * exp(-after * 4.0);
		// the shockwave, broken into arcs by the noise. The ring sprites are read across their band at a chosen width (the
		// sharp ring's band runs 0.55-0.72 of the sprite, the soft one's 0.58-0.9), so they stay thin as they grow.
		vec2 dir = p / max(r, 1e-4);
		float k = 1.0 - exp(-after * 3.0), rw = 1.0 + k * (1.6 + 0.9 * pw), w1 = 0.06 + 0.12 * k;
		float arcs = smoothstep(0.3, 0.7, nz(vec2(ang / 6.2832 * 2.0, 0.5 + after * 0.25)));
		e += spr(RING, dir * (0.55 + (r - rw) / w1 * 0.17), w1 / 0.17, pxr) * (0.1 + 1.3 * arcs) * 1.5 * exp(-after * 1.7);
		float rw2 = 1.0 + (1.0 - exp(-after * 5.0)) * (2.4 + pw), w2 = 0.18;   // and a softer, faster one
		e += spr(SOFTRING, dir * (0.58 + (r - rw2) / w2 * 0.32), w2 / 0.32, pxr) * 0.5 * exp(-after * 3.5);
		e += 0.35 * smoothstep(0.92, 1.05, r) * exp(-max(r - 1.0, 0.0) * 3.5) * exp(-after * 0.7);   // the glow it leaves
		for (int i = 0; i < 84; i++) {   // sparks: streaks along their flight; every fourth is a slow, twinkling ember
			float s = float(i);
			if (s >= 24.0 + 30.0 * pw) break;
			bool ember = mod(s, 4.0) < 0.5;
			float a = h11(s + 0.3) * 6.2832, spd = ember ? 0.15 + 0.4 * h11(s + 3.1) : 0.6 + 2.6 * h11(s + 3.1);
			float life = ember ? 2.0 + 1.5 * h11(s + 7.7) : 0.5 + 1.4 * h11(s + 7.7), rise = ember ? 0.12 : 0.35;
			float tt = after - 0.05 * h11(s + 9.2);
			if (tt < 0.0 || tt > life) continue;
			float f = tt / life, fade = 1.0 - f * f;
			vec2 v = vec2(cos(a), sin(a)), d = p - v * (1.0 + spd * (1.0 - exp(-tt * 3.0)) * 0.8) - vec2(0.0, rise * tt * tt);
			if (ember) {
				float sz = 0.13 * (1.0 - 0.5 * f);
				e += spr(h11(s + 5.0) < 0.5 ? STAR : STAR6, rot(tt * 2.0 + s) * d / sz, sz, pxr) * fade * (1.0 + 0.5 * sin(tt * 18.0 + s));
			} else {
				vec2 vel = normalize(v * spd * 2.4 * exp(-tt * 3.0) + vec2(0.0, 2.0 * rise * tt) + 1e-4);
				float w = 0.07 * (1.0 - f) + 0.02, len = w * (2.0 + 6.0 * exp(-tt * 3.0));   // longer while it is fast
				vec2 q = vec2(dot(d, vec2(vel.y, -vel.x)) / w, dot(d, vel) / len);
				e += spr(STREAK, q, len, pxr) * 2.6 * fade;
			}
		}
	}
	return e;
}
void main() {
	vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;   // CSS px from the canvas's top left
	vec3 col = vec3(0.0);
	for (int i = 0; i < ${FX_MAX}; i++) {
		if (i >= uN) break;
		vec2 p = (px - uC[i]) / uR[i];
		float lim = ${FX_REACH.toFixed(1)} / uR[i], r = length(p);
		if (uT[i] < 0.0 || r > lim) continue;
		float e = fx(vec2(p.x, -p.y), uT[i], uPow[i], uR[i] * uDpr) * smoothstep(lim, lim * 0.75, r);   // fades out before its reach ends
		col += uCol[i] * e + vec3(0.8) * smoothstep(1.2, 3.0, e);   // white-hot where it is brightest
	}
	col = min(col, vec3(1.0));
	o = vec4(col, max(col.r, max(col.g, col.b)));
}`;

/** Draws FX_FRAG for a list of badges: [{ el, color, power, at }] (at: when its sequence starts, in performance.now() ms). */
class Burst {
	constructor(canvas, badges) {
		this.canvas = canvas;
		this.badges = badges.slice(0, FX_MAX).map((b) => ({ ...b, rgb: [1, 3, 5].map((i) => parseInt(b.color.slice(i, i + 2), 16) / 255) }));
		const gl = this.gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
		this.ok = !!gl;
		if (!this.ok) return;
		const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
		const p = this.prog = gl.createProgram();
		gl.attachShader(p, sh(gl.VERTEX_SHADER, FX_VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FX_FRAG)); gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { this.ok = false; return; }
		this.u = Object.fromEntries(['uRes', 'uDpr', 'uN', 'uC', 'uR', 'uT', 'uPow', 'uCol', 'uAtlas', 'uNoise'].map((n) => [n, gl.getUniformLocation(p, n)]));
		// the textures, black until their images are decoded (they normally are by now: fxImages() runs when the plugin loads)
		const imgs = fxImages(), texture = (img, repeat) => {
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
		this.atlas = texture(imgs.atlas, false); this.noise = texture(imgs.noise, true);
		this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		const loc = gl.getAttribLocation(p, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
	}

	draw(now) {
		if (!this.ok) return;
		const gl = this.gl, c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
		if (w && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
		// badge centres relative to the canvas; both move together, and a badge's scale does not move its centre
		const cr = c.getBoundingClientRect(), n = this.badges.length, C = new Float32Array(FX_MAX * 2), R = new Float32Array(FX_MAX), T = new Float32Array(FX_MAX), P = new Float32Array(FX_MAX), K = new Float32Array(FX_MAX * 3);
		this.badges.forEach((b, i) => {
			const r = b.el.getBoundingClientRect();
			C[i * 2] = r.left + r.width / 2 - cr.left; C[i * 2 + 1] = r.top + r.height / 2 - cr.top;
			R[i] = b.el.offsetWidth / 2 || 26; T[i] = (now - b.at) / 1000; P[i] = b.power; K.set(b.rgb, i * 3);
		});
		gl.viewport(0, 0, c.width, c.height);
		gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.prog);
		gl.uniform2f(this.u.uRes, c.width, c.height); gl.uniform1f(this.u.uDpr, c.width / (c.clientWidth || 1)); gl.uniform1i(this.u.uN, n);
		gl.uniform2fv(this.u.uC, C); gl.uniform1fv(this.u.uR, R); gl.uniform1fv(this.u.uT, T); gl.uniform1fv(this.u.uPow, P); gl.uniform3fv(this.u.uCol, K);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.uniform1i(this.u.uAtlas, 0);
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.noise); gl.uniform1i(this.u.uNoise, 1);
		gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
	}

	destroy() { try { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* ignore */ } }
}

class Plugin extends AppPlugin {
	cleanup = [];
	toastT = [];
	native = {};   // Thymer's own sidebar rows the card takes over: search, jump, and the workspace row

	onLoad() {
		this.st = this.load();
		fxImages();   // decode the unlock effect's textures now, not when something unlocks
		this.lineWords = new Map();
		this.wordTimes = [];
		this.lastType = 0;
		if (localStorage.getItem(HIDE_KEY) !== '1') this.mountWidget();

		this.ui.addCommandPaletteCommand({ label: 'Achievements: open', icon: 'trophy', onSelected: () => this.openPanel() });
		this.ui.addCommandPaletteCommand({ label: 'Achievements: show or hide the mascot', icon: 'eye', onSelected: () => this.toggleWidget() });
		this.ui.addCommandPaletteCommand({ label: 'Achievements: replay the last unlock', icon: 'sparkles', onSelected: () => {
			const last = ACHIEVEMENTS.filter((a) => this.st.unlocked[a.id]).sort((a, b) => this.st.unlocked[b.id] - this.st.unlocked[a.id])[0];
			this.celebrate([last || ACHIEVEMENTS[0]]);
		} });

		const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.cleanup.push(() => target.removeEventListener(type, fn, opts)); };
		on(document, 'input', () => requestAnimationFrame(() => this.countLive()), true);
		on(document, 'keydown', () => { this.lastType = performance.now(); }, true);
		on(document, 'mousemove', (e) => { this.pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });

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
		cancelAnimationFrame(this.raf);
		this.cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
		this.cleanup = [];
		this.closePanel();
		this.unmountWidget();
		this.padStyle?.remove();
		this.endToast();
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
		if (fresh.length) { this.save(); this.celebrate(fresh); }
		this.refreshUi();
	}

	rings() { return ACHIEVEMENTS.reduce((n, a) => n + (this.st.unlocked[a.id] ? a.rings : 0), 0); }
	unlockedCount() { return ACHIEVEMENTS.filter((a) => this.st.unlocked[a.id]).length; }

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
		w.querySelector('.ach-por').addEventListener('click', () => this.openPanel());
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
			if (this.pointer && this.mascot) {   // it looks at the pointer
				const r = this.widget.querySelector('.ach-por').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.4;
				this.mascot.look.x = Math.max(-1, Math.min(1, (this.pointer.x - cx) / 420)); this.mascot.look.y = Math.max(-1, Math.min(1, (this.pointer.y - cy) / 320));
			}
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
		const sb = document.querySelector('.panels-grid-sidebar > .sidebar') || document.querySelector('.sidebar'), r = sb && sb.getBoundingClientRect();
		const ok = r && r.width > 20 && r.height > 100, mini = !!ok && r.width < 150;
		w.classList.toggle('ach-mini', mini);
		this.takeOver(r, ok && !mini);
		const row = this.native.tasks && this.native.tasks.isConnected ? this.native.tasks.getBoundingClientRect() : null;
		const width = mini ? 46 : row && row.width > 100 ? Math.round(row.width) : ok ? Math.max(150, Math.min(230, r.width - 20)) : 124;
		if (!mini && w.style.width !== width + 'px') w.style.width = width + 'px'; else if (mini) w.style.width = '';
		const left = ok ? (row && !mini ? Math.round(row.left) : r.left + 10) : 12, top = ok ? r.top + 8 : 46;
		if (w.style.left !== left + 'px') w.style.left = left + 'px';
		if (w.style.top !== top + 'px') w.style.top = top + 'px';
		const pad = ok ? Math.round(w.getBoundingClientRect().height + 14) : 0;
		if (pad !== this.pad) {
			this.pad = pad;
			if (!this.padStyle) { this.padStyle = document.createElement('style'); document.head.appendChild(this.padStyle); }
			this.padStyle.textContent = pad ? `.panels-grid-sidebar > .sidebar { padding-top: ${pad}px !important; box-sizing: border-box; }` : '';
		}
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
			w.querySelector('.ach-rg').textContent = `◎ ${fmt(this.rings())}`;
			const m = measures(this.st), next = ACHIEVEMENTS.filter((a) => !this.st.unlocked[a.id]).sort((a, b) => m[b.stat] / b.target - m[a.stat] / a.target)[0];
			w.querySelector('.ach-por').title = `Achievements ${got}/${total}` + (next ? ` - next: ${next.name}` : '');   // what it asks for stays secret until it unlocks
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

	/**
	 * New achievements: a notification at the top centre of the screen, on a black radial glow (no box) that fades in, drifts
	 * down and grows a little. Then each achievement opens, one row under the other, staggered: its badge charges up with the
	 * icon small and bursts (the Burst shader, in the tier's colour) as the icon springs open and the words bounce in. It stays a
	 * short while and leaves fading upward. Without WebGL, or with reduced motion, there is no shader and the rows open at once.
	 */
	celebrate(list) {
		this.endToast();
		const shown = list.slice(0, FX_MAX), more = list.length - shown.length;
		const t = this.toast = document.createElement('div');
		t.className = 'ach-toast';
		t.innerHTML = '<div class="ach-glow"></div><div class="ach-stack"><canvas class="ach-fx"></canvas></div>';
		const stack = t.querySelector('.ach-stack');
		const rows = shown.map((a) => {
			const row = document.createElement('div');
			row.className = 'ach-row';
			row.style.setProperty('--ach-fx', TIER_FX[tier(a)][0]);
			row.innerHTML = '<div class="ach-badge"><i></i></div><div class="ach-tx"><small></small><b></b><div class="ach-bd"></div><em></em></div>';
			row.querySelector('i').textContent = a.icon;
			row.querySelector('small').textContent = `Achievement unlocked · ${tier(a)}`;
			const words = a.name.split(' ');   // the name comes in word by word
			row.querySelector('b').append(...words.map((w, i) => { const s = document.createElement('span'); s.className = 'ach-w'; s.textContent = w; s.style.setProperty('--i', i + 1); return s; }));
			row.querySelector('.ach-bd').textContent = a.desc;
			row.querySelector('.ach-bd').style.setProperty('--i', words.length + 1);
			row.querySelector('em').style.setProperty('--i', words.length + 2);
			row.querySelector('em').textContent = '+0 rings';
			stack.appendChild(row);
			return { a, row };
		});
		if (more > 0) { const m = document.createElement('div'); m.className = 'ach-more'; m.textContent = `+${more} more`; stack.appendChild(m); rows[rows.length - 1].more = m; }
		document.body.appendChild(t);
		// The glow is a huge ellipse hanging from above the screen: only its bottom quarter shows, reaching a little below the
		// stack, about 80% of the window wide (wider for a tall stack, so it stays a shallow arc). Its soft edge is kept ~90px deep
		// whatever its size (--f, as a share of its radius), so the dark part covers all of the text.
		const glow = t.querySelector('.ach-glow'), shows = t.offsetTop + stack.offsetHeight + GLOW_BELOW, gh = shows * 4;
		glow.style.width = `${Math.round(Math.max(760, window.innerWidth * 0.82, gh * 1.15))}px`;
		glow.style.height = `${Math.round(gh)}px`;
		glow.style.bottom = `${-GLOW_BELOW}px`;
		glow.style.setProperty('--f', `${((90 / (gh / 2)) * 100).toFixed(2)}%`);
		t.getBoundingClientRect();   // its starting place, so that 'on' animates from it
		t.classList.add('on');

		const now = performance.now(), arrive = 380;   // the glow first, then the rows
		const still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		const fx = still ? null : new Burst(t.querySelector('canvas'), rows.map((r, i) => ({ el: r.row.querySelector('.ach-badge'), color: TIER_FX[tier(r.a)][0], power: TIER_FX[tier(r.a)][1], at: now + arrive + i * FX_STAGGER_MS })));
		const animated = !!(fx && fx.ok);
		if (animated) {
			this.toastFx = fx;
			const tick = (ts) => { if (this.toast !== t) return; this.toastRaf = requestAnimationFrame(tick); fx.draw(ts); };
			this.toastRaf = requestAnimationFrame(tick);
		} else { fx?.destroy(); t.querySelector('canvas').remove(); }

		const count = (em, total, t1) => (ts) => { if (this.toast !== t) return; const f = Math.min(1, (ts - t1) / 650); em.textContent = `+${fmt(total * ease(f))} rings`; if (f < 1) requestAnimationFrame(count(em, total, t1)); };
		const at = (ms, fn) => this.toastT.push(setTimeout(fn, ms));
		let last = 0;
		rows.forEach(({ a, row, more: m }, i) => {
			const open = arrive + i * FX_STAGGER_MS, lit = open + (animated ? BURST_MS : 0);
			last = lit;
			at(open, () => row.classList.add('in'));
			at(lit, () => {
				row.classList.add('lit'); m?.classList.add('lit');
				if (i === 0) this.mascot?.celebrate(performance.now());
				requestAnimationFrame(count(row.querySelector('em'), a.rings, performance.now()));
			});
		});
		const stay = 2600 + Math.min(4, rows.length - 1) * 350;   // a little longer when there is more to read
		at(last + stay, () => t.classList.add('out'));
		at(last + stay + 600, () => this.endToast());
	}

	endToast() {
		this.toastT.forEach(clearTimeout); this.toastT = [];
		cancelAnimationFrame(this.toastRaf);
		this.toastFx?.destroy(); this.toastFx = null;
		this.toast?.remove(); this.toast = null;
	}

	// ---- The list ----------------------------------------------------------------------------------------------------------

	openPanel() {
		this.closePanel();
		const cs = getComputedStyle(document.body);
		const ov = document.createElement('div');
		ov.className = 'ach-ov';
		ov.innerHTML = '<div class="ach-box"><div-scrollable class="ach-scroll force-active-scrollbar" style="overflow-y: scroll; height: 100%"><div class="ach-in"><div class="ach-head"><div class="ach-por"><canvas></canvas></div><div><div class="ach-title">Achievements</div><div class="ach-sub"></div></div><button class="ach-x" aria-label="Close">✕</button></div><div class="ach-pbar"><i></i></div><div class="ach-grid"></div></div></div-scrollable></div>';
		const box = ov.querySelector('.ach-box');
		box.style.color = cs.color;
		box.style.background = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'Canvas';
		ov.addEventListener('mousedown', (e) => { if (e.target === ov) this.closePanel(); });
		ov.querySelector('.ach-x').onclick = () => this.closePanel();
		this.panelKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.closePanel(); } };
		document.addEventListener('keydown', this.panelKey, true);
		document.body.appendChild(ov);
		this.panel = ov;
		this.panelMascot = new Mascot(ov.querySelector('canvas'));
		if (!this.widget) { this.loopPanel(); }
		this.st.opens++;
		this.changed();   // which draws the list
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
		const m = measures(this.st), got = this.unlockedCount();
		p.querySelector('.ach-sub').innerHTML = `${got} of ${ACHIEVEMENTS.length} unlocked · <span>◎ ${fmt(this.rings())} rings</span> · ${fmt(this.st.words)} words`;
		p.querySelector('.ach-pbar i').style.width = `${(got / ACHIEVEMENTS.length) * 100}%`;
		const grid = p.querySelector('.ach-grid');
		grid.textContent = '';
		const order = [...ACHIEVEMENTS].sort((a, b) => (this.st.unlocked[b.id] ? 1 : 0) - (this.st.unlocked[a.id] ? 1 : 0) || Math.min(1, m[b.stat] / b.target) - Math.min(1, m[a.stat] / a.target));
		for (const a of order) {
			const on = !!this.st.unlocked[a.id], pr = Math.min(1, m[a.stat] / a.target);
			const c = document.createElement('div');
			c.className = 'ach-card2 ' + (on ? 'got' : 'lock');
			c.dataset.tier = tier(a).toLowerCase();
			c.innerHTML = '<div class="ach-ic"></div><div style="flex:1;min-width:0"><div class="ach-cn"></div><div class="ach-ds"></div><div class="ach-rw"></div><div class="ach-pr"><i></i></div></div>';
			c.querySelector('.ach-ic').textContent = a.icon;
			c.querySelector('.ach-cn').textContent = a.name;
			c.querySelector('.ach-ds').textContent = on ? a.desc : '???';   // locked ones keep their task and target secret, so they are found rather than speedrun
			c.querySelector('.ach-rw').innerHTML = '<span></span><b class="ach-tier"></b>';
			c.querySelector('.ach-rw span').textContent = on ? `◎ +${a.rings} · ${new Date(this.st.unlocked[a.id]).toLocaleDateString()}` : `◎ +${a.rings}`;
			c.querySelector('.ach-tier').textContent = tier(a);
			c.querySelector('.ach-pr i').style.width = `${pr * 100}%`;
			grid.appendChild(c);
		}
	}
}
