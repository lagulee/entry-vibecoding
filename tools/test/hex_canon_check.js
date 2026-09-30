'use strict';
// 표준 격자 변환 방식 == 기준 AI 거리 지도 인지 무작위 보드로 확인
const AI = require('../hex_ai');
const { canonDistMap } = require('../hex_canon');
let s = 99; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
let n = 0, bad = 0, maxP = 0;
for (const N of [5, 7, 9]) {
    for (let t = 0; t < 300; t++) {
        const b = [0]; const fill = rnd();
        for (let i = 1; i <= N * N; i++) b.push(rnd() < fill ? 1 + Math.floor(rnd() * 2) : 0);
        for (const p of [1, 2]) for (const sd of [0, 1]) for (const br of [false, true]) {
            const ref = AI.distMap(b, N, p, sd, br);
            const c = canonDistMap(b, N, p, sd, br);
            maxP = Math.max(maxP, c.passes);
            n++;
            let ok = true;
            for (let i = 1; i <= N * N; i++) if (ref[i] !== c.map[i]) ok = false;
            let far = 999; const g = AI.getGeom(N);
            for (const i of g.sides[p][1 - sd].onEdge) far = Math.min(far, ref[i]);
            if (far !== c.far) ok = false;
            if (!ok) { bad++; if (bad < 3) console.log('MISMATCH', N, p, sd, br); }
        }
    }
}
console.log(`canon check: ${n - bad}/${n} ok, max passes ${maxP}`);
process.exit(bad ? 1 : 0);
