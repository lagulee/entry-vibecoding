'use strict';
/**
 * HEX — 보드 기하 (빌드 스크립트와 기준 AI가 함께 쓴다)
 *
 * 칸 번호 i = r·N + q + 1 (1부터, r = 행 0..N-1 위→아래, q = 열 0..N-1 왼→오)
 * 빨강(1) = 왼쪽 변(q=0) ↔ 오른쪽 변(q=N-1) 연결
 * 파랑(2) = 위쪽 변(r=0) ↔ 아래쪽 변(r=N-1) 연결
 */
const NB = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, 1], [1, -1]];
// 브리지: [상대 위치, 사이 칸 1, 사이 칸 2]
const BR = [
    [[-1, 2], [-1, 1], [0, 1]],
    [[1, 1], [0, 1], [1, 0]],
    [[2, -1], [1, 0], [1, -1]],
    [[1, -2], [1, -1], [0, -1]],
    [[-1, -1], [0, -1], [-1, 0]],
    [[-2, 1], [-1, 0], [-1, 1]],
];

function geom(N) {
    const inside = (r, q) => r >= 0 && r < N && q >= 0 && q < N;
    const id = (r, q) => r * N + q + 1;
    const cells = [];
    for (let r = 0; r < N; r++) {
        for (let q = 0; q < N; q++) {
            const c = { i: id(r, q), r, q, nb: [], br: [] };
            for (const [dr, dq] of NB) {
                if (inside(r + dr, q + dq)) {
                    c.nb.push(id(r + dr, q + dq));
                }
            }
            for (const [[dr, dq], [ar, aq], [br, bq]] of BR) {
                if (inside(r + dr, q + dq)) {
                    c.br.push({ to: id(r + dr, q + dq), a: id(r + ar, q + aq), b: id(r + br, q + bq) });
                }
            }
            cells.push(c);
        }
    }
    /**
     * 변 정보: player 1(빨강) / 2(파랑), side 0(낮은 쪽) / 1(높은 쪽)
     * edge(i) = 그 변에 닿는 칸인가, tpl(i) = 둘째 줄 칸이 변과 이어지는 두 칸 [a,b] (둘 다 비면 연결된 것으로 본다)
     */
    function side(player, s) {
        const onEdge = new Set();
        const tpl = {};
        for (const c of cells) {
            const k = player === 1 ? c.q : c.r;
            const edgeK = s === 0 ? 0 : N - 1;
            if (k === edgeK) {
                onEdge.add(c.i);
            }
            const secondK = s === 0 ? 1 : N - 2;
            if (k === secondK && N >= 3) {
                let pair;
                if (player === 1) {
                    pair = s === 0 ? [[c.r, 0], [c.r + 1, 0]] : [[c.r, N - 1], [c.r - 1, N - 1]];
                } else {
                    pair = s === 0 ? [[0, c.q], [0, c.q + 1]] : [[N - 1, c.q], [N - 1, c.q - 1]];
                }
                if (pair.every(([r, q]) => inside(r, q))) {
                    tpl[c.i] = pair.map(([r, q]) => id(r, q));
                }
            }
        }
        return { onEdge, tpl };
    }
    return { N, cells, id, inside, side };
}

module.exports = { geom, NB, BR };
