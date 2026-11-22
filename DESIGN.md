# Design: plain-panel

plain-panel is [plain-site](https://github.com/Zaffer/plain-site) for tools that do work:
screens that control hardware, run experiments, or take an operator through a procedure.
It is not for marketing pages, landing pages or blogs. Use plain-site for those.

**Read plain-site's [MANIFESTO](https://github.com/Zaffer/plain-site/blob/main/MANIFESTO.md)
first. All of it applies here.** This file gives only what a working screen adds: one
exception (a few lines of functional CSS), and the rules for controls, feedback and layout.

The goal is one house style. Every tool built with plain-panel, by a person or by an AI
agent, starts from a template in [templates/](templates/) and follows this file. Then a
new tool is familiar before anyone has used it.

## 1. The exception: functional CSS

plain-site uses no CSS. A working screen sometimes needs a layout that HTML cannot give:
the stop button and the readouts stay on screen while a log scrolls; a chart fills the free
space. And a screen of several panels needs each panel's edge to show. For this,
plain-panel permits CSS. Each rule must pass three tests:

1. **It does a job for the operator.** A comment above the rule names the job.
2. **It is on the allowlist** below.
3. **The page works without it.** With every stylesheet off, each label, value, control
   and state is present and usable. Only the layout is lost.

**Every page with CSS has a ☰ menu** at the start of its status bar: a button that shows
only `☰`, with `aria-label="menu"` and `title="menu"` so the word is still there for screen
readers and on hover. Its popover holds a ☾ dark / ☀ light radio group (the theme starts
from the system's), a 🚫 no CSS switch that turns the stylesheet off, and a close button. The switch is the test above, one click away, so it gets used.

| Allowed | The job it does |
|---|---|
| `display: grid / flex / contents`, `grid-template-*`, `grid-area`, `grid-column`, `gap`, `flex`, `flex-wrap`, `align-items` | divides the screen into regions |
| `height`, `min-height`, `max-height` (`100dvh`, `0`), `overflow: auto` | keeps a region in view; each region scrolls on its own |
| `margin: 0` and `padding` on `body`, `box-sizing` | lets a full-screen grid fit the viewport |
| `@media (max-width: …)` | turns a fixed screen back into one scrolling column on a phone |
| `position: sticky; top: 0` | keeps a status bar in view on a long page |
| `position`, `inset`, `width`, `height` on a `canvas`; `position: relative` on its box | makes a chart fill its region, without its pixel size feeding back into the layout |
| `width: 100%` on `input[type=range]`, `textarea`, `canvas` | a longer slider gives finer control; a wider box shows more |
| `font-variant-numeric: tabular-nums` on `output`, `td` | live numbers keep their width, so they do not jitter |
| `cursor`, `touch-action`, `user-select` on a resize handle; `display: none` on it in the phone layout | the handle acts like a handle, and goes when there is nothing to resize |
| `background` on the page and on each panel region: one page colour, one panel colour, a shade apart | **the panel paint**: each panel is a box with its content inside, and its edge shows without a border taking space |
| `border-radius: 5px` on panels, `fieldset`, `dialog`, `[popover]` | slightly round corners make clear which box a line belongs to, where square corners can be ambiguous |
| `padding` inside a panel that holds bare text (a status bar) | keeps the text off the panel's edge |

**Not allowed:** text colours, other backgrounds, fonts, font sizes, borders, shadows,
transitions, animation, `content:` strings, `:checked` tricks, `display: none` for state.
Controls keep the browser's look.

**Where it goes:** one `<style>` element in the `<head>`, under 30 lines. Select by element
or `id`. No class for appearance. No CSS file, no CSS from script (layout values that the
operator drags, like a panel width, are the one exception: an effect writes a custom
property). A page that does not need CSS has no `<style>` element.

**The panel paint** is two custom properties, so light and dark follow the system:

```css
:root { --page: light-dark(#ffffff, #000000); --panel: light-dark(#eeeeee, #111111); }
body { background: var(--page); }
#controls, #live, #log { background: var(--panel); border-radius: 5px; }
```

A page with its own theme switch (the demo) sets `data-theme` and redefines the two
properties instead.

**Other colour is HTML**, as in plain-site: `<meta name="color-scheme" content="light dark">`,
`<meter low high optimum>`, `<mark>`, `<font color>`, `bgcolor` on table cells. Colour shows
information (good, bad, which series). It never decorates.

## 2. Pick a screen shape

Three shapes cover most tools. Each one is a template. Start from the closest one.

| Shape | Layout | For | Template | CSS |
|---|---|---|---|---|
| **Station** | a workbench in the shape of an IDE: top bar; side bar beside main over a bottom panel; status bar. Each region is a tab row over one page. Drag the gaps to resize; the side bar and bottom panel switch off. Fills a window of any size, with no second layout | hardware control, live monitoring, any tool with several jobs on one screen | [templates/station/](templates/station/) | shell, handles, panel paint, look, 24 rules |
| **Lab** | two columns that wrap: setup on the left, results on the right | experiments, batch jobs: set up, queue, compare | [templates/lab/](templates/lab/) | wrapping columns, panel paint, ~10 lines |
| **Sheet** | one column, a document | procedures, checklists, calibration, data entry, reports | [templates/runsheet/](templates/runsheet/) | none |

**The station is where the look is being worked out.** It goes past the §1 allowlist in
four places, each one commented in its `<style>`: a system interface font on `body` (so the
text matches the native controls beside it), the system `Highlight` colour on a resize
handle under the pointer or the focus, `[hidden] { display: none !important }` (so a layout
rule can never show a closed region), and it has no phone layout (the shell fills any
window instead). The two tests that do not bend: **the page works with the CSS off, and it
fits a window of any size.** What proves itself there moves into §1.

Each template has the same parts:

```
index.html   the screen: plain HTML with data-* paths, and the <style> if the shape needs it
app.js       the store (signals, computeds, tasks, actions) and one bind() call
sim.js       a fake backend behind a narrow API. Replace it with the real one;
             keep the API, and app.js does not change
chart.js     (station, lab) a canvas line chart behind a narrow API: draw(lines)
```

## 3. Controls

1. **One button, one action.** A button does one thing each time. Its label names that
   action and does not change. No `data-text` on a button.

2. **State lives in state controls, not in buttons.** Pick the control by how the states
   are named:
   - **"Is X on?"** One true-or-false statement. Use a **checkbox** with a fixed label
     (`armed`, `record samples`). If it takes effect at once, add the `switch` attribute.
   - **"Which X?"** Each state has its own name (`dark` / `light`, which trace,
     which page). Use a **radio group**, or a `<select>` for more than about five.
   - **Something that happens once** (`▶️ start`, `⬇️ download`). Use a **button**.

3. **Opposing actions are separate buttons, gated by state.** Arm and disarm, start and
   stop: each gets its own button. Bind `data-disabled` so only the valid one is enabled.
   The enabled set shows the state.

4. **The stop is always there.** A control that stops motion, power or spending is never
   disabled, never `inert`, never scrolls out of view, and has an `accesskey`. Stopping
   something that is already stopped does nothing, safely.

5. **Native elements only.** `output` for live values, `meter` / `progress` for gauges,
   `details` for collapsible groups, `dialog` for confirmation, `datalist` for
   suggestions, `table` for tabular data. No div-built widgets, no custom elements.

6. **Prefer native behaviour to script.** The accordion is `<details name>`, the modal is
   `commandfor` / `command`, the popover is `popovertarget`, validation is `required`,
   `min`, `max`, `pattern`.

7. **Every popover has a close button inside it:**
   `<button popovertarget="menu" popovertargetaction="hide">× close</button>`. Light
   dismiss (a click outside, or Esc) works, but nobody can see that it does, and on a
   phone there may be no outside to click. A `<dialog>` names its own way out the same
   way (rule 8).

8. **Ask before you destroy.** An action that loses data or cannot be undone opens a
   `<dialog>` that names what will be lost. Its buttons name the actions (`delete 3 runs`,
   `keep them`), not "OK" and "Cancel".

## 4. Feedback: show the ground truth

9. **Every click has a visible result.** The result is that something happened, is
   happening, or failed. Nobody clicks twice because nothing seemed to happen.

10. **Every request has four visible states:** idle, pending (`arming…`, `measuring…`),
   done, failed (with the reason). Use `task()` for request/response work: it keeps
   `pending` and `error` in the store. While pending, the control is disabled.

11. **Show what is, not what was asked.** A setpoint and its measured value are two
    readouts. A command shows as pending until the device's own state confirms it, not
    when the request returns.

12. **Show the age of live data.** When samples stop, the screen says so (`🟡 stale 3.2 s`).
    A frozen number that looks live is the worst failure a dashboard can have.

13. **Numbers carry units and fixed decimals.** `12.40 V`, not `12.4`. The decimals do not
    change while the value changes.

14. **A log is dated and newest first.** Each line has a time and a level emoji. A failure
    goes in the log and next to the control that caused it.

## 5. Grouping

15. **Every control sits in a `fieldset`,** and its `legend` names the group. Exception:
    the status bar, which is one line of status and commands.

16. **Collapsible groups go inside the fieldset:** `fieldset > details`. Related
    `details` (one accordion) share one fieldset.

17. **Runtime rows go in a `div`, not straight into a fieldset with sliders.** Chrome
    cancels a slider drag when a fieldset's child list changes. (See CLAUDE.md.)

## 6. Legibility

18. **Meaning is HTML content.** The page reads correctly as plain text, to a screen
    reader, to an LLM, and printed. Labels, emoji, units and hints are characters in
    the markup.

19. **Emoji where they help at a glance. Be careful with glyphs.** A glyph is a symbol
    character (`▶ ■ ✓ ⋮ ↺ ※ ・`). When the page's font lacks it, a fallback font draws
    it, with its own size and line height, and the fallback differs between systems, and
    between a phone and a desktop. In a button, or in anything that must line up, that
    can make one item taller than its neighbours or sit off the line, on some devices and
    not others. There, use an emoji: each system draws every emoji from one colour font,
    sized to the text. Where a small size difference does not matter, a glyph is fine:
    the ⋮ ⋯ grips on resize handles, a separator in running text. (plain-site gives the
    same caution for text pages.)

    - Put an emoji next to the word, never instead of it: the word is what screen
      readers, search and LLMs read. The one exception is the ☰ menu button, which
      carries its word in `aria-label` and `title` (§1).
    - Use one where it makes a state or an action quicker to see: live or stale, pass or
      fail, pending, a warning, start and stop, delete. Not on every legend and heading.
    - Write the emoji form. A character with two forms (`▶ ⏹ ⏸ ⚠ ⬇ 🗑 ℹ ☀`) needs U+FE0F
      after it (`⏹️`), or it draws as a text glyph and has the glyph's problem.

    The house set, so the same emoji means the same thing in every tool:

| Emoji | Means | Emoji | Means |
|---|---|---|---|
| ▶️ | start, run, resume, take a reading | ⏹️ | stop, cancel a run |
| ⏸️ | pause | ⏳ | pending, queued (`⏳ arming…`) |
| ✅ | done, pass | ❌ | failed |
| ⚠️ | warning, fault, armed | ℹ️ | information (a log line) |
| 🟢 | live | 🟡 | stale |
| ⚪ | offline | 🔒 | locked: an earlier step is not done |
| 🔌 | connect | 🔎 | inspect |
| ⬇️ | download | 💾 | save |
| 🗑️ | delete, remove | 🔄 | reset to defaults |

20. **Write plainly.** Labels are short nouns. Messages say what happened and what to do:
    `no response on COM3: check the cable`. Use ASD-STE100 Simplified Technical English as
    the first draft, as plain-site does.

## 7. Before you finish

A checklist for a person or an agent:

- [ ] Started from a template. `sim.js` is the only file that knows the backend.
- [ ] All state is in the store. Attributes hold paths, not expressions.
- [ ] Every request uses `task()` or shows pending and failure some other way.
- [ ] The stop control is always enabled and has an `accesskey`.
- [ ] Live values show units and their age.
- [ ] The ☰ menu has ☾ dark / ☀ light and 🚫 no CSS. With no CSS, all information and every control are still there.
- [ ] Buttons in a row are one height: emoji (in emoji form, U+FE0F) rather than glyphs inside them.
- [ ] Every input has a name for screen readers (a `label`; `for`/`id` when the label holds an `output`).
- [ ] In CSS, no colour but the panel paint, no font, no border. No class for appearance.
- [ ] `npm test` passes (the templates' JS is type-checked).
