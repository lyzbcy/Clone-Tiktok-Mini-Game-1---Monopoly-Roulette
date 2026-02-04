
// --- 1. Audio Engine ---
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioCtx();

function playTone(freq, type = 'sine', dur = 0.1, vol = 0.1) {
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.index = freq;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
}

function sfxRoll() { playTone(200 + Math.random() * 100, 'square', 0.05, 0.05); }
function sfxStep() { playTone(600, 'sine', 0.05, 0.05); }
function sfxWin() {
    [523, 659, 783, 1046].forEach((f, i) => setTimeout(() => playTone(f, 'triangle', 0.3, 0.2), i * 80));
}
function sfxLose() {
    [400, 350, 300].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.4, 0.2), i * 150));
}

// --- 2. Board Data & Layout ---
// 26 Cells Loop.
// Data format: { id: DisplayNumber, val: PrizeAmount, [trap: true] }
const CELLS = [
    { id: 10, val: 1000 }, { id: 17, val: 400 }, { id: 12, val: 1200 }, { id: 15, val: 200 },
    { id: 14, val: 1000, start: true }, // Index 4: START
    { id: 13, val: 600 }, { id: 16, val: 1200 }, { id: 11, val: 200 }, { id: 18, val: 1000 },

    { id: 9, val: 500 }, { id: 20, val: 1400 }, { id: 7, val: 100 }, { id: 22, val: 1000 }, // Right Side

    { id: 5, val: 400 }, { id: 24, val: 1400 }, { id: 29, val: 300 }, { id: 26, val: 1200 },
    { id: 27, val: -580, trap: true }, // Index 17: TRAP
    { id: 28, val: 1600 }, { id: 25, val: 300 }, { id: 30, val: 6000 }, { id: 23, val: 200 },

    { id: 6, val: 1400 }, { id: 21, val: 300 }, { id: 8, val: 1200 }, { id: 19, val: 300 } // Left Side
];

// Grid Mapping (9 columns x 6 rows)
const GRID_MAP = [
    // Top Row (0-8)
    { r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 1, c: 5 }, { r: 1, c: 6 }, { r: 1, c: 7 }, { r: 1, c: 8 }, { r: 1, c: 9 },
    // Right Col (9-12)
    { r: 2, c: 9 }, { r: 3, c: 9 }, { r: 4, c: 9 }, { r: 5, c: 9 },
    // Bottom Row (13-21) -> In reverse order visually R->L? No, sequence continues
    { r: 6, c: 9 }, { r: 6, c: 8 }, { r: 6, c: 7 }, { r: 6, c: 6 }, { r: 6, c: 5 }, { r: 6, c: 4 }, { r: 6, c: 3 }, { r: 6, c: 2 }, { r: 6, c: 1 },
    // Left Col (22-25) -> B->T
    { r: 5, c: 1 }, { r: 4, c: 1 }, { r: 3, c: 1 }, { r: 2, c: 1 }
];

let state = {
    balance: 10000,
    currIdx: 4, // Start at 14
    dir: 0,
    rolling: false
};

// --- 3. Initialization ---
function init() {
    const board = document.getElementById('game-board');
    // Clear board first if re-initializing (though usually just runs once)
    // Actually we append cells, so we should ensure we don't duplicate if called multiple times, 
    // but here it runs once on load.

    CELLS.forEach((cell, i) => {
        const div = document.createElement('div');
        div.className = 'cell ' + (cell.trap ? 'trap' : '');
        div.id = 'cell-' + i;

        // Grid Position
        const pos = GRID_MAP[i];
        div.style.gridRow = pos.r;
        div.style.gridColumn = pos.c;

        // Content
        div.innerHTML = `
            <div class="cell-id">${cell.id}</div>
            <div class="cell-val">¥${cell.val}</div>
        `;

        if (cell.start) {
            const arrow = document.createElement('div');
            arrow.className = 'start-indicator';
            arrow.innerHTML = '🔻';
            div.appendChild(arrow);

            // Add Token
            const token = document.createElement('div');
            token.className = 'token';
            token.id = 'player-token';
            token.style.display = 'block';
            div.appendChild(token);
        }

        board.appendChild(div);
    });
}

// --- 4. Game Logic ---
function setDirection(d) {
    if (state.rolling) return;
    state.dir = d;

    // UI Toggle
    document.querySelector('.btn-cw').classList.toggle('active', d === 1);
    document.querySelector('.btn-ccw').classList.toggle('active', d === -1);

    document.getElementById('msg').innerText = d === 1 ? '顺时针 - 准备就绪' : '逆时针 - 准备就绪';
    document.getElementById('dice-area').style.display = 'flex';
}

function roll() {
    if (state.balance < 100) return alert('没钱啦！');
    if (state.rolling) return;

    state.rolling = true;
    state.balance -= 100;
    document.getElementById('score').innerText = state.balance;

    const diceEls = [1, 2, 3, 4, 5].map(i => document.getElementById('d' + i));
    diceEls.forEach(d => d.classList.add('shaking'));

    let count = 0;
    const rollInt = setInterval(() => {
        diceEls.forEach(d => d.innerText = Math.floor(Math.random() * 6) + 1);
        sfxRoll();
        count++;
        if (count > 15) {
            clearInterval(rollInt);
            diceEls.forEach(d => d.classList.remove('shaking'));
            finalizeSteps(diceEls);
        }
    }, 100);
}

// Validates and returns result without visual effects
function calculateRoundResult(currentIdx, direction) {
    // Logic: prefer landing on <= 300 prize OR trap
    const possibleSums = [];
    for (let s = 5; s <= 30; s++) possibleSums.push(s);

    // Find "Bad" sums from current position
    const badSums = possibleSums.filter(s => {
        let dest = currentIdx + (s * direction);
        // Wrap logic
        const len = CELLS.length;
        dest = ((dest % len) + len) % len;
        const prize = CELLS[dest].val;
        return prize <= 300 || prize === -580;
    });

    let finalSum;
    const isRigged = Math.random() < 0.8; // 80% scam rate

    if (isRigged && badSums.length > 0) {
        // Pick random bad sum
        // Prefer Gaussian-ish values (15-20) if available in bad list to look real
        const midBad = badSums.filter(s => s >= 15 && s <= 20);
        if (midBad.length > 0) finalSum = midBad[Math.floor(Math.random() * midBad.length)];
        else finalSum = badSums[Math.floor(Math.random() * badSums.length)];
    } else {
        // True random
        finalSum = 0;
        for (let i = 0; i < 5; i++) finalSum += Math.floor(Math.random() * 6) + 1;
    }

    // Calculate final destination info
    const len = CELLS.length;
    const finalIdx = ((currentIdx + (finalSum * direction)) % len + len) % len;
    const prize = CELLS[finalIdx].val;

    return { sum: finalSum, idx: finalIdx, prize: prize };
}

function finalizeSteps(diceEls) {
    // Get Result
    const res = calculateRoundResult(state.currIdx, state.dir);
    const finalSum = res.sum;

    // Distribute sum to dice visual
    let remain = finalSum - 5;
    let vals = [1, 1, 1, 1, 1];
    while (remain > 0) {
        let r = Math.floor(Math.random() * 5);
        if (vals[r] < 6) {
            vals[r]++;
            remain--;
        }
    }

    diceEls.forEach((d, i) => d.innerText = vals[i]);

    document.getElementById('msg').innerText = `总点数: ${finalSum} - 前进中...`;
    moveToken(finalSum);
}

function moveToken(steps) {
    const token = document.getElementById('player-token');
    let stepCount = 0;

    const stepInt = setInterval(() => {
        // Hide token from old cell
        token.style.display = 'none';

        // Update Index
        const len = CELLS.length;
        state.currIdx = ((state.currIdx + state.dir) % len + len) % len;

        // Show token in new cell
        const newCell = document.getElementById('cell-' + state.currIdx);
        newCell.appendChild(token);
        token.style.display = 'block';

        // Visual Highlight
        newCell.classList.add('active-step');
        setTimeout(() => newCell.classList.remove('active-step'), 300);

        sfxStep();
        stepCount++;

        if (stepCount >= steps) {
            clearInterval(stepInt);
            settle();
        }
    }, 250);
}

function settle() {
    state.rolling = false;
    const cell = CELLS[state.currIdx];
    const val = cell.val;

    setTimeout(() => {
        const modal = document.getElementById('result-modal');
        const title = document.getElementById('res-title');
        const disp = document.getElementById('res-val');

        if (val > 0) {
            title.innerText = val >= 1000 ? "🎉 发财了！" : "😃 中奖！";
            title.className = "win-title";
            state.balance += val;
            sfxWin();
        } else {
            title.innerText = "😭 哎呀！";
            title.className = "lose-title";
            state.balance += val; // adds negative
            sfxLose();
        }

        document.getElementById('score').innerText = state.balance;
        disp.innerText = (val >= 0 ? "+" : "") + val;
        modal.style.display = 'flex';
    }, 500);
}

function reset() {
    document.getElementById('result-modal').style.display = 'none';
    document.getElementById('dice-area').style.display = 'none';
    document.querySelector('.btn-cw').classList.remove('active');
    document.querySelector('.btn-ccw').classList.remove('active');
    document.getElementById('msg').innerText = '请选择前进方向';

    // Reset to Start (Index 4)
    const token = document.getElementById('player-token');
    if (token) token.style.display = 'none';

    state.currIdx = 4;
    const startNode = document.getElementById('cell-4');
    if (startNode) {
        startNode.appendChild(token);
        token.style.display = 'block';
    }
}

// --- Stats / Calc ---
function openStats() {
    document.getElementById('stats-modal').style.display = 'flex';
}

function runSimulation() {
    const count = parseInt(document.getElementById('sim-count').value);
    const strat = document.getElementById('sim-strategy').value;

    let simIdx = 4; // Always start sim from base
    let wins = 0;
    let revenue = 0;
    const cost = count * 100;

    for (let i = 0; i < count; i++) {
        let dir = 1;
        if (strat === 'ccw') dir = -1;
        else if (strat === 'random') dir = Math.random() > 0.5 ? 1 : -1;

        // We use the separated logic function
        const res = calculateRoundResult(simIdx, dir);

        // Update Sim Position (Simulates continuous play)
        simIdx = res.idx;

        // Result
        if (res.prize > 0) revenue += res.prize;
        else if (res.prize < 0) revenue += res.prize; // prize can be negative (-580)
    }

    const net = revenue - cost;
    const roi = ((net / cost) * 100).toFixed(1);

    document.getElementById('stat-count').innerText = count;
    document.getElementById('stat-cost').innerText = '¥' + cost;
    document.getElementById('stat-revenue').innerText = '¥' + revenue;

    const profitEl = document.getElementById('stat-profit');
    profitEl.innerText = (net >= 0 ? '+' : '') + '¥' + net;
    profitEl.className = 'stats-profit ' + (net >= 0 ? 'plus' : 'minus');

    document.getElementById('stat-roi').innerText = roi + '%';
    document.getElementById('sim-results').style.display = 'block';
}

// Run
init();
