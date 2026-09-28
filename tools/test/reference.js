'use strict';
/**
 * 기준(reference) 시뮬레이터 — gl_physics.js 가 만드는 엔트리 블록과 "같은 알고리즘"을 JS 로 구현.
 * 엔트리 실행 결과를 같은 스텝 수에서 비교해 블록 구현이 맞는지 검증한다.
 */
function makeState(s) {
    return {
        m: [...s.m], x: [...s.x], y: [...s.y], vx: [...s.vx], vy: [...s.vy], r: [...s.r], a: [...s.a],
        G: s.G ?? 10, dt: s.dt ?? 1 / 60, eps2: s.eps2 ?? 4, amax: s.amax ?? 20000, escape: s.escape ?? 2000,
        collide: s.collide ?? 1, merges: 0, escapes: 0, clamps: 0,
    };
}
function merge(S, i, j) {
    let k = i;
    let q = j;
    if (!(S.m[i] >= S.m[j])) {
        k = j;
        q = i;
    }
    const m1 = S.m[k];
    const m2 = S.m[q];
    const mt = m1 + m2;
    for (const c of ['x', 'y', 'vx', 'vy']) {
        S[c][k] = (m1 * S[c][k] + m2 * S[c][q]) / mt;
    }
    S.fx[k] += S.fx[q];
    S.fy[k] += S.fy[q];
    S.m[k] = mt;
    const r1 = S.r[k];
    const r2 = S.r[q];
    const s3 = r1 * r1 * r1 + r2 * r2 * r2;
    let c = r1 > r2 ? r1 : r2;
    for (let n = 0; n < 4; n++) {
        c = (2 * c + s3 / (c * c)) / 3;
    }
    S.r[k] = c;
    S.a[q] = 0;
    S.vx[q] = 0;
    S.vy[q] = 0;
    S.fx[q] = 0;
    S.fy[q] = 0;
    S.merges++;
}
function step(S) {
    const N = S.m.length;
    S.fx = Array(N).fill(0);
    S.fy = Array(N).fill(0);
    for (let j = 1; j < N; j++) {
        for (let i = 0; i < j; i++) {
            if (S.a[i] !== 1 || S.a[j] !== 1) {
                continue;
            }
            const dx = S.x[j] - S.x[i];
            const dy = S.y[j] - S.y[i];
            let r2 = dx * dx + dy * dy;
            const rs = S.r[i] + S.r[j];
            if (S.collide === 1 && r2 <= rs * rs) {
                merge(S, i, j);
                continue;
            }
            if (r2 < S.eps2) {
                r2 = S.eps2;
            }
            const r = Math.sqrt(r2);
            const f = (S.G * S.m[i] * S.m[j]) / r2;
            const fx = (f * dx) / r;
            const fy = (f * dy) / r;
            S.fx[i] += fx;
            S.fy[i] += fy;
            S.fx[j] -= fx;
            S.fy[j] -= fy;
        }
    }
    for (let i = 0; i < N; i++) {
        if (S.a[i] !== 1) {
            continue;
        }
        let ax = S.fx[i] / S.m[i];
        let ay = S.fy[i] / S.m[i];
        const a2 = ax * ax + ay * ay;
        if (a2 > S.amax * S.amax) {
            const s = S.amax / Math.sqrt(a2);
            ax *= s;
            ay *= s;
            S.clamps++;
        }
        S.vx[i] += ax * S.dt;
        S.vy[i] += ay * S.dt;
        S.x[i] += S.vx[i] * S.dt;
        S.y[i] += S.vy[i] * S.dt;
        if (Math.abs(S.x[i]) > S.escape || Math.abs(S.y[i]) > S.escape) {
            S.a[i] = 0;
            S.escapes++;
        }
    }
}
function run(S, n) {
    for (let k = 0; k < n; k++) {
        step(S);
    }
    return S;
}
function energy(S) {
    let e = 0;
    const N = S.m.length;
    for (let i = 0; i < N; i++) {
        if (S.a[i] !== 1) {
            continue;
        }
        e += 0.5 * S.m[i] * (S.vx[i] ** 2 + S.vy[i] ** 2);
        for (let j = i + 1; j < N; j++) {
            if (S.a[j] !== 1) {
                continue;
            }
            e -= (S.G * S.m[i] * S.m[j]) / Math.hypot(S.x[j] - S.x[i], S.y[j] - S.y[i]);
        }
    }
    return e;
}
function momentum(S) {
    let px = 0;
    let py = 0;
    S.m.forEach((m, i) => {
        if (S.a[i] === 1) {
            px += m * S.vx[i];
            py += m * S.vy[i];
        }
    });
    return [px, py];
}
module.exports = { makeState, step, run, energy, momentum };
