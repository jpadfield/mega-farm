/*
 * storage.js
 * ---------------------------------------------------------------------------
 * Saving and resuming a game, using the browser's localStorage.
 *
 * The 250 Plot campaign is meant to be played over several sittings, so this
 * is a real feature rather than a convenience. The whole game state is a plain
 * object of numbers, strings and lists, so it turns into text with
 * JSON.stringify and back again with JSON.parse. Nothing clever is needed.
 *
 * Every function here is careful never to throw. A browser can refuse to store
 * anything at all (private windows, blocked site data), and a game that cannot
 * be saved should still be playable.
 * ---------------------------------------------------------------------------
 */

/* One key for the saved game and one for the setup choices, so that the setup
 * screen can remember the names and the finish line from last time. */
const SAVED_GAME_KEY = 'mega-farm-challenge.saved-game';
const SAVED_SETUP_KEY = 'mega-farm-challenge.saved-setup';

/* The shape of a saved game. If the state ever changes shape in a way that
 * would break old saves, raise this number and old saves are politely
 * ignored rather than loaded and misread. */
const CURRENT_SAVE_FORMAT_VERSION = 1;

function localStorageIsUsable() {
  try {
    const testKey = 'mega-farm-challenge.test';
    window.localStorage.setItem(testKey, 'x');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
}

export function saveGame(state) {
  if (!localStorageIsUsable()) {
    return false;
  }
  try {
    window.localStorage.setItem(SAVED_GAME_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    return false;
  }
}

/* Returns the saved state, or null if there is nothing usable saved. */
export function loadGame() {
  if (!localStorageIsUsable()) {
    return null;
  }
  try {
    const savedText = window.localStorage.getItem(SAVED_GAME_KEY);
    if (!savedText) {
      return null;
    }
    const state = JSON.parse(savedText);
    if (!state || state.saveFormatVersion !== CURRENT_SAVE_FORMAT_VERSION) {
      return null;
    }
    return state;
  } catch (error) {
    return null;
  }
}

export function aSavedGameExists() {
  return loadGame() !== null;
}

export function clearSavedGame() {
  if (!localStorageIsUsable()) {
    return;
  }
  try {
    window.localStorage.removeItem(SAVED_GAME_KEY);
  } catch (error) {
    /* Nothing sensible to do, and nothing worth interrupting the game for. */
  }
}

/* A one-line description of the saved game, for the "Resume" button. */
export function describeSavedGame(state) {
  if (!state) {
    return '';
  }
  return state.playerNames.join(' and ') + ', turn ' + state.turnNumber +
    ', ' + state.resources.plots + ' of ' + state.finishLinePlots + ' Plots';
}

/* ---------------------------------------------------------------------------
 * Remembering the setup choices between games
 * ------------------------------------------------------------------------ */

export function saveSetupChoices(choices) {
  if (!localStorageIsUsable()) {
    return;
  }
  try {
    window.localStorage.setItem(SAVED_SETUP_KEY, JSON.stringify(choices));
  } catch (error) {
    /* Not important enough to complain about. */
  }
}

export function loadSetupChoices() {
  if (!localStorageIsUsable()) {
    return null;
  }
  try {
    const savedText = window.localStorage.getItem(SAVED_SETUP_KEY);
    return savedText ? JSON.parse(savedText) : null;
  } catch (error) {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * Moving a game between devices
 * ------------------------------------------------------------------------ */

/* The game state as readable text, for the Export box. */
export function exportGameToText(state) {
  return JSON.stringify(state, null, 2);
}

/*
 * Read a game back from the Import box.
 * Returns { state: ... } on success or { error: 'why not' } on failure, so
 * that the caller can show the reason rather than guessing.
 */
export function importGameFromText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: 'That does not look like a saved game. It is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { error: 'That does not look like a saved game.' };
  }
  if (parsed.saveFormatVersion !== CURRENT_SAVE_FORMAT_VERSION) {
    return { error: 'That save was made by a different version of the game.' };
  }
  if (!parsed.resources || typeof parsed.resources.plots !== 'number') {
    return { error: 'That save is missing the farm itself.' };
  }
  return { state: parsed };
}
