# plain-panel

[plain-site](https://github.com/Zaffer/plain-site) for tools that do work:
hardware control, experiments, procedures. A house style, three templates,
and a small signals library. Plain HTML, one store, no build step.

**Site, templates and demo: https://zaffer.github.io/plain-panel/**

- [DESIGN.md](DESIGN.md) is the house style: it builds on plain-site's
  manifesto and adds the rules for working screens, with one exception
  (a short allowlist of functional CSS).
- [templates/](templates/) holds three screen shapes to copy:
  **station** (a workbench in the shape of an IDE), **lab** (experiments), **runsheet**
  (procedures). Each one runs against a fake backend in `sim.js`.
- This README is the library API.

## The idea

```html
<label for="volume">volume
  <output data-text="views.label"></output><br>
  <input id="volume" type="range" min="0" max="100" data-bind="state.volume">
</label>
<button data-on="click:actions.reset">🔄 reset</button>

<script type="module">
  import { signal, computed, bind } from './dist/plain-panel.js';

  const state   = { volume: signal(40) };
  const views   = { label: computed(() => state.volume() + ' %') };
  const actions = { reset: () => state.volume(40) };

  bind(document.body, { state, views, actions });
</script>
```

State lives in signals. The HTML says which path each node shows.
`bind()` connects them: one effect for each DOM property, one listener for
each control. Nothing else reads or writes the DOM.

The `for` is not decoration: without it a label names its *first*
labelable child, here the `<output>`, and the slider has no accessible name.

## Install

No build step. Copy `dist/plain-panel.js` into your project, or:

```html
<script type="module">
  import { signal, bind } from 'https://cdn.jsdelivr.net/gh/Zaffer/plain-panel@v0.6.0/dist/plain-panel.js';
</script>
```

Pin a release tag (`@vX.Y.Z`); `@master` tracks the latest commit. With an
importmap, the templates' `import ... from 'plain-panel'` works unchanged:

```html
<script type="importmap">
  { "imports": { "plain-panel": "https://cdn.jsdelivr.net/gh/Zaffer/plain-panel@v0.6.0/dist/plain-panel.js" } }
</script>
```

There is no stylesheet. Controls keep the browser's look (DESIGN.md).

## Signals

A signal is a function. Read with `s()`. Write with `s(next)`. Signals are
frozen: `s.value = x` throws an error.

```js
const count  = signal(1);            // read: count()   write: count(2)
const double = computed(() => count() * 2);
const stop   = effect(() => {        // runs now, and again when a read value changes
  render(double());
  return () => cleanup();            // optional; runs before each re-run and on stop
});
batch(() => { a(1); b(2); });        // effects run once, after both writes
untracked(() => s());                // read without a subscription
trigger(s);                          // notify effects after an in-place change of s()
effectScope(() => { ... });          // group effects; the returned Stop stops all
```

Rules:

- Replace values, do not mutate them: `list([...list(), x])`. Only `series()`
  mutates in place, and it notifies for you.
- A write of an identical value (`===`) does nothing. Echo loops cannot happen.

## bind(root, scope)

`bind()` scans `root` for `data-*` attributes and connects them to `scope`.
It returns a `Stop` that removes all bindings.

| Attribute | On | Does |
|---|---|---|
| `data-text="path"` | any element | `textContent` ← value |
| `data-bind="path"` | input/select/textarea/details | two-way ⇄ **signal**. A number signal reads back as a number (NaN is never written); anything else as a string. Checkbox → boolean; radio group → one signal, checked by value; `select[multiple]` → string[]; `type=file` → one-way DOM→signal (File[]); `<details>` → open ⇄ boolean; `<progress>`/`<meter>` → one-way value ← readable (computeds welcome) |
| `data-show="path"` | any element | native `hidden` ← `!value` |
| `data-class="path"` | any element | dynamic classes ← value (string or string[]), ADDED to the element's authored classes. Status classes (`ok`/`bad`) come and go; layout classes stay. The class attribute is owned by the binding |
| `data-disabled="path"` | button/input/… | `disabled` ← value. State disables controls; it never hides or moves them |
| `data-inert="path"` | any element | native `inert` ← value. Disables the full subtree (focus, clicks, a11y) |
| `data-on="click:path"` | any element | listener → function in scope. Separate multiple `event:path` pairs with spaces |
| `data-wheel` | range/number with `data-bind` | the mouse wheel changes the value by `step` |
| `data-each="path"` | `<template>` | one row for each array item. Rows see `$item` / `$index` and the outer scope. **`data-key` is required.** Rows reconcile by key: a content change updates the row **in place** (zero DOM mutation); a kept item at a new position moves its DOM nodes with it, so focus and canvas state travel with the item |
| `data-key="id"` | `<template>` with `data-each` | item identity: a field path into the item (`"id"`), `"$item"` for primitive values, or `"$index"` for positional rows. Duplicate or object keys throw |

Paths are dot-walked (`state.volume`); the prototype chain is included. A
missing path throws an error that shows the full path. No expressions, ever.

**Paths read through signals.** When a path segment holds a signal or a
computed, the binder reads it (reactively) and continues into its value.
`data-text="snapshot.pose.x"` works when `snapshot` is one signal that holds
the latest server state, and `$item.size` stays live when a row's item is
updated in place.

**Browser rule — sliders and fieldsets.** Chrome silently cancels a slider
drag when the child list of a `<fieldset>` that contains the slider (directly
or through nested fieldsets) changes. This is native browser behavior; every
framework triggers it. Children added inside a `<div>` or `<details>` are
safe. `data-each` changes structure only when membership or order changes.
Still: put `data-each` templates and async-mounted panels in their own
container, never directly in a fieldset with sliders.

## panel(title, opts?)

Build panels from code, for quick experiments. The output is the same native
elements you write by hand, in a `<details>` appended to
`opts.parent ?? document.body` (`opts.open`, default true, starts it expanded).

```js
const p = panel('settings');
p.slider('speed', state.speed, { min: 0, max: 5, step: 0.1, format: v => v.toFixed(1) });
p.number('count', state.count, { min: 0, max: 100, step: 1 });
p.toggle('show grid', state.grid);
p.select('mode', state.mode, ['auto', 'manual', { value: 'off', label: 'disabled' }]);
p.button('▶️ run', actions.run, { disabled: views.running }); // label may also be a computed
p.readout('status', views.statusLabel);
p.text('name', state.name);
p.color('trace color', state.color);
p.add(myCanvas);                       // escape hatch: any element
const f = p.folder('advanced');        // nested collapsible group
p.dispose();                           // stops all bindings, removes the panel
```

Sliders get a live `<output>` readout and wheel support by default. Every
control takes an optional `{ disabled: readable }` as its last option
(merged into the options object for `slider` and `number`), so builder
panels follow the same gating as `data-disabled`:
`p.toggle('⚡ armed', state.armed, { disabled: views.armLocked })`.

## task(fn)

One piece of async work (a request, a command, a measurement) with its
progress in the store. The page can always show it, so nobody clicks twice
wondering whether the first click took.

```js
const tasks = { save: task(async (body) => (await fetch('/api/save', { method: 'POST', body })).json()) };
const actions = { save: () => tasks.save.run(JSON.stringify(form())) };
```

```html
<button data-on="click:actions.save" data-disabled="tasks.save.pending">💾 save</button>
<small data-text="tasks.save.error"></small>
```

`status()` is `'idle' | 'pending' | 'done' | 'failed'`; `pending()`,
`error()` (the failure's message, or `''`) and `result()` are computeds.
`run()` never rejects: it resolves to the result, or to `undefined` after a
failure, which is also logged (`plain-panel: task failed:`). Calling `run()`
while pending throws: disable the control instead.

## Edge helpers

```js
const metric = series(600);   // rolling buffer; push(null) marks a gap
metric.push(0.42);
effect(() => draw(metric.read()));   // read() is reactive — redraws on each push

const sock = connect(() => `ws://localhost:8780/api/ws?since=${lastSeq()}`, {
  onMessage: (snap) => applySnapshot(snap),   // already JSON.parsed, inside batch()
  reconnectMs: 1000,                          // retries forever, until sock.close()
});
sock.connected();   // computed<boolean>
sock.send({ cmd: 'arm' });
```

`download(filename, content, type?)` hands the operator a file: a string
as is (`'text/csv'`, …), an object as indented JSON.

```js
download('run-3.json', run);
download('samples.csv', rows.join('\n'), 'text/csv');
```

Native browser Observables (Chromium) fit the same way. They are streams
at the edge, so they write the store:
`button.when('click').subscribe(() => status('armed'))`. The demo's
"signal vs observable" panel shows the difference side by side.

## Imperative escape hatch (three.js, canvas)

Keep foreign libraries in plain modules, behind a narrow API. Effects push
data in:

```js
// stage.js — no signals in here
export function createStage(el) { ...; return { setPose, setTrail, dispose }; }

// app.js
const stage = createStage(container);
effect(() => stage.setPose(snapshot().pose));   // data in, never proxied
```

## Low-level primitives

`bindText` `bindShow` `bindClass` `bindDisabled` `bindInert` `bindGauge`
`bindValue` `bindWheel` `listen` — each one creates one effect or one
listener (`bindValue`: one of each) and returns a `Stop`. The binder and the
panel builder are built from these. Build custom widgets from them too.
`resolveValue(scope, path)` / `resolveTarget(scope, path)` are the binder's
path walk: the current value, or the raw leaf (a signal, a handler).

## Development

```sh
npm install
npm run build      # esbuild bundle + type declarations → dist/
npm test           # build + node --test + typecheck (src, demo, templates, consumer types)
npm run server     # FastAPI mock rig + statics → open http://localhost:8780/examples/demo/
npm run types      # regenerate examples/demo/api.d.ts from the running server
npm run serve      # static-only server → open :8137/ (templates need no API)
```

`dist/` is committed, so jsDelivr can serve it directly from GitHub.

## Templates and demo

| | Shape | Shows |
|---|---|---|
| [templates/station/](templates/station/) | IDE shell that fills the window | a workbench: top bar, side bar, main, bottom panel and status bar, each a tab row over one page, with draggable gaps. The example is a test bench: a signal source with start / stop / measure, a chart, a captures table, a log, the store as JSON, every native control bound, and a `panel()` twin of the form |
| [templates/lab/](templates/lab/) | two columns that wrap | experiments: a `panel()`-built setup form, a server-side queue, live curves, a runs table, inspect and reuse |
| [templates/runsheet/](templates/runsheet/) | one column, no CSS | a procedure: steps that unlock in order, readings with pass/fail, a saved draft, a downloadable record |
| [examples/demo/](examples/demo/) | specimen | every native control bound, a three.js scene, the panel builder, a schema-driven form, signal vs Observable |

Each template is `index.html` + `app.js` + `sim.js`. The sim is the only
file that knows the backend; replace it and keep its API. The template JS is
strict-type-checked by `npm test`.
