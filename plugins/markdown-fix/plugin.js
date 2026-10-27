/**
 * Markdown Fix
 *
 * Thymer's Markdown import keeps what it has no block for as plain text: a GFM table arrives as lines that start with "|", and a
 * ```mermaid fence arrives as a code block with no language. The editor has no table block, so nothing here edits the notes: the
 * plugin draws over them. A run of pipe lines (header, separator, rows) is shown as a table, and a code block that holds a mermaid
 * diagram gets the diagram under (or instead of) its code. Both have a small button to show the source again, and the source is
 * what stays in the note, so search, export and the Markdown it came from are unchanged.
 *
 * The widgets are put inside the line's own element, never between the editor's rows, and every pass is idempotent (a pass over a
 * note that is already drawn changes nothing), so it can run whenever the editor changes.
 */

const MERMAID_SRC = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
const MERMAID_START = /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|sankey-beta|xychart-beta|block-beta)\b/;

const ROW = /^\s*\|.*\|\s*$/;
const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const lineText = (li) => (li.querySelector(':scope > .line-div') || li).textContent;

/** One line's spans -> one list of nodes per cell, split at the pipes in its plain text. */
function splitLine(li) {
	const cells = [[]];
	const line = li.querySelector(':scope > .line-div');
	for (const n of line ? line.childNodes : []) {
		// pipes split bold and italic runs too (the import can let a bold run swallow the pipe after it); code is never split
		const plain = n.nodeType === 3 || (n.nodeType === 1 && !n.classList.contains('lineitem-code') && !n.children.length);
		if (!plain) { if (n.nodeType === 1) cells[cells.length - 1].push(n.cloneNode(true)); continue; }
		n.textContent.split(/(?<!\\)\|/).forEach((piece, i) => {
			if (i > 0) cells.push([]);
			if (!piece) return;
			const s = n.nodeType === 1 ? n.cloneNode(false) : document.createElement('span');
			s.textContent = piece.replace(/\\\|/g, '|');
			cells[cells.length - 1].push(s);
		});
	}
	const blank = (c) => c.every((n) => !n.textContent.trim());
	if (cells.length && blank(cells[0])) cells.shift();
	if (cells.length && blank(cells[cells.length - 1])) cells.pop();
	for (const c of cells) {
		if (c.length && c[0].nodeType === 1 && !c[0].children.length && !c[0].classList.contains('lineitem-code')) c[0].textContent = c[0].textContent.replace(/^\s+/, '');
		const l = c[c.length - 1];
		if (l && l.nodeType === 1 && !l.children.length && !l.classList.contains('lineitem-code')) l.textContent = l.textContent.replace(/\s+$/, '');
	}
	return cells;
}

const aligns = (li) => lineText(li).trim().replace(/^\||\|$/g, '').split('|').map((c) => {
	c = c.trim();
	return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '';
});

function buildTable(rows) {
	const al = aligns(rows[1]);
	const table = document.createElement('table');
	const add = (parent, tag, li) => {
		const tr = document.createElement('tr');
		splitLine(li).forEach((c, i) => {
			const cell = document.createElement(tag);
			if (al[i]) cell.style.textAlign = al[i];
			c.forEach((n) => cell.appendChild(n));
			tr.appendChild(cell);
		});
		parent.appendChild(tr);
	};
	const thead = table.createTHead(), tbody = table.createTBody();
	add(thead, 'th', rows[0]);
	rows.slice(2).forEach((li) => add(tbody, 'td', li));
	return table;
}

class Plugin extends AppPlugin {
	mermaid = null;
	mermaidLoading = null;
	shown = new Set();       // guids of a table's first line / a code block whose source the user chose to see
	seq = 0;
	raf = 0;
	observer = null;
	queue = null;

	onLoad() {
		this.observer = new MutationObserver((muts) => {
			if (muts.every((m) => m.target.closest && m.target.closest('.mf-widget'))) return;
			this.schedule();
		});
		this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
		this.schedule();
	}

	onUnload() {
		cancelAnimationFrame(this.raf);
		if (this.observer) this.observer.disconnect();
		document.querySelectorAll('.mf-widget').forEach((w) => w.remove());
		document.querySelectorAll('.mf-src').forEach((e) => e.classList.remove('mf-src'));
		document.querySelectorAll('[data-mf]').forEach((e) => e.removeAttribute('data-mf'));
	}

	schedule() {
		if (this.raf) return;
		this.raf = requestAnimationFrame(() => { this.raf = 0; this.pass(); });
	}

	pass() {
		try { this.tables(); } catch (e) { console.warn('Markdown Fix: tables', e); }
		try { this.diagrams(); } catch (e) { console.warn('Markdown Fix: diagrams', e); }
	}

	// ---- tables -------------------------------------------------------------------------------------------------------------

	tables() {
		const lists = new Set();
		document.querySelectorAll('.listview-items .listitem-text').forEach((li) => { if (!li.closest('.block-container-div')) lists.add(li.parentElement); });
		for (const parent of lists) {
			const sibs = [...parent.children].filter((e) => e.classList.contains('listitem'));
			for (let i = 0; i < sibs.length; i++) {
				const li = sibs[i];
				if (!li.classList.contains('listitem-text') || !ROW.test(lineText(li)) || !sibs[i + 1] || !sibs[i + 1].classList.contains('listitem-text') || !SEP.test(lineText(sibs[i + 1]))) continue;
				let j = i + 2;
				while (j < sibs.length && sibs[j].classList.contains('listitem-text') && ROW.test(lineText(sibs[j]))) j++;
				this.table(sibs.slice(i, j));
				i = j - 1;
			}
		}
		// a widget whose lines have gone (edited into something else) goes with them
		document.querySelectorAll('.mf-table').forEach((w) => {
			const first = w.parentElement;
			if (!first || !first.classList.contains('listitem') || !ROW.test(lineText(first))) w.remove();
		});
	}

	table(rows) {
		const first = rows[0], key = rows.map(lineText).join('\n');
		const guid = first.dataset.guid;
		const show = this.shown.has(guid);
		let w = first.querySelector(':scope > .mf-table');
		if (w && w.dataset.mf === key) {
			rows.forEach((r) => r.classList.toggle('mf-src', !show));       // the first row hides its own line; the widget is its child
			w.classList.toggle('mf-off', show);
			return;
		}
		if (w) w.remove();
		w = document.createElement('div');
		w.className = 'mf-widget mf-table';
		w.dataset.mf = key;
		w.contentEditable = 'false';
		const scroll = document.createElement('div');
		scroll.className = 'mf-scroll';
		scroll.appendChild(buildTable(rows));
		w.appendChild(scroll);
		w.appendChild(this.toggle(guid));
		first.insertBefore(w, first.firstChild);
		rows.forEach((r) => r.classList.add('mf-src'));
		w.classList.toggle('mf-off', show);
	}

	toggle(guid) {
		const b = document.createElement('button');
		b.className = 'mf-toggle';
		b.type = 'button';
		b.title = 'Show or hide the source';
		b.textContent = '</>';
		b.addEventListener('mousedown', (e) => e.preventDefault());
		b.addEventListener('click', (e) => {
			e.preventDefault(); e.stopPropagation();
			if (this.shown.has(guid)) this.shown.delete(guid); else this.shown.add(guid);
			this.schedule();
		});
		return b;
	}

	// ---- diagrams -----------------------------------------------------------------------------------------------------------

	loadMermaid() {
		if (this.mermaid) return Promise.resolve(this.mermaid);
		if (window.mermaid) { this.mermaid = window.mermaid; return Promise.resolve(this.mermaid); }
		return this.mermaidLoading || (this.mermaidLoading = new Promise((resolve, reject) => {
			const s = document.createElement('script');
			s.src = MERMAID_SRC;
			s.onload = () => { this.mermaid = window.mermaid; resolve(this.mermaid); };
			s.onerror = () => { this.mermaidLoading = null; reject(new Error('mermaid could not be loaded')); };
			document.head.appendChild(s);
		}));
	}

	isDark() {
		const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
		return !m || (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 140;
	}

	diagrams() {
		document.querySelectorAll('.block-container-div').forEach((blk) => {
			const lines = [...blk.querySelectorAll(':scope > .block-content > .listitem')];
			const src = lines.map((l) => lineText(l)).join('\n');
			let w = blk.querySelector(':scope > .mf-diagram');
			if (!lines.length || !MERMAID_START.test(src)) { if (w) { w.remove(); blk.classList.remove('mf-src'); } return; }
			const guid = blk.getAttribute('dbg-guid') || '';
			const show = this.shown.has(guid);
			if (w && w.dataset.mf === src + (this.isDark() ? 'd' : 'l')) {
				if (w.querySelector('.mf-svg')) { blk.classList.toggle('mf-src', !show); w.classList.toggle('mf-off', show); }   // the code stays until the diagram is there
				return;
			}
			if (!w) {
				w = document.createElement('div');
				w.className = 'mf-widget mf-diagram';
				w.contentEditable = 'false';
				w.appendChild(this.toggle(guid));
				blk.appendChild(w);
			}
			w.dataset.mf = src + (this.isDark() ? 'd' : 'l');
			this.draw(w, src, blk, guid);
		});
	}

	/** One render at a time: mermaid builds each diagram in a scratch element of its own id, and two at once trip over each other. */
	render(src) {
		const run = async () => {
			const mm = await this.loadMermaid();
			const font = getComputedStyle(document.querySelector('.listview-items') || document.body).fontFamily;
			mm.initialize({ startOnLoad: false, securityLevel: 'strict', theme: this.isDark() ? 'dark' : 'default', fontFamily: font, themeVariables: { fontFamily: font } });
			const text = src.replace(/\\n/g, '<br/>');      // a literal \n in a label is a line break
			const once = async (t) => {
				const id = 'mf-' + (++this.seq);
				try { return (await mm.render(id, t)).svg; } finally { document.getElementById('d' + id)?.remove(); }
			};
			try { return await once(text); }
			catch (e) {   // an edge label holding # or parentheses wants quotes; try again with them
				return await once(text.replace(/(--+>?|==+>?|-\.+->?)\|\s*([^"|\n][^|\n]*?)\s*\|/g, '$1|"$2"|'));
			}
		};
		const job = (this.queue || Promise.resolve()).then(run, run);
		this.queue = job.catch(() => {});
		return job;
	}

	async draw(w, src, blk, guid) {
		const key = w.dataset.mf;
		let svg = '';
		try {
			svg = await this.render(src);
		} catch (e) {
			const msg = document.createElement('div');
			msg.className = 'mf-error';
			msg.textContent = 'Diagram: ' + String(e && e.message || e).split('\n')[0];
			if (w.dataset.mf === key) { [...w.querySelectorAll('.mf-svg, .mf-error')].forEach((n) => n.remove()); w.prepend(msg); blk.classList.remove('mf-src'); }
			return;
		}
		if (w.dataset.mf !== key || !w.isConnected) return;
		[...w.querySelectorAll('.mf-svg, .mf-error')].forEach((n) => n.remove());
		const holder = document.createElement('div');
		holder.className = 'mf-svg';
		holder.innerHTML = svg;
		const el = holder.querySelector('svg');
		const vb = el && el.viewBox && el.viewBox.baseVal;
		w.prepend(holder);
		if (vb && vb.width) {   // fit the width, but not smaller than half of natural size (the holder scrolls for the rest)
			const room = holder.clientWidth || w.clientWidth || vb.width;
			el.removeAttribute('width'); el.style.maxWidth = 'none'; el.style.height = 'auto';
			el.style.width = Math.round(vb.width * Math.min(1, Math.max(0.5, room / vb.width))) + 'px';
		}
		const show = this.shown.has(guid);
		blk.classList.toggle('mf-src', !show);
		w.classList.toggle('mf-off', show);
	}
}
