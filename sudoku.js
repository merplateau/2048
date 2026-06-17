(function () {
'use strict';

const STORAGE_KEY = 'sudoku-state';
const N = 81;

const root = document.documentElement;
const boardEl = document.getElementById('sboard');
const padEl = document.getElementById('pad');
const diffEl = document.getElementById('difficulty');
const newBtn = document.getElementById('sudoku-new');
const undoBtn = document.getElementById('s-undo');
const eraseBtn = document.getElementById('s-erase');
const notesBtn = document.getElementById('s-notes');
const overlay = document.getElementById('soverlay');
const overlayText = document.getElementById('soverlay-text');
const overlayBtn = document.getElementById('soverlay-btn');

const LEVELS = (window.SUDOKU_PUZZLES && window.SUDOKU_PUZZLES.levels) || [];
const DEFAULT_LEVEL = 'easy';

let values;       // Int array length 81, 0 = empty
let given;        // bool length 81 — original clues, not editable
let solution;     // 81-char solution string
let notes;        // array length 81 of arrays of digits
let selected;     // index 0..80 or -1
let notesMode;    // pencil-mark mode
let level;        // current level key
let solved;
let history;      // [{ values, notes }]
let cellEls = [];

/* ---------- index helpers ---------- */

const rowOf = (i) => Math.floor(i / 9);
const colOf = (i) => i % 9;
const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

function arePeers(a, b) {
    if (a === b) return false;
    return rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b);
}

/* ---------- build static board / pad / difficulty ---------- */

function buildBoard() {
    for (let i = 0; i < N; i++) {
        const el = document.createElement('div');
        const r = rowOf(i);
        const c = colOf(i);
        let cls = 'scell';
        if (c % 3 === 2 && c < 8) cls += ' tr';
        if (r % 3 === 2 && r < 8) cls += ' tb';
        if (c === 8) cls += ' nr';
        if (r === 8) cls += ' nb';
        el.className = cls;
        el.dataset.base = cls;
        el.addEventListener('click', () => selectCell(i));
        boardEl.appendChild(el);
        cellEls.push(el);
    }
}

function buildPad() {
    for (let d = 1; d <= 9; d++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = d;
        b.dataset.d = d;
        b.addEventListener('click', () => inputDigit(d));
        padEl.appendChild(b);
    }
}

function buildDifficulty() {
    LEVELS.forEach((lv) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = lv.name;
        b.dataset.level = lv.key;
        b.addEventListener('click', () => {
            if (lv.key !== level || solved) newPuzzle(lv.key);
            else markActiveLevel();
        });
        diffEl.appendChild(b);
    });
}

function markActiveLevel() {
    for (const b of diffEl.children) {
        b.classList.toggle('active', b.dataset.level === level);
    }
}

/* ---------- layout ---------- */

function layout() {
    const size = Math.min(460, document.documentElement.clientWidth - 32);
    const cell = size / 9;
    root.style.setProperty('--sboard-size', size + 'px');
    root.style.setProperty('--sval-size', Math.round(cell * 0.5) + 'px');
    root.style.setProperty('--snote-size', Math.max(8, Math.round(cell * 0.21)) + 'px');
}

/* ---------- conflicts ---------- */

function conflictSet() {
    const bad = new Set();
    for (let i = 0; i < N; i++) {
        if (!values[i]) continue;
        for (let j = i + 1; j < N; j++) {
            if (values[j] === values[i] && arePeers(i, j)) {
                bad.add(i);
                bad.add(j);
            }
        }
    }
    return bad;
}

function countDigit(d) {
    let n = 0;
    for (let i = 0; i < N; i++) if (values[i] === d) n++;
    return n;
}

/* ---------- render ---------- */

function render() {
    const bad = conflictSet();
    const selVal = selected >= 0 ? values[selected] : 0;

    for (let i = 0; i < N; i++) {
        const el = cellEls[i];
        let cls = el.dataset.base;
        if (given[i]) cls += ' given';
        if (selected >= 0 && i !== selected && arePeers(i, selected)) cls += ' peer';
        if (selVal && values[i] === selVal) cls += ' same';
        if (i === selected) cls += ' sel';
        if (bad.has(i)) cls += ' conflict';
        el.className = cls;

        if (values[i]) {
            el.textContent = values[i];
        } else if (notes[i] && notes[i].length) {
            const set = notes[i];
            let html = '<div class="notes">';
            for (let d = 1; d <= 9; d++) html += '<span>' + (set.includes(d) ? d : '') + '</span>';
            html += '</div>';
            el.innerHTML = html;
        } else {
            el.textContent = '';
        }
    }

    // dim digits that are fully placed
    for (const b of padEl.children) {
        b.classList.toggle('done', countDigit(Number(b.dataset.d)) >= 9);
    }

    notesBtn.classList.toggle('active', notesMode);
    undoBtn.disabled = history.length === 0;
    markActiveLevel();
}

/* ---------- input ---------- */

function selectCell(i) {
    selected = i;
    render();
    save();
}

function snapshot() {
    history.push({
        values: values.slice(),
        notes: notes.map((a) => a.slice()),
    });
    if (history.length > 200) history.shift();
}

function inputDigit(d) {
    if (selected < 0 || given[selected] || solved) return;

    if (notesMode) {
        if (values[selected]) return; // can't note a filled cell
        snapshot();
        const set = notes[selected];
        const idx = set.indexOf(d);
        if (idx >= 0) set.splice(idx, 1);
        else set.push(d);
        render();
        save();
        return;
    }

    if (values[selected] === d) return; // no change
    snapshot();
    values[selected] = d;
    notes[selected] = [];
    // auto-remove this digit from peers' pencil marks
    for (let j = 0; j < N; j++) {
        if (arePeers(selected, j) && notes[j].length) {
            const k = notes[j].indexOf(d);
            if (k >= 0) notes[j].splice(k, 1);
        }
    }
    render();
    save();
    checkWin();
}

function erase() {
    if (selected < 0 || given[selected] || solved) return;
    if (!values[selected] && !notes[selected].length) return;
    snapshot();
    values[selected] = 0;
    notes[selected] = [];
    render();
    save();
}

function toggleNotes() {
    notesMode = !notesMode;
    render();
    save();
}

function moveSelection(dr, dc) {
    if (selected < 0) {
        selected = 0;
    } else {
        const r = Math.min(8, Math.max(0, rowOf(selected) + dr));
        const c = Math.min(8, Math.max(0, colOf(selected) + dc));
        selected = r * 9 + c;
    }
    render();
    save();
}

function handleKey(e) {
    const k = e.key;
    if (k >= '1' && k <= '9') {
        e.preventDefault();
        inputDigit(Number(k));
    } else if (k === 'Backspace' || k === 'Delete' || k === '0') {
        e.preventDefault();
        erase();
    } else if (k === 'ArrowUp') {
        e.preventDefault();
        moveSelection(-1, 0);
    } else if (k === 'ArrowDown') {
        e.preventDefault();
        moveSelection(1, 0);
    } else if (k === 'ArrowLeft') {
        e.preventDefault();
        moveSelection(0, -1);
    } else if (k === 'ArrowRight') {
        e.preventDefault();
        moveSelection(0, 1);
    } else if (k === 'n' || k === 'N') {
        e.preventDefault();
        toggleNotes();
    }
}

/* ---------- win ---------- */

function checkWin() {
    for (let i = 0; i < N; i++) if (!values[i]) return;
    if (conflictSet().size) return;
    solved = true;
    const lv = LEVELS.find((l) => l.key === level);
    overlayText.textContent = '完成 · ' + (lv ? lv.name : '');
    overlay.classList.remove('hidden');
    save();
}

/* ---------- persistence ---------- */

function save() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ level, solution, given, values, notes, selected, notesMode, solved })
        );
    } catch (e) {
        /* ignore */
    }
}

function restore() {
    let s = null;
    try {
        s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
        s = null;
    }
    if (!s || !Array.isArray(s.values) || s.values.length !== N) return false;
    level = s.level || DEFAULT_LEVEL;
    solution = s.solution || '';
    given = s.given;
    values = s.values;
    notes = Array.isArray(s.notes) ? s.notes.map((a) => (Array.isArray(a) ? a : [])) : Array.from({ length: N }, () => []);
    selected = typeof s.selected === 'number' ? s.selected : -1;
    notesMode = !!s.notesMode;
    solved = !!s.solved;
    history = [];
    if (solved) {
        const lv = LEVELS.find((l) => l.key === level);
        overlayText.textContent = '完成 · ' + (lv ? lv.name : '');
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
    return true;
}

/* ---------- new puzzle ---------- */

function newPuzzle(levelKey) {
    const lv = LEVELS.find((l) => l.key === levelKey) || LEVELS[0];
    if (!lv) return;
    level = lv.key;
    const item = lv.items[Math.floor(Math.random() * lv.items.length)];
    const puzzle = item.p;
    solution = item.s;
    values = new Array(N);
    given = new Array(N);
    notes = Array.from({ length: N }, () => []);
    for (let i = 0; i < N; i++) {
        const ch = puzzle[i];
        const isClue = ch >= '1' && ch <= '9';
        given[i] = isClue;
        values[i] = isClue ? Number(ch) : 0;
    }
    selected = values.indexOf(0);
    notesMode = false;
    solved = false;
    history = [];
    overlay.classList.add('hidden');
    render();
    save();
}

function undo() {
    if (!history.length) return;
    const prev = history.pop();
    values = prev.values;
    notes = prev.notes;
    solved = false;
    overlay.classList.add('hidden');
    render();
    save();
}

/* ---------- wiring ---------- */

buildBoard();
buildPad();
buildDifficulty();

newBtn.addEventListener('click', () => newPuzzle(level));
undoBtn.addEventListener('click', undo);
eraseBtn.addEventListener('click', erase);
notesBtn.addEventListener('click', toggleNotes);
overlayBtn.addEventListener('click', () => newPuzzle(level));
window.addEventListener('resize', layout);

if (!restore()) {
    newPuzzle(DEFAULT_LEVEL);
}
layout();
render();

window.Sudoku = {
    handleKey,
    activate: function () {
        layout();
        render();
    },
};
})();
