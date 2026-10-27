/**
 * Bookmarks
 *
 * The code of the Bookmarks collection: a custom view, also called Bookmarks, that lays the saved sites out as cards under
 * their category. Each card shows the record's banner as its cover, fading into the card; without one, a cover drawn for
 * the site: soft shapes placed by its domain, ordered-dithered in the category's colour. Under the cover: the favicon and
 * the title on one line, the domain (left out when the title already says it) and two lines of description. Each card takes
 * a tone from its cover (the cover's most vivid colour, or the category's): the card is tinted with it, and its edge takes
 * it under the pointer. A click opens the site; the page button in the cover's corner (or a Cmd/Ctrl-click) opens the
 * record in the other panel, and the trash button beside it asks, in a small dialog, before moving the bookmark to Thymer's trash.
 *
 * Above the cards: one chip per category with its count (a click shows only that category) and the Add bookmark button;
 * Thymer's own search bar above the view filters the cards. The button (or `Bookmarks: add bookmark`) opens a dialog: the
 * link (a link on the clipboard is filled in) and what it is, one tile per category, Other among them; nothing is saved
 * until both are given, so a bookmark never lands in Other by accident. The chosen category chip, if any, is the tile
 * chosen beforehand. The link becomes a record: the page is read for its title, description and preview image
 * (og:image), which become the record's title, Description and banner; a site that does not let itself be read (CORS) is
 * saved with its domain as the title. A link already saved is not added twice.
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

/** The title already names the site: "druk" for druk.sh, "binthere.gaury.dev" for itself. */
const titleSaysHost = (name, host) => {
	const n = name.toLowerCase().replace(/^www\./, '').replace(/\s+/g, '');
	return !host || n === host || n === host.split('.')[0];
};

/** Any CSS colour (rgb, oklch, a theme variable resolved by the browser) as [r, g, b]. */
const rgbOf = (css) => {
	const g = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	g.fillStyle = css;
	g.fillRect(0, 0, 1, 1);
	return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
};

/**
 * A cover's tone: the average of its pixels, each weighted by how vivid it is (saturated, neither dark nor pale), turned
 * into a clear mid-light colour. Null for a cover with almost no colour (a black or white page), which keeps the category's.
 */
const toneOf = (img) => {
	try {
		const N = 24, c = document.createElement('canvas');
		c.width = c.height = N;
		const g = c.getContext('2d', { willReadFrequently: true });
		g.drawImage(img, 0, 0, N, N);
		const d = g.getImageData(0, 0, N, N).data;
		let r = 0, gr = 0, b = 0, w = 0, sat = 0;
		for (let i = 0; i < d.length; i += 4) {
			const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
			const s = (mx - mn) / 255, l = (mx + mn) / 510;
			const k = s * s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.6) + 1e-4;
			r += d[i] * k; gr += d[i + 1] * k; b += d[i + 2] * k; w += k; sat += s;
		}
		if (sat / (N * N) < 0.07) return null;
		r /= w; gr /= w; b /= w;
		const mx = Math.max(r, gr, b), mn = Math.min(r, gr, b), dl = mx - mn || 1;
		const h = mx === r ? ((gr - b) / dl + 6) % 6 : mx === gr ? (b - r) / dl + 2 : (r - gr) / dl + 4;
		return `hsl(${Math.round(h * 60)} ${Math.round(Math.max(55, (dl / 255) * 100))}% 62%)`;
	} catch {
		return null;   // an image from another origin taints the canvas
	}
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const seedOf = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed) => () => {   // mulberry32
	seed = (seed + 0x6D2B79F5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * The cover of a site that has none: a few soft blobs and a faint wave, placed by the site's domain (so each site keeps its
 * own), ordered-dithered (Bayer 4x4) into two strengths of the category's colour over the card. Drawn at 96x54 and shown
 * pixelated.
 */
const paintDither = (canvas, key) => {
	const W = 96, H = 54;
	canvas.width = W;
	canvas.height = H;
	const [cr, cg, cb] = rgbOf(getComputedStyle(canvas).color);
	const rand = rng(seedOf(key));
	const blobs = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({ x: rand() * W, y: rand() * H, r: (0.2 + rand() * 0.4) * W, w: 0.45 + rand() * 0.6 }));
	const angle = rand() * Math.PI, freq = 0.1 + rand() * 0.15, wave = 0.1 + rand() * 0.2;
	const field = new Float32Array(W * H);
	let lo = Infinity, hi = -Infinity;
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		let v = wave * Math.sin((x * Math.cos(angle) + y * Math.sin(angle)) * freq);
		for (const b of blobs) v += b.w * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (b.r * b.r));
		field[y * W + x] = v;
		lo = Math.min(lo, v); hi = Math.max(hi, v);
	}
	// spread over the whole range, so every cover has empty ground, a dithered middle and solid hearts
	const g = canvas.getContext('2d');
	const img = g.createImageData(W, H), d = img.data;
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const v = ((field[y * W + x] - lo) / (hi - lo || 1)) ** 1.3;
		const level = Math.floor(v * 2.6 + (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.3);
		if (level <= 0) continue;
		const i = (y * W + x) * 4;
		d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = level === 1 ? 70 : 215;
	}
	g.putImageData(img, 0, 0);
};

class Plugin extends CollectionPlugin {

	onLoad() {
		this.covers = new Map();   // blob guid -> Promise of an object URL
		this.tones = new Map();    // cover URL -> its tone (or null), once its image has loaded
		this.noFavicon = new Set();   // hosts whose /favicon.ico did not load
		this.category = '';        // the chosen chip, kept while switching to another view and back
		this.lastRecords = [];     // what the view showed last, drawn at once when it opens again
		this.views.register(VIEW, (ctx) => this.createView(ctx));
		this.dialog = null;        // the open Add bookmark dialog
		this.ui.addCommandPaletteCommand({ label: 'Bookmarks: add bookmark', icon: 'ti-bookmark-plus', onSelected: () => this.openAddDialog(this.category) });
	}

	onUnload() {
		this.dialog?.close(true);
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
		const state = { category: this.category, records: [] };
		let root, chips, groups;

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

		const dither = (el, r) => {
			const canvas = document.createElement('canvas');
			canvas.className = 'bm-dither';
			el.querySelector('.bm-cover').prepend(canvas);
			if (el.isConnected) paintDither(canvas, r.host || r.name);   // otherwise painted once its section is in the page
		};

		const card = (r, cat) => {
			const el = document.createElement('a');
			el.className = 'bm-card';
			el.href = r.url || '#';
			el.dataset.guid = r.guid;
			el.style.cssText = colorVars(cat.color);
			const letter = esc((r.name.match(/[\p{L}\p{N}]/u) || [''])[0]);
			el.innerHTML = `<div class="bm-cover"><button class="bm-del" title="Delete bookmark"><i class="ti ti-trash"></i></button>` +
				`<button class="bm-page" title="Open page"><i class="ti ti-file-text"></i></button></div>` +
				`<div class="bm-text"><div class="bm-head"><span class="bm-fav${r.host ? '' : ' none'}">` +
				(r.host ? `<img alt="" src="https://${esc(r.host)}/favicon.ico">` : '') + `<b>${letter}</b></span>` +
				`<span class="bm-title">${esc(r.name)}</span></div>` +
				(titleSaysHost(r.name, r.host) ? '' : `<div class="bm-host">${esc(r.host)}</div>`) +
				`<div class="bm-desc">${esc(r.description)}</div></div>`;
			const fav = el.querySelector('.bm-fav img');
			if (fav && this.noFavicon.has(r.host)) { fav.parentElement.classList.add('none'); fav.remove(); }
			else if (fav) fav.onerror = () => { this.noFavicon.add(r.host); fav.parentElement.classList.add('none'); };

			const fv = r.record.getBanner();
			if (!(fv && (fv.guid || fv.imgUrl))) dither(el, r);
			else this.coverUrl(r.record).then((src) => {
				if (ctx.isDestroyed()) return;
				if (!src) { dither(el, r); return; }
				const cover = el.querySelector('.bm-cover');
				const img = new Image();
				img.className = 'bm-img';
				img.alt = '';
				// a cover seen before is in the image cache: shown at once, in its tone, without fading in
				if (this.tones.has(src)) {
					const tone = this.tones.get(src);
					if (tone) el.style.setProperty('--bm-tone', tone);
					cover.classList.add('has-img', 'seen');
				}
				img.onload = () => {
					if (!this.tones.has(src)) {
						this.tones.set(src, toneOf(img));
						const tone = this.tones.get(src);
						if (tone) el.style.setProperty('--bm-tone', tone);
					}
					cover.classList.add('has-img');
				};
				img.onerror = () => { img.remove(); dither(el, r); };
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
				for (const canvas of section.querySelectorAll('.bm-dither')) {
					const r = state.records.find((x) => x.guid === canvas.closest('.bm-card').dataset.guid);
					paintDither(canvas, r.host || r.name);
				}
			}
		};

		// the cards are drawn again only when a record has changed (the first onRefresh brings what onLoad drew)
		let drawn = '';
		const show = (records) => {
			const sig = records.map((r) => r.guid + ':' + (r.getUpdatedAt()?.getTime() ?? '')).join(',');
			if (sig === drawn) return;
			drawn = sig;
			this.lastRecords = records;
			state.records = records.map(read);
			renderGroups();
		};

		// asks first, then the card goes at once (Thymer's own list follows with the next refresh)
		const remove = (guid) => {
			const r = state.records.find((x) => x.guid === guid);
			if (!r) return;
			this.confirmDelete(r, () => {
				state.records = state.records.filter((x) => x.guid !== guid);
				this.lastRecords = this.lastRecords.filter((x) => x.guid !== guid);
				if (state.category && !state.records.some((x) => x.category === state.category)) state.category = this.category = '';   // its chip is gone
				renderGroups();
			});
		};

		const openCard = (el, e) => {
			const r = state.records.find((x) => x.guid === el.dataset.guid);
			if (!r) return;
			if (e && (e.metaKey || e.ctrlKey) || !r.url) ctx.openRecordInOtherPanel(r.guid);
			else window.open(r.url, '_blank', 'noopener');
		};

		return {
			onLoad: () => {
				ctx.makeWideLayout();
				root = ctx.getElement();
				root.classList.add('bm');
				root.innerHTML = `<div class="bm-bar"><div class="bm-chips"></div>` +
					`<button class="bm-add" type="button"><i class="ti ti-plus"></i>Add bookmark</button>` +
					`</div><div class="bm-groups"></div>`;
				chips = root.querySelector('.bm-chips');
				groups = root.querySelector('.bm-groups');
				root.querySelector('.bm-add').addEventListener('click', () => this.openAddDialog(state.category));
				chips.addEventListener('click', (e) => {
					const chip = e.target.closest('.bm-chip');
					if (!chip) return;
					state.category = this.category = state.category === chip.dataset.cat ? '' : chip.dataset.cat;
					renderGroups();
				});
				groups.addEventListener('click', (e) => {
					const el = e.target.closest('.bm-card');
					if (!el) return;
					e.preventDefault();
					if (e.target.closest('.bm-page')) ctx.openRecordInOtherPanel(el.dataset.guid);
					else if (e.target.closest('.bm-del')) remove(el.dataset.guid);
					else openCard(el, e);
				});
				// draw at once, not a frame later in the first onRefresh: what the view holds, or else what it showed last time
				const records = ctx.getAllRecords();
				if (records.length || this.lastRecords.length) show(records.length ? records : this.lastRecords);
			},
			onRefresh: ({ records }) => show(records),
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

	/** The record that already holds this link, if any. */
	async findSaved(url) {
		return (await this.collection.getAllRecords()).find((r) => normalizeUrl(r.text(FIELD.url)) === url) || null;
	}

	/** Save a link as a record, filled from the page when the page lets itself be read. */
	async addBookmark(url, categoryLabel) {
		const existing = await this.findSaved(url);
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
		const filed = !categoryLabel || record.prop(FIELD.category)?.setChoice(categoryLabel);   // false: no choice has that label
		if (meta.image) await this.setCover(record, meta.image);
		this.ui.addToaster(filed
			? { title: 'Bookmark saved', message: record.getName(), dismissible: true, autoDestroyTime: 2500 }
			: { title: 'Bookmark saved without a category', message: `No category is called “${categoryLabel}”`, dismissible: true, autoDestroyTime: 5000 });
		return record;
	}

	/**
	 * The dialog that adds a bookmark: the link, then what it is. `category` (an id) is the tile chosen beforehand; with
	 * none, nothing is chosen until the user does (Other is a tile too), so Add asks for it instead of filing under Other.
	 */
	openAddDialog(category = '') {
		if (this.dialog) { this.dialog.focus(); return; }
		const esc = (s) => this.ui.htmlEscape(s || '');
		const cats = this.categories();
		let chosen = cats.some((c) => c.id && c.id === category) ? category : null;   // null: not chosen yet, '' is Other
		let busy = false, shownHost = '';
		const opener = document.activeElement;

		const overlay = document.createElement('div');
		overlay.className = 'bm-overlay';
		overlay.innerHTML = `<form class="bm-dialog" role="dialog" aria-modal="true" aria-labelledby="bm-dlg-title" novalidate>` +
			`<button type="button" class="bm-dlg-x" title="Close" aria-label="Close"><i class="ti ti-x"></i></button>` +
			`<h2 id="bm-dlg-title">Add bookmark</h2>` +
			`<p class="bm-dlg-sub">Paste a link and say what it is. Its title, description and cover are read from the page.</p>` +
			`<div class="bm-dlg-label">Link</div>` +
			`<div class="bm-dlg-url"><span class="bm-dlg-lead"><i class="ti ti-link"></i><img alt=""></span>` +
			`<input type="text" inputmode="url" placeholder="Paste a link, like example.com" spellcheck="false" autocomplete="off" aria-label="Link"></div>` +
			`<div class="bm-dlg-label">What is it?</div>` +
			`<div class="bm-dlg-tiles" role="radiogroup" aria-label="Category">` +
			cats.map((c) => `<button type="button" class="bm-tile" role="radio" aria-checked="false" data-cat="${esc(c.id)}" style="${colorVars(c.color)}">` +
				`<span class="bm-tile-ic"><i class="ti ${esc(c.icon)}"></i></span><span class="bm-tile-name">${esc(c.label)}</span><i class="ti ti-check bm-tile-tick"></i></button>`).join('') +
			`</div>` +
			`<div class="bm-dlg-note" role="status" aria-live="polite"></div>` +
			`<div class="bm-dlg-foot"><span class="bm-dlg-keys"><kbd>Esc</kbd> close <kbd>\u2318\u21b5</kbd> add</span>` +
			`<button type="button" class="bm-dlg-cancel">Cancel</button>` +
			`<button type="submit" class="bm-dlg-go"><span class="bm-spin"></span><span class="bm-dlg-go-text">Add bookmark</span></button></div></form>`;

		const $ = (sel) => overlay.querySelector(sel);
		const form = $('.bm-dialog'), input = $('.bm-dlg-url input'), urlBox = $('.bm-dlg-url'), lead = $('.bm-dlg-lead'), fav = $('.bm-dlg-lead img');
		const tilesEl = $('.bm-dlg-tiles'), note = $('.bm-dlg-note'), go = $('.bm-dlg-go'), goText = $('.bm-dlg-go-text');
		const tiles = [...overlay.querySelectorAll('.bm-tile')];

		const setNote = (text, kind) => { note.textContent = text || ''; note.className = 'bm-dlg-note' + (text ? ' on ' + (kind || '') : ''); };

		// the tiles, the colour glowing from the top and what the button says all follow the chosen category
		const paint = () => {
			for (const t of tiles) {
				const on = chosen !== null && t.dataset.cat === chosen;
				t.classList.toggle('on', on);
				t.setAttribute('aria-checked', String(on));
				t.tabIndex = on || (chosen === null && t === tiles[0]) ? 0 : -1;
			}
			const cat = chosen === null ? null : cats.find((c) => c.id === chosen);
			form.style.cssText = cat ? colorVars(cat.color) : '';
			form.classList.toggle('tinted', !!cat);
			goText.textContent = busy ? 'Saving\u2026' : cat ? `Add to ${cat.label}` : 'Add bookmark';
		};

		// the favicon of the site stands where the link icon is, once the field holds a link
		const syncUrl = () => {
			const host = hostOf(normalizeUrl(input.value) || '');
			if (host === shownHost) return;
			shownHost = host;
			lead.classList.remove('fav');
			fav.removeAttribute('src');
			if (!host) return;
			fav.onload = () => { if (shownHost === host) lead.classList.add('fav'); };
			fav.onerror = () => {};
			fav.src = `https://${host}/favicon.ico`;
		};

		const choose = (t, fromKeys) => {
			chosen = t.dataset.cat;
			paint();
			setNote('');
			if (fromKeys) { t.focus(); return; }
			(normalizeUrl(input.value) ? go : input).focus();   // a click or Enter on a tile is done with the tiles
		};

		const setBusy = (on) => {
			busy = on;
			form.classList.toggle('busy', on);
			for (const el of form.querySelectorAll('input, .bm-tile, .bm-dlg-cancel, .bm-dlg-x')) el.disabled = on;
			go.disabled = on;
			paint();
		};

		const close = (now) => {
			if (this.dialog?.overlay !== overlay) return;
			this.dialog = null;
			document.removeEventListener('keydown', onKey, true);
			if (now) overlay.remove();
			else { overlay.classList.add('out'); setTimeout(() => overlay.remove(), 140); }
			if (opener?.isConnected && opener.focus) opener.focus();
		};

		const submit = async () => {
			if (busy) return;
			const url = normalizeUrl(input.value);
			if (!url) { setNote('Paste a link to a site, like example.com.', 'warn'); this.ui.bounce(urlBox); input.focus(); return; }
			if (chosen === null) { setNote('Choose what it is.', 'warn'); this.ui.bounce(tilesEl); tiles[0].focus(); return; }
			setBusy(true);
			try {
				const saved = await this.findSaved(url);
				if (saved) { setNote(`Already saved as \u201c${saved.getName()}\u201d.`, 'warn'); setBusy(false); input.focus(); return; }
				const cat = cats.find((c) => c.id === chosen);
				const record = await this.addBookmark(url, cat?.id ? cat.label : '');
				if (record) { close(); return; }
			} catch (e) { console.error('Bookmarks: could not add', e); }
			setBusy(false);
			setNote('The link could not be saved. Try again.', 'warn');
		};

		const onKey = (e) => {
			if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
		};

		overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
		// the dialog's keys are its own: Thymer's shortcuts and the editor do not see them (Escape is taken in the capture phase)
		for (const type of ['keydown', 'keyup', 'keypress']) overlay.addEventListener(type, (e) => e.stopPropagation());
		overlay.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); return; }
			if (e.key !== 'Tab') return;
			const order = [$('.bm-dlg-x'), input, tiles.find((t) => t.tabIndex === 0), $('.bm-dlg-cancel'), go].filter((el) => el && !el.disabled);
			const at = order.indexOf(document.activeElement);
			const next = order[(at + (e.shiftKey ? -1 : 1) + order.length) % order.length];
			if (next) { e.preventDefault(); next.focus(); }
		});
		form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
		$('.bm-dlg-x').addEventListener('click', () => close());
		$('.bm-dlg-cancel').addEventListener('click', () => close());
		input.addEventListener('input', () => { syncUrl(); setNote(''); });
		tilesEl.addEventListener('click', (e) => { const t = e.target.closest('.bm-tile'); if (t) choose(t, false); });
		tilesEl.addEventListener('keydown', (e) => {
			const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
			const at = tiles.indexOf(document.activeElement);
			if (!step || at < 0) return;
			e.preventDefault();
			choose(tiles[(at + step + tiles.length) % tiles.length], true);
		});

		// the surface is the panel's colour (what the page is drawn on), else the page's own
		const css = getComputedStyle(document.body);
		const surface = css.getPropertyValue('--panel-bg-color').trim() || (css.backgroundColor !== 'rgba(0, 0, 0, 0)' ? css.backgroundColor : '');
		if (surface) overlay.style.setProperty('--bm-surface', surface);
		paint();
		document.addEventListener('keydown', onKey, true);
		document.body.appendChild(overlay);
		this.dialog = { overlay, focus: () => input.focus(), close };
		input.focus();

		// a link on the clipboard is what is usually being saved: filled in, selected, so typing replaces it
		navigator.clipboard.readText().then((text) => {
			const url = normalizeUrl(text);
			if (!url || input.value || this.dialog?.overlay !== overlay) return;
			input.value = text.trim();
			input.select();
			syncUrl();
		}).catch(() => { /* no permission, or the window is not focused */ });
	}

	/** The dialog that asks before a bookmark goes to the trash; `done` is called once it has. Cancel is where the focus starts. */
	confirmDelete(r, done) {
		if (this.dialog) return;
		const esc = (t) => this.ui.htmlEscape(t || '');
		const opener = document.activeElement;
		const overlay = document.createElement('div');
		overlay.className = 'bm-overlay';
		overlay.innerHTML = `<div class="bm-dialog bm-confirm" role="alertdialog" aria-modal="true" aria-labelledby="bm-del-title">` +
			`<span class="bm-confirm-ic"><i class="ti ti-trash"></i></span>` +
			`<h2 id="bm-del-title">Delete this bookmark?</h2>` +
			`<p class="bm-dlg-sub">\u201c${esc(r.name)}\u201d will be moved to Thymer\u2019s trash.</p>` +
			`<div class="bm-dlg-foot"><button type="button" class="bm-dlg-cancel">Cancel</button>` +
			`<button type="button" class="bm-dlg-go bm-danger"><i class="ti ti-trash"></i>Delete</button></div></div>`;
		const cancel = overlay.querySelector('.bm-dlg-cancel'), go = overlay.querySelector('.bm-dlg-go');

		const close = (now) => {
			if (this.dialog?.overlay !== overlay) return;
			this.dialog = null;
			document.removeEventListener('keydown', onKey, true);
			if (now) overlay.remove();
			else { overlay.classList.add('out'); setTimeout(() => overlay.remove(), 140); }
			if (opener?.isConnected && opener.focus) opener.focus();
		};
		const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };

		go.addEventListener('click', () => {
			try { r.record.trash(); } catch (e) {
				console.error('Bookmarks: could not delete', e);
				this.ui.addToaster({ title: 'Could not delete the bookmark', dismissible: true, autoDestroyTime: 4000 });
				close();
				return;
			}
			done?.();
			this.ui.addToaster({ title: 'Bookmark deleted', message: r.name, dismissible: true, autoDestroyTime: 2500 });
			close();
		});
		cancel.addEventListener('click', () => close());
		overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
		for (const type of ['keydown', 'keyup', 'keypress']) overlay.addEventListener(type, (e) => e.stopPropagation());
		overlay.addEventListener('keydown', (e) => {
			if (e.key !== 'Tab') return;
			e.preventDefault();
			(document.activeElement === cancel ? go : cancel).focus();
		});

		const css = getComputedStyle(document.body);
		const surface = css.getPropertyValue('--panel-bg-color').trim() || (css.backgroundColor !== 'rgba(0, 0, 0, 0)' ? css.backgroundColor : '');
		if (surface) overlay.style.setProperty('--bm-surface', surface);
		document.addEventListener('keydown', onKey, true);
		document.body.appendChild(overlay);
		this.dialog = { overlay, focus: () => cancel.focus(), close };
		cancel.focus();
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
