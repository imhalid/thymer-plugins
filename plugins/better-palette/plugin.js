/**
 * BetterPalette - Thymer's command palette with recently used commands first, and a restyled dialog.
 *
 * Thymer builds and ranks the palette's results inside its own code, out of the SDK's reach. Two hooks:
 * - Searching: Thymer ranks with window.fuzzysort, so fuzzysort.go is wrapped. While the palette is in
 *   command mode (">"), recently used commands that match the query (as a substring or by word
 *   prefixes) are moved to the very front, above matching categories, with scores above any real
 *   match so Thymer's own sort keeps them there, and they get the bpal-recent class.
 * - Empty input: Thymer lists only categories there. A "Recent" list is drawn above Thymer's results
 *   inside the dialog. Arrow keys and Enter for it are handled in the capture phase, before Thymer's
 *   window-level keydown handler. Running one types its label into the palette and clicks Thymer's
 *   own result, so Thymer runs the command the usual way.
 * A command is remembered when it is picked (Enter or click) in command mode: its label, icon class
 * and shortcut text, in localStorage. Nothing is inserted into Thymer's rows; the Recent list is a
 * sibling of Thymer's result container.
 */

const BPAL_KEY = 'bpal-recent-v1';
const BPAL_MAX = 8; // remembered
const BPAL_SHOW = 5; // listed when the input is empty
const BPAL_SKIP_VALUES = new Set(['open_record', 'search', 'create_record_with_title', 'create_record_pick_collection']);

function bpalNorm(s) {
	return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function bpalMatches(query, label) {
	const q = bpalNorm(query);
	if (!q) return false;
	const l = bpalNorm(label);
	if (l.includes(q)) return true;
	const words = l.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
	return q.split(' ').every((t) => words.some((w) => w.startsWith(t)));
}

function bpalLoad() {
	try {
		const v = JSON.parse(localStorage.getItem(BPAL_KEY) || '[]');
		if (!Array.isArray(v)) return [];
		return v
			.filter((r) => r && typeof r.label === 'string' && r.label)
			.slice(0, BPAL_MAX)
			.map((r) => ({
				label: r.label.slice(0, 200),
				icon: typeof r.icon === 'string' && /^ti-[a-z0-9-]+$/.test(r.icon) ? r.icon : '',
				kbd: typeof r.kbd === 'string' ? r.kbd.slice(0, 24) : '',
				t: Number(r.t) || 0,
			}));
	} catch (e) {
		return [];
	}
}

function bpalSave(list) {
	try {
		localStorage.setItem(BPAL_KEY, JSON.stringify(list));
	} catch (e) { /* storage blocked: recents live for this session only */ }
}

function bpalDetectDark() {
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

function bpalEl(tag, cls) {
	const n = document.createElement(tag);
	if (cls) n.className = cls;
	return n;
}

function bpalRowLabel(row) {
	return (row.querySelector('.autocomplete--option-label')?.textContent || '').trim();
}

function bpalIsCategoryRow(row) {
	return (row.querySelector('.autocomplete--option-right')?.textContent || '').trim().endsWith('→');
}

class Plugin extends AppPlugin {
	onLoad() {
		this.cleanup = [];
		this.recent = bpalLoad();
		this.meta = new Map(); // option label -> value, seen while ranking (to leave out pages and the like)
		this.state = null; // the open palette's Recent list
		this.stash = null; // category matches held back until the options are ranked

		this.applyPolarity();
		document.body.classList.add('bpal-on');
		const themeMo = new MutationObserver(() => this.applyPolarity());
		themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.cleanup.push(() => themeMo.disconnect());

		this.hookSearch();
		this.hookDialog();

		this.ui.addCommandPaletteCommand({
			label: 'BetterPalette: clear recent commands',
			icon: 'ti-eraser',
			onSelected: () => {
				this.recent = [];
				bpalSave(this.recent);
				this.ui.addToaster({ title: 'Recent commands cleared', dismissible: true, autoDestroyTime: 2000 });
			},
		});
	}

	onUnload() {
		for (const fn of this.cleanup) {
			try { fn(); } catch (e) { /* ignore */ }
		}
		this.cleanup = [];
		document.body.classList.remove('bpal-on', 'bpal-light');
	}

	applyPolarity() {
		const light = !bpalDetectDark();
		if (document.body.classList.contains('bpal-light') !== light) document.body.classList.toggle('bpal-light', light);
	}

	isMobile() {
		return document.documentElement.getAttribute('data-device') === 'mobile';
	}

	dialog() {
		return document.body.classList.contains('is-cmdpal-open') ? document.querySelector('.cmdpal--dialog') : null;
	}

	inCommands(dlg) {
		return (dlg?.querySelector('.cmdpal--searchtype')?.textContent || '').trim() === '>';
	}

	inCategory(dlg) {
		for (const l of dlg.querySelectorAll('.cmdpal--ac-container .autocomplete--option-label')) {
			if (l.textContent.trim().startsWith('←')) return true;
		}
		return false;
	}

	// ---- Searching ---------------------------------------------------------------------------

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
		if (!Array.isArray(res)) return res;
		const dlg = this.dialog();
		if (!dlg || !this.inCommands(dlg) || this.isMobile()) {
			this.stash = null;
			return res;
		}
		// Thymer ranks the categories first (keys without a scoreFn), then the options.
		const isCategories = !options?.scoreFn;
		if (isCategories) {
			this.stash = null;
			if (res.length && this.recent.some((r) => bpalMatches(search, r.label))) {
				this.stash = { search, res: [...res] };
				return Object.assign([], { total: 0 });
			}
			return res;
		}

		if (Array.isArray(targets)) {
			if (this.meta.size > 3000) this.meta.clear();
			for (const o of targets) {
				if (o && typeof o.label === 'string' && typeof o.value === 'string') this.meta.set(o.label, o.value);
			}
		}
		const held = this.stash && this.stash.search === search ? this.stash.res : [];
		this.stash = null;

		const rank = new Map(this.recent.map((r, i) => [r.label, i]));
		const picked = [];
		if (rank.size) {
			for (const r of res) {
				const label = r?.obj?.label;
				if (typeof label === 'string' && rank.has(label) && bpalMatches(search, label)) picked.push(r);
			}
		}
		if (!picked.length && !held.length) return res;
		picked.sort((a, b) => rank.get(a.obj.label) - rank.get(b.obj.label));
		const set = new Set(picked);
		const rest = res.filter((r) => !set.has(r));
		picked.forEach((r, k) => {
			// Above any real match (those are <= 0), so Thymer's sort leaves them first.
			r.score = picked.length - k;
			const cls = r.obj.extraClass || '';
			if (!/\bbpal-recent\b/.test(cls)) r.obj.extraClass = `${cls} bpal-recent`.trim();
		});
		res.length = 0;
		res.push(...picked, ...held, ...rest);
		return res;
	}

	// ---- Remembering and the Recent list ----------------------------------------------------

	remember(row, dlg) {
		if (!dlg || !this.inCommands(dlg)) return;
		if (row.matches('.autocomplete-widget, .autocomplete--disabled') || bpalIsCategoryRow(row)) return;
		const label = bpalRowLabel(row);
		if (!label || label.startsWith('←') || label.length > 200) return;
		const value = this.meta.get(label);
		if (value && (BPAL_SKIP_VALUES.has(value) || value.startsWith('searchtype_'))) return;
		const iconEl = row.querySelector('.autocomplete--option-icon .ti');
		const icon = iconEl ? [...iconEl.classList].find((c) => /^ti-[a-z0-9-]+$/.test(c)) || '' : '';
		const kbd = (row.querySelector('.autocomplete--kbd')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
		this.recent = [{ label, icon, kbd, t: Date.now() }, ...this.recent.filter((r) => r.label !== label)].slice(0, BPAL_MAX);
		bpalSave(this.recent);
	}

	hookDialog() {
		const onKey = (e) => {
			const dlg = this.dialog();
			if (!dlg) return;
			if (this.recentKey(e, dlg)) return;
			if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.isComposing) {
				const row = dlg.querySelector('.cmdpal--ac-container .autocomplete--option-selected');
				if (row) this.remember(row, dlg);
			}
		};
		const onClick = (e) => {
			const row = e.target instanceof Element ? e.target.closest('.cmdpal--dialog .cmdpal--ac-container .autocomplete--option') : null;
			if (row) this.remember(row, row.closest('.cmdpal--dialog'));
		};
		// Capture phase: before Thymer's own keydown (window, bubbling) and click handlers.
		document.addEventListener('keydown', onKey, true);
		document.addEventListener('click', onClick, true);

		const mo = new MutationObserver((muts) => {
			for (const m of muts) {
				for (const n of m.addedNodes) {
					if (!(n instanceof Element)) continue;
					if (n.classList.contains('cmdpal--dialog')) this.attach(n);
					else if (n.firstElementChild && n.querySelector) n.querySelectorAll('.cmdpal--dialog').forEach((d) => this.attach(d));
				}
			}
		});
		mo.observe(document.body, { childList: true, subtree: true });
		document.querySelectorAll('.cmdpal--dialog').forEach((d) => this.attach(d));

		this.cleanup.push(() => {
			document.removeEventListener('keydown', onKey, true);
			document.removeEventListener('click', onClick, true);
			mo.disconnect();
			this.detach();
			document.querySelectorAll('.bpal-recent-list').forEach((l) => l.remove());
		});
	}

	attach(dlg) {
		if (this.isMobile() || this.state?.dlg === dlg) return;
		const acc = dlg.querySelector(':scope > .cmdpal--ac-container');
		const input = dlg.querySelector('.cmdpal--input');
		if (!acc || !input) return;
		this.detach();
		const list = bpalEl('div', 'bpal-recent-list');
		list.setAttribute('role', 'listbox');
		list.setAttribute('aria-label', 'Recent commands');
		dlg.insertBefore(list, acc);
		const st = { dlg, list, input, sel: -1, shown: false, items: [], raf: 0 };
		const queue = () => {
			if (!st.raf) st.raf = requestAnimationFrame(() => { st.raf = 0; this.refresh(st); });
		};
		const onInput = () => queue();
		input.addEventListener('input', onInput);
		const mo = new MutationObserver((muts) => {
			if (muts.some((m) => !list.contains(m.target))) queue();
		});
		mo.observe(dlg, { childList: true, subtree: true, characterData: true });
		st.stop = () => {
			cancelAnimationFrame(st.raf);
			mo.disconnect();
			input.removeEventListener('input', onInput);
		};
		this.state = st;
		queue();
	}

	detach() {
		if (!this.state) return;
		this.state.stop();
		this.state.dlg.classList.remove('bpal-has-recent', 'bpal-recent-focus', 'bpal-running');
		this.state = null;
	}

	refresh(st) {
		if (!st.dlg.isConnected) {
			if (this.state === st) this.detach();
			return;
		}
		const show = this.recent.length > 0 && st.input.value === '' && this.inCommands(st.dlg) && !this.inCategory(st.dlg)
			&& !st.dlg.classList.contains('bpal-running');
		if (show === st.shown) return;
		st.shown = show;
		st.dlg.classList.toggle('bpal-has-recent', show);
		if (show) {
			this.render(st);
			this.select(st, 0);
		} else {
			this.select(st, -1);
		}
	}

	render(st) {
		st.list.textContent = '';
		const head = bpalEl('div', 'bpal-recent-head');
		head.textContent = 'Recent';
		st.list.append(head);
		st.items = this.recent.slice(0, BPAL_SHOW).map((r, i) => {
			const row = bpalEl('div', 'bpal-recent-row');
			row.setAttribute('role', 'option');
			row.style.setProperty('--bpal-i', String(i));
			const icon = bpalEl('span', 'bpal-recent-icon');
			icon.append(bpalEl('span', `ti ${r.icon || 'ti-terminal-2'}`));
			const label = bpalEl('span', 'bpal-recent-label');
			label.textContent = r.label;
			row.append(icon, label);
			if (r.kbd) {
				const kbd = bpalEl('span', 'bpal-recent-kbd');
				kbd.textContent = r.kbd;
				row.append(kbd);
			}
			row.addEventListener('mousedown', (e) => e.preventDefault()); // keep the input focused
			row.addEventListener('mousemove', () => { if (st.sel !== i) this.select(st, i); });
			row.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.run(st, r.label);
			});
			st.list.append(row);
			return row;
		});
	}

	select(st, i) {
		st.sel = i;
		st.items.forEach((row, k) => {
			row.classList.toggle('is-selected', k === i);
			row.setAttribute('aria-selected', String(k === i));
		});
		st.dlg.classList.toggle('bpal-recent-focus', i >= 0);
	}

	// Thymer's selection is on its first row, so ArrowUp should move into the Recent list.
	thymerAtTop(dlg) {
		const sel = dlg.querySelector('.cmdpal--ac-container .autocomplete--option-selected');
		if (!sel) return true;
		let first = Infinity;
		for (const o of dlg.querySelectorAll('.cmdpal--ac-container .autocomplete--option')) first = Math.min(first, Number(o.dataset.idx));
		return Number(sel.dataset.idx) === first;
	}

	recentKey(e, dlg) {
		const st = this.state;
		if (!st || st.dlg !== dlg || !st.shown || e.isComposing) return false;
		if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
		const n = st.items.length;
		const take = () => {
			e.preventDefault();
			e.stopImmediatePropagation();
			return true;
		};
		switch (e.key) {
			case 'ArrowDown':
				if (st.sel < 0) return false;
				this.select(st, st.sel < n - 1 ? st.sel + 1 : -1);
				return take();
			case 'ArrowUp':
				if (st.sel > 0) {
					this.select(st, st.sel - 1);
					return take();
				}
				if (st.sel === 0) return take();
				if (this.thymerAtTop(dlg)) {
					this.select(st, n - 1);
					return take();
				}
				return false;
			case 'Enter':
				if (st.sel < 0) return false;
				this.run(st, this.recent[st.sel].label);
				return take();
			case 'PageUp':
			case 'PageDown':
				this.select(st, -1);
				return false;
			default:
				return false;
		}
	}

	// Types the label into the palette and clicks Thymer's own result for it.
	run(st, label) {
		const { dlg, input } = st;
		dlg.classList.add('bpal-running');
		this.select(st, -1);
		input.value = label;
		input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
		const t0 = performance.now();
		const tick = () => {
			if (!dlg.isConnected) return;
			for (const row of dlg.querySelectorAll('.cmdpal--ac-container .autocomplete--option')) {
				if (bpalRowLabel(row) === label && !bpalIsCategoryRow(row)) {
					row.click();
					return;
				}
			}
			if (performance.now() - t0 > 1500) {
				// The command is gone: leave its search in view.
				dlg.classList.remove('bpal-running');
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}
}
