'use strict';
/**
 * GRAVITY LAB — 엔트리 작품(.ent) 빌드 스크립트
 *
 *   node tools/build_gravity_lab.js <에셋폴더> <출력 .ent 경로> [project.json 경로]
 *
 * 에셋 폴더는 tools/gl_art.js 가 만든 PNG + manifest.json.
 * .ent = tar.gz { temp/project.json, temp/xx/yy/image/<id>.png, temp/xx/yy/thumb/<id>.png }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const G = require('./entrygen');
const L = require('./gl_layout');
const { definePhysics, SLOTS } = require('./gl_physics');
const { BODY_COLORS } = require('./gl_art');

const {
    Project, blk, val, add, sub, mul, div, sqrt, abs, round, mod, join,
    mouseX, mouseY, answer, isNumber, lenStr,
    eq, ne, gt, lt, ge, le, and, or, not, mouseDown,
    v, setv, chgv, item, setItem, addItem, delItem, listLen,
    If, IfElse, Forever, Repeat, Until, Wait, Clone, DeleteClone, Ask, HideAnswer, send,
    onStart, onMsg, onClone, onKey, onObjClick, onMouseDown,
    goXY, show, hide, setSize, shape, setEffect, penDown, penUp, penColor, penSize, penAlpha, penClear, write,
    defineFunction, param, call, lget, lset,
} = G;

const [assetDir = 'build/assets', outEnt = 'dist/GRAVITY_LAB.ent', outJson] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json'), 'utf8'));

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------
const NL = '\n';
const BODY_IMG = 64; // 천체 그림 한 변(px, 1배 기준)
const BODY_DIAM = 48; // 그림 안 천체 원 지름
const MASS_MIN = 0.001;
const MASS_MAX = 1000000;
const VEL_MAX = 500;
const POS_MAX = 1000;
const RAD_MIN = 1;
const RAD_MAX = 40;
const ZOOMS = [0.25, 0.5, 1, 2, 4];
const TRAIL_LEN = [3, 10, 30, 1000000000];

// 숫자 표시용 반올림: round(x·10^d)/10^d
const fmt = (x, d = 2) => div(round(mul(x, 10 ** d)), 10 ** d);

// ---------------------------------------------------------------------------
// 프로젝트 / 데이터 선언
// ---------------------------------------------------------------------------
const P = new Project();

// 오브젝트 id 예약(지역 변수 선언에 필요)
const OBJ = {
    button: P.reserveObject('버튼'),
    screen: P.reserveObject('화면'),
    body: P.reserveObject('천체'),
    trail: P.reserveObject('궤적'),
    ghost: P.reserveObject('비교궤적'),
    effect: P.reserveObject('충돌효과'),
};

// --- 전역 변수 ---
const GV = {
    // 화면/상태
    화면: 'START', 이전화면: 'START', 상태: 'START', 모드: 'BASIC', 프리셋번호: 1, 프리셋이름: '', 프리셋질문: '',
    최대천체수: 2, 기본선택: 2, 선택천체: 0, 찾은천체: 0, 입력중: 0, 배치대기: 0, 탭: 'Q', 눌린버튼: 0, 버튼갱신: 0,
    안내문구: '', 안내시각: 0, 프레임수: 0, 활성천체수: 0,
    // 물리 (시뮬레이션 단위: 길이 LU, 질량 MU, 시간 s)
    중력상수: 10, dt: 1 / 60, 프레임시간: 1 / 60, 배속: 1, 누적시간: 0, 시뮬레이션시간: 0, 스텝수: 0,
    최소거리제곱: 4, 프레임최대스텝: 10, 최대가속도: 20000, 최대가속도제곱: 400000000, 이탈거리: 2000, 충돌사용: 1, 사용슬롯: 0,
    // 화면 표시
    중심X: L.VIEW_CENTER.x, 중심Y: L.VIEW_CENTER.y, 배율: 1, 배율단계: 3, 기본배율단계: 3,
    궤적표시: 1, 궤적길이단계: 3, 궤적주기: 30, 궤적세대: 0, 궤적끊기: 0, 비교세대: 0,
    벡터표시: 1, 벡터배율: 1.2, 벡터최대: 60,
    // 사건 / 분석
    충돌횟수: 0, 탈출횟수: 0, 확인한사건수: 0, 종료사유: '',
    분석대상: 0, 기준천체: 0, 기준이름: '-', 현재속력: 0, 현재거리: 0, 최대속력: 0, 최소거리: 0, 최대거리: 0, 다음기록시간: 0,
    // 실험 A 저장값
    비교A저장: 0, A_천체: 0, A_이름: '', A_질량0: 0, A_속력0: 0, A_VX0: 0, A_VY0: 0, A_최대속력: 0,
    A_최소거리: 0, A_최대거리: 0, A_충돌: 0, A_탈출: 0, A_결과: '', A_시간: 0, A_최종X: 0, A_최종Y: 0,
    // 성능 측정
    실효배속: 0, 측정시각: 0, 측정시뮬시간: 0,
    // 실험 A 경로 기록(0.2 s 간격, 최대 300 샘플 × 8 슬롯)
    비교샘플수: 0, 다음비교시간: 0,
    // 드래그
    드래그X0: 0, 드래그Y0: 0, 드래그MX: 0, 드래그MY: 0, 드래그함: 0,
};
for (const [k, x] of Object.entries(GV)) {
    P.variable(k, x);
}

// --- 지역 변수(복제본마다 따로 가짐) ---
P.variable('내버튼', 0, { object: OBJ.button });
P.variable('내갱신', -1, { object: OBJ.button });
P.variable('내화면', '', { object: OBJ.screen });
P.variable('내번호', 0, { object: OBJ.body });
P.variable('궤적번호', 0, { object: OBJ.trail });
P.variable('궤적버퍼', 0, { object: OBJ.trail });
P.variable('궤적세대값', -1, { object: OBJ.trail });
P.variable('궤적끊기값', -1, { object: OBJ.trail });
P.variable('궤적구간', -1, { object: OBJ.trail });
P.variable('그리는중', 0, { object: OBJ.trail });
P.variable('비교그림세대', -1, { object: OBJ.ghost });
P.variable('효과크기값', 20, { object: OBJ.effect });

// --- 천체 데이터 리스트 (8칸 고정 슬롯: 같은 번호 = 같은 천체) ---
const zeros = Array(SLOTS).fill(0);
const DATA_LISTS = ['이름', '질량', 'X', 'Y', 'VX', 'VY', '반지름', '색상', '활성'];
P.list('천체ID', [1, 2, 3, 4, 5, 6, 7, 8]);
P.list('이름', zeros.map((_, k) => `천체 ${k + 1}`));
P.list('질량', zeros.map(() => 100));
for (const n of ['X', 'Y', 'VX', 'VY']) {
    P.list(n, zeros);
}
P.list('반지름', zeros.map(() => 4));
P.list('색상', zeros.map((_, k) => k + 1));
P.list('활성', zeros);
for (const n of ['FX', 'FY', 'AX', 'AY']) {
    P.list(n, zeros);
}
for (const n of DATA_LISTS) {
    P.list(`초기_${n}`, zeros);
}
P.list('색상코드', BODY_COLORS);
P.list('보호작동', [0, 0]); // 1: 최대 가속도 제한 작동 횟수, 2: 프레임 계산 한도 초과(시간 생략) 횟수
// 버튼
const allButtonIds = [...Array(L.BUTTON_COUNT)].map((_, k) => k + 1);
const btnById = Object.fromEntries(L.BUTTONS.map((b) => [b.id, b]));
P.list('버튼X', allButtonIds.map((id) => (btnById[id] ? btnById[id].x : 0)));
P.list('버튼Y', allButtonIds.map((id) => (btnById[id] ? btnById[id].y : 0)));
P.list('버튼상태', allButtonIds.map(() => 0)); // 0 숨김, 1 보통, 2 강조(켜짐), 3 비활성
P.list('버튼모양', allButtonIds.map((id) => `b${id}`));
// 충돌 효과 대기열, 분석 기록
P.list('효과X', []);
P.list('효과Y', []);
P.list('효과크기', []);
P.list('기록_시간', []);
P.list('기록_속력', []);
P.list('기록_거리', []);
const GHOST_SAMPLES = 300;
P.list('비교X', Array(GHOST_SAMPLES * SLOTS).fill(0));
P.list('비교Y', Array(GHOST_SAMPLES * SLOTS).fill(0));

P.message('버튼 눌림');

// ---------------------------------------------------------------------------
// 공통 식
// ---------------------------------------------------------------------------
const scrX = (lx) => add(v('중심X'), mul(lx, v('배율')));
const scrY = (ly) => add(v('중심Y'), mul(ly, v('배율')));
const worldX = (sx) => div(sub(sx, v('중심X')), v('배율'));
const worldY = (sy) => div(sub(sy, v('중심Y')), v('배율'));
const speedOf = (k) => sqrt(add(mul(item('VX', k), item('VX', k)), mul(item('VY', k), item('VY', k))));
const inView = (x, y) => and(and(gt(x, L.VIEW.x0), lt(x, L.VIEW.x1)), and(gt(y, L.VIEW.y0), lt(y, L.VIEW.y1)));
const inRect = (b, x, y) => and(
    and(gt(x, b.x - b.w / 2 - 1), lt(x, b.x + b.w / 2 + 1)),
    and(gt(y, b.y - b.h / 2 - 1), lt(y, b.y + b.h / 2 + 1))
);
const say = (...parts) => [setv('안내문구', join(...parts)), setv('안내시각', v('프레임수'))];
const refreshButtons = () => call('버튼 갱신');

// ---------------------------------------------------------------------------
// 물리 엔진 (gl_physics.js)
// ---------------------------------------------------------------------------
definePhysics(P, {
    maxSteps: 10,
    onMerge: (Lk) => [
        chgv('충돌횟수', 1),
        // 충돌 효과(화면 효과는 물리와 분리: 대기열에 넣고 효과 오브젝트가 꺼내 그린다)
        If(lt(listLen('효과X'), 8), [
            addItem('효과X', item('X', Lk('k'))),
            addItem('효과Y', item('Y', Lk('k'))),
            addItem('효과크기', item('반지름', Lk('k'))),
        ]),
        ...say('충돌! ', item('이름', Lk('q')), ' → ', item('이름', Lk('k')), ' 병합 (질량 보존, 운동량 보존 속도)'),
    ],
    onEscape: (i) => [
        chgv('탈출횟수', 1),
        setItem('VX', i(), 0),
        setItem('VY', i(), 0),
        If(eq(v('선택천체'), i()), [setv('선택천체', 0)]),
        ...say(item('이름', i()), ' 이(가) 관측 범위(±', v('이탈거리'), ' LU)를 벗어나 탈출했어요'),
    ],
});

// ---------------------------------------------------------------------------
// 슬롯/초기 조건
// ---------------------------------------------------------------------------
{
    const F = '슬롯 설정';
    const names = ['k', '이름', '질량', 'x', 'y', 'vx', 'vy', '반지름', '색상', '활성'];
    defineFunction(F, ['슬롯', { param: 'k' }, '설정', ...names.slice(1).map((n) => ({ param: n }))], () => {
        const p = (n) => param(F, n);
        return [
            setItem('이름', p('k'), p('이름')),
            setItem('질량', p('k'), p('질량')),
            setItem('X', p('k'), p('x')),
            setItem('Y', p('k'), p('y')),
            setItem('VX', p('k'), p('vx')),
            setItem('VY', p('k'), p('vy')),
            setItem('반지름', p('k'), p('반지름')),
            setItem('색상', p('k'), p('색상')),
            setItem('활성', p('k'), p('활성')),
        ];
    });
}
defineFunction('초기 조건 저장', ['초기 조건 저장'], () => {
    const out = [];
    for (let k = 1; k <= SLOTS; k++) {
        for (const n of DATA_LISTS) {
            out.push(setItem(`초기_${n}`, k, item(n, k)));
        }
    }
    return out;
});
defineFunction('초기 조건 복원', ['초기 조건 복원'], () => {
    const out = [];
    for (let k = 1; k <= SLOTS; k++) {
        for (const n of DATA_LISTS) {
            out.push(setItem(n, k, item(`초기_${n}`, k)));
        }
    }
    return out;
});
{
    const F = '사용 슬롯 계산';
    defineFunction(F, ['사용 슬롯 계산'], () => {
        const out = [lset(F, 'u', 0), lset(F, 'n', 0)];
        for (let k = 1; k <= SLOTS; k++) {
            out.push(If(eq(item('활성', k), 1), [lset(F, 'u', k), lset(F, 'n', add(lget(F, 'n'), 1))]));
        }
        out.push(setv('사용슬롯', lget(F, 'u')), setv('활성천체수', lget(F, 'n')));
        // O(N²) 계산량에 맞춰 한 프레임 최대 스텝 수 조절 (천체 3개 이하 10, 5개 이하 6, 그 이상 4)
        out.push(IfElse(le(lget(F, 'n'), 3), [setv('프레임최대스텝', 10)], [
            IfElse(le(lget(F, 'n'), 5), [setv('프레임최대스텝', 6)], [setv('프레임최대스텝', 4)]),
        ]));
        return out;
    }, { locals: ['u', 'n'] });
}

// 모든 실험 기록/상태를 초기화 (천체 데이터 제외)
defineFunction('실험 상태 초기화', ['실험 상태 초기화'], () => {
    const out = [];
    for (let k = 1; k <= SLOTS; k++) {
        for (const n of ['FX', 'FY', 'AX', 'AY']) {
            out.push(setItem(n, k, 0));
        }
    }
    out.push(
        setv('시뮬레이션시간', 0), setv('누적시간', 0), setv('스텝수', 0),
        setItem('보호작동', 1, 0), setItem('보호작동', 2, 0),
        setv('충돌횟수', 0), setv('탈출횟수', 0), setv('확인한사건수', 0), setv('종료사유', ''),
        setv('분석대상', 0), setv('기준천체', 0), setv('현재속력', 0), setv('현재거리', 0),
        setv('최대속력', 0), setv('최소거리', 0), setv('최대거리', 0), setv('다음기록시간', 0),
        setv('배치대기', 0), setv('실효배속', 0), setv('다음비교시간', 0),
        If(eq(v('비교A저장'), 0), [setv('비교샘플수', 0)]),
        chgv('궤적세대', 1),
    );
    // 효과 대기열(최대 8) · 기록 리스트(최대 100) 비우기 — 반복 블록은 프레임을 넘기므로 펼쳐서 지운다
    for (let k = 0; k < 8; k++) {
        for (const n of ['효과X', '효과Y', '효과크기']) {
            out.push(If(gt(listLen(n), 0), [delItem(n, 1)]));
        }
    }
    for (let k = 0; k < 101; k++) {
        out.push(If(gt(listLen('기록_시간'), 0), [delItem('기록_시간', 1), delItem('기록_속력', 1), delItem('기록_거리', 1)]));
    }
    out.push(call('사용 슬롯 계산'));
    return out;
});

// 화면 표시 기본값 (RESET 시 UI 상태 복구)
defineFunction('표시 기본값', ['표시 기본값'], () => [
    setv('배율단계', v('기본배율단계')),
    ...ZOOMS.map((z, k) => If(eq(v('배율단계'), k + 1), [setv('배율', z)])),
    chgv('비교세대', 1),
    setv('배속', 1), setv('궤적표시', 1), setv('궤적길이단계', 3), setv('궤적주기', TRAIL_LEN[2]),
    // 실험 A 를 저장해 비교 중이면 [비교] 탭을 유지 (RESET → 조건 변경 → 재실험 흐름)
    setv('벡터표시', 1), IfElse(eq(v('비교A저장'), 1), [setv('탭', 'C')], [setv('탭', 'Q')]), setv('선택천체', v('기본선택')),
]);

// ---------------------------------------------------------------------------
// 프리셋 (시뮬레이션 단위, G = 10)
// ---------------------------------------------------------------------------
const f5 = (x) => Math.round(x * 100000) / 100000;
function slot(k, name, m, x, y, vx, vy, r, color, act = 1) {
    return call('슬롯 설정', k, name, m, f5(x), f5(y), f5(vx), f5(vy), r, color, act);
}
function emptySlots(from) {
    const out = [];
    for (let k = from; k <= SLOTS; k++) {
        out.push(slot(k, `천체 ${k}`, 100, 0, 0, 0, 0, 4, k, 0));
    }
    return out;
}
const Gc = 10;
const vc = (M, r) => Math.sqrt((Gc * M) / r); // 원궤도 속력
const PRESET_DEF = {
    1: () => {
        const v1 = vc(10000, 100); // 31.62
        return {
            mode: 'BASIC', max: 2, sel: 2, zoom: 3,
            name: '2체 궤도 모델',
            q: `Q. 위성의 속도를 줄이면 궤도는?${NL}① 위성 선택 → [VY] → 25${NL}② ▶ PLAY → 궤도 모양 관찰${NL}③ 위성 질량을 2배로 하면?${NL}   (궤도가 바뀔까, 그대로일까?)${NL}VY 31.62 = 원궤도 속력 √(GM/r)`,
            slots: [
                slot(1, '행성', 10000, 0, 0, 0, -(10 * v1) / 10000, 12, 1),
                slot(2, '위성', 10, 100, 0, 0, v1, 3, 2),
                ...emptySlots(3),
            ],
        };
    },
    2: () => ({
        mode: 'EXPERIMENT', max: 6, sel: 2, zoom: 2,
        name: '탈출 속도 실험',
        q: `Q. 얼마나 빨라야 영원히 떠날까?${NL}탈출 속도 √(2GM/r) ≈ 57.7${NL}① 지금(VY 50) 실행 → ×5${NL}② [비교] 탭 → [A로 저장]${NL}③ RESET → VY 60 → PLAY${NL}④ 궤적·최대 거리 비교`,
        slots: [
            slot(1, '행성', 10000, 0, 0, 0, -(1 * 50) / 10000, 10, 1),
            slot(2, '탐사체', 1, 60, 0, 0, 50, 2, 4),
            ...emptySlots(3),
        ],
    }),
    3: () => {
        const vb = Math.sqrt((Gc * 5000) / (2 * 100)); // 15.81
        return {
            mode: 'EXPERIMENT', max: 6, sel: 1, zoom: 3,
            name: '쌍성계',
            q: `Q. 한 별의 질량을 2배로 바꾸면?${NL}① 별 A 선택 → [질량] → 10000${NL}② ▶ PLAY: 어느 별이 더 크게${NL}   움직일까?${NL}③ 두 별 궤도의 중심은 어디?${NL}지금: 질량 5000씩 · 거리 100`,
            slots: [
                slot(1, '별 A', 5000, -50, 0, 0, -vb, 8, 1),
                slot(2, '별 B', 5000, 50, 0, 0, vb, 8, 2),
                ...emptySlots(3),
            ],
        };
    },
    4: () => {
        // Chenciner–Montgomery 8자 해 (G=1, m=1) → 길이 ×100, 속도 ×20 (m=4000, G=10)
        const X1 = [-0.97000436, 0.24308753];
        const V3 = [-0.93240737, -0.86473146];
        const Ls = 100;
        const Vs = Math.sqrt((Gc * 4000) / Ls); // 20
        return {
            mode: 'EXPERIMENT', max: 6, sel: 1, zoom: 3,
            name: '3체 문제 (8자 해)',
            q: `Q. 속도를 0.1만 바꾸면?${NL}같은 질량 세 천체의 8자 궤도 해${NL}① 그대로 실행 → [A로 저장]${NL}② RESET → 천체 A의 VX를${NL}   9.32 → 9.42 로 바꾸고 PLAY${NL}③ 작은 차이가 커지는지 관찰`,
            slots: [
                slot(1, '천체 A', 4000, X1[0] * Ls, X1[1] * Ls, (-V3[0] / 2) * Vs, (-V3[1] / 2) * Vs, 4, 1),
                slot(2, '천체 B', 4000, -X1[0] * Ls, -X1[1] * Ls, (-V3[0] / 2) * Vs, (-V3[1] / 2) * Vs, 4, 2),
                slot(3, '천체 C', 4000, 0, 0, V3[0] * Vs, V3[1] * Vs, 4, 3),
                ...emptySlots(4),
            ],
        };
    },
    5: () => {
        const vp = vc(10000, 120); // 28.87
        return {
            mode: 'SANDBOX', max: 8, sel: 2, zoom: 3,
            name: '사용자 직접 실험',
            q: `자유 실험: 질문을 직접 만들기${NL}[+ 천체] → 영역 클릭 → 배치${NL}→ [질량] [VX] [VY] 입력${NL}예) 두 별 사이에 작은 천체를?${NL}예) 같은 궤도에 천체 두 개를?${NL}준비·일시정지 중 드래그로 이동`,
            slots: [
                slot(1, '항성', 10000, 0, 0, 0, -(10 * vp) / 10000, 10, 1),
                slot(2, '행성', 10, 120, 0, 0, vp, 3, 2),
                ...emptySlots(3),
            ],
        };
    },
};
for (const n of [1, 2, 3, 4, 5]) {
    defineFunction(`프리셋 ${n} 데이터`, [`프리셋 ${n} 데이터`], () => {
        const d = PRESET_DEF[n]();
        return [
            ...d.slots,
            setv('모드', d.mode), setv('최대천체수', d.max), setv('기본선택', d.sel),
            setv('프리셋이름', d.name), setv('프리셋질문', d.q),
            setv('기본배율단계', d.zoom),
        ];
    });
}
{
    const F = '프리셋 불러오기';
    defineFunction(F, ['프리셋 불러오기'], () => [
        setv('상태', 'RESETTING'),
        ...[1, 2, 3, 4, 5].map((n) => If(eq(v('프리셋번호'), n), [call(`프리셋 ${n} 데이터`)])),
        call('초기 조건 저장'),
        call('표시 기본값'),
        call('실험 상태 초기화'),
        call('분석 대상 설정'),
        setv('상태', 'READY'),
    ]);
}

// ---------------------------------------------------------------------------
// 상태 전환
// ---------------------------------------------------------------------------
defineFunction('실험 재생', ['실험 재생'], () => [
    If(eq(v('상태'), 'READY'), [
        call('사용 슬롯 계산'),
        IfElse(eq(v('활성천체수'), 0), [...say('천체가 없어요. [+ 천체]로 추가하세요')], [
            call('초기 조건 저장'), // 실험 시작 순간의 조건 = RESET 이 돌아갈 조건
            call('분석 대상 설정'),
            call('분석 기록'), // t = 0 상태도 기록
            call('비교 경로 기록'),
            setv('상태', 'RUNNING'),
            setv('측정시각', blk('get_project_timer_value', [null, null])),
            setv('측정시뮬시간', v('시뮬레이션시간')),
            ...say('실험 시작! 관찰해 보세요'),
        ]),
    ]),
    If(eq(v('상태'), 'PAUSED'), [
        call('사용 슬롯 계산'),
        setv('상태', 'RUNNING'),
        setv('측정시각', blk('get_project_timer_value', [null, null])),
        setv('측정시뮬시간', v('시뮬레이션시간')),
        ...say('다시 진행'),
    ]),
    refreshButtons(),
]);
defineFunction('실험 일시정지', ['실험 일시정지'], () => [
    If(eq(v('상태'), 'RUNNING'), [setv('상태', 'PAUSED'), ...say('일시정지 — 천체를 선택해 값을 바꾸거나 드래그할 수 있어요')]),
    refreshButtons(),
]);
{
    const F = '실험 초기화';
    defineFunction(F, ['실험 초기화'], () => [
        lset(F, 'was', v('상태')),
        setv('상태', 'RESETTING'),
        IfElse(eq(lget(F, 'was'), 'READY'),
            // 준비 상태에서 누르면: 프리셋 원래 값으로
            [call('프리셋 불러오기'), ...say('프리셋의 원래 조건으로 되돌렸어요')],
            // 실험 중/후에 누르면: 실험 시작 직전 조건으로
            [
                call('초기 조건 복원'),
                call('표시 기본값'),
                call('실험 상태 초기화'),
                call('분석 대상 설정'),
                setv('상태', 'READY'),
                ...say('실험 시작 직전 조건으로 되돌렸어요 (한 번 더 누르면 프리셋 원래 값)'),
            ]),
        refreshButtons(),
    ], { locals: ['was'] });
}
{
    const F = '종료 검사';
    defineFunction(F, ['종료 검사'], () => [
        setv('확인한사건수', add(v('충돌횟수'), v('탈출횟수'))),
        call('사용 슬롯 계산'),
        If(le(v('활성천체수'), 1), [
            setv('상태', 'FINISHED'),
            setv('종료사유', join('천체가 ', v('활성천체수'), '개만 남아 실험 종료 (충돌 ', v('충돌횟수'), '회 · 탈출 ', v('탈출횟수'), '회)')),
            ...say(v('종료사유')),
            refreshButtons(),
        ]),
    ]);
}
defineFunction('프리셋 시작', ['프리셋', { param: 'n' }, '시작'], () => [
    setv('프리셋번호', param('프리셋 시작', 'n')),
    setv('비교A저장', 0),
    chgv('비교세대', 1),
    call('프리셋 불러오기'),
    setv('화면', 'SIM'),
    ...say('▶ PLAY를 눌러 실험을 시작하세요 · 천체를 클릭하면 선택돼요'),
    refreshButtons(),
]);

// ---------------------------------------------------------------------------
// 선택 / 마우스
// ---------------------------------------------------------------------------
{
    const F = '마우스 천체 찾기';
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    defineFunction(F, ['마우스 천체 찾기'], () => {
        const out = [Ls('best', 0), Ls('bestD', 1000000000), Ls('mx', mouseX()), Ls('my', mouseY())];
        for (let k = 1; k <= SLOTS; k++) {
            out.push(If(eq(item('활성', k), 1), [
                Ls('dx', sub(Lg('mx'), scrX(item('X', k)))),
                Ls('dy', sub(Lg('my'), scrY(item('Y', k)))),
                Ls('d2', add(mul(Lg('dx'), Lg('dx')), mul(Lg('dy'), Lg('dy')))),
                // 클릭 허용 반경 = 화면 반지름 + 6px (작은 천체도 클릭하기 쉽게)
                Ls('lim', add(mul(item('반지름', k), v('배율')), 6)),
                If(lt(Lg('d2'), mul(Lg('lim'), Lg('lim'))), [
                    If(lt(Lg('d2'), Lg('bestD')), [Ls('best', k), Ls('bestD', Lg('d2'))]),
                ]),
            ]));
        }
        out.push(setv('찾은천체', Lg('best')));
        return out;
    }, { locals: ['best', 'bestD', 'mx', 'my', 'dx', 'dy', 'd2', 'lim'] });
}
{
    const F = '다음 천체 선택';
    defineFunction(F, ['다음 천체 선택'], () => {
        const out = [lset(F, 'found', 0)];
        for (let off = 1; off <= SLOTS; off++) {
            out.push(If(eq(lget(F, 'found'), 0), [
                lset(F, 'c', add(mod(add(sub(v('선택천체'), 1), off), SLOTS), 1)),
                If(eq(item('활성', lget(F, 'c')), 1), [lset(F, 'found', lget(F, 'c'))]),
            ]));
        }
        out.push(setv('선택천체', lget(F, 'found')));
        out.push(call('분석 대상 설정'));
        out.push(refreshButtons());
        return out;
    }, { locals: ['found', 'c'] });
}
{
    const F = '천체 추가';
    defineFunction(F, ['천체 추가', { param: 'x' }, { param: 'y' }], () => {
        const out = [lset(F, 'free', 0)];
        for (let k = SLOTS; k >= 1; k--) {
            out.push(If(eq(item('활성', k), 0), [lset(F, 'free', k)]));
        }
        out.push(IfElse(eq(lget(F, 'free'), 0), [...say('빈 슬롯이 없어요')], [
            call('슬롯 설정', lget(F, 'free'), join('천체 ', lget(F, 'free')), 100,
                param(F, 'x'), param(F, 'y'), 0, 0, 4, lget(F, 'free'), 1),
            setItem('FX', lget(F, 'free'), 0), setItem('FY', lget(F, 'free'), 0),
            setItem('AX', lget(F, 'free'), 0), setItem('AY', lget(F, 'free'), 0),
            setv('선택천체', lget(F, 'free')),
            call('분석 대상 설정'),
            chgv('궤적끊기', 1),
            call('사용 슬롯 계산'),
            ...say(join('천체 ', lget(F, 'free'), ' 추가 (질량 100, 속도 0) — [질량] [VX] [VY]로 조건을 정하세요')),
        ]));
        out.push(refreshButtons());
        return out;
    }, { locals: ['free'] });
}

// ---------------------------------------------------------------------------
// 값 편집 (입력 검증: 숫자 아님 → 기존 값 유지, 범위 밖 → 최대/최소로 제한)
// ---------------------------------------------------------------------------
const EDITS = [
    { key: 'Mass', list: '질량', label: '질량', min: MASS_MIN, max: MASS_MAX, positive: true },
    { key: 'VX', list: 'VX', label: 'VX(가로 속도)', min: -VEL_MAX, max: VEL_MAX },
    { key: 'VY', list: 'VY', label: 'VY(세로 속도)', min: -VEL_MAX, max: VEL_MAX },
    { key: 'X', list: 'X', label: 'X 위치', min: -POS_MAX, max: POS_MAX, moves: true },
    { key: 'Y', list: 'Y', label: 'Y 위치', min: -POS_MAX, max: POS_MAX, moves: true },
    { key: 'R', list: '반지름', label: '반지름', min: RAD_MIN, max: RAD_MAX, positive: true },
];
const beginEdit = () => [
    If(eq(v('상태'), 'RUNNING'), [setv('상태', 'PAUSED')]), // 실행 중 수정은 자동 일시정지 후
    setv('입력중', 1),
    refreshButtons(),
];
const endEdit = () => [HideAnswer(), setv('입력중', 0), refreshButtons()];
for (const e of EDITS) {
    const F = `${e.label} 편집`;
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    defineFunction(F, [`${e.label} 편집`], () => [
        // 존재하지 않는/사라진 천체는 편집하지 않음
        Ls('ok', 0),
        If(gt(v('선택천체'), 0), [If(eq(item('활성', v('선택천체')), 1), [Ls('ok', 1)])]),
        IfElse(eq(Lg('ok'), 0), [...say('먼저 천체를 선택하세요')], [
            ...beginEdit(),
            Ls('k', v('선택천체')),
            Ask(join(item('이름', Lg('k')), ' ', e.label, ' 입력 (지금 ', fmt(item(e.list, Lg('k')), 3), ' · 범위 ',
                e.positive ? `0 초과 ~ ${e.max}` : `${e.min} ~ ${e.max}`, ')')),
            Ls('a', answer()),
            IfElse(isNumber(Lg('a')), [
                Ls('x', add(Lg('a'), 0)),
                IfElse(e.positive ? le(Lg('x'), 0) : eq(1, 0),
                    [...say(e.label, '은(는) 0보다 커야 해요 → 기존 값 유지')],
                    [
                        Ls('msg', ''),
                        If(gt(Lg('x'), e.max), [Ls('x', e.max), Ls('msg', join(' (최대 ', e.max, '으로 제한)'))]),
                        If(lt(Lg('x'), e.min), [Ls('x', e.min), Ls('msg', join(' (최소 ', e.min, '으로 제한)'))]),
                        setItem(e.list, Lg('k'), Lg('x')),
                        ...(e.moves ? [chgv('궤적끊기', 1)] : []),
                        ...say(item('이름', Lg('k')), ' ', e.label, ' = ', Lg('x'), Lg('msg')),
                    ]),
            ], [...say('숫자가 아니에요 → 기존 값 유지 (예: 25, -3.5)')]),
            ...endEdit(),
        ]),
    ], { locals: ['ok', 'k', 'a', 'x', 'msg'] });
}
{
    const F = '이름 편집';
    defineFunction(F, ['이름 편집'], () => [
        lset(F, 'ok', 0),
        If(gt(v('선택천체'), 0), [If(eq(item('활성', v('선택천체')), 1), [lset(F, 'ok', 1)])]),
        IfElse(eq(lget(F, 'ok'), 0), [...say('먼저 천체를 선택하세요')], [
            ...beginEdit(),
            lset(F, 'k', v('선택천체')),
            Ask(join('새 이름 (1~8글자, 지금: ', item('이름', lget(F, 'k')), ')')),
            lset(F, 'a', answer()),
            IfElse(and(gt(lenStr(lget(F, 'a')), 0), le(lenStr(lget(F, 'a')), 8)),
                [setItem('이름', lget(F, 'k'), lget(F, 'a')), ...say('이름 변경: ', lget(F, 'a'))],
                [...say('이름은 1~8글자여야 해요 → 기존 이름 유지')]),
            ...endEdit(),
        ]),
    ], { locals: ['ok', 'k', 'a'] });
}

// ---------------------------------------------------------------------------
// 분석 (물리 계산과 분리 — 한 프레임에 한 번, 물리 계산이 끝난 뒤 관찰만 한다)
// ---------------------------------------------------------------------------
// 사용자가 천체를 고를 때만 분석 대상을 바꾼다(병합·탈출로 선택이 옮겨져도 기록은 유지)
defineFunction('분석 대상 설정', ['분석 대상 설정'], () => [
    If(gt(v('선택천체'), 0), [If(ne(v('선택천체'), v('분석대상')), [If(eq(item('활성', v('선택천체')), 1), [
        setv('분석대상', v('선택천체')), setv('최대속력', 0), setv('최소거리', 0), setv('최대거리', 0), setv('기준천체', 0),
        setv('현재속력', 0), setv('현재거리', 0),
    ])])]),
]);
{
    const F = '기준 천체 찾기';
    defineFunction(F, ['기준 천체 찾기'], () => {
        const out = [lset(F, 'b', 0), lset(F, 'bm', -1)];
        for (let k = 1; k <= SLOTS; k++) {
            out.push(If(eq(item('활성', k), 1), [
                If(ne(k, v('분석대상')), [
                    If(gt(item('질량', k), lget(F, 'bm')), [lset(F, 'b', k), lset(F, 'bm', item('질량', k))]),
                ]),
            ]));
        }
        out.push(If(ne(lget(F, 'b'), v('기준천체')), [
            setv('기준천체', lget(F, 'b')),
            IfElse(gt(lget(F, 'b'), 0), [setv('기준이름', item('이름', lget(F, 'b')))], [setv('기준이름', '-')]),
        ]));
        return out;
    }, { locals: ['b', 'bm'] });
}
{
    const F = '분석 기록';
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    defineFunction(F, ['분석 기록'], () => [
        If(eq(v('분석대상'), 0), [call('분석 대상 설정')]),
        If(gt(v('분석대상'), 0), [If(eq(item('활성', v('분석대상')), 1), [
            Ls('s', speedOf(v('분석대상'))),
            setv('현재속력', Lg('s')),
            If(gt(Lg('s'), v('최대속력')), [setv('최대속력', Lg('s'))]),
            call('기준 천체 찾기'),
            Ls('d', -1),
            If(gt(v('기준천체'), 0), [
                Ls('dx', sub(item('X', v('기준천체')), item('X', v('분석대상')))),
                Ls('dy', sub(item('Y', v('기준천체')), item('Y', v('분석대상')))),
                Ls('d', sqrt(add(mul(Lg('dx'), Lg('dx')), mul(Lg('dy'), Lg('dy'))))),
                setv('현재거리', Lg('d')),
                If(or(eq(v('최소거리'), 0), lt(Lg('d'), v('최소거리'))), [setv('최소거리', Lg('d'))]),
                If(gt(Lg('d'), v('최대거리')), [setv('최대거리', Lg('d'))]),
            ]),
            // 0.5초(시뮬레이션)마다 기록 리스트에 저장 (최대 100개, 넘치면 가장 오래된 값 제거)
            If(ge(v('시뮬레이션시간'), v('다음기록시간')), [
                addItem('기록_시간', fmt(v('시뮬레이션시간'), 2)),
                addItem('기록_속력', fmt(Lg('s'), 3)),
                addItem('기록_거리', fmt(Lg('d'), 3)),
                setv('다음기록시간', add(v('다음기록시간'), 0.5)),
                If(gt(listLen('기록_시간'), 100), [delItem('기록_시간', 1), delItem('기록_속력', 1), delItem('기록_거리', 1)]),
            ]),
        ])]),
    ], { locals: ['s', 'd', 'dx', 'dy'] });
}
{
    const F = '실험 A 저장';
    defineFunction(F, ['실험 A 저장'], () => [
        IfElse(eq(v('분석대상'), 0), [...say('먼저 천체를 선택하고 실행하세요 (선택한 천체 기준으로 저장)')], [
            setv('A_천체', v('분석대상')),
            setv('A_이름', item('이름', v('분석대상'))),
            setv('A_질량0', item('초기_질량', v('분석대상'))),
            setv('A_VX0', item('초기_VX', v('분석대상'))),
            setv('A_VY0', item('초기_VY', v('분석대상'))),
            setv('A_속력0', sqrt(add(mul(v('A_VX0'), v('A_VX0')), mul(v('A_VY0'), v('A_VY0'))))),
            setv('A_최대속력', v('최대속력')),
            setv('A_최소거리', v('최소거리')),
            setv('A_최대거리', v('최대거리')),
            setv('A_충돌', v('충돌횟수')),
            setv('A_시간', v('시뮬레이션시간')),
            IfElse(eq(item('활성', v('분석대상')), 1),
                [setv('A_최종X', item('X', v('분석대상'))), setv('A_최종Y', item('Y', v('분석대상')))],
                [setv('A_최종X', 0), setv('A_최종Y', 0)]),
            IfElse(eq(v('종료사유'), ''), [setv('A_결과', '진행 중')], [setv('A_결과', '종료')]),
            If(gt(v('탈출횟수'), 0), [setv('A_결과', '탈출 발생')]),
            If(gt(v('충돌횟수'), 0), [setv('A_결과', '충돌 발생')]),
            setv('A_탈출', v('탈출횟수')),
            setv('비교A저장', 1),
            chgv('비교세대', 1),
            ...say('실험 A 저장! RESET → 조건 변경 → PLAY 후 [비교] 탭에서 비교하세요 (A 궤적은 흐린 선으로 남아요)'),
        ]),
        refreshButtons(),
    ]);
}
// 실험 A 비교용 경로 기록: 0.2 s(시뮬레이션)마다 8칸 슬롯 위치를 기록 (비활성 = 99999)
{
    const F = '비교 경로 기록';
    defineFunction(F, ['비교 경로 기록'], () => [
        If(eq(v('비교A저장'), 0), [If(ge(v('시뮬레이션시간'), v('다음비교시간')), [
            setv('다음비교시간', add(v('다음비교시간'), 0.2)),
            If(lt(v('비교샘플수'), GHOST_SAMPLES), [
                lset(F, 'base', mul(v('비교샘플수'), SLOTS)),
                ...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => IfElse(eq(item('활성', k), 1), [
                    setItem('비교X', add(lget(F, 'base'), k), item('X', k)),
                    setItem('비교Y', add(lget(F, 'base'), k), item('Y', k)),
                ], [setItem('비교X', add(lget(F, 'base'), k), 99999)])),
                chgv('비교샘플수', 1),
            ]),
        ])]),
    ], { locals: ['base'] });
}
// 기록된 A 경로를 30개씩 그린다(반복 블록 한 바퀴 = 한 프레임이므로 여러 개를 펼쳐서)
{
    const F = '비교 궤적 조각';
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    defineFunction(F, ['비교 궤적 조각', { param: 's' }, { param: 'j' }], () => {
        const out = [Ls('i', param(F, 'j'))];
        for (let n = 0; n < 30; n++) {
            out.push(If(le(Lg('i'), v('비교샘플수')), [
                Ls('idx', add(mul(sub(Lg('i'), 1), SLOTS), param(F, 's'))),
                Ls('x', item('비교X', Lg('idx'))),
                IfElse(gt(abs(Lg('x')), 90000), [penUp()], [
                    goXY(scrX(Lg('x')), scrY(item('비교Y', Lg('idx')))),
                    penDown(),
                ]),
                Ls('i', add(Lg('i'), 1)),
            ]));
        }
        return out;
    }, { locals: ['i', 'idx', 'x'] });
}
{
    const F = '실효 배속 측정';
    defineFunction(F, ['실효 배속 측정'], () => [
        lset(F, 't', blk('get_project_timer_value', [null, null])),
        If(eq(v('상태'), 'RUNNING'), [If(gt(sub(lget(F, 't'), v('측정시각')), 0.2), [
            setv('실효배속', div(sub(v('시뮬레이션시간'), v('측정시뮬시간')), sub(lget(F, 't'), v('측정시각')))),
        ])]),
        setv('측정시각', lget(F, 't')),
        setv('측정시뮬시간', v('시뮬레이션시간')),
    ], { locals: ['t'] });
}

// ---------------------------------------------------------------------------
// 버튼 상태 계산
// ---------------------------------------------------------------------------
const S = (id, x) => setItem('버튼상태', id, x);
const M = (id, x) => setItem('버튼모양', id, x);
// 버튼 id → 상태값(0 숨김 / 1 보통 / 2 켜짐 / 3 비활성)
function simButtonRules() {
    const selOK = [lset('버튼 갱신', 'sel', 0),
        If(gt(v('선택천체'), 0), [If(eq(item('활성', v('선택천체')), 1), [lset('버튼 갱신', 'sel', 1)])])];
    const sel = lget('버튼 갱신', 'sel');
    const st = (x) => eq(v('상태'), x);
    const on2 = (id, c) => IfElse(c, [S(id, 2), M(id, `b${id}a`)], [S(id, 1), M(id, `b${id}`)]);
    const avail = (id, c) => IfElse(c, [S(id, 1)], [S(id, 3)]);
    const notBasic = ne(v('모드'), 'BASIC');
    const sandbox = eq(v('모드'), 'SANDBOX');
    const editable = or(st('READY'), or(st('PAUSED'), st('RUNNING')));
    return [
        ...selOK,
        // 재생 / 일시정지 / 초기화
        IfElse(st('RUNNING'), [S(1, 2), M(1, 'b1a')], [M(1, 'b1'), IfElse(or(st('READY'), st('PAUSED')), [S(1, 1)], [S(1, 3)])]),
        IfElse(st('PAUSED'), [S(2, 2), M(2, 'b2a')], [M(2, 'b2'), IfElse(st('RUNNING'), [S(2, 1)], [S(2, 3)])]),
        S(3, 1),
        // 배속
        ...L.SPEEDS.map((s) => on2(s.id, eq(v('배속'), s.v))),
        // 궤적 / 벡터
        on2(10, eq(v('궤적표시'), 1)),
        S(14, 1), M(14, join('b14_len', v('궤적길이단계'))),
        S(15, 1),
        IfElse(notBasic, [on2(11, eq(v('벡터표시'), 1))], [S(11, 0)]),
        avail(12, gt(v('배율단계'), 1)),
        avail(13, lt(v('배율단계'), ZOOMS.length)),
        // 편집
        IfElse(and(eq(sel, 1), editable), [S(16, 1), S(17, 1), S(18, 1)], [S(16, 3), S(17, 3), S(18, 3)]),
        IfElse(notBasic, [IfElse(and(eq(sel, 1), editable), [S(19, 1), S(20, 1)], [S(19, 3), S(20, 3)])], [S(19, 0), S(20, 0)]),
        IfElse(sandbox, [IfElse(and(eq(sel, 1), editable), [S(21, 1), S(22, 1), S(24, 1)], [S(21, 3), S(22, 3), S(24, 3)])], [S(21, 0), S(22, 0), S(24, 0)]),
        IfElse(sandbox, [IfElse(and(lt(v('활성천체수'), v('최대천체수')), editable), [on2(23, eq(v('배치대기'), 1))], [S(23, 3)])], [S(23, 0)]),
        // 탭 (BASIC 은 질문 탭만)
        on2(25, eq(v('탭'), 'Q')),
        IfElse(notBasic, [on2(26, eq(v('탭'), 'A')), on2(27, eq(v('탭'), 'C'))], [S(26, 0), S(27, 0)]),
        IfElse(and(notBasic, eq(v('탭'), 'C')), [
            IfElse(or(st('RUNNING'), or(st('PAUSED'), st('FINISHED'))), [S(28, 1)], [S(28, 3)]),
            IfElse(eq(v('비교A저장'), 1), [S(29, 1)], [S(29, 3)]),
        ], [S(28, 0), S(29, 0)]),
        S(30, 1), S(31, 1),
    ];
}
defineFunction('버튼 갱신', ['버튼 갱신'], () => {
    const groups = { SIM: [], START: [], MODE: [], PRESET: [], HELP: [] };
    for (const b of L.BUTTONS) {
        groups[b.screen].push(b.id);
    }
    const out = [call('사용 슬롯 계산')];
    out.push(IfElse(eq(v('화면'), 'SIM'), simButtonRules(), groups.SIM.map((id) => S(id, 0))));
    for (const scr of ['START', 'MODE', 'PRESET', 'HELP']) {
        out.push(IfElse(eq(v('화면'), scr), groups[scr].map((id) => S(id, 1)), groups[scr].map((id) => S(id, 0))));
    }
    out.push(chgv('버튼갱신', 1));
    return out;
}, { locals: ['sel'] });

// ---------------------------------------------------------------------------
// 버튼 처리
// ---------------------------------------------------------------------------
const H = {}; // id → 블록 배열
H[1] = [call('실험 재생')];
H[2] = [call('실험 일시정지')];
H[3] = [call('실험 초기화')];
for (const s of L.SPEEDS) {
    H[s.id] = [setv('배속', s.v), ...say('배속 ×', s.v, ' — dt(1/60 s)는 그대로, 프레임마다 계산 횟수만 바뀌어요')];
}
H[10] = [IfElse(eq(v('궤적표시'), 1), [setv('궤적표시', 0), ...say('궤적 끄기')], [setv('궤적표시', 1), chgv('궤적끊기', 1), ...say('궤적 켜기')])];
H[14] = [
    setv('궤적길이단계', add(mod(v('궤적길이단계'), 4), 1)),
    ...TRAIL_LEN.map((t, k) => If(eq(v('궤적길이단계'), k + 1), [setv('궤적주기', t)])),
    chgv('궤적세대', 1),
    IfElse(eq(v('궤적길이단계'), 4), [...say('궤적 길이: 무한 (지우기 전까지 유지)')],
        [...say('궤적 길이: 최근 약 ', v('궤적주기'), '~', mul(v('궤적주기'), 2), ' s (시뮬레이션 시간)')]),
];
H[15] = [chgv('궤적세대', 1), ...say('궤적을 지웠어요')];
H[11] = [IfElse(eq(v('벡터표시'), 1), [setv('벡터표시', 0)], [setv('벡터표시', 1)])];
const zoomSet = [
    ...ZOOMS.map((z, k) => If(eq(v('배율단계'), k + 1), [setv('배율', z)])),
    chgv('궤적세대', 1), chgv('비교세대', 1),
    ...say('확대 ×', v('배율'), ' (1 LU = ', v('배율'), ' px) — 화면 궤적은 지웠어요'),
];
H[12] = [If(gt(v('배율단계'), 1), [chgv('배율단계', -1), ...zoomSet])];
H[13] = [If(lt(v('배율단계'), ZOOMS.length), [chgv('배율단계', 1), ...zoomSet])];
EDITS.forEach((e, k) => {
    H[16 + [0, 1, 2, 3, 4, 5][k]] = [call(`${e.label} 편집`)];
});
H[22] = [call('이름 편집')];
H[23] = [
    IfElse(eq(v('배치대기'), 1), [setv('배치대기', 0), ...say('천체 추가 취소')], [
        If(eq(v('상태'), 'RUNNING'), [setv('상태', 'PAUSED')]),
        call('사용 슬롯 계산'),
        IfElse(lt(v('활성천체수'), v('최대천체수')),
            [setv('배치대기', 1), ...say('시뮬레이션 영역을 클릭해 새 천체를 놓으세요 (다시 누르면 취소)')],
            [...say('이 모드는 천체를 최대 ', v('최대천체수'), '개까지 만들 수 있어요')]),
    ]),
];
H[24] = [
    If(gt(v('선택천체'), 0), [
        If(eq(v('상태'), 'RUNNING'), [setv('상태', 'PAUSED')]),
        setItem('활성', v('선택천체'), 0),
        ...say(item('이름', v('선택천체')), ' 삭제'),
        setv('선택천체', 0),
        call('사용 슬롯 계산'),
    ]),
];
H[25] = [setv('탭', 'Q')];
H[26] = [setv('탭', 'A')];
H[27] = [setv('탭', 'C')];
H[28] = [call('실험 A 저장')];
H[29] = [setv('비교A저장', 0), chgv('비교세대', 1), ...say('실험 A 기록을 지웠어요')];
H[30] = [If(eq(v('상태'), 'RUNNING'), [setv('상태', 'PAUSED')]), setv('화면', 'START')];
H[31] = [If(eq(v('상태'), 'RUNNING'), [setv('상태', 'PAUSED')]), setv('이전화면', 'SIM'), setv('화면', 'HELP')];
H[40] = [setv('화면', 'MODE')];
H[41] = [setv('화면', 'PRESET')];
H[42] = [setv('이전화면', 'START'), setv('화면', 'HELP')];
H[43] = [call('프리셋 시작', 1)];
H[44] = [call('프리셋 시작', 3)];
H[45] = [call('프리셋 시작', 5)];
H[46] = [setv('화면', 'START')];
L.PRESETS.forEach((p) => {
    H[p.id] = [call('프리셋 시작', p.n)];
});
H[52] = [setv('화면', 'START')];
H[53] = [setv('화면', v('이전화면'))];
defineFunction('버튼 처리', ['버튼 처리'], () => {
    const ids = Object.keys(H).map(Number).sort((a, b) => a - b);
    // 범위로 나눠 비교 횟수를 줄인다
    const byRange = (lo, hi) => ids.filter((id) => id >= lo && id <= hi).map((id) => If(eq(v('눌린버튼'), id), H[id]));
    return [
        IfElse(lt(v('눌린버튼'), 16), byRange(1, 15), [
            IfElse(lt(v('눌린버튼'), 40), byRange(16, 39), byRange(40, 99)),
        ]),
        refreshButtons(),
    ];
});

// ---------------------------------------------------------------------------
// 벡터 그리기 (선택 천체의 속도 벡터 — 표시 길이는 물리 값과 분리해 최대 길이 제한)
// ---------------------------------------------------------------------------
{
    const F = '속도 벡터 그리기';
    const Lg = (n) => lget(F, n);
    const Ls = (n, x) => lset(F, n, x);
    defineFunction(F, ['속도 벡터 그리기'], () => [
        penClear(),
        If(and(eq(v('화면'), 'SIM'), eq(v('벡터표시'), 1)), [If(ne(v('모드'), 'BASIC'), [If(gt(v('선택천체'), 0), [
            If(eq(item('활성', v('선택천체')), 1), [
                Ls('k', v('선택천체')),
                Ls('vx', item('VX', Lg('k'))),
                Ls('vy', item('VY', Lg('k'))),
                Ls('s', sqrt(add(mul(Lg('vx'), Lg('vx')), mul(Lg('vy'), Lg('vy'))))),
                If(gt(Lg('s'), 0.001), [
                    Ls('len', mul(Lg('s'), v('벡터배율'))),
                    If(gt(Lg('len'), v('벡터최대')), [Ls('len', v('벡터최대'))]),
                    If(lt(Lg('len'), 6), [Ls('len', 6)]),
                    Ls('ux', div(Lg('vx'), Lg('s'))),
                    Ls('uy', div(Lg('vy'), Lg('s'))),
                    Ls('bx', scrX(item('X', Lg('k')))),
                    Ls('by', scrY(item('Y', Lg('k')))),
                    Ls('tx', add(Lg('bx'), mul(Lg('ux'), Lg('len')))),
                    Ls('ty', add(Lg('by'), mul(Lg('uy'), Lg('len')))),
                    penUp(), goXY(Lg('bx'), Lg('by')), penDown(), goXY(Lg('tx'), Lg('ty')),
                    // 화살촉
                    goXY(add(sub(Lg('tx'), mul(Lg('ux'), 5)), mul(Lg('uy'), -3)), add(sub(Lg('ty'), mul(Lg('uy'), 5)), mul(Lg('ux'), 3))),
                    penUp(), goXY(Lg('tx'), Lg('ty')), penDown(),
                    goXY(add(sub(Lg('tx'), mul(Lg('ux'), 5)), mul(Lg('uy'), 3)), add(sub(Lg('ty'), mul(Lg('uy'), 5)), mul(Lg('ux'), -3))),
                    penUp(),
                ]),
            ]),
        ])])]),
    ], { locals: ['k', 'vx', 'vy', 's', 'len', 'ux', 'uy', 'bx', 'by', 'tx', 'ty'] });
}

// ---------------------------------------------------------------------------
// 글상자 내용
// ---------------------------------------------------------------------------
const selValid = (body, orElse) => IfElse(gt(v('선택천체'), 0),
    [IfElse(eq(item('활성', v('선택천체')), 1), body, orElse)], orElse);
const infoText = () => {
    const k = v('선택천체');
    return join(
        '● ', item('이름', k), '  #', k, NL,
        '질량    ', fmt(item('질량', k), 3), ' MU', NL,
        '속력    ', fmt(speedOf(k), 2), ' LU/s', NL,
        '위치    (', fmt(item('X', k), 1), ', ', fmt(item('Y', k), 1), ')', NL,
        '속도    (', fmt(item('VX', k), 2), ', ', fmt(item('VY', k), 2), ')', NL,
        '가속도  ', fmt(sqrt(add(mul(item('AX', k), item('AX', k)), mul(item('AY', k), item('AY', k)))), 2), ' LU/s²', NL,
        '반지름  ', fmt(item('반지름', k), 2), ' LU'
    );
};
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
const HALF = 0.5; // 2배 해상도 그림 → 무대 크기

// 오브젝트 순서 = 화면 위→아래 순서 (엔트리 오브젝트 목록 맨 위가 가장 앞)
const objects = {};

// 1) 버튼
{
    const names = [];
    for (const b of L.BUTTONS) {
        if (b.variants) {
            b.variants.forEach((vn) => names.push(`b${b.id}_${vn.key}`));
        } else {
            names.push(`b${b.id}`);
            if (manifest[`b${b.id}a`]) {
                names.push(`b${b.id}a`);
            }
        }
    }
    const o = P.sprite({ name: '버튼', pictures: names.map(pic), entity: { scale: HALF, visible: false } });
    objects.button = o;
    const ids = L.BUTTONS.map((b) => b.id).sort((a, b) => a - b);
    P.addThread(o, onStart(hide(), ...ids.flatMap((id) => [setv('내버튼', id), Clone()])));
    P.addThread(o, onClone(
        goXY(item('버튼X', v('내버튼')), item('버튼Y', v('내버튼'))),
        setv('내갱신', -1),
        Forever([
            If(ne(v('내갱신'), v('버튼갱신')), [
                setv('내갱신', v('버튼갱신')),
                IfElse(eq(item('버튼상태', v('내버튼')), 0), [hide()], [
                    shape(item('버튼모양', v('내버튼'))),
                    IfElse(eq(item('버튼상태', v('내버튼')), 3), [setEffect('transparency', 70)], [setEffect('transparency', 0)]),
                    show(),
                ]),
            ]),
        ])
    ));
    P.addThread(o, onObjClick(
        If(eq(v('입력중'), 0), [
            If(and(ge(item('버튼상태', v('내버튼')), 1), le(item('버튼상태', v('내버튼')), 2)), [
                setv('눌린버튼', v('내버튼')),
                send('버튼 눌림'),
            ]),
        ])
    ));
}

// 2) 화면 덮개 (시작 / 모드 / 프리셋 / 도움말)
{
    const o = P.sprite({
        name: '화면',
        pictures: ['screen_start', 'screen_mode', 'screen_preset', 'screen_help'].map(pic),
        entity: { scale: HALF },
    });
    objects.screen = o;
    const map = { START: 'screen_start', MODE: 'screen_mode', PRESET: 'screen_preset', HELP: 'screen_help' };
    P.addThread(o, onStart(
        goXY(0, 0),
        setv('내화면', ''),
        Forever([
            If(ne(v('내화면'), v('화면')), [
                setv('내화면', v('화면')),
                IfElse(eq(v('화면'), 'SIM'), [hide()], [
                    ...Object.entries(map).map(([k, p]) => If(eq(v('화면'), k), [shape(blk('get_pictures', [P.pictureId('화면', p)]))])),
                    show(),
                ]),
            ]),
        ])
    ));
}

// 3) 글상자들
const T = L.TEXT;
const textObjects = [];
function textBox(name, cfg, opts, bodyFn, every = 3) {
    // lineBreak(글상자 모드): 상자 크기가 고정되어 글이 길어져도 다른 UI 를 덮지 않는다
    const o = P.textBox({
        name, text: ' ', x: cfg.x, y: cfg.y, width: cfg.w, height: cfg.h, visible: false, lineBreak: true, ...opts,
    });
    P.addThread(o, onStart(hide(), Forever([
        IfElse(eq(v('화면'), 'SIM'), [
            If(eq(mod(v('프레임수'), every), 0), bodyFn()),
            show(),
        ], [hide()]),
    ])));
    textObjects.push(o);
    return o;
}
textBox('상단_프리셋', T.presetTitle, { fontSize: 7.5, font: 'Nanum Gothic', colour: '#9fb4e0', align: 1 }, () => [
    write(join('P0', v('프리셋번호'), ' · ', v('프리셋이름'), ' · ', v('모드'))),
], 15);
textBox('상단_시간', T.timeBar, { fontSize: 8, font: 'D2 Coding', colour: '#d8e3ff', align: 2 }, () => [
    IfElse(and(eq(v('상태'), 'RUNNING'), and(gt(v('실효배속'), 0), lt(v('실효배속'), mul(v('배속'), 0.85)))),
        [write(join('SIM t=', fmt(v('시뮬레이션시간'), 1), 's ×', v('배속'), '(실제×', fmt(v('실효배속'), 1), ') ', v('상태')))],
        [write(join('SIM t=', fmt(v('시뮬레이션시간'), 2), 's  ×', v('배속'), '  ', v('상태')))]),
], 3);
textBox('정보패널', T.info, { fontSize: 7, font: 'D2 Coding', colour: '#d8e3ff', align: 1, lineBreak: true }, () => [
    selValid([write(infoText())], [write(join('천체를 클릭해 선택하세요', NL, '(N 키: 다음 천체 선택)', NL, NL, '선택하면 질량·속력·위치·', NL, '속도·가속도를 보여 줘요'))]),
], 3);
{
    const compareText = () => join(
        '초기 속력  A ', fmt(v('A_속력0'), 2), ' | 지금 ', fmt(sqrt(add(mul(item('초기_VX', v('분석대상')), item('초기_VX', v('분석대상'))), mul(item('초기_VY', v('분석대상')), item('초기_VY', v('분석대상'))))), 2), NL,
        '초기 질량  A ', fmt(v('A_질량0'), 2), ' | 지금 ', fmt(item('초기_질량', v('분석대상')), 2), NL,
        '최대 속력  A ', fmt(v('A_최대속력'), 2), ' | 지금 ', fmt(v('최대속력'), 2), NL,
        '최소 거리  A ', fmt(v('A_최소거리'), 1), ' | 지금 ', fmt(v('최소거리'), 1), NL,
        '최대 거리  A ', fmt(v('A_최대거리'), 1), ' | 지금 ', fmt(v('최대거리'), 1), NL,
        '충돌·탈출  A ', v('A_충돌'), '·', v('A_탈출'), ' | 지금 ', v('충돌횟수'), '·', v('탈출횟수'), NL,
        'A: ', v('A_이름'), ' · ', v('A_결과'), ' · t=', fmt(v('A_시간'), 1), 's'
    );
    textBox('하단패널', T.lower, { fontSize: 6.5, font: 'D2 Coding', colour: '#c9d6f5', align: 1, lineBreak: true }, () => [
        If(eq(v('탭'), 'Q'), [write(v('프리셋질문'))]),
        If(eq(v('탭'), 'A'), [IfElse(gt(v('분석대상'), 0), [
            IfElse(eq(item('활성', v('분석대상')), 1), [
                write(join(
                    '분석: ', item('이름', v('분석대상')), ' → 기준: ', v('기준이름'), NL,
                    '속력 ', fmt(v('현재속력'), 2), '  (최대 ', fmt(v('최대속력'), 2), ')', NL,
                    '거리 ', fmt(v('현재거리'), 1), NL,
                    '  최소 ', fmt(v('최소거리'), 1), ' · 최대 ', fmt(v('최대거리'), 1), NL,
                    '충돌 ', v('충돌횟수'), '회 · 탈출 ', v('탈출횟수'), '회 · 스텝 ', v('스텝수'), NL,
                    '보호장치: 가속도제한 ', item('보호작동', 1), ' · 시간생략 ', item('보호작동', 2)
                )),
            ], [write(join(item('이름', v('분석대상')), ': 병합 또는 탈출로 사라짐', NL,
                '최대 속력 ', fmt(v('최대속력'), 2), NL,
                '최소 거리 ', fmt(v('최소거리'), 1), ' · 최대 ', fmt(v('최대거리'), 1), NL,
                '충돌 ', v('충돌횟수'), '회 · 탈출 ', v('탈출횟수'), '회', NL, v('종료사유')))]),
        ], [write(join('천체를 선택하고 ▶ PLAY 하면', NL, '속력·거리(가장 무거운 다른 천체까지)의', NL, '최대/최소를 기록해요.', NL, '(0.5초마다 기록_ 리스트에도 저장)'))])]),
        If(eq(v('탭'), 'C'), [IfElse(eq(v('비교A저장'), 1), [
            IfElse(gt(v('분석대상'), 0), [write(compareText())], [write(join('실험 A 저장됨: ', v('A_이름'), NL, '비교할 천체를 선택하세요'))]),
        ], [write(join('① 실험을 실행한 뒤 [A로 저장]', NL, '② RESET → 조건 하나만 바꾸기', NL, '③ PLAY → 여기서 A와 비교', NL, '(A의 궤적은 흐린 선으로 남아요)'))])]),
    ], 4);
}
textBox('안내', T.toast, { fontSize: 7.5, font: 'Nanum Gothic', colour: '#ffd899', align: 1 }, () => [
    IfElse(and(ne(v('안내문구'), ''), lt(sub(v('프레임수'), v('안내시각')), 240)), [write(v('안내문구'))], [
        If(eq(v('상태'), 'READY'), [write('준비: 조건을 정하고 ▶ PLAY')]),
        If(eq(v('상태'), 'RUNNING'), [write(' ')]),
        If(eq(v('상태'), 'PAUSED'), [write('일시정지: 값을 바꾸고 ▶ PLAY로 이어서 실험')]),
        If(eq(v('상태'), 'FINISHED'), [write(join('종료: ', v('종료사유'), ' — ↻ RESET'))]),
    ]),
], 5);
textBox('단위표시', T.units, { fontSize: 6, font: 'D2 Coding', colour: '#6f7fa6', align: 1 }, () => [
    write(join('시뮬레이션 단위(실제 태양계 축척 아님) · G=10 · dt=1/60 s · 격자 1칸 = ', div(50, v('배율')), ' LU')),
], 30);

// 4) 프레임(패널 덮개)
objects.frame = P.sprite({ name: '패널', pictures: [pic('frame')], entity: { scale: HALF } });

// 5) 충돌 효과
{
    const o = P.sprite({ name: '충돌효과', pictures: [pic('burst')], entity: { scale: HALF, visible: false } });
    P.addThread(o, onStart(hide(), Forever([
        If(gt(listLen('효과X'), 0), [
            // 대기열 첫 항목을 꺼내 복제본으로 효과 표시
            goXY(scrX(item('효과X', 1)), scrY(item('효과Y', 1))),
            setv('효과크기값', add(mul(mul(item('효과크기', 1), v('배율')), 2), 14)),
            delItem('효과X', 1), delItem('효과Y', 1), delItem('효과크기', 1),
            If(eq(v('화면'), 'SIM'), [Clone()]),
        ]),
    ])));
    P.addThread(o, onClone(
        setSize(v('효과크기값')),
        setEffect('transparency', 0),
        show(),
        Repeat(20, [blk('change_scale_size', [val(mul(v('효과크기값'), 0.08)), null]), blk('add_effect_amount', ['transparency', val(5), null])]),
        DeleteClone()
    ));
}

// 6) 속도 벡터 (붓)
{
    const o = P.sprite({ name: '속도벡터', pictures: [pic('ring')], entity: { scale: 0.05 } });
    P.addThread(o, onStart(
        setEffect('transparency', 100), penColor('#7ee0ff'), penSize(1.4), penAlpha(0),
        Forever([call('속도 벡터 그리기')])
    ));
}

// 7) 선택 표시
{
    const o = P.sprite({ name: '선택표시', pictures: [pic('ring')], entity: { scale: HALF, visible: false } });
    const k = v('선택천체');
    P.addThread(o, onStart(hide(), Forever([
        If(eq(v('화면'), 'SIM'), [
            IfElse(gt(k, 0), [IfElse(eq(item('활성', k), 1), [
                goXY(scrX(item('X', k)), scrY(item('Y', k))),
                IfElse(lt(mul(item('반지름', k), v('배율')), 2),
                    [setSize(14)],
                    [setSize(add(mul(mul(item('반지름', k), v('배율')), 2), 10))]),
                show(),
            ], [hide()])], [hide()]),
        ]),
        If(ne(v('화면'), 'SIM'), [hide()]),
    ])));
}

// 8) 천체 (8개 복제본 — 슬롯 번호 = 내번호)
{
    const o = P.sprite({
        name: '천체',
        pictures: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => pic(`body${k}`)),
        entity: { scale: HALF, visible: false },
    });
    const k = v('내번호');
    const scale = BODY_IMG / BODY_DIAM;
    P.addThread(o, onStart(hide(), ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [setv('내번호', n), Clone()])));
    P.addThread(o, onClone(Forever([
        IfElse(eq(v('화면'), 'SIM'), [
            IfElse(eq(item('활성', k), 1), [
                shape(item('색상', k)),
                goXY(scrX(item('X', k)), scrY(item('Y', k))),
                // 표시 지름 = 2·반지름·배율 (질량과 무관). 너무 작으면 3px 로 보이게
                IfElse(lt(mul(item('반지름', k), v('배율')), 1.5),
                    [setSize(3 * scale)],
                    [setSize(mul(mul(mul(item('반지름', k), v('배율')), 2), scale))]),
                show(),
            ], [hide()]),
        ], [hide()]),
    ])));
}

{
    // 슬롯별로 기록을 30개씩 이어 그린다
    const F = '비교 궤적 전체 그리기';
    defineFunction(F, ['비교 궤적 전체 그리기'], () => {
        const out = [];
        for (let k = 1; k <= SLOTS; k++) {
            out.push(
                penUp(),
                lset(F, 'j', 1),
                Until(or(gt(lget(F, 'j'), v('비교샘플수')), ne(v('비교그림세대'), v('비교세대'))), [
                    call('비교 궤적 조각', k, lget(F, 'j')),
                    lset(F, 'j', add(lget(F, 'j'), 30)),
                ]),
            );
        }
        out.push(penUp());
        return out;
    }, { locals: ['j'] });
}

// 9) 비교 궤적 (저장한 실험 A 의 경로를 흐린 선으로 표시 — 기록 리스트에서 다시 그리므로 확대해도 유지)
{
    const o = P.sprite({ name: '비교궤적', pictures: [pic('ring')], entity: { scale: 0.05 } });
    P.addThread(o, onStart(
        setEffect('transparency', 100), penColor('#d5deff'), penSize(1), penAlpha(40), penUp(),
        setv('비교그림세대', -1),
        Forever([
            If(ne(v('비교그림세대'), v('비교세대')), [
                setv('비교그림세대', v('비교세대')),
                penClear(), penUp(),
                If(eq(v('비교A저장'), 1), [call('비교 궤적 전체 그리기')]),
            ]),
        ])
    ));
}
// 10) 궤적 (슬롯마다 붓 2개를 번갈아 지워서 '최근 일정 시간'만 남긴다)
{
    const o = P.sprite({ name: '궤적', pictures: [pic('ring')], entity: { scale: 0.05 } });
    const k = v('궤적번호');
    P.addThread(o, onStart(
        setEffect('transparency', 100),
        ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [setv('궤적번호', n), setv('궤적버퍼', 0), Clone(), setv('궤적버퍼', 1), Clone()])
    ));
    const startLine = () => [penUp(), goXY(scrX(item('X', k)), scrY(item('Y', k))), penDown(), setv('그리는중', 1)];
    P.addThread(o, onClone(
        penSize(1.3), penAlpha(15), penUp(),
        Forever([
            // 새 실험/지우기/확대 → 모두 지움
            If(ne(v('궤적세대값'), v('궤적세대')), [
                setv('궤적세대값', v('궤적세대')), penClear(), penUp(), setv('그리는중', 0), setv('궤적구간', -1),
                penColor(item('색상코드', item('색상', k))),
            ]),
            // 위치가 순간 이동(편집·드래그)했으면 선을 끊음
            If(ne(v('궤적끊기값'), v('궤적끊기')), [setv('궤적끊기값', v('궤적끊기')), penUp(), setv('그리는중', 0), penColor(item('색상코드', item('색상', k)))]),
            IfElse(and(eq(v('상태'), 'RUNNING'), and(eq(v('궤적표시'), 1), eq(item('활성', k), 1))), [
                // 궤적 길이: 구간 번호 = floor(시간 / 주기). 내 버퍼 차례가 오면 내 선을 지우고 다시 그린다
                If(ne(v('궤적구간'), G.floor(div(v('시뮬레이션시간'), v('궤적주기'))) ), [
                    setv('궤적구간', G.floor(div(v('시뮬레이션시간'), v('궤적주기')))),
                    If(eq(mod(v('궤적구간'), 2), v('궤적버퍼')), [penClear(), setv('그리는중', 0)]),
                ]),
                IfElse(eq(v('그리는중'), 0), startLine(), [goXY(scrX(item('X', k)), scrY(item('Y', k)))]),
            ], [
                If(eq(v('그리는중'), 1), [penUp(), setv('그리는중', 0)]),
                // 병합·탈출·삭제된 천체의 궤적은 정리
                If(eq(item('활성', k), 0), [penClear()]),
                If(eq(v('궤적표시'), 0), [penClear()]),
            ]),
        ])
    ));
}

// 11) 시뮬레이터(관리자) — 메인 루프, 입력 처리
{
    const o = P.sprite({ name: '시뮬레이터', pictures: [pic('ring')], entity: { scale: 0.05, x: L.VIEW_CENTER.x, y: -20 } });
    objects.manager = o;
    // 초기 설정
    P.addThread(o, onStart(
        setEffect('transparency', 100),
        goXY(L.VIEW_CENTER.x, -20), // 묻고 기다리기 말풍선 위치
        HideAnswer(),
        blk('set_visible_project_timer', [null, 'HIDE', null, null]),
        blk('choose_project_timer_action', [null, 'START', null, null]),
        setv('화면', 'START'), setv('상태', 'START'), setv('입력중', 0), setv('프레임수', 0),
        setv('프리셋번호', 1), call('프리셋 불러오기'), setv('상태', 'START'),
        refreshButtons(),
        // 메인 루프: 물리 → 사건 확인 → 분석 (그리기는 각 오브젝트가 리스트를 읽어서)
        Forever([
            If(eq(v('상태'), 'RUNNING'), [If(eq(v('화면'), 'SIM'), [
                call('물리 프레임'),
                If(ne(add(v('충돌횟수'), v('탈출횟수')), v('확인한사건수')), [call('종료 검사')]),
                call('분석 기록'),
                call('비교 경로 기록'),
            ])]),
            chgv('프레임수', 1),
            If(eq(mod(v('프레임수'), 30), 0), [call('실효 배속 측정')]),
        ])
    ));
    P.addThread(o, onMsg('버튼 눌림', call('버튼 처리')));
    // 마우스: 선택 / 배치 / 드래그
    const addBtn = btnById[23];
    const delBtn = btnById[24];
    const zo = btnById[12];
    const zi = btnById[13];
    P.addThread(o, onMouseDown(
        If(and(eq(v('화면'), 'SIM'), eq(v('입력중'), 0)), [
            If(inView(mouseX(), mouseY()), [
                // 영역 위의 버튼(+천체/삭제/확대)을 누른 경우는 제외
                If(not(or(or(inRect(addBtn, mouseX(), mouseY()), inRect(delBtn, mouseX(), mouseY())),
                    or(inRect(zo, mouseX(), mouseY()), inRect(zi, mouseX(), mouseY())))), [
                    IfElse(eq(v('배치대기'), 1), [
                        setv('배치대기', 0),
                        call('천체 추가', fmt(worldX(mouseX()), 1), fmt(worldY(mouseY()), 1)),
                    ], [
                        call('마우스 천체 찾기'),
                        IfElse(gt(v('찾은천체'), 0), [
                            setv('선택천체', v('찾은천체')),
                            call('분석 대상 설정'),
                            refreshButtons(),
                            // EXPERIMENT/SANDBOX: 준비·일시정지 중에는 드래그로 위치 이동
                            If(and(ne(v('모드'), 'BASIC'), or(eq(v('상태'), 'READY'), eq(v('상태'), 'PAUSED'))), [
                                // 잡은 지점과의 차이를 유지 → 클릭만 하면 위치가 바뀌지 않는다
                                setv('드래그X0', item('X', v('선택천체'))),
                                setv('드래그Y0', item('Y', v('선택천체'))),
                                setv('드래그MX', mouseX()),
                                setv('드래그MY', mouseY()),
                                setv('드래그함', 0),
                                Until(not(mouseDown()), [
                                    If(or(gt(abs(sub(mouseX(), v('드래그MX'))), 1), gt(abs(sub(mouseY(), v('드래그MY'))), 1)), [setv('드래그함', 1)]),
                                    If(eq(v('드래그함'), 1), [
                                        setItem('X', v('선택천체'), fmt(add(v('드래그X0'), div(sub(mouseX(), v('드래그MX')), v('배율'))), 1)),
                                        setItem('Y', v('선택천체'), fmt(add(v('드래그Y0'), div(sub(mouseY(), v('드래그MY')), v('배율'))), 1)),
                                        chgv('궤적끊기', 1),
                                    ]),
                                ]),
                                If(eq(v('드래그함'), 1), [
                                    ...say(item('이름', v('선택천체')), ' 위치 → (', item('X', v('선택천체')), ', ', item('Y', v('선택천체')), ')'),
                                ]),
                            ]),
                        ], [setv('선택천체', 0), refreshButtons()]),
                    ]),
                ]),
            ]),
        ])
    ));
    // 키보드: 스페이스 = 재생/일시정지, R = 초기화, N = 다음 천체
    const keyGuard = (body) => If(and(eq(v('화면'), 'SIM'), eq(v('입력중'), 0)), body);
    P.addThread(o, onKey(32, keyGuard([IfElse(eq(v('상태'), 'RUNNING'), [call('실험 일시정지')], [call('실험 재생')])])));
    P.addThread(o, onKey(82, keyGuard([call('실험 초기화')])));
    P.addThread(o, onKey(78, keyGuard([call('다음 천체 선택')])));
}

// 12) 배경
objects.bg = P.sprite({ name: '배경', pictures: [pic('bg')], entity: { scale: HALF } });

// ---------------------------------------------------------------------------
// 오브젝트 순서 정리 (앞 → 뒤)
// ---------------------------------------------------------------------------
const order = ['버튼', '화면', '상단_프리셋', '상단_시간', '정보패널', '하단패널', '안내', '단위표시', '패널',
    '충돌효과', '속도벡터', '선택표시', '천체', '비교궤적', '궤적', '시뮬레이터', '배경'];
P.objects.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

// ---------------------------------------------------------------------------
// 빌드 & 패키징
// ---------------------------------------------------------------------------
const project = P.build();
const stage = fs.mkdtempSync(path.join(require('os').tmpdir(), 'glent-'));
const tempDir = path.join(stage, 'temp');
fs.mkdirSync(tempDir, { recursive: true });
const fileIds = {};
for (const o of project.objects) {
    for (const p of o.sprite.pictures) {
        const src = path.join(assetDir, p._file);
        if (!fileIds[p._file]) {
            fileIds[p._file] = crypto.createHash('md5').update(p._file).digest('hex');
        }
        const id = fileIds[p._file];
        const sub = path.join(id.slice(0, 2), id.slice(2, 4));
        for (const kind of ['image', 'thumb']) {
            const d = path.join(tempDir, sub, kind);
            fs.mkdirSync(d, { recursive: true });
            fs.copyFileSync(src, path.join(d, `${id}.png`));
        }
        p.filename = id;
        p.fileurl = `temp/${id.slice(0, 2)}/${id.slice(2, 4)}/image/${id}.png`;
        p.thumbUrl = `temp/${id.slice(0, 2)}/${id.slice(2, 4)}/thumb/${id}.png`;
        delete p._file;
    }
}
project.name = 'GRAVITY LAB';
fs.writeFileSync(path.join(tempDir, 'project.json'), JSON.stringify(project));
if (outJson) {
    fs.mkdirSync(path.dirname(outJson), { recursive: true });
    fs.writeFileSync(outJson, JSON.stringify(project, null, 1));
}
fs.mkdirSync(path.dirname(path.resolve(outEnt)), { recursive: true });
execFileSync('tar', ['-czf', path.resolve(outEnt), '-C', stage, 'temp']);
fs.rmSync(stage, { recursive: true, force: true });

// 블록 문서 (엔트리 블록 문구로 옮긴 전체 스크립트)
if (process.env.GL_BLOCK_DOC) {
    const { renderProjectDoc } = require('./gl_blockdoc');
    const meta = {
        functions: Object.fromEntries(Object.values(P.functions).map((f) => [f.id, { name: f.name, spec: f.spec, paramTypes: f.paramTypes }])),
    };
    fs.writeFileSync(process.env.GL_BLOCK_DOC, renderProjectDoc(project, meta));
}

// 통계
let blocks = 0;
const count = (arr) => {
    for (const t of arr) {
        blocks += G.countBlocks(t);
    }
};
project.objects.forEach((o) => count(JSON.parse(o.script)));
project.functions.forEach((f) => count(JSON.parse(f.content)));
console.log(`built ${outEnt}: objects=${project.objects.length} functions=${project.functions.length} ` +
    `variables=${project.variables.length} messages=${project.messages.length} statementBlocks≈${blocks}`);
