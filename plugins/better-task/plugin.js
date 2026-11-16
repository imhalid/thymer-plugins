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

function computeSubtaskStats(items) {
	const byGuid = new Map();
	const childrenByParent = new Map();
	const queue = Array.isArray(items) ? [...items] : [];
	for (let i = 0; i < queue.length; i++) {
		const it = queue[i];
		if (!it?.guid || byGuid.has(it.guid)) continue;
		byGuid.set(it.guid, it);
		if (Array.isArray(it.children)) {
			for (const ch of it.children) if (ch?.guid && !byGuid.has(ch.guid)) queue.push(ch);
		}
	}
	for (const it of byGuid.values()) {
		const p = it.parent_guid;
		if (!p || p === it.guid) continue;
		let arr = childrenByParent.get(p);
		if (!arr) { arr = []; childrenByParent.set(p, arr); }
		arr.push(it);
	}

	const memo = new Map();
	const visiting = new Set();
	const walk = (guid) => {
		const hit = memo.get(guid);
		if (hit) return hit;
		if (visiting.has(guid)) return { total: 0, done: 0, canceled: 0, started: 0, urgent: 0 };
		visiting.add(guid);
		const acc = { total: 0, done: 0, canceled: 0, started: 0, urgent: 0 };
		for (const c of childrenByParent.get(guid) || []) {
			const sub = walk(c.guid);
			acc.total += sub.total;
			acc.done += sub.done;
			acc.canceled += sub.canceled;
			acc.started += sub.started;
			acc.urgent += sub.urgent;
			if (c.type === 'task') {
				acc.total += 1;
				const st = statusFromCodeOrString(c.getTaskStatus?.() ?? c.props?.done ?? 'none') || 'open';
				if (st === 'done') acc.done += 1;
				else if (st === 'canceled') acc.canceled += 1;
				else if (st === 'started') acc.started += 1;
				else if (st === 'alert' || st === 'exclaim') acc.urgent += 1;
			}
		}
		visiting.delete(guid);
		memo.set(guid, acc);
		return acc;
	};

	const out = new Map();
	for (const it of byGuid.values()) {
		if (it.type !== 'task') continue;
		const s = walk(it.guid);
		if (s.total <= 0) continue;
		const activeTotal = Math.max(0, s.total - s.canceled);
		const pct = activeTotal > 0 ? Math.round((s.done / activeTotal) * 100) : 100;
		const label = activeTotal > 0 ? `${s.done}/${activeTotal}` : `0/${s.total}`;
		const state = activeTotal === 0
			? 'canceled'
			: s.done >= activeTotal
				? 'done'
				: s.urgent > 0
					? 'urgent'
					: s.started > 0
						? 'started'
						: 'open';
		out.set(it.guid, { ...s, activeTotal, pct, label, state });
	}
	return out;
}

const SUB_RING_CACHE = new Map();
const SUB_RING_PALETTE = {
	dark: {
		track: 'rgba(148,163,184,0.34)',
		open: '#38bdf8',
		started: '#22d3ee',
		urgent: '#fb7185',
		done: '#10b981',
		canceled: '#94a3b8',
	},
	light: {
		track: 'rgba(71,85,105,0.28)',
		open: '#0284c7',
		started: '#0284c7',
		urgent: '#e11d48',
		done: '#059669',
		canceled: '#64748b',
	},
};

function dashArraySeq(count, d, g, rest) {
	const seq = [];
	for (let i = 0; i < count; i++) seq.push(d, i + 1 < count ? g : rest);
	return seq.join(' ');
}

function buildSubRingUri(st, dark = true) {
	if (!st) return '';
	const count = st.activeTotal > 0 ? st.activeTotal : st.total;
	if (!(count > 0)) return '';
	const filled = st.activeTotal > 0 ? Math.min(Math.max(0, st.done || 0), count) : 0;
	const state = st.state || 'open';
	const key = `${filled}|${count}|${state}|${dark ? 1 : 0}`;
	const hit = SUB_RING_CACHE.get(key);
	if (hit) return hit;

	const pal = dark ? SUB_RING_PALETTE.dark : SUB_RING_PALETTE.light;
	const fg = pal[state] || pal.open;
	const track = pal.track;
	const r = 5.4;
	const C = 2 * Math.PI * r;
	const rest = (C + 4).toFixed(2);
	let body = '';

	if (count > 10) {
		const sw = '1.9';
		if (filled >= count) {
			body = `<circle cx="8" cy="8" r="${r}" fill="none" stroke="${fg}" stroke-width="${sw}"/>`;
		} else {
			body = `<circle cx="8" cy="8" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}"/>`;
			if (filled > 0) {
				const arc = ((filled / count) * C).toFixed(2);
				body += `<circle cx="8" cy="8" r="${r}" fill="none" stroke="${fg}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${arc} ${rest}" transform="rotate(-90 8 8)"/>`;
			}
		}
	} else {
		const visualN = count === 1 ? 6 : count;
		const visualFilled = count === 1 ? (filled >= 1 ? 6 : 0) : filled;
		const seg = C / visualN;
		const sw = visualN <= 4 ? 1.85 : visualN <= 7 ? 1.75 : 1.55;
		const gapVis = visualN <= 3 ? 2.6 : visualN <= 5 ? 2.0 : visualN <= 7 ? 1.65 : 1.2;
		const d = Number(Math.max(0.4, seg - gapVis - sw).toFixed(3));
		const g = Number((seg - d).toFixed(3));
		const rot = -90 + ((g / 2) / C) * 360;

		if (visualFilled >= visualN) {
			body = `<circle cx="8" cy="8" r="${r}" fill="none" stroke="${fg}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${d} ${g}" transform="rotate(${rot.toFixed(2)} 8 8)"/>`;
		} else if (visualFilled <= 0) {
			body = `<circle cx="8" cy="8" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${d} ${g}" transform="rotate(${rot.toFixed(2)} 8 8)"/>`;
		} else {
			const rem = visualN - visualFilled;
			const fgArr = dashArraySeq(visualFilled, d, g, rest);
			const trArr = dashArraySeq(rem, d, g, rest);
			const trRot = rot + (visualFilled * 360) / visualN;
			body =
				`<circle cx="8" cy="8" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${trArr}" transform="rotate(${trRot.toFixed(2)} 8 8)"/>` +
				`<circle cx="8" cy="8" r="${r}" fill="none" stroke="${fg}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${fgArr}" transform="rotate(${rot.toFixed(2)} 8 8)"/>`;
		}
	}

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${body}</svg>`;
	const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
	if (SUB_RING_CACHE.size > 512) SUB_RING_CACHE.clear();
	SUB_RING_CACHE.set(key, uri);
	return uri;
}

function applySubStatAttrs(el, st, dark = true) {
	if (!st) {
		if (el.hasAttribute('data-bt-sub')) el.removeAttribute('data-bt-sub');
		if (el.hasAttribute('data-bt-sub-state')) el.removeAttribute('data-bt-sub-state');
		el.style?.removeProperty('--bt-sub-ring');
		el.style?.removeProperty('--bt-sub-pct');
		return;
	}
	const ring = buildSubRingUri(st, dark);
	if (el.getAttribute('data-bt-sub') !== st.label) el.setAttribute('data-bt-sub', st.label);
	if (el.getAttribute('data-bt-sub-state') !== st.state) el.setAttribute('data-bt-sub-state', st.state);
	if (el.style?.getPropertyValue('--bt-sub-ring') !== ring) el.style?.setProperty('--bt-sub-ring', ring);
	el.style?.removeProperty('--bt-sub-pct');
}

function statusFromClassName(cls) {
	if (!cls) return 'open';
	const s = String(cls);
	for (const spec of STATUS_SPECS) {
		if (spec.cls && new RegExp(`(?:^|\\s)${spec.cls}(?:\\s|$)`).test(s)) return spec.key;
	}
	return 'open';
}

const MD_TASK_LINE_RE = /^([ \t]*)([-*+]\s+)?\[([ xX>|!$?^*c#\-✓✔]?)\](?:\s+(.*)|\s*)$/;
const MD_MARK_ALIAS = { '': ' ', '-': 'c', '✓': 'x', '✔': 'x', X: 'x' };

function prepareTaskMarkdownPaste(raw, onTaskRow = false) {
	if (typeof raw !== 'string') return null;
	const lines = raw.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n');
	const parsed = [];
	let inFence = false;
	let prefixedTasks = 0;
	let bareTasks = 0;

	for (const rawLine of lines) {
		const line = rawLine.replace(/^[\u200b-\u200d\ufeff]+/, '');
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			parsed.push({ kind: 'other', out: line });
			continue;
		}
		if (inFence) {
			parsed.push({ kind: 'other', out: line });
			continue;
		}
		if (!line.trim()) {
			parsed.push({ kind: 'blank', out: '' });
			continue;
		}
		const m = line.match(MD_TASK_LINE_RE);
		if (m) {
			const indent = m[1] || '';
			const hasBullet = Boolean(m[2]);
			const rawMark = m[3] ?? ' ';
			const mark = MD_MARK_ALIAS[rawMark] ?? rawMark;
			const body = m[4] ?? '';
			const out = body ? `${indent}- [${mark}] ${body}` : `${indent}- [${mark}]`;
			if (hasBullet) prefixedTasks += 1;
			else bareTasks += 1;
			parsed.push({ kind: 'task', hasBullet, out });
			continue;
		}
		parsed.push({ kind: 'other', out: line });
	}

	const totalTasks = prefixedTasks + bareTasks;
	if (totalTasks === 0) return null;
	if (prefixedTasks === 0 && bareTasks < 2 && !(bareTasks === 1 && onTaskRow)) return null;

	while (parsed.length && parsed[0].kind === 'blank') parsed.shift();
	while (parsed.length && parsed[parsed.length - 1].kind === 'blank') parsed.pop();
	if (!parsed.length) return null;

	const outLines = [];
	for (let i = 0; i < parsed.length; i++) {
		const cur = parsed[i];
		if (cur.kind === 'blank') {
			let prev = null;
			for (let p = i - 1; p >= 0; p--) {
				if (parsed[p].kind !== 'blank') { prev = parsed[p]; break; }
			}
			let next = null;
			for (let n = i + 1; n < parsed.length; n++) {
				if (parsed[n].kind !== 'blank') { next = parsed[n]; break; }
			}
			if (prev?.kind === 'task' && next?.kind === 'task') continue;
		}
		outLines.push(cur.out);
	}
	return outLines.join('\n');
}

function isLineItemEmpty(item, childrenLen) {
	if (!item || childrenLen > 0) return false;
	if (!['text', 'empty', 'task', 'ulist', 'olist'].includes(item.type)) return false;
	if (!Array.isArray(item.segments) || item.segments.length === 0) return true;
	return item.segments.every((seg) => !String(typeof seg?.text === 'string' ? seg.text : '').trim());
}

function isBlockedPasteTarget(node) {
	if (!(node instanceof Element)) return false;
	if (node.closest('.bt-settings, .cm-editor, .inline-terminal, .block-codelang')) return true;
	if (node.closest('#virtualinput-wrapper')) return false;
	return Boolean(node.closest('input, textarea, select, [contenteditable]'));
}

function findActiveCaretEl(root) {
	const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
	const ae = document.activeElement;
	const focusBox = ae && ae !== document.body && typeof ae.getBoundingClientRect === 'function'
		? ae.getBoundingClientRect()
		: null;
	let best = null, bestScore = -1e9;
	for (const n of scope.querySelectorAll('div.listview-caret-self')) {
		if (n.classList?.contains('caret-inactive')) continue;
		const b = n.getBoundingClientRect?.();
		if (!b || !(b.height > 0.5)) continue;
		const cs = typeof getComputedStyle === 'function' ? getComputedStyle(n) : null;
		if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) continue;
		let score = n.closest?.('listview-editor') ? 4 : 0;
		if (n.closest?.('.panel.focused-panel, .panel.has-focus')) score += 2;
		if (focusBox) {
			const bBot = b.bottom ?? (b.top + b.height);
			const fBot = focusBox.bottom ?? (focusBox.top + focusBox.height);
			const dy = Math.max(0, focusBox.top - bBot, b.top - fBot);
			score -= Math.min(dy, 5000) / 5000;
		}
		if (score > bestScore) { bestScore = score; best = n; }
	}
	return best;
}

function findRowForCaret(caretEl, panelEl) {
	const ed = caretEl?.closest?.('listview-editor') || panelEl?.querySelector?.('listview-editor') || null;
	if (!ed) return null;
	const b = caretEl?.getBoundingClientRect?.();
	if (b && b.height > 0.5) {
		const midY = b.top + b.height / 2;
		const matchesLine = (row) => {
			if (!row || !(row instanceof Element) || !ed.contains(row)) return false;
			const line = row.querySelector?.(':scope > .line-div') || row;
			const lr = line.getBoundingClientRect?.();
			const lBot = lr ? (lr.bottom ?? (lr.top + lr.height)) : 0;
			return lr && lr.height > 0 && midY >= lr.top - 4 && midY <= lBot + 4;
		};
		const direct = caretEl.closest?.('.listitem[data-guid]');
		if (matchesLine(direct)) return direct;
		if (typeof document.elementFromPoint === 'function') {
			for (const x of [b.left + 4, b.left + 24, b.left - 4]) {
				const hit = document.elementFromPoint(x, midY)?.closest?.('.listitem[data-guid]');
				if (matchesLine(hit)) return hit;
			}
		}
		const rows = [...ed.querySelectorAll('.listitem[data-guid]')].reverse();
		for (const row of rows) {
			if (matchesLine(row)) return row;
		}
	}
	const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
	const anchor = sel?.anchorNode;
	const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
	if (anchorEl && !anchorEl.closest?.('#magic_selector')) {
		const hit = anchorEl.closest?.('.listitem[data-guid]');
		if (hit && ed.contains(hit)) return hit;
	}
	return null;
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
		this.cfg = { preset: 'neon-glass', anim: true, bursts: true, rowTint: true, subCounters: true, smartPaste: true };
		this.bursts = new TaskBurstSystem();
		this.undoneByGuid = loadUndoneMap();
		this.prevStatusByGuid = new Map();
		this.subStatsByGuid = new Map();
		this.syncTimer = 0;

		this.readConfig();
		this.updatePolarity(true);
		this.bursts.mount();

		const onResize = () => this.bursts.resize();
		window.addEventListener('resize', onResize);
		this.cleanup.push(() => window.removeEventListener('resize', onResize));

		this.installThemeObserver();
		this.installTaskObserver();
		this.installSmartTaskPaste();

		this.ui.registerCustomPanelType(BT_PAGE_TYPE, (panel) => this.renderPage(panel));
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: open settings', icon: 'ti-checks', onSelected: () => this.openPage() });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: cycle style preset', icon: 'ti-palette', onSelected: () => this.cyclePreset() });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: toggle animations', icon: 'ti-sparkles', onSelected: () => this.update({ anim: !this.cfg.anim }, true) });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: toggle transition bursts', icon: 'ti-confetti', onSelected: () => this.update({ bursts: !this.cfg.bursts }, true) });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: toggle row tint', icon: 'ti-highlight', onSelected: () => this.update({ rowTint: !this.cfg.rowTint }, true) });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: toggle subtask counts', icon: 'ti-list-numbers', onSelected: () => this.update({ subCounters: !this.cfg.subCounters }, true) });
		this.ui.addCommandPaletteCommand({ label: 'BetterTask: toggle smart task paste', icon: 'ti-clipboard-check', onSelected: () => this.update({ smartPaste: !this.cfg.smartPaste }, true) });

		this.eventIds.push(this.events.on('global-plugin.updated', () => this.readConfig()));
		this.eventIds.push(this.events.on('panel.navigated', () => this.scheduleSyncDoneOrigins()));
		this.eventIds.push(this.events.on('panel.focused', () => this.scheduleSyncDoneOrigins()));
		this.eventIds.push(this.events.on('record.updated', () => this.scheduleSyncDoneOrigins()));
		this.eventIds.push(this.events.on('lineitem.created', () => this.scheduleSyncDoneOrigins(), { collection: '*' }));
		this.eventIds.push(this.events.on('lineitem.moved', () => this.scheduleSyncDoneOrigins(), { collection: '*' }));
		this.eventIds.push(this.events.on('lineitem.deleted', () => this.scheduleSyncDoneOrigins(), { collection: '*' }));
		this.eventIds.push(this.events.on('lineitem.undeleted', () => this.scheduleSyncDoneOrigins(), { collection: '*' }));
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
		document.querySelectorAll('.listitem-task[data-bt-sub]').forEach((el) => {
			el.removeAttribute('data-bt-sub');
			el.removeAttribute('data-bt-sub-state');
			el.style?.removeProperty('--bt-sub-ring');
			el.style?.removeProperty('--bt-sub-pct');
		});
		this.page = null;
	}

	readConfig() {
		let custom = {};
		try { custom = this.getConfiguration()?.custom || {}; } catch (e) { custom = {}; }
		const merged = { preset: 'neon-glass', anim: true, bursts: true, rowTint: true, subCounters: true, smartPaste: true, ...custom, ...loadChoices() };
		this.cfg = {
			preset: PRESETS.some((p) => p.id === merged.preset) ? merged.preset : 'neon-glass',
			anim: merged.anim !== false,
			bursts: merged.bursts !== false,
			rowTint: merged.rowTint !== false,
			subCounters: merged.subCounters !== false,
			smartPaste: merged.smartPaste !== false,
		};
		this.applyBodyClasses();
		this.applyDoneAttrsToRoot();
		this.refreshPage();
	}

	update(patch, toast = false) {
		this.cfg = { ...this.cfg, ...patch };
		if (!PRESETS.some((p) => p.id === this.cfg.preset)) this.cfg.preset = 'neon-glass';
		saveChoices(patch);
		this.applyBodyClasses();
		if ('subCounters' in patch) {
			this.applyDoneAttrsToRoot();
			if (this.cfg.subCounters) this.scheduleSyncDoneOrigins();
		}
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
		cl.remove('bt-on', 'bt-anim', 'bt-row-tint', 'bt-sub-counts', 'bt-dark', 'bt-light');
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
		setCls('bt-sub-counts', !!this.cfg.subCounters);
		setCls('bt-dark', !!this.dark);
		setCls('bt-light', !this.dark);
		for (const p of PRESETS) setCls(`bt-preset-${p.id}`, p.id === this.cfg.preset);
	}

	updatePolarity(force = false) {
		const next = detectDarkTheme();
		if (!force && next === this.dark) return;
		this.dark = next;
		this.applyBodyClasses();
		this.applyDoneAttrsToRoot();
		this.page?.refreshStack?.();
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
		const guid = el.getAttribute('data-guid');
		if (!el.classList.contains('state-done')) {
			const curSt = statusFromClassName(el.className);
			if (guid) {
				if (curSt && curSt !== 'open') this.prevStatusByGuid?.set(guid, curSt);
				else this.prevStatusByGuid?.delete(guid);
				if (this.undoneByGuid.delete(guid)) saveUndoneMap(this.undoneByGuid);
			}
			if (el.hasAttribute('data-bt-was')) el.removeAttribute('data-bt-was');
			return;
		}
		const was = forcedWas !== undefined
			? forcedWas
			: (guid ? (this.undoneByGuid.get(guid) || this.prevStatusByGuid?.get(guid)) : el.getAttribute('data-bt-was'));
		if (was && was !== 'open' && was !== 'done') {
			if (guid && !this.undoneByGuid.has(guid)) {
				this.undoneByGuid.set(guid, was);
				saveUndoneMap(this.undoneByGuid);
			}
			if (el.getAttribute('data-bt-was') !== was) el.setAttribute('data-bt-was', was);
		} else if (el.hasAttribute('data-bt-was')) {
			el.removeAttribute('data-bt-was');
		}
	}

	applyDoneAttrsToRoot(root = document) {
		if (!root?.querySelectorAll) return;
		if (root instanceof Element && root.classList.contains('listitem-task')) {
			this.applyDoneAttrToEl(root);
			this.applySubStatToEl(root);
		}
		root.querySelectorAll('.listitem-task[data-guid]').forEach((el) => {
			this.applyDoneAttrToEl(el);
			this.applySubStatToEl(el);
		});
	}

	applySubStatToEl(el) {
		if (!(el instanceof Element) || !el.classList.contains('listitem-task') || el.closest('.bt-settings, .autocomplete--option-icon')) return;
		const guid = el.getAttribute('data-guid');
		const st = this.cfg.subCounters && guid ? this.subStatsByGuid.get(guid) : null;
		applySubStatAttrs(el, st, this.dark);
	}

	scheduleSyncDoneOrigins() {
		clearTimeout(this.syncTimer);
		this.syncTimer = setTimeout(() => { this.syncDoneOrigins(); }, 90);
	}

	async syncDoneOrigins() {
		try {
			const seenItems = [];
			const nextSubStats = new Map();
			const panels = this.ui.getPanels?.() || (this.ui.getActivePanel?.() ? [this.ui.getActivePanel()] : []);
			for (const p of panels) {
				const rec = p?.getActiveRecord?.();
				if (!rec?.getLineItems) continue;
				try {
					const items = await rec.getLineItems();
					if (Array.isArray(items)) {
						seenItems.push(...items);
						if (this.cfg.subCounters) {
							for (const [k, v] of computeSubtaskStats(items)) nextSubStats.set(k, v);
						}
					}
				} catch (e) { /* ignore */ }
			}
			if (this.data?.searchByQuery) {
				try {
					const res = await this.data.searchByQuery('@done', 150);
					if (Array.isArray(res?.lines)) seenItems.push(...res.lines);
				} catch (e) { /* ignore */ }
			}
			this.subStatsByGuid = nextSubStats;
			let dirty = false;
			for (const item of seenItems) {
				if (!item?.guid) continue;
				const st = item.getTaskStatus?.();
				if (st === 'done') {
					const was = statusFromCodeOrString(item.props?.undone);
					if (was && was !== 'open' && was !== 'done') {
						this.prevStatusByGuid.set(item.guid, was);
						if (this.undoneByGuid.get(item.guid) !== was) {
							this.undoneByGuid.set(item.guid, was);
							dirty = true;
						}
					}
				} else if (st) {
					if (st === 'open' || st === 'none') this.prevStatusByGuid.delete(item.guid);
					else this.prevStatusByGuid.set(item.guid, st);
					if (this.undoneByGuid.delete(item.guid)) dirty = true;
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
			const row = e.target?.closest?.('.listitem-task[data-guid]')
				|| (e.type === 'keydown' ? findRowForCaret(findActiveCaretEl(document), null) : null);
			if (row && !row.closest?.('.bt-settings, .autocomplete--option-icon')) {
				const rg = row.getAttribute('data-guid');
				const rst = statusFromClassName(row.className);
				if (rg && rst && rst !== 'done') {
					if (rst === 'open') this.prevStatusByGuid.delete(rg);
					else this.prevStatusByGuid.set(rg, rst);
				}
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
					const prev = knownStatusByGuid.get(guid) || this.prevStatusByGuid.get(guid);
					if (prev && prev !== 'open' && prev !== 'done') was = prev;
				}
				if (was && was !== 'open' && was !== 'done') {
					this.prevStatusByGuid.set(guid, was);
					this.undoneByGuid.set(guid, was);
					saveUndoneMap(this.undoneByGuid);
				} else if (mp && 'undone' in mp && !mp.undone) {
					this.prevStatusByGuid.delete(guid);
					this.undoneByGuid.delete(guid);
					saveUndoneMap(this.undoneByGuid);
				}
			} else if (nextStatus && nextStatus !== 'done') {
				if (nextStatus === 'open') this.prevStatusByGuid.delete(guid);
				else this.prevStatusByGuid.set(guid, nextStatus);
				if (this.undoneByGuid.delete(guid)) saveUndoneMap(this.undoneByGuid);
			}

			if (typeof CSS !== 'undefined' && CSS.escape) {
				document.querySelectorAll(`.listitem-task[data-guid="${CSS.escape(guid)}"]`).forEach((el) => this.applyDoneAttrToEl(el));
			}

			if (!ev.source?.isLocal || !nextStatus) {
				if (ev.status !== null && ev.status !== undefined) this.scheduleSyncDoneOrigins();
				return;
			}
			this.scheduleSyncDoneOrigins();
			tryEmitGuid(guid, nextStatus);
		};
		this.eventIds.push(this.events.on('lineitem.updated', onLineUpdate, { collection: '*' }));

		const onFoldBadgeClick = (e) => {
			if (e.button !== 0 || !(e.target instanceof Element)) return;
			const row = e.target;
			if (!row.classList.contains('listitem-task') || !row.classList.contains('listitem-folded') || !row.hasAttribute('data-bt-sub')) return;
			const lineDiv = row.querySelector(':scope > .line-div');
			if (!lineDiv) return;
			const lr = lineDiv.getBoundingClientRect();
			if (e.clientX >= lr.right && e.clientX <= lr.right + 110 && e.clientY >= lr.top - 4 && e.clientY <= lr.top + 32) {
				const ctrl = row.querySelector(':scope > .lineitem-btn-unfold, :scope > .line-fold-chevron');
				if (ctrl) {
					e.preventDefault();
					e.stopPropagation();
					ctrl.click();
				}
			}
		};
		document.addEventListener('click', onFoldBadgeClick, true);

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
					if (next === 'done' && prev !== 'open' && prev !== 'done') {
						this.prevStatusByGuid.set(guid, prev);
						if (this.undoneByGuid.get(guid) !== prev) {
							this.undoneByGuid.set(guid, prev);
							saveUndoneMap(this.undoneByGuid);
						}
					} else if (next !== 'done') {
						if (next === 'open') this.prevStatusByGuid.delete(guid);
						else this.prevStatusByGuid.set(guid, next);
						if (prev === 'done' && this.undoneByGuid.delete(guid)) saveUndoneMap(this.undoneByGuid);
					}
					this.applyDoneAttrToEl(el);
					this.scheduleSyncDoneOrigins();
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
			document.removeEventListener('click', onFoldBadgeClick, true);
		});
	}

	async resolvePasteTarget(record, rowEl) {
		const items = await record.getLineItems?.(false);
		const list = Array.isArray(items) ? items : [];
		const byGuid = new Map(list.map((it) => [it.guid, it]));
		const rowGuid = rowEl?.getAttribute?.('data-guid') || null;
		if (rowGuid) {
			const cur = byGuid.get(rowGuid);
			if (!cur) return { skip: true };
			const pGuid = cur.parent_guid;
			const parentItem = pGuid && pGuid !== record.guid ? (byGuid.get(pGuid) || null) : null;
			const children = typeof cur.getChildren === 'function' ? await cur.getChildren() : (cur.children || []);
			const replaceEmptyItem = isLineItemEmpty(cur, Array.isArray(children) ? children.length : 0) ? cur : null;
			return { parentItem, afterItem: cur, replaceEmptyItem, skip: false };
		}
		const topItems = list.filter((it) => !it.parent_guid || it.parent_guid === record.guid);
		if (topItems.length === 1) {
			const sole = topItems[0];
			const children = typeof sole.getChildren === 'function' ? await sole.getChildren() : (sole.children || []);
			if (isLineItemEmpty(sole, Array.isArray(children) ? children.length : 0)) {
				return { parentItem: null, afterItem: sole, replaceEmptyItem: sole, skip: false };
			}
		}
		return { parentItem: null, afterItem: topItems[topItems.length - 1] || null, replaceEmptyItem: null, skip: false };
	}

	installSmartTaskPaste() {
		let skipShiftPasteAt = -1e9;
		const onKeyDown = (e) => {
			if ((e.ctrlKey || e.metaKey) && e.shiftKey && String(e.code || '').toLowerCase() === 'keyv') {
				skipShiftPasteAt = performance.now();
			}
		};
		const onPaste = (e) => {
			if (!this.cfg.smartPaste || e.defaultPrevented || !e.clipboardData) return;
			if (performance.now() - skipShiftPasteAt < 500) return;
			const types = Array.from(e.clipboardData.types || []);
			if (types.some((t) => t === 'text/thymer' || t.startsWith('web text/thymer'))) return;
			if (isBlockedPasteTarget(e.target) || isBlockedPasteTarget(document.activeElement)) return;

			const panel = this.ui.getActivePanel?.();
			const record = panel?.getActiveRecord?.();
			if (!record || typeof record.insertFromMarkdown !== 'function') return;

			const panelEl = panel.getElement?.() || document.querySelector('.panel.focused-panel, .panel.has-focus') || null;
			const caretEl = findActiveCaretEl(panelEl || document);
			const rowEl = findRowForCaret(caretEl, panelEl);
			if (rowEl?.closest?.('.block-codelang, .table-cell-container-div')) return;
			if (!rowEl && !caretEl?.closest?.('listview-editor')) return;

			const raw = e.clipboardData.getData('text/plain') || '';
			const md = prepareTaskMarkdownPaste(raw, Boolean(rowEl?.classList?.contains('listitem-task')));
			if (!md) return;

			e.preventDefault();
			e.stopPropagation();

			(async () => {
				try {
					const target = await this.resolvePasteTarget(record, rowEl);
					if (target.skip) return;
					const ok = await record.insertFromMarkdown(md, target.parentItem, target.afterItem);
					if (ok && target.replaceEmptyItem) {
						try { await target.replaceEmptyItem.delete?.(); } catch (err) { /* ignore */ }
					}
					this.scheduleSyncDoneOrigins();
				} catch (err) {
					this.ui.addToaster?.({ title: 'BetterTask', message: 'Task paste failed', dismissible: true, autoDestroyTime: 1800 });
				}
			})();
		};

		document.addEventListener('keydown', onKeyDown, true);
		document.addEventListener('paste', onPaste, true);
		this.cleanup.push(() => {
			document.removeEventListener('keydown', onKeyDown, true);
			document.removeEventListener('paste', onPaste, true);
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
    <div class="bt-stack-box">
      <div class="bt-panel-label">Nested Subtask Stack &amp; Fold Preview (tick subtasks or click chevron)</div>
      <div class="bt-stack-wrap"></div>
    </div>
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
			['subCounters', 'Subtask counts'],
			['smartPaste', 'Smart task paste'],
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

		// Nested stack interactive preview
		const stackItems = [
			{ guid: 'demo-root', parent_guid: null, indent: 0, status: 'open', text: 'Toast animasyonu asiri hizli', foldBtn: true, folded: false },
			{ guid: 'demo-p1', parent_guid: 'demo-root', indent: 1, status: 'started', text: 'ffas (active subtask)', foldBtn: true, folded: false },
			{ guid: 'demo-c1', parent_guid: 'demo-p1', indent: 2, status: 'done', text: 'ffasf (completed)' },
			{ guid: 'demo-c2', parent_guid: 'demo-p1', indent: 2, status: 'open', text: 'fasf (open)' },
			{ guid: 'demo-c3', parent_guid: 'demo-p1', indent: 2, status: 'alert', text: 'hhhqw (urgent)', foldBtn: true, folded: false },
			{ guid: 'demo-c4', parent_guid: 'demo-c3', indent: 3, status: 'open', text: 'asgh (leaf)' },
			{ guid: 'demo-big', parent_guid: null, indent: 0, status: 'started', text: 'Sprint backlog (>10 uses smooth circle)', foldBtn: true, folded: true },
			...Array.from({ length: 12 }, (_, idx) => ({
				guid: `demo-b-${idx}`, parent_guid: 'demo-big', indent: 1,
				status: idx < 4 ? 'done' : 'open', text: `Backlog task #${idx + 1}`,
			})),
		];
		const stackWrap = root.querySelector('.bt-stack-wrap');
		const stackEls = [];
		const refreshStack = () => {
			const fake = stackItems.map((it) => ({
				guid: it.guid, parent_guid: it.parent_guid, type: 'task',
				getTaskStatus: () => it.status, props: { done: it.status },
			}));
			const stats = computeSubtaskStats(fake);
			const byGuid = new Map(stackItems.map((it) => [it.guid, it]));
			for (const entry of stackEls) {
				const { item, el } = entry;
				let hidden = false;
				let p = item.parent_guid;
				while (p) {
					const par = byGuid.get(p);
					if (!par) break;
					if (par.folded) { hidden = true; break; }
					p = par.parent_guid;
				}
				el.classList.toggle('is-hidden-sub', hidden);
				el.classList.toggle('listitem-folded', !!item.folded);
				const s = this.cfg.subCounters ? stats.get(item.guid) : null;
				applySubStatAttrs(el, s, this.dark);
			}
		};
		this.page.refreshStack = refreshStack;
		for (const item of stackItems) {
			const sp = STATUS_MAP.get(item.status) || STATUS_MAP.get('open');
			const el = mk(`<div class="listitem listitem-task ${sp.cls}" data-indent="${item.indent}"><div class="line-check-div"></div><div class="line-div"></div></div>`);
			el.querySelector('.line-div').textContent = item.text;
			if (item.foldBtn) {
				const fbtn = mk(`<button type="button" class="bt-stack-fold" title="Fold / unfold">&#9662;</button>`);
				fbtn.onclick = (e) => { e.stopPropagation(); item.folded = !item.folded; refreshStack(); };
				el.prepend(fbtn);
			}
			el.querySelector('.line-check-div').onclick = () => {
				const orig = item.origin || (item.status !== 'done' ? item.status : 'open');
				if (item.status === 'done') {
					item.status = orig;
					el.removeAttribute('data-bt-was');
				} else {
					item.origin = item.status;
					item.status = 'done';
					if (orig !== 'open' && orig !== 'done') el.setAttribute('data-bt-was', orig);
				}
				for (const s of STATUS_SPECS) if (s.cls) el.classList.remove(s.cls);
				const ns = STATUS_MAP.get(item.status);
				if (ns?.cls) el.classList.add(ns.cls);
				refreshStack();
				this.emitAtTaskEl(el, item.status, el.getAttribute('data-bt-was'));
			};
			el.addEventListener('click', (e) => {
				if (!item.folded || e.target !== el) return;
				const lr = el.querySelector('.line-div').getBoundingClientRect();
				if (e.clientX >= lr.right) { item.folded = false; refreshStack(); }
			});
			stackEls.push({ item, el });
			stackWrap.appendChild(el);
		}
		refreshStack();

		this.refreshPage();
	}

	refreshPage() {
		const root = this.page?.root;
		if (!root) return;
		if (!root.isConnected) { this.page = null; return; }
		root.querySelectorAll('.bt-seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.preset === this.cfg.preset));
		root.querySelectorAll('.bt-toggle').forEach((b) => b.classList.toggle('is-on', !!this.cfg[b.dataset.key]));
		this.page.refreshStack?.();
	}
}
