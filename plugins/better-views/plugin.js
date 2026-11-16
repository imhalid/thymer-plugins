/**
 * BetterViews - collection views as dark tinted cards: board cards and columns with their column color as
 * an edge, table headers, rows and focused cells, gallery and list cards, the view switcher, and the
 * property pills inside them. plugin.css does the drawing and Thymer still builds and sizes every
 * element; this file only switches the look on and picks the light or dark variant.
 */

function bvwDetectDark() {
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
		document.body.classList.add('bvw-on');
		this.themeMo = new MutationObserver(() => this.applyPolarity());
		this.themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
	}

	onUnload() {
		this.themeMo?.disconnect();
		document.body.classList.remove('bvw-on', 'bvw-light');
	}

	applyPolarity() {
		const light = !bvwDetectDark();
		if (document.body.classList.contains('bvw-light') !== light) document.body.classList.toggle('bvw-light', light);
	}
}
