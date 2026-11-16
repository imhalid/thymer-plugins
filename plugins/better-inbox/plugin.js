/**
 * BetterInbox - keeps every toast Thymer shows, so a message that vanished can be read and copied again.
 *
 * Toasts (`.toaster`) are seen as they are added to the page; their title and message are kept
 * (localStorage, newest first, deduplicated when the same text repeats). Loading toasts ("Syncing…")
 * are skipped. A bell in the status bar shows the unread count; it opens a panel (on <body>, outside
 * Thymer's DOM) listing them as small cards tinted by kind, with a copy button each. The kind comes
 * from BetterToast's data-bto when it is installed, else from the same text rules.
 */

const BIB_LOG_KEY = 'bib-log-v1';
const BIB_SEEN_KEY = 'bib-seen-v1';
const BIB_MAX = 60;
const BIB_REPEAT_MS = 10000;
const BIB_KINDS = ['error', 'warning', 'success', 'info'];

const BIB_TITLE_KIND = [
	[/^(error|failed|failure|oops)\b/i, 'error'],
	[/^(warning|caution|careful|heads up)\b/i, 'warning'],
	[/^(success|done|saved|copied|exported|imported)\b/i, 'success'],
	[/^(info|note|tip|fyi)\b/i, 'info'],
	[/^(loading|saving|syncing|uploading|working)\b/i, 'loading'],
];
const BIB_TEXT_KIND = [
	[/(…|\.\.\.)\s*$|\b(loading|saving|syncing|uploading|downloading|importing|exporting|deleting|processing|preparing|connecting|reconnecting|please wait|in progress)\b/i, 'loading'],
	[/\b(error|errors|failed|fail|failure|invalid|denied|blocked|could ?n[o']t|cannot|can't|unable|not allowed|not found|conflict|lost|crashed|rejected)\b/i, 'error'],
	[/\b(warning|warn|caution|careful|irreversible|permanently|undone|expires?|expired|limit|quota|offline|deprecated|unsaved|discard|overwrite|are you sure)\b/i, 'warning'],
	[/\b(saved|copied|done|success|successful|successfully|added|created|exported|imported|enabled|restored|updated|installed|published|moved|synced|complete|completed|ready)\b/i, 'success'],
];

function bibKind(title, message) {
	for (const [re, kind] of BIB_TITLE_KIND) if (re.test(title)) return kind;
	const text = `${title} ${message}`;
	for (const [re, kind] of BIB_TEXT_KIND) if (re.test(text)) return kind;
	return 'info';
}

function bibLoad() {
	try {
		const v = JSON.parse(localStorage.getItem(BIB_LOG_KEY) || '[]');
		if (!Array.isArray(v)) return [];
		return v
			.filter((e) => e && typeof e.t === 'number' && (typeof e.title === 'string' || typeof e.message === 'string'))
			.slice(0, BIB_MAX)
			.map((e) => ({
				t: e.t,
				title: String(e.title || '').slice(0, 300),
				message: String(e.message || '').slice(0, 2000),
				kind: BIB_KINDS.includes(e.kind) ? e.kind : 'info',
				count: Math.max(1, Number(e.count) || 1),
			}));
	} catch (e) {
		return [];
	}
}

function bibStore(key, value) {
	try {
		localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
	} catch (e) { /* storage blocked: the log lives for this session only */ }
}

function bibAgo(t, now) {
	const s = Math.max(0, Math.round((now - t) / 1000));
	if (s < 45) return 'now';
	if (s < 3600) return `${Math.round(s / 60)}m`;
	if (s < 86400) return `${Math.round(s / 3600)}h`;
	const d = new Date(t);
	return d.toLocaleDateString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function bibDetectDark() {
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

function bibEl(tag, cls, text) {
	const n = document.createElement(tag);
	if (cls) n.className = cls;
	if (text != null) n.textContent = text;
	return n;
}

class Plugin extends AppPlugin {
	onLoad() {
		this.cleanup = [];
		this.log = bibLoad();
		try {
			this.seen = Number(localStorage.getItem(BIB_SEEN_KEY)) || 0;
		} catch (e) {
			this.seen = 0;
		}
		this.pop = null;

		this.applyPolarity();
		const themeMo = new MutationObserver(() => this.applyPolarity());
		themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.cleanup.push(() => themeMo.disconnect());

		this.bell = this.ui.addStatusBarItem({ icon: 'ti-bell', label: '', tooltip: 'Notifications', onClick: () => this.toggle() });
		this.cleanup.push(() => this.bell?.remove());
		this.updateBell();

		this.watchToasts();

		this.ui.addCommandPaletteCommand({ label: 'BetterInbox: show notifications', icon: 'ti-bell', onSelected: () => this.open() });
		this.ui.addCommandPaletteCommand({ label: 'BetterInbox: clear notifications', icon: 'ti-bell-off', onSelected: () => this.clear() });
	}

	onUnload() {
		this.close();
		for (const fn of this.cleanup) {
			try { fn(); } catch (e) { /* ignore */ }
		}
		this.cleanup = [];
		document.body.classList.remove('bib-light');
	}

	applyPolarity() {
		const light = !bibDetectDark();
		if (document.body.classList.contains('bib-light') !== light) document.body.classList.toggle('bib-light', light);
	}

	unread() {
		return this.log.filter((e) => e.t > this.seen).length;
	}

	updateBell() {
		if (!this.bell) return;
		const n = this.unread();
		this.bell.setIcon(n ? 'ti-bell-ringing' : 'ti-bell');
		this.bell.setLabel(n ? String(n > 99 ? '99+' : n) : '');
		this.bell.setTooltip(n ? `${n} unread notification${n === 1 ? '' : 's'}` : 'Notifications');
		const el = this.bell.getElement?.();
		if (el) {
			if (n) el.setAttribute('data-bib-unread', '');
			else el.removeAttribute('data-bib-unread');
		}
	}

	// ---- Collecting ---------------------------------------------------------------------------

	watchToasts() {
		const seen = new WeakSet();
		const take = (el) => {
			if (seen.has(el)) return;
			seen.add(el);
			// A frame later: the text is in place, and BetterToast has set data-bto if it is installed.
			requestAnimationFrame(() => this.capture(el));
		};
		const mo = new MutationObserver((muts) => {
			for (const m of muts) {
				for (const n of m.addedNodes) {
					if (!(n instanceof Element)) continue;
					if (n.classList.contains('toaster')) take(n);
					else if (n.firstElementChild) n.querySelectorAll('.toaster').forEach(take);
				}
			}
		});
		mo.observe(document.body, { childList: true, subtree: true });
		this.cleanup.push(() => mo.disconnect());
	}

	capture(el) {
		const titleEl = el.querySelector('.toaster-title');
		const title = titleEl && titleEl.style.display !== 'none' ? (titleEl.textContent || '').trim() : '';
		const message = (el.querySelector('.toaster-message')?.textContent || '').trim();
		if (!title && !message) return;
		const bto = el.getAttribute('data-bto');
		const kind = BIB_KINDS.includes(bto) || bto === 'loading' ? bto : bibKind(title, message);
		if (kind === 'loading') return;
		const now = Date.now();
		const top = this.log[0];
		if (top && top.title === title && top.message === message && now - top.t < BIB_REPEAT_MS) {
			top.t = now;
			top.count += 1;
		} else {
			this.log.unshift({ t: now, title: title.slice(0, 300), message: message.slice(0, 2000), kind, count: 1 });
			this.log.length = Math.min(this.log.length, BIB_MAX);
		}
		bibStore(BIB_LOG_KEY, this.log);
		if (this.pop) {
			this.markSeen();
			this.renderList();
		} else {
			this.updateBell();
		}
	}

	clear() {
		this.log = [];
		bibStore(BIB_LOG_KEY, this.log);
		this.markSeen();
		if (this.pop) this.renderList();
	}

	markSeen() {
		this.seen = Date.now();
		bibStore(BIB_SEEN_KEY, String(this.seen));
		this.updateBell();
	}

	// ---- The panel ----------------------------------------------------------------------------

	toggle() {
		if (this.pop) this.close();
		else this.open();
	}

	open() {
		if (this.pop) return;
		const unreadSince = this.seen;
		const pop = bibEl('div', 'bib-pop');
		pop.setAttribute('role', 'dialog');
		pop.setAttribute('aria-label', 'Notifications');

		const head = bibEl('div', 'bib-head');
		head.append(bibEl('span', 'bib-title', 'Notifications'));
		const count = bibEl('span', 'bib-count');
		head.append(count);
		const clear = bibEl('button', 'bib-clear');
		clear.type = 'button';
		clear.append(bibEl('span', 'ti ti-trash'), bibEl('span', null, 'Clear'));
		clear.addEventListener('click', () => this.clear());
		head.append(clear);

		const list = bibEl('div', 'bib-list');
		pop.append(head, list);
		document.body.appendChild(pop);
		this.pop = { el: pop, list, count, unreadSince };
		this.place();
		this.renderList();
		this.markSeen();

		const onDown = (e) => {
			if (!(e.target instanceof Node)) return;
			if (pop.contains(e.target)) return;
			const bell = this.bell?.getElement?.();
			if (bell && bell.contains(e.target)) return; // the bell's own click toggles
			this.close();
		};
		const onKey = (e) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				this.close();
			}
		};
		const onResize = () => this.place();
		document.addEventListener('pointerdown', onDown, true);
		document.addEventListener('keydown', onKey, true);
		window.addEventListener('resize', onResize);
		const tick = setInterval(() => this.renderTimes(), 30000);
		this.pop.stop = () => {
			document.removeEventListener('pointerdown', onDown, true);
			document.removeEventListener('keydown', onKey, true);
			window.removeEventListener('resize', onResize);
			clearInterval(tick);
		};
		requestAnimationFrame(() => pop.classList.add('is-open'));
	}

	close() {
		if (!this.pop) return;
		const { el, stop } = this.pop;
		stop();
		this.pop = null;
		el.classList.remove('is-open');
		el.classList.add('is-closing');
		setTimeout(() => el.remove(), 180);
	}

	// Above the bell, right edges aligned, kept on screen.
	place() {
		const el = this.pop?.el;
		if (!el) return;
		const bell = this.bell?.getElement?.();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const w = Math.min(400, vw - 24);
		el.style.width = `${w}px`;
		if (bell && bell.isConnected) {
			const r = bell.getBoundingClientRect();
			const left = Math.max(12, Math.min(r.right - w, vw - w - 12));
			el.style.left = `${left}px`;
			el.style.bottom = `${Math.max(12, vh - r.top + 8)}px`;
			el.style.maxHeight = `${Math.max(200, r.top - 24)}px`;
		} else {
			el.style.left = `${vw - w - 16}px`;
			el.style.bottom = '40px';
			el.style.maxHeight = `${vh - 80}px`;
		}
	}

	renderList() {
		if (!this.pop) return;
		const { list, count, unreadSince } = this.pop;
		list.textContent = '';
		count.textContent = this.log.length ? String(this.log.length) : '';
		if (!this.log.length) {
			const empty = bibEl('div', 'bib-empty');
			empty.append(bibEl('span', 'ti ti-bell-off'), bibEl('div', null, 'No notifications yet'));
			list.append(empty);
			return;
		}
		const now = Date.now();
		this.log.forEach((e, i) => {
			const item = bibEl('div', 'bib-item');
			item.setAttribute('data-kind', e.kind);
			if (e.t > unreadSince) item.classList.add('is-new');
			item.style.setProperty('--bib-i', String(Math.min(i, 8)));

			const text = bibEl('div', 'bib-text');
			if (e.title) text.append(bibEl('span', 'bib-item-title', e.title));
			if (e.message) text.append(bibEl('span', 'bib-item-msg', e.message));

			const side = bibEl('div', 'bib-side');
			const time = bibEl('span', 'bib-time', bibAgo(e.t, now));
			time.setAttribute('data-t', String(e.t));
			time.title = new Date(e.t).toLocaleString();
			side.append(time);
			if (e.count > 1) side.append(bibEl('span', 'bib-repeat', `×${e.count}`));

			const copy = bibEl('button', 'bib-copy');
			copy.type = 'button';
			copy.title = 'Copy';
			copy.append(bibEl('span', 'ti ti-copy'));
			copy.addEventListener('click', () => this.copy(e, copy));
			side.append(copy);

			item.append(text, side);
			list.append(item);
		});
	}

	renderTimes() {
		if (!this.pop) return;
		const now = Date.now();
		this.pop.list.querySelectorAll('.bib-time[data-t]').forEach((n) => {
			n.textContent = bibAgo(Number(n.getAttribute('data-t')), now);
		});
	}

	async copy(entry, btn) {
		const text = entry.title && entry.message ? `${entry.title}: ${entry.message}` : entry.title || entry.message;
		let ok = false;
		try {
			await navigator.clipboard.writeText(text);
			ok = true;
		} catch (e) {
			try {
				const ta = bibEl('textarea');
				ta.value = text;
				ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
				document.body.appendChild(ta);
				ta.select();
				ok = document.execCommand('copy');
				ta.remove();
			} catch (e2) { /* ignore */ }
		}
		const icon = btn.firstElementChild;
		if (!icon) return;
		icon.className = ok ? 'ti ti-check' : 'ti ti-x';
		btn.classList.toggle('is-done', ok);
		setTimeout(() => {
			icon.className = 'ti ti-copy';
			btn.classList.remove('is-done');
		}, 1200);
	}
}
