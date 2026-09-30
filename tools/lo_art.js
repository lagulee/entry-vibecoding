'use strict';
/**
 * LIGHTS OUT — 그림 에셋 생성기
 * HTML/SVG 로 그린 뒤 Chromium(playwright-core)으로 2배 해상도 PNG 를 만든다.
 * 사용: node tools/lo_art.js <출력폴더>
 */
const fs = require('fs');
const path = require('path');
const L = require('./lo_layout');

const CHROME = process.env.GL_CHROMIUM || '/opt/pw-browsers/chromium';
const FONT_ROOT = path.join(__dirname, '..', 'node_modules', '@fontsource');

const C = {
    bg0: '#060913', bg1: '#0b1226', panel: '#10182f', panel2: '#151f3b', line: '#222d52', line2: '#2f3d6b',
    text: '#eef2ff', muted: '#8e9ac0', dim: '#56628a',
    warm: '#ffcf4d', warm2: '#ffb020', glow: '#ffdd7a',
    p1: '#4fd6ff', p2: '#ff5fa2', ai: '#b388ff', ok: '#5ef0a6',
};
const PLAYER = { p1: C.p1, p2: C.p2, ai: C.ai };

function fontFaces() {
    const f = (fam, pkg, file, w) => {
        const p = path.join(FONT_ROOT, pkg, 'files', file);
        if (!fs.existsSync(p)) {
            return '';
        }
        return `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}) format('woff2');font-weight:${w};}`;
    };
    return [
        f('SG', 'space-grotesk', 'space-grotesk-latin-500-normal.woff2', 500),
        f('SG', 'space-grotesk', 'space-grotesk-latin-700-normal.woff2', 700),
        f('JBM', 'jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff2', 400),
        f('JBM', 'jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff2', 700),
        f('KR', 'noto-sans-kr', 'noto-sans-kr-korean-400-normal.woff2', 400),
        f('KR', 'noto-sans-kr', 'noto-sans-kr-korean-700-normal.woff2', 700),
        f('KR', 'noto-sans-kr', 'noto-sans-kr-korean-900-normal.woff2', 900),
    ].join('\n');
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
body{font-family:'SG','KR',sans-serif;color:${C.text};-webkit-font-smoothing:antialiased}
.mono{font-family:'JBM','KR',monospace}
.abs{position:absolute}
.c{display:flex;align-items:center;justify-content:center}
`;

// 무대 좌표 → CSS 좌표
const sx = (x) => x + L.STAGE.w / 2;
const sy = (y) => L.STAGE.h / 2 - y;
const box = (b) => `left:${sx(b.x - b.w / 2)}px;top:${sy(b.y + b.h / 2)}px;width:${b.w}px;height:${b.h}px`;

// ---------------------------------------------------------------------------
// 아이콘
// ---------------------------------------------------------------------------
function bulbSVG(size, on, color = C.warm) {
    const glow = on ? `<circle cx="12" cy="10" r="10" fill="${color}" opacity=".28"/>` : '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${glow}
<path d="M12 3.2a6.3 6.3 0 0 0-3.6 11.5c.6.4.9 1 .9 1.7v.6h5.4v-.6c0-.7.3-1.3.9-1.7A6.3 6.3 0 0 0 12 3.2z" fill="${on ? color : 'none'}" stroke="${on ? '#fff6d0' : '#4b5780'}" stroke-width="1.2"/>
${on ? '<path d="M10 9.5l2 2 2-2" stroke="#8a5a00" stroke-width="1" fill="none"/>' : ''}
<rect x="9.2" y="17.6" width="5.6" height="1.5" rx=".6" fill="${on ? '#d8c7a0' : '#3a4568'}"/><rect x="9.8" y="19.6" width="4.4" height="1.4" rx=".6" fill="${on ? '#b8a780' : '#323c5c'}"/></svg>`;
}
function starPath(cx, cy, R, r) {
    const pts = [];
    for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r : R;
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
    }
    return `M${pts.join('L')}Z`;
}
function starSVG(size, on, color = C.warm) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="${starPath(12, 12.6, 10.5, 4.6)}" fill="${on ? color : 'none'}" stroke="${on ? '#fff3c4' : '#4b5780'}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
}
function miniGrid(n, lit, cell, color, gap = 2) {
    let s = '';
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const on = lit.includes(r * n + c);
            s += `<div style="position:absolute;left:${c * (cell + gap)}px;top:${r * (cell + gap)}px;width:${cell}px;height:${cell}px;border-radius:${cell * 0.25}px;
background:${on ? color : '#1b2444'};${on ? `box-shadow:0 0 ${cell * 0.6}px ${color}aa;` : 'border:1px solid #2a3560;'}"></div>`;
        }
    }
    const w = n * cell + (n - 1) * gap;
    return `<div style="position:relative;width:${w}px;height:${w}px">${s}</div>`;
}
function chipSVG(size, color) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.4">
<rect x="6" y="6" width="12" height="12" rx="2.5" fill="${color}22"/>
<path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3"/>
<text x="12" y="14.3" font-size="5.6" font-family="SG" font-weight="700" fill="${color}" stroke="none" text-anchor="middle">AI</text></svg>`;
}

// ---------------------------------------------------------------------------
// 배경
// ---------------------------------------------------------------------------
function bgBase(seed = 3, bokeh = 26) {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    let dots = '';
    for (let i = 0; i < bokeh; i++) {
        const x = rnd() * 480;
        const y = rnd() * 270;
        const r = 3 + rnd() * 16;
        const col = rnd() < 0.7 ? '#ffcf4d' : rnd() < 0.5 ? '#4fd6ff' : '#b388ff';
        dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" opacity="${(0.025 + rnd() * 0.05).toFixed(3)}"/>`;
    }
    let grid = '';
    for (let x = 0; x <= 480; x += 16) {
        grid += `<line x1="${x}" y1="0" x2="${x}" y2="270" stroke="#7f95d6" stroke-opacity=".035" stroke-width=".5"/>`;
    }
    for (let y = 0; y <= 270; y += 16) {
        grid += `<line x1="0" y1="${y}" x2="480" y2="${y}" stroke="#7f95d6" stroke-opacity=".035" stroke-width=".5"/>`;
    }
    return `<div class="abs" style="left:0;top:0;width:480px;height:270px;background:radial-gradient(ellipse at 50% 30%,#141d3d 0%,#0a1024 55%,${C.bg0} 100%)"></div>
<svg class="abs" width="480" height="270" style="left:0;top:0"><defs><filter id="bl"><feGaussianBlur stdDeviation="2"/></filter></defs>${grid}<g filter="url(#bl)">${dots}</g></svg>`;
}
function panel(x0, y0, w, h, extra = '') {
    return `<div class="abs" style="left:${x0}px;top:${y0}px;width:${w}px;height:${h}px;border-radius:10px;background:linear-gradient(180deg,${C.panel2}ee,${C.panel}ee);border:1px solid ${C.line2};box-shadow:0 6px 20px #0008,inset 0 1px 0 #ffffff10;${extra}"></div>`;
}
function boardFrame(b, accent = C.warm) {
    const pad = 7;
    const s = b.size + pad * 2;
    return `<div class="abs" style="left:${sx(b.x) - s / 2}px;top:${sy(b.y) - s / 2}px;width:${s}px;height:${s}px;border-radius:12px;
background:linear-gradient(160deg,#18223f,#0c1328);border:1px solid ${C.line2};box-shadow:0 0 0 1px #00000060,0 10px 28px #000a,inset 0 0 24px ${accent}14"></div>`;
}
function garland(y = 10, n = 17) {
    let s = `<path d="M-4 ${y} ${[...Array(n)].map((_, k) => `Q${(k + 0.5) * (488 / n) - 4} ${y + 10} ${(k + 1) * (488 / n) - 4} ${y}`).join(' ')}" fill="none" stroke="#3a4570" stroke-width="1"/>`;
    for (let k = 0; k < n; k++) {
        const x = (k + 0.5) * (488 / n) - 4;
        const on = [0, 2, 3, 6, 8, 9, 11, 14, 16].includes(k);
        s += `<g transform="translate(${x - 5},${y + 4}) rotate(180 5 5)">${bulbSVG(10, on).replace('<svg', '<svg x="0" y="0"')}</g>`;
    }
    return `<svg class="abs" width="480" height="40" style="left:0;top:0">${s}</svg>`;
}
function logo(size = 1, x = 240, y = 44) {
    const fs1 = 40 * size;
    return `<div class="abs c" style="left:${x - 200}px;top:${y - fs1 * 0.62}px;width:400px;height:${fs1 * 1.24}px;gap:${10 * size}px">
<span style="font-family:SG;font-weight:700;font-size:${fs1}px;letter-spacing:${2 * size}px;color:#fff6d6;text-shadow:0 0 ${6 * size}px ${C.warm},0 0 ${18 * size}px ${C.warm2},0 0 ${34 * size}px ${C.warm2}88">LIGHTS</span>
<span style="font-family:SG;font-weight:700;font-size:${fs1}px;letter-spacing:${2 * size}px;color:transparent;-webkit-text-stroke:${1.2 * size}px #5a6690">OUT</span></div>`;
}
const heading = (en, kr, y = 12) => `<div class="abs" style="left:0;right:0;top:${y}px;text-align:center">
<div class="mono" style="font-size:7px;letter-spacing:3px;color:${C.muted}">${en}</div>
<div style="font-size:16px;font-weight:900;margin-top:1px">${kr}</div></div>`;

function titleHTML() {
    return `${bgBase(11, 34)}${garland(6)}${logo(1, 240, 58)}
<div class="abs c" style="left:0;right:0;top:84px;gap:8px">
 <div class="mono" style="font-size:7px;letter-spacing:2.5px;color:${C.muted}">ENTRY PUZZLE · AI EDITION</div></div>
<div class="abs" style="left:0;right:0;top:96px;text-align:center;font-size:9px;color:#c9d2f0;font-weight:700">칸을 누르면 상하좌우까지 뒤집혀요 — 모든 불을 꺼 보세요!</div>
<div class="abs mono" style="left:10px;bottom:6px;font-size:6px;color:${C.dim}">made with ENTRY · GF(2) AI solver</div>`;
}
function helpHTML() {
    // 왼쪽: 누름 규칙 그림 (3×3, 가운데 누름 전 → 후)
    const before = [0, 4, 8];
    const after = [0, 1, 3, 5, 7, 8]; // 가운데 누름: 4,1,3,5,7 뒤집힘
    const rules = [
        ['칸을 누르면', '누른 칸과 상하좌우 칸의 불이 뒤집혀요 (켜짐 ⇄ 꺼짐)'],
        ['모든 불을 끄면 클리어', '★★★ = AI가 찾은 최소 횟수 이내 · ★★ = +2회 이내'],
        ['AI 힌트 · AI 풀이', '힌트: 누를 칸 하나 (최대 ★★) · 풀이: 남은 칸 전부 표시 (★)'],
        ['AI 대전 · 2인 대전', '같은 판을 먼저 끄면 라운드 승리 — 3판 2선승'],
        ['조작', '마우스 클릭 · P1: WASD+스페이스 · P2: 방향키+엔터'],
        ['단축키', 'R 다시하기 · H 힌트 · ESC 메뉴로'],
    ];
    return `${bgBase(5, 20)}${heading('HOW TO PLAY', '게임 방법', 8)}
${panel(18, 50, 150, 176)}
<div class="abs" style="left:18px;top:58px;width:150px;text-align:center;font-size:8px;font-weight:700;color:${C.muted}">가운데 칸을 누르면?</div>
<div class="abs" style="left:32px;top:74px">${miniGrid(3, before, 16, C.warm, 3)}</div>
<div class="abs" style="left:48px;top:86px;width:22px;height:22px;border-radius:50%;border:1.5px dashed ${C.p1}"></div>
<div class="abs c" style="left:84px;top:84px;width:20px;height:20px;font-size:14px;color:${C.muted}">→</div>
<div class="abs" style="left:106px;top:74px">${miniGrid(3, after, 16, C.warm, 3)}</div>
<div class="abs" style="left:26px;top:138px;width:134px;font-size:7px;line-height:1.55;color:#c7d0ee">
<b style="color:${C.ai}">AI는 어떻게 풀까?</b><br>누르는 순서는 상관없고, 같은 칸을 두 번 누르면 원래대로예요. 그래서 판 전체는 <b>0과 1의 연립방정식(mod 2)</b>이 돼요. AI는 가우스 소거법으로 해를 구한 뒤, 누름 수가 <b>가장 적은 해</b>를 골라요.</div>
${panel(178, 50, 286, 176)}
<div class="abs" style="left:190px;top:60px;width:266px">
${rules.map(([h, t], k) => `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:5.2px">
 <div class="mono c" style="flex:none;width:15px;height:15px;border-radius:4px;background:#1c2750;border:1px solid ${C.line2};font-size:7.5px;color:${C.warm}">${k + 1}</div>
 <div><div style="font-size:8.5px;font-weight:700">${h}</div><div style="font-size:7px;color:${C.muted};margin-top:1px">${t}</div></div></div>`).join('')}
</div>`;
}
function skinHTML() {
    return `${bgBase(9, 24)}${heading('SKINS', '전구 스킨', 8)}
<div class="abs" style="left:0;right:0;top:48px;text-align:center;font-size:8px;color:${C.muted}">퍼즐 모드에서 모은 별(★)로 새 스킨이 열려요 · 모든 모드에 적용</div>`;
}
function stagesHTML() {
    const rows = [['3×3', 'CH.1 입문'], ['4×4', 'CH.2 도전'], ['5×5', 'CH.3 달인']];
    return `${bgBase(21, 22)}${heading('STAGE SELECT', '스테이지 선택', 8)}
${rows.map(([n, t], k) => `<div class="abs" style="left:4px;top:${sy(L.TILE.rows[k]) - 12}px;width:44px;text-align:center">
<div style="font-size:10px;font-weight:700;color:${C.warm}">${n}</div><div style="font-size:6px;color:${C.muted};margin-top:1px">${t}</div></div>`).join('')}
<div class="abs" style="left:0;right:0;bottom:10px;text-align:center;font-size:7px;color:${C.muted}">★★★ = AI가 찾은 최소 횟수로 클리어 · 이전 스테이지를 깨면 다음 스테이지가 열려요</div>`;
}
function topBar(label, color) {
    return `<div class="abs" style="left:0;top:0;width:480px;height:22px;background:linear-gradient(180deg,#0e1530,#0b1126cc);border-bottom:1px solid ${C.line}"></div>
<div class="abs" style="left:10px;top:4px;font-family:SG;font-weight:700;font-size:10px;letter-spacing:1px;color:#fff3c8;text-shadow:0 0 6px ${C.warm2}">LIGHTS <span style="color:transparent;-webkit-text-stroke:.7px #6a76a0">OUT</span></div>
<div class="abs mono" style="left:84px;top:7.5px;font-size:6.5px;letter-spacing:2px;color:${color}">${label}</div>`;
}
function puzzleHTML() {
    const px0 = sx(L.PX - 94);
    return `${bgBase(4, 18)}${topBar('PUZZLE MODE', C.warm)}${boardFrame(L.BOARD.puzzle)}
${panel(px0, 30, 188, 232)}
<div class="abs" style="left:${sx(L.TEXT.moves.x) - 42}px;top:${sy(52)}px;width:84px;text-align:center;font-size:6.5px;color:${C.muted};letter-spacing:1px">이동 횟수</div>
<div class="abs" style="left:${sx(L.TEXT.par.x) - 42}px;top:${sy(52)}px;width:84px;text-align:center;font-size:6.5px;color:${C.ai};letter-spacing:1px">AI 최소 횟수</div>
<div class="abs" style="left:${px0 + 10}px;top:${sy(12)}px;width:168px;height:1px;background:${C.line}"></div>
<div class="abs" style="left:${px0 + 10}px;top:${sy(-8)}px;width:168px;height:1px;background:${C.line}"></div>
<div class="abs" style="left:${px0 + 8}px;top:${sy(-9)}px;width:172px;height:30px;border-radius:7px;background:#1a1440aa;border:1px solid ${C.ai}40"></div>`;
}
function vssetHTML(mode) {
    const isAI = mode === 'ai';
    const color = isAI ? C.ai : C.p2;
    const keycap = (t, w = 13) => `<span class="mono c" style="display:inline-flex;min-width:${w}px;height:13px;padding:0 2px;border-radius:3px;background:#1d2750;border:1px solid ${C.line2};border-bottom-width:2px;font-size:6.5px;color:${C.text};margin:0 1px">${t}</span>`;
    const pvpKeys = `
<div class="abs" style="left:48px;top:${sy(58)}px;width:180px;height:50px;border-radius:9px;background:${C.p1}12;border:1px solid ${C.p1}55;padding:6px 8px">
 <div style="font-size:8px;font-weight:700;color:${C.p1}">PLAYER 1 · 왼쪽 판</div>
 <div style="margin-top:6px">${keycap('W')}${keycap('A')}${keycap('S')}${keycap('D')} <span style="font-size:6.5px;color:${C.muted}">이동</span> &nbsp;${keycap('SPACE', 32)} <span style="font-size:6.5px;color:${C.muted}">누르기</span></div></div>
<div class="abs" style="left:252px;top:${sy(58)}px;width:180px;height:50px;border-radius:9px;background:${C.p2}12;border:1px solid ${C.p2}55;padding:6px 8px">
 <div style="font-size:8px;font-weight:700;color:${C.p2}">PLAYER 2 · 오른쪽 판</div>
 <div style="margin-top:6px">${keycap('↑')}${keycap('←')}${keycap('↓')}${keycap('→')} <span style="font-size:6.5px;color:${C.muted}">이동</span> &nbsp;${keycap('ENTER', 32)} <span style="font-size:6.5px;color:${C.muted}">누르기</span></div></div>`;
    return `${bgBase(isAI ? 13 : 17, 26)}
<div class="abs" style="left:0;right:0;top:12px;text-align:center">
 <div class="mono" style="font-size:7px;letter-spacing:3px;color:${color}">${isAI ? '1P VS AI' : '1P VS 2P'}</div>
 <div style="font-size:17px;font-weight:900;margin-top:1px">${isAI ? 'AI 대전' : '2인 대전'}</div>
 <div style="font-size:7.5px;color:${C.muted};margin-top:3px">두 판에 똑같은 퍼즐 — 먼저 모든 불을 끄면 라운드 승리 · 3판 2선승</div></div>
<div class="abs" style="left:0;right:0;top:${sy(64)}px;text-align:center;font-size:7px;letter-spacing:2px;color:${C.muted}" class="mono">${isAI ? 'AI 난이도' : '조작 방법'}</div>
${isAI ? '' : pvpKeys}
<div class="abs" style="left:0;right:0;top:${sy(-10)}px;text-align:center;font-size:7px;letter-spacing:2px;color:${C.muted}">판 크기</div>
<div class="abs" style="left:0;right:0;bottom:6px;text-align:center;font-size:6.5px;color:${C.dim}">${isAI ? 'AI는 매 수마다 판을 다시 풀어 최소 해 중 한 칸을 눌러요 (난이도가 낮으면 가끔 실수해요) · 마우스 · WASD/방향키 + 스페이스/엔터' : '마우스로도 누를 수 있어요 · 같은 판에서 시작하니 공정한 대결!'}</div>`;
}
function raceHTML() {
    return `${bgBase(8, 18)}${topBar('VERSUS', C.p2)}${boardFrame(L.BOARD.race1, C.p1)}${boardFrame(L.BOARD.race2, C.p2)}
<div class="abs" style="left:${sx(-50)}px;top:${sy(118) + 2}px;width:100px;height:36px;border-radius:0 0 12px 12px;background:linear-gradient(180deg,#141d3c,#0e1530);border:1px solid ${C.line2};border-top:none"></div>
<div class="abs" style="left:${sx(-27)}px;top:${sy(-33)}px;width:54px;height:16px;border-radius:8px;background:#0e1530;border:1px solid ${C.line2}"></div>`;
}

// ---------------------------------------------------------------------------
// 칸 / 표시 / 커서 / 별
// ---------------------------------------------------------------------------
function cellHTML(skin, on) {
    const S = 64;
    const t = 'position:absolute;left:3px;top:3px;width:58px;height:58px;border-radius:12px';
    if (skin === 1) {
        return on
            ? `<div style="${t};background:radial-gradient(circle at 50% 42%,#fff7cf 0%,#ffd75e 30%,#f5a524 70%,#c9770f 100%);box-shadow:inset 0 -3px 0 #0003,inset 0 2px 0 #fff8,inset 0 0 10px #fff3"></div>
<div class="abs c" style="left:0;top:0;width:${S}px;height:${S}px">${bulbSVG(40, true, '#fff3b0')}</div>`
            : `<div style="${t};background:linear-gradient(160deg,#1b2548,#121a35);border:1.5px solid #2b3766;box-shadow:inset 0 -3px 0 #0005"></div>
<div class="abs c" style="left:0;top:0;width:${S}px;height:${S}px;opacity:.9">${bulbSVG(36, false)}</div>`;
    }
    if (skin === 2) {
        return on
            ? `<div style="${t};background:#0b2438;border:3px solid #7ff0ff;box-shadow:inset 0 0 14px #4fd6ffaa"></div>
<div class="abs" style="left:17px;top:17px;width:30px;height:30px;border-radius:7px;background:#b8f8ff;box-shadow:0 0 12px #4fd6ff,0 0 4px #fff"></div>`
            : `<div style="${t};background:#0d1428;border:2px solid #22405a"></div>
<div class="abs" style="left:18px;top:18px;width:28px;height:28px;border-radius:7px;border:1.5px solid #24425c"></div>`;
    }
    return on
        ? `<div style="${t};background:radial-gradient(circle at 50% 45%,#ffd2ec 0%,#ff7ac0 45%,#8a4dff 100%);box-shadow:inset 0 2px 0 #fff6,inset 0 0 10px #fff3"></div>
<div class="abs c" style="left:0;top:0;width:${S}px;height:${S}px">${starSVG(40, true, '#fff4fb')}</div>`
        : `<div style="${t};background:linear-gradient(160deg,#1e1a44,#141231);border:1.5px solid #342f66"></div>
<div class="abs c" style="left:0;top:0;width:${S}px;height:${S}px">${starSVG(34, false)}</div>`;
}
function markHTML() {
    // AI 풀이 표시: 칸 가운데 보라색 표적
    return `<div class="abs c" style="left:0;top:0;width:64px;height:64px"><div style="width:26px;height:26px;border-radius:50%;border:3px solid #fff;background:${C.ai};box-shadow:0 0 0 3px ${C.ai}88,0 0 12px ${C.ai}"></div></div>`;
}
function hintHTML() {
    return `<div class="abs" style="left:2px;top:2px;width:60px;height:60px;border-radius:14px;border:4px solid ${C.ai};box-shadow:0 0 10px ${C.ai},inset 0 0 10px ${C.ai}"></div>
<div class="abs mono c" style="left:40px;top:1px;width:22px;height:13px;border-radius:5px;background:${C.ai};font-size:8px;font-weight:700;color:#1a0d38">AI</div>`;
}
function cursorHTML(color, label) {
    const arm = 'position:absolute;width:16px;height:16px;border-color:' + color + ';border-style:solid;';
    return `<div style="${arm}left:0;top:0;border-width:4px 0 0 4px;border-radius:9px 0 0 0;filter:drop-shadow(0 0 3px ${color})"></div>
<div style="${arm}right:0;top:0;border-width:4px 4px 0 0;border-radius:0 9px 0 0;filter:drop-shadow(0 0 3px ${color})"></div>
<div style="${arm}left:0;bottom:0;border-width:0 0 4px 4px;border-radius:0 0 0 9px;filter:drop-shadow(0 0 3px ${color})"></div>
<div style="${arm}right:0;bottom:0;border-width:0 4px 4px 0;border-radius:0 0 9px 0;filter:drop-shadow(0 0 3px ${color})"></div>
<div class="abs mono c" style="left:1px;bottom:1px;width:20px;height:11px;border-radius:0 5px 0 7px;background:${color};font-size:7px;font-weight:700;color:#0b0f20">${label}</div>`;
}
function starsHTML(n) {
    return `<div class="c" style="width:34px;height:12px;gap:0">${[0, 1, 2].map((k) => starSVG(11, k < n)).join('')}</div>`;
}
function lockHTML() {
    return `<div class="c" style="width:34px;height:12px"><svg width="10" height="11" viewBox="0 0 10 11"><rect x="1" y="4.6" width="8" height="6" rx="1.4" fill="#56628a"/><path d="M3 4.8V3.3a2 2 0 0 1 4 0v1.5" stroke="#56628a" stroke-width="1.3" fill="none"/></svg></div>`;
}

// ---------------------------------------------------------------------------
// 버튼
// ---------------------------------------------------------------------------
function buttonHTML(b, active) {
    const w = b.w;
    const h = b.h;
    if (b.kind === 'card') {
        const lits = { puzzle: [0, 2, 4, 6, 8], ai: [1, 3, 4, 5, 7], pvp: [0, 1, 3, 4] };
        let icon = '';
        if (b.icon === 'puzzle') {
            icon = miniGrid(3, lits.puzzle, 9, b.color, 2);
        } else if (b.icon === 'ai') {
            icon = `<div class="c" style="gap:4px">${miniGrid(2, [0, 3], 8, C.p1, 2)}<span style="font-size:8px;color:${C.muted};font-weight:700">VS</span>${chipSVG(24, b.color)}</div>`;
        } else {
            icon = `<div class="c" style="gap:4px">${miniGrid(2, [0, 3], 8, C.p1, 2)}<span style="font-size:8px;color:${C.muted};font-weight:700">VS</span>${miniGrid(2, [1, 2], 8, C.p2, 2)}</div>`;
        }
        return `<div style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;border-radius:12px;background:linear-gradient(170deg,#1a2449,#10172f 70%);border:1px solid ${b.color}66;box-shadow:0 8px 22px #000b,inset 0 1px 0 #ffffff14,inset 0 0 26px ${b.color}14;overflow:hidden">
<div style="position:absolute;left:0;top:0;right:0;height:3px;background:${b.color};box-shadow:0 0 10px ${b.color}"></div>
<div class="c" style="position:absolute;left:0;right:0;top:11px;height:32px">${icon}</div>
<div class="mono" style="position:absolute;left:0;right:0;top:46px;text-align:center;font-size:6px;letter-spacing:1.6px;color:${b.color}">${b.tag}</div>
<div style="position:absolute;left:0;right:0;top:54px;text-align:center;font-size:12.5px;font-weight:900">${b.label}</div>
<div style="position:absolute;left:0;right:0;top:72px;text-align:center;font-size:6.3px;line-height:1.45;color:${C.muted}">${b.desc.join('<br>')}</div></div>`;
    }
    if (b.kind === 'tile') {
        const k = b.stage;
        const n = k <= 10 ? 3 : k <= 20 ? 4 : 5;
        return `<div style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;border-radius:8px;background:linear-gradient(170deg,#1c2750,#121a36);border:1px solid ${active ? C.warm : C.line2};box-shadow:0 3px 8px #0009,inset 0 1px 0 #ffffff12">
<div class="c" style="position:absolute;left:0;right:0;top:2px;height:17px;font-family:SG;font-weight:700;font-size:12px;color:${n === 3 ? '#fff0b8' : n === 4 ? '#ffe08a' : '#ffc94a'}">${k}</div></div>`;
    }
    if (b.kind === 'skincard') {
        const s = b.skin;
        const state = active === 'locked' ? 'locked' : active ? 'selected' : 'open';
        const border = state === 'selected' ? C.warm : C.line2;
        const cells = [1, 0, 1, 0, 1, 0, 1, 0, 1]
            .map((on, i) => `<div style="position:absolute;left:${(i % 3) * 25}px;top:${Math.floor(i / 3) * 25}px;width:64px;height:64px;transform:scale(.36);transform-origin:0 0">${cellHTML(s.id, on)}</div>`).join('');
        const foot = state === 'selected'
            ? `<div class="c" style="height:18px;border-radius:9px;background:${C.warm};color:#2a1a00;font-size:7.5px;font-weight:900">✓ 사용 중</div>`
            : state === 'open'
                ? `<div class="c" style="height:18px;border-radius:9px;border:1px solid ${C.line2};background:#1c2750;font-size:7.5px;font-weight:700">선택하기</div>`
                : `<div class="c" style="height:18px;border-radius:9px;background:#141a33;color:${C.muted};font-size:7.5px;font-weight:700;gap:3px">${lockHTML().replace('width:34px', 'width:10px')} ★ ${s.need} 필요</div>`;
        return `<div style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;border-radius:12px;background:linear-gradient(170deg,#1a2449,#10172f);border:1.5px solid ${border};box-shadow:0 8px 20px #000b${state === 'selected' ? `,0 0 14px ${C.warm}55` : ''}">
<div style="position:absolute;left:${(w - 73) / 2}px;top:12px;width:73px;height:73px;${state === 'locked' ? 'filter:grayscale(.8) brightness(.55)' : ''}">${cells}</div>
<div style="position:absolute;left:0;right:0;top:90px;text-align:center;font-size:10px;font-weight:900">${s.name}</div>
<div style="position:absolute;left:14px;right:14px;top:104px">${foot}</div></div>`;
    }
    if (b.kind === 'seg' && b.level) {
        const l = b.level;
        return `<div style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;border-radius:10px;background:${active ? `linear-gradient(170deg,${C.ai}44,${C.ai}1a)` : 'linear-gradient(170deg,#1a2449,#121a36)'};border:1.5px solid ${active ? C.ai : C.line2};box-shadow:0 4px 12px #0009${active ? `,0 0 12px ${C.ai}66` : ''}">
<div style="position:absolute;left:0;right:0;top:7px;text-align:center;font-size:11px;font-weight:900;color:${active ? '#fff' : C.text}">${l.name}</div>
<div style="position:absolute;left:0;right:0;top:24px;text-align:center;font-size:6.3px;color:${active ? '#e5dcff' : C.muted}">${l.desc}</div>
<div class="c" style="position:absolute;left:0;right:0;top:33px;gap:2px">${[1, 2, 3].map((k) => `<div style="width:10px;height:3px;border-radius:2px;background:${k <= l.id ? C.ai : '#2a3560'}"></div>`).join('')}</div></div>`;
    }
    let bg;
    let border;
    let color = C.text;
    let shadow = '0 3px 8px #0009';
    if (b.kind === 'primary') {
        bg = `linear-gradient(180deg,#ffe07a,${C.warm2})`;
        border = '#ffe9a8';
        color = '#2a1a00';
        shadow = `0 3px 10px #0009,0 0 12px ${C.warm2}66,inset 0 1px 0 #fff9`;
    } else if (b.kind === 'ai') {
        bg = `linear-gradient(180deg,#3a2a78,#241a50)`;
        border = C.ai;
        shadow = `0 3px 10px #0009,0 0 8px ${C.ai}44,inset 0 1px 0 #ffffff22`;
    } else if (b.kind === 'seg') {
        bg = active ? `linear-gradient(180deg,#ffe07a,${C.warm2})` : 'linear-gradient(180deg,#1c2750,#141c3a)';
        border = active ? '#ffe9a8' : C.line2;
        color = active ? '#2a1a00' : C.text;
    } else {
        bg = 'linear-gradient(180deg,#1c2750,#141c3a)';
        border = C.line2;
    }
    const fsz = Math.min(9, h * 0.42);
    let icon = '';
    if (b.key === 'hint') {
        icon = bulbSVG(12, true, C.warm);
    } else if (b.key === 'solve') {
        icon = chipSVG(12, '#e3d6ff');
    } else if (b.icon === '?') {
        icon = `<span class="c mono" style="width:11px;height:11px;border-radius:50%;background:${C.warm};color:#2a1a00;font-size:7px;font-weight:700">?</span>`;
    } else if (b.icon === '✦') {
        icon = starSVG(11, true);
    }
    return `<div class="c" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;border-radius:${Math.min(8, h / 2)}px;background:${bg};border:1px solid ${border};box-shadow:${shadow};
font-size:${fsz}px;font-weight:${b.kind === 'primary' ? 900 : 700};color:${color};gap:4px;white-space:nowrap">${icon}${b.label}</div>`;
}

// ---------------------------------------------------------------------------
// 오버레이 (480×270)
// ---------------------------------------------------------------------------
const dim = (a = 0.62) => `<div class="abs" style="left:0;top:0;width:480px;height:270px;background:#03050cc0;opacity:${a / 0.75}"></div>`;
function card(w, h, cy, color, inner) {
    return `<div class="abs" style="left:${240 - w / 2}px;top:${sy(cy) - h / 2}px;width:${w}px;height:${h}px;border-radius:16px;background:linear-gradient(170deg,#1c2750f5,#10172ff5);border:1.5px solid ${color};box-shadow:0 0 0 1px #0008,0 16px 40px #000c,0 0 30px ${color}44">${inner}</div>`;
}
function clearHTML(stars) {
    const st = [0, 1, 2].map((k) => `<div style="transform:translateY(${k === 1 ? -6 : 0}px)">${starSVG(k === 1 ? 44 : 36, k < stars)}</div>`).join('');
    return `${dim()}${card(300, 150, 4, C.warm, `
<div class="mono" style="position:absolute;left:0;right:0;top:12px;text-align:center;font-size:7px;letter-spacing:3px;color:${C.warm}">STAGE CLEAR</div>
<div style="position:absolute;left:0;right:0;top:22px;text-align:center;font-size:17px;font-weight:900;text-shadow:0 0 12px ${C.warm2}">모든 불을 껐어요!</div>
<div class="c" style="position:absolute;left:0;right:0;top:48px;height:48px;gap:6px">${st}</div>`)}`;
}
function countHTML(t) {
    const isGo = t === 'GO';
    // GO! 는 대전이 이미 시작된 뒤라 화면을 어둡게 하지 않는다
    return `${isGo ? '' : dim(0.35)}<div class="abs c" style="left:0;top:0;width:480px;height:270px">
<div class="c" style="width:${isGo ? 150 : 96}px;height:96px;border-radius:48px;background:#0b1024e6;border:2px solid ${isGo ? C.ok : C.warm};box-shadow:0 0 30px ${isGo ? C.ok : C.warm2}88;
font-family:SG;font-weight:700;font-size:${isGo ? 50 : 60}px;color:${isGo ? C.ok : '#fff3c8'};text-shadow:0 0 16px ${isGo ? C.ok : C.warm2}">${isGo ? 'GO!' : t}</div></div>`;
}
function roundHTML(who) {
    const color = PLAYER[who === 'you' ? 'p1' : who];
    const label = { p1: 'PLAYER 1', p2: 'PLAYER 2', ai: 'AI', you: 'YOU' }[who];
    const kr = who === 'ai' ? 'AI가 먼저 껐어요' : who === 'you' ? '먼저 껐어요!' : `${label} 라운드 승리!`;
    return `${dim(0.45)}<div class="abs" style="left:0;top:${sy(0) - 34}px;width:480px;height:68px;background:linear-gradient(90deg,transparent,${color}33 20%,${color}44 50%,${color}33 80%,transparent);border-top:1px solid ${color}88;border-bottom:1px solid ${color}88"></div>
<div class="abs" style="left:0;right:0;top:${sy(0) - 26}px;text-align:center">
<div class="mono" style="font-size:8px;letter-spacing:4px;color:${color}">ROUND · ${label}</div>
<div style="font-size:22px;font-weight:900;margin-top:2px;text-shadow:0 0 14px ${color}">${kr}</div></div>`;
}
function matchHTML(who) {
    const map = {
        p1: [C.p1, 'PLAYER 1 WIN', '플레이어 1 승리!'],
        p2: [C.p2, 'PLAYER 2 WIN', '플레이어 2 승리!'],
        win: [C.warm, 'YOU WIN', 'AI를 이겼어요!'],
        lose: [C.ai, 'AI WIN', '아쉽게 졌어요'],
    };
    const [color, en, kr] = map[who];
    const trophy = who === 'lose' ? chipSVG(40, C.ai) : `<svg width="40" height="40" viewBox="0 0 24 24"><path d="M7 3h10v4a5 5 0 0 1-10 0z" fill="${color}"/><path d="M7 4H4a3 3 0 0 0 3 4M17 4h3a3 3 0 0 1-3 4" stroke="${color}" stroke-width="1.4" fill="none"/><rect x="11" y="12" width="2" height="4" fill="${color}"/><rect x="8" y="16" width="8" height="2.6" rx="1" fill="${color}"/></svg>`;
    return `${dim()}${card(320, 160, 10, color, `
<div class="c" style="position:absolute;left:0;right:0;top:12px;height:40px;filter:drop-shadow(0 0 8px ${color})">${trophy}</div>
<div class="mono" style="position:absolute;left:0;right:0;top:55px;text-align:center;font-size:7.5px;letter-spacing:3px;color:${color}">${en}</div>
<div style="position:absolute;left:0;right:0;top:65px;text-align:center;font-size:18px;font-weight:900;text-shadow:0 0 12px ${color}">${kr}</div>`)}`;
}

// ---------------------------------------------------------------------------
// 렌더링
// ---------------------------------------------------------------------------
async function render(outDir) {
    const { chromium } = require('playwright-core');
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 600, height: 400 } });
    // 섬네일(엔트리 오브젝트 목록용)은 1/4 크기로 따로 만든다 — 원본을 그대로 넣으면 .ent 가 두 배로 커진다
    const thumbPage = await browser.newPage({ deviceScaleFactor: 0.5, viewport: { width: 600, height: 400 } });
    fs.mkdirSync(path.join(outDir, 'thumb'), { recursive: true });
    const faces = fontFaces();
    const manifest = {};
    async function shot(name, html, w, h) {
        const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${faces}${BASE_CSS}</style></head>
<body><div id="r" style="display:inline-block;position:relative;width:${w}px;height:${h}px;overflow:hidden">${html}</div></body></html>`;
        for (const [pg, file] of [[page, `${name}.png`], [thumbPage, `thumb/${name}.png`]]) {
            await pg.setContent(doc);
            await pg.evaluate(() => document.fonts.ready);
            const el = await pg.$('#r');
            await el.screenshot({ path: path.join(outDir, file), omitBackground: true });
        }
        manifest[name] = { file: `${name}.png`, thumb: `thumb/${name}.png`, width: w * 2, height: h * 2 };
    }
    // 화면
    await shot('scr_title', titleHTML(), 480, 270);
    await shot('scr_help', helpHTML(), 480, 270);
    await shot('scr_skin', skinHTML(), 480, 270);
    await shot('scr_stages', stagesHTML(), 480, 270);
    await shot('scr_puzzle', puzzleHTML(), 480, 270);
    await shot('scr_vsset_ai', vssetHTML('ai'), 480, 270);
    await shot('scr_vsset_pvp', vssetHTML('pvp'), 480, 270);
    await shot('scr_race', raceHTML(), 480, 270);
    // 칸 · 표시 · 커서 · 별
    for (const s of [1, 2, 3]) {
        await shot(`c${s}_0`, cellHTML(s, false), 64, 64);
        await shot(`c${s}_1`, cellHTML(s, true), 64, 64);
    }
    await shot('mark', markHTML(), 64, 64);
    await shot('hint', hintHTML(), 64, 64);
    await shot('cur_p1', cursorHTML(C.p1, 'P1'), 64, 64);
    await shot('cur_p2', cursorHTML(C.p2, 'P2'), 64, 64);
    await shot('cur_ai', cursorHTML(C.ai, 'AI'), 64, 64);
    for (let n = 0; n <= 3; n++) {
        await shot(`stars${n}`, starsHTML(n), 34, 12);
    }
    await shot('lock', lockHTML(), 34, 12);
    // 버튼 (b{id}: 보통, b{id}a: 선택됨, b{id}l: 잠김)
    for (const b of L.BUTTONS) {
        await shot(`b${b.id}`, buttonHTML(b, false), b.w, b.h);
        if (b.kind === 'seg' || b.kind === 'tile' || b.kind === 'skincard') {
            await shot(`b${b.id}a`, buttonHTML(b, true), b.w, b.h);
        }
        if (b.kind === 'skincard') {
            await shot(`b${b.id}l`, buttonHTML(b, 'locked'), b.w, b.h);
        }
    }
    // 오버레이
    for (const n of [1, 2, 3]) {
        await shot(`ov_clear${n}`, clearHTML(n), 480, 270);
    }
    for (const t of ['3', '2', '1', 'GO']) {
        await shot(`ov_c${t}`, countHTML(t), 480, 270);
    }
    for (const w of ['p1', 'p2', 'you', 'ai']) {
        await shot(`ov_r_${w}`, roundHTML(w), 480, 270);
    }
    for (const w of ['p1', 'p2', 'win', 'lose']) {
        await shot(`ov_m_${w}`, matchHTML(w), 480, 270);
    }
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
    await browser.close();
    return manifest;
}

module.exports = { render, C };

if (require.main === module) {
    render(process.argv[2] || 'assets/lights_out').then((m) => console.log('rendered', Object.keys(m).length, 'images'));
}
