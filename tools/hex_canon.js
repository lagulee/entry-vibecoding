'use strict';
/**
 * HEX — "표준 격자" 변환
 *
 * 엔트리 블록으로 거리 지도를 계산하는 코드는 하나(9×9 격자, 빨강이 왼쪽 변에서 출발)만 만든다.
 * 다른 경우는 칸 번호 변환표(순서)로 바꿔 넣는다.
 *   빨강·왼쪽  : (r,q)           빨강·오른쪽 : (N-1-r, N-1-q)
 *   파랑·위쪽  : (q,r)           파랑·아래쪽 : (N-1-q, N-1-r)
 * 육각 보드는 전치(r↔q)와 180° 회전에 대해 이웃·브리지 구조가 그대로이므로 결과가 같다.
 * 작은 보드(5×5, 7×7)는 9×9 격자의 왼쪽 위에 놓고, 바깥 칸은 막힌 칸으로 둔다.
 */
const { geom } = require('./hex_geom');

const GRID = 9;
const SIZES = [5, 7, 9];
const PERM_BLOCK = GRID * GRID; // (선수, 변) 한 벌 = 81칸
const PERM_OFF = { 5: 0, 7: 4 * PERM_BLOCK, 9: 8 * PERM_BLOCK };

/** 표준 격자 칸 k(1..81) → 실제 보드 칸 번호(1..N²) 또는 0(보드 밖) */
function permFor(N, p, s) {
    const out = [];
    for (let r = 0; r < GRID; r++) {
        for (let q = 0; q < GRID; q++) {
            if (r >= N || q >= N) {
                out.push(0);
                continue;
            }
            let ar;
            let aq;
            if (p === 1 && s === 0) {
                [ar, aq] = [r, q];
            } else if (p === 1 && s === 1) {
                [ar, aq] = [N - 1 - r, N - 1 - q];
            } else if (p === 2 && s === 0) {
                [ar, aq] = [q, r];
            } else {
                [ar, aq] = [N - 1 - q, N - 1 - r];
            }
            out.push(ar * N + aq + 1);
        }
    }
    return out;
}

/** 엔트리 리스트 '순서' 초기값: N=5,7,9 × (p,s) 4벌 */
function permTable() {
    const t = [];
    for (const N of SIZES) {
        for (const p of [1, 2]) {
            for (const s of [0, 1]) {
                t.push(...permFor(N, p, s));
            }
        }
    }
    return t;
}

/** 표준 격자(9×9, 빨강·왼쪽 변)의 기하 */
const CANON = (() => {
    const g = geom(GRID);
    const side = g.side(1, 0);
    return { cells: g.cells, onEdge: side.onEdge, tpl: side.tpl };
})();

/** 표준 격자 방식으로 거리 지도를 계산 (엔트리 블록과 같은 순서의 JS 구현, 검증용) */
function canonDistMap(board, N, p, s, bridges) {
    const INF = 999;
    const perm = permFor(N, p, s);
    const w = [0];
    const e = [0];
    const d = [0];
    for (let k = 1; k <= GRID * GRID; k++) {
        const a = perm[k - 1];
        const x = a > 0 ? board[a] : 3;
        if (x === 0) {
            w[k] = 1;
            e[k] = bridges ? 1 : 0;
        } else {
            w[k] = x === p ? 0 : INF;
            e[k] = 0;
        }
        d[k] = INF;
    }
    const relax = (c) => {
        const i = c.i;
        if (!(w[i] < INF)) {
            return false;
        }
        let best = CANON.onEdge.has(i) ? 0 : INF;
        const t = CANON.tpl[i];
        if (t && e[t[0]] === 1 && e[t[1]] === 1) {
            best = 0;
        }
        for (const n of c.nb) {
            if (d[n] < best) {
                best = d[n];
            }
        }
        for (const b of c.br) {
            if (d[b.to] < best && e[b.a] === 1 && e[b.b] === 1) {
                best = d[b.to];
            }
        }
        if (best + w[i] < d[i]) {
            d[i] = best + w[i];
            return true;
        }
        return false;
    };
    let ch = 1;
    let passes = 0;
    while (ch) {
        ch = 0;
        for (const c of CANON.cells) {
            if (relax(c)) {
                ch = 1;
            }
        }
        for (const c of [...CANON.cells].reverse()) {
            if (relax(c)) {
                ch = 1;
            }
        }
        passes++;
    }
    const out = new Array(N * N + 1).fill(INF);
    for (let k = 1; k <= GRID * GRID; k++) {
        if (perm[k - 1] > 0) {
            out[perm[k - 1]] = d[k];
        }
    }
    let far = INF;
    for (let r = 0; r < N; r++) {
        far = Math.min(far, d[r * GRID + (N - 1) + 1]);
    }
    return { map: out, far, passes };
}

module.exports = { GRID, SIZES, PERM_OFF, PERM_BLOCK, permFor, permTable, CANON, canonDistMap };
