'use strict';
/**
 * GRAVITY LAB — 물리 엔진(엔트리 사용자 정의 함수로 생성)
 *
 * 핵심 설계:
 *  - 엔트리의 반복 블록은 한 바퀴마다 화면 한 프레임을 쉰다.
 *    → 천체 쌍 순회/서브스텝 반복을 "반복 블록" 대신 "함수 호출을 펼쳐서" 한 프레임 안에 끝낸다.
 *  - 천체 데이터는 8칸 고정 슬롯 리스트(같은 번호 = 같은 천체).
 *    병합/탈출 시 리스트 항목을 지우지 않고 '활성'을 0으로 바꾼다(번호가 밀리는 문제 방지).
 *  - 적분: 반암시적(심플렉틱) 오일러 — v ← v + a·dt, x ← x + v·dt (문서의 순서 그대로).
 *  - 계산 중간값은 '함수 지역 변수'에 둔다. (엔트리 일반 변수는 값을 바꿀 때마다
 *    숨겨져 있어도 화면 표시 크기를 다시 재기 때문에 반복 계산에 쓰면 매우 느려진다.)
 */
const G = require('./entrygen');
const {
    add, sub, mul, div, sqrt, abs, v, setv, chgv, item, setItem, If, IfElse, and, or, eq, gt, ge, le, lt,
    defineFunction, param, call, lget, lset,
} = G;

const SLOTS = 8;

function pairs() {
    const out = [];
    for (let i = 1; i <= SLOTS; i++) {
        for (let j = i + 1; j <= SLOTS; j++) {
            out.push([i, j]);
        }
    }
    return out;
}

function definePhysics(P, opts = {}) {
    const onMerge = opts.onMerge || (() => []);
    const onEscape = opts.onEscape || (() => []);
    const MAX = opts.maxSteps || 10;

    // ---- 천체 병합 (i) (j) : 질량 보존 + 운동량 보존 ----
    {
        const F = '천체 병합';
        const i = () => param(F, 'i');
        const j = () => param(F, 'j');
        const L = (n) => lget(F, n);
        const S = (n, x) => lset(F, n, x);
        defineFunction(F, ['천체 병합', { param: 'i' }, { param: 'j' }], () => [
            // 남는 천체 k = 더 무거운 쪽(같으면 앞 번호), 사라지는 천체 q
            IfElse(ge(item('질량', i()), item('질량', j())),
                [S('k', i()), S('q', j())],
                [S('k', j()), S('q', i())]),
            S('m1', item('질량', L('k'))),
            S('m2', item('질량', L('q'))),
            S('mt', add(L('m1'), L('m2'))),
            // 위치 = 질량중심, 속도 = (m1·v1 + m2·v2) / (m1 + m2)  (x, y 각각)
            ...['X', 'Y', 'VX', 'VY'].map((c) =>
                setItem(c, L('k'), div(add(mul(L('m1'), item(c, L('k'))), mul(L('m2'), item(c, L('q')))), L('mt')))
            ),
            // 두 천체가 이번 스텝에 받던 힘은 합친다(둘 사이 힘은 합하면 상쇄되므로 정확)
            setItem('FX', L('k'), add(item('FX', L('k')), item('FX', L('q')))),
            setItem('FY', L('k'), add(item('FY', L('k')), item('FY', L('q')))),
            setItem('질량', L('k'), L('mt')),
            // 새 반지름 = ∛(r1³ + r2³) (밀도가 같다고 가정한 부피 보존) — 뉴턴법 4회 (시작값 = 큰 반지름)
            S('r1', item('반지름', L('k'))),
            S('r2', item('반지름', L('q'))),
            S('s3', add(mul(mul(L('r1'), L('r1')), L('r1')), mul(mul(L('r2'), L('r2')), L('r2')))),
            IfElse(gt(L('r1'), L('r2')), [S('c', L('r1'))], [S('c', L('r2'))]),
            ...[1, 2, 3, 4].map(() => S('c', div(add(mul(2, L('c')), div(L('s3'), mul(L('c'), L('c')))), 3))),
            setItem('반지름', L('k'), L('c')),
            // 사라지는 천체 정리(데이터는 남기고 비활성화)
            setItem('활성', L('q'), 0),
            ...['VX', 'VY', 'FX', 'FY', 'AX', 'AY'].map((c) => setItem(c, L('q'), 0)),
            If(eq(v('선택천체'), L('q')), [setv('선택천체', L('k'))]),
            ...onMerge(L),
        ], { locals: ['k', 'q', 'm1', 'm2', 'mt', 'r1', 'r2', 's3', 'c'] });
    }

    // ---- 쌍 중력 (i) (j) : 한 쌍을 한 번만 계산하고 +F / -F 를 동시에 누적 ----
    {
        const F = '쌍 중력';
        const i = () => param(F, 'i');
        const j = () => param(F, 'j');
        const L = (n) => lget(F, n);
        const S = (n, x) => lset(F, n, x);
        defineFunction(F, ['쌍 중력', { param: 'i' }, { param: 'j' }], () => [
            If(and(eq(item('활성', i()), 1), eq(item('활성', j()), 1)), [
                S('dx', sub(item('X', j()), item('X', i()))),
                S('dy', sub(item('Y', j()), item('Y', i()))),
                S('r2', add(mul(L('dx'), L('dx')), mul(L('dy'), L('dy')))),
                S('rs', add(item('반지름', i()), item('반지름', j()))),
                IfElse(
                    // 충돌: r ≤ r1 + r2  (제곱끼리 비교해 제곱근 계산을 아낀다)
                    and(eq(v('충돌사용'), 1), le(L('r2'), mul(L('rs'), L('rs')))),
                    [call('천체 병합', i(), j())],
                    [
                        // 최소 거리 보호: r² < ε² 이면 r² = ε²
                        If(lt(L('r2'), v('최소거리제곱')), [S('r2', v('최소거리제곱'))]),
                        S('r', sqrt(L('r2'))),
                        // |F| = G·m1·m2 / r²  →  Fx = |F|·dx/r,  Fy = |F|·dy/r
                        S('f', div(mul(mul(v('중력상수'), item('질량', i())), item('질량', j())), L('r2'))),
                        S('fx', div(mul(L('f'), L('dx')), L('r'))),
                        S('fy', div(mul(L('f'), L('dy')), L('r'))),
                        // 작용·반작용: i 는 +F(j 쪽으로 끌림), j 는 -F
                        setItem('FX', i(), add(item('FX', i()), L('fx'))),
                        setItem('FY', i(), add(item('FY', i()), L('fy'))),
                        setItem('FX', j(), sub(item('FX', j()), L('fx'))),
                        setItem('FY', j(), sub(item('FY', j()), L('fy'))),
                    ]
                ),
            ]),
        ], { locals: ['dx', 'dy', 'r2', 'rs', 'r', 'f', 'fx', 'fy'] });
    }

    // ---- 천체 이동 (i) : a = F/m → v ← v + a·dt → x ← x + v·dt ----
    {
        const F = '천체 이동';
        const i = () => param(F, 'i');
        const L = (n) => lget(F, n);
        const S = (n, x) => lset(F, n, x);
        defineFunction(F, ['천체 이동', { param: 'i' }], () => [
            If(eq(item('활성', i()), 1), [
                S('ax', div(item('FX', i()), item('질량', i()))),
                S('ay', div(item('FY', i()), item('질량', i()))),
                // 최대 가속도 보호 — 물리 법칙을 바꾸는 "수치 안정성 장치"이므로 작동 횟수를 기록해 화면에 알린다
                S('a2', add(mul(L('ax'), L('ax')), mul(L('ay'), L('ay')))),
                If(gt(L('a2'), v('최대가속도제곱')), [
                    S('s', div(v('최대가속도'), sqrt(L('a2')))),
                    S('ax', mul(L('ax'), L('s'))),
                    S('ay', mul(L('ay'), L('s'))),
                    setItem('보호작동', 1, add(item('보호작동', 1), 1)),
                ]),
                setItem('AX', i(), L('ax')),
                setItem('AY', i(), L('ay')),
                setItem('VX', i(), add(item('VX', i()), mul(L('ax'), v('dt')))),
                setItem('VY', i(), add(item('VY', i()), mul(L('ay'), v('dt')))),
                setItem('X', i(), add(item('X', i()), mul(item('VX', i()), v('dt')))),
                setItem('Y', i(), add(item('Y', i()), mul(item('VY', i()), v('dt')))),
                // 관측 범위를 크게 벗어나면 '탈출'로 처리(수치 폭주 방지 + 탈출 실험 결과)
                If(or(gt(abs(item('X', i())), v('이탈거리')), gt(abs(item('Y', i())), v('이탈거리'))), [
                    setItem('활성', i(), 0),
                    ...onEscape(i),
                ]),
            ]),
        ], { locals: ['ax', 'ay', 'a2', 's'] });
    }

    // ---- 물리 한 스텝 ----
    defineFunction('물리 한 스텝', ['물리 한 스텝'], () => {
        const out = [];
        // 1~2. 모든 천체의 Fx, Fy 를 0으로
        for (let k = 1; k <= SLOTS; k++) {
            out.push(setItem('FX', k, 0), setItem('FY', k, 0));
        }
        // 3~6. 천체 쌍 순회(8칸 → 최대 28쌍). 반복 블록 대신 펼쳐 두어 한 프레임 안에 끝난다.
        //      '사용슬롯'(쓰고 있는 가장 큰 번호)까지만 계산해 천체가 적을 때 낭비를 줄인다.
        for (let j = 2; j <= SLOTS; j++) {
            const group = [];
            for (let i = 1; i < j; i++) {
                group.push(call('쌍 중력', i, j));
            }
            out.push(j === 2 ? If(ge(v('사용슬롯'), 2), group) : If(ge(v('사용슬롯'), j), group));
        }
        // 7~9. 가속도 → 속도 → 위치
        for (let k = 1; k <= SLOTS; k++) {
            out.push(If(ge(v('사용슬롯'), k), [call('천체 이동', k)]));
        }
        return out;
    });

    // ---- 물리 프레임 : (프레임 시간 × 배속)만큼 작은 dt 스텝을 여러 번 (최대 MAX 회) ----
    {
        const F = '물리 프레임';
        const L = (n) => lget(F, n);
        const S = (n, x) => lset(F, n, x);
        defineFunction(F, ['물리 프레임'], () => {
            const out = [
                S('acc', add(v('누적시간'), mul(v('프레임시간'), v('배속')))),
                S('n', 0),
            ];
            // 한 프레임 최대 계산 횟수(프레임최대스텝)는 천체 수에 따라 줄여 화면 반응성을 지킨다
            for (let k = 0; k < MAX; k++) {
                out.push(If(and(ge(L('acc'), v('dt')), lt(L('n'), v('프레임최대스텝'))), [
                    call('물리 한 스텝'),
                    S('acc', sub(L('acc'), v('dt'))),
                    S('n', add(L('n'), 1)),
                ]));
            }
            // 한 프레임 계산 한도를 넘으면 남은 시간을 버린다(느려져도 폭주하지 않음)
            out.push(If(ge(L('acc'), v('dt')), [S('acc', 0), setItem('보호작동', 2, add(item('보호작동', 2), 1))]));
            out.push(setv('누적시간', L('acc')));
            out.push(If(gt(L('n'), 0), [
                setv('시뮬레이션시간', add(v('시뮬레이션시간'), mul(L('n'), v('dt')))),
                setv('스텝수', add(v('스텝수'), L('n'))),
            ]));
            return out;
        }, { locals: ['acc', 'n'] });
    }
}

module.exports = { definePhysics, SLOTS, pairs };
