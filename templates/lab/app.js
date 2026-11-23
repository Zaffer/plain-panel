// @ts-check
// Experiments: the store, the setup form, and one bind() call.
//
// The training server (sim.js) owns the runs. Its snapshots are the only
// writer of `lab`. The browser owns the next run's setup, and which curves
// show in which colour.
/** @typedef {import('./sim.js').Config} Config */
/** @typedef {import('./sim.js').Run} Run */
/** @typedef {import('./sim.js').Snapshot} Snapshot */
/** @template T @typedef {import('plain-panel').Signal<T>} Signal */
import { signal, computed, effect, batch, untracked, bind, panel, task, download } from 'plain-panel';
import { createLab } from './sim.js';
import { createChart } from './chart.js';

const EPOCH_S = 0.25; // the sim trains one epoch in 250 ms
const PALETTE = ['#2e86de', '#e4572e', '#17a589', '#a569bd', '#d4ac0d', '#7f8c8d'];

// ---------- the server's state: one snapshot ----------
const lab = signal(/** @type {Snapshot} */ ({ paused: false, runs: [] }));

// ---------- the browser's state for each run ----------
/** @type {Map<string, { show: Signal<boolean>, color: Signal<string> }>} */
const client = new Map();
const entry = (/** @type {string} */ id) => /** @type {{ show: Signal<boolean>, color: Signal<string> }} */ (client.get(id));

const server = createLab({
  onSnapshot(s) {
    for (const r of s.runs) {
      if (!client.has(r.id)) client.set(r.id, { show: signal(true), color: signal(PALETTE[client.size % PALETTE.length]) });
    }
    for (const id of client.keys()) if (!s.runs.some((r) => r.id === id)) client.delete(id);
    lab(s);
  },
});

// ---------- the next run: the setup form writes these ----------
/** @type {Config} */
const DEFAULTS = { lr: 0.001, batch: 64, epochs: 30, optimizer: 'adam', dropout: 0.2, width: 256, augment: true, seed: 1 };
const form = {
  name: signal('run-1'),
  lr: signal(DEFAULTS.lr),
  batch: signal(DEFAULTS.batch),
  epochs: signal(DEFAULTS.epochs),
  optimizer: signal(DEFAULTS.optimizer),
  dropout: signal(DEFAULTS.dropout),
  width: signal(DEFAULTS.width),
  augment: signal(DEFAULTS.augment),
  seed: signal(DEFAULTS.seed),
  color: signal(PALETTE[0]),
};
/** @type {() => Config} */
const config = computed(() => ({
  lr: form.lr(), batch: form.batch(), epochs: form.epochs(), optimizer: form.optimizer(),
  dropout: form.dropout(), width: form.width(), augment: form.augment(), seed: form.seed(),
}));
/** @param {Config} c */
function loadConfig(c) {
  batch(() => {
    form.lr(c.lr);
    form.batch(c.batch);
    form.epochs(c.epochs);
    form.optimizer(c.optimizer);
    form.dropout(c.dropout);
    form.width(c.width);
    form.augment(c.augment);
    form.seed(c.seed);
  });
}
/** 'run-3' becomes 'run-4'; 'baseline' becomes 'baseline-2' @param {string} name */
const nextName = (name) => {
  const m = name.match(/^(.*?)(\d+)$/);
  return m ? m[1] + (Number(m[2]) + 1) : name + '-2';
};

const ui = {
  page: signal('curves'),
  metric: signal(/** @type {'val' | 'train' | 'acc'} */ ('val')),
  inspect: signal(''), // the id of the run on the inspect page
  theme: signal(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  noCss: signal(false), // turns the stylesheet off: the page should still work (DESIGN.md §1)
};

// ---------- requests to the server: each one is a task ----------
const tasks = {
  submit: task(async () => {
    const name = form.name();
    const id = await server.submit(name, config());
    batch(() => {
      entry(id).color(form.color());
      // ready the next run: a fresh name and the next colour
      form.name(nextName(name));
      form.color(PALETTE[(PALETTE.indexOf(form.color()) + 1) % PALETTE.length]);
    });
    return id;
  }),
  cancel: task((/** @type {string} */ id) => server.cancel(id)),
  pause: task(() => server.pause()),
  resume: task(() => server.resume()),
  remove: task((/** @type {string[]} */ ids) => server.remove(ids)),
};

// ---------- views ----------
const runs = computed(() => lab().runs);
const current = computed(() => runs().find((r) => r.status === 'running'));
const queued = computed(() => runs().filter((r) => r.status === 'queued').length);
const finished = computed(() => runs().filter((r) => r.status === 'done' || r.status === 'failed' || r.status === 'cancelled'));
const inspected = computed(() => runs().find((r) => r.id === ui.inspect()));
const STATUS = { queued: '⏳ queued', running: '▶️ running', done: '✅ done', failed: '❌ failed', cancelled: '⏹️ cancelled' };
/** @param {Run} r */
const progressOf = (r) => `epoch ${r.history.length} / ${r.config.epochs}`;
/** @param {Run} r */
const seconds = (r) => (r.started ? `${(((r.ended || Date.now()) - r.started) / 1000).toFixed(1)} s` : '—');

const views = {
  queueLabel: computed(() => {
    const r = current();
    const more = queued() ? `, ${queued()} queued` : '';
    if (lab().paused) return `⏸️ paused${r ? `: ${r.name} at ${progressOf(r)}` : ''}${more}`;
    if (!r) return queued() ? `⏳ starting…${more}` : 'idle: the queue is empty';
    const left = (r.config.epochs - r.history.length) * EPOCH_S;
    return `▶️ ${r.name}: ${progressOf(r)}, about ${left.toFixed(0)} s left${more}`;
  }),
  progress: computed(() => {
    const r = current();
    return r ? r.history.length / r.config.epochs : 0;
  }),
  pauseLocked: computed(() => lab().paused || tasks.pause.pending() || (!current() && !queued())),
  resumeLocked: computed(() => !lab().paused || tasks.resume.pending()),
  cancelLocked: computed(() => !current() || tasks.cancel.pending()),
  queueNote: computed(() => {
    if (tasks.pause.pending()) return '⏳ pausing…';
    if (tasks.resume.pending()) return '⏳ resuming…';
    if (tasks.cancel.pending()) return '⏳ cancelling…';
    const error = tasks.pause.error() || tasks.resume.error() || tasks.cancel.error();
    return error ? `❌ ${error}` : '';
  }),
  cancelText: computed(() => {
    const r = current();
    return r ? `${r.name} at ${progressOf(r)}` : '';
  }),
  pageCurves: computed(() => ui.page() === 'curves'),
  pageRuns: computed(() => ui.page() === 'runs'),
  pageInspect: computed(() => ui.page() === 'inspect'),
  runCount: computed(() => `(${runs().length})`),
  noRuns: computed(() => runs().length === 0),
  rows: computed(() =>
    runs().map((r) => {
      const vals = r.history.map((e) => e.val).filter(Number.isFinite);
      const last = r.history.at(-1);
      return {
        id: r.id,
        name: r.name,
        status: STATUS[r.status],
        error: r.error,
        epoch: `${r.history.length} / ${r.config.epochs}`,
        best: vals.length ? Math.min(...vals).toFixed(3) : '—',
        acc: last && Number.isFinite(last.val) ? `${(last.acc * 100).toFixed(1)} %` : '—',
        time: seconds(r),
        show: entry(r.id).show,
        inspect: () => batch(() => {
          ui.inspect(r.id);
          ui.page('inspect');
        }),
      };
    })),
  noFinished: computed(() => finished().length === 0 || tasks.remove.pending()),
  finishedCount: computed(() => finished().length),
  removeNote: computed(() => (tasks.remove.pending() ? '⏳ deleting…' : tasks.remove.error() && `❌ ${tasks.remove.error()}`)),
  eta: computed(() => `about ${(form.epochs() * EPOCH_S).toFixed(0)} s` + (current() || queued() ? ', after the queue' : '')),
  submitNote: computed(() => {
    if (tasks.submit.pending()) return '⏳ queuing…';
    if (tasks.submit.error()) return `❌ ${tasks.submit.error()}`;
    return tasks.submit.status() === 'done' ? `✅ queued as ${tasks.submit.result() && runs().find((r) => r.id === tasks.submit.result())?.name}` : '';
  }),
  formJson: computed(() => JSON.stringify({ name: form.name(), ...config() }, null, 1)),
  hasInspect: computed(() => !!inspected()),
  noInspect: computed(() => !inspected()),
  inspectTitle: computed(() => {
    const r = inspected();
    return r ? `${r.name}: ${STATUS[r.status]}, ${progressOf(r)}` : '';
  }),
  inspectJson: computed(() => {
    const r = inspected();
    if (!r) return '';
    const vals = r.history.map((e) => e.val).filter(Number.isFinite);
    return JSON.stringify({
      config: r.config,
      best_val_loss: vals.length ? +Math.min(...vals).toFixed(4) : null,
      last_epoch: r.history.at(-1) ?? null,
      error: r.error || undefined,
    }, null, 1);
  }),
};

// ---------- actions ----------
const actions = {
  submit: () => tasks.submit.run(),
  defaults: () => loadConfig(DEFAULTS),
  pause: () => tasks.pause.run(),
  resume: () => tasks.resume.run(),
  cancel() {
    const r = untracked(() => current());
    if (r) tasks.cancel.run(r.id);
  },
  deleteFinished: () => tasks.remove.run(untracked(() => finished()).map((r) => r.id)),
  reuse() {
    const r = untracked(() => inspected());
    if (r) loadConfig(r.config);
  },
  downloadRun() {
    const r = untracked(() => inspected());
    if (r) download(`${r.name}.json`, r);
  },
};

// ---------- the setup form, made by the panel builder ----------
const p = panel('settings', { parent: /** @type {Element} */ (document.getElementById('setupBox')) });
p.text('name', form.name);
p.select('learning rate', form.lr, [1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2].map((v) => ({ value: v, label: v.toExponential(0) })));
p.select('optimizer', form.optimizer, [{ value: 'adam', label: 'Adam' }, { value: 'adamw', label: 'AdamW' }, { value: 'sgd', label: 'SGD + momentum' }]);
p.select('batch size', form.batch, [16, 32, 64, 128, 256]);
p.number('epochs', form.epochs, { min: 1, max: 200, step: 1 });
p.slider('dropout', form.dropout, { min: 0, max: 0.5, step: 0.05, format: (v) => v.toFixed(2) });
const more = p.folder('more settings', false);
more.number('hidden width', form.width, { min: 16, max: 2048, step: 16 });
more.toggle('augment the data', form.augment);
more.number('seed', form.seed, { min: 0, max: 99999, step: 1 });
more.color('curve colour', form.color);
p.add(/** @type {Element} */ (document.getElementById('formJson')));
p.readout('time', views.eta);
p.button('▶️ queue run', actions.submit, { disabled: tasks.submit.pending });
p.button('🔄 defaults', actions.defaults);
p.readout('', views.submitNote);

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

// ---------- the chart: one effect pushes the shown curves in ----------
const chart = createChart(/** @type {HTMLCanvasElement} */ (document.getElementById('chart')));
effect(() => {
  ui.theme(); // read first: redraw in the new ink on a theme flip
  const metric = ui.metric();
  const shown = runs().filter((r) => entry(r.id).show());
  const lines = shown.map((r) => ({ data: r.history.map((e) => e[metric]), color: entry(r.id).color(), label: r.name }));
  chart.draw(lines, { length: Math.max(2, ...shown.map((r) => r.config.epochs)), digits: 2 });
});

bind(document.body, { ui, views, actions });
