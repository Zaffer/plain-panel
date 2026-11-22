// @ts-check
// A fake signal source: it makes one number, 20 times a second.
// This is the only file that knows the backend. For a real device or server,
// keep this API and talk to it in here (Web Serial, a WebSocket, fetch).
//
// The source owns the truth. Its state arrives only through onState and
// onSample; a command resolves when the source accepts it, or rejects with
// the reason.

/** @typedef {'sine' | 'square' | 'saw' | 'random'} Wave */

/**
 * @typedef {object} Params
 * @property {Wave} wave
 * @property {number} freq   Hz
 * @property {number} amp    V, peak
 * @property {number} noise  V, added to every sample
 */

/** @typedef {{ t: number, value: number }} Sample  t: ms since the epoch; value: V */
/** @typedef {{ n: number, mean: number, rms: number, min: number, max: number }} Stats */

/**
 * @typedef {object} Source
 * @property {() => Promise<void>} start
 * @property {() => void} stop  at once. Never fails.
 * @property {(p: Params) => void} set
 * @property {(seconds: number) => Promise<Stats>} measure  rejects when the source stops first
 */

/**
 * @param {{ onSample: (s: Sample) => void, onState: (running: boolean) => void }} io
 * @returns {Source}
 */
export function createSource({ onSample, onState }) {
  const HZ = 20;
  /** @type {Params} */
  let params = { wave: 'sine', freq: 0.5, amp: 1, noise: 0 };
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;
  let phase = 0; // turns, 0..1: it carries on through a change of frequency
  let held = 0; // the 'random' wave holds one level for each period
  /** @type {{ left: number, values: number[], resolve: (s: Stats) => void, reject: (e: Error) => void } | null} */
  let probe = null;

  function level() {
    const { wave, amp } = params;
    if (wave === 'sine') return amp * Math.sin(2 * Math.PI * phase);
    if (wave === 'square') return phase < 0.5 ? amp : -amp;
    if (wave === 'saw') return amp * (2 * phase - 1);
    return amp * held;
  }

  function tick() {
    phase += params.freq / HZ;
    if (phase >= 1) {
      phase %= 1;
      held = Math.random() * 2 - 1;
    }
    const value = level() + params.noise * (Math.random() * 2 - 1);
    onSample({ t: Date.now(), value });
    if (!probe) return;
    probe.values.push(value);
    if (--probe.left > 0) return;
    const v = probe.values;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const rms = Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length);
    probe.resolve({ n: v.length, mean, rms, min: Math.min(...v), max: Math.max(...v) });
    probe = null;
  }

  return {
    async start() {
      await new Promise((r) => setTimeout(r, 400)); // a real source takes a moment
      if (timer) return;
      timer = setInterval(tick, 1000 / HZ);
      onState(true);
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
      probe?.reject(new Error('the source stopped before the measurement finished'));
      probe = null;
      onState(false);
    },
    set(p) {
      params = p;
    },
    measure(seconds) {
      if (!timer) return Promise.reject(new Error('the source is not running: start it first'));
      if (probe) return Promise.reject(new Error('a measurement is already running'));
      return new Promise((resolve, reject) => {
        probe = { left: Math.max(1, Math.round(seconds * HZ)), values: [], resolve, reject };
      });
    },
  };
}
