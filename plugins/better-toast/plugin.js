/**
 * BetterToast - Thymer's toasts as dark tinted cards with an inner glow and a glowing accent line.
 *
 * Thymer's toast (`.toaster`: title, message, buttons) carries no type, so the kind is guessed from
 * its text and stored as data-bto (error, warning, success, info, loading); plugin.css draws the
 * card from it. Three things CSS cannot do are done here:
 * - Stacking: Thymer stacks toasts 40px apart, oldest nearest the edge, so a taller card covers
 *   the one above and toasts with different lifetimes vanish from the middle of the pile. The area
 *   is re-stacked by arrival order, newest nearest the edge, by real heights; Thymer's own writes
 *   trigger it again, and once our values are in place there is nothing left to write. A new toast
 *   is placed without a transition (data-bto-placed marks the ones already placed).
 * - Leaving: Thymer drops a toast's node at once. A copy (.bto-ghost, on <body>, outside Thymer's
 *   DOM) slides out beneath the remaining toasts, which glide up over it.
 * - Theme polarity, for the light variant.
 * Nothing is inserted into Thymer's own elements; only data attributes are set on toasts.
 */

const BTO_KINDS = ['error', 'warning', 'success', 'info', 'loading'];
const BTO_GAP = 10;

const BTO_TITLE_KIND = [
	[/^(error|failed|failure|oops)\b/i, 'error'],
	[/^(warning|caution|careful|heads up)\b/i, 'warning'],
	[/^(success|done|saved|copied|exported|imported)\b/i, 'success'],
	[/^(info|note|tip|fyi)\b/i, 'info'],
	[/^(loading|saving|syncing|uploading|working)\b/i, 'loading'],
];
const BTO_TEXT_KIND = [
	[/(…|\.\.\.)\s*$|\b(loading|saving|syncing|uploading|downloading|importing|exporting|deleting|processing|preparing|connecting|reconnecting|please wait|in progress)\b/i, 'loading'],
	[/\b(error|errors|failed|fail|failure|invalid|denied|blocked|could ?n[o']t|cannot|can't|unable|not allowed|not found|conflict|lost|crashed|rejected)\b/i, 'error'],
	[/\b(warning|warn|caution|careful|irreversible|permanently|undone|expires?|expired|limit|quota|offline|deprecated|unsaved|discard|overwrite|are you sure)\b/i, 'warning'],
	[/\b(saved|copied|done|success|successful|successfully|added|created|exported|imported|enabled|restored|updated|installed|published|moved|synced|complete|completed|ready)\b/i, 'success'],
];

function btoKindOf(el) {
	const title = (el.querySelector('.toaster-title')?.textContent || '').trim();
	const message = (el.querySelector('.toaster-message')?.textContent || '').trim();
	for (const [re, kind] of BTO_TITLE_KIND) if (re.test(title)) return kind;
	const text = `${title} ${message}`;
	for (const [re, kind] of BTO_TEXT_KIND) if (re.test(text)) return kind;
	return 'info';
}

function btoDetectDark() {
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

function btoReducedMotion() {
	try {
		return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
	} catch (e) {
		return false;
	}
}

class Plugin extends AppPlugin {
	onLoad() {
		this.cleanup = [];
		this.applyPolarity();
		document.body.classList.add('bto-on');

		const themeMo = new MutationObserver(() => this.applyPolarity());
		themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.cleanup.push(() => themeMo.disconnect());

		this.installToasts();

		this.ui.addCommandPaletteCommand({ label: 'BetterToast: preview toasts', icon: 'ti-message-2', onSelected: () => this.preview() });
	}

	onUnload() {
		for (const fn of this.cleanup) {
			try { fn(); } catch (e) { /* ignore */ }
		}
		this.cleanup = [];
		document.body.classList.remove('bto-on', 'bto-light');
	}

	applyPolarity() {
		const light = !btoDetectDark();
		if (document.body.classList.contains('bto-light') !== light) document.body.classList.toggle('bto-light', light);
	}

	installToasts() {
		const rects = new Map(); // toaster -> resting rect (for the leaving copy)
		const watched = new WeakSet();
		const order = new WeakMap(); // toaster -> arrival number
		let arrivals = 0;
		const isMobile = () => document.documentElement.getAttribute('data-device') === 'mobile';

		const measure = (el) => {
			if (!el.isConnected) return;
			const t = el.getBoundingClientRect();
			if (!(t.width > 0)) return;
			// Resting position: take out the entrance slide if it is still running.
			let dx = 0;
			let dy = 0;
			try {
				const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
				dx = m.m41;
				dy = m.m42;
			} catch (e) { /* 'none': no offset */ }
			rects.set(el, { left: t.left - dx, top: t.top - dy, width: el.offsetWidth || t.width, height: el.offsetHeight || t.height });
		};
		const remember = (el) => requestAnimationFrame(() => measure(el));

		const areas = new Set();
		let stackRaf = 0;
		const restack = () => {
			stackRaf = 0;
			if (isMobile()) { areas.clear(); return; }
			const limit = Math.max(120, (window.innerHeight || 800) - 140);
			for (const area of areas) {
				if (!area.isConnected) continue;
				const up = (!area.style.top || area.style.top === 'auto') && area.style.bottom && area.style.bottom !== 'auto';
				const prop = up ? 'bottom' : 'top';
				const stack = [...area.children]
					.filter((t) => t.classList.contains('toaster') && !(t.style.left && t.style.left !== 'auto')) // not placed next to an element
					.sort((a, b) => (order.get(b) || 0) - (order.get(a) || 0)); // newest first
				let off = 0;
				for (const t of stack) {
					const v = `${Math.round(off)}px`;
					if (t.style[prop] !== v) t.style[prop] = v;
					if (!t.hasAttribute('data-bto-placed')) {
						// After this frame's styles land, so the first placement does not glide.
						requestAnimationFrame(() => requestAnimationFrame(() => t.setAttribute('data-bto-placed', '')));
					}
					off = Math.min(off + t.offsetHeight + BTO_GAP, limit);
				}
			}
			areas.clear();
		};
		const queueRestack = (area) => {
			if (!(area instanceof Element) || !area.classList.contains('id--toaster-area')) return;
			areas.add(area);
			if (!stackRaf) stackRaf = requestAnimationFrame(restack);
		};

		const styleMo = new MutationObserver((muts) => {
			for (const m of muts) {
				remember(m.target);
				queueRestack(m.target.parentElement);
			}
		});

		const arrive = (el) => {
			if (watched.has(el)) return;
			watched.add(el);
			order.set(el, ++arrivals);
			el.setAttribute('data-bto', btoKindOf(el));
			styleMo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
			el.addEventListener('animationend', (e) => { if (e.target === el) remember(el); });
			remember(el);
			queueRestack(el.parentElement);
		};

		const leave = (el, area) => {
			const r = rects.get(el);
			rects.delete(el);
			queueRestack(area);
			if (!r || isMobile() || btoReducedMotion()) return;
			const ghost = el.cloneNode(true);
			ghost.className = 'bto-ghost';
			ghost.setAttribute('aria-hidden', 'true');
			ghost.inert = true;
			ghost.querySelectorAll('[class*="id--"]').forEach((n) => {
				n.className = n.className.replace(/\bid--[\w-]+/g, '').trim();
			});
			ghost.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;min-height:${r.height}px`;
			document.body.appendChild(ghost);
			ghost.addEventListener('animationend', () => ghost.remove());
			setTimeout(() => ghost.remove(), 600);
		};

		const mo = new MutationObserver((muts) => {
			for (const m of muts) {
				for (const n of m.addedNodes) {
					if (!(n instanceof Element)) continue;
					if (n.classList.contains('toaster')) arrive(n);
					else if (n.querySelector) n.querySelectorAll('.toaster').forEach(arrive);
				}
				for (const n of m.removedNodes) {
					if (!(n instanceof Element) || n.classList.contains('bto-ghost')) continue;
					if (n.classList.contains('toaster')) leave(n, m.target);
					else if (n.querySelector) n.querySelectorAll('.toaster').forEach((t) => leave(t, null));
				}
			}
		});
		mo.observe(document.body, { childList: true, subtree: true });
		document.querySelectorAll('.toaster').forEach(arrive);

		this.cleanup.push(() => {
			mo.disconnect();
			styleMo.disconnect();
			cancelAnimationFrame(stackRaf);
			document.querySelectorAll('.bto-ghost').forEach((g) => g.remove());
			document.querySelectorAll('.toaster[data-bto]').forEach((t) => {
				t.removeAttribute('data-bto');
				t.removeAttribute('data-bto-placed');
			});
		});
	}

	preview() {
		const samples = [
			{ title: 'Error', message: 'Could not sync this workspace. Check your connection and try again.', dismissible: true, autoDestroyTime: 6000, primaryLabel: 'Retry', onPrimary: (t) => t?.destroy?.() },
			{ title: 'Success', message: 'Workspace exported successfully. The archive is ready to download.', dismissible: true, autoDestroyTime: 6000 },
			{ title: 'Warning', message: 'This action is irreversible. Deleting a page permanently removes its content.', dismissible: true, autoDestroyTime: 6000 },
			{ title: 'Info', message: 'Daily notes older than a year will be archived in 24 hours.', dismissible: true, autoDestroyTime: 6000 },
			{ title: 'Loading', message: 'Syncing workspace…', dismissible: false, autoDestroyTime: 6000 },
		];
		samples.forEach((t, i) => setTimeout(() => this.ui.addToaster(t), i * 320));
	}
}
