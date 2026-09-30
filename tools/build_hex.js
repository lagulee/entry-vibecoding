'use strict';
/**
 * HEX — 엔트리 작품(.ent) 빌드 스크립트
 *
 *   node tools/build_hex.js <에셋폴더> <출력 .ent> [project.json 경로]
 *
 * 에셋 폴더는 tools/hex_art.js 가 만든 PNG + manifest.json.
 * AI 는 tools/hex_ai.js(기준 구현)와 같은 알고리즘을 블록으로 옮긴 것이다.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const G = require('./entrygen');
const L = require('./hex_layout');
const { geom } = require('./hex_geom');
const { GRID, SIZES, PERM_OFF, permTable, CANON } = require('./hex_canon');

const {
    Project, blk, val, add, sub, mul, div, abs, round, mod, quot, join, mouseX, mouseY,
    eq, ne, gt, lt, ge, le, and, or, not,
    v, setv, chgv, item, setItem,
    If, IfElse, Forever, Repeat, Wait, DeleteClone, send,
    onStart, onMsg, onClone, onObjClick, onMouseDown,
    goXY, show, hide, setSize, shape, setEffect, write,
    defineFunction, param, call, lget, lset,
} = G;

const [assetDir = 'assets/hex', outEnt = 'dist/HEX.ent', outJson] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json'), 'utf8'));

// ---------------------------------------------------------------------------
// 추가 블록 도우미
// ---------------------------------------------------------------------------
const rand = (a, b) => blk('calc_rand', [null, val(a), null, val(b), null]);
const sin = (a) => blk('calc_operation', [null, val(a), null, 'sin']);
const touchingMouse = () => blk('reach_something', [null, 'mouse', null]);
const turn = (deg) => blk('rotate_relative', [val(deg), null]);
const setRot = (deg) => blk('rotate_absolute', [val(deg), null]);
const growBy = (x) => blk('change_scale_size', [val(x), null]);
const addEffect = (eff, x) => blk('add_effect_amount', [eff, val(x), null]);
const cloneOf = (objId) => blk('create_clone', [objId, null]);
const stopRepeat = () => blk('stop_repeat', [null]);
const moveBy = (dx, dy) => [blk('move_x', [val(dx), null]), blk('move_y', [val(dy), null])];
const toFront = () => blk('change_object_index', ['FRONT', null]);

// 효과음 (보드 오브젝트에 달아 두고, 보드에서 부르는 함수 안에서 재생)
const SOUND_NAMES = ['place', 'place2', 'click', 'undo', 'win', 'lose', 'start'];
const SOUND_IDS = Object.fromEntries(SOUND_NAMES.map((n) => [n, G.hash()]));
const play = (name) => blk('sound_something_with_block', [blk('get_sounds', [SOUND_IDS[name]]), null]);

const INF = 999;
const NN_MAX = GRID * GRID;
const LEVEL_NAME = ['쉬움', '보통', '어려움'];
const NOISE = [3, 1, 0.25]; // tools/hex_ai.js LEVELS 와 같게
const LOOK = 5; // 어려움: 1수 탐색 후보 수

// ---------------------------------------------------------------------------
// 프로젝트 / 데이터
// ---------------------------------------------------------------------------
const P = new Project();
const OBJ = {
    button: P.reserveObject('버튼'),
    stone: P.reserveObject('돌'),
    confetti: P.reserveObject('축하'),
};

// 게임 상태
P.variable('화면', 'TITLE'); // TITLE · SETUP · HELP · GAME
P.variable('상태', 'PLAY'); // PLAY · THINK(AI 계산) · CHECK(승리 확인 중) · OVER
P.variable('모드', 'AI'); // AI · 2P
P.variable('난이도', 2);
P.variable('보드크기', 7);
P.variable('NN', 49);
P.variable('내색', 1); // AI 대전에서 사람 색 (1 빨강 · 2 파랑)
P.variable('차례', 1);
P.variable('수', 0);
P.variable('마지막수', 0);
P.variable('승자', 0);
P.variable('게임번호', 0);
P.variable('판갱신', 0);
P.variable('호버칸', 0);
P.variable('프레임', 0);
// 보드 좌표
P.variable('칸폭', 31);
P.variable('줄간격', 26.85);
P.variable('기준X', 0);
P.variable('기준Y', 0);
P.variable('돌크기', 50);
// 버튼
P.variable('눌린버튼', 0);
P.variable('버튼갱신', 0);
P.variable('버튼서명', '');
// 전적
P.variable('빨강승', 0);
P.variable('파랑승', 0);
// AI
P.variable('AI수', 0);
P.variable('최단', INF);
P.variable('흔들기', 1);
P.variable('테스트', 0); // 1 이면 흔들기 0 (테스트에서 기준 AI 와 수 비교)
P.variable('찾은승', 0);
P.variable('찾은막', 0);
P.variable('AI이유', '');
P.variable('AI레벨', 2); // AI 수 계산에 쓰는 난이도 (힌트는 3)
P.variable('힌트칸', 0);
P.variable('힌트수', 0);
P.variable('힌트표', 0);
P.variable('결과표', 0);
P.variable('AI표', 0);
// 복제본 지역 변수
P.variable('내버튼', 0, { object: OBJ.button });
P.variable('내갱신', -1, { object: OBJ.button });
P.variable('내상태', 0, { object: OBJ.button });
P.variable('내칸', 0, { object: OBJ.stone });
P.variable('돌갱신', -1, { object: OBJ.stone });
P.variable('내값', 0, { object: OBJ.stone });
P.variable('이전값', 0, { object: OBJ.stone });
P.variable('내vx', 0, { object: OBJ.confetti });
P.variable('내vy', 0, { object: OBJ.confetti });
P.variable('내회전', 0, { object: OBJ.confetti });

const zeros = (n) => Array(n).fill(0);
P.list('판', zeros(NN_MAX));
P.list('기록', zeros(NN_MAX));
P.list('승리칸', zeros(NN_MAX));
for (const m of ['M0', 'M1', 'O0', 'O1']) {
    P.list(m, zeros(NN_MAX));
}
P.list('점수', zeros(NN_MAX));
P.list('후보', zeros(NN_MAX));
P.list('후보칸', zeros(LOOK));
P.list('순서', permTable());
P.list('AI승', [0, 0, 0]);
P.list('AI패', [0, 0, 0]);

// 브리지 지키기 표: 칸 m(사이 칸)마다 최대 6개 (브리지 한쪽 돌, 다른 쪽 돌, 나머지 사이 칸)
// tools/hex_ai.js 의 검사 순서(칸 번호 오름차순 → 브리지 순서)를 그대로 따른다.
const BR_SLOTS = 6;
const BR_OFF = {};
{
    const A = [];
    const B = [];
    const X = [];
    let off = 0;
    for (const N of SIZES) {
        BR_OFF[N] = off;
        const g = geom(N);
        const table = Array.from({ length: N * N + 1 }, () => []);
        for (const c of g.cells) {
            for (const b of c.br) {
                if (b.to > c.i) {
                    table[b.a].push([c.i, b.to, b.b]);
                    table[b.b].push([c.i, b.to, b.a]);
                }
            }
        }
        for (let m = 1; m <= N * N; m++) {
            // 같은 사이 칸 m 에 대해 기준 AI 는 (c 오름차순, 브리지 순서) 로 처음 맞는 것을 고른다
            if (table[m].length > BR_SLOTS) {
                throw new Error(`bridge slots overflow at ${N}/${m}`);
            }
            for (let j = 0; j < BR_SLOTS; j++) {
                const e = table[m][j] || [0, 0, 0];
                A.push(e[0]);
                B.push(e[1]);
                X.push(e[2]);
            }
        }
        off += N * N * BR_SLOTS;
    }
    P.list('브리지A', A);
    P.list('브리지B', B);
    P.list('브리지X', X);
}

// 버튼 데이터 (버튼 번호로 바로 찾도록 id 자리에 저장)
const BTN_MAX = Math.max(...L.BUTTONS.map((b) => b.id));
{
    const bx = zeros(BTN_MAX);
    const by = zeros(BTN_MAX);
    for (const b of L.BUTTONS) {
        bx[b.id - 1] = b.x;
        by[b.id - 1] = b.y;
    }
    P.list('버튼X', bx);
    P.list('버튼Y', by);
    P.list('버튼상태', zeros(BTN_MAX));
    // 엔트리 '크기' = 보이는 가로·세로의 평균(px)
    const bs = zeros(BTN_MAX);
    for (const b of L.BUTTONS) {
        bs[b.id - 1] = (b.w + b.h) / 2;
    }
    P.list('버튼크기', bs);
}

['버튼 눌림', 'AI 차례', '대국 끝', '힌트'].forEach((m) => P.message(m));

// 자주 쓰는 식
const humanTurn = () => or(eq(v('모드'), '2P'), eq(v('차례'), v('내색')));
const cellX = (k) => add(v('기준X'), mul(add(mod(sub(k, 1), v('보드크기')), div(quot(sub(k, 1), v('보드크기')), 2)), v('칸폭')));
const cellY = (k) => sub(v('기준Y'), mul(quot(sub(k, 1), v('보드크기')), v('줄간격')));
const levelName = () => item('난이도이름', v('난이도'));
P.list('난이도이름', LEVEL_NAME);

/** 1..NN 칸을 펼쳐서 처리 (25칸 넘는 부분은 보드 크기로 감싸 한 번만 검사) */
function forCells(fn) {
    const part = (a, b) => {
        const out = [];
        for (let i = a; i <= b; i++) {
            out.push(...fn(i));
        }
        return out;
    };
    return [...part(1, 25), If(gt(v('NN'), 25), [...part(26, 49), If(gt(v('NN'), 49), part(50, 81))])];
}

// ---------------------------------------------------------------------------
// 함수: 거리 지도 (표준 9×9 격자, 펼친 이완 계산 · 1회 = 1프레임)
// ---------------------------------------------------------------------------
{
    const F = '거리 지도';
    const locals = ['기준', 'x', 'best', 'ch', 'a'];
    for (let k = 1; k <= NN_MAX; k++) {
        locals.push(`d${k}`, `w${k}`, `e${k}`);
    }
    defineFunction(F, ['거리 지도', { param: '선수' }, '변', { param: '변' }, '브리지', { param: '브리지' }, '출력', { param: '출력' }], () => {
        const Lg = (n) => lget(F, n);
        const Ls = (n, x) => lset(F, n, x);
        const pp = param(F, '선수');
        const body = [
            Ls('기준', add(add(item('보드오프셋', v('보드크기')), mul(add(mul(sub(pp, 1), 2), param(F, '변')), NN_MAX)), 0)),
        ];
        // 1) 불러오기: 표준 칸 k ← 실제 칸 순서[기준+k]
        for (let k = 1; k <= NN_MAX; k++) {
            body.push(
                Ls('a', item('순서', add(Lg('기준'), k))),
                IfElse(gt(Lg('a'), 0), [Ls('x', item('판', Lg('a')))], [Ls('x', 3)]),
                IfElse(eq(Lg('x'), 0), [Ls(`w${k}`, 1), Ls(`e${k}`, param(F, '브리지'))], [
                    IfElse(eq(Lg('x'), pp), [Ls(`w${k}`, 0)], [Ls(`w${k}`, INF)]),
                    Ls(`e${k}`, 0),
                ]),
                Ls(`d${k}`, INF)
            );
        }
        // 2) 이완: 앞→뒤, 뒤→앞 한 번씩. 값이 안 바뀔 때까지
        const relax = (c) => {
            const i = c.i;
            const inner = [Ls('best', CANON.onEdge.has(i) ? 0 : INF)];
            const t = CANON.tpl[i];
            if (t) {
                inner.push(If(eq(Lg(`e${t[0]}`), 1), [If(eq(Lg(`e${t[1]}`), 1), [Ls('best', 0)])]));
            }
            for (const n of c.nb) {
                inner.push(If(lt(Lg(`d${n}`), Lg('best')), [Ls('best', Lg(`d${n}`))]));
            }
            for (const b of c.br) {
                inner.push(If(lt(Lg(`d${b.to}`), Lg('best')), [If(eq(Lg(`e${b.a}`), 1), [If(eq(Lg(`e${b.b}`), 1), [Ls('best', Lg(`d${b.to}`))])])]));
            }
            inner.push(If(lt(add(Lg('best'), Lg(`w${i}`)), Lg(`d${i}`)), [Ls(`d${i}`, add(Lg('best'), Lg(`w${i}`))), Ls('ch', 1)]));
            return If(lt(Lg(`w${i}`), INF), inner);
        };
        const pass = [Ls('ch', 0)];
        for (const c of CANON.cells) {
            pass.push(relax(c));
        }
        for (const c of [...CANON.cells].reverse()) {
            pass.push(relax(c));
        }
        body.push(Ls('ch', 1), blk('repeat_while_true', [eq(Lg('ch'), 0), 'until', null], [pass]));
        // 3) 반대쪽 변(표준 격자 q = N-1)까지의 최단 거리
        body.push(Ls('best', INF));
        for (const N of SIZES) {
            const cmp = [];
            for (let r = 0; r < N; r++) {
                const k = r * GRID + (N - 1) + 1;
                cmp.push(If(lt(Lg(`d${k}`), Lg('best')), [Ls('best', Lg(`d${k}`))]));
            }
            body.push(If(eq(v('보드크기'), N), cmp));
        }
        body.push(setv('최단', Lg('best')));
        // 4) 실제 칸 번호로 내보내기
        ['M0', 'M1', 'O0', 'O1'].forEach((list, j) => {
            const out = [];
            for (let k = 1; k <= NN_MAX; k++) {
                out.push(Ls('a', item('순서', add(Lg('기준'), k))), If(gt(Lg('a'), 0), [setItem(list, Lg('a'), Lg(`d${k}`))]));
            }
            body.push(If(eq(param(F, '출력'), j + 1), out));
        });
        return body;
    }, { locals });
    P.list('보드오프셋', [0, 0, 0, 0, PERM_OFF[5], 0, PERM_OFF[7], 0, PERM_OFF[9]]);
}

// ---------------------------------------------------------------------------
// 함수: AI 보조 (1..NN 펼쳐서 한 프레임에)
// ---------------------------------------------------------------------------
defineFunction('한방 찾기', ['바로 이기는 칸 · 막아야 할 칸 찾기'], () => {
    const F = '한방 찾기';
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    return [
        Ls('승', 0), Ls('막', 0),
        ...forCells((i) => [If(eq(item('판', i), 0), [
            If(eq(Lg('승'), 0), [If(eq(add(item('M0', i), item('M1', i)), 2), [Ls('승', i)])]),
            If(eq(Lg('막'), 0), [If(eq(add(item('O0', i), item('O1', i)), 2), [Ls('막', i)])]),
        ])]),
        setv('찾은승', Lg('승')), setv('찾은막', Lg('막')),
    ];
}, { locals: ['승', '막'] });

defineFunction('점수 매기기', ['빈 칸 점수 매기기'], () => {
    const F = '점수 매기기';
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    return [
        Ls('best', 99999), Ls('bi', 0),
        ...forCells((i) => [
            setItem('후보', i, 0),
            IfElse(eq(item('판', i), 0), [
                Ls('t1', sub(add(item('M0', i), item('M1', i)), 1)),
                If(gt(Lg('t1'), 60), [Ls('t1', 60)]),
                Ls('t2', sub(add(item('O0', i), item('O1', i)), 1)),
                If(gt(Lg('t2'), 60), [Ls('t2', 60)]),
                Ls('s', add(add(Lg('t1'), Lg('t2')), mul(v('흔들기'), div(rand(0, 1000), 1000)))),
                setItem('점수', i, Lg('s')),
                If(lt(Lg('s'), Lg('best')), [Ls('best', Lg('s')), Ls('bi', i)]),
            ], [setItem('점수', i, 9999)]),
        ]),
        setv('AI수', Lg('bi')),
    ];
}, { locals: ['best', 'bi', 't1', 't2', 's'] });

defineFunction('후보 고르기', ['후보', { param: '번째' }, '고르기'], () => {
    const F = '후보 고르기';
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    return [
        Ls('best', 9000), Ls('bi', 0),
        ...forCells((i) => [If(eq(item('후보', i), 0), [If(lt(item('점수', i), Lg('best')), [Ls('best', item('점수', i)), Ls('bi', i)])])]),
        setItem('후보칸', param(F, '번째'), Lg('bi')),
        If(gt(Lg('bi'), 0), [setItem('후보', Lg('bi'), 1)]),
    ];
}, { locals: ['best', 'bi'] });

defineFunction('AI 수 계산', ['AI 수 계산'], () => {
    const F = 'AI 수 계산';
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    const me = Lg('나');
    const op = Lg('상대');
    const undecided = (body) => If(eq(Lg('결정'), 0), body);
    const decide = (x, why) => [setv('AI수', x), Ls('결정', 1), setv('AI이유', why)];
    // 브리지 지키기 (어려움)
    const bridgeSlots = [];
    for (let j = 1; j <= BR_SLOTS; j++) {
        bridgeSlots.push(undecided([
            Ls('a', item('브리지A', add(Lg('표'), j))),
            If(gt(Lg('a'), 0), [
                If(eq(item('판', Lg('a')), me), [
                    If(eq(item('판', item('브리지B', add(Lg('표'), j))), me), [
                        If(eq(item('판', item('브리지X', add(Lg('표'), j))), 0), decide(item('브리지X', add(Lg('표'), j)), 'bridge')),
                    ]),
                ]),
            ]),
        ]));
    }
    // 1수 탐색 (어려움)
    const look = [Ls('bestV', -99999)];
    for (let r = 1; r <= LOOK; r++) {
        look.push(Ls('c', item('후보칸', r)), If(gt(Lg('c'), 0), [
            setItem('판', Lg('c'), me),
            call('거리 지도', me, 0, 1, 0), Ls('my', v('최단')),
            call('거리 지도', op, 0, 1, 0), Ls('opd', v('최단')),
            setItem('판', Lg('c'), 0),
            Ls('val', sub(sub(Lg('opd'), Lg('my')), mul(item('점수', Lg('c')), 0.01))),
            If(gt(Lg('val'), Lg('bestV')), [Ls('bestV', Lg('val')), setv('AI수', Lg('c'))]),
        ]));
    }
    const center = (N) => ((N - 1) / 2) * N + (N - 1) / 2 + 1;
    return [
        Ls('결정', 0), setv('AI수', 0), setv('AI이유', ''),
        Ls('나', v('차례')), Ls('상대', sub(3, v('차례'))),
        IfElse(eq(v('테스트'), 1), [setv('흔들기', 0)], [setv('흔들기', item('흔들기표', v('AI레벨')))]),
        Ls('가운데', 0),
        ...SIZES.map((N) => If(eq(v('보드크기'), N), [Ls('가운데', center(N))])),
        // 첫 수: 가운데
        If(eq(v('수'), 0), decide(Lg('가운데'), 'open')),
        undecided([If(eq(v('수'), 1), [If(ge(v('AI레벨'), 2), [If(eq(item('판', Lg('가운데')), 0), decide(Lg('가운데'), 'open'))])])]),
        // 바로 이기기 / 막기 (브리지 없이)
        undecided([
            call('거리 지도', me, 0, 0, 1), call('거리 지도', me, 1, 0, 2),
            call('거리 지도', op, 0, 0, 3), call('거리 지도', op, 1, 0, 4),
            call('한방 찾기'),
            If(gt(v('찾은승'), 0), decide(v('찾은승'), 'win')),
        ]),
        undecided([If(gt(v('찾은막'), 0), decide(v('찾은막'), 'block'))]),
        // 브리지 지키기
        undecided([If(eq(v('AI레벨'), 3), [If(gt(v('마지막수'), 0), [
            Ls('표', add(item('브리지오프셋', v('보드크기')), mul(sub(v('마지막수'), 1), BR_SLOTS))),
            ...bridgeSlots,
        ])])]),
        // 점수 (보통 이상: 브리지 거리)
        undecided([
            If(ge(v('AI레벨'), 2), [
                call('거리 지도', me, 0, 1, 1), call('거리 지도', me, 1, 1, 2),
                call('거리 지도', op, 0, 1, 3), call('거리 지도', op, 1, 1, 4),
            ]),
            call('점수 매기기'),
            setv('AI이유', 'score'),
            If(eq(v('AI레벨'), 3), [
                ...Array.from({ length: LOOK }, (_, r) => call('후보 고르기', r + 1)),
                ...look,
                setv('AI이유', 'look'),
            ]),
            Ls('결정', 1),
        ]),
        // 안전장치: 둘 수 없는 칸이면 첫 빈 칸
        If(or(eq(v('AI수'), 0), ne(item('판', v('AI수')), 0)), [call('첫 빈 칸')]),
    ];
}, { locals: ['결정', '나', '상대', '가운데', '표', 'a', 'bestV', 'c', 'my', 'opd', 'val'] });
P.list('흔들기표', NOISE);
P.list('브리지오프셋', [0, 0, 0, 0, BR_OFF[5], 0, BR_OFF[7], 0, BR_OFF[9]]);

defineFunction('첫 빈 칸', ['첫 빈 칸 고르기'], () => {
    const F = '첫 빈 칸';
    return [
        lset(F, 'k', 0),
        ...forCells((i) => [If(eq(lget(F, 'k'), 0), [If(eq(item('판', i), 0), [lset(F, 'k', i)])])]),
        setv('AI수', lget(F, 'k')),
    ];
}, { locals: ['k'] });

// ---------------------------------------------------------------------------
// 함수: 게임 진행
// ---------------------------------------------------------------------------
defineFunction('보드 설정', ['보드 설정'], () => {
    const out = [setv('NN', mul(v('보드크기'), v('보드크기')))];
    for (const N of SIZES) {
        const w = L.CELL_W[N];
        const R = L.R_OF(w);
        const c = (N - 1) / 2;
        out.push(If(eq(v('보드크기'), N), [
            setv('칸폭', w),
            setv('줄간격', +(1.5 * R).toFixed(4)),
            setv('기준X', +(L.BOARD.x - 1.5 * c * w).toFixed(4)),
            setv('기준Y', +(L.BOARD.y + c * 1.5 * R).toFixed(4)),
            setv('돌크기', +((w / L.STONE_BASE) * 50).toFixed(3)),
        ]));
    }
    return out;
});

defineFunction('화면 바꾸기', ['화면을', { param: '이름' }, '(으)로 바꾸기'], () => [
    setv('화면', param('화면 바꾸기', '이름')),
    chgv('판갱신', 1),
]);

defineFunction('새 대국', ['새 대국 시작'], () => {
    const clear = [];
    for (let i = 1; i <= NN_MAX; i++) {
        clear.push(setItem('판', i, 0), setItem('승리칸', i, 0));
    }
    return [
        chgv('게임번호', 1),
        play('start'),
        call('보드 설정'),
        ...clear,
        setv('차례', 1), setv('수', 0), setv('마지막수', 0), setv('승자', 0), setv('호버칸', 0), setv('힌트칸', 0), setv('힌트수', 0),
        call('화면 바꾸기', 'GAME'),
        IfElse(and(eq(v('모드'), 'AI'), eq(v('내색'), 2)), [setv('상태', 'THINK'), send('AI 차례')], [setv('상태', 'PLAY')]),
    ];
});

defineFunction('승리 확인', ['승리 확인', { param: '선수' }], () => {
    const F = '승리 확인';
    const p = param(F, '선수');
    return [
        // 이기려면 최소 N개 + 상대 N-1개가 놓여 있어야 한다
        If(ge(v('수'), sub(mul(v('보드크기'), 2), 1)), [
            call('거리 지도', p, 0, 0, 0),
            If(eq(v('최단'), 0), [setv('승자', p)]),
        ]),
    ];
});

defineFunction('승리 길 표시', ['승리 길 표시', { param: '선수' }], () => {
    const F = '승리 길 표시';
    const p = param(F, '선수');
    return [
        call('거리 지도', p, 0, 0, 1),
        call('거리 지도', p, 1, 0, 2),
        ...forCells((i) => [If(eq(item('M0', i), 0), [If(eq(item('M1', i), 0), [setItem('승리칸', i, 1)])])]),
    ];
});

defineFunction('돌 놓기', ['돌 놓기', { param: '칸' }], () => {
    const F = '돌 놓기';
    const k = param(F, '칸');
    return [
        setv('상태', 'CHECK'),
        setv('힌트칸', 0),
        IfElse(eq(v('차례'), 1), [play('place')], [play('place2')]),
        setItem('판', k, v('차례')),
        chgv('수', 1),
        setItem('기록', v('수'), k),
        setv('마지막수', k),
        chgv('판갱신', 1),
        call('승리 확인', v('차례')),
        IfElse(gt(v('승자'), 0), [
            setv('상태', 'OVER'),
            call('승리 길 표시', v('승자')),
            chgv('판갱신', 1),
            IfElse(eq(v('모드'), 'AI'), [
                IfElse(eq(v('승자'), v('내색')),
                    [setItem('AI승', v('난이도'), add(item('AI승', v('난이도')), 1)), play('win')],
                    [setItem('AI패', v('난이도'), add(item('AI패', v('난이도')), 1)), play('lose')]),
            ], [IfElse(eq(v('승자'), 1), [chgv('빨강승', 1)], [chgv('파랑승', 1)]), play('win')]),
            send('대국 끝'),
        ], [
            setv('차례', sub(3, v('차례'))),
            IfElse(and(eq(v('모드'), 'AI'), ne(v('차례'), v('내색'))), [setv('상태', 'THINK'), send('AI 차례')], [setv('상태', 'PLAY')]),
        ]),
    ];
});

defineFunction('되돌리기', ['한 수 되돌리기'], () => {
    const popOne = [
        setItem('판', item('기록', v('수')), 0),
        chgv('수', -1),
    ];
    return [
        If(eq(v('상태'), 'PLAY'), [
            IfElse(eq(v('모드'), 'AI'), [If(ge(v('수'), 2), [...popOne, ...popOne])], [If(ge(v('수'), 1), popOne)]),
            IfElse(eq(mod(v('수'), 2), 0), [setv('차례', 1)], [setv('차례', 2)]),
            IfElse(gt(v('수'), 0), [setv('마지막수', item('기록', v('수')))], [setv('마지막수', 0)]),
            chgv('판갱신', 1),
            setv('힌트칸', 0),
            play('undo'),
        ]),
    ];
});

defineFunction('마우스 칸', ['마우스 아래 칸 찾기'], () => {
    // 육각 좌표 반올림 (큐브 좌표)
    const F = '마우스 칸';
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    return [
        Ls('z', div(sub(v('기준Y'), mouseY()), v('줄간격'))),
        Ls('x', sub(div(sub(mouseX(), v('기준X')), v('칸폭')), div(Lg('z'), 2))),
        Ls('y', sub(mul(Lg('x'), -1), Lg('z'))),
        Ls('rx', round(Lg('x'))), Ls('ry', round(Lg('y'))), Ls('rz', round(Lg('z'))),
        Ls('dx', abs(sub(Lg('rx'), Lg('x')))), Ls('dy', abs(sub(Lg('ry'), Lg('y')))), Ls('dz', abs(sub(Lg('rz'), Lg('z')))),
        IfElse(and(gt(Lg('dx'), Lg('dy')), gt(Lg('dx'), Lg('dz'))), [Ls('rx', sub(mul(Lg('ry'), -1), Lg('rz')))], [
            If(not(gt(Lg('dy'), Lg('dz'))), [Ls('rz', sub(mul(Lg('rx'), -1), Lg('ry')))]),
        ]),
        IfElse(and(and(ge(Lg('rx'), 0), lt(Lg('rx'), v('보드크기'))), and(ge(Lg('rz'), 0), lt(Lg('rz'), v('보드크기')))),
            [setv('호버칸', add(add(mul(Lg('rz'), v('보드크기')), Lg('rx')), 1))],
            [setv('호버칸', 0)]),
    ];
}, { locals: ['x', 'y', 'z', 'rx', 'ry', 'rz', 'dx', 'dy', 'dz'] });

// 버튼 상태: 0 숨김 · 1 보통 · 2 선택됨 · 3 사용 불가
defineFunction('버튼 갱신', ['버튼 갱신'], () => {
    const S = (id, x) => setItem('버튼상태', id, x);
    const out = [];
    for (let id = 1; id <= BTN_MAX; id++) {
        out.push(S(id, 0));
    }
    out.push(
        If(eq(v('화면'), 'TITLE'), [S(1, 1), S(2, 1), S(4, 1)]),
        If(eq(v('화면'), 'HELP'), [S(3, 1)]),
        If(eq(v('화면'), 'SETUP'), [
            IfElse(eq(v('모드'), 'AI'), [S(10, 2), S(11, 1)], [S(10, 1), S(11, 2)]),
            ...[1, 2, 3].map((lv) => IfElse(eq(v('모드'), '2P'), [S(11 + lv, 3)], [IfElse(eq(v('난이도'), lv), [S(11 + lv, 2)], [S(11 + lv, 1)])])),
            ...SIZES.map((N, j) => IfElse(eq(v('보드크기'), N), [S(15 + j, 2)], [S(15 + j, 1)])),
            ...[1, 2].map((c) => IfElse(eq(v('모드'), '2P'), [S(17 + c, 3)], [IfElse(eq(v('내색'), c), [S(17 + c, 2)], [S(17 + c, 1)])])),
            S(20, 1), S(21, 1),
        ]),
        If(eq(v('화면'), 'GAME'), [
            IfElse(or(or(eq(v('상태'), 'THINK'), eq(v('상태'), 'HINT')), eq(v('상태'), 'CHECK')), [S(30, 3), S(31, 3), S(32, 3), S(33, 3)], [
                S(31, 1), S(32, 1),
                IfElse(and(eq(v('상태'), 'PLAY'), humanTurn()), [S(33, 1)], [S(33, 3)]),
                IfElse(and(eq(v('상태'), 'PLAY'), ge(v('수'), 1)), [S(30, 1)], [S(30, 3)]),
                If(and(eq(v('모드'), 'AI'), lt(v('수'), 2)), [S(30, 3)]),
            ]),
        ]),
        chgv('버튼갱신', 1),
    );
    return out;
});

defineFunction('버튼 처리', ['버튼 처리', { param: '번호' }], () => {
    const b = param('버튼 처리', '번호');
    const when = (id, body) => If(eq(b, id), body);
    return [
        If(not(or(eq(b, 20), or(eq(b, 31), eq(b, 4)))), [play('click')]),
        when(1, [call('화면 바꾸기', 'SETUP')]),
        when(2, [call('화면 바꾸기', 'HELP')]),
        when(3, [call('화면 바꾸기', 'TITLE')]),
        when(4, [setv('모드', 'AI'), setv('난이도', 2), setv('보드크기', 7), setv('내색', 1), call('새 대국')]),
        when(10, [setv('모드', 'AI')]),
        when(11, [setv('모드', '2P')]),
        when(12, [setv('난이도', 1)]),
        when(13, [setv('난이도', 2)]),
        when(14, [setv('난이도', 3)]),
        when(15, [setv('보드크기', 5)]),
        when(16, [setv('보드크기', 7)]),
        when(17, [setv('보드크기', 9)]),
        when(18, [setv('내색', 1)]),
        when(19, [setv('내색', 2)]),
        when(20, [call('새 대국')]),
        when(21, [call('화면 바꾸기', 'TITLE')]),
        when(30, [call('되돌리기')]),
        when(31, [call('새 대국')]),
        when(32, [call('화면 바꾸기', 'SETUP')]),
        when(33, [If(and(eq(v('상태'), 'PLAY'), humanTurn()), [setv('상태', 'HINT'), send('힌트')])]),
    ];
});

// ---------------------------------------------------------------------------
// 오브젝트
// ---------------------------------------------------------------------------
const pic = (name) => {
    const m = manifest[name];
    if (!m) {
        throw new Error(`missing asset ${name}`);
    }
    return { name, file: m.file, width: m.width, height: m.height };
};
const HALF = 0.5;
const inGame = () => eq(v('화면'), 'GAME');

// 1) 축하 조각 (복제본)
{
    const o = P.sprite({ name: '축하', pictures: Array.from({ length: 10 }, (_, k) => pic(`conf${k + 1}`)), entity: { scale: HALF, visible: false } });
    P.addThread(o, onStart(hide()));
    P.addThread(o, onClone(
        goXY(rand(-235, 235), rand(140, 230)),
        shape(join('conf', rand(1, 10))),
        setSize(rand(5, 10)),
        setRot(rand(0, 359)),
        blk('set_variable', [P.vars['내vx'].id, val(div(rand(-100, 100), 100)), null]),
        blk('set_variable', [P.vars['내vy'].id, val(div(rand(-250, -120), 100)), null]),
        blk('set_variable', [P.vars['내회전'].id, val(rand(-12, 12)), null]),
        show(),
        Repeat(150, [
            ...moveBy(v('내vx'), v('내vy')),
            turn(v('내회전')),
            If(lt(blk('coordinate_object', [null, 'self', null, 'y']), -150), [stopRepeat()]),
        ]),
        DeleteClone()
    ));
}

// 2) 결과 글 · 결과 배너
const T = L.TEXT;
function textBox(name, cfg, opts) {
    return P.textBox({ name, text: ' ', x: cfg.x, y: cfg.y, width: cfg.w, height: cfg.h, visible: false, lineBreak: true, ...opts });
}
{
    const o = textBox('결과글', T.resultSub, { fontSize: 9, font: 'Nanum Gothic', bold: true, colour: '#ffe08a', align: 0 });
    P.addThread(o, onStart(hide()));
    P.addThread(o, onMsg('대국 끝',
        IfElse(eq(v('모드'), 'AI'), [
            IfElse(eq(v('승자'), v('내색')),
                [write(join('AI ', levelName(), ' 격파! ', v('수'), '수 만에 연결했어요'))],
                [write('AI가 먼저 이었어요. 다시 도전해 볼까요?')]),
        ], [write(join(v('수'), '수 만에 연결 성공!'))]),
        setv('결과표', v('게임번호')),
        Wait(0.35), show(),
        Repeat(150, [If(or(ne(v('게임번호'), v('결과표')), ne(v('화면'), 'GAME')), [stopRepeat()])]),
        hide()
    ));
}
const BANNER_SIZE = (L.BANNER.w + L.BANNER.h) / 2;
{
    const B = L.BANNER;
    const o = P.sprite({ name: '결과창', pictures: ['banner_red', 'banner_blue', 'banner_you', 'banner_ai'].map(pic), entity: { x: B.x, y: B.y + 18, scale: HALF, visible: false } });
    P.addThread(o, onStart(hide()));
    P.addThread(o, onMsg('대국 끝',
        IfElse(eq(v('모드'), 'AI'),
            [IfElse(eq(v('승자'), v('내색')), [shape('banner_you')], [shape('banner_ai')])],
            [IfElse(eq(v('승자'), 1), [shape('banner_red')], [shape('banner_blue')])]),
        goXY(B.x, B.y + 18),
        setSize(BANNER_SIZE * 0.6), setEffect('transparency', 100), show(),
        Repeat(10, [growBy(BANNER_SIZE * 0.04), addEffect('transparency', -10)]),
        setEffect('transparency', 0),
        Repeat(150, [If(or(ne(v('게임번호'), v('결과표')), ne(v('화면'), 'GAME')), [stopRepeat()])]),
        Repeat(10, [addEffect('transparency', 10)]),
        hide()
    ));
}

// 3) 버튼 (복제본)
{
    const names = [];
    for (const b of L.BUTTONS) {
        names.push(`b${b.id}`);
        if (b.kind === 'option') {
            names.push(`b${b.id}a`);
        }
    }
    const o = P.sprite({ name: '버튼', pictures: names.map(pic), entity: { scale: HALF, visible: false } });
    const ids = L.BUTTONS.map((b) => b.id);
    const pulse = L.BUTTONS.filter((b) => b.kind === 'primary').map((b) => b.id);
    P.addThread(o, onStart(hide(), ...ids.flatMap((id) => [setv('내버튼', id), blk('create_clone', ['self', null])])));
    const st = item('버튼상태', v('내버튼'));
    P.addThread(o, onClone(
        goXY(item('버튼X', v('내버튼')), item('버튼Y', v('내버튼'))),
        setv('내갱신', -1),
        Forever([
            If(ne(v('내갱신'), v('버튼갱신')), [
                setv('내갱신', v('버튼갱신')),
                setv('내상태', st),
                IfElse(eq(v('내상태'), 0), [hide()], [
                    IfElse(eq(v('내상태'), 2), [shape(join('b', v('내버튼'), 'a'))], [shape(join('b', v('내버튼')))]),
                    IfElse(eq(v('내상태'), 3), [setEffect('transparency', 65)], [setEffect('transparency', 0)]),
                    show(),
                ]),
            ]),
            If(gt(v('내상태'), 0), [
                IfElse(and(touchingMouse(), lt(v('내상태'), 3)), [setEffect('brightness', 14), setSize(mul(item('버튼크기', v('내버튼')), 1.05))], [
                    setEffect('brightness', 0),
                    IfElse(or(...pulse.map((id) => eq(v('내버튼'), id))),
                        [setSize(mul(item('버튼크기', v('내버튼')), add(1, mul(0.025, sin(mul(v('프레임'), 6))))))],
                        [setSize(item('버튼크기', v('내버튼')))]),
                ]),
            ]),
        ])
    ));
    P.addThread(o, onObjClick(
        If(or(eq(v('내상태'), 1), eq(v('내상태'), 2)), [
            setv('눌린버튼', v('내버튼')),
            send('버튼 눌림'),
        ])
    ));
}

// 4) 타이틀 전적
{
    const o = textBox('타이틀전적', T.titleRecord, { fontSize: 7, font: 'Nanum Gothic', colour: '#6f604c', align: 0 });
    P.addThread(o, onStart(Forever([
        IfElse(eq(v('화면'), 'TITLE'), [
            If(eq(mod(v('프레임'), 15), 0), [
                write(join('AI 전적  쉬움 ', item('AI승', 1), '승 ', item('AI패', 1), '패 · 보통 ', item('AI승', 2), '승 ', item('AI패', 2),
                    '패', '\n', '어려움 ', item('AI승', 3), '승 ', item('AI패', 3), '패')),
            ]),
            show(),
        ], [hide()]),
    ])));
}

// 5) 화면 덮개 (타이틀 · 설정 · 도움말)
{
    const o = P.sprite({ name: '화면', pictures: ['screen_title', 'screen_setup', 'screen_help'].map(pic), entity: { scale: HALF } });
    P.variable('내화면', '', { object: o.id });
    P.addThread(o, onStart(
        goXY(0, 0),
        setv('내화면', ''),
        Forever([
            If(ne(v('내화면'), v('화면')), [
                setv('내화면', v('화면')),
                IfElse(eq(v('화면'), 'GAME'), [hide()], [
                    If(eq(v('화면'), 'TITLE'), [shape('screen_title')]),
                    If(eq(v('화면'), 'SETUP'), [shape('screen_setup')]),
                    If(eq(v('화면'), 'HELP'), [shape('screen_help')]),
                    show(),
                ]),
            ]),
        ])
    ));
}

// 6) 게임 패널 글상자
function panelText(name, cfg, opts, every, bodyFn) {
    const o = textBox(name, cfg, opts);
    P.addThread(o, onStart(hide(), Forever([
        IfElse(inGame(), [If(eq(mod(v('프레임'), every), 0), bodyFn()), show()], [hide()]),
    ])));
    return o;
}
panelText('크기표시', T.sizeTag, { fontSize: 8, font: 'Nanum Gothic', bold: true, colour: '#8f9bc4', align: 2 }, 20, () => [
    write(join(v('보드크기'), ' × ', v('보드크기'))),
]);
panelText('차례안내', T.turnSub, { fontSize: 7.5, font: 'Nanum Gothic', bold: true, colour: '#eef2ff', align: 0 }, 4, () => [
    If(eq(v('상태'), 'OVER'), [write('새 대국으로 다시 도전!')]),
    If(eq(v('상태'), 'THINK'), [write('AI가 수를 읽는 중')]),
    If(eq(v('상태'), 'HINT'), [write('추천 수를 찾는 중')]),
    If(eq(v('상태'), 'PLAY'), [IfElse(eq(v('모드'), 'AI'), [write('당신 차례예요 · 빈 칸 클릭')], [write(join('플레이어 ', v('차례'), ' 차례 · 빈 칸 클릭'))])]),
]);
panelText('플레이어', T.players, { fontSize: 7.5, font: 'Nanum Gothic', colour: '#dfe5ff', align: 1 }, 20, () => [
    IfElse(eq(v('모드'), 'AI'), [
        IfElse(eq(v('내색'), 1),
            [write(join('● 빨강 : 나 (먼저)', '\n', '● 파랑 : AI ', levelName()))],
            [write(join('● 빨강 : AI ', levelName(), ' (먼저)', '\n', '● 파랑 : 나'))]),
    ], [write(join('● 빨강 : 플레이어 1', '\n', '● 파랑 : 플레이어 2'))]),
]);
panelText('전적', T.score, { fontSize: 10, font: 'Nanum Gothic', bold: true, colour: '#ffe08a', align: 0 }, 10, () => [
    IfElse(eq(v('모드'), 'AI'),
        [write(join('나 ', item('AI승', v('난이도')), '  :  ', item('AI패', v('난이도')), ' AI'))],
        [write(join('빨강 ', v('빨강승'), '  :  ', v('파랑승'), ' 파랑'))]),
]);
panelText('수표시', T.moves, { fontSize: 7, font: 'Nanum Gothic', colour: '#8f9bc4', align: 0 }, 6, () => [
    write(join('놓은 돌 ', v('수'), '개 · 힌트 ', v('힌트수'), '회')),
]);

// 7) 차례 카드 · 생각 중 표시
{
    const C = L.TURN_CARD;
    const o = P.sprite({ name: '차례카드', pictures: ['turn_red', 'turn_blue', 'turn_red_win', 'turn_blue_win'].map(pic), entity: { x: C.x, y: C.y, scale: HALF, visible: false } });
    P.addThread(o, onStart(hide(), Forever([
        IfElse(inGame(), [
            IfElse(eq(v('상태'), 'OVER'),
                [IfElse(eq(v('승자'), 1), [shape('turn_red_win')], [shape('turn_blue_win')])],
                [IfElse(eq(v('차례'), 1), [shape('turn_red')], [shape('turn_blue')])]),
            IfElse(or(eq(v('상태'), 'THINK'), eq(v('상태'), 'HINT')), [setEffect('brightness', mul(12, sin(mul(v('프레임'), 9))))], [setEffect('brightness', 0)]),
            show(),
        ], [hide()]),
    ])));
    const s = P.sprite({ name: '생각중', pictures: [pic('spinner')], entity: { x: L.PANEL.x + 44, y: C.y, scale: HALF, visible: false } });
    P.addThread(s, onStart(hide(), Forever([
        IfElse(and(inGame(), or(eq(v('상태'), 'THINK'), eq(v('상태'), 'HINT'))), [show(), turn(10)], [hide()]),
    ])));
}

// 8) 마우스 올림 · 마지막 수 표시
{
    const o = P.sprite({ name: '칸강조', pictures: ['hover_red', 'hover_blue'].map(pic), entity: { scale: HALF, visible: false } });
    P.addThread(o, onStart(hide(), Forever([
        IfElse(and(and(inGame(), eq(v('상태'), 'PLAY')), humanTurn()), [
            call('마우스 칸'),
            IfElse(gt(v('호버칸'), 0), [
                IfElse(eq(item('판', v('호버칸')), 0), [
                    goXY(cellX(v('호버칸')), cellY(v('호버칸'))),
                    setSize(v('돌크기')),
                    IfElse(eq(v('차례'), 1), [shape('hover_red')], [shape('hover_blue')]),
                    show(),
                ], [hide()]),
            ], [hide()]),
        ], [hide()]),
    ])));
    const m = P.sprite({ name: '마지막수', pictures: [pic('marker')], entity: { scale: HALF, visible: false } });
    P.addThread(m, onStart(hide(), Forever([
        IfElse(and(inGame(), gt(v('마지막수'), 0)), [
            goXY(cellX(v('마지막수')), cellY(v('마지막수'))),
            setSize(v('돌크기')),
            setEffect('transparency', add(25, mul(20, sin(mul(v('프레임'), 6))))),
            show(),
        ], [hide()]),
    ])));
}

{
    const h = P.sprite({ name: '힌트표시', pictures: [pic('hint')], entity: { scale: HALF, visible: false } });
    P.addThread(h, onStart(hide(), Forever([
        IfElse(and(and(inGame(), eq(v('상태'), 'PLAY')), gt(v('힌트칸'), 0)), [
            goXY(cellX(v('힌트칸')), cellY(v('힌트칸'))),
            setSize(mul(v('돌크기'), add(1.02, mul(0.06, sin(mul(v('프레임'), 8)))))),
            show(),
        ], [hide()]),
    ])));
}

// 9) 돌 (칸마다 복제본 81개)
{
    const o = P.sprite({ name: '돌', pictures: ['stone_red', 'stone_blue', 'stone_red_win', 'stone_blue_win'].map(pic), entity: { scale: HALF, visible: false } });
    const make = [hide()];
    for (let k = 1; k <= NN_MAX; k++) {
        make.push(setv('내칸', k), blk('create_clone', ['self', null]));
    }
    P.addThread(o, onStart(...make));
    const k = v('내칸');
    P.addThread(o, onClone(
        setv('돌갱신', -1), setv('이전값', 0),
        Forever([
            If(ne(v('돌갱신'), v('판갱신')), [
                setv('돌갱신', v('판갱신')),
                IfElse(and(inGame(), le(k, v('NN'))), [
                    setv('내값', item('판', k)),
                    IfElse(eq(v('내값'), 0), [hide(), setv('이전값', 0)], [
                        goXY(cellX(k), cellY(k)),
                        IfElse(eq(item('승리칸', k), 1),
                            [IfElse(eq(v('내값'), 1), [shape('stone_red_win')], [shape('stone_blue_win')])],
                            [IfElse(eq(v('내값'), 1), [shape('stone_red')], [shape('stone_blue')]), setEffect('brightness', 0)]),
                        IfElse(and(eq(v('이전값'), 0), eq(k, v('마지막수'))), [
                            // 놓일 때 톡 튀어나오는 효과
                            setSize(mul(v('돌크기'), 1.45)), setEffect('brightness', 40), show(),
                            Repeat(6, [growBy(mul(v('돌크기'), -0.075)), addEffect('brightness', -6.5)]),
                            setSize(v('돌크기')), setEffect('brightness', 0),
                        ], [setSize(v('돌크기')), show()]),
                        setv('이전값', v('내값')),
                    ]),
                ], [hide(), setv('이전값', 0)]),
            ]),
            // 승리한 길은 반짝반짝
            If(eq(v('상태'), 'OVER'), [If(eq(item('승리칸', k), 1), [
                setEffect('brightness', add(12, mul(18, sin(sub(mul(v('프레임'), 7), mul(k, 23)))))),
            ])]),
        ])
    ));
}

// 10) 보드 (게임 진행 담당)
{
    const o = P.sprite({ name: '보드', pictures: SIZES.map((N) => pic(`board${N}`)), entity: { x: L.BOARD.x, y: L.BOARD.y, scale: HALF, visible: false } });
    const soundMeta = JSON.parse(fs.readFileSync(path.join(assetDir, 'sounds.json'), 'utf8'));
    o.sprite.sounds = SOUND_NAMES.map((n) => ({ id: SOUND_IDS[n], name: n, _file: soundMeta[n].file, ext: '.mp3', duration: soundMeta[n].duration }));
    P.addThread(o, onStart(
        setv('화면', 'TITLE'), setv('상태', 'PLAY'), setv('프레임', 0), setv('버튼서명', ''),
        call('보드 설정'),
        hide(),
        Forever([
            chgv('프레임', 1),
            // 버튼 모양은 상태가 바뀔 때만 다시 계산
            If(ne(v('버튼서명'), join(v('화면'), v('모드'), v('난이도'), v('보드크기'), v('내색'), v('상태'), v('수'), v('차례'))), [
                setv('버튼서명', join(v('화면'), v('모드'), v('난이도'), v('보드크기'), v('내색'), v('상태'), v('수'), v('차례'))),
                call('버튼 갱신'),
            ]),
            IfElse(inGame(), [shape(join('board', v('보드크기'))), show()], [hide()]),
        ])
    ));
    P.addThread(o, onMsg('버튼 눌림', call('버튼 처리', v('눌린버튼'))));
    P.addThread(o, onMouseDown(
        If(inGame(), [If(eq(v('상태'), 'PLAY'), [If(humanTurn(), [
            call('마우스 칸'),
            If(gt(v('호버칸'), 0), [If(eq(item('판', v('호버칸')), 0), [call('돌 놓기', v('호버칸'))])]),
        ])])])
    ));
    P.addThread(o, onMsg('AI 차례',
        setv('AI표', v('게임번호')),
        Wait(0.3),
        If(eq(v('AI표'), v('게임번호')), [
            setv('AI레벨', v('난이도')),
            call('AI 수 계산'),
            If(and(eq(v('AI표'), v('게임번호')), eq(v('상태'), 'THINK')), [call('돌 놓기', v('AI수'))]),
        ])
    ));
    P.addThread(o, onMsg('힌트',
        setv('힌트표', v('게임번호')),
        setv('AI레벨', 3),
        call('AI 수 계산'),
        If(and(eq(v('힌트표'), v('게임번호')), eq(v('상태'), 'HINT')), [setv('힌트칸', v('AI수')), chgv('힌트수', 1), play('click'), setv('상태', 'PLAY')])
    ));
    // 축하 조각: 사람이 이겼거나 2인 대전일 때
    P.addThread(o, onMsg('대국 끝',
        If(or(eq(v('모드'), '2P'), eq(v('승자'), v('내색'))), Array.from({ length: 36 }, () => cloneOf(OBJ.confetti)))
    ));
}

// 11) 배경
P.sprite({ name: '배경', pictures: [pic('game_bg')], entity: { scale: HALF } });

// 오브젝트 순서 (앞 → 뒤)
const order = ['축하', '결과글', '결과창', '버튼', '타이틀전적', '화면', '크기표시', '차례안내', '플레이어', '전적', '수표시',
    '생각중', '차례카드', '힌트표시', '마지막수', '칸강조', '돌', '보드', '배경'];
P.objects.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
void toFront;

// ---------------------------------------------------------------------------
// 빌드 & 패키징
// ---------------------------------------------------------------------------
const project = P.build();
project.scenes = [{ id: project.objects[0].scene, name: 'HEX' }];
project.interface.object = project.objects.find((o) => o.name === '보드').id;
const stage = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hexent-'));
const tempDir = path.join(stage, 'temp');
fs.mkdirSync(tempDir, { recursive: true });
const fileIds = {};
for (const o of project.objects) {
    for (const p of o.sprite.pictures) {
        const src = path.join(assetDir, p._file);
        if (!fileIds[p._file]) {
            fileIds[p._file] = crypto.createHash('md5').update(`hex/${p._file}`).digest('hex');
        }
        const id = fileIds[p._file];
        const sub2 = path.join(id.slice(0, 2), id.slice(2, 4));
        for (const kind of ['image', 'thumb']) {
            const d = path.join(tempDir, sub2, kind);
            fs.mkdirSync(d, { recursive: true });
            fs.copyFileSync(src, path.join(d, `${id}.png`));
        }
        p.filename = id;
        p.fileurl = `temp/${id.slice(0, 2)}/${id.slice(2, 4)}/image/${id}.png`;
        p.thumbUrl = `temp/${id.slice(0, 2)}/${id.slice(2, 4)}/thumb/${id}.png`;
        delete p._file;
    }
}
for (const o of project.objects) {
    for (const snd of o.sprite.sounds || []) {
        const id = crypto.createHash('md5').update(`hex/${snd._file}`).digest('hex');
        const d = path.join(tempDir, id.slice(0, 2), id.slice(2, 4), 'sound');
        fs.mkdirSync(d, { recursive: true });
        fs.copyFileSync(path.join(assetDir, snd._file), path.join(d, `${id}.mp3`));
        snd.filename = id;
        snd.fileurl = `temp/${id.slice(0, 2)}/${id.slice(2, 4)}/sound/${id}.mp3`;
        delete snd._file;
    }
}
project.name = 'HEX';
fs.writeFileSync(path.join(tempDir, 'project.json'), JSON.stringify(project));
if (outJson) {
    fs.writeFileSync(outJson, JSON.stringify(project, null, 1));
}
fs.mkdirSync(path.dirname(path.resolve(outEnt)), { recursive: true });
execFileSync('tar', ['-czf', path.resolve(outEnt), '-C', stage, 'temp']);
fs.rmSync(stage, { recursive: true, force: true });

if (process.env.HEX_BLOCK_DOC) {
    const { renderProjectDoc } = require('./gl_blockdoc');
    const meta = {
        functions: Object.fromEntries(Object.values(P.functions).map((f) => [f.id, { name: f.name, spec: f.spec, paramTypes: f.paramTypes }])),
    };
    fs.writeFileSync(process.env.HEX_BLOCK_DOC, renderProjectDoc(project, meta, 'HEX', 'tools/build_hex.js'));
}

let blocks = 0;
project.objects.forEach((o) => JSON.parse(o.script).forEach((t) => (blocks += G.countBlocks(t))));
project.functions.forEach((f) => JSON.parse(f.content).forEach((t) => (blocks += G.countBlocks(t))));
console.log(`built ${outEnt}: objects=${project.objects.length} functions=${project.functions.length} ` +
    `variables=${project.variables.length} statementBlocks≈${blocks} json=${(JSON.stringify(project).length / 1e6).toFixed(2)}MB`);
