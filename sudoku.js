(function () {
'use strict';

const STORAGE_KEY = 'sudoku-state';
const SETTINGS_KEY = 'sudoku-settings';
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
const settingsBtn = document.getElementById('sudoku-settings');
const settingsModal = document.getElementById('settings');
const settingsDone = document.getElementById('settings-done');
const optLock = document.getElementById('opt-lock');
const optDead = document.getElementById('opt-dead');
const optItalic = document.getElementById('opt-italic');
const switchModal = document.getElementById('switch-modal');
const switchDesc = document.getElementById('switch-desc');
const optSave = document.getElementById('opt-save');
const switchConfirm = document.getElementById('switch-confirm');
const switchCancel = document.getElementById('switch-cancel');
const newModal = document.getElementById('snew-modal');
const newConfirm = document.getElementById('snew-confirm');
const newCancel = document.getElementById('snew-cancel');

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
let settings = { lockHint: false, markDead: false, italicClues: false };
let settingsOpen = false;
let games = {};            // saved game per level key
let pendingLevel = null;   // target level awaiting switch confirmation
let switchOpen = false;
let newOpen = false;       // new-game confirmation open

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
            if (lv.key === level) {
                markActiveLevel();
                return;
            }
            requestSwitch(lv.key);
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
    root.style.setProperty('--lock-size', Math.round(cell * 0.52) + 'px');
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

// digits already used in each row / col / box, for candidate calculation
function usedDigits() {
    const rows = Array.from({ length: 9 }, () => new Set());
    const cols = Array.from({ length: 9 }, () => new Set());
    const boxes = Array.from({ length: 9 }, () => new Set());
    for (let i = 0; i < N; i++) {
        if (!values[i]) continue;
        rows[rowOf(i)].add(values[i]);
        cols[colOf(i)].add(values[i]);
        boxes[boxOf(i)].add(values[i]);
    }
    return { rows, cols, boxes };
}

function canPlace(i, d, used) {
    return !used.rows[rowOf(i)].has(d) && !used.cols[colOf(i)].has(d) && !used.boxes[boxOf(i)].has(d);
}

function candidateCount(i, used) {
    let c = 0;
    for (let d = 1; d <= 9; d++) if (canPlace(i, d, used)) c++;
    return c;
}

/* ---------- render ---------- */

function render() {
    const bad = conflictSet();
    const selVal = selected >= 0 ? values[selected] : 0;
    const used = usedDigits();

    for (let i = 0; i < N; i++) {
        const el = cellEls[i];
        let cls = el.dataset.base;
        if (given[i]) cls += ' given';
        if (selected >= 0 && i !== selected && arePeers(i, selected)) cls += ' peer';
        if (selVal && values[i] === selVal) cls += ' same';
        if (i === selected) cls += ' sel';
        if (bad.has(i)) cls += ' conflict';
        // candidate-based hints on empty cells (recomputed every render)
        if ((settings.lockHint || settings.markDead) && !values[i] && !given[i]) {
            const n = candidateCount(i, used);
            if (settings.markDead && n === 0) cls += ' dead';
            else if (settings.lockHint && n === 1) cls += ' lock1';
            else if (settings.lockHint && n === 2) cls += ' lock2';
            else if (settings.lockHint && n === 3) cls += ' lock3';
        }
        el.className = cls;

        if (values[i]) {
            el.innerHTML = '<span class="val">' + values[i] + '</span>';
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

    // dim digits that are fully placed, and (for the selected empty cell)
    // gray out digits that can't legally go there — still tappable, just a hint
    const selEmpty = selected >= 0 && !values[selected] && !given[selected];
    for (const b of padEl.children) {
        const d = Number(b.dataset.d);
        b.classList.toggle('done', countDigit(d) >= 9);
        b.classList.toggle('blocked', selEmpty && !canPlace(selected, d, used));
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
    // keep this cell's pencil marks so erasing the digit restores them
    render();
    save();
    checkWin();
}

function erase() {
    if (selected < 0 || given[selected] || solved) return;
    if (values[selected]) {
        // remove the digit first — any kept pencil marks reappear
        snapshot();
        values[selected] = 0;
    } else if (notes[selected].length) {
        snapshot();
        notes[selected] = [];
    } else {
        return;
    }
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
    if (settingsOpen || switchOpen || newOpen) {
        if (k === 'Escape') {
            e.preventDefault();
            if (settingsOpen) closeSettings();
            else if (switchOpen) closeSwitch();
            else closeNewConfirm();
        }
        return;
    }
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

function gameState() {
    return { solution, given, values, notes, selected, notesMode, solved };
}

function save() {
    games[level] = gameState();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, games }));
    } catch (e) {
        /* ignore */
    }
}

function showSolvedOverlay() {
    if (solved) {
        const lv = LEVELS.find((l) => l.key === level);
        overlayText.textContent = '完成 · ' + (lv ? lv.name : '');
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function loadGame(s) {
    solution = s.solution || '';
    given = s.given;
    values = s.values;
    notes = Array.isArray(s.notes) ? s.notes.map((a) => (Array.isArray(a) ? a : [])) : Array.from({ length: N }, () => []);
    selected = typeof s.selected === 'number' ? s.selected : -1;
    notesMode = !!s.notesMode;
    solved = !!s.solved;
    history = [];
    showSolvedOverlay();
}

function validGame(s) {
    return s && Array.isArray(s.values) && s.values.length === N;
}

function restore() {
    let s = null;
    try {
        s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
        s = null;
    }
    if (!s) return false;

    // current per-level format
    if (s.games && typeof s.games === 'object') {
        games = {};
        for (const k in s.games) if (validGame(s.games[k])) games[k] = s.games[k];
        let lv = s.level && games[s.level] ? s.level : null;
        if (!lv) {
            const first = LEVELS.find((l) => games[l.key]);
            lv = first ? first.key : null;
        }
        if (lv) {
            level = lv;
            loadGame(games[lv]);
            return true;
        }
        return false;
    }

    // legacy flat format -> migrate
    if (validGame(s)) {
        level = s.level || DEFAULT_LEVEL;
        games = {};
        games[level] = {
            solution: s.solution,
            given: s.given,
            values: s.values,
            notes: s.notes,
            selected: s.selected,
            notesMode: s.notesMode,
            solved: s.solved,
        };
        loadGame(games[level]);
        return true;
    }
    return false;
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

/* ---------- difficulty switching (with confirmation) ---------- */

function requestSwitch(targetKey) {
    pendingLevel = targetKey;
    const lv = LEVELS.find((l) => l.key === targetKey);
    const hasSaved = !!games[targetKey];
    switchDesc.textContent =
        '切换到「' + (lv ? lv.name : '') + '」' + (hasSaved ? ' · 将进入上次的对局' : ' · 将开始新对局');
    optSave.checked = true;
    switchOpen = true;
    switchModal.classList.remove('hidden');
}

function confirmSwitch() {
    const target = pendingLevel;
    closeSwitch();
    if (!target || target === level) return;

    if (optSave.checked) games[level] = gameState();
    else delete games[level];

    if (games[target]) {
        level = target;
        loadGame(games[target]);
        save();
        render();
    } else {
        newPuzzle(target);
    }
}

function closeSwitch() {
    switchOpen = false;
    pendingLevel = null;
    switchModal.classList.add('hidden');
}

function openNewConfirm() {
    newOpen = true;
    newModal.classList.remove('hidden');
}

function closeNewConfirm() {
    newOpen = false;
    newModal.classList.add('hidden');
}

/* ---------- settings ---------- */

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (s) settings = { lockHint: !!s.lockHint, markDead: !!s.markDead, italicClues: !!s.italicClues };
    } catch (e) {
        /* ignore */
    }
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        /* ignore */
    }
}

function applySettings() {
    optLock.checked = settings.lockHint;
    optDead.checked = settings.markDead;
    optItalic.checked = settings.italicClues;
    boardEl.classList.toggle('italic-clues', settings.italicClues);
}

function openSettings() {
    settingsOpen = true;
    settingsModal.classList.remove('hidden');
}

function closeSettings() {
    settingsOpen = false;
    settingsModal.classList.add('hidden');
}

/* ---------- wiring ---------- */

buildBoard();
buildPad();
buildDifficulty();

newBtn.addEventListener('click', openNewConfirm);
newConfirm.addEventListener('click', () => {
    closeNewConfirm();
    newPuzzle(level);
});
newCancel.addEventListener('click', closeNewConfirm);
newModal.addEventListener('click', (e) => {
    if (e.target === newModal) closeNewConfirm();
});
undoBtn.addEventListener('click', undo);
eraseBtn.addEventListener('click', erase);
notesBtn.addEventListener('click', toggleNotes);
overlayBtn.addEventListener('click', () => newPuzzle(level));

settingsBtn.addEventListener('click', openSettings);
settingsDone.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings();
});
optLock.addEventListener('change', () => {
    settings.lockHint = optLock.checked;
    saveSettings();
    render();
});
optDead.addEventListener('change', () => {
    settings.markDead = optDead.checked;
    saveSettings();
    render();
});
optItalic.addEventListener('change', () => {
    settings.italicClues = optItalic.checked;
    saveSettings();
    applySettings();
});

switchConfirm.addEventListener('click', confirmSwitch);
switchCancel.addEventListener('click', closeSwitch);
switchModal.addEventListener('click', (e) => {
    if (e.target === switchModal) closeSwitch();
});

window.addEventListener('resize', layout);

loadSettings();
applySettings();
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
