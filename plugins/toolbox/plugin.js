/**
 * toolbox - a small box that floats above the text you select, with an arrow pointing at it. It holds nothing yet.
 *
 * Thymer's editor draws its selection as a layer of its own (.listview-selections, rectangles under the text) rather than
 * with the browser's, so the selection is found from those rectangles, and from the browser's selection when that is in a
 * line instead. Nothing here reacts to an event: the selection is looked at once a frame (a handful of elements), which is
 * what keeps the box in step with scrolling and with a selection that grows under the mouse or the keyboard.
 *
 * The box shows as soon as there is a selection, stays out of the way of the title bar, goes when the selection does, and
 * Escape puts it away until the selection changes.
 *
 * HOW TO ADD A TOOL
 *   Add an entry to TOOLS: { icon: 'ti-copy', title: 'Copy', run: ({ text }) => ... }. Each becomes a button in the box;
 *   `text` is the browser's selected text (empty when Thymer's own selection is not mirrored there).
 */

const SELECTIONS_SEL = '.listview-selections';                     // Thymer's selection layer, in each editor
const FOCUSED_PANEL_SEL = '.panel.focused-panel, .panel.has-focus';
const SCROLLER_SEL = '.panel-scroller-y';
const GAP = 10;                                                    // between the box and the selection

const TOOLS = [];   // { icon, title, run({ text }) }

class Plugin extends AppPlugin {
	box = null;
	cleanup = [];
	raf = 0;
	dismissed = '';        // the selection (as a signature) Escape was pressed on
	sig = '';
	placed = '';

	onLoad() {
		try { localStorage.removeItem('toolbox.highlights'); } catch (e) { /* nothing to clean */ }   // from a version that had highlights
		this.mount();
		const listen = (target, type, fn, opts) => {
			target.addEventListener(type, fn, opts);
			this.cleanup.push(() => target.removeEventListener(type, fn, opts));
		};
		listen(document, 'keydown', (e) => { if (e.key === 'Escape' && this.box.classList.contains('on')) this.dismissed = this.sig; }, { capture: true, passive: true });
		const tick = () => {
			this.update();
			this.raf = requestAnimationFrame(tick);
		};
		this.raf = requestAnimationFrame(tick);
	}

	onUnload() {
		cancelAnimationFrame(this.raf);
		this.cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
		this.cleanup = [];
		if (this.box) this.box.remove();
		this.box = null;
	}

	mount() {
		const box = document.createElement('div');
		box.className = 'tb-box';
		box.setAttribute('role', 'toolbar');
		// Pressing on the box must not take the focus (and with it the selection) away from the text.
		box.addEventListener('mousedown', (e) => e.preventDefault());
		if (TOOLS.length) {
			for (const tool of TOOLS) {
				const b = document.createElement('button');
				b.type = 'button';
				b.className = 'tb-tool tooltip';
				b.setAttribute('data-tooltip', tool.title);
				b.setAttribute('data-tooltip-dir', 'top');
				b.innerHTML = `<span class="ti ${tool.icon}"></span>`;
				b.addEventListener('click', () => tool.run({ text: String(window.getSelection() || '') }));
				box.appendChild(b);
			}
		} else {
			box.innerHTML = '<span class="tb-label">Toolbox</span>';
		}
		document.body.appendChild(box);
		this.box = box;
	}

	/** The rectangles of the selection and the panel it is in: from Thymer's selection layer, else from the browser's selection in a line. */
	selection() {
		const focused = document.querySelector(FOCUSED_PANEL_SEL);
		const layers = Array.from(document.querySelectorAll(SELECTIONS_SEL)).sort((a, b) => (focused && focused.contains(b) ? 1 : 0) - (focused && focused.contains(a) ? 1 : 0));
		for (const layer of layers) {
			const rects = [];
			for (const el of layer.querySelectorAll('*')) {
				const r = el.getBoundingClientRect();
				if (r.width < 2 || r.height < 2) continue;
				const bg = getComputedStyle(el).backgroundColor;
				if (!bg || bg === 'transparent' || /,\s*0\)$/.test(bg)) continue;
				rects.push(r);
			}
			if (rects.length) return { rects, panel: layer.closest('.panel') };
		}
		const sel = window.getSelection();
		if (sel && sel.rangeCount && !sel.isCollapsed) {
			const range = sel.getRangeAt(0), node = range.commonAncestorContainer;
			const el = node.nodeType === 1 ? node : node.parentElement;
			if (el && el.closest && el.closest('.line-div')) {
				const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
				if (rects.length) return { rects, panel: el.closest('.panel') };
			}
		}
		return null;
	}

	/** Where a panel's title bar ends (its own box can be empty when its contents are laid over the page, so what is in it is measured too). */
	barBottom(panel, top) {
		let bottom = top;
		for (const el of panel.querySelectorAll('.panel-bar, .panel-bar *')) {
			const b = el.getBoundingClientRect();
			if (b.height > 0 && b.width > 0 && b.top < top + 90 && b.bottom < top + 140) bottom = Math.max(bottom, b.bottom);
		}
		return bottom;
	}

	hide() {
		this.box.classList.remove('on');
		this.placed = '';
	}

	update() {
		const found = this.selection();
		if (!found) { this.sig = ''; this.hide(); return; }
		const { rects, panel } = found;
		const first = rects.reduce((a, r) => (r.top < a.top - 1 || (Math.abs(r.top - a.top) <= 1 && r.left < a.left) ? r : a));
		const last = rects.reduce((a, r) => (r.bottom > a.bottom ? r : a));
		this.sig = [first.left, first.top, last.bottom, rects.length].map(Math.round).join(',');
		if (this.sig === this.dismissed) { this.hide(); return; }
		// The part of the window the text is shown in: the panel's scroll area, below its title bar.
		let vt = 0, vb = window.innerHeight, vl = 0, vr = window.innerWidth;
		if (panel) {
			const s = (panel.querySelector(SCROLLER_SEL) || panel).getBoundingClientRect(), pr = panel.getBoundingClientRect();
			vt = Math.max(s.top, pr.top, this.barBottom(panel, pr.top)); vb = Math.min(s.bottom, pr.bottom, vb);
			vl = Math.max(s.left, vl); vr = Math.min(s.right, vr);
		}
		if (last.bottom < vt || first.top > vb) { this.hide(); return; }   // scrolled out of sight
		const box = this.box;
		box.classList.add('on');
		const bw = box.offsetWidth, bh = box.offsetHeight;
		const cx = first.left + first.width / 2;
		const left = Math.max(vl + 8, Math.min(cx - bw / 2, vr - bw - 8));
		let top = first.top - bh - GAP, below = false;
		if (top < vt + 4) { top = last.bottom + GAP; below = true; }   // no room above: under the selection
		top = Math.min(top, window.innerHeight - bh - 8);
		const arrow = Math.max(16, Math.min(cx - left, bw - 16));
		const placed = [left, top, arrow, below].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(',');
		if (placed === this.placed) return;
		this.placed = placed;
		box.classList.toggle('below', below);
		box.style.left = Math.round(left) + 'px';
		box.style.top = Math.round(top) + 'px';
		box.style.setProperty('--tb-arrow', Math.round(arrow) + 'px');
	}
}
