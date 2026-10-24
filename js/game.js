/*
 * Battleship core game logic — pure functions, no DOM.
 * Used by the browser UI (js/ui.js) and by the Node test suite (test/game.test.js).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Battleship = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BOARD_SIZE = 10;

  var FLEET = [
    { name: 'Carrier',    length: 5 },
    { name: 'Battleship', length: 4 },
    { name: 'Cruiser',    length: 3 },
    { name: 'Submarine',  length: 3 },
    { name: 'Destroyer',  length: 2 },
  ];

  // --- Board ---------------------------------------------------------------

  function createBoard() {
    var cells = [];
    for (var r = 0; r < BOARD_SIZE; r++) {
      var row = [];
      for (var c = 0; c < BOARD_SIZE; c++) {
        row.push({ ship: null, hit: false });
      }
      cells.push(row);
    }
    return { size: BOARD_SIZE, cells: cells, ships: [] };
  }

  function inBounds(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  function shipCells(row, col, length, horizontal) {
    var cells = [];
    for (var i = 0; i < length; i++) {
      cells.push({ row: row + (horizontal ? 0 : i), col: col + (horizontal ? i : 0) });
    }
    return cells;
  }

  function canPlaceShip(board, row, col, length, horizontal) {
    var cells = shipCells(row, col, length, horizontal);
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (!inBounds(cell.row, cell.col)) return false;
      if (board.cells[cell.row][cell.col].ship !== null) return false;
    }
    return true;
  }

  // Places a ship on the board and returns the ship record, or null if illegal.
  function placeShip(board, name, row, col, length, horizontal) {
    if (!canPlaceShip(board, row, col, length, horizontal)) return null;
    var ship = {
      name: name,
      length: length,
      horizontal: !!horizontal,
      cells: shipCells(row, col, length, horizontal),
      hits: 0,
      sunk: false,
    };
    var id = board.ships.length;
    for (var i = 0; i < ship.cells.length; i++) {
      var cell = ship.cells[i];
      board.cells[cell.row][cell.col].ship = id;
    }
    board.ships.push(ship);
    return ship;
  }

  // Places the whole fleet at random. Retries the full layout if a ship gets
  // boxed in by earlier placements; returns false only if every attempt fails.
  function placeFleetRandomly(board, rng) {
    var random = rng || Math.random;
    for (var restart = 0; restart < 50; restart++) {
      // Reset the board before each attempt so a partial layout never leaks through.
      board.cells = createBoard().cells;
      board.ships = [];
      var ok = true;
      for (var i = 0; i < FLEET.length && ok; i++) {
        var ship = FLEET[i];
        var placed = false;
        for (var attempt = 0; attempt < 500 && !placed; attempt++) {
          var horizontal = random() < 0.5;
          var row = Math.floor(random() * BOARD_SIZE);
          var col = Math.floor(random() * BOARD_SIZE);
          placed = placeShip(board, ship.name, row, col, ship.length, horizontal) !== null;
        }
        ok = placed;
      }
      if (ok) return true;
    }
    return false;
  }

  // --- Firing ---------------------------------------------------------------

  // Returns { result: 'miss' | 'hit' | 'sunk' | 'repeat', ship?: <ship record> }
  function fireAt(board, row, col) {
    if (!inBounds(row, col)) return { result: 'repeat' };
    var cell = board.cells[row][col];
    if (cell.hit) return { result: 'repeat' };
    cell.hit = true;
    if (cell.ship === null) return { result: 'miss' };
    var ship = board.ships[cell.ship];
    ship.hits++;
    if (ship.hits >= ship.length) {
      ship.sunk = true;
      return { result: 'sunk', ship: ship };
    }
    return { result: 'hit', ship: ship };
  }

  function allShipsSunk(board) {
    for (var i = 0; i < board.ships.length; i++) {
      if (!board.ships[i].sunk) return false;
    }
    return board.ships.length > 0;
  }

  function fleetPlaced(board) {
    return board.ships.length === FLEET.length;
  }

  // --- AI opponent ------------------------------------------------------------
  // Hunt/target strategy: fire on a parity (checkerboard) pattern while hunting;
  // after a hit, queue orthogonally-adjacent cells until the ship is sunk.

  function createAI(rng) {
    var random = rng || Math.random;
    var targetQueue = [];
    var shots = [];
    for (var r = 0; r < BOARD_SIZE; r++) {
      for (var c = 0; c < BOARD_SIZE; c++) {
        shots.push(false);
      }
    }

    function alreadyShot(row, col) {
      return shots[row * BOARD_SIZE + col];
    }

    function markShot(row, col) {
      shots[row * BOARD_SIZE + col] = true;
    }

    function neighbors(row, col) {
      var list = [];
      var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (var i = 0; i < dirs.length; i++) {
        var nr = row + dirs[i][0];
        var nc = col + dirs[i][1];
        if (inBounds(nr, nc) && !alreadyShot(nr, nc)) list.push({ row: nr, col: nc });
      }
      return list;
    }

    function pickHuntCell(board) {
      // Prefer parity cells (r + c even) — every ship of length >= 2 covers one.
      var candidates = [];
      var fallback = [];
      for (var r = 0; r < BOARD_SIZE; r++) {
        for (var c = 0; c < BOARD_SIZE; c++) {
          if (alreadyShot(r, c)) continue;
          if ((r + c) % 2 === 0) candidates.push({ row: r, col: c });
          else fallback.push({ row: r, col: c });
        }
      }
      var pool = candidates.length > 0 ? candidates : fallback;
      if (pool.length === 0) return null;
      return pool[Math.floor(random() * pool.length)];
    }

    return {
      // Picks the next cell to fire on given the opponent board.
      nextShot: function (board) {
        while (targetQueue.length > 0) {
          var t = targetQueue.shift();
          if (!alreadyShot(t.row, t.col)) return t;
        }
        return pickHuntCell(board);
      },
      // Lets the AI react to the outcome of its shot.
      recordResult: function (row, col, result) {
        markShot(row, col);
        if (result === 'hit') {
          neighbors(row, col).forEach(function (n) { targetQueue.push(n); });
        } else if (result === 'sunk') {
          // Keep queued cells that still adjoin other unsunk hits; the
          // alreadyShot filter on dequeue keeps this cheap and correct.
          neighbors(row, col).forEach(function (n) { targetQueue.push(n); });
        }
      },
    };
  }

  return {
    BOARD_SIZE: BOARD_SIZE,
    FLEET: FLEET,
    createBoard: createBoard,
    inBounds: inBounds,
    shipCells: shipCells,
    canPlaceShip: canPlaceShip,
    placeShip: placeShip,
    placeFleetRandomly: placeFleetRandomly,
    fireAt: fireAt,
    allShipsSunk: allShipsSunk,
    fleetPlaced: fleetPlaced,
    createAI: createAI,
  };
});
