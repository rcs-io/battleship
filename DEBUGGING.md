# Debugging report — Battleship

How the game was verified:

- **Automated logic tests** — `test/game.test.js` (14 tests, `node test/game.test.js`)
  covers placement rules, firing/sunk detection, fleet randomization over 20
  seeds, AI shot uniqueness over a full board, and a simulated end-to-end game.
- **Scripted browser testing** — a full game played in real Chrome:
  manual + random placement, invalid placements, rotation, firing, sunk ships,
  victory overlay, and Play-again reset, with a console-error hook installed
  before the session (zero errors logged).

## Bugs found and fixed

### 1. Random fleet placement could leave a corrupt, partial fleet
- **Found:** code review while hardening `js/game.js`.
- **Bug:** `placeFleetRandomly()` returned `false` when a ship exhausted its
  placement retries — but both UI callers (`Random layout`, `Start battle`)
  ignored the return value. A failure would leave a partially-placed board and
  start a game the player could never win (or that couldn't start properly).
- **Fix:** the function now resets the board and retries the *whole* fleet on
  failure instead of giving up per ship, and both callers check the return
  value and show a "try again" message instead of proceeding on a bad board.

### 2. Shot-status coordinates didn't match standard Battleship notation — and the board had no axis labels
- **Found:** code review of `js/ui.js` (`coord()`).
- **Bug:** status messages like "Hit at B4!" computed the letter from the
  *row* and the number from the *column* — the reverse of standard Battleship
  notation. Worse, the board had no row/column labels at all, so the messages
  referred to coordinates the player couldn't see.
- **Fix:** `coord()` now maps letters to columns and numbers to rows
  (A–J across the top, 1–10 down the left), and labeled axes were added to all
  three boards.

### 3. Your shot result disappeared after ~0.5 seconds
- **Found:** scripted browser testing.
- **Bug:** the status bar showed your shot outcome ("Hit at B4!") for only
  ~550 ms before the AI's reply overwrote it ("Enemy fired at G6 — miss."),
  so the result of your own turn was easy to miss entirely.
- **Fix:** the player's result is retained and the AI's reply is appended, so
  the bar reads e.g. "Hit at B4!  Enemy fired at G6 — miss." until your next
  shot.

### 4. Placement preview went stale when rotating mid-hover
- **Found:** scripted browser testing.
- **Bug:** the green/red placement preview only repainted on `mouseenter`.
  Hovering a cell and pressing `R` left the preview showing the old
  orientation until the mouse moved — a wrong preview could invite an invalid
  placement click.
- **Fix:** the last hovered cell is tracked, and rotating repaints the preview
  in the new orientation immediately.

## Verified working (not bugs)

- Clicks on already-fired cells are ignored and don't hand the AI a free turn.
- Clicks during the AI's ~0.5 s turn are dropped — no shot queueing.
- AI never repeats a shot and always finishes a fleet inside 100 shots
  (tested over multiple seeds).
- "Start battle" stays disabled until all five ships are placed.
- Victory/defeat overlay blocks further board input; Play again fully resets.
- Zero console errors across full-game browser sessions.
