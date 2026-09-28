'use strict';
/**
 * GRAVITY LAB — 화면 레이아웃(엔트리 무대 480×270, 중심 (0,0), y 위쪽 +)
 * 이미지 생성(gl_art.js)과 블록 생성(build_gravity_lab.js)이 같은 좌표를 쓴다.
 */

const STAGE = { w: 480, h: 270 };

// 영역
const TOP = { y0: 113, y1: 135 }; // 상단 바
const BOTTOM = { y0: -135, y1: -104 }; // 하단 바
const PANEL = { x0: 118, x1: 240, y0: -104, y1: 113 }; // 오른쪽 정보 패널
const VIEW = { x0: -240, x1: 118, y0: -104, y1: 113 }; // 시뮬레이션 영역
const VIEW_CENTER = { x: (VIEW.x0 + VIEW.x1) / 2, y: (VIEW.y0 + VIEW.y1) / 2 };

// 버튼: id 는 버튼 리스트의 번호. kind 로 그림 스타일을 고른다.
//  screen: 버튼이 보이는 화면. SIM 버튼의 표시 조건은 build 스크립트의 '버튼 갱신' 함수가 정한다.
const B = [];
function btn(id, key, screen, x, y, w, h, label, kind = 'ctl', extra = {}) {
    B.push({ id, key, screen, x, y, w, h, label, kind, ...extra });
}

const BY = -119.5; // 하단 버튼 줄 중심 y
const BH = 20;
// --- 하단 바: 실행 제어 ---
btn(1, 'play', 'SIM', -216, BY, 44, BH, '▶ PLAY', 'primary');
btn(2, 'pause', 'SIM', -169, BY, 44, BH, '❚❚ PAUSE');
btn(3, 'reset', 'SIM', -122, BY, 44, BH, '↻ RESET');
// 배속 (SPEED 라벨은 프레임 이미지에 있음)
const SPEEDS = [
    { id: 4, v: 0.25, label: '×¼' },
    { id: 5, v: 0.5, label: '×½' },
    { id: 6, v: 1, label: '×1' },
    { id: 7, v: 2, label: '×2' },
    { id: 8, v: 5, label: '×5' },
    { id: 9, v: 10, label: '×10' },
];
SPEEDS.forEach((s, k) => btn(s.id, `speed${k}`, 'SIM', -49 + k * 24, BY, 22, BH, s.label, 'seg'));
// 표시 옵션
btn(10, 'trail', 'SIM', 112, BY, 34, BH, '궤적', 'toggle');
btn(14, 'trailLen', 'SIM', 146, BY, 30, BH, '10s', 'ctl', {
    variants: [
        { key: 'len1', label: '3s' },
        { key: 'len2', label: '10s' },
        { key: 'len3', label: '30s' },
        { key: 'len4', label: '∞' },
    ],
});
btn(15, 'trailClear', 'SIM', 176, BY, 26, BH, '지움', 'ctl');
btn(11, 'vector', 'SIM', 207, BY, 34, BH, '벡터', 'toggle');
// 확대/축소 (시뮬레이션 영역 오른쪽 아래)
btn(12, 'zoomOut', 'SIM', VIEW.x1 - 30, VIEW.y0 + 11, 16, 16, '−', 'ctl');
btn(13, 'zoomIn', 'SIM', VIEW.x1 - 12, VIEW.y0 + 11, 16, 16, '+', 'ctl');

// --- 오른쪽 패널: 선택 천체 편집 ---
const PX = PANEL.x0;
btn(16, 'editMass', 'SIM', PX + 20, 22, 36, 14, '질량', 'edit');
btn(17, 'editVX', 'SIM', PX + 59, 22, 36, 14, 'VX', 'edit');
btn(18, 'editVY', 'SIM', PX + 98, 22, 36, 14, 'VY', 'edit');
btn(19, 'editX', 'SIM', PX + 16, 6, 28, 14, 'X', 'edit');
btn(20, 'editY', 'SIM', PX + 45, 6, 28, 14, 'Y', 'edit');
btn(21, 'editR', 'SIM', PX + 74, 6, 28, 14, '반지름', 'edit');
btn(22, 'editName', 'SIM', PX + 104, 6, 30, 14, '이름', 'edit');
// 탭
btn(25, 'tabQ', 'SIM', PX + 20, -12, 38, 14, '질문', 'tab');
btn(26, 'tabA', 'SIM', PX + 61, -12, 38, 14, '분석', 'tab');
btn(27, 'tabC', 'SIM', PX + 102, -12, 38, 14, '비교', 'tab');
// 비교 탭 전용
btn(28, 'saveA', 'SIM', PX + 31, -97, 58, 12, 'A로 저장', 'edit');
btn(29, 'clearA', 'SIM', PX + 92, -97, 56, 12, 'A 지우기', 'edit');
// SANDBOX 전용 (시뮬레이션 영역 오른쪽 위)
btn(23, 'addBody', 'SIM', VIEW.x1 - 58, VIEW.y1 - 11, 40, 14, '+ 천체', 'edit');
btn(24, 'delBody', 'SIM', VIEW.x1 - 20, VIEW.y1 - 11, 32, 14, '삭제', 'danger');
// 상단 바
btn(31, 'help', 'SIM', 188, 124, 34, 15, '도움말', 'ctl');
btn(30, 'menu', 'SIM', 221, 124, 30, 15, 'MENU', 'ctl');

// --- 시작 화면 ---
btn(40, 'startExp', 'START', 0, -38, 132, 24, '실험 시작', 'bigPrimary');
btn(41, 'startPreset', 'START', 0, -66, 132, 24, '프리셋 실험', 'big');
btn(42, 'startHelp', 'START', 0, -94, 132, 24, '사용 방법', 'big');

// --- 모드 선택 화면 (카드 버튼) ---
const MODES = [
    { id: 43, mode: 'BASIC', title: 'BASIC', ko: '기본', goal: '중력의 기본 원리 이해', lines: ['천체 2개', '질량 · 초기 속도 조절', '궤적 · 재생/일시정지'], max: 2 },
    { id: 44, mode: 'EXPERIMENT', title: 'EXPERIMENT', ko: '실험', goal: '초기 조건에 따른 결과 비교', lines: ['천체 최대 6개', '위치 조절 · 속도 벡터', '충돌 · 배속 · 분석 · 비교'], max: 6 },
    { id: 45, mode: 'SANDBOX', title: 'SANDBOX', ko: '자유', goal: '자유로운 중력 실험', lines: ['천체 최대 8개 생성/삭제', '반지름 · 이름 편집', '모든 기능 사용'], max: 8 },
];
MODES.forEach((m, k) => btn(m.id, `mode${k}`, 'MODE', -150 + k * 150, -2, 138, 138, m.title, 'card', { card: m }));
btn(46, 'modeBack', 'MODE', -186, -112, 80, 18, '← 돌아가기', 'ctl');

// --- 프리셋 화면 ---
const PRESETS = [
    { id: 47, n: 1, name: '2체 궤도 모델', sub: '행성-위성 모델', mode: 'BASIC', q: '위성의 속도를 줄이면 궤도는 어떻게 될까?' },
    { id: 48, n: 2, name: '탈출 속도 실험', sub: '행성-탐사체 모델', mode: 'EXPERIMENT', q: '얼마나 빨라야 행성을 영원히 떠날까?' },
    { id: 49, n: 3, name: '쌍성계', sub: '같은 질량의 두 별', mode: 'EXPERIMENT', q: '한 별의 질량을 2배로 바꾸면?' },
    { id: 50, n: 4, name: '3체 문제', sub: '8자 궤도 해', mode: 'EXPERIMENT', q: '속도를 0.1만 바꾸면 어떻게 될까?' },
    { id: 51, n: 5, name: '사용자 직접 실험', sub: '빈 실험실', mode: 'SANDBOX', q: '나만의 질문을 만들어 실험해 보자' },
];
PRESETS.forEach((p, k) => btn(p.id, `preset${k}`, 'PRESET', -184 + k * 92, -4, 86, 150, `PRESET 0${p.n}`, 'pcard', { preset: p }));
btn(52, 'presetBack', 'PRESET', -186, -112, 80, 18, '← 돌아가기', 'ctl');

// --- 도움말 화면 ---
btn(53, 'helpBack', 'HELP', 0, -121, 110, 18, '닫기', 'bigPrimary');

const BUTTON_COUNT = 53;

// 글상자 위치
const TEXT = {
    presetTitle: { x: -52, y: 124, w: 150, h: 14 },
    timeBar: { x: 96, y: 124, w: 144, h: 14 },
    info: { x: PANEL.x0 + 61, y: 64, w: 116, h: 70 },
    lower: { x: PANEL.x0 + 61, y: -55.5, w: 116, h: 71 },
    toast: { x: VIEW.x0 + 4 + 140, y: VIEW.y1 - 10, w: 280, h: 14 },
    units: { x: VIEW.x0 + 4 + 150, y: VIEW.y0 + 8, w: 300, h: 12 },
};

module.exports = {
    STAGE, TOP, BOTTOM, PANEL, VIEW, VIEW_CENTER, BUTTONS: B, BUTTON_COUNT, SPEEDS, MODES, PRESETS, TEXT,
};
