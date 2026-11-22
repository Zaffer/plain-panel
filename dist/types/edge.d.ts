/**
 * The edge: where events over time become state.
 * Streams (websockets, timers, pointer events) live out here; each event
 * lands in the store as a batched signal write.
 */
import { type Computed } from './signals.js';
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
export declare function series(capacity?: number): Series;
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
export declare function connect(url: string | (() => string), opts: SocketOptions): Socket;
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
export declare function task<A extends unknown[], R>(fn: (...args: A) => Promise<R> | R): Task<A, R>;
/**
 * Hands the operator a file: a CSV of samples, a JSON record. Data leaves the
 * store at the edge, like a socket message arrives at it. Strings and
 * objects are accepted; an object is written as indented JSON.
 */
export declare function download(filename: string, content: string | object, type?: string): void;
