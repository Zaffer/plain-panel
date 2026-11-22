/**
 * The edge: where events over time become state.
 * Streams (websockets, timers, pointer events) live out here; each event
 * lands in the store as a batched signal write.
 */
import { batch, computed, signal, untracked, type Computed, type Signal } from './signals.js';

export interface Series {
  /** Append a sample; null marks a gap (a dead source draws a hole, not a frozen line). */
  push(v: number | null): void;
  clear(): void;
  /** Reactive read — an effect that calls read() re-runs on every push/clear. */
  read(): readonly (number | null)[];
  readonly capacity: number;
}

/**
 * Fixed-capacity rolling buffer for live metrics (sparklines, loss curves).
 * Mutates in place — no per-sample copying — and notifies through one
 * internal version signal, so consumers never call trigger() themselves.
 */
export function series(capacity = 600): Series {
  const buffer: (number | null)[] = [];
  const version = signal(0);
  return Object.freeze({
    capacity,
    push(v: number | null) {
      buffer.push(v);
      if (buffer.length > capacity) buffer.shift();
      version(version() + 1);
    },
    clear() {
      buffer.length = 0;
      version(version() + 1);
    },
    read() {
      version();
      return buffer as readonly (number | null)[];
    },
  });
}

export interface SocketOptions {
  /** Called with JSON.parse'd data, inside a batch — write signals freely. */
  onMessage: (data: unknown) => void;
  /** Reconnect delay after a drop. Default 1000ms. Infinite retries until close(). */
  reconnectMs?: number;
}

export interface Socket {
  readonly connected: Computed<boolean>;
  /** Sends JSON; returns false (and drops the message) when not connected. */
  send(data: unknown): boolean;
  close(): void;
}

/**
 * WebSocket → store, with auto-reconnect. `url` may be a function so each
 * (re)connect can build a cursor query like `?since=${lastSeq()}`.
 */
export function connect(url: string | (() => string), opts: SocketOptions): Socket {
  const reconnectMs = opts.reconnectMs ?? 1000;
  const isConnected: Signal<boolean> = signal(false);
  let ws: WebSocket | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    try {
      ws = new WebSocket(typeof url === 'function' ? url() : url);
    } catch (err) {
      // A synchronous constructor throw (bad URL, mixed content on https) is
      // a config error, not a network drop: report once, stop, and leave the
      // rest of the app running — no retry storm against a URL that can
      // never work. connected() stays false.
      console.error('plain-panel: connect() failed —', err);
      return;
    }
    ws.onopen = () => isConnected(true);
    ws.onmessage = (e) => batch(() => opts.onMessage(JSON.parse(e.data)));
    ws.onclose = () => {
      isConnected(false);
      if (!closed) timer = setTimeout(open, reconnectMs);
    };
    ws.onerror = () => ws?.close(); // funnel errors into the reconnect path
  };
  open();

  return {
    connected: computed(() => isConnected()),
    send(data: unknown) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(data));
      return true;
    },
    close() {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    },
  };
}

export type TaskStatus = 'idle' | 'pending' | 'done' | 'failed';

export interface Task<A extends unknown[], R> {
  /**
   * Starts the work. Resolves to the result, or to undefined when the work
   * failed: it never rejects, the failure is in error(). Calling run() while
   * pending is a bug (the control should be disabled) and throws.
   */
  run(...args: A): Promise<R | undefined>;
  readonly status: Computed<TaskStatus>;
  readonly pending: Computed<boolean>;
  /** The last failure's message; '' while pending and after a success. */
  readonly error: Computed<string>;
  /** The last successful result. */
  readonly result: Computed<R | undefined>;
}

/**
 * One piece of async work (a request, a measurement, a command) with its
 * progress in the store, so the page can always show it: bind
 * data-disabled="tasks.save.pending" on the control and data-text on a
 * status readout. Failures are logged and kept in error(), never dropped.
 */
export function task<A extends unknown[], R>(fn: (...args: A) => Promise<R> | R): Task<A, R> {
  const status = signal<TaskStatus>('idle');
  const error = signal('');
  const result = signal<R | undefined>(undefined);
  return Object.freeze({
    status: computed(() => status()),
    pending: computed(() => status() === 'pending'),
    error: computed(() => error()),
    result: computed(() => result()),
    async run(...args: A): Promise<R | undefined> {
      if (untracked(() => status()) === 'pending') {
        throw new Error('plain-panel: task.run() called while pending: disable its control with data-disabled="<task>.pending"');
      }
      batch(() => {
        status('pending');
        error('');
      });
      try {
        const r = await fn(...args);
        batch(() => {
          result(r);
          status('done');
        });
        return r;
      } catch (err) {
        console.error('plain-panel: task failed:', err);
        batch(() => {
          error(err instanceof Error ? err.message : String(err));
          status('failed');
        });
        return undefined;
      }
    },
  });
}

/**
 * Hands the operator a file: a CSV of samples, a JSON record. Data leaves the
 * store at the edge, like a socket message arrives at it. Strings and
 * objects are accepted; an object is written as indented JSON.
 */
export function download(filename: string, content: string | object, type = 'text/plain'): void {
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  if (typeof content !== 'string') type = 'application/json';
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
