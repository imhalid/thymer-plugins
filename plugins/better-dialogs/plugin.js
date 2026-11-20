/**
 * BetterDialogs - Thymer's modal dialogs, confirmations and the settings screen as dark tinted cards with a
 * soft spring entrance, glowing primary and danger buttons, rounded fields and a settings menu with a
 * glowing line on the open section. plugin.css does the drawing; this file only switches the look on and
 * picks the light or dark variant.
 */

function bdgDetectDark() {
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
		document.body.classList.add('bdg-on');
		this.themeMo = new MutationObserver(() => this.applyPolarity());
		this.themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
	}

	onUnload() {
		this.themeMo?.disconnect();
		document.body.classList.remove('bdg-on', 'bdg-light');
	}

	applyPolarity() {
		const light = !bdgDetectDark();
		if (document.body.classList.contains('bdg-light') !== light) document.body.classList.toggle('bdg-light', light);
	}
}
