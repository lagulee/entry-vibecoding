'use strict';
/**
 * HEX — 화면 레이아웃 (무대 좌표: 가운데 0,0 · 가로 480 · 세로 270 · y 위쪽 +)
 */
const STAGE = { w: 480, h: 270 };

// 보드: 가운데 칸이 (BOARD.x, BOARD.y) 에 오도록 배치. w = 칸 가로 폭, R = 꼭짓점 반지름
const BOARD = { x: -60, y: -4 };
const SIZES = [5, 7, 9];
const CELL_W = { 5: 42, 7: 31, 9: 25 };
const STONE_BASE = 42; // 돌 그림은 칸 폭 42 기준으로 그린다
const R_OF = (w) => w / Math.sqrt(3);

function cellXY(N, r, q) {
    const w = CELL_W[N];
    const R = R_OF(w);
    const c = (N - 1) / 2;
    return { x: BOARD.x + (q - c + (r - c) / 2) * w, y: BOARD.y - (r - c) * 1.5 * R };
}

// 오른쪽 패널
const PANEL = { x: 181, w: 108 };

/**
 * 버튼: id, 화면, 위치(가운데), 크기, 글자, 종류
 * kind: primary(강조) · option(선택형) · ghost(보조) · panel(게임 패널)
 */
const BUTTONS = [
    { id: 1, screen: 'TITLE', x: 0, y: -66, w: 140, h: 30, label: '게임 시작', kind: 'primary' },
    { id: 2, screen: 'TITLE', x: -46, y: -99, w: 84, h: 22, label: '게임 방법', kind: 'ghost' },
    { id: 4, screen: 'TITLE', x: 46, y: -99, w: 84, h: 22, label: '빠른 대국', kind: 'ghost' },
    { id: 3, screen: 'HELP', x: 0, y: -113, w: 110, h: 22, label: '알겠어요!', kind: 'primary' },

    { id: 10, screen: 'SETUP', x: 12, y: 62, w: 92, h: 24, label: 'AI 대전', kind: 'option', icon: 'ai' },
    { id: 11, screen: 'SETUP', x: 110, y: 62, w: 92, h: 24, label: '2인 대전', kind: 'option', icon: 'two' },
    { id: 12, screen: 'SETUP', x: -4, y: 28, w: 60, h: 24, label: '쉬움', kind: 'option' },
    { id: 13, screen: 'SETUP', x: 61, y: 28, w: 60, h: 24, label: '보통', kind: 'option' },
    { id: 14, screen: 'SETUP', x: 126, y: 28, w: 60, h: 24, label: '어려움', kind: 'option' },
    { id: 15, screen: 'SETUP', x: -4, y: -6, w: 60, h: 24, label: '5 × 5', kind: 'option' },
    { id: 16, screen: 'SETUP', x: 61, y: -6, w: 60, h: 24, label: '7 × 7', kind: 'option' },
    { id: 17, screen: 'SETUP', x: 126, y: -6, w: 60, h: 24, label: '9 × 9', kind: 'option' },
    { id: 18, screen: 'SETUP', x: 12, y: -40, w: 92, h: 24, label: '빨강 · 먼저', kind: 'option', icon: 'red' },
    { id: 19, screen: 'SETUP', x: 110, y: -40, w: 92, h: 24, label: '파랑 · 나중', kind: 'option', icon: 'blue' },
    { id: 20, screen: 'SETUP', x: 50, y: -96, w: 130, h: 28, label: '대국 시작', kind: 'primary' },
    { id: 21, screen: 'SETUP', x: -80, y: -96, w: 80, h: 24, label: '뒤로', kind: 'ghost' },

    { id: 30, screen: 'GAME', x: PANEL.x - 25.5, y: -64, w: 49, h: 20, label: '무르기', kind: 'panel', icon: 'undo' },
    { id: 33, screen: 'GAME', x: PANEL.x + 25.5, y: -64, w: 49, h: 20, label: '힌트', kind: 'panel', icon: 'hint' },
    { id: 31, screen: 'GAME', x: PANEL.x, y: -88, w: 100, h: 20, label: '새 대국', kind: 'panel', icon: 'new' },
    { id: 32, screen: 'GAME', x: PANEL.x, y: -112, w: 100, h: 20, label: '설정 · 메뉴', kind: 'panel', icon: 'menu' },
];

// 글상자 (가운데 기준)
const TEXT = {
    sizeTag: { x: PANEL.x + 26, y: 116, w: 54, h: 12 },
    turnSub: { x: PANEL.x, y: 58, w: 100, h: 12 },
    players: { x: PANEL.x + 2, y: 24, w: 96, h: 26 },
    score: { x: PANEL.x, y: -21, w: 100, h: 14 },
    moves: { x: PANEL.x, y: -36, w: 100, h: 11 },
    resultSub: { x: BOARD.x, y: -7, w: 220, h: 14 },
    titleRecord: { x: 0, y: -122, w: 300, h: 12 },
};
const TURN_CARD = { x: PANEL.x, y: 82, w: 100, h: 30 };
const BANNER = { x: BOARD.x, y: 0, w: 240, h: 84 };

module.exports = { STAGE, BOARD, SIZES, CELL_W, STONE_BASE, R_OF, cellXY, PANEL, BUTTONS, TEXT, TURN_CARD, BANNER };
