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
	fx: null,               // signature effect set by the preset: lightning | sakura | autumn | paper
	intensity: 1,           // 0.3 (subtle) .. 2 (strong)
	trailMinWidths: 1.5,    // trail appears when caret moves farther than this many caret-heights
	lightningMinLines: 0.8, // Lightning preset: a bolt is drawn when the caret changes line (jump of this many caret-heights)
};

// [name, caret/glow color, accent color, signature effect]. Presets with an effect also change what happens while you type.
const PRESETS = [
	['Amber', '#ffb929', '#ff3b1f', null],
	['Sunset', '#ff9a56', '#ff3d77', null],
	['Rose', '#ffb3c7', '#ff2d6f', null],
	['Violet', '#d6a6ff', '#7a2bff', null],
	['Ice', '#9be7ff', '#2b7bff', null],
	['Ocean', '#5ef2e0', '#0a7ea4', null],
	['Mint', '#9dffcf', '#08b36b', null],
	['Lime', '#e4ff6a', '#4bb800', null],
	['Mono', '#ffffff', '#8a8f98', null],
	['Lightning', '#d6ecff', '#2f7bff', 'lightning'],
	['Sakura', '#ffc2d4', '#ff7aa2', 'sakura'],
	['Autumn', '#ff9a3c', '#c2410c', 'autumn'],
	['Paper', '#e8dcc0', '#5f9e4c', 'paper'],
];
// Falling particles for the leaf-type effects: shape, size range (px), colors, how fast they fall and sway.
const PARTICLES = {
	sakura: { shape: 'petal', size: [4.5, 9], tones: [['#ffd9e3', '#ffa8c0'], ['#ffc4d4', '#ff8fb0'], ['#fff0f4', '#ffb7cb'], ['#ffb3c8', '#ff7aa2']], fall: 0.055, sway: 1 },
	autumn: { shape: 'leaf', size: [6, 11], tones: [['#ffb347', '#e8590c'], ['#ff8c1a', '#c2410c'], ['#f2c14e', '#d9822b'], ['#e0562b', '#a32d0e']], fall: 0.075, sway: 1.6 },
	paper: { shape: 'leaf', size: [6, 11], tones: [['#8fd18f', '#2e7d32'], ['#b5e2a8', '#43a047'], ['#6fbf73', '#1b5e20'], ['#a5d6a7', '#388e3c']], fall: 0.06, sway: 1.2 },
};

const hash = (p) => { p = (p * 0.1031) % 1; p *= p + 33.33; p *= p + p; return p - Math.floor(p); };

const rgba = (hex, a) => {
	let h = String(hex || '').replace('#', '');
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	const n = parseInt(h, 16);
	if (!/^[0-9a-f]{6}$/i.test(h)) return `rgba(255,185,41,${a})`;
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const hexToHsv = (hex) => {
	const n = parseInt(String(hex).replace('#', '').padStart(6, '0').slice(0, 6), 16);
	const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
	let h = 0;
	if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return { h: h * 60, s: mx ? d / mx : 0, v: mx };
};
const hsvToHex = ({ h, s, v }) => {
	const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
	return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};
const isHex = (v) => /^#?[0-9a-f]{6}$/i.test(String(v).trim());

const UI_CSS = `
.cfx-ov { position: fixed; inset: 0; z-index: 2147483100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.4); backdrop-filter: blur(3px); animation: cfx-in .14s ease-out; }
@keyframes cfx-in { from { opacity: 0; } to { opacity: 1; } }
.cfx-box { width: 340px; max-width: 92vw; padding: 18px; border-radius: 18px; border: 1px solid rgba(127,127,127,.28); box-shadow: 0 28px 80px rgba(0,0,0,.5); font: 13px/1.4 system-ui, sans-serif; animation: cfx-pop .18s cubic-bezier(.2,1.2,.4,1); }
@keyframes cfx-pop { from { transform: translateY(8px) scale(.97); } to { transform: none; } }
.cfx-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.cfx-title { font-size: 15px; font-weight: 650; }
.cfx-x { all: unset; cursor: pointer; opacity: .55; padding: 2px 6px; border-radius: 6px; }
.cfx-x:hover { opacity: 1; background: rgba(127,127,127,.18); }
.cfx-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .55; margin: 14px 0 7px; }
.cfx-preview { position: relative; height: 84px; border-radius: 12px; overflow: hidden; background: rgba(127,127,127,.12); border: 1px solid rgba(127,127,127,.2); display: flex; align-items: center; padding: 0 16px; font-size: 15px; letter-spacing: .02em; }
.cfx-preview .cfx-trail { position: absolute; left: 118px; top: 31px; width: 70px; height: 22px; background: linear-gradient(90deg, transparent, var(--a)); opacity: .55; filter: blur(2px); }
.cfx-preview .cfx-caret { position: absolute; left: 186px; top: 28px; width: 2.5px; height: 28px; border-radius: 2px; background: var(--c); box-shadow: 0 0 10px var(--c), 0 0 22px var(--a); animation: cfx-blink 1.1s steps(1) infinite; }
@keyframes cfx-blink { 50% { opacity: .35; } }
.cfx-preview canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cfx-presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 8px 4px; }
.cfx-pre { all: unset; box-sizing: border-box; cursor: pointer; text-align: center; }
.cfx-dot { width: 34px; height: 34px; margin: 0 auto 3px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(127,127,127,.35); transition: transform .12s; }
.cfx-pre:hover .cfx-dot { transform: scale(1.1); }
.cfx-pre.on .cfx-dot { box-shadow: 0 0 0 2px var(--c); }
.cfx-pre span { font-size: 9px; opacity: .6; white-space: nowrap; }
.cfx-tabs { display: flex; gap: 6px; padding: 3px; border-radius: 10px; background: rgba(127,127,127,.14); }
.cfx-tab { all: unset; box-sizing: border-box; flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 6px 4px; border-radius: 8px; cursor: pointer; font-size: 12px; }
.cfx-tab.on { background: rgba(127,127,127,.3); font-weight: 600; }
.cfx-tab i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; box-shadow: 0 0 0 1px rgba(127,127,127,.5); }
.cfx-sv { position: relative; width: 100%; height: 130px; border-radius: 10px; margin-top: 10px; cursor: crosshair; touch-action: none; }
.cfx-sv canvas { width: 100%; height: 100%; display: block; border-radius: 10px; }
.cfx-knob { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 2.5px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.4); pointer-events: none; }
.cfx-hue { position: relative; height: 14px; border-radius: 7px; margin-top: 12px; cursor: pointer; touch-action: none; background: linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00); }
.cfx-hue .cfx-knob { top: 50%; }
.cfx-hexrow { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.cfx-hex { flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid rgba(127,127,127,.35); background: rgba(127,127,127,.1); color: inherit; font: 12.5px ui-monospace, monospace; text-transform: uppercase; outline: none; }
.cfx-hex:focus { border-color: var(--c); }
.cfx-hex.bad { border-color: #e5484d; }
.cfx-sl { position: relative; height: 34px; cursor: pointer; touch-action: none; outline: none; }
.cfx-sl-track { position: absolute; left: 0; right: 0; top: 14px; height: 6px; border-radius: 3px; background: rgba(127,127,127,.28); }
.cfx-sl-fill { position: absolute; left: 0; top: 14px; height: 6px; border-radius: 3px; background: linear-gradient(90deg, var(--a), var(--c)); box-shadow: 0 0 10px var(--c); }
.cfx-sl-thumb { position: absolute; top: 7px; width: 20px; height: 20px; margin-left: -10px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px var(--c), 0 3px 10px rgba(0,0,0,.45); transition: transform .1s; }
.cfx-sl:hover .cfx-sl-thumb, .cfx-sl:focus .cfx-sl-thumb { transform: scale(1.12); }
.cfx-ticks { display: flex; justify-content: space-between; font-size: 10.5px; opacity: .55; margin-top: 2px; }
.cfx-readout { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
.cfx-big { font-size: 26px; font-weight: 650; font-variant-numeric: tabular-nums; }
.cfx-mode { font-size: 12px; opacity: .65; }
.cfx-orb { height: 90px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: rgba(127,127,127,.12); border: 1px solid rgba(127,127,127,.2); overflow: hidden; }
.cfx-orb i { display: block; width: 3px; height: 30px; border-radius: 2px; background: var(--c); transition: box-shadow .12s; }
.cfx-foot { display: flex; justify-content: space-between; margin-top: 16px; }
.cfx-btn { all: unset; cursor: pointer; padding: 6px 14px; border-radius: 9px; border: 1px solid rgba(127,127,127,.4); font-size: 12.5px; }
.cfx-btn:hover { background: rgba(127,127,127,.16); }
.cfx-btn.primary { background: var(--c); color: #111; border-color: transparent; font-weight: 600; }
`;

class Plugin extends AppPlugin {
	cfg = { ...DEFAULTS };
	canvas = null;
	ctx = null;
	fx = [];            // active effects
	parts = [];         // falling petals / leaves
	last = null;        // last caret rect {x,y,w,h}
	raf = 0;
	preset = 0;
	cleanup = [];

	onLoad() {
		this.readConfig();
		this.mountCanvas();
		this.applyCaretStyle();

		this.n = { input: 0, key: 0, sel: 0, sample: 0 };
		this.why = '-';
		const onInput = () => { this.n.input++; requestAnimationFrame(() => this.sample(true)); };
		const onKey = (e) => {
			this.n.key++;
			if ((e.key.length === 1 && !e.ctrlKey && !e.metaKey) || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter') this.lastTypeKey = performance.now();
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
		const onScroll = () => requestAnimationFrame(() => this.sample(false));
		document.addEventListener('scroll', onScroll, true);
		this.cleanup.push(() => document.removeEventListener('scroll', onScroll, true));
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
			requestAnimationFrame(() => { pending = false; this.sample(false); });
		});
		mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style', 'class'], childList: true, characterData: true });
		this.cleanup.push(() => mo.disconnect());

		this.ui.addCommandPaletteCommand({ label: 'Caret FX: set color…', icon: 'ti-palette', onSelected: () => this.colorDialog() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: next color preset', icon: 'ti-color-swatch', onSelected: () => this.nextPreset() });
		this.ui.addCommandPaletteCommand({ label: 'Caret FX: set intensity…', icon: 'ti-adjustments', onSelected: () => this.intensityDialog() });
		for (const [key, label] of [['bounce', 'bounce'], ['trail', 'trail']]) {
			this.ui.addCommandPaletteCommand({ label: `Caret FX: toggle ${label}`, icon: 'ti-toggle-right', onSelected: () => this.update({ [key]: !this.cfg[key] }) });
		}

		// Picks up edits made in the plugin's configuration JSON.
		this.events.on('global-plugin.updated', () => this.readConfig());
	}

	onUnload() {
		cancelAnimationFrame(this.raf);
		this.cleanup.forEach((f) => f());
		this.canvas?.remove();
		this.closeDialog();
		this.uiStyle?.remove();
		this.mirror?.remove();
		this.caretStyle?.remove();
	}

	// ---- always-on caret color ---------------------------------------------------------

	// Thymer draws its caret as the left border of div.listview-caret-self, colored by --ed-caret-self-fg
	// (its theme CSS: border-color and color both read it). Only that variable is overridden: the
	// background/blink variables paint a filled block next to the caret instead.
	applyCaretStyle() {
		if (!this.caretStyle) {
			this.caretStyle = document.createElement('style');
			document.head.appendChild(this.caretStyle);
		}
		const col = this.cfg.color;
		this.caretStyle.textContent = `body, div.listview-caret-self { --ed-caret-self-fg: ${col} !important; }
* { caret-color: ${col} !important; }`;
	}

	// ---- settings ----------------------------------------------------------------------

	readConfig() {
		try {
			const custom = this.getConfiguration()?.custom || {};
			this.cfg = { ...DEFAULTS, ...custom };
		} catch (e) { this.cfg = { ...DEFAULTS }; }
		// These no longer have a command, so a value saved by an old toggle must not keep them off.
		this.cfg.glow = true;
		if (this.canvas) this.applyCaretStyle();
	}

	update(patch) {
		this.cfg = { ...this.cfg, ...patch };
		this.applyCaretStyle();
		try {
			const conf = this.getConfiguration();
			conf.custom = { ...(conf.custom || {}), ...patch };
			this.saveConfiguration(conf);
		} catch (e) { /* keep in-memory value */ }
		// Show the new look right away at the current caret.
		if (this.last) this.addPulse(this.last);
	}

	// ---- themed dialogs ----------------------------------------------------------------

	dialog(title, build) {
		this.closeDialog();
		if (!this.uiStyle) { this.uiStyle = document.createElement('style'); this.uiStyle.textContent = UI_CSS; document.head.appendChild(this.uiStyle); }
		const cs = getComputedStyle(document.body);
		const ov = document.createElement('div');
		ov.className = 'cfx-ov';
		const box = document.createElement('div');
		box.className = 'cfx-box';
		box.style.color = cs.color;
		box.style.background = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'Canvas';
		box.style.setProperty('--c', this.cfg.color);
		box.style.setProperty('--a', this.cfg.accent);
		box.innerHTML = `<div class="cfx-head"><div class="cfx-title"></div><button class="cfx-x" aria-label="Close">✕</button></div>`;
		box.querySelector('.cfx-title').textContent = title;
		box.querySelector('.cfx-x').onclick = () => this.closeDialog();
		ov.appendChild(box);
		ov.addEventListener('mousedown', (e) => { if (e.target === ov) this.closeDialog(); });
		this.dlgKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.closeDialog(); } };
		document.addEventListener('keydown', this.dlgKey, true);
		document.body.appendChild(ov);
		this.dlg = ov;
		this.dlgBox = box;
		build(box);
	}

	closeDialog() {
		if (this.dlgKey) document.removeEventListener('keydown', this.dlgKey, true);
		this.dlg?.remove();
		this.dlg = this.dlgBox = this.dlgKey = null;
	}

	// Apply right away, write the configuration once editing pauses.
	live(patch) {
		this.cfg = { ...this.cfg, ...patch };
		this.pendingSave = { ...(this.pendingSave || {}), ...patch };
		this.applyCaretStyle();
		this.dlgBox?.style.setProperty('--c', this.cfg.color);
		this.dlgBox?.style.setProperty('--a', this.cfg.accent);
		clearTimeout(this.saveT);
		this.saveT = setTimeout(() => {
			try {
				const conf = this.getConfiguration();
				conf.custom = { ...(conf.custom || {}), ...this.pendingSave };
				this.saveConfiguration(conf);
			} catch (e) { /* keep in-memory value */ }
			this.pendingSave = null;
		}, 400);
	}

	// Pointer-drag helper: calls fn(x, y) in 0..1 coordinates of el while dragging.
	drag(el, fn) {
		const move = (e) => { const r = el.getBoundingClientRect(); fn(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)); };
		el.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			el.setPointerCapture(e.pointerId);
			move(e);
			const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
			el.addEventListener('pointermove', move);
			el.addEventListener('pointerup', up);
		});
	}

	// Plays the selected preset's signature effect inside the dialog preview, on its own mini canvas.
	startPreview(host) {
		const cv = document.createElement('canvas');
		host.appendChild(cv);
		const dpr = window.devicePixelRatio || 1, W = host.offsetWidth, H = host.offsetHeight;
		cv.width = W * dpr; cv.height = H * dpr;
		const pv = Object.create(this);              // shares cfg (colors, effect) with the plugin, owns its drawing state
		pv.ctx = cv.getContext('2d');
		pv.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		pv.parts = []; pv.fx = []; pv.partT = 0;
		const caret = { x: 186, y: 28, w: 2.5, h: 28 };
		let next = 0;
		const tick = () => {
			if (!this.dlg || !cv.isConnected) return;
			const now = performance.now(), fx = this.cfg.fx;
			if (now > next) {
				if (PARTICLES[fx]) { pv.spawnParticles(caret, true); next = now + 750; }
				else if (fx === 'lightning') { pv.spawnZaps(caret, true); next = now + 600; }
				else next = now + 300;
			}
			const ctx = pv.ctx;
			ctx.clearRect(0, 0, W, H);
			pv.fx = pv.fx.filter((f) => now - f.t0 < f.dur);
			ctx.globalCompositeOperation = 'lighter';
			for (const f of pv.fx) pv.drawBolt(f, (now - f.t0) / f.dur, this.cfg.intensity);
			ctx.globalCompositeOperation = 'source-over';
			if (pv.parts.length) pv.drawParticles(now); else pv.partT = 0;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	colorDialog() {
		this.dialog('Caret color', (box) => {
			const html = (h) => { const t = document.createElement('div'); t.innerHTML = h; return t.firstElementChild; };
			const preview = html('<div class="cfx-preview"><span>Typing something…</span><div class="cfx-trail"></div><div class="cfx-caret"></div></div>');
			box.appendChild(preview);
			this.startPreview(preview);

			box.appendChild(html('<div class="cfx-label">Colors</div>'));
			const grid = html('<div class="cfx-presets"></div>');
			box.appendChild(grid);
			box.appendChild(html('<div class="cfx-label">Special · falling petals and leaves, lightning</div>'));
			const special = html('<div class="cfx-presets"></div>');
			box.appendChild(special);

			box.appendChild(html('<div class="cfx-label">Customize</div>'));
			const tabs = html('<div class="cfx-tabs"></div>');
			box.appendChild(tabs);
			const sv = html('<div class="cfx-sv"><canvas width="320" height="130"></canvas><div class="cfx-knob"></div></div>');
			const hue = html('<div class="cfx-hue"><div class="cfx-knob"></div></div>');
			const hexRow = html('<div class="cfx-hexrow"><input class="cfx-hex" maxlength="7" spellcheck="false"><button class="cfx-btn">Reset</button></div>');
			box.append(sv, hue, hexRow);
			const hexIn = hexRow.querySelector('input');

			let target = 'color';
			let hsv = hexToHsv(this.cfg.color);
			const canvas = sv.querySelector('canvas'), cx = canvas.getContext('2d');
			const paintSV = () => {
				cx.fillStyle = hsvToHex({ h: hsv.h, s: 1, v: 1 });
				cx.fillRect(0, 0, canvas.width, canvas.height);
				let g = cx.createLinearGradient(0, 0, canvas.width, 0);
				g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
				cx.fillStyle = g; cx.fillRect(0, 0, canvas.width, canvas.height);
				g = cx.createLinearGradient(0, 0, 0, canvas.height);
				g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
				cx.fillStyle = g; cx.fillRect(0, 0, canvas.width, canvas.height);
			};
			const place = () => {
				const k = sv.querySelector('.cfx-knob'), hk = hue.querySelector('.cfx-knob');
				k.style.left = hsv.s * 100 + '%'; k.style.top = (1 - hsv.v) * 100 + '%';
				k.style.background = hsvToHex(hsv);
				hk.style.left = (hsv.h / 360) * 100 + '%';
				hk.style.background = hsvToHex({ h: hsv.h, s: 1, v: 1 });
			};
			const refreshPresets = () => box.querySelectorAll('.cfx-pre').forEach((b) => { const p = PRESETS[b.dataset.i]; b.classList.toggle('on', p[1] === this.cfg.color && p[2] === this.cfg.accent && (p[3] || null) === (this.cfg.fx || null)); });
			const refreshTabs = () => {
				tabs.querySelectorAll('.cfx-tab').forEach((t) => { t.classList.toggle('on', t.dataset.k === target); t.querySelector('i').style.background = this.cfg[t.dataset.k]; });
			};
			const apply = (fromHex) => {
				const hex = hsvToHex(hsv);
				this.live({ [target]: hex });
				if (!fromHex) hexIn.value = hex;
				paintSV(); place(); refreshTabs(); refreshPresets();
			};
			const load = () => { hsv = hexToHsv(this.cfg[target]); hexIn.value = this.cfg[target]; hexIn.classList.remove('bad'); paintSV(); place(); refreshTabs(); };

			PRESETS.forEach(([name, color, accent, fx], i) => {
				const b = html(`<button class="cfx-pre" data-i="${i}" title="${name}"><div class="cfx-dot" style="background:linear-gradient(135deg, ${color} 0%, ${color} 38%, ${accent} 100%)"></div><span>${name}</span></button>`);
				b.onclick = () => { this.live({ color, accent, fx }); load(); refreshPresets(); };
				(fx ? special : grid).appendChild(b);
			});
			[['color', 'Caret & glow'], ['accent', 'Trail & accent']].forEach(([k, label]) => {
				const t = html(`<button class="cfx-tab" data-k="${k}"><i></i>${label}</button>`);
				t.onclick = () => { target = k; load(); };
				tabs.appendChild(t);
			});
			this.drag(sv, (x, y) => { hsv = { ...hsv, s: x, v: 1 - y }; apply(); });
			this.drag(hue, (x) => { hsv = { ...hsv, h: x * 359.9 }; apply(); });
			hexIn.oninput = () => {
				const v = hexIn.value.trim();
				const ok = isHex(v);
			hexIn.classList.toggle('bad', !ok);
				if (ok) { hsv = hexToHsv(v.startsWith('#') ? v : '#' + v); apply(true); }
			};
			hexRow.querySelector('button').onclick = () => { this.live({ [target]: DEFAULTS[target] }); load(); refreshPresets(); };
			load(); refreshPresets();
		});
	}

	intensityDialog() {
		this.dialog('Effect intensity', (box) => {
			const MIN = 0.3, MAX = 2;
			const name = (v) => (v < 0.7 ? 'Subtle' : v < 1.25 ? 'Normal' : v < 1.7 ? 'Strong' : 'Intense');
			box.insertAdjacentHTML('beforeend', `
				<div class="cfx-orb"><i></i></div>
				<div class="cfx-label">Strength</div>
				<div class="cfx-readout"><span class="cfx-big"></span><span class="cfx-mode"></span></div>
				<div class="cfx-sl" tabindex="0"><div class="cfx-sl-track"></div><div class="cfx-sl-fill"></div><div class="cfx-sl-thumb"></div></div>
				<div class="cfx-ticks"><span>Subtle</span><span>Normal</span><span>Intense</span></div>
				<div class="cfx-foot"><button class="cfx-btn" data-r>Reset</button><button class="cfx-btn primary" data-d>Done</button></div>`);
			const sl = box.querySelector('.cfx-sl'), fill = box.querySelector('.cfx-sl-fill'), thumb = box.querySelector('.cfx-sl-thumb');
			const big = box.querySelector('.cfx-big'), mode = box.querySelector('.cfx-mode'), orb = box.querySelector('.cfx-orb i');
			const show = (v) => {
				const f = (v - MIN) / (MAX - MIN);
				fill.style.width = f * 100 + '%'; thumb.style.left = f * 100 + '%';
				big.textContent = v.toFixed(1) + '×'; mode.textContent = name(v);
				orb.style.boxShadow = `0 0 ${6 + v * 14}px ${v * 3}px ${rgba(this.cfg.color, Math.min(0.9, 0.25 + v * 0.3))}, 0 0 ${10 + v * 34}px ${v * 6}px ${rgba(this.cfg.accent, 0.35)}`;
			};
			const set = (v) => { v = Math.round(Math.min(MAX, Math.max(MIN, v)) * 10) / 10; this.live({ intensity: v }); show(v); };
			this.drag(sl, (x) => set(MIN + x * (MAX - MIN)));
			sl.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(this.cfg.intensity + 0.1); }
				if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(this.cfg.intensity - 0.1); }
			});
			box.querySelector('[data-r]').onclick = () => set(1);
			box.querySelector('[data-d]').onclick = () => this.closeDialog();
			show(this.cfg.intensity);
			sl.focus();
		});
	}

	nextPreset() {
		this.preset = (this.preset + 1) % PRESETS.length;
		const [name, color, accent, fx] = PRESETS[this.preset];
		this.update({ color, accent, fx });
		this.ui.addToaster({ title: 'Caret FX', message: `Color: ${name}`, dismissible: true, autoDestroyTime: 1500 });
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
		this.caretKind = '';
		const active = document.activeElement;
		if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|password|email|number|)$/i.test(active.type)))) {
			try { this.why = 'ok form ' + active.tagName; return this.formCaretRect(active); } catch (e) { this.why = 'form error ' + e.message; return null; }
		}
		// The Thymer editor does not use the native caret: it draws its own element.
		const panel = document.querySelector('.panel.focused-panel, .panel.has-focus');
		let best = null, bestEl = null, bestScore = 0;
		for (const n of document.querySelectorAll('div.listview-caret-self')) {
			const b = n.getBoundingClientRect();
			if (!(b.height > 0.5)) continue;
			const score = panel && panel.contains(n) ? 2 : 1;
			if (score > bestScore) { best = b; bestEl = n; bestScore = score; }
		}
		if (best) { this.caretKind = 'editor';  this.why = 'ok thymer caret'; return { x: best.left, y: best.top, w: 2, h: best.height }; }
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
		// Whichever event notices the caret move first (input, selection, DOM change) may not know it was typing.
		typed = typed || performance.now() - (this.lastTypeKey || 0) < 220;
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
			if (PARTICLES[c.fx]) this.spawnParticles(cur);
			if (c.fx === 'lightning') this.spawnZaps(cur);
		}
		const far = dist > cur.h * c.trailMinWidths;
		if ((far || typed) && c.trail) {
			// Every typed character leaves its own short streak; long jumps get the full blaze.
			this.fx.push({ kind: 'trail', t0: performance.now(), dur: far ? 500 : 420, from: prev, to: cur });
		}
		if (Math.abs(dy) >= cur.h * c.lightningMinLines && c.fx === 'lightning') {
			this.fx.push({ kind: 'bolt', t0: performance.now(), dur: 260, from: prev, to: cur, seed: Math.floor(performance.now()) * 0.013 });
		}
		this.kick();
	}

	// Lightning preset: an occasional short crackle jumps off the caret while typing.
	spawnZaps(r, force) {
		const now = performance.now(), cx = r.x + r.w / 2, cy = r.y + r.h / 2, k = Math.min(this.cfg.intensity, 1.6);
		// Rare while typing so it stays a spark, not a storm.
		if (!force && now - (this.lastZap || 0) < 220) return;
		if (!force && Math.random() > 0.3) return;
		this.lastZap = now;
		const n = force ? 2 : 1;
		for (let i = 0; i < n; i++) {
			const a = Math.random() * Math.PI * 2, len = (r.h * 0.8 + Math.random() * r.h * 1.3) * k;
			this.fx.push({
				kind: 'bolt', t0: now, dur: 150 + Math.random() * 90,
				from: { x: cx, y: cy + (Math.random() - 0.5) * r.h * 0.6, w: 0, h: 0 },
				to: { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len, w: 0, h: 0 },
				seed: Math.floor(now + i * 97) * 0.013, small: true,
			});
		}
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
		if (this.parts.length) this.drawParticles(now);
		else this.partT = 0;
		if (this.fx.length || this.parts.length) this.kick();
	}

	// ---- falling petals / leaves (Sakura, Autumn, Palm) ------------------------------------

	spawnParticles(r, force) {
		const def = PARTICLES[this.cfg.fx], k = Math.min(this.cfg.intensity, 1.6), now = performance.now();
		// Roughly one in three keystrokes drops a single petal or leaf.
		const n = force || Math.random() < 0.18 + 0.12 * k ? 1 : 0;
		for (let i = 0; i < n && this.parts.length < 40; i++) {
			this.parts.push({
				def, tone: def.tones[Math.floor(Math.random() * def.tones.length)],
				x: r.x + (Math.random() - 0.5) * 6, y: r.y + r.h * (0.15 + Math.random() * 0.5),
				vx: (Math.random() - 0.25) * 0.09, vy: -0.05 - Math.random() * 0.1,   // px/ms, pops up a little first
				size: (def.size[0] + Math.random() * (def.size[1] - def.size[0])) * (0.8 + 0.25 * k),
				rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.006,
				flip: Math.random() * 6, flipSpd: 0.004 + Math.random() * 0.005,       // flutter: turns edge-on
				phase: Math.random() * 6.28, sway: (0.00022 + Math.random() * 0.00022) * def.sway,
				t0: now, life: 1700 + Math.random() * 1500,
			});
		}
	}

	drawParticles(now) {
		const ctx = this.ctx, dt = Math.min(48, this.partT ? now - this.partT : 16);
		this.partT = now;
		this.parts = this.parts.filter((p) => now - p.t0 < p.life && p.y < window.innerHeight + 20);
		for (const p of this.parts) {
			const age = (now - p.t0) / p.life, s = p.size, [a, b] = p.tone;
			p.vy = Math.min(p.vy + 0.00016 * dt, p.def.fall);   // gravity, capped so they float down
			p.vx += Math.sin(now * p.sway + p.phase) * 0.00005 * dt * p.def.sway;
			p.vx *= 0.995;
			p.x += p.vx * dt; p.y += p.vy * dt;
			p.rot += p.spin * dt; p.flip += p.flipSpd * dt;
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rot);
			ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.flip)));
			ctx.globalAlpha = (age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3) * 0.95;
			const g = ctx.createLinearGradient(0, s, 0, -s);
			g.addColorStop(0, b); g.addColorStop(1, a);
			ctx.fillStyle = g; ctx.strokeStyle = b;
			ctx.beginPath();
			if (p.def.shape === 'petal') {                     // heart-shaped sakura petal, notch at the tip
				ctx.moveTo(0, -s * 0.65);
				ctx.bezierCurveTo(s * 0.55, -s * 1.35, s * 1.15, -s * 0.1, 0, s);
				ctx.bezierCurveTo(-s * 1.15, -s * 0.1, -s * 0.55, -s * 1.35, 0, -s * 0.65);
				ctx.fill();
			} else if (p.def.shape === 'leaf') {              // pointed leaf with a vein
				ctx.moveTo(0, -s * 1.15);
				ctx.quadraticCurveTo(s * 1.0, -s * 0.15, 0, s * 1.15);
				ctx.quadraticCurveTo(-s * 1.0, -s * 0.15, 0, -s * 1.15);
				ctx.fill();
				ctx.beginPath(); ctx.moveTo(0, -s * 1.05); ctx.lineTo(0, s * 1.3);
				ctx.strokeStyle = 'rgba(60,20,0,.35)'; ctx.lineWidth = 0.9; ctx.stroke();
			}
			ctx.restore();
		}
		ctx.globalAlpha = 1;
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
	drawBolt({ from, to, seed, small }, p, k) {
		const ctx = this.ctx;
		const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
		const b = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
		const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len, ny = dx / len, SEG = small ? 7 : 12, JAG = small ? 0.2 : 0.085;
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
