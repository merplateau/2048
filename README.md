# 2048 · 数独

Two minimal, static browser games in one page — switch between **2048** and **Sudoku**
from the toggle at the top. Everything runs locally; game state is saved to
`localStorage`, so closing the page keeps your board, score, and progress.

## Play

Open `index.html`, or host this directory as a static site.

### 2048
- Arrow keys / `WASD`, or swipe to move; same numbers merge.
- A new tile (2 at 90%, 4 at 10%) appears each move.
- `撤回` undoes moves — available even after the game is over.

### 数独 (Sudoku)
- Five difficulties (入门 / 简单 / 中等 / 困难 / 专家); pick one to start a fresh puzzle.
- Tap a cell, then tap the on-screen number pad — no mobile keyboard needed.
- `笔记` toggles pencil-mark mode; `擦除` clears a cell; `撤回` steps back.
- Conflicts are flagged in red; a fully-placed digit dims on the pad.
- Keyboard: arrows move, `1`–`9` fill, `Backspace`/`0` erase, `n` toggles notes.

## Puzzle data

`puzzles.js` holds 1,000 puzzles (200 per difficulty) sampled from
[radcliffe/3-million-sudoku-puzzles-with-ratings](https://www.kaggle.com/datasets/radcliffe/3-million-sudoku-puzzles-with-ratings)
on Kaggle, bucketed by the dataset's difficulty rating.
