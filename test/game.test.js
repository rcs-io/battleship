/* Node test suite for js/game.js — run: node test/game.test.js */
'use strict';

const assert = require('assert');
const BS = require('../js/game.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok -', name);
  } catch (err) {
    console.error('  FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

// Deterministic RNG so random-placement tests are reproducible.
function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// --- Board & placement -------------------------------------------------------

test('createBoard makes an empty 10x10 grid', () => {
  const b = BS.createBoard();
  assert.strictEqual(b.cells.length, 10);
  assert.strictEqual(b.cells[0].length, 10);
  assert.strictEqual(b.cells[4][7].ship, null);
  assert.strictEqual(b.cells[4][7].hit, false);
  assert.strictEqual(b.ships.length, 0);
});

test('shipCells returns the right coordinates in both orientations', () => {
  const h = BS.shipCells(2, 3, 4, true);
  assert.deepStrictEqual(h, [
    { row: 2, col: 3 }, { row: 2, col: 4 }, { row: 2, col: 5 }, { row: 2, col: 6 },
  ]);
  const v = BS.shipCells(2, 3, 4, false);
  assert.deepStrictEqual(v, [
    { row: 2, col: 3 }, { row: 3, col: 3 }, { row: 4, col: 3 }, { row: 5, col: 3 },
  ]);
});

test('canPlaceShip rejects out-of-bounds placements', () => {
  const b = BS.createBoard();
  assert.strictEqual(BS.canPlaceShip(b, 0, 0, 5, true), true);
  assert.strictEqual(BS.canPlaceShip(b, 0, 6, 5, true), false);   // runs off right edge
  assert.strictEqual(BS.canPlaceShip(b, 8, 0, 3, false), false);  // runs off bottom edge
  assert.strictEqual(BS.canPlaceShip(b, -1, 0, 3, false), false);
  assert.strictEqual(BS.canPlaceShip(b, 0, -1, 3, true), false);
  assert.strictEqual(BS.canPlaceShip(b, 9, 9, 2, true), false);
  assert.strictEqual(BS.canPlaceShip(b, 9, 9, 2, false), false);
});

test('canPlaceShip rejects overlaps', () => {
  const b = BS.createBoard();
  BS.placeShip(b, 'Carrier', 0, 0, 5, true);
  assert.strictEqual(BS.canPlaceShip(b, 0, 4, 3, true), false); // overlaps tail
  assert.strictEqual(BS.canPlaceShip(b, 0, 0, 3, false), false); // overlaps head
  assert.strictEqual(BS.canPlaceShip(b, 1, 0, 5, true), true);   // adjacent row is fine
  assert.strictEqual(BS.canPlaceShip(b, 0, 5, 5, true), true);   // adjacent tail-to-head is fine
});

test('placeShip marks cells and registers the ship', () => {
  const b = BS.createBoard();
  const ship = BS.placeShip(b, 'Destroyer', 3, 3, 2, false);
  assert.ok(ship);
  assert.strictEqual(b.cells[3][3].ship, 0);
  assert.strictEqual(b.cells[4][4].ship, null);
  assert.strictEqual(b.cells[4][3].ship, 0);
  assert.strictEqual(b.ships.length, 1);
  assert.strictEqual(ship.name, 'Destroyer');
});

test('placeShip returns null on illegal placement and mutates nothing', () => {
  const b = BS.createBoard();
  assert.strictEqual(BS.placeShip(b, 'Carrier', 0, 7, 5, true), null);
  assert.strictEqual(b.ships.length, 0);
  assert.strictEqual(b.cells[0][9].ship, null);
});

test('placeFleetRandomly places the full fleet without overlaps (20 seeds)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const b = BS.createBoard();
    assert.strictEqual(BS.placeFleetRandomly(b, seededRng(seed)), true);
    assert.strictEqual(b.ships.length, 5);
    let occupied = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (b.cells[r][c].ship !== null) occupied++;
      }
    }
    assert.strictEqual(occupied, 17, `seed ${seed}: expected 17 occupied cells`);
  }
});

// --- Firing --------------------------------------------------------------------

test('fireAt reports miss, hit, sunk, and repeat correctly', () => {
  const b = BS.createBoard();
  BS.placeShip(b, 'Destroyer', 0, 0, 2, true);
  assert.strictEqual(BS.fireAt(b, 5, 5).result, 'miss');
  assert.strictEqual(BS.fireAt(b, 5, 5).result, 'repeat');
  assert.strictEqual(BS.fireAt(b, 0, 0).result, 'hit');
  assert.strictEqual(BS.fireAt(b, 0, 0).result, 'repeat');
  const last = BS.fireAt(b, 0, 1);
  assert.strictEqual(last.result, 'sunk');
  assert.strictEqual(last.ship.name, 'Destroyer');
  assert.strictEqual(last.ship.sunk, true);
});

test('fireAt out of bounds is a repeat (no state change)', () => {
  const b = BS.createBoard();
  assert.strictEqual(BS.fireAt(b, -1, 0).result, 'repeat');
  assert.strictEqual(BS.fireAt(b, 0, 10).result, 'repeat');
});

test('allShipsSunk only when every ship is sunk', () => {
  const b = BS.createBoard();
  BS.placeShip(b, 'Destroyer', 0, 0, 2, true);
  BS.placeShip(b, 'Submarine', 5, 5, 3, false);
  BS.fireAt(b, 0, 0);
  BS.fireAt(b, 0, 1);
  assert.strictEqual(BS.allShipsSunk(b), false);
  BS.fireAt(b, 5, 5);
  BS.fireAt(b, 6, 5);
  assert.strictEqual(BS.allShipsSunk(b), false);
  BS.fireAt(b, 7, 5);
  assert.strictEqual(BS.allShipsSunk(b), true);
});

test('fleetPlaced only after all five ships are down', () => {
  const b = BS.createBoard();
  assert.strictEqual(BS.fleetPlaced(b), false);
  BS.placeFleetRandomly(b, seededRng(42));
  assert.strictEqual(BS.fleetPlaced(b), true);
});

// --- AI ---------------------------------------------------------------------------

test('AI sinks a full randomly-placed fleet within 100 shots, never repeating', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const b = BS.createBoard();
    BS.placeFleetRandomly(b, seededRng(seed * 7));
    const ai = BS.createAI(seededRng(seed * 13));
    let shots = 0;
    while (!BS.allShipsSunk(b) && shots < 100) {
      const shot = ai.nextShot(b);
      assert.ok(shot, `seed ${seed}: AI returned no shot`);
      const outcome = BS.fireAt(b, shot.row, shot.col);
      assert.notStrictEqual(outcome.result, 'repeat',
        `seed ${seed}: AI repeated shot ${shot.row},${shot.col}`);
      ai.recordResult(shot.row, shot.col, outcome.result);
      shots++;
    }
    assert.strictEqual(BS.allShipsSunk(b), true,
      `seed ${seed}: fleet not sunk after ${shots} shots`);
  }
});

test('AI nextShot always returns an in-bounds unshot cell until board exhausted', () => {
  const b = BS.createBoard();
  BS.placeFleetRandomly(b, seededRng(99));
  const ai = BS.createAI(seededRng(7));
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const shot = ai.nextShot(b);
    assert.ok(BS.inBounds(shot.row, shot.col));
    const key = shot.row + ',' + shot.col;
    assert.ok(!seen.has(key), 'AI duplicated ' + key);
    seen.add(key);
    const outcome = BS.fireAt(b, shot.row, shot.col);
    ai.recordResult(shot.row, shot.col, outcome.result);
  }
});

// --- Full game simulation --------------------------------------------------------

test('a full simulated game terminates with exactly one winner', () => {
  const player = BS.createBoard();
  const enemy = BS.createBoard();
  BS.placeFleetRandomly(player, seededRng(1));
  BS.placeFleetRandomly(enemy, seededRng(2));
  const ai = BS.createAI(seededRng(3));

  // Player picks unshot cells at random; AI uses hunt/target.
  const playerRng = seededRng(4);
  let winner = null;
  let turns = 0;
  while (!winner && turns < 500) {
    turns++;
    // player shot
    let pshot;
    do {
      pshot = { row: Math.floor(playerRng() * 10), col: Math.floor(playerRng() * 10) };
    } while (enemy.cells[pshot.row][pshot.col].hit);
    BS.fireAt(enemy, pshot.row, pshot.col);
    if (BS.allShipsSunk(enemy)) { winner = 'player'; break; }
    // ai shot
    const ashot = ai.nextShot(player);
    const outcome = BS.fireAt(player, ashot.row, ashot.col);
    ai.recordResult(ashot.row, ashot.col, outcome.result);
    if (BS.allShipsSunk(player)) winner = 'ai';
  }
  assert.ok(winner, 'game did not terminate');
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`);
