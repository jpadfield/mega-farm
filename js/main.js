/*
 * main.js
 * ---------------------------------------------------------------------------
 * THE WIRING. This file holds the one game that is being played, hands button
 * presses to the engine, and asks the interface to redraw itself.
 *
 * It is deliberately the shortest file in the project. Each function here does
 * one small thing:
 *
 *   1. ask engine.js for a new state,
 *   2. remember it,
 *   3. save it if the turn has ended,
 *   4. tell ui.js to draw it.
 *
 * If you are looking for a rule, it is in engine.js. If you are looking for a
 * number, it is in gamedata.js. If you are looking for something on the
 * screen, it is in ui.js.
 * ---------------------------------------------------------------------------
 */

import * as engine from './engine.js';
import * as storage from './storage.js';
import * as ui from './ui.js';

/* The single game in progress, or null while the setup screen is showing.
 * Engine functions never change this object; they hand back a new one, and we
 * put the new one here. */
let currentGameState = null;

/* ===========================================================================
 * 1. STARTING UP
 * ===========================================================================
 */

function startTheApplication() {
  ui.initialise({
    onStartGame: startANewGame,
    onResumeGame: resumeTheSavedGame,
    onRollChance: rollTheChanceCheck,
    onUseLuckyReflip: useTheLuckyReflip,
    onResolveEvent: resolveTheEvent,
    onTakeAction: takeAnAction,
    onResolveObligation: resolveTheObligation,
    onFinishMilestone: finishTheMilestone,
    onEndTurn: endTheTurn,
    onStartAgain: startAgainFromTheSetupScreen,
    onImportGame: importAGame,
    getGameAsText: currentGameAsText
  });

  showTheSetupScreen();
}

function showTheSetupScreen() {
  const savedState = storage.loadGame();
  const savedDescription = savedState ? storage.describeSavedGame(savedState) : null;
  ui.showSetupScreen(savedDescription, storage.loadSetupChoices());
}

/* ===========================================================================
 * 2. THE TWO WAYS A GAME BEGINS
 * ===========================================================================
 */

function startANewGame(setupChoices) {
  /* Remember the names and settings for next time, whatever happens. */
  storage.saveSetupChoices(setupChoices);

  currentGameState = engine.createGame(setupChoices);
  saveTheGame();
  redraw();
}

function resumeTheSavedGame() {
  const savedState = storage.loadGame();
  if (!savedState) {
    ui.showToast('That saved game could not be read, so here is a fresh farm instead.', 'danger');
    showTheSetupScreen();
    return;
  }
  currentGameState = savedState;
  redraw();
  ui.showToast('Welcome back to the farm.');
}

function startAgainFromTheSetupScreen() {
  currentGameState = null;
  storage.clearSavedGame();
  showTheSetupScreen();
}

/* ===========================================================================
 * 3. PLAYING A TURN
 * ===========================================================================
 * Every one of these follows the same three lines: ask the engine, keep the
 * answer, draw it.
 */

function rollTheChanceCheck() {
  currentGameState = engine.rollChance(currentGameState);
  redraw();
}

function useTheLuckyReflip() {
  currentGameState = engine.useLuckyReflip(currentGameState);
  redraw();
  ui.showToast('The Lucky Re-flip is used up for this game.');
}

function resolveTheEvent(chosenOptionId) {
  currentGameState = engine.resolveEvent(currentGameState, chosenOptionId);
  redraw();
}

function takeAnAction(role, actionId, extraOptions) {
  currentGameState = engine.takeAction(currentGameState, role, actionId, extraOptions);
  redraw();
}

function resolveTheObligation() {
  currentGameState = engine.resolveObligation(currentGameState);
  redraw();
}

function endTheTurn() {
  currentGameState = engine.endTurn(currentGameState);
  /* The brief asks for a save after every turn, and this is the only place a
   * turn ends, so this is the only place that needs to remember. */
  saveTheGame();
  redraw();
}

/* ===========================================================================
 * 4. MILESTONES
 * ===========================================================================
 * A milestone can arrive part way through a turn, the moment the Plot count
 * crosses the line. The engine parks the game in the "milestone" phase and
 * waits. We apply the whole checklist at once and hand the report to the
 * interface, which walks the players through it one step at a time.
 */

function handleAnyWaitingMilestone() {
  if (currentGameState.phase !== 'milestone') {
    return false;
  }
  currentGameState = engine.applyMilestones(currentGameState);
  /* A milestone changes a great deal at once, so it is worth saving here as
   * well as at the end of the turn. */
  saveTheGame();
  ui.beginMilestoneWalkthrough(currentGameState, currentGameState.lastMilestoneReport);
  return true;
}

function finishTheMilestone() {
  /* Crossing one milestone can immediately reveal the next one, although with
   * the printed numbers that cannot actually happen. Checking costs nothing
   * and means the game can never get stuck. */
  if (handleAnyWaitingMilestone()) {
    return;
  }
  ui.renderGame(currentGameState);
}

/* ===========================================================================
 * 5. SAVING, EXPORTING AND IMPORTING
 * ===========================================================================
 */

function saveTheGame() {
  const wasSaved = storage.saveGame(currentGameState);
  if (!wasSaved) {
    ui.showToast('This browser will not let the game be saved, so do not close the tab.', 'warning');
  }
}

function currentGameAsText() {
  if (!currentGameState) {
    return '';
  }
  return storage.exportGameToText(currentGameState);
}

/* Returns { error } if the text was no good, so that the interface can say so
 * without the game being disturbed. */
function importAGame(text) {
  const outcome = storage.importGameFromText(text);
  if (outcome.error) {
    return outcome;
  }
  currentGameState = outcome.state;
  saveTheGame();
  redraw();
  return {};
}

/* ===========================================================================
 * 6. DRAWING
 * ===========================================================================
 */

function redraw() {
  /* A waiting milestone takes over the screen, so it is checked first. */
  if (handleAnyWaitingMilestone()) {
    return;
  }
  ui.renderGame(currentGameState);
}

/* And away we go. */
startTheApplication();
