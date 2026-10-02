// LIGHTS OUT — 실제 entryjs 엔진에서 돌리는 테스트
//   node tools/test/harness/run.js dist/LIGHTS_OUT.ent tools/test/harness/lo_suite.js
const lib = require('./lo_lib');
const S = require('../../lo_solver.js');
const L = require('../../lo_layout.js');

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok: !!ok, detail });
    console.log(`LOG: ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const R = S.rng(12345);
function randomBoard(n, presses) {
    let b = Array(n * n).fill(0);
    for (let k = 0; k < presses; k++) {
        b = S.press(n, b, Math.floor(R() * n * n));
    }
    return b;
}
const applyAll = (n, b, x) => x.reduce((acc, on, j) => (on ? S.press(n, acc, j) : acc), b);

module.exports = async (page) => {
    const t = lib(page);
    const errors = [];
    page.on('pageerror', (e) => {
        if (!/reading 'default'|load sound/.test(String(e))) {
            errors.push(String(e));
            console.log(`LOG: ERROR (${results.length} 번째 검사 뒤) ${String(e).slice(0, 200)}`);
        }
    });
    const btnStates = async () => (await t.Ln('버튼상태'));
    const setList = (name, i, value) => page.evaluate(([n, i, v]) => Entry.variableContainer.getListByName(n).replaceValue(i, v), [name, i, value]);
    const scr = () => t.g('화면');

    // 런타임 오류가 나면 엔트리가 작품을 멈추므로, 어떤 블록에서 났는지 기록한다
    await page.evaluate(() => {
        const orig = Entry.Utils.stopProjectWithToast;
        Entry.Utils.stopProjectWithToast = function (scope, message, error) {
            const fb = scope.funcExecutor && scope.funcExecutor.scope && scope.funcExecutor.scope.block;
            const V = (n) => Entry.variableContainer.getVariableByName(n).getValue();
            const pe = scope.executor || {};
            console.log(`LOG: STOP-STATE params=${JSON.stringify(scope.values)} parent=${JSON.stringify(pe.register && pe.register.params)} ` +
                ['판크기', '대전크기', '화면', '대전상태', 'AI목표', '선택칸', '풀이수', '커서1', '커서2', '켜진수1', '켜진수2', '모드'].map((n) => `${n}=${V(n)}`).join(' '));
            console.log(`LOG: STOP block=${scope.block && scope.block.type}#${scope.block && scope.block.id} func=${fb ? `${fb.type}#${fb.id}` : '-'} obj=${scope.entity && scope.entity.parent && scope.entity.parent.name} ${message || ''} ${error && error.message}`);
            return orig.apply(this, arguments);
        };
    });
    await page.evaluate(() => Entry.engine.toggleRun());
    await t.wait(1500);

    // ---------------- 01 시작 화면 ----------------
    let st = await btnStates();
    check('01 타이틀: 모드 카드 3개 + 방법/스킨 버튼만 보임', st.slice(0, 5).every((x) => x === 1) && st.slice(5).every((x) => x === 0), `상태=${st.join('')}`);
    await t.shot('lo_01_title');

    // ---------------- 02 방법 / 스킨 화면 ----------------
    await t.btn('help'); await t.wait(400);
    check('02 게임 방법 화면', (await scr()) === 'HELP');
    await t.shot('lo_02_help');
    await t.btn('helpBack'); await t.wait(300);
    await t.btn('skin'); await t.wait(400);
    st = await btnStates();
    const shapes = await t.L('버튼모양');
    check('02 스킨: 기본 스킨 사용 중, 나머지 잠김', st[6] === 4 && shapes[6] === 'b7a' && shapes[7] === 'b8l' && shapes[8] === 'b9l', `상태=${st.slice(6, 9)} 모양=${shapes.slice(6, 9)}`);
    await t.btn('skin2'); await t.wait(300);
    check('02 잠긴 스킨은 고를 수 없음', +(await t.g('스킨')) === 1);
    await t.shot('lo_02_skin_locked');
    await t.btn('skinBack'); await t.wait(300);

    // ---------------- 03 스테이지 선택 ----------------
    await t.btn('modePuzzle'); await t.wait(500);
    st = await btnStates();
    check('03 스테이지 목록: 1단계만 열림', (await scr()) === 'STAGES' && st[10] === 1 && st.slice(11, 40).every((x) => x === 3), `타일=${st.slice(10, 40).join('')}`);
    await t.btn('stage2'); await t.wait(300);
    check('03 잠긴 스테이지는 눌러도 시작 안 됨', (await scr()) === 'STAGES');

    // ---------------- 04 AI 풀이기 검증 (엔진 계산 vs JS 기준) ----------------
    const origBoard = (await t.L('스테이지판'))[0];
    const origSize = (await t.Ln('스테이지크기'))[0];
    const origPar = (await t.Ln('스테이지최소'))[0];
    let solverOk = 0;
    let solverTotal = 0;
    const solverFails = [];
    for (const n of [3, 4, 5]) {
        for (let trial = 0; trial < 10; trial++) {
            const b = randomBoard(n, 3 + Math.floor(R() * n * n));
            if (b.every((x) => x === 0)) {
                continue;
            }
            await setList('스테이지판', 1, b.join(''));
            await setList('스테이지크기', 1, n);
            await t.btn('stage1'); await t.wait(350);
            await t.btn('solve'); await t.wait(250);
            const x = (await t.Ln('풀이')).slice(0, n * n);
            const w = +(await t.g('풀이수'));
            const ref = S.solveMin(n, b);
            const cleared = applyAll(n, b, x).every((y) => y === 0);
            solverTotal++;
            if (cleared && w === ref.w && x.reduce((a, y) => a + y, 0) === w) {
                solverOk++;
            } else {
                solverFails.push(`${n}:${b.join('')} 엔진 w=${w} 기준 w=${ref.w} 해결=${cleared}`);
            }
            await t.btn('list'); await t.wait(300);
        }
    }
    check('04 AI 풀이기: 3×3·4×4·5×5 무작위 판에서 해가 맞고 최소 누름 수가 기준과 같음', solverOk === solverTotal, `${solverOk}/${solverTotal} ${solverFails.slice(0, 2).join(' | ')}`);
    await setList('스테이지판', 1, origBoard);
    await setList('스테이지크기', 1, origSize);
    await setList('스테이지최소', 1, origPar);

    // ---------------- 05 힌트 ----------------
    await t.btn('stage1'); await t.wait(500);
    await t.shot('lo_05_stage1');
    await t.btn('hint'); await t.wait(400);
    const hintCell = +(await t.g('힌트칸'));
    const sol1 = S.solveMin(3, (await t.board(1)));
    check('05 AI 힌트: 최소 해에 속한 칸을 알려 줌', hintCell > 0 && sol1.x[hintCell - 1] === 1 && +(await t.g('힌트수')) === 1, `힌트칸=${hintCell}`);
    await t.shot('lo_05_hint');
    await t.cell(1, hintCell); await t.wait(700);
    check('05 힌트 칸 누름 → 클리어, 힌트 사용 시 최대 ★★', (await t.g('오버레이')) === 'CLEAR' && +(await t.g('클리어별')) === 2, `별=${await t.g('클리어별')}`);
    await t.shot('lo_05_clear');
    await t.btn('clearRetry'); await t.wait(500);

    // ---------------- 06 키보드 ----------------
    await t.btn('list'); await t.wait(300);
    await setList('별', 1, 0); // 1단계 기록 초기화(다음 시험을 위해)
    await t.btn('stage1'); await t.wait(500);
    const b0 = await t.board(1);
    const cur0 = +(await t.g('커서1'));
    await t.key('w'); await t.key('a');
    const cur1 = +(await t.g('커서1'));
    check('06 WASD 로 커서 이동 (가운데 5 → 위 → 왼쪽 = 1)', cur0 === 5 && cur1 === 1, `${cur0}→${cur1}`);
    await t.key('a'); await t.key('w');
    check('06 판 밖으로는 안 나감', +(await t.g('커서1')) === 1);
    await t.key('d'); await t.key('s'); await t.key('s'); await t.key('d'); // → 9 (1단계 답은 1번 칸이라 다른 칸을 누른다)
    check('06 D·S 이동', +(await t.g('커서1')) === 9);
    await t.key('Space'); await t.wait(200);
    const b1 = await t.board(1);
    const exp = S.press(3, b0, 8);
    check('06 스페이스 = 커서 칸 누르기 (자신+이웃 뒤집힘)', b1.join('') === exp.join('') && +(await t.g('이동수')) === 1, `${b0.join('')}→${b1.join('')}`);
    await t.shot('lo_06_keyboard');
    await t.key('r'); await t.wait(300);
    check('06 R = 다시하기', (await t.board(1)).join('') === b0.join('') && +(await t.g('이동수')) === 0);
    await t.key('h'); await t.wait(300);
    check('06 H = AI 힌트', +(await t.g('힌트칸')) > 0);
    await t.key('Escape'); await t.wait(400);
    check('06 ESC = 메뉴로', (await scr()) === 'TITLE');

    // ---------------- 07 30개 스테이지 모두 최소 횟수로 클리어 ----------------
    await t.btn('modePuzzle'); await t.wait(400);
    await t.btn('stage1'); await t.wait(500);
    const stageFails = [];
    const skinMsgs = {};
    for (let k = 1; k <= 30; k++) {
        const n = +(await t.g('판크기'));
        const b = await t.board(1);
        const par = +(await t.g('최소수'));
        const ref = S.solveMin(n, b);
        if (ref.w !== par || +(await t.g('스테이지')) !== k) {
            stageFails.push(`${k}: par=${par} 기준=${ref.w}`);
        }
        for (let j = 0; j < n * n; j++) {
            if (ref.x[j]) {
                await t.cell(1, j + 1);
            }
        }
        await t.wait(300);
        const ov = await t.g('오버레이');
        const stars = +(await t.g('클리어별'));
        if (ov !== 'CLEAR' || stars !== 3 || +(await t.g('이동수')) !== par) {
            stageFails.push(`${k}: 오버레이=${ov} 별=${stars} 이동=${await t.g('이동수')}`);
        }
        if (+(await t.g('새스킨')) > 0) {
            skinMsgs[k] = `${await t.g('새스킨')}@${await t.g('총별')}`;
        }
        if (k === 21) {
            await t.shot('lo_07_clear_5x5');
        }
        if (k < 30) {
            await t.btn('next'); await t.wait(450);
        }
    }
    const starsAll = await t.Ln('별');
    check('07 30개 스테이지: 각 판의 AI 최소 수 = 기준, 최소 수로 깨면 ★★★', stageFails.length === 0 && starsAll.every((x) => x === 3), stageFails.slice(0, 3).join(' | ') || `별 합=${starsAll.reduce((a, x) => a + x, 0)}`);
    check('07 총 별 90, 20★·45★ 에서 새 스킨 해금 알림', +(await t.g('총별')) === 90 && Object.values(skinMsgs).length === 2, JSON.stringify(skinMsgs));
    st = await btnStates();
    check('07 마지막 스테이지: [다음] 비활성', st[L.byKey.next.id - 1] === 3);
    await t.btn('clearList'); await t.wait(400);
    st = await btnStates();
    check('07 모든 타일 열림', st.slice(10, 40).every((x) => x === 1));
    await t.shot('lo_07_stages_all');
    // 기록 유지 + AI 풀이 보기 화면
    await t.btn('stage25'); await t.wait(500);
    await t.btn('solve'); await t.wait(400);
    await t.shot('lo_07_solve_view');
    const solveBoard = await t.board(1);
    const marks = (await t.Ln('풀이')).slice(0, 25);
    check('07 AI 풀이 보기: 표시된 칸을 누르면 풀림', applyAll(5, solveBoard, marks).every((x) => x === 0) && marks.reduce((a, x) => a + x, 0) === +(await t.g('풀이수')));
    const k0 = marks.indexOf(1) + 1;
    await t.cell(1, k0); await t.wait(300);
    check('07 누를 때마다 AI 풀이 갱신', +(await t.g('풀이수')) === marks.reduce((a, x) => a + x, 0) - 1);
    await t.btn('list'); await t.wait(300);
    check('07 다시 해도 최고 기록(★3) 유지', (await t.Ln('별'))[24] === 3);

    // ---------------- 08 스킨 ----------------
    await t.btn('stagesBack'); await t.wait(300);
    await t.btn('skin'); await t.wait(400);
    st = await btnStates();
    check('08 별 90개 → 모든 스킨 선택 가능', st[7] === 1 && st[8] === 1);
    await t.btn('skin3'); await t.wait(300);
    check('08 스킨 3(별빛) 선택', +(await t.g('스킨')) === 3 && (await t.L('버튼모양'))[8] === 'b9a');
    await t.shot('lo_08_skins');
    await t.btn('skinBack'); await t.wait(300);
    await t.btn('modePuzzle'); await t.wait(300);
    await t.btn('stage28'); await t.wait(600);
    await t.shot('lo_08_skin3_board');
    await t.key('Escape'); await t.wait(300);
    await t.btn('skin'); await t.wait(300); await t.btn('skin2'); await t.wait(300); await t.btn('skinBack'); await t.wait(300);
    await t.btn('modePuzzle'); await t.wait(300);
    await t.btn('stage18'); await t.wait(600);
    await t.shot('lo_08_skin2_board');
    await t.key('Escape'); await t.wait(300);
    await t.btn('skin'); await t.wait(300); await t.btn('skin1'); await t.wait(300); await t.btn('skinBack'); await t.wait(300);

    // ---------------- 09 AI 대전 (어려움, 4×4): 사람이 가만히 있으면 AI 승리 ----------------
    await t.btn('modeAI'); await t.wait(400);
    st = await btnStates();
    check('09 AI 대전 설정: 난이도 3단계 + 판 크기 + 시작', [49, 50, 51, 52, 53, 54].every((id) => st[id - 1] === 1));
    await t.btn('lv3'); await t.btn('size4'); await t.wait(200);
    await t.shot('lo_09_vsset_ai');
    await t.btn('raceStart'); await t.wait(700);
    await t.shot('lo_09_countdown');
    await t.waitFor(async () => (await t.g('대전상태')) === 'PLAY', 6000);
    const sym = (n, b) => { // 8가지 회전·뒤집기
        const T = [(r, c) => [r, c], (r, c) => [c, n - 1 - r], (r, c) => [n - 1 - r, n - 1 - c], (r, c) => [n - 1 - c, r],
            (r, c) => [r, n - 1 - c], (r, c) => [n - 1 - r, c], (r, c) => [c, r], (r, c) => [n - 1 - c, n - 1 - r]];
        return T.map((f) => { const o = Array(n * n); for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) { const [r2, c2] = f(r, c); o[r2 * n + c2] = b[r * n + c]; } } return o.join(''); });
    };
    let bA = await t.board(1);
    let bB = await t.board(2);
    let refA = S.solveMin(4, bA);
    let refB = S.solveMin(4, bB);
    check('09 내 판과 AI 판은 서로 다르고(회전·뒤집기로도 같지 않음) 최소 누름 수는 같음(4~6)',
        !sym(4, bB).includes(bA.join('')) && refA.w === refB.w && refA.w >= 4 && refA.w <= 6 && bA.some((x) => x),
        `내 판=${bA.join('')} AI 판=${bB.join('')} 최소=${refA.w}/${refB.w}`);
    // 악용 재현: AI 가 누르는 칸을 그대로 내 판에 따라 누른다
    let copied = 0;
    let seen = 0;
    while ((await t.g('대전상태')) === 'PLAY') {
        const n2 = +(await t.g('누른수2'));
        if (n2 > seen) {
            seen = n2;
            await t.cell(1, +(await t.g('AI목표')));
            copied++;
            if (copied === 1) {
                await t.shot('lo_09_ai_playing');
            }
        } else {
            await t.wait(40);
        }
    }
    check('09 [악용 방지] AI 를 따라 눌러도 내 판은 풀리지 않음 → AI 승리',
        +(await t.g('라운드승자')) === 2 && +(await t.g('누른수2')) === refB.w && +(await t.g('켜진수2')) === 0 && +(await t.g('켜진수1')) > 0 && copied >= refB.w - 1, // AI 의 마지막 누름으로 라운드가 끝나므로 그 직전까지 모두 따라 누름
        `따라 누름 ${copied}번, 내 판 남은 불 ${await t.g('켜진수1')}, AI 누름 ${await t.g('누른수2')}(최소 ${refB.w}), ${(+(await t.g('라운드시간'))).toFixed(1)}s`);
    await t.wait(300);
    await t.shot('lo_09_round_ai');
    await t.waitFor(async () => (await t.g('오버레이')) === 'MATCH', 25000);
    check('09 AI 2선승 → 패배 화면', (await t.g('오버레이모양')) === 'ov_m_lose' && +(await t.g('점수1')) === 0 && +(await t.g('점수2')) === 2);
    await t.wait(300);
    await t.shot('lo_09_match_lose');

    // ---------------- 10 AI 대전 (쉬움): 사람이 최소 해로 먼저 끄면 승리 ----------------
    await t.btn('raceMenu'); await t.wait(300);
    await t.btn('modeAI'); await t.wait(300);
    await t.btn('lv1'); await t.wait(200);
    await t.btn('raceStart');
    for (let round = 1; round <= 2; round++) {
        await t.waitFor(async () => (await t.g('대전상태')) === 'PLAY', 8000);
        const b = await t.board(1);
        const ref = S.solveMin(4, b);
        const cells = ref.x.map((x, j) => (x ? j + 1 : 0)).filter(Boolean);
        for (const [i, c] of cells.entries()) {
            await t.cell(1, c);
            if (round === 1 && i === 1) {
                await t.shot('lo_10_race_both');
            }
        }
        await t.waitFor(async () => (await t.g('대전상태')) !== 'PLAY', 3000);
        check(`10 라운드 ${round}: 사람이 최소 해(${ref.w}번)로 먼저 끔 → 승리`, +(await t.g('라운드승자')) === 1 && +(await t.g('누른수1')) === ref.w, `AI 누름=${await t.g('누른수2')}`);
    }
    await t.waitFor(async () => (await t.g('오버레이')) === 'MATCH', 6000);
    check('10 2:0 → 승리 화면', (await t.g('오버레이모양')) === 'ov_m_win' && +(await t.g('점수1')) === 2);
    await t.wait(300);
    await t.shot('lo_10_match_win');

    // ---------------- 10b 동시에 끄면 무승부 ----------------
    await t.btn('rematch');
    await t.waitFor(async () => (await t.g('대전상태')) === 'PLAY', 8000);
    await page.evaluate(() => { const V = (n) => Entry.variableContainer.getVariableByName(n); V('켜진수1').setValue(0); V('켜진수2').setValue(0); });
    await t.waitFor(async () => (await t.g('오버레이')) === 'ROUND', 2000);
    check('10b 같은 순간에 둘 다 끄면 무승부 → 점수 없음, 라운드 다시', +(await t.g('라운드승자')) === 0 && (await t.g('오버레이모양')) === 'ov_r_draw' && +(await t.g('점수1')) === 0 && +(await t.g('점수2')) === 0);
    await t.wait(200);
    await t.shot('lo_10b_draw');
    await t.waitFor(async () => (await t.g('대전상태')) === 'COUNT', 4000);
    check('10b 무승부 뒤 다음 라운드 시작', +(await t.g('라운드')) === 2);

    // ---------------- 11 2인 대전 (5×5): P1 = WASD+스페이스, P2 = 방향키+엔터 ----------------
    await t.key('Escape'); await t.wait(400); // 무승부 시험 뒤 대전 중이므로 ESC 로 메뉴
    await t.btn('modePVP'); await t.wait(400);
    st = await btnStates();
    check('11 2인 대전 설정: 난이도 버튼 숨김', [49, 50, 51].every((id) => st[id - 1] === 0) && st[53] === 1);
    await t.btn('size5'); await t.wait(200);
    await t.shot('lo_11_vsset_pvp');
    await t.btn('raceStart');
    const keysFor = (who) => (who === 1 ? { up: 'w', down: 's', left: 'a', right: 'd', press: 'Space' } : { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', press: 'Enter' });
    const playByKeys = async (who, n) => {
        const b = await t.board(who);
        const ref = S.solveMin(n, b);
        const K = keysFor(who);
        for (let j = 0; j < n * n; j++) {
            if (!ref.x[j]) {
                continue;
            }
            const cur = +(await t.g(`커서${who}`)) - 1;
            const [r0, c0, r1, c1] = [Math.floor(cur / n), cur % n, Math.floor(j / n), j % n];
            for (let s = 0; s < Math.abs(r1 - r0); s++) {
                await page.keyboard.press(r1 > r0 ? K.down : K.up);
                await t.wait(40);
            }
            for (let s = 0; s < Math.abs(c1 - c0); s++) {
                await page.keyboard.press(c1 > c0 ? K.right : K.left);
                await t.wait(40);
            }
            await page.keyboard.press(K.press);
            await t.wait(80);
        }
        return ref.w;
    };
    // 라운드 1: P1 (키보드) — 그 전에 서로의 키가 섞이지 않는지 확인
    await t.waitFor(async () => (await t.g('대전상태')) === 'PLAY', 8000);
    const c2before = +(await t.g('커서2'));
    await page.keyboard.press('d'); await t.wait(100); await page.keyboard.press('a'); await t.wait(100);
    const c1before = +(await t.g('커서1'));
    await page.keyboard.press('ArrowLeft'); await t.wait(100); await page.keyboard.press('ArrowRight'); await t.wait(100);
    check('11 P1 키는 커서1만, P2 키는 커서2만 움직임', +(await t.g('커서2')) === c2before && +(await t.g('커서1')) === c1before && c1before === 13);
    let w1 = await playByKeys(1, 5);
    await t.waitFor(async () => (await t.g('대전상태')) !== 'PLAY', 3000);
    check('11 라운드 1: P1 이 WASD+스페이스로 풂 → P1 승', +(await t.g('라운드승자')) === 1 && +(await t.g('누른수1')) === w1 && +(await t.g('누른수2')) === 0, `최소=${w1}`);
    await t.shot('lo_11_round_p1');
    // 라운드 2: P2 (방향키)
    await t.waitFor(async () => (await t.g('대전상태')) === 'PLAY', 8000);
    await t.wait(200);
    await t.shot('lo_11_pvp_playing');
    const w2 = await playByKeys(2, 5);
    await t.waitFor(async () => (await t.g('대전상태')) !== 'PLAY', 3000);
    check('11 라운드 2: P2 가 방향키+엔터로 풂 → P2 승', +(await t.g('라운드승자')) === 2 && +(await t.g('누른수2')) === w2, `최소=${w2}`);
    // 라운드 3: P2 가 마우스로
    await t.waitFor(async () => (await t.g('대전상태')) === 'PLAY', 8000);
    const b3 = await t.board(2);
    const r3 = S.solveMin(5, b3);
    for (let j = 0; j < 25; j++) {
        if (r3.x[j]) {
            await t.cell(2, j + 1);
        }
    }
    await t.waitFor(async () => (await t.g('오버레이')) === 'MATCH', 6000);
    check('11 라운드 3: P2 마우스 클릭 → 1:2 로 P2 대전 승리', (await t.g('오버레이모양')) === 'ov_m_p2' && +(await t.g('점수1')) === 1 && +(await t.g('점수2')) === 2);
    await t.wait(300);
    await t.shot('lo_11_match_p2');
    await t.btn('rematch'); await t.wait(300);
    check('11 다시 대결 → 점수 초기화', +(await t.g('점수1')) === 0 && +(await t.g('점수2')) === 0 && +(await t.g('라운드')) === 1);

    // ---------------- 12 중간에 나가기 (남은 스레드가 화면을 바꾸지 않는지) ----------------
    await t.btn('raceExit'); await t.wait(300);
    check('12 카운트다운 중 나가기 → 설정 화면', (await scr()) === 'VSSET' && (await t.g('오버레이')) === '');
    await t.wait(3500);
    check('12 나간 뒤 라운드 진행이 멈춤', (await scr()) === 'VSSET' && (await t.g('대전상태')) === '' && (await t.g('오버레이')) === '');
    await t.btn('vsBack'); await t.wait(300);
    await t.btn('modeAI'); await t.wait(300); await t.btn('lv3'); await t.wait(100);
    await t.btn('raceStart');
    await t.waitFor(async () => (await t.g('대전상태')) === 'PLAY', 8000);
    // 대전 중 성능 측정 (칸 복제본 32 + 커서 2 + 텍스트 등)
    const f0 = [+(await t.g('프레임수')), Date.now()];
    await t.wait(2000);
    const f1 = [+(await t.g('프레임수')), Date.now()];
    const fps = ((f1[0] - f0[0]) / (f1[1] - f0[1])) * 1000;
    check('12 대전 중 프레임 속도', fps > 40, `${fps.toFixed(1)} fps (헤드리스 Chromium)`);
    await t.key('Escape'); await t.wait(200);
    const aiPress = +(await t.g('누른수2'));
    const aiBoard = (await t.board(2)).join('');
    await t.wait(3000);
    check('12 ESC 로 나간 뒤 AI 가 더 누르지 않음', (await scr()) === 'TITLE' && +(await t.g('누른수2')) === aiPress && (await t.board(2)).join('') === aiBoard);

    // ---------------- 13 효과음 ----------------
    const snd = await page.evaluate(async () => {
        const out = [];
        const obj = Entry.container.getAllObjects().find((o) => o.name === '소리');
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (const s of obj.sounds) {
            try {
                const buf = await (await fetch(s.fileurl)).arrayBuffer();
                const audio = await ctx.decodeAudioData(buf);
                out.push(`${s.name}:${audio.duration.toFixed(2)}`);
            } catch (e) {
                out.push(`${s.name}:ERR`);
            }
        }
        return out;
    });
    check('13 효과음 10개 MP3 디코딩', snd.length === 10 && snd.every((x) => !x.endsWith('ERR')), snd.join(' '));
    check('13 효과음 대기열이 비워짐(재생됨)', (await t.L('소리대기')).length === 0);

    // ---------------- 결과 ----------------
    check('99 실행 중 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
    const failed = results.filter((r) => !r.ok);
    console.log(`LOG: ===== ${results.length - failed.length}/${results.length} PASS =====`);
    return failed.length ? 1 : 0;
};
