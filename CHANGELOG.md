# Changelog

## 0.6.0 — 2026-11-22

Breaking: the project is renamed, and the theme stylesheet is gone.

- **Renamed plainpanel → plain-panel**: the npm name, the GitHub repo
  (github.com/Zaffer/plain-panel; the old URL redirects), the bundle
  (`dist/plain-panel.js`) and the error prefix (`plain-panel:`). Pinned old
  jsDelivr URLs (`gh/Zaffer/plainpanel@v0.5.5/dist/plainpanel.js`) still work.
- **plain-panel now builds on plain-site.** DESIGN.md is rewritten as the
  house style for working tools: plain-site's manifesto, plus one exception
  (a short allowlist of functional CSS), screen shapes, feedback rules
  (ground truth, staleness, the always-there stop), and a house glyph set.
- **Removed `plainpanel.css`** (the decorative dark/monospace theme) and its
  package export. Controls keep the browser's look; colour comes from HTML.
- New `task(fn)`: async work with `status` / `pending` / `error` / `result`
  in the store, so every request shows pending and failure.
- New `download(filename, content, type?)`: hands the operator a file.
- **Three templates** in templates/: station (an IDE-shaped workbench), lab
  (experiments, `panel()`-built setup), runsheet (a procedure, no CSS).
  Each runs against a fake backend in `sim.js`; their JS is type-checked.
- New zero-CSS landing page (index.html) for GitHub Pages; `.nojekyll`.
- **The panel paint** is part of the house style (DESIGN.md §1): one page
  colour, one panel colour a shade apart (`light-dark()`), and 5px corners on
  panels, fieldsets and dialogs, so each panel is a box with its content
  inside. The station and lab templates use it; the demo keeps its own theme
  switch.
- **Emoji in buttons, not glyphs.** Symbol characters (▶ ■ ✓ ↺) can come from
  fallback fonts with other metrics and make buttons uneven, differently per
  device. DESIGN.md rule 18 explains when to be careful, and gives a house set
  of emoji, written with U+FE0F. Glyphs stay where size does not matter (the
  ⋮ ⋯ resize grips). Resize handles also get a "drag to resize" title.
- Station template: a workbench in the shape of an IDE. Top bar, activity
  bar, side bar, main, bottom panel, status bar. A selector is a radio group
  that shows a symbol alone (the word is in `title` and `aria-label`); a page
  is a section, `hidden` unless chosen. A click on the open view's symbol
  closes the side bar. The gaps are the resize handles, with ⋮ ⋯ grips (drag,
  or arrow keys); the side bar and bottom panel switch off (Alt+B, Alt+J).
  The ☰ menu opens under its button, as a thin-edged sheet laid out by a
  table. It fills a window of any size with no second layout. The example is
  a test bench: a signal source, a chart, captures, a log, the store as JSON,
  every native control bound, and a `panel()` twin.
- **DESIGN.md is a guide, not a set of rules.** Reworded throughout: each
  item is a default with its reason, the CSS allowlist is now a list of the
  CSS in use, and a symbol alone is fine where the set is small and each
  symbol carries its word in `aria-label` and `title`.
- Template chart.js: with no CSS on a high-density display the canvas grew
  without end (its box followed its own pixel size). It now draws 1:1 there,
  at the size its HTML `width` / `height` give.

## 0.5.5 — 2026-10-12

- **Types now resolve for NodeNext consumers.** `dist/plainpanel.d.ts` and
  the generated declarations used extensionless imports, so TypeScript with
  `moduleResolution: node16/nodenext` saw no exports at all. `trigger`,
  `isSignal` and `isComputed` no longer import types from the bundled
  `alien-signals` (which consumers don't have).
- `panel.select()` is generic: it accepts a `Signal<string>` or
  `Signal<number>`, not only `Signal<string | number>`.
- `panel.slider()` labels its input with `for`/`id`: the label also holds the
  `<output>`, which used to take the label, leaving the slider unnamed for
  screen readers.
- `npm test` now also type-checks `src/`, the demo's JS (strict, via
  `examples/demo/jsconfig.json`) and a NodeNext consumer of the published
  types (`test/types/`). `tsconfig.json` sets `rootDir` (TypeScript 6+).
- Demo: strict-clean JSDoc types throughout (`stage.js`'s narrow API is a
  `Stage` typedef); hand-written sliders get `for`/`id` labels.

## 0.5.4 — 2026-10-11

- Every `panel` control takes an optional `{ disabled: readable }`
  (`ControlOptions`, exported), like `button()` already did, so builder
  panels gate by state the same way `data-disabled` does.
- Demo: experiment commands show as pending ("arming…", "starting…") and
  lock their controls until a snapshot confirms them (DESIGN.md rule 6);
  new "signal vs observable" panel; `data-inert="snap.running"` shows a path
  reading through a signal; ping and showPicker() feedback sit next to their
  buttons; page radios get glyphs; scene background matches the panel
  colour; `THREE.Clock` → `THREE.Timer`.
- README: jsDelivr links pin a tag (there is no `main` branch); precise
  slider/fieldset rule; full low-level primitive list.
- DESIGN.md rule 11: appearance is allowed when it shows structure.
- CI runs on pushes to `master`.
- Demo: the builder's armed toggle and the run-parameter form lock by state.

## 0.5.3 — 2026-08-26

- New `data-class` attribute (and `bindClass` primitive): dynamic status
  classes from a path, added on top of the element's authored classes. The
  value is a space-separated string or string[]; authored classes are captured
  at bind time and always kept. Works inside `data-each` rows (`$item.cls`).

## 0.5.2 — 2026-08-24

- Demo: one CSS grid with resizable panels (pointer events → layout
  signals → CSS variables), dark/light theme, menu popover with a no-CSS
  toggle. `stage.setBackground` joins the narrow API.
- `plainpanel.css` colours read `--pp-*` custom properties, so apps can
  retheme the panels.

## 0.5.1 — 2026-08-22

- `connect()`: a synchronous WebSocket constructor throw (bad URL, mixed
  content) is reported once and stops, instead of killing the app.
- Demo uses `wss` on https hosting; README links the GitHub Pages demo.

## 0.5.0 — 2026-08-22

- **Breaking:** renamed simpleform → plainpanel (package, `dist/plainpanel.js`,
  `plainpanel.css`, `pp-` class prefix, `plainpanel:` error prefix).
- One example: `examples/demo/` runs against the FastAPI mock rig
  (`npm run server`); `api.d.ts` is generated from its OpenAPI.

## 0.4.3 — 2026-08-22

- Socket example: controls in front of a live API (server is the source of
  truth, schema-driven parameter panel).

## 0.4.1 / 0.4.2 — 2026-08-21

- Reverted the slider `dragstart` cancel and `user-select` rules: selection
  behaviour belongs to the app, not the library.

## 0.4.0 — 2026-08-21

- Full form-control coverage in `data-bind`: radio groups (one signal per
  group, checked by value), `select[multiple]` (string[] signal),
  `input[type=file]` (one-way DOM→signal, File[]), `<details>` (open ⇄
  boolean via toggle), `<progress>`/`<meter>` (one-way value ← readable,
  computeds welcome).
- New `data-inert` attribute — whole-subtree disable via the native inert
  attribute; `bindGauge`/`bindInert` primitives exported.
- Demo rebuilt as a four-panel kitchen sink: every HTML control bound with a
  live JSON store snapshot, native extras (accordion `<details name>`,
  popover, dialog + commandfor, hidden=until-found), and a Chromium-only
  bottom bar with feature-support badges.

## 0.3.0 — 2026-08-21

- **`data-key` is now compulsory on `data-each`** (Angular-`@for` reasoning: a
  forgotten key is a silent wrong-row-state bug; a missing attribute is a loud,
  self-teaching bind-time error). Forms: a field path (`data-key="id"`),
  `"$item"` for primitive items, `"$index"` for explicitly positional rows.
- Keyed reconciliation: a kept item at a new position moves its DOM nodes with
  it (focus/canvas state travels with the item). Duplicate keys throw;
  object-valued keys throw.
- `$index` is a live signal (positions change under reorder).
- `panel().color(label, sig)` — native color picker.

## 0.2.0 — 2026-08-21

- `data-each` reconciles in place instead of rebuilding all rows: content
  changes cause zero structural DOM mutation. Root cause: Chrome silently
  cancels an in-progress native slider drag when its containing `<fieldset>`'s
  child list changes.
- Paths read through signals mid-path and at the leaf
  (`data-text="snapshot.pose.x"` with `snapshot` as one signal works).
- `effect()` discards non-function returns, so `effect(() => arr.push(x))`
  can't crash as a bogus cleanup.

## 0.1.0 — 2026-08-21

Initial release: hardened alien-signals core (frozen callables), attribute
binder (`data-text/bind/show/disabled/on/each/wheel`, dot-paths only, loud
errors), `panel()` builder on native elements, `series()` ring buffer,
`connect()` reconnecting websocket, polytopy dark theme, zero-dep tests.
