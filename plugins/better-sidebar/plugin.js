/**
 * BetterSidebar - closed, the sidebar is gone entirely (no icon strip); it slides out to the left and back
 * in, whole, on a curve (plugin.css).
 *
 * When the sidebar is toggled, Thymer rebuilds its rows at once in the other layout (the icon strip, or the
 * full list). Closing, a copy of the full list as it was (kept up to date while nothing moves) is laid over
 * the sidebar at its full width and slides left with the edge until it is off screen. Opening, the list
 * Thymer has just rebuilt is laid out at its final width and slides in from the left with the edge.
 */

const SSB_CLOSE_MS = 420;   // plugin.css: the collapsed transition
const SSB_OPEN_MS = 500;    // plugin.css: the expanded transition

class SsbController {
	constructor() {
		this.sb = null;
		this.snap = null;
		this.anim = null;
		this.snapTimer = 0;
		this.mo = new MutationObserver((recs) => this.onMutations(recs));
		this.onScroll = () => { if (this.snap && !this.anim) this.snap.scroll = this.scrollTop(); };
		this.attach();
		this.attachTimer = setInterval(() => { if (!this.sb || !this.sb.isConnected) this.attach(); }, 1000);
	}

	attach() {
		this.mo.disconnect();
		this.sb?.removeEventListener('scroll', this.onScroll, true);
		this.sb = document.querySelector('.panels-grid-sidebar:not(.ssb-ghost) > .sidebar');
		this.snap = null;
		if (!this.sb) return;
		this.collapsed = this.sb.classList.contains('sidebar-collapsed');
		this.lastW = this.collapsed ? 0 : parseFloat(this.sb.style.width) || this.sb.getBoundingClientRect().width;
		this.mo.observe(this.sb, { attributes: true, childList: true, subtree: true, characterData: true });
		this.sb.addEventListener('scroll', this.onScroll, true);
		this.takeSnap();
	}

	scrollTop() {
		return this.sb.querySelector('.sidebar--icons')?.scrollTop || 0;
	}

	onMutations(recs) {
		const collapsed = this.sb.classList.contains('sidebar-collapsed');
		if (collapsed !== this.collapsed) {
			// this.lastW is still the width from before the toggle
			this.collapsed = collapsed;
			this.toggled(collapsed);
			return;
		}
		// The width Thymer has set inline (a drag changes it too): where the next toggle moves from.
		if (!this.anim && !collapsed) this.lastW = parseFloat(this.sb.style.width) || this.lastW;
		// Our own class changes do not need a new copy.
		// Nor does Mascot placing its workspace row over its card, which it does on every frame.
		if (recs.every((r) => r.type === 'attributes' && r.attributeName !== 'class'
			&& (r.target === this.sb || r.target.classList?.contains('ach-hosted')))) return;
		this.queueSnap();
	}

	// At most one copy per 200ms, and changes that keep coming do not put it off.
	queueSnap() {
		if (this.snapTimer) return;
		this.snapTimer = setTimeout(() => {
			this.snapTimer = 0;
			if (!this.anim) this.takeSnap(); else this.queueSnap();
		}, 200);
	}

	// A copy of the sidebar as it is now: what the ghost shows on the next toggle.
	takeSnap() {
		if (!this.sb || !this.sb.isConnected) return;
		// Thymer empties the list for a moment while it rebuilds it; keep the last full copy over that.
		if (!this.sb.querySelector('.sidebar--icons .sidebar-item')) return;
		const node = this.sb.cloneNode(true);
		node.classList.remove('ssb-sliding', 'has-focus', 'focused-component');
		node.querySelectorAll('.sidebar--toggler, script, iframe').forEach((e) => e.remove());
		node.removeAttribute('id');
		node.style.removeProperty('--ssb-w');
		node.style.removeProperty('--ssb-shift');
		node.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
		// Canvases (Digital Garden's plant, …) copy as blank: carry their picture over while it can be read.
		const src = this.sb.querySelectorAll('canvas'), dst = node.querySelectorAll('canvas');
		dst.forEach((c, i) => {
			try {
				if (src[i] && src[i].width && src[i].height) c.getContext('2d')?.drawImage(src[i], 0, 0);
			} catch (e) { /* a WebGL canvas without a kept buffer stays blank */ }
		});
		this.snap = {
			node,
			collapsed: this.sb.classList.contains('sidebar-collapsed'),
			width: this.sb.getBoundingClientRect().width,
			scroll: this.scrollTop(),
		};
	}

	toggled(collapsed) {
		const snap = this.snap;
		this.finish();
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduce || document.documentElement.getAttribute('data-device') === 'mobile') { this.queueSnap(); return; }

		const sb = this.sb, grid = sb.parentElement;
		const ms = collapsed ? SSB_CLOSE_MS : SSB_OPEN_MS;
		const anim = { ghost: null, raf: 0, timers: [] };
		this.anim = anim;
		// plugin.css lets the width move only while body.ssb-anim is set. Thymer may already have laid the page
		// out at the new width (closing, it has), so the old width is put back for one style pass and the
		// transition runs from there. Also for the jump when a drag crosses Thymer's 150px limit.
		const from = collapsed ? (this.lastW || (snap && snap.width) || 0) : 0;
		const body = document.body;
		body.style.setProperty('--ssb-from', `${from}px`);
		body.classList.add('ssb-from');
		const r = sb.getBoundingClientRect();   // the old width, laid out
		body.classList.add('ssb-anim');
		body.classList.remove('ssb-from');
		anim.timers.push(setTimeout(() => this.finish(), ms + 80));

		// The list keeps its full width W and slides: its right edge rides the sidebar's edge as the column
		// narrows to nothing or grows back, and what is past the window's left edge is simply off screen.
		let W;
		if (collapsed) {
			// Thymer has already rebuilt the rows as the icon strip, so a copy of the list as it was slides out.
			if (!snap || snap.collapsed) return;
			W = r.width || snap.width;
			const ghost = document.createElement('div');
			ghost.className = 'panels-grid-sidebar ssb-ghost';
			ghost.style.cssText = `left:${r.left}px;top:${r.top}px;height:${r.height}px;width:${W}px`;
			snap.node.style.width = `${W}px`;
			ghost.appendChild(snap.node);
			document.body.appendChild(ghost);
			const icons = snap.node.querySelector('.sidebar--icons');
			if (icons) icons.scrollTop = snap.scroll;
			// Mascot's workspace row is fixed over its card; in the ghost it is placed from the ghost's corner instead.
			snap.node.querySelectorAll('.ach-hosted').forEach((h) => {
				h.style.left = `${parseFloat(h.style.left) - r.left}px`;
				h.style.top = `${parseFloat(h.style.top) - r.top}px`;
			});
			this.snap = null;
			anim.ghost = ghost;
		} else {
			// Thymer has already rebuilt the full list; lay it out at its final width and slide it in.
			W = parseFloat(grid.style.getPropertyValue('--sidebar-width'));
			if (!(W > 0)) return;
			this.lastW = W;
			sb.classList.add('ssb-sliding');
			// The full list is already there: keep a copy now, so closing again before this ends still slides it out.
			this.takeSnap();
			if (this.snap) this.snap.width = W;
		}
		// Mascot reads --ssb-w to ride along with the rows.
		sb.style.setProperty('--ssb-w', `${W}px`);
		const follow = () => {
			const shift = Math.min(0, sb.getBoundingClientRect().width - W);
			if (anim.ghost) anim.ghost.style.transform = `translateX(${shift}px)`;
			sb.style.setProperty('--ssb-shift', `${shift}px`);
			anim.raf = requestAnimationFrame(follow);
		};
		follow();
	}

	finish() {
		const a = this.anim;
		if (!a) return;
		this.anim = null;
		cancelAnimationFrame(a.raf);
		a.timers.forEach(clearTimeout);
		a.ghost?.remove();
		document.body.classList.remove('ssb-anim', 'ssb-from');
		document.body.style.removeProperty('--ssb-from');
		if (this.sb) {
			this.sb.classList.remove('ssb-sliding');
			this.sb.style.removeProperty('--ssb-w');
			this.sb.style.removeProperty('--ssb-shift');
		}
		this.queueSnap();
	}

	destroy() {
		this.finish();
		clearTimeout(this.snapTimer);
		this.snapTimer = 0;
		clearInterval(this.attachTimer);
		this.mo.disconnect();
		this.sb?.removeEventListener('scroll', this.onScroll, true);
		document.querySelectorAll('.ssb-ghost').forEach((e) => e.remove());
	}
}

class Plugin extends AppPlugin {
	onLoad() {
		this.ssb = new SsbController();
	}

	onUnload() {
		this.ssb?.destroy();
		this.ssb = null;
	}
}
