/**
 * Font Loader - Upload custom fonts (.ttf, .otf, .woff, .woff2) or pick system/web fonts
 * and assign them independently to Thymer's UI/System, Editor, Headings, and Code/Monospace.
 */

const PAGE_TYPE = 'font-loader';
const STORE_KEY = 'thymer-font-loader:v1';
const DB_NAME = 'thymer-font-loader-db';
const DB_STORE = 'fonts';
const STYLE_ID = 'tfl-runtime-style';

const DEFAULT_SAMPLE = 'Pijamalı hasta yağız şoföre çabucak güvendi. Aa Bb 0123456789';

const SLOTS = [
	{
		id: 'ui',
		label: 'Sistem / Arayüz',
		desc: 'Kenar çubuğu, sekmeler, menüler, modallar, tablolar ve butonlar',
		icon: 'ti-device-desktop',
		fallback: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
		supportsWeight: true,
		supportsSize: false,
		supportsLineHeight: false,
		supportsScale: false,
		sample: 'Yeni Sayfa · Ayarlar · Komut Paleti · 10:15',
	},
	{
		id: 'editor',
		label: 'Editör',
		desc: 'Sayfa gövdesi, paragraflar, listeler, görevler ve alıntılar',
		icon: 'ti-letter-t',
		fallback: 'system-ui, sans-serif',
		supportsWeight: true,
		supportsSize: true,
		supportsLineHeight: true,
		supportsScale: false,
		sample: DEFAULT_SAMPLE,
	},
	{
		id: 'heading',
		label: 'Başlıklar',
		desc: 'Sayfa başlığı (H1) ve sayfa içi başlık blokları (H1–H6)',
		icon: 'ti-h-1',
		fallback: 'system-ui, sans-serif',
		supportsWeight: true,
		supportsSize: false,
		supportsLineHeight: false,
		supportsScale: true,
		sample: 'Haftalık Tasarım Notları ve Mimari Plan',
	},
	{
		id: 'mono',
		label: 'Kod / Monospace',
		desc: 'Kod blokları, satır içi kod, kısayollar ve komut paleti girdisi',
		icon: 'ti-code',
		fallback: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
		supportsWeight: true,
		supportsSize: true,
		supportsLineHeight: false,
		supportsScale: false,
		sample: "const font = await loadFont('JetBrainsMono.woff2');",
	},
];

const QUICK_SYSTEM_FONTS = [
	'Inter',
	'Space Grotesk',
	'JetBrains Mono',
	'Fira Code',
	'IBM Plex Sans',
	'IBM Plex Serif',
	'IBM Plex Mono',
	'Roboto',
	'Noto Sans',
	'Noto Serif',
	'Georgia',
	'system-ui',
];

const POPULAR_GOOGLE_FONTS = [
	'Inter',
	'Plus Jakarta Sans',
	'Newsreader',
	'Instrument Serif',
	'Lora',
	'Merriweather',
	'Fraunces',
	'JetBrains Mono',
	'Geist',
	'IBM Plex Sans',
];

const WEIGHT_LABELS = {
	100: 'Thin (100)',
	200: 'ExtraLight (200)',
	300: 'Light (300)',
	400: 'Regular (400)',
	500: 'Medium (500)',
	600: 'SemiBold (600)',
	700: 'Bold (700)',
	800: 'ExtraBold (800)',
	900: 'Black (900)',
	'100 900': 'Variable (100–900)',
};

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const cssQuote = (s) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const sanitizeSlug = (s) => String(s || 'font').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'font';

function fmtBytes(n) {
	if (!n || n < 1024) return `${n || 0} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function defaultSlot() {
	return { fontId: null, weight: '', sizePx: 0, lineHeight: 0, scalePct: 100 };
}

function defaultState() {
	return {
		enabled: true,
		previewText: DEFAULT_SAMPLE,
		fonts: [],
		slots: {
			ui: defaultSlot(),
			editor: defaultSlot(),
			heading: defaultSlot(),
			mono: defaultSlot(),
		},
	};
}

// -----------------------------------------------------------------------------
// Font metadata parsing (SFNT TTF/OTF tables + filename fallback for WOFF/WOFF2)
// -----------------------------------------------------------------------------

function inferMetaFromFileName(fileName) {
	const extMatch = /\.([^.]+)$/.exec(fileName || '');
	const format = (extMatch ? extMatch[1] : 'ttf').toLowerCase();
	let stem = (fileName || 'CustomFont').replace(/\.[^.]+$/, '');

	const style = /italic|oblique/i.test(stem) ? 'italic' : 'normal';
	let weight = '400';
	const isVariable = /variable|\bvf\b|\[wght\]/i.test(stem);

	const weightRules = [
		[/thin|hairline/i, '100'],
		[/extralight|ultralight|extra-light|ultra-light/i, '200'],
		[/light/i, '300'],
		[/medium/i, '500'],
		[/semibold|demibold|semi-bold|demi-bold/i, '600'],
		[/extrabold|ultrabold|extra-bold|ultra-bold/i, '800'],
		[/bold/i, '700'],
		[/black|heavy/i, '900'],
		[/regular|normal|book|roman/i, '400'],
	];
	for (const [re, w] of weightRules) {
		if (re.test(stem)) { weight = w; break; }
	}
	if (isVariable) weight = '100 900';

	stem = stem
		.replace(/\[(?:[^\]]+)\]/g, '')
		.replace(/[-_\s]+(VariableFont.*|Variable|VF|Regular|Normal|Book|Roman|Thin|Hairline|ExtraLight|UltraLight|Light|Medium|SemiBold|DemiBold|ExtraBold|UltraBold|Bold|Black|Heavy|Italic|Oblique)+$/i, '')
		.replace(/[-_]+/g, ' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/\s+/g, ' ')
		.trim();

	return { family: stem || 'Custom Font', weight, style, format, isVariable };
}

function decodeNameBytes(bytes, platformID) {
	if (platformID === 3 || platformID === 0) {
		try {
			return new TextDecoder('utf-16be').decode(bytes).replace(/\0/g, '').trim();
		} catch {
			let out = '';
			for (let i = 0; i + 1 < bytes.length; i += 2) {
				out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
			}
			return out.replace(/\0/g, '').trim();
		}
	}
	let out = '';
	for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
	return out.replace(/\0/g, '').trim();
}

function parseFontMeta(buffer, fileName) {
	const fallback = inferMetaFromFileName(fileName);
	try {
		if (!buffer || buffer.byteLength < 12) return fallback;
		const view = new DataView(buffer);
		const sfnt = view.getUint32(0, false);
		const isSfnt = sfnt === 0x00010000 || sfnt === 0x4F54544F || sfnt === 0x74727565 || sfnt === 0x74797031;
		if (!isSfnt) return fallback;

		const numTables = view.getUint16(4, false);
		if (12 + numTables * 16 > buffer.byteLength) return fallback;

		const tables = {};
		for (let i = 0; i < numTables; i++) {
			const off = 12 + i * 16;
			const tag = String.fromCharCode(
				view.getUint8(off),
				view.getUint8(off + 1),
				view.getUint8(off + 2),
				view.getUint8(off + 3)
			);
			tables[tag] = {
				offset: view.getUint32(off + 8, false),
				length: view.getUint32(off + 12, false),
			};
		}

		const isVariable = !!tables.fvar;
		let weight = fallback.weight;
		let style = fallback.style;
		let family = fallback.family;

		if (tables['OS/2'] && tables['OS/2'].offset + 64 <= buffer.byteLength) {
			const o = tables['OS/2'].offset;
			const wClass = view.getUint16(o + 4, false);
			if (wClass >= 100 && wClass <= 900) weight = String(Math.round(wClass / 100) * 100 || wClass);
			const fsSel = view.getUint16(o + 62, false);
			if (fsSel & 1) style = 'italic';
		}
		if (isVariable) weight = '100 900';

		if (tables.name && tables.name.offset + 6 <= buffer.byteLength) {
			const noff = tables.name.offset;
			const count = view.getUint16(noff + 2, false);
			const strOff = noff + view.getUint16(noff + 4, false);
			const picks = {};
			for (let i = 0; i < count; i++) {
				const rec = noff + 6 + i * 12;
				if (rec + 12 > buffer.byteLength) break;
				const pid = view.getUint16(rec, false);
				const eid = view.getUint16(rec + 2, false);
				const lid = view.getUint16(rec + 4, false);
				const nid = view.getUint16(rec + 6, false);
				const len = view.getUint16(rec + 8, false);
				const off = strOff + view.getUint16(rec + 10, false);
				if ((nid !== 1 && nid !== 16) || off + len > buffer.byteLength) continue;
				if (!(pid === 3 || pid === 0 || (pid === 1 && eid === 0))) continue;
				const score = (nid === 16 ? 100 : 10) + (pid === 3 ? 20 : pid === 0 ? 15 : 5) + (lid === 0x0409 || lid === 0 ? 5 : 0);
				const text = decodeNameBytes(new Uint8Array(buffer, off, len), pid);
				if (text && (!picks[nid] || score > picks[nid].score)) picks[nid] = { score, text };
			}
			family = (picks[16]?.text || picks[1]?.text || family).trim();
		}

		return { family, weight, style, format: fallback.format, isVariable };
	} catch {
		return fallback;
	}
}

// -----------------------------------------------------------------------------
// IndexedDB binary store for uploaded font buffers
// -----------------------------------------------------------------------------

const FontDB = {
	_dbPromise: null,
	open() {
		if (this._dbPromise) return this._dbPromise;
		this._dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, 1);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		return this._dbPromise;
	},
	async put(id, buffer) {
		const db = await this.open();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(DB_STORE, 'readwrite');
			tx.objectStore(DB_STORE).put({ id, buffer });
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},
	async get(id) {
		const db = await this.open();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(DB_STORE, 'readonly');
			const req = tx.objectStore(DB_STORE).get(id);
			req.onsuccess = () => resolve(req.result?.buffer || null);
			req.onerror = () => reject(req.error);
		});
	},
	async del(id) {
		const db = await this.open();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(DB_STORE, 'readwrite');
			tx.objectStore(DB_STORE).delete(id);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},
};

// -----------------------------------------------------------------------------
// Plugin
// -----------------------------------------------------------------------------

class Plugin extends AppPlugin {
	onLoad() {
		this.state = this.loadState();
		this.loadedFaces = new Map();
		this.webLinks = new Map();
		this.cleanup = [];
		this.page = null;
		this.localFontsCache = null;
		this.localScanNote = '';
		this.statusItem = null;

		this.ui.registerCustomPanelType(PAGE_TYPE, (panel) => this.renderPage(panel));

		this.ui.addCommandPaletteCommand({
			label: 'Font Loader: open font manager',
			icon: 'ti-letter-t',
			onSelected: () => this.openPage(),
		});
		this.ui.addCommandPaletteCommand({
			label: 'Font Loader: toggle custom fonts',
			icon: 'ti-adjustments',
			onSelected: () => this.toggleEnabled(),
		});
		this.ui.addCommandPaletteCommand({
			label: 'Font Loader: reset all font slots',
			icon: 'ti-refresh',
			onSelected: () => this.resetAllSlots(),
		});

		const customCfg = this.getConfiguration()?.custom || {};
		if (customCfg.showStatusBar !== false) {
			this.statusItem = this.ui.addStatusBarItem({
				icon: 'ti-letter-t',
				label: 'Fontlar',
				tooltip: 'Font Loader — Uygulama fontlarını yönet',
				onClick: () => this.openPage(),
			});
		}
		if (customCfg.showSidebarItem === true) {
			const sideItem = this.ui.addSidebarItem({
				label: 'Fontlar',
				icon: 'ti-letter-t',
				tooltip: 'Font Loader',
				onClick: () => this.openPage(),
			});
			this.cleanup.push(() => sideItem?.remove?.());
		}

		const mo = new MutationObserver(() => {
			if (this.styleEl && this.styleEl.parentNode === document.head && document.head.lastElementChild !== this.styleEl) {
				document.head.appendChild(this.styleEl);
			}
		});
		mo.observe(document.head, { childList: true });
		this.cleanup.push(() => mo.disconnect());

		this.syncWebLinks();
		this.applyStyles();
		this.updateStatusBar();
		this.hydrateUploadedFonts();
	}

	onUnload() {
		for (const fn of this.cleanup) {
			try { fn(); } catch { /* ignore */ }
		}
		this.cleanup = [];
		try { this.statusItem?.remove?.(); } catch { /* ignore */ }
		this.statusItem = null;

		if (this.styleEl) {
			this.styleEl.remove();
			this.styleEl = null;
		}
		for (const link of this.webLinks.values()) link.remove();
		this.webLinks.clear();

		for (const face of this.loadedFaces.values()) {
			try { document.fonts.delete(face); } catch { /* ignore */ }
		}
		this.loadedFaces.clear();
		this.page = null;
	}

	loadState() {
		const base = defaultState();
		try {
			const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
			if (!raw || typeof raw !== 'object') return base;
			return {
				enabled: raw.enabled !== false,
				previewText: typeof raw.previewText === 'string' && raw.previewText ? raw.previewText : DEFAULT_SAMPLE,
				fonts: Array.isArray(raw.fonts) ? raw.fonts : [],
				slots: {
					ui: { ...defaultSlot(), ...(raw.slots?.ui || {}) },
					editor: { ...defaultSlot(), ...(raw.slots?.editor || {}) },
					heading: { ...defaultSlot(), ...(raw.slots?.heading || {}) },
					mono: { ...defaultSlot(), ...(raw.slots?.mono || {}) },
				},
			};
		} catch {
			return base;
		}
	}

	saveState() {
		try {
			localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
		} catch { /* ignore quota errors */ }
	}

	fontById(id) {
		if (!id) return null;
		return this.state.fonts.find((f) => f.id === id) || null;
	}

	cssStackFor(slotId) {
		const slot = SLOTS.find((s) => s.id === slotId);
		const cfg = this.state.slots[slotId];
		const font = cfg?.fontId ? this.fontById(cfg.fontId) : null;
		if (!font) return null;
		return `${cssQuote(font.cssFamily)}, ${slot.fallback}`;
	}

	async hydrateUploadedFonts() {
		let changed = false;
		for (const font of this.state.fonts) {
			if (font.source !== 'upload' || !Array.isArray(font.variants)) continue;
			for (const v of font.variants) {
				if (this.loadedFaces.has(v.id)) continue;
				let buffer = null;
				try { buffer = await FontDB.get(v.id); } catch { /* ignore */ }
				if (!buffer && v.blobGuid && this.data?.getBlobFromPropertyFileValue) {
					try {
						const blob = await this.data.getBlobFromPropertyFileValue({
							guid: v.blobGuid,
							name: v.fileName,
							error: null,
							imgData: null,
							imgUrl: null,
						});
						const data = blob && (await blob.download());
						if (data) {
							buffer = data;
							await FontDB.put(v.id, buffer).catch(() => {});
						}
					} catch { /* fallback unavailable */ }
				}
				if (!buffer) continue;
				try {
					const face = new FontFace(font.cssFamily, buffer, {
						weight: String(v.weight || '400'),
						style: v.style || 'normal',
						display: 'swap',
					});
					await face.load();
					document.fonts.add(face);
					this.loadedFaces.set(v.id, face);
					changed = true;
				} catch (err) {
					console.warn('[Font Loader] Failed to load font variant', v.fileName, err);
				}
			}
		}
		if (changed) {
			this.applyStyles();
			this.refreshPageIfOpen();
		}
	}

	syncWebLinks() {
		const activeIds = new Set();
		for (const font of this.state.fonts) {
			if (font.source !== 'web' || !font.cssUrl) continue;
			activeIds.add(font.id);
			if (!this.webLinks.has(font.id)) {
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = font.cssUrl;
				link.dataset.tflLink = font.id;
				document.head.appendChild(link);
				this.webLinks.set(font.id, link);
			}
		}
		for (const [id, link] of this.webLinks.entries()) {
			if (!activeIds.has(id)) {
				link.remove();
				this.webLinks.delete(id);
			}
		}
	}

	buildCSS() {
		if (!this.state.enabled) return '';
		const chunks = [];
		const vars = [];

		const uiCfg = this.state.slots.ui;
		const uiStack = this.cssStackFor('ui');
		if (uiStack || uiCfg.weight) {
			if (uiStack) {
				vars.push(`--tfl-ui-font: ${uiStack};`, `--modal-h1-font: ${uiStack};`);
				chunks.push(`
html[data-theme] body,
html[data-theme] body > :not(.app-chrome-panels),
html[data-theme] body :is(p, ol, ul):not(listview-editor *),
html[data-theme] body .sidebar,
html[data-theme] body .sidebar .sidebar-item,
html[data-theme] body .sidebar .sidebar-item-label,
html[data-theme] body .sidebar-date-group-header,
html[data-theme] body .sidebar-nest-group-header,
html[data-theme] body .title-bar,
html[data-theme] body .panel-bar,
html[data-theme] body .panel-bar--tabs,
html[data-theme] body .panel-bar--tab,
html[data-theme] body .panel-context-pill,
html[data-theme] body .page-props-pills,
html[data-theme] body .page-props-table,
html[data-theme] body .statusbar--status-bar,
html[data-theme] body .cmdpal--dialog,
html[data-theme] body .cmdpal--inline,
html[data-theme] body .autocomplete--option,
html[data-theme] body .autocomplete--option-label,
html[data-theme] body .modal-dialog,
html[data-theme] body .modal-dialog :is(h1, h2, h3, label, p, span:not(.ti)),
html[data-theme] body .modal-h1,
html[data-theme] body .modal-fullscreen-content :is(h1, label, p),
html[data-theme] body .toaster,
html[data-theme] body .tooltip-element,
html[data-theme] body .page-details-popover,
html[data-theme] body .inline-view-editor-popover,
html[data-theme] body .datepicker-wrapper,
html[data-theme] body .table-view,
html[data-theme] body .board-view,
html[data-theme] body .gallery-view,
html[data-theme] body .empty-panel,
html[data-theme] body .tfl-page,
html[data-theme] body :is(button, input, select, textarea):not(.ti) {
	font-family: var(--tfl-ui-font) !important;
}`);
			}
			if (uiCfg.weight) {
				chunks.push(`
html[data-theme] body,
html[data-theme] body :is(p, ol, ul, select, input, button, textarea):not(listview-editor *):not(.ti),
html[data-theme] body .sidebar .sidebar-item-label,
html[data-theme] body .panel-bar,
html[data-theme] body .statusbar--status-bar {
	font-weight: ${Number(uiCfg.weight)} !important;
}`);
			}
		}

		const edCfg = this.state.slots.editor;
		const edStack = this.cssStackFor('editor');
		if (edStack || edCfg.sizePx || edCfg.lineHeight || edCfg.weight) {
			if (edStack) {
				vars.push(`--tfl-editor-font: ${edStack};`, `--ed-variable-width-font: ${edStack};`);
				chunks.push(`
html[data-theme] body listview-editor,
html[data-theme] body listview-editor .listview-items,
html[data-theme] body listview-editor .listitem .line-div,
html[data-theme] body listview-editor .listitem .line-div :is(span, a):not(.ti):not(.lineitem-code):not(.lineitem-icon):not(.lineitem-backlink-pill),
html[data-theme] body listview-editor :is(p, ol, ul),
html[data-theme] body .block-container-div:not(.block-codelang),
html[data-theme] body .block-lang-quote > .block-content > .listitem:not(.listitem-block),
html[data-theme] body .transclusion-page-title {
	font-family: var(--tfl-editor-font) !important;
}`);
			}
			if (edCfg.sizePx > 0) {
				chunks.push(`
html[data-theme] body .panel-body listview-editor:not(.style-smaller):not(.listview-search-results) {
	font-size: ${Number(edCfg.sizePx)}px !important;
}`);
			}
			if (edCfg.lineHeight > 0) {
				const lh = Number(edCfg.lineHeight).toFixed(2);
				chunks.push(`
html[data-theme] body .panel-body listview-editor:not(.listview-search-results) {
	--ed-line-height: ${lh};
	line-height: ${lh} !important;
}`);
			}
			if (edCfg.weight) {
				chunks.push(`
html[data-theme] body .panel-body listview-editor:not(.listview-search-results),
html[data-theme] body .panel-body listview-editor:not(.listview-search-results) .listitem:not(.listitem-heading) .line-div {
	font-weight: ${Number(edCfg.weight)} !important;
}`);
			}
		}

		const hdCfg = this.state.slots.heading;
		const hdStack = this.cssStackFor('heading');
		if (hdStack || hdCfg.weight || (hdCfg.scalePct && hdCfg.scalePct !== 100)) {
			if (hdStack) {
				vars.push(`--tfl-heading-font: ${hdStack};`);
				chunks.push(`
html[data-theme] body .id--panel-title .id--h1,
html[data-theme] body .id--panel-title .id--h1-edit,
html[data-theme] body .panel-heading-title-row .title,
html[data-theme] body .gallery-view-card-title-overlay,
html[data-theme] body .transclusion-page-title,
html[data-theme] body listview-editor .line-div:is(.heading-h1, .heading-h2, .heading-h3, .heading-h4, .heading-h5, .heading-h6),
html[data-theme] body listview-editor .line-div:is(.heading-h1, .heading-h2, .heading-h3, .heading-h4, .heading-h5, .heading-h6) :is(span, a):not(.ti):not(.lineitem-code):not(.lineitem-icon) {
	font-family: var(--tfl-heading-font) !important;
}`);
			}
			if (hdCfg.weight) {
				const w = Number(hdCfg.weight);
				chunks.push(`
html[data-theme] body .id--panel-title .id--h1,
html[data-theme] body .id--panel-title .id--h1-edit,
html[data-theme] body .panel-heading-title-row .title,
html[data-theme] body listview-editor .line-div:is(.heading-h1, .heading-h2, .heading-h3, .heading-h4, .heading-h5, .heading-h6) > span:not(.ti):not(.lineitem-code) {
	font-weight: ${w} !important;
}`);
			}
			if (hdCfg.scalePct && hdCfg.scalePct !== 100) {
				const k = (Number(hdCfg.scalePct) / 100).toFixed(3);
				chunks.push(`
html[data-theme] body listview-editor .line-div:is(.heading-h1, .heading-h2, .heading-h3, .heading-h4, .heading-h5, .heading-h6) {
	font-size: ${k}em !important;
}
html[data-theme] body .id--panel-title .id--h1,
html[data-theme] body .id--panel-title .id--h1-edit {
	font-size: calc(44px * ${k}) !important;
}`);
			}
		}

		const moCfg = this.state.slots.mono;
		const moStack = this.cssStackFor('mono');
		if (moStack || moCfg.sizePx || moCfg.weight) {
			if (moStack) {
				vars.push(
					`--tfl-mono-font: ${moStack};`,
					`--font-mono: ${moStack};`,
					`--ed-monospace-font: ${moStack};`,
					`--debug-fixed-width-font: ${moStack};`
				);
				chunks.push(`
html[data-theme] body :is(code, pre, kbd, .lineitem-code, .kbd, .statusbar--kbd, .mcp-config, .shortcuts-help-content),
html[data-theme] body .block-container-div.block-codelang,
html[data-theme] body .block-container-div.block-codelang > .block-content > .listitem,
html[data-theme] body .block-container-div.block-codelang > .block-content > .listitem .line-div,
html[data-theme] body .block-container-div.block-codelang > .block-content > .listitem .line-div span:not(.ti),
html[data-theme] body :is(.cmdpal--input, .cmdpal--inline-input, .cmdpal--stype, .terminal-line, .terminal-cmd, .terminal-bash-block, .terminal-bash-output .terminal-line) {
	font-family: var(--tfl-mono-font) !important;
}`);
			}
			if (moCfg.sizePx > 0) {
				chunks.push(`
html[data-theme] body .block-container-div.block-codelang,
html[data-theme] body .block-container-div.block-codelang > .block-content > .listitem,
html[data-theme] body .lineitem-code,
html[data-theme] body code {
	font-size: ${Number(moCfg.sizePx)}px !important;
}`);
			}
			if (moCfg.weight) {
				chunks.push(`
html[data-theme] body .block-container-div.block-codelang > .block-content > .listitem,
html[data-theme] body .lineitem-code,
html[data-theme] body code {
	font-weight: ${Number(moCfg.weight)} !important;
}`);
			}
		}

		if (!vars.length && !chunks.length) return '';
		const varBlock = vars.length ? `html[data-theme] {\n\t${vars.join('\n\t')}\n}` : '';
		return `/* Thymer Font Loader */\n${varBlock}\n${chunks.join('\n')}`;
	}

	applyStyles() {
		const css = this.buildCSS();
		if (!css) {
			if (this.styleEl) {
				this.styleEl.remove();
				this.styleEl = null;
			}
			return;
		}
		if (!this.styleEl) {
			this.styleEl = document.getElementById(STYLE_ID) || document.createElement('style');
			this.styleEl.id = STYLE_ID;
		}
		this.styleEl.textContent = css;
		document.head.appendChild(this.styleEl);
	}

	updateStatusBar() {
		if (!this.statusItem) return;
		const active = SLOTS.filter((s) => this.state.slots[s.id]?.fontId && this.fontById(this.state.slots[s.id].fontId));
		if (!this.state.enabled) {
			this.statusItem.setLabel?.('Fontlar (kapalı)');
			this.statusItem.setTooltip?.('Font Loader duraklatıldı — açmak için tıklayın');
		} else if (active.length) {
			this.statusItem.setLabel?.(`Fontlar (${active.length})`);
			const summary = active.map((s) => `${s.label}: ${this.fontById(this.state.slots[s.id].fontId).name}`).join(' · ');
			this.statusItem.setTooltip?.(`Font Loader — ${summary}`);
		} else {
			this.statusItem.setLabel?.('Fontlar');
			this.statusItem.setTooltip?.('Font Loader — Uygulama fontlarını yönet');
		}
	}

	async handleFiles(fileList) {
		const files = Array.from(fileList || []).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f.name));
		if (!files.length) {
			this.ui.addToaster({
				title: 'Desteklenmeyen dosya',
				message: 'Lütfen .ttf, .otf, .woff veya .woff2 dosyası seçin.',
				dismissible: true,
				autoDestroyTime: 3500,
			});
			return;
		}

		let addedCount = 0;
		const touchedFamilies = [];

		for (const file of files) {
			try {
				const buffer = await file.arrayBuffer();
				const meta = parseFontMeta(buffer, file.name);

				let familyEntry = this.state.fonts.find(
					(f) => f.source === 'upload' && f.name.toLowerCase() === meta.family.toLowerCase()
				);
				const cssFamily = familyEntry ? familyEntry.cssFamily : `TFL_${sanitizeSlug(meta.family)}_${Date.now().toString(36)}`;

				const face = new FontFace(cssFamily, buffer, {
					weight: String(meta.weight),
					style: meta.style,
					display: 'swap',
				});
				await face.load();

				const variantId = uid('var');
				await FontDB.put(variantId, buffer);

				let blobGuid = null;
				if (this.data?.uploadBlob) {
					try {
						const blob = await this.data.uploadBlob(file);
						if (blob?.guid) blobGuid = blob.guid;
					} catch { /* IndexedDB remains primary storage */ }
				}

				const variant = {
					id: variantId,
					fileName: file.name,
					format: meta.format,
					weight: String(meta.weight),
					style: meta.style,
					size: file.size || buffer.byteLength,
					blobGuid,
				};

				if (!familyEntry) {
					familyEntry = {
						id: uid('fnt'),
						name: meta.family,
						cssFamily,
						source: 'upload',
						variants: [variant],
						addedAt: Date.now(),
					};
					this.state.fonts.unshift(familyEntry);
				} else {
					familyEntry.variants.push(variant);
				}

				document.fonts.add(face);
				this.loadedFaces.set(variantId, face);
				addedCount++;
				if (!touchedFamilies.includes(familyEntry.name)) touchedFamilies.push(familyEntry.name);
			} catch (err) {
				this.ui.addToaster({
					title: `Font yüklenemedi: ${file.name}`,
					message: err?.message || 'Geçersiz veya bozuk font dosyası.',
					dismissible: true,
					autoDestroyTime: 5000,
				});
			}
		}

		if (addedCount > 0) {
			this.saveState();
			this.applyStyles();
			this.updateStatusBar();
			this.refreshPageIfOpen();
			this.ui.addToaster({
				title: `${addedCount} font dosyası yüklendi`,
				message: touchedFamilies.join(', '),
				dismissible: true,
				autoDestroyTime: 3000,
			});
		}
	}

	addSystemFont(rawName) {
		const name = String(rawName || '').trim().replace(/^["']|["']$/g, '');
		if (!name) return null;
		const existing = this.state.fonts.find((f) => f.source === 'system' && f.name.toLowerCase() === name.toLowerCase());
		if (existing) return existing;
		const entry = {
			id: uid('fnt'),
			name,
			cssFamily: name,
			source: 'system',
			variants: [],
			addedAt: Date.now(),
		};
		this.state.fonts.unshift(entry);
		this.saveState();
		this.refreshPageIfOpen();
		this.ui.addToaster({ title: `Sistem fontu eklendi: ${entry.name}`, dismissible: true, autoDestroyTime: 2200 });
		return entry;
	}

	async addWebFont(rawInput) {
		const val = String(rawInput || '').trim();
		if (!val) return null;

		let cssUrl = '';
		let name = val;

		if (/^https?:\/\//i.test(val)) {
			cssUrl = val;
			try {
				const u = new URL(val);
				const fam = u.searchParams.get('family');
				if (fam) name = fam.split(':')[0].replace(/\+/g, ' ').trim();
				else name = u.pathname.split('/').pop() || 'Web Font';
			} catch {
				name = 'Web Font';
			}
		} else {
			const slug = encodeURIComponent(val).replace(/%20/g, '+');
			const richUrl = `https://fonts.googleapis.com/css2?family=${slug}:ital,wght@0,300..800;1,300..800&display=swap`;
			const simpleUrl = `https://fonts.googleapis.com/css2?family=${slug}&display=swap`;
			cssUrl = simpleUrl;
			try {
				const res = await fetch(richUrl);
				if (res.ok) cssUrl = richUrl;
			} catch { /* fallback to simpleUrl */ }
		}

		const existing = this.state.fonts.find((f) => f.source === 'web' && f.name.toLowerCase() === name.toLowerCase());
		if (existing) {
			existing.cssUrl = cssUrl;
			this.syncWebLinks();
			this.saveState();
			this.refreshPageIfOpen();
			return existing;
		}

		const entry = {
			id: uid('fnt'),
			name,
			cssFamily: name,
			source: 'web',
			cssUrl,
			variants: [],
			addedAt: Date.now(),
		};
		this.state.fonts.unshift(entry);
		this.syncWebLinks();
		this.saveState();
		this.refreshPageIfOpen();
		this.ui.addToaster({ title: `Web font eklendi: ${entry.name}`, dismissible: true, autoDestroyTime: 2500 });
		return entry;
	}

	async deleteFont(fontId) {
		const idx = this.state.fonts.findIndex((f) => f.id === fontId);
		if (idx === -1) return;
		const font = this.state.fonts[idx];
		this.state.fonts.splice(idx, 1);

		for (const v of font.variants || []) {
			const face = this.loadedFaces.get(v.id);
			if (face) {
				try { document.fonts.delete(face); } catch { /* ignore */ }
				this.loadedFaces.delete(v.id);
			}
			await FontDB.del(v.id).catch(() => {});
		}
		for (const s of SLOTS) {
			if (this.state.slots[s.id].fontId === fontId) this.state.slots[s.id].fontId = null;
		}

		this.syncWebLinks();
		this.saveState();
		this.applyStyles();
		this.updateStatusBar();
		this.refreshPageIfOpen();
	}

	renameFont(fontId, newName) {
		const font = this.fontById(fontId);
		const clean = String(newName || '').trim();
		if (!font || !clean) return;
		font.name = clean;
		if (font.source !== 'upload') font.cssFamily = clean;
		this.saveState();
		this.applyStyles();
		this.updateStatusBar();
		this.refreshPageIfOpen();
	}

	updateSlot(slotId, patch) {
		if (!this.state.slots[slotId]) return;
		this.state.slots[slotId] = { ...this.state.slots[slotId], ...patch };
		this.saveState();
		this.applyStyles();
		this.updateStatusBar();
		this.refreshPageIfOpen();
	}

	assignFontToSlot(fontId, slotId) {
		const cur = this.state.slots[slotId]?.fontId;
		this.updateSlot(slotId, { fontId: cur === fontId ? null : fontId });
	}

	assignFontToAll(fontId) {
		for (const s of SLOTS) this.state.slots[s.id].fontId = fontId;
		this.saveState();
		this.applyStyles();
		this.updateStatusBar();
		this.refreshPageIfOpen();
	}

	resetSlot(slotId) {
		this.state.slots[slotId] = defaultSlot();
		this.saveState();
		this.applyStyles();
		this.updateStatusBar();
		this.refreshPageIfOpen();
	}

	resetAllSlots() {
		for (const s of SLOTS) this.state.slots[s.id] = defaultSlot();
		this.saveState();
		this.applyStyles();
		this.updateStatusBar();
		this.refreshPageIfOpen();
	}

	toggleEnabled() {
		this.state.enabled = !this.state.enabled;
		this.saveState();
		this.applyStyles();
		this.updateStatusBar();
		this.refreshPageIfOpen();
	}

	async scanLocalFonts() {
		if (typeof window.queryLocalFonts !== 'function') {
			this.localScanNote = 'Bu tarayıcı ortamı yerel font taramasını (queryLocalFonts) desteklemiyor; font adını elle yazarak ekleyebilirsiniz.';
			this.refreshPageIfOpen();
			return;
		}
		try {
			const list = await window.queryLocalFonts();
			const seen = new Set();
			const families = [];
			for (const item of list) {
				if (item?.family && !seen.has(item.family)) {
					seen.add(item.family);
					families.push(item.family);
				}
			}
			families.sort((a, b) => a.localeCompare(b));
			this.localFontsCache = families;
			this.localScanNote = families.length
				? `${families.length} sistem fontu bulundu. Eklemek için birine tıklayın.`
				: 'Sistem fontu listesi boş döndü (izin verilmemiş olabilir).';
		} catch (err) {
			this.localScanNote = `Sistem fontları okunamadı (${err?.message || 'izin reddedildi'}). Font adını elle ekleyebilirsiniz.`;
		}
		this.refreshPageIfOpen();
	}

	async openPage() {
		const panel = this.ui.getActivePanel() || (await this.ui.createPanel());
		panel?.navigateToCustomType(PAGE_TYPE);
	}

	refreshPageIfOpen() {
		if (!this.page || !this.page.root.isConnected) return;
		const scroller = this.page.root.closest('.panel-scroller-y');
		const top = scroller ? scroller.scrollTop : 0;
		this.renderPageContents();
		if (scroller) scroller.scrollTop = top;
	}

	renderPage(panel) {
		const host = panel.getElement();
		if (!host) return;
		panel.setTitle?.('Font Yükleyici');

		host.innerHTML = '';
		const root = document.createElement('div');
		root.className = 'tfl-page';
		host.appendChild(root);

		this.page = { panel, root, localFilter: '', activeTab: 'system' };
		this.bindPageEvents(root);
		this.renderPageContents();
	}

	bindPageEvents(root) {
		root.addEventListener('click', (e) => {
			if (e.target.classList?.contains('tfl-file-input')) return;
			const btn = e.target.closest('[data-act]');
			if (!btn) return;
			const act = btn.dataset.act;
			if (act === 'toggle-enabled') return this.toggleEnabled();
			if (act === 'reset-all') return this.resetAllSlots();
			if (act === 'reset-slot') return this.resetSlot(btn.dataset.slot);
			if (act === 'pick-files') return root.querySelector('.tfl-file-input')?.click();
			if (act === 'scan-local') return this.scanLocalFonts();
			if (act === 'tab') {
				this.page.activeTab = btn.dataset.tab;
				this.renderPageContents();
				return;
			}
			if (act === 'add-quick-sys') {
				this.addSystemFont(btn.dataset.font);
				return;
			}
			if (act === 'add-quick-web') {
				this.addWebFont(btn.dataset.font);
				return;
			}
			if (act === 'add-sys-input') {
				const inp = root.querySelector('.tfl-sys-input');
				if (inp?.value.trim()) {
					this.addSystemFont(inp.value);
					inp.value = '';
				}
				return;
			}
			if (act === 'add-web-input') {
				const inp = root.querySelector('.tfl-web-input');
				if (inp?.value.trim()) {
					this.addWebFont(inp.value);
					inp.value = '';
				}
				return;
			}
			if (act === 'assign-slot') return this.assignFontToSlot(btn.dataset.fontId, btn.dataset.slot);
			if (act === 'assign-all') return this.assignFontToAll(btn.dataset.fontId);
			if (act === 'delete-font') return this.deleteFont(btn.dataset.fontId);
			if (act === 'rename-font') {
				const cur = this.fontById(btn.dataset.fontId);
				const next = cur ? window.prompt('Font adı:', cur.name) : null;
				if (next && next.trim()) this.renameFont(btn.dataset.fontId, next);
			}
		});

		root.addEventListener('change', (e) => {
			const t = e.target;
			if (t.classList.contains('tfl-file-input')) {
				if (t.files?.length) this.handleFiles(t.files);
				t.value = '';
				return;
			}
			if (t.dataset.slotSelect) {
				this.updateSlot(t.dataset.slotSelect, { fontId: t.value || null });
				return;
			}
			if (t.dataset.slotWeight) {
				this.updateSlot(t.dataset.slotWeight, { weight: t.value });
				return;
			}
			if (t.dataset.slotSize) {
				const n = Math.max(0, Math.min(36, Number(t.value) || 0));
				this.updateSlot(t.dataset.slotSize, { sizePx: n });
				return;
			}
			if (t.dataset.slotLh) {
				const n = Math.max(0, Math.min(3, Number(t.value) || 0));
				this.updateSlot(t.dataset.slotLh, { lineHeight: n });
				return;
			}
			if (t.dataset.slotScale) {
				const n = Math.max(60, Math.min(180, Number(t.value) || 100));
				this.updateSlot(t.dataset.slotScale, { scalePct: n });
			}
		});

		root.addEventListener('input', (e) => {
			const t = e.target;
			if (t.classList.contains('tfl-sample-input')) {
				this.state.previewText = t.value || DEFAULT_SAMPLE;
				this.saveState();
				root.querySelectorAll('.tfl-card-sample').forEach((el) => {
					el.textContent = this.state.previewText;
				});
				return;
			}
			if (t.classList.contains('tfl-local-filter')) {
				this.page.localFilter = t.value.trim().toLowerCase();
				this.renderLocalFontChips();
			}
		});

		root.addEventListener('keydown', (e) => {
			if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('tfl-drop')) {
				e.preventDefault();
				root.querySelector('.tfl-file-input')?.click();
				return;
			}
			if (e.key !== 'Enter') return;
			if (e.target.classList.contains('tfl-sys-input')) {
				e.preventDefault();
				root.querySelector('[data-act="add-sys-input"]')?.click();
			} else if (e.target.classList.contains('tfl-web-input')) {
				e.preventDefault();
				root.querySelector('[data-act="add-web-input"]')?.click();
			}
		});

		root.addEventListener('dragover', (e) => {
			const drop = e.target.closest('.tfl-drop');
			if (!drop) return;
			e.preventDefault();
			drop.classList.add('is-over');
		});
		root.addEventListener('dragleave', (e) => {
			const drop = e.target.closest('.tfl-drop');
			if (drop && !drop.contains(e.relatedTarget)) drop.classList.remove('is-over');
		});
		root.addEventListener('drop', (e) => {
			const drop = e.target.closest('.tfl-drop');
			if (!drop) return;
			e.preventDefault();
			drop.classList.remove('is-over');
			if (e.dataTransfer?.files?.length) this.handleFiles(e.dataTransfer.files);
		});
	}

	renderLocalFontChips() {
		const box = this.page?.root?.querySelector('.tfl-local-list');
		if (!box || !this.localFontsCache) return;
		const q = this.page.localFilter || '';
		const list = q ? this.localFontsCache.filter((n) => n.toLowerCase().includes(q)) : this.localFontsCache;
		box.innerHTML = list.slice(0, 80).map((n) => `<button type="button" class="tfl-chip" data-act="add-quick-sys" data-font="${escHtml(n)}">+ ${escHtml(n)}</button>`).join('')
			|| '<span class="tfl-status-msg">Eşleşen sistem fontu yok.</span>';
	}

	renderSlotCard(slot) {
		const cfg = this.state.slots[slot.id];
		const selectedFont = cfg.fontId ? this.fontById(cfg.fontId) : null;
		const uploaded = this.state.fonts.filter((f) => f.source === 'upload');
		const systemOrWeb = this.state.fonts.filter((f) => f.source !== 'upload');

		const opt = (f) => `<option value="${escHtml(f.id)}"${cfg.fontId === f.id ? ' selected' : ''}>${escHtml(f.name)}</option>`;
		const optionsHtml = [
			`<option value="">Tema Varsayılanı</option>`,
			uploaded.length ? `<optgroup label="Yüklenen Fontlar">${uploaded.map(opt).join('')}</optgroup>` : '',
			systemOrWeb.length ? `<optgroup label="Sistem / Web Fontları">${systemOrWeb.map(opt).join('')}</optgroup>` : '',
		].join('');

		const weights = ['', '300', '400', '500', '600', '700', '800'];
		const weightHtml = slot.supportsWeight ? `
			<label class="tfl-tweak">Kalınlık
				<select class="tfl-select" data-slot-weight="${slot.id}">
					${weights.map((w) => `<option value="${w}"${String(cfg.weight || '') === w ? ' selected' : ''}>${w ? w : 'Otomatik'}</option>`).join('')}
				</select>
			</label>` : '';

		const sizeHtml = slot.supportsSize ? `
			<label class="tfl-tweak">Boyut (px)
				<input type="number" class="tfl-input" min="0" max="36" step="1" placeholder="Oto" value="${cfg.sizePx || ''}" data-slot-size="${slot.id}">
			</label>` : '';

		const lhHtml = slot.supportsLineHeight ? `
			<label class="tfl-tweak">Satır
				<input type="number" class="tfl-input" min="0" max="3" step="0.05" placeholder="Oto" value="${cfg.lineHeight || ''}" data-slot-lh="${slot.id}">
			</label>` : '';

		const scaleHtml = slot.supportsScale ? `
			<label class="tfl-tweak">Ölçek (%)
				<input type="number" class="tfl-input" min="60" max="180" step="5" value="${cfg.scalePct || 100}" data-slot-scale="${slot.id}">
			</label>` : '';

		const previewStyles = [];
		if (selectedFont) previewStyles.push(`font-family: ${escHtml(cssQuote(selectedFont.cssFamily))}, ${slot.fallback}`);
		if (cfg.weight) previewStyles.push(`font-weight: ${Number(cfg.weight)}`);
		if (slot.supportsSize && cfg.sizePx > 0) previewStyles.push(`font-size: ${Number(cfg.sizePx)}px`);
		if (slot.id === 'heading') previewStyles.push('font-size: 18px', `font-weight: ${Number(cfg.weight || 700)}`);

		const isModified = !!(selectedFont || cfg.weight || cfg.sizePx || cfg.lineHeight || (cfg.scalePct && cfg.scalePct !== 100));

		return `
		<div class="tfl-slot${selectedFont ? ' is-active' : ''}">
			<div class="tfl-slot-top">
				<div class="tfl-slot-meta">
					<div class="tfl-slot-ico"><span class="ti ${slot.icon}"></span></div>
					<div>
						<div class="tfl-slot-name">${slot.label}</div>
						<div class="tfl-slot-desc">${slot.desc}</div>
					</div>
				</div>
				${isModified ? `<button type="button" class="tfl-btn tfl-slot-reset" data-act="reset-slot" data-slot="${slot.id}">Sıfırla</button>` : ''}
			</div>
			<div class="tfl-slot-controls">
				<select class="tfl-select tfl-select-main" data-slot-select="${slot.id}">${optionsHtml}</select>
			</div>
			<div class="tfl-slot-tweaks">${weightHtml}${sizeHtml}${lhHtml}${scaleHtml}</div>
			<div class="tfl-slot-preview" style="${previewStyles.join(';')}">${escHtml(slot.sample)}</div>
		</div>`;
	}

	renderFontCard(font) {
		const badge = font.source === 'upload'
			? `Yüklenen · ${(font.variants || []).length} dosya`
			: font.source === 'web' ? 'Web Font' : 'Sistem Fontu';

		const variantTags = (font.variants || []).map((v) => {
			const wLbl = WEIGHT_LABELS[v.weight] || v.weight;
			const st = v.style === 'italic' ? ' İtalik' : '';
			return `<span class="tfl-badge">${escHtml(v.format.toUpperCase())} · ${escHtml(wLbl)}${st} · ${fmtBytes(v.size)}</span>`;
		}).join('');

		const slotPills = SLOTS.map((s) => {
			const on = this.state.slots[s.id]?.fontId === font.id;
			return `<button type="button" class="tfl-pill${on ? ' is-on' : ''}" data-act="assign-slot" data-font-id="${escHtml(font.id)}" data-slot="${s.id}">${on ? '✓ ' : ''}${escHtml(s.label)}</button>`;
		}).join('');

		return `
		<div class="tfl-card">
			<div class="tfl-card-top">
				<div class="tfl-card-title">
					<span class="tfl-card-name">${escHtml(font.name)}</span>
					<span class="tfl-badge">${badge}</span>
					${variantTags}
				</div>
				<div class="tfl-card-tools">
					<button type="button" class="tfl-btn" data-act="rename-font" data-font-id="${escHtml(font.id)}">Yeniden Adlandır</button>
					<button type="button" class="tfl-btn tfl-btn-danger" data-act="delete-font" data-font-id="${escHtml(font.id)}" title="Kütüphaneden sil"><span class="ti ti-trash"></span></button>
				</div>
			</div>
			<div class="tfl-card-sample" style="font-family: ${escHtml(cssQuote(font.cssFamily))}, sans-serif;">${escHtml(this.state.previewText)}</div>
			<div class="tfl-card-actions">
				<div class="tfl-assign-pills">
					${slotPills}
					<button type="button" class="tfl-pill" data-act="assign-all" data-font-id="${escHtml(font.id)}">Tümüne Uygula</button>
				</div>
			</div>
		</div>`;
	}

	renderPageContents() {
		const pg = this.page;
		if (!pg || !pg.root.isConnected) return;

		const activeTab = pg.activeTab || 'system';
		const sysPanel = `
			<div class="tfl-row">
				<input type="text" class="tfl-input tfl-sys-input" placeholder="Font ailesi adı (ör. Inter, SF Pro Text, JetBrains Mono)">
				<button type="button" class="tfl-btn tfl-btn-primary" data-act="add-sys-input">Ekle</button>
			</div>
			<div class="tfl-row" style="justify-content: space-between;">
				<button type="button" class="tfl-btn" data-act="scan-local"><span class="ti ti-search"></span> Sistem Fontlarını Tara</button>
				${this.localScanNote ? `<span class="tfl-status-msg">${escHtml(this.localScanNote)}</span>` : ''}
			</div>
			${this.localFontsCache ? `
				<input type="text" class="tfl-input tfl-local-filter" placeholder="Bulunan sistem fontlarında ara..." value="${escHtml(pg.localFilter || '')}">
				<div class="tfl-local-list"></div>
			` : `
				<div class="tfl-chips">${QUICK_SYSTEM_FONTS.map((n) => `<button type="button" class="tfl-chip" data-act="add-quick-sys" data-font="${escHtml(n)}">+ ${escHtml(n)}</button>`).join('')}</div>
			`}`;

		const webPanel = `
			<div class="tfl-row">
				<input type="text" class="tfl-input tfl-web-input" placeholder="Google Font adı (ör. Newsreader) veya CSS URL yapıştır">
				<button type="button" class="tfl-btn tfl-btn-primary" data-act="add-web-input">Ekle</button>
			</div>
			<div class="tfl-chips">${POPULAR_GOOGLE_FONTS.map((n) => `<button type="button" class="tfl-chip" data-act="add-quick-web" data-font="${escHtml(n)}">+ ${escHtml(n)}</button>`).join('')}</div>`;

		pg.root.innerHTML = `
			<div class="tfl-head">
				<div class="tfl-title-wrap">
					<h1 class="tfl-title"><span class="ti ti-letter-t"></span> Font Yükleyici</h1>
					<p class="tfl-sub">Özel font dosyaları yükleyin veya sistem/web fontlarını arayüz, editör, başlık ve kod alanlarına atayın.</p>
				</div>
				<div class="tfl-head-actions">
					<button type="button" class="tfl-toggle-pill${this.state.enabled ? ' is-on' : ''}" data-act="toggle-enabled">
						<span class="tfl-dot"></span>
						<span>${this.state.enabled ? 'Özel Fontlar Açık' : 'Özel Fontlar Kapalı'}</span>
					</button>
					<button type="button" class="tfl-btn" data-act="reset-all"><span class="ti ti-refresh"></span> Tümünü Sıfırla</button>
				</div>
			</div>

			<div class="tfl-sec-head">
				<h2 class="tfl-sec-title">Uygulama Font Alanları</h2>
				<span class="tfl-sec-note">Her alan birbirinden bağımsızdır</span>
			</div>
			<div class="tfl-slots">
				${SLOTS.map((s) => this.renderSlotCard(s)).join('')}
			</div>

			<div class="tfl-sec-head">
				<h2 class="tfl-sec-title">Font Yükle veya Ekle</h2>
				<span class="tfl-sec-note">.ttf · .otf · .woff · .woff2</span>
			</div>
			<div class="tfl-add-grid">
				<input type="file" class="tfl-file-input" multiple accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" hidden>
				<div class="tfl-drop" data-act="pick-files" role="button" tabindex="0">
					<span class="ti ti-cloud-upload tfl-drop-ico"></span>
					<div class="tfl-drop-title">Font dosyalarını buraya bırakın veya seçin</div>
					<div class="tfl-drop-sub">Aynı ailenin Regular, Bold, Italic dosyalarını birlikte yükleyebilirsiniz; yerel IndexedDB’de saklanır.</div>
				</div>
				<div class="tfl-box">
					<div class="tfl-row">
						<button type="button" class="tfl-btn${activeTab === 'system' ? ' tfl-btn-primary' : ''}" data-act="tab" data-tab="system"><span class="ti ti-device-desktop"></span> Sistem Fontu</button>
						<button type="button" class="tfl-btn${activeTab === 'web' ? ' tfl-btn-primary' : ''}" data-act="tab" data-tab="web"><span class="ti ti-world"></span> Google / Web Font</button>
					</div>
					${activeTab === 'system' ? sysPanel : webPanel}
				</div>
			</div>

			<div class="tfl-sec-head">
				<h2 class="tfl-sec-title">Font Kütüphanesi (${this.state.fonts.length})</h2>
			</div>
			<div class="tfl-sample-bar">
				<label for="tfl-sample-inp">Önizleme metni</label>
				<input id="tfl-sample-inp" type="text" class="tfl-input tfl-sample-input" value="${escHtml(this.state.previewText)}">
			</div>
			<div class="tfl-lib">
				${this.state.fonts.length
					? this.state.fonts.map((f) => this.renderFontCard(f)).join('')
					: '<div class="tfl-empty">Henüz font eklenmedi. Yukarıdan bir .ttf / .otf / .woff2 dosyası yükleyin veya sistem/web fontu ekleyin.</div>'}
			</div>
		`;

		if (this.localFontsCache) this.renderLocalFontChips();
	}
}
