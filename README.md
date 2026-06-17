# 2048

A minimal, static browser build of the classic 2048 game.

Everything runs locally in the browser. Game state is saved to `localStorage`,
so closing the page keeps your board, score, and undo history.

## Play

Open `index.html`, or host this directory as a static site.

- Arrow keys / `WASD`, or swipe on touch devices to move.
- Tiles with the same number merge; a new tile (2 at 90%, 4 at 10%) appears each move.
- `撤回` undoes moves; `新游戏` starts over.
