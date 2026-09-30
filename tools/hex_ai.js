'use strict';
/**
 * HEX — 기준 AI (엔트리 블록 AI 와 같은 알고리즘, 테스트·튜닝용)
 *
 * 1) 거리 지도: 한 변에서 각 칸까지 "더 놓아야 하는 돌 수"
 *    내 돌 0 · 빈 칸 1 · 상대 돌 막힘. 브리지(두 사이 칸이 빔)와 변 템플릿도 한 걸음으로 본다.
 *    모든 칸을 앞→뒤, 뒤→앞으로 훑는 것을 값이 바뀌지 않을 때까지 반복(엔트리에서는 1회 = 1프레임).
 * 2) 빈 칸 c 의 점수 = (내가 c 를 지나는 최단 거리) + (상대가 c 를 지나는 최단 거리) + 흔들기
 *    → 내 길을 넓히면서 상대 길을 막는 칸. 가장 작은 점수의 칸에 둔다.
 * 3) 규칙: 바로 이기는 칸 > 상대가 바로 이기는 칸 막기 > (어려움) 끊긴 브리지 잇기 > 점수
 */
const { geom } = require('./hex_geom');

const INF = 999;
const LEVELS = {
    1: { bridges: false, noise: 3, saveBridge: false }, // 쉬움
    2: { bridges: true, noise: 1, saveBridge: false }, // 보통
    3: { bridges: true, noise: 0.25, saveBridge: true, look: 5 }, // 어려움
};

const G = {};
function getGeom(N) {
    if (!G[N]) {
        G[N] = geom(N);
        G[N].sides = { 1: [G[N].side(1, 0), G[N].side(1, 1)], 2: [G[N].side(2, 0), G[N].side(2, 1)] };
    }
    return G[N];
}

/** board: 길이 N·N+1 배열(0번 미사용), 0 빈 칸 · 1 빨강 · 2 파랑 */
function distMap(board, N, p, s, bridges, stats) {
    const g = getGeom(N);
    const { onEdge, tpl } = g.sides[p][s];
    const cost = (i) => (board[i] === p ? 0 : board[i] === 0 ? 1 : INF);
    const d = new Array(N * N + 1).fill(INF);
    const relax = (c) => {
        const w = cost(c.i);
        if (w >= INF) {
            return false;
        }
        let best = INF;
        if (onEdge.has(c.i)) {
            best = 0;
        }
        if (bridges && tpl[c.i] && board[tpl[c.i][0]] === 0 && board[tpl[c.i][1]] === 0) {
            best = 0;
        }
        for (const n of c.nb) {
            if (d[n] < best) {
                best = d[n];
            }
        }
        if (bridges) {
            for (const b of c.br) {
                if (d[b.to] < best && board[b.a] === 0 && board[b.b] === 0) {
                    best = d[b.to];
                }
            }
        }
        if (best + w < d[c.i]) {
            d[c.i] = best + w;
            return true;
        }
        return false;
    };
    let passes = 0;
    for (;;) {
        let changed = false;
        for (let k = 0; k < g.cells.length; k++) {
            changed = relax(g.cells[k]) || changed;
        }
        for (let k = g.cells.length - 1; k >= 0; k--) {
            changed = relax(g.cells[k]) || changed;
        }
        passes++;
        if (!changed) {
            break;
        }
    }
    if (stats) {
        stats.passes = Math.max(stats.passes || 0, passes);
    }
    return d;
}

/** 이긴 사람: 1/2, 없으면 0 */
function winner(board, N) {
    for (const p of [1, 2]) {
        const d = distMap(board, N, p, 0, false);
        const g = getGeom(N);
        for (const i of g.sides[p][1].onEdge) {
            if (d[i] === 0) {
                return p;
            }
        }
    }
    return 0;
}

/** 브리지 거리 지도로 본 최단 거리(변 0 → 변 1) */
function edgeBest(board, N, p) {
    const d = distMap(board, N, p, 0, true);
    let m = INF;
    for (const i of getGeom(N).sides[p][1].onEdge) {
        m = Math.min(m, d[i]);
    }
    return m;
}

/** 두 거리 지도로 c 를 지나는 최단 거리 */
const through = (d0, d1, board, i) => (d0[i] >= INF || d1[i] >= INF ? INF : d0[i] + d1[i] - (board[i] === 0 ? 1 : 0));

/**
 * 수 고르기. rnd(): 0..1 난수 (엔트리의 무작위 수 블록에 해당)
 * 반환: { move, reason, scores }
 */
function chooseMove(board, N, p, level, rnd = Math.random, lastMove = 0, stats) {
    const L = LEVELS[level];
    const o = 3 - p;
    const empties = [];
    for (let i = 1; i <= N * N; i++) {
        if (board[i] === 0) {
            empties.push(i);
        }
    }
    const stones = N * N - empties.length;
    // 첫 수: 가운데 (쉬움은 가운데 근처 무작위)
    const center = getGeom(N).id((N - 1) / 2, (N - 1) / 2);
    if (stones === 0) {
        return { move: center, reason: 'open' };
    }
    if (stones === 1 && board[center] === 0 && level >= 2) {
        return { move: center, reason: 'open' };
    }
    // 바로 이기기 / 바로 막기 (브리지 없이 정확하게)
    const m0 = distMap(board, N, p, 0, false, stats);
    const m1 = distMap(board, N, p, 1, false, stats);
    const o0 = distMap(board, N, o, 0, false, stats);
    const o1 = distMap(board, N, o, 1, false, stats);
    for (const i of empties) {
        if (through(m0, m1, board, i) === 1) {
            return { move: i, reason: 'win' };
        }
    }
    for (const i of empties) {
        if (through(o0, o1, board, i) === 1) {
            return { move: i, reason: 'block' };
        }
    }
    // 브리지 지키기: 상대가 방금 내 브리지 사이 칸에 두었으면 다른 사이 칸에 둔다
    if (L.saveBridge && lastMove > 0) {
        const g = getGeom(N);
        for (const c of g.cells) {
            if (board[c.i] !== p) {
                continue;
            }
            for (const b of c.br) {
                if (b.to > c.i && board[b.to] === p) {
                    if (b.a === lastMove && board[b.b] === 0) {
                        return { move: b.b, reason: 'bridge' };
                    }
                    if (b.b === lastMove && board[b.a] === 0) {
                        return { move: b.a, reason: 'bridge' };
                    }
                }
            }
        }
    }
    let M0 = m0;
    let M1 = m1;
    let O0 = o0;
    let O1 = o1;
    if (L.bridges) {
        M0 = distMap(board, N, p, 0, true, stats);
        M1 = distMap(board, N, p, 1, true, stats);
        O0 = distMap(board, N, o, 0, true, stats);
        O1 = distMap(board, N, o, 1, true, stats);
    }
    let best = 0;
    let bestScore = Infinity;
    const scores = {};
    for (const i of empties) {
        const s = Math.min(through(M0, M1, board, i), 60) + Math.min(through(O0, O1, board, i), 60) + rnd() * L.noise;
        scores[i] = s;
        if (s < bestScore) {
            bestScore = s;
            best = i;
        }
    }
    if (L.look) {
        // 1수 탐색: 점수 상위 K칸에 실제로 두어 보고 (상대 최단 거리 − 내 최단 거리)가 가장 큰 칸
        const top = empties.slice().sort((a, b) => scores[a] - scores[b] || a - b).slice(0, L.look);
        let bestV = -Infinity;
        for (const i of top) {
            board[i] = p;
            const my = edgeBest(board, N, p);
            const op = edgeBest(board, N, o);
            board[i] = 0;
            const v = op - my - scores[i] * 0.01;
            if (v > bestV) {
                bestV = v;
                best = i;
            }
        }
        return { move: best, reason: 'look', scores };
    }
    return { move: best, reason: 'score', scores };
}

module.exports = { distMap, winner, chooseMove, through, LEVELS, INF, getGeom };
