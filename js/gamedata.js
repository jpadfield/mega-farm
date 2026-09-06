/*
 * gamedata.js
 * ---------------------------------------------------------------------------
 * EVERY NUMBER IN THE GAME LIVES IN THIS FILE.
 *
 * If you want to change how much something costs, how much it gives, how often
 * an event happens or how far you have to go to win, this is the only file you
 * need to open. Nothing in engine.js or ui.js should contain a game number.
 *
 * The numbers here come from "build-history/mega-farm-rules-data-v4.md",
 * which is the
 * authoritative specification. Please keep the two in step.
 *
 * This file contains DATA only. It has no game logic in it at all. The logic
 * that reads this data lives in engine.js.
 * ---------------------------------------------------------------------------
 */

/* ===========================================================================
 * 1. RESOURCES
 * ===========================================================================
 * The seven things the farm can hold. Not every stage uses every resource;
 * each stage says which ones it tracks, and in which order they are said out
 * loud at the end of a turn.
 */

export const RESOURCES = {
  coins:  { id: 'coins',  name: 'Coins',  singularName: 'Coin',  symbol: '\u{1FA99}' },
  wood:   { id: 'wood',   name: 'Wood',   singularName: 'Wood',  symbol: '\u{1FAB5}' },
  crops:  { id: 'crops',  name: 'Crops',  singularName: 'Crop',  symbol: '\u{1F33E}' },
  eggs:   { id: 'eggs',   name: 'Eggs',   singularName: 'Egg',   symbol: '\u{1F95A}' },
  fuel:   { id: 'fuel',   name: 'Fuel',   singularName: 'Fuel',  symbol: '\u{26FD}'  },
  crates: { id: 'crates', name: 'Crates', singularName: 'Crate', symbol: '\u{1F4E6}' },
  plots:  { id: 'plots',  name: 'Plots',  singularName: 'Plot',  symbol: '\u{1F5FA}' }
};

/* The order used whenever we need to show all seven, for example in the
 * history table. Individual stages override this with their own ledger order. */
export const ALL_RESOURCE_IDS = ['coins', 'wood', 'crops', 'eggs', 'fuel', 'crates', 'plots'];

/* What the farm owns on turn 1. Resources that do not exist yet sit at zero. */
export const STARTING_RESOURCES = {
  coins: 10,
  wood: 10,
  crops: 10,
  eggs: 0,
  fuel: 0,
  crates: 0,
  plots: 2
};

/* ===========================================================================
 * 2. BUILDINGS
 * ===========================================================================
 * One-off buildings. Once built they stay built for the rest of the game, and
 * they keep working in later stages wherever the action they improve survives.
 */

export const BUILDINGS = {
  'market-stall': {
    id: 'market-stall',
    name: 'Market Stall',
    effectText: 'Sell at Market pays 8 Coins instead of 6.'
  },
  'tool-shed': {
    id: 'tool-shed',
    name: 'Tool Shed',
    effectText: 'Plant and Harvest and Over-Water each gain 2 extra Crops.'
  },
  'extended-coop': {
    id: 'extended-coop',
    name: 'Extended Coop',
    effectText: 'Feed the Chickens gives 5 Eggs instead of 3.'
  },
  'reinforced-barn': {
    id: 'reinforced-barn',
    name: 'Reinforced Barn',
    effectText: 'Chop Timber gives 8 Wood instead of 6.'
  },
  'barn': {
    id: 'barn',
    name: 'The Barn',
    effectText: 'Given free at 10 Plots. The chickens move in and Eggs join the game.'
  }
};

/* ===========================================================================
 * 3. HOUSE RULINGS
 * ===========================================================================
 * Things the printed rules do not settle, decided by the game's designer.
 * Each one is a single flag so that it can be reversed in a single edit.
 */

export const HOUSE_RULINGS = {
  /* HOUSE RULING (not in the printed rules).
   * The rules do not say whether Expand Fields, Expand Pastures and Acquire
   * Acreage survive into Stage 5. The designer's ruling is that they do, as
   * "small change" for a poor turn. Set this to false to remove them from
   * Stage 5 instead. Nothing else needs changing. */
  smallLandActionsSurviveIntoStage5: true
};

/* ===========================================================================
 * 4. ACTIONS
 * ===========================================================================
 * Every action in the game, keyed by a stable id.
 *
 * WHICH ROLE TAKES AN ACTION IS NOT STORED HERE. It is stored on the stage,
 * because Tractor Harvest deliberately changes hands from the Planter to the
 * Builder at 50 Plots. "defaultRole" below is a note for the reader only; the
 * engine always uses the stage's own lists.
 *
 * "kind" picks which piece of engine logic runs. There are only five kinds:
 *
 *   convert        pay the cost, receive the gain. Most actions are this.
 *   build          pay the cost, gain a one-off building. Once only.
 *   sellAnyNumber  sell as many of a resource as you like at a fixed rate.
 *   gamble         a convert, followed by a single coin flip that can go wrong.
 *   pass           do nothing. Always allowed.
 */

export const ACTIONS = {

  /* ---------- Stage 1 Planter ---------- */

  'plant-and-harvest': {
    id: 'plant-and-harvest',
    name: 'Plant and Harvest',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { crops: 2 },
    gain: { crops: 6 },
    /* If the listed building has been built, use this gain instead. */
    buildingUpgrades: [
      { buildingId: 'tool-shed', gain: { crops: 8 } }
    ]
  },

  'over-water': {
    id: 'over-water',
    name: 'Over-Water',
    defaultRole: 'planter',
    kind: 'gamble',
    cost: { crops: 2 },
    gain: { crops: 9 },
    buildingUpgrades: [
      { buildingId: 'tool-shed', gain: { crops: 11 } }
    ],
    /* The gamble: flip one coin after taking the gain. Heads is good news. */
    gambleDescription: 'Then flip one coin. Tails floods the field.',
    onTails: {
      /* The field floods. */
      lose: { plots: 1 },
      /* And a job lands on the Builder on the FOLLOWING turn. */
      createsObligation: {
        id: 'drain-the-field',
        role: 'builder',
        turnsAhead: 1,
        cost: { wood: 2 },
        name: 'Drain the flooded field',
        payText: 'Spend 2 Wood to drain the flooded field',
        failText: 'There is no Wood to spend, so the Builder loses this turn’s action.'
      }
    }
  },

  'sell-at-market': {
    id: 'sell-at-market',
    name: 'Sell at Market',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { crops: 4 },
    gain: { coins: 6 },
    buildingUpgrades: [
      { buildingId: 'market-stall', gain: { coins: 8 } }
    ]
  },

  'expand-fields': {
    id: 'expand-fields',
    name: 'Expand Fields',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { coins: 5 },
    gain: { plots: 1 }
  },

  /* ---------- Stage 1 Builder ---------- */

  'chop-timber': {
    id: 'chop-timber',
    name: 'Chop Timber',
    defaultRole: 'builder',
    kind: 'convert',
    cost: { crops: 2 },
    gain: { wood: 6 },
    buildingUpgrades: [
      { buildingId: 'reinforced-barn', gain: { wood: 8 } }
    ],
    flavourText: 'The crops are the workers’ lunch.'
  },

  'clear-new-ground': {
    id: 'clear-new-ground',
    name: 'Clear New Ground',
    defaultRole: 'builder',
    kind: 'convert',
    cost: { wood: 6 },
    gain: { plots: 1 }
  },

  'sell-timber': {
    id: 'sell-timber',
    name: 'Sell Timber',
    defaultRole: 'builder',
    kind: 'convert',
    cost: { wood: 5 },
    gain: { coins: 4 }
  },

  'build-the-market-stall': {
    id: 'build-the-market-stall',
    name: 'Build the Market Stall',
    defaultRole: 'builder',
    kind: 'build',
    cost: { wood: 4 },
    buildingId: 'market-stall'
  },

  'build-the-tool-shed': {
    id: 'build-the-tool-shed',
    name: 'Build the Tool Shed',
    defaultRole: 'builder',
    kind: 'build',
    cost: { wood: 6 },
    buildingId: 'tool-shed'
  },

  /* ---------- Stage 2 Planter ---------- */

  'feed-the-chickens': {
    id: 'feed-the-chickens',
    name: 'Feed the Chickens',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { crops: 4 },
    gain: { eggs: 3 },
    buildingUpgrades: [
      { buildingId: 'extended-coop', gain: { eggs: 5 } }
    ]
  },

  'expand-pastures': {
    id: 'expand-pastures',
    name: 'Expand Pastures',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { coins: 8 },
    gain: { plots: 2 }
  },

  /* ---------- Stage 2 Builder ---------- */

  'sell-to-the-bakery': {
    id: 'sell-to-the-bakery',
    name: 'Sell to the Bakery',
    defaultRole: 'builder',
    kind: 'sellAnyNumber',
    sellResource: 'eggs',
    coinsPerUnit: 5,
    flavourText: 'Sell as many Eggs as you like, all in one action.'
  },

  'clear-woodland': {
    id: 'clear-woodland',
    name: 'Clear Woodland',
    defaultRole: 'builder',
    kind: 'convert',
    cost: { wood: 10 },
    gain: { plots: 2 }
  },

  'extend-the-coop': {
    id: 'extend-the-coop',
    name: 'Extend the Coop',
    defaultRole: 'builder',
    kind: 'build',
    cost: { wood: 6 },
    buildingId: 'extended-coop'
  },

  'reinforce-the-barn': {
    id: 'reinforce-the-barn',
    name: 'Reinforce the Barn',
    defaultRole: 'builder',
    kind: 'build',
    cost: { wood: 5 },
    buildingId: 'reinforced-barn'
  },

  /* ---------- Stage 3 ---------- */

  'tractor-harvest': {
    id: 'tractor-harvest',
    name: 'Tractor Harvest',
    /* Starts as a Planter action in Stage 3 and moves to the Builder at
     * 50 Plots. See STAGES below, which is what the engine actually reads. */
    defaultRole: 'planter',
    kind: 'convert',
    cost: { fuel: 1 },
    gain: { crops: 8 }
  },

  'acquire-acreage': {
    id: 'acquire-acreage',
    name: 'Acquire Acreage',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { coins: 20 },
    gain: { plots: 5 }
  },

  'refuel-machinery': {
    id: 'refuel-machinery',
    name: 'Refuel Machinery',
    defaultRole: 'builder',
    kind: 'convert',
    cost: { coins: 5 },
    gain: { fuel: 2 }
  },

  'commercial-trade': {
    id: 'commercial-trade',
    name: 'Commercial Trade',
    defaultRole: 'builder',
    kind: 'convert',
    cost: { crops: 10 },
    gain: { coins: 20 }
  },

  /* ---------- Stage 4 ---------- */

  'pack-crates': {
    id: 'pack-crates',
    name: 'Pack Crates',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { crops: 10, fuel: 1 },
    gain: { crates: 1 }
  },

  'bulk-refuelling': {
    id: 'bulk-refuelling',
    name: 'Bulk Refuelling',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { coins: 12 },
    gain: { fuel: 8 }
  },

  'mega-land-acquisition': {
    id: 'mega-land-acquisition',
    name: 'Mega Land Acquisition',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { coins: 40 },
    gain: { plots: 15 }
  },

  'wholesale-export': {
    id: 'wholesale-export',
    name: 'Wholesale Export',
    defaultRole: 'builder',
    kind: 'convert',
    /* A fixed exchange of exactly 2 Crates, not a sale of any number. */
    cost: { crates: 2 },
    gain: { coins: 70 },
    isExport: true
  },

  /* ---------- Stage 5 ---------- */

  'run-the-combines': {
    id: 'run-the-combines',
    name: 'Run the Combines',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { fuel: 4 },
    gain: { crates: 3 }
  },

  'imperial-land-acquisition': {
    id: 'imperial-land-acquisition',
    name: 'Imperial Land Acquisition',
    defaultRole: 'planter',
    kind: 'convert',
    cost: { coins: 60 },
    gain: { plots: 25 }
  },

  'industrial-refuelling': {
    id: 'industrial-refuelling',
    name: 'Industrial Refuelling',
    defaultRole: 'builder',
    kind: 'convert',
    cost: { coins: 15 },
    gain: { fuel: 8 }
  },

  'bulk-export': {
    id: 'bulk-export',
    name: 'Bulk Export',
    defaultRole: 'builder',
    kind: 'sellAnyNumber',
    sellResource: 'crates',
    coinsPerUnit: 20,
    isExport: true,
    flavourText: 'Sell as many Crates as you like, all in one action.'
  },

  /* ---------- Available to either role, in every stage ---------- */

  'pass': {
    id: 'pass',
    name: 'Pass',
    defaultRole: 'either',
    kind: 'pass',
    flavourText: 'Do nothing this turn. Always allowed, rarely a good idea.'
  }
};

/* ===========================================================================
 * 5. THE CHANCE CHECK
 * ===========================================================================
 * Every stage uses the same eight slots in the same order. Slot 1 is the best
 * result and slot 8 is the worst.
 *
 * Coin method: flip three coins. Heads is 1 and tails is 0. The first coin is
 * worth 4, the second 2 and the third 1, so the total runs from 0 to 7 and
 * every total is equally likely. Slot number = 8 minus the total.
 *
 * Dice method: roll two dice and add them, giving 2 to 12. This is not evenly
 * spread, so quiet turns are commoner and extremes are rarer.
 */

export const CHANCE_SLOTS = [
  { slot: 1, coinFaces: ['H', 'H', 'H'], coinValue: 7, diceTotals: [12],      character: 'Bonanza'  },
  { slot: 2, coinFaces: ['H', 'H', 'T'], coinValue: 6, diceTotals: [11],      character: 'Good'     },
  { slot: 3, coinFaces: ['H', 'T', 'H'], coinValue: 5, diceTotals: [9, 10],   character: 'Good'     },
  { slot: 4, coinFaces: ['H', 'T', 'T'], coinValue: 4, diceTotals: [6, 7, 8], character: 'Quiet'    },
  { slot: 5, coinFaces: ['T', 'H', 'H'], coinValue: 3, diceTotals: [5],       character: 'Hazard'   },
  { slot: 6, coinFaces: ['T', 'H', 'T'], coinValue: 2, diceTotals: [4],       character: 'Hazard'   },
  { slot: 7, coinFaces: ['T', 'T', 'H'], coinValue: 1, diceTotals: [3],       character: 'Hazard'   },
  { slot: 8, coinFaces: ['T', 'T', 'T'], coinValue: 0, diceTotals: [2],       character: 'Disaster' }
];

/* The coin values, most significant first. Used to read three coins as a
 * number from 0 to 7, exactly the way a computer counts. */
export const COIN_PLACE_VALUES = [4, 2, 1];

/* Which slots count as bad luck. Used by the Mercy Rule optional rule. */
export const HAZARD_CHARACTERS = ['Hazard', 'Disaster'];

export const CHANCE_METHODS = [
  { id: 'coins', name: 'Three coins', explanation: 'Flip three coins. Every result is equally likely. This is how computers count.' },
  { id: 'dice',  name: 'Two dice',    explanation: 'Roll two dice and add them. More quiet turns, rarer extremes.' }
];

/* ===========================================================================
 * 6. EVENTS
 * ===========================================================================
 * Each stage has eight events, one per chance slot.
 *
 * An event has a list of "effects". The effect types are:
 *
 *   gain             add resources (a store limit may cut this short)
 *   lose             take resources away, never below zero.
 *                    "ifEmptyInstead" is used when the rules say
 *                    "lose 2 Wood, or 2 Crops if you have no Wood".
 *   loseAll          take every last one of a resource
 *   halve            halve a resource, rounding down
 *   foxEggs          the special scaling Sneaky Fox loss
 *   priceChange      change one action's cost or gain, for this turn only
 *   banAction        stop named actions being taken this turn
 *   banExports       stop any action marked isExport this turn
 *   loseAction       a named role takes no action this turn
 *
 * An event may also have a "choice", which is a pay-or-suffer prompt. If the
 * farm cannot afford any of the payment options, the penalty simply happens
 * with no prompt at all.
 *
 * "productionMultiplier" scales the stage's automatic production for this turn
 * only. 3 is Bumper Crop, 0 is Drought.
 */

export const STAGE_1_EVENTS = [
  {
    slot: 1, id: 'market-boom', name: 'Market Boom',
    text: 'This turn only, Sell at Market pays double.',
    effects: [
      { type: 'priceChange', actionId: 'sell-at-market', operation: 'multiplyGain', factor: 2 }
    ]
  },
  {
    slot: 2, id: 'travelling-pedlar', name: 'Travelling Pedlar',
    text: 'A merchant buys your spare vegetables. Gain 5 Coins.',
    effects: [ { type: 'gain', amounts: { coins: 5 } } ]
  },
  {
    slot: 3, id: 'perfect-weather', name: 'Perfect Weather',
    text: 'Gain 4 Crops, up to your barn limit.',
    effects: [ { type: 'gain', amounts: { crops: 4 } } ]
  },
  {
    slot: 4, id: 'a-quiet-day', name: 'A quiet day',
    text: 'Nothing happens. Get on with the farming.',
    effects: []
  },
  {
    slot: 5, id: 'broken-gate', name: 'Broken Gate',
    text: 'Lose 2 Wood. If you have no Wood, lose 2 Crops instead.',
    effects: [ { type: 'lose', amounts: { wood: 2 }, ifEmptyInstead: { crops: 2 } } ]
  },
  {
    slot: 6, id: 'the-crows-attack', name: 'The Crows Attack',
    text: 'Lose 4 Crops, unless the Planter spends 2 Wood right now on a scarecrow.',
    choice: {
      prompt: 'Build a scarecrow?',
      payingRole: 'planter',
      options: [
        { id: 'scarecrow', label: 'Spend 2 Wood on a scarecrow', cost: { wood: 2 } }
      ],
      declineLabel: 'Do nothing and lose 4 Crops',
      penalty: [ { type: 'lose', amounts: { crops: 4 } } ]
    }
  },
  {
    slot: 7, id: 'thunderstorm', name: 'Thunderstorm',
    text: 'Branches everywhere. The Builder takes no action this turn, unless you spend 3 Wood clearing up.',
    choice: {
      prompt: 'Clear up the branches?',
      payingRole: 'builder',
      options: [
        { id: 'clear-up', label: 'Spend 3 Wood clearing up', cost: { wood: 3 } }
      ],
      declineLabel: 'Leave it, the Builder loses this turn’s action',
      penalty: [ { type: 'loseAction', role: 'builder' } ]
    }
  },
  {
    slot: 8, id: 'blight', name: 'Blight',
    text: 'A sickness runs through the beds. Lose half your Crops, rounding down.',
    effects: [ { type: 'halve', resources: ['crops'] } ]
  }
];

export const STAGE_2_EVENTS = [
  {
    slot: 1, id: 'baking-contest', name: 'Baking Contest',
    text: 'The town fair is on. This turn, every Egg sold to the Bakery pays 10 Coins.',
    effects: [
      { type: 'priceChange', actionId: 'sell-to-the-bakery', operation: 'setCoinsPerUnit', coinsPerUnit: 10 }
    ]
  },
  {
    slot: 2, id: 'broody-hen', name: 'Broody Hen',
    text: 'A hen has been busy. Gain 2 Eggs.',
    effects: [ { type: 'gain', amounts: { eggs: 2 } } ]
  },
  {
    slot: 3, id: 'woodland-windfall', name: 'Woodland Windfall',
    text: 'A big branch comes down in the copse. Gain 6 Wood.',
    effects: [ { type: 'gain', amounts: { wood: 6 } } ]
  },
  {
    slot: 4, id: 'a-quiet-day-2', name: 'A quiet day',
    text: 'Nothing happens. Enjoy it.',
    effects: []
  },
  {
    slot: 5, id: 'bad-weather', name: 'Bad Weather',
    text: 'Heavy rain. No Chop Timber action can be taken this turn.',
    effects: [
      { type: 'banAction', actionIds: ['chop-timber'], reason: 'Bad Weather stops timber this turn' }
    ]
  },
  {
    slot: 6, id: 'the-sneaky-fox', name: 'The Sneaky Fox',
    text: 'A fox gets into the coop. Lose 2 Eggs, or half your Eggs rounding down if that is more, unless the Builder spends 3 Wood right now on a secure fence.',
    choice: {
      prompt: 'Build a secure fence?',
      payingRole: 'builder',
      options: [
        { id: 'fence', label: 'Spend 3 Wood on a secure fence', cost: { wood: 3 } }
      ],
      declineLabel: 'Let the fox have them',
      penalty: [ { type: 'foxEggs', minimumLoss: 2, guardedMaximumLoss: 4 } ]
    }
  },
  {
    slot: 7, id: 'escaped-pigs', name: 'Escaped Pigs',
    text: 'The pen is broken and pigs are everywhere. The Planter takes no action this turn, unless the Builder spends 3 Wood mending it.',
    choice: {
      prompt: 'Mend the pen?',
      payingRole: 'builder',
      options: [
        { id: 'mend-pen', label: 'Spend 3 Wood mending the pen', cost: { wood: 3 } }
      ],
      declineLabel: 'Leave it, the Planter loses this turn’s action',
      penalty: [ { type: 'loseAction', role: 'planter' } ]
    }
  },
  {
    slot: 8, id: 'barn-fire', name: 'Barn Fire',
    text: 'A lantern falls over. Lose half your Wood, rounding down, and 3 Crops.',
    effects: [
      { type: 'halve', resources: ['wood'] },
      { type: 'lose', amounts: { crops: 3 } }
    ]
  }
];

export const STAGE_3_EVENTS = [
  {
    slot: 1, id: 'bumper-crop', name: 'Bumper Crop',
    text: 'A perfect season. Your automatic crops are tripled this turn, so 15 instead of 5.',
    productionMultiplier: 3,
    effects: []
  },
  {
    slot: 2, id: 'fuel-delivery', name: 'Fuel Delivery',
    text: 'The tanker driver has spare. Gain 3 Fuel.',
    effects: [ { type: 'gain', amounts: { fuel: 3 } } ]
  },
  {
    slot: 3, id: 'good-prices', name: 'Good Prices',
    text: 'This turn, Commercial Trade pays 30 Coins instead of 20.',
    effects: [
      { type: 'priceChange', actionId: 'commercial-trade', operation: 'setGain', gain: { coins: 30 } }
    ]
  },
  {
    slot: 4, id: 'a-quiet-day-3', name: 'A quiet day',
    text: 'Nothing happens. The engines hum along.',
    effects: []
  },
  {
    slot: 5, id: 'fuel-shortage', name: 'Fuel Shortage',
    text: 'This turn, Refuel Machinery gives 1 Fuel instead of 2.',
    effects: [
      { type: 'priceChange', actionId: 'refuel-machinery', operation: 'setGain', gain: { fuel: 1 } }
    ]
  },
  {
    slot: 6, id: 'engine-breakdown', name: 'Engine Breakdown',
    text: 'The tractor stalls. Spend 2 Fuel or 5 Coins right now to fix it, or the Builder takes no action this turn.',
    choice: {
      prompt: 'Fix the tractor?',
      payingRole: 'builder',
      options: [
        { id: 'pay-fuel',  label: 'Spend 2 Fuel',  cost: { fuel: 2 } },
        { id: 'pay-coins', label: 'Spend 5 Coins', cost: { coins: 5 } }
      ],
      declineLabel: 'Leave it, the Builder loses this turn’s action',
      penalty: [ { type: 'loseAction', role: 'builder' } ]
    }
  },
  {
    slot: 7, id: 'drought', name: 'Drought',
    text: 'The taps run dry. You get no automatic crops this turn.',
    productionMultiplier: 0,
    effects: []
  },
  {
    slot: 8, id: 'silo-collapse', name: 'Silo Collapse',
    text: 'The roof gives way. Lose half your Crops, rounding down.',
    effects: [ { type: 'halve', resources: ['crops'] } ]
  }
];

export const STAGE_4_EVENTS = [
  {
    slot: 1, id: 'global-market-surge', name: 'Global Market Surge',
    text: 'Wholesale buyers are paying a premium. This turn, Wholesale Export pays 100 Coins instead of 70.',
    effects: [
      { type: 'priceChange', actionId: 'wholesale-export', operation: 'setGain', gain: { coins: 100 } }
    ]
  },
  {
    slot: 2, id: 'returned-order', name: 'Returned Order',
    text: 'A cancelled order comes back to you sealed and sound. Gain 1 Crate.',
    effects: [ { type: 'gain', amounts: { crates: 1 } } ]
  },
  {
    slot: 3, id: 'cheap-diesel', name: 'Cheap Diesel',
    text: 'This turn, Bulk Refuelling gives 12 Fuel instead of 8.',
    effects: [
      { type: 'priceChange', actionId: 'bulk-refuelling', operation: 'setGain', gain: { fuel: 12 } }
    ]
  },
  {
    slot: 4, id: 'a-quiet-day-4', name: 'A quiet day',
    text: 'Nothing happens. The lorries run on time.',
    effects: []
  },
  {
    slot: 5, id: 'equipment-inspection', name: 'Equipment Inspection',
    text: 'A safety audit. Pay 5 Coins, or the Builder takes no action this turn.',
    choice: {
      prompt: 'Pay the inspector?',
      payingRole: 'builder',
      options: [
        { id: 'pay-inspection', label: 'Pay 5 Coins', cost: { coins: 5 } }
      ],
      declineLabel: 'Refuse, the Builder loses this turn’s action',
      penalty: [ { type: 'loseAction', role: 'builder' } ]
    }
  },
  {
    slot: 6, id: 'supply-chain-crisis', name: 'Supply Chain Crisis',
    text: 'A shipping delay. You may not export this turn unless you pay 10 Coins for air freight.',
    choice: {
      prompt: 'Pay for air freight?',
      payingRole: 'builder',
      options: [
        { id: 'air-freight', label: 'Pay 10 Coins for air freight', cost: { coins: 10 } }
      ],
      declineLabel: 'Do not pay, no exporting this turn',
      penalty: [ { type: 'banExports', reason: 'Supply Chain Crisis stops exports this turn' } ]
    }
  },
  {
    slot: 7, id: 'packing-shed-jam', name: 'Packing Shed Jam',
    text: 'The conveyor chews up a load. Lose 1 Crate, or 8 Crops if you have no Crates.',
    effects: [ { type: 'lose', amounts: { crates: 1 }, ifEmptyInstead: { crops: 8 } } ]
  },
  {
    slot: 8, id: 'machinery-failure', name: 'Machinery Failure',
    text: 'Water in the tanks. Lose all your Fuel.',
    effects: [ { type: 'loseAll', resources: ['fuel'] } ]
  }
];

export const STAGE_5_EVENTS = [
  {
    slot: 1, id: 'record-harvest', name: 'Record Harvest',
    text: 'The best season in living memory. Gain 4 Crates.',
    effects: [ { type: 'gain', amounts: { crates: 4 } } ]
  },
  {
    slot: 2, id: 'government-grant', name: 'Government Grant',
    text: 'A rural development payment lands. Gain 40 Coins.',
    effects: [ { type: 'gain', amounts: { coins: 40 } } ]
  },
  {
    slot: 3, id: 'efficient-routing', name: 'Efficient Routing',
    text: 'This turn, Run the Combines costs 2 Fuel instead of 4.',
    effects: [
      { type: 'priceChange', actionId: 'run-the-combines', operation: 'setCost', cost: { fuel: 2 } }
    ]
  },
  {
    slot: 4, id: 'a-quiet-day-5', name: 'A quiet day',
    text: 'Nothing happens. Somewhere, a combine harvester purrs.',
    effects: []
  },
  {
    slot: 5, id: 'fuel-price-spike', name: 'Fuel Price Spike',
    text: 'This turn, Industrial Refuelling costs 25 Coins instead of 15.',
    effects: [
      { type: 'priceChange', actionId: 'industrial-refuelling', operation: 'setCost', cost: { coins: 25 } }
    ]
  },
  {
    slot: 6, id: 'port-strike', name: 'Port Strike',
    text: 'The docks are closed. You may not export this turn unless you pay 20 Coins to go by road.',
    choice: {
      prompt: 'Send the lorries by road?',
      payingRole: 'builder',
      options: [
        { id: 'by-road', label: 'Pay 20 Coins to go by road', cost: { coins: 20 } }
      ],
      declineLabel: 'Do not pay, no exporting this turn',
      penalty: [ { type: 'banExports', reason: 'Port Strike stops exports this turn' } ]
    }
  },
  {
    slot: 7, id: 'failed-inspection', name: 'Failed Inspection',
    text: 'A whole pallet is condemned. Lose 2 Crates.',
    effects: [ { type: 'lose', amounts: { crates: 2 } } ]
  },
  {
    slot: 8, id: 'market-crash', name: 'Market Crash',
    text: 'Prices collapse overnight. Lose half your Coins, rounding down.',
    effects: [ { type: 'halve', resources: ['coins'] } ]
  }
];

/* ===========================================================================
 * 7. STAGES
 * ===========================================================================
 * The five stages of the farm. The stage number is advanced by milestones,
 * not by counting Plots, so that a milestone always happens exactly once.
 */

/* Stage 5's Planter list is built here rather than written out, because one of
 * the designer's house rulings can change it. See HOUSE_RULINGS above. */
const stageFivePlanterSmallChangeActions =
  HOUSE_RULINGS.smallLandActionsSurviveIntoStage5
    ? ['expand-fields', 'expand-pastures', 'acquire-acreage']
    : [];

export const STAGES = [
  {
    number: 1,
    name: 'The Backyard Garden',
    rangeText: 'From the start to 10 Plots',
    ledgerOrder: ['coins', 'wood', 'crops', 'plots'],
    /* Crops may never be more than 5 times your Plots. null means no limit. */
    cropStoreLimitPerPlot: 5,
    /* Resources produced free at the start of every turn. null means none. */
    automaticProduction: null,
    planterTitle: 'The Planter',
    builderTitle: 'The Builder',
    planterActions: ['plant-and-harvest', 'over-water', 'sell-at-market', 'expand-fields'],
    planterSmallChangeActions: [],
    builderActions: ['chop-timber', 'clear-new-ground', 'sell-timber', 'build-the-market-stall', 'build-the-tool-shed'],
    builderSmallChangeActions: [],
    events: STAGE_1_EVENTS
  },
  {
    number: 2,
    name: 'The Family Farm',
    rangeText: 'From 11 to 25 Plots',
    ledgerOrder: ['coins', 'wood', 'crops', 'eggs', 'plots'],
    cropStoreLimitPerPlot: 5,
    automaticProduction: null,
    planterTitle: 'The Planter',
    builderTitle: 'The Builder',
    planterActions: ['plant-and-harvest', 'over-water', 'feed-the-chickens', 'sell-at-market', 'expand-fields', 'expand-pastures'],
    planterSmallChangeActions: [],
    builderActions: ['chop-timber', 'clear-new-ground', 'clear-woodland', 'sell-timber', 'sell-to-the-bakery', 'extend-the-coop', 'reinforce-the-barn', 'build-the-market-stall', 'build-the-tool-shed'],
    builderSmallChangeActions: [],
    events: STAGE_2_EVENTS
  },
  {
    number: 3,
    name: 'The Mechanised Estate',
    rangeText: 'From 26 to 50 Plots',
    ledgerOrder: ['coins', 'crops', 'fuel', 'plots'],
    cropStoreLimitPerPlot: null,
    automaticProduction: { crops: 5 },
    planterTitle: 'The Head Planter',
    builderTitle: 'The Head Builder',
    planterActions: ['tractor-harvest', 'acquire-acreage'],
    planterSmallChangeActions: ['sell-at-market', 'expand-fields', 'expand-pastures'],
    builderActions: ['refuel-machinery', 'commercial-trade'],
    builderSmallChangeActions: [],
    events: STAGE_3_EVENTS
  },
  {
    number: 4,
    name: 'The Regional Supplier',
    rangeText: 'From 51 to 100 Plots',
    ledgerOrder: ['coins', 'crops', 'fuel', 'crates', 'plots'],
    cropStoreLimitPerPlot: null,
    automaticProduction: { crops: 5 },
    planterTitle: 'The Head Planter',
    builderTitle: 'The Head Builder',
    planterActions: ['pack-crates', 'bulk-refuelling', 'mega-land-acquisition', 'acquire-acreage'],
    planterSmallChangeActions: ['sell-at-market', 'expand-fields', 'expand-pastures'],
    /* Tractor Harvest has moved across from the Planter at the 50 Plot milestone. */
    builderActions: ['tractor-harvest', 'commercial-trade', 'wholesale-export', 'refuel-machinery'],
    builderSmallChangeActions: [],
    events: STAGE_4_EVENTS
  },
  {
    number: 5,
    name: 'The Agro-Empire',
    rangeText: 'From 101 to 250 Plots. This is the finish.',
    ledgerOrder: ['coins', 'fuel', 'crates', 'plots'],
    cropStoreLimitPerPlot: null,
    automaticProduction: { crates: 1 },
    planterTitle: 'The Chief Planter',
    builderTitle: 'The Chief Builder',
    planterActions: ['run-the-combines', 'imperial-land-acquisition'],
    planterSmallChangeActions: stageFivePlanterSmallChangeActions,
    builderActions: ['industrial-refuelling', 'bulk-export'],
    builderSmallChangeActions: [],
    events: STAGE_5_EVENTS
  }
];

/* ===========================================================================
 * 8. MILESTONES
 * ===========================================================================
 * A milestone happens the moment the farm reaches the given number of Plots.
 * Each one is a short checklist worked through in order, which is exactly how
 * the on-screen milestone walkthrough presents it.
 *
 * Step kinds:
 *   grantBuilding   the farm is given a building for free
 *   convertResource turn one resource into another at a fixed rate
 *   sellResource    sell every one of a resource at a fixed price
 *   packAndSell     pack a resource into bundles, sell the remainder
 *   note            nothing to calculate, just something to read out
 */

export const MILESTONES = [
  {
    id: 'the-barn',
    atPlots: 10,
    title: 'The Barn is Finished',
    newStageNumber: 2,
    steps: [
      {
        id: 'barn-built',
        kind: 'grantBuilding',
        buildingId: 'barn',
        heading: 'The barn goes up for free',
        detail: 'The chickens move in and Eggs join the game, starting at zero.'
      },
      {
        id: 'stage-1-carries-on',
        kind: 'note',
        heading: 'Everything from Stage 1 still works',
        detail: 'All the old actions stay, and the barn limit on Crops still applies.'
      }
    ]
  },
  {
    id: 'the-machines',
    atPlots: 25,
    title: 'The Machines Arrive',
    newStageNumber: 3,
    steps: [
      {
        id: 'wood-to-fuel',
        kind: 'convertResource',
        fromResource: 'wood',
        toResource: 'fuel',
        fromAmountPerUnit: 2,
        removeSourceFromGame: true,
        heading: 'Trade Wood for Fuel',
        detail: 'Two Wood for one Fuel, rounding down. Wood then leaves the game.'
      },
      {
        id: 'sell-the-eggs',
        kind: 'sellResource',
        resource: 'eggs',
        coinsPerUnit: 5,
        removeSourceFromGame: true,
        heading: 'Sell the last of the Eggs',
        detail: 'Five Coins each. Eggs and chickens then leave the game.'
      },
      {
        id: 'silos',
        kind: 'note',
        heading: 'The barn limit on Crops is gone for good',
        detail: 'You have silos now, so you can store as many Crops as you like.'
      },
      {
        id: 'automatic-production-starts',
        kind: 'note',
        heading: 'The estate starts producing on its own',
        detail: 'Five Crops arrive free at the start of every turn from now on.'
      },
      {
        id: 'hand-work-ends',
        kind: 'note',
        heading: 'Planting and chopping by hand are over',
        detail: 'Chop Timber, Clear New Ground, Sell Timber, Clear Woodland, Feed the Chickens, Sell to the Bakery, Plant and Harvest and Over-Water all leave the game. Sell at Market, Expand Fields and Expand Pastures stay. Anything already built stays built.'
      },
      {
        id: 'promotion-to-head',
        kind: 'note',
        heading: 'You are both promoted',
        detail: 'You are now the Head Planter and the Head Builder.'
      }
    ]
  },
  {
    id: 'the-packing-shed',
    atPlots: 50,
    title: 'The Packing Shed Opens',
    newStageNumber: 4,
    steps: [
      {
        id: 'crates-arrive',
        kind: 'note',
        heading: 'Crates join the game, starting at zero',
        detail: 'A Crate is a big commercial bundle of produce, and supermarkets buy them by the pallet.'
      },
      {
        id: 'tractor-changes-hands',
        kind: 'note',
        heading: 'One job changes hands',
        detail: 'The Head Planter moves into the packing shed, so Tractor Harvest passes across to the Head Builder from now on.'
      },
      {
        id: 'production-continues',
        kind: 'note',
        heading: 'Everything else carries on',
        detail: 'All the Stage 3 actions continue, including the 5 automatic Crops each turn.'
      }
    ]
  },
  {
    id: 'too-big-to-count-vegetables',
    atPlots: 100,
    title: 'Too Big to Count Vegetables',
    newStageNumber: 5,
    /* The app warns before this milestone is crossed while holding Crates,
     * because a Crate is worth 35 Coins in Stage 4 and only 20 in Stage 5. */
    warnIfHolding: 'crates',
    warningText: 'You are still holding Crates. A Crate is worth 35 Coins here in Stage 4 and only 20 Coins in Stage 5, so it is usually better to export them before crossing 100 Plots.',
    steps: [
      {
        id: 'pack-the-last-crops',
        kind: 'packAndSell',
        fromResource: 'crops',
        toResource: 'crates',
        fromAmountPerUnit: 10,
        remainderCoinsPerUnit: 2,
        removeSourceFromGame: true,
        heading: 'Pack the last of the Crops',
        detail: 'Every 10 Crops becomes 1 Crate, rounding down. Whatever is left over sells at 2 Coins each. Crops then leave the game for good.'
      },
      {
        id: 'crate-production',
        kind: 'note',
        heading: 'The estate now produces Crates',
        detail: 'One Crate arrives free at the start of every turn instead of the crops.'
      },
      {
        id: 'old-actions-retire',
        kind: 'note',
        heading: 'The old jobs are done',
        detail: 'Tractor Harvest, Pack Crates and Commercial Trade leave the game. Wholesale Export becomes Bulk Export, Mega Land Acquisition becomes Imperial Land Acquisition and Bulk Refuelling becomes Industrial Refuelling.'
      },
      {
        id: 'promotion-to-chief',
        kind: 'note',
        heading: 'You are both promoted again',
        detail: 'You are now the Chief Planter and the Chief Builder. This is a business.'
      }
    ]
  }
];

/* ===========================================================================
 * 9. FINISH LINES
 * ===========================================================================
 */

export const FINISH_LINES = [
  { plots: 10,  stagesText: 'Stage 1',       expectedTurnsText: 'about 10 turns', characterText: 'A short first game' },
  { plots: 25,  stagesText: 'Stages 1 to 2', expectedTurnsText: 'about 20 turns', characterText: 'The standard game' },
  { plots: 50,  stagesText: 'Stages 1 to 3', expectedTurnsText: 'about 30 turns', characterText: 'Paper and pencil territory' },
  { plots: 100, stagesText: 'Stages 1 to 4', expectedTurnsText: 'about 40 turns', characterText: 'A long session or two' },
  { plots: 250, stagesText: 'All five',      expectedTurnsText: 'about 50 turns', characterText: 'The full campaign' }
];

export const DEFAULT_FINISH_LINE_PLOTS = 25;

/* ===========================================================================
 * 10. OPTIONAL RULES
 * ===========================================================================
 * All off by default. Each one is a single flag the engine checks.
 */

export const OPTIONAL_RULES = [
  {
    id: 'leanSeason',
    name: 'The Lean Season',
    explanation: 'If a turn ends with no Coins and no Crops at all, lose 1 Plot.',
    plotsLostWhenLean: 1
  },
  {
    id: 'luckyReflip',
    name: 'The Lucky Re-flip',
    explanation: 'Once per game, either player may ask for the chance check to be run again.',
    usesPerGame: 1
  },
  {
    id: 'mercyRule',
    name: 'Mercy Rule',
    explanation: 'If a hazard or disaster comes up on two turns in a row, the second one is ignored.'
  },
  {
    id: 'beatTheClock',
    name: 'Beat the Clock',
    explanation: 'Agree a turn limit at the start and score the Plots you reach.',
    defaultTurnLimit: 20
  },
  {
    id: 'foxGuard',
    name: 'The Fox Guard',
    explanation: 'The Sneaky Fox takes at most 4 Eggs, rather than half the basket.'
  }
];

/* ===========================================================================
 * 11. SMALL LOOK-UP HELPERS
 * ===========================================================================
 * These only look things up in the data above. They contain no game rules.
 */

export function getStageByNumber(stageNumber) {
  return STAGES.find(function (stage) { return stage.number === stageNumber; });
}

export function getActionById(actionId) {
  return ACTIONS[actionId];
}

export function getMilestoneByPlots(plots) {
  return MILESTONES.find(function (milestone) { return milestone.atPlots === plots; });
}

export function getChanceSlotByCoinValue(coinValue) {
  return CHANCE_SLOTS.find(function (slot) { return slot.coinValue === coinValue; });
}

export function getChanceSlotByDiceTotal(diceTotal) {
  return CHANCE_SLOTS.find(function (slot) { return slot.diceTotals.includes(diceTotal); });
}

export function getEventForStageAndSlot(stageNumber, slotNumber) {
  const stage = getStageByNumber(stageNumber);
  return stage.events.find(function (event) { return event.slot === slotNumber; });
}
