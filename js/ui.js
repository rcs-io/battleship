/* Battleship UI layer — wires js/game.js logic to the DOM. */
(function () {
  'use strict';

  var BS = window.Battleship;

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    status: $('status-bar'),
    setupPanel: $('setup-panel'),
    palette: $('ship-palette'),
    rotateBtn: $('rotate-btn'),
    randomBtn: $('random-btn'),
    clearBtn: $('clear-btn'),
    startBtn: $('start-btn'),
    setupBoard: $('setup-board'),
    battlePanel: $('battle-panel'),
    playerBoard: $('player-board'),
    enemyBoard: $('enemy-board'),
    playerFleet: $('player-fleet-status'),
    enemyFleet: $('enemy-fleet-status'),
    gameOver: $('game-over'),
    gameOverTitle: $('game-over-title'),
    gameOverDetail: $('game-over-detail'),
    playAgainBtn: $('play-again-btn'),
  };

  var AI_DELAY_MS = 550;

  var state = {
    phase: 'setup', // 'setup' | 'battle' | 'over'
    playerBoard: BS.createBoard(),
    enemyBoard: BS.createBoard(),
    ai: null,
    horizontal: true,
    selectedShip: 0, // index into BS.FLEET
    busy: false,     // true while the AI is taking its turn
    playerShots: 0,
    aiShots: 0,
    hoverCell: null,   // last hovered setup cell, for preview repaint on rotate
    lastPlayerMsg: '', // player's shot result, kept visible alongside the AI's reply
  };

  // --- Helpers ----------------------------------------------------------------

  function setStatus(text) {
    els.status.textContent = text;
  }

  function coord(row, col) {
    // Standard notation: letters mark columns (A–J), numbers mark rows (1–10).
    return String.fromCharCode(65 + col) + (row + 1);
  }

  function makeCell(row, col) {
    var div = document.createElement('div');
    div.className = 'cell';
    div.dataset.row = row;
    div.dataset.col = col;
    return div;
  }

  function cellsOf(el) {
    return el.querySelectorAll('.cell');
  }

  function cellAt(el, row, col) {
    return el.children[row * BS.BOARD_SIZE + col];
  }

  function buildGrid(container) {
    container.innerHTML = '';
    for (var r = 0; r < BS.BOARD_SIZE; r++) {
      for (var c = 0; c < BS.BOARD_SIZE; c++) {
        container.appendChild(makeCell(r, c));
      }
    }
  }

  // --- Setup phase -------------------------------------------------------------

  function unplacedIndex() {
    // First fleet index whose name is not yet on the player board.
    var placed = {};
    state.playerBoard.ships.forEach(function (s) { placed[s.name] = true; });
    for (var i = 0; i < BS.FLEET.length; i++) {
      if (!placed[BS.FLEET[i].name]) return i;
    }
    return -1;
  }

  function renderPalette() {
    els.palette.innerHTML = '';
    var placed = {};
    state.playerBoard.ships.forEach(function (s) { placed[s.name] = true; });
    BS.FLEET.forEach(function (ship, i) {
      var li = document.createElement('li');
      li.textContent = ship.name + ' (' + ship.length + ')';
      li.dataset.index = i;
      if (placed[ship.name]) li.classList.add('placed');
      if (i === state.selectedShip && !placed[ship.name]) li.classList.add('selected');
      li.addEventListener('click', function () {
        if (placed[ship.name]) return;
        state.selectedShip = i;
        renderPalette();
      });
      els.palette.appendChild(li);
    });
    els.startBtn.disabled = !BS.fleetPlaced(state.playerBoard);
  }

  function clearPreview() {
    cellsOf(els.setupBoard).forEach(function (cell) {
      cell.classList.remove('preview-ok', 'preview-bad');
    });
  }

  function previewAt(row, col) {
    clearPreview();
    state.hoverCell = { row: row, col: col };
    if (state.selectedShip < 0) return;
    var ship = BS.FLEET[state.selectedShip];
    var cells = BS.shipCells(row, col, ship.length, state.horizontal);
    var ok = BS.canPlaceShip(state.playerBoard, row, col, ship.length, state.horizontal);
    cells.forEach(function (c) {
      if (!BS.inBounds(c.row, c.col)) return;
      cellAt(els.setupBoard, c.row, c.col).classList.add(ok ? 'preview-ok' : 'preview-bad');
    });
  }

  function renderSetupBoard() {
    buildGrid(els.setupBoard);
    state.playerBoard.ships.forEach(function (ship) {
      ship.cells.forEach(function (c) {
        cellAt(els.setupBoard, c.row, c.col).classList.add('ship');
      });
    });
    cellsOf(els.setupBoard).forEach(function (cell) {
      var row = +cell.dataset.row;
      var col = +cell.dataset.col;
      cell.addEventListener('mouseenter', function () { previewAt(row, col); });
      cell.addEventListener('click', function () { onSetupClick(row, col); });
    });
    els.setupBoard.addEventListener('mouseleave', function () {
      clearPreview();
      state.hoverCell = null;
    });
  }

  function onSetupClick(row, col) {
    if (state.phase !== 'setup') return;
    if (state.selectedShip < 0) {
      setStatus('All ships placed — press Start battle.');
      return;
    }
    var ship = BS.FLEET[state.selectedShip];
    var placed = BS.placeShip(
      state.playerBoard, ship.name, row, col, ship.length, state.horizontal
    );
    if (!placed) {
      setStatus('Cannot place the ' + ship.name + ' there — out of bounds or overlapping.');
      return;
    }
    state.selectedShip = unplacedIndex();
    renderSetupBoard();
    renderPalette();
    if (state.selectedShip === -1) {
      setStatus('Fleet deployed. Press Start battle when ready.');
    } else {
      setStatus('Now place the ' + BS.FLEET[state.selectedShip].name +
        ' (' + BS.FLEET[state.selectedShip].length + ').');
    }
  }

  function resetSetupBoard() {
    state.playerBoard = BS.createBoard();
    state.selectedShip = 0;
    renderSetupBoard();
    renderPalette();
    setStatus('Place your ships to begin.');
  }

  function randomize() {
    state.playerBoard = BS.createBoard();
    if (!BS.placeFleetRandomly(state.playerBoard)) {
      setStatus('Could not generate a layout — try again.');
      return;
    }
    state.selectedShip = -1;
    renderSetupBoard();
    renderPalette();
    setStatus('Random fleet deployed. Press Start battle when ready.');
  }

  // --- Battle phase --------------------------------------------------------------

  function renderPlayerBoard() {
    buildGrid(els.playerBoard);
    state.playerBoard.ships.forEach(function (ship) {
      ship.cells.forEach(function (c) {
        cellAt(els.playerBoard, c.row, c.col).classList.add('ship');
      });
    });
    paintShots(els.playerBoard, state.playerBoard, true);
  }

  function renderEnemyBoard() {
    buildGrid(els.enemyBoard);
    paintShots(els.enemyBoard, state.enemyBoard, false);
    cellsOf(els.enemyBoard).forEach(function (cell) {
      cell.addEventListener('click', function () {
        onEnemyCellClick(+cell.dataset.row, +cell.dataset.col);
      });
    });
  }

  function paintShots(container, board, showShips) {
    board.ships.forEach(function (ship) {
      if (!ship.sunk) return;
      ship.cells.forEach(function (c) {
        var cell = cellAt(container, c.row, c.col);
        cell.classList.add('sunk-cell');
      });
    });
    for (var r = 0; r < BS.BOARD_SIZE; r++) {
      for (var c = 0; c < BS.BOARD_SIZE; c++) {
        var data = board.cells[r][c];
        if (!data.hit) continue;
        var cell = cellAt(container, r, c);
        cell.classList.add(data.ship === null ? 'miss' : 'hit');
      }
    }
  }

  function renderFleetStatus(listEl, board) {
    listEl.innerHTML = '';
    board.ships.forEach(function (ship) {
      var li = document.createElement('li');
      li.textContent = ship.name;
      if (ship.sunk) li.classList.add('sunk');
      listEl.appendChild(li);
    });
  }

  function renderBattle() {
    renderPlayerBoard();
    renderEnemyBoard();
    renderFleetStatus(els.playerFleet, state.playerBoard);
    renderFleetStatus(els.enemyFleet, state.enemyBoard);
  }

  function startBattle() {
    state.enemyBoard = BS.createBoard();
    if (!BS.placeFleetRandomly(state.enemyBoard)) {
      setStatus('Could not deploy the enemy fleet — try again.');
      return;
    }
    state.ai = BS.createAI();
    state.phase = 'battle';
    state.busy = false;
    state.playerShots = 0;
    state.aiShots = 0;
    els.setupPanel.classList.add('hidden');
    els.battlePanel.classList.remove('hidden');
    renderBattle();
    setStatus('Battle stations! Fire on the enemy board.');
  }

  function onEnemyCellClick(row, col) {
    if (state.phase !== 'battle' || state.busy) return;
    var cell = state.enemyBoard.cells[row][col];
    if (cell.hit) return;
    var outcome = BS.fireAt(state.enemyBoard, row, col);
    state.playerShots++;
    if (outcome.result === 'miss') {
      state.lastPlayerMsg = 'Miss at ' + coord(row, col) + '.';
    } else if (outcome.result === 'hit') {
      state.lastPlayerMsg = 'Hit at ' + coord(row, col) + '!';
    } else if (outcome.result === 'sunk') {
      state.lastPlayerMsg = 'You sank the enemy ' + outcome.ship.name + '!';
    }
    setStatus(state.lastPlayerMsg);
    renderBattle();
    if (BS.allShipsSunk(state.enemyBoard)) {
      endGame(true);
      return;
    }
    state.busy = true;
    setTimeout(aiTurn, AI_DELAY_MS);
  }

  function aiTurn() {
    if (state.phase !== 'battle') return;
    var shot = state.ai.nextShot(state.playerBoard);
    var outcome = BS.fireAt(state.playerBoard, shot.row, shot.col);
    state.aiShots++;
    state.ai.recordResult(shot.row, shot.col, outcome.result);
    // Keep the player's own shot result visible alongside the AI's reply;
    // otherwise it was overwritten ~0.5s after appearing.
    var at = coord(shot.row, shot.col);
    if (outcome.result === 'miss') {
      setStatus(state.lastPlayerMsg + '  Enemy fired at ' + at + ' — miss.');
    } else if (outcome.result === 'hit') {
      setStatus(state.lastPlayerMsg + '  Enemy hit your ' + outcome.ship.name + ' at ' + at + '!');
    } else if (outcome.result === 'sunk') {
      setStatus(state.lastPlayerMsg + '  Enemy sank your ' + outcome.ship.name + '!');
    }
    renderBattle();
    if (BS.allShipsSunk(state.playerBoard)) {
      endGame(false);
      return;
    }
    state.busy = false;
  }

  function endGame(playerWon) {
    state.phase = 'over';
    els.gameOverTitle.textContent = playerWon ? 'Victory!' : 'Defeat';
    els.gameOverDetail.textContent = playerWon
      ? 'You sank the enemy fleet in ' + state.playerShots + ' shots.'
      : 'The AI sank your fleet in ' + state.aiShots + ' shots.';
    els.gameOver.classList.remove('hidden');
    setStatus(playerWon ? 'You win — enemy fleet destroyed.' : 'You lose — your fleet was destroyed.');
  }

  function restart() {
    state.phase = 'setup';
    state.playerBoard = BS.createBoard();
    state.enemyBoard = BS.createBoard();
    state.ai = null;
    state.busy = false;
    state.horizontal = true;
    state.selectedShip = 0;
    state.hoverCell = null;
    state.lastPlayerMsg = '';
    els.gameOver.classList.add('hidden');
    els.battlePanel.classList.add('hidden');
    els.setupPanel.classList.remove('hidden');
    resetSetupBoard();
  }

  // --- Wiring ----------------------------------------------------------------------

  function rotate() {
    state.horizontal = !state.horizontal;
    setStatus('Orientation: ' + (state.horizontal ? 'horizontal' : 'vertical') + '.');
    // Repaint the hover preview in the new orientation if the cursor is on the board.
    if (state.hoverCell) previewAt(state.hoverCell.row, state.hoverCell.col);
  }

  els.rotateBtn.addEventListener('click', rotate);

  document.addEventListener('keydown', function (e) {
    if (state.phase === 'setup' && (e.key === 'r' || e.key === 'R')) rotate();
  });

  els.randomBtn.addEventListener('click', randomize);
  els.clearBtn.addEventListener('click', resetSetupBoard);
  els.startBtn.addEventListener('click', startBattle);
  els.playAgainBtn.addEventListener('click', restart);

  renderPalette();
  renderSetupBoard();
})();
