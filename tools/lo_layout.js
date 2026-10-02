'use strict';
/**
 * LIGHTS OUT — 화면 레이아웃 (엔트리 무대 480×270, 중심 (0,0), y 위쪽 +)
 * 그림 설계(figma/lo_design.js)와 블록 생성(build_lights_out.js)이 같은 좌표를 쓴다.
 */

const STAGE = { w: 480, h: 270 };

// 판 위치 (무대 좌표) — 판 한 변의 길이(px)를 칸 수로 나눈 값이 칸 크기
const BOARD = {
    puzzle: { x: -70, y: -8, size: 196 },
    race1: { x: -114, y: -14, size: 172 },
    race2: { x: 114, y: -14, size: 172 },
};

// 스테이지 목록 타일
const TILE = { x0: -171, dx: 38, w: 34, h: 32, rows: [58, 4, -50] };
const tilePos = (k) => ({ x: TILE.x0 + ((k - 1) % 10) * TILE.dx, y: TILE.rows[Math.floor((k - 1) / 10)] });

// 스킨
const SKINS = [
    { id: 1, key: 'window', name: '불 켜진 창문', need: 0 },
    { id: 2, key: 'bulb', name: '알전구', need: 20 },
    { id: 3, key: 'star', name: '별빛', need: 45 },
];

// AI 난이도: 누름 간격(초) · 실수 확률(%) · 설명
const AI_LEVELS = [
    { id: 1, key: 'easy', name: '쉬움', delay: 3.0, miss: 35, desc: '느긋하게, 가끔 실수' },
    { id: 2, key: 'normal', name: '보통', delay: 1.9, miss: 15, desc: '제법 빠릿빠릿' },
    { id: 3, key: 'hard', name: '어려움', delay: 1.1, miss: 0, desc: '실수 없이 최소 횟수' },
];

// 대전 판: 크기별 최소 누름 수 범위 (AI 풀이기로 확인한 뒤 채택)
const RACE_RANGE = { 4: [4, 6], 5: [6, 9] };

// 버튼: id = 버튼 리스트 번호. screen = 보이는 화면, overlay = 보이는 오버레이('' = 없음)
const B = [];
function btn(id, key, screen, x, y, w, h, label, kind = 'ghost', extra = {}) {
    B.push({ id, key, screen, overlay: '', x, y, w, h, label, kind, ...extra });
}

// TITLE — 모드 카드 3개 + 작은 버튼
btn(1, 'modePuzzle', 'TITLE', -150, -22, 132, 96, '퍼즐 모드', 'card', {
    tag: '혼자서', icon: 'puzzle', desc: ['30 스테이지, 3×3부터 5×5까지', '막히면 AI가 힌트를 줘요'], color: '#FFCF5A',
});
btn(2, 'modeAI', 'TITLE', 0, -22, 132, 96, 'AI 대전', 'card', {
    tag: '나 vs AI', icon: 'ai', desc: ['난이도는 같고 판은 달라요', '먼저 다 끄면 승리! 3판 2선승'], color: '#A99BE0',
});
btn(3, 'modePVP', 'TITLE', 150, -22, 132, 96, '2인 대전', 'card', {
    tag: '나 vs 친구', icon: 'pvp', desc: ['키보드 하나로 둘이서', 'WASD 대 방향키'], color: '#F08A7E',
});
btn(4, 'help', 'TITLE', -52, -100, 96, 22, '게임 방법', 'ghost', { icon: 'help' });
btn(5, 'skin', 'TITLE', 52, -100, 96, 22, '스킨', 'ghost', { icon: 'star' });

// HELP / SKIN
btn(6, 'helpBack', 'HELP', 0, -112, 96, 20, '돌아가기', 'ghost', { icon: 'back' });
SKINS.forEach((s, k) => btn(7 + k, `skin${s.id}`, 'SKIN', -140 + k * 140, 2, 124, 128, s.name, 'skincard', { skin: s }));
btn(10, 'skinBack', 'SKIN', 0, -112, 96, 20, '돌아가기', 'ghost', { icon: 'back' });

// STAGES — 타일 30개 (id 11~40) + 돌아가기
for (let k = 1; k <= 30; k++) {
    const p = tilePos(k);
    btn(10 + k, `stage${k}`, 'STAGES', p.x, p.y, TILE.w, TILE.h, String(k), 'tile', { stage: k });
}
btn(41, 'stagesBack', 'STAGES', -176, 113, 64, 18, '메뉴', 'ghost', { icon: 'back' });

// PUZZLE — 오른쪽 패널
const PX = 142;
btn(42, 'hint', 'PUZZLE', PX - 42, -58, 80, 24, 'AI 힌트', 'ai', { icon: 'bulb' });
btn(43, 'solve', 'PUZZLE', PX + 42, -58, 80, 24, 'AI 풀이', 'ai', { icon: 'eye' });
btn(44, 'retry', 'PUZZLE', PX - 42, -88, 80, 22, '다시하기', 'ghost', { icon: 'retry' });
btn(45, 'list', 'PUZZLE', PX + 42, -88, 80, 22, '목록', 'ghost', { icon: 'list' });
// PUZZLE 클리어 오버레이
btn(46, 'next', 'PUZZLE', 0, -58, 104, 24, '다음 스테이지', 'primary', { overlay: 'CLEAR', icon: 'play' });
btn(47, 'clearRetry', 'PUZZLE', -96, -58, 76, 24, '다시', 'ghost', { overlay: 'CLEAR', icon: 'retry' });
btn(48, 'clearList', 'PUZZLE', 96, -58, 76, 24, '목록', 'ghost', { overlay: 'CLEAR', icon: 'list' });

// VSSET — 대전 설정
AI_LEVELS.forEach((l, k) => btn(49 + k, `lv${l.id}`, 'VSSET', -110 + k * 110, 34, 100, 44, l.name, 'seg', { level: l }));
btn(52, 'size4', 'VSSET', -46, -30, 84, 24, '4 × 4', 'seg');
btn(53, 'size5', 'VSSET', 46, -30, 84, 24, '5 × 5', 'seg');
btn(54, 'raceStart', 'VSSET', 0, -78, 130, 28, '대결 시작', 'primary', { icon: 'play' });
btn(55, 'vsBack', 'VSSET', -176, 113, 64, 18, '메뉴', 'ghost', { icon: 'back' });

// RACE
btn(56, 'raceExit', 'RACE', 208, 118, 52, 18, '나가기', 'ghost');
btn(57, 'rematch', 'RACE', -62, -60, 108, 26, '다시 대결', 'primary', { overlay: 'MATCH', icon: 'retry' });
btn(58, 'raceMenu', 'RACE', 62, -60, 108, 26, '메뉴', 'ghost', { overlay: 'MATCH', icon: 'list' });

const BUTTON_COUNT = 58;
const BUTTONS = B.sort((a, b) => a.id - b.id);
if (BUTTONS.length !== BUTTON_COUNT || BUTTONS.some((b, k) => b.id !== k + 1)) {
    throw new Error('button ids must be 1..BUTTON_COUNT');
}
const byKey = Object.fromEntries(BUTTONS.map((b) => [b.key, b]));

// 글상자 (x,y = 중심, w,h)
const TEXT = {
    titleStars: { x: 176, y: -100, w: 110, h: 16 },
    stagesStars: { x: 170, y: 113, w: 120, h: 16 },
    stageTitle: { x: PX, y: 86, w: 180, h: 24 },
    stageSub: { x: PX, y: 66, w: 180, h: 14 },
    moves: { x: PX - 44, y: 30, w: 84, h: 30 },
    par: { x: PX + 44, y: 30, w: 84, h: 30 },
    goal: { x: PX, y: 2, w: 184, h: 14 },
    aiMsg: { x: PX, y: -24, w: 186, h: 28 },
    vsTitle: { x: 0, y: 100, w: 300, h: 22 },
    vsSub: { x: 0, y: 80, w: 360, h: 14 },
    vsInfo: { x: 0, y: -104, w: 420, h: 14 },
    score: { x: 0, y: 103, w: 90, h: 24 },
    round: { x: 0, y: 121, w: 90, h: 10 },
    name1: { x: -114, y: 106, w: 172, h: 16 },
    name2: { x: 114, y: 106, w: 172, h: 16 },
    keys1: { x: -114, y: -113, w: 172, h: 14 },
    keys2: { x: 114, y: -113, w: 172, h: 14 },
    left1: { x: -114, y: 94, w: 172, h: 12 },
    left2: { x: 114, y: 94, w: 172, h: 12 },
    timer: { x: 0, y: -40, w: 40, h: 14 },
    result: { x: 0, y: -18, w: 260, h: 30 },
};

module.exports = { STAGE, BOARD, TILE, tilePos, SKINS, AI_LEVELS, RACE_RANGE, BUTTONS, BUTTON_COUNT, byKey, TEXT, PX };
