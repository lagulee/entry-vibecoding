'use strict';
/**
 * 기준 시뮬레이터(reference.js) 자체 검증 — 해석해와 비교
 *   node tools/test/reference_selftest.js
 * 엔트리 쪽 구현은 harness/suite.js 에서 이 기준 시뮬레이터와 스텝 단위로 비교한다.
 */
const R = require('./reference');

const G = 10;
let fail = 0;
function check(name, ok, detail) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
    if (!ok) {
        fail++;
    }
}
const slots = (arr, fill) => [...arr, ...Array(8 - arr.length).fill(fill)];

// 1) 원궤도: v = √(GM/r) → 반지름 유지, 주기 2πr/v
{
    const M = 10000;
    const r = 100;
    const v = Math.sqrt((G * M) / r);
    const S = R.makeState({
        m: slots([M, 10], 1), x: slots([0, r], 0), y: slots([0, 0], 0),
        vx: slots([0, 0], 0), vy: slots([(-10 * v) / M, v], 0), r: slots([12, 3], 1), a: slots([1, 1], 0),
    });
    const E0 = R.energy(S);
    let rmin = 1e9;
    let rmax = 0;
    const T = (2 * Math.PI * r) / v;
    const n = Math.round(T * 60);
    for (let k = 0; k < n; k++) {
        R.step(S);
        const d = Math.hypot(S.x[1] - S.x[0], S.y[1] - S.y[0]);
        rmin = Math.min(rmin, d);
        rmax = Math.max(rmax, d);
    }
    check('원궤도 반지름 유지', rmax - rmin < 1, `r ∈ [${rmin.toFixed(3)}, ${rmax.toFixed(3)}]`);
    check('한 주기 후 제자리', Math.hypot(S.x[1] - r, S.y[1]) < 2, `주기 ${T.toFixed(2)} s 후 위치 (${S.x[1].toFixed(2)}, ${S.y[1].toFixed(2)})`);
    check('에너지 보존(심플렉틱 오일러)', Math.abs((R.energy(S) - E0) / E0) < 1e-3, `상대 변화 ${((R.energy(S) - E0) / E0).toExponential(2)}`);
}
// 2) 탈출 속도 √(2GM/r): 조금 작으면 묶이고, 크면 탈출
{
    const run = (v0) => {
        const S = R.makeState({
            m: slots([10000, 1], 1), x: slots([0, 60], 0), y: slots([0, 0], 0),
            vx: slots([0, 0], 0), vy: slots([(-1 * v0) / 10000, v0], 0), r: slots([10, 2], 1), a: slots([1, 1], 0),
        });
        let dmax = 0;
        for (let k = 0; k < 60 * 400 && S.a[1] === 1; k++) {
            R.step(S);
            dmax = Math.max(dmax, Math.hypot(S.x[1] - S.x[0], S.y[1] - S.y[0]));
        }
        return { dmax, escaped: S.escapes };
    };
    const ve = Math.sqrt((2 * G * 10000) / 60);
    const a = run(50);
    const b = run(60);
    check('VY 50 → 묶인 타원(원점 ≈ 180)', !a.escaped && Math.abs(a.dmax - 180) < 2, `최대 거리 ${a.dmax.toFixed(2)} (이론 180)`);
    check(`VY 60 > 탈출 속도 ${ve.toFixed(2)} → 탈출`, b.escaped === 1, `탈출 ${b.escaped}`);
}
// 3) 8자 3체 해: 주기 ≈ 31.63 s 후 거의 제자리
{
    const X1 = [-0.97000436, 0.24308753];
    const V3 = [-0.93240737, -0.86473146];
    const f5 = (x) => Math.round(x * 1e5) / 1e5;
    const S = R.makeState({
        m: slots([4000, 4000, 4000], 100), x: slots([f5(X1[0] * 100), f5(-X1[0] * 100), 0], 0),
        y: slots([f5(X1[1] * 100), f5(-X1[1] * 100), 0], 0),
        vx: slots([f5(-V3[0] * 10), f5(-V3[0] * 10), f5(V3[0] * 20)], 0),
        vy: slots([f5(-V3[1] * 10), f5(-V3[1] * 10), f5(V3[1] * 20)], 0),
        r: slots([4, 4, 4], 4), a: slots([1, 1, 1], 0),
    });
    let best = 1e9;
    let bt = 0;
    for (let n = 1; n <= 60 * 40; n++) {
        R.step(S);
        const d = Math.hypot(S.x[0] - f5(X1[0] * 100), S.y[0] - f5(X1[1] * 100)) + Math.hypot(S.x[2], S.y[2]);
        if (n > 60 * 25 && d < best) {
            best = d;
            bt = n / 60;
        }
    }
    check('8자 궤도 주기', Math.abs(bt - 31.63) < 0.2 && best < 1, `t=${bt.toFixed(2)} s 에 오차 ${best.toFixed(3)} LU (이론 주기 6.3259×5 = 31.63 s)`);
}
// 4) 병합: 질량·운동량 보존, 부피 보존 반지름
{
    const S = R.makeState({
        m: slots([30, 10], 1), x: slots([0, 3], 0), y: slots([0, 0], 0),
        vx: slots([1, -2], 0), vy: slots([0, 4], 0), r: slots([2, 2], 1), a: slots([1, 1], 0),
    });
    const p0 = [30 * 1 + 10 * -2, 30 * 0 + 10 * 4];
    R.step(S);
    check('병합 질량 보존', S.m[0] === 40 && S.a[1] === 0, `m=${S.m[0]}`);
    check('병합 운동량 보존', Math.abs(S.m[0] * S.vx[0] - p0[0]) < 1e-9 && Math.abs(S.m[0] * S.vy[0] - p0[1]) < 1e-9, `p=(${S.m[0] * S.vx[0]}, ${S.m[0] * S.vy[0]})`);
    check('병합 반지름 ∛(r1³+r2³)', Math.abs(S.r[0] - Math.cbrt(16)) < 1e-9, `r=${S.r[0]}`);
}
console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
process.exit(fail ? 1 : 0);
