/**
 * Calendar Plus - Thymer's date picker, with the days that changed coloured in and a Today button.
 *
 * Thymer has one date picker (the journal's "Try: monday, 7 days, aug 1" popup, dates in properties and in the editor);
 * the plugin adds to it wherever it opens:
 *
 *   - The days are tiles that fill the grid (not small numbers far apart), and a day on which something changed in the
 *     workspace is tinted in the accent colour, deeper the more changed; pointing at it says how much.
 *   - A Today button between the header's arrows (in place of Thymer's dot, which only showed this month) brings the
 *     calendar to this month and picks today, the same as a click on today's tile.
 *
 * What changed when is read the way the Home plugin reads it: each page counts on the day it was made, each line on the
 * day it was written and the day it was last changed. It is read once a little after Thymer starts and again when a
 * calendar opens and the last read is older than CACHE_MS; a calendar that is open when a read ends is coloured in then.
 *
 * HOW IT WORKS
 *   The SDK has no hook for the date picker, so one MutationObserver watches the page for it: a new .datepicker-calendar
 *   gets the Today button, and every time Thymer draws the days (it rebuilds .datepicker-days on each month change and
 *   selection), the new .day elements are tinted from their data-date. Picking a day is always Thymer's own click on its
 *   .day element, so what a pick does (in the journal, a property, the editor) stays Thymer's.
 */

const CACHE_MS = 120000;   // the workspace is read again when a calendar opens after this long
const FIRST_READ_MS = 4000;   // the first read waits for Thymer to settle
// A day's score (a page made = 2, a line written or changed = 1) to its tint level, 1 to 4.
const LEVELS = [1, 3, 10, 30];

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const levelOf = (n) => LEVELS.reduce((lv, min, i) => (n >= min ? i + 1 : lv), 0);

class Plugin extends AppPlugin {
	onLoad() {
		this.activity = null;   // { days: { 'yyyy-mm-dd': score }, at }
		this.loading = null;
		this.cleanup = [];

		const mo = new MutationObserver((muts) => {
			for (const m of muts) {
				if (m.target.classList?.contains('datepicker-days')) { this.paint(m.target); continue; }
				for (const n of m.addedNodes) {
					if (n.nodeType !== 1) continue;
					const cals = n.classList.contains('datepicker-calendar') ? [n] : n.querySelectorAll?.('.datepicker-calendar') || [];
					for (const cal of cals) this.enhance(cal);
				}
			}
		});
		mo.observe(document.body, { childList: true, subtree: true });
		this.cleanup.push(() => mo.disconnect());
		document.querySelectorAll('.datepicker-calendar').forEach((cal) => this.enhance(cal));

		const t = setTimeout(() => this.load(), FIRST_READ_MS);
		this.cleanup.push(() => clearTimeout(t));
	}

	onUnload() {
		this.cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
		this.cleanup = [];
		document.querySelectorAll('.cp-today').forEach((b) => b.remove());
		document.querySelectorAll('.datepicker-calendar.cp-on').forEach((c) => c.classList.remove('cp-on'));
		document.querySelectorAll('.day[data-cp-level]').forEach((d) => { d.removeAttribute('data-cp-level'); d.removeAttribute('title'); });
	}

	/** Gives a calendar its Today button and tints its days; reads the workspace again if the last read is old. */
	enhance(cal) {
		if (cal.classList.contains('cp-on')) return;
		cal.classList.add('cp-on');
		const dot = cal.querySelector('.go-to-today');
		if (dot) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'cp-today';
			btn.textContent = 'Today';
			btn.addEventListener('mousedown', (e) => e.preventDefault());   // keep the focus where it is (the popup's input)
			btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.today(cal); });
			dot.before(btn);   // where the dot was: between the arrows
		}
		const days = cal.querySelector('.datepicker-days');
		if (days) this.paint(days);
		if (!this.activity || Date.now() - this.activity.at > CACHE_MS) this.load();
	}

	/** This month, and today picked: Thymer's own dot (which only turns to this month), then a click on today's tile. */
	today(cal) {
		cal.querySelector('.go-to-today')?.click();
		const day = cal.querySelector('.datepicker-days .day.today');
		if (day && !day.classList.contains('selected')) day.click();   // a click on the picked day would unpick it
	}

	/**
	 * Tints the days of one drawn month from the scores. Thymer always draws six weeks; a week at the end that is all next
	 * month is hidden, and the number of weeks left (data-cp-rows) sizes the tiles, since the journal's popup gives the
	 * calendar a fixed height.
	 */
	paint(days) {
		const all = [...days.querySelectorAll('.day')];
		let rows = Math.ceil(all.length / 7);
		while (rows > 1 && all.slice((rows - 1) * 7, rows * 7).every((el) => el.classList.contains('next-month'))) rows--;
		all.forEach((el, i) => el.classList.toggle('cp-hidden', i >= rows * 7));
		if (days.dataset.cpRows !== String(rows)) days.dataset.cpRows = String(rows);

		const scores = this.activity?.days;
		for (const el of all) {
			const n = scores?.[el.dataset.date] || 0, lv = el.classList.contains('disabled') ? 0 : levelOf(n);
			if (lv) {
				if (el.dataset.cpLevel !== String(lv)) el.dataset.cpLevel = String(lv);
				el.title = n === 1 ? '1 change' : `${n.toLocaleString('en-US')} changes`;
			} else if (el.dataset.cpLevel) {
				el.removeAttribute('data-cp-level');
				el.removeAttribute('title');
			}
		}
	}

	repaintAll() {
		document.querySelectorAll('.datepicker-calendar.cp-on .datepicker-days').forEach((d) => this.paint(d));
	}

	// ---- What changed when -----------------------------------------------------------------------------------------------

	/** Reads the workspace: a score per day. Calendars open when it ends are tinted again. */
	load() {
		if (this.loading) return this.loading;
		this.loading = (async () => {
			const days = {}, add = (date, n) => { if (!date) return; const k = dayKey(date); days[k] = (days[k] || 0) + n; };
			let cols = [];
			try { cols = await this.data.getAllCollections(); } catch (e) { /* none */ }
			for (const col of cols) {
				let recs = [];
				try { recs = await col.getAllRecords(); } catch (e) { continue; }
				for (const rec of recs) add(rec.getCreatedAt?.(), 2);
				for (let i = 0; i < recs.length; i += 8) {   // each page's lines: on the day written, and the day last changed
					await Promise.all(recs.slice(i, i + 8).map(async (rec) => {
						let lines = [];
						try { lines = await rec.getLineItems(); } catch (e) { return; }
						for (const ln of lines) {
							const made = ln.getCreatedAt?.(), changed = ln.getUpdatedAt?.();
							add(made, 1);
							if (changed && (!made || dayKey(changed) !== dayKey(made))) add(changed, 1);
						}
					}));
				}
			}
			this.activity = { days, at: Date.now() };
			this.loading = null;
			this.repaintAll();
			return this.activity;
		})();
		return this.loading;
	}
}
