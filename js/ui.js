/*
 * ui.js
 * ---------------------------------------------------------------------------
 * EVERYTHING ON THE SCREEN. This is the only file that touches the page.
 *
 * The rules live in engine.js and the numbers live in gamedata.js. This file
 * only ever asks them questions and draws the answers. If you want to change
 * what a button costs, this is the wrong file.
 *
 * The approach is deliberately simple: when the game state changes, redraw the
 * panels from scratch. At this size that is instant, and it means there is only
 * ever one description of what the screen should look like.
 *
 * Bootstrap is loaded by index.html as an ordinary script, so it appears here
 * as the global "bootstrap". That is why you will see window.bootstrap below.
 * ---------------------------------------------------------------------------
 */

import * as engine from './engine.js';
import {
  BUILDINGS,
  CHANCE_METHODS,
  CHANCE_SLOTS,
  COIN_PLACE_VALUES,
  FINISH_LINES,
  DEFAULT_FINISH_LINE_PLOTS,
  OPTIONAL_RULES,
  RESOURCES
} from './gamedata.js';

/* ===========================================================================
 * 1. THINGS THIS FILE REMEMBERS BETWEEN DRAWS
 * ===========================================================================
 */

/* The functions main.js gives us, so that a button press can be handed back to
 * the game logic. See initialise() for the full list. */
let callbacks = {};

/* The totals as they were last time we drew, so that we can show "+6" next to
 * a number that has just changed. */
let resourcesAtTheLastDraw = null;

/* The milestone walkthrough shows one step at a time, and this is which one. */
let milestoneReportBeingShown = null;
let milestoneStepIndexBeingShown = 0;

/* Which action the quantity box is currently asking about. */
let quantityQuestion = null;

/* What to do if the player presses past a warning. */
let workToDoAfterTheWarning = null;

/* ===========================================================================
 * 2. SMALL HELPERS
 * ===========================================================================
 */

function findElement(elementId) {
  return document.getElementById(elementId);
}

/*
 * Player names are typed in by the players, so they must never be dropped into
 * the page as HTML without being made safe first.
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Bootstrap's own component classes, fetched only when they are needed. */
function bootstrapModal(elementId) {
  return window.bootstrap.Modal.getOrCreateInstance(findElement(elementId));
}

/* ---------------------------------------------------------------------------
 * Numbers as words, for the end-of-turn chant.
 * The players say the ledger out loud, so it is written out in words:
 * "Fourteen coins, six wood, eleven crops, three plots."
 * ------------------------------------------------------------------------ */

const NUMBER_WORDS_UP_TO_TWENTY = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'
];

const NUMBER_WORDS_FOR_TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
];

function wordsForNumberUnderOneThousand(wholeNumber) {
  if (wholeNumber < 20) {
    return NUMBER_WORDS_UP_TO_TWENTY[wholeNumber];
  }
  if (wholeNumber < 100) {
    const tens = Math.floor(wholeNumber / 10);
    const units = wholeNumber % 10;
    return NUMBER_WORDS_FOR_TENS[tens] + (units > 0 ? '-' + NUMBER_WORDS_UP_TO_TWENTY[units] : '');
  }
  const hundreds = Math.floor(wholeNumber / 100);
  const remainder = wholeNumber % 100;
  return NUMBER_WORDS_UP_TO_TWENTY[hundreds] + ' hundred' +
    (remainder > 0 ? ' and ' + wordsForNumberUnderOneThousand(remainder) : '');
}

export function numberAsWords(wholeNumber) {
  if (wholeNumber < 1000) {
    return wordsForNumberUnderOneThousand(wholeNumber);
  }
  if (wholeNumber < 1000000) {
    const thousands = Math.floor(wholeNumber / 1000);
    const remainder = wholeNumber % 1000;
    return wordsForNumberUnderOneThousand(thousands) + ' thousand' +
      (remainder > 0 ? ' ' + wordsForNumberUnderOneThousand(remainder) : '');
  }
  /* Nobody is going to reach a million of anything, but just in case. */
  return String(wholeNumber);
}

function withFirstLetterCapital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* "Fourteen coins, six wood, eleven crops, three plots." */
function ledgerChantSentence(state) {
  const parts = engine.ledgerLine(state).map(function (entry) {
    const resource = RESOURCES[entry.resourceId];
    const name = entry.amount === 1 ? resource.singularName : resource.name;
    return numberAsWords(entry.amount) + ' ' + name.toLowerCase();
  });
  return withFirstLetterCapital(parts.join(', ')) + '.';
}

/* ---------------------------------------------------------------------------
 * Describing an action on its button, in the same style as the printed play
 * aid: "2 Crops > 6 Crops".
 * ------------------------------------------------------------------------ */

function exchangeTextForAction(entry) {
  if (entry.kind === 'pass') {
    return 'Do nothing this turn';
  }
  if (entry.kind === 'build') {
    const building = BUILDINGS[entry.buildingId];
    return engine.describeAmounts(entry.cost) + ' &gt; ' + escapeHtml(building.name) +
      '<span class="d-block text-body-secondary">' + escapeHtml(building.effectText) + '</span>';
  }
  if (entry.kind === 'sellAnyNumber') {
    const resource = RESOURCES[entry.sellResource];
    return 'Any number of ' + resource.name + ' &gt; ' + entry.coinsPerUnit + ' Coins each';
  }
  let text = engine.describeAmounts(entry.cost) + ' &gt; ' + engine.describeAmounts(entry.gain);
  if (entry.kind === 'gamble') {
    text += '<span class="d-block text-body-secondary">' + escapeHtml(entry.gambleDescription) + '</span>';
  }
  return text;
}

/* ===========================================================================
 * 3. STARTING UP
 * ===========================================================================
 */

/*
 * main.js calls this once. Every callback is a function main.js provides:
 *
 *   onStartGame(setupChoices)      the players pressed Start
 *   onResumeGame()                 the players pressed Resume
 *   onRollChance()                 flip the coins or roll the dice
 *   onUseLuckyReflip()             the optional Lucky Re-flip
 *   onResolveEvent(choiceId)       settle the event, choiceId may be null
 *   onTakeAction(role, id, extras) take an action
 *   onResolveObligation()          settle the flooded field
 *   onFinishMilestone()            the milestone walkthrough is over
 *   onEndTurn()                    say the ledger and move on
 *   onStartAgain()                 abandon the farm
 *   onImportGame(text)             load a game from the text box
 *   getGameAsText()                the current game, for the text box
 */
export function initialise(providedCallbacks) {
  callbacks = providedCallbacks;
  buildSetupScreen();
  wireUpTheQuantityBox();
  wireUpTheWarningBox();
  wireUpTheTransferBox();
}

function showOnlyThisScreen(screenElementId) {
  const allScreenIds = ['setup-screen', 'play-screen', 'milestone-screen', 'win-screen'];
  for (const identifier of allScreenIds) {
    findElement(identifier).classList.toggle('d-none', identifier !== screenElementId);
  }
  findElement('top-bar').classList.toggle('d-none', screenElementId === 'setup-screen');
  window.scrollTo(0, 0);
}

/* ===========================================================================
 * 4. THE SETUP SCREEN
 * ===========================================================================
 * Built from gamedata.js, so that adding a finish line or an optional rule
 * needs no change here at all.
 */

function buildSetupScreen() {
  const finishLineChoices = FINISH_LINES.map(function (finishLine) {
    const isDefault = finishLine.plots === DEFAULT_FINISH_LINE_PLOTS;
    return '' +
      '<div class="form-check border rounded p-2 ps-5 mb-2">' +
        '<input class="form-check-input" type="radio" name="finish-line" ' +
          'id="finish-line-' + finishLine.plots + '" value="' + finishLine.plots + '"' +
          (isDefault ? ' checked' : '') + '>' +
        '<label class="form-check-label w-100" for="finish-line-' + finishLine.plots + '">' +
          '<strong>' + finishLine.plots + ' Plots</strong> ' +
          '<span class="text-body-secondary">&mdash; ' + finishLine.expectedTurnsText + '</span>' +
          '<span class="d-block small text-body-secondary">' +
            finishLine.stagesText + '. ' + finishLine.characterText + '.</span>' +
        '</label>' +
      '</div>';
  }).join('');

  const chanceMethodChoices = CHANCE_METHODS.map(function (method, index) {
    return '' +
      '<div class="form-check border rounded p-2 ps-5 mb-2">' +
        '<input class="form-check-input" type="radio" name="chance-method" ' +
          'id="chance-method-' + method.id + '" value="' + method.id + '"' +
          (index === 0 ? ' checked' : '') + '>' +
        '<label class="form-check-label w-100" for="chance-method-' + method.id + '">' +
          '<strong>' + method.name + '</strong>' +
          '<span class="d-block small text-body-secondary">' + method.explanation + '</span>' +
        '</label>' +
      '</div>';
  }).join('');

  const optionalRuleChoices = OPTIONAL_RULES.map(function (rule) {
    const turnLimitBox = rule.id === 'beatTheClock'
      ? '<div id="turn-limit-holder" class="mt-2 d-none">' +
          '<label for="turn-limit-input" class="form-label small mb-1">How many turns?</label>' +
          '<input type="number" class="form-control" id="turn-limit-input" min="1" step="1" ' +
            'value="' + rule.defaultTurnLimit + '">' +
        '</div>'
      : '';
    return '' +
      '<div class="form-check form-switch border rounded p-2 ps-5 mb-2">' +
        '<input class="form-check-input" type="checkbox" role="switch" id="optional-rule-' + rule.id + '">' +
        '<label class="form-check-label w-100" for="optional-rule-' + rule.id + '">' +
          '<strong>' + rule.name + '</strong>' +
          '<span class="d-block small text-body-secondary">' + rule.explanation + '</span>' +
        '</label>' +
        turnLimitBox +
      '</div>';
  }).join('');

  findElement('setup-screen').innerHTML = '' +
    '<div class="text-center mb-4">' +
      '<h1 class="h2">The Mega-Farm Challenge</h1>' +
      '<p class="text-body-secondary mb-0">' +
        'A game for a grown-up and a young farmer. One farm, two jobs, and a lot of luck.' +
      '</p>' +
    '</div>' +

    '<div id="resume-holder" class="d-none mb-3"></div>' +

    '<div class="card mb-3">' +
      '<div class="card-header"><h2 class="h6 mb-0">Who is playing?</h2></div>' +
      '<div class="card-body">' +
        '<div class="mb-3">' +
          '<label for="player-one-name" class="form-label">First player</label>' +
          '<input type="text" class="form-control form-control-lg" id="player-one-name" ' +
            'value="Player 1" maxlength="20" autocomplete="off">' +
        '</div>' +
        '<div class="mb-3">' +
          '<label for="player-two-name" class="form-label">Second player</label>' +
          '<input type="text" class="form-control form-control-lg" id="player-two-name" ' +
            'value="Player 2" maxlength="20" autocomplete="off">' +
        '</div>' +
        '<fieldset>' +
          '<legend class="form-label fs-6">Who starts as the Planter?</legend>' +
          '<div class="form-check">' +
            '<input class="form-check-input" type="radio" name="starting-planter" id="starting-planter-0" value="0" checked>' +
            '<label class="form-check-label" for="starting-planter-0" id="starting-planter-0-label">The first player</label>' +
          '</div>' +
          '<div class="form-check">' +
            '<input class="form-check-input" type="radio" name="starting-planter" id="starting-planter-1" value="1">' +
            '<label class="form-check-label" for="starting-planter-1" id="starting-planter-1-label">The second player</label>' +
          '</div>' +
          '<p class="form-text mb-0">You swap over at the start of every turn anyway.</p>' +
        '</fieldset>' +
      '</div>' +
    '</div>' +

    '<div class="card mb-3">' +
      '<div class="card-header"><h2 class="h6 mb-0">How far are you going?</h2></div>' +
      '<div class="card-body">' + finishLineChoices + '</div>' +
    '</div>' +

    '<div class="card mb-3">' +
      '<div class="card-header"><h2 class="h6 mb-0">How is chance decided?</h2></div>' +
      '<div class="card-body">' + chanceMethodChoices + '</div>' +
    '</div>' +

    '<div class="card mb-3">' +
      '<div class="card-header"><h2 class="h6 mb-0">Optional rules</h2></div>' +
      '<div class="card-body">' +
        '<p class="small text-body-secondary">All of these are off unless you turn them on.</p>' +
        optionalRuleChoices +
      '</div>' +
    '</div>' +

    '<div class="d-grid gap-2 mb-4">' +
      '<button id="start-game-button" type="button" class="btn btn-success btn-lg">' +
        'Start the farm' +
      '</button>' +
    '</div>';

  /* The Beat the Clock turn limit box only appears when that rule is on. */
  const beatTheClockSwitch = findElement('optional-rule-beatTheClock');
  beatTheClockSwitch.addEventListener('change', function () {
    findElement('turn-limit-holder').classList.toggle('d-none', !beatTheClockSwitch.checked);
  });

  /* Keep the "who starts" labels in step with the names as they are typed. */
  function refreshStartingPlanterLabels() {
    findElement('starting-planter-0-label').textContent =
      findElement('player-one-name').value || 'The first player';
    findElement('starting-planter-1-label').textContent =
      findElement('player-two-name').value || 'The second player';
  }
  findElement('player-one-name').addEventListener('input', refreshStartingPlanterLabels);
  findElement('player-two-name').addEventListener('input', refreshStartingPlanterLabels);

  findElement('start-game-button').addEventListener('click', function () {
    callbacks.onStartGame(readSetupChoices());
  });
}

function readSetupChoices() {
  const optionalRules = {};
  for (const rule of OPTIONAL_RULES) {
    optionalRules[rule.id] = findElement('optional-rule-' + rule.id).checked;
  }
  const turnLimitInput = findElement('turn-limit-input');
  return {
    playerNames: [
      findElement('player-one-name').value.trim() || 'Player 1',
      findElement('player-two-name').value.trim() || 'Player 2'
    ],
    startingPlanterIndex: Number(document.querySelector('input[name="starting-planter"]:checked').value),
    finishLinePlots: Number(document.querySelector('input[name="finish-line"]:checked').value),
    chanceMethod: document.querySelector('input[name="chance-method"]:checked').value,
    optionalRules: optionalRules,
    turnLimit: optionalRules.beatTheClock ? Number(turnLimitInput.value) || null : null
  };
}

/* Show the setup screen, offering to resume if there is a saved game. */
export function showSetupScreen(savedGameDescription, rememberedChoices) {
  if (rememberedChoices) {
    putRememberedChoicesBackOnTheForm(rememberedChoices);
  }

  const resumeHolder = findElement('resume-holder');
  if (savedGameDescription) {
    resumeHolder.classList.remove('d-none');
    resumeHolder.innerHTML = '' +
      '<div class="card border-success">' +
        '<div class="card-body">' +
          '<h2 class="h6">There is a farm waiting for you</h2>' +
          '<p class="mb-3">' + escapeHtml(savedGameDescription) + '</p>' +
          '<div class="d-grid">' +
            '<button id="resume-game-button" type="button" class="btn btn-success btn-lg">' +
              'Resume that game' +
            '</button>' +
          '</div>' +
          '<p class="form-text mb-0">Or set up a brand new farm below. ' +
            'Starting a new game replaces the saved one.</p>' +
        '</div>' +
      '</div>';
    findElement('resume-game-button').addEventListener('click', function () {
      callbacks.onResumeGame();
    });
  } else {
    resumeHolder.classList.add('d-none');
    resumeHolder.innerHTML = '';
  }

  resourcesAtTheLastDraw = null;
  showOnlyThisScreen('setup-screen');
}

function putRememberedChoicesBackOnTheForm(choices) {
  if (choices.playerNames) {
    findElement('player-one-name').value = choices.playerNames[0];
    findElement('player-two-name').value = choices.playerNames[1];
    findElement('starting-planter-0-label').textContent = choices.playerNames[0];
    findElement('starting-planter-1-label').textContent = choices.playerNames[1];
  }
  const finishLineRadio = findElement('finish-line-' + choices.finishLinePlots);
  if (finishLineRadio) {
    finishLineRadio.checked = true;
  }
  const chanceMethodRadio = findElement('chance-method-' + choices.chanceMethod);
  if (chanceMethodRadio) {
    chanceMethodRadio.checked = true;
  }
  if (choices.optionalRules) {
    for (const rule of OPTIONAL_RULES) {
      const box = findElement('optional-rule-' + rule.id);
      box.checked = Boolean(choices.optionalRules[rule.id]);
    }
    findElement('turn-limit-holder').classList.toggle('d-none', !choices.optionalRules.beatTheClock);
  }
  if (choices.turnLimit) {
    findElement('turn-limit-input').value = choices.turnLimit;
  }
}

/* ===========================================================================
 * 5. DRAWING THE GAME
 * ===========================================================================
 */

export function renderGame(state) {
  if (milestoneReportBeingShown) {
    drawMilestoneScreen(state);
    return;
  }
  if (state.gameOver) {
    drawWinScreen(state);
    return;
  }

  showOnlyThisScreen('play-screen');
  drawHeaderPanel(state);
  drawLedgerPanel(state);
  drawEventPanel(state);
  drawRolePanel(state, 'planter');
  drawRolePanel(state, 'builder');
  drawEndOfTurnPanel(state);
  drawHistoryPanel(state);
  drawRulesReference(state);

  resourcesAtTheLastDraw = Object.assign({}, state.resources);
}

/* ---------------------------------------------------------------------------
 * 5a. The header: where you are and how far you have got.
 * ------------------------------------------------------------------------ */

function drawHeaderPanel(state) {
  const stage = engine.currentStage(state);
  const percentageDone = engine.progressTowardsFinishLine(state);

  const planterChip = roleChipHtml(state, 'planter');
  const builderChip = roleChipHtml(state, 'builder');

  const turnLimitNote = state.optionalRules.beatTheClock && state.turnLimit
    ? ' of ' + state.turnLimit
    : '';

  findElement('header-panel').innerHTML = '' +
    '<div class="card">' +
      '<div class="card-body py-2">' +
        '<div class="d-flex justify-content-between align-items-center flex-wrap gap-1">' +
          '<span>' +
            '<span class="badge text-bg-success">Stage ' + stage.number + '</span> ' +
            '<strong>' + stage.name + '</strong>' +
          '</span>' +
          '<span class="text-body-secondary small">Turn ' + state.turnNumber + turnLimitNote + '</span>' +
        '</div>' +
        '<div class="d-flex gap-2 flex-wrap mt-2 small">' + planterChip + builderChip + '</div>' +
        '<div class="mt-2">' +
          '<div class="d-flex justify-content-between small">' +
            '<span>Land</span>' +
            '<span><strong>' + state.resources.plots + '</strong> of ' + state.finishLinePlots + ' Plots</span>' +
          '</div>' +
          '<div class="progress" role="progressbar" aria-label="Plots towards the finish line" ' +
            'aria-valuenow="' + state.resources.plots + '" aria-valuemin="0" ' +
            'aria-valuemax="' + state.finishLinePlots + '">' +
            '<div class="progress-bar bg-success" style="width: ' + percentageDone + '%"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function roleChipHtml(state, role) {
  const isTheirTurn =
    (role === 'planter' && state.phase === 'planter-action') ||
    (role === 'builder' && (state.phase === 'builder-action' || state.phase === 'obligation'));
  const tint = role === 'planter' ? 'text-bg-primary' : 'text-bg-warning';
  return '' +
    '<span class="badge ' + (isTheirTurn ? tint : 'text-bg-light border') + '">' +
      escapeHtml(engine.playerNameForRole(state, role)) + ' &mdash; ' +
      escapeHtml(engine.titleForRole(state, role)) +
      (isTheirTurn ? ' (playing now)' : '') +
    '</span>';
}

/* ---------------------------------------------------------------------------
 * 5b. The ledger: the tracked totals, in this stage's fixed order.
 * ------------------------------------------------------------------------ */

function drawLedgerPanel(state) {
  const tiles = engine.ledgerLine(state).map(function (entry) {
    const resource = RESOURCES[entry.resourceId];
    const change = resourcesAtTheLastDraw
      ? entry.amount - resourcesAtTheLastDraw[entry.resourceId]
      : 0;

    let changeHtml = '<span class="ledger-change-blank"></span>';
    if (change !== 0) {
      const colourClass = change > 0 ? 'text-success' : 'text-danger';
      const sign = change > 0 ? '+' : '−';
      changeHtml = '<span class="ledger-change ' + colourClass + '">' +
        sign + Math.abs(change) + '</span>';
    }

    return '' +
      '<div class="ledger-tile">' +
        '<div aria-hidden="true">' + resource.symbol + '</div>' +
        '<div class="ledger-number">' + entry.amount + '</div>' +
        '<div class="ledger-name text-body-secondary">' + resource.name + '</div>' +
        changeHtml +
      '</div>';
  }).join('');

  /* The "for every Plot" figure comes from the stage, never from here. */
  const storeLimit = engine.cropStoreLimit(state);
  const cropsPerPlot = engine.currentStage(state).cropStoreLimitPerPlot;
  const storeLimitNote = storeLimit === null
    ? ''
    : '<div class="card-footer py-1 small text-body-secondary text-center">' +
        'The barn holds ' + storeLimit + ' Crops (' + cropsPerPlot + ' for every Plot). ' +
        'Anything over that rots away at once.' +
      '</div>';

  findElement('ledger-panel').innerHTML = '' +
    '<div class="card">' +
      '<div class="card-body py-2">' +
        '<div class="d-flex justify-content-around flex-wrap">' + tiles + '</div>' +
      '</div>' +
      storeLimitNote +
    '</div>';
}

/* ---------------------------------------------------------------------------
 * 5c. The event: the chance check and what it did.
 * ------------------------------------------------------------------------ */

function drawEventPanel(state) {
  const panel = findElement('event-panel');

  if (state.phase === 'chance') {
    const buttonWords = state.chanceMethod === 'dice' ? 'Roll the two dice' : 'Flip the three coins';
    panel.innerHTML = '' +
      '<div class="card border-success">' +
        '<div class="card-body text-center">' +
          '<h2 class="h6 text-body-secondary">Turn ' + state.turnNumber + ' begins</h2>' +
          '<p class="mb-3">' + escapeHtml(engine.roleSummaryText(state)) + '</p>' +
          '<div class="d-grid">' +
            '<button id="roll-chance-button" type="button" class="btn btn-success btn-lg">' +
              buttonWords +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    findElement('roll-chance-button').addEventListener('click', function () {
      callbacks.onRollChance();
    });
    return;
  }

  if (!state.chanceResult) {
    panel.innerHTML = '';
    return;
  }

  const isUnresolved = state.phase === 'event';
  const eventRecord = state.currentEvent;
  const borderClass = eventRecord.isBadLuck ? 'border-danger' : 'border-success';

  let bodyHtml = '' +
    chanceFacesHtml(state.chanceResult) +
    '<div class="text-center mb-3">' +
      '<span class="badge text-bg-secondary">Slot ' + eventRecord.slot + '</span> ' +
      '<span class="badge ' + characterBadgeClass(eventRecord.character) + '">' +
        eventRecord.character +
      '</span>' +
    '</div>' +
    '<h2 class="h5 text-center">' + escapeHtml(eventRecord.name) + '</h2>' +
    '<p class="text-center">' + escapeHtml(eventRecord.text) + '</p>';

  if (eventRecord.ignoredByMercyRule) {
    bodyHtml += '<div class="alert alert-info">' +
      '<strong>Mercy Rule.</strong> That is two bad turns in a row, so this one does not count.' +
      '</div>';
  }

  if (isUnresolved) {
    bodyHtml += eventButtonsHtml(state);
  } else {
    bodyHtml += whatHappenedThisTurnHtml(state);
  }

  panel.innerHTML = '<div class="card ' + borderClass + '"><div class="card-body">' + bodyHtml + '</div></div>';

  if (isUnresolved) {
    wireUpTheEventButtons(state);
  }
}

function characterBadgeClass(character) {
  if (character === 'Bonanza') { return 'text-bg-success'; }
  if (character === 'Good') { return 'text-bg-primary'; }
  if (character === 'Quiet') { return 'text-bg-light border'; }
  if (character === 'Disaster') { return 'text-bg-danger'; }
  return 'text-bg-warning';
}

/* Three coins, with their place values written underneath, or two dice. */
function chanceFacesHtml(chanceResult) {
  if (chanceResult.method === 'dice') {
    const dice = chanceResult.diceFaces.map(function (face) {
      return '<span class="chance-face chance-face-die">' + face + '</span>';
    }).join('');
    return '' +
      '<div class="text-center mb-2">' +
        '<div class="d-flex justify-content-center gap-2">' + dice + '</div>' +
        '<div class="small text-body-secondary mt-1">Total ' + chanceResult.diceTotal + '</div>' +
      '</div>';
  }

  const coins = chanceResult.coinFaces.map(function (face, index) {
    const isHeads = face === 'H';
    const placeValue = COIN_PLACE_VALUES[index];
    return '' +
      '<div>' +
        '<span class="chance-face ' + (isHeads ? 'chance-face-heads' : 'chance-face-tails') + '">' +
          (isHeads ? 'H' : 'T') +
        '</span>' +
        '<span class="chance-place-value text-body-secondary">' +
          (isHeads ? placeValue : '0') +
        '</span>' +
      '</div>';
  }).join('');

  return '' +
    '<div class="text-center mb-2">' +
      '<div class="d-flex justify-content-center gap-3">' + coins + '</div>' +
      '<div class="small text-body-secondary mt-1">' +
        'Heads is 1, tails is 0. That reads ' + chanceResult.coinValue + '.' +
      '</div>' +
    '</div>';
}

/* The buttons that settle the event. Nothing else on the screen works until
 * one of them is pressed. */
function eventButtonsHtml(state) {
  const eventData = engine.currentEventData(state);
  const reflipButton = engine.luckyReflipAvailable(state)
    ? '<button id="lucky-reflip-button" type="button" class="btn btn-outline-primary btn-lg">' +
        'Use the Lucky Re-flip (once a game)' +
      '</button>'
    : '';

  if (eventData.choice && !state.currentEvent.ignoredByMercyRule) {
    const offered = engine.eventChoiceOptions(state);
    const affordable = offered.filter(function (option) { return option.affordable; });

    if (affordable.length === 0) {
      return '' +
        '<div class="alert alert-warning">' +
          '<strong>The farm cannot afford to pay.</strong> ' +
          'When you cannot pay your way out, the penalty simply happens.' +
        '</div>' +
        '<div class="d-grid gap-2">' +
          '<button id="event-continue-button" type="button" class="btn btn-primary btn-lg">Carry on</button>' +
          reflipButton +
        '</div>';
    }

    const payButtons = offered.map(function (option) {
      if (!option.affordable) {
        return '<button type="button" class="btn btn-outline-secondary btn-lg" disabled>' +
          escapeHtml(option.label) +
          '<span class="d-block small">Cannot: not enough ' +
            escapeHtml(namesOfResourcesIn(option.cost)) + '</span>' +
          '</button>';
      }
      return '<button type="button" class="btn btn-primary btn-lg event-choice-button" ' +
        'data-choice-id="' + escapeHtml(option.id) + '">' + escapeHtml(option.label) + '</button>';
    }).join('');

    return '' +
      '<p class="fw-semibold text-center">' + escapeHtml(eventData.choice.prompt) + '</p>' +
      '<div class="d-grid gap-2">' +
        payButtons +
        '<button id="event-decline-button" type="button" class="btn btn-outline-danger btn-lg">' +
          escapeHtml(eventData.choice.declineLabel) +
        '</button>' +
        reflipButton +
      '</div>';
  }

  return '' +
    '<div class="d-grid gap-2">' +
      '<button id="event-continue-button" type="button" class="btn btn-primary btn-lg">Carry on</button>' +
      reflipButton +
    '</div>';
}

function namesOfResourcesIn(cost) {
  return Object.keys(cost).map(function (resourceId) {
    return RESOURCES[resourceId].name;
  }).join(' or ');
}

function wireUpTheEventButtons(state) {
  const continueButton = findElement('event-continue-button');
  if (continueButton) {
    continueButton.addEventListener('click', function () {
      callbacks.onResolveEvent(null);
    });
  }
  const declineButton = findElement('event-decline-button');
  if (declineButton) {
    declineButton.addEventListener('click', function () {
      callbacks.onResolveEvent(null);
    });
  }
  for (const button of document.querySelectorAll('.event-choice-button')) {
    button.addEventListener('click', function () {
      callbacks.onResolveEvent(button.dataset.choiceId);
    });
  }
  const reflipButton = findElement('lucky-reflip-button');
  if (reflipButton) {
    reflipButton.addEventListener('click', function () {
      callbacks.onUseLuckyReflip();
    });
  }
}

/* A short list of everything that has happened so far this turn. */
function whatHappenedThisTurnHtml(state) {
  const lines = [];

  if (state.automaticProductionReport) {
    lines.push(state.automaticProductionReport.text);
  }
  for (const outcomeText of state.currentEvent.outcomeTexts) {
    lines.push(outcomeText);
  }
  if (state.lastObligationOutcome) {
    lines.push(state.lastObligationOutcome.text);
  }
  /* Everything the two of them actually did this turn, taken from the log. */
  for (const logEntry of state.log) {
    if (logEntry.turnNumber === state.turnNumber && logEntry.kind === 'action') {
      lines.push(logEntry.text);
    }
  }
  if (state.leanSeasonBitThisTurn) {
    lines.push('The Lean Season: the cupboard is bare, so the farm loses a Plot.');
  }

  if (lines.length === 0) {
    return '<p class="text-center text-body-secondary mb-0">Nothing to settle. Get on with the farming.</p>';
  }

  return '<ul class="list-group list-group-flush">' +
    lines.map(function (line) {
      return '<li class="list-group-item px-0 py-1 small">' + escapeHtml(line) + '</li>';
    }).join('') +
    '</ul>';
}

/* ---------------------------------------------------------------------------
 * 5d. The two action panels.
 * ------------------------------------------------------------------------ */

function drawRolePanel(state, role) {
  const panelElement = findElement(role + '-panel');
  const isTheirTurn = state.phase === (role + '-action');
  const hasActed = state.actionsTaken[role];
  const lostTheAction = state.lostActions[role];
  const waitingForSomethingElse = !isTheirTurn;

  let statusBadge;
  if (lostTheAction && hasActed) {
    statusBadge = '<span class="badge text-bg-danger">No action this turn</span>';
  } else if (hasActed) {
    statusBadge = '<span class="badge text-bg-secondary">Done</span>';
  } else if (isTheirTurn) {
    statusBadge = '<span class="badge text-bg-success">Choose an action</span>';
  } else {
    statusBadge = '<span class="badge text-bg-light border">Waiting</span>';
  }

  /* The flooded field is settled before the Builder chooses anything. */
  let obligationHtml = '';
  if (role === 'builder' && state.phase === 'obligation') {
    obligationHtml = obligationPanelHtml(state);
  }

  const listedActions = engine.availableActions(state, role);
  const mainActions = listedActions.filter(function (entry) { return !entry.isSmallChange; });
  const smallChangeActions = listedActions.filter(function (entry) { return entry.isSmallChange; });

  let buttonsHtml = '';
  if (state.phase !== 'obligation' || role !== 'builder') {
    buttonsHtml = '<div class="d-grid gap-2">' +
      mainActions.map(function (entry) {
        return actionButtonHtml(state, role, entry, isTheirTurn);
      }).join('') +
      '</div>';

    if (smallChangeActions.length > 0) {
      buttonsHtml += '' +
        '<hr class="my-3">' +
        '<p class="small-change-heading text-body-secondary mb-2">' +
          'Small change &mdash; for a poor turn' +
        '</p>' +
        '<div class="d-grid gap-2">' +
          smallChangeActions.map(function (entry) {
            return actionButtonHtml(state, role, entry, isTheirTurn);
          }).join('') +
        '</div>';
    }
  }

  panelElement.innerHTML = '' +
    '<div class="card role-panel-' + role + (waitingForSomethingElse ? ' role-panel-waiting' : '') + '">' +
      '<div class="card-header d-flex justify-content-between align-items-center gap-2">' +
        '<span class="text-truncate">' +
          '<strong>' + escapeHtml(engine.titleForRole(state, role)) + '</strong>' +
          '<span class="d-block small text-body-secondary">' +
            escapeHtml(engine.playerNameForRole(state, role)) +
          '</span>' +
        '</span>' +
        statusBadge +
      '</div>' +
      '<div class="card-body">' + obligationHtml + buttonsHtml + '</div>' +
    '</div>';

  wireUpTheActionButtons(state, role);
  if (role === 'builder' && state.phase === 'obligation') {
    findElement('resolve-obligation-button').addEventListener('click', function () {
      callbacks.onResolveObligation();
    });
  }
}

function obligationPanelHtml(state) {
  const obligation = engine.obligationDueNow(state);
  const canPay = engine.canPayObligation(state);
  return '' +
    '<div class="alert alert-warning">' +
      '<h3 class="h6">' + escapeHtml(obligation.name) + '</h3>' +
      '<p class="mb-0">' +
        'The field flooded last turn. Before anything else, it has to be drained.' +
      '</p>' +
    '</div>' +
    '<div class="d-grid">' +
      '<button id="resolve-obligation-button" type="button" class="btn btn-warning btn-lg">' +
        (canPay
          ? escapeHtml(obligation.payText)
          : escapeHtml(obligation.failText)) +
      '</button>' +
    '</div>';
}

function actionButtonHtml(state, role, entry, isTheirTurn) {
  const canBePressed = isTheirTurn && entry.available;
  const styleClass = entry.isSmallChange ? 'btn-outline-secondary' : 'btn-outline-success';

  let reasonHtml = '';
  if (!entry.available) {
    /* Never colour alone: the reason is written out as well. */
    reasonHtml = '<span class="d-block small text-danger">Cannot: ' + escapeHtml(entry.reason) + '</span>';
  }

  let priceChangeHtml = '';
  if (entry.hasTurnPriceChange) {
    priceChangeHtml = '<span class="badge text-bg-warning ms-1">Changed this turn</span>';
  }

  const warning = canBePressed ? engine.warningForAction(state, role, entry.actionId, {}) : null;
  const warningHtml = warning
    ? '<span class="d-block small text-warning-emphasis">Careful: this crosses a milestone</span>'
    : '';

  return '' +
    '<button type="button" class="btn ' + styleClass + ' btn-lg action-button" ' +
      'data-role="' + role + '" data-action-id="' + entry.actionId + '"' +
      (canBePressed ? '' : ' disabled') + '>' +
      '<span class="action-name">' + escapeHtml(entry.name) + priceChangeHtml + '</span>' +
      '<span class="action-exchange small d-block">' + exchangeTextForAction(entry) + '</span>' +
      reasonHtml +
      warningHtml +
    '</button>';
}

function wireUpTheActionButtons(state, role) {
  const panelElement = findElement(role + '-panel');
  for (const button of panelElement.querySelectorAll('.action-button')) {
    button.addEventListener('click', function () {
      const actionId = button.dataset.actionId;
      askForTheQuantityIfNeededThenAct(state, role, actionId);
    });
  }
}

/*
 * Between pressing a button and the action happening there may be a question
 * to ask ("how many Eggs?") and a warning to show ("you still have Crates").
 * This sorts out both, in that order, and then hands over to main.js.
 */
function askForTheQuantityIfNeededThenAct(state, role, actionId) {
  const entry = engine.findAvailableAction(state, role, actionId);

  function actNow(extraOptions) {
    const warning = engine.warningForAction(state, role, actionId, extraOptions);
    if (warning) {
      showWarningThenContinue(warning, function () {
        callbacks.onTakeAction(role, actionId, extraOptions);
      });
      return;
    }
    callbacks.onTakeAction(role, actionId, extraOptions);
  }

  if (entry.kind === 'sellAnyNumber') {
    askHowMany(state, entry, function (quantity) {
      actNow({ quantity: quantity });
    });
    return;
  }

  actNow({});
}

/* ---------------------------------------------------------------------------
 * 5e. The end of the turn: the chant, and the button to move on.
 * ------------------------------------------------------------------------ */

function drawEndOfTurnPanel(state) {
  const panel = findElement('end-of-turn-panel');

  if (state.phase !== 'end-of-turn') {
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = '' +
    '<div class="card border-success">' +
      '<div class="card-body text-center">' +
        '<h2 class="h6 text-body-secondary">Say the ledger out loud</h2>' +
        '<p class="ledger-chant mb-3">&ldquo;' + escapeHtml(ledgerChantSentence(state)) + '&rdquo;</p>' +
        '<div class="d-grid">' +
          '<button id="next-turn-button" type="button" class="btn btn-success btn-lg">' +
            'Next turn' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  findElement('next-turn-button').addEventListener('click', function () {
    callbacks.onEndTurn();
  });
}

/* ===========================================================================
 * 6. THE MILESTONE WALKTHROUGH
 * ===========================================================================
 * The most confusing moment in the tabletop game, so the screen takes over and
 * goes through the checklist one line at a time.
 */

export function beginMilestoneWalkthrough(state, report) {
  milestoneReportBeingShown = report;
  milestoneStepIndexBeingShown = 0;
  drawMilestoneScreen(state);
}

function drawMilestoneScreen(state) {
  showOnlyThisScreen('milestone-screen');

  const report = milestoneReportBeingShown;
  const step = report.steps[milestoneStepIndexBeingShown];
  const isTheLastStep = milestoneStepIndexBeingShown === report.steps.length - 1;
  const stepNumber = milestoneStepIndexBeingShown + 1;

  const outcomeHtml = step.outcomeText
    ? '<p class="milestone-step-outcome text-success-emphasis">' + escapeHtml(step.outcomeText) + '</p>'
    : '';

  findElement('milestone-screen').innerHTML = '' +
    '<div class="card border-success">' +
      '<div class="card-header bg-success-subtle text-center">' +
        '<div class="small text-uppercase">' + report.atPlots + ' Plots</div>' +
        '<h1 class="h4 mb-0">' + escapeHtml(report.title) + '</h1>' +
      '</div>' +
      '<div class="card-body">' +
        '<p class="small text-body-secondary">Step ' + stepNumber + ' of ' + report.steps.length + '</p>' +
        '<div class="progress mb-3" role="progressbar" aria-label="Milestone progress">' +
          '<div class="progress-bar bg-success" style="width: ' +
            Math.round((stepNumber / report.steps.length) * 100) + '%"></div>' +
        '</div>' +
        '<h2 class="h5">' + escapeHtml(step.heading) + '</h2>' +
        outcomeHtml +
        '<p>' + escapeHtml(step.detail) + '</p>' +
        '<div class="d-grid">' +
          '<button id="milestone-next-button" type="button" class="btn btn-success btn-lg">' +
            (isTheLastStep ? 'Back to the farm' : 'Next') +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  findElement('milestone-next-button').addEventListener('click', function () {
    if (isTheLastStep) {
      milestoneReportBeingShown = null;
      milestoneStepIndexBeingShown = 0;
      callbacks.onFinishMilestone();
      return;
    }
    milestoneStepIndexBeingShown += 1;
    drawMilestoneScreen(state);
  });
}

/* ===========================================================================
 * 7. THE WIN SCREEN
 * ===========================================================================
 */

function drawWinScreen(state) {
  showOnlyThisScreen('win-screen');
  const summary = engine.gameSummary(state);

  const headline = summary.playersWon
    ? 'The Mega-Farm Challenge is won'
    : 'Time is up';

  const subheading = summary.playersWon
    ? escapeHtml(state.playerNames.join(' and ')) + ' reached ' + summary.plotsReached +
      ' Plots in ' + summary.turnsTaken + ' turns.'
    : escapeHtml(state.playerNames.join(' and ')) + ' scored ' + summary.plotsReached +
      ' Plots in ' + summary.turnsTaken + ' turns.';

  const finalLedger = engine.ledgerLine(state).map(function (entry) {
    return '<li class="list-group-item d-flex justify-content-between">' +
      '<span>' + RESOURCES[entry.resourceId].name + '</span>' +
      '<strong>' + entry.amount + '</strong>' +
      '</li>';
  }).join('');

  findElement('win-screen').innerHTML = '' +
    '<div class="card border-success">' +
      '<div class="card-header bg-success-subtle text-center">' +
        '<h1 class="h4 mb-0">' + headline + '</h1>' +
      '</div>' +
      '<div class="card-body">' +
        '<p class="fs-5">' + subheading + '</p>' +
        '<div class="row g-3 mb-3">' +
          summaryTileHtml('Plots', summary.plotsReached + ' of ' + summary.finishLinePlots) +
          summaryTileHtml('Turns', summary.turnsTaken) +
          summaryTileHtml('Actions taken', summary.actionsTaken) +
          summaryTileHtml('Milestones passed', summary.milestonesReached) +
        '</div>' +
        '<h2 class="h6">The farm finished as</h2>' +
        '<ul class="list-group mb-3">' + finalLedger + '</ul>' +
        '<p class="text-body-secondary">' +
          'You got as far as Stage ' + summary.stageReached + ', ' + escapeHtml(summary.stageName) + '.' +
        '</p>' +
        '<div class="d-grid gap-2">' +
          '<button id="win-history-button" type="button" class="btn btn-outline-secondary btn-lg" ' +
            'data-bs-toggle="offcanvas" data-bs-target="#history-panel">Look back at every turn</button>' +
          '<button id="win-new-game-button" type="button" class="btn btn-success btn-lg">' +
            'Start another farm' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  drawHistoryPanel(state);
  findElement('win-new-game-button').addEventListener('click', function () {
    callbacks.onStartAgain();
  });
}

function summaryTileHtml(label, value) {
  return '' +
    '<div class="col-6">' +
      '<div class="border rounded p-2 text-center">' +
        '<div class="fs-4 fw-bold">' + value + '</div>' +
        '<div class="small text-body-secondary">' + label + '</div>' +
      '</div>' +
    '</div>';
}

/* ===========================================================================
 * 8. THE HISTORY TABLE
 * ===========================================================================
 * One row per finished turn and one column per resource, exactly like the
 * paper grid the printed rules suggest drawing.
 */

function drawHistoryPanel(state) {
  const body = findElement('history-body');

  if (state.history.length === 0) {
    body.innerHTML = '<p class="text-body-secondary">Nothing yet. The first row appears ' +
      'when you finish turn 1.</p>';
    return;
  }

  /* Only show columns for resources that have actually been tracked. */
  const columnsToShow = [];
  for (const row of state.history) {
    for (const resourceId of row.trackedResourceIds) {
      if (!columnsToShow.includes(resourceId)) {
        columnsToShow.push(resourceId);
      }
    }
  }

  const headerCells = columnsToShow.map(function (resourceId) {
    return '<th scope="col" class="text-end">' + RESOURCES[resourceId].name + '</th>';
  }).join('');

  const rows = state.history.slice().reverse().map(function (row) {
    const cells = columnsToShow.map(function (resourceId) {
      const wasTracked = row.trackedResourceIds.includes(resourceId);
      return '<td class="text-end">' + (wasTracked ? row.resources[resourceId] : '&mdash;') + '</td>';
    }).join('');
    return '' +
      '<tr>' +
        '<th scope="row">' + row.turnNumber + '</th>' +
        '<td class="small text-body-secondary">' + escapeHtml(row.eventName || '') + '</td>' +
        cells +
      '</tr>';
  }).join('');

  body.innerHTML = '' +
    '<p class="small text-body-secondary">Newest turn first. A dash means that ' +
      'resource did not exist yet, or had left the game.</p>' +
    '<div class="history-scroller">' +
      '<table class="table table-sm table-striped align-middle">' +
        '<thead><tr><th scope="col">Turn</th><th scope="col">Event</th>' + headerCells + '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
}

/* ===========================================================================
 * 9. THE RULES REFERENCE
 * ===========================================================================
 * Written out from gamedata.js so that it can never drift away from the game
 * the players are actually playing.
 */

function drawRulesReference(state) {
  const stage = engine.currentStage(state);

  function actionRowsFor(role) {
    return engine.availableActions(state, role)
      .filter(function (entry) { return entry.actionId !== 'pass'; })
      .map(function (entry) {
        return '' +
          '<tr>' +
            '<th scope="row" class="fw-normal">' + escapeHtml(entry.name) +
              (entry.isSmallChange ? ' <span class="badge text-bg-light border">small change</span>' : '') +
            '</th>' +
            '<td>' + (entry.kind === 'sellAnyNumber'
              ? 'Any number of ' + RESOURCES[entry.sellResource].name
              : engine.describeAmounts(entry.cost)) + '</td>' +
            '<td>' + exchangeGainTextForReference(entry) + '</td>' +
          '</tr>';
      }).join('');
  }

  const eventRows = stage.events.map(function (event) {
    const slot = CHANCE_SLOTS.find(function (s) { return s.slot === event.slot; });
    return '' +
      '<tr>' +
        '<td class="font-monospace text-nowrap">' + slot.coinFaces.join(' ') + '</td>' +
        '<td class="text-nowrap">' + slot.diceTotals.join(', ') + '</td>' +
        '<th scope="row" class="fw-normal">' + escapeHtml(event.name) + '</th>' +
        '<td>' + escapeHtml(event.text) + '</td>' +
      '</tr>';
  }).join('');

  const buildingsBuilt = Object.keys(state.buildings)
    .map(function (buildingId) {
      return '<li>' + escapeHtml(BUILDINGS[buildingId].name) + ' &mdash; ' +
        escapeHtml(BUILDINGS[buildingId].effectText) + '</li>';
    }).join('');

  findElement('rules-body').innerHTML = '' +
    '<h3 class="h6">Stage ' + stage.number + ': ' + escapeHtml(stage.name) + '</h3>' +
    '<p class="text-body-secondary">' + escapeHtml(stage.rangeText) + '. ' +
      'Ledger order: ' + stage.ledgerOrder.map(function (resourceId) {
        return RESOURCES[resourceId].name;
      }).join(', ') + '.</p>' +

    '<h4 class="h6 mt-4">' + escapeHtml(stage.planterTitle) + ' can</h4>' +
    '<div class="table-responsive"><table class="table table-sm">' +
      '<thead><tr><th>Action</th><th>Spend</th><th>Gain</th></tr></thead>' +
      '<tbody>' + actionRowsFor('planter') + '</tbody>' +
    '</table></div>' +

    '<h4 class="h6 mt-4">' + escapeHtml(stage.builderTitle) + ' can</h4>' +
    '<div class="table-responsive"><table class="table table-sm">' +
      '<thead><tr><th>Action</th><th>Spend</th><th>Gain</th></tr></thead>' +
      '<tbody>' + actionRowsFor('builder') + '</tbody>' +
    '</table></div>' +

    '<h4 class="h6 mt-4">What can happen</h4>' +
    '<div class="table-responsive"><table class="table table-sm">' +
      '<thead><tr><th>Coins</th><th>Dice</th><th>Event</th><th>What happens</th></tr></thead>' +
      '<tbody>' + eventRows + '</tbody>' +
    '</table></div>' +

    (buildingsBuilt
      ? '<h4 class="h6 mt-4">Already built</h4><ul>' + buildingsBuilt + '</ul>'
      : '') +

    '<p class="small text-body-secondary mt-4">' +
      'These numbers are the ones in play right now, so anything an event has ' +
      'changed for this turn is shown changed.' +
    '</p>';
}

function exchangeGainTextForReference(entry) {
  if (entry.kind === 'build') {
    return escapeHtml(BUILDINGS[entry.buildingId].effectText);
  }
  if (entry.kind === 'sellAnyNumber') {
    return entry.coinsPerUnit + ' Coins for each one';
  }
  let text = engine.describeAmounts(entry.gain);
  if (entry.kind === 'gamble') {
    text += '. ' + escapeHtml(entry.gambleDescription);
  }
  return text;
}

/* ===========================================================================
 * 10. THE QUANTITY BOX
 * ===========================================================================
 * For Sell to the Bakery and Bulk Export, which sell any number at once.
 */

function wireUpTheQuantityBox() {
  const input = findElement('quantity-input');

  function refreshTheTotal() {
    if (!quantityQuestion) {
      return;
    }
    let quantity = Number(input.value);
    if (!Number.isFinite(quantity)) {
      quantity = 1;
    }
    quantity = Math.max(1, Math.min(quantityQuestion.mostYouCanSell, Math.floor(quantity)));
    input.value = quantity;
    findElement('quantity-total').innerHTML =
      '<strong>' + quantity + ' ' + escapeHtml(quantityQuestion.resourceName) + '</strong> ' +
      'for <strong>' + (quantity * quantityQuestion.coinsPerUnit) + ' Coins</strong>';
  }

  input.addEventListener('input', refreshTheTotal);

  findElement('quantity-down-button').addEventListener('click', function () {
    input.value = Number(input.value) - 1;
    refreshTheTotal();
  });
  findElement('quantity-up-button').addEventListener('click', function () {
    input.value = Number(input.value) + 1;
    refreshTheTotal();
  });
  findElement('quantity-all-button').addEventListener('click', function () {
    input.value = quantityQuestion.mostYouCanSell;
    refreshTheTotal();
  });
  findElement('quantity-confirm-button').addEventListener('click', function () {
    const chosenQuantity = Number(input.value);
    const whatToDoNext = quantityQuestion.whenAnswered;
    bootstrapModal('quantity-modal').hide();
    whatToDoNext(chosenQuantity);
  });

  /* Kept on the element so that refreshTheTotal can be called from askHowMany. */
  findElement('quantity-modal').refreshTheTotal = refreshTheTotal;
}

function askHowMany(state, entry, whenAnswered) {
  const mostYouCanSell = state.resources[entry.sellResource];
  quantityQuestion = {
    resourceName: RESOURCES[entry.sellResource].name,
    coinsPerUnit: entry.coinsPerUnit,
    mostYouCanSell: mostYouCanSell,
    whenAnswered: whenAnswered
  };

  findElement('quantity-modal-title').textContent = entry.name;
  findElement('quantity-explanation').textContent =
    'You have ' + mostYouCanSell + ' ' + quantityQuestion.resourceName +
    '. Each one sells for ' + entry.coinsPerUnit + ' Coins, and this is all one action.';

  const input = findElement('quantity-input');
  input.max = mostYouCanSell;
  input.value = mostYouCanSell;
  findElement('quantity-modal').refreshTheTotal();

  bootstrapModal('quantity-modal').show();
}

/* ===========================================================================
 * 11. THE WARNING BOX
 * ===========================================================================
 * A warning is never a block. There is always a way past it.
 */

function wireUpTheWarningBox() {
  findElement('warning-continue-button').addEventListener('click', function () {
    const whatToDoNext = workToDoAfterTheWarning;
    workToDoAfterTheWarning = null;
    bootstrapModal('warning-modal').hide();
    if (whatToDoNext) {
      whatToDoNext();
    }
  });
}

function showWarningThenContinue(warningText, whatToDoNext) {
  findElement('warning-text').textContent = warningText;
  workToDoAfterTheWarning = whatToDoNext;
  bootstrapModal('warning-modal').show();
}

/* ===========================================================================
 * 12. EXPORT AND IMPORT
 * ===========================================================================
 */

function wireUpTheTransferBox() {
  const modalElement = findElement('transfer-modal');
  const textArea = findElement('transfer-text');
  const messageElement = findElement('transfer-message');

  /* Fill the box with the current game whenever the panel opens. */
  modalElement.addEventListener('show.bs.modal', function () {
    textArea.value = callbacks.getGameAsText();
    messageElement.innerHTML = '';
  });

  findElement('transfer-copy-button').addEventListener('click', function () {
    textArea.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textArea.value).then(function () {
        messageElement.innerHTML = '<div class="alert alert-success py-2 mb-0">Copied.</div>';
      }, function () {
        messageElement.innerHTML = '<div class="alert alert-warning py-2 mb-0">' +
          'Could not copy on its own. The text is selected, so copy it yourself.</div>';
      });
    } else {
      messageElement.innerHTML = '<div class="alert alert-warning py-2 mb-0">' +
        'The text is selected, so copy it yourself.</div>';
    }
  });

  findElement('transfer-import-button').addEventListener('click', function () {
    const outcome = callbacks.onImportGame(textArea.value);
    if (outcome.error) {
      messageElement.innerHTML = '<div class="alert alert-danger py-2 mb-0">' +
        escapeHtml(outcome.error) + '</div>';
      return;
    }
    bootstrapModal('transfer-modal').hide();
    showToast('That farm is loaded and waiting.');
  });

  findElement('start-again-button').addEventListener('click', function () {
    bootstrapModal('transfer-modal').hide();
    callbacks.onStartAgain();
  });
}

/* ===========================================================================
 * 13. LITTLE MESSAGES
 * ===========================================================================
 */

export function showToast(message, kind) {
  const container = findElement('toast-container');
  const toastElement = document.createElement('div');
  toastElement.className = 'toast align-items-center text-bg-' + (kind || 'dark') + ' border-0';
  toastElement.setAttribute('role', 'status');
  toastElement.innerHTML = '' +
    '<div class="d-flex">' +
      '<div class="toast-body">' + escapeHtml(message) + '</div>' +
      '<button type="button" class="btn-close btn-close-white me-2 m-auto" ' +
        'data-bs-dismiss="toast" aria-label="Close"></button>' +
    '</div>';
  container.appendChild(toastElement);

  const toast = new window.bootstrap.Toast(toastElement, { delay: 4000 });
  toastElement.addEventListener('hidden.bs.toast', function () {
    toastElement.remove();
  });
  toast.show();
}
