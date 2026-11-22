// @ts-check
// A line chart on a canvas. Imperative and signal-free: app.js pushes data
// in through draw(). The chart follows the page's light or dark scheme by
// drawing in the canvas's own text colour, and redraws when it is resized.
// With no CSS it keeps the size its HTML gives it (width and height attributes).

/**
 * @typedef {object} Line
 * @property {readonly (number | null)[]} data  null draws a gap
 * @property {string} [color]  default: the text colour
 * @property {string} [label]  drawn at the end of the line
 */

/** @param {HTMLCanvasElement} canvas */
export function createChart(canvas) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  /** @type {[Line[], { unit?: string, length?: number, digits?: number }]} */
  let last = [[], {}];
  const authored = [canvas.width, canvas.height]; // the size the HTML gives

  /** Sizes the pixel buffer to the canvas's box. Returns pixels per CSS pixel. */
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    // No CSS sizes the canvas: its box follows its own pixels. More pixels
    // for a sharp display would grow the box, and the next draw would grow
    // it again, without end. So draw 1:1, at the size the HTML gives.
    const own = dpr !== 1 && cw === canvas.width && ch === canvas.height;
    const scale = own ? 1 : dpr;
    const w = own ? authored[0] : Math.round(cw * scale);
    const h = own ? authored[1] : Math.round(ch * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return scale;
  }

  /**
   * @param {Line[]} lines
   * @param {{ unit?: string, length?: number, digits?: number }} [opts]
   *   length: x span in samples (default: the longest line); digits: axis decimals
   */
  function draw(lines, opts = {}) {
    last = [lines, opts];
    const dpr = fit();
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const values = /** @type {number[]} */ (lines.flatMap((l) => l.data.filter((v) => v !== null && Number.isFinite(v))));
    if (!values.length) return;
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (hi - lo < 1e-9) {
      hi += 1;
      lo -= 1;
    }
    const ink = getComputedStyle(canvas).color;
    const pad = 6 * dpr;
    const left = 64 * dpr;
    const right = 72 * dpr;
    const span = opts.length ?? Math.max(...lines.map((l) => l.data.length));
    const x = (/** @type {number} */ i) => left + (i / Math.max(span - 1, 1)) * (w - left - right);
    const y = (/** @type {number} */ v) => h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad);
    const unit = opts.unit ? ' ' + opts.unit : '';
    const digits = opts.digits ?? 1;

    ctx.font = `${11 * dpr}px monospace`;
    ctx.fillStyle = ink;
    ctx.textBaseline = 'top';
    ctx.fillText(hi.toFixed(digits) + unit, pad, pad);
    ctx.textBaseline = 'bottom';
    ctx.fillText(lo.toFixed(digits) + unit, pad, h - pad);
    ctx.lineWidth = 1.5 * dpr;

    for (const line of lines) {
      ctx.strokeStyle = line.color ?? ink;
      ctx.beginPath();
      let pen = false;
      /** @type {[number, number] | null} */
      let end = null;
      line.data.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) {
          pen = false;
          return;
        }
        if (pen) ctx.lineTo(x(i), y(v));
        else ctx.moveTo(x(i), y(v));
        pen = true;
        end = [x(i), y(v)];
      });
      ctx.stroke();
      if (line.label && end) {
        ctx.fillStyle = line.color ?? ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(line.label, end[0] + 4 * dpr, end[1]);
      }
    }
  }

  new ResizeObserver(() => draw(...last)).observe(canvas);
  return { draw };
}
