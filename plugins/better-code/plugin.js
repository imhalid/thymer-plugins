/**
 * BetterCode - code blocks as dark tinted cards with line numbers, an always visible language chip, and a
 * copy button.
 *
 * A code block is `.block-container-div.block-codelang` and each of its lines is its own `.listitem` row
 * inside `.block-content`. Line numbers are a CSS counter drawn in plugin.css. The copy button is a single
 * body-level button laid over the top right of the block under the mouse (nothing is inserted into the
 * block); it copies the block's lines joined by newlines.
 */

function bcdDetectDark() {
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

/** The text of a code block: its lines' text spans, one line per row. */
function bcdBlockText(block) {
	const lines = block.querySelectorAll(':scope > .block-content > .listitem > .line-div');
	return [...lines].map((d) => {
		const t = [...d.children].filter((e) => e.tagName === 'SPAN').map((e) => e.textContent).join('');
		return t === ' ' ? '' : t;
	}).join('\n');
}

class Plugin extends AppPlugin {
	onLoad() {
		this.cleanup = [];
		this.block = null; // the code block the button is over
		this.hideTimer = 0;

		this.applyPolarity();
		document.body.classList.add('bcd-on');
		const themeMo = new MutationObserver(() => this.applyPolarity());
		themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
		this.cleanup.push(() => themeMo.disconnect());

		this.makeButton();
	}

	onUnload() {
		for (const fn of this.cleanup) {
			try { fn(); } catch (e) { /* ignore */ }
		}
		this.cleanup = [];
		clearTimeout(this.hideTimer);
		clearTimeout(this.doneTimer);
		this.btn?.remove();
		document.body.classList.remove('bcd-on', 'bcd-light');
	}

	applyPolarity() {
		const light = !bcdDetectDark();
		if (document.body.classList.contains('bcd-light') !== light) document.body.classList.toggle('bcd-light', light);
	}

	makeButton() {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'bcd-copy';
		btn.setAttribute('aria-label', 'Copy code');
		btn.innerHTML = '<span class="ti ti-copy"></span><span class="bcd-copy-label">Copy</span>';
		document.body.appendChild(btn);
		this.btn = btn;

		btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor's caret where it is
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (this.block && this.block.isConnected) this.copy(this.block);
		});
		btn.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));
		btn.addEventListener('mouseleave', () => this.hideSoon());

		const onOver = (e) => {
			const t = e.target;
			if (!(t instanceof Element) || t === btn || btn.contains(t)) return;
			const block = t.closest('.block-container-div.block-codelang');
			if (block && !block.closest('.listitem-folded') && document.documentElement.getAttribute('data-device') !== 'mobile') {
				clearTimeout(this.hideTimer);
				if (block !== this.block) this.show(block);
			} else if (this.block) {
				this.hideSoon();
			}
		};
		const onScroll = () => {
			if (this.block) this.place();
		};
		document.addEventListener('mouseover', onOver, { passive: true });
		document.addEventListener('scroll', onScroll, { capture: true, passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		this.cleanup.push(() => {
			document.removeEventListener('mouseover', onOver);
			document.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', onScroll);
		});
	}

	show(block) {
		this.block = block;
		this.btn.classList.remove('is-done');
		this.btn.querySelector('.bcd-copy-label').textContent = 'Copy';
		this.place();
		this.btn.classList.add('is-on');
	}

	hideSoon() {
		clearTimeout(this.hideTimer);
		this.hideTimer = setTimeout(() => {
			this.block = null;
			this.btn.classList.remove('is-on');
		}, 160);
	}

	place() {
		const b = this.block;
		if (!b || !b.isConnected) {
			this.block = null;
			this.btn.classList.remove('is-on');
			return;
		}
		const r = b.getBoundingClientRect();
		const scroller = b.closest('.panel-scroller-y, .panel');
		const top = scroller ? scroller.getBoundingClientRect().top : 0;
		// Left of the language chip, on its line; at the corner when there is no chip.
		const chip = b.querySelector(':scope > .block-nstype-button');
		const cr = chip ? chip.getBoundingClientRect() : null;
		const right = cr && cr.width ? cr.left - 6 : r.right - 8;
		const y = cr && cr.height ? cr.top : r.top + 8;
		// Hidden once the block's top edge scrolls under its panel's top.
		const off = y < top + 4 || r.top > window.innerHeight - 20;
		this.btn.style.transform = `translate(${Math.round(right)}px, ${Math.round(y)}px) translateX(-100%)`;
		this.btn.classList.toggle('is-off', off);
	}

	async copy(block) {
		const text = bcdBlockText(block);
		try {
			await navigator.clipboard.writeText(text);
		} catch (e) {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.cssText = 'position:fixed;left:-9999px;top:0';
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy'); } catch (err) { /* nothing more to try */ }
			ta.remove();
		}
		this.btn.classList.add('is-done');
		this.btn.querySelector('.bcd-copy-label').textContent = 'Copied';
		clearTimeout(this.doneTimer);
		this.doneTimer = setTimeout(() => {
			this.btn.classList.remove('is-done');
			this.btn.querySelector('.bcd-copy-label').textContent = 'Copy';
		}, 1400);
	}
}
