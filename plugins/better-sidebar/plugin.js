/**
 * BetterSidebar - the sidebar opens and closes on a curve (plugin.css), and its rows stay where they are
 * while it moves.
 *
 * When the sidebar is toggled, Thymer rebuilds its rows at once in the other layout (the icon strip, or the
 * full list), so on closing the labels, headings and pages vanished before the sidebar had moved. Here a
 * copy of the rows as they were (kept up to date while nothing moves) is laid over the sidebar and clipped
 * to its width as it animates: closing, the rows are covered by the page as the edge passes over them and
 * only then give way to the strip; opening, the strip gives way to the full list, laid out at its final
 * width from the start so the labels do not reflow as the edge uncovers them.
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
			this.collapsed = collapsed;
			this.toggled(collapsed);
			return;
		}
		// Our own class changes do not need a new copy.
		if (recs.every((r) => r.type === 'attributes' && r.target === this.sb && r.attributeName !== 'class')) return;
		this.queueSnap();
	}

	queueSnap() {
		clearTimeout(this.snapTimer);
		this.snapTimer = setTimeout(() => { if (!this.anim) this.takeSnap(); else this.queueSnap(); }, 200);
	}

	// A copy of the sidebar as it is now: what the ghost shows on the next toggle.
	takeSnap() {
		if (!this.sb || !this.sb.isConnected) return;
		// Thymer empties the list for a moment while it rebuilds it; keep the last full copy over that.
		if (!this.sb.querySelector('.sidebar--icons .sidebar-item')) return;
		const node = this.sb.cloneNode(true);
		node.classList.remove('ssb-hide', 'has-focus', 'focused-component');
		node.querySelectorAll('.sidebar--toggler, .ach-hosted, script, iframe').forEach((e) => e.remove());
		node.removeAttribute('id');
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
		const anim = { ghost: null, fade: null, raf: 0, timers: [], realIcons: null, snapMode: false };
		this.anim = anim;
		// Dragging the edge past Thymer's limit (150px) collapses the sidebar, and pulling it back out opens it
		// to its default width; plugin.css keeps drags immediate, so body.ssb-snap lets just that jump move on
		// the curve. Set before the rect is read below, so the width transition starts from where the drag was.
		if (document.body.classList.contains('dragging')) {
			document.body.classList.add('ssb-snap');
			anim.snapMode = true;
		}
		const r = sb.getBoundingClientRect();
		anim.timers.push(setTimeout(() => this.finish(), ms + 80));
		if (!snap || snap.collapsed === collapsed) return;

		const ghost = document.createElement('div');
		ghost.className = 'panels-grid-sidebar ssb-ghost';
		ghost.style.cssText = `left:${r.left}px;top:${r.top}px;height:${r.height}px;width:${r.width}px`;
		// The rows as they stood: at the sidebar's width when it toggled (a drag may have narrowed it).
		snap.node.style.width = `${r.width || snap.width}px`;
		ghost.appendChild(snap.node);
		document.body.appendChild(ghost);
		const icons = snap.node.querySelector('.sidebar--icons');
		if (icons) icons.scrollTop = snap.scroll;
		this.snap = null;

		sb.classList.add('ssb-hide');
		// Opening: lay the full list out at its final width now, so the edge uncovers it instead of it reflowing.
		const realIcons = sb.querySelector('.sidebar--icons');
		const target = parseFloat(grid.style.getPropertyValue('--sidebar-width'));
		if (!collapsed && realIcons && target > 0) realIcons.style.minWidth = `${target}px`;

		// Closing: the rows stay whole while the edge sweeps over them, then cross to the strip.
		// Opening: the strip gives way quickly to the full list.
		const reveal = collapsed ? ms * 0.5 : 60;
		anim.ghost = ghost;
		anim.realIcons = realIcons;
		anim.fade = ghost.animate(
			collapsed
				? [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0, offset: 0.85 }, { opacity: 0 }]
				: [{ opacity: 1 }, { opacity: 0 }],
			{ duration: collapsed ? ms : 200, easing: 'ease-out', fill: 'forwards' });
		const follow = () => {
			ghost.style.width = `${sb.getBoundingClientRect().width}px`;
			anim.raf = requestAnimationFrame(follow);
		};
		anim.raf = requestAnimationFrame(follow);
		anim.timers.push(setTimeout(() => sb.classList.remove('ssb-hide'), reveal));
	}

	finish() {
		const a = this.anim;
		if (!a) return;
		this.anim = null;
		cancelAnimationFrame(a.raf);
		a.timers.forEach(clearTimeout);
		a.fade?.cancel();
		a.ghost?.remove();
		if (a.realIcons) a.realIcons.style.minWidth = '';
		if (a.snapMode) document.body.classList.remove('ssb-snap');
		this.sb?.classList.remove('ssb-hide');
		this.queueSnap();
	}

	destroy() {
		this.finish();
		clearTimeout(this.snapTimer);
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
