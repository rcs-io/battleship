# Battleship

Play Battleship in the browser against a hunt/target AI. No build step, no
dependencies — plain HTML, CSS, and JavaScript.

**Play it live:** https://rcs-io.github.io/battleship/

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## How to play

1. **Deploy** — pick a ship from the palette and click a cell to place it.
   `R` or the Rotate button switches orientation; green preview means legal,
   red means out of bounds or overlapping. Or hit **Random layout**.
2. **Battle** — click a cell on the enemy board to fire. White dot = miss,
   red ✕ = hit, dark red = sunk. The AI fires back after each of your shots.
3. First to sink all five enemy ships wins.

Fleet: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).

## Architecture

- `js/game.js` — pure game logic (boards, placement rules, firing, the AI).
  No DOM; also runs under Node for testing. The AI hunts on a checkerboard
  parity pattern and queues adjacent cells after each hit.
- `js/ui.js` — DOM rendering and interaction for both phases (setup, battle).
- `index.html` / `styles.css` — markup and theme.
- `test/game.test.js` — Node test suite: `node test/game.test.js`
- `DEBUGGING.md` — bugs found during development and how they were fixed.
