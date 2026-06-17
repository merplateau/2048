(function () {
'use strict';

const SIZE = 4;
const STORAGE_KEY = '2048-state';
const VEC = {
    up: { r: -1, c: 0 },
    right: { r: 0, c: 1 },
    down: { r: 1, c: 0 },
    left: { r: 0, c: -1 },
};

const root = document.documentElement;
const gridLayer = document.getElementById('grid');
const tilesLayer = document.getElementById('tiles');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const undoBtn = document.getElementById('undo-btn');
const newBtn = document.getElementById('new-btn');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const overlayBtn = document.getElementById('overlay-btn');

let grid;            // SIZE x SIZE of tile | null
let tilesToRemove;   // tiles that merged away, kept for one slide then removed
let elements;        // Map<id, HTMLElement>
let idCounter;
let score;
let best;
let history;         // [{ cells, score }]
let overlayMode;     // null | 'won' | 'over'
let keepPlaying;
let STEP = 0;        // tile size + gap, in px
let TILE = 0;        // tile size in px

/* ---------- grid helpers ---------- */

function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function eachTile(fn) {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (grid[r][c]) fn(grid[r][c]);
        }
    }
}

function emptyCells() {
    const out = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (!grid[r][c]) out.push({ r, c });
        }
    }
    return out;
}

function cellsToValues() {
    return grid.map((row) => row.map((t) => (t ? t.value : 0)));
}

function addRandomTile() {
    const cells = emptyCells();
    if (!cells.length) return;
    const { r, c } = cells[Math.floor(Math.random() * cells.length)];
    // standard 2048: 90% spawn a 2, 10% spawn a 4
    const value = Math.random() < 0.9 ? 2 : 4;
    grid[r][c] = { id: idCounter++, value, row: r, col: c, isNew: true, merged: false };
}

/* ---------- build the static background grid ---------- */

function buildGridCells() {
    gridLayer.innerHTML = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        gridLayer.appendChild(cell);
    }
}

/* ---------- layout / sizing ---------- */

function layout() {
    const max = 460;
    const size = Math.min(max, document.documentElement.clientWidth - 32);
    const gap = size < 360 ? 8 : 12;
    const tile = (size - 5 * gap) / 4;
    root.style.setProperty('--board-size', size + 'px');
    root.style.setProperty('--gap', gap + 'px');
    root.style.setProperty('--tile-size', tile + 'px');
    STEP = tile + gap;
    TILE = tile;
    render();
}

/* ---------- rendering ---------- */

function createEl(id) {
    const el = document.createElement('div');
    el.className = 'tile';
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    el.appendChild(inner);
    tilesLayer.appendChild(el);
    elements.set(id, el);
    return el;
}

function fontFor(value) {
    const digits = String(value).length;
    const ratio = digits >= 5 ? 0.26 : digits === 4 ? 0.32 : digits === 3 ? 0.4 : 0.48;
    return Math.round(TILE * ratio);
}

function renderTile(t, seen, removing) {
    let el = elements.get(t.id);
    const fresh = !el;
    if (fresh) el = createEl(t.id);
    el.style.transform = `translate(${t.col * STEP}px, ${t.row * STEP}px)`;
    if (!removing) {
        el.dataset.v = t.value;
        el.dataset.big = t.value > 2048 ? '1' : '0';
        const inner = el.firstChild;
        inner.textContent = t.value;
        el.style.fontSize = fontFor(t.value) + 'px';
        el.classList.remove('new', 'merged');
        if (t.isNew || t.merged) {
            void el.offsetWidth; // restart animation
            if (t.isNew) el.classList.add('new');
            if (t.merged) el.classList.add('merged');
        }
    }
    seen.add(t.id);
}

function render() {
    const seen = new Set();
    eachTile((t) => renderTile(t, seen, false));
    tilesToRemove.forEach((t) => renderTile(t, seen, true));
    for (const [id, el] of elements) {
        if (!seen.has(id)) {
            el.remove();
            elements.delete(id);
        }
    }
    const captured = tilesToRemove.slice();
    if (captured.length) {
        setTimeout(() => {
            captured.forEach((t) => {
                const el = elements.get(t.id);
                if (el) {
                    el.remove();
                    elements.delete(t.id);
                }
            });
        }, 150);
    }
    scoreEl.textContent = score;
    bestEl.textContent = best;
}

/* ---------- moving ---------- */

function order(dir) {
    let rows = [0, 1, 2, 3];
    let cols = [0, 1, 2, 3];
    if (dir === 'down') rows = [3, 2, 1, 0];
    if (dir === 'right') cols = [3, 2, 1, 0];
    return { rows, cols };
}

function move(dir) {
    if (overlayMode) return;
    const vec = VEC[dir];
    const { rows, cols } = order(dir);
    const before = { cells: cellsToValues(), score };
    tilesToRemove = [];
    eachTile((t) => {
        t.isNew = false;
        t.merged = false;
    });

    let moved = false;
    for (const r of rows) {
        for (const c of cols) {
            const tile = grid[r][c];
            if (!tile) continue;
            let nr = r;
            let nc = c;
            // slide across empty cells
            while (true) {
                const tr = nr + vec.r;
                const tc = nc + vec.c;
                if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE || grid[tr][tc]) break;
                nr = tr;
                nc = tc;
            }
            // check the blocking tile for a merge
            const br = nr + vec.r;
            const bc = nc + vec.c;
            const blocker = br >= 0 && br < SIZE && bc >= 0 && bc < SIZE ? grid[br][bc] : null;
            if (blocker && blocker.value === tile.value && !blocker.merged) {
                grid[r][c] = null;
                tile.row = br;
                tile.col = bc;
                tilesToRemove.push(tile);
                blocker.value *= 2;
                blocker.merged = true;
                score += blocker.value;
                moved = true;
            } else if (nr !== r || nc !== c) {
                grid[r][c] = null;
                grid[nr][nc] = tile;
                tile.row = nr;
                tile.col = nc;
                moved = true;
            }
        }
    }

    if (!moved) {
        tilesToRemove = [];
        return;
    }

    history.push(before);
    if (history.length > 100) history.shift();
    addRandomTile();
    if (score > best) best = score;
    render();
    save();
    updateStatus();
    updateButtons();
}

/* ---------- status / win / lose ---------- */

function hasMoves() {
    if (emptyCells().length) return true;
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const v = grid[r][c].value;
            if (r + 1 < SIZE && grid[r + 1][c].value === v) return true;
            if (c + 1 < SIZE && grid[r][c + 1].value === v) return true;
        }
    }
    return false;
}

function reached2048() {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (grid[r][c] && grid[r][c].value >= 2048) return true;
        }
    }
    return false;
}

function showOverlay(mode, text, btnLabel) {
    overlayMode = mode;
    overlayText.textContent = text;
    overlayBtn.textContent = btnLabel;
    overlay.classList.remove('hidden');
}

function hideOverlay() {
    overlayMode = null;
    overlay.classList.add('hidden');
}

function updateStatus() {
    if (!keepPlaying && reached2048()) {
        showOverlay('won', '到达 2048', '继续');
        return;
    }
    if (!hasMoves()) {
        showOverlay('over', '游戏结束', '再来一局');
    }
}

function updateButtons() {
    // undo stays available even after the game is over
    undoBtn.disabled = history.length === 0;
}

/* ---------- persistence ---------- */

function save() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                cells: cellsToValues(),
                score,
                best,
                history,
                keepPlaying,
            })
        );
    } catch (e) {
        /* storage unavailable — ignore */
    }
}

function loadCellsInto(values) {
    grid = emptyGrid();
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const v = values[r][c];
            if (v) grid[r][c] = { id: idCounter++, value: v, row: r, col: c, isNew: false, merged: false };
        }
    }
}

function restore() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
        saved = null;
    }
    if (!saved || !Array.isArray(saved.cells)) return false;
    idCounter = 1;
    loadCellsInto(saved.cells);
    score = saved.score || 0;
    best = saved.best || 0;
    history = Array.isArray(saved.history) ? saved.history : [];
    keepPlaying = !!saved.keepPlaying;
    tilesToRemove = [];
    return true;
}

/* ---------- game flow ---------- */

function clearTiles() {
    for (const [, el] of elements) el.remove();
    elements.clear();
}

function newGame() {
    clearTiles();
    grid = emptyGrid();
    idCounter = 1;
    score = 0;
    history = [];
    tilesToRemove = [];
    keepPlaying = false;
    hideOverlay();
    addRandomTile();
    addRandomTile();
    render();
    save();
    updateButtons();
}

function undo() {
    if (!history.length) return;
    const prev = history.pop();
    clearTiles();
    loadCellsInto(prev.cells);
    score = prev.score;
    tilesToRemove = [];
    hideOverlay();
    render();
    save();
    updateButtons();
}

/* ---------- input ---------- */

const KEYS = {
    ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left',
    w: 'up', d: 'right', s: 'down', a: 'left',
    W: 'up', D: 'right', S: 'down', A: 'left',
};

function handleKey(e) {
    const dir = KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
}

const board = document.getElementById('board');
let touchX = 0;
let touchY = 0;
let touching = false;

board.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touching = true;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
}, { passive: true });

board.addEventListener('touchmove', (e) => {
    if (touching) e.preventDefault();
}, { passive: false });

board.addEventListener('touchend', (e) => {
    if (!touching) return;
    touching = false;
    const t = e.changedTouches[0];
    handleSwipe(t.clientX - touchX, t.clientY - touchY);
});

// pointer (mouse / trackpad drag) as a desktop convenience
let downX = 0;
let downY = 0;
let dragging = false;
board.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    dragging = true;
    downX = e.clientX;
    downY = e.clientY;
});
board.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    handleSwipe(e.clientX - downX, e.clientY - downY);
});

function handleSwipe(dx, dy) {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 24) return;
    if (absX > absY) {
        move(dx > 0 ? 'right' : 'left');
    } else {
        move(dy > 0 ? 'down' : 'up');
    }
}

undoBtn.addEventListener('click', undo);
newBtn.addEventListener('click', newGame);
overlayBtn.addEventListener('click', () => {
    if (overlayMode === 'won') {
        keepPlaying = true;
        hideOverlay();
        save();
        updateButtons();
    } else {
        newGame();
    }
});

window.addEventListener('resize', layout);

/* ---------- boot ---------- */

elements = new Map();
buildGridCells();
if (!restore()) {
    grid = emptyGrid();
    idCounter = 1;
    score = 0;
    best = 0;
    history = [];
    tilesToRemove = [];
    keepPlaying = false;
    addRandomTile();
    addRandomTile();
}
layout();
updateButtons();
// restore the win/lose overlay if the saved game was already finished
updateStatus();

window.Game2048 = {
    handleKey,
    activate: layout,
};
})();
