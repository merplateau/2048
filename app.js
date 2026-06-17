(function () {
'use strict';

const MODE_KEY = 'app-mode';
const switchEl = document.getElementById('mode-switch');
const view2048 = document.getElementById('view-2048');
const viewSudoku = document.getElementById('view-sudoku');

let mode = 'g2048';
try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'sudoku' || saved === 'g2048') mode = saved;
} catch (e) {
    /* ignore */
}

function setMode(next) {
    mode = next;
    view2048.classList.toggle('hidden', next !== 'g2048');
    viewSudoku.classList.toggle('hidden', next !== 'sudoku');
    for (const b of switchEl.children) {
        b.classList.toggle('active', b.dataset.mode === next);
    }
    try {
        localStorage.setItem(MODE_KEY, next);
    } catch (e) {
        /* ignore */
    }
    const game = next === 'sudoku' ? window.Sudoku : window.Game2048;
    if (game && game.activate) game.activate();
}

switchEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (btn) setMode(btn.dataset.mode);
});

document.addEventListener('keydown', (e) => {
    const game = mode === 'sudoku' ? window.Sudoku : window.Game2048;
    if (game && game.handleKey) game.handleKey(e);
});

setMode(mode);
})();
