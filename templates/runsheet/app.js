// @ts-check
// Load cell calibration: the store, and one bind() call.
//
// The sheet is the store: every field the operator fills and every reading
// the cell gives. Pass or fail, the locks, and the record are computed from
// it. A draft is kept in localStorage, so a reload loses nothing.
/** @typedef {import('./sim.js').Raw} Raw */
/** @typedef {Raw & { id: number, time: string }} Reading */
/** @typedef {Reading & { mass: number }} SpanReading */
import { signal, computed, effect, batch, untracked, bind, task, download } from 'plain-panel';
import { createCell } from './sim.js';

const cell = createCell();
const DRAFT = 'plain-panel:runsheet'; // the localStorage key

// ---------- the sheet ----------
const BLANK = {
  serial: '',
  operator: '',
  ambient: 21,
  unloaded: false,
  zero: /** @type {Reading | null} */ (null),
  mass: 500,
  massOn: false,
  span: /** @type {SpanReading[]} */ ([]),
  checkMass: 200,
  checkOn: false,
  check: /** @type {Reading | null} */ (null),
  notes: '',
  confirmed: false,
};
const sheet = {
  serial: signal(BLANK.serial),
  operator: signal(BLANK.operator),
  ambient: signal(BLANK.ambient),
  unloaded: signal(BLANK.unloaded),
  zero: signal(BLANK.zero),
  mass: signal(BLANK.mass),
  massOn: signal(BLANK.massOn),
  span: signal(BLANK.span),
  checkMass: signal(BLANK.checkMass),
  checkOn: signal(BLANK.checkOn),
  check: signal(BLANK.check),
  notes: signal(BLANK.notes),
  confirmed: signal(BLANK.confirmed),
};
const photos = signal(/** @type {File[]} */ ([])); // files stay in the browser; the record lists their names
const saved = signal(/** @type {'yes' | 'no'} */ ('yes'));

/** @param {Partial<typeof BLANK>} values */
function load(values) {
  batch(() => {
    for (const [key, s] of Object.entries(sheet)) {
      if (key in values) /** @type {(v: unknown) => void} */ (s)(values[/** @type {keyof typeof BLANK} */ (key)]);
    }
  });
}

// restore the draft, then save every change to it
try {
  const draft = localStorage.getItem(DRAFT);
  if (draft) load(JSON.parse(draft));
} catch {
  saved('no');
}
effect(() => {
  const values = Object.fromEntries(Object.entries(sheet).map(([k, s]) => [k, s()]));
  try {
    localStorage.setItem(DRAFT, JSON.stringify(values));
    untracked(() => saved('yes'));
  } catch {
    untracked(() => saved('no'));
  }
});

let nextId = Math.max(0, ...sheet.span().map((r) => r.id), sheet.zero()?.id ?? 0, sheet.check()?.id ?? 0);
/** Reads the cell and stamps the reading. @returns {Promise<Reading>} */
async function read() {
  const raw = await cell.read();
  return { ...raw, id: ++nextId, time: new Date().toLocaleTimeString([], { hour12: false }) };
}

// ---------- readings: each one is a task, so "reading…" and failures show ----------
const tasks = {
  zero: task(async () => {
    cell.place(0); // sim only
    sheet.zero(await read());
  }),
  span: task(async () => {
    const mass = sheet.mass();
    cell.place(mass); // sim only
    const r = await read();
    sheet.span([...sheet.span(), { ...r, mass }]);
    sheet.massOn(false); // lift it off and put it back before the next reading
  }),
  check: task(async () => {
    cell.place(sheet.checkMass()); // sim only
    sheet.check(await read());
  }),
};

// ---------- the arithmetic ----------
const mean = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (/** @type {number[]} */ xs) => Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1));
/** counts per gram for each span reading */
const scales = computed(() => {
  const z = sheet.zero();
  return z ? sheet.span().map((r) => (r.mean - z.mean) / r.mass) : [];
});
const scale = computed(() => (scales().length ? mean(scales()) : 0));
const repeat = computed(() => (scales().length >= 2 ? (sd(scales()) / scale()) * 100 : Infinity)); // %
const indicated = computed(() => {
  const z = sheet.zero();
  const c = sheet.check();
  return z && c && scale() ? (c.mean - z.mean) / scale() : NaN;
});
const errorPct = computed(() => ((indicated() - sheet.checkMass()) / sheet.checkMass()) * 100);

// ---------- pass or fail, step by step ----------
const ok1 = computed(() => /^TS-\d{4}$/.test(sheet.serial()) && sheet.operator().trim() !== '' && sheet.ambient() >= 10 && sheet.ambient() <= 40);
const ok2 = computed(() => ok1() && !!sheet.zero() && /** @type {Reading} */ (sheet.zero()).sd < 4);
const ok3 = computed(() => ok2() && scales().length >= 3 && repeat() < 0.05);
const ok4 = computed(() => ok3() && Math.abs(errorPct()) < 0.5);
const ok5 = computed(() => ok4() && sheet.confirmed());

/**
 * The views of one step. @param {() => boolean} ok @param {() => boolean} before @param {() => boolean} started
 * @param {Partial<Record<'note' | 'result', () => string>>} [more]
 */
const step = (ok, before, started, more = {}) => ({
  locked: computed(() => !before()),
  label: computed(() => (!before() ? '🔒 locked' : ok() ? '✅ pass' : started() ? 'not yet' : 'to do')),
  note: more.note ?? computed(() => ''),
  result: more.result ?? computed(() => ''),
});
const always = () => true;
const fixed = (/** @type {number} */ v, /** @type {number} */ d, /** @type {string} */ unit) => (Number.isFinite(v) ? `${v.toFixed(d)} ${unit}` : '—');

const views = {
  s1: step(ok1, always, () => sheet.serial() !== '' || sheet.operator() !== '', {
    note: computed(() => {
      const problems = [];
      if (!/^TS-\d{4}$/.test(sheet.serial())) problems.push('the serial looks like TS-0042');
      if (!sheet.operator().trim()) problems.push('enter your name');
      if (!(sheet.ambient() >= 10 && sheet.ambient() <= 40)) problems.push('room temperature must be 10 to 40 °C');
      return problems.length ? `To pass: ${problems.join('; ')}.` : '';
    }),
    result: computed(() => (ok1() ? `${sheet.serial()}, ${sheet.ambient()} °C` : '—')),
  }),
  s2: step(ok2, ok1, () => !!sheet.zero()),
  s3: step(ok3, ok2, () => sheet.span().length > 0),
  s4: step(ok4, ok3, () => !!sheet.check()),
  s5: step(ok5, ok4, () => sheet.confirmed()),
  passed: computed(() => [ok1(), ok2(), ok3(), ok4()].filter(Boolean).length),
  progressLabel: computed(() => `${[ok1(), ok2(), ok3(), ok4()].filter(Boolean).length} of 4 steps pass` + (ok5() ? ', signed off' : '')),
  savedNote: computed(() => (saved() === 'yes' ? '✅ draft saved in this browser' : '⚠️ this browser cannot save a draft: do not reload the page')),
  zeroLocked: computed(() => !sheet.unloaded() || tasks.zero.pending()),
  zeroNote: computed(() => (tasks.zero.pending() ? '⏳ reading… do not touch the stand' : tasks.zero.error() && `❌ ${tasks.zero.error()}`)),
  zero: computed(() => {
    const z = sheet.zero();
    return z ? `${z.mean.toFixed(1)} counts, noise ${z.sd.toFixed(2)} counts, at ${z.time}` : '—';
  }),
  spanLocked: computed(() => !sheet.massOn() || tasks.span.pending() || sheet.span().length >= 5),
  spanNote: computed(() => {
    if (tasks.span.pending()) return '⏳ reading… do not touch the stand';
    if (tasks.span.error()) return `❌ ${tasks.span.error()}`;
    return sheet.span().length >= 5 ? 'five readings: remove one to take another' : '';
  }),
  spanRows: computed(() =>
    sheet.span().map((r, i) => ({
      id: r.id,
      n: i + 1,
      mass: `${r.mass} g`,
      mean: r.mean.toFixed(1),
      scale: scales()[i]?.toFixed(3) ?? '—',
      remove: () => sheet.span(sheet.span().filter((x) => x.id !== r.id)),
    }))),
  scale: computed(() => fixed(scale() || NaN, 3, 'counts/g')),
  repeat: computed(() => (Number.isFinite(repeat()) ? `${repeat().toFixed(3)} %` : '— (needs 2 readings)')),
  checkLocked: computed(() => !sheet.checkOn() || tasks.check.pending()),
  checkNote: computed(() => (tasks.check.pending() ? '⏳ reading… do not touch the stand' : tasks.check.error() && `❌ ${tasks.check.error()}`)),
  indicated: computed(() => fixed(indicated(), 2, 'g')),
  error: computed(() => (Number.isFinite(errorPct()) ? `${errorPct() >= 0 ? '+' : ''}${errorPct().toFixed(3)} %` : '—')),
  errorAbs: computed(() => (Number.isFinite(errorPct()) ? Math.min(1, Math.abs(errorPct())) : 0)),
  photoNote: computed(() => (photos().length ? photos().map((f) => f.name).join(', ') : 'none attached')),
  recordLocked: computed(() => !ok5()),
};

// ---------- the record: a plain function, so "completed" is the time of the download ----------
const record = () => ({
  procedure: 'load cell calibration',
  completed: new Date().toISOString(),
  serial: sheet.serial(),
  operator: sheet.operator(),
  ambient_c: sheet.ambient(),
  zero: sheet.zero(),
  span: sheet.span(),
  scale_counts_per_g: +scale().toFixed(4),
  repeatability_pct: +repeat().toFixed(4),
  check: { mass_g: sheet.checkMass(), reading: sheet.check(), indicated_g: +indicated().toFixed(3), error_pct: +errorPct().toFixed(4) },
  notes: sheet.notes(),
  photos: photos().map((f) => f.name),
  result: ok4() ? 'pass' : 'fail',
});

const actions = {
  readZero: () => tasks.zero.run(),
  readSpan: () => tasks.span.run(),
  readCheck: () => tasks.check.run(),
  download: () => download(`calibration-${sheet.serial()}-${new Date().toISOString().slice(0, 10)}.json`, untracked(() => record())),
  print: () => window.print(),
  clear() {
    load(BLANK);
    photos([]);
  },
};

bind(document.body, { sheet, photos, views, actions });
