/**
 * Daily Garden
 *
 * A small living plant in your sidebar. Every word you write today makes it grow;
 * every task you complete makes it bloom. Hit your daily word goal and it flowers
 * fully, and consecutive days build a streak. A new day grows a new plant (its shape
 * is seeded from the date).
 *
 * Demonstrates: sidebar widget, status bar item, command palette, local-edit events,
 * incremental per-line word tracking and cleanup on unload.
 */

const STORE_KEY = 'daily-garden:v1';
const SIDEBAR_KEY = 'daily-garden:sidebar';   // '1' shown, '0' hidden; set by the toggle command
const DEFAULT_GOAL = 500;

const todayKey = () => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Small deterministic PRNG so the same date always grows the same plant. */
function rng(seedStr) {
	let h = 1779033703 ^ seedStr.length;
	for (let i = 0; i < seedStr.length; i++) {
		h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return (((h ^= h >>> 16) >>> 0) / 4294967296);
	};
}

const countWords = (segments) => {
	let n = 0;
	for (const s of segments || []) {
		if (s && typeof s.text === 'string') n += s.text.trim().split(/\s+/).filter(Boolean).length;
	}
	return n;
};

const PETALS = ['#ff7a90', '#ffb347', '#c792ea', '#7ad7f0', '#f6e05e', '#ff9ecd'];

// ---- Flower collection -----------------------------------------------------------------
// Unlocked by lifetime words written. Every flower has its own threshold; rarer tiers need far more words.
const RARITIES = {
	common:    { label: 'Common',    color: '#9aa4b0' },
	uncommon:  { label: 'Uncommon',  color: '#5fae6a' },
	rare:      { label: 'Rare',      color: '#4aa3ff' },
	epic:      { label: 'Epic',      color: '#b36bff' },
	legendary: { label: 'Legendary', color: '#ffb929' },
};

// Petal layers: n petals, distance d from centre, ellipse radii rx/ry (all relative to flower radius), rot offset in degrees.
const FLOWERS = [
	{ id: 'daisy',     name: 'Daisy',          rarity: 'common',    at: 100,   desc: 'Simple, cheerful, and everywhere. Your first words.',
	  layers: [{ n: 12, d: .85, rx: .22, ry: .6, color: '#fbfbff' }], core: { r: .45, color: '#ffd93b' } },
	{ id: 'dandelion', name: 'Dandelion',      rarity: 'common',    at: 300,   desc: 'Tough, stubborn, impossible to stop.',
	  layers: [{ n: 16, d: .8, rx: .14, ry: .5, color: '#ffd93b' }, { n: 10, d: .5, rx: .14, ry: .4, color: '#ffe97a', rot: 11 }], core: { r: .3, color: '#f0b400' } },
	{ id: 'clover',    name: 'White Clover',   rarity: 'common',    at: 600,   desc: 'Lucky streaks start with small habits.',
	  layers: [{ n: 9, d: .75, rx: .3, ry: .45, color: '#f5f1ff' }, { n: 9, d: .45, rx: .22, ry: .3, color: '#ffd1e6', rot: 20 }], core: { r: .25, color: '#c8e6a0' } },
	{ id: 'tulip',     name: 'Tulip',          rarity: 'uncommon',  at: 1200,  desc: 'A spring bloom for a steady writer.',
	  layers: [{ n: 6, d: .55, rx: .4, ry: .8, color: '#ff5d73' }, { n: 6, d: .4, rx: .3, ry: .6, color: '#ff8da1', rot: 30 }], core: { r: .2, color: '#fff3b0' } },
	{ id: 'hibiscus',  name: 'Hibiscus',       rarity: 'uncommon',  at: 1800,  desc: 'Big, warm and impossible to ignore.',
	  layers: [{ n: 5, d: .8, rx: .55, ry: .65, color: '#ff4f8b' }, { n: 5, d: .5, rx: .35, ry: .4, color: '#ff2d6f', rot: 36 }], core: { r: .18, color: '#ffe066' } },
	{ id: 'sunflower', name: 'Sunflower',      rarity: 'uncommon',  at: 2500,  desc: 'Always turns toward the light, and the page.',
	  layers: [{ n: 16, d: .95, rx: .17, ry: .6, color: '#ffc62e' }, { n: 16, d: .75, rx: .17, ry: .5, color: '#ffb000', rot: 11 }], core: { r: .55, color: '#6b3e1c' } },
	{ id: 'lavender',  name: 'Lavender',       rarity: 'rare',      at: 5000,  desc: 'Calm focus. Five thousand words of it.',
	  layers: [{ n: 8, d: .8, rx: .16, ry: .5, color: '#b79cf0' }, { n: 8, d: .5, rx: .16, ry: .45, color: '#9a7be0', rot: 22 }], core: { r: .22, color: '#e9ddff' } },
	{ id: 'poppy',     name: 'Poppy',          rarity: 'rare',      at: 8000,  desc: 'Bold, bright and a little dramatic.',
	  layers: [{ n: 4, d: .7, rx: .62, ry: .7, color: '#ff3b30' }, { n: 4, d: .55, rx: .5, ry: .6, color: '#e02b20', rot: 45 }], core: { r: .3, color: '#2a1a1a' } },
	{ id: 'orchid',    name: 'Orchid',         rarity: 'epic',      at: 15000, desc: 'Rare, delicate, and worth the patience.',
	  layers: [{ n: 5, d: .8, rx: .45, ry: .7, color: '#d977e8' }, { n: 3, d: .4, rx: .3, ry: .45, color: '#fff0ff', rot: 36 }], core: { r: .2, color: '#ffd34d' } },
	{ id: 'lotus',     name: 'Lotus',          rarity: 'epic',      at: 25000, desc: 'Rises clean from the mud of every first draft.',
	  layers: [{ n: 8, d: .85, rx: .24, ry: .75, color: '#ffb3d4' }, { n: 8, d: .7, rx: .22, ry: .65, color: '#ff8cbd', rot: 22 }, { n: 5, d: .35, rx: .2, ry: .4, color: '#fff6b0' }], core: { r: .25, color: '#ffe66d' } },
	{ id: 'rose',      name: 'Celestial Rose', rarity: 'legendary', at: 50000, desc: 'Fifty thousand words. A bloom that glows in the dark.',
	  layers: [{ n: 8, d: .7, rx: .5, ry: .5, color: '#ffd76a' }, { n: 8, d: .5, rx: .4, ry: .4, color: '#ffbf3b', rot: 22 }, { n: 6, d: .3, rx: .32, ry: .32, color: '#fff0b3' }], core: { r: .15, color: '#ffffff' } },
	{ id: 'moonflower', name: 'Moonflower',     rarity: 'legendary', at: 100000, desc: 'Opens only at night. A hundred thousand words in.',
	  layers: [{ n: 10, d: .85, rx: .3, ry: .75, color: '#eaf0ff' }, { n: 10, d: .6, rx: .25, ry: .55, color: '#c9d6ff', rot: 18 }, { n: 6, d: .3, rx: .25, ry: .3, color: '#ffffff' }], core: { r: .2, color: '#fff7c2' } },
];
const flowerById = (id) => FLOWERS.find((f) => f.id === id) || null;

/** SVG fragment for one flower of the collection, centred on cx,cy with radius r. */
function flowerSvg(cx, cy, r, def) {
	let out = '';
	for (const L of def.layers) {
		for (let i = 0; i < L.n; i++) {
			const a = (i / L.n) * 360 + (L.rot || 0);
			out += `<ellipse cx="${cx}" cy="${(cy - r * L.d).toFixed(1)}" rx="${(r * L.rx).toFixed(1)}" ry="${(r * L.ry).toFixed(1)}" fill="${L.color}" transform="rotate(${a.toFixed(1)} ${cx} ${cy})"/>`;
		}
	}
	return out + `<circle cx="${cx}" cy="${cy}" r="${(r * def.core.r).toFixed(1)}" fill="${def.core.color}"/>`;
}


/** Renders the plant as an SVG string. growth in 0..1, bloom = number of flowers. */
function plantSvg(dayKey, growth, flowers, complete, seen, def) {
	const rand = rng(dayKey);
	const W = 220, H = 170, baseY = 152, cx = W / 2;
	const height = 14 + growth * 118;
	const sway = (rand() - 0.5) * 36;
	const topX = cx + sway;
	const topY = baseY - height;
	const ctrlX = cx - sway * 0.8;
	const ctrlY = baseY - height * 0.55;

	const point = (t) => {
		const u = 1 - t;
		return [
			u * u * cx + 2 * u * t * ctrlX + t * t * topX,
			u * u * baseY + 2 * u * t * ctrlY + t * t * topY,
		];
	};

	let out = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="dg-svg">`;
	out += `<ellipse cx="${cx}" cy="${baseY + 6}" rx="46" ry="7" class="dg-soil"/>`;
	out += `<path d="M${cx} ${baseY} Q${ctrlX} ${ctrlY} ${topX} ${topY}" class="dg-stem" />`;

	// Leaves appear progressively along the stem.
	const maxLeaves = 9;
	const leaves = Math.floor(growth * maxLeaves);
	for (let i = 0; i < leaves; i++) {
		const t = 0.18 + (i / maxLeaves) * 0.78;
		const [x, y] = point(t);
		const side = i % 2 ? 1 : -1;
		const len = (10 + rand() * 9) * (1 - t * 0.35);
		const lift = 5 + rand() * 7;
		out += `<path d="M${x} ${y} q${side * len * 0.6} ${-lift - 4} ${side * len} ${-lift} q${-side * len * 0.35} ${lift + 3} ${-side * len} ${lift}z" class="dg-leaf" ${i < seen.leaves ? ' style="animation:none"' : ''}/>`;
	}

	// Flowers: one per completed task, spread along the upper stem and on short side stalks.
	const shown = Math.min(flowers, 14);
	for (let i = 0; i < shown; i++) {
		let fx, fy;
		if (i === 0) {
			[fx, fy] = [topX, topY];
		} else {
			const t = 0.45 + rand() * 0.5;
			const [bx, by] = point(t);
			const side = i % 2 ? 1 : -1;
			fx = bx + side * (14 + rand() * 18);
			fy = by - 6 - rand() * 14;
			out += `<path d="M${bx} ${by} Q${bx + side * 8} ${by - 2} ${fx} ${fy}" class="dg-stem dg-stalk"/>`;
		}
		const r = i === 0 ? 8 : 5 + rand() * 2.5;
		const color = PETALS[Math.floor(rand() * PETALS.length)];
		out += `<g class="dg-flower${def && def.rarity === 'legendary' ? ' dg-legend' : ''}" style="transform-origin:${fx}px ${fy}px;${i < seen.flowers ? 'animation:none' : ''}">`;
		if (def) {
			out += flowerSvg(fx.toFixed(1), fy.toFixed(1), r, def) + '</g>';
		} else {
			for (let p = 0; p < 6; p++) {
				const a = (p / 6) * Math.PI * 2;
				out += `<circle cx="${(fx + Math.cos(a) * r).toFixed(1)}" cy="${(fy + Math.sin(a) * r).toFixed(1)}" r="${(r * 0.62).toFixed(1)}" fill="${color}"/>`;
			}
			out += `<circle cx="${fx}" cy="${fy}" r="${(r * 0.5).toFixed(1)}" class="dg-core"/></g>`;
		}
	}

	if (complete) {
		for (let i = 0; i < 7; i++) {
			const x = 20 + rand() * (W - 40), y = 14 + rand() * 70;
			out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="1.6" class="dg-firefly" style="animation-delay:${(i * 0.45).toFixed(2)}s"/>`;
		}
	}
	return out + '</svg>';
}

class Plugin extends AppPlugin {
	state = { day: todayKey(), words: 0, tasks: 0, goal: DEFAULT_GOAL, streak: 0, lastGoalDay: '', total: 0, unlocked: [], selected: null };
	/** Last known word count per line guid; lets us count only what was newly written. */
	lineWords = new Map();
	widget = null;
	statusItem = null;
	midnightTimer = 0;
	container = null;
	/** What is already on screen, so only new leaves/flowers animate. */
	seen = { leaves: 0, flowers: 0 };

	onLoad() {
		this.loadState();
		// Words written before the collection existed still count.
		this.state.total = Math.max(this.state.total, this.state.words);
		this.checkUnlocks(true);

		this.statusItem = this.ui.addStatusBarItem({
			icon: 'plant',
			label: '',
			tooltip: 'Daily Garden: words written today',
			onClick: () => this.openCollection(),
		});

		this.applySidebar();
		this.events.on('global-plugin.updated', () => this.applySidebar());
		this.ui.addCommandPaletteCommand({ label: 'Daily Garden: toggle sidebar plant', icon: 'layout-sidebar', onSelected: () => this.setShowSidebar(!this.showSidebar()) });

		this.ui.addCommandPaletteCommand({
			label: 'Daily Garden: set daily word goal',
			icon: 'target',
			onSelected: () => {
				const input = window.prompt('Daily word goal', String(this.state.goal));
				const n = parseInt(input || '', 10);
				if (n > 0) { this.state.goal = n; this.save(); this.refresh(); }
			},
		});
		this.ui.addCommandPaletteCommand({ label: 'Daily Garden: open flower collection', icon: 'plant', onSelected: () => this.openCollection() });
		this.ui.addCommandPaletteCommand({
			label: "Daily Garden: reset today's plant",
			icon: 'refresh',
			onSelected: () => { this.state.words = 0; this.state.tasks = 0; this.save(); this.refresh(); },
		});

		const track = (ev, isCreate) => {
			if (!ev.source.isLocal) return;
			this.rollDayIfNeeded();
			let dirty = false;

			if (ev.status === 'done') { this.state.tasks++; dirty = true; }

			const segs = ev.getSegments();
			if (segs) {
				const now = countWords(segs);
				const known = this.lineWords.has(ev.lineItemGuid);
				// Lines created this session start at 0; a line first seen via an update is a baseline only.
				const prev = known ? this.lineWords.get(ev.lineItemGuid) : (isCreate ? 0 : now);
				this.lineWords.set(ev.lineItemGuid, now);
				if (now > prev) { this.state.words += now - prev; this.state.total += now - prev; dirty = true; }
			}
			if (dirty) this.onProgress();
		};
		this.events.on('lineitem.created', (ev) => track(ev, true), { collection: '*' });
		this.events.on('lineitem.updated', (ev) => track(ev, false), { collection: '*' });

		// The plugin events only arrive once Thymer has saved the line - after typing pauses. So the words are also counted
		// as they are typed, from the line the caret is in; the saved-line event then finds the same count and adds nothing.
		const live = () => {
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
				if (now > prev) { this.rollDayIfNeeded(); this.state.words += now - prev; this.state.total += now - prev; this.onProgress(); }
			} catch (e) { /* the saved-line events still count */ }
		};
		this.onInput = () => requestAnimationFrame(live);
		document.addEventListener('input', this.onInput, true);
		this.events.on('lineitem.deleted', (ev) => this.lineWords.delete(ev.lineItemGuid), { collection: '*' });

		this.scheduleMidnight();
		this.refresh();
	}

	onUnload() {
		clearTimeout(this.midnightTimer);
		if (this.onInput) document.removeEventListener('input', this.onInput, true);
		this.closeCollection();
	}

	// ---- state -------------------------------------------------------------------------

	loadState() {
		try {
			const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
			if (saved) Object.assign(this.state, saved);
		} catch (e) { /* storage unavailable: start fresh */ }
		this.rollDayIfNeeded();
	}

	save() {
		try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (e) { /* ignore */ }
	}

	rollDayIfNeeded() {
		const today = todayKey();
		if (this.state.day === today) return;
		const y = new Date(); y.setDate(y.getDate() - 1);
		const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
		// Streak survives only if the goal was hit yesterday.
		if (this.state.lastGoalDay !== yKey) this.state.streak = 0;
		this.state.day = today;
		this.state.words = 0;
		this.state.tasks = 0;
		this.save();
	}

	scheduleMidnight() {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
		this.midnightTimer = setTimeout(() => {
			this.rollDayIfNeeded();
			this.refresh();
			this.scheduleMidnight();
		}, next.getTime() - now.getTime());
	}

	// ---- sidebar plant ----
	// The toggle command's choice is kept in this device's localStorage and wins; without one, "showSidebar" in the plugin's
	// configuration "custom" decides, and the plant is hidden unless that says "showSidebar": true. (AppPlugin cannot save
	// its configuration quietly - saving reloads the plugin - so the choice was never kept before.)

	showSidebar() {
		try {
			const chosen = localStorage.getItem(SIDEBAR_KEY);
			if (chosen === '1' || chosen === '0') return chosen === '1';
		} catch (e) { /* fall through to the configuration */ }
		try { return this.getConfiguration()?.custom?.showSidebar === true; } catch (e) { return false; }
	}

	setShowSidebar(on) {
		try { localStorage.setItem(SIDEBAR_KEY, on ? '1' : '0'); } catch (e) { /* applied below anyway */ }
		this.applySidebar(on);
	}

	applySidebar(force) {
		const on = force ?? this.showSidebar();
		if (on && !this.widget) {
			this.widget = this.ui.addSidebarWidget((container) => {
				this.container = container;
				this.render();
				return () => { this.container = null; };
			});
		} else if (!on && this.widget) {
			this.widget.remove();
			this.widget = null;
			this.container = null;
		}
	}

	// ---- flower collection ---------------------------------------------------------------

	checkUnlocks(silent) {
		const s = this.state;
		for (const f of FLOWERS) {
			if (s.total >= f.at && !s.unlocked.includes(f.id)) {
				s.unlocked.push(f.id);
				if (!s.selected) s.selected = f.id;
				if (!silent) this.toast(`New flower unlocked: ${f.name} 🌸`, `${RARITIES[f.rarity].label} · ${f.at.toLocaleString()} words written`);
			}
		}
	}

	openCollection() {
		if (this.modal) return this.closeCollection();
		const overlay = document.createElement('div');
		overlay.className = 'dg-overlay';
		overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.closeCollection(); });
		this.onKey = (e) => { if (e.key === 'Escape') this.closeCollection(); };
		document.addEventListener('keydown', this.onKey, true);
		document.body.appendChild(overlay);
		this.modal = overlay;
		this.renderCollection();
	}

	closeCollection() {
		if (this.onKey) document.removeEventListener('keydown', this.onKey, true);
		this.modal?.remove();
		this.modal = null;
		this.onKey = null;
	}

	renderCollection() {
		if (!this.modal) return;
		const s = this.state;
		const cs = getComputedStyle(document.body);
		const bg = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'Canvas';
		const cards = FLOWERS.map((f) => {
			const r = RARITIES[f.rarity];
			const got = s.unlocked.includes(f.id);
			const pct = Math.min(100, Math.floor((s.total / f.at) * 100));
			return `<div class="dg-card${got ? '' : ' dg-locked'}${s.selected === f.id ? ' dg-sel' : ''}${f.rarity === 'legendary' && got ? ' dg-legend' : ''}" data-id="${f.id}" style="--rc:${r.color}">
				<span class="dg-rarity">${r.label}</span>
				<svg viewBox="-30 -30 60 60" class="dg-cardsvg">${flowerSvg(0, 0, 22, f)}</svg>
				<div class="dg-name">${got ? f.name : '???'}</div>
				<div class="dg-desc">${got ? f.desc : 'Keep writing to discover this flower.'}</div>
				${got
					? `<div class="dg-foot">${s.selected === f.id ? '🌱 Growing in your garden' : 'Click to plant'}</div>`
					: `<div class="dg-prog"><div style="width:${pct}%"></div></div><div class="dg-foot">${s.total.toLocaleString()} / ${f.at.toLocaleString()} words</div>`}
			</div>`;
		}).join('');
		const scroller = () => this.modal.querySelector('.dg-scroll')?.shadowRoot?.querySelector('.id--scroll-container-y');
		const top = scroller()?.scrollTop || 0;   // planting a flower redraws the list: it stays where it was
		this.modal.innerHTML = `<div class="dg-modal" style="background:${bg}"><div-scrollable class="dg-scroll force-active-scrollbar" style="overflow-y: scroll; height: 100%"><div class="dg-in">
			<div class="dg-head">
				<div><div class="dg-title">Flower collection</div>
				<div class="dg-sub">${s.unlocked.length} / ${FLOWERS.length} discovered · ${s.total.toLocaleString()} words written in total</div></div>
				<button class="dg-x" aria-label="Close">✕</button>
			</div>
			<div class="dg-grid">${cards}</div>
		</div></div-scrollable></div>`;
		if (top && scroller()) scroller().scrollTop = top;
		this.modal.querySelector('.dg-x').addEventListener('click', () => this.closeCollection());
		this.modal.querySelectorAll('.dg-card:not(.dg-locked)').forEach((el) => el.addEventListener('click', () => {
			this.state.selected = el.dataset.id;
			this.save();
			this.refresh();
			this.renderCollection();
		}));
	}

	// ---- reactions ---------------------------------------------------------------------

	onProgress() {
		const s = this.state;
		if (s.words >= s.goal && s.lastGoalDay !== s.day) {
			s.lastGoalDay = s.day;
			s.streak++;
			this.toast('Your garden is in full bloom 🌸', `${s.goal} words today. Streak: ${s.streak} day${s.streak === 1 ? '' : 's'}.`);
		}
		this.checkUnlocks(false);
		this.save();
		this.refresh();
	}

	toast(title, message) {
		this.ui.addToaster({ title, message, dismissible: true, autoDestroyTime: 4000 });
	}

	summary() {
		const s = this.state;
		return `${s.words}/${s.goal} words · ${s.tasks} task${s.tasks === 1 ? '' : 's'} done · streak ${s.streak}`;
	}

	refresh() {
		if (this.modal) this.renderCollection();
		this.statusItem?.setLabel(`${this.state.words}/${this.state.goal}`);
		this.render();
	}

	render() {
		if (!this.container) return;
		const s = this.state;
		const growth = Math.min(1, s.words / s.goal);
		const done = s.words >= s.goal;
		const pct = Math.round(growth * 100);
		const html = /* html */`
			<div class="dg">
				${plantSvg(s.day, growth, s.tasks, done, this.seen, flowerById(s.selected))}
				<div class="dg-bar"><div class="dg-fill" style="width:${pct}%"></div></div>
				<div class="dg-meta">
					<span>${s.words} / ${s.goal} words</span>
					<span>🌼 ${s.tasks}</span>
					<span>🔥 ${s.streak}</span>
				</div>
			</div>`;
		this.container.innerHTML = html;
		this.seen = { leaves: Math.floor(growth * 9), flowers: Math.min(s.tasks, 14) };
	}
}
