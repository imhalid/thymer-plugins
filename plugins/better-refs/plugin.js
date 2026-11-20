/**
 * BetterRefs - line references and backlinks as tinted cards: referenced lines (`.listitem-ref`) get a
 * cyan edge, the backlink count (`.lineitem-backlink-pill`) is a small chip, and the References section
 * under a page (its toggle, source headings, context cards) and the backlinks popup are restyled.
 * plugin.css does the drawing and Thymer still builds every element; this file only switches the look on
 * and picks the light or dark variant.
 */

function brfDetectDark() {
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

class Plugin extends AppPlugin {
	onLoad() {
		this.applyPolarity();
		document.body.classList.add('brf-on');
		this.themeMo = new MutationObserver(() => this.applyPolarity());
		this.themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
	}

	onUnload() {
		this.themeMo?.disconnect();
		document.body.classList.remove('brf-on', 'brf-light');
	}

	applyPolarity() {
		const light = !brfDetectDark();
		if (document.body.classList.contains('brf-light') !== light) document.body.classList.toggle('brf-light', light);
	}
}
