/**
 * Bookmarks
 *
 * The code of the Bookmarks collection: a custom view, also called Bookmarks, that lays the saved sites out as cards under
 * their category. Each card shows the record's banner as its cover, fading into the card; without one, a cover drawn for
 * the site: soft shapes placed by its domain, ordered-dithered in the category's colour. Under the cover: the favicon and
 * the title on one line, the domain (left out when the title already says it) and two lines of description. Each card takes
 * a tone from its cover (the cover's most vivid colour, or the category's): the card is tinted with it, and its edge takes
 * it under the pointer. A click opens the site; the page button in the cover's corner (or a Cmd/Ctrl-click) opens the
 * record in the other panel.
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
		this.tones = new Map();    // cover URL -> its tone (or null)
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
			el.innerHTML = `<div class="bm-cover"><button class="bm-page" title="Open page"><i class="ti ti-file-text"></i></button></div>` +
				`<div class="bm-text"><div class="bm-head"><span class="bm-fav${r.host ? '' : ' none'}">` +
				(r.host ? `<img alt="" src="https://${esc(r.host)}/favicon.ico">` : '') + `<b>${letter}</b></span>` +
				`<span class="bm-title">${esc(r.name)}</span></div>` +
				(titleSaysHost(r.name, r.host) ? '' : `<div class="bm-host">${esc(r.host)}</div>`) +
				`<div class="bm-desc">${esc(r.description)}</div></div>`;
			const fav = el.querySelector('.bm-fav img');
			if (fav) fav.onerror = () => fav.parentElement.classList.add('none');

			const fv = r.record.getBanner();
			if (!(fv && (fv.guid || fv.imgUrl))) dither(el, r);
			else this.coverUrl(r.record).then((src) => {
				if (ctx.isDestroyed()) return;
				if (!src) { dither(el, r); return; }
				const img = new Image();
				img.className = 'bm-img';
				img.alt = '';
				img.onload = () => {
					if (!this.tones.has(src)) this.tones.set(src, toneOf(img));
					const tone = this.tones.get(src);
					if (tone) el.style.setProperty('--bm-tone', tone);
					el.querySelector('.bm-cover').classList.add('has-img');
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
