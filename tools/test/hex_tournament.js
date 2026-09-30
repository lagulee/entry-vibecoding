'use strict';
// 기준 AI 대국 테스트: 난이도끼리, 무작위 상대와 대결 (색 번갈아)
const AI = require('../hex_ai');
function seeded(s) { return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function play(N, lv1, lv2, rnd, stats) {
    const b = new Array(N * N + 1).fill(0);
    let p = 1, last = 0, moves = 0;
    for (;;) {
        const lv = p === 1 ? lv1 : lv2;
        let m;
        if (lv === 0) { const e = []; for (let i = 1; i <= N * N; i++) if (!b[i]) e.push(i); m = e[Math.floor(rnd() * e.length)]; }
        else m = AI.chooseMove(b, N, p, lv, rnd, last, stats).move;
        if (!m || b[m]) throw new Error('bad move ' + m);
        b[m] = p; last = m; moves++;
        const w = AI.winner(b, N);
        if (w) return { w, moves };
        p = 3 - p;
    }
}
const rnd = seeded(12345);
const games = +process.argv[2] || 20;
for (const N of [5, 7, 9]) {
    const stats = {};
    const line = [];
    for (const [a, bb] of [[1, 0], [2, 0], [3, 0], [2, 1], [3, 1], [3, 2]]) {
        let winsA = 0;
        for (let g = 0; g < games; g++) {
            const aFirst = g % 2 === 0;
            const r = aFirst ? play(N, a, bb, rnd, stats) : play(N, bb, a, rnd, stats);
            if ((r.w === 1) === aFirst) winsA++;
        }
        line.push(`L${a} vs ${bb ? 'L' + bb : 'rand'}: ${winsA}/${games}`);
    }
    console.log(`N=${N}  ${line.join('  |  ')}  maxPasses=${stats.passes}`);
}
