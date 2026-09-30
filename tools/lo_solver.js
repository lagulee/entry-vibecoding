'use strict';
/**
 * LIGHTS OUT — GF(2) 풀이기 (빌드 시점 계산 + 테스트 기준값)
 *
 * n×n 판에서 칸 i 를 누르면 i 와 상하좌우가 뒤집힌다. 누름 벡터 x, 불 벡터 b 에 대해
 *   A·x = b (mod 2)
 * A 를 [A | I] 가우스 소거해 두면, 풀 수 있는 b 에 대해 x = M·b 가 해가 되고
 * 영공간 기저 N 을 더해(XOR) 보면서 누름 수가 가장 적은 해를 고를 수 있다.
 *
 * 엔트리 블록은 이 M·N 을 그대로 "펼쳐서" 쓴다 (반복 블록 없이 한 프레임에 계산).
 */

function pressMatrix(n) {
    const N = n * n;
    const A = [...Array(N)].map(() => Array(N).fill(0));
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const j = r * n + c;
            for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const rr = r + dr;
                const cc = c + dc;
                if (rr >= 0 && rr < n && cc >= 0 && cc < n) {
                    A[rr * n + cc][j] = 1; // 칸 j 누름 → 불 (rr,cc) 뒤집힘
                }
            }
        }
    }
    return A;
}

/** { M, nullBasis, rank } — M: N×N, x = M·b (자유 변수 = 0 인 해) */
function analyze(n) {
    const N = n * n;
    const A = pressMatrix(n);
    const R = A.map((row) => row.slice());
    const E = [...Array(N)].map((_, i) => Array.from({ length: N }, (_, j) => (i === j ? 1 : 0)));
    const pivotCols = [];
    let row = 0;
    for (let col = 0; col < N && row < N; col++) {
        let p = -1;
        for (let r = row; r < N; r++) {
            if (R[r][col]) {
                p = r;
                break;
            }
        }
        if (p < 0) {
            continue;
        }
        [R[row], R[p]] = [R[p], R[row]];
        [E[row], E[p]] = [E[p], E[row]];
        for (let r = 0; r < N; r++) {
            if (r !== row && R[r][col]) {
                for (let k = 0; k < N; k++) {
                    R[r][k] ^= R[row][k];
                    E[r][k] ^= E[row][k];
                }
            }
        }
        pivotCols.push(col);
        row++;
    }
    const rank = pivotCols.length;
    const M = [...Array(N)].map(() => Array(N).fill(0));
    pivotCols.forEach((pc, r) => {
        M[pc] = E[r].slice();
    });
    const free = [...Array(N).keys()].filter((c) => !pivotCols.includes(c));
    const nullBasis = free.map((f) => {
        const x = Array(N).fill(0);
        x[f] = 1;
        pivotCols.forEach((pc, r) => {
            x[pc] = R[r][f];
        });
        return x;
    });
    // 풀 수 있는지 확인하는 조건: b 가 A 의 열공간 (= 영공간과 직교, A 가 대칭이므로)
    return { n, N, A, M, nullBasis, rank };
}

const cache = {};
const info = (n) => (cache[n] = cache[n] || analyze(n));

function mulVec(M, b) {
    return M.map((row) => row.reduce((s, m, j) => s ^ (m & b[j]), 0));
}

/** 모든 영공간 조합: [{vec, ones}] (2^k 개) */
function nullCombos(n) {
    const { N, nullBasis } = info(n);
    const out = [];
    for (let mask = 0; mask < 1 << nullBasis.length; mask++) {
        const vec = Array(N).fill(0);
        nullBasis.forEach((nb, k) => {
            if (mask & (1 << k)) {
                for (let i = 0; i < N; i++) {
                    vec[i] ^= nb[i];
                }
            }
        });
        out.push({ vec, ones: vec.reduce((a, x) => a + x, 0) });
    }
    return out;
}

function solvable(n, b) {
    const { nullBasis } = info(n);
    return nullBasis.every((nb) => nb.reduce((s, x, i) => s ^ (x & b[i]), 0) === 0);
}

/** 최소 누름 해 (엔트리 블록과 같은 순서로 조합을 비교: 동률이면 먼저 나온 조합) */
function solveMin(n, b) {
    const { M } = info(n);
    const x0 = mulVec(M, b);
    let best = null;
    for (const { vec } of nullCombos(n)) {
        const x = x0.map((xi, i) => xi ^ vec[i]);
        const w = x.reduce((a, t) => a + t, 0);
        if (!best || w < best.w) {
            best = { x, w };
        }
    }
    return best;
}

function press(n, b, j) {
    const r = Math.floor(j / n);
    const c = j % n;
    const out = b.slice();
    for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) {
            out[rr * n + cc] ^= 1;
        }
    }
    return out;
}

/** 결정적 난수 */
function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) {
        s += 2147483646;
    }
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * 스테이지 30개: 1~10 = 3×3, 11~20 = 4×4, 21~30 = 5×5.
 * 목표 최소 누름 수(par)를 정해 두고, 그 수만큼 칸을 골라 누른 판 중
 * AI 풀이기로 구한 최소 누름 수가 정확히 par 인 판만 채택한다.
 */
const STAGE_PLAN = [
    // [n, par]
    [3, 1], [3, 2], [3, 2], [3, 3], [3, 3], [3, 4], [3, 4], [3, 5], [3, 5], [3, 6],
    [4, 2], [4, 3], [4, 3], [4, 4], [4, 4], [4, 5], [4, 5], [4, 6], [4, 6], [4, 7],
    [5, 3], [5, 4], [5, 5], [5, 5], [5, 6], [5, 7], [5, 8], [5, 9], [5, 10], [5, 11],
];
function makeStages() {
    const R = rng(20260930);
    const seen = new Set();
    return STAGE_PLAN.map(([n, par], k) => {
        const N = n * n;
        for (let tries = 0; tries < 100000; tries++) {
            const cells = [...Array(N).keys()].sort(() => R() - 0.5).slice(0, par);
            let b = Array(N).fill(0);
            for (const j of cells) {
                b = press(n, b, j);
            }
            const lit = b.reduce((a, x) => a + x, 0);
            const key = `${n}:${b.join('')}`;
            // 너무 휑하거나(불이 너무 적은 판) 이미 나온 판은 제외. 1단계는 튜토리얼이라 예외
            if (seen.has(key) || (k > 0 && lit < Math.min(par + 1, 4))) {
                continue;
            }
            if (solveMin(n, b).w === par) {
                seen.add(key);
                return { stage: k + 1, n, par, board: b.join('') };
            }
        }
        throw new Error(`stage ${k + 1} 생성 실패`);
    });
}

module.exports = { pressMatrix, analyze: info, nullCombos, solvable, solveMin, press, rng, makeStages, STAGE_PLAN };

if (require.main === module) {
    for (const n of [3, 4, 5]) {
        const I = info(n);
        console.log(`${n}×${n}: rank ${I.rank}/${I.N}, 영공간 ${I.nullBasis.length}차원 → 조합 ${1 << I.nullBasis.length}개`);
    }
    for (const s of makeStages()) {
        console.log(s.stage, `${s.n}×${s.n}`, 'par', s.par, s.board);
    }
}
