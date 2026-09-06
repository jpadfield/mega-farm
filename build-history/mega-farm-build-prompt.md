# Build brief for Claude Code: The Mega-Farm Challenge, web version 1

Paste this whole file into Claude Code, or save it in the project folder and say
"read mega-farm-build-prompt.md and build it".

Before you start, put these files in the project folder:

- `mega-farm-rules-data-v4.md` (the rules and data specification, authoritative for all numbers)
- `The_Mega-Farm_Challenge_v4_Player.docx` (background reading, the human-facing rules)
- `The_Mega-Farm_Challenge_v4_PlayAid.docx` (the one-page summary, a good model for the on-screen layout)

---

## 1. What I want

Build a web version of *The Mega-Farm Challenge*, a two-player co-operative
resource-management game currently played entirely in the head with three coins.
The full rules and every number are in `mega-farm-rules-data-v4.md`. **Read that
file first and treat it as the specification.** Do not invent, round or "improve"
any number in it.

Version 1 is deliberately plain and mostly textual. The point of version 1 is a
correct, complete, well-structured rules engine with a clean and usable interface.
A richer graphical interface comes later, so the code must be organised to make
that easy rather than to make version 1 pretty.

## 2. Audience and constraints

- It must work in a mobile phone browser held in portrait, down to a 360 pixel wide viewport, and in a normal desktop browser window. The same page, responsive, not two versions.
- It is played by an adult and a child on one shared device, passing the phone or sitting at one screen. There is one shared farm and both roles are played on the same screen.
- The code will be read, and eventually edited, by a beginner programmer. Favour clear, boring, well-commented code over clever code. Long descriptive names. No abbreviations that need explaining.

## 3. Technology

- Plain HTML, CSS and vanilla JavaScript with ES modules. **No build step, no bundler, no npm install, no TypeScript, no React.** It must run by opening `index.html` or by serving the folder statically, and it must deploy to GitHub Pages with no pipeline.
- **Bootstrap 5.3 from a CDN** for layout and components, as requested, so that future interface work has a standard framework underneath it. Use Bootstrap's grid, cards, buttons, badges, modals, offcanvas, progress bars and toasts rather than hand-rolled equivalents. Keep custom CSS to a minimum and confined to one file.
- No other runtime dependencies without asking me first.
- Target modern evergreen browsers. No polyfills, no legacy support.

## 4. Architecture

Separate the rules from the interface completely. This is the most important
structural requirement.

```
index.html
css/app.css
js/gamedata.js     all stages, actions, events, milestones, optional rules, as data
js/engine.js       pure game logic, no DOM access whatsoever
js/storage.js      save and resume via localStorage
js/ui.js           rendering and event binding, the only file that touches the DOM
js/main.js         wiring and startup
tests/engine.test.html   a simple in-browser test runner for the engine
README.md
```

### `js/gamedata.js`

Every balance number in the game lives here and nowhere else. Stages, actions,
costs, yields, event tables, milestone steps, finish lines and optional rules are
all declarative data. The design document that accompanies this game is written
around the idea that any balance change should be a single number edit, so the
code must honour that. If a number appears in `engine.js` or `ui.js`, it is in the
wrong place.

Actions should be data objects with a stable `id`, a display name, a role, a cost,
an effect, and a guard describing when they are available. Prefer a small set of
generic effect types (spend, gain, convert, build, sell-any-number, gamble) over
one bespoke function per action, but do not contort the data model to avoid a
special case: a handful of actions genuinely are special and a clearly named
special-case handler is better than an over-general framework.

### `js/engine.js`

- A pure state machine. Given a state and an input, it returns a new state. It must never read or write the DOM.
- Public surface roughly: `createGame(options)`, `rollChance(state)`, `resolveEvent(state, choice)`, `availableActions(state, role)`, `takeAction(state, role, actionId, options)`, `endTurn(state)`, `applyMilestones(state)`.
- `availableActions` must return, for every action in the stage, whether it is currently possible and if not, a short human-readable reason ("Not enough Wood", "Bad Weather stops timber this turn", "Already built"). The interface will show unavailable actions greyed out with the reason, because seeing what you cannot yet afford is part of the game's decision-making.
- **Use a seeded pseudo-random number generator**, not `Math.random()`, and keep the seed in the game state. This makes games reproducible, makes tests deterministic, and lets a specific game be replayed or shared later. A small xorshift or mulberry32 implementation in about ten lines is plenty.
- Keep a full log of everything that happened, turn by turn, in the state.

Pay particular attention to section 12 of the rules specification, which lists the
eight behaviours most likely to be got wrong: turn-scoped price modifiers,
action bans, lost actions, pay-or-suffer prompts, the deferred Over-Water
obligation that lands on the *next* turn, the Stage 1 and 2 crop store limit,
halving with rounding down, and milestones that trigger part way through a turn.

### `js/ui.js`

Renders the whole interface from the current state each time it changes. Keep it
simple: a full re-render of the changed panels is fine at this scale, no virtual
DOM, no reactive framework.

## 5. Screens and interface for version 1

### Setup screen

- Two name boxes, defaulting to "Player 1" and "Player 2", and a choice of who starts as Planter.
- Finish line: 10, 25, 50, 100 or 250 Plots, with the expected turn count shown next to each.
- Chance method: three coins (default) or two dice.
- Optional rules: five toggles, all off by default, each with its one-line explanation.
- A "Resume saved game" button if a save exists.

### Main play screen

Single column on a phone, two columns from Bootstrap's `md` breakpoint upwards.
Top to bottom:

1. **Header.** Stage name and number, current titles for both players, turn number, and a progress bar of Plots towards the chosen finish line.
2. **The ledger.** The tracked resources for the current stage, in that stage's fixed ledger order, as large clear numbers. Resources that do not exist in the stage are not shown. When a value changes, show the change briefly next to it.
3. **The event.** Show the chance result as three coin faces or two dice, then the event name and what it does. If the event needs a decision, show the buttons here. Nothing else is clickable until the event is resolved.
4. **The two action panels.** One for the Planter and one for the Builder, clearly labelled with who is currently playing which. Each action is a full-width button showing its name, its cost and what it gives, using the same "2 Crops > 6 Crops" style as the printed play aid. Unavailable actions are disabled and show the reason. The panel for the role whose turn it is not yet is visually dimmed.
5. **End of turn.** A ledger line in the stage's fixed order, phrased as the chant the players say out loud, for example "Fourteen coins, six wood, eleven crops, three plots." Then a large "Next turn" button.

### Supporting views

- **History.** A table with one row per turn and one column per resource, matching the paper grid the printed rules suggest. Reachable from a Bootstrap offcanvas panel so it does not clutter the phone screen.
- **Rules reference.** The current stage's action list and event table, in a modal, so nobody has to leave the game to check a number. Generate it from `gamedata.js` rather than writing it out again.
- **Milestone screen.** When a milestone triggers, take over the screen and walk through the conversions one step at a time, showing each one ("You had 17 Wood, that becomes 8 Fuel"). These moments are the most confusing part of the tabletop game and are the single biggest thing the digital version can improve.
- **Win screen.** Plots reached, turns taken, and a short summary of the game.

### Interface details that matter

- Buttons must be large enough for a child to tap accurately. Bootstrap `btn-lg` throughout on small screens.
- Never rely on colour alone to convey meaning. Every hazard, bonus and disabled state needs a word or an icon as well.
- Confirm destructive or irreversible choices only where the game does. Do not add undo in version 1, but do not make the state impossible to undo later: keep the turn-by-turn log rich enough that undo could be added.
- No sound in version 1.

## 6. Saving

Save the full game state to `localStorage` after every turn, and offer resume on
startup. The 250 Plot campaign is explicitly designed to be played across several
sittings, so this is a real requirement rather than a nicety. Also provide
"Export game" and "Import game" buttons that copy the state to and from a JSON
text box, so a game can be moved between devices.

## 7. Tests

Provide `tests/engine.test.html`, a plain page that runs assertions against
`engine.js` and prints passes and failures. No test framework. Cover at least:

- The starting state is exactly 10 Coins, 10 Wood, 10 Crops, 2 Plots.
- The Stage 1 crop store limit clamps a gain at 5 times Plots, including a gain from Perfect Weather.
- Halving events round down, and no resource can go below zero.
- A failed Over-Water gamble creates an obligation that is presented to the Builder on the following turn, and that costs the Builder the action if there is no Wood.
- The 25 Plot milestone converts Wood to Fuel rounding down, sells Eggs at 5 Coins, removes the eight retired actions and starts automatic production.
- The 50 Plot milestone moves Tractor Harvest from the Planter to the Builder.
- The 100 Plot milestone converts Crops to Crates at 10 to 1 and sells the remainder at 2 Coins.
- Turn-scoped modifiers such as Good Prices apply on the turn they appear and are gone on the next turn.
- A full game played with a fixed seed by a simple scripted policy reaches the finish line and never produces a negative total.

## 8. Decisions I have already made

Follow these unless you find a concrete reason they break the rules, in which case
stop and ask.

1. **One device, both roles.** Not networked, not two separate farms.
2. **The app enforces the rules.** It is a game, not a scoresheet. There is no free-text editing of totals in version 1.
3. **Carried-over "small change" actions stay available** wherever the rules keep them, and appear at the bottom of the action list, visually separated, since the rules describe them as insurance rather than options.
4. **In Stage 5, Expand Fields, Expand Pastures and Acquire Acreage remain available.** The rules do not say explicitly, and this is my ruling rather than something the document states. Put it in `gamedata.js` as a single flag with a comment saying it is a house ruling, so it can be reversed in one edit.
5. **Automatic production is calculated after the chance check** so that Bumper Crop and Drought can affect it, even though the printed turn order lists production first. Note this in a comment as a deliberate divergence from the printed order.
6. **Warn before crossing 100 Plots while holding Crates**, since they lose value across that milestone. A warning only, never a block.

## 9. What I do not want in version 1

- No graphics, illustrations or animations beyond what Bootstrap gives for free.
- No accounts, no server, no analytics, no network calls other than the Bootstrap CDN.
- No AI opponent, no solo mode.
- No difficulty settings beyond the optional rules already in the game.

## 10. Deliverables

1. The working application, in the structure above.
2. A `README.md` covering how to run it, how the files fit together, and, in a section written for a beginner, exactly where to go to change a number, add an event or add an action.
3. A short `NOTES.md` listing anything in the rules you found ambiguous and what you assumed, so I can rule on it and correct the source documents.

Build the engine and its tests first, and get the tests passing, before writing any
interface code.
