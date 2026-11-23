// @ts-check
// The bench: the store, and one bind() call. Plain JS, no build step.
//
// The source (sim.js) owns the truth: only its callbacks write `running` and
// `sample`. Everything on screen is computed from the store. Commands go to
// the source as tasks, so each one shows pending and failure on screen.
/** @typedef {import('./sim.js').Sample} Sample */
/** @typedef {import('./sim.js').Wave} Wave */
/** @typedef {import('./sim.js').Stats} Stats */
import { signal, computed, effect, batch, untracked, bind, panel, series, task, download } from 'plain-panel';
import { createSource } from './sim.js';
import { createChart } from './chart.js';

// ---------- the source's state: written only by its callbacks ----------
const running = signal(false);
const sample = signal(/** @type {Sample | null} */ (null));
const SPAN = 400; // samples on the chart: 20 s at 20 Hz
const trace = series(SPAN);

// ---------- the operator's state ----------
const DEFAULTS = { wave: /** @type {Wave} */ ('sine'), freq: 0.5, amp: 1, noise: 0.05, color: '#2e86de' };
const params = {
  wave: signal(DEFAULTS.wave),
  freq: signal(DEFAULTS.freq),
  amp: signal(DEFAULTS.amp),
  noise: signal(DEFAULTS.noise),
  color: signal(DEFAULTS.color),
};
const ui = {
  side: signal(true), // the side bar is open
  bottom: signal(true), // the bottom panel is open
  sideTab: signal('source'),
  mainTab: signal('chart'),
  bottomTab: signal('log'),
  seconds: signal(2), // how long a measurement takes
  textOpen: signal(true), // the first <details> of the controls view
  theme: signal(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  noCss: signal(false), // turns the stylesheet off: the page should still work
};
// one signal for each control in the controls view
const g = {
  text: signal('plain'),
  search: signal(''),
  tel: signal(''),
  url: signal(''),
  email: signal(''),
  password: signal(''),
  combo: signal('/dev/ttyUSB0'),
  notes: signal(''),
  number: signal(40),
  range: signal(60),
  date: signal(''),
  time: signal(''),
  datetime: signal(''),
  month: signal(''),
  week: signal(''),
  checkbox: signal(true),
  switch: signal(false),
  radio: signal('a'),
  select: signal('115200'),
  many: signal(['x', 'z']),
  files: signal(/** @type {File[]} */ ([])),
  color: signal('#e4572e'),
};
// region sizes, px: the operator drags the gaps (see actions.rzDown)
const SIZES = { side: 300, bottom: 200 };
const layout = { side: signal(SIZES.side), bottom: signal(SIZES.bottom) };

const now = signal(Date.now()); // a clock, so the age of the data stays true
setInterval(() => now(Date.now()), 100);

// ---------- captures: one row for each finished measurement ----------
/** @typedef {Stats & { id: number, time: string, wave: Wave, freq: number }} Capture */
const captures = signal(/** @type {Capture[]} */ ([]));
let captureId = 0;
const measuring = signal({ at: 0, ms: 1 }); // when the measurement in progress began, and its length

// ---------- the log, newest first ----------
/** @typedef {'info' | 'warn' | 'error'} Level */
/** @typedef {{ id: number, time: string, mark: string, text: string }} LogLine */
const log = signal(/** @type {LogLine[]} */ ([]));
let logId = 0;
const MARK = { info: 'ℹ️', warn: '⚠️', error: '❌' };
const clock = () => new Date().toLocaleTimeString([], { hour12: false });
/** @param {Level} level @param {string} text */
function note(level, text) {
  log([{ id: ++logId, time: clock(), mark: MARK[level], text }, ...untracked(() => log())].slice(0, 200));
}

// ---------- the source ----------
const source = createSource({
  onSample(s) {
    batch(() => {
      sample(s);
      trace.push(s.value);
    });
  },
  onState(on) {
    if (on === untracked(() => running())) return; // stopping a stopped source: nothing happened
    batch(() => {
      running(on);
      if (!on) {
        sample(null);
        trace.push(null); // a gap in the chart, not a frozen line
      }
    });
    note('info', on ? 'the source is running' : 'the source stopped');
  },
});
// the settings go to the source whenever one changes
effect(() => source.set({ wave: params.wave(), freq: params.freq(), amp: params.amp(), noise: params.noise() }));

// ---------- commands: each one is a task, so pending and failure show ----------
const tasks = {
  start: task(() => source.start()),
  measure: task(async (/** @type {number} */ seconds) => {
    measuring({ at: Date.now(), ms: seconds * 1000 });
    const stats = await source.measure(seconds);
    const row = { ...stats, id: ++captureId, time: clock(), wave: untracked(() => params.wave()), freq: untracked(() => params.freq()) };
    captures([row, ...untracked(() => captures())]);
    note('info', `measured: mean ${volts(stats.mean)}, RMS ${volts(stats.rms)}`);
    return stats;
  }),
};
// a failed command also goes in the log
for (const [name, t] of Object.entries(tasks)) {
  effect(() => {
    const error = t.error();
    if (error) untracked(() => note('error', `${name}: ${error}`));
  });
}

// ---------- views: everything the screen shows, computed ----------
/** A value with a sign, three decimals and its unit: the width never changes. @param {number} v */
const volts = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(3)} V`;
/** True while a tab signal holds this value: one for each page. @param {() => string} tab @param {string} value */
const is = (tab, value) => computed(() => tab() === value);
const stale = computed(() => {
  const s = sample();
  return running() && (!s || now() - s.t > 500);
});

const views = {
  side: { source: is(ui.sideTab, 'source'), controls: is(ui.sideTab, 'controls'), builder: is(ui.sideTab, 'builder') },
  main: { chart: is(ui.mainTab, 'chart'), captures: is(ui.mainTab, 'captures') },
  bottom: { log: is(ui.bottomTab, 'log'), store: is(ui.bottomTab, 'store') },
  // a handle shows only while there is something to drag
  sideHandle: computed(() => ui.side() && !ui.noCss()),
  bottomHandle: computed(() => ui.bottom() && !ui.noCss()),

  liveLabel: computed(() => {
    if (tasks.start.pending()) return '⏳ starting…';
    if (!running()) return '⚪ stopped';
    const s = sample();
    if (stale()) return s ? `🟡 stale ${((now() - s.t) / 1000).toFixed(1)} s` : '🟡 no data';
    return '🟢 live';
  }),
  value: computed(() => {
    const s = sample();
    return s ? volts(s.value) : '—';
  }),
  level: computed(() => sample()?.value ?? 0),
  startLocked: computed(() => running() || tasks.start.pending()),

  freq: computed(() => `${params.freq().toFixed(1)} Hz`),
  amp: computed(() => `${params.amp().toFixed(2)} V`),
  over: computed(() => params.amp() > 2),

  measureLocked: computed(() => !running() || tasks.measure.pending()),
  measureNote: computed(() => {
    const status = tasks.measure.status();
    if (status === 'pending') return '⏳ measuring…';
    if (status === 'failed') return `❌ ${tasks.measure.error()}`;
    const stats = tasks.measure.result();
    return status === 'done' && stats ? `✅ mean ${volts(stats.mean)}` : '';
  }),
  progress: computed(() => {
    if (!tasks.measure.pending()) return 0;
    const { at, ms } = measuring();
    return Math.min(1, (now() - at) / ms);
  }),

  rows: computed(() =>
    captures().map((c) => ({
      id: c.id,
      time: c.time,
      signal: `${c.wave} ${c.freq.toFixed(1)} Hz`,
      n: c.n,
      mean: volts(c.mean),
      rms: volts(c.rms),
      min: volts(c.min),
      max: volts(c.max),
    })),
  ),
  captureCount: computed(() => captures().length),
  noCaptures: computed(() => captures().length === 0),

  fileNames: computed(() => g.files().map((f) => f.name).join(', ') || 'none'),
  lastLog: computed(() => {
    const line = log()[0];
    return line ? `${line.time} ${line.mark} ${line.text}` : '';
  }),
  // the operator's side of the store, as text: move any control and watch it change
  json: computed(() => {
    /** @param {Record<string, () => unknown>} group */
    const plain = (group) => Object.fromEntries(Object.entries(group).map(([key, read]) => [key, read()]));
    const state = {
      running: running(),
      tasks: { start: tasks.start.status(), measure: tasks.measure.status() },
      params: plain(params),
      ui: plain(ui),
      layout: plain(layout),
      g: plain(g),
      captures: captures().length,
    };
    return JSON.stringify(state, (_key, v) => (v instanceof File ? `File: ${v.name}` : v), 1);
  }),
};

// ---------- the layout: the operator drags the gaps between the regions ----------
// Region sizes are state like any other. Effects write them into CSS custom
// properties: the one place script touches style. The CSS caps both at half
// the window, so a small window needs no script.
/** @typedef {'side' | 'bottom'} Handle */
const rootStyle = document.documentElement.style;
effect(() => rootStyle.setProperty('--side', `${layout.side()}px`));
effect(() => rootStyle.setProperty('--bottom', `${layout.bottom()}px`));
const LEAST = { side: 140, bottom: 56 };
/** The same cap as the CSS. @param {Handle} which */
const most = (which) => (which === 'side' ? innerWidth : innerHeight) / 2;
/** The size a region has on screen now. @param {Handle} which */
const sizeNow = (which) => Math.min(untracked(() => layout[which]()), most(which));
/** Grows a region by d px from a size. @param {Handle} which @param {number} from @param {number} d */
function resize(which, from, d) {
  layout[which](Math.round(Math.min(most(which), Math.max(LEAST[which], from + d))));
}
/** @type {{ which: Handle, at: number, from: number } | null} */
let drag = null; // the gesture in progress: transient, nothing renders from it

// ---------- actions: what the controls do ----------
const actions = {
  start: () => tasks.start.run(),
  stop: () => source.stop(),
  measure: () => tasks.measure.run(ui.seconds()),
  reset() {
    batch(() => {
      params.wave(DEFAULTS.wave);
      params.freq(DEFAULTS.freq);
      params.amp(DEFAULTS.amp);
      params.noise(DEFAULTS.noise);
      params.color(DEFAULTS.color);
    });
  },
  /**
   * A click on a view's symbol in the activity bar. A new view opens the side
   * bar; the view that is already open closes it, as in an IDE. The click
   * comes before the radio's input event, so ui.sideTab still holds the view
   * that was chosen before the click.
   * @param {Event} e
   */
  pickView(e) {
    const same = /** @type {HTMLInputElement} */ (e.currentTarget).value === ui.sideTab();
    ui.side(same ? !ui.side() : true);
  },
  resetLayout() {
    batch(() => {
      layout.side(SIZES.side);
      layout.bottom(SIZES.bottom);
      ui.side(true);
      ui.bottom(true);
    });
  },
  downloadCsv() {
    const head = 'time,wave,freq_hz,samples,mean_v,rms_v,min_v,max_v';
    const lines = captures().map((c) =>
      [c.time, c.wave, c.freq, c.n, c.mean.toFixed(4), c.rms.toFixed(4), c.min.toFixed(4), c.max.toFixed(4)].join(','));
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '');
    download(`bench-${stamp}.csv`, [head, ...lines].join('\n'), 'text/csv');
  },
  deleteCaptures() {
    captures([]);
    note('warn', 'the captures were deleted');
  },
  // resizing: pointer capture keeps the whole drag on the handle, so three
  // listeners cover the gesture; each move is one layout write. The side bar
  // grows to the right, the bottom panel grows upward.
  /** @param {PointerEvent} e */
  rzDown(e) {
    const el = /** @type {HTMLElement} */ (e.currentTarget);
    el.setPointerCapture(e.pointerId);
    const which = /** @type {Handle} */ (el.dataset.rz);
    drag = { which, at: which === 'side' ? e.clientX : -e.clientY, from: sizeNow(which) };
    e.preventDefault();
  },
  /** @param {PointerEvent} e */
  rzMove(e) {
    if (drag) resize(drag.which, drag.from, (drag.which === 'side' ? e.clientX : -e.clientY) - drag.at);
  },
  rzUp() {
    drag = null;
  },
  /** Arrow keys move a focused handle 16 px, 64 px with Shift. @param {KeyboardEvent} e */
  rzKey(e) {
    const which = /** @type {Handle} */ (/** @type {HTMLElement} */ (e.currentTarget).dataset.rz);
    const step = e.shiftKey ? 64 : 16;
    /** @type {Record<string, number>} */
    const keys = which === 'side' ? { ArrowLeft: -step, ArrowRight: step } : { ArrowDown: -step, ArrowUp: step };
    if (!(e.key in keys)) return;
    e.preventDefault();
    resize(which, sizeNow(which), keys[e.key]);
  },
};

// ---------- page chrome: theme and no CSS ----------
// The theme is the color-scheme meta tag: it flips the browser's own palette,
// and the panel paint follows through light-dark().
const scheme = /** @type {HTMLMetaElement} */ (document.querySelector('meta[name=color-scheme]'));
effect(() => {
  scheme.content = ui.theme();
});
effect(() => {
  const off = ui.noCss();
  for (const el of document.querySelectorAll('style')) el.disabled = off;
});

// ---------- the chart: an imperative module, data pushed in by one effect ----------
const chart = createChart(/** @type {HTMLCanvasElement} */ (document.getElementById('chart')));
effect(() => {
  if (!views.main.chart()) return; // a hidden page is not drawn
  ui.theme(); // read, so a theme flip redraws the axis text in the new ink
  chart.draw([{ data: trace.read(), color: params.color() }], { unit: 'V', digits: 2, length: SPAN });
});

// ---------- the builder view: the same store, drawn by panel() ----------
const built = panel('signal', { parent: /** @type {HTMLElement} */ (document.getElementById('builder')) });
built
  .select('wave', params.wave, ['sine', 'square', 'saw', 'random'], { disabled: tasks.measure.pending })
  .slider('frequency', params.freq, { min: 0.1, max: 2, step: 0.1, format: (v) => `${v.toFixed(1)} Hz`, disabled: tasks.measure.pending })
  .slider('amplitude', params.amp, { min: 0, max: 3, step: 0.05, format: (v) => `${v.toFixed(2)} V`, disabled: tasks.measure.pending })
  .number('noise', params.noise, { min: 0, max: 1, step: 0.05, disabled: tasks.measure.pending })
  .color('trace colour', params.color)
  .readout('value', views.value)
  .button('▶️ measure', actions.measure, { disabled: views.measureLocked })
  .button('🔄 reset', actions.reset, { disabled: tasks.measure.pending });
const shell = built.folder('shell', false);
shell.toggle('side bar', ui.side).toggle('bottom panel', ui.bottom).text('text, from the controls view', g.text);

bind(document.body, { params, ui, g, tasks, views, actions, log });
note('info', 'ready: press ▶️ start');
