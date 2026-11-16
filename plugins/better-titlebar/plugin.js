/**
 * BetterTitlebar - the panel title bar with the page's word count and reading time, and softer square-ish
 * icon buttons.
 *
 * The count is shown by plugin.css as the title bar's ::after, from a data-btb-stats attribute set on the
 * panel's `.panel-bar--tabsbar` (Thymer keeps that element; it rebuilds only the icon rows inside it, so
 * nothing is inserted). Words are counted in the panel's editor lines, leaving out the References section;
 * a panel is counted again when it is typed in, or when its page changes (checked every second).
 */

const BTB_WPM = 230;
const BTB_WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function btbDetectDark() {
	const root = document.documentElement;
	if (root.classList.contains('basic-dark') || root.classList.contains('is-dark')) return true;
	if (root.classList.contains('basic-light') || root.classList.contains('is-light')) return false;
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

/** "1,234 words · 6 min" for a panel, or '' when it has no editor text. */
function btbStats(panel) {
	let words = 0;
	for (const line of panel.querySelectorAll('listview-editor .listitem > .line-div')) {
		if (line.closest('.backrefs-footer, .listview-references, .listview-search-results')) continue;
		const m = (line.textContent || '').match(BTB_WORD);
		if (m) words += m.length;
	}
	if (!words) return '';
	const min = Math.max(1, Math.round(words / BTB_WPM));
	return `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} · ${min} min`;
}

class Plugin extends AppPlugin {
	onLoad() {
		this.cleanup = [];
		this.keys = new WeakMap(); // panel -> what its count was made from
		this.dirty = new Set(); // panels typed in since the last count
		this.timer = 0;

		this.applyPolarity();
		document.body.classList.add('btb-on');
		const themeMo = new MutationObserver(() => this.applyPolarity());
		themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.cleanup.push(() => themeMo.disconnect());

		const onInput = (e) => {
			const panel = e.target instanceof Element ? e.target.closest('.panel') : null;
			if (!panel) return;
			this.dirty.add(panel);
			clearTimeout(this.timer);
			this.timer = setTimeout(() => this.refresh(), 500);
		};
		document.addEventListener('input', onInput, true);
		this.cleanup.push(() => document.removeEventListener('input', onInput, true));

		const poll = setInterval(() => this.refresh(), 1000);
		this.cleanup.push(() => clearInterval(poll));
		this.refresh();
	}

	onUnload() {
		for (const fn of this.cleanup) {
			try { fn(); } catch (e) { /* ignore */ }
		}
		this.cleanup = [];
		clearTimeout(this.timer);
		document.querySelectorAll('.panel-bar--tabsbar[data-btb-stats]').forEach((el) => el.removeAttribute('data-btb-stats'));
		document.body.classList.remove('btb-on', 'btb-light');
	}

	applyPolarity() {
		const light = !btbDetectDark();
		if (document.body.classList.contains('btb-light') !== light) document.body.classList.toggle('btb-light', light);
	}

	refresh() {
		for (const bar of document.querySelectorAll('.panel-bar--tabsbar')) {
			const panel = bar.closest('.panel');
			if (!panel) continue;
			// What the page is: its first line's guid and how many lines it has. A change means navigation or
			// lines added/removed; typing is caught by the input listener.
			const first = panel.querySelector('listview-editor .listitem[data-guid]');
			const key = `${first ? first.getAttribute('data-guid') : ''}:${panel.querySelectorAll('listview-editor .listitem').length}`;
			if (this.keys.get(panel) === key && !this.dirty.has(panel)) continue;
			this.keys.set(panel, key);
			this.dirty.delete(panel);
			const stats = btbStats(panel);
			if (stats) {
				if (bar.getAttribute('data-btb-stats') !== stats) bar.setAttribute('data-btb-stats', stats);
			} else if (bar.hasAttribute('data-btb-stats')) {
				bar.removeAttribute('data-btb-stats');
			}
		}
	}
}
