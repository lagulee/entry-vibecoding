// GRAVITY LAB — 실제 entryjs 엔진에서 돌리는 테스트 (TEST 01~10 + 추가 시나리오)
const lib = require('./lib');
const R = require('../reference.js');
const Lay = require('../../gl_layout.js');

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok: !!ok, detail });
    console.log(`LOG: ${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}
const finite = (arr) => arr.every((x) => Number.isFinite(x));

module.exports = async (page) => {
    const t = lib(page);
    const errors = [];
    page.on('pageerror', (e) => { if (!/reading 'default'/.test(String(e))) errors.push(String(e)); });
    await page.evaluate(() => {
        window.__toasts = [];
        const orig = Entry.toast.alert.bind(Entry.toast);
        Entry.toast.alert = (...a) => { window.__toasts.push(a.join(' ')); return orig(...a); };
    });
    await page.evaluate(() => Entry.engine.toggleRun());
    await t.wait(1200);
    const toMenu = async () => { await t.btn(30); await t.wait(300); };
    const preset = async (n) => {
        if ((await t.g('화면')) !== 'START') { await toMenu(); }
        await t.btn(41); await t.wait(300);
        await t.btn(46 + n); await t.wait(700);
    };
    const runFor = async (ms) => { await t.btn(1); await t.wait(ms); await t.btn(2); await t.wait(250); };
    const clickBody = async (k) => {
        const s = await t.snap();
        const cx = await t.g('중심X'), cy = await t.g('중심Y'), z = await t.g('배율');
        await t.click(+cx + s.X[k - 1] * z, +cy + s.Y[k - 1] * z);
    };
    const refFrom = (s) => R.makeState({ m: s['질량'], x: s.X, y: s.Y, vx: s.VX, vy: s.VY, r: s['반지름'], a: s['활성'] });
    const maxDiff = (s, S) => {
        let d = 0;
        for (let i = 0; i < 8; i++) {
            if (s['활성'][i] !== S.a[i]) { return Infinity; }
            if (S.a[i] !== 1) { continue; }
            d = Math.max(d, Math.abs(s.X[i] - S.x[i]), Math.abs(s.Y[i] - S.y[i]), Math.abs(s.VX[i] - S.vx[i]), Math.abs(s.VY[i] - S.vy[i]), Math.abs(s['질량'][i] - S.m[i]) / S.m[i]);
        }
        return d;
    };

    // ---------------- 시작 화면 → 사용 방법 → 돌아가기 ----------------
    await t.shot('s01_start');
    await t.btn(42); await t.wait(400); await t.shot('s02_help');
    check('도움말 화면 열기', (await t.g('화면')) === 'HELP', `화면=${await t.g('화면')}`);
    await t.btn(53); await t.wait(300);
    check('도움말 닫기 → 시작 화면', (await t.g('화면')) === 'START', `화면=${await t.g('화면')}`);
    await t.btn(40); await t.wait(400); await t.shot('s03_mode');
    check('실험 시작 → 모드 선택', (await t.g('화면')) === 'MODE', '');
    await t.btn(43); await t.wait(700);
    check('BASIC 모드 → 프리셋 1 로드', (await t.g('모드')) === 'BASIC' && (await t.g('프리셋번호')) == 1 && (await t.g('상태')) === 'READY', `모드=${await t.g('모드')} 상태=${await t.g('상태')}`);
    await t.shot('s04_basic_ready');

    // ---------------- TEST 01 — 정지 상태 ----------------
    await preset(5); // SANDBOX: 항성 + 행성
    for (const [btn, v] of [[17, 0], [18, 0]]) { await t.btn(btn); await t.answer(v); } // 선택(행성) VX=VY=0
    await clickBody(1); await t.btn(18); await t.answer(0); // 항성 VY=0
    let s0 = await t.snap();
    check('TEST 01 초기 속도 0', s0.VX.slice(0, 2).every((x) => x === 0) && s0.VY.slice(0, 2).every((x) => x === 0), `VX=${s0.VX.slice(0, 2)} VY=${s0.VY.slice(0, 2)}`);
    await runFor(700);
    let s1 = await t.snap();
    const d0 = Math.hypot(s0.X[1] - s0.X[0], s0.Y[1] - s0.Y[0]);
    const d1 = Math.hypot(s1.X[1] - s1.X[0], s1.Y[1] - s1.Y[0]);
    const pMom = [s1['질량'][0] * s1.VX[0] + s1['질량'][1] * s1.VX[1], s1['질량'][0] * s1.VY[0] + s1['질량'][1] * s1.VY[1]];
    check('TEST 01 정지 상태에서 서로 끌어당김(거리 감소, 운동량 0 유지)', d1 < d0 && Math.abs(pMom[0]) < 1e-9 && Math.abs(pMom[1]) < 1e-9 && Math.abs(s1.VY[1]) < 1e-12,
        `거리 ${d0.toFixed(3)}→${d1.toFixed(3)}, 운동량=(${pMom.map((x) => x.toExponential(1))}), 행성 VX=${s1.VX[1].toFixed(4)}(항성 쪽 -x 방향)`);
    check('TEST 01 힘 방향: 행성은 항성 쪽(-x), 항성은 행성 쪽(+x)', s1.VX[1] < 0 && s1.VX[0] > 0, `VX행성=${s1.VX[1].toFixed(4)} VX항성=${s1.VX[0].toExponential(2)}`);

    // ---------------- TEST 02 — 대칭성 (쌍성계) ----------------
    await preset(3);
    await runFor(1500);
    s1 = await t.snap();
    const symErr = Math.max(Math.abs(s1.X[0] + s1.X[1]), Math.abs(s1.Y[0] + s1.Y[1]), Math.abs(s1.VX[0] + s1.VX[1]), Math.abs(s1.VY[0] + s1.VY[1]));
    const sep = Math.hypot(s1.X[1] - s1.X[0], s1.Y[1] - s1.Y[0]);
    check('TEST 02 같은 질량·대칭 조건 → 점대칭 운동', symErr < 1e-9 && Math.abs(sep - 100) < 0.5, `대칭오차=${symErr.toExponential(2)}, 거리=${sep.toFixed(3)} (원궤도 100 유지), t=${(+s1['시뮬레이션시간']).toFixed(2)}`);
    await t.shot('s05_binary');

    // ---------------- TEST 03 — 질량 변화 ----------------
    // 가속도 크기가 이론값 a = G·M/r² 과 같은지, 행성 질량을 2배로 바꾸면 2배가 되는지 확인
    const accCheck = (s) => {
        const r = Math.hypot(s.X[1] - s.X[0], s.Y[1] - s.Y[0]);
        return { a: Math.hypot(s.AX[1], s.AY[1]), th: (10 * s['질량'][0]) / (r * r) };
    };
    await preset(1);
    await t.btn(1); await t.wait(120); await t.btn(2); await t.wait(200);
    const q1 = accCheck(await t.snap());
    await t.btn(3); await t.wait(300);
    await clickBody(1); await t.btn(16); await t.answer(20000);
    await t.btn(1); await t.wait(120); await t.btn(2); await t.wait(200);
    const q2 = accCheck(await t.snap());
    check('TEST 03 행성 질량 2배 → 위성 가속도 2배 (a = G·M/r²)', Math.abs(q1.a / q1.th - 1) < 5e-3 && Math.abs(q2.a / q2.th - 1) < 5e-3 && Math.abs(q2.th / q1.th - 2) < 0.1,
        `M=10000: a=${q1.a.toFixed(4)} (이론 ${q1.th.toFixed(4)}) / M=20000: a=${q2.a.toFixed(4)} (이론 ${q2.th.toFixed(4)}) → 비 ${(q2.a / q1.a).toFixed(3)}`);

    // ---------------- TEST 04 — 거리 변화 ----------------
    await preset(2); // EXPERIMENT (X 편집 가능)
    await t.btn(1); await t.wait(120); await t.btn(2); await t.wait(200);
    s1 = await t.snap();
    const b1 = Math.hypot(s1.AX[1], s1.AY[1]);
    await t.btn(3); await t.wait(300);
    await t.btn(19); await t.answer(120); // 탐사체 X 60 → 120 (거리 2배)
    await t.btn(1); await t.wait(120); await t.btn(2); await t.wait(200);
    s1 = await t.snap();
    const b2 = Math.hypot(s1.AX[1], s1.AY[1]);
    check('TEST 04 거리 2배 → 중력 가속도 1/4', Math.abs(b1 / b2 - 4) < 0.1, `a: ${b1.toFixed(3)} → ${b2.toFixed(3)} (비 ${(b1 / b2).toFixed(3)})`);

    // ---------------- TEST 05 — 속도 변화 ----------------
    await preset(1);
    await t.btn(9); await runFor(2500); // ×10
    const circ = await page.evaluate(() => [+Entry.variableContainer.getVariableByName('최소거리').getValue(), +Entry.variableContainer.getVariableByName('최대거리').getValue()]);
    await t.btn(3); await t.wait(300);
    await t.btn(18); await t.answer(25);
    await t.btn(9); await runFor(2500);
    const ell = await page.evaluate(() => [+Entry.variableContainer.getVariableByName('최소거리').getValue(), +Entry.variableContainer.getVariableByName('최대거리').getValue()]);
    check('TEST 05 VY 31.62→25 → 원 궤도가 타원 궤도로', (circ[1] - circ[0]) < 1 && (ell[1] - ell[0]) > 30,
        `원: 최소 ${circ[0].toFixed(2)} 최대 ${circ[1].toFixed(2)} / 타원: 최소 ${ell[0].toFixed(2)} 최대 ${ell[1].toFixed(2)}`);
    await t.btn(26); await t.wait(400); // BASIC 은 분석 탭 없음 → 무시돼야 함
    await t.shot('s06_ellipse');

    // ---------------- TEST 06 — 충돌 ----------------
    await t.btn(3); await t.wait(300);
    await t.btn(18); await t.answer(5); // 위성을 거의 정지 → 행성으로 낙하
    s0 = await t.snap();
    await t.btn(9); await t.btn(1);
    for (let k = 0; k < 40 && (await t.g('상태')) === 'RUNNING'; k++) { await t.wait(200); }
    s1 = await t.snap();
    const S6 = R.run(refFrom(s0), +s1['스텝수']);
    const pBefore = [s0['질량'][0] * s0.VX[0] + s0['질량'][1] * s0.VX[1], s0['질량'][0] * s0.VY[0] + s0['질량'][1] * s0.VY[1]];
    check('TEST 06 충돌 → 병합, 천체 수 감소, 종료 상태', s1['활성'].slice(0, 2).join('') === '10' && +s1['충돌횟수'] === 1 && s1['상태'] === 'FINISHED',
        `활성=${s1['활성'].slice(0, 2)} 충돌=${s1['충돌횟수']} 상태=${s1['상태']}`);
    check('TEST 06 질량 보존', Math.abs(s1['질량'][0] - 10010) < 1e-9, `m=${s1['질량'][0]} (10000+10)`);
    check('TEST 06 운동량 기반 속도(충돌 전후 운동량 보존)', Math.abs(s1['질량'][0] * s1.VX[0] - pBefore[0]) < 1e-6 && Math.abs(s1['질량'][0] * s1.VY[0] - pBefore[1]) < 1e-6,
        `p 전=(${pBefore.map((x) => x.toFixed(6))}) 후=(${(s1['질량'][0] * s1.VX[0]).toFixed(6)}, ${(s1['질량'][0] * s1.VY[0]).toFixed(6)})`);
    check('TEST 06 기준 시뮬레이터와 일치(병합 포함)', maxDiff(s1, S6) < 1e-6 && S6.merges === 1, `최대 차이=${maxDiff(s1, S6).toExponential(2)}, ref 병합=${S6.merges}`);
    check('TEST 06 반지름 = ∛(12³+3³)', Math.abs(s1['반지름'][0] - Math.cbrt(12 ** 3 + 3 ** 3)) < 1e-6, `r=${s1['반지름'][0].toFixed(6)} (이론 ${Math.cbrt(12 ** 3 + 3 ** 3).toFixed(6)})`);
    const trailInk = await page.evaluate(() => {
        const o = Entry.container.objects_.find((x) => x.name === '궤적');
        return o.clonedEntities.map((e) => {
            const n = +e.variables.find((v) => v.name_ === '궤적번호').value_;
            const g = e.brush && (e.brush.graphics || e.brush);
            const ins = g && (g._activeInstructions || g._instructions || g.instructions || g.graphicsData || []);
            return [n, ins ? ins.length : -1];
        });
    });
    const slot2 = trailInk.filter(([n]) => n === 2).map(([, c]) => c);
    check('TEST 06 병합된 천체의 궤적 정리', slot2.every((c) => c <= 2), `슬롯2 붓 명령 수=${slot2.join(',')} (다른 슬롯1=${trailInk.filter(([n]) => n === 1).map(([, c]) => c).join(',')})`);
    await t.shot('s07_collision_finished');
    check('TEST 06 종료 상태에서 PLAY 비활성', (await t.Ln('버튼상태'))[0] === 3, `PLAY 버튼상태=${(await t.Ln('버튼상태'))[0]}`);

    // ---------------- TEST 07 — 초기화 ----------------
    await preset(4);
    await clickBody(3);
    const start = await t.snap();
    await t.btn(8); await runFor(1500);
    await t.btn(26); // 분석 탭
    await t.btn(14); // 궤적 길이 변경
    await t.btn(12); // 축소
    const mid = await t.snap();
    await t.btn(3); await t.wait(400);
    const after = await t.snap();
    const rec = await t.L('기록_시간');
    const same = ['질량', 'X', 'Y', 'VX', 'VY', '반지름', '활성'].every((n) => after[n].every((x, i) => x === start[n][i]));
    check('TEST 07 RESET → 천체 데이터 완전 복구', same && +mid['시뮬레이션시간'] > 0, `t(초기화 전)=${(+mid['시뮬레이션시간']).toFixed(2)}`);
    check('TEST 07 RESET → 시간·배속·기록·힘·상태 초기화',
        +after['시뮬레이션시간'] === 0 && +after['배속'] === 1 && rec.length === 0 && after.FX.every((x) => x === 0) && after['상태'] === 'READY' && +after['충돌횟수'] === 0,
        `t=${after['시뮬레이션시간']} 배속=${after['배속']} 기록=${rec.length} 상태=${after['상태']} 선택=${after['선택천체']}`);
    check('TEST 07 RESET → UI 상태(탭·궤적 길이·확대) 기본값', (await t.g('탭')) === 'Q' && +(await t.g('궤적길이단계')) === 3 && +(await t.g('배율')) === 1, `탭=${await t.g('탭')} 길이단계=${await t.g('궤적길이단계')} 배율=${await t.g('배율')}`);
    // 준비 상태에서 한 번 더 RESET → 프리셋 원래 값
    await t.btn(17); await t.answer(1); // 천체 C VX 변경(준비 상태)
    await t.btn(3); await t.wait(400);
    const orig = await t.snap();
    check('TEST 07 준비 상태 RESET → 프리셋 원래 값', Math.abs(orig.VX[2] - (-18.64815)) < 1e-9, `VX(C)=${orig.VX[2]}`);

    // ---------------- TEST 08 — 극단값 ----------------
    await preset(5);
    await t.btn(16); await t.answer('1e12'); let s8 = await t.snap();
    check('TEST 08 매우 큰 질량 → 최대값 제한', s8['질량'][1] === 1000000, `질량=${s8['질량'][1]} 안내="${await t.g('안내문구')}"`);
    await t.btn(16); await t.answer(-5); s8 = await t.snap();
    check('TEST 08 음수 질량 → 거부(기존 값 유지)', s8['질량'][1] === 1000000, `질량=${s8['질량'][1]} 안내="${await t.g('안내문구')}"`);
    await t.btn(16); await t.answer(0); s8 = await t.snap();
    check('TEST 08 질량 0 → 거부', s8['질량'][1] === 1000000, `안내="${await t.g('안내문구')}"`);
    await t.btn(17); await t.answer('abc'); s8 = await t.snap();
    check('TEST 08 숫자가 아닌 값 → 기존 값 유지', s8.VX[1] === 0, `VX=${s8.VX[1]} 안내="${await t.g('안내문구')}"`);
    await t.btn(18); await t.answer('99999'); s8 = await t.snap();
    check('TEST 08 매우 큰 속도 → 최대값 제한', s8.VY[1] === 500, `VY=${s8.VY[1]}`);
    await t.btn(16); await t.answer(10);
    // 매우 작은 거리: 충돌을 끄고 두 천체를 0.1 LU 까지 붙여서 실행 → 폭주 없이 유한값
    await t.set('충돌사용', 0);
    await t.btn(19); await t.answer(0.1); await t.btn(20); await t.answer(0); await t.btn(18); await t.answer(0);
    await t.btn(9); await runFor(1500);
    s8 = await t.snap();
    const prot = await t.Ln('보호작동');
    check('TEST 08 매우 작은 거리(0.1 LU, 충돌 끔) → 수치 폭주 없음', finite([...s8.X, ...s8.Y, ...s8.VX, ...s8.VY]) && (await page.evaluate(() => Entry.engine.isState('run'))),
        `유한값 OK, 가속도 제한 작동 ${prot[0]}회, 시간생략 ${prot[1]}회, 탈출 ${s8['탈출횟수']}`);
    await t.set('충돌사용', 1);
    // 존재하지 않는 천체 편집: 선택 해제 후 질량 버튼
    await t.btn(3); await t.wait(300);
    await t.click(-200, 90); // 빈 공간 클릭 → 선택 해제
    const btnSt = await t.Ln('버튼상태');
    check('TEST 08 선택 없음 → 편집 버튼 비활성', +(await t.g('선택천체')) === 0 && btnSt[15] === 3, `선택=${await t.g('선택천체')} 질량버튼=${btnSt[15]}`);

    // ---------------- TEST 09 — 천체 수 (SANDBOX 최대 8) ----------------
    await preset(5);
    const spots = [[-150, 60], [-150, -60], [-40, 80], [-40, -80], [60, 80], [60, -80], [-200, 0]];
    for (const [x, y] of spots) { await t.btn(23); await t.click(x, y); }
    s1 = await t.snap();
    const nAct = s1['활성'].reduce((a, b) => a + b, 0);
    const addState = (await t.Ln('버튼상태'))[22];
    await t.btn(23); await t.click(100, 0); const nAct2 = (await t.Ln('활성')).reduce((a, b) => a + b, 0);
    check('TEST 09 최대 8개까지 생성, 초과 거부', nAct === 8 && addState === 3 && nAct2 === 8, `활성 수=${nAct}, [+천체] 버튼상태=${addState}(3=비활성), 추가 시도 후 ${nAct2}`);
    for (const k of [3, 4, 5, 6, 7, 8]) { await clickBody(k); await t.btn(17); await t.answer((k % 2 ? 1 : -1) * 8); }
    await t.shot('s08_sandbox8_ready');
    const perf = async (spd) => {
        await t.btn(spd); await t.btn(1); await t.wait(600);
        const a = await page.evaluate(() => [+Entry.variableContainer.getVariableByName('스텝수').getValue(), performance.now(), +Entry.variableContainer.getVariableByName('프레임수').getValue()]);
        await t.wait(3000);
        const b = await page.evaluate(() => [+Entry.variableContainer.getVariableByName('스텝수').getValue(), performance.now(), +Entry.variableContainer.getVariableByName('프레임수').getValue()]);
        await t.btn(2); await t.wait(200);
        return { fps: (b[2] - a[2]) / ((b[1] - a[1]) / 1000), sps: (b[0] - a[0]) / ((b[1] - a[1]) / 1000) };
    };
    const p1 = await perf(6);
    const p10 = await perf(9);
    await t.shot('s09_sandbox8_running');
    s1 = await t.snap();
    check('TEST 09 8개 × 1배속 성능', p1.fps > 40, `${p1.fps.toFixed(1)} fps, ${p1.sps.toFixed(0)} 스텝/초`);
    check('TEST 09 8개 × 10배속 — 느려져도 안정적(유한값·오류 없음)', finite([...s1.X, ...s1.Y]) && errors.length === 0,
        `${p10.fps.toFixed(1)} fps, 실제 ${(p10.sps / 60).toFixed(1)}배속 (목표 10배속), 충돌 ${s1['충돌횟수']}회`);

    // ---------------- TEST 10 — 반복 실행 ----------------
    await preset(2);
    const fresh1 = await t.snap();
    await t.btn(9); await runFor(1500);
    await t.btn(27); await t.btn(28); // 비교 탭 → A 저장
    await preset(2);
    const fresh2 = await t.snap();
    const recN = (await t.L('기록_시간')).length;
    const eqData = ['질량', 'X', 'Y', 'VX', 'VY', '활성'].every((n) => fresh2[n].every((x, i) => x === fresh1[n][i]));
    check('TEST 10 같은 프리셋 재실행 → 이전 데이터 없음', eqData && +fresh2['시뮬레이션시간'] === 0 && +fresh2['스텝수'] === 0 && recN === 0 && +(await t.g('비교A저장')) === 0 && +fresh2['배속'] === 1,
        `t=${fresh2['시뮬레이션시간']} 스텝=${fresh2['스텝수']} 기록=${recN} A저장=${await t.g('비교A저장')}`);
    // 병합으로 끝난 P1 → 다시 P1: 천체 2개 복구
    await preset(1);
    await t.btn(18); await t.answer(5); await t.btn(9); await t.btn(1);
    for (let k = 0; k < 40 && (await t.g('상태')) === 'RUNNING'; k++) { await t.wait(200); }
    await preset(1);
    const again = await t.snap();
    check('TEST 10 충돌로 끝난 프리셋 재시작 → 천체 2개·질량 복구', again['활성'].slice(0, 2).join('') === '11' && again['질량'][0] === 10000 && again['반지름'][0] === 12,
        `활성=${again['활성'].slice(0, 2)} 질량=${again['질량'][0]} r=${again['반지름'][0]}`);

    // ---------------- 추가: 탈출 속도 비교 실험 (A/B) ----------------
    await preset(2);
    await t.btn(9); await runFor(2500);
    await t.btn(27); await t.wait(200); await t.btn(28); await t.wait(300);
    const A = { max: await t.g('A_최대거리'), res: await t.g('A_결과') };
    await t.btn(3); await t.wait(300);
    await t.btn(18); await t.answer(60);
    await t.btn(9); await t.btn(1);
    for (let k = 0; k < 60 && (await t.g('상태')) === 'RUNNING'; k++) { await t.wait(250); }
    s1 = await t.snap();
    check('추가 탈출 실험: VY 50 → 묶인 궤도(최대 거리 유한), VY 60 → 탈출 후 종료', +A.max > 100 && +A.max < 200 && +s1['탈출횟수'] === 1 && s1['상태'] === 'FINISHED',
        `A 최대거리=${(+A.max).toFixed(1)} (이론 원점 180), B 탈출=${s1['탈출횟수']} 상태=${s1['상태']} t=${(+s1['시뮬레이션시간']).toFixed(1)}`);
    await t.btn(27); await t.wait(500);
    await t.shot('s10_escape_compare');

    // ---------------- 추가: 선택/드래그/이름/키보드 ----------------
    await preset(3);
    await clickBody(2);
    check('클릭으로 천체 선택', +(await t.g('선택천체')) === 2, `선택=${await t.g('선택천체')}`);
    await t.key('n');
    check('N 키 → 다음 천체 선택', +(await t.g('선택천체')) === 1, `선택=${await t.g('선택천체')}`);
    const before = await t.snap();
    const cx = +(await t.g('중심X')), cy = +(await t.g('중심Y'));
    await t.drag(cx + before.X[0], cy + before.Y[0], cx - 80, cy + 40);
    const dragged = await t.snap();
    check('EXPERIMENT 드래그로 위치 이동 (잡은 지점 유지)', Math.abs(dragged.X[0] - (-80)) < 6 && Math.abs(dragged.Y[0] - 40) < 6 && Math.abs(dragged.X[0] - before.X[0]) > 20, `X,Y=(${dragged.X[0]}, ${dragged.Y[0]})`);
    await t.key(' '); await t.wait(500);
    check('스페이스 키 → 재생', (await t.g('상태')) === 'RUNNING', `상태=${await t.g('상태')}`);
    await t.key(' '); await t.wait(200);
    check('스페이스 키 → 일시정지', (await t.g('상태')) === 'PAUSED', `상태=${await t.g('상태')}`);
    await t.btn(26); await t.wait(400); await t.shot('s11_binary_analysis');
    await preset(5);
    await t.btn(22); await t.answer('지구형'); s1 = await t.snap();
    check('SANDBOX 이름 편집', s1.names[1] === '지구형', `이름=${s1.names[1]}`);
    await t.btn(22); await t.answer('아주아주긴이름입니다'); s1 = await t.snap();
    check('이름 9자 이상 → 거부', s1.names[1] === '지구형', `이름=${s1.names[1]}`);
    await t.btn(24); await t.wait(200); s1 = await t.snap();
    check('SANDBOX 삭제', s1['활성'][1] === 0 && +s1['선택천체'] === 0, `활성=${s1['활성'].slice(0, 2)}`);

    const toasts = await page.evaluate(() => window.__toasts);
    check('엔트리 오류 알림/페이지 오류 없음', errors.length === 0 && toasts.length === 0, `pageerror=${errors.length} toast=${toasts.length} ${errors.concat(toasts).slice(0, 3).join(' | ')}`);
    const pass = results.filter((r) => r.ok).length;
    console.log(`LOG: SUMMARY ${pass}/${results.length} passed`);
    require('fs').writeFileSync(require('path').join(__dirname, 'shots', 'test_results.json'), JSON.stringify(results, null, 1));
    return pass === results.length ? 0 : 1;
};
