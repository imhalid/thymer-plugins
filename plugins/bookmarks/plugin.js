/**
 * Bookmarks
 *
 * The code of the Bookmarks collection: a custom view, also called Bookmarks, that lays the saved sites out as cards under
 * their category. Each card shows the record's banner as its cover (or, without one, a tile in the category's colour with
 * its icon), the site's favicon, its title, its domain and the description. A click opens the site; the page button in the
 * cover's corner (or a Cmd/Ctrl-click) opens the record in the other panel.
 *
 * Above the cards: one chip per category with its count (a click shows only that category) and a field to paste a link
 * into; Thymer's own search bar above the view filters the cards. A pasted link becomes a record: the page is read for its
 * title, description and preview image (og:image), which
 * become the record's title, Description and banner; a site that does not let itself be read (CORS) is saved with its
 * domain as the title. The chosen category chip, if any, is the new record's Category. `Bookmarks: add from clipboard`
 * does the same with the link on the clipboard.
 *
 * The fields are found by label: URL (url), Description (text), Category (choice). The view must exist in the collection's
 * configuration with "type": "custom" and the label in VIEW.
 */

const VIEW = 'Bookmarks';
const FIELD = { url: 'URL', description: 'Description', category: 'Category' };
const ENUM = ['red', 'orange', 'green', 'cyan', 'blue', 'purple', 'pink', 'fuchsia', 'rose', 'stone', 'teal', 'sky', 'indigo', 'zinc', 'yellow'];
const OTHER = { id: '', label: 'Other', icon: 'ti-bookmark', color: '13' };   // records without a category
const READ_MS = 8000;   // reading a pasted link gives up after this long

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const normalizeUrl = (s) => {
	s = (s || '').trim();
	if (!s) return null;
	if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
	try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : null; } catch { return null; }
};
const colorVars = (color) => {
	const name = ENUM[Number(color)] || 'zinc';
	return `--bm-fg: var(--enum-${name}-fg); --bm-bg: var(--enum-${name}-bg); --bm-border: var(--enum-${name}-border);`;
};

class Plugin extends CollectionPlugin {

	onLoad() {
		this.covers = new Map();   // blob guid -> Promise of an object URL
		this.views.register(VIEW, (ctx) => this.createView(ctx));
		this.ui.addCommandPaletteCommand({ label: 'Bookmarks: add from clipboard', icon: 'ti-clipboard-plus', onSelected: () => this.addFromClipboard() });
	}

	onUnload() {
		for (const p of this.covers.values()) p.then((u) => u && URL.revokeObjectURL(u));
	}

	/** The categories in the order the Category field lists them, then Other. */
	categories() {
		const field = (this.getConfiguration().fields || []).find((f) => f.label === FIELD.category);
		const list = (field?.choices || []).filter((c) => c.active !== false);
		return [...list, OTHER];
	}

	createView(ctx) {
		const esc = (s) => this.ui.htmlEscape(s || '');
		const state = { category: '', records: [] };
		let root, chips, groups, addInput, addButton;

		const matches = (r) => !state.category || r.category === state.category;

		const read = (record) => {
			const url = record.text(FIELD.url) || '';
			const prop = record.prop(FIELD.category);
			return {
				guid: record.guid, record, url, host: hostOf(url),
				name: record.getName() || hostOf(url) || 'Untitled',
				description: record.text(FIELD.description) || '',
				category: prop?.choice() || '',
			};
		};

		const renderChips = (cats) => {
			const count = (id) => state.records.filter((r) => r.category === id).length;
			chips.innerHTML = `<button class="bm-chip${state.category ? '' : ' on'}" data-cat="">All <span>${state.records.length}</span></button>` +
				cats.filter((c) => count(c.id)).map((c) => `<button class="bm-chip${state.category === c.id ? ' on' : ''}" data-cat="${esc(c.id)}" style="${colorVars(c.color)}">` +
					`<i class="ti ${esc(c.icon)}"></i>${esc(c.label)} <span>${count(c.id)}</span></button>`).join('');
		};

		const card = (r, cat) => {
			const el = document.createElement('a');
			el.className = 'bm-card';
			el.href = r.url || '#';
			el.dataset.guid = r.guid;
			el.style.cssText = colorVars(cat.color);
			el.innerHTML = `<div class="bm-cover"><div class="bm-tile"><i class="ti ${esc(cat.icon)}"></i><span>${esc(r.host)}</span></div>` +
				`<button class="bm-page" title="Open page"><i class="ti ti-file-text"></i></button>` +
				(r.host ? `<span class="bm-fav"><img alt="" src="https://${esc(r.host)}/favicon.ico"><b>${esc(r.name[0] || '')}</b></span>` : '') + `</div>` +
				`<div class="bm-text"><div class="bm-title">${esc(r.name)}</div><div class="bm-host">${esc(r.host)}</div>` +
				(r.description ? `<div class="bm-desc">${esc(r.description)}</div>` : '') + `</div>`;
			const fav = el.querySelector('.bm-fav img');
			if (fav) fav.onerror = () => fav.parentElement.classList.add('none');
			this.coverUrl(r.record).then((src) => {
				if (!src || ctx.isDestroyed()) return;
				const img = new Image();
				img.className = 'bm-img';
				img.alt = '';
				img.onload = () => el.querySelector('.bm-cover').classList.add('has-img');
				img.src = src;
				el.querySelector('.bm-cover').prepend(img);
			});
			return el;
		};

		const renderGroups = () => {
			const cats = this.categories();
			renderChips(cats);
			const shown = state.records.filter(matches);
			groups.replaceChildren();
			if (!shown.length) {
				groups.innerHTML = `<div class="bm-empty">${state.records.length ? 'Nothing matches.' : 'No bookmarks yet. Paste a link above.'}</div>`;
				return;
			}
			for (const cat of cats) {
				const inCat = shown.filter((r) => r.category === cat.id || (!cat.id && !cats.some((c) => c.id && c.id === r.category)));
				if (!inCat.length) continue;
				const section = document.createElement('section');
				section.className = 'bm-group';
				section.style.cssText = colorVars(cat.color);
				section.innerHTML = `<h3><i class="ti ${esc(cat.icon)}"></i>${esc(cat.label)}<span>${inCat.length}</span></h3><div class="bm-grid"></div>`;
				const grid = section.querySelector('.bm-grid');
				for (const r of inCat.sort((a, b) => a.name.localeCompare(b.name))) grid.append(card(r, cat));
				groups.append(section);
			}
		};

		const openCard = (el, e) => {
			const r = state.records.find((x) => x.guid === el.dataset.guid);
			if (!r) return;
			if (e && (e.metaKey || e.ctrlKey) || !r.url) ctx.openRecordInOtherPanel(r.guid);
			else window.open(r.url, '_blank', 'noopener');
		};

		const add = async () => {
			const url = normalizeUrl(addInput.value);
			if (!url) { this.ui.bounce(addInput); return; }
			addButton.disabled = true;
			addButton.textContent = 'Adding…';
			try {
				const cat = this.categories().find((c) => c.id && c.id === state.category);
				await this.addBookmark(url, cat?.label);
				addInput.value = '';
			} finally {
				addButton.disabled = false;
				addButton.textContent = 'Add';
			}
		};

		return {
			onLoad: () => {
				ctx.makeWideLayout();
				root = ctx.getElement();
				root.classList.add('bm');
				root.innerHTML = `<div class="bm-bar"><div class="bm-chips"></div>` +
					`<form class="bm-add"><i class="ti ti-link"></i><input placeholder="Paste a link to save it" spellcheck="false"><button type="submit">Add</button></form>` +
					`</div><div class="bm-groups"></div>`;
				chips = root.querySelector('.bm-chips');
				groups = root.querySelector('.bm-groups');
				addInput = root.querySelector('.bm-add input');
				addButton = root.querySelector('.bm-add button');
				root.querySelector('.bm-add').addEventListener('submit', (e) => { e.preventDefault(); add(); });
				chips.addEventListener('click', (e) => {
					const chip = e.target.closest('.bm-chip');
					if (!chip) return;
					state.category = state.category === chip.dataset.cat ? '' : chip.dataset.cat;
					renderGroups();
				});
				groups.addEventListener('click', (e) => {
					const el = e.target.closest('.bm-card');
					if (!el) return;
					e.preventDefault();
					if (e.target.closest('.bm-page')) ctx.openRecordInOtherPanel(el.dataset.guid);
					else openCard(el, e);
				});
			},
			onRefresh: ({ records }) => {
				state.records = records.map(read);
				renderGroups();
			},
			onKeyboardNavigation: () => {},
			onPanelResize: () => {},
			onFocus: () => {},
			onBlur: () => {},
			onDestroy: () => {},
		};
	}

	/** A record's banner as an image URL, or null when it has none of its own (a built-in banner class is drawn as a tile). */
	coverUrl(record) {
		const fv = record.getBanner();
		if (!fv) return Promise.resolve(null);
		if (fv.imgUrl) return Promise.resolve(fv.imgUrl);
		if (!fv.guid) return Promise.resolve(null);
		if (!this.covers.has(fv.guid)) {
			this.covers.set(fv.guid, (async () => {
				const blob = await this.data.getBlobFromPropertyFileValue(fv);
				const data = blob && await blob.download();
				return data ? URL.createObjectURL(new Blob([data], { type: blob.contentType || 'image/jpeg' })) : null;
			})().catch(() => null));
		}
		return this.covers.get(fv.guid);
	}

	async addFromClipboard() {
		let text = '';
		try { text = await navigator.clipboard.readText(); } catch { /* no permission */ }
		const url = normalizeUrl(text);
		if (!url) { this.ui.addToaster({ title: 'No link on the clipboard', dismissible: true, autoDestroyTime: 3000 }); return; }
		await this.addBookmark(url);
	}

	/** Save a link as a record, filled from the page when the page lets itself be read. */
	async addBookmark(url, categoryLabel) {
		const existing = (await this.collection.getAllRecords()).find((r) => normalizeUrl(r.text(FIELD.url)) === url);
		if (existing) {
			this.ui.addToaster({ title: 'Already saved', message: existing.getName(), dismissible: true, autoDestroyTime: 3000 });
			return existing;
		}
		const meta = await this.readPage(url);
		const guid = this.collection.createRecord(meta.title || hostOf(url));
		const record = guid && await this.waitForRecord(guid);
		if (!record) { this.ui.addToaster({ title: 'Could not save the link', dismissible: true, autoDestroyTime: 4000 }); return null; }
		record.prop(FIELD.url)?.set(url);
		if (meta.description) record.prop(FIELD.description)?.set(meta.description);
		if (categoryLabel) record.prop(FIELD.category)?.setChoice(categoryLabel);
		if (meta.image) await this.setCover(record, meta.image);
		this.ui.addToaster({ title: 'Bookmark saved', message: record.getName(), dismissible: true, autoDestroyTime: 2500 });
		return record;
	}

	async waitForRecord(guid) {
		for (let i = 0; i < 40; i++) {
			const r = this.data.getRecord(guid);
			if (r) return r;
			await new Promise((ok) => setTimeout(ok, 50));
		}
		return null;
	}

	/** The page's title, description and preview image, or what of them could be read ({} when the site refuses). */
	async readPage(url) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(READ_MS) });
			if (!res.ok || !/html/.test(res.headers.get('content-type') || '')) return {};
			const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
			const meta = (...keys) => {
				for (const k of keys) {
					const v = doc.querySelector(`meta[property="${k}"], meta[name="${k}"]`)?.getAttribute('content');
					if (v && v.trim()) return v.trim();
				}
				return '';
			};
			const image = meta('og:image', 'og:image:url', 'twitter:image');
			return {
				title: meta('og:title', 'twitter:title') || doc.title.trim(),
				description: meta('og:description', 'description', 'twitter:description'),
				image: image ? new URL(image, res.url || url).href : '',
			};
		} catch {
			return {};   // CORS, offline or too slow
		}
	}

	async setCover(record, imageUrl) {
		try {
			const res = await fetch(imageUrl, { signal: AbortSignal.timeout(READ_MS) });
			const type = res.headers.get('content-type') || '';
			if (!res.ok || !type.startsWith('image/')) return;
			const file = new File([await res.blob()], 'cover.' + (type.split('/')[1] || 'jpg').split(/[;+]/)[0], { type });
			const blob = await this.data.uploadBlob(file);
			if (blob) record.setBannerFromBlob(blob);
		} catch { /* the cover stays a tile */ }
	}
}
