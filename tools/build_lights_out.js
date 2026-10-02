'use strict';
/**
 * LIGHTS OUT — 엔트리 작품(.ent) 빌드 스크립트
 *
 *   node tools/build_lights_out.js <에셋폴더> <출력 .ent 경로> [project.json 경로]
 *
 * 에셋 폴더: Figma 에서 그린 시트를 잘라 만든 PNG + manifest.json (tools/figma/), sound/ (tools/lo_sound.js)
 * .ent = tar.gz { temp/project.json, temp/xx/yy/image|thumb/<id>.png, temp/xx/yy/sound/<id>.mp3 }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const G = require('./entrygen');
const L = require('./lo_layout');
const S = require('./lo_solver');

const {
    Project, blk, add, sub, mul, div, round, mod, quot, join, rand, charAt, sin,
    mouseX, mouseY,
    eq, ne, gt, lt, ge, le, and, or, not,
    v, setv, chgv, item, setItem, addItem, delItem, listLen,
    If, IfElse, Forever, Until, Wait, StopThis, Clone, send,
    onStart, onMsg, onClone, onKey, onObjClick,
    goXY, show, hide, setSize, shape, setEffect, write, playSound,
    defineFunction, param, call, lget, lset,
} = G;

const [assetDir = 'assets/lights_out', outEnt = 'dist/LIGHTS_OUT.ent', outJson] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json'), 'utf8'));
const soundMeta = JSON.parse(fs.readFileSync(path.join(assetDir, 'sound', 'sounds.json'), 'utf8'));

const NL = '\n';
const MAXN = 25; // 판 리스트 길이 (5×5)
const STAGES = S.makeStages();
const fmt1 = (x) => div(round(mul(x, 10)), 10);
const seq = (n) => [...Array(n)].map((_, k) => k + 1);

/** 값 블록 배열 → 균형 잡힌 더하기 트리 (깊은 중첩 방지) */
function sumOf(xs) {
    if (xs.length === 0) {
        return G.val(0);
    }
    if (xs.length === 1) {
        return xs[0];
    }
    const h = xs.length >> 1;
    return add(sumOf(xs.slice(0, h)), sumOf(xs.slice(h)));
}
/** 조건 배열 → 균형 잡힌 또는/그리고 트리 */
const anyOf = (xs) => (xs.length === 1 ? xs[0] : or(anyOf(xs.slice(0, xs.length >> 1)), anyOf(xs.slice(xs.length >> 1))));

// ---------------------------------------------------------------------------
// 프로젝트 / 데이터
// ---------------------------------------------------------------------------
const P = new Project();
const OBJ = {
    button: P.reserveObject('버튼'),
    cell: P.reserveObject('칸'),
    mark: P.reserveObject('AI표시'),
    cursor: P.reserveObject('커서'),
    stars: P.reserveObject('별표시'),
    overlay: P.reserveObject('오버레이'),
    bg: P.reserveObject('배경'),
};

const GV = {
    // 화면 상태
    화면: 'TITLE', 오버레이: '', 오버레이모양: 'ov_clear3', 모드: 'PUZZLE', 버튼갱신: 0, 눌린버튼: 0, 프레임수: 0,
    // 판
    판크기: 3, 켜진수1: 0, 켜진수2: 0, 배치세대: 0, 보드1X: L.BOARD.puzzle.x, 보드1Y: L.BOARD.puzzle.y,
    보드2X: L.BOARD.race2.x, 보드2Y: L.BOARD.race2.y, 칸크기: 60, 커서1: 5, 커서2: 5, 커서표시1: 0,
    // AI 풀이기
    풀이수: 0, 선택칸: 0,
    // 퍼즐 모드
    스테이지: 1, 최근스테이지: 1, 이동수: 0, 최소수: 0, 힌트수: 0, 힌트칸: 0, 풀이보기: 0, 풀이봄: 0,
    클리어별: 0, 새기록: 0, 새스킨: 0, 총별: 0, 스킨: 1, 결과메모: '',
    // 대전
    AI난이도: 2, AI간격: 1.9, AI실수: 15, 대전크기: 4, 목표최소: 4, 목표최대: 6, 라운드: 0, 점수1: 0, 점수2: 0,
    대전상태: '', 라운드승자: 0, 라운드시작: 0, 라운드시간: 0, 대전세대: 0, 진행세대: 0, AI세대: 0, AI라운드: 0, AI목표: 0,
    누른수1: 0, 누른수2: 0, 생성시도: 0, 목표수: 0, 같은판: 0,
};
for (const [k, x] of Object.entries(GV)) {
    P.variable(k, x);
}
// 복제본별 지역 변수
P.variable('내버튼', 0, { object: OBJ.button });
P.variable('내갱신', -1, { object: OBJ.button });
P.variable('내호버', 0, { object: OBJ.button });
for (const [o, names] of [
    [OBJ.cell, ['내보드', '내칸', '내배치', '내값', '내스킨', '내보임', '원함', '지금값', '팝', '내크기']],
    [OBJ.mark, ['표시칸', '표시배치', '표시보임', '표시원함']],
    [OBJ.cursor, ['커서보드', '커서보임', '커서원함', '커서X', '커서Y', '커서목표X', '커서목표Y', '커서배치']],
    [OBJ.stars, ['별번호', '별갱신']],
    [OBJ.overlay, ['오버레이현재']],
    [OBJ.bg, ['배경현재']],
]) {
    for (const n of names) {
        P.variable(n, -1, { object: o });
    }
}

const zeros = Array(MAXN).fill(0);
P.list('보드1', zeros);
P.list('보드2', zeros);
P.list('풀이입력', zeros);
P.list('풀이', zeros);
P.list('별', Array(30).fill(0));
P.list('스테이지판', STAGES.map((s) => s.board));
P.list('스테이지크기', STAGES.map((s) => s.n));
P.list('스테이지최소', STAGES.map((s) => s.par));
P.list('버튼X', L.BUTTONS.map((b) => b.x));
P.list('버튼Y', L.BUTTONS.map((b) => b.y));
P.list('버튼W', L.BUTTONS.map((b) => b.w));
P.list('버튼H', L.BUTTONS.map((b) => b.h));
P.list('버튼상태', L.BUTTONS.map(() => 0)); // 0 숨김 · 1 보통 · 3 비활성(흐림) · 4 보이기만(클릭 안 됨)
P.list('버튼모양', L.BUTTONS.map((b) => `b${b.id}`));
P.list('소리대기', []);
P.list('스킨조건', L.SKINS.map((s) => s.need));

P.message('버튼 눌림');
P.message('라운드 진행');
P.message('라운드 종료');

const sfx = (name) => If(lt(listLen('소리대기'), 6), [addItem('소리대기', name)]);
const B = L.byKey;

// ---------------------------------------------------------------------------
// 판 조작
// ---------------------------------------------------------------------------
defineFunction('칸 뒤집기', ['보드', { param: '보드' }, '칸', { param: '칸' }, '뒤집기'], () => {
    const b = param('칸 뒤집기', '보드');
    const k = param('칸 뒤집기', '칸');
    const flip = (list, cnt) => [
        setItem(list, k, sub(1, item(list, k))),
        chgv(cnt, sub(mul(item(list, k), 2), 1)), // 켜졌으면 +1, 꺼졌으면 -1
    ];
    return [IfElse(eq(b, 1), flip('보드1', '켜진수1'), flip('보드2', '켜진수2'))];
});

defineFunction('누르기', ['보드', { param: '보드' }, '칸', { param: '칸' }, '누르기'], () => {
    const F = '누르기';
    const b = param(F, '보드');
    const k = param(F, '칸');
    const n = lget(F, 'n');
    const r = lget(F, 'r');
    const c = lget(F, 'c');
    return [
        lset(F, 'n', v('판크기')),
        lset(F, 'r', quot(sub(k, 1), n)),
        lset(F, 'c', mod(sub(k, 1), n)),
        call('칸 뒤집기', b, k),
        If(gt(r, 0), [call('칸 뒤집기', b, sub(k, n))]),
        If(lt(r, sub(n, 1)), [call('칸 뒤집기', b, add(k, n))]),
        If(gt(c, 0), [call('칸 뒤집기', b, sub(k, 1))]),
        If(lt(c, sub(n, 1)), [call('칸 뒤집기', b, add(k, 1))]),
    ];
}, { locals: ['n', 'r', 'c'] });

// ---------------------------------------------------------------------------
// AI 풀이기 — GF(2) 가우스 소거 결과(M, 영공간)를 빌드 때 계산해 블록으로 펼친다
//   x_i = (Σ_{j∈M_i} b_j) mod 2  → 영공간 조합마다 누름 수를 세서 가장 적은 해 선택
// ---------------------------------------------------------------------------
{
    const F = '풀이 계산';
    const combosMax = 16;
    const locals = ['최소', '선택', ...seq(combosMax).map((k) => `w${k - 1}`)];
    const solveBlocks = (n) => {
        const I = S.analyze(n);
        const N = n * n;
        const out = [];
        for (let i = 0; i < N; i++) {
            const terms = [];
            I.M[i].forEach((m, j) => {
                if (m) {
                    terms.push(item('풀이입력', j + 1));
                }
            });
            out.push(setItem('풀이', i + 1, terms.length ? mod(sumOf(terms), 2) : 0));
        }
        for (let i = N; i < MAXN; i++) {
            out.push(setItem('풀이', i + 1, 0));
        }
        const combos = S.nullCombos(n);
        if (combos.length === 1) {
            out.push(setv('풀이수', sumOf(seq(N).map((i) => item('풀이', i)))));
            return out;
        }
        // 조합 c 의 누름 수 = (c 의 1 개수) + Σ_{c_i=0} x_i − Σ_{c_i=1} x_i
        combos.forEach(({ vec, ones }, ci) => {
            const plus = [];
            const minus = [];
            vec.forEach((bit, i) => (bit ? minus : plus).push(item('풀이', i + 1)));
            let w = sumOf(plus);
            if (ones) {
                w = add(sub(ones, sumOf(minus)), w);
            }
            out.push(lset(F, `w${ci}`, w));
        });
        out.push(lset(F, '최소', lget(F, 'w0')), lset(F, '선택', 0));
        combos.forEach((_, ci) => {
            if (ci > 0) {
                out.push(If(lt(lget(F, `w${ci}`), lget(F, '최소')), [lset(F, '최소', lget(F, `w${ci}`)), lset(F, '선택', ci)]));
            }
        });
        combos.forEach(({ vec }, ci) => {
            if (ci > 0) {
                const flips = [];
                vec.forEach((bit, i) => {
                    if (bit) {
                        flips.push(setItem('풀이', i + 1, sub(1, item('풀이', i + 1))));
                    }
                });
                out.push(If(eq(lget(F, '선택'), ci), flips));
            }
        });
        out.push(setv('풀이수', lget(F, '최소')));
        return out;
    };
    defineFunction(F, ['AI', '보드', { param: '보드' }, '풀이 계산'], () => {
        const b = param(F, '보드');
        return [
            IfElse(eq(b, 1),
                seq(MAXN).map((i) => setItem('풀이입력', i, item('보드1', i))),
                seq(MAXN).map((i) => setItem('풀이입력', i, item('보드2', i)))),
            IfElse(eq(v('판크기'), 3), solveBlocks(3), [IfElse(eq(v('판크기'), 4), solveBlocks(4), solveBlocks(5))]),
        ];
    }, { locals });
}

// 풀이(1) 칸 중 무작위 하나 → 선택칸
defineFunction('풀이 칸 고르기', ['AI', '풀이 칸 고르기'], () => {
    const F = '풀이 칸 고르기';
    return [
        setv('선택칸', 0),
        lset(F, '개수', 0),
        lset(F, '뽑기', rand(1, v('풀이수'))),
        ...seq(MAXN).map((i) => If(eq(item('풀이', i), 1), [
            lset(F, '개수', add(lget(F, '개수'), 1)),
            If(eq(lget(F, '개수'), lget(F, '뽑기')), [setv('선택칸', i)]),
        ])),
    ];
}, { locals: ['개수', '뽑기'] });

// 스테이지 판 불러오기 (문자열 "0101…" → 보드1)
defineFunction('판 불러오기', ['스테이지', { param: 's' }, '판 불러오기'], () => {
    const s = param('판 불러오기', 's');
    const load = (n) => seq(MAXN).map((i) => setItem('보드1', i, i <= n * n ? mul(charAt(item('스테이지판', s), i), 1) : 0));
    return [
        setv('판크기', item('스테이지크기', s)),
        IfElse(eq(v('판크기'), 3), load(3), [IfElse(eq(v('판크기'), 4), load(4), load(5))]),
        ...seq(MAXN).map((i) => setItem('보드2', i, 0)),
        setv('켜진수1', sumOf(seq(MAXN).map((i) => item('보드1', i)))),
        setv('켜진수2', 0),
    ];
});

// 대전용 무작위 판: 다 꺼진 판에서 무작위로 12번 누른다 → 항상 풀 수 있는 판
defineFunction('무작위 판', ['무작위 판 만들기'], () => [
    ...seq(MAXN).map((i) => setItem('보드1', i, 0)),
    setv('켜진수1', 0),
    ...seq(12).map(() => call('누르기', 1, rand(1, mul(v('판크기'), v('판크기'))))),
]);

defineFunction('판 복사', ['보드1을 보드2로 복사'], () => [
    ...seq(MAXN).map((i) => setItem('보드2', i, item('보드1', i))),
    setv('켜진수2', v('켜진수1')),
]);

// 보드1 이 보드2 와 같거나, 돌리거나 뒤집으면 같은 판인지 → 같은판 = 1
// (대전에서 상대가 누르는 칸을 그대로/거울처럼 따라 해서 이득을 보지 못하게 한다)
{
    const transforms = [
        (r, c, n) => [r, c], (r, c, n) => [c, n - 1 - r], (r, c, n) => [n - 1 - r, n - 1 - c], (r, c, n) => [n - 1 - c, r],
        (r, c, n) => [r, n - 1 - c], (r, c, n) => [n - 1 - r, c], (r, c, n) => [c, r], (r, c, n) => [n - 1 - c, n - 1 - r],
    ];
    const sameUnder = (n) => transforms.map((T) => {
        const terms = [];
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const [r2, c2] = T(r, c, n);
                terms.push(G.abs(sub(item('보드1', r * n + c + 1), item('보드2', r2 * n + c2 + 1))));
            }
        }
        return If(eq(sumOf(terms), 0), [setv('같은판', 1)]);
    });
    defineFunction('판 비교', ['두 판이 같은 모양인지 비교'], () => [
        setv('같은판', 0),
        IfElse(eq(v('판크기'), 4), sameUnder(4), sameUnder(5)),
    ]);
}

// ---------------------------------------------------------------------------
// 화면 / 버튼
// ---------------------------------------------------------------------------
const center = () => add(mul(quot(sub(v('판크기'), 1), 2), add(v('판크기'), 1)), 1); // 가운데 칸 번호
defineFunction('배치 갱신', ['판 배치 갱신'], () => [
    IfElse(eq(v('화면'), 'RACE'), [
        setv('보드1X', L.BOARD.race1.x), setv('보드1Y', L.BOARD.race1.y),
        setv('보드2X', L.BOARD.race2.x), setv('보드2Y', L.BOARD.race2.y),
        setv('칸크기', div(L.BOARD.race1.size, v('판크기'))),
    ], [
        setv('보드1X', L.BOARD.puzzle.x), setv('보드1Y', L.BOARD.puzzle.y),
        setv('칸크기', div(L.BOARD.puzzle.size, v('판크기'))),
    ]),
    chgv('배치세대', 1),
]);

const unlocked = (k) => (k === 1 ? G.val(true) : gt(item('별', k - 1), 0));
defineFunction('버튼 갱신', ['버튼 갱신'], () => {
    const St = (id, x) => setItem('버튼상태', id, x);
    const Sh = (id, x) => setItem('버튼모양', id, x);
    const out = [];
    for (const b of L.BUTTONS) {
        const here = b.key === 'raceExit'
            ? and(eq(v('화면'), 'RACE'), ne(v('오버레이'), 'MATCH'))
            : and(eq(v('화면'), b.screen), eq(v('오버레이'), b.overlay));
        let onBody = [St(b.id, 1)];
        if (b.kind === 'tile') {
            onBody = [
                IfElse(unlocked(b.stage), [St(b.id, 1)], [St(b.id, 3)]),
                IfElse(eq(v('최근스테이지'), b.stage), [Sh(b.id, `b${b.id}a`)], [Sh(b.id, `b${b.id}`)]),
            ];
        } else if (b.kind === 'skincard') {
            onBody = [IfElse(eq(v('스킨'), b.skin.id), [St(b.id, 4), Sh(b.id, `b${b.id}a`)], [
                IfElse(ge(v('총별'), b.skin.need), [St(b.id, 1), Sh(b.id, `b${b.id}`)], [St(b.id, 4), Sh(b.id, `b${b.id}l`)]),
            ])];
        } else if (b.level) {
            onBody = [
                IfElse(eq(v('모드'), 'AI'), [St(b.id, 1)], [St(b.id, 0)]),
                IfElse(eq(v('AI난이도'), b.level.id), [Sh(b.id, `b${b.id}a`)], [Sh(b.id, `b${b.id}`)]),
            ];
        } else if (b.key === 'size4' || b.key === 'size5') {
            const n = b.key === 'size4' ? 4 : 5;
            onBody = [St(b.id, 1), IfElse(eq(v('대전크기'), n), [Sh(b.id, `b${b.id}a`)], [Sh(b.id, `b${b.id}`)])];
        } else if (b.key === 'next') {
            onBody = [IfElse(lt(v('스테이지'), 30), [St(b.id, 1)], [St(b.id, 3)])];
        }
        out.push(IfElse(here, onBody, [St(b.id, 0)]));
    }
    out.push(chgv('버튼갱신', 1));
    return out;
});

defineFunction('화면 이동', ['화면', { param: '이름' }, '(으)로 이동'], () => [
    setv('화면', param('화면 이동', '이름')),
    setv('오버레이', ''),
    setv('힌트칸', 0),
    setv('풀이보기', 0),
    setv('대전상태', ''),
    chgv('대전세대', 1), // 진행 중이던 라운드/AI 스레드를 멈추게 하는 표시
    call('배치 갱신'),
    call('버튼 갱신'),
]);

// ---------------------------------------------------------------------------
// 퍼즐 모드
// ---------------------------------------------------------------------------
defineFunction('총별 계산', ['총 별 개수 계산'], () => [setv('총별', sumOf(seq(30).map((k) => item('별', k))))]);

defineFunction('스테이지 시작', ['스테이지', { param: 's' }, '시작'], () => {
    const s = param('스테이지 시작', 's');
    return [
        setv('모드', 'PUZZLE'),
        setv('스테이지', s),
        setv('최근스테이지', s),
        call('판 불러오기', s),
        setv('최소수', item('스테이지최소', s)),
        setv('이동수', 0),
        setv('힌트수', 0),
        setv('풀이봄', 0),
        setv('커서1', center()),
        setv('커서표시1', 0),
        call('화면 이동', 'PUZZLE'),
    ];
});

defineFunction('스테이지 클리어', ['스테이지 클리어'], () => {
    const F = '스테이지 클리어';
    const s = v('스테이지');
    return [
        IfElse(le(v('이동수'), v('최소수')), [setv('클리어별', 3)], [
            IfElse(le(v('이동수'), add(v('최소수'), 2)), [setv('클리어별', 2)], [setv('클리어별', 1)]),
        ]),
        If(and(gt(v('힌트수'), 0), gt(v('클리어별'), 2)), [setv('클리어별', 2)]),
        If(eq(v('풀이봄'), 1), [setv('클리어별', 1)]),
        setv('새기록', 0),
        lset(F, '이전총별', v('총별')),
        If(gt(v('클리어별'), item('별', s)), [setItem('별', s, v('클리어별')), setv('새기록', 1)]),
        call('총별 계산'),
        // 이번 클리어로 새 스킨이 열렸는지
        setv('새스킨', 0),
        ...L.SKINS.filter((sk) => sk.need > 0).map((sk) =>
            If(and(lt(lget(F, '이전총별'), sk.need), ge(v('총별'), sk.need)), [setv('새스킨', sk.id)])),
        If(and(lt(s, 30), eq(v('최근스테이지'), s)), [setv('최근스테이지', add(s, 1))]),
        // 결과 문구 두 번째 줄
        IfElse(eq(v('풀이봄'), 1), [setv('결과메모', 'AI 풀이를 봤어요 → ★')], [
            IfElse(gt(v('힌트수'), 0), [setv('결과메모', join('AI 힌트 ', v('힌트수'), '번 사용 → 최대 ★★'))], [
                IfElse(eq(v('클리어별'), 3), [setv('결과메모', 'AI와 같은 최소 횟수! 완벽해요')], [setv('결과메모', join('★★★ 조건: ', v('최소수'), '회 이하'))]),
            ]),
        ]),
        If(eq(v('새기록'), 1), [setv('결과메모', join(v('결과메모'), '  · 새 기록!'))]),
        ...L.SKINS.filter((sk) => sk.need > 0).map((sk) =>
            If(eq(v('새스킨'), sk.id), [setv('결과메모', join(v('결과메모'), NL, '새 스킨 「', sk.name, '」 해금!'))])),
        setv('힌트칸', 0),
        setv('풀이보기', 0),
        setv('오버레이모양', join('ov_clear', v('클리어별'))),
        setv('오버레이', 'CLEAR'),
        sfx('clear'),
        call('버튼 갱신'),
    ];
}, { locals: ['이전총별'] });

defineFunction('힌트 보기', ['AI 힌트 보기'], () => [
    If(and(eq(v('화면'), 'PUZZLE'), and(eq(v('오버레이'), ''), gt(v('켜진수1'), 0))), [
        call('풀이 계산', 1),
        call('풀이 칸 고르기'),
        setv('힌트칸', v('선택칸')),
        chgv('힌트수', 1),
        sfx('hint'),
    ]),
]);

defineFunction('풀이 보기 전환', ['AI 풀이 보기 켜기/끄기'], () => [
    If(and(eq(v('화면'), 'PUZZLE'), eq(v('오버레이'), '')), [
        setv('풀이보기', sub(1, v('풀이보기'))),
        If(eq(v('풀이보기'), 1), [setv('풀이봄', 1), call('풀이 계산', 1), sfx('hint')]),
    ]),
]);

// 사람이 칸을 눌렀을 때 (마우스·키보드 공통)
defineFunction('플레이어 누름', ['플레이어가 보드', { param: '보드' }, '칸', { param: '칸' }, '누름'], () => {
    const F = '플레이어 누름';
    const b = param(F, '보드');
    const k = param(F, '칸');
    return [
        If(and(eq(v('화면'), 'PUZZLE'), and(eq(v('오버레이'), ''), eq(b, 1))), [
            call('누르기', 1, k),
            chgv('이동수', 1),
            sfx('tick'),
            setv('힌트칸', 0),
            If(eq(v('풀이보기'), 1), [call('풀이 계산', 1)]),
            If(eq(v('켜진수1'), 0), [call('스테이지 클리어')]),
        ]),
        If(and(eq(v('화면'), 'RACE'), and(eq(v('대전상태'), 'PLAY'), or(eq(b, 1), eq(v('모드'), 'PVP')))), [
            call('누르기', b, k),
            sfx('tick'),
            IfElse(eq(b, 1), [chgv('누른수1', 1)], [chgv('누른수2', 1)]),
        ]),
    ];
});

// 커서 이동 (보드, 행 변화, 열 변화)
defineFunction('커서 이동', ['보드', { param: '보드' }, '커서를', { param: 'dr' }, '행', { param: 'dc' }, '열 이동'], () => {
    const F = '커서 이동';
    const b = param(F, '보드');
    const n = v('판크기');
    const r = lget(F, 'r');
    const c = lget(F, 'c');
    return [
        IfElse(eq(b, 1), [lset(F, 'k', v('커서1'))], [lset(F, 'k', v('커서2'))]),
        lset(F, 'r', add(quot(sub(lget(F, 'k'), 1), n), param(F, 'dr'))),
        lset(F, 'c', add(mod(sub(lget(F, 'k'), 1), n), param(F, 'dc'))),
        If(lt(r, 0), [lset(F, 'r', 0)]),
        If(gt(r, sub(n, 1)), [lset(F, 'r', sub(n, 1))]),
        If(lt(c, 0), [lset(F, 'c', 0)]),
        If(gt(c, sub(n, 1)), [lset(F, 'c', sub(n, 1))]),
        IfElse(eq(b, 1), [setv('커서1', add(add(mul(r, n), c), 1))], [setv('커서2', add(add(mul(r, n), c), 1))]),
    ];
}, { locals: ['k', 'r', 'c'] });

// 마우스 아래 칸 누르기 (오버레이 그림이 칸을 덮고 있을 때 클릭을 넘겨 준다)
defineFunction('마우스 칸 누르기', ['마우스 아래 칸 누르기'], () => {
    const F = '마우스 칸 누르기';
    const n = v('판크기');
    const half = div(mul(n, v('칸크기')), 2);
    return [
        IfElse(lt(mouseX(), 0), [lset(F, '보드', 1), lset(F, 'x0', sub(v('보드1X'), half)), lset(F, 'y0', add(v('보드1Y'), half))],
            [lset(F, '보드', 2), lset(F, 'x0', sub(v('보드2X'), half)), lset(F, 'y0', add(v('보드2Y'), half))]),
        lset(F, 'c', G.floor(div(sub(mouseX(), lget(F, 'x0')), v('칸크기')))),
        lset(F, 'r', G.floor(div(sub(lget(F, 'y0'), mouseY()), v('칸크기')))),
        If(and(and(ge(lget(F, 'c'), 0), lt(lget(F, 'c'), n)), and(ge(lget(F, 'r'), 0), lt(lget(F, 'r'), n))), [
            call('플레이어 누름', lget(F, '보드'), add(add(mul(lget(F, 'r'), n), lget(F, 'c')), 1)),
        ]),
    ];
}, { locals: ['보드', 'x0', 'y0', 'r', 'c'] });

// ---------------------------------------------------------------------------
// 대전
// ---------------------------------------------------------------------------
defineFunction('대전 시작', ['대전 시작'], () => [
    ...L.AI_LEVELS.map((l) => If(eq(v('AI난이도'), l.id), [setv('AI간격', l.delay), setv('AI실수', l.miss)])),
    setv('판크기', v('대전크기')),
    ...Object.entries(L.RACE_RANGE).map(([n, [lo, hi]]) => If(eq(v('대전크기'), +n), [setv('목표최소', lo), setv('목표최대', hi)])),
    setv('점수1', 0),
    setv('점수2', 0),
    setv('라운드', 0),
    // 새 판이 준비될 때까지 이전 판이 보이지 않게 비운다
    ...seq(MAXN).flatMap((i) => [setItem('보드1', i, 0), setItem('보드2', i, 0)]),
    setv('켜진수1', 0),
    setv('켜진수2', 0),
    call('화면 이동', 'RACE'),
    send('라운드 진행'),
]);

const alive = () => eq(v('진행세대'), v('대전세대'));
const stopIfStale = () => If(not(alive()), [StopThis()]);

// ---------------------------------------------------------------------------
// 오브젝트
// ---------------------------------------------------------------------------
const pic = (name) => {
    const m = manifest[name];
    if (!m) {
        throw new Error(`missing asset ${name}`);
    }
    return { name, file: m.file, thumb: m.thumb, width: m.width, height: m.height };
};
const HALF = 0.5;
const boardXY = (b, k) => {
    // 칸 번호 k 의 무대 좌표 (b: 1/2 → 보드1X/보드2X)
    const n = v('판크기');
    const off = div(sub(n, 1), 2);
    const cx = mul(sub(mod(sub(k, 1), n), off), v('칸크기'));
    const cy = mul(sub(quot(sub(k, 1), n), off), v('칸크기'));
    return b === 1
        ? [add(v('보드1X'), cx), sub(v('보드1Y'), cy)]
        : [add(v('보드2X'), cx), sub(v('보드2Y'), cy)];
};

// 1) 게임 관리자 (보이지 않는 오브젝트): 초기화, 메인 루프, 버튼, 키보드, 라운드, AI
{
    const o = P.sprite({ name: '게임', pictures: [pic('lock')], entity: { visible: false, scale: HALF } });
    P.addThread(o, onStart(
        hide(),
        setv('모드', 'PUZZLE'),
        setv('프레임수', 0),
        setv('버튼갱신', 0),
        call('총별 계산'),
        call('화면 이동', 'TITLE'),
        Forever([
            chgv('프레임수', 1),
            If(and(eq(v('화면'), 'RACE'), eq(v('대전상태'), 'PLAY')), [
                // 같은 프레임에 둘 다 끄면 무승부(라운드 다시)
                IfElse(and(eq(v('켜진수1'), 0), eq(v('켜진수2'), 0)), [setv('라운드승자', 0), setv('대전상태', 'ROUNDEND'), send('라운드 종료')], [
                    IfElse(eq(v('켜진수1'), 0), [setv('라운드승자', 1), setv('대전상태', 'ROUNDEND'), send('라운드 종료')], [
                        If(eq(v('켜진수2'), 0), [setv('라운드승자', 2), setv('대전상태', 'ROUNDEND'), send('라운드 종료')]),
                    ]),
                ]),
            ]),
        ])
    ));

    // 라운드: 판 만들기 → 3·2·1·GO → 시작
    const countStep = (name, sound) => [setv('오버레이모양', name), sfx(sound), Wait(0.7), stopIfStale()];
    P.addThread(o, onMsg('라운드 진행',
        setv('진행세대', v('대전세대')),
        chgv('라운드', 1),
        setv('대전상태', 'COUNT'),
        setv('생성시도', 0),
        // AI 풀이기로 최소 누름 수가 목표 범위인 판이 나올 때까지 다시 만든다
        // ('~이 될 때까지 반복'은 조건을 먼저 보므로, 퍼즐 모드에서 남은 풀이수 값 때문에 건너뛰지 않게 비워 둔다)
        setv('풀이수', -1),
        Until(and(ge(v('풀이수'), v('목표최소')), le(v('풀이수'), v('목표최대'))), [
            call('무작위 판'),
            call('풀이 계산', 1),
            chgv('생성시도', 1),
        ]),
        // 상대(보드2) 판을 먼저 정하고, 내 판(보드1)은 최소 누름 수가 똑같은 '다른' 판으로 다시 만든다
        //  → 난이도는 같지만 상대가 누르는 칸을 따라 눌러도 내 판은 풀리지 않는다
        call('판 복사'),
        setv('목표수', v('풀이수')),
        setv('풀이수', -1),
        setv('같은판', 1),
        Until(and(eq(v('풀이수'), v('목표수')), eq(v('같은판'), 0)), [
            call('무작위 판'),
            call('풀이 계산', 1),
            call('판 비교'),
            chgv('생성시도', 1),
        ]),
        stopIfStale(),
        setv('커서1', center()),
        setv('커서2', center()),
        setv('누른수1', 0),
        setv('누른수2', 0),
        call('배치 갱신'),
        setv('오버레이', 'COUNT'),
        call('버튼 갱신'),
        ...countStep('ov_c3', 'beep'),
        ...countStep('ov_c2', 'beep'),
        ...countStep('ov_c1', 'beep'),
        setv('오버레이모양', 'ov_cGO'),
        sfx('go'),
        setv('대전상태', 'PLAY'),
        setv('라운드시작', v('프레임수')),
        Wait(0.5),
        stopIfStale(),
        If(eq(v('오버레이'), 'COUNT'), [setv('오버레이', ''), call('버튼 갱신')])
    ));

    // 라운드 종료 → 점수 → 다음 라운드 또는 대전 결과
    const aiMode = eq(v('모드'), 'AI');
    P.addThread(o, onMsg('라운드 종료',
        setv('진행세대', v('대전세대')),
        setv('라운드시간', div(sub(v('프레임수'), v('라운드시작')), 60)),
        If(eq(v('라운드승자'), 1), [chgv('점수1', 1)]),
        If(eq(v('라운드승자'), 2), [chgv('점수2', 1)]),
        IfElse(eq(v('라운드승자'), 0), [setv('오버레이모양', 'ov_r_draw'), sfx('round')], [
            IfElse(aiMode,
                [IfElse(eq(v('라운드승자'), 1), [setv('오버레이모양', 'ov_r_you'), sfx('round')], [setv('오버레이모양', 'ov_r_ai'), sfx('lose')])],
                [IfElse(eq(v('라운드승자'), 1), [setv('오버레이모양', 'ov_r_p1')], [setv('오버레이모양', 'ov_r_p2')]), sfx('round')]),
        ]),
        setv('오버레이', 'ROUND'),
        call('버튼 갱신'),
        Wait(1.8),
        stopIfStale(),
        IfElse(or(ge(v('점수1'), 2), ge(v('점수2'), 2)), [
            setv('대전상태', 'MATCHEND'),
            IfElse(aiMode,
                [IfElse(ge(v('점수1'), 2), [setv('오버레이모양', 'ov_m_win'), sfx('win')], [setv('오버레이모양', 'ov_m_lose'), sfx('lose')])],
                [IfElse(ge(v('점수1'), 2), [setv('오버레이모양', 'ov_m_p1')], [setv('오버레이모양', 'ov_m_p2')]), sfx('win')]),
            setv('오버레이', 'MATCH'),
            call('버튼 갱신'),
        ], [send('라운드 진행')])
    ));

    // AI 플레이어: 기다림 → 판을 다시 풀기 → (실수 확률) → 커서 이동 → 누르기
    const aiTurnValid = () => and(and(eq(v('화면'), 'RACE'), eq(v('대전상태'), 'PLAY')),
        and(eq(v('AI세대'), v('대전세대')), eq(v('AI라운드'), v('라운드'))));
    P.addThread(o, onStart(Forever([
        If(and(and(eq(v('화면'), 'RACE'), eq(v('모드'), 'AI')), eq(v('대전상태'), 'PLAY')), [
            setv('AI세대', v('대전세대')),
            setv('AI라운드', v('라운드')),
            Wait(mul(v('AI간격'), div(rand(80, 120), 100))),
            If(and(aiTurnValid(), gt(v('켜진수2'), 0)), [
                call('풀이 계산', 2),
                IfElse(le(rand(1, 100), v('AI실수')),
                    [setv('AI목표', rand(1, mul(v('판크기'), v('판크기'))))],
                    [call('풀이 칸 고르기'), setv('AI목표', v('선택칸'))]),
                setv('커서2', v('AI목표')),
                Wait(0.25),
                If(aiTurnValid(), [call('누르기', 2, v('AI목표')), chgv('누른수2', 1), sfx('aitick')]),
            ]),
        ]),
    ])));

    // 버튼 처리
    const on = (key, ...body) => If(eq(v('눌린버튼'), B[key].id), body);
    P.addThread(o, onMsg('버튼 눌림',
        sfx('btn'),
        on('modePuzzle', setv('모드', 'PUZZLE'), call('화면 이동', 'STAGES')),
        on('modeAI', setv('모드', 'AI'), call('화면 이동', 'VSSET')),
        on('modePVP', setv('모드', 'PVP'), call('화면 이동', 'VSSET')),
        on('help', call('화면 이동', 'HELP')),
        on('skin', call('화면 이동', 'SKIN')),
        on('helpBack', call('화면 이동', 'TITLE')),
        on('skinBack', call('화면 이동', 'TITLE')),
        ...L.SKINS.map((sk, k) => on(`skin${sk.id}`, If(ge(v('총별'), sk.need), [setv('스킨', sk.id), call('버튼 갱신')]))),
        If(and(ge(v('눌린버튼'), B.stage1.id), le(v('눌린버튼'), B.stage30.id)), [call('스테이지 시작', sub(v('눌린버튼'), B.stage1.id - 1))]),
        on('stagesBack', call('화면 이동', 'TITLE')),
        on('hint', call('힌트 보기')),
        on('solve', call('풀이 보기 전환')),
        on('retry', call('스테이지 시작', v('스테이지'))),
        on('list', call('화면 이동', 'STAGES')),
        on('next', If(lt(v('스테이지'), 30), [call('스테이지 시작', add(v('스테이지'), 1))])),
        on('clearRetry', call('스테이지 시작', v('스테이지'))),
        on('clearList', call('화면 이동', 'STAGES')),
        ...L.AI_LEVELS.map((l) => on(`lv${l.id}`, setv('AI난이도', l.id), call('버튼 갱신'))),
        on('size4', setv('대전크기', 4), call('버튼 갱신')),
        on('size5', setv('대전크기', 5), call('버튼 갱신')),
        on('raceStart', call('대전 시작')),
        on('vsBack', call('화면 이동', 'TITLE')),
        on('raceExit', call('화면 이동', 'VSSET')),
        on('rematch', call('대전 시작')),
        on('raceMenu', call('화면 이동', 'TITLE'))
    ));

    // 키보드
    const canKey1 = () => or(and(eq(v('화면'), 'PUZZLE'), eq(v('오버레이'), '')), eq(v('화면'), 'RACE'));
    const p2keys = () => and(eq(v('화면'), 'RACE'), eq(v('모드'), 'PVP'));
    const move1 = (dr, dc) => If(canKey1(), [call('커서 이동', 1, dr, dc), setv('커서표시1', 1)]);
    P.addThread(o, onKey(87, move1(-1, 0))); // W
    P.addThread(o, onKey(83, move1(1, 0))); // S
    P.addThread(o, onKey(65, move1(0, -1))); // A
    P.addThread(o, onKey(68, move1(0, 1))); // D
    P.addThread(o, onKey(32, If(canKey1(), [setv('커서표시1', 1), call('플레이어 누름', 1, v('커서1'))]))); // SPACE
    const arrow = (dr, dc) => IfElse(p2keys(), [call('커서 이동', 2, dr, dc)], [move1(dr, dc)]);
    P.addThread(o, onKey(38, arrow(-1, 0)));
    P.addThread(o, onKey(40, arrow(1, 0)));
    P.addThread(o, onKey(37, arrow(0, -1)));
    P.addThread(o, onKey(39, arrow(0, 1)));
    P.addThread(o, onKey(13, IfElse(p2keys(), [call('플레이어 누름', 2, v('커서2'))],
        [If(canKey1(), [setv('커서표시1', 1), call('플레이어 누름', 1, v('커서1'))])]))); // ENTER
    const puzzleKey = (body) => If(and(eq(v('화면'), 'PUZZLE'), eq(v('오버레이'), '')), body);
    P.addThread(o, onKey(82, puzzleKey([sfx('btn'), call('스테이지 시작', v('스테이지'))]))); // R
    P.addThread(o, onKey(72, puzzleKey([call('힌트 보기')]))); // H
    P.addThread(o, onKey(27, If(ne(v('화면'), 'TITLE'), [sfx('btn'), call('화면 이동', 'TITLE')]))); // ESC
}

// 2) 소리 (대기열에 들어온 효과음을 차례로 재생)
{
    const sounds = Object.entries(soundMeta).map(([name, m]) => ({ name, file: `sound/${m.file}`, duration: m.duration }));
    const o = P.sprite({ name: '소리', pictures: [pic('lock')], sounds, entity: { visible: false, scale: HALF } });
    P.addThread(o, onStart(hide(), Forever([
        If(gt(listLen('소리대기'), 0), [playSound(item('소리대기', 1)), delItem('소리대기', 1)]),
    ])));
}

// 3) 버튼 (복제본 58개)
{
    const names = [];
    for (const b of L.BUTTONS) {
        names.push(`b${b.id}`);
        for (const suf of ['a', 'l']) {
            if (manifest[`b${b.id}${suf}`]) {
                names.push(`b${b.id}${suf}`);
            }
        }
    }
    const o = P.sprite({ name: '버튼', pictures: names.map(pic), entity: { scale: HALF, visible: false } });
    const me = v('내버튼');
    P.addThread(o, onStart(hide(), ...L.BUTTONS.flatMap((b) => [setv('내버튼', b.id), Clone()])));
    const hover = and(
        and(gt(mouseX(), sub(item('버튼X', me), div(item('버튼W', me), 2))), lt(mouseX(), add(item('버튼X', me), div(item('버튼W', me), 2)))),
        and(gt(mouseY(), sub(item('버튼Y', me), div(item('버튼H', me), 2))), lt(mouseY(), add(item('버튼Y', me), div(item('버튼H', me), 2))))
    );
    P.addThread(o, onClone(
        goXY(item('버튼X', me), item('버튼Y', me)),
        setv('내갱신', -1),
        setv('내호버', 0),
        Forever([
            If(ne(v('내갱신'), v('버튼갱신')), [
                setv('내갱신', v('버튼갱신')),
                setv('내호버', -1),
                IfElse(eq(item('버튼상태', me), 0), [hide()], [
                    shape(item('버튼모양', me)),
                    IfElse(eq(item('버튼상태', me), 3), [setEffect('transparency', 60)], [setEffect('transparency', 0)]),
                    show(),
                ]),
            ]),
            // 마우스를 올리면 살짝 밝게
            If(eq(item('버튼상태', me), 1), [
                IfElse(hover,
                    [If(ne(v('내호버'), 1), [setv('내호버', 1), setEffect('brightness', 14)])],
                    [If(ne(v('내호버'), 0), [setv('내호버', 0), setEffect('brightness', 0)])]),
            ]),
        ])
    ));
    P.addThread(o, onObjClick(
        If(eq(item('버튼상태', me), 1), [setv('눌린버튼', me), send('버튼 눌림')])
    ));
}

// 4) 글상자
const T = L.TEXT;
function textBox(name, cfg, opts, visibleCond, bodyFn, every = 4) {
    const o = P.textBox({
        name, text: ' ', x: cfg.x, y: cfg.y, width: cfg.w, height: cfg.h, visible: false, lineBreak: true, align: 0, ...opts,
    });
    P.addThread(o, onStart(hide(), Forever([
        IfElse(visibleCond(), [
            If(eq(mod(v('프레임수'), every), 0), bodyFn()),
            show(),
        ], [hide()]),
    ])));
    return o;
}
// 글상자 글꼴: 엔트리 기본 글꼴 중 Figma 그림의 둥근 글씨(Jua)와 어울리는 나눔스퀘어라운드
const KR = 'NanumSquareRound';
const MONO = 'NanumSquareRound';
const INK = '#1E2235';
const inPuzzle = () => eq(v('화면'), 'PUZZLE');
const inRace = () => eq(v('화면'), 'RACE');
const aiMode = () => eq(v('모드'), 'AI');
const raceTime = () => IfElse(eq(v('대전상태'), 'PLAY'),
    [write(join(fmt1(div(sub(v('프레임수'), v('라운드시작')), 60)), 's'))],
    [IfElse(or(eq(v('대전상태'), 'ROUNDEND'), eq(v('대전상태'), 'MATCHEND')), [write(join(fmt1(v('라운드시간')), 's'))], [write('0.0s')])]);

textBox('결과문구', L.TEXT.result, { fontSize: 9, font: KR, bold: true, colour: INK },
    () => or(and(inPuzzle(), eq(v('오버레이'), 'CLEAR')), and(inRace(), eq(v('오버레이'), 'MATCH'))), () => [
        IfElse(inPuzzle(),
            [write(join('이동 ', v('이동수'), '회 · AI 최소 ', v('최소수'), '회', NL, v('결과메모')))],
            [write(join('최종 스코어 ', v('점수1'), ' : ', v('점수2'), '  ·  ', v('라운드'), '라운드'))]),
    ], 6);
// 별 개수 (타이틀 · 스테이지 · 스킨 화면 — 화면마다 위치를 옮긴다)
textBox('별개수', T.titleStars, { fontSize: 9, font: KR, colour: INK, bold: true },
    () => or(or(eq(v('화면'), 'TITLE'), eq(v('화면'), 'STAGES')), eq(v('화면'), 'SKIN')), () => [
        IfElse(eq(v('화면'), 'STAGES'), [goXY(T.stagesStars.x, T.stagesStars.y)],
            [IfElse(eq(v('화면'), 'SKIN'), [goXY(0, -84)], [goXY(T.titleStars.x, T.titleStars.y)])]),
        write(join('★ ', v('총별'), ' / 90')),
    ], 10);
// 퍼즐 모드 패널
textBox('스테이지제목', T.stageTitle, { fontSize: 15, font: KR, bold: true, colour: INK }, inPuzzle, () => [
    write(join('STAGE ', v('스테이지'))),
], 10);
textBox('스테이지정보', T.stageSub, { fontSize: 7, font: KR, colour: '#6B6F82' }, inPuzzle, () => [
    write(join(v('판크기'), '×', v('판크기'), ' · 최고 기록 ', item('별', v('스테이지')), '★ · 남은 불 ', v('켜진수1'), '개')),
], 5);
textBox('이동수', T.moves, { fontSize: 20, font: MONO, bold: true, colour: INK }, inPuzzle, () => [write(v('이동수'))], 2);
textBox('최소수', T.par, { fontSize: 20, font: MONO, bold: true, colour: '#6C5BB8' }, inPuzzle, () => [write(v('최소수'))], 10);
textBox('별조건', T.goal, { fontSize: 7, font: KR, bold: true, colour: '#B26A00' }, inPuzzle, () => [
    write(join('★★★ ', v('최소수'), '회 이하 · ★★ ', add(v('최소수'), 2), '회 이하')),
], 10);
textBox('AI안내', T.aiMsg, { fontSize: 7.5, font: KR, bold: true, colour: '#3B2F7A' }, inPuzzle, () => [
    IfElse(eq(v('풀이보기'), 1), [write(join('AI 풀이: 보라색 점이 찍힌 칸을', NL, '모두 누르면 끝! (남은 최소 ', v('풀이수'), '번)'))], [
        IfElse(gt(v('힌트칸'), 0), [write(join('AI 힌트: 테두리가 빛나는 칸을', NL, '눌러 보세요 (남은 최소 ', v('풀이수'), '번)'))], [
            write(join('막히면 AI에게 물어보세요', NL, '힌트 H · 다시 R · 메뉴 ESC')),
        ]),
    ]),
], 4);
// 대전 화면
textBox('점수', T.score, { fontSize: 16, font: MONO, bold: true, colour: INK }, inRace, () => [
    write(join(v('점수1'), ' : ', v('점수2'))),
], 6);
textBox('라운드', T.round, { fontSize: 6, font: KR, bold: true, colour: '#6B6F82' }, inRace, () => [
    write(join('ROUND ', v('라운드'), ' · 3판 2선승')),
], 10);
textBox('시간', T.timer, { fontSize: 7.5, font: MONO, bold: true, colour: INK }, inRace, () => [raceTime()], 3);
textBox('이름1', T.name1, { fontSize: 9, font: KR, bold: true, colour: '#7EC4E8' }, inRace, () => [
    IfElse(aiMode(), [write('YOU · PLAYER 1')], [write('PLAYER 1')]),
], 20);
textBox('이름2', T.name2, { fontSize: 9, font: KR, bold: true, colour: '#F08A7E' }, inRace, () => [
    IfElse(aiMode(), [
        ...L.AI_LEVELS.map((l) => If(eq(v('AI난이도'), l.id), [write(`AI · ${l.name}`)])),
    ], [write('PLAYER 2')]),
], 20);
textBox('남은불1', T.left1, { fontSize: 6.5, font: KR, colour: '#C9CDE0' }, inRace, () => [
    write(join('남은 불 ', v('켜진수1'), ' · 누른 횟수 ', v('누른수1'))),
], 3);
textBox('남은불2', T.left2, { fontSize: 6.5, font: KR, colour: '#C9CDE0' }, inRace, () => [
    write(join('남은 불 ', v('켜진수2'), ' · 누른 횟수 ', v('누른수2'))),
], 3);
textBox('조작1', T.keys1, { fontSize: 6.5, font: KR, colour: '#8E95B5' }, inRace, () => [
    IfElse(aiMode(), [write('클릭 · WASD/방향키 + SPACE/ENTER')], [write('클릭 · WASD 이동 + SPACE 누르기')]),
], 20);
textBox('조작2', T.keys2, { fontSize: 6.5, font: KR, colour: '#8E95B5' }, inRace, () => [
    IfElse(aiMode(), [write('AI는 매 수마다 판을 다시 풀어요')], [write('클릭 · 방향키 이동 + ENTER 누르기')]),
], 20);

// 5) 오버레이 (클리어 · 카운트다운 · 라운드 · 대전 결과)
{
    const names = ['ov_clear1', 'ov_clear2', 'ov_clear3', 'ov_c3', 'ov_c2', 'ov_c1', 'ov_cGO',
        'ov_r_p1', 'ov_r_p2', 'ov_r_you', 'ov_r_ai', 'ov_r_draw', 'ov_m_p1', 'ov_m_p2', 'ov_m_win', 'ov_m_lose'];
    const o = P.sprite({ name: '오버레이', pictures: names.map(pic), entity: { scale: HALF, visible: false } });
    P.addThread(o, onStart(hide(), goXY(0, 0), setv('오버레이현재', ''), Forever([
        IfElse(eq(v('오버레이'), ''), [If(ne(v('오버레이현재'), ''), [setv('오버레이현재', ''), hide()])], [
            If(ne(v('오버레이현재'), v('오버레이모양')), [setv('오버레이현재', v('오버레이모양')), shape(v('오버레이모양')), show()]),
        ]),
    ])));
    // 'GO!' 가 떠 있는 동안에도 대전은 시작된 상태 → 클릭을 아래 칸으로 넘긴다
    P.addThread(o, onObjClick(If(and(inRace(), eq(v('대전상태'), 'PLAY')), [call('마우스 칸 누르기')])));
}

// 6) 스테이지 별 표시 (복제본 30개)
{
    const o = P.sprite({ name: '별표시', pictures: ['stars0', 'stars1', 'stars2', 'stars3', 'lock'].map(pic), entity: { scale: HALF, visible: false } });
    const k = v('별번호');
    P.addThread(o, onStart(hide(), ...seq(30).flatMap((n) => [setv('별번호', n), Clone()])));
    P.addThread(o, onClone(
        goXY(item('버튼X', add(k, B.stage1.id - 1)), sub(item('버튼Y', add(k, B.stage1.id - 1)), 9)),
        setv('별갱신', -1),
        Forever([
            If(ne(v('별갱신'), v('버튼갱신')), [
                setv('별갱신', v('버튼갱신')),
                IfElse(eq(v('화면'), 'STAGES'), [
                    // '또는' 블록은 양쪽을 모두 계산하므로(별 0번 항목 읽기 오류) 만약을 겹친다
                    IfElse(eq(k, 1), [shape(join('stars', item('별', k)))], [
                        IfElse(gt(item('별', sub(k, 1)), 0), [shape(join('stars', item('별', k)))], [shape('lock')]),
                    ]),
                    show(),
                ], [hide()]),
            ]),
        ])
    ));
}

// 7) 커서 (복제본 2개: 보드1 = 플레이어 1, 보드2 = 플레이어 2 또는 AI)
{
    const o = P.sprite({ name: '커서', pictures: ['cur_p1', 'cur_p2', 'cur_ai'].map(pic), entity: { scale: HALF, visible: false } });
    P.addThread(o, onStart(hide(), setv('커서보드', 1), Clone(), setv('커서보드', 2), Clone()));
    const target = (b) => {
        const [x, y] = boardXY(b, b === 1 ? v('커서1') : v('커서2'));
        return [setv('커서목표X', x), setv('커서목표Y', y)];
    };
    P.addThread(o, onClone(
        setv('커서보임', 0),
        setv('커서배치', -1),
        Forever([
            IfElse(eq(v('커서보드'), 1),
                [IfElse(or(and(inPuzzle(), and(eq(v('오버레이'), ''), eq(v('커서표시1'), 1))), and(inRace(), eq(v('대전상태'), 'PLAY'))),
                    [setv('커서원함', 1)], [setv('커서원함', 0)])],
                [IfElse(and(inRace(), eq(v('대전상태'), 'PLAY')), [setv('커서원함', 1)], [setv('커서원함', 0)])]),
            IfElse(eq(v('커서원함'), 1), [
                IfElse(eq(v('커서보드'), 1), target(1), target(2)),
                // 배치가 바뀌었거나 방금 나타났으면 바로 이동, 아니면 부드럽게 따라가기
                IfElse(or(ne(v('커서배치'), v('배치세대')), eq(v('커서보임'), 0)), [
                    setv('커서배치', v('배치세대')),
                    setv('커서X', v('커서목표X')), setv('커서Y', v('커서목표Y')),
                    setSize(mul(v('칸크기'), 1.1)),
                    IfElse(eq(v('커서보드'), 1), [shape('cur_p1')], [IfElse(aiMode(), [shape('cur_ai')], [shape('cur_p2')])]),
                ], [
                    setv('커서X', add(v('커서X'), mul(sub(v('커서목표X'), v('커서X')), 0.35))),
                    setv('커서Y', add(v('커서Y'), mul(sub(v('커서목표Y'), v('커서Y')), 0.35))),
                ]),
                goXY(v('커서X'), v('커서Y')),
                If(eq(v('커서보임'), 0), [setv('커서보임', 1), show()]),
            ], [If(eq(v('커서보임'), 1), [setv('커서보임', 0), hide()])]),
        ])
    ));
    // 커서 모서리를 클릭해도 그 칸이 눌리도록 (AI 커서는 사람이 누를 수 없음)
    P.addThread(o, onObjClick(If(eq(v('커서보임'), 1), [
        IfElse(eq(v('커서보드'), 1), [call('플레이어 누름', 1, v('커서1'))], [call('플레이어 누름', 2, v('커서2'))]),
    ])));
}

// 8) AI 표시 (퍼즐 모드: 힌트 칸 테두리 / 풀이 칸 점, 복제본 25개)
{
    const o = P.sprite({ name: 'AI표시', pictures: ['mark', 'hint'].map(pic), entity: { scale: HALF, visible: false } });
    const k = v('표시칸');
    P.addThread(o, onStart(hide(), ...seq(MAXN).flatMap((n) => [setv('표시칸', n), Clone()])));
    const [px, py] = boardXY(1, k);
    P.addThread(o, onClone(
        setv('표시보임', 0),
        setv('표시배치', -1),
        Forever([
            IfElse(and(and(inPuzzle(), eq(v('오버레이'), '')), and(le(k, mul(v('판크기'), v('판크기'))),
                or(eq(v('힌트칸'), k), and(eq(v('풀이보기'), 1), eq(item('풀이', k), 1))))), [setv('표시원함', 1)], [setv('표시원함', 0)]),
            IfElse(eq(v('표시원함'), 1), [
                If(ne(v('표시배치'), v('배치세대')), [setv('표시배치', v('배치세대')), goXY(px, py)]),
                IfElse(eq(v('힌트칸'), k), [
                    shape('hint'),
                    setSize(mul(v('칸크기'), add(1.02, mul(0.05, sin(mul(v('프레임수'), 9)))))),
                ], [shape('mark'), setSize(mul(v('칸크기'), add(0.9, mul(0.06, sin(mul(v('프레임수'), 6))))))]),
                If(eq(v('표시보임'), 0), [setv('표시보임', 1), show()]),
            ], [If(eq(v('표시보임'), 1), [setv('표시보임', 0), hide()])]),
        ])
    ));
    // 표시가 칸 위에 있으므로 클릭은 아래 칸으로 넘겨 준다
    P.addThread(o, onObjClick(If(eq(v('표시보임'), 1), [setv('커서1', k), setv('커서표시1', 0), call('플레이어 누름', 1, k)])));
}

// 9) 칸 (복제본 50개: 보드1 25칸 + 보드2 25칸)
{
    const pics = [];
    for (const sk of L.SKINS) {
        pics.push(`c${sk.id}_0`, `c${sk.id}_1`);
    }
    const o = P.sprite({ name: '칸', pictures: pics.map(pic), entity: { scale: HALF, visible: false } });
    const k = v('내칸');
    P.addThread(o, onStart(hide(), ...[1, 2].flatMap((b) => seq(MAXN).flatMap((n) => [setv('내보드', b), setv('내칸', n), Clone()]))));
    const [x1, y1] = boardXY(1, k);
    const [x2, y2] = boardXY(2, k);
    P.addThread(o, onClone(
        setv('내보임', 0),
        setv('내배치', -1),
        setv('내값', -1),
        setv('팝', 0),
        Forever([
            // 보여야 하는가: 퍼즐(보드1) · 대전(보드1, 보드2), 판 크기 안의 칸만
            IfElse(and(le(k, mul(v('판크기'), v('판크기'))),
                or(inRace(), and(inPuzzle(), eq(v('내보드'), 1)))), [setv('원함', 1)], [setv('원함', 0)]),
            If(ne(v('원함'), v('내보임')), [setv('내보임', v('원함')), IfElse(eq(v('원함'), 1), [show()], [hide()])]),
            If(eq(v('내보임'), 1), [
                If(ne(v('내배치'), v('배치세대')), [
                    setv('내배치', v('배치세대')),
                    IfElse(eq(v('내보드'), 1), [goXY(x1, y1)], [goXY(x2, y2)]),
                    setv('내크기', v('칸크기')),
                    setSize(v('내크기')),
                    setv('내값', -1),
                    setv('팝', 0),
                ]),
                IfElse(eq(v('내보드'), 1), [setv('지금값', item('보드1', k))], [setv('지금값', item('보드2', k))]),
                If(or(ne(v('지금값'), v('내값')), ne(v('스킨'), v('내스킨'))), [
                    If(and(ne(v('내값'), -1), ne(v('지금값'), v('내값'))), [setv('팝', 5)]),
                    setv('내값', v('지금값')),
                    setv('내스킨', v('스킨')),
                    shape(join('c', v('스킨'), '_', v('지금값'))),
                ]),
                If(gt(v('팝'), 0), [
                    chgv('팝', -1),
                    setSize(mul(v('내크기'), add(1, mul(v('팝'), 0.025)))),
                ]),
            ]),
        ])
    ));
    P.addThread(o, onObjClick(
        If(eq(v('내보임'), 1), [
            IfElse(eq(v('내보드'), 1), [setv('커서1', k), setv('커서표시1', 0)], [If(eq(v('모드'), 'PVP'), [setv('커서2', k)])]),
            call('플레이어 누름', v('내보드'), k),
        ])
    ));
}

// 10) 배경 (화면별 그림)
{
    const names = ['scr_title', 'scr_help', 'scr_skin', 'scr_stages', 'scr_puzzle', 'scr_vsset_ai', 'scr_vsset_pvp', 'scr_race'];
    const o = P.sprite({ name: '배경', pictures: names.map(pic), entity: { scale: HALF } });
    const map = { TITLE: 'scr_title', HELP: 'scr_help', SKIN: 'scr_skin', STAGES: 'scr_stages', PUZZLE: 'scr_puzzle', RACE: 'scr_race' };
    P.addThread(o, onStart(goXY(0, 0), setv('배경현재', ''), Forever([
        If(ne(v('배경현재'), join(v('화면'), v('모드'))), [
            setv('배경현재', join(v('화면'), v('모드'))),
            ...Object.entries(map).map(([k, p]) => If(eq(v('화면'), k), [shape(p)])),
            If(eq(v('화면'), 'VSSET'), [IfElse(aiMode(), [shape('scr_vsset_ai')], [shape('scr_vsset_pvp')])]),
        ]),
    ])));
}

// ---------------------------------------------------------------------------
// 오브젝트 순서 (엔트리 오브젝트 목록 맨 위 = 가장 앞)
// ---------------------------------------------------------------------------
const order = ['게임', '소리', '별표시', '버튼', '결과문구', '오버레이', '별개수', '스테이지제목', '스테이지정보', '이동수', '최소수', '별조건', 'AI안내',
    '점수', '라운드', '시간', '이름1', '이름2', '남은불1', '남은불2', '조작1', '조작2', '커서', 'AI표시', '칸', '배경'];
if (order.length !== P.objects.length) {
    throw new Error(`object order mismatch: ${P.objects.map((o) => o.name).filter((n) => !order.includes(n))}`);
}
P.objects.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

// ---------------------------------------------------------------------------
// 빌드 & 패키징
// ---------------------------------------------------------------------------
const project = P.build();
const stage = fs.mkdtempSync(path.join(require('os').tmpdir(), 'loent-'));
const tempDir = path.join(stage, 'temp');
fs.mkdirSync(tempDir, { recursive: true });
// files: { 종류: 에셋 경로 } → temp/xx/yy/<종류>/<id>.<ext>
const place = (files, ext) => {
    const main = Object.values(files)[0];
    const id = crypto.createHash('md5').update(`lights-out/${main}`).digest('hex');
    const sub = path.join(id.slice(0, 2), id.slice(2, 4));
    for (const [kind, file] of Object.entries(files)) {
        const d = path.join(tempDir, sub, kind);
        fs.mkdirSync(d, { recursive: true });
        fs.copyFileSync(path.join(assetDir, file), path.join(d, `${id}${ext}`));
    }
    return { id, url: (kind) => `temp/${id.slice(0, 2)}/${id.slice(2, 4)}/${kind}/${id}${ext}` };
};
for (const o of project.objects) {
    for (const p of o.sprite.pictures) {
        const f = place({ image: p._file, thumb: p._thumb || p._file }, '.png');
        p.filename = f.id;
        p.fileurl = f.url('image');
        p.thumbUrl = f.url('thumb');
        delete p._file;
        delete p._thumb;
    }
    for (const s of o.sprite.sounds) {
        const f = place({ sound: s._file }, '.mp3');
        s.filename = f.id;
        s.fileurl = f.url('sound');
        delete s._file;
    }
}
project.name = 'LIGHTS OUT';
fs.writeFileSync(path.join(tempDir, 'project.json'), JSON.stringify(project));
if (outJson) {
    fs.mkdirSync(path.dirname(outJson), { recursive: true });
    fs.writeFileSync(outJson, JSON.stringify(project, null, 1));
}
fs.mkdirSync(path.dirname(path.resolve(outEnt)), { recursive: true });
execFileSync('tar', ['-czf', path.resolve(outEnt), '-C', stage, 'temp']);
fs.rmSync(stage, { recursive: true, force: true });

if (process.env.LO_BLOCK_DOC) {
    const { renderProjectDoc } = require('./gl_blockdoc');
    const meta = {
        functions: Object.fromEntries(Object.values(P.functions).map((f) => [f.id, { name: f.name, spec: f.spec, paramTypes: f.paramTypes }])),
    };
    fs.writeFileSync(process.env.LO_BLOCK_DOC, renderProjectDoc(project, meta));
}

let blocks = 0;
for (const o of project.objects) {
    for (const t of JSON.parse(o.script)) {
        blocks += G.countBlocks(t);
    }
}
for (const f of project.functions) {
    for (const t of JSON.parse(f.content)) {
        blocks += G.countBlocks(t);
    }
}
const size = fs.statSync(outEnt).size;
console.log(`built ${outEnt} (${(size / 1024).toFixed(0)} KB): objects=${project.objects.length} functions=${project.functions.length} ` +
    `variables=${project.variables.length} messages=${project.messages.length} statementBlocks≈${blocks}`);
