# Notes on the rules

Questions that `mega-farm-rules-data-v4.md` did not settle, and what this build
assumed. Every one of them is a decision that could reasonably have gone the
other way, so they are collected here for you to rule on. Where an assumption is
easy to reverse, the note says where.

Nothing here changes a printed number. All the numbers are exactly as specified.

---

## 1. The Mercy Rule and three bad turns in a row

**The rule.** "If a hazard or disaster comes up on two turns in a row, the second
one is ignored."

**The question.** Turn 4 is a hazard. Turn 5 is a hazard and is ignored. Turn 6
is a hazard as well. Is turn 6 ignored too?

Read literally, yes: turn 5 was a hazard, so turn 6 is the second of two in a
row. But then so is turn 7, and turn 8, and once the bad weather sets in the
farm becomes permanently immune, which is plainly not the intention.

**Assumed.** A turn that was itself ignored does not count as the previous bad
turn. So hazards on turns 4, 5 and 6 mean turn 5 is ignored, turn 6 lands, and a
hazard on turn 7 would be ignored again. The rule alternates rather than chains.

**Where.** `endTurn` in `js/engine.js`, where `previousTurnWasHazard` is set.

---

## 2. The Lean Season in Stage 5

**The rule.** "If a turn ends with no Coins and no Crops at all, lose 1 Plot."

**The question.** Crops do not exist in Stage 5. They were all converted into
Crates at the 100 Plot milestone and the Crop line leaves the ledger. Is the
condition therefore impossible to meet, or does it reduce to "no Coins"?

**Assumed.** It reduces to "no Coins". The rule is about the farm being flat
broke, and in Stage 5 being flat broke means having no Coins. Reading it the
other way would quietly switch the optional rule off for the whole of the last
and longest stage, which seems the wrong way round: the rule matters most where
the numbers are biggest.

**Where.** `applyLeanSeasonIfNeeded` in `js/engine.js`.

---

## 3. The crop store limit when Plots are lost

**The rule.** In Stages 1 and 2, the barn holds 5 Crops for every Plot.

**The question.** The limit depends on the number of Plots, and Plots can fall —
a failed Over-Water costs one. If the farm holds 40 Crops on 8 Plots and then
drops to 7 Plots, the limit is now 35. Do 5 Crops rot?

**Assumed.** No. The limit is checked only when Crops are *gained*, and anything
above it is lost at that moment. It is never applied retrospectively. The rules
describe the limit as a cap on what you can take in, and taking food out of a
barn because the field next door flooded would be a surprising thing for the
game to do to a child.

The farm can therefore sit temporarily above its own limit. It simply cannot
gain anything until it is back under.

**Where.** `addResources` in `js/engine.js`.

---

## 4. The flooded field, when there is no Wood

**The rule.** A failed Over-Water floods the field. The Builder must spend 2 Wood
next turn to drain it, and if there is no Wood, the Builder loses the action.

**The question.** Two things are unclear. First, if the Builder *can* pay, does
draining the field use up the action, or is it a bill paid before the action?
Second, if the Builder cannot pay, is the debt cleared or does it carry on to the
turn after?

**Assumed.** Paying is a bill, not an action: the Builder spends 2 Wood and then
takes a normal action as usual. Not paying costs the action, and either way the
obligation is discharged and does not roll forward. The penalty is losing a turn,
once, and a debt that follows the farm around until it finds 2 Wood would be a
much harsher rule than the text suggests.

Note that the obligation lands on *the other player*, because the roles swap
every turn. Whoever gambled is the Planter next turn and watches somebody else
pay for it. This is clearly deliberate in the rules and is well worth pointing
out to a child at the table.

**Where.** `resolveObligation` in `js/engine.js`.

---

## 5. A finish line that is also a milestone

**The question.** The finish lines are 10, 25, 50, 100 and 250 Plots. Four of
those are also milestone numbers. If the finish line is 25 Plots and an action
takes the farm from 23 to 26, does the 25 Plot milestone happen first?

**Assumed.** No. The game ends. Working through a long milestone checklist, which
retires eight actions and starts a new stage nobody will ever play, only to
announce that the game finished three steps ago, would be a peculiar way to end a
children's game.

**Where.** `takeAction` and `applyMilestones` in `js/engine.js` check for the end
of the game before they check for a milestone.

---

## 6. Automatic production and the chance check

**Not an ambiguity but a stated decision**, recorded here for completeness.

The printed turn order collects automatic production at step 2 and draws the
event at step 3. But Bumper Crop triples production and Drought stops it, so on
the printed order neither could ever apply. This build resolves the chance check
first and then collects production. Everything else about the event still happens
after production, exactly as printed.

**Where.** `resolveEvent` in `js/engine.js`, under a comment headed DELIBERATE
DIVERGENCE FROM THE PRINTED TURN ORDER.

---

## 7. Small land actions in Stage 5

**A house ruling of yours**, recorded here so it is not mistaken for something
the rules said.

The rules do not say whether Expand Fields, Expand Pastures and Acquire Acreage
survive into Stage 5. Your ruling is that they do, as small change for a poor
turn.

**Where.** `HOUSE_RULINGS.smallLandActionsSurviveIntoStage5` in `js/gamedata.js`.
Set it to `false` and they vanish from Stage 5. Nothing else needs changing.

---

## 8. Small things that needed a decision but probably do not need a ruling

- **Passing is always allowed.** The rules do not list "do nothing" as an action,
  but a turn where a player can afford nothing at all has to be able to end. Pass
  sits at the foot of each player's main list, above the small change actions,
  and is always available.

- **Prices changed for one turn are shown changed.** When an event alters what an
  action costs or gives, the buttons and the rules reference both show the new
  numbers, with a "Changed this turn" badge. The alternative — showing the
  printed number and applying a different one — would be simply misleading.

- **Selling any number is one action.** Sell to the Bakery and Bulk Export let
  you sell as much as you like in a single action, so the app asks how many with
  a number box rather than making you press the button repeatedly.

- **Pay-or-suffer with nothing to pay with.** If the farm cannot afford any of
  the payment options, no question is asked and the penalty simply happens. The
  rules imply this; the app says so on screen rather than offering buttons that
  cannot be pressed.

- **The Lucky Re-flip is offered while the event is on the table**, after you
  have seen what you got. That is the only moment at which it could be a decision
  rather than a formality.

- **Warning before crossing 100 Plots with Crates.** A warning, never a block, as
  you asked. It appears on any action that would cross the line while the farm
  still holds Crates.
