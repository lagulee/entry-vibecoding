'use strict';
// LIGHTS OUT 풀이기(lo_solver.js) 자체 검증 — 가우스 소거와 다른 방법으로 최소 누름 수를 구해 비교한다.
//   3×3·4×4: 다 꺼진 판에서 너비 우선 탐색(BFS) → 모든 판의 정확한 최소 누름 수
//   5×5    : '불 쫓기'(윗줄 누름 32가지를 모두 시도하고 아래로 쫓아 내림) → 모든 해 중 최소
const S = require('../lo_solver');

let fail = 0;
const ok = (name, cond, detail = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!cond) {
        fail++;
    }
};
const toMask = (b) => b.reduce((m, x, i) => m | (x << i), 0);
const fromMask = (m, N) => [...Array(N)].map((_, i) => (m >> i) & 1);

function bfs(n) {
    const N = n * n;
    const moves = [...Array(N)].map((_, j) => toMask(S.press(n, Array(N).fill(0), j)));
    const dist = new Int8Array(1 << N).fill(-1);
    dist[0] = 0;
    let frontier = [0];
    while (frontier.length) {
        const next = [];
        for (const s of frontier) {
            for (const m of moves) {
                const t = s ^ m;
                if (dist[t] < 0) {
                    dist[t] = dist[s] + 1;
                    next.push(t);
                }
            }
        }
        frontier = next;
    }
    return dist;
}

for (const n of [3, 4]) {
    const N = n * n;
    const dist = bfs(n);
    let checked = 0;
    let bad = 0;
    for (let m = 0; m < 1 << N; m++) {
        const b = fromMask(m, N);
        const solv = S.solvable(n, b);
        if (solv !== dist[m] >= 0) {
            bad++;
            continue;
        }
        if (!solv) {
            continue;
        }
        const r = S.solveMin(n, b);
        const after = r.x.reduce((acc, on, j) => (on ? S.press(n, acc, j) : acc), b);
        if (r.w !== dist[m] || after.some((x) => x)) {
            bad++;
        }
        checked++;
    }
    ok(`${n}×${n}: 풀 수 있는 판 ${checked}개 전부 해가 맞고 최소 누름 수 = BFS`, bad === 0, `오류 ${bad}`);
}

function chaseMin(b) {
    const n = 5;
    let best = Infinity;
    for (let top = 0; top < 32; top++) {
        let cur = b.slice();
        let count = 0;
        for (let c = 0; c < n; c++) {
            if ((top >> c) & 1) {
                cur = S.press(n, cur, c);
                count++;
            }
        }
        for (let r = 1; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (cur[(r - 1) * n + c]) {
                    cur = S.press(n, cur, r * n + c);
                    count++;
                }
            }
        }
        if (cur.every((x) => x === 0)) {
            best = Math.min(best, count);
        }
    }
    return best;
}
{
    const R = S.rng(777);
    let bad = 0;
    let unsolvableAgree = 0;
    for (let k = 0; k < 3000; k++) {
        const b = [...Array(25)].map(() => (R() < 0.5 ? 1 : 0));
        const c = chaseMin(b);
        const solv = S.solvable(5, b);
        if (!solv) {
            if (c !== Infinity) {
                bad++;
            } else {
                unsolvableAgree++;
            }
            continue;
        }
        const r = S.solveMin(5, b);
        const after = r.x.reduce((acc, on, j) => (on ? S.press(5, acc, j) : acc), b);
        if (r.w !== c || after.some((x) => x)) {
            bad++;
        }
    }
    ok('5×5: 무작위 3000판 — 풀 수 있는지 판정 + 최소 누름 수 = 불 쫓기 전수 탐색', bad === 0, `오류 ${bad}, 풀 수 없는 판 ${unsolvableAgree}개 일치`);
}

// 스테이지 30개
{
    const st = S.makeStages();
    const dist = { 3: bfs(3), 4: bfs(4) };
    const bad = st.filter((s) => {
        const b = s.board.split('').map(Number);
        const w = s.n === 5 ? chaseMin(b) : dist[s.n][toMask(b)];
        return w !== s.par;
    });
    ok('스테이지 30개: 표시하는 AI 최소 횟수(par)가 독립 계산과 같음', bad.length === 0, bad.map((s) => s.stage).join(','));
    const again = S.makeStages();
    ok('스테이지 생성은 결정적(빌드마다 같은 판)', JSON.stringify(st) === JSON.stringify(again));
}
process.exit(fail ? 1 : 0);
