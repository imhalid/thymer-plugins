/**
 * BetterSearch - Thymer's search panel restyled (the query field, result count, recent and pinned searches,
 * result groups and the selected result), and the words of the query highlighted in the results.
 *
 * Highlighting uses the CSS Custom Highlight API: ranges over the result rows' text are registered as the
 * "bse-match" highlight and plugin.css paints ::highlight(bse-match). Nothing is inserted into Thymer's
 * elements, which Thymer rebuilds on every query. Words are taken from the query as typed, leaving out
 * Thymer's query syntax (@filters, field:value, and/or/not, brackets); quoted text counts as one phrase.
 *
 * Search panels are found by a light poll (they come and go with navigation); each one gets a
 * MutationObserver, and the highlight is rebuilt on the next frame after its results or query change.
 */

const BSE_HIGHLIGHT = 'bse-match';
const BSE_STOP = new Set(['and', 'or', 'not']);
const BSE_MAX_RANGES = 2000;

function bseDetectDark() {
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

/** The plain words and quoted phrases of a Thymer search query. */
function bseTerms(query) {
	const terms = [];
	const q = String(query || '').replace(/"([^"]+)"/g, (_, phrase) => {
		if (phrase.trim().length >= 2) terms.push(phrase.trim());
		return ' ';
	});
	for (let tok of q.split(/\s+/)) {
		tok = tok.replace(/^[(!-]+|[)]+$/g, '');
		if (tok.length < 2 || tok.startsWith('@') || /[:<>=]/.test(tok) || BSE_STOP.has(tok.toLowerCase())) continue;
		terms.push(tok);
	}
	// Longest first, so a phrase wins over a word inside it; no duplicates.
	return [...new Set(terms)].sort((a, b) => b.length - a.length).slice(0, 12);
}

function bseEscape(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class Plugin extends AppPlugin {
	onLoad() {
		this.cleanup = [];
		this.watched = new Map(); // search panel -> MutationObserver
		this.frame = 0;

		this.applyPolarity();
		document.body.classList.add('bse-on');
		const themeMo = new MutationObserver(() => this.applyPolarity());
		themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.cleanup.push(() => themeMo.disconnect());

		this.canHighlight = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';
		if (this.canHighlight) {
			this.highlight = new Highlight();
			CSS.highlights.set(BSE_HIGHLIGHT, this.highlight);
			this.cleanup.push(() => {
				if (CSS.highlights.get(BSE_HIGHLIGHT) === this.highlight) CSS.highlights.delete(BSE_HIGHLIGHT);
			});

			const onInput = (e) => {
				if (e.target instanceof Element && e.target.closest('.search-panel')) this.schedule();
			};
			document.addEventListener('input', onInput, true);
			this.cleanup.push(() => document.removeEventListener('input', onInput, true));

			const poll = setInterval(() => this.syncPanels(), 600);
			this.cleanup.push(() => clearInterval(poll));
			this.syncPanels();
		}
	}

	onUnload() {
		for (const fn of this.cleanup) {
			try { fn(); } catch (e) { /* ignore */ }
		}
		this.cleanup = [];
		for (const mo of this.watched.values()) mo.disconnect();
		this.watched.clear();
		if (this.frame) cancelAnimationFrame(this.frame);
		document.body.classList.remove('bse-on', 'bse-light');
	}

	applyPolarity() {
		const light = !bseDetectDark();
		if (document.body.classList.contains('bse-light') !== light) document.body.classList.toggle('bse-light', light);
	}

	/** Watch the search panels that are open now, and let go of the closed ones. */
	syncPanels() {
		const open = new Set(document.querySelectorAll('.search-panel'));
		let changed = false;
		for (const [panel, mo] of this.watched) {
			if (!open.has(panel) || !panel.isConnected) {
				mo.disconnect();
				this.watched.delete(panel);
				changed = true;
			}
		}
		for (const panel of open) {
			if (this.watched.has(panel)) continue;
			const mo = new MutationObserver(() => this.schedule());
			mo.observe(panel, { childList: true, subtree: true, characterData: true });
			this.watched.set(panel, mo);
			changed = true;
		}
		if (changed) this.schedule();
	}

	schedule() {
		if (this.frame) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = 0;
			try { this.paint(); } catch (e) { /* leave the last highlight */ }
		});
	}

	paint() {
		const ranges = [];
		for (const panel of this.watched.keys()) {
			const input = panel.querySelector('.query-input--field');
			const terms = bseTerms(input ? input.value : '');
			if (!terms.length) continue;
			const re = new RegExp(terms.map(bseEscape).join('|'), 'giu');
			const lines = panel.querySelectorAll('listview-editor.listview-search-results .listitem-ref > .line-div');
			for (const line of lines) {
				const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
				for (let node = walker.nextNode(); node; node = walker.nextNode()) {
					const text = node.nodeValue;
					if (!text || text.length < 2) continue;
					re.lastIndex = 0;
					for (let m = re.exec(text); m; m = re.exec(text)) {
						if (!m[0]) { re.lastIndex++; continue; }
						const r = new Range();
						r.setStart(node, m.index);
						r.setEnd(node, m.index + m[0].length);
						ranges.push(r);
						if (ranges.length >= BSE_MAX_RANGES) break;
					}
					if (ranges.length >= BSE_MAX_RANGES) break;
				}
				if (ranges.length >= BSE_MAX_RANGES) break;
			}
		}
		this.highlight.clear();
		for (const r of ranges) this.highlight.add(r);
	}
}
