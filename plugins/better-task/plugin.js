/**
 * BetterTask - Handcrafted vector task statuses, ambient micro-animations,
 * theme-aware silhouettes, and unique canvas transition effects per status.
 */

const BT_PAGE_TYPE = 'better-task-settings';
const BT_STORAGE_KEY = 'better-task:choices';
const BT_UNDONE_KEY = 'better-task:undone';

const PRESETS = [
	{ id: 'neon-glass', label: 'Neon Glass' },
	{ id: 'vivid-solid', label: 'Vivid Solid' },
	{ id: 'minimal-crisp', label: 'Minimal Crisp' },
];

const STATUS_SPECS = [
	{
		key: 'started',
		cls: 'state-started',
		kbd: '1',
		name: 'In Progress',
		fxLabel: 'Orbital sweep + cyan speed streaks',
		colors: ['#38bdf8', '#22d3ee', '#bae6fd'],
		sampleText: 'Build custom BetterTask animations & hover physics',
	},
	{
		key: 'blocked',
		cls: 'state-blocked',
		kbd: '2',
		name: 'Waiting',
		fxLabel: 'Dashed hold + amber sonar pulse',
		colors: ['#fbbf24', '#f59e0b', '#fde68a'],
		sampleText: 'Waiting for design review before final release',
	},
	{
		key: 'dollar',
		cls: 'state-dollar',
		kbd: '3',
		name: 'Billable',
		fxLabel: 'Coin sheen + rising gold-mint sparkles',
		colors: ['#4ade80', '#a3e635', '#fde047'],
		sampleText: 'Send Q4 invoice & reconcile cloud billing',
	},
	{
		key: 'exclaim',
		cls: 'state-exclaim',
		kbd: '4',
		name: 'Important',
		fxLabel: 'Heartbeat pulse + coral starburst spikes',
		colors: ['#fb7185', '#f43f5e', '#fecdd3'],
		sampleText: 'Fix critical race condition in background worker',
	},
	{
		key: 'question',
		cls: 'state-question',
		kbd: '5',
		name: 'Discuss',
		fxLabel: 'Speech bubble tilt + rising thought bubbles',
		colors: ['#c084fc', '#a78bfa', '#ede9fe'],
		sampleText: 'Should we keep Neon Glass as the default preset?',
	},
	{
		key: 'alert',
		cls: 'state-alert',
		kbd: '6',
		name: 'Alert',
		fxLabel: 'Hazard beacon + crimson radar shockwave',
		colors: ['#ef4444', '#f97316', '#fde047'],
		sampleText: 'Database replication lag above threshold',
	},
	{
		key: 'starred',
		cls: 'state-starred',
		kbd: '7',
		name: 'Starred',
		fxLabel: 'Twinkling spark + golden star fountain',
		colors: ['#fde047', '#facc15', '#f59e0b'],
		sampleText: 'Ship polished plugin experience to workspace',
	},
	{
		key: 'canceled',
		cls: 'state-canceled',
		kbd: '-',
		name: 'Canceled',
		fxLabel: 'Frosted slash + lateral slate dissolve',
		colors: ['#94a3b8', '#cbd5e1', '#64748b'],
		sampleText: 'Old boxy monochrome icon set (replaced)',
	},
	{
		key: 'done',
		cls: 'state-done',
		kbd: 'x',
		name: 'Done',
		fxLabel: 'Squircle pop + emerald check ripple',
		colors: ['#34d399', '#10b981', '#a7f3d0'],
		sampleText: 'Replace stock glyph fonts with custom vectors',
	},
	{
		key: 'open',
		cls: '',
		kbd: '0',
		name: 'Open',
		fxLabel: 'Ghost check hover + crisp neutral reset',
		colors: ['#94a3b8', '#38bdf8', '#cbd5e1'],
		sampleText: 'Hover or click checkbox to cycle task statuses',
	},
];

const STATUS_MAP = new Map(STATUS_SPECS.map((s) => [s.key, s]));
const CYCLE_ORDER = ['open', 'started', 'blocked', 'dollar', 'exclaim', 'question', 'alert', 'starred', 'canceled', 'done'];
const CODE_TO_KEY = { 0: 'open', 1: 'started', 2: 'blocked', 3: 'dollar', 4: 'exclaim', 5: 'question', 6: 'alert', 7: 'starred', 8: 'done', 9: 'canceled' };
const NAME_TO_KEY = {
	none: 'open', open: 'open', '': 'open',
	started: 'started', inprogress: 'started',
	waiting: 'blocked', blocked: 'blocked',
	billable: 'dollar', dollar: 'dollar',
	important: 'exclaim', exclaim: 'exclaim',
	discuss: 'question', question: 'question',
	alert: 'alert', starred: 'starred',
	done: 'done', canceled: 'canceled',
};

function statusFromCodeOrString(v) {
	if (v == null) return null;
	if (typeof v === 'number' && CODE_TO_KEY[v] !== undefined) return CODE_TO_KEY[v];
	const s = String(v).trim().toLowerCase();
	if (/^\d+$/.test(s) && CODE_TO_KEY[Number(s)] !== undefined) return CODE_TO_KEY[Number(s)];
	return NAME_TO_KEY[s] || null;
}

function loadUndoneMap() {
	try {
		const raw = localStorage.getItem(BT_UNDONE_KEY);
		if (!raw) return new Map();
		const entries = JSON.parse(raw);
		return Array.isArray(entries) ? new Map(entries.slice(-400)) : new Map();
	} catch (e) {
		return new Map();
	}
}

function saveUndoneMap(map) {
	try {
		const arr = [...map.entries()].slice(-400);
		localStorage.setItem(BT_UNDONE_KEY, JSON.stringify(arr));
	} catch (e) {
		/* ignore */
	}
}

function statusFromClassName(cls) {
	if (!cls) return 'open';
	const s = String(cls);
	for (const spec of STATUS_SPECS) {
		if (spec.cls && new RegExp(`(?:^|\\s)${spec.cls}(?:\\s|$)`).test(s)) return spec.key;
	}
	return 'open';
}

function loadChoices() {
	try {
		const raw = localStorage.getItem(BT_STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch (e) {
		return {};
	}
}

function saveChoices(patch) {
	try {
		localStorage.setItem(BT_STORAGE_KEY, JSON.stringify({ ...loadChoices(), ...patch }));
	} catch (e) {
		/* ignore */
	}
}

function detectDarkTheme() {
	const root = document.documentElement;
	if (root.classList.contains('basic-dark')) return true;
	if (root.classList.contains('basic-light')) return false;
	const dt = (root.getAttribute('data-theme') || '').toLowerCase();
	if (dt.includes('light')) return false;
	if (dt.includes('dark') || dt === 'thymer-premium') return true;
	const el = document.querySelector('.panel') || document.body || root;
	try {
		const bg = getComputedStyle(el).backgroundColor;
		const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
		if (m && (m[4] === undefined || parseFloat(m[4]) > 0.05)) {
			const lum = (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
			return lum < 0.5;
		}
	} catch (e) {
		/* ignore */
	}
	return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
}

function hexToRgba(hex, a) {
	const h = hex.replace('#', '');
	const r = parseInt(h.slice(0, 2), 16) || 0;
	const g = parseInt(h.slice(2, 4), 16) || 0;
	const b = parseInt(h.slice(4, 6), 16) || 0;
	return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

// ---- Lightweight Canvas Burst Physics Engine -----------------------------------------

class TaskBurstSystem {
	constructor() {
		this.canvas = null;
		this.ctx = null;
		this.rings = [];
		this.motes = [];
		this.raf = 0;
		this.lastMs = 0;
		this.w = 0;
		this.h = 0;
		this.dpr = 1;
	}

	mount() {
		if (this.canvas || typeof document === 'undefined') return;
		const cv = document.createElement('canvas');
		cv.className = 'bt-fx-canvas';
		document.body.appendChild(cv);
		this.canvas = cv;
		this.ctx = cv.getContext('2d');
		this.resize();
	}

	resize() {
		if (!this.canvas) return;
		this.dpr = Math.min(2, window.devicePixelRatio || 1);
		this.w = window.innerWidth || 1200;
		this.h = window.innerHeight || 800;
		this.canvas.width = Math.round(this.w * this.dpr);
		this.canvas.height = Math.round(this.h * this.dpr);
	}

	active() {
		return this.rings.length > 0 || this.motes.length > 0;
	}

	clear() {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.rings = [];
		this.motes = [];
		if (this.ctx && this.canvas) {
			this.ctx.setTransform(1, 0, 0, 1, 0, 0);
			this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		}
	}

	destroy() {
		this.clear();
		this.canvas?.remove();
		this.canvas = null;
		this.ctx = null;
	}

	emit(status, x, y, size = 18, originStatus = null) {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		if (!this.canvas) this.mount();
		const spec = STATUS_MAP.get(status) || STATUS_MAP.get('open');
		const originSpec = originStatus && originStatus !== 'open' && originStatus !== 'done' ? STATUS_MAP.get(originStatus) : null;
		const cols = originSpec && status === 'done'
			? [originSpec.colors[0], originSpec.colors[1] || spec.colors[0], spec.colors[0]]
			: spec.colors;
		const u = Math.max(0.75, Math.min(1.6, size / 18));
		const now = performance.now();
		const rand = Math.random;

		// Primary wave ring(s)
		this.rings.push({
			x, y, t0: now,
			dur: status === 'alert' ? 520 : status === 'blocked' ? 560 : 380,
			r0: 5 * u,
			r1: (status === 'alert' ? 28 : status === 'starred' ? 26 : 22) * u,
			width: (status === 'alert' ? 2.4 : 2.0) * u,
			col: cols[0],
			dashed: status === 'blocked',
		});

		if (status === 'alert' || status === 'exclaim' || status === 'done') {
			this.rings.push({
				x, y, t0: now + 70,
				dur: 420,
				r0: 4 * u,
				r1: (status === 'alert' ? 34 : 20) * u,
				width: 1.4 * u,
				col: cols[1] || cols[0],
				dashed: false,
			});
		}

		// Status-specific particles
		const pushMote = (m) => {
			if (this.motes.length < 220) this.motes.push({ x, y, t0: now, ...m });
		};

		if (status === 'started') {
			for (let i = 0; i < 8; i++) {
				const spread = (rand() - 0.5) * 0.8;
				const spd = (95 + rand() * 145) * u;
				pushMote({
					kind: i < 3 ? 'chevron' : 'spark',
					vx: Math.cos(spread) * spd,
					vy: Math.sin(spread) * spd,
					grav: 0, drag: 4.5,
					size: (i < 3 ? 4.2 : 2.1) * u,
					life: 320 + rand() * 140,
					col: cols[i % cols.length],
				});
			}
		} else if (status === 'blocked') {
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2 + 0.25;
				const spd = (32 + rand() * 38) * u;
				pushMote({
					kind: 'bar',
					vx: Math.cos(a) * spd,
					vy: Math.sin(a) * spd + 15 * u,
					grav: 65 * u, drag: 3.5,
					size: (2.2 + rand() * 1.2) * u,
					rot: 0, vRot: 0,
					life: 440 + rand() * 140,
					col: cols[i % cols.length],
				});
			}
		} else if (status === 'dollar') {
			for (let i = 0; i < 9; i++) {
				const a = -Math.PI / 2 + (rand() - 0.5) * 1.8;
				const spd = (75 + rand() * 115) * u;
				pushMote({
					kind: i % 3 === 0 ? 'coin' : 'star',
					vx: Math.cos(a) * spd,
					vy: Math.sin(a) * spd,
					grav: 230 * u, drag: 2.2,
					size: (i % 3 === 0 ? 3.2 : 3.6) * u,
					rot: rand() * Math.PI, vRot: (rand() - 0.5) * 7,
					life: 460 + rand() * 180,
					col: cols[i % cols.length],
				});
			}
		} else if (status === 'exclaim') {
			for (let i = 0; i < 10; i++) {
				const a = (i / 10) * Math.PI * 2 + (rand() - 0.5) * 0.2;
				const spd = (90 + rand() * 110) * u;
				pushMote({
					kind: 'spike',
					vx: Math.cos(a) * spd,
					vy: Math.sin(a) * spd,
					grav: 0, drag: 5.2,
					size: (4.5 + rand() * 2.5) * u,
					rot: a, vRot: 0,
					life: 320 + rand() * 110,
					col: cols[i % cols.length],
				});
			}
		} else if (status === 'question') {
			for (let i = 0; i < 7; i++) {
				const a = -Math.PI / 2 + (rand() - 0.5) * 1.4;
				const spd = (45 + rand() * 70) * u;
				pushMote({
					kind: 'bubble',
					vx: Math.cos(a) * spd,
					vy: Math.sin(a) * spd - 20 * u,
					grav: -35 * u, drag: 2.5,
					size: (2.4 + rand() * 2.1) * u,
					sway: rand() * Math.PI * 2,
					life: 480 + rand() * 200,
					col: cols[i % cols.length],
				});
			}
		} else if (status === 'alert') {
			for (let i = 0; i < 12; i++) {
				const a = (i / 12) * Math.PI * 2 + rand() * 0.2;
				const spd = (80 + rand() * 130) * u;
				pushMote({
					kind: i % 2 === 0 ? 'spike' : 'spark',
					vx: Math.cos(a) * spd,
					vy: Math.sin(a) * spd,
					grav: 40 * u, drag: 4.0,
					size: (3.2 + rand() * 2.2) * u,
					rot: a, vRot: 0,
					life: 380 + rand() * 150,
					col: cols[i % cols.length],
				});
			}
		} else if (status === 'starred') {
			for (let i = 0; i < 11; i++) {
				const a = (i / 11) * Math.PI * 2 + rand() * 0.3;
				const spd = (65 + rand() * 115) * u;
				pushMote({
					kind: 'star',
					vx: Math.cos(a) * spd,
					vy: Math.sin(a) * spd - 25 * u,
					grav: 110 * u, drag: 2.4,
					size: (3.0 + rand() * 2.6) * u,
					rot: rand() * Math.PI, vRot: (rand() - 0.5) * 8,
					life: 480 + rand() * 220,
					col: cols[i % cols.length],
				});
			}
		} else if (status === 'canceled') {
			for (let i = 0; i < 8; i++) {
				const side = i % 2 === 0 ? -Math.PI * 0.25 : Math.PI * 0.75;
				const a = side + (rand() - 0.5) * 0.45;
				const spd = (55 + rand() * 75) * u;
				pushMote({
					kind: 'slash',
					vx: Math.cos(a) * spd,
					vy: Math.sin(a) * spd,
					grav: 0, drag: 4.8,
					size: (4.2 + rand() * 2) * u,
					rot: -Math.PI * 0.25, vRot: 0,
					life: 310 + rand() * 110,
					col: cols[i % cols.length],
				});
			}
		} else if (status === 'done') {
			for (let i = 0; i < 8; i++) {
				const a = (i / 8) * Math.PI * 2 + rand() * 0.25;
				const spd = (65 + rand() * 80) * u;
				pushMote({
					kind: 'spark',
					vx: Math.cos(a) * spd,
					vy: Math.sin(a) * spd,
					grav: 90 * u, drag: 4.5,
					size: (1.8 + rand() * 1.1) * u,
					life: 310 + rand() * 110,
					col: cols[i % cols.length],
				});
			}
		}

		this.kick();
	}

	kick() {
		if (!this.raf && this.active()) {
			this.lastMs = 0;
			this.raf = requestAnimationFrame((now) => this.frame(now));
		}
	}

	frame(now) {
		this.raf = 0;
		const ctx = this.ctx;
		if (!ctx || !this.canvas) return;
		const dt = this.lastMs ? Math.min(0.05, Math.max(0.001, (now - this.lastMs) / 1000)) : 0.016;
		this.lastMs = now;

		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, this.w, this.h);

		// 1. Rings
		const nextRings = [];
		for (const r of this.rings) {
			const f = (now - r.t0) / r.dur;
			if (f < 0) { nextRings.push(r); continue; }
			if (f >= 1) continue;
			nextRings.push(r);
			const ease = 1 - (1 - f) * (1 - f) * (1 - f);
			const rad = r.r0 + (r.r1 - r.r0) * ease;
			const alpha = (1 - f) * 0.85;
			ctx.save();
			if (r.dashed) ctx.setLineDash([3.5, 3]);
			ctx.beginPath();
			ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
			ctx.lineWidth = Math.max(0.7, r.width * (1 - f * 0.7));
			ctx.strokeStyle = hexToRgba(r.col, alpha);
			ctx.stroke();
			ctx.restore();
		}
		this.rings = nextRings;

		// 2. Motes
		const nextMotes = [];
		for (const m of this.motes) {
			const f = (now - m.t0) / m.life;
			if (f >= 1) continue;
			nextMotes.push(m);
			const drag = Math.exp(-(m.drag || 3) * dt);
			m.vx *= drag;
			m.vy *= drag;
			m.vy += (m.grav || 0) * dt;
			if (m.sway !== undefined) m.vx += Math.sin(now * 0.012 + m.sway) * 28 * dt;
			m.x += m.vx * dt;
			m.y += m.vy * dt;
			if (m.vRot) m.rot = (m.rot || 0) + m.vRot * dt;

			const alpha = 1 - f * f;
			const s = m.size * (m.kind === 'bubble' ? 0.65 + 0.55 * f : 1 - 0.35 * f);
			ctx.save();
			ctx.translate(m.x, m.y);
			if (m.rot) ctx.rotate(m.rot);
			if (m.kind === 'star') {
				ctx.beginPath();
				ctx.moveTo(0, -s); ctx.lineTo(s * 0.28, -s * 0.28);
				ctx.lineTo(s, 0); ctx.lineTo(s * 0.28, s * 0.28);
				ctx.lineTo(0, s); ctx.lineTo(-s * 0.28, s * 0.28);
				ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.28, -s * 0.28);
				ctx.closePath();
				ctx.fillStyle = hexToRgba(m.col, alpha);
				ctx.fill();
			} else if (m.kind === 'chevron') {
				ctx.beginPath();
				ctx.moveTo(-s * 0.45, -s * 0.65); ctx.lineTo(s * 0.55, 0); ctx.lineTo(-s * 0.45, s * 0.65);
				ctx.lineWidth = Math.max(1.2, s * 0.34);
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';
				ctx.strokeStyle = hexToRgba(m.col, alpha);
				ctx.stroke();
			} else if (m.kind === 'bubble') {
				ctx.beginPath();
				ctx.arc(0, 0, s, 0, Math.PI * 2);
				ctx.lineWidth = 1.25;
				ctx.strokeStyle = hexToRgba(m.col, alpha * 0.9);
				ctx.fillStyle = hexToRgba(m.col, alpha * 0.22);
				ctx.fill();
				ctx.stroke();
			} else if (m.kind === 'coin') {
				ctx.beginPath();
				ctx.arc(0, 0, s, 0, Math.PI * 2);
				ctx.fillStyle = hexToRgba(m.col, alpha * 0.85);
				ctx.fill();
				ctx.lineWidth = 1;
				ctx.strokeStyle = hexToRgba('#fef08a', alpha);
				ctx.stroke();
			} else if (m.kind === 'spike' || m.kind === 'slash') {
				ctx.beginPath();
				ctx.moveTo(-s * 0.65, 0); ctx.lineTo(s * 0.65, 0);
				ctx.lineWidth = Math.max(1.2, m.size * 0.32 * (1 - f * 0.6));
				ctx.lineCap = 'round';
				ctx.strokeStyle = hexToRgba(m.col, alpha);
				ctx.stroke();
			} else if (m.kind === 'bar') {
				ctx.fillStyle = hexToRgba(m.col, alpha);
				ctx.fillRect(-s * 0.35, -s * 0.8, s * 0.7, s * 1.6);
			} else {
				ctx.beginPath();
				ctx.arc(0, 0, s, 0, Math.PI * 2);
				ctx.fillStyle = hexToRgba(m.col, alpha);
				ctx.fill();
			}
			ctx.restore();
		}
		this.motes = nextMotes;

		if (this.active()) {
			this.raf = requestAnimationFrame((next) => this.frame(next));
		} else {
			this.lastMs = 0;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, this.w * this.dpr, this.h * this.dpr);
		}
	}
}

// ---- Plugin Entrypoint ---------------------------------------------------------------

class Plugin extends AppPlugin {
	onLoad() {
		this.cleanup = [];
		this.eventIds = [];
		this.page = null;
		this.dark = true;
		this.cfg = { preset: 'neon-glass', anim: true, bursts: true, rowTint: true };
		this.bursts = new TaskBurstSystem();
		this.undoneByGuid = loadUndoneMap();
		this.syncTimer = 0;

		this.readConfig();
		this.updatePolarity(true);
		this.bursts.mount();

		const onResize = () => this.bursts.resize();
		window.addEventListener('resize', onResize);
		this.cleanup.push(() => window.removeEventListener('resize', onResize));

		this.installThemeObserver();
		this.installTaskObserver();

		this.ui.registerCustomPanelType(BT_PAGE_TYPE, (panel) => this.renderPage(panel));
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: open settings', icon: 'ti-checks', onSelected: () => this.openPage() });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: cycle style preset', icon: 'ti-palette', onSelected: () => this.cyclePreset() });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: toggle animations', icon: 'ti-sparkles', onSelected: () => this.update({ anim: !this.cfg.anim }, true) });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: toggle transition bursts', icon: 'ti-confetti', onSelected: () => this.update({ bursts: !this.cfg.bursts }, true) });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: toggle row tint', icon: 'ti-highlight', onSelected: () => this.update({ rowTint: !this.cfg.rowTint }, true) });

		this.eventIds.push(this.events.on('global-plugin.updated', () => this.readConfig()));
		this.eventIds.push(this.events.on('panel.navigated', () => this.scheduleSyncDoneOrigins()));
		this.eventIds.push(this.events.on('panel.focused', () => this.scheduleSyncDoneOrigins()));
		this.eventIds.push(this.events.on('record.updated', () => this.scheduleSyncDoneOrigins()));
		this.scheduleSyncDoneOrigins();
	}

	onUnload() {
		clearTimeout(this.syncTimer);
		for (const fn of this.cleanup) {
			try { fn(); } catch (e) { /* ignore */ }
		}
		this.cleanup = [];
		for (const id of this.eventIds) {
			try { this.events.off(id); } catch (e) { /* ignore */ }
		}
		this.eventIds = [];
		this.bursts.destroy();
		this.clearBodyClasses();
		document.querySelectorAll('.listitem-task[data-bt-was]').forEach((el) => el.removeAttribute('data-bt-was'));
		this.page = null;
	}

	readConfig() {
		let custom = {};
		try { custom = this.getConfiguration()?.custom || {}; } catch (e) { custom = {}; }
		const merged = { preset: 'neon-glass', anim: true, bursts: true, rowTint: true, ...custom, ...loadChoices() };
		this.cfg = {
			preset: PRESETS.some((p) => p.id === merged.preset) ? merged.preset : 'neon-glass',
			anim: merged.anim !== false,
			bursts: merged.bursts !== false,
			rowTint: merged.rowTint !== false,
		};
		this.applyBodyClasses();
		this.refreshPage();
	}

	update(patch, toast = false) {
		this.cfg = { ...this.cfg, ...patch };
		if (!PRESETS.some((p) => p.id === this.cfg.preset)) this.cfg.preset = 'neon-glass';
		saveChoices(patch);
		this.applyBodyClasses();
		this.refreshPage();
		if (toast) {
			const msg = patch.preset
				? `Style: ${PRESETS.find((p) => p.id === this.cfg.preset)?.label}`
				: Object.entries(patch).map(([k, v]) => `${k}: ${v ? 'On' : 'Off'}`).join(', ');
			this.ui.addToaster({ title: 'BetterTask', message: msg, dismissible: true, autoDestroyTime: 1400 });
		}
	}

	cyclePreset() {
		const idx = PRESETS.findIndex((p) => p.id === this.cfg.preset);
		const next = PRESETS[(idx + 1) % PRESETS.length];
		this.update({ preset: next.id }, true);
	}

	clearBodyClasses() {
		const cl = document.body?.classList;
		if (!cl) return;
		cl.remove('bt-on', 'bt-anim', 'bt-row-tint', 'bt-dark', 'bt-light');
		for (const p of PRESETS) cl.remove(`bt-preset-${p.id}`);
	}

	applyBodyClasses() {
		const cl = document.body?.classList;
		if (!cl) return;
		const setCls = (name, want) => {
			if (cl.contains(name) !== want) cl.toggle(name, want);
		};
		setCls('bt-on', true);
		setCls('bt-anim', !!this.cfg.anim);
		setCls('bt-row-tint', !!this.cfg.rowTint);
		setCls('bt-dark', !!this.dark);
		setCls('bt-light', !this.dark);
		for (const p of PRESETS) setCls(`bt-preset-${p.id}`, p.id === this.cfg.preset);
	}

	updatePolarity(force = false) {
		const next = detectDarkTheme();
		if (!force && next === this.dark) return;
		this.dark = next;
		this.applyBodyClasses();
	}

	installThemeObserver() {
		const check = () => this.updatePolarity(false);
		const mo = new MutationObserver(check);
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		mo.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'style'] });
		this.cleanup.push(() => mo.disconnect());
		const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
		if (mq && mq.addEventListener) {
			mq.addEventListener('change', check);
			this.cleanup.push(() => mq.removeEventListener('change', check));
		}
	}

	taskBoxRect(el) {
		if (!(el instanceof Element)) return null;
		const boxEl = el.querySelector?.(':scope > .line-check-div, .line-check-div') || el;
		const r = boxEl.getBoundingClientRect();
		if (!(r.width > 0) || !(r.height > 0)) return null;
		return r;
	}

	findTaskElByGuid(guid, cx, cy) {
		if (!guid || typeof CSS === 'undefined' || !CSS.escape) return null;
		const candidates = [...document.querySelectorAll(`.listitem-task[data-guid="${CSS.escape(guid)}"]`)]
			.filter((el) => !el.closest('.autocomplete--option-icon, .autocomplete--option, .bt-settings'));
		if (!candidates.length) return null;
		if (candidates.length === 1) return candidates[0];
		let best = candidates[0], bestScore = -1e9;
		for (const el of candidates) {
			const r = this.taskBoxRect(el);
			if (!r) continue;
			let score = el.closest('.panel.is-focused') ? 5000 : 0;
			if (Number.isFinite(cx) && Number.isFinite(cy)) {
				score -= Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
			}
			if (score > bestScore) { bestScore = score; best = el; }
		}
		return best;
	}

	applyDoneAttrToEl(el, forcedWas = undefined) {
		if (!(el instanceof Element) || !el.classList.contains('listitem-task')) return;
		if (!el.classList.contains('state-done')) {
			if (el.hasAttribute('data-bt-was')) el.removeAttribute('data-bt-was');
			return;
		}
		const guid = el.getAttribute('data-guid');
		const was = forcedWas !== undefined ? forcedWas : (guid ? this.undoneByGuid.get(guid) : el.getAttribute('data-bt-was'));
		if (was && was !== 'open' && was !== 'done') {
			if (el.getAttribute('data-bt-was') !== was) el.setAttribute('data-bt-was', was);
		} else if (el.hasAttribute('data-bt-was')) {
			el.removeAttribute('data-bt-was');
		}
	}

	applyDoneAttrsToRoot(root = document) {
		if (!root?.querySelectorAll) return;
		if (root instanceof Element && root.classList.contains('listitem-task')) this.applyDoneAttrToEl(root);
		root.querySelectorAll('.listitem-task[data-guid]').forEach((el) => this.applyDoneAttrToEl(el));
	}

	scheduleSyncDoneOrigins() {
		clearTimeout(this.syncTimer);
		this.syncTimer = setTimeout(() => { this.syncDoneOrigins(); }, 100);
	}

	async syncDoneOrigins() {
		try {
			const seenItems = [];
			const panels = this.ui.getPanels?.() || (this.ui.getActivePanel?.() ? [this.ui.getActivePanel()] : []);
			for (const p of panels) {
				const rec = p?.getActiveRecord?.();
				if (!rec?.getLineItems) continue;
				try {
					const items = await rec.getLineItems();
					if (Array.isArray(items)) seenItems.push(...items);
				} catch (e) { /* ignore */ }
			}
			if (this.data?.searchByQuery) {
				try {
					const res = await this.data.searchByQuery('@done', 150);
					if (Array.isArray(res?.lines)) seenItems.push(...res.lines);
				} catch (e) { /* ignore */ }
			}
			let dirty = false;
			for (const item of seenItems) {
				if (!item?.guid) continue;
				const st = item.getTaskStatus?.();
				if (st === 'done') {
					const was = statusFromCodeOrString(item.props?.undone);
					if (was && was !== 'open' && was !== 'done') {
						if (this.undoneByGuid.get(item.guid) !== was) {
							this.undoneByGuid.set(item.guid, was);
							dirty = true;
						}
					}
				} else if (st && st !== 'done' && this.undoneByGuid.has(item.guid)) {
					this.undoneByGuid.delete(item.guid);
					dirty = true;
				}
			}
			if (dirty) saveUndoneMap(this.undoneByGuid);
			this.applyDoneAttrsToRoot(document);
		} catch (e) { /* ignore */ }
	}

	emitAtTaskEl(el, status, originStatus = null) {
		if (!this.cfg.bursts) return;
		const r = this.taskBoxRect(el);
		if (!r) return;
		const origin = originStatus || el.getAttribute?.('data-bt-was') || null;
		this.bursts.emit(status, r.left + r.width / 2, r.top + r.height / 2, Math.max(r.width, r.height), origin);
	}

	installTaskObserver() {
		let gestureAt = -1e9;
		let lastX = NaN, lastY = NaN;
		const knownStatusByGuid = new Map();
		const lastBurstByGuid = new Map();
		const lastElStamp = new WeakMap();

		const mark = (e) => {
			gestureAt = performance.now();
			if (e.type === 'pointerdown' && typeof e.clientX === 'number') {
				lastX = e.clientX;
				lastY = e.clientY;
			}
		};
		document.addEventListener('pointerdown', mark, { capture: true, passive: true });
		document.addEventListener('keydown', mark, { capture: true, passive: true });

		const isRealTask = (el) => (
			el instanceof Element &&
			el.classList.contains('listitem-task') &&
			!el.closest('.autocomplete--option-icon, .autocomplete--option, .bt-settings')
		);

		const tryEmitGuid = (guid, nextStatus, elHint = null) => {
			const now = performance.now();
			const prevKnown = knownStatusByGuid.get(guid);
			const prevBurst = lastBurstByGuid.get(guid);
			if (prevKnown === nextStatus) return false;
			if (prevBurst && prevBurst.status === nextStatus && now - prevBurst.at < 2000) return false;
			knownStatusByGuid.set(guid, nextStatus);
			lastBurstByGuid.set(guid, { status: nextStatus, at: now });
			const was = nextStatus === 'done' ? this.undoneByGuid.get(guid) || null : null;
			const targetEl = elHint || this.findTaskElByGuid(guid, lastX, lastY);
			if (targetEl) {
				this.applyDoneAttrToEl(targetEl);
				this.emitAtTaskEl(targetEl, nextStatus, was);
			} else {
				requestAnimationFrame(() => {
					const delayed = this.findTaskElByGuid(guid, lastX, lastY);
					if (delayed && isRealTask(delayed)) {
						this.applyDoneAttrToEl(delayed);
						this.emitAtTaskEl(delayed, nextStatus, was);
					}
				});
			}
			return true;
		};

		const onLineUpdate = (ev) => {
			if (!ev?.lineItemGuid) return;
			const guid = ev.lineItemGuid;
			const nextStatus = ev.status !== null && ev.status !== undefined ? statusFromCodeOrString(ev.status) : null;
			const mp = ev.metaProperties || null;
			if (nextStatus === 'done') {
				let was = mp && 'undone' in mp ? statusFromCodeOrString(mp.undone) : null;
				if (!was) {
					const prev = knownStatusByGuid.get(guid);
					if (prev && prev !== 'open' && prev !== 'done') was = prev;
				}
				if (was && was !== 'open' && was !== 'done') {
					this.undoneByGuid.set(guid, was);
					saveUndoneMap(this.undoneByGuid);
				} else if (mp && 'undone' in mp && !mp.undone) {
					this.undoneByGuid.delete(guid);
					saveUndoneMap(this.undoneByGuid);
				}
			} else if (nextStatus && nextStatus !== 'done') {
				if (this.undoneByGuid.delete(guid)) saveUndoneMap(this.undoneByGuid);
			}

			if (typeof CSS !== 'undefined' && CSS.escape) {
				document.querySelectorAll(`.listitem-task[data-guid="${CSS.escape(guid)}"]`).forEach((el) => this.applyDoneAttrToEl(el));
			}

			if (!ev.source?.isLocal || !nextStatus) return;
			tryEmitGuid(guid, nextStatus);
		};
		this.eventIds.push(this.events.on('lineitem.updated', onLineUpdate, { collection: '*' }));

		const mo = new MutationObserver((muts) => {
			const now = performance.now();
			for (const m of muts) {
				if (m.type === 'childList') {
					for (const n of m.addedNodes) {
						if (n instanceof Element) this.applyDoneAttrsToRoot(n);
					}
					continue;
				}
				if (m.type !== 'attributes') continue;
				const el = m.target;
				if (!isRealTask(el)) continue;
				const prev = statusFromClassName(m.oldValue || '');
				const next = statusFromClassName(el.className || '');
				const guid = el.getAttribute('data-guid');
				if (prev === next) continue;

				if (guid) {
					if (next === 'done' && prev !== 'open' && prev !== 'done' && !this.undoneByGuid.has(guid)) {
						this.undoneByGuid.set(guid, prev);
						saveUndoneMap(this.undoneByGuid);
					} else if (next !== 'done' && prev === 'done') {
						if (this.undoneByGuid.delete(guid)) saveUndoneMap(this.undoneByGuid);
					}
					this.applyDoneAttrToEl(el);
					if (now - gestureAt <= 750) tryEmitGuid(guid, next, el);
				} else if (now - gestureAt <= 750) {
					if (next === 'done' && prev !== 'open' && prev !== 'done') el.setAttribute('data-bt-was', prev);
					else if (next !== 'done') el.removeAttribute('data-bt-was');
					const prevStamp = lastElStamp.get(el);
					if (!prevStamp || prevStamp.status !== next || now - prevStamp.at >= 400) {
						lastElStamp.set(el, { status: next, at: now });
						this.emitAtTaskEl(el, next);
					}
				}
			}
		});

		mo.observe(document.body, {
			attributes: true,
			attributeFilter: ['class'],
			attributeOldValue: true,
			childList: true,
			subtree: true,
		});

		this.cleanup.push(() => {
			mo.disconnect();
			document.removeEventListener('pointerdown', mark, true);
			document.removeEventListener('keydown', mark, true);
		});
	}

	// ---- Settings & Interactive Showcase Panel -----------------------------------------

	async openPage() {
		const panel = this.ui.getActivePanel() || await this.ui.createPanel();
		panel?.navigateToCustomType(BT_PAGE_TYPE);
	}

	renderPage(panel) {
		const host = panel.getElement();
		if (!host) return;
		panel.setTitle?.('BetterTask');

		const mk = (html) => {
			const d = document.createElement('div');
			d.innerHTML = html;
			return d.firstElementChild;
		};

		host.innerHTML = `<div class="bt-scroll"><div class="bt-settings">
  <div class="bt-head">
    <div>
      <div class="bt-title">BetterTask</div>
      <div class="bt-sub">Custom vector icons, per-status animations, and transition burst effects. Click any card or task below to test.</div>
    </div>
  </div>
  <div class="bt-controls">
    <div class="bt-panel">
      <div class="bt-panel-label">Visual Style</div>
      <div class="bt-seg"></div>
    </div>
    <div class="bt-panel">
      <div class="bt-panel-label">Effects</div>
      <div class="bt-toggles"></div>
    </div>
  </div>
  <div class="bt-panel-label">All Statuses (click to trigger effect)</div>
  <div class="bt-grid"></div>
  <div class="bt-playground">
    <div class="bt-panel-label">Interactive Task Playground (click checkbox to cycle)</div>
    <div class="bt-play-list"></div>
  </div>
</div></div>`;

		const root = host.querySelector('.bt-settings');
		this.page = { root };

		const seg = root.querySelector('.bt-seg');
		for (const p of PRESETS) {
			const b = mk(`<button type="button" class="bt-seg-btn" data-preset="${p.id}"></button>`);
			b.textContent = p.label;
			b.onclick = () => this.update({ preset: p.id });
			seg.appendChild(b);
		}

		const toggles = root.querySelector('.bt-toggles');
		for (const [key, label] of [
			['anim', 'Ambient motion'],
			['bursts', 'Transition FX'],
			['rowTint', 'Row mood tint'],
		]) {
			const b = mk(`<button type="button" class="bt-toggle" data-key="${key}"><span class="bt-dot"></span><span></span></button>`);
			b.querySelector('span:last-child').textContent = label;
			b.onclick = () => this.update({ [key]: !this.cfg[key] });
			toggles.appendChild(b);
		}

		const grid = root.querySelector('.bt-grid');
		for (const spec of STATUS_SPECS) {
			const card = mk(`<button type="button" class="bt-card">
  <div class="bt-card-top">
    <div class="listitem-task ${spec.cls}"><div class="line-check-div"></div></div>
    <span class="bt-kbd">${spec.kbd}</span>
  </div>
  <div>
    <div class="bt-card-name"></div>
    <div class="bt-card-fx"></div>
  </div>
</button>`);
			card.querySelector('.bt-card-name').textContent = spec.name;
			card.querySelector('.bt-card-fx').textContent = spec.fxLabel;
			card.onclick = () => this.emitAtTaskEl(card.querySelector('.listitem-task'), spec.key);
			grid.appendChild(card);
		}

		const playList = root.querySelector('.bt-play-list');
		for (const spec of STATUS_SPECS) {
			const row = mk(`<div class="listitem-task ${spec.cls}" data-status="${spec.key}" data-origin="${spec.key}"><div class="line-check-div"></div><div class="line-div"></div><button type="button" class="bt-done-btn"></button></div>`);
			row.querySelector('.line-div').textContent = spec.sampleText;
			const doneBtn = row.querySelector('.bt-done-btn');
			const updateBtnLabel = () => {
				const isDone = row.dataset.status === 'done';
				doneBtn.classList.toggle('is-done', isDone);
				doneBtn.textContent = isDone ? 'Restore' : 'Complete';
			};
			updateBtnLabel();
			row.querySelector('.line-check-div').onclick = () => {
				const cur = row.dataset.status || 'open';
				const next = CYCLE_ORDER[(CYCLE_ORDER.indexOf(cur) + 1) % CYCLE_ORDER.length];
				const nextSpec = STATUS_MAP.get(next);
				for (const s of STATUS_SPECS) if (s.cls) row.classList.remove(s.cls);
				if (nextSpec.cls) row.classList.add(nextSpec.cls);
				if (next === 'done' && cur !== 'open' && cur !== 'done') {
					row.setAttribute('data-bt-was', cur);
					row.dataset.origin = cur;
				} else if (next !== 'done') {
					row.removeAttribute('data-bt-was');
					row.dataset.origin = next;
				}
				row.dataset.status = next;
				updateBtnLabel();
				this.emitAtTaskEl(row, next, row.getAttribute('data-bt-was'));
			};
			doneBtn.onclick = () => {
				const cur = row.dataset.status || 'open';
				const orig = row.dataset.origin && row.dataset.origin !== 'done' ? row.dataset.origin : 'open';
				const next = cur === 'done' ? orig : 'done';
				const nextSpec = STATUS_MAP.get(next);
				for (const s of STATUS_SPECS) if (s.cls) row.classList.remove(s.cls);
				if (nextSpec.cls) row.classList.add(nextSpec.cls);
				if (next === 'done' && orig !== 'open' && orig !== 'done') {
					row.setAttribute('data-bt-was', orig);
				} else {
					row.removeAttribute('data-bt-was');
				}
				row.dataset.status = next;
				updateBtnLabel();
				this.emitAtTaskEl(row, next, row.getAttribute('data-bt-was'));
			};
			playList.appendChild(row);
		}

		this.refreshPage();
	}

	refreshPage() {
		const root = this.page?.root;
		if (!root) return;
		if (!root.isConnected) { this.page = null; return; }
		root.querySelectorAll('.bt-seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.preset === this.cfg.preset));
		root.querySelectorAll('.bt-toggle').forEach((b) => b.classList.toggle('is-on', !!this.cfg[b.dataset.key]));
	}
}
