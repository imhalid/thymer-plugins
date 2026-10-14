/**
 * Caret FX
 *
 * Animated caret effects while you type: glow pulse, neovide-style hop, a blaze
 * trail when the caret moves, and a lightning bolt on long jumps.
 * Inspired by the Ghostty cursor_blaze / cursor_lightning shaders.
 *
 * Settings live in this plugin's config under "custom" (Edit Code > Configuration), or use
 * the command palette: "Caret FX: ...".
 */

const DEFAULTS = {
	color: '#ffb929',       // main caret / glow color
	accent: '#ff3b1f',      // trail edge + lightning glow color
	glow: true,
	bounce: true,
	trail: true,
	lightning: true,
	intensity: 1,           // 0.3 (subtle) .. 2 (strong)
	trailMinWidths: 1.5,    // trail appears when caret moves farther than this many caret-heights
	lightningMinLines: 3,   // lightning appears when caret jumps at least this many lines
};

const PRESETS = [
	['Amber', '#ffb929', '#ff3b1f'],
	['Ice', '#9be7ff', '#2b7bff'],
	['Violet', '#d6a6ff', '#7a2bff'],
	['Mint', '#9dffcf', '#08b36b'],
	['Rose', '#ffb3c7', '#ff2d6f'],
	['Lightning', '#ffd1b8', '#bd0000'],
];

const hash = (p) => { p = (p * 0.1031) % 1; p *= p + 33.33; p *= p + p; return p - Math.floor(p); };

const rgba = (hex, a) => {
	let h = String(hex || '').replace('#', '');
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	const n = parseInt(h, 16);
	if (!/^[0-9a-f]{6}$/i.test(h)) return `rgba(255,185,41,${a})`;
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

class Plugin extends AppPlugin {
	cfg = { ...DEFAULTS };
	canvas = null;
	ctx = null;
	fx = [];            // active effects
	last = null;        // last caret rect {x,y,w,h}
	raf = 0;
	preset = 0;
	cleanup = [];

	onLoad() {
		this.readConfig();
		this.mountCanvas();

		this.n = { input: 0, key: 0, sel: 0, sample: 0 };
		this.why = '-';
		const onInput = () => { this.n.input++; requestAnimationFrame(() => this.sample(true)); };
		const onKey = (e) => {
			this.n.key++;
			this.lastKey = performance.now();
			if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') setTimeout(() => this.sample(true), 0);
		};
		const onSel = () => { this.n.sel++; this.sample(false); };
		const onResize = () => this.resize();
		document.addEventListener('input', onInput, true);
		document.addEventListener('keydown', onKey, true);
		const onNav = () => requestAnimationFrame(() => this.sample(false));
		document.addEventListener('keyup', onNav, true);
		document.addEventListener('click', onNav, true);
		document.addEventListener('selectionchange', onSel);
		window.addEventListener('resize', onResize);
		this.cleanup.push(
			() => document.removeEventListener('input', onInput, true),
			() => document.removeEventListener('keydown', onKey, true),
			() => document.removeEventListener('keyup', onNav, true),
			() => document.removeEventListener('click', onNav, true),
			() => document.removeEventListener('selectionchange', onSel),
			() => window.removeEventListener('resize', onResize),
		);

		// The custom caret moves via DOM/style changes rather than selection events.
		let pending = false;
		const mo = new MutationObserver((recs) => {
			if (pending) return;
			// Ignore our own hidden measuring element, otherwise measuring would retrigger itself.
			if (this.mirror && recs.every((r) => r.target === this.mirror || this.mirror.contains(r.target))) return;
			pending = true;
			requestAnimationFrame(() => { pending = false; this.sample(performance.now() - (this.lastKey || 0) < 160); });
		});
		mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style', 'class'], childList: true, characterData: true });
		this.cleanup.push(() => mo.disconnect());

		this.ui.addCommandPaletteCommand({
			label: 'Caret FX: test effects', icon: 'ti-bolt',
			onSelected: () => {
				const w = window.innerWidth, h = window.innerHeight;
				const a = { x: w * 0.3, y: h * 0.3, w: 2, h: 20 }, b = { x: w * 0.6, y: h * 0.6, w: 2, h: 20 };
				const t = performance.now();
				this.fx.push({ kind: 'glow', t0: t, dur: 600, rect: b }, { kind: 'hop', t0: t, dur: 400, rect: b },
					{ kind: 'trail', t0: t, dur: 600, from: a, to: b }, { kind: 'bolt', t0: t, dur: 400, from: a, to: b, seed: 1.7 });
				this.kick();
			},
		});
		this.ui.addCommandPaletteCommand({
			label: 'Caret FX: debug info', icon: 'ti-bug',
			onSelected: () => this.ui.addToaster({ title: 'Caret FX debug', message: `events ${JSON.stringify(this.n)} · caret: ${this.why} · canvas ${this.canvas?.isConnected ? 'mounted' : 'MISSING'} ${window.innerWidth}x${window.innerHeight}`, dismissible: true, autoDestroyTime: 12000 }),
		});
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: set color…', icon: 'ti-palette', onSelected: () => this.askColor() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: next color preset', icon: 'ti-color-swatch', onSelected: () => this.nextPreset() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: set intensity…', icon: 'ti-adjustments', onSelected: () => this.askIntensity() });
		for (const [key, label] of [['glow', 'glow'], ['bounce', 'bounce'], ['trail', 'trail'], ['lightning', 'lightning']]) {
			this.ui.addCommandPaletteCommand({ label: `Caret FX: toggle ${label}`, icon: 'ti-toggle-right', onSelected: () => this.update({ [key]: !this.cfg[key] }) });
		}

		this.ui.addToaster({ title: 'Caret FX loaded', message: 'Run "Caret FX: test effects" from the command palette', dismissible: true, autoDestroyTime: 5000 });

		// Picks up edits made in the plugin's configuration JSON.
		this.events.on('global-plugin.updated', () => this.readConfig());
	}

	onUnload() {
		cancelAnimationFrame(this.raf);
		this.cleanup.forEach((f) => f());
		this.canvas?.remove();
		this.mirror?.remove();
	}

	// ---- settings ----------------------------------------------------------------------

	readConfig() {
		try {
			const custom = this.getConfiguration()?.custom || {};
			this.cfg = { ...DEFAULTS, ...custom };
		} catch (e) { this.cfg = { ...DEFAULTS }; }
	}

	update(patch) {
		this.cfg = { ...this.cfg, ...patch };
		try {
			const conf = this.getConfiguration();
			conf.custom = { ...(conf.custom || {}), ...patch };
			this.saveConfiguration(conf);
		} catch (e) { /* keep in-memory value */ }
		// Show the new look right away at the current caret.
		if (this.last) this.addPulse(this.last);
	}

	askColor() {
		const v = window.prompt('Caret color (hex, e.g. #ff66aa). Accent color follows if you add a second one: "#ffb929 #ff3b1f"', `${this.cfg.color} ${this.cfg.accent}`);
		if (!v) return;
		const [c, a] = v.trim().split(/[\s,]+/);
		const ok = (s) => /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s || '');
		const fix = (s) => (s.startsWith('#') ? s : '#' + s);
		if (!ok(c)) return this.ui.addToaster({ title: 'Caret FX', message: 'Invalid color. Use hex like #ff66aa', dismissible: true, autoDestroyTime: 3000 });
		this.update({ color: fix(c), ...(ok(a) ? { accent: fix(a) } : {}) });
	}

	nextPreset() {
		this.preset = (this.preset + 1) % PRESETS.length;
		const [name, color, accent] = PRESETS[this.preset];
		this.update({ color, accent });
		this.ui.addToaster({ title: 'Caret FX', message: `Color: ${name}`, dismissible: true, autoDestroyTime: 1500 });
	}

	askIntensity() {
		const n = parseFloat(window.prompt('Intensity (0.3 subtle – 2 strong)', String(this.cfg.intensity)) || '');
		if (n > 0) this.update({ intensity: Math.min(3, n) });
	}

	// ---- caret tracking ----------------------------------------------------------------

	// Caret of an <input>/<textarea> (modals, search boxes): the DOM exposes no range for these,
	// so measure a hidden mirror element with identical text styling up to the caret.
	formCaretRect(el) {
		const doc = el.ownerDocument, style = getComputedStyle(el), box = el.getBoundingClientRect();
		const isTa = el.tagName === 'TEXTAREA';
		const value = String(el.value ?? '');
		let pos = value.length;
		try { pos = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd; } catch (e) { /* e.g. type=email */ }
		let m = this.mirror;
		if (!m) {
			m = this.mirror = doc.createElement('div');
			m.setAttribute('aria-hidden', 'true');
			m.style.cssText = 'position:absolute;visibility:hidden;top:0;left:0;pointer-events:none;z-index:-1;overflow:hidden;';
			doc.body.appendChild(m);
		}
		for (const p of ['boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'letterSpacing', 'textIndent', 'textTransform', 'wordSpacing', 'tabSize']) m.style[p] = style[p];
		m.style.whiteSpace = isTa ? 'pre-wrap' : 'pre';
		m.style.wordWrap = isTa ? 'break-word' : 'normal';
		if (!isTa) m.style.height = 'auto';
		m.textContent = '';
		m.appendChild(doc.createTextNode(value.substring(0, pos)));
		const mark = doc.createElement('span');
		mark.textContent = '\u200b';
		m.appendChild(mark);
		const mr = m.getBoundingClientRect(), kr = mark.getBoundingClientRect();
		const fs = parseFloat(style.fontSize) || 14;
		const lh = parseFloat(style.lineHeight) || fs * 1.25;
		const h = Math.min(lh, box.height) || fs * 1.2;
		const x = box.left + (kr.left - mr.left) - (el.scrollLeft || 0);
		const y = isTa ? box.top + (kr.top - mr.top) - (el.scrollTop || 0) : box.top + (box.height - h) / 2;
		return {
			x: Math.min(Math.max(x, box.left), box.right),
			y: Math.min(Math.max(y, box.top), box.bottom - 1),
			w: 2, h,
		};
	}

	caretRect() {
		const active = document.activeElement;
		if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|password|email|number|)$/i.test(active.type)))) {
			try { this.why = 'ok form ' + active.tagName; return this.formCaretRect(active); } catch (e) { this.why = 'form error ' + e.message; return null; }
		}
		// The Thymer editor does not use the native caret: it draws its own element.
		const panel = document.querySelector('.panel.focused-panel, .panel.has-focus');
		let best = null, bestScore = 0;
		for (const n of document.querySelectorAll('div.listview-caret-self')) {
			const b = n.getBoundingClientRect();
			if (!(b.height > 0.5)) continue;
			const score = panel && panel.contains(n) ? 2 : 1;
			if (score > bestScore) { best = b; bestScore = score; }
		}
		if (best) { this.why = 'ok thymer caret'; return { x: best.left, y: best.top, w: 2, h: best.height }; }
		const sel = window.getSelection();
		if (!sel || !sel.rangeCount) { this.why = 'no selection / no .listview-caret-self'; return null; }
		if (!sel.isCollapsed) { this.why = 'selection not collapsed'; return null; }
		const range = sel.getRangeAt(0);
		const node = range.startContainer;
		const el = node.nodeType === 1 ? node : node.parentElement;
		if (!el) { this.why = 'no element'; return null; }
		let r = range.getClientRects()[0];
		if (!r || (r.width === 0 && r.height === 0)) {
			// Collapsed ranges can report nothing: measure the neighbouring character instead.
			const t = node.nodeType === 3 ? node : null;
			const off = range.startOffset;
			const probe = (s, e, right) => {
				const q = document.createRange();
				q.setStart(t, s); q.setEnd(t, e);
				const c = q.getClientRects()[0];
				return c && c.height ? { left: right ? c.right : c.left, top: c.top, height: c.height } : null;
			};
			if (t) r = (off < t.data.length && probe(off, off + 1, false)) || (off > 0 && probe(off - 1, off, true)) || null;
			if (!r) {
				const b = el.getBoundingClientRect();
				if (!b.height) { this.why = 'zero-size element ' + el.tagName; return null; }
				r = { left: b.left, top: b.top, height: Math.min(b.height, 28) };
			}
		}
		this.why = 'ok ' + el.tagName;
		return { x: r.left, y: r.top, w: 2, h: r.height || 18 };
	}

	sample(typed) {
		this.n.sample++;
		const cur = this.caretRect();
		if (!cur) return;
		const prev = this.last;
		this.last = cur;
		if (!prev) return this.addPulse(cur);

		const dx = cur.x - prev.x, dy = cur.y - prev.y;
		const dist = Math.hypot(dx, dy);
		if (dist < 0.5) return; // same position: key repeat/blink/duplicate events must not stack effects

		const c = this.cfg;
		const now = performance.now();
		if (typed) {
			this.fx = this.fx.filter((f) => f.kind !== 'glow' && f.kind !== 'hop');
			if (c.glow) this.fx.push({ kind: 'glow', t0: now, dur: 420 });
			if (c.bounce) this.fx.push({ kind: 'hop', t0: now, dur: 260 });
		}
		if (dist > cur.h * c.trailMinWidths && c.trail) {
			this.fx.push({ kind: 'trail', t0: performance.now(), dur: 500, from: prev, to: cur });
		}
		if (Math.abs(dy) >= cur.h * c.lightningMinLines && c.lightning) {
			this.fx.push({ kind: 'bolt', t0: performance.now(), dur: 260, from: prev, to: cur, seed: Math.floor(performance.now()) * 0.013 });
		}
		this.kick();
	}

	addPulse(rect) {
		if (!this.cfg.glow) return;
		this.fx.push({ kind: 'glow', t0: performance.now(), dur: 420 });
		this.kick();
	}

	// ---- rendering ---------------------------------------------------------------------

	mountCanvas() {
		const cv = document.createElement('canvas');
		cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;';
		document.body.appendChild(cv);
		this.canvas = cv;
		this.ctx = cv.getContext('2d');
		this.resize();
	}

	resize() {
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = Math.round(window.innerWidth * dpr);
		this.canvas.height = Math.round(window.innerHeight * dpr);
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	kick() { if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame()); }

	frame() {
		this.raf = 0;
		const ctx = this.ctx, now = performance.now(), k = this.cfg.intensity;
		ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
		ctx.globalCompositeOperation = 'lighter';
		this.fx = this.fx.filter((f) => now - f.t0 < f.dur);
		for (const f of this.fx) {
			const p = (now - f.t0) / f.dur;
			if (f.kind === 'glow') this.drawGlow(f, p, k);
			else if (f.kind === 'hop') this.drawHop(f, p, k);
			else if (f.kind === 'trail') this.drawTrail(f, p, k);
			else if (f.kind === 'bolt') this.drawBolt(f, p, k);
		}
		ctx.globalCompositeOperation = 'source-over';
		if (this.fx.length) this.kick();
	}

	drawGlow(f, p, k) {
		const rect = this.last;
		if (!rect) return;
		const ctx = this.ctx, cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
		const r = rect.h * (0.9 + p * 1.6) * k;
		const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
		const a = (1 - p) * (1 - p) * 0.55 * Math.min(k, 1.5);
		g.addColorStop(0, rgba(this.cfg.color, a));
		g.addColorStop(0.45, rgba(this.cfg.accent, a * 0.35));
		g.addColorStop(1, rgba(this.cfg.accent, 0));
		ctx.fillStyle = g;
		ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
	}

	// Neovide-ish hop: a caret-sized ghost jumps up and settles with a damped spring.
	drawHop(f, p, k) {
		const rect = this.last;
		if (!rect) return;
		const ctx = this.ctx;
		const spring = Math.exp(-4 * p) * Math.sin(p * Math.PI * 2.5); // starts at the caret, no ghost
		const lift = -rect.h * 0.42 * k * spring;
		const stretch = 1 + 0.35 * spring * k;
		const a = (1 - p) * 0.75 * Math.min(1, Math.abs(spring) * 3);
		ctx.fillStyle = rgba(this.cfg.color, a);
		ctx.shadowColor = rgba(this.cfg.color, a);
		ctx.shadowBlur = 10 * k;
		ctx.fillRect(rect.x - 0.5, rect.y + lift - (rect.h * (stretch - 1)) / 2, rect.w + 1, rect.h * stretch);
		ctx.shadowBlur = 0;
	}

	// Blaze: parallelogram swept between the previous and current caret, shrinking toward the new position.
	drawTrail({ from, to }, p, k) {
		const ctx = this.ctx;
		const e = Math.pow(1 - p, 3); // ease out
		const sx = to.x + (from.x - to.x) * e, sy = to.y + (from.y - to.y) * e;
		const w = 3;
		ctx.beginPath();
		ctx.moveTo(to.x, to.y);
		ctx.lineTo(to.x + w, to.y);
		ctx.lineTo(sx + w, sy);
		ctx.lineTo(sx, sy);
		ctx.lineTo(sx, sy + from.h);
		ctx.lineTo(sx + w, sy + from.h);
		ctx.lineTo(to.x + w, to.y + to.h);
		ctx.lineTo(to.x, to.y + to.h);
		ctx.closePath();
		const g = ctx.createLinearGradient(to.x, to.y, sx, sy);
		g.addColorStop(0, rgba(this.cfg.color, 0.85 * (1 - p) * Math.min(k, 1.5)));
		g.addColorStop(1, rgba(this.cfg.accent, 0.0));
		ctx.fillStyle = g;
		ctx.shadowColor = rgba(this.cfg.accent, 0.8 * (1 - p));
		ctx.shadowBlur = 12 * k;
		ctx.fill();
		ctx.shadowBlur = 0;
	}

	// Lightning: jagged polyline with forks, flashes hard then fades to a glow.
	drawBolt({ from, to, seed }, p, k) {
		const ctx = this.ctx;
		const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
		const b = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
		const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len, ny = dx / len, SEG = 12, JAG = 0.085;
		const pt = (t, s) => {
			const node = Math.floor(t * SEG + 0.5);
			const off = (hash(node * 17.17 + s) * 2 - 1) * len * JAG * Math.sin(Math.PI * t);
			return { x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off };
		};
		const flash = Math.pow(1 - p, 2) * (0.82 + 0.18 * Math.sin(p * 95 + seed)) * Math.min(k, 1.6);

		const stroke = (pts, width, color) => {
			ctx.beginPath();
			pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
			ctx.lineWidth = width;
			ctx.strokeStyle = color;
			ctx.lineJoin = 'round';
			ctx.stroke();
		};
		const main = [];
		for (let i = 0; i <= SEG; i++) main.push(pt(i / SEG, seed));
		const forks = [];
		for (let i = 0; i < 3; i++) {
			const root = pt(0.28 + i * 0.22, seed);
			const side = hash(seed + i * 41) < 0.5 ? -1 : 1;
			const reach = len * (0.055 + 0.035 * hash(seed + i * 53));
			const tip = { x: root.x + nx * side * reach + (dx / len) * reach * (hash(seed + i * 67) - 0.35), y: root.y + ny * side * reach + (dy / len) * reach * (hash(seed + i * 67) - 0.35) };
			const el = { x: (root.x + tip.x) / 2 - nx * side * reach * 0.2, y: (root.y + tip.y) / 2 - ny * side * reach * 0.2 };
			forks.push([root, el, tip]);
		}

		ctx.shadowColor = rgba(this.cfg.accent, flash);
		ctx.shadowBlur = 14 * k;
		stroke(main, 5 * k, rgba(this.cfg.accent, 0.35 * flash));
		forks.forEach((f) => stroke(f, 3.5 * k, rgba(this.cfg.accent, 0.25 * flash)));
		ctx.shadowBlur = 0;
		stroke(main, 1.4, rgba(this.cfg.color, flash));
		forks.forEach((f) => stroke(f, 1, rgba(this.cfg.color, 0.8 * flash)));
	}
}
