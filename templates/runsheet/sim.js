// @ts-check
// A fake load cell and amplifier. This is the only file that knows the
// hardware. For a real cell, keep read() and talk to the amplifier in here
// (Web Serial, a WebSocket bridge, fetch).
//
// place() exists only in the simulator: a real cell feels the mass the
// operator puts on it. app.js marks each call "sim only".

/** @typedef {{ mean: number, sd: number, n: number }} Raw  averaged amplifier counts */

/**
 * @typedef {object} Cell
 * @property {() => Promise<Raw>} read  averages 10 samples over about 1 s
 * @property {(grams: number) => void} place  sim only: what is on the cell
 */

/** @returns {Cell} */
export function createCell() {
  const offset = 8400 + (Math.random() - 0.5) * 60; // counts with no load
  const gain = 412.7 * (1 + (Math.random() - 0.5) * 0.04); // counts per gram
  let load = 0;

  /** normal noise, Box-Muller */
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

  return {
    place(grams) {
      load = grams;
    },
    async read() {
      await new Promise((r) => setTimeout(r, 1200));
      if (Math.random() < 0.1) throw new Error('no response from the amplifier: check the wiring, then read again');
      const placed = load * (1 + gauss() * 0.0002); // the mass sits a little off centre each time
      const samples = Array.from({ length: 10 }, () => offset + gain * placed + gauss() * 1.5);
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1));
      return { mean, sd, n: samples.length };
    },
  };
}
