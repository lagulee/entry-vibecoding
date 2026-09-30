'use strict';
/**
 * HEX — 그림 에셋 생성기
 * HTML/SVG 로 그린 뒤 Chromium(playwright-core)으로 2배 해상도 PNG 를 만든다.
 * 사용: node tools/hex_art.js <출력폴더>
 */
const fs = require('fs');
const path = require('path');
const L = require('./hex_layout');

const CHROME = process.env.GL_CHROMIUM || '/opt/pw-browsers/chromium';
const fontPath = (file) => {
    const fam = file.replace(/-(latin|korean)-\d+-normal\.woff2$/, '');
    return path.join(__dirname, '..', 'node_modules', '@fontsource', fam, 'files', file);
};

const C = {
    bg0: '#070b16', bg1: '#0e1530', panel: '#121a33', panel2: '#18223f', line: '#26315a', line2: '#34427a',
    text: '#eef2ff', muted: '#8f9bc4', dim: '#56628c',
    red: '#ff4d64', redL: '#ff97a4', redD: '#b8163a',
    blue: '#3b9dff', blueL: '#98cfff', blueD: '#1553b8',
    gold: '#ffd166', tile: '#1d2645', tileL: '#2a3560', tileD: '#141b33',
};

function fontFaces() {
    const f = (fam, file, w) => {
        const p = fontPath(file);
        if (!fs.existsSync(p)) {
            return '';
        }
        return `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}) format('woff2');font-weight:${w};}`;
    };
    return [
        f('SG', 'space-grotesk-latin-500-normal.woff2', 500),
        f('SG', 'space-grotesk-latin-700-normal.woff2', 700),
        f('KR', 'noto-sans-kr-korean-400-normal.woff2', 400),
        f('KR', 'noto-sans-kr-korean-700-normal.woff2', 700),
        f('KR', 'noto-sans-kr-korean-900-normal.woff2', 900),
        f('KRL', 'noto-sans-kr-latin-700-normal.woff2', 700),
        f('JUA', 'jua-korean-400-normal.woff2', 400),
        f('JUA', 'jua-latin-400-normal.woff2', 400),
        f('KRL', 'noto-sans-kr-latin-900-normal.woff2', 900),
    ].join('\n');
}
const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
body{font-family:'KRL','KR','WenQuanYi Zen Hei',sans-serif;color:${C.text};-webkit-font-smoothing:antialiased}
.sg{font-family:'SG','KR',sans-serif}
`;

const sx = (x) => x + 240;
const sy = (y) => 135 - y;
const SQ3 = Math.sqrt(3);

// ---------- 육각형 도우미 (뾰족한 위쪽) ----------
function hexPts(cx, cy, R) {
    const p = [];
    for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 180) * (-90 + 60 * k);
        p.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    return p;
}
const ptsStr = (p) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

// 배경 무늬: 흐린 육각 격자 + 빛 번짐
function hexPatternSVG(w, h, R = 16, opacity = 0.07, seed = 3) {
    let s = '';
    const dx = SQ3 * R;
    const dy = 1.5 * R;
    let sd = seed;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let row = -1; row * dy < h + R; row++) {
        for (let col = -1; col * dx < w + dx; col++) {
            const cx = col * dx + (row % 2 ? dx / 2 : 0);
            const cy = row * dy;
            const o = opacity * (0.5 + rnd());
            s += `<polygon points="${ptsStr(hexPts(cx, cy, R - 0.8))}" fill="none" stroke="#9fb3ff" stroke-opacity="${o.toFixed(3)}" stroke-width="0.7"/>`;
            if (rnd() < 0.035) {
                const col2 = rnd() < 0.5 ? C.red : C.blue;
                s += `<polygon points="${ptsStr(hexPts(cx, cy, R - 2.5))}" fill="${col2}" fill-opacity="${(0.05 + rnd() * 0.08).toFixed(3)}"/>`;
            }
        }
    }
    return `<svg width="${w}" height="${h}" style="position:absolute;left:0;top:0">${s}</svg>`;
}
function shell(inner, glow = true) {
    return `<div style="width:480px;height:270px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#18234a 0%,#0c1330 55%,#060913 100%)">
${hexPatternSVG(480, 270)}
${glow ? `<div style="position:absolute;left:-80px;top:40px;width:260px;height:260px;border-radius:50%;background:radial-gradient(${C.red}33,transparent 65%)"></div>
<div style="position:absolute;right:-80px;top:-60px;width:260px;height:260px;border-radius:50%;background:radial-gradient(${C.blue}33,transparent 65%)"></div>` : ''}
${inner}</div>`;
}

// ---------- 돌 ----------
function stoneSVG(color, light, dark, size, opts = {}) {
    const r = size * 0.39;
    const c = size / 2;
    const id = Math.random().toString(36).slice(2, 7);
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs>
<radialGradient id="g${id}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
<radialGradient id="h${id}" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
</defs>
${opts.glow ? `<circle cx="${c}" cy="${c}" r="${size / 2}" fill="url(#h${id})"/>` : ''}
<ellipse cx="${c}" cy="${c + r * 0.12}" rx="${r}" ry="${r}" fill="#000" opacity="${opts.alpha ? 0 : 0.35}"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g${id})" opacity="${opts.alpha || 1}" ${opts.glow ? `stroke="#fff" stroke-width="${size * 0.03}" stroke-opacity=".9"` : `stroke="${dark}" stroke-width="${size * 0.012}"`}/>
<ellipse cx="${c - r * 0.28}" cy="${c - r * 0.38}" rx="${r * 0.42}" ry="${r * 0.24}" fill="#fff" opacity="${0.45 * (opts.alpha || 1)}" transform="rotate(-25 ${c - r * 0.28} ${c - r * 0.38})"/>
</svg>`;
}
// 칸 강조(마우스 올림): 밝은 육각 테두리 + 반투명 돌
function hoverSVG(color, light, dark, size) {
    const w = L.STONE_BASE;
    const R = L.R_OF(w);
    const k = size / (w * 1.2);
    const c = size / 2;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute;left:0;top:0">
<polygon points="${ptsStr(hexPts(c, c, (R - 1.2) * k))}" fill="${color}" fill-opacity=".16" stroke="${light}" stroke-width="${1.6 * k}" stroke-opacity=".9"/></svg>
<div style="position:absolute;left:0;top:0;opacity:.55">${stoneSVG(color, light, dark, size)}</div>`;
}
function hintSVG(size) {
    const w = L.STONE_BASE;
    const R = L.R_OF(w);
    const k = size / (w * 1.2);
    const c = size / 2;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><filter id="hg"><feGaussianBlur stdDeviation="1.4"/></filter></defs>
<polygon points="${ptsStr(hexPts(c, c, (R - 1.5) * k))}" fill="none" stroke="${C.gold}" stroke-width="${3 * k}" filter="url(#hg)"/>
<polygon points="${ptsStr(hexPts(c, c, (R - 1.5) * k))}" fill="${C.gold}" fill-opacity=".18" stroke="#fff3c4" stroke-width="${1.3 * k}"/>
<text x="${c}" y="${c + size * 0.1}" font-size="${size * 0.3}" text-anchor="middle" fill="#fff3c4" font-family="SG" font-weight="700">?</text></svg>`;
}
function markerSVG(size) {
    const c = size / 2;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<circle cx="${c}" cy="${c}" r="${size * 0.1}" fill="${C.gold}" stroke="#3a2a00" stroke-width="${size * 0.02}"/>
<circle cx="${c}" cy="${c}" r="${size * 0.17}" fill="none" stroke="${C.gold}" stroke-width="${size * 0.025}" opacity=".7"/></svg>`;
}

// ---------- 보드 ----------
const BOARD_IMG = { w: 380, h: 250 };
function boardHTML(N) {
    const w = L.CELL_W[N];
    const R = L.R_OF(w);
    const W = BOARD_IMG.w;
    const H = BOARD_IMG.h;
    const cxOf = (r, q) => W / 2 + (q - (N - 1) / 2 + (r - (N - 1) / 2) / 2) * w;
    const cyOf = (r, q) => H / 2 + (r - (N - 1) / 2) * 1.5 * R;
    // 판(받침): 바깥 칸들을 크게 그려 둥근 받침 모양을 만든다
    let plate = '';
    let tiles = '';
    let edges = '';
    let coords = '';
    for (let r = 0; r < N; r++) {
        for (let q = 0; q < N; q++) {
            const x = cxOf(r, q);
            const y = cyOf(r, q);
            plate += `<polygon points="${ptsStr(hexPts(x, y, R + 5.5))}" fill="#0d1328" stroke="#0d1328" stroke-width="3" stroke-linejoin="round"/>`;
            tiles += `<polygon points="${ptsStr(hexPts(x, y, R - 1.1))}" fill="url(#tile)" stroke="#3a4777" stroke-width="0.7"/>`;
            tiles += `<polygon points="${ptsStr(hexPts(x, y - 0.4, R - 2.6))}" fill="none" stroke="#ffffff" stroke-opacity=".05" stroke-width="0.8"/>`;
            // 바깥 변 색칠
            const P = hexPts(x, y, R + 1.6);
            const E = [[-1, 1], [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0]];
            E.forEach(([dr, dq], k) => {
                const rr = r + dr;
                const qq = q + dq;
                if (rr >= 0 && rr < N && qq >= 0 && qq < N) {
                    return;
                }
                const col = rr < 0 || rr >= N ? C.blue : C.red;
                const [a, b] = [P[k], P[(k + 1) % 6]];
                edges += `<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" stroke="${col}" stroke-width="4.2" stroke-linecap="round"/>`;
            });
        }
    }
    // 좌표 표시 (열 A.., 행 1..)
    const fsz = Math.max(6, w * 0.2);
    for (let q = 0; q < N; q++) {
        coords += `<text x="${cxOf(0, q).toFixed(1)}" y="${(cyOf(0, q) - R - 9).toFixed(1)}" font-size="${fsz}" fill="${C.muted}" text-anchor="middle" font-family="SG" font-weight="700">${String.fromCharCode(65 + q)}</text>`;
    }
    for (let r = 0; r < N; r++) {
        coords += `<text x="${(cxOf(r, 0) - w / 2 - 10).toFixed(1)}" y="${(cyOf(r, 0) + fsz * 0.35).toFixed(1)}" font-size="${fsz}" fill="${C.muted}" text-anchor="middle" font-family="SG" font-weight="700">${r + 1}</text>`;
    }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>
<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.tileL}"/><stop offset="1" stop-color="${C.tile}"/></linearGradient>
<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity=".6"/></filter>
</defs>
<g filter="url(#sh)">${plate}</g>
<g filter="url(#glow)">${edges}</g>
${tiles}
${coords}
</svg>`;
}

// ---------- 게임 배경 (오른쪽 패널 포함) ----------
function gameBgHTML() {
    const P = L.PANEL;
    const px = sx(P.x - P.w / 2);
    return shell(`
<div style="position:absolute;left:${px}px;top:6px;width:${P.w}px;height:258px;border-radius:10px;background:linear-gradient(180deg,rgba(24,34,66,.92),rgba(14,20,42,.92));border:1px solid ${C.line2};box-shadow:0 4px 14px rgba(0,0,0,.45)"></div>
<div style="position:absolute;left:${px + 9}px;top:11px;display:flex;align-items:center;gap:4px">
  ${logoMarkSVG(13)}
  <div class="sg" style="font-size:11px;font-weight:700;letter-spacing:2px">HEX</div>
</div>
<div style="position:absolute;left:${px + 8}px;top:${sy(46)}px;width:${P.w - 16}px;height:1px;background:${C.line}"></div>
<div style="position:absolute;left:${px + 8}px;top:${sy(-1)}px;width:${P.w - 16}px;height:1px;background:${C.line}"></div>
<div style="position:absolute;left:${px + 8}px;top:${sy(-46)}px;width:${P.w - 16}px;height:1px;background:${C.line}"></div>
<div style="position:absolute;left:${px + 9}px;top:${sy(43)}px;font-size:6.5px;color:${C.muted};font-weight:700;letter-spacing:1px">플레이어</div>
<div style="position:absolute;left:${px + 9}px;top:${sy(-3)}px;font-size:6.5px;color:${C.muted};font-weight:700;letter-spacing:1px">전적</div>
<div style="position:absolute;left:${sx(-235)}px;top:${sy(-124)}px;font-size:6.5px;color:${C.dim}">빨강은 <span style="color:${C.red}">왼쪽↔오른쪽</span>, 파랑은 <span style="color:${C.blue}">위↔아래</span> 를 먼저 이으면 승리</div>
`, true);
}
function logoMarkSVG(s) {
    const c = s / 2;
    const R = s / 2 - 0.5;
    const p = hexPts(c, c, R);
    return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
<polygon points="${ptsStr([p[5], p[0], p[1], [c, c]])}" fill="${C.blue}"/>
<polygon points="${ptsStr([p[2], p[3], p[4], [c, c]])}" fill="${C.blue}"/>
<polygon points="${ptsStr([p[1], p[2], [c, c]])}" fill="${C.red}"/>
<polygon points="${ptsStr([p[4], p[5], [c, c]])}" fill="${C.red}"/>
<polygon points="${ptsStr(hexPts(c, c, R * 0.42))}" fill="#0c1330"/></svg>`;
}

// ---------- 타이틀 ----------
// 타이틀(= 작품 썸네일): 종이 위에 놓인 실제 보드게임 느낌. 광택·네온 없이 평면 색 + 굵은 외곽선
const PAPER = { bg: '#f2e8d2', ink: '#2e2620', tile: '#fbf5e6', tileLine: '#2e2620', red: '#e2493f', redD: '#a8302a', blue: '#2f7fd1', blueD: '#1f5a98', tan: '#d9c9a6' };
function titleHTML() {
    const P = PAPER;
    let sd = 11;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    // 종이 결 + 연한 육각 무늬
    let bgHex = '';
    const R0 = 15;
    for (let row = -1; row < 13; row++) {
        for (let col = -1; col < 20; col++) {
            const cx = col * SQ3 * R0 + (row % 2 ? SQ3 * R0 / 2 : 0);
            const cy = row * 1.5 * R0;
            bgHex += `<polygon points="${ptsStr(hexPts(cx, cy, R0 - 1))}" fill="none" stroke="${P.tan}" stroke-width=".7" opacity="${(0.35 + rnd() * 0.3).toFixed(2)}"/>`;
        }
    }
    // 보드 (6×6, 살짝 기울임)
    const N = 6;
    const w = 23.5;
    const R = w / SQ3;
    const X = 142;
    const Y = 136;
    const red = new Set(['3,0', '3,1', '2,2', '2,3', '3,3', '2,4', '1,5']);
    const blue = new Set(['0,2', '1,1', '1,2', '4,1', '4,2', '5,0', '0,4']);
    let tiles = '';
    let edges = '';
    let stones = '';
    const E = [[-1, 1], [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0]];
    for (let r = 0; r < N; r++) {
        for (let q = 0; q < N; q++) {
            const x = X + (q - (N - 1) / 2 + (r - (N - 1) / 2) / 2) * w;
            const y = Y + (r - (N - 1) / 2) * 1.5 * R;
            tiles += `<polygon points="${ptsStr(hexPts(x, y, R))}" fill="${P.tile}" stroke="${P.tileLine}" stroke-width="1.3" stroke-linejoin="round"/>`;
            const pts = hexPts(x, y, R + 2.2);
            E.forEach(([dr, dq], k) => {
                const rr = r + dr;
                const qq = q + dq;
                if (rr >= 0 && rr < N && qq >= 0 && qq < N) {
                    return;
                }
                const col = rr < 0 || rr >= N ? P.blue : P.red;
                const [a, b2] = [pts[k], pts[(k + 1) % 6]];
                edges += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b2[0].toFixed(1)}" y2="${b2[1].toFixed(1)}" stroke="${col}" stroke-width="5" stroke-linecap="round"/>`;
            });
            const key = `${r},${q}`;
            if (red.has(key) || blue.has(key)) {
                const c = red.has(key) ? [P.red, P.redD] : [P.blue, P.blueD];
                // 손으로 놓은 듯 조금씩 어긋나게
                const ox = (rnd() - 0.5) * 1.6;
                const oy = (rnd() - 0.5) * 1.6;
                stones += flatStone(x + ox, y + oy, R * 0.66, c[0], c[1]);
            }
        }
    }
    // 판 밖에 굴러다니는 돌
    stones += flatStone(30, 236, 9, P.red, P.redD) + flatStone(50, 249, 9, P.red, P.redD) + flatStone(262, 236, 9, P.blue, P.blueD);
    const underline = 'M292 124 C 330 119, 380 127, 452 120';
    return `<div style="width:480px;height:270px;position:relative;overflow:hidden;background:${P.bg}">
<svg width="480" height="270" style="position:absolute;left:0;top:0"><defs>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .25  0 0 0 0 .18  0 0 0 .09 0"/></filter>
</defs>
${bgHex}
<rect width="480" height="270" filter="url(#grain)"/>
<g transform="rotate(-6 ${X} ${Y})">
  <g transform="translate(3 4)" opacity=".18">${tiles.replace(/fill="[^"]+"/g, `fill="${P.ink}"`)}</g>
  ${edges}${tiles}${stones.replace(/translate\(0 0\)/g, '')}
</g>
<path d="${underline}" fill="none" stroke="${P.red}" stroke-width="3.2" stroke-linecap="round" opacity=".85"/>
</svg>
<div style="position:absolute;left:278px;top:44px;width:190px;text-align:center;font-family:'JUA'">
  <div style="font-size:15px;color:${P.ink};letter-spacing:6px;opacity:.7">HEX</div>
  <div style="font-size:60px;line-height:1;color:${P.ink};margin-top:-2px"><span style="color:${P.red}">헥</span><span style="color:${P.blue}">스</span></div>
  <div style="font-size:10.5px;color:${P.ink};margin-top:12px">먼저 잇는 쪽이 이긴다!</div>
</div>
</div>`;
}
function flatStone(x, y, r, c, d) {
    return `<circle cx="${x.toFixed(1)}" cy="${(y + 1.4).toFixed(1)}" r="${r.toFixed(1)}" fill="${PAPER.ink}" opacity=".25"/>
<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}" stroke="${PAPER.ink}" stroke-width="1.2"/>
<path d="M ${(x - r * 0.55).toFixed(1)} ${(y - r * 0.15).toFixed(1)} A ${(r * 0.6).toFixed(1)} ${(r * 0.6).toFixed(1)} 0 0 1 ${(x + r * 0.1).toFixed(1)} ${(y - r * 0.6).toFixed(1)}" fill="none" stroke="#fff" stroke-width="${(r * 0.16).toFixed(2)}" stroke-linecap="round" opacity=".55"/>
<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.8).toFixed(1)}" fill="none" stroke="${d}" stroke-width="${(r * 0.12).toFixed(2)}" opacity=".35"/>`;
}

// ---------- 설정 ----------
function setupHTML() {
    const row = (y, t, sub) => `<div style="position:absolute;left:${sx(-176)}px;top:${sy(y) - 10}px;width:120px">
<div style="font-size:10px;font-weight:900;color:${C.text}">${t}</div>
<div style="font-size:6.3px;color:${C.muted};margin-top:1px">${sub}</div></div>`;
    return shell(`
<div style="position:absolute;left:${sx(-190)}px;top:18px;width:380px;height:216px;border-radius:14px;background:linear-gradient(180deg,rgba(22,31,62,.9),rgba(13,19,40,.92));border:1px solid ${C.line2};box-shadow:0 8px 24px rgba(0,0,0,.5)"></div>
<div style="position:absolute;left:0;right:0;top:26px;text-align:center;display:flex;justify-content:center;align-items:center;gap:6px">
  ${logoMarkSVG(16)}<div style="font-size:14px;font-weight:900;letter-spacing:2px">대국 설정</div>
</div>
${row(62, '대전 방식', '컴퓨터 또는 친구와 한 화면에서')}
${row(28, 'AI 난이도', 'AI 대전일 때만 사용')}
${row(-6, '보드 크기', '작을수록 빨리 끝나요')}
${row(-40, '내 색깔', '빨강이 항상 먼저 둬요')}
<div style="position:absolute;left:${sx(-176)}px;width:352px;top:${sy(-62)}px;height:1px;background:${C.line}"></div>
`);
}

// ---------- 도움말 ----------
function helpHTML() {
    // 미니 보드 그림: 브리지 설명
    const mini = (X, Y, stones, extra = '') => {
        const w = 15;
        const R = w / SQ3;
        let s = '';
        for (let r = 0; r < 3; r++) {
            for (let q = 0; q < 3; q++) {
                const x = X + (q - 1 + (r - 1) / 2) * w;
                const y = Y + (r - 1) * 1.5 * R;
                s += `<polygon points="${ptsStr(hexPts(x, y, R - 0.7))}" fill="${C.tile}" stroke="#3a4777" stroke-width=".6"/>`;
                const k = stones[`${r},${q}`];
                if (k === 'R') {
                    s += `<circle cx="${x}" cy="${y}" r="${R * 0.6}" fill="${C.red}"/>`;
                } else if (k === 'B') {
                    s += `<circle cx="${x}" cy="${y}" r="${R * 0.6}" fill="${C.blue}"/>`;
                } else if (k === '*') {
                    s += `<circle cx="${x}" cy="${y}" r="${R * 0.25}" fill="${C.gold}"/>`;
                }
            }
        }
        return s + extra;
    };
    const card = (x, y, w, h, num, title, body) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:9px;background:rgba(20,28,56,.92);border:1px solid ${C.line2};padding:8px 9px">
<div style="display:flex;align-items:center;gap:5px"><div class="sg" style="width:13px;height:13px;border-radius:7px;background:${C.gold};color:#1a1400;font-size:8px;font-weight:700;text-align:center;line-height:13px">${num}</div>
<div style="font-size:9.5px;font-weight:900">${title}</div></div>
<div style="font-size:7px;color:#c9d2f2;line-height:1.55;margin-top:5px">${body}</div></div>`;
    return shell(`
<div style="position:absolute;left:0;right:0;top:9px;text-align:center;font-size:15px;font-weight:900;letter-spacing:2px">게임 방법</div>
${card(14, 34, 146, 172, 1, '목표', `<span style="color:${C.red};font-weight:700">빨강</span>은 <b>왼쪽 ↔ 오른쪽</b> 빨간 변을,<br><span style="color:${C.blue};font-weight:700">파랑</span>은 <b>위 ↔ 아래</b> 파란 변을<br>자기 돌로 먼저 이으면 승리!<br><br>한 번에 빈 칸 하나에 돌을 놓고,<br>놓은 돌은 움직이지 않아요.<br><br><b style="color:${C.gold}">헥스에는 무승부가 없어요.</b><br>보드가 다 차기 전에 누군가는<br>반드시 이어집니다.`)}
${card(167, 34, 146, 172, 2, '필승 비법: 브리지', `두 칸 떨어진 돌 사이에 빈 칸이<br><b>두 개</b> 있으면 상대가 한 칸을 막아도<br>나머지 칸으로 이을 수 있어요.`)}
<div style="position:absolute;left:176px;top:166px;width:130px;font-size:7px;color:#c9d2f2;line-height:1.55">상대가 브리지 한 칸을 막으면<br><b style="color:${C.gold}">바로 다른 칸에 두세요!</b></div>
${card(320, 34, 146, 172, 3, '조작 & 팁', `· 빈 칸을 <b>클릭</b>하면 돌을 놓아요<br>· <b>무르기</b>: 한 수 되돌리기<br>&nbsp;&nbsp;(AI 대전은 내 수까지 두 수)<br>· <b>힌트</b>: AI가 좋은 수를 추천<br>· 노란 점 = 방금 놓인 수<br><br>· 가운데는 어느 쪽으로도<br>&nbsp;&nbsp;뻗기 좋은 명당이에요.<br>· 상대 길을 막는 것만큼<br>&nbsp;&nbsp;<b>내 길을 넓히는 것</b>이 중요!<br>· AI <b>어려움</b>을 이겨 보세요!`)}
<svg width="480" height="270" style="position:absolute;left:0;top:0">
${mini(240, 118, { '2,0': 'R', '0,1': 'R', '1,1': '*', '1,0': '*' })}
<text x="240" y="152" font-size="6.5" fill="${C.muted}" text-anchor="middle" font-family="KR">노란 점 두 칸 = 브리지</text>
</svg>
`);
}

// ---------- 차례 카드 / 결과 ----------
function turnCardHTML(color, light, label, sub) {
    const T = L.TURN_CARD;
    return `<div style="width:${T.w}px;height:${T.h}px;border-radius:8px;background:linear-gradient(90deg,${color}40,${color}14);border:1.2px solid ${color};box-shadow:0 0 10px ${color}55;display:flex;align-items:center;padding-left:6px;gap:6px">
<div style="width:22px;height:22px">${stoneSVG(color, light, color === C.red ? C.redD : C.blueD, 22)}</div>
<div><div style="font-size:11px;font-weight:900;line-height:1.1">${label}</div>${sub ? `<div style="font-size:6px;color:${C.muted}">${sub}</div>` : ''}</div></div>`;
}
function bannerHTML(title, color, sub) {
    const B = L.BANNER;
    return `<div style="width:${B.w}px;height:${B.h}px;border-radius:14px;background:linear-gradient(180deg,rgba(18,26,54,.94),rgba(10,15,32,.94));border:1.5px solid ${color};box-shadow:0 0 22px ${color}88;text-align:center;padding-top:9px;position:relative;overflow:hidden">
<div style="position:absolute;left:-30px;top:-40px;width:140px;height:120px;border-radius:50%;background:radial-gradient(${color}44,transparent 70%)"></div>
<div style="font-size:8px;letter-spacing:3px;color:${C.muted};font-weight:700">${sub}</div>
<div style="font-size:27px;font-weight:900;color:#fff;text-shadow:0 0 12px ${color};margin-top:2px">${title}</div></div>`;
}
function confettiSVG(color, shape) {
    if (shape === 'hex') {
        return `<svg width="10" height="10"><polygon points="${ptsStr(hexPts(5, 5, 4.6))}" fill="${color}"/></svg>`;
    }
    return `<svg width="10" height="10"><rect x="1" y="3" width="8" height="4" rx="1" fill="${color}"/></svg>`;
}
function spinnerSVG() {
    let s = '';
    for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        s += `<circle cx="${8 + 5.5 * Math.cos(a)}" cy="${8 + 5.5 * Math.sin(a)}" r="1.5" fill="#fff" opacity="${0.2 + k * 0.15}"/>`;
    }
    return `<svg width="16" height="16">${s}</svg>`;
}

// ---------- 버튼 ----------
const ICON = {
    ai: (c) => `<svg width="11" height="11" viewBox="0 0 12 12"><rect x="1.5" y="3" width="9" height="7" rx="2" fill="none" stroke="${c}" stroke-width="1.2"/><circle cx="4.5" cy="6.5" r="1" fill="${c}"/><circle cx="7.5" cy="6.5" r="1" fill="${c}"/><line x1="6" y1="1" x2="6" y2="3" stroke="${c}" stroke-width="1.2"/></svg>`,
    two: (c) => `<svg width="12" height="11" viewBox="0 0 12 11"><circle cx="4" cy="3.2" r="2" fill="${c}"/><circle cx="8.5" cy="3.2" r="2" fill="${c}" opacity=".7"/><path d="M0.5 10 Q4 4.5 7.5 10Z" fill="${c}"/><path d="M5.5 10 Q8.5 4.5 11.8 10Z" fill="${c}" opacity=".7"/></svg>`,
    red: () => `<svg width="10" height="10"><circle cx="5" cy="5" r="4.2" fill="${C.red}"/></svg>`,
    blue: () => `<svg width="10" height="10"><circle cx="5" cy="5" r="4.2" fill="${C.blue}"/></svg>`,
    undo: (c) => `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 2 L1 4 L3 6" fill="none" stroke="${c}" stroke-width="1.2"/><path d="M1.5 4 H6 A3 3 0 0 1 6 9 H4" fill="none" stroke="${c}" stroke-width="1.2"/></svg>`,
    new: (c) => `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M8.5 5 A3.5 3.5 0 1 1 7.4 2.4" fill="none" stroke="${c}" stroke-width="1.2"/><path d="M7.8 0.8 V3 H5.6" fill="none" stroke="${c}" stroke-width="1.2"/></svg>`,
    hint: () => `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 0.8 A3 3 0 0 1 7 6 V7.4 H3 V6 A3 3 0 0 1 5 0.8Z" fill="${C.gold}"/><rect x="3.4" y="8" width="3.2" height="1.4" rx=".6" fill="${C.gold}"/></svg>`,
    menu: (c) => `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 2.5 H9 M1 5 H9 M1 7.5 H9" stroke="${c}" stroke-width="1.2"/></svg>`,
};
function buttonHTML(b, state) {
    // state: n(보통) · a(선택됨)
    const act = state === 'a';
    let bg;
    let bd;
    let fg = C.text;
    let shadow = '0 2px 4px rgba(0,0,0,.35)';
    let fs = Math.min(10.5, b.h * 0.42);
    let fw = 700;
    if (b.screen === 'TITLE') {
        // 타이틀 버튼: 종이 스티커 느낌 (평면 색 + 굵은 외곽선 + 딱딱한 그림자)
        const P = PAPER;
        const prim = b.kind === 'primary';
        return `<div style="width:${b.w}px;height:${b.h}px;border-radius:${b.h / 2.4}px;background:${prim ? P.red : '#fffaf0'};border:1.6px solid ${P.ink};box-shadow:0 2.5px 0 ${P.ink};
display:flex;align-items:center;justify-content:center;font-family:'JUA';font-size:${prim ? 14 : 10.5}px;color:${prim ? '#fff' : P.ink};white-space:nowrap;line-height:1;margin-top:-1px">${b.label}</div>`;
    }
    if (b.kind === 'primary') {
        bg = 'linear-gradient(180deg,#ffdf7e,#ffbe3d)';
        bd = '#ffe7a3';
        fg = '#2a1b00';
        fw = 900;
        fs = Math.min(13, b.h * 0.45);
        shadow = `0 3px 0 #b07a12, 0 0 14px ${C.gold}66`;
    } else if (b.kind === 'option') {
        bg = act ? `linear-gradient(180deg,#3a7bff,#2958d6)` : 'linear-gradient(180deg,#232e56,#1a2346)';
        bd = act ? '#9fc2ff' : C.line2;
        fg = act ? '#fff' : '#b9c3e6';
        shadow = act ? '0 0 10px #3a7bff88' : shadow;
        if (b.icon === 'red' && act) {
            bg = `linear-gradient(180deg,#ff6479,#d9304c)`;
            bd = C.redL;
            shadow = `0 0 10px ${C.red}88`;
        }
        if (b.icon === 'blue' && act) {
            bg = `linear-gradient(180deg,#4aa6ff,#2371d9)`;
            bd = C.blueL;
        }
    } else if (b.kind === 'ghost') {
        bg = 'rgba(30,40,78,.9)';
        bd = C.line2;
        fg = '#c9d2f2';
    } else {
        bg = 'linear-gradient(180deg,#26325e,#1c2549)';
        bd = C.line2;
        fg = '#dfe5ff';
        fs = 8;
    }
    const icon = b.icon ? `<span style="display:inline-flex;margin-right:4px">${ICON[b.icon](fg)}</span>` : '';
    const check = b.kind === 'option' && act ? '<span style="margin-left:3px;font-size:8px">✓</span>' : '';
    return `<div style="width:${b.w}px;height:${b.h}px;border-radius:${Math.min(8, b.h / 2.6)}px;background:${bg};border:1px solid ${bd};color:${fg};box-shadow:${shadow};
display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:${fw};white-space:nowrap;line-height:1">${icon}${b.label}${check}</div>`;
}

async function render(outDir) {
    const { chromium } = require('playwright-core');
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 600, height: 400 } });
    const faces = fontFaces();
    const manifest = {};
    async function shot(name, html, w, h) {
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${faces}${BASE_CSS}</style></head>
<body><div id="r" style="display:inline-block;position:relative;width:${w}px;height:${h}px">${html}</div></body></html>`);
        await page.evaluate(() => document.fonts.ready);
        const el = await page.$('#r');
        await el.screenshot({ path: path.join(outDir, `${name}.png`), omitBackground: true });
        manifest[name] = { file: `${name}.png`, width: w * 2, height: h * 2 };
    }
    await shot('screen_title', titleHTML(), 480, 270);
    await shot('screen_setup', setupHTML(), 480, 270);
    await shot('screen_help', helpHTML(), 480, 270);
    await shot('game_bg', gameBgHTML(), 480, 270);
    for (const N of L.SIZES) {
        await shot(`board${N}`, boardHTML(N), BOARD_IMG.w, BOARD_IMG.h);
    }
    const S = 50; // 돌 그림 한 변 (칸 폭 42 기준)
    await shot('stone_red', stoneSVG(C.red, C.redL, C.redD, S), S, S);
    await shot('stone_blue', stoneSVG(C.blue, C.blueL, C.blueD, S), S, S);
    await shot('stone_red_win', stoneSVG(C.red, C.redL, C.redD, S, { glow: true }), S, S);
    await shot('stone_blue_win', stoneSVG(C.blue, C.blueL, C.blueD, S, { glow: true }), S, S);
    await shot('hover_red', hoverSVG(C.red, C.redL, C.redD, S), S, S);
    await shot('hover_blue', hoverSVG(C.blue, C.blueL, C.blueD, S), S, S);
    await shot('marker', markerSVG(S), S, S);
    await shot('hint', hintSVG(S), S, S);
    await shot('turn_red', turnCardHTML(C.red, C.redL, '빨강 차례', '왼쪽 ↔ 오른쪽'), L.TURN_CARD.w, L.TURN_CARD.h);
    await shot('turn_blue', turnCardHTML(C.blue, C.blueL, '파랑 차례', '위 ↔ 아래'), L.TURN_CARD.w, L.TURN_CARD.h);
    await shot('turn_red_win', turnCardHTML(C.red, C.redL, '빨강 승리', '대국 종료'), L.TURN_CARD.w, L.TURN_CARD.h);
    await shot('turn_blue_win', turnCardHTML(C.blue, C.blueL, '파랑 승리', '대국 종료'), L.TURN_CARD.w, L.TURN_CARD.h);
    await shot('banner_red', bannerHTML('빨강 승리!', C.red, 'RED WINS'), L.BANNER.w, L.BANNER.h);
    await shot('banner_blue', bannerHTML('파랑 승리!', C.blue, 'BLUE WINS'), L.BANNER.w, L.BANNER.h);
    await shot('banner_you', bannerHTML('승리! 🎉'.replace(' 🎉', ''), C.gold, 'YOU WIN'), L.BANNER.w, L.BANNER.h);
    await shot('banner_ai', bannerHTML('AI 승리', '#9aa6d6', 'GAME OVER'), L.BANNER.w, L.BANNER.h);
    const confColors = [C.red, C.blue, C.gold, '#7cf0c0', '#ffffff'];
    for (let k = 0; k < confColors.length; k++) {
        await shot(`conf${k * 2 + 1}`, confettiSVG(confColors[k], 'hex'), 10, 10);
        await shot(`conf${k * 2 + 2}`, confettiSVG(confColors[k], 'rect'), 10, 10);
    }
    await shot('spinner', spinnerSVG(), 16, 16);
    await shot('logo_mark', logoMarkSVG(64), 64, 64);
    for (const b of L.BUTTONS) {
        await shot(`b${b.id}`, buttonHTML(b, 'n'), b.w, b.h);
        if (b.kind === 'option') {
            await shot(`b${b.id}a`, buttonHTML(b, 'a'), b.w, b.h);
        }
    }
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
    await browser.close();
    return manifest;
}

module.exports = { render, C, BOARD_IMG };

if (require.main === module) {
    render(process.argv[2] || 'assets/hex').then((m) => console.log('rendered', Object.keys(m).length, 'images'));
}
