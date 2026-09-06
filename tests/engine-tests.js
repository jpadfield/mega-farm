/*
 * tests/engine-tests.js
 * ---------------------------------------------------------------------------
 * The test cases for engine.js.
 *
 * There is no test framework here on purpose. A test is a name and a function.
 * If the function throws, the test failed. If it returns, the test passed.
 *
 * These tests are run by opening tests/engine.test.html in a browser. Keeping
 * them in a module rather than in the page means they can also be run from a
 * command line later if that ever becomes useful.
 * ---------------------------------------------------------------------------
 */

import * as engine from '../js/engine.js';
import {
  ACTIONS,
  CHANCE_SLOTS,
  HAZARD_CHARACTERS,
  getStageByNumber
} from '../js/gamedata.js';

/* ===========================================================================
 * Assertions
 * ===========================================================================
 */

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Expected the condition to be true.');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'Values differ') + ': expected ' +
      JSON.stringify(expected) + ' but got ' + JSON.stringify(actual) + '.');
  }
}

function assertThrows(work, message) {
  let threw = false;
  try {
    work();
  } catch (error) {
    threw = true;
  }
  assert(threw, message || 'Expected that to throw an error.');
}

/* ===========================================================================
 * Helpers used by several tests
 * ===========================================================================
 */

/* A game with a fixed seed and a long finish line, so tests can set the farm
 * up in any state they like without accidentally winning. */
function newTestGame(extraOptions) {
  return engine.createGame(Object.assign({
    playerNames: ['Ada', 'Bob'],
    finishLinePlots: 250,
    chanceMethod: 'coins',
    seed: 12345
  }, extraOptions || {}));
}

/*
 * Put a named event on the table without waiting for the dice to co-operate.
 * This is the same thing rollChance() does, but for a chosen event.
 */
function forceEvent(state, eventId) {
  const next = structuredClone(state);
  const stage = getStageByNumber(next.stageNumber);
  const eventData = stage.events.find(function (e) { return e.id === eventId; });
  assert(eventData, 'No event called ' + eventId + ' in stage ' + next.stageNumber);
  const slot = CHANCE_SLOTS.find(function (s) { return s.slot === eventData.slot; });

  next.chanceResult = {
    method: 'coins',
    coinFaces: slot.coinFaces,
    coinValue: slot.coinValue,
    diceFaces: null,
    diceTotal: null,
    slotNumber: slot.slot,
    character: slot.character
  };
  next.currentEvent = {
    id: eventData.id,
    name: eventData.name,
    text: eventData.text,
    slot: eventData.slot,
    character: slot.character,
    isBadLuck: HAZARD_CHARACTERS.includes(slot.character),
    ignoredByMercyRule: false,
    hasChoice: Boolean(eventData.choice),
    resolved: false,
    outcomeTexts: []
  };
  next.phase = 'event';
  return next;
}

/* Set the farm up in a particular stage with particular totals. */
function setFarmTo(state, stageNumber, resources, milestonesApplied) {
  const next = structuredClone(state);
  next.stageNumber = stageNumber;
  next.milestonesApplied = milestonesApplied || [];
  Object.assign(next.resources, resources);
  return next;
}

function actionEntry(state, role, actionId) {
  return engine.findAvailableAction(state, role, actionId);
}

function actionIdsFor(state, role) {
  return engine.availableActions(state, role).map(function (entry) { return entry.actionId; });
}

/* Play a whole quiet turn, so that a test can get to the next turn quickly. */
function playQuietTurn(state, planterActionId, builderActionId) {
  let working = forceEvent(state, quietDayIdForStage(state.stageNumber));
  working = engine.resolveEvent(working, null);
  if (working.phase === 'planter-action') {
    working = engine.takeAction(working, 'planter', planterActionId || 'pass', {});
  }
  if (working.phase === 'obligation') {
    working = engine.resolveObligation(working);
  }
  if (working.phase === 'builder-action') {
    working = engine.takeAction(working, 'builder', builderActionId || 'pass', {});
  }
  if (working.phase === 'end-of-turn') {
    working = engine.endTurn(working);
  }
  return working;
}

function quietDayIdForStage(stageNumber) {
  const stage = getStageByNumber(stageNumber);
  return stage.events.find(function (e) { return e.slot === 4; }).id;
}

/* Every total in the farm, for the "never below zero" check. */
function everyResourceIsZeroOrMore(state) {
  return Object.keys(state.resources).every(function (resourceId) {
    return state.resources[resourceId] >= 0;
  });
}

/* ===========================================================================
 * The tests
 * ===========================================================================
 */

export const TEST_CASES = [

  /* ----- Starting position ----- */

  {
    name: 'A new game starts with exactly 10 Coins, 10 Wood, 10 Crops and 2 Plots',
    run: function () {
      const state = newTestGame();
      assertEqual(state.resources.coins, 10, 'Coins');
      assertEqual(state.resources.wood, 10, 'Wood');
      assertEqual(state.resources.crops, 10, 'Crops');
      assertEqual(state.resources.plots, 2, 'Plots');
      assertEqual(state.resources.eggs, 0, 'Eggs');
      assertEqual(state.resources.fuel, 0, 'Fuel');
      assertEqual(state.resources.crates, 0, 'Crates');
      assertEqual(state.stageNumber, 1, 'Stage');
      assertEqual(state.turnNumber, 1, 'Turn');
      assertEqual(state.phase, 'chance', 'Phase');
    }
  },

  {
    name: 'The farm begins completely full: the store limit is 5 times 2 Plots, which is 10 Crops',
    run: function () {
      const state = newTestGame();
      assertEqual(engine.cropStoreLimit(state), 10, 'Store limit');
      assertEqual(state.resources.crops, 10, 'Crops');
    }
  },

  {
    name: 'The same seed always produces exactly the same game',
    run: function () {
      const first = engine.rollChance(engine.createGame({ seed: 999, finishLinePlots: 25 }));
      const second = engine.rollChance(engine.createGame({ seed: 999, finishLinePlots: 25 }));
      assertEqual(first.currentEvent.id, second.currentEvent.id, 'Same event');
      assertEqual(first.chanceResult.coinValue, second.chanceResult.coinValue, 'Same coins');
    }
  },

  {
    name: 'Three coins always read as a number from 0 to 7, and map to slots 8 down to 1',
    run: function () {
      for (let seed = 0; seed < 200; seed += 1) {
        const state = engine.rollChance(engine.createGame({ seed: seed, finishLinePlots: 25 }));
        const result = state.chanceResult;
        assert(result.coinValue >= 0 && result.coinValue <= 7, 'Coin value in range');
        assertEqual(result.slotNumber, 8 - result.coinValue, 'Slot number for coin value ' + result.coinValue);
        assertEqual(result.coinFaces.length, 3, 'Three coins');
      }
    }
  },

  {
    name: 'Two dice always total 2 to 12 and land in a real slot',
    run: function () {
      for (let seed = 0; seed < 200; seed += 1) {
        const state = engine.rollChance(engine.createGame({ seed: seed, chanceMethod: 'dice', finishLinePlots: 25 }));
        const result = state.chanceResult;
        assert(result.diceTotal >= 2 && result.diceTotal <= 12, 'Dice total in range');
        assert(result.slotNumber >= 1 && result.slotNumber <= 8, 'Slot in range');
      }
    }
  },

  /* ----- The crop store limit ----- */

  {
    name: 'The Stage 1 store limit clamps a gain at 5 times Plots, including a gain from Perfect Weather',
    run: function () {
      /* 3 Plots means a limit of 15 Crops. Start on 14 and gain 4 from
       * Perfect Weather: only 1 fits, and the other 3 rot away. */
      let state = setFarmTo(newTestGame(), 1, { plots: 3, crops: 14 });
      assertEqual(engine.cropStoreLimit(state), 15, 'Store limit');
      state = forceEvent(state, 'perfect-weather');
      state = engine.resolveEvent(state, null);
      assertEqual(state.resources.crops, 15, 'Crops after Perfect Weather');
    }
  },

  {
    name: 'The store limit also clamps a gain from an action, and the excess is lost at once',
    run: function () {
      /* 2 Plots, so the limit is 10. Plant and Harvest spends 2 and gains 6,
       * which would be 14, so 4 rot away immediately. */
      let state = setFarmTo(newTestGame(), 1, { plots: 2, crops: 10 });
      state = forceEvent(state, 'a-quiet-day');
      state = engine.resolveEvent(state, null);
      state = engine.takeAction(state, 'planter', 'plant-and-harvest', {});
      assertEqual(state.resources.crops, 10, 'Crops stay at the limit');
    }
  },

  {
    name: 'There is no store limit from Stage 3 onwards',
    run: function () {
      const state = setFarmTo(newTestGame(), 3, { plots: 30, crops: 500 }, ['the-barn', 'the-machines']);
      assertEqual(engine.cropStoreLimit(state), null, 'No limit');
    }
  },

  /* ----- Halving and never going below zero ----- */

  {
    name: 'Blight halves Crops rounding down, so 7 becomes 3',
    run: function () {
      let state = setFarmTo(newTestGame(), 1, { plots: 5, crops: 7 });
      state = forceEvent(state, 'blight');
      state = engine.resolveEvent(state, null);
      assertEqual(state.resources.crops, 3, 'Crops after Blight');
    }
  },

  {
    name: 'Barn Fire halves Wood rounding down and takes 3 Crops, and never goes below zero',
    run: function () {
      let state = setFarmTo(newTestGame(), 2, { plots: 12, wood: 9, crops: 1 }, ['the-barn']);
      state = forceEvent(state, 'barn-fire');
      state = engine.resolveEvent(state, null);
      assertEqual(state.resources.wood, 4, 'Wood: 9 halves to 4');
      assertEqual(state.resources.crops, 0, 'Crops cannot go below zero');
      assert(everyResourceIsZeroOrMore(state), 'Nothing is negative');
    }
  },

  {
    name: 'Market Crash halves Coins rounding down',
    run: function () {
      let state = setFarmTo(newTestGame(), 5, { plots: 120, coins: 101 },
        ['the-barn', 'the-machines', 'the-packing-shed', 'too-big-to-count-vegetables']);
      state = forceEvent(state, 'market-crash');
      state = engine.resolveEvent(state, null);
      assertEqual(state.resources.coins, 50, 'Coins after Market Crash');
    }
  },

  {
    name: 'Losing more than you hold simply takes everything, never less than zero',
    run: function () {
      let state = setFarmTo(newTestGame(), 5, { plots: 120, crates: 1 },
        ['the-barn', 'the-machines', 'the-packing-shed', 'too-big-to-count-vegetables']);
      state = forceEvent(state, 'failed-inspection');
      state = engine.resolveEvent(state, null);
      assertEqual(state.resources.crates, 0, 'Crates');
      assert(everyResourceIsZeroOrMore(state), 'Nothing is negative');
    }
  },

  {
    name: 'Broken Gate takes Crops instead when the farm holds no Wood at all',
    run: function () {
      let withWood = setFarmTo(newTestGame(), 1, { plots: 4, wood: 5, crops: 8 });
      withWood = engine.resolveEvent(forceEvent(withWood, 'broken-gate'), null);
      assertEqual(withWood.resources.wood, 3, 'Wood taken when there is wood');
      assertEqual(withWood.resources.crops, 8, 'Crops untouched');

      let withoutWood = setFarmTo(newTestGame(), 1, { plots: 4, wood: 0, crops: 8 });
      withoutWood = engine.resolveEvent(forceEvent(withoutWood, 'broken-gate'), null);
      assertEqual(withoutWood.resources.crops, 6, 'Crops taken instead');
    }
  },

  {
    name: 'Machinery Failure takes every last drop of Fuel',
    run: function () {
      let state = setFarmTo(newTestGame(), 4, { plots: 60, fuel: 17 },
        ['the-barn', 'the-machines', 'the-packing-shed']);
      state = engine.resolveEvent(forceEvent(state, 'machinery-failure'), null);
      assertEqual(state.resources.fuel, 0, 'Fuel');
    }
  },

  /* ----- The Sneaky Fox ----- */

  {
    name: 'The Sneaky Fox takes 2 Eggs, or half the basket rounding down when that is more',
    run: function () {
      let small = setFarmTo(newTestGame(), 2, { plots: 12, eggs: 3, wood: 0 }, ['the-barn']);
      small = engine.resolveEvent(forceEvent(small, 'the-sneaky-fox'), null);
      assertEqual(small.resources.eggs, 1, 'Small basket loses the minimum of 2');

      let big = setFarmTo(newTestGame(), 2, { plots: 12, eggs: 11, wood: 0 }, ['the-barn']);
      big = engine.resolveEvent(forceEvent(big, 'the-sneaky-fox'), null);
      assertEqual(big.resources.eggs, 6, 'Big basket loses half of 11, rounded down to 5');
    }
  },

  {
    name: 'The Fox Guard optional rule caps the fox at 4 Eggs',
    run: function () {
      let state = newTestGame({ optionalRules: { foxGuard: true } });
      state = setFarmTo(state, 2, { plots: 12, eggs: 20, wood: 0 }, ['the-barn']);
      state = engine.resolveEvent(forceEvent(state, 'the-sneaky-fox'), null);
      assertEqual(state.resources.eggs, 16, 'Only 4 Eggs taken');
    }
  },

  {
    name: 'Paying for the fence stops the fox completely',
    run: function () {
      let state = setFarmTo(newTestGame(), 2, { plots: 12, eggs: 11, wood: 5 }, ['the-barn']);
      state = forceEvent(state, 'the-sneaky-fox');
      state = engine.resolveEvent(state, 'fence');
      assertEqual(state.resources.eggs, 11, 'Eggs untouched');
      assertEqual(state.resources.wood, 2, 'Wood paid');
    }
  },

  /* ----- Pay-or-suffer prompts ----- */

  {
    name: 'When the farm cannot afford to pay, the penalty happens with no prompt',
    run: function () {
      let state = setFarmTo(newTestGame(), 1, { plots: 4, wood: 1, crops: 9 });
      state = forceEvent(state, 'the-crows-attack');
      const offered = engine.eventChoiceOptions(state);
      assertEqual(offered.length, 1, 'One option offered');
      assertEqual(offered[0].affordable, false, 'But it is not affordable');
      state = engine.resolveEvent(state, null);
      assertEqual(state.resources.crops, 5, 'The crows took 4 Crops');
      assertEqual(state.resources.wood, 1, 'No Wood was spent');
    }
  },

  {
    name: 'Engine Breakdown offers two ways to pay and either one works',
    run: function () {
      let base = setFarmTo(newTestGame(), 3, { plots: 30, coins: 20, fuel: 5 }, ['the-barn', 'the-machines']);

      let withFuel = engine.resolveEvent(forceEvent(base, 'engine-breakdown'), 'pay-fuel');
      assertEqual(withFuel.resources.fuel, 3, 'Two Fuel spent');
      assertEqual(withFuel.lostActions.builder, false, 'The Builder keeps the action');

      let withCoins = engine.resolveEvent(forceEvent(base, 'engine-breakdown'), 'pay-coins');
      assertEqual(withCoins.resources.coins, 15, 'Five Coins spent');
      assertEqual(withCoins.lostActions.builder, false, 'The Builder keeps the action');
    }
  },

  /* ----- Lost actions ----- */

  {
    name: 'Thunderstorm costs the Builder the action when the farm does not pay',
    run: function () {
      let state = setFarmTo(newTestGame(), 1, { plots: 4, wood: 10, crops: 10, coins: 10 });
      state = forceEvent(state, 'thunderstorm');
      state = engine.resolveEvent(state, null);
      assertEqual(state.lostActions.builder, true, 'The Builder lost the action');
      assertEqual(state.phase, 'planter-action', 'The Planter still acts');
      state = engine.takeAction(state, 'planter', 'pass', {});
      assertEqual(state.phase, 'end-of-turn', 'The turn skips straight past the Builder');
      assertEqual(state.actionsTaken.builder, true, 'The Builder is recorded as having not acted');
    }
  },

  {
    name: 'Escaped Pigs costs the Planter the action, and the Builder still acts',
    run: function () {
      let state = setFarmTo(newTestGame(), 2, { plots: 12, wood: 0, crops: 10, coins: 10 }, ['the-barn']);
      state = forceEvent(state, 'escaped-pigs');
      state = engine.resolveEvent(state, null);
      assertEqual(state.lostActions.planter, true, 'The Planter lost the action');
      assertEqual(state.phase, 'builder-action', 'It is straight on to the Builder');
    }
  },

  /* ----- Action bans ----- */

  {
    name: 'Bad Weather bans Chop Timber for the turn and says why',
    run: function () {
      let state = setFarmTo(newTestGame(), 2, { plots: 12, crops: 10 }, ['the-barn']);
      state = engine.resolveEvent(forceEvent(state, 'bad-weather'), null);
      const chopTimber = actionEntry(state, 'builder', 'chop-timber');
      assertEqual(chopTimber.available, false, 'Chop Timber is banned');
      assertEqual(chopTimber.reason, 'Bad Weather stops timber this turn', 'The reason is given');
      assertThrows(function () {
        engine.takeAction(state, 'planter', 'pass', {});
        engine.takeAction(engine.takeAction(state, 'planter', 'pass', {}), 'builder', 'chop-timber', {});
      }, 'Taking a banned action throws');
    }
  },

  {
    name: 'Supply Chain Crisis bans exporting unless the air freight is paid for',
    run: function () {
      const start = setFarmTo(newTestGame(), 4, { plots: 60, coins: 30, crates: 4 },
        ['the-barn', 'the-machines', 'the-packing-shed']);

      const notPaid = engine.resolveEvent(forceEvent(start, 'supply-chain-crisis'), null);
      const bannedExport = actionEntry(notPaid, 'builder', 'wholesale-export');
      assertEqual(bannedExport.available, false, 'Export banned');
      assertEqual(bannedExport.reason, 'Supply Chain Crisis stops exports this turn', 'Reason given');

      const paid = engine.resolveEvent(forceEvent(start, 'supply-chain-crisis'), 'air-freight');
      assertEqual(paid.resources.coins, 20, 'Ten Coins paid');
      assertEqual(actionEntry(paid, 'builder', 'wholesale-export').available, true, 'Export allowed again');
    }
  },

  {
    name: 'Port Strike bans Bulk Export in Stage 5 unless the road toll is paid',
    run: function () {
      const start = setFarmTo(newTestGame(), 5, { plots: 120, coins: 30, crates: 4 },
        ['the-barn', 'the-machines', 'the-packing-shed', 'too-big-to-count-vegetables']);
      const notPaid = engine.resolveEvent(forceEvent(start, 'port-strike'), null);
      assertEqual(actionEntry(notPaid, 'builder', 'bulk-export').available, false, 'Bulk Export banned');
      const paid = engine.resolveEvent(forceEvent(start, 'port-strike'), 'by-road');
      assertEqual(actionEntry(paid, 'builder', 'bulk-export').available, true, 'Bulk Export allowed');
    }
  },

  /* ----- Turn-scoped price changes ----- */

  {
    name: 'Market Boom doubles Sell at Market on this turn, and is gone on the next',
    run: function () {
      let state = setFarmTo(newTestGame(), 1, { plots: 5, crops: 20, coins: 0 });
      state = engine.resolveEvent(forceEvent(state, 'market-boom'), null);

      const boomEntry = actionEntry(state, 'planter', 'sell-at-market');
      assertEqual(boomEntry.gain.coins, 12, 'Six Coins doubled to twelve');
      assertEqual(boomEntry.hasTurnPriceChange, true, 'Marked as a price change');

      state = engine.takeAction(state, 'planter', 'sell-at-market', {});
      assertEqual(state.resources.coins, 12, 'Twelve Coins received');

      state = engine.takeAction(state, 'builder', 'pass', {});
      state = engine.endTurn(state);
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day'), null);
      assertEqual(actionEntry(state, 'planter', 'sell-at-market').gain.coins, 6, 'Back to six the next turn');
    }
  },

  {
    name: 'Market Boom doubles the Market Stall price too, so 8 Coins becomes 16',
    run: function () {
      let state = setFarmTo(newTestGame(), 1, { plots: 5, crops: 20, coins: 0 });
      state.buildings['market-stall'] = true;
      state = engine.resolveEvent(forceEvent(state, 'market-boom'), null);
      assertEqual(actionEntry(state, 'planter', 'sell-at-market').gain.coins, 16, 'Sixteen Coins');
    }
  },

  {
    name: 'Good Prices pays 30 for Commercial Trade this turn only',
    run: function () {
      let state = setFarmTo(newTestGame(), 3, { plots: 30, crops: 40, coins: 0 }, ['the-barn', 'the-machines']);
      state = engine.resolveEvent(forceEvent(state, 'good-prices'), null);
      assertEqual(actionEntry(state, 'builder', 'commercial-trade').gain.coins, 30, 'Thirty this turn');
      state = engine.takeAction(state, 'planter', 'pass', {});
      state = engine.takeAction(state, 'builder', 'commercial-trade', {});
      assertEqual(state.resources.coins, 30, 'Thirty Coins received');
      state = engine.endTurn(state);
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-3'), null);
      assertEqual(actionEntry(state, 'builder', 'commercial-trade').gain.coins, 20, 'Back to twenty');
    }
  },

  {
    name: 'Fuel Shortage cuts Refuel Machinery to 1 Fuel for this turn only',
    run: function () {
      let state = setFarmTo(newTestGame(), 3, { plots: 30, coins: 30 }, ['the-barn', 'the-machines']);
      state = engine.resolveEvent(forceEvent(state, 'fuel-shortage'), null);
      assertEqual(actionEntry(state, 'builder', 'refuel-machinery').gain.fuel, 1, 'One Fuel');
      state = engine.endTurn(engine.takeAction(engine.takeAction(state, 'planter', 'pass', {}), 'builder', 'pass', {}));
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-3'), null);
      assertEqual(actionEntry(state, 'builder', 'refuel-machinery').gain.fuel, 2, 'Back to two');
    }
  },

  {
    name: 'Efficient Routing and Fuel Price Spike change costs rather than gains',
    run: function () {
      const base = setFarmTo(newTestGame(), 5, { plots: 120, coins: 100, fuel: 10 },
        ['the-barn', 'the-machines', 'the-packing-shed', 'too-big-to-count-vegetables']);

      const routing = engine.resolveEvent(forceEvent(base, 'efficient-routing'), null);
      assertEqual(actionEntry(routing, 'planter', 'run-the-combines').cost.fuel, 2, 'Two Fuel this turn');

      const spike = engine.resolveEvent(forceEvent(base, 'fuel-price-spike'), null);
      assertEqual(actionEntry(spike, 'builder', 'industrial-refuelling').cost.coins, 25, 'Twenty-five Coins this turn');
    }
  },

  {
    name: 'Baking Contest pays 10 Coins an Egg to the Bakery, this turn only',
    run: function () {
      let state = setFarmTo(newTestGame(), 2, { plots: 12, eggs: 4, coins: 0 }, ['the-barn']);
      state = engine.resolveEvent(forceEvent(state, 'baking-contest'), null);
      assertEqual(actionEntry(state, 'builder', 'sell-to-the-bakery').coinsPerUnit, 10, 'Ten Coins an Egg');
      state = engine.takeAction(state, 'planter', 'pass', {});
      state = engine.takeAction(state, 'builder', 'sell-to-the-bakery', { quantity: 4 });
      assertEqual(state.resources.coins, 40, 'Forty Coins');
      assertEqual(state.resources.eggs, 0, 'All the Eggs sold');
    }
  },

  /* ----- Buildings ----- */

  {
    name: 'The Tool Shed improves Plant and Harvest and Over-Water, and can only be built once',
    run: function () {
      /* 8 Plots, so that passing does not accidentally cross the 10 Plot milestone. */
      let state = setFarmTo(newTestGame(), 1, { plots: 8, crops: 4, wood: 20 });
      assertEqual(actionEntry(state, 'planter', 'plant-and-harvest').gain.crops, 6, 'Six before');
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day'), null);
      state = engine.takeAction(state, 'planter', 'pass', {});
      state = engine.takeAction(state, 'builder', 'build-the-tool-shed', {});
      assertEqual(state.resources.wood, 14, 'Six Wood spent');
      assertEqual(actionEntry(state, 'planter', 'plant-and-harvest').gain.crops, 8, 'Eight after');
      assertEqual(actionEntry(state, 'planter', 'over-water').gain.crops, 11, 'Eleven after');
      const buildAgain = actionEntry(state, 'builder', 'build-the-tool-shed');
      assertEqual(buildAgain.available, false, 'Cannot build it twice');
      assertEqual(buildAgain.reason, 'Already built', 'And it says so');
    }
  },

  /* ----- The deferred Over-Water obligation ----- */

  {
    name: 'A failed Over-Water gamble floods the field and lands a job on the Builder next turn',
    run: function () {
      const state = findStateWhereOverWaterFails({ plots: 6, crops: 10, wood: 10, coins: 0 });
      assertEqual(state.lastGambleResult.isGoodNews, false, 'The coin came up tails');
      assertEqual(state.resources.plots, 5, 'One Plot lost to the flood');
      assert(state.pendingObligation, 'An obligation was created');
      assertEqual(state.pendingObligation.role, 'builder', 'It falls to the Builder');
      assertEqual(state.pendingObligation.dueOnTurn, state.turnNumber + 1, 'On the FOLLOWING turn');
      /* It must not interfere with this turn's Builder. */
      assertEqual(engine.obligationDueNow(state), null, 'Nothing is due this turn');
    }
  },

  {
    name: 'The obligation is presented to the Builder on the following turn and survives the role swap',
    run: function () {
      let state = findStateWhereOverWaterFails({ plots: 6, crops: 10, wood: 10, coins: 0 });
      const planterBeforeSwap = engine.playerNameForRole(state, 'planter');

      state = engine.takeAction(state, 'builder', 'pass', {});
      state = engine.endTurn(state);
      assertEqual(engine.playerNameForRole(state, 'builder'), planterBeforeSwap,
        'The roles swapped, so the job lands on the other person');

      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day'), null);
      state = engine.takeAction(state, 'planter', 'pass', {});
      assertEqual(state.phase, 'obligation', 'The Builder is shown the flooded field first');
      assertEqual(engine.canPayObligation(state), true, 'There is Wood to pay with');

      const woodBefore = state.resources.wood;
      state = engine.resolveObligation(state);
      assertEqual(state.resources.wood, woodBefore - 2, 'Two Wood spent draining the field');
      assertEqual(state.phase, 'builder-action', 'And the Builder still gets an action');
      assertEqual(state.pendingObligation, null, 'The job is done');
    }
  },

  {
    name: 'The obligation costs the Builder the action when there is no Wood',
    run: function () {
      let state = findStateWhereOverWaterFails({ plots: 6, crops: 10, wood: 0, coins: 0 });
      state = engine.takeAction(state, 'builder', 'pass', {});
      state = engine.endTurn(state);
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day'), null);
      state = engine.takeAction(state, 'planter', 'pass', {});
      assertEqual(state.phase, 'obligation', 'Still presented, even though it cannot be paid');
      assertEqual(engine.canPayObligation(state), false, 'No Wood to pay with');
      state = engine.resolveObligation(state);
      assertEqual(state.lastObligationOutcome.paid, false, 'Not paid');
      assertEqual(state.phase, 'end-of-turn', 'The Builder loses the action entirely');
      assertEqual(state.actionsTaken.builder, true, 'And is recorded as having not acted');
    }
  },

  {
    name: 'A successful Over-Water gamble leaves no obligation at all',
    run: function () {
      const state = findStateWhereOverWaterSucceeds({ plots: 6, crops: 10, wood: 10 });
      assertEqual(state.lastGambleResult.isGoodNews, true, 'The coin came up heads');
      assertEqual(state.resources.plots, 6, 'No Plot lost');
      assertEqual(state.pendingObligation, null, 'No obligation');
    }
  },

  /* ----- Milestones ----- */

  {
    name: 'Reaching 10 Plots part way through a turn stops for the milestone before the next action',
    run: function () {
      let state = setFarmTo(newTestGame(), 1, { plots: 9, coins: 10, crops: 10, wood: 10 });
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day'), null);
      state = engine.takeAction(state, 'planter', 'expand-fields', {});
      assertEqual(state.phase, 'milestone', 'The turn stops for the milestone');
      assertEqual(engine.pendingMilestone(state).id, 'the-barn', 'The barn milestone');
      state = engine.applyMilestones(state);
      assertEqual(state.stageNumber, 2, 'Now in Stage 2');
      assertEqual(state.buildings.barn, true, 'The barn is built free');
      assertEqual(state.phase, 'builder-action', 'And then the Builder carries on');
      assert(actionIdsFor(state, 'planter').includes('feed-the-chickens'), 'Chickens have arrived');
    }
  },

  {
    name: 'The 25 Plot milestone converts Wood to Fuel rounding down and sells Eggs at 5 Coins',
    run: function () {
      let state = setFarmTo(newTestGame(), 2, { plots: 24, wood: 17, eggs: 6, coins: 10, crops: 30 }, ['the-barn']);
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-2'), null);
      state = engine.takeAction(state, 'planter', 'expand-fields', {});
      assertEqual(state.resources.plots, 25, 'Twenty-five Plots');
      assertEqual(state.phase, 'milestone', 'Stopped for the milestone');

      state = engine.applyMilestones(state);
      assertEqual(state.stageNumber, 3, 'Now in Stage 3');
      assertEqual(state.resources.fuel, 8, '17 Wood becomes 8 Fuel, rounding down');
      assertEqual(state.resources.wood, 0, 'Wood leaves the game');
      assertEqual(state.resources.coins, 5 + 30, 'Five Coins left, plus 6 Eggs at 5 Coins each');
      assertEqual(state.resources.eggs, 0, 'Eggs leave the game');
      assertEqual(engine.cropStoreLimit(state), null, 'The store limit is gone');
      assertEqual(engine.titleForRole(state, 'planter'), 'The Head Planter', 'Promoted');

      const report = state.lastMilestoneReport;
      assertEqual(report.milestoneId, 'the-machines', 'The report is about the right milestone');
      assert(report.steps[0].outcomeText.includes('17 Wood'), 'The walkthrough says what you had');
      assert(report.steps[0].outcomeText.includes('8 Fuel'), 'And what it becomes');
    }
  },

  {
    name: 'The 25 Plot milestone retires the eight hand-work actions and keeps the three small ones',
    run: function () {
      let state = setFarmTo(newTestGame(), 2, { plots: 25, wood: 4, eggs: 0, coins: 10 }, ['the-barn']);
      state.pendingMilestoneId = 'the-machines';
      state.phase = 'milestone';
      state = engine.applyMilestones(state);

      const retired = ['chop-timber', 'clear-new-ground', 'sell-timber', 'clear-woodland',
        'feed-the-chickens', 'sell-to-the-bakery', 'plant-and-harvest', 'over-water'];
      const stillThere = actionIdsFor(state, 'planter').concat(actionIdsFor(state, 'builder'));
      for (const retiredActionId of retired) {
        assert(!stillThere.includes(retiredActionId), retiredActionId + ' has left the game');
      }
      for (const keptActionId of ['sell-at-market', 'expand-fields', 'expand-pastures']) {
        assert(stillThere.includes(keptActionId), keptActionId + ' is still available');
      }
      assert(stillThere.includes('tractor-harvest'), 'Tractor Harvest has arrived');
      assert(stillThere.includes('refuel-machinery'), 'Refuel Machinery has arrived');
      assert(stillThere.includes('commercial-trade'), 'Commercial Trade has arrived');
    }
  },

  {
    name: 'The 25 Plot milestone starts automatic production of 5 Crops a turn',
    run: function () {
      let state = setFarmTo(newTestGame(), 2, { plots: 25, wood: 0, eggs: 0, coins: 10, crops: 0 }, ['the-barn']);
      state.pendingMilestoneId = 'the-machines';
      state.phase = 'milestone';
      state = engine.applyMilestones(state);
      state = engine.takeAction(state, 'planter', 'pass', {});
      state = engine.takeAction(state, 'builder', 'pass', {});
      state = engine.endTurn(state);

      const cropsBefore = state.resources.crops;
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-3'), null);
      assertEqual(state.resources.crops, cropsBefore + 5, 'Five free Crops');
    }
  },

  {
    name: 'Bumper Crop triples the automatic production and Drought stops it, because the event is drawn first',
    run: function () {
      const base = setFarmTo(newTestGame(), 3, { plots: 30, crops: 0 }, ['the-barn', 'the-machines']);

      const bumper = engine.resolveEvent(forceEvent(base, 'bumper-crop'), null);
      assertEqual(bumper.resources.crops, 15, 'Fifteen Crops instead of five');

      const drought = engine.resolveEvent(forceEvent(base, 'drought'), null);
      assertEqual(drought.resources.crops, 0, 'No Crops at all');

      const quiet = engine.resolveEvent(forceEvent(base, 'a-quiet-day-3'), null);
      assertEqual(quiet.resources.crops, 5, 'Five on a normal turn');
    }
  },

  {
    name: 'The 50 Plot milestone moves Tractor Harvest from the Planter to the Builder',
    run: function () {
      let state = setFarmTo(newTestGame(), 3, { plots: 45, coins: 40, fuel: 4 }, ['the-barn', 'the-machines']);
      assert(actionIdsFor(state, 'planter').includes('tractor-harvest'), 'The Planter drives the tractor in Stage 3');
      assert(!actionIdsFor(state, 'builder').includes('tractor-harvest'), 'The Builder does not, yet');

      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-3'), null);
      state = engine.takeAction(state, 'planter', 'acquire-acreage', {});
      assertEqual(state.resources.plots, 50, 'Fifty Plots');
      state = engine.applyMilestones(state);

      assertEqual(state.stageNumber, 4, 'Now in Stage 4');
      assert(!actionIdsFor(state, 'planter').includes('tractor-harvest'), 'The Planter has handed it over');
      assert(actionIdsFor(state, 'builder').includes('tractor-harvest'), 'The Builder drives it now');
      assert(actionIdsFor(state, 'planter').includes('pack-crates'), 'The Planter is in the packing shed');
    }
  },

  {
    name: 'The 100 Plot milestone packs Crops into Crates at 10 to 1 and sells the remainder at 2 Coins',
    run: function () {
      let state = setFarmTo(newTestGame(), 4, { plots: 99, crops: 47, crates: 1, coins: 10, fuel: 3 },
        ['the-barn', 'the-machines', 'the-packing-shed']);
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-4'), null);
      assertEqual(state.resources.crops, 52, 'Five automatic Crops first');

      state = engine.takeAction(state, 'planter', 'expand-fields', {});
      assertEqual(state.phase, 'milestone', 'Stopped for the milestone');
      state = engine.applyMilestones(state);

      assertEqual(state.stageNumber, 5, 'Now in Stage 5');
      /* 52 Crops is 5 Crates and 2 left over, which sell for 4 Coins. */
      assertEqual(state.resources.crates, 1 + 5, 'Five new Crates on top of the one already held');
      assertEqual(state.resources.coins, 5 + 4, 'Five Coins left after the Plot, plus 4 for the remainder');
      assertEqual(state.resources.crops, 0, 'Crops leave the game');
      assertEqual(engine.titleForRole(state, 'builder'), 'The Chief Builder', 'Promoted again');
    }
  },

  {
    name: 'Stage 5 automatic production is 1 Crate a turn and the retired actions are gone',
    run: function () {
      let state = setFarmTo(newTestGame(), 5, { plots: 105, crates: 0, fuel: 0, coins: 0 },
        ['the-barn', 'the-machines', 'the-packing-shed', 'too-big-to-count-vegetables']);
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-5'), null);
      assertEqual(state.resources.crates, 1, 'One free Crate');

      const everything = actionIdsFor(state, 'planter').concat(actionIdsFor(state, 'builder'));
      for (const goneActionId of ['tractor-harvest', 'pack-crates', 'commercial-trade',
        'wholesale-export', 'mega-land-acquisition', 'bulk-refuelling', 'sell-at-market']) {
        assert(!everything.includes(goneActionId), goneActionId + ' has left the game');
      }
      for (const newActionId of ['run-the-combines', 'imperial-land-acquisition',
        'industrial-refuelling', 'bulk-export']) {
        assert(everything.includes(newActionId), newActionId + ' has arrived');
      }
    }
  },

  {
    name: 'The house ruling keeps the small land actions available in Stage 5',
    run: function () {
      const state = setFarmTo(newTestGame(), 5, { plots: 105, coins: 100 },
        ['the-barn', 'the-machines', 'the-packing-shed', 'too-big-to-count-vegetables']);
      const planterActionIds = actionIdsFor(state, 'planter');
      for (const smallActionId of ['expand-fields', 'expand-pastures', 'acquire-acreage']) {
        assert(planterActionIds.includes(smallActionId), smallActionId + ' survives into Stage 5');
        assertEqual(actionEntry(state, 'planter', smallActionId).isSmallChange, true,
          smallActionId + ' is marked as small change');
      }
    }
  },

  {
    name: 'The app warns before crossing 100 Plots while still holding Crates',
    run: function () {
      const holding = setFarmTo(newTestGame(), 4, { plots: 99, crates: 2, coins: 10 },
        ['the-barn', 'the-machines', 'the-packing-shed']);
      const warning = engine.warningForAction(holding, 'planter', 'expand-fields', {});
      assert(warning && warning.includes('35 Coins'), 'A warning is offered');

      const empty = setFarmTo(newTestGame(), 4, { plots: 99, crates: 0, coins: 10 },
        ['the-barn', 'the-machines', 'the-packing-shed']);
      assertEqual(engine.warningForAction(empty, 'planter', 'expand-fields', {}), null,
        'No warning with no Crates');
    }
  },

  {
    name: 'Reaching a finish line that is also a milestone ends the game rather than starting a new stage',
    run: function () {
      let state = engine.createGame({ seed: 5, finishLinePlots: 25 });
      state = setFarmTo(state, 2, { plots: 24, coins: 10 }, ['the-barn']);
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-2'), null);
      state = engine.takeAction(state, 'planter', 'expand-fields', {});
      assertEqual(state.gameOver, true, 'The game is over');
      assertEqual(state.playersWon, true, 'And it is a win');
      assertEqual(state.stageNumber, 2, 'The farm never becomes a mechanised estate');
      assertEqual(state.phase, 'game-over', 'The phase says so');
    }
  },

  /* ----- Selling any number ----- */

  {
    name: 'Sell to the Bakery sells any number of Eggs and refuses more than the farm holds',
    run: function () {
      let state = setFarmTo(newTestGame(), 2, { plots: 12, eggs: 7, coins: 0 }, ['the-barn']);
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-2'), null);
      state = engine.takeAction(state, 'planter', 'pass', {});
      assertThrows(function () {
        engine.takeAction(state, 'builder', 'sell-to-the-bakery', { quantity: 8 });
      }, 'Cannot sell more Eggs than you have');
      assertThrows(function () {
        engine.takeAction(state, 'builder', 'sell-to-the-bakery', { quantity: 0 });
      }, 'Must sell at least one');
      const sold = engine.takeAction(state, 'builder', 'sell-to-the-bakery', { quantity: 3 });
      assertEqual(sold.resources.eggs, 4, 'Four Eggs left');
      assertEqual(sold.resources.coins, 15, 'Fifteen Coins');
    }
  },

  {
    name: 'Wholesale Export is exactly 2 Crates, not any number',
    run: function () {
      let state = setFarmTo(newTestGame(), 4, { plots: 60, crates: 1, coins: 0 },
        ['the-barn', 'the-machines', 'the-packing-shed']);
      assertEqual(actionEntry(state, 'builder', 'wholesale-export').available, false, 'One Crate is not enough');
      assertEqual(actionEntry(state, 'builder', 'wholesale-export').reason, 'Not enough Crates', 'And it says why');

      state = setFarmTo(state, 4, { crates: 5 }, ['the-barn', 'the-machines', 'the-packing-shed']);
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day-4'), null);
      state = engine.takeAction(state, 'planter', 'pass', {});
      state = engine.takeAction(state, 'builder', 'wholesale-export', {});
      assertEqual(state.resources.crates, 3, 'Exactly two Crates gone');
      assertEqual(state.resources.coins, 70, 'Seventy Coins');
    }
  },

  /* ----- Availability reasons ----- */

  {
    name: 'availableActions lists every action in the stage with a short reason when it is not possible',
    run: function () {
      const state = setFarmTo(newTestGame(), 1, { plots: 2, coins: 0, wood: 0, crops: 0 });
      const listed = engine.availableActions(state, 'planter');
      assertEqual(listed.length, 5, 'Four Planter actions plus Pass');
      const expandFields = listed.find(function (entry) { return entry.actionId === 'expand-fields'; });
      assertEqual(expandFields.available, false, 'Cannot afford it');
      assertEqual(expandFields.reason, 'Not enough Coins', 'And the reason is readable');
      const pass = listed.find(function (entry) { return entry.actionId === 'pass'; });
      assertEqual(pass.available, true, 'You may always pass');
    }
  },

  /* ----- Optional rules ----- */

  {
    name: 'The Lean Season takes a Plot when a turn ends with no Coins and no Crops',
    run: function () {
      let state = engine.createGame({ seed: 7, finishLinePlots: 250, optionalRules: { leanSeason: true } });
      state = setFarmTo(state, 1, { plots: 6, coins: 0, crops: 0, wood: 3 });
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day'), null);
      state = engine.takeAction(state, 'planter', 'pass', {});
      state = engine.takeAction(state, 'builder', 'pass', {});
      assertEqual(state.phase, 'end-of-turn', 'The turn is finished');
      assertEqual(state.resources.plots, 5, 'A Plot was lost to the Lean Season');
    }
  },

  {
    name: 'The Lean Season leaves the farm alone when it still has something',
    run: function () {
      let state = engine.createGame({ seed: 7, finishLinePlots: 250, optionalRules: { leanSeason: true } });
      state = setFarmTo(state, 1, { plots: 6, coins: 0, crops: 1 });
      state = engine.resolveEvent(forceEvent(state, 'a-quiet-day'), null);
      state = engine.takeAction(state, 'planter', 'pass', {});
      state = engine.takeAction(state, 'builder', 'pass', {});
      assertEqual(state.resources.plots, 6, 'No Plot lost');
    }
  },

  {
    name: 'The Mercy Rule ignores the second bad event in a row',
    run: function () {
      let state = engine.createGame({ seed: 7, finishLinePlots: 250, optionalRules: { mercyRule: true } });
      state = setFarmTo(state, 1, { plots: 6, crops: 20, wood: 10 });

      /* First bad turn: Blight bites as normal. */
      state = engine.resolveEvent(forceEvent(state, 'blight'), null);
      assertEqual(state.resources.crops, 10, 'Blight halved 20 to 10');
      state = engine.takeAction(state, 'planter', 'pass', {});
      state = engine.takeAction(state, 'builder', 'pass', {});
      state = engine.endTurn(state);
      assertEqual(state.previousTurnWasHazard, true, 'That was a bad turn');

      /* Second bad turn in a row: ignored. */
      let second = forceEvent(state, 'blight');
      second.currentEvent.ignoredByMercyRule = true;
      second = engine.resolveEvent(second, null);
      assertEqual(second.resources.crops, 10, 'The second Blight is ignored');
    }
  },

  {
    name: 'The Lucky Re-flip can be used once and only once',
    run: function () {
      let state = engine.createGame({ seed: 3, finishLinePlots: 250, optionalRules: { luckyReflip: true } });
      state = engine.rollChance(state);
      assertEqual(engine.luckyReflipAvailable(state), true, 'Available at first');
      const firstEventId = state.currentEvent.id;
      state = engine.useLuckyReflip(state);
      assertEqual(engine.luckyReflipAvailable(state), false, 'Used up');
      assert(typeof state.currentEvent.id === 'string', 'There is still an event on the table');
      assert(firstEventId.length > 0, 'And there was one before');
      assertThrows(function () { engine.useLuckyReflip(state); }, 'Cannot use it twice');
    }
  },

  {
    name: 'Beat the Clock ends the game when the agreed turn limit is up',
    run: function () {
      let state = engine.createGame({
        seed: 11, finishLinePlots: 250, optionalRules: { beatTheClock: true }, turnLimit: 2
      });
      state = playQuietTurn(state, 'pass', 'pass');
      assertEqual(state.turnNumber, 2, 'On to turn 2');
      assertEqual(state.gameOver, false, 'Still going');
      state = playQuietTurn(state, 'pass', 'pass');
      assertEqual(state.gameOver, true, 'The clock ran out');
      assertEqual(state.playersWon, false, 'Two Plots is not 250');
      assertEqual(state.endReason, 'turn-limit', 'And the reason is recorded');
    }
  },

  /* ----- Turn structure ----- */

  {
    name: 'The two players swap roles at the start of every turn',
    run: function () {
      let state = newTestGame();
      assertEqual(engine.playerNameForRole(state, 'planter'), 'Ada', 'Ada starts as Planter');
      state = playQuietTurn(state, 'pass', 'pass');
      assertEqual(engine.playerNameForRole(state, 'planter'), 'Bob', 'Bob is Planter on turn 2');
      state = playQuietTurn(state, 'pass', 'pass');
      assertEqual(engine.playerNameForRole(state, 'planter'), 'Ada', 'And back to Ada on turn 3');
    }
  },

  {
    name: 'Every finished turn adds one row to the history, in the stage ledger order',
    run: function () {
      let state = newTestGame();
      state = playQuietTurn(state, 'pass', 'pass');
      state = playQuietTurn(state, 'pass', 'pass');
      assertEqual(state.history.length, 2, 'Two rows');
      assertEqual(state.history[0].turnNumber, 1, 'Turn 1 first');
      assertEqual(state.history[0].trackedResourceIds.join(','), 'coins,wood,crops,plots', 'Stage 1 ledger order');
    }
  },

  {
    name: 'The engine refuses actions taken out of turn',
    run: function () {
      const state = newTestGame();
      assertThrows(function () { engine.takeAction(state, 'planter', 'pass', {}); },
        'Cannot act before the chance check');
      assertThrows(function () { engine.endTurn(state); }, 'Cannot end a turn that has not started');
      assertThrows(function () { engine.resolveEvent(state, null); }, 'Cannot resolve an event that is not there');
    }
  },

  {
    name: 'The engine never changes the state it was given',
    run: function () {
      const before = newTestGame();
      const snapshot = JSON.stringify(before);
      engine.rollChance(before);
      assertEqual(JSON.stringify(before), snapshot, 'The original state is untouched');
    }
  },

  /* ----- A whole game ----- */

  {
    name: 'A whole 250 Plot game played by a simple policy reaches the finish line, with nothing ever negative',
    run: function () {
      const result = playAWholeGame({ seed: 2024, finishLinePlots: 250 });
      assertEqual(result.state.gameOver, true, 'The game finished');
      assertEqual(result.state.playersWon, true, 'And it was won');
      assert(result.state.resources.plots >= 250, 'The finish line was reached');
      assert(result.everythingStayedPositive, 'No total ever went below zero');
      /* The designer expects about 50 turns for the full campaign. This is a
       * plain greedy bot that never builds the Tool Shed and never packs a
       * Crate, so it should be slower than that, but not wildly slower. */
      assert(result.state.turnNumber < 150, 'And it did not take for ever: ' + result.state.turnNumber + ' turns');
      assertEqual(result.state.stageNumber, 5, 'The farm reached the Agro-Empire');
    }
  },

  {
    name: 'Ten different seeds all play out to a finish with nothing ever negative',
    run: function () {
      for (let seed = 1; seed <= 10; seed += 1) {
        const result = playAWholeGame({ seed: seed * 137, finishLinePlots: 100 });
        assert(result.state.gameOver, 'Seed ' + seed + ' finished');
        assert(result.everythingStayedPositive, 'Seed ' + seed + ' never went negative');
      }
    }
  },

  {
    name: 'A whole game played with dice and every optional rule switched on still finishes',
    run: function () {
      const result = playAWholeGame({
        seed: 4242,
        finishLinePlots: 50,
        chanceMethod: 'dice',
        optionalRules: {
          leanSeason: true, luckyReflip: true, mercyRule: true, foxGuard: true
        }
      });
      assert(result.state.gameOver, 'It finished');
      assert(result.everythingStayedPositive, 'Nothing went negative');
    }
  }
];

/* ===========================================================================
 * The scripted policy used by the whole-game tests
 * ===========================================================================
 * A rough idea of what a resource is worth, only ever used by this test policy
 * to pick between actions. It is not a game rule and lives nowhere near
 * gamedata.js on purpose.
 */
const ROUGH_VALUE_FOR_THE_TEST_POLICY = {
  coins: 1, wood: 1, crops: 2, eggs: 5, fuel: 5, crates: 20, plots: 0
};

function roughValueOf(amounts) {
  let total = 0;
  for (const resourceId of Object.keys(amounts || {})) {
    total += amounts[resourceId] * ROUGH_VALUE_FOR_THE_TEST_POLICY[resourceId];
  }
  return total;
}

/* A gain of Crops is worth nothing if the barn is already full, so the policy
 * has to take the store limit into account or it spends whole turns harvesting
 * crops that rot away the instant they arrive. */
function gainAfterTheStoreLimit(state, gain) {
  const limit = engine.cropStoreLimit(state);
  const realGain = Object.assign({}, gain);
  if (limit !== null && realGain.crops) {
    realGain.crops = Math.min(realGain.crops, Math.max(0, limit - state.resources.crops));
  }
  return realGain;
}

/* Pick the action that gains the most Plots, and failing that the one that
 * leaves the farm best off. Deliberately simple: the point of the test is that
 * the engine keeps working for hundreds of turns, not that the policy is good. */
function chooseAction(state, role) {
  const choices = engine.availableActions(state, role).filter(function (entry) {
    return entry.available;
  });

  let best = null;
  let bestScore = -Infinity;
  for (const entry of choices) {
    let score;
    if (entry.actionId === 'pass') {
      score = -1000;
    } else if (entry.kind === 'sellAnyNumber') {
      const quantity = state.resources[entry.sellResource];
      score = quantity * entry.coinsPerUnit - quantity * ROUGH_VALUE_FOR_THE_TEST_POLICY[entry.sellResource];
    } else if (entry.kind === 'build') {
      score = 1 - roughValueOf(entry.cost);
    } else {
      score = (entry.gain.plots || 0) * 10000 +
        roughValueOf(gainAfterTheStoreLimit(state, entry.gain)) - roughValueOf(entry.cost);
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (!best) {
    return { actionId: 'pass', options: {} };
  }
  if (best.kind === 'sellAnyNumber') {
    return { actionId: best.actionId, options: { quantity: state.resources[best.sellResource] } };
  }
  return { actionId: best.actionId, options: {} };
}

export function playAWholeGame(options) {
  let state = engine.createGame(Object.assign({ playerNames: ['Ada', 'Bob'] }, options));
  let everythingStayedPositive = true;
  let safetyCounter = 0;

  function check() {
    if (!everyResourceIsZeroOrMore(state)) {
      everythingStayedPositive = false;
    }
  }

  while (!state.gameOver && safetyCounter < 20000) {
    safetyCounter += 1;

    if (state.phase === 'chance') {
      state = engine.rollChance(state);
    } else if (state.phase === 'event') {
      /* Always pay your way out of trouble if you can afford it. */
      const affordable = engine.eventChoiceOptions(state).filter(function (option) {
        return option.affordable;
      });
      state = engine.resolveEvent(state, affordable.length > 0 ? affordable[0].id : null);
    } else if (state.phase === 'milestone') {
      state = engine.applyMilestones(state);
    } else if (state.phase === 'obligation') {
      state = engine.resolveObligation(state);
    } else if (state.phase === 'planter-action' || state.phase === 'builder-action') {
      const role = state.phase === 'planter-action' ? 'planter' : 'builder';
      const choice = chooseAction(state, role);
      state = engine.takeAction(state, role, choice.actionId, choice.options);
    } else if (state.phase === 'end-of-turn') {
      state = engine.endTurn(state);
    } else {
      break;
    }
    check();
  }

  return { state: state, everythingStayedPositive: everythingStayedPositive, steps: safetyCounter };
}

/* ===========================================================================
 * Finding a tails on the Over-Water gamble
 * ===========================================================================
 * The gamble uses the seeded generator, so rather than hoping for a tails we
 * simply try starting positions in the generator until we get the one we want.
 * That keeps the test completely repeatable.
 */

function findStateWhereOverWaterGivesFace(resources, wantedFace) {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    let state = setFarmTo(newTestGame(), 1, resources);
    state = forceEvent(state, 'a-quiet-day');
    state = engine.resolveEvent(state, null);
    state.randomState = attempt;
    const afterAction = engine.takeAction(state, 'planter', 'over-water', {});
    if (afterAction.lastGambleResult.face === wantedFace) {
      return afterAction;
    }
  }
  throw new Error('Could not find a gamble result of ' + wantedFace);
}

function findStateWhereOverWaterFails(resources) {
  return findStateWhereOverWaterGivesFace(resources, 'T');
}

function findStateWhereOverWaterSucceeds(resources) {
  return findStateWhereOverWaterGivesFace(resources, 'H');
}

/* ===========================================================================
 * Running the tests
 * ===========================================================================
 */

export function runAllTests() {
  const results = [];
  for (const testCase of TEST_CASES) {
    try {
      testCase.run();
      results.push({ name: testCase.name, passed: true, message: '' });
    } catch (error) {
      results.push({ name: testCase.name, passed: false, message: error.message });
    }
  }
  return results;
}
