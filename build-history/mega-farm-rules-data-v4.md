# The Mega-Farm Challenge, Version 4: rules and data specification

This file is the authoritative specification of numbers and behaviour for the
digital version. It is extracted from *The Mega-Farm Challenge v4, Player edition*
and the v4 play aid. Where the two disagree with this file, the Word documents win
and this file should be corrected.

Every number here should live in one place in the code (`js/gamedata.js`) so that a
balance change is a one-line edit.

---

## 1. Core concepts

| Concept | Definition |
| --- | --- |
| Resources | Coins, Wood, Crops, Eggs, Fuel, Crates, Plots. Not all exist in all stages. |
| Roles | The Planter and The Builder. There is **one shared farm**, not two. |
| Role swap | The two people swap roles at the start of every turn. |
| Actions per turn | Exactly one Planter action and one Builder action. |
| Win condition | Reach the agreed number of Plots. |
| Titles | Cosmetic only. Planter / Builder, then Head at 25 Plots, then Chief at 100 Plots. |

### Turn sequence

1. Swap roles (on turn 1, simply assign them).
2. Collect automatic production (Stage 3 onwards only).
3. Chance check: flip three coins or roll two dice.
4. Resolve the event immediately.
5. The Planter takes one action.
6. The Builder takes one action.
7. Say the ledger, in the stage's fixed ledger order.

### Standing rules

- No total may ever go below zero. If an event removes more than you hold, you lose all of it.
- Events happen **before** actions, so a price change applies to that same turn.
- Store limits are checked the instant a resource is gained; the excess is lost at once.
- If a milestone is crossed mid-turn, finish the current action, then process the milestone in full, then continue.
- One-off buildings can be built once only, and building one costs a whole action.
- If an event offers a payment to avoid a penalty and the farm cannot afford it, the penalty simply happens.
- A role may always pass.

---

## 2. Chance

### Coin method (default)

Flip three coins. Heads is 1, tails is 0. First coin is worth 4, second 2, third 1.
Result is 0 to 7, each equally likely.

### Dice method

Roll two six-sided dice and add them. Result is 2 to 12, not uniform.

### Slot mapping

Every stage has exactly the same eight slots, in the same order.

| Slot | Coins | Coin value | Dice | Character |
| --- | --- | --- | --- | --- |
| 1 | H H H | 7 | 12 | Bonanza |
| 2 | H H T | 6 | 11 | Good |
| 3 | H T H | 5 | 9 or 10 | Good |
| 4 | H T T | 4 | 6, 7 or 8 | Quiet |
| 5 | T H H | 3 | 5 | Hazard |
| 6 | T H T | 2 | 4 | Hazard |
| 7 | T T H | 1 | 3 | Hazard |
| 8 | T T T | 0 | 2 | Disaster |

### Fifty-fifty moments

A few actions call for a single coin flip. Heads is good, tails is bad.

---

## 3. Stage 1: The Backyard Garden

- **Range:** start to 10 Plots.
- **Tracked, in ledger order:** Coins, Wood, Crops, Plots.
- **Starting totals:** 10 Coins, 10 Wood, 10 Crops, 2 Plots.
- **Store limit:** Crops may never exceed 5 times Plots. At the start that is 10, so the farm begins full.

### Planter actions

| Action | Cost | Effect |
| --- | --- | --- |
| Plant and Harvest | 2 Crops | Gain 6 Crops, or 8 with the Tool Shed |
| Over-Water | 2 Crops | Gain 9 Crops, or 11 with the Tool Shed, then flip one coin. On tails: lose 1 Plot, and the Builder must spend 2 Wood next turn to drain the field. If the Builder cannot pay, the Builder loses that action instead. |
| Sell at Market | 4 Crops | Gain 6 Coins, or 8 with the Market Stall |
| Expand Fields | 5 Coins | Gain 1 Plot |

### Builder actions

| Action | Cost | Effect |
| --- | --- | --- |
| Chop Timber | 2 Crops | Gain 6 Wood, or 8 with the Reinforced Barn |
| Clear New Ground | 6 Wood | Gain 1 Plot |
| Sell Timber | 5 Wood | Gain 4 Coins |
| Build the Market Stall | 4 Wood | Sell at Market pays 8 Coins from now on. Once only. |
| Build the Tool Shed | 6 Wood | Plant and Harvest and Over-Water each gain 2 extra Crops from now on. Once only. |

### Stage 1 events

| Slot | Name | Effect |
| --- | --- | --- |
| 1 | Market Boom | This turn only, Sell at Market pays double. |
| 2 | Travelling Pedlar | Gain 5 Coins. |
| 3 | Perfect Weather | Gain 4 Crops, capped by the store limit. |
| 4 | A quiet day | Nothing happens. |
| 5 | Broken Gate | Lose 2 Wood, or 2 Crops if you hold no Wood. |
| 6 | The Crows Attack | Lose 4 Crops, unless the Planter spends 2 Wood now on a scarecrow. |
| 7 | Thunderstorm | The Builder takes no action this turn, unless the farm spends 3 Wood now. |
| 8 | Blight | Lose half your Crops, rounding down. |

---

## 4. Stage 2: The Family Farm

- **Range:** 11 to 25 Plots.
- **Tracked, in ledger order:** Coins, Wood, Crops, Eggs, Plots.
- **Milestone at 10 Plots:** the barn is built free, chickens arrive, Eggs enter the game at zero.
- All Stage 1 actions remain available. The Crop store limit still applies.

### Planter actions (in addition to Stage 1)

| Action | Cost | Effect |
| --- | --- | --- |
| Feed the Chickens | 4 Crops | Gain 3 Eggs, or 5 with the Extended Coop |
| Expand Pastures | 8 Coins | Gain 2 Plots |

### Builder actions (in addition to Stage 1)

| Action | Cost | Effect |
| --- | --- | --- |
| Sell to the Bakery | Any number of Eggs | Gain 5 Coins per Egg sold |
| Clear Woodland | 10 Wood | Gain 2 Plots |
| Extend the Coop | 6 Wood | Feed the Chickens gives 5 Eggs from now on. Once only. |
| Reinforce the Barn | 5 Wood | Chop Timber gives 8 Wood from now on. Once only. |

### Stage 2 events

| Slot | Name | Effect |
| --- | --- | --- |
| 1 | Baking Contest | This turn only, every Egg sold to the Bakery pays 10 Coins. |
| 2 | Broody Hen | Gain 2 Eggs. |
| 3 | Woodland Windfall | Gain 6 Wood. |
| 4 | A quiet day | Nothing happens. |
| 5 | Bad Weather | No Chop Timber action may be taken this turn. |
| 6 | The Sneaky Fox | Lose 2 Eggs, or half your Eggs rounding down if that is greater, unless the Builder spends 3 Wood now on a fence. |
| 7 | Escaped Pigs | The Planter takes no action this turn, unless the Builder spends 3 Wood mending the pen. |
| 8 | Barn Fire | Lose half your Wood, rounding down, and 3 Crops. |

---

## 5. Milestone at 25 Plots: the machines arrive

Process once, in this order:

1. Convert Wood to Fuel at 2 Wood for 1 Fuel, rounding down. Wood then leaves the game.
2. Sell all remaining Eggs at 5 Coins each. Eggs and chickens then leave the game.
3. The Crop store limit is removed permanently.
4. Automatic production begins: 5 Crops at the start of every turn, before the chance check.
5. These actions leave the game: Chop Timber, Clear New Ground, Sell Timber, Clear Woodland, Feed the Chickens, Sell to the Bakery, Plant and Harvest, Over-Water.
6. These actions remain: Sell at Market, Expand Fields, Expand Pastures (all Planter actions).
7. Anything already built stays built and keeps working where it still applies.
8. Titles become Head Planter and Head Builder.

---

## 6. Stage 3: The Mechanised Estate

- **Range:** 26 to 50 Plots.
- **Tracked, in ledger order:** Coins, Crops, Fuel, Plots.
- **Automatic production:** 5 Crops per turn.
- A Crop is worth 2 Coins everywhere in the game. That is the one rate worth memorising.

### Head Planter actions

| Action | Cost | Effect |
| --- | --- | --- |
| Tractor Harvest | 1 Fuel | Gain 8 Crops |
| Acquire Acreage | 20 Coins | Gain 5 Plots |
| Sell at Market (carried) | 4 Crops | Gain 6 Coins, or 8 with the Market Stall |
| Expand Fields (carried) | 5 Coins | Gain 1 Plot |
| Expand Pastures (carried) | 8 Coins | Gain 2 Plots |

### Head Builder actions

| Action | Cost | Effect |
| --- | --- | --- |
| Refuel Machinery | 5 Coins | Gain 2 Fuel |
| Commercial Trade | 10 Crops | Gain 20 Coins |

### Stage 3 events

| Slot | Name | Effect |
| --- | --- | --- |
| 1 | Bumper Crop | Automatic production is tripled this turn, so 15 Crops instead of 5. |
| 2 | Fuel Delivery | Gain 3 Fuel. |
| 3 | Good Prices | This turn only, Commercial Trade pays 30 Coins. |
| 4 | A quiet day | Nothing happens. |
| 5 | Fuel Shortage | This turn only, Refuel Machinery gives 1 Fuel. |
| 6 | Engine Breakdown | Spend 2 Fuel or 5 Coins now, or the Builder takes no action this turn. |
| 7 | Drought | No automatic Crops this turn. |
| 8 | Silo Collapse | Lose half your Crops, rounding down. |

Note on ordering: Bumper Crop and Drought both alter automatic production, which
happens at step 2 of the turn, before the event is drawn at step 3. The digital
version should therefore either resolve the chance check before applying automatic
production, or hold the production back until the event is known. Either is
acceptable, but the choice must be made explicitly and documented in the code.

---

## 7. Stage 4: The Regional Supplier

- **Range:** 51 to 100 Plots.
- **Tracked, in ledger order:** Coins, Crops, Fuel, Crates, Plots.
- **Milestone at 50 Plots:** the packing shed opens and Crates enter the game at zero. Tractor Harvest transfers from the Head Planter to the Head Builder.
- Automatic production continues at 5 Crops per turn.

### Head Planter actions

| Action | Cost | Effect |
| --- | --- | --- |
| Pack Crates | 10 Crops and 1 Fuel | Gain 1 Crate |
| Bulk Refuelling | 12 Coins | Gain 8 Fuel |
| Mega Land Acquisition | 40 Coins | Gain 15 Plots |
| Acquire Acreage | 20 Coins | Gain 5 Plots |
| Carried small change: Sell at Market, Expand Fields, Expand Pastures | as above | as above |

### Head Builder actions

| Action | Cost | Effect |
| --- | --- | --- |
| Tractor Harvest | 1 Fuel | Gain 8 Crops |
| Commercial Trade | 10 Crops | Gain 20 Coins |
| Wholesale Export | 2 Crates | Gain 70 Coins |
| Refuel Machinery | 5 Coins | Gain 2 Fuel |

Wholesale Export is a fixed exchange of exactly 2 Crates, not a sale of any number.

### Stage 4 events

| Slot | Name | Effect |
| --- | --- | --- |
| 1 | Global Market Surge | This turn only, Wholesale Export pays 100 Coins. |
| 2 | Returned Order | Gain 1 Crate. |
| 3 | Cheap Diesel | This turn only, Bulk Refuelling gives 12 Fuel. |
| 4 | A quiet day | Nothing happens. |
| 5 | Equipment Inspection | Pay 5 Coins now, or the Builder takes no action this turn. |
| 6 | Supply Chain Crisis | No export may be made this turn unless 10 Coins is paid for air freight. |
| 7 | Packing Shed Jam | Lose 1 Crate, or 8 Crops if you hold no Crates. |
| 8 | Machinery Failure | Lose all your Fuel. |

---

## 8. Milestone at 100 Plots: too big to count vegetables

The player rules warn that Crates are worth 35 Coins in Stage 4 and 20 Coins in
Stage 5, so the app should warn the player before this milestone is crossed with
Crates in hand. Process once, in this order:

1. Pack every 10 Crops into 1 Crate, rounding down. Sell the remainder at 2 Coins each. Crops then leave the game.
2. Automatic production changes to 1 Crate per turn.
3. These actions leave the game: Tractor Harvest, Pack Crates, Commercial Trade.
4. Wholesale Export is replaced by Bulk Export. Mega Land Acquisition is replaced by Imperial Land Acquisition. Bulk Refuelling is replaced by Industrial Refuelling.
5. Titles become Chief Planter and Chief Builder.

**Open question to be settled before coding:** the rules do not say explicitly
whether Expand Fields, Expand Pastures and Acquire Acreage survive into Stage 5.
Sell at Market and Commercial Trade die automatically because Crops no longer
exist. See the build brief for the recommended default.

---

## 9. Stage 5: The Agro-Empire

- **Range:** 101 to 250 Plots. This is the finish.
- **Tracked, in ledger order:** Coins, Fuel, Crates, Plots.
- **Automatic production:** 1 Crate per turn.

### Chief Planter actions

| Action | Cost | Effect |
| --- | --- | --- |
| Run the Combines | 4 Fuel | Gain 3 Crates |
| Imperial Land Acquisition | 60 Coins | Gain 25 Plots |

### Chief Builder actions

| Action | Cost | Effect |
| --- | --- | --- |
| Industrial Refuelling | 15 Coins | Gain 8 Fuel |
| Bulk Export | Any number of Crates | Gain 20 Coins per Crate sold |

### Stage 5 events

| Slot | Name | Effect |
| --- | --- | --- |
| 1 | Record Harvest | Gain 4 Crates. |
| 2 | Government Grant | Gain 40 Coins. |
| 3 | Efficient Routing | This turn only, Run the Combines costs 2 Fuel. |
| 4 | A quiet day | Nothing happens. |
| 5 | Fuel Price Spike | This turn only, Industrial Refuelling costs 25 Coins. |
| 6 | Port Strike | No export may be made this turn unless 20 Coins is paid to go by road. |
| 7 | Failed Inspection | Lose 2 Crates. |
| 8 | Market Crash | Lose half your Coins, rounding down. |

---

## 10. Finish lines

| Finish line | Stages | Expected turns | Character |
| --- | --- | --- | --- |
| 10 Plots | 1 | about 10 | A short first game |
| 25 Plots | 1 to 2 | about 20 | The standard game |
| 50 Plots | 1 to 3 | about 30 | Paper and pencil territory |
| 100 Plots | 1 to 4 | about 40 | A long session or two |
| 250 Plots | 1 to 5 | about 50 | The full campaign |

---

## 11. Optional rules

All are off by default and selectable at setup.

| Rule | Effect |
| --- | --- |
| The Lean Season | If a turn ends with no Coins and no Crops at all, lose 1 Plot. |
| The Lucky Re-flip | Once per game, either player may call for the chance check to be re-run. Must be called before the result is interpreted. |
| Mercy Rule | If a hazard or disaster comes up on two consecutive turns, the second is ignored. |
| Beat the Clock | Agree a turn limit at setup and score the Plots reached. |
| The Fox Guard | The Sneaky Fox loss is capped at 4 Eggs rather than half the basket. |

---

## 12. Behaviours the engine must model explicitly

These are the parts most likely to be implemented wrongly, so they are listed
separately.

1. **Turn-scoped modifiers.** Market Boom, Baking Contest, Good Prices, Cheap Diesel, Global Market Surge, Efficient Routing, Fuel Shortage and Fuel Price Spike all change a price or yield for the current turn only. They must expire at end of turn.
2. **Action bans.** Bad Weather bans Chop Timber. Supply Chain Crisis and Port Strike ban exporting unless a toll is paid.
3. **Lost actions.** Thunderstorm, Escaped Pigs, Engine Breakdown and Equipment Inspection can remove a named role's action for the turn, in most cases with a payment that avoids it.
4. **Pay-or-suffer prompts.** The Crows Attack, The Sneaky Fox, Engine Breakdown, Equipment Inspection, Supply Chain Crisis and Port Strike all present a choice. If the farm cannot afford the payment, the penalty applies automatically with no prompt.
5. **Deferred obligations.** A failed Over-Water gamble creates an obligation on the Builder for the *following* turn: spend 2 Wood or lose that action. This must survive across the role swap and must be shown clearly.
6. **Store limit enforcement.** In Stages 1 and 2 only, Crops are capped at 5 times Plots, applied at the moment of gain, including gains from Perfect Weather.
7. **Halving.** Blight, Barn Fire, Silo Collapse, Market Crash and the scaling Fox all halve and round down.
8. **Milestones mid-turn.** Crossing 10, 25, 50 or 100 Plots part way through a turn resolves the milestone immediately after the current action completes, before the next action.
