/*
 * engine.js
 * ---------------------------------------------------------------------------
 * THE RULES OF THE GAME. This file knows nothing about the screen.
 *
 * There is not a single mention of document, window or any HTML element in
 * here, and there never should be. Everything on screen is drawn by ui.js from
 * the state object that this file produces.
 *
 * The engine is a state machine. You give it a state and an instruction, and
 * it gives you back a NEW state. It never changes the state you passed in, so
 * an old state is always still valid. That is what would make an "undo" button
 * easy to add later.
 *
 * Every number used here comes from gamedata.js. If you find a game number
 * written into this file, it is a bug: move it to gamedata.js.
 * ---------------------------------------------------------------------------
 */

import {
  ACTIONS,
  ALL_RESOURCE_IDS,
  BUILDINGS,
  CHANCE_SLOTS,
  COIN_PLACE_VALUES,
  DEFAULT_FINISH_LINE_PLOTS,
  HAZARD_CHARACTERS,
  MILESTONES,
  OPTIONAL_RULES,
  RESOURCES,
  STARTING_RESOURCES,
  getChanceSlotByCoinValue,
  getChanceSlotByDiceTotal,
  getStageByNumber
} from './gamedata.js';

/* ===========================================================================
 * 1. THE RANDOM NUMBER GENERATOR
 * ===========================================================================
 * We do not use Math.random(). We use a small "seeded" generator instead, and
 * we keep its position inside the game state. That means:
 *
 *   - the same seed always produces exactly the same game, so a game can be
 *     replayed, shared or reported as a bug;
 *   - the tests are repeatable rather than flaky;
 *   - a saved game resumes with exactly the luck it would have had.
 *
 * This is the well known "mulberry32" generator. You do not need to understand
 * the arithmetic; you only need to know that it turns one number into the next
 * one in a fixed, shuffled-looking sequence.
 */

function nextRandomFraction(state) {
  state.randomState = (state.randomState + 0x6D2B79F5) >>> 0;
  let value = state.randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

/* A whole number from lowest to highest, both ends included. */
function nextRandomWholeNumber(state, lowestValue, highestValue) {
  const howManyPossibleValues = highestValue - lowestValue + 1;
  return lowestValue + Math.floor(nextRandomFraction(state) * howManyPossibleValues);
}

/* Turn any text into a number, so that a player can type a seed if they like. */
export function seedFromText(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

/* ===========================================================================
 * 2. SMALL HELPERS
 * ===========================================================================
 */

/* Every public function copies the state before changing it, so that the
 * caller's state object is never modified. */
function copyOfState(state) {
  return structuredClone(state);
}

function writeToLog(state, kind, text, extraFields) {
  const entry = {
    turnNumber: state.turnNumber,
    stageNumber: state.stageNumber,
    kind: kind,
    text: text
  };
  if (extraFields) {
    Object.assign(entry, extraFields);
  }
  state.log.push(entry);
}

/* The stage the farm is in right now, as an object from gamedata.js. */
export function currentStage(state) {
  return getStageByNumber(state.stageNumber);
}

/* The crop store limit, or null if there is no limit in this stage. */
export function cropStoreLimit(state) {
  const stage = currentStage(state);
  if (stage.cropStoreLimitPerPlot === null) {
    return null;
  }
  return stage.cropStoreLimitPerPlot * state.resources.plots;
}

/*
 * Add resources. Store limits are checked THE INSTANT something is gained, so
 * anything over the limit is lost straight away rather than at end of turn.
 * Returns a small report so the caller can say what really happened.
 */
function addResources(state, amounts) {
  const report = { gained: {}, lostToStoreLimit: 0 };
  for (const resourceId of Object.keys(amounts)) {
    const wanted = amounts[resourceId];
    if (wanted <= 0) {
      continue;
    }
    let actualGain = wanted;
    if (resourceId === 'crops') {
      const limit = cropStoreLimit(state);
      if (limit !== null) {
        const roomLeft = Math.max(0, limit - state.resources.crops);
        if (actualGain > roomLeft) {
          report.lostToStoreLimit += actualGain - roomLeft;
          actualGain = roomLeft;
        }
      }
    }
    state.resources[resourceId] += actualGain;
    report.gained[resourceId] = actualGain;
  }
  return report;
}

/*
 * Take resources away. No total may ever go below zero: if an event removes
 * more than the farm holds, the farm simply loses all of it.
 * Returns what was actually taken.
 */
function removeResources(state, amounts) {
  const actuallyRemoved = {};
  for (const resourceId of Object.keys(amounts)) {
    const wanted = amounts[resourceId];
    const taken = Math.min(state.resources[resourceId], wanted);
    state.resources[resourceId] -= taken;
    actuallyRemoved[resourceId] = taken;
  }
  return actuallyRemoved;
}

function farmCanAfford(state, cost) {
  if (!cost) {
    return true;
  }
  return Object.keys(cost).every(function (resourceId) {
    return state.resources[resourceId] >= cost[resourceId];
  });
}

/* The first resource in a cost the farm has not got enough of. */
function firstUnaffordableResource(state, cost) {
  if (!cost) {
    return null;
  }
  return Object.keys(cost).find(function (resourceId) {
    return state.resources[resourceId] < cost[resourceId];
  }) || null;
}

/* "3 Wood", "1 Crate", "8 Coins" - used in reasons and button labels. */
export function describeAmount(resourceId, amount) {
  const resource = RESOURCES[resourceId];
  const name = amount === 1 ? resource.singularName : resource.name;
  return amount + ' ' + name;
}

/* "10 Crops and 1 Fuel" */
export function describeAmounts(amounts) {
  const parts = ALL_RESOURCE_IDS
    .filter(function (resourceId) { return amounts && amounts[resourceId] > 0; })
    .map(function (resourceId) { return describeAmount(resourceId, amounts[resourceId]); });
  if (parts.length === 0) {
    return 'nothing';
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

/* ===========================================================================
 * 3. STARTING A GAME
 * ===========================================================================
 */

/*
 * options looks like this, and every field has a sensible default:
 * {
 *   playerNames: ['Player 1', 'Player 2'],
 *   startingPlanterIndex: 0,          // which of the two names starts as Planter
 *   finishLinePlots: 25,
 *   chanceMethod: 'coins',            // or 'dice'
 *   optionalRules: { leanSeason: false, luckyReflip: false, ... },
 *   turnLimit: null,                  // only used by the Beat the Clock rule
 *   seed: 123456                      // leave out for a random game
 * }
 */
export function createGame(options) {
  const chosenOptions = options || {};

  const optionalRules = {};
  for (const rule of OPTIONAL_RULES) {
    optionalRules[rule.id] = Boolean(chosenOptions.optionalRules && chosenOptions.optionalRules[rule.id]);
  }

  const seed = chosenOptions.seed === undefined || chosenOptions.seed === null
    ? Math.floor(Math.random() * 4294967296)
    : chosenOptions.seed >>> 0;

  const state = {
    /* Housekeeping */
    saveFormatVersion: 1,
    seed: seed,
    randomState: seed,

    /* Settings chosen at setup */
    playerNames: (chosenOptions.playerNames || ['Player 1', 'Player 2']).slice(0, 2),
    startingPlanterIndex: chosenOptions.startingPlanterIndex === 1 ? 1 : 0,
    finishLinePlots: chosenOptions.finishLinePlots || DEFAULT_FINISH_LINE_PLOTS,
    chanceMethod: chosenOptions.chanceMethod === 'dice' ? 'dice' : 'coins',
    optionalRules: optionalRules,
    turnLimit: chosenOptions.turnLimit || null,

    /* Where the farm is */
    turnNumber: 1,
    stageNumber: 1,
    resources: Object.assign({}, STARTING_RESOURCES),
    buildings: {},

    /* Who is doing what this turn. planterIndex says which of the two names is
     * the Planter; the other one is the Builder. They swap every turn. */
    planterIndex: chosenOptions.startingPlanterIndex === 1 ? 1 : 0,

    /* What has happened this turn */
    phase: 'chance',
    chanceResult: null,
    currentEvent: null,
    automaticProductionReport: null,
    turnPriceChanges: [],
    actionBans: [],
    lostActions: { planter: false, builder: false },
    actionsTaken: { planter: false, builder: false },
    lastGambleResult: null,
    lastObligationOutcome: null,

    /* Things that survive from one turn to the next */
    pendingObligation: null,
    luckyReflipsUsed: 0,
    previousTurnWasHazard: false,
    milestonesApplied: [],
    pendingMilestoneId: null,
    lastMilestoneReport: null,

    /* Records */
    log: [],
    history: [],

    /* The end */
    gameOver: false,
    playersWon: false,
    endReason: null
  };

  writeToLog(state, 'game-start',
    'A new farm. ' + describeAmounts(STARTING_RESOURCES) + '. The finish line is ' +
    state.finishLinePlots + ' Plots.');
  writeToLog(state, 'turn-start', 'Turn 1 begins. ' + roleSummaryText(state));

  return state;
}

/* "Alice is the Planter, Bob is the Builder." */
export function roleSummaryText(state) {
  return playerNameForRole(state, 'planter') + ' is ' + titleForRole(state, 'planter') +
    ', ' + playerNameForRole(state, 'builder') + ' is ' + titleForRole(state, 'builder') + '.';
}

export function playerNameForRole(state, role) {
  if (role === 'planter') {
    return state.playerNames[state.planterIndex];
  }
  return state.playerNames[state.planterIndex === 0 ? 1 : 0];
}

export function titleForRole(state, role) {
  const stage = currentStage(state);
  return role === 'planter' ? stage.planterTitle : stage.builderTitle;
}

/* ===========================================================================
 * 4. THE CHANCE CHECK
 * ===========================================================================
 */

/* Flip the coins or roll the dice. The event is shown but NOT yet applied, so
 * that the Lucky Re-flip optional rule can still be called for. */
export function rollChance(state) {
  const newState = copyOfState(state);
  if (newState.phase !== 'chance') {
    throw new Error('The chance check can only be made at the start of a turn.');
  }
  performChanceCheck(newState, false);
  return newState;
}

/* The Lucky Re-flip optional rule: once per game, run the chance check again.
 * It must be called before the result is acted on, which is why the event sits
 * unresolved until the players press Continue. */
export function useLuckyReflip(state) {
  const newState = copyOfState(state);
  if (!luckyReflipAvailable(newState)) {
    throw new Error('The Lucky Re-flip is not available.');
  }
  newState.luckyReflipsUsed += 1;
  performChanceCheck(newState, true);
  return newState;
}

export function luckyReflipAvailable(state) {
  const rule = OPTIONAL_RULES.find(function (r) { return r.id === 'luckyReflip'; });
  return state.optionalRules.luckyReflip === true &&
    state.phase === 'event' &&
    state.luckyReflipsUsed < rule.usesPerGame;
}

function performChanceCheck(state, isReflip) {
  let chanceResult;
  if (state.chanceMethod === 'dice') {
    const firstDie = nextRandomWholeNumber(state, 1, 6);
    const secondDie = nextRandomWholeNumber(state, 1, 6);
    const total = firstDie + secondDie;
    const slot = getChanceSlotByDiceTotal(total);
    chanceResult = {
      method: 'dice',
      diceFaces: [firstDie, secondDie],
      diceTotal: total,
      coinFaces: null,
      coinValue: null,
      slotNumber: slot.slot,
      character: slot.character
    };
  } else {
    /* Three coins. Heads is 1 and tails is 0. The first coin is worth 4, the
     * second 2 and the third 1, which is exactly how computers count. */
    const coinBits = [
      nextRandomWholeNumber(state, 0, 1),
      nextRandomWholeNumber(state, 0, 1),
      nextRandomWholeNumber(state, 0, 1)
    ];
    let coinValue = 0;
    for (let index = 0; index < coinBits.length; index += 1) {
      coinValue += coinBits[index] * COIN_PLACE_VALUES[index];
    }
    const slot = getChanceSlotByCoinValue(coinValue);
    chanceResult = {
      method: 'coins',
      coinFaces: coinBits.map(function (bit) { return bit === 1 ? 'H' : 'T'; }),
      coinValue: coinValue,
      diceFaces: null,
      diceTotal: null,
      slotNumber: slot.slot,
      character: slot.character
    };
  }

  const stage = currentStage(state);
  const event = stage.events.find(function (e) { return e.slot === chanceResult.slotNumber; });

  /* The Mercy Rule optional rule: a hazard or disaster on two turns in a row
   * means the second one is ignored. */
  const thisIsBadLuck = HAZARD_CHARACTERS.includes(chanceResult.character);
  const ignoredByMercyRule = state.optionalRules.mercyRule === true &&
    thisIsBadLuck && state.previousTurnWasHazard === true;

  state.chanceResult = chanceResult;
  state.currentEvent = {
    id: event.id,
    name: event.name,
    text: event.text,
    slot: event.slot,
    character: chanceResult.character,
    isBadLuck: thisIsBadLuck,
    ignoredByMercyRule: ignoredByMercyRule,
    hasChoice: Boolean(event.choice),
    resolved: false,
    outcomeTexts: []
  };
  state.phase = 'event';

  writeToLog(state, 'chance',
    (isReflip ? 'Lucky Re-flip. ' : '') + describeChanceResult(chanceResult) +
    ' - slot ' + chanceResult.slotNumber + ', ' + event.name + '.');
}

export function describeChanceResult(chanceResult) {
  if (!chanceResult) {
    return '';
  }
  if (chanceResult.method === 'dice') {
    return 'Rolled ' + chanceResult.diceFaces.join(' and ') + ', total ' + chanceResult.diceTotal;
  }
  return 'Flipped ' + chanceResult.coinFaces.join(' ') + ', which reads ' + chanceResult.coinValue;
}

/* Which pay-or-suffer options the farm can actually afford right now.
 * If this returns an empty list, there is no prompt: the penalty just happens.
 *
 * Note that automatic production is applied when the event is resolved, a
 * moment after this is called. That never changes the answer, because no
 * payment in the game is made in Crops or Crates, which are the only things
 * automatic production ever gives. */
export function eventChoiceOptions(state) {
  const eventData = currentEventData(state);
  if (!eventData || !eventData.choice) {
    return [];
  }
  return eventData.choice.options.map(function (option) {
    return {
      id: option.id,
      label: option.label,
      cost: option.cost,
      affordable: farmCanAfford(state, option.cost)
    };
  });
}

/* The full event record from gamedata.js for the event now on the table. */
export function currentEventData(state) {
  if (!state.currentEvent) {
    return null;
  }
  const stage = currentStage(state);
  return stage.events.find(function (e) { return e.id === state.currentEvent.id; });
}

/*
 * Resolve the event that is on the table.
 *
 * chosenOptionId is the id of a payment option, or null to decline (or simply
 * to continue, for an event with no choice at all).
 *
 * DELIBERATE DIVERGENCE FROM THE PRINTED TURN ORDER.
 * The printed rules collect automatic production at step 2 and draw the event
 * at step 3, but Bumper Crop and Drought both change automatic production. The
 * rules specification says either order is acceptable so long as the choice is
 * documented. We resolve the chance check first and then collect production,
 * so that Bumper Crop and Drought can affect it. Everything else about the
 * event still happens after production, exactly as the printed order says.
 */
export function resolveEvent(state, chosenOptionId) {
  const newState = copyOfState(state);
  if (newState.phase !== 'event') {
    throw new Error('There is no event waiting to be resolved.');
  }

  const eventData = currentEventData(newState);
  const eventRecord = newState.currentEvent;

  /* Step one: automatic production, scaled by Bumper Crop or Drought. */
  const productionMultiplier = eventRecord.ignoredByMercyRule
    ? 1
    : (eventData.productionMultiplier === undefined ? 1 : eventData.productionMultiplier);
  collectAutomaticProduction(newState, productionMultiplier);

  /* Step two: the event itself. */
  if (eventRecord.ignoredByMercyRule) {
    eventRecord.outcomeTexts.push('Mercy Rule: two bad turns in a row, so this one is ignored.');
    writeToLog(newState, 'event', eventData.name + ' was ignored by the Mercy Rule.');
  } else if (eventData.choice) {
    resolveEventChoice(newState, eventData, chosenOptionId);
  } else {
    applyEffects(newState, eventData.effects, eventRecord.outcomeTexts);
    writeToLog(newState, 'event', eventData.name + '. ' + eventData.text);
  }

  eventRecord.resolved = true;
  moveToNextStep(newState);
  return newState;
}

function resolveEventChoice(state, eventData, chosenOptionId) {
  const eventRecord = state.currentEvent;
  const affordableOptions = eventChoiceOptions(state).filter(function (option) {
    return option.affordable;
  });

  /* If the farm cannot afford any way out, the penalty simply happens. */
  if (affordableOptions.length === 0) {
    eventRecord.outcomeTexts.push('The farm cannot afford to pay, so the penalty happens.');
    applyEffects(state, eventData.choice.penalty, eventRecord.outcomeTexts);
    writeToLog(state, 'event', eventData.name + '. Could not afford to pay, so the penalty happened.');
    return;
  }

  const chosenOption = eventData.choice.options.find(function (option) {
    return option.id === chosenOptionId;
  });

  if (!chosenOption) {
    /* Declined, or no choice given: take the penalty. */
    eventRecord.outcomeTexts.push('You chose not to pay.');
    applyEffects(state, eventData.choice.penalty, eventRecord.outcomeTexts);
    writeToLog(state, 'event', eventData.name + '. Chose not to pay.');
    return;
  }

  if (!farmCanAfford(state, chosenOption.cost)) {
    throw new Error('The farm cannot afford that option.');
  }

  removeResources(state, chosenOption.cost);
  eventRecord.outcomeTexts.push('Paid ' + describeAmounts(chosenOption.cost) + '. ' + chosenOption.label + '.');
  writeToLog(state, 'event', eventData.name + '. Paid ' + describeAmounts(chosenOption.cost) + '.');
}

/* ===========================================================================
 * 5. AUTOMATIC PRODUCTION
 * ===========================================================================
 */

function collectAutomaticProduction(state, multiplier) {
  const stage = currentStage(state);
  if (!stage.automaticProduction) {
    state.automaticProductionReport = null;
    return;
  }

  const amounts = {};
  for (const resourceId of Object.keys(stage.automaticProduction)) {
    amounts[resourceId] = stage.automaticProduction[resourceId] * multiplier;
  }

  if (Object.keys(amounts).every(function (id) { return amounts[id] === 0; })) {
    state.automaticProductionReport = { amounts: amounts, text: 'No automatic production this turn.' };
    writeToLog(state, 'production', 'No automatic production this turn.');
    return;
  }

  addResources(state, amounts);
  const text = 'The estate produces ' + describeAmounts(amounts) + ' on its own.';
  state.automaticProductionReport = { amounts: amounts, text: text };
  writeToLog(state, 'production', text);
}

/* ===========================================================================
 * 6. EVENT EFFECTS
 * ===========================================================================
 * One clearly named branch per effect type. Add a new effect type by adding a
 * branch here and using it in gamedata.js.
 */

function applyEffects(state, effects, outcomeTexts) {
  if (!effects) {
    return;
  }
  for (const effect of effects) {
    applyOneEffect(state, effect, outcomeTexts);
  }
}

function applyOneEffect(state, effect, outcomeTexts) {
  if (effect.type === 'gain') {
    const report = addResources(state, effect.amounts);
    outcomeTexts.push('Gained ' + describeAmounts(report.gained) + '.');
    if (report.lostToStoreLimit > 0) {
      outcomeTexts.push(report.lostToStoreLimit + ' Crops rotted away: the barn is full.');
    }

  } else if (effect.type === 'lose') {
    /* "Lose 2 Wood, or 2 Crops if you have no Wood at all." */
    let amountsToLose = effect.amounts;
    if (effect.ifEmptyInstead) {
      const primaryResource = Object.keys(effect.amounts)[0];
      if (state.resources[primaryResource] === 0) {
        amountsToLose = effect.ifEmptyInstead;
      }
    }
    const removed = removeResources(state, amountsToLose);
    outcomeTexts.push('Lost ' + describeAmounts(removed) + '.');

  } else if (effect.type === 'loseAll') {
    const amountsToLose = {};
    for (const resourceId of effect.resources) {
      amountsToLose[resourceId] = state.resources[resourceId];
    }
    const removed = removeResources(state, amountsToLose);
    outcomeTexts.push('Lost every last ' + describeAmounts(removed) + '.');

  } else if (effect.type === 'halve') {
    /* Halving always rounds down, so 7 Crops becomes 3 and you lose 4. */
    for (const resourceId of effect.resources) {
      const before = state.resources[resourceId];
      const kept = Math.floor(before / 2);
      state.resources[resourceId] = kept;
      outcomeTexts.push('Half your ' + RESOURCES[resourceId].name + ' is gone: ' +
        before + ' becomes ' + kept + '.');
    }

  } else if (effect.type === 'foxEggs') {
    /* Lose 2 Eggs, or half the basket rounding down if that is more. The Fox
     * Guard optional rule caps the loss instead. */
    const eggsHeld = state.resources.eggs;
    let loss = Math.max(effect.minimumLoss, Math.floor(eggsHeld / 2));
    if (state.optionalRules.foxGuard === true) {
      loss = Math.min(loss, effect.guardedMaximumLoss);
    }
    const removed = removeResources(state, { eggs: loss });
    outcomeTexts.push('The fox takes ' + describeAmount('eggs', removed.eggs) + '.');

  } else if (effect.type === 'priceChange') {
    /* Turn-scoped only. Cleared at end of turn by endTurn(). */
    state.turnPriceChanges.push({
      actionId: effect.actionId,
      operation: effect.operation,
      factor: effect.factor,
      gain: effect.gain,
      cost: effect.cost,
      coinsPerUnit: effect.coinsPerUnit
    });
    outcomeTexts.push('Prices have changed for this turn only. Look at the action buttons.');

  } else if (effect.type === 'banAction') {
    state.actionBans.push({ actionIds: effect.actionIds, tags: [], reason: effect.reason });
    outcomeTexts.push(effect.reason + '.');

  } else if (effect.type === 'banExports') {
    state.actionBans.push({ actionIds: [], tags: ['export'], reason: effect.reason });
    outcomeTexts.push(effect.reason + '.');

  } else if (effect.type === 'loseAction') {
    state.lostActions[effect.role] = true;
    outcomeTexts.push('The ' + (effect.role === 'planter' ? 'Planter' : 'Builder') +
      ' takes no action this turn.');

  } else {
    throw new Error('Unknown effect type: ' + effect.type);
  }
}

/* ===========================================================================
 * 7. WORKING OUT WHAT AN ACTION COSTS AND GIVES RIGHT NOW
 * ===========================================================================
 * Three things can change an action's numbers:
 *   1. the base numbers in gamedata.js;
 *   2. a building that has been built, which replaces the gain;
 *   3. a price change from this turn's event, which expires at end of turn.
 * They are applied in that order.
 */
export function effectiveActionDetails(state, actionId) {
  const action = ACTIONS[actionId];
  if (!action) {
    throw new Error('There is no action with the id ' + actionId);
  }

  let cost = Object.assign({}, action.cost || {});
  let gain = Object.assign({}, action.gain || {});
  let coinsPerUnit = action.coinsPerUnit;
  let hasTurnPriceChange = false;

  if (action.buildingUpgrades) {
    for (const upgrade of action.buildingUpgrades) {
      if (state.buildings[upgrade.buildingId]) {
        gain = Object.assign({}, upgrade.gain);
      }
    }
  }

  for (const change of state.turnPriceChanges) {
    if (change.actionId !== actionId) {
      continue;
    }
    hasTurnPriceChange = true;
    if (change.operation === 'setGain') {
      gain = Object.assign({}, change.gain);
    } else if (change.operation === 'multiplyGain') {
      const multipliedGain = {};
      for (const resourceId of Object.keys(gain)) {
        multipliedGain[resourceId] = gain[resourceId] * change.factor;
      }
      gain = multipliedGain;
    } else if (change.operation === 'setCost') {
      cost = Object.assign({}, change.cost);
    } else if (change.operation === 'setCoinsPerUnit') {
      coinsPerUnit = change.coinsPerUnit;
    } else {
      throw new Error('Unknown price change operation: ' + change.operation);
    }
  }

  return {
    action: action,
    cost: cost,
    gain: gain,
    coinsPerUnit: coinsPerUnit,
    hasTurnPriceChange: hasTurnPriceChange
  };
}

/* Which ban, if any, stops this action being taken this turn. */
function banStoppingAction(state, action) {
  return state.actionBans.find(function (ban) {
    if (ban.actionIds.includes(action.id)) {
      return true;
    }
    return ban.tags.includes('export') && action.isExport === true;
  }) || null;
}

/* ===========================================================================
 * 8. WHICH ACTIONS ARE AVAILABLE
 * ===========================================================================
 * Returns EVERY action in the stage for that role, whether it is possible or
 * not, with a short reason when it is not. Seeing what you cannot yet afford
 * is part of the game, so nothing is hidden.
 */
export function availableActions(state, role) {
  const stage = currentStage(state);
  const mainActionIds = role === 'planter' ? stage.planterActions : stage.builderActions;
  const smallChangeActionIds = role === 'planter' ? stage.planterSmallChangeActions : stage.builderSmallChangeActions;

  const listed = [];
  for (const actionId of mainActionIds) {
    listed.push(describeAvailability(state, actionId, false));
  }
  for (const actionId of smallChangeActionIds) {
    listed.push(describeAvailability(state, actionId, true));
  }
  /* Passing is always allowed, and always last. */
  listed.push(describeAvailability(state, 'pass', false));
  return listed;
}

function describeAvailability(state, actionId, isSmallChange) {
  const details = effectiveActionDetails(state, actionId);
  const action = details.action;

  const entry = {
    actionId: actionId,
    name: action.name,
    kind: action.kind,
    cost: details.cost,
    gain: details.gain,
    coinsPerUnit: details.coinsPerUnit,
    sellResource: action.sellResource || null,
    buildingId: action.buildingId || null,
    isSmallChange: isSmallChange,
    hasTurnPriceChange: details.hasTurnPriceChange,
    flavourText: action.flavourText || null,
    gambleDescription: action.gambleDescription || null,
    available: true,
    reason: ''
  };

  const ban = banStoppingAction(state, action);
  if (ban) {
    entry.available = false;
    entry.reason = ban.reason;
    return entry;
  }

  if (action.kind === 'build' && state.buildings[action.buildingId]) {
    entry.available = false;
    entry.reason = 'Already built';
    return entry;
  }

  if (action.kind === 'sellAnyNumber') {
    if (state.resources[action.sellResource] < 1) {
      entry.available = false;
      entry.reason = 'No ' + RESOURCES[action.sellResource].name + ' to sell';
    }
    return entry;
  }

  const missingResource = firstUnaffordableResource(state, details.cost);
  if (missingResource) {
    entry.available = false;
    entry.reason = 'Not enough ' + RESOURCES[missingResource].name;
  }
  return entry;
}

/* Look one action entry up without rebuilding the whole list. */
export function findAvailableAction(state, role, actionId) {
  return availableActions(state, role).find(function (entry) {
    return entry.actionId === actionId;
  }) || null;
}

/*
 * A warning to show before an action, or null. A warning never blocks the
 * action; the players may always press on.
 *
 * The one warning in the game is the Crate warning: a Crate is worth 35 Coins
 * in Stage 4 and only 20 Coins in Stage 5, so carrying Crates over the 100
 * Plot milestone loses money.
 */
export function warningForAction(state, role, actionId, options) {
  const entry = findAvailableAction(state, role, actionId);
  if (!entry) {
    return null;
  }
  const plotsGained = entry.gain.plots || 0;
  if (plotsGained === 0) {
    return null;
  }
  const plotsAfterwards = state.resources.plots + plotsGained;

  for (const milestone of MILESTONES) {
    if (!milestone.warnIfHolding) {
      continue;
    }
    const alreadyDone = state.milestonesApplied.includes(milestone.id);
    const wouldCross = state.resources.plots < milestone.atPlots && plotsAfterwards >= milestone.atPlots;
    const wouldEndTheGame = plotsAfterwards >= state.finishLinePlots;
    const holdingSome = state.resources[milestone.warnIfHolding] > 0;
    if (!alreadyDone && wouldCross && holdingSome && !wouldEndTheGame) {
      return milestone.warningText;
    }
  }
  return null;
}

/* ===========================================================================
 * 9. TAKING AN ACTION
 * ===========================================================================
 */

/*
 * options is used by the two actions that need extra information:
 *   sellAnyNumber: { quantity: 7 }
 */
export function takeAction(state, role, actionId, options) {
  const newState = copyOfState(state);
  const chosenOptions = options || {};

  const expectedPhase = role === 'planter' ? 'planter-action' : 'builder-action';
  if (newState.phase !== expectedPhase) {
    throw new Error('It is not the ' + role + "'s turn to act.");
  }

  const entry = findAvailableAction(newState, role, actionId);
  if (!entry) {
    throw new Error('The ' + role + ' cannot take the action ' + actionId + ' in this stage.');
  }
  if (!entry.available) {
    throw new Error('That action is not available: ' + entry.reason);
  }

  const action = ACTIONS[actionId];
  const whoIsActing = playerNameForRole(newState, role) + ' (' + titleForRole(newState, role) + ')';
  const outcomeTexts = [];

  if (action.kind === 'pass') {
    outcomeTexts.push('Passed, and did nothing.');

  } else if (action.kind === 'build') {
    removeResources(newState, entry.cost);
    newState.buildings[action.buildingId] = true;
    outcomeTexts.push('Spent ' + describeAmounts(entry.cost) + ' and built the ' +
      BUILDINGS[action.buildingId].name + '. ' + BUILDINGS[action.buildingId].effectText);

  } else if (action.kind === 'sellAnyNumber') {
    const quantity = Math.floor(chosenOptions.quantity === undefined ? 0 : chosenOptions.quantity);
    if (quantity < 1) {
      throw new Error('You must sell at least one.');
    }
    if (quantity > newState.resources[action.sellResource]) {
      throw new Error('You do not have that many to sell.');
    }
    const coinsEarned = quantity * entry.coinsPerUnit;
    removeResources(newState, defineAmount(action.sellResource, quantity));
    addResources(newState, { coins: coinsEarned });
    outcomeTexts.push('Sold ' + describeAmount(action.sellResource, quantity) + ' for ' +
      describeAmount('coins', coinsEarned) + '.');

  } else if (action.kind === 'convert' || action.kind === 'gamble') {
    removeResources(newState, entry.cost);
    const report = addResources(newState, entry.gain);
    outcomeTexts.push('Spent ' + describeAmounts(entry.cost) + ' and gained ' +
      describeAmounts(report.gained) + '.');
    if (report.lostToStoreLimit > 0) {
      outcomeTexts.push(report.lostToStoreLimit +
        ' Crops rotted away straight after: the barn only holds ' + cropStoreLimit(newState) + '.');
    }
    if (action.kind === 'gamble') {
      resolveGamble(newState, action, outcomeTexts);
    }

  } else {
    throw new Error('Unknown action kind: ' + action.kind);
  }

  newState.actionsTaken[role] = true;
  writeToLog(newState, 'action', whoIsActing + ': ' + action.name + '. ' + outcomeTexts.join(' '), {
    role: role,
    actionId: actionId
  });

  checkForEndOfGame(newState);
  if (!newState.gameOver) {
    checkForMilestone(newState);
  }
  moveToNextStep(newState);
  return newState;
}

/* A tiny helper so that { [resourceId]: quantity } stays readable. */
function defineAmount(resourceId, quantity) {
  const amounts = {};
  amounts[resourceId] = quantity;
  return amounts;
}

/* The single coin flip that Over-Water calls for. Heads is good news. */
function resolveGamble(state, action, outcomeTexts) {
  const coinIsHeads = nextRandomWholeNumber(state, 0, 1) === 1;
  state.lastGambleResult = {
    actionId: action.id,
    face: coinIsHeads ? 'H' : 'T',
    isGoodNews: coinIsHeads,
    texts: []
  };

  if (coinIsHeads) {
    const text = 'The gamble coin came up heads. The field is fine.';
    state.lastGambleResult.texts.push(text);
    outcomeTexts.push(text);
    return;
  }

  const text = 'The gamble coin came up tails. The field floods.';
  state.lastGambleResult.texts.push(text);
  outcomeTexts.push(text);

  if (action.onTails.lose) {
    const removed = removeResources(state, action.onTails.lose);
    const lossText = 'Lost ' + describeAmounts(removed) + '.';
    state.lastGambleResult.texts.push(lossText);
    outcomeTexts.push(lossText);
  }

  /* The deferred obligation. This lands on whoever is the Builder NEXT turn,
   * which is the other person, because the roles swap. */
  if (action.onTails.createsObligation) {
    const obligationData = action.onTails.createsObligation;
    state.pendingObligation = {
      id: obligationData.id,
      role: obligationData.role,
      dueOnTurn: state.turnNumber + obligationData.turnsAhead,
      cost: obligationData.cost,
      name: obligationData.name,
      payText: obligationData.payText,
      failText: obligationData.failText
    };
    const obligationText = 'Next turn the Builder must ' +
      obligationData.payText.charAt(0).toLowerCase() + obligationData.payText.slice(1) + '.';
    state.lastGambleResult.texts.push(obligationText);
    outcomeTexts.push(obligationText);
  }
}

/* ===========================================================================
 * 10. THE DEFERRED OBLIGATION
 * ===========================================================================
 * A failed Over-Water gamble leaves a job for the Builder on the FOLLOWING
 * turn. It survives the role swap, so it lands on the other person. It is
 * shown to the Builder before they choose an action.
 */

export function obligationDueNow(state) {
  if (!state.pendingObligation) {
    return null;
  }
  if (state.pendingObligation.dueOnTurn !== state.turnNumber) {
    return null;
  }
  return state.pendingObligation;
}

export function canPayObligation(state) {
  const obligation = obligationDueNow(state);
  if (!obligation) {
    return false;
  }
  return farmCanAfford(state, obligation.cost);
}

/*
 * Settle the obligation. There is no real choice here: the rules say the
 * Builder MUST spend the Wood, and only if the farm has not got the Wood does
 * the Builder lose the action instead.
 */
export function resolveObligation(state) {
  const newState = copyOfState(state);
  if (newState.phase !== 'obligation') {
    throw new Error('There is no obligation waiting to be settled.');
  }
  const obligation = newState.pendingObligation;

  if (farmCanAfford(newState, obligation.cost)) {
    removeResources(newState, obligation.cost);
    newState.lastObligationOutcome = {
      paid: true,
      text: 'Paid ' + describeAmounts(obligation.cost) + ' to ' + obligation.name.toLowerCase() + '.'
    };
  } else {
    newState.lostActions.builder = true;
    newState.lastObligationOutcome = {
      paid: false,
      text: obligation.failText
    };
  }

  newState.pendingObligation = null;
  writeToLog(newState, 'obligation', obligation.name + '. ' + newState.lastObligationOutcome.text);
  moveToNextStep(newState);
  return newState;
}

/* ===========================================================================
 * 11. MILESTONES
 * ===========================================================================
 * Crossing 10, 25, 50 or 100 Plots part way through a turn is resolved the
 * moment the current action finishes, and before the next action is taken.
 */

function checkForMilestone(state) {
  const nextMilestone = MILESTONES.find(function (milestone) {
    return !state.milestonesApplied.includes(milestone.id) &&
      state.resources.plots >= milestone.atPlots;
  });
  state.pendingMilestoneId = nextMilestone ? nextMilestone.id : null;
}

export function pendingMilestone(state) {
  if (!state.pendingMilestoneId) {
    return null;
  }
  return MILESTONES.find(function (milestone) {
    return milestone.id === state.pendingMilestoneId;
  });
}

/*
 * Work through the milestone checklist in order and record what happened at
 * each step, so that the screen can walk the players through it one line at a
 * time. That walkthrough is the single biggest thing the digital version can
 * do better than the tabletop game.
 */
export function applyMilestones(state) {
  const newState = copyOfState(state);
  const milestone = pendingMilestone(newState);
  if (!milestone) {
    throw new Error('There is no milestone waiting.');
  }

  const report = {
    milestoneId: milestone.id,
    title: milestone.title,
    atPlots: milestone.atPlots,
    steps: []
  };

  for (const step of milestone.steps) {
    const outcomeText = applyMilestoneStep(newState, step);
    report.steps.push({
      id: step.id,
      heading: step.heading,
      detail: step.detail,
      outcomeText: outcomeText
    });
  }

  /* The new stage brings the new ledger, the new action lists, the new titles
   * and, where there is one, the new automatic production. */
  newState.stageNumber = milestone.newStageNumber;
  newState.milestonesApplied.push(milestone.id);
  newState.pendingMilestoneId = null;
  newState.lastMilestoneReport = report;

  writeToLog(newState, 'milestone', milestone.title + ' at ' + milestone.atPlots + ' Plots. ' +
    report.steps.map(function (step) { return step.outcomeText || step.heading; }).join(' '));

  /* A second milestone could in principle be waiting, if a single action
   * jumped over two of them. Check again so it is not missed. */
  checkForEndOfGame(newState);
  if (!newState.gameOver) {
    checkForMilestone(newState);
  }
  moveToNextStep(newState);
  return newState;
}

function applyMilestoneStep(state, step) {
  if (step.kind === 'note') {
    return null;
  }

  if (step.kind === 'grantBuilding') {
    state.buildings[step.buildingId] = true;
    return 'The ' + BUILDINGS[step.buildingId].name + ' is yours, free.';
  }

  if (step.kind === 'convertResource') {
    const held = state.resources[step.fromResource];
    const madeUnits = Math.floor(held / step.fromAmountPerUnit);
    const leftOver = held - madeUnits * step.fromAmountPerUnit;
    state.resources[step.fromResource] = step.removeSourceFromGame ? 0 : leftOver;
    state.resources[step.toResource] += madeUnits;
    let text = 'You had ' + describeAmount(step.fromResource, held) + ', that becomes ' +
      describeAmount(step.toResource, madeUnits) + '.';
    if (leftOver > 0 && step.removeSourceFromGame) {
      text += ' The odd ' + describeAmount(step.fromResource, leftOver) + ' is left behind.';
    }
    return text;
  }

  if (step.kind === 'sellResource') {
    const held = state.resources[step.resource];
    const coinsEarned = held * step.coinsPerUnit;
    state.resources[step.resource] = step.removeSourceFromGame ? 0 : 0;
    state.resources.coins += coinsEarned;
    return 'You had ' + describeAmount(step.resource, held) + ', that becomes ' +
      describeAmount('coins', coinsEarned) + '.';
  }

  if (step.kind === 'packAndSell') {
    const held = state.resources[step.fromResource];
    const madeUnits = Math.floor(held / step.fromAmountPerUnit);
    const leftOver = held - madeUnits * step.fromAmountPerUnit;
    const coinsEarned = leftOver * step.remainderCoinsPerUnit;
    state.resources[step.fromResource] = step.removeSourceFromGame ? 0 : leftOver;
    state.resources[step.toResource] += madeUnits;
    state.resources.coins += coinsEarned;
    return 'You had ' + describeAmount(step.fromResource, held) + ', that becomes ' +
      describeAmount(step.toResource, madeUnits) + ' and ' +
      describeAmount('coins', coinsEarned) + '.';
  }

  throw new Error('Unknown milestone step kind: ' + step.kind);
}

/* ===========================================================================
 * 12. MOVING THROUGH A TURN
 * ===========================================================================
 * One place decides what happens next, so the order can never drift apart in
 * different corners of the code.
 */

function moveToNextStep(state) {
  if (state.gameOver) {
    state.phase = 'game-over';
    return;
  }

  if (state.pendingMilestoneId) {
    state.phase = 'milestone';
    return;
  }

  if (!state.actionsTaken.planter) {
    if (state.lostActions.planter) {
      state.actionsTaken.planter = true;
      writeToLog(state, 'action', 'The Planter takes no action this turn.', { role: 'planter' });
      moveToNextStep(state);
      return;
    }
    state.phase = 'planter-action';
    return;
  }

  if (!state.actionsTaken.builder) {
    /* The flooded field is settled before the Builder chooses an action. */
    if (obligationDueNow(state) && !state.lostActions.builder) {
      state.phase = 'obligation';
      return;
    }
    if (state.lostActions.builder) {
      state.actionsTaken.builder = true;
      writeToLog(state, 'action', 'The Builder takes no action this turn.', { role: 'builder' });
      moveToNextStep(state);
      return;
    }
    state.phase = 'builder-action';
    return;
  }

  finishTheTurnsBusiness(state);
  state.phase = 'end-of-turn';
}

/* Everything that happens once both actions are done, but before the players
 * say the ledger, so that the ledger they say is the true one. */
function finishTheTurnsBusiness(state) {
  if (state.turnBusinessFinished) {
    return;
  }
  state.turnBusinessFinished = true;

  applyLeanSeasonIfNeeded(state);
  recordHistoryRow(state);
}

/* The Lean Season optional rule. */
function applyLeanSeasonIfNeeded(state) {
  if (state.optionalRules.leanSeason !== true) {
    return;
  }
  const stage = currentStage(state);
  /* Crops do not exist in Stage 5, so there the test is simply "no Coins". */
  const cropsAreTracked = stage.ledgerOrder.includes('crops');
  const noCoins = state.resources.coins === 0;
  const noCrops = !cropsAreTracked || state.resources.crops === 0;
  if (!noCoins || !noCrops) {
    return;
  }
  const rule = OPTIONAL_RULES.find(function (r) { return r.id === 'leanSeason'; });
  const removed = removeResources(state, { plots: rule.plotsLostWhenLean });
  writeToLog(state, 'optional-rule',
    'The Lean Season: the cupboard is bare, so the farm loses ' + describeAmount('plots', removed.plots) + '.');
  state.leanSeasonBitThisTurn = true;
}

function recordHistoryRow(state) {
  const stage = currentStage(state);
  state.history.push({
    turnNumber: state.turnNumber,
    stageNumber: state.stageNumber,
    eventName: state.currentEvent ? state.currentEvent.name : null,
    trackedResourceIds: stage.ledgerOrder.slice(),
    resources: Object.assign({}, state.resources)
  });
}

/* The end-of-turn ledger, in the stage's own fixed order, as a list of
 * { resourceId, amount } for the screen to lay out. */
export function ledgerLine(state) {
  const stage = currentStage(state);
  return stage.ledgerOrder.map(function (resourceId) {
    return { resourceId: resourceId, amount: state.resources[resourceId] };
  });
}

/* ===========================================================================
 * 13. ENDING THE TURN
 * ===========================================================================
 */
export function endTurn(state) {
  const newState = copyOfState(state);
  if (newState.phase !== 'end-of-turn') {
    throw new Error('The turn is not finished yet.');
  }

  /* Beat the Clock optional rule: stop when the agreed turn limit is up. */
  if (newState.optionalRules.beatTheClock === true && newState.turnLimit &&
      newState.turnNumber >= newState.turnLimit) {
    newState.gameOver = true;
    newState.playersWon = newState.resources.plots >= newState.finishLinePlots;
    newState.endReason = 'turn-limit';
    newState.phase = 'game-over';
    writeToLog(newState, 'game-over', 'The agreed ' + newState.turnLimit +
      ' turns are up. The farm scores ' + describeAmount('plots', newState.resources.plots) + '.');
    return newState;
  }

  /* Remember whether this turn was a bad one, for the Mercy Rule. A turn that
   * was itself ignored by the Mercy Rule does not count, otherwise every
   * hazard after the first would be ignored for ever. */
  newState.previousTurnWasHazard = Boolean(
    newState.currentEvent &&
    newState.currentEvent.isBadLuck &&
    !newState.currentEvent.ignoredByMercyRule
  );

  /* Clear everything that only lasted for this turn. */
  newState.turnPriceChanges = [];
  newState.actionBans = [];
  newState.lostActions = { planter: false, builder: false };
  newState.actionsTaken = { planter: false, builder: false };
  newState.chanceResult = null;
  newState.currentEvent = null;
  newState.automaticProductionReport = null;
  newState.lastGambleResult = null;
  newState.lastObligationOutcome = null;
  newState.lastMilestoneReport = null;
  newState.turnBusinessFinished = false;
  newState.leanSeasonBitThisTurn = false;

  newState.turnNumber += 1;
  /* Swap roles. Nobody gets stuck growing carrots all game. */
  newState.planterIndex = newState.planterIndex === 0 ? 1 : 0;
  newState.phase = 'chance';

  writeToLog(newState, 'turn-start', 'Turn ' + newState.turnNumber + ' begins. ' + roleSummaryText(newState));
  return newState;
}

/* ===========================================================================
 * 14. WINNING
 * ===========================================================================
 * Reaching the agreed number of Plots ends the game at once. If the finish
 * line happens to be a milestone number, the game ends rather than the
 * milestone being worked through: there would be no stage left to play.
 */
function checkForEndOfGame(state) {
  if (state.resources.plots >= state.finishLinePlots) {
    state.gameOver = true;
    state.playersWon = true;
    state.endReason = 'finish-line';
    writeToLog(state, 'game-over', 'The farm reaches ' + describeAmount('plots', state.resources.plots) +
      ' on turn ' + state.turnNumber + '. The Mega-Farm Challenge is won.');
  }
}

/* A short summary for the win screen. */
export function gameSummary(state) {
  const actionsTaken = state.log.filter(function (entry) { return entry.kind === 'action'; }).length;
  const milestonesReached = state.milestonesApplied.length;
  const badTurns = state.log.filter(function (entry) {
    return entry.kind === 'event' && entry.text.includes('Lost');
  }).length;
  return {
    plotsReached: state.resources.plots,
    finishLinePlots: state.finishLinePlots,
    turnsTaken: state.turnNumber,
    actionsTaken: actionsTaken,
    milestonesReached: milestonesReached,
    stageReached: state.stageNumber,
    stageName: currentStage(state).name,
    badTurns: badTurns,
    playersWon: state.playersWon,
    endReason: state.endReason,
    finalResources: Object.assign({}, state.resources)
  };
}

/* ===========================================================================
 * 15. PROGRESS
 * ===========================================================================
 */
export function progressTowardsFinishLine(state) {
  const fraction = state.resources.plots / state.finishLinePlots;
  return Math.min(100, Math.round(fraction * 100));
}
