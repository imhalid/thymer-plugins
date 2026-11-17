/**
 * Mascot
 *
 * A character card in the top-left corner: a window onto the mascot's head, looking out at you (it follows the pointer with its
 * head, nods while you type, dozes off when you leave it alone, and salutes when Thymer opens and when you click it), with Thymer's workspace row as
 * its name plate and two buttons below - search and jump to. The head is a low-poly model drawn with plain WebGL (no libraries,
 * no network); everything else is HTML and CSS.
 *
 * The model is baked into this file at build time (see build.mjs); it is not part of the source in the repository.
 * Whether the card is shown is kept per device in localStorage ("achievements:hidden", the key from when this was Achievements).
 */

const KNIGHT = __KNIGHT__;   // the mascot: parts, textures and framing, baked by build.mjs from knight.json

const HIDE_KEY = 'achievements:hidden';

// ---- Small helpers -------------------------------------------------------------------------------------------------------
/**
 * Thymer on a phone or tablet: the plugin stays off there (the card, the WebGL and the listeners are too much for it). Thymer
 * marks the device on <html data-device="mobile|desktop">; without that, the user agent decides.
 */
const onMobile = () => {
	const d = document.documentElement.dataset.device;
	return d ? d === 'mobile' : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
};
/** Thymer's focus mode (body.focusmode): the card stays out of sight then. */
const inFocusMode = () => document.body.classList.contains('focusmode');
const SLEEP_AFTER_MS = 3 * 60 * 1000;   // no key or pointer for this long: the knight dozes off
const ease = (t) => 1 - Math.pow(1 - t, 3);

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

const SALUTE_MS = 1700;   // a click: the knight snaps a salute, holds it, and lowers its hand
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

class Mascot {
	constructor(canvas, head = true) {
		this.canvas = canvas; this.head = head; this.look = { x: 0, y: 0 }; this.lx = 0; this.ly = 0; this.nod = 0;
		this.gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
		this.ok = !!this.gl;
		this.t0 = performance.now(); this.hop = null; this.speed = 0; this.sl = 0; this.sleepTo = 0; this.hover = false; this.zoom = 1; this.size = 1; this.lift = 0;   // size and lift: drawn smaller, and higher, in a card
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

	/** The knight salutes. */
	celebrate(now) { this.hop = { t0: now, ms: SALUTE_MS }; }

	/** Draws one frame at `now`; `speed` (0..1) is how busy the typing is (the head nods), `glow` lights it up. `sleepTo` (0..1): dozing. */
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
		const model = mat.mul(mat.trans(0, y + this.lift, 0), mat.mul(rot, mat.mul(mat.scale(this.fit * this.zoom * this.size), mat.trans(-this.center[0], -this.center[1], -this.center[2]))));
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

class Plugin extends AppPlugin {
	cleanup = [];
	native = {};   // Thymer's own sidebar rows the card takes over: search, jump, and the workspace row

	onLoad() {
		if (onMobile()) { this.off = true; return; }
		this.lastType = 0;
		if (localStorage.getItem(HIDE_KEY) !== '1') this.mountWidget();
		this.ui.addCommandPaletteCommand({ label: 'Mascot: show or hide', icon: 'eye', onSelected: () => this.toggleWidget() });

		const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.cleanup.push(() => target.removeEventListener(type, fn, opts)); };
		this.lastActive = performance.now();
		on(document, 'keydown', () => { this.lastType = this.lastActive = performance.now(); }, true);
		on(document, 'mousemove', (e) => { this.pointer = { x: e.clientX, y: e.clientY }; this.lastActive = performance.now(); }, { passive: true });
		// Into or out of focus mode: the card goes or comes back now, not at the next frame.
		let focus = inFocusMode();
		const watch = new MutationObserver(() => { if (inFocusMode() !== focus) { focus = !focus; this.layout(); } });
		watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		this.cleanup.push(() => watch.disconnect());
	}

	onUnload() {
		if (this.off) return;
		cancelAnimationFrame(this.raf);
		this.cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
		this.cleanup = [];
		this.unmountWidget();
		this.padStyle?.remove();
	}

	// ---- The card ----------------------------------------------------------------------------------------------------------

	mountWidget() {
		if (this.widget) return;
		const ICONS = {
			search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
			jump: '<svg viewBox="0 0 24 24"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>',
		};
		const w = document.createElement('div');
		w.className = 'ach-card';
		w.innerHTML = `<div class="ach-por"><canvas></canvas></div>
			<div class="ach-nm"><div class="ach-slot"></div></div>
			<div class="ach-btns">
				<button class="ach-btn" data-a="search" title="Search everything">${ICONS.search}<span>Search</span></button>
				<button class="ach-btn" data-a="jump" title="Jump to a page">${ICONS.jump}<span>Jump to</span></button></div>`;
		w.querySelector('.ach-por').addEventListener('click', () => { this.lastActive = performance.now(); this.mascot?.celebrate(performance.now()); });   // a click: it salutes
		for (const [ev, on] of [['pointerenter', true], ['pointerleave', false]]) w.querySelector('.ach-por').addEventListener(ev, () => { if (this.mascot) this.mascot.hover = on; });
		w.querySelector('[data-a="search"]').onclick = () => { const n = this.native.search; if (n && n.isConnected) n.click(); else this.openSearch(); };
		w.querySelector('[data-a="jump"]').onclick = () => { const n = this.native.jump; if (n && n.isConnected) n.click(); else this.openJump(); };
		document.body.appendChild(w);
		this.widget = w;
		this.mascot = new Mascot(w.querySelector('canvas'));
		if (!this.mascot.ok) w.querySelector('canvas').style.display = 'none';
		// it greets you when Thymer opens (or the card is shown again): a salute once the model's textures have had a moment to load
		this.helloT = setTimeout(() => { if (this.mascot && !inFocusMode()) this.mascot.celebrate(performance.now()); }, 900);
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
			this.mascot.draw(now, typing * 0.6);
		};
		this.raf = requestAnimationFrame(loop);
	}

	unmountWidget() {
		cancelAnimationFrame(this.raf);
		clearTimeout(this.helloT);
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
}
