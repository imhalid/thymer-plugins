/**
 * HUD Sounds
 *
 * Short synthesized sounds for what happens in Thymer, from Spaceship IDE's sound engine and sound board
 * (github.com/chuanqisun/spaceship, src/text/sound, MIT, Chuanqi Sun): the hand clicks (filtered-noise transients), the app
 * answers in FM blips, a settled state ends on a plain sine; pitches share one E-major pentatonic scale. Every sound is panned
 * to where it happens on screen.
 *
 *   a task done            two notes resolving upward        another status       a click and a note of its own
 *   a task undone          two falling clicks                a new line           a soft click
 *   lines deleted          two falling clicks                a page opened        a hand-off
 *   command palette opens  a double click and a pip          / or @ menu opens    an FM blip
 *   moving in a menu       a tick, its pitch by the row      picking a row        a latch and two notes
 *   a menu closed unpicked two falling clicks
 *
 * Nothing is loaded: every sound is built from oscillators and noise in Web Audio, and the nodes are freed when it ends.
 * On and off is per device (localStorage); the volume is the config's custom.volume (0 to 1).
 */

// ---- The engine (Spaceship's engine.ts, in plain JS) ---------------------------------------------------------------------
const HS_MAX_VOICES = 48;
const HS_PAN_WIDTH = 0.85;
const HS_REVERB_SECONDS = 0.9;
const HS_NOISE_SECONDS = 2;
const HS_SILENCE = 1e-4;
const HS_CUT_SECONDS = 0.012;
const HS_OFF_KEY = 'hud-sounds:off';
const HS_SILENT = { stop() {} };

function hsEngine(volume) {
	let graph = null, unlocking = false, voices = 0;
	let on = localStorage.getItem(HS_OFF_KEY) !== '1';

	const build = () => {
		const context = new AudioContext({ latencyHint: 'interactive' });
		const master = new GainNode(context, { gain: volume });
		const limiter = new DynamicsCompressorNode(context, { threshold: -14, knee: 6, ratio: 6, attack: 0.001, release: 0.08 });
		const reverb = new ConvolverNode(context, { buffer: room(context) });
		master.connect(limiter).connect(context.destination);
		reverb.connect(master);
		return { context, master, reverb, noise: noise(context) };
	};
	const noise = (context) => {
		const b = context.createBuffer(1, context.sampleRate * HS_NOISE_SECONDS, context.sampleRate), s = b.getChannelData(0);
		for (let i = 0; i < s.length; i++) s[i] = Math.random() * 2 - 1;
		return b;
	};
	const room = (context) => {   // a small dark room: decaying noise whose highs die faster than its lows
		const length = Math.floor(context.sampleRate * HS_REVERB_SECONDS), b = context.createBuffer(2, length, context.sampleRate);
		for (let ch = 0; ch < 2; ch++) {
			const s = b.getChannelData(ch);
			let smoothed = 0;
			for (let i = 0; i < length; i++) {
				const p = i / length;
				smoothed += (Math.random() * 2 - 1 - smoothed) * (0.9 - 0.75 * p);
				s[i] = smoothed * (1 - p) ** 3;
			}
		}
		return b;
	};
	const unlock = () => {   // browsers only let a gesture start audio
		if (!graph || !on || graph.context.state === 'running') return;
		unlocking = true;
		graph.context.resume().finally(() => { unlocking = false; });
	};
	const playable = () => graph && on && (graph.context.state === 'running' || unlocking) && voices < HS_MAX_VOICES;

	/** One voice: a tone (FM when `index` is set) or filtered noise (when `filter` is set); attack, hold, then an exponential decay. */
	const start = (v) => {
		if (voices >= HS_MAX_VOICES) return null;
		const { context, master, reverb } = graph;
		const { f, to, filter, delay = 0, attack = filter ? 0.001 : 0.002, hold = 0, decay, gain, pan = 0, wet = 0 } = v;
		const t0 = context.currentTime + delay, end = t0 + attack + hold + decay;
		const nodes = [], sources = [];
		const add = (n) => (nodes.push(n), n);
		let head;
		if (filter) {
			const src = add(new AudioBufferSourceNode(context, { buffer: graph.noise }));
			const shaper = add(new BiquadFilterNode(context, { type: filter, Q: v.q ?? 2 }));
			shaper.frequency.setValueAtTime(f, t0);
			if (to) shaper.frequency.exponentialRampToValueAtTime(to, t0 + (v.glide ?? end - t0));
			src.connect(shaper);
			sources.push(src);
			head = shaper;
		} else {
			const carrier = add(new OscillatorNode(context, { type: v.wave ?? 'sine' }));
			carrier.frequency.setValueAtTime(f, t0);
			const glideEnd = t0 + (v.glide ?? end - t0);
			if (to) carrier.frequency.exponentialRampToValueAtTime(to, glideEnd);
			if (v.index) {
				const ratio = v.ratio ?? 3.01, dev = v.index * f * ratio;
				const mod = add(new OscillatorNode(context, { frequency: f * ratio })), depth = add(new GainNode(context));
				depth.gain.setValueAtTime(dev, t0);
				depth.gain.exponentialRampToValueAtTime(dev * 0.1 + 1, end);
				if (to) mod.frequency.exponentialRampToValueAtTime(to * ratio, glideEnd);
				mod.connect(depth).connect(carrier.frequency);
				sources.push(mod);
			}
			if (v.lfoRate && v.lfoDepth) {
				const lfo = add(new OscillatorNode(context, { type: 'square', frequency: v.lfoRate }));
				lfo.connect(add(new GainNode(context, { gain: v.lfoDepth }))).connect(carrier.frequency);
				sources.push(lfo);
			}
			sources.push(carrier);
			head = carrier;
		}
		const level = add(new GainNode(context, { gain: 0 }));
		level.gain.setValueAtTime(0, t0);
		level.gain.linearRampToValueAtTime(gain, t0 + attack);
		if (hold) level.gain.setValueAtTime(gain, t0 + attack + hold);
		level.gain.exponentialRampToValueAtTime(HS_SILENCE, end);
		const panner = add(new StereoPannerNode(context, { pan: Math.max(-1, Math.min(1, pan)) * HS_PAN_WIDTH }));
		head.connect(level).connect(panner).connect(master);
		if (wet > 0) panner.connect(add(new GainNode(context, { gain: wet }))).connect(reverb);
		for (const s of sources) {
			if (s instanceof AudioBufferSourceNode) s.start(t0, Math.random() * (HS_NOISE_SECONDS - 0.5));
			else s.start(t0);
			s.stop(end + 0.02);
		}
		voices++;
		sources[sources.length - 1].onended = () => { voices--; for (const n of nodes) n.disconnect(); };
		return {
			stop() {
				const now = context.currentTime;
				level.gain.cancelAndHoldAtTime(now);
				level.gain.setTargetAtTime(0, now, HS_CUT_SECONDS);
				for (const s of sources) s.stop(Math.max(now, t0) + HS_CUT_SECONDS * 6);
			},
		};
	};
	const safely = (run) => { try { return run(); } catch (e) { console.error(e); return null; } };

	if (typeof AudioContext !== 'undefined') graph = build();
	for (const t of ['pointerdown', 'keydown']) window.addEventListener(t, unlock, true);

	return {
		isOn: () => on,
		setOn(next) {
			on = next;
			try { localStorage.setItem(HS_OFF_KEY, next ? '0' : '1'); } catch (e) { /* this session only */ }
			if (next) unlock(); else graph?.context.suspend();
		},
		play(list) {
			if (!playable()) return HS_SILENT;
			const started = list.map((v) => safely(() => start(v))).filter(Boolean);
			return { stop: () => started.forEach((s) => safely(() => s.stop())) };
		},
		close() {
			for (const t of ['pointerdown', 'keydown']) window.removeEventListener(t, unlock, true);
			graph?.context.close();
			graph = null;
		},
	};
}

// ---- The sounds (Spaceship's sound board, given Thymer's events) ---------------------------------------------------------
const HS_PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
/** note(0) = E4, note(5) = E5, note(10) = E6, note(15) = E7. */
const hsNote = (d) => 329.63 * 2 ** Math.floor(d / 5) * HS_PENTATONIC[((d % 5) + 5) % 5];
const hsClick = (f, gain, more = {}) => ({ filter: 'bandpass', f, q: 3, decay: 0.005, gain, ...more });
const HS_STATUS_DEGREE = { started: 7, waiting: 6, important: 11, alert: 12, starred: 13, discuss: 8, billable: 9, canceled: 3 };

function hsSounds(engine) {
	const at = (pan, list) => engine.play(list.map((v) => ({ pan, ...v })));
	const latch = (pan, a, b, g) => at(pan, [hsClick(a, g[0]), hsClick(b, g[1], { delay: 0.012 })]);
	return {
		/** A task is done: two notes resolving upward (Spaceship's pin). */
		done: (p) => at(p, [hsClick(2400, 0.18), { f: hsNote(13), attack: 0.003, decay: 0.1, gain: 0.06, delay: 0.02 }, { f: hsNote(15), attack: 0.003, decay: 0.3, gain: 0.07, wet: 0.2, delay: 0.09 }]),
		/** Another status: a click and the status's own note. */
		status: (p, s) => at(p, [hsClick(2400, 0.12, { decay: 0.003 }), { f: hsNote(HS_STATUS_DEGREE[s] ?? 8), decay: 0.04, gain: 0.06 }]),
		/** Undone, deleted, or a menu closed unpicked. */
		remove: (p) => at(p, [{ filter: 'highpass', f: 5000, decay: 0.006, gain: 0.16 }, { filter: 'highpass', f: 3500, decay: 0.006, gain: 0.1, delay: 0.04 }]),
		/** A new line: the quietest click. */
		line: (p) => at(p, [hsClick(2800, 0.12, { decay: 0.004 })]),
		/** The command palette opens (Spaceship's spawn). */
		open: (p) => at(p, [{ filter: 'highpass', f: 5000, decay: 0.006, gain: 0.16 }, { filter: 'highpass', f: 5000, decay: 0.006, gain: 0.16, delay: 0.045 }, { f: hsNote(12), decay: 0.03, gain: 0.05, delay: 0.045 }]),
		/** A / or @ menu opens: an FM blip. */
		menu: (p) => at(p, [{ f: hsNote(15), index: 2, decay: 0.06, gain: 0.06 }]),
		/** The selection moves to the `i`th row of a menu. */
		move: (p, i) => at(p, [hsClick(2400, 0.1, { decay: 0.003 }), { f: hsNote(5 + (i % 8) * 2), decay: 0.02, gain: 0.04 }]),
		/** A row is picked (Spaceship's take). */
		pick: (p) => at(p, [hsClick(1800, 0.26), hsClick(3000, 0.18, { delay: 0.01 }), { f: hsNote(10), decay: 0.04, gain: 0.07, delay: 0.015 }, { f: hsNote(14), decay: 0.08, gain: 0.06, delay: 0.05 }]),
		/** Another page is opened (Spaceship's hand-off). */
		page: (p) => at(p, [hsClick(3000, 0.16), hsClick(2000, 0.2, { delay: 0.012 }), { f: hsNote(10), index: 1.2, decay: 0.04, gain: 0.05, delay: 0.04 }]),
		latch: (p) => latch(p, 2200, 3200, [0.3, 0.2]),
	};
}

/** Screen x mapped to stereo position. */
const hsPanAt = (x) => Math.max(-1, Math.min(1, (x / Math.max(1, innerWidth)) * 2 - 1));
const hsPanOf = (el) => { const r = el?.getBoundingClientRect?.(); return r && r.width ? hsPanAt(r.left + r.width / 2) : 0; };
/** Where the caret is, for sounds of the line being written. */
function hsCaretPan() {
	for (const n of document.querySelectorAll('div.listview-caret-self')) {
		const r = n.getBoundingClientRect();
		if (r.height > 0.5 && !n.classList.contains('caret-inactive')) return hsPanAt(r.left);
	}
	return 0;
}

class Plugin extends AppPlugin {
	onLoad() {
		const vol = Number(this.getConfiguration()?.custom?.volume);
		this.engine = hsEngine(Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 0.7);
		this.s = hsSounds(this.engine);
		this.last = new Map();   // sound name -> when it last played, so a burst (a paste, a multi-line delete) is one sound
		const play = (name, ...args) => {
			const now = performance.now();
			if (now - (this.last.get(name) || 0) < 70) return;
			this.last.set(name, now);
			this.s[name](...args);
		};
		this.play = play;

		// Lines and tasks: only this device's own changes, never a sync from elsewhere
		const local = (ev) => ev?.source?.isLocal;
		this.eventIds = [
			this.events.on('lineitem.updated', (ev) => {
				if (!local(ev) || !ev.status) return;
				if (ev.status === 'done') play('done', hsCaretPan());
				else if (ev.status === 'none') play('remove', hsCaretPan());
				else play('status', hsCaretPan(), ev.status);
			}, { collection: '*' }),
			this.events.on('lineitem.created', (ev) => { if (local(ev)) play('line', hsCaretPan()); }, { collection: '*' }),
			this.events.on('lineitem.deleted', (ev) => { if (local(ev)) play('remove', hsCaretPan()); }, { collection: '*' }),
			this.events.on('panel.navigated', (ev) => {
				if (ev?.source && ev.source.isLocal === false) return;
				play('page', hsPanOf(this.ui.getActivePanel?.()?.getElement?.()));
			}),
		];

		// Menus: the command palette, the / and @ menus, and moving and picking in them
		this.menus = new Set();
		this.picked = false;
		this.mo = new MutationObserver((records) => {
			for (const r of records) {
				for (const n of r.addedNodes) {
					if (n.nodeType !== 1) continue;
					for (const el of [n, ...n.querySelectorAll('.cmdpal--dialog, .cmdpal--inline')]) {
						if (!el.classList?.contains('cmdpal--dialog') && !el.classList?.contains('cmdpal--inline')) continue;
						if (this.menus.has(el)) continue;
						this.menus.add(el);
						this.picked = false;
						requestAnimationFrame(() => play(el.classList.contains('cmdpal--dialog') ? 'open' : 'menu', hsPanOf(el)));
					}
				}
			}
			for (const el of [...this.menus]) {
				if (el.isConnected && el.getBoundingClientRect().height > 0) continue;
				this.menus.delete(el);
				if (!this.picked) play('remove', hsPanOf(el));
			}
		});
		this.mo.observe(document.body, { childList: true, subtree: true });

		const openMenu = () => [...this.menus].find((m) => m.isConnected && m.getBoundingClientRect().height > 0);
		this.onKey = (e) => {
			const m = openMenu();
			if (!m) return;
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				requestAnimationFrame(() => {
					const rows = [...m.querySelectorAll('.autocomplete--option')];
					const i = rows.findIndex((r) => r.classList.contains('autocomplete--option-selected'));
					play('move', hsPanOf(m), Math.max(0, i));
				});
			} else if (e.key === 'Enter' || e.key === 'Tab') {
				this.picked = true;
				play('pick', hsPanOf(m));
			}
		};
		document.addEventListener('keydown', this.onKey, true);
		this.onPick = (e) => {
			const m = openMenu();
			if (m && e.target?.closest?.('.autocomplete--option') && m.contains(e.target)) { this.picked = true; play('pick', hsPanOf(m)); }
		};
		document.addEventListener('pointerdown', this.onPick, true);

		this.ui.addCommandPaletteCommand({
			label: 'HUD Sounds: turn on/off', icon: 'ti-headphones',
			onSelected: () => {
				this.engine.setOn(!this.engine.isOn());
				this.ui.addToaster?.({ title: 'HUD Sounds', message: this.engine.isOn() ? 'On' : 'Off', dismissible: true, autoDestroyTime: 1400 });
				if (this.engine.isOn()) setTimeout(() => this.s.latch(0), 150);
			},
		});
		this.ui.addCommandPaletteCommand({
			label: 'HUD Sounds: play every sound', icon: 'ti-music',
			onSelected: () => {
				const board = [['open', 0], ['move', -0.3, 1], ['move', -0.1, 2], ['move', 0.1, 3], ['pick', 0], ['menu', 0.3], ['line', -0.4], ['status', -0.2, 'started'], ['done', 0], ['remove', 0.2], ['page', 0.5]];
				board.forEach(([name, ...args], i) => setTimeout(() => this.s[name](...args), 700 + i * 450));
			},
		});
	}

	onUnload() {
		for (const id of this.eventIds || []) this.events.off(id);
		this.mo?.disconnect();
		document.removeEventListener('keydown', this.onKey, true);
		document.removeEventListener('pointerdown', this.onPick, true);
		this.engine?.close();
	}
}
