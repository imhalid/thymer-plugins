/**
 * Smart Dates - date words typed in a line ("yarın sabah", "2 gün önce", "saat 5", "geçen sene aralık", "tomorrow at
 * 3pm", "next monday", "three days after") become Thymer date tags.
 *
 * While a line is typed in, the phrases found in it get a dotted underline (::highlight, nothing in the line changes).
 * Once the caret has left the line and Thymer has saved it, each phrase is replaced by a datetime segment. Changing a
 * line the caret is in would race the typing, which is why it waits. Only lines typed in here are changed (not lines
 * written by MCP, imports or other plugins), and a phrase whose tag was removed by hand is left as text in that line.
 *
 * Phrases are turned into the English that Thymer's own date parser reads (DateTime.parseDateTimeString), so a week,
 * a month or a year stays a range there; a time is put on the day with setTime.
 */

// ---- Phrase finder (pure; no Thymer APIs) ---------------------------------------------------------------------------

const SD_NUM_WORDS = {
	bir: 1, iki: 2, 'üç': 3, 'dört': 4, 'beş': 5, 'altı': 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yirmi: 20, otuz: 30,
	a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30,
};
const SD_NUM = '(\\d{1,3}|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|an?|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty)';
const SD_MONTHS = [
	['ocak', 'january', 'jan'], ['şubat', 'february', 'feb'], ['mart', 'march', 'mar'], ['nisan', 'april', 'apr'],
	['mayıs', 'may', 'may'], ['haziran', 'june', 'jun'], ['temmuz', 'july', 'jul'], ['ağustos', 'august', 'aug'],
	['eylül', 'september', 'sep'], ['ekim', 'october', 'oct'], ['kasım', 'november', 'nov'], ['aralık', 'december', 'dec'],
];
/** Lookup key for a matched word: lowercase, ı as i (the regexes let ı match i, for text typed without Turkish letters). */
function sdKey(s) {
	return String(s).toLowerCase().replace(/ı/g, 'i').replace(/^sept$/, 'sep');
}
const SD_MONTH_IDX = new Map();
SD_MONTHS.forEach((names, i) => names.forEach((n) => SD_MONTH_IDX.set(sdKey(n), i)));
const SD_MONTH = '(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)';
const SD_WEEKDAYS_SRC = {
	pazartesi: 'monday', 'salı': 'tuesday', 'çarşamba': 'wednesday', 'perşembe': 'thursday', cuma: 'friday', cumartesi: 'saturday', pazar: 'sunday',
	monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday', thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday',
};
const SD_WEEKDAYS = Object.fromEntries(Object.entries(SD_WEEKDAYS_SRC).map(([k, v]) => [sdKey(k), v]));
// Turkish case endings a day word may carry ("yarına", "cumadan", "pazartesi günü").
const SD_TR_SUF = "(?:['’]?(?:ya|ye|yı|yi|da|de|ta|te|dan|den|tan|ten|ki|kü|nın|nin|ın|in|a|e|ı|i|u|ü)(?![\\p{L}\\p{N}]))?";
const SD_APOS_SUF = "(?:['’]\\p{L}{1,4})?";
// after an hour the ending is often typed without the apostrophe: "9da", "5te"
const SD_TIME_SUF = "(?:['’]?(?:da|de|ta|te|dan|den|tan|ten|a|e|ya|ye))?";
// part of day -> hour
const SD_TOD = {
	sabah: 9, 'öğle': 12, 'öğlen': 12, 'öğleyin': 12, 'öğleden önce': 10, 'öğleden sonra': 15, 'akşam': 19, gece: 22,
	morning: 9, noon: 12, afternoon: 15, evening: 19, night: 22, midnight: 0,
};
const SD_TOD_RE = '(sabah|öğleden önce|öğleden sonra|öğleyin|öğlen|öğle|akşam|gece|morning|noon|afternoon|evening|night|midnight)';

function sdNum(s) {
	if (/^\d+$/.test(s)) return Number(s);
	return SD_NUM_WORDS[s] ?? null;
}

/** A regex from a source written in lowercase Turkish: ı also matches i/I (text is lowercased without İ first). */
function sdRe(src) {
	return new RegExp('(?<![\\p{L}\\p{N}])' + src.replace(/ı/g, '[ıi]') + '(?![\\p{L}\\p{N}])', 'giu');
}

/** 24h hour from a typed hour, am/pm and part of day. A bare 1-6 means the afternoon ("saat 5" is 17:00). */
function sdHour(h, mer, tod) {
	if (h > 23) return null;
	if (mer === 'pm' && h < 12) return h + 12;
	if (mer === 'am') return h === 12 ? 0 : h;
	if (tod) {
		if (['akşam', 'evening', 'öğleden sonra', 'afternoon'].includes(tod)) return h < 12 ? h + 12 : h;
		if (['gece', 'night'].includes(tod)) return h >= 7 && h < 12 ? h + 12 : h === 12 ? 0 : h;
		return h;
	}
	if (h >= 1 && h <= 6) return h + 12;
	return h;
}

function sdMer(s) {
	if (!s) return null;
	return s[0].toLowerCase() === 'p' ? 'pm' : 'am';
}

/**
 * Day rules: each match gives { day: English for Thymer's parser, precise: a single day that can take a time } or
 * { abs: a Date with a time }. `now` is passed in so tests can fix it.
 */
function sdDayRules(now) {
	const y = now.getFullYear(), mo = now.getMonth();
	const monStr = (i, year) => `${SD_MONTHS[i][2]} ${year}`;
	const qual = (q) => {
		if (!q) return '';
		if (/^(geçen|last|previous)/.test(q)) return 'last';
		if (/^(bu|this)/.test(q)) return '';
		return 'next';
	};
	const unitAgo = (n, unit, past) => {
		const rel = (u) => `${n} ${u}${n === 1 ? '' : 's'} ${past ? 'ago' : 'from now'}`;
		if (/^(gün|day)/.test(unit)) return { day: rel('day'), precise: true };
		if (/^(hafta|week)/.test(unit)) return { day: rel('week') };
		if (/^(ay|month)/.test(unit)) return { day: rel('month') };
		if (/^(yıl|sene|year)/.test(unit)) return { day: String(y + (past ? -n : n)) };
		const ms = /^(saat|hour)/.test(unit) ? 3600e3 : 60e3;
		return { abs: new Date(now.getTime() + (past ? -1 : 1) * n * ms) };
	};
	const daySuffix = SD_TR_SUF;
	return [
		// 15.12.2025, 15/12/2025 (day first), 2025-12-15
		[sdRe('(\\d{1,2})[./](\\d{1,2})[./](\\d{4})' + SD_APOS_SUF), (m) => {
			const d = +m[1], mm = +m[2];
			if (d < 1 || d > 31 || mm < 1 || mm > 12) return null;
			return { day: `${m[3]}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`, precise: true };
		}],
		[sdRe('(\\d{4})-(\\d{2})-(\\d{2})'), (m) => ({ day: `${m[1]}-${m[2]}-${m[3]}`, precise: true })],
		// 15 aralık 2025, 15 aralık, 15th of december, december 15(th)(, 2025)
		[sdRe('(\\d{1,2})(?:st|nd|rd|th|\\.)?\\s+(?:of\\s+)?' + SD_MONTH + '(?:\\s+(\\d{4}))?' + SD_APOS_SUF), (m) => {
			const i = SD_MONTH_IDX.get(sdKey(m[2]));
			if (i === undefined || +m[1] < 1 || +m[1] > 31) return null;
			return { day: `${+m[1]} ${SD_MONTHS[i][2]}${m[3] ? ' ' + m[3] : ''}`, precise: true };
		}],
		[sdRe(SD_MONTH + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?'), (m) => {
			const i = SD_MONTH_IDX.get(sdKey(m[1]));
			if (i === undefined || +m[2] < 1 || +m[2] > 31) return null;
			return { day: `${SD_MONTHS[i][2]} ${+m[2]}${m[3] ? ' ' + m[3] : ''}`, precise: true };
		}],
		// geçen sene aralık, gelecek yıl mart, last year december
		[sdRe('(geçen|gelecek|önümüzdeki|bu|last|next|this)\\s+(sene|yıl|year)(?:ın|in|nin)?\\s+' + SD_MONTH + SD_TR_SUF), (m) => {
			const i = SD_MONTH_IDX.get(sdKey(m[3]));
			if (i === undefined) return null;
			const q = qual(m[1].toLowerCase());
			return { day: monStr(i, q === 'last' ? y - 1 : q === 'next' ? y + 1 : y) };
		}],
		// aralık 2025
		[sdRe(SD_MONTH + '\\s+(\\d{4})' + SD_APOS_SUF), (m) => {
			const i = SD_MONTH_IDX.get(sdKey(m[1]));
			return i === undefined ? null : { day: monStr(i, +m[2]) };
		}],
		// geçen aralık, gelecek mart, last december, next march (a bare month is too often a plain word: "may", "ekim")
		[sdRe('(geçen|gelecek|önümüzdeki|bu|last|next|this)\\s+' + SD_MONTH + SD_TR_SUF), (m) => {
			const i = SD_MONTH_IDX.get(sdKey(m[2]));
			if (i === undefined) return null;
			const q = qual(m[1].toLowerCase());
			const year = q === 'last' ? (i < mo ? y : y - 1) : q === 'next' ? (i > mo ? y : y + 1) : y;
			return { day: monStr(i, year) };
		}],
		// 2 gün önce, üç gün sonra, 3 days ago, three days after, 2 hafta sonra, 2 saat sonra
		[sdRe(SD_NUM + '\\s+(gün|hafta|ay|yıl|sene|saat|dakika|days?|weeks?|months?|years?|hours?|minutes?)\\s+(önce|sonra|evvel|ago|later|after|before|from now)'), (m) => {
			const n = sdNum(m[1].toLowerCase());
			if (!n) return null;
			const unit = m[2].toLowerCase();
			if (/^(ay|saat)$/.test(unit) && /^(an?)$/i.test(m[1])) return null;
			return unitAgo(n, unit, /^(önce|evvel|ago|before)$/i.test(m[3]));
		}],
		// in 3 days, in two weeks
		[sdRe('in\\s+' + SD_NUM + '\\s+(days?|weeks?|months?|years?|hours?|minutes?)'), (m) => {
			const n = sdNum(m[1].toLowerCase());
			return n ? unitAgo(n, m[2].toLowerCase(), false) : null;
		}],
		// yarım saat sonra, half an hour later
		[sdRe('(yarım saat sonra|half an hour later|in half an hour)'), () => ({ abs: new Date(now.getTime() + 30 * 60e3) })],
		// geçen hafta, gelecek ay, bu yıl, next week, last month
		[sdRe('(geçen|gelecek|önümüzdeki|bu|bir sonraki|last|next|this)\\s+(hafta|ay|yıl|sene|week|month|year)' + SD_TR_SUF), (m) => {
			const q = qual(m[1].toLowerCase());
			const unit = m[2].toLowerCase();
			if (/^(yıl|sene|year)$/.test(unit)) return { day: String(q === 'last' ? y - 1 : q === 'next' ? y + 1 : y) };
			if (/^(ay|month)$/.test(unit)) {
				const d = new Date(y, mo + (q === 'last' ? -1 : q === 'next' ? 1 : 0), 1);
				return { day: monStr(d.getMonth(), d.getFullYear()) };
			}
			return { day: `${q || 'this'} week` };
		}],
		// haftaya salı, gelecek cuma, geçen pazartesi, bu perşembe, next friday, monday
		[sdRe('(?:(geçen|gelecek|önümüzdeki|haftaya|bu|bir sonraki|last|next|this|coming)\\s+)?(pazartesi|salı|çarşamba|perşembe|cumartesi|cuma|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(\\s+günü)?' + daySuffix), (m) => {
			const wd = SD_WEEKDAYS[sdKey(m[2])];
			if (!wd) return null;
			// "pazar" is also a market, "cuma" a prayer: alone they need a qualifier or "günü".
			if (/^(pazar|cuma)$/i.test(m[2]) && !m[1] && !m[3]) return null;
			const q = m[1] ? qual(m[1].toLowerCase()) : '';
			return { day: (q ? q + ' ' : '') + wd, precise: true };
		}],
		// haftaya, seneye
		[sdRe('(haftaya|seneye|gelecek seneye)'), (m) => (/hafta/.test(m[1]) ? { day: 'next week' } : { day: String(y + 1) })],
		// öbür gün, yarından sonra, day after tomorrow; evvelsi gün, önceki gün, day before yesterday
		[sdRe('(öbür ?gün|yarından sonra|(?:the\\s+)?day after tomorrow)' + daySuffix), () => ({ day: '2 days from now', precise: true })],
		[sdRe('(evvelsi gün|evvelki gün|dünden önceki gün|(?:the\\s+)?day before yesterday)' + daySuffix), () => ({ day: '2 days ago', precise: true })],
		[sdRe('(ertesi gün|(?:the\\s+)?next day)'), () => ({ day: 'tomorrow', precise: true })],
		// bugün, yarın, dün (with their endings only, so "dünya" is not "dün"), today, tomorrow, yesterday, tonight
		[sdRe('(bugün(?:kü|ü|e|den|ün)?|yarın(?:ki|a|dan|ı)?|dün(?:kü|den|e)?|today|tomorrow|yesterday)'), (m) => {
			const w = m[1].toLowerCase();
			if (/^(bugün|today)/.test(w)) return { day: 'today', precise: true };
			if (/^(yar|tomorrow)/.test(w)) return { day: 'tomorrow', precise: true };
			return { day: 'yesterday', precise: true };
		}],
		[sdRe('(tonight|bu gece)'), () => ({ day: 'today', precise: true, time: { h: 22, m: 0 } })],
		[sdRe('(bu sabah|this morning)'), () => ({ day: 'today', precise: true, time: { h: 9, m: 0 } })],
		[sdRe('(bu akşam|this evening)'), () => ({ day: 'today', precise: true, time: { h: 19, m: 0 } })],
		[sdRe('(bu öğleden sonra|this afternoon)'), () => ({ day: 'today', precise: true, time: { h: 15, m: 0 } })],
	];
}

/** Time rules: each match gives { time: { h, m } } or { tod } (a part of day, a time only next to a day). */
function sdTimeRules() {
	const t = (h, m) => (h === null || m > 59 ? null : { time: { h, m } });
	return [
		// akşam saat 7, sabah 9'da, gece 11:30
		[sdRe(SD_TOD_RE + '\\s+(?:saat\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?' + SD_TIME_SUF), (m) => t(sdHour(+m[2], null, m[1].toLowerCase()), +(m[3] || 0))],
		// saat 5, saat 17:30'da, saat 5 buçukta
		[sdRe('saat\\s+(\\d{1,2})(?:[:.](\\d{2}))?(\\s+buçuk)?' + SD_TIME_SUF), (m) => t(sdHour(+m[1], null, null), m[3] ? 30 : +(m[2] || 0))],
		// 3pm, 3:30 pm, at 5, at 17:30
		[sdRe('(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s?(am|pm|a\\.m\\.|p\\.m\\.)'), (m) => t(sdHour(+m[1], sdMer(m[3]), null), +(m[2] || 0))],
		[sdRe('at\\s+(\\d{1,2})(?::(\\d{2}))?(?!\\s?(?:am|pm|%|\\.\\d))'), (m) => t(sdHour(+m[1], null, null), +(m[2] || 0))],
		// 17:30 (a colon is needed: "17.30" could be a number)
		[sdRe('(\\d{1,2}):(\\d{2})' + SD_TIME_SUF), (m) => t(+m[1] < 24 ? +m[1] : null, +m[2])],
		[sdRe('(noon|midnight|öğlen|öğleyin)'), (m) => t(SD_TOD[m[1].toLowerCase()], 0)],
		// a part of day: a time only right after a day ("yarın sabah", "monday evening")
		[sdRe(SD_TOD_RE), (m) => ({ tod: m[1].toLowerCase() })],
	];
}

function sdCollect(text, rules, kind) {
	const out = [];
	for (const [re, fn] of rules) {
		re.lastIndex = 0;
		for (const m of text.matchAll(re)) {
			let r = null;
			try { r = fn(m); } catch (e) { r = null; }
			if (r) out.push({ s: m.index, e: m.index + m[0].length, kind, ...r });
		}
	}
	return out;
}

/** Longest first, then leftmost: the matches that do not overlap. */
function sdPick(cands) {
	const sorted = [...cands].sort((a, b) => (b.e - b.s) - (a.e - a.s) || a.s - b.s);
	const taken = [];
	for (const c of sorted) {
		if (taken.some((t) => c.s < t.e && t.s < c.e)) continue;
		taken.push(c);
	}
	return taken.sort((a, b) => a.s - b.s);
}

/**
 * The date phrases in `text`: [{ s, e, day?, time?, abs? }] in order, a day and a time next to each other joined
 * ("yarın saat 5", "tomorrow at 3pm", "monday evening"). A part of day alone ("akşam") is not a date.
 */
function sdFind(text, now = new Date()) {
	const src = String(text || '').replace(/İ/g, 'i'); // same length; İ.toLowerCase() would add a character
	const days = sdPick(sdCollect(src, sdDayRules(now), 'day'));
	const times = sdPick(sdCollect(src, sdTimeRules(), 'time')).filter((t) => !days.some((d) => t.s < d.e && d.s < t.e));
	const all = [...days, ...times].sort((a, b) => a.s - b.s);
	const out = [];
	for (let i = 0; i < all.length; i++) {
		const a = all[i], b = all[i + 1];
		const gap = b ? src.slice(a.e, b.s) : '';
		const joinable = b && /^\s*(?:,\s*|at\s+|@\s*|saat\s+)?$/i.test(gap) && /^[\s,]*(?:at|@|saat)?\s*$/i.test(gap);
		if (a.kind === 'day' && b?.kind === 'time' && a.precise && !a.time && joinable) {
			const time = b.time || { h: SD_TOD[b.tod], m: 0 };
			out.push({ s: a.s, e: b.e, day: a.day, time, text: src.slice(a.s, b.e) });
			i++;
			continue;
		}
		if (a.kind === 'time' && b?.kind === 'day' && b.precise && !b.time && a.time && /^\s+$/.test(gap)) {
			out.push({ s: a.s, e: b.e, day: b.day, time: a.time, text: src.slice(a.s, b.e) });
			i++;
			continue;
		}
		if (a.kind === 'time' && !a.time) continue; // "akşam" alone
		out.push({ s: a.s, e: a.e, day: a.day || null, time: a.time || null, abs: a.abs || null, text: src.slice(a.s, a.e) });
	}
	return out;
}


// ---- Thymer side ------------------------------------------------------------------------------------------------------

/** The DateTimeValue for a found phrase, through Thymer's own parser; null when it cannot read it. */
function sdValue(m) {
	try {
		let dt = null;
		if (m.abs) {
			const d = m.abs;
			dt = DateTime.dateAndTime(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0);
		} else if (m.day) {
			dt = DateTime.parseDateTimeString(m.day);
			if (dt && m.time) dt.setTime(m.time.h, m.time.m);
		} else if (m.time) {
			dt = DateTime.timeOnly(m.time.h, m.time.m);
		}
		return dt ? dt.value() : null;
	} catch (e) {
		return null;
	}
}

function sdDetectDark() {
	const root = document.documentElement;
	if (root.classList.contains('basic-dark') || root.classList.contains('is-dark')) return true;
	if (root.classList.contains('basic-light') || root.classList.contains('is-light')) return false;
	const dt = (root.getAttribute('data-theme') || '').toLowerCase();
	if (dt.includes('light')) return false;
	if (dt.includes('dark')) return true;
	return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
}

/** Thymer's caret (a layer of its own, not the DOM selection); the visible one in the focused editor. */
function sdCaretEl() {
	let best = null, bestScore = -1;
	for (const n of document.querySelectorAll('div.listview-caret-self')) {
		if (n.classList.contains('caret-inactive')) continue;
		const b = n.getBoundingClientRect();
		if (!(b.height > 0.5)) continue;
		const score = (n.closest('listview-editor') ? 2 : 0) + (n.closest('.panel.focused-panel, .panel.has-focus') ? 1 : 0);
		if (score > bestScore) { bestScore = score; best = n; }
	}
	return best;
}

/** The editor row the caret is on: the row under the caret's middle. */
function sdCaretRow() {
	if (!document.hasFocus()) return null;
	const caret = sdCaretEl();
	const ed = caret?.closest('listview-editor') || null;
	if (!caret || !ed) return null;
	const b = caret.getBoundingClientRect();
	const y = b.top + b.height / 2;
	for (const row of [...ed.querySelectorAll('.listitem[data-guid]')].reverse()) {
		const line = row.querySelector(':scope > .line-div');
		const r = line?.getBoundingClientRect();
		if (r && r.height > 0 && y >= r.top - 2 && y <= r.bottom + 2) return row;
	}
	return null;
}

// Text inside these is not prose: date tags already made, references, code, links, tags, mentions.
const SD_SKIP_SEL = '.lineitem-datetime, .lineitem-date, .lineitem-time, .lineitem-ref, .lineitem-code, code, .lineitem-link, .lineitem-linkobj, .lineitem-hashtag, .lineitem-mention, line-button';
const SD_LINE_TYPES = new Set(['text', 'task', 'ulist', 'olist', 'heading', 'quote']);

class Plugin extends AppPlugin {
	onLoad() {
		this.enabled = this.getConfiguration()?.custom?.enabled !== false;
		this.typed = new Set();          // lines typed in here: the only ones changed
		this.dirty = new Map();          // line guid -> record guid, saved and waiting for the caret to leave
		this.ownWrite = new Map();       // line guid -> when this plugin last rewrote it
		this.converted = new Map();      // line guid -> phrases turned into tags there (put back as text: left alone)
		this.pollTimer = 0;
		this.hl = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function' ? new Highlight() : null;
		if (this.hl) CSS.highlights.set('sd-date', this.hl);
		this.applyPolarity();

		// Thymer redraws a line's text after the input event, which empties ranges made before that,
		// so the underline is laid again after the editor's DOM changes that follow typing.
		let raf = 0;
		const schedule = () => {
			if (!this.enabled || raf) return;
			raf = requestAnimationFrame(() => { raf = 0; this.markCaretLine(); });
		};
		this.lastInput = 0;
		this.lastPaste = 0;
		this.onInput = () => { this.lastInput = Date.now(); schedule(); };
		document.addEventListener('input', this.onInput, true);
		// A paste sends no input event; the lines it makes or changes count as typed.
		this.onPaste = () => {
			this.lastPaste = this.lastInput = Date.now();
			schedule();
			setTimeout(() => this.markCaretLine(), 300);
		};
		document.addEventListener('paste', this.onPaste, true);
		this.editMo = new MutationObserver(() => {
			if (Date.now() - this.lastInput < 1000) this.markCaretLine();
		});
		this.editMo.observe(document.body, { subtree: true, childList: true, characterData: true });
		this.themeMo = new MutationObserver(() => this.applyPolarity());
		this.themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

		const onLine = (ev) => {
			const g = ev?.lineItemGuid;
			if (!this.enabled || !g || !ev.source?.isLocal) return;
			if (!this.typed.has(g)) {
				if (Date.now() - this.lastPaste > 3000) return;
				this.typed.add(g);
			}
			if (Date.now() - (this.ownWrite.get(g) || 0) < 1500) return;
			this.dirty.set(g, ev.recordGuid || this.dirty.get(g) || null);
			this.startPoll();
		};
		this.eventIds = [
			this.events.on('lineitem.updated', onLine, { collection: '*' }),
			this.events.on('lineitem.created', onLine, { collection: '*' }),
		];

		this.ui.addCommandPaletteCommand({
			label: 'Smart Dates: turn on/off', icon: 'ti-calendar-bolt',
			onSelected: () => this.setEnabled(!this.enabled),
		});
		this.ui.addCommandPaletteCommand({
			label: 'Smart Dates: turn dates in the current line into tags now', icon: 'ti-calendar-event',
			onSelected: () => this.convertCaretLine(),
		});
	}

	onUnload() {
		clearInterval(this.pollTimer);
		for (const id of this.eventIds || []) this.events.off(id);
		document.removeEventListener('input', this.onInput, true);
		document.removeEventListener('paste', this.onPaste, true);
		this.themeMo?.disconnect();
		this.editMo?.disconnect();
		if (this.hl) CSS.highlights.delete('sd-date');
		document.body?.classList.remove('sd-light');
	}

	applyPolarity() {
		document.body?.classList.toggle('sd-light', !sdDetectDark());
	}

	async setEnabled(on) {
		this.enabled = on;
		if (!on) {
			this.hl?.clear();
			this.dirty.clear();
		}
		this.ui.addToaster?.({ title: 'Smart Dates', message: on ? 'On' : 'Off', dismissible: true, autoDestroyTime: 1400 });
		try {
			const api = this.data.getPluginByGuid(this.getGuid());
			const conf = api.getConfiguration();
			await api.saveConfiguration({ ...conf, custom: { ...(conf.custom || {}), enabled: on } });
		} catch (e) { /* stays for this session */ }
	}

	/** Underlines the date phrases of the line being typed in, and remembers that line as typed in. */
	markCaretLine() {
		const row = sdCaretRow();
		this.hl?.clear();
		if (!row || row.closest('.block-codelang')) return;
		const guid = row.getAttribute('data-guid');
		this.typed.add(guid);
		if (this.typed.size > 2000) this.typed.delete(this.typed.values().next().value);
		if (!this.hl) return;
		const line = row.querySelector(':scope > .line-div');
		if (!line) return;
		const skip = this.converted.get(guid);
		const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, {
			acceptNode: (t) => (t.parentElement?.closest(SD_SKIP_SEL) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
		});
		for (let t = walk.nextNode(); t; t = walk.nextNode()) {
			for (const m of sdFind(t.nodeValue)) {
				if (skip?.has(sdKey(m.text))) continue;
				const r = document.createRange();
				r.setStart(t, m.s);
				r.setEnd(t, m.e);
				this.hl.add(r);
			}
		}
	}

	startPoll() {
		if (this.pollTimer) return;
		this.pollTimer = setInterval(() => this.flush(), 700);
	}

	/** Rewrites the saved lines the caret has left. */
	async flush() {
		if (this.flushing) return;
		if (!this.dirty.size) {
			clearInterval(this.pollTimer);
			this.pollTimer = 0;
			return;
		}
		this.flushing = true;
		try {
			const caretGuid = sdCaretRow()?.getAttribute('data-guid') || null;
			for (const [guid, recGuid] of [...this.dirty]) {
				if (guid === caretGuid) continue;
				this.dirty.delete(guid);
				await this.convertLine(guid, recGuid);
			}
			if (caretGuid && !this.dirty.has(caretGuid)) this.markCaretLine();
		} finally {
			this.flushing = false;
		}
	}

	async findItem(guid, recGuid) {
		const recs = [];
		if (recGuid) recs.push(this.data.getRecord(recGuid));
		const active = this.ui.getActivePanel?.()?.getActiveRecord?.();
		if (active) recs.push(active);
		for (const rec of recs) {
			if (!rec?.getLineItems) continue;
			try {
				const items = await rec.getLineItems(true);
				const hit = items?.find((it) => it?.guid === guid);
				if (hit) return hit;
			} catch (e) { /* next */ }
		}
		return null;
	}

	/** Replaces the date phrases in the line's plain text segments with datetime segments. */
	async convertLine(guid, recGuid) {
		const item = await this.findItem(guid, recGuid);
		if (!item || !SD_LINE_TYPES.has(item.type) || !Array.isArray(item.segments)) return false;
		const skip = this.converted.get(guid) || new Set();
		const out = [];
		const done = [];
		for (const seg of item.segments) {
			if (seg?.type !== 'text' || typeof seg.text !== 'string') { out.push(seg); continue; }
			let at = 0;
			for (const m of sdFind(seg.text)) {
				const key = sdKey(m.text);
				if (skip.has(key)) continue;
				const value = sdValue(m);
				if (!value) continue;
				if (m.s > at) out.push({ type: 'text', text: seg.text.slice(at, m.s) });
				out.push({ type: 'datetime', text: value });
				done.push(key);
				at = m.e;
			}
			if (at < seg.text.length) out.push(at ? { type: 'text', text: seg.text.slice(at) } : seg);
		}
		if (!done.length) return false;
		this.ownWrite.set(guid, Date.now());
		const ok = await item.setSegments(out);
		if (ok) {
			for (const k of done) skip.add(k);
			this.converted.set(guid, skip);
		}
		return ok;
	}

	async convertCaretLine() {
		const row = sdCaretRow();
		const guid = row?.getAttribute('data-guid');
		if (!guid) {
			this.ui.addToaster?.({ title: 'Smart Dates', message: 'Put the caret in a line first', dismissible: true, autoDestroyTime: 1800 });
			return;
		}
		this.dirty.delete(guid);
		this.converted.delete(guid); // asked for by name: tags put back as text are turned again too
		const rec = this.ui.getActivePanel?.()?.getActiveRecord?.()?.guid || null;
		const ok = await this.convertLine(guid, rec);
		if (!ok) this.ui.addToaster?.({ title: 'Smart Dates', message: 'No date found in this line', dismissible: true, autoDestroyTime: 1800 });
	}
}
