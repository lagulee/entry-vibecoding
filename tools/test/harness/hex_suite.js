// HEX — 실제 entryjs 엔진에서 돌리는 테스트
//   node tools/test/harness/run.js dist/HEX.ent tools/test/harness/hex_suite.js
const lib = require('./lib');
const L = require('../../hex_layout.js');
const AI = require('../../hex_ai.js');

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok: !!ok });
    console.log(`LOG: ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

module.exports = async (page) => {
    const t = lib(page);
    const errors = [];
    page.on('pageerror', (e) => { if (!/reading 'default'|load sound/.test(String(e))) errors.push(String(e)); });
    await page.evaluate(() => {
        window.__toasts = [];
        const orig = Entry.toast.alert.bind(Entry.toast);
        Entry.toast.alert = (...a) => { window.__toasts.push(a.join(' ')); return orig(...a); };
    });
    await page.evaluate(() => Entry.engine.toggleRun());
    await t.wait(1500);

    const g = (n) => t.g(n);
    const btn = async (id, ms = 350) => { const b = L.BUTTONS.find((x) => x.id === id); await t.click(b.x, b.y); await t.wait(ms); };
    const board = () => page.evaluate(() => Entry.variableContainer.getListByName('판').getArray().map((x) => +x.data));
    const until = async (cond, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return Date.now() - t0; await t.wait(40); } return -1; };
    const cellXY = async (k) => {
        const N = +await g('보드크기'); const X0 = +await g('기준X'); const Y0 = +await g('기준Y'); const w = +await g('칸폭'); const dy = +await g('줄간격');
        const r = Math.floor((k - 1) / N); const q = (k - 1) % N;
        return [X0 + (q + r / 2) * w, Y0 - r * dy];
    };
    const clickCell = async (k) => { const [x, y] = await cellXY(k); await t.click(x, y); };
    const settled = () => until(async () => ['PLAY', 'OVER'].includes(await g('상태')));
    const idx = (N, r, q) => r * N + q + 1;
    const setup = async ({ mode = 'AI', level = 2, N = 7, color = 1 }) => {
        await page.evaluate(([m, lv, n, c]) => {
            const V = (k) => Entry.variableContainer.getVariableByName(k);
            V('모드').setValue(m); V('난이도').setValue(lv); V('보드크기').setValue(n); V('내색').setValue(c); V('화면').setValue('SETUP');
        }, [mode, level, N, color]);
        await t.wait(300);
        await btn(20, 700);
    };

    // ---------------- 1. 화면 흐름 ----------------
    await t.shot('x01_title');
    check('시작 → 타이틀 화면', (await g('화면')) === 'TITLE');
    await btn(2, 400); await t.shot('x02_help');
    check('게임 방법 열기', (await g('화면')) === 'HELP');
    await btn(3, 400);
    check('게임 방법 닫기 → 타이틀', (await g('화면')) === 'TITLE');
    await btn(1, 400);
    check('게임 시작 → 대국 설정', (await g('화면')) === 'SETUP');
    await btn(11); await btn(12); await btn(15); await btn(19);
    check('2인 대전 선택 · 난이도/색 버튼 비활성', (await g('모드')) === '2P' && +(await t.L('버튼상태'))[11] === 3 && +(await t.L('버튼상태'))[18] === 3);
    check('보드 크기 5×5 선택', +(await g('보드크기')) === 5);
    await btn(10); await btn(14); await btn(17); await btn(18);
    check('AI 대전 · 어려움 · 9×9 · 빨강', (await g('모드')) === 'AI' && +(await g('난이도')) === 3 && +(await g('보드크기')) === 9 && +(await g('내색')) === 1);
    await t.shot('x03_setup');
    await btn(21);
    check('뒤로 → 타이틀', (await g('화면')) === 'TITLE');

    // ---------------- 2. 2인 대전: 승리 판정 · 되돌리기 ----------------
    await setup({ mode: '2P', N: 5 });
    check('2인 대전 5×5 시작', (await g('화면')) === 'GAME' && (await g('상태')) === 'PLAY' && +(await g('NN')) === 25);
    // 빨강: 3행 가로줄 (r=2, q=0..4), 파랑: 1행 q=0..3
    const redLine = [0, 1, 2, 3, 4].map((q) => idx(5, 2, q));
    const blueLine = [0, 1, 2, 3].map((q) => idx(5, 0, q));
    await clickCell(redLine[0]); await settled();
    check('빈 칸 클릭 → 빨강 돌', (await board())[redLine[0] - 1] === 1 && +(await g('차례')) === 2);
    await clickCell(redLine[0]); await settled();
    check('이미 놓인 칸 클릭은 무시', +(await g('수')) === 1);
    await btn(30); await t.wait(200);
    check('되돌리기 (2인: 한 수)', +(await g('수')) === 0 && (await board())[redLine[0] - 1] === 0 && +(await g('차례')) === 1);
    for (let k = 0; k < 5; k++) {
        await clickCell(redLine[k]); await settled();
        if (k < 4) { await clickCell(blueLine[k]); await settled(); }
    }
    await t.wait(600);
    const b1 = await board();
    check('빨강이 왼쪽↔오른쪽 연결 → 빨강 승리', (await g('상태')) === 'OVER' && +(await g('승자')) === 1, `상태=${await g('상태')} 승자=${await g('승자')} 수=${await g('수')}`);
    const winCells = (await t.L('승리칸')).map(Number);
    check('승리 길 = 빨강 가로줄 5칸', redLine.every((k) => winCells[k - 1] === 1) && winCells.slice(0, 25).reduce((a, b) => a + b, 0) === 5);
    check('판 상태 일치', redLine.every((k) => b1[k - 1] === 1) && blueLine.every((k) => b1[k - 1] === 2));
    check('2인 전적 빨강 +1', +(await g('빨강승')) === 1);
    await t.wait(200); await t.shot('x04_2p_red_win');
    await clickCell(idx(5, 4, 4)); await t.wait(300);
    check('대국 끝난 뒤 클릭 무시', +(await g('수')) === 9);
    await btn(30); await t.wait(200);
    check('대국 끝난 뒤 되돌리기 불가', +(await g('수')) === 9);

    // 파랑 승리 (세로 연결): 파랑은 q=1 열, 빨강은 흩어 둔다
    await btn(31, 600);
    check('새 대국 → 판 비움', (await board()).every((x) => x === 0) && +(await g('수')) === 0);
    const blueCol = [0, 1, 2, 3, 4].map((r) => idx(5, r, 1));
    const redScatter = [idx(5, 0, 3), idx(5, 1, 3), idx(5, 3, 3), idx(5, 4, 3), idx(5, 2, 4)];
    for (let k = 0; k < 5; k++) {
        await clickCell(redScatter[k]); await settled();
        await clickCell(blueCol[k]); await settled();
    }
    await t.wait(400);
    check('파랑이 위↔아래 연결 → 파랑 승리', (await g('상태')) === 'OVER' && +(await g('승자')) === 2, `승자=${await g('승자')}`);
    check('2인 전적 파랑 +1', +(await g('파랑승')) === 1);

    // 대각선으로 꺾인 연결 (빨강: 이웃 방향 (r+1,q-1) 포함)
    await btn(31, 600);
    const zig = [idx(5, 4, 0), idx(5, 3, 1), idx(5, 2, 2), idx(5, 1, 3), idx(5, 0, 4)];
    const blueSide = [idx(5, 0, 0), idx(5, 1, 0), idx(5, 2, 0), idx(5, 3, 0)];
    for (let k = 0; k < 5; k++) {
        await clickCell(zig[k]); await settled();
        if (k < 4) { await clickCell(blueSide[k]); await settled(); }
    }
    await t.wait(300);
    check('대각선 연결도 승리 인정', +(await g('승자')) === 1);

    // 마우스 좌표 → 칸: 9×9 모든 칸 가운데를 눌러 번호 확인
    await setup({ mode: '2P', N: 9 });
    let hitOk = 0;
    for (let k = 1; k <= 81; k++) {
        const [x, y] = await cellXY(k);
        await page.mouse.move(...(await (async () => { const r = await page.evaluate(() => { const r = document.querySelector('#entryCanvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }); return [r.x + (x + 240) / 480 * r.w, r.y + (135 - y) / 270 * r.h]; })()));
        await t.wait(40);
        if (+(await g('호버칸')) === k) hitOk++;
    }
    check('9×9 모든 칸 마우스 위치 → 칸 번호', hitOk === 81, `${hitOk}/81`);

    // ---------------- 3. AI == 기준 구현 ----------------
    // 기준 AI 끼리 둔 대국에서 여러 국면을 뽑아, 엔트리 AI 가 같은 수를 두는지 비교 (흔들기 0)
    await t.set('테스트', 1);
    let rs = 777;
    const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
    const positions = [];
    for (const N of [5, 7, 9]) {
        for (let gIdx = 0; gIdx < 3; gIdx++) {
            const b = new Array(N * N + 1).fill(0);
            let p = 1; let last = 0; const hist = [];
            for (;;) {
                const lv = 1 + Math.floor(rnd() * 3);
                const m = rnd() < 0.3 ? (() => { const e = []; for (let i = 1; i <= N * N; i++) if (!b[i]) e.push(i); return e[Math.floor(rnd() * e.length)]; })() : AI.chooseMove(b, N, p, lv, rnd, last).move;
                b[m] = p; last = m; hist.push(m);
                if (AI.winner(b, N)) break;
                p = 3 - p;
            }
            // 대국 중간 국면 몇 개 (승부가 나기 전)
            for (const frac of [0.3, 0.6, 0.9]) {
                const n = Math.max(1, Math.floor(hist.length * frac) - 1);
                positions.push({ N, hist: hist.slice(0, n) });
            }
        }
    }
    let same = 0; let total = 0; const why = {}; let maxMs = 0; const times = {};
    for (const pos of positions) {
        for (const level of [1, 2, 3]) {
            const N = pos.N;
            const b = new Array(N * N + 1).fill(0);
            pos.hist.forEach((m, i) => { b[m] = i % 2 === 0 ? 1 : 2; });
            const turn = pos.hist.length % 2 === 0 ? 1 : 2;
            const last = pos.hist[pos.hist.length - 1] || 0;
            const ref = AI.chooseMove(b.slice(), N, turn, level, () => 0, last);
            // 엔트리에 국면 넣기: AI 가 turn 색, 사람은 반대 색
            await settled();
            await page.evaluate(([N, hist, level, turn]) => {
                const V = (k) => Entry.variableContainer.getVariableByName(k);
                V('모드').setValue('AI'); V('난이도').setValue(level); V('보드크기').setValue(N); V('내색').setValue(3 - turn);
                V('상태').setValue('OVER');
            }, [N, pos.hist, level, turn]);
            await page.evaluate(() => { const V = (k) => Entry.variableContainer.getVariableByName(k); V('화면').setValue('SETUP'); });
            await t.wait(120);
            await page.evaluate(([N, hist, turn]) => {
                const V = (k) => Entry.variableContainer.getVariableByName(k);
                const Lb = Entry.variableContainer.getListByName('판');
                const Lh = Entry.variableContainer.getListByName('기록');
                V('보드크기').setValue(N); V('NN').setValue(N * N);
                for (let i = 1; i <= 81; i++) Lb.replaceValue(i, 0);
                hist.forEach((m, i) => { Lb.replaceValue(m, i % 2 === 0 ? 1 : 2); Lh.replaceValue(i + 1, m); });
                V('수').setValue(hist.length); V('차례').setValue(turn); V('마지막수').setValue(hist[hist.length - 1] || 0);
                V('승자').setValue(0); V('화면').setValue('GAME'); V('상태').setValue('THINK');
                V('게임번호').setValue(+V('게임번호').getValue() + 1);
                const msg = Entry.variableContainer.messages_.find((m) => m.name === 'AI 차례');
                Entry.engine.raiseMessage(msg.id);
            }, [N, pos.hist, turn]);
            const ms = await until(async () => ['PLAY', 'OVER'].includes(await g('상태')), 30000);
            const got = +(await g('AI수'));
            total++;
            if (got === ref.move) same++;
            else console.log(`LOG:   diff N=${N} lv=${level} n=${pos.hist.length} entry=${got}(${await g('AI이유')}) ref=${ref.move}(${ref.reason})`);
            why[ref.reason] = (why[ref.reason] || 0) + 1;
            const key = `${N}/L${level}`;
            times[key] = Math.max(times[key] || 0, ms);
            maxMs = Math.max(maxMs, ms);
        }
    }
    check('AI 수 == 기준 AI 수 (흔들기 0)', same === total, `${same}/${total} · 규칙별 ${JSON.stringify(why)}`);
    console.log(`LOG:   AI 최대 계산 시간(ms, 0.3초 기다림 포함) ${JSON.stringify(times)}`);
    await t.set('테스트', 0);

    // ---------------- 4. AI 대전 완주 (사람=무작위 클릭) ----------------
    for (const [N, level, color] of [[5, 3, 1], [7, 2, 2], [9, 3, 1]]) {
        await setup({ mode: 'AI', level, N, color });
        let moves = 0;
        for (let guard = 0; guard < 200; guard++) {
            await settled();
            if ((await g('상태')) === 'OVER') break;
            const b = await board();
            const empty = []; for (let i = 1; i <= N * N; i++) if (!b[i - 1]) empty.push(i);
            await clickCell(empty[Math.floor(rnd() * empty.length)]);
            moves++;
            await t.wait(100);
        }
        await t.wait(800);
        const b = await board();
        const ref = AI.winner([0, ...b.slice(0, N * N)], N);
        check(`AI 대전 완주 ${N}×${N} ${['', '쉬움', '보통', '어려움'][level]} (사람 ${color === 1 ? '빨강' : '파랑'})`, (await g('상태')) === 'OVER' && +(await g('승자')) === ref && ref === 3 - color,
            `승자=${await g('승자')} 기준=${ref} 수=${await g('수')}`);
        if (N === 9) await t.shot('x05_ai_win_9');
    }
    // AI 대전 되돌리기: 두 수
    await setup({ mode: 'AI', level: 1, N: 7, color: 1 });
    await clickCell(idx(7, 3, 3)); await settled();
    await clickCell(idx(7, 0, 0)); await settled();
    const before = +(await g('수'));
    await btn(30); await t.wait(250);
    check('AI 대전 되돌리기 → 내 수까지 두 수', before === 4 && +(await g('수')) === 2 && +(await g('차례')) === 1);
    // 힌트: 사람 차례에 AI(어려움)가 추천 수를 계산 → 기준 AI 와 같은 칸
    await t.set('테스트', 1);
    await btn(33, 100);
    await until(async () => (await g('상태')) === 'PLAY');
    await t.wait(200);
    {
        const b = [0, ...(await board()).slice(0, 49)];
        const ref = AI.chooseMove(b, 7, 1, 3, () => 0, +(await g('마지막수')));
        const h = +(await g('힌트칸'));
        check('힌트 = 기준 AI(어려움) 추천 수', h > 0 && h === ref.move && +(await g('힌트수')) === 1, `힌트=${h} 기준=${ref.move}`);
    }
    await t.shot('x06_ai_game_hint');
    await t.set('테스트', 0);
    await clickCell(+(await g('힌트칸'))); await settled();
    check('힌트 칸에 두면 힌트 표시 사라짐', +(await g('힌트칸')) === 0 && +(await g('수')) === 4);
    // 사람이 AI 를 이기는 경우 (쉬움 AI 상대로 직접 이길 때까지 기준 AI 로 둔다)
    await setup({ mode: 'AI', level: 1, N: 5, color: 1 });
    for (let guard = 0; guard < 40; guard++) {
        await settled();
        if ((await g('상태')) === 'OVER') break;
        const b = [0, ...(await board()).slice(0, 25)];
        const m = AI.chooseMove(b, 5, 1, 3, () => 0.5, +(await g('마지막수'))).move;
        await clickCell(m); await t.wait(100);
    }
    await t.wait(700);
    await t.shot('x07_you_win');
    check('사람 승리 → AI 전적 승 +1', +(await g('승자')) === 1 && +(await t.L('AI승'))[0] === 1, `승자=${await g('승자')} AI승=${await t.L('AI승')}`);
    await t.wait(3500);
    await t.shot('x07b_win_path');
    await btn(32, 500);
    check('설정 · 메뉴 → 설정 화면', (await g('화면')) === 'SETUP');
    await btn(21, 500);
    await t.shot('x08_title_record');

    const toasts = await page.evaluate(() => window.__toasts);
    check('엔트리 오류 알림 없음', toasts.length === 0 && errors.length === 0, [...toasts, ...errors].slice(0, 3).join(' | '));
    const fail = results.filter((r) => !r.ok).length;
    console.log(`LOG: ${results.length - fail}/${results.length} passed`);
    return fail ? 1 : 0;
};
