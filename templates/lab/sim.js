// @ts-check
// A fake training server. It holds a queue of runs, trains one at a time,
// and pushes a snapshot of everything after each change. This is the only
// file that knows the backend. For real training, keep this API and talk to
// your server in here (fetch to submit, a WebSocket for the snapshots).
//
// The loss curves are made up, but they react the way real ones do: a high
// learning rate diverges, low dropout overfits, a wider model fits better.

/**
 * @typedef {object} Config
 * @property {number} lr         learning rate
 * @property {number} batch      batch size
 * @property {number} epochs
 * @property {string} optimizer  'adam' | 'adamw' | 'sgd'
 * @property {number} dropout    0 to 0.5
 * @property {number} width      hidden units
 * @property {boolean} augment
 * @property {number} seed
 */

/** @typedef {{ train: number, val: number, acc: number }} Epoch */
/** @typedef {'queued' | 'running' | 'done' | 'failed' | 'cancelled'} RunStatus */

/**
 * @typedef {object} Run
 * @property {string} id
 * @property {string} name
 * @property {Config} config
 * @property {RunStatus} status
 * @property {Epoch[]} history  one entry per finished epoch
 * @property {string} error     why it failed; '' otherwise
 * @property {number} started   ms since the epoch; 0 until it starts
 * @property {number} ended     ms since the epoch; 0 until it ends
 */

/** @typedef {{ paused: boolean, runs: Run[] }} Snapshot */

/**
 * @typedef {object} Lab
 * @property {(name: string, config: Config) => Promise<string>} submit  queues a run; resolves to its id
 * @property {(id: string) => Promise<void>} cancel
 * @property {() => Promise<void>} pause   pauses the queue and the run in progress
 * @property {() => Promise<void>} resume
 * @property {(ids: string[]) => Promise<void>} remove  deletes finished runs
 */

/** @param {{ onSnapshot: (s: Snapshot) => void }} io @returns {Lab} */
export function createLab({ onSnapshot }) {
  /** @type {Run[]} */
  let runs = [];
  let paused = false;
  let nextId = 1;
  /** @type {Map<string, () => number>} a seeded random source per run */
  const rand = new Map();

  /** @param {number} ms */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  /** @param {unknown} ok @param {string} why */
  const need = (ok, why) => {
    if (!ok) throw new Error(why);
  };
  const emit = () => onSnapshot({ paused, runs });
  /** @param {string} id @param {Partial<Run>} patch */
  const update = (id, patch) => {
    runs = runs.map((r) => (r.id === id ? { ...r, ...patch } : r));
  };

  /** mulberry32: the same seed gives the same noise @param {number} seed */
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
    };
  }

  /** the made-up physics of training @param {Run} run @returns {Epoch} */
  function epoch(run) {
    const c = run.config;
    const n = run.history.length + 1;
    const noise = /** @type {() => number} */ (rand.get(run.id));
    const speed = c.lr * (c.optimizer === 'sgd' ? 150 : 1000) * (64 / c.batch) ** 0.2;
    const floor = 0.22 + 30 / c.width;
    const jitter = (0.04 + Math.max(0, speed - 3) * 0.05) / Math.sqrt(c.batch / 32);
    if (speed > 12 && n > 2 + noise() * 2) {
      return { train: NaN, val: NaN, acc: 0 };
    }
    const train = floor + (2.3 - floor) * Math.exp(-0.12 * Math.min(speed, 4) * n) + jitter * noise();
    const overfit = Math.max(0, 1 - c.dropout * 1.8) * (c.augment ? 0.5 : 1) * (c.width / 256) * 0.006 * n;
    const val = train + 0.03 + overfit + jitter * 1.3 * noise();
    return { train, val, acc: Math.max(0, Math.min(1, 1 - val * 0.38)) };
  }

  // the worker: trains the first queued run, one epoch per tick
  async function loop() {
    for (;;) {
      await wait(250);
      if (paused) continue;
      let run = runs.find((r) => r.status === 'running');
      if (!run) {
        run = runs.find((r) => r.status === 'queued');
        if (!run) continue;
        update(run.id, { status: 'running', started: Date.now() });
        run = /** @type {Run} */ (runs.find((r) => r.id === run?.id));
      }
      const e = epoch(run);
      const history = [...run.history, e];
      if (!Number.isFinite(e.val)) {
        update(run.id, { history, status: 'failed', ended: Date.now(), error: `loss diverged to NaN at epoch ${history.length}: lower the learning rate` });
      } else if (history.length >= run.config.epochs) {
        update(run.id, { history, status: 'done', ended: Date.now() });
      } else {
        update(run.id, { history });
      }
      emit();
    }
  }
  loop();
  emit();

  return {
    async submit(name, config) {
      need(name.trim(), 'give the run a name');
      need(!runs.some((r) => r.name === name), `a run named "${name}" exists: choose another name`);
      need(config.epochs >= 1 && config.epochs <= 200, 'epochs must be 1 to 200');
      await wait(200);
      const id = String(nextId++);
      rand.set(id, seeded(config.seed));
      runs = [...runs, { id, name, config, status: 'queued', history: [], error: '', started: 0, ended: 0 }];
      emit();
      return id;
    },
    async cancel(id) {
      const run = runs.find((r) => r.id === id);
      need(run && (run.status === 'running' || run.status === 'queued'), 'that run is not queued or running');
      await wait(300);
      update(id, { status: 'cancelled', ended: Date.now() });
      emit();
    },
    async pause() {
      need(!paused, 'already paused');
      await wait(200);
      paused = true;
      emit();
    },
    async resume() {
      need(paused, 'not paused');
      await wait(200);
      paused = false;
      emit();
    },
    async remove(ids) {
      need(ids.every((id) => runs.find((r) => r.id === id && ['done', 'failed', 'cancelled'].includes(r.status))), 'only finished runs can be deleted');
      await wait(250);
      runs = runs.filter((r) => !ids.includes(r.id));
      emit();
    },
  };
}
