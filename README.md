# The Mega-Farm Challenge

A web version of *The Mega-Farm Challenge*, a co-operative farming game for two
players — usually a grown-up and a child — sharing one screen.

One of you is the **Planter** and the other is the **Builder**. Every turn you
flip three coins to see what the weather and the world have done to you, then
each of you takes one action. You swap jobs every turn. The farm grows from two
Plots to whatever finish line you agreed on, through five stages, and if you get
far enough the whole thing stops being about growing vegetables and starts being
about running an empire.

You both win together, or you both do not. There is no way to play against each
other, which is rather the point.

## How to run it

**The easy way.** Open `index.html` in a web browser. Double-click it, or drag
it onto a browser window. That is all.

**If that does not work.** Some browsers refuse to load JavaScript modules from
a plain file, for security reasons. If the page appears but nothing happens,
serve the folder instead. From this folder, in a terminal:

```
python3 -m http.server 8000
```

then visit <http://localhost:8000> in your browser.

**On the web.** The whole thing is static files, so it can be published to
GitHub Pages exactly as it is. In the repository settings, turn on Pages and
point it at this branch and the root folder. There is nothing to build and
nothing to install.

The only thing fetched from the internet is Bootstrap, the styling library, from
a public CDN. Everything else is in this folder.

## How to play

1. Fill in your two names, choose a finish line, and press **Start the farm**.
   Everything else on the setup screen is optional and can be ignored the first
   time.
2. Press the button to flip the three coins. The coins read as a number from 0
   to 7 — heads is 1 and tails is 0, worth 4, 2 and 1 from left to right — and
   that number picks the event.
3. Read what happened. If it asks you a question, answer it.
4. The Planter takes one action, then the Builder takes one action. Buttons you
   cannot afford are greyed out and say why.
5. Say the ledger out loud together, press **Next turn**, and swap jobs.

The game saves itself after every turn, so you can close the tab and come back.
The 250 Plot campaign is meant to take several sittings.

## How the files fit together

```
index.html              the page itself: empty panels waiting to be filled in
css/app.css             the small amount of styling Bootstrap does not provide
js/gamedata.js          every number in the game, as plain data
js/engine.js            the rules
js/storage.js           saving, loading, exporting and importing
js/ui.js                everything that appears on the screen
js/main.js              the wiring that joins the other three together
tests/engine.test.html  a page that checks the rules are being followed
NOTES.md                questions the rules did not answer, and what was assumed
```

They are arranged in layers, and each layer only knows about the ones below it:

- **`gamedata.js`** knows nothing about anything. It is a long list of facts:
  Plant and Harvest costs 2 Crops and gives 6 Crops; the 25 Plot milestone turns
  Wood into Fuel two for one. It contains no logic at all.
- **`engine.js`** reads `gamedata.js` and knows the rules. Give it a game and a
  thing a player wants to do, and it hands back a new game with that thing done.
  **It never touches the screen.** There is not a single mention of a button or a
  colour anywhere in it. That is what makes it testable.
- **`storage.js`** turns a game into text and back again.
- **`ui.js`** is the only file that touches the screen. It asks the engine
  questions ("what can the Builder do?") and draws the answers. It never decides
  anything about the rules itself.
- **`main.js`** holds the one game being played and passes messages between
  `ui.js` and `engine.js`. It is the shortest file, on purpose.

The important consequence: **the rules and the screen never mix.** A later
version can throw `ui.js` away and draw pretty pictures instead, and the game
will still play exactly the same, because the rules are somewhere else.

### One thing worth knowing about the engine

Engine functions never change the game you give them. They make a copy, change
the copy, and hand the copy back. So this does nothing at all:

```js
engine.takeAction(gameState, 'planter', 'plant-and-harvest', {});
```

and this is what you actually want:

```js
gameState = engine.takeAction(gameState, 'planter', 'plant-and-harvest', {});
```

This is why the game can be saved, replayed and eventually undone.

## Running the tests

Open `tests/engine.test.html` in a browser, the same way as `index.html`. It
runs about sixty checks against the rules and prints a green line for each one
that passes and a red line for each one that does not. If you have changed a
number in `gamedata.js`, some tests will fail on purpose — they check the
printed numbers — and the failure message will tell you which number moved.

---

# For a beginner: where to change things

Everything in this section happens in **`js/gamedata.js`** and nowhere else.
After any change, open `tests/engine.test.html` to see whether you have broken a
rule, then reload `index.html` and play.

You will need a plain text editor. Not a word processor. Anything that says
"code" or "text" is fine.

## Changing a number

Every number in the game is in `js/gamedata.js`, once, and only once. If a
number appears anywhere else, that is a mistake in the code.

Say Plant and Harvest feels too generous. Find it:

```js
'plant-and-harvest': {
  id: 'plant-and-harvest',
  name: 'Plant and Harvest',
  defaultRole: 'planter',
  kind: 'convert',
  cost: { crops: 2 },
  gain: { crops: 6 },
  ...
```

Change `gain: { crops: 6 }` to `gain: { crops: 5 }`, save the file, reload the
page. That is the entire job. The button will say "2 Crops > 5 Crops", the rules
reference will agree, and the history will add up.

The same is true everywhere:

- **What the farm starts with** — `STARTING_RESOURCES`, near the top.
- **How many Crops a barn holds** — `cropStoreLimitPerPlot` on each stage in
  `STAGES`. It is `5` in Stages 1 and 2 and `null` afterwards, `null` meaning
  no limit at all.
- **What free food each stage produces** — `automaticProduction` on each stage.
- **The finish lines and how long they take** — `FINISH_LINES`.
- **What the milestones convert** — the `steps` inside `MILESTONES`.
- **What the optional rules do** — `OPTIONAL_RULES`.

A warning about one particular number. Some numbers are also written into the
words the players read, for instance a milestone step whose `detail` says "two
Wood for one Fuel". If you change the conversion, change the sentence to match,
or the game will do one thing and say another.

## Adding an event

Each stage has exactly **eight** events, one for each of the eight possible coin
results. You cannot add a ninth without adding a ninth coin result. So adding an
event really means replacing one.

Events live in `STAGE_1_EVENTS` and its four brothers. Here is a simple one:

```js
{
  id: 'stage-1-good-weather',
  slot: 3,
  name: 'Good Weather',
  text: 'A fine week. Gain 2 Crops.',
  effects: [
    { type: 'gain', amounts: { crops: 2 } }
  ]
},
```

- `slot` says which coin result brings it. Slot 1 is three heads, the luckiest;
  slot 8 is three tails, the worst. `CHANCE_SLOTS` near the top of the file lists
  all eight. **Do not have two events in one stage with the same slot.**
- `id` must be unique across the whole file.
- `text` is what the players read, so write it the way you would say it.
- `effects` is a list, and they happen in order.

The effect types you can use, all listed with an explanation in the comment
above `STAGE_1_EVENTS`:

| Type | What it does |
| --- | --- |
| `gain` | Adds resources. A full barn may cut this short. |
| `lose` | Takes resources away, never below zero. |
| `loseAll` | Takes every last one of something. |
| `halve` | Halves something, rounding down. |
| `priceChange` | Changes an action's cost or gain, **for this turn only**. |
| `banAction` | Stops named actions being taken this turn. |
| `banExports` | Stops every action marked `isExport` this turn. |
| `loseAction` | One of the two players takes no action this turn. |
| `foxEggs` | The Sneaky Fox's own particular arithmetic. |

An event can also carry a `choice`, which is a pay-or-suffer question ("pay 3
Coins or lose 2 Crops"), and a `productionMultiplier`, which scales that stage's
free production for one turn — 3 is a Bumper Crop and 0 is a Drought.

Copy an existing event that does roughly what you want and change it. That is
much easier than writing one from nothing, and it is what the existing events
were written by doing.

## Adding an action

This takes two steps, because an action has to exist *and* somebody has to be
allowed to do it.

**Step one: describe the action.** Add it to `ACTIONS`:

```js
'dig-a-pond': {
  id: 'dig-a-pond',
  name: 'Dig a Pond',
  defaultRole: 'builder',
  kind: 'convert',
  cost: { wood: 3, coins: 2 },
  gain: { crops: 4 }
},
```

The `kind` is the shape of the action, and there are only five:

| Kind | Meaning | Example |
| --- | --- | --- |
| `convert` | Spend the cost, gain the gain. | Plant and Harvest |
| `build` | Spend the cost, get a building. Once only. | Build the Tool Shed |
| `sellAnyNumber` | Sell as many as you like, at a price each, all in one action. | Sell to the Bakery |
| `gamble` | Do the exchange, then flip a coin for a consequence. | Over-Water |
| `pass` | Do nothing. There is only one of these and you already have it. | Pass |

Most new actions are `convert`, which is the simplest.

**Step two: let somebody do it.** An action nobody can reach will never appear.
Find the stage in `STAGES` and add the id to one of its four lists:

```js
builderActions: ['gather-timber', 'build-fence', 'dig-a-pond'],
```

The four lists are `planterActions`, `planterSmallChangeActions`,
`builderActions` and `builderSmallChangeActions`. The "small change" ones appear
at the bottom of the panel, under a line, because the rules treat them as what
you fall back on when you cannot afford anything better.

Note that the *stage* decides who may do an action, not the action itself. That
is deliberate: Tractor Harvest belongs to the Planter until 50 Plots and to the
Builder afterwards, so it appears in different lists in different stages. The
`defaultRole` on the action is only a note to remind you who usually does it;
the engine does not read it.

Reload the page and your new button is there, correctly greyed out with a reason
when the farm cannot afford it, listed in the rules reference, and recorded in
the history when it is used. You do not have to write any of that.

## Where not to make changes

If you find yourself typing a number into `engine.js` or `ui.js`, stop. It
belongs in `gamedata.js`, and putting it anywhere else means the same number now
lives in two places and will eventually disagree with itself.
