/**
 * Achievements
 *
 * Trophies for writing, and a character card in the top-left corner: a window onto the mascot's head, looking out at you (it
 * follows the pointer, nods while you type, and spins with a banner when something unlocks), with its name, level, an
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
	{ id: 'w100', name: 'Ring Collector', desc: 'Write 100 words', stat: 'words', target: 100, rings: 10, icon: '💍' },
	{ id: 'w500', name: 'Gold Rush', desc: 'Write 500 words', stat: 'words', target: 500, rings: 20, icon: '🥇' },
	{ id: 'w1000', name: 'Ring Master', desc: 'Write 1,000 words', stat: 'words', target: 1000, rings: 40, icon: '🏅' },
	{ id: 'w5000', name: 'Rings Everywhere', desc: 'Write 5,000 words', stat: 'words', target: 5000, rings: 80, icon: '🌟' },
	{ id: 'w10000', name: 'Super Rings', desc: 'Write 10,000 words', stat: 'words', target: 10000, rings: 150, icon: '👑' },
	{ id: 'd250', name: 'Spin Dash', desc: 'Write 250 words in one day', stat: 'bestDay', target: 250, rings: 15, icon: '🌀' },
	{ id: 'd1000', name: 'Boost', desc: 'Write 1,000 words in one day', stat: 'bestDay', target: 1000, rings: 50, icon: '🚀' },
	{ id: 'd2500', name: 'Super Form', desc: 'Write 2,500 words in one day', stat: 'bestDay', target: 2500, rings: 120, icon: '✨' },
	{ id: 'p25', name: 'Fast Enough', desc: '25 words in a minute', stat: 'peak', target: 25, rings: 10, icon: '👟' },
	{ id: 'p40', name: 'Gotta Go Fast', desc: '40 words in a minute', stat: 'peak', target: 40, rings: 30, icon: '⚡' },
	{ id: 'p60', name: 'Faster Than Sound', desc: '60 words in a minute', stat: 'peak', target: 60, rings: 80, icon: '💨' },
	{ id: 's3', name: 'First Emerald', desc: 'Write 3 days in a row', stat: 'bestStreak', target: 3, rings: 15, icon: '💚' },
	{ id: 's7', name: 'Seven Emeralds', desc: 'Write 7 days in a row', stat: 'bestStreak', target: 7, rings: 50, icon: '💎' },
	{ id: 's14', name: 'Master Emerald', desc: 'Write 14 days in a row', stat: 'bestStreak', target: 14, rings: 100, icon: '🔷' },
	{ id: 's30', name: 'Chaos Control', desc: 'Write 30 days in a row', stat: 'bestStreak', target: 30, rings: 250, icon: '🌌' },
	{ id: 't1', name: 'Checkpoint', desc: 'Finish a task', stat: 'tasks', target: 1, rings: 5, icon: '🚩' },
	{ id: 't10', name: 'Zone Clear', desc: 'Finish 10 tasks', stat: 'tasks', target: 10, rings: 20, icon: '✅' },
	{ id: 't50', name: 'Act Complete', desc: 'Finish 50 tasks', stat: 'tasks', target: 50, rings: 60, icon: '🏁' },
	{ id: 't100', name: 'Time Attack', desc: 'Finish 100 tasks', stat: 'tasks', target: 100, rings: 120, icon: '⏱️' },
	{ id: 'night', name: 'Night Owl', desc: 'Write 100 words between 22:00 and 04:00', stat: 'night', target: 100, rings: 25, icon: '🌙' },
	{ id: 'early', name: 'Early Bird', desc: 'Write 100 words between 04:00 and 08:00', stat: 'early', target: 100, rings: 25, icon: '🌅' },
	{ id: 'a10', name: 'Green Hill', desc: 'Write on 10 different days', stat: 'daysActive', target: 10, rings: 30, icon: '🌿' },
	{ id: 'a30', name: 'Chemical Plant', desc: 'Write on 30 different days', stat: 'daysActive', target: 30, rings: 90, icon: '🧪' },
	{ id: 'a100', name: 'Final Egg', desc: 'Write on 100 different days', stat: 'daysActive', target: 100, rings: 300, icon: '🥚' },
];

// ---- Small helpers -------------------------------------------------------------------------------------------------------
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ease = (t) => 1 - Math.pow(1 - t, 3);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function freshState() { return { words: 0, tasks: 0, lines: 0, peak: 0, night: 0, early: 0, days: {}, unlocked: {}, doneGuids: [] }; }

/** The measures the list is checked against, from the saved state. Pure (apart from today's date). */
function measures(st) {
	const keys = Object.keys(st.days).filter((k) => st.days[k] >= STREAK_MIN_WORDS).sort();
	let best = 0, run = 0, prev = null;
	for (const k of keys) {
		const d = new Date(k + 'T00:00:00');
		run = prev && Math.round((d - prev) / 86400000) === 1 ? run + 1 : 1;
		best = Math.max(best, run); prev = d;
	}
	return { words: st.words, tasks: st.tasks, peak: st.peak, night: st.night, early: st.early, bestDay: Math.max(0, ...Object.values(st.days)), daysActive: Object.keys(st.days).filter((k) => st.days[k] > 0).length, bestStreak: best };
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

// ---- Styles --------------------------------------------------------------------------------------------------------------
const CSS = `
.ach-card { position: fixed; left: 12px; top: 46px; z-index: 600; width: 124px; font: 12px/1.3 system-ui, sans-serif; color: var(--side-fg-color, #e6e8ee); user-select: none; --ach-r: var(--radius-normal, 8px); }
.ach-por { position: relative; height: 118px; border-radius: calc(var(--ach-r) + 2px); overflow: hidden; cursor: pointer; background: radial-gradient(120% 95% at 50% 10%, #3f7bff 0%, #1d3ea8 58%, #0c1a52 100%); isolation: isolate; }
.ach-por::before { content: ''; position: absolute; inset: 0; z-index: 0; background: repeating-linear-gradient(115deg, rgba(255,255,255,.06) 0 6px, transparent 6px 14px); }
.ach-por canvas { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; transition: transform .2s; transform-origin: 50% 60%; }
.ach-por:hover canvas { transform: scale(1.04); }
.ach-por::after { content: ''; position: absolute; inset: 0; z-index: 3; border-radius: inherit; pointer-events: none; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.55), inset 0 -26px 24px -14px rgba(4,10,40,.5); }
.ach-rg { position: absolute; z-index: 4; padding: 2px 7px; border-radius: 99px; background: rgba(10,16,48,.72); font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ach-rg { right: 8px; bottom: 8px; color: #ffd64a; }
.ach-mini { width: 46px; } .ach-mini .ach-por { height: 46px; } .ach-mini .ach-nm, .ach-mini .ach-btns, .ach-mini .ach-rg { display: none; }
.ach-nm { margin-top: 4px; }
.ach-slot { height: 30px; }
.ach-hosted { transform: none !important; position: fixed !important; z-index: 601 !important; margin: 0 !important; box-sizing: border-box !important; height: 30px !important; }
[data-ach-hide] { display: none !important; }
.ach-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-top: 4px; }
.ach-btn { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 8px; border-radius: var(--ach-r); cursor: pointer; color: var(--side-fg-color, inherit); }
.ach-btn:hover { background: var(--sidebar-bg-hover, rgba(127,127,127,.18)); color: var(--sidebar-fg-hover, inherit); } .ach-btn:active { background: var(--side-bg-focus, rgba(127,127,127,.28)); transform: scale(.98); } .ach-btn:focus-visible { outline: 2px solid var(--sidebar-heading, #8fb4ff); outline-offset: -2px; }
.ach-btn svg { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: .85; } .ach-btn span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ach-pop { position: fixed; z-index: 9000; width: 320px; max-height: 420px; display: grid; grid-template-rows: auto minmax(0, 1fr); border-radius: 14px; border: 1px solid rgba(127,127,127,.3); box-shadow: 0 18px 50px rgba(0,0,0,.5); overflow: hidden; font: 13px/1.35 system-ui, sans-serif; animation: ach-pop .14s ease-out; }
@keyframes ach-pop { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
.ach-pop input { all: unset; box-sizing: border-box; padding: 11px 14px; border-bottom: 1px solid rgba(127,127,127,.25); font-size: 14px; }
.ach-res { padding: 4px; margin: 0 -16px -16px 0; } .ach-lab { padding: 6px 10px 3px; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; opacity: .5; }
.ach-it { display: block; width: 100%; box-sizing: border-box; padding: 6px 10px; border-radius: 8px; cursor: pointer; } .ach-it.on, .ach-it:hover { background: rgba(80,130,255,.22); }
.ach-it span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .ach-it small { display: block; opacity: .55; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ach-empty { padding: 14px; opacity: .55; text-align: center; }
/* Lists scroll in Thymer's own <div-scrollable>, as its dialogs do, so the scrollbar is Thymer's. It needs a definite height:
   its box is a grid whose row is capped by the box's max-height. It pads its content 20px right and bottom. */
.ach-scroll { display: block; min-height: 0; }
.ach-banner { position: fixed; left: 148px; top: 58px; z-index: 600; display: flex; align-items: center; gap: 10px; max-width: 280px; padding: 9px 14px 9px 10px; border-radius: 14px; background: linear-gradient(135deg, #1b3a8c, #0f1f55); color: #fff; box-shadow: 0 8px 28px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.18); font: 12px/1.35 system-ui, sans-serif; transform: translateX(-24px); opacity: 0; transition: transform .35s cubic-bezier(.2,1.2,.4,1), opacity .25s; pointer-events: none; }
.ach-banner.on { transform: none; opacity: 1; }
.ach-banner i { font-style: normal; font-size: 26px; } .ach-banner small { display: block; opacity: .7; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; } .ach-banner b { font-size: 13px; } .ach-banner em { font-style: normal; color: #ffd64a; }
.ach-ov { position: fixed; inset: 0; z-index: 9990; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.45); backdrop-filter: blur(3px); animation: ach-in .15s ease-out; }
@keyframes ach-in { from { opacity: 0; } to { opacity: 1; } }
.ach-box { width: min(760px, 94vw); max-height: 88vh; display: grid; grid-template-rows: minmax(0, 1fr); overflow: hidden; border-radius: 18px; border: 1px solid rgba(127,127,127,.28); box-shadow: 0 28px 80px rgba(0,0,0,.5); font: 13px/1.4 system-ui, sans-serif; }
.ach-in { padding: 20px 0 0 20px; }
.ach-head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; } .ach-head .ach-por { width: 84px; height: 84px; flex: none; border-radius: 16px; cursor: default; } .ach-head .ach-por canvas { transition: none; }
.ach-title { font-size: 18px; font-weight: 700; } .ach-sub { opacity: .65; margin-top: 2px; } .ach-sub span { color: #e0a800; font-weight: 600; }
.ach-x { all: unset; margin-left: auto; cursor: pointer; opacity: .55; padding: 4px 8px; border-radius: 8px; } .ach-x:hover { opacity: 1; background: rgba(127,127,127,.18); }
.ach-pbar { height: 6px; border-radius: 3px; background: rgba(127,127,127,.25); overflow: hidden; margin-bottom: 14px; } .ach-pbar i { display: block; height: 100%; background: linear-gradient(90deg, #2a63ff, #5ee1ff); }
.ach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.ach-card2 { display: flex; gap: 10px; padding: 10px; border-radius: 12px; border: 1px solid rgba(127,127,127,.22); background: rgba(127,127,127,.07); }
.ach-card2.lock .ach-ic { filter: grayscale(1); opacity: .35; } .ach-card2.got { border-color: rgba(255,200,40,.55); background: rgba(255,200,40,.09); }
.ach-ic { font-size: 28px; line-height: 1; flex: none; width: 34px; text-align: center; } .ach-cn { font-weight: 650; } .ach-ds { opacity: .65; font-size: 12px; } .ach-rw { color: #e0a800; font-size: 11px; margin-top: 3px; }
.ach-pr { height: 4px; border-radius: 2px; background: rgba(127,127,127,.25); margin-top: 6px; overflow: hidden; } .ach-pr i { display: block; height: 100%; background: #4f8cff; } .ach-card2.got .ach-pr i { background: #e0a800; }
`;

class Plugin extends AppPlugin {
	cleanup = [];
	toastT = 0;
	native = {};   // Thymer's own sidebar rows the card takes over: search, jump, and the workspace row

	onLoad() {
		this.st = this.load();
		this.lineWords = new Map();
		this.wordTimes = [];
		this.lastType = 0;
		this.mountStyle();
		if (localStorage.getItem(HIDE_KEY) !== '1') this.mountWidget();

		this.ui.addCommandPaletteCommand({ label: 'Achievements: open', icon: 'trophy', onSelected: () => this.openPanel() });
		this.ui.addCommandPaletteCommand({ label: 'Achievements: show or hide the mascot', icon: 'eye', onSelected: () => this.toggleWidget() });

		const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.cleanup.push(() => target.removeEventListener(type, fn, opts)); };
		on(document, 'input', () => requestAnimationFrame(() => this.countLive()), true);
		on(document, 'keydown', () => { this.lastType = performance.now(); }, true);
		on(document, 'mousemove', (e) => { this.pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });

		// Words are also counted as they are typed; the saved-line events below add what the typing missed (a paste, another device).
		const track = (ev, isCreate) => {
			if (!ev.source.isLocal) return;
			let changed = false;
			if (isCreate) { this.st.lines++; changed = true; }
			if (ev.status === 'done' && !this.st.doneGuids.includes(ev.lineItemGuid)) { this.st.doneGuids.push(ev.lineItemGuid); if (this.st.doneGuids.length > 3000) this.st.doneGuids.shift(); this.st.tasks++; changed = true; }
			const segs = ev.getSegments();
			if (segs) {
				const now = segs.reduce((n, s) => n + (s && typeof s.text === 'string' ? s.text.trim().split(/\s+/).filter(Boolean).length : 0), 0);
				const known = this.lineWords.has(ev.lineItemGuid), prev = known ? this.lineWords.get(ev.lineItemGuid) : (isCreate ? 0 : now);
				this.lineWords.set(ev.lineItemGuid, now);
				if (now > prev) { this.addWords(now - prev); changed = true; }
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
		this.styleEl?.remove();
		this.padStyle?.remove();
		this.banner?.remove();
	}

	// ---- State -------------------------------------------------------------------------------------------------------------

	load() {
		try { return { ...freshState(), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch (e) { return freshState(); }
	}

	save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.st)); } catch (e) { /* keep in memory */ } }

	/** `n` more words, written now. */
	addWords(n) {
		const st = this.st, now = new Date(), h = now.getHours(), t = now.getTime();
		st.words += n; st.days[dayKey(now)] = (st.days[dayKey(now)] || 0) + n;
		if (h >= 22 || h < 4) st.night += n; else if (h >= 4 && h < 8) st.early += n;
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
			if (now > prev) { this.addWords(now - prev); this.changed(); }
		} catch (e) { /* the saved-line events still count */ }
	}

	/** Something moved: save, check the list, refresh what is shown. */
	changed() {
		const m = measures(this.st), fresh = [];
		for (const a of ACHIEVEMENTS) if (!this.st.unlocked[a.id] && m[a.stat] >= a.target) { this.st.unlocked[a.id] = Date.now(); fresh.push(a); }
		clearTimeout(this.saveT);
		this.saveT = setTimeout(() => this.save(), 600);
		if (fresh.length) { this.save(); this.celebrate(fresh); }
		this.refreshUi();
	}

	rings() { return ACHIEVEMENTS.reduce((n, a) => n + (this.st.unlocked[a.id] ? a.rings : 0), 0); }
	unlockedCount() { return ACHIEVEMENTS.filter((a) => this.st.unlocked[a.id]).length; }

	// ---- The mascot and the banner ---------------------------------------------------------------------------------------

	mountStyle() { this.styleEl = document.createElement('style'); this.styleEl.textContent = CSS; document.head.appendChild(this.styleEl); }

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
		if (this.banner) this.banner.style.left = `${w.getBoundingClientRect().right + 12}px`;
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

	/** New achievements: the head spins and a banner says what for. */
	celebrate(list) {
		this.mascot?.celebrate(performance.now());
		const a = list[0], extra = list.length > 1 ? ` (+${list.length - 1} more)` : '';
		this.banner?.remove();
		const b = this.banner = document.createElement('div');
		b.className = 'ach-banner';
		b.innerHTML = `<i>${a.icon}</i><div><small>Achievement unlocked</small><b></b><div class="ach-bd"></div><em></em></div>`;
		b.querySelector('b').textContent = a.name + extra; b.querySelector('.ach-bd').textContent = a.desc; b.querySelector('em').textContent = `+${list.reduce((n, x) => n + x.rings, 0)} rings`;
		document.body.appendChild(b);
		requestAnimationFrame(() => b.classList.add('on'));
		clearTimeout(this.toastT);
		this.toastT = setTimeout(() => { b.classList.remove('on'); setTimeout(() => b.remove(), 400); }, 4500);
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
		this.renderPanel();
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
			c.innerHTML = '<div class="ach-ic"></div><div style="flex:1;min-width:0"><div class="ach-cn"></div><div class="ach-ds"></div><div class="ach-rw"></div><div class="ach-pr"><i></i></div></div>';
			c.querySelector('.ach-ic').textContent = a.icon;
			c.querySelector('.ach-cn').textContent = a.name;
			c.querySelector('.ach-ds').textContent = on ? a.desc : '???';   // locked ones keep their task and target secret, so they are found rather than speedrun
			c.querySelector('.ach-rw').textContent = on ? `◎ +${a.rings} · ${new Date(this.st.unlocked[a.id]).toLocaleDateString()}` : `◎ +${a.rings}`;
			c.querySelector('.ach-pr i').style.width = `${pr * 100}%`;
			grid.appendChild(c);
		}
	}
}
