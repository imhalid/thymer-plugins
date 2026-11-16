/**
 * BetterMenus - Thymer's inline menus (the / and @ menus, dropdowns, context menus) restyled, and the
 * blocks you used last first when you search the editor's / menu.
 *
 * Inline menus are Thymer's `.cmdpal--inline` autocomplete; plugin.css draws them. For recency,
 * Thymer ranks with window.fuzzysort, so fuzzysort.go is wrapped: while an inline menu is open
 * (body.is-ac-menu-open) and it is the editor's menu (options in the "format" / "insert" categories),
 * recently used entries that match the query (substring or word prefixes) are moved to the very front,
 * above matching categories, with scores above any real match so Thymer's sort keeps them there, and
 * get the bme-recent class. An entry is remembered when it is picked (Enter or click) in that menu.
 * The empty menu's "Suggestions" are Thymer's own and are left as they are.
 * Nothing is inserted into Thymer's elements.
 */

const BME_KEY = 'bme-recent-v1';
const BME_MAX = 12;
const BME_EDITOR_CATEGORIES = new Set(['format', 'insert']);
const BME_EDITOR_CATEGORY_LABELS = /^(Format Line\.\.\.|Insert\.\.\.|Suggestions)$/;

function bmeNorm(s) {
	return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function bmeMatches(query, label) {
	const q = bmeNorm(query);
	if (!q) return false;
	const l = bmeNorm(label);
	if (l.includes(q)) return true;
	const words = l.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
	return q.split(' ').every((t) => words.some((w) => w.startsWith(t)));
}

function bmeLoad() {
	try {
		const v = JSON.parse(localStorage.getItem(BME_KEY) || '[]');
		return Array.isArray(v) ? v.filter((l) => typeof l === 'string' && l && l.length <= 200).slice(0, BME_MAX) : [];
	} catch (e) {
		return [];
	}
}

function bmeSave(list) {
	try {
		localStorage.setItem(BME_KEY, JSON.stringify(list));
	} catch (e) { /* storage blocked: recents live for this session only */ }
}

function bmeDetectDark() {
	const root = document.documentElement;
	if (root.classList.contains('basic-dark') || root.classList.contains('is-dark')) return true;
	if (root.classList.contains('basic-light')) return false;
	const dt = (root.getAttribute('data-theme') || '').toLowerCase();
	if (dt.includes('light')) return false;
	if (dt.includes('dark')) return true;
	try {
		const bg = getComputedStyle(document.querySelector('.panel') || document.body).backgroundColor;
		const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
		if (m && (m[4] === undefined || parseFloat(m[4]) > 0.05)) {
			return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 < 0.5;
		}
	} catch (e) { /* fall through */ }
	return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
}

function bmeIsEditorOption(o) {
	return Boolean(o) && (BME_EDITOR_CATEGORIES.has(o.category) || BME_EDITOR_CATEGORIES.has(o.actionCategory));
}

class Plugin extends AppPlugin {
	onLoad() {
		this.cleanup = [];
		this.recent = bmeLoad(); // labels, most recent first
		this.editorLabels = new Set(); // labels seen in the editor's menu while ranking
		this.stash = null; // category matches held back until the options are ranked

		this.applyPolarity();
		document.body.classList.add('bme-on');
		const themeMo = new MutationObserver(() => this.applyPolarity());
		themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.cleanup.push(() => themeMo.disconnect());

		this.hookSearch();
		this.hookPicks();

		this.ui.addCommandPaletteCommand({
			label: 'BetterMenus: clear recently used blocks',
			icon: 'ti-eraser',
			onSelected: () => {
				this.recent = [];
				bmeSave(this.recent);
				this.ui.addToaster({ title: 'Recently used blocks cleared', dismissible: true, autoDestroyTime: 2000 });
			},
		});
	}

	onUnload() {
		for (const fn of this.cleanup) {
			try { fn(); } catch (e) { /* ignore */ }
		}
		this.cleanup = [];
		document.body.classList.remove('bme-on', 'bme-light');
	}

	applyPolarity() {
		const light = !bmeDetectDark();
		if (document.body.classList.contains('bme-light') !== light) document.body.classList.toggle('bme-light', light);
	}

	menuOpen() {
		const b = document.body.classList;
		return b.contains('is-ac-menu-open') && !b.contains('is-cmdpal-open')
			&& document.documentElement.getAttribute('data-device') !== 'mobile';
	}

	hookSearch() {
		const fz = window.fuzzysort;
		if (!fz || typeof fz.go !== 'function') return;
		const orig = fz.go;
		const self = this;
		const wrapped = function (search, targets, options) {
			const res = orig.apply(this, arguments);
			try {
				return self.afterGo(search, targets, options, res);
			} catch (e) {
				return res;
			}
		};
		fz.go = wrapped;
		this.cleanup.push(() => {
			if (fz.go === wrapped) fz.go = orig;
		});
	}

	afterGo(search, targets, options, res) {
		if (!Array.isArray(res) || !Array.isArray(targets) || !this.menuOpen()) {
			this.stash = null;
			return res;
		}
		// Thymer ranks the categories first (keys without a scoreFn), then the options.
		if (!options?.scoreFn) {
			this.stash = null;
			const editor = targets.some((c) => c && BME_EDITOR_CATEGORIES.has(c.value));
			if (editor && res.length && this.recent.some((l) => bmeMatches(search, l))) {
				this.stash = { search, res: [...res] };
				return Object.assign([], { total: 0 });
			}
			return res;
		}
		const held = this.stash && this.stash.search === search ? this.stash.res : [];
		this.stash = null;
		if (!targets.some(bmeIsEditorOption)) return held.length ? [...held, ...res] : res;

		if (this.editorLabels.size > 2000) this.editorLabels.clear();
		for (const o of targets) if (bmeIsEditorOption(o) && typeof o.label === 'string') this.editorLabels.add(o.label);

		const rank = new Map(this.recent.map((l, i) => [l, i]));
		const picked = [];
		const seen = new Set();
		for (const r of res) {
			const label = r?.obj?.label;
			if (typeof label === 'string' && rank.has(label) && !seen.has(label) && bmeMatches(search, label)) {
				seen.add(label);
				picked.push(r);
			}
		}
		if (!picked.length && !held.length) return res;
		picked.sort((a, b) => rank.get(a.obj.label) - rank.get(b.obj.label));
		const set = new Set(picked);
		const rest = res.filter((r) => !set.has(r));
		picked.forEach((r, k) => {
			r.score = picked.length - k; // above any real match (those are <= 0)
			const cls = r.obj.extraClass || '';
			if (!/\bbme-recent\b/.test(cls)) r.obj.extraClass = `${cls} bme-recent`.trim();
		});
		res.length = 0;
		res.push(...picked, ...held, ...rest);
		return res;
	}

	// The visible inline menu holding a row, if it is the editor's menu.
	editorMenuOf(row) {
		const menu = row.closest('.cmdpal--inline');
		if (!menu || menu.classList.contains('hidden') || !menu.isConnected) return null;
		const label = (row.querySelector('.autocomplete--option-label')?.textContent || '').trim();
		if (this.editorLabels.has(label)) return menu;
		for (const l of menu.querySelectorAll('.autocomplete--option-label')) {
			if (BME_EDITOR_CATEGORY_LABELS.test(l.textContent.trim())) return menu;
		}
		return null;
	}

	remember(row) {
		if (!row || row.matches('.autocomplete-widget, .autocomplete--disabled, .autocomplete-divider-heading')) return;
		if ((row.querySelector('.autocomplete--option-right')?.textContent || '').trim().endsWith('→')) return; // a category
		const label = (row.querySelector('.autocomplete--option-label')?.textContent || '').trim();
		if (!label || label.startsWith('←') || label.length > 200 || BME_EDITOR_CATEGORY_LABELS.test(label)) return;
		if (!this.editorMenuOf(row)) return;
		this.recent = [label, ...this.recent.filter((l) => l !== label)].slice(0, BME_MAX);
		bmeSave(this.recent);
	}

	hookPicks() {
		const onKey = (e) => {
			if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.altKey || !this.menuOpen()) return;
			const menus = [...document.querySelectorAll('.cmdpal--inline')].filter((m) => !m.classList.contains('hidden'));
			const row = menus.length ? menus[menus.length - 1].querySelector('.autocomplete--option-selected') : null;
			if (row) this.remember(row);
		};
		const onClick = (e) => {
			const row = e.target instanceof Element ? e.target.closest('.cmdpal--inline .autocomplete--option') : null;
			if (row) this.remember(row);
		};
		// Capture phase: before Thymer's own keydown and click handlers act on the pick.
		document.addEventListener('keydown', onKey, true);
		document.addEventListener('click', onClick, true);
		this.cleanup.push(() => {
			document.removeEventListener('keydown', onKey, true);
			document.removeEventListener('click', onClick, true);
		});
	}
}
