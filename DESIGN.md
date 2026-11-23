# Design: plain-panel

plain-panel is [plain-site](https://github.com/Zaffer/plain-site) for tools that do work:
screens that control hardware, run experiments, or take an operator through a procedure.
It is not aimed at marketing pages, landing pages or blogs: plain-site suits those.

**Read plain-site's [MANIFESTO](https://github.com/Zaffer/plain-site/blob/main/MANIFESTO.md)
first: this guide builds on it.** This file gives what a working screen adds: a little
functional CSS, and suggestions for controls, feedback and layout.

**This is a guide, not a set of rules.** Each item is a default, with its reason. Where a
tool is better without one, leave it out; a comment that says why helps the next reader.
The numbers are there so an item can be pointed at, not to rank them.

The aim is one house style. A tool built with plain-panel, by a person or by an AI agent,
can start from a template in [templates/](templates/) and use this file. Then a new tool
is familiar before anyone has used it.

## 1. Functional CSS

plain-site uses no CSS. A working screen sometimes needs a layout that HTML cannot give:
the stop button and the readouts stay on screen while a log scrolls; a chart fills the free
space. And a screen of several panels needs each panel's edge to show. For this,
plain-panel uses a little CSS. Three questions are worth asking of each rule:

1. **Does it do a job for the operator?** A comment above the rule names the job.
2. **Is it like what is already in use?** The table below lists what the templates use.
   Something new is welcome when it does a job the list cannot.
3. **Does the page work without it?** With every stylesheet off, each label, value, control
   and state is still present and usable. Only the layout is lost.

**A page with CSS gets a ☰ menu** at the start of its status bar: a button that shows
`☰`, with `aria-label="menu"` and `title="menu"` so the word is still there for screen
readers and on hover. Its popover holds a ☾ dark / ☀ light radio group (the theme starts
from the system's), a 🚫 no CSS switch that turns the stylesheet off, and a close button.
The switch puts question 3 one click away, so it gets asked.

| CSS in use | The job it does |
|---|---|
| `display: grid / flex / contents`, `grid-template-*`, `grid-area`, `grid-column`, `gap`, `flex`, `flex-wrap`, `align-items` | divides the screen into regions |
| `height`, `min-height`, `max-height` (`100dvh`, `0`), `overflow: auto` | keeps a region in view; each region scrolls on its own |
| `margin: 0` and `padding` on `body`, `box-sizing` | lets a full-screen layout fit the viewport |
| `@media (max-width: …)` | turns a fixed screen back into one scrolling column on a phone |
| `position: sticky; top: 0` | keeps a status bar in view on a long page |
| `position`, `inset`, `width`, `height` on a `canvas`; `position: relative` on its box | makes a chart fill its region, without its pixel size feeding back into the layout |
| `width: 100%` on `input[type=range]`, `textarea`, `canvas` | a longer slider gives finer control; a wider box shows more |
| `font-variant-numeric: tabular-nums` on `output`, `td` | live numbers keep their width, so they do not jitter |
| `cursor`, `touch-action`, `user-select` on a resize handle; the system `Highlight` colours on it under the pointer or the focus | the handle acts like a handle, and shows when it is live |
| `[hidden] { display: none !important }` | a layout rule (`display: flex`) cannot show a region that state has closed |
| `background` on the page and on each panel region: one page colour, one panel colour, a shade apart | **the panel paint**: each panel is a box with its content inside, and its edge shows without a border taking space |
| `border-radius: 5px` on panels, `fieldset`, `dialog`, `[popover]` | slightly round corners make clear which box a line belongs to, where square corners can be ambiguous |
| the page colour and a `1px` `GrayText` border on `dialog`, `[popover]`; `position-area` on a menu | what floats over the panels reads as a sheet above them, and a menu opens under its button |
| `padding` inside a panel that holds bare text (a status bar) | keeps the text off the panel's edge |

**Usually left out:** text colours, other backgrounds, fonts, font sizes, borders on
regions, shadows, transitions, animation, `content:` strings, `:checked` tricks,
`display: none` for state. Controls keep the browser's look. If one of these does a real
job on your screen, use it, and say what the job is in its comment.

**Where it goes:** one `<style>` element in the `<head>`, short enough to read in one go
(the templates have 10 to 30 rules). Selecting by element or `id` is usually enough, without
a class for appearance. Layout values that the operator drags, like a panel width, come
from script: an effect writes a custom property. A page that does not need CSS has no
`<style>` element.

**The panel paint** is two custom properties, so light and dark follow the system:

```css
:root { --page: light-dark(#ffffff, #000000); --panel: light-dark(#eeeeee, #111111); }
body { background: var(--page); }
#controls, #live, #log { background: var(--panel); border-radius: 5px; }
```

A page with its own theme switch (the demo) sets `data-theme` and redefines the two
properties instead.

**Other colour can come from HTML**, as in plain-site: `<meta name="color-scheme" content="light dark">`,
`<meter low high optimum>`, `<mark>`, `<font color>`, `bgcolor` on table cells. Colour works
best when it shows information (good, bad, which series), not as decoration.

## 2. Pick a screen shape

Three shapes cover most tools. Each one is a template. The closest one is a good start.

| Shape | Layout | For | Template | CSS |
|---|---|---|---|---|
| **Station** | a workbench in the shape of an IDE: top bar; activity bar, side bar, then main over a bottom panel; status bar. Symbols choose the view or page of each region. Drag the grips to resize; the side bar and bottom panel switch off. Fills a window of any size, with no second layout | hardware control, live monitoring, any tool with several jobs on one screen | [templates/station/](templates/station/) | shell, handles, panel paint, floating sheets, 27 rules |
| **Lab** | two columns that wrap: setup on the left, results on the right | experiments, batch jobs: set up, queue, compare | [templates/lab/](templates/lab/) | wrapping columns, panel paint, ~10 lines |
| **Sheet** | one column, a document | procedures, checklists, calibration, data entry, reports | [templates/runsheet/](templates/runsheet/) | none |

**The station is where the look is being worked out.** It tries things before the other
templates have them: selectors that show a symbol alone (item 19), a click on the open
view's symbol to close the side bar, a handle that lights up, floating sheets with a thin
edge, a menu that opens under its button, and one layout for every window size in place of
a phone layout. Two checks are worth keeping on any screen: **the page works with the CSS
off, and it fits a window of any size.**

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
   action and stays the same, so `data-text` on a button is rarely the right tool.

2. **State lives in state controls, not in buttons.** The way the states are named
   suggests the control:
   - **"Is X on?"** One true-or-false statement. A **checkbox** with a fixed label
     (`armed`, `record samples`) fits. If it takes effect at once, add the `switch` attribute.
   - **"Which X?"** Each state has its own name (`dark` / `light`, which trace,
     which page). A **radio group** fits, or a `<select>` for more than about five.
   - **Something that happens once** (`▶️ start`, `⬇️ download`). A **button** fits.

3. **Opposing actions as separate buttons, gated by state.** Arm and disarm, start and
   stop: each gets its own button. With `data-disabled` on each, only the valid one is
   enabled, and the enabled set shows the state.

4. **Keep the stop in reach.** A control that stops motion, power or spending works best
   when it is not disabled, not `inert`, does not scroll out of view, and has an
   `accesskey`. Stopping something that is already stopped then does nothing, safely.

5. **Native elements first.** `output` for live values, `meter` / `progress` for gauges,
   `details` for collapsible groups, `dialog` for confirmation, `datalist` for
   suggestions, `table` for tabular data. A div-built widget or a custom element is the
   last thing to reach for.

6. **Prefer native behaviour to script.** The accordion is `<details name>`, the modal is
   `commandfor` / `command`, the popover is `popovertarget`, validation is `required`,
   `min`, `max`, `pattern`.

7. **Give a popover a close button inside it:**
   `<button popovertarget="menu" popovertargetaction="hide">× close</button>`. Light
   dismiss (a click outside, or Esc) works, but nobody can see that it does, and on a
   phone there may be no outside to click. A `<dialog>` can name its own way out the same
   way (item 8).

8. **Ask before you destroy.** For an action that loses data or cannot be undone, a
   `<dialog>` that names what will be lost is a good guard. Buttons that name the actions
   (`delete 3 runs`, `keep them`) say more than "OK" and "Cancel".

## 4. Feedback: show the ground truth

9. **Give every click a visible result.** The result is that something happened, is
   happening, or failed. Then nobody clicks twice because nothing seemed to happen.

10. **A request has four states worth showing:** idle, pending (`arming…`, `measuring…`),
   done, failed (with the reason). `task()` suits request/response work: it keeps
   `pending` and `error` in the store. A control that is disabled while pending cannot be
   pressed twice.

11. **Show what is, not what was asked.** A setpoint and its measured value are two
    readouts. A command reads best as pending until the device's own state confirms it,
    not when the request returns.

12. **Show the age of live data.** When samples stop, the screen can say so (`🟡 stale 3.2 s`).
    A frozen number that looks live is the worst failure a dashboard can have.

13. **Give numbers units and fixed decimals.** `12.40 V`, not `12.4`. Decimals that stay
    the same while the value changes keep the number still.

14. **A log reads well dated and newest first.** Each line has a time and a level emoji. A
    failure can go in the log and next to the control that caused it.

## 5. Grouping

15. **Put controls in a `fieldset`,** with a `legend` that names the group. A status bar
    (one line of status and commands) and a row of selectors do well without one.

16. **Collapsible groups can go inside the fieldset:** `fieldset > details`. Related
    `details` (one accordion) can share one fieldset.

17. **Put runtime rows in a `div`, not straight into a fieldset with sliders.** Chrome
    cancels a slider drag when a fieldset's child list changes. (See CLAUDE.md.)

## 6. Legibility

18. **Meaning is HTML content.** The page then reads correctly as plain text, to a screen
    reader, to an LLM, and printed. Labels, emoji, units and hints are characters in
    the markup.

19. **Emoji where they help at a glance. Take care with glyphs.** A glyph is a symbol
    character (`▶ ■ ✓ ⋮ ↺ ※ ・`). When the page's font lacks it, a fallback font draws
    it, with its own size and line height, and the fallback differs between systems, and
    between a phone and a desktop. In a button, or in anything that lines up, that
    can make one item taller than its neighbours or sit off the line, on some devices and
    not others. There, an emoji is the safer choice: each system draws every emoji from
    one colour font, sized to the text. Where a small size difference does not matter, a
    glyph is fine: the ⋮ ⋯ grips on resize handles, a separator in running text.
    (plain-site gives the same caution for text pages.)

    - An emoji next to its word is the safe default: the word is what screen readers,
      search and LLMs read.
    - A symbol alone can work where space is tight and the set is small and stays the
      same: the ☰ menu button, the station's view and page selectors. Give it the word in
      `aria-label` and `title`, so it is there for screen readers and on hover, and choose
      a symbol that an operator can learn in one look.
    - An emoji earns its place where it makes a state or an action quicker to see: live or
      stale, pass or fail, pending, a warning, start and stop, delete. One on every legend
      and heading is usually too many.
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
    `no response on COM3: check the cable`. ASD-STE100 Simplified Technical English makes a
    good first draft, as in plain-site.

## 7. Before you finish

A list to look over, for a person or an agent. Not every line fits every tool.

- [ ] Started from a template. `sim.js` is the one file that knows the backend.
- [ ] All state is in the store. Attributes hold paths, not expressions.
- [ ] Each request uses `task()` or shows pending and failure some other way.
- [ ] The stop control stays enabled and has an `accesskey`.
- [ ] Live values show units and their age.
- [ ] The ☰ menu has ☾ dark / ☀ light and 🚫 no CSS. With no CSS, all information and every control are still there.
- [ ] The page fits a small window and a large one.
- [ ] Buttons in a row are one height: emoji (in emoji form, U+FE0F) rather than glyphs inside them.
- [ ] Each input has a name for screen readers (a `label`; `for`/`id` when the label holds an `output`; `aria-label` and `title` on a symbol alone).
- [ ] Each CSS rule does a job, and a comment says which.
- [ ] `npm test` passes (the templates' JS is type-checked).
