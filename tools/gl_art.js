'use strict';
/**
 * GRAVITY LAB — 그림 에셋 생성기
 * HTML/CSS 로 그린 뒤 Chromium(playwright-core)으로 2배 해상도 PNG 를 만든다.
 * 사용: node tools/gl_art.js <출력폴더>
 */
const fs = require('fs');
const path = require('path');
const L = require('./gl_layout');

// 글꼴: GL_FONT_DIR 또는 node_modules/@fontsource/*/files
function findFontDir() {
    if (process.env.GL_FONT_DIR) {
        return process.env.GL_FONT_DIR;
    }
    return null;
}
const FONT_DIR = findFontDir();
function fontPath(file) {
    if (FONT_DIR) {
        return path.join(FONT_DIR, file);
    }
    const fam = file.replace(/-(latin|korean)-\d+-normal\.woff2$/, '');
    return path.join(__dirname, '..', 'node_modules', '@fontsource', fam, 'files', file);
}
const CHROME = process.env.GL_CHROMIUM || '/opt/pw-browsers/chromium';

const C = {
    bg0: '#05080f', bg1: '#0a1122', panel: '#0c1425', panel2: '#101b31', line: '#1e2c49', line2: '#2b3d63',
    text: '#d8e3ff', muted: '#7d8db4', dim: '#4a5a80', accent: '#5cc8ff', accent2: '#a58bff',
    ok: '#43e0a8', warn: '#ffb454', danger: '#ff5d7a',
};
const BODY_COLORS = ['#ffb454', '#5cc8ff', '#a58bff', '#9be15d', '#ff6fb1', '#2ed3c6', '#ff7a59', '#cfd8ea'];

function fontFaces() {
    const f = (fam, file, w) => {
        const p = fontPath(file);
        if (!fs.existsSync(p)) {
            return '';
        }
        const b64 = fs.readFileSync(p).toString('base64');
        return `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${w};}`;
    };
    return [
        f('SG', 'space-grotesk-latin-500-normal.woff2', 500),
        f('SG', 'space-grotesk-latin-700-normal.woff2', 700),
        f('JBM', 'jetbrains-mono-latin-400-normal.woff2', 400),
        f('JBM', 'jetbrains-mono-latin-700-normal.woff2', 700),
        f('KR', 'noto-sans-kr-korean-400-normal.woff2', 400),
        f('KR', 'noto-sans-kr-korean-700-normal.woff2', 700),
        f('KR', 'noto-sans-kr-korean-900-normal.woff2', 900),
    ].join('\n');
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
body{font-family:'SG','KR','WenQuanYi Zen Hei',sans-serif;color:${C.text};-webkit-font-smoothing:antialiased}
.mono{font-family:'JBM','KR','WenQuanYi Zen Hei',monospace}
.kr{font-family:'SG','KR','WenQuanYi Zen Hei',sans-serif}
`;

// ---------- 무대 좌표 → CSS 좌표 ----------
const sx = (x) => x + L.STAGE.w / 2;
const sy = (y) => L.STAGE.h / 2 - y;

// ---------- 배경 ----------
function bgHTML() {
    const V = L.VIEW;
    const cx = sx(L.VIEW_CENTER.x);
    const cy = sy(L.VIEW_CENTER.y);
    // 별 (결정적 난수)
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let stars = '';
    for (let i = 0; i < 140; i++) {
        const x = rnd() * 480;
        const y = rnd() * 270;
        const r = rnd() < 0.9 ? 0.4 + rnd() * 0.5 : 0.9 + rnd() * 0.6;
        const a = 0.15 + rnd() * 0.45;
        stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#cfe0ff" opacity="${a.toFixed(2)}"/>`;
    }
    let grid = '';
    for (let k = -8; k <= 8; k++) {
        const gx = cx + k * 50;
        const gy = cy + k * 50;
        const a = k === 0 ? 0.16 : 0.06;
        grid += `<line x1="${gx}" y1="0" x2="${gx}" y2="270" stroke="#8fb0ff" stroke-opacity="${a}" stroke-width="0.6"/>`;
        grid += `<line x1="0" y1="${gy}" x2="480" y2="${gy}" stroke="#8fb0ff" stroke-opacity="${a}" stroke-width="0.6"/>`;
    }
    // 중심 표시
    grid += `<circle cx="${cx}" cy="${cy}" r="2" fill="none" stroke="#8fb0ff" stroke-opacity="0.25" stroke-width="0.6"/>`;
    return `<div style="width:480px;height:270px;background:radial-gradient(ellipse at ${cx}px ${cy}px,#0d1831 0%,#070c18 55%,${C.bg0} 100%)">
<svg width="480" height="270" style="position:absolute;left:0;top:0">
<defs><radialGradient id="neb" cx="30%" cy="35%" r="60%"><stop offset="0" stop-color="#3a2a7a" stop-opacity=".22"/><stop offset="1" stop-color="#3a2a7a" stop-opacity="0"/></radialGradient>
<radialGradient id="neb2" cx="75%" cy="80%" r="50%"><stop offset="0" stop-color="#0e5a7a" stop-opacity=".18"/><stop offset="1" stop-color="#0e5a7a" stop-opacity="0"/></radialGradient></defs>
<rect width="480" height="270" fill="url(#neb)"/><rect width="480" height="270" fill="url(#neb2)"/>
${stars}${grid}</svg></div>`;
}

// ---------- 패널 프레임(시뮬레이션 영역만 뚫린 덮개) ----------
function frameHTML() {
    const V = L.VIEW;
    const vx0 = sx(V.x0);
    const vy0 = sy(V.y1);
    const vw = V.x1 - V.x0;
    const vh = V.y1 - V.y0;
    const P = L.PANEL;
    const px0 = sx(P.x0);
    const panelTop = sy(P.y1);
    const sep = (y) => `<div style="position:absolute;left:${px0 + 6}px;width:${P.x1 - P.x0 - 12}px;top:${sy(y)}px;height:1px;background:${C.line}"></div>`;
    const label = (x, y, t, extra = '') =>
        `<div class="mono" style="position:absolute;left:${sx(x)}px;top:${sy(y) - 5}px;font-size:6px;letter-spacing:1.2px;color:${C.muted};${extra}">${t}</div>`;
    // 덮개: SVG 로 사각형에서 시뮬레이션 영역을 뺀 경로
    const outer = 'M0,0 H480 V270 H0 Z';
    const hole = `M${vx0},${vy0} h${vw} v${vh} h${-vw} Z`;
    return `<div style="width:480px;height:270px;position:relative">
<svg width="480" height="270" style="position:absolute;left:0;top:0">
<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f192d"/><stop offset="1" stop-color="#0a1221"/></linearGradient></defs>
<path d="${outer} ${hole}" fill-rule="evenodd" fill="url(#pg)"/>
<rect x="${vx0 - 0.5}" y="${vy0 - 0.5}" width="${vw + 1}" height="${vh + 1}" fill="none" stroke="${C.line2}" stroke-width="1"/>
<line x1="0" y1="${sy(L.TOP.y0) + 0.5}" x2="480" y2="${sy(L.TOP.y0) + 0.5}" stroke="${C.line}" />
<line x1="0" y1="${sy(L.BOTTOM.y1) - 0.5}" x2="480" y2="${sy(L.BOTTOM.y1) - 0.5}" stroke="${C.line}" />
<line x1="${px0 + 0.5}" y1="${panelTop}" x2="${px0 + 0.5}" y2="${sy(P.y0)}" stroke="${C.line}" />
<!-- 모서리 표시 -->
${[[vx0, vy0, 1, 1], [vx0 + vw, vy0, -1, 1], [vx0, vy0 + vh, 1, -1], [vx0 + vw, vy0 + vh, -1, -1]].map(([x, y, dx, dy]) =>
        `<path d="M${x + dx * 7},${y} H${x} V${y + dy * 7}" stroke="${C.accent}" stroke-opacity=".7" stroke-width="1.2" fill="none"/>`).join('')}
</svg>
<!-- 로고 -->
<div style="position:absolute;left:8px;top:4px;display:flex;align-items:center;gap:5px">
  <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="2.6" fill="${C.warn}"/><ellipse cx="7" cy="7" rx="6.2" ry="2.6" fill="none" stroke="${C.accent}" stroke-width="0.9" transform="rotate(-25 7 7)"/><circle cx="12.3" cy="4.6" r="1.1" fill="${C.accent}"/></svg>
  <div style="font-weight:700;font-size:10.5px;letter-spacing:1.6px">GRAVITY<span style="color:${C.accent}"> LAB</span></div>
</div>
${label(P.x0 + 7, 107, 'SELECTED BODY')}
<div style="position:absolute;left:${px0 + 90}px;top:${sy(107) - 4}px;width:6px;height:6px;border-radius:3px;background:${C.accent};box-shadow:0 0 5px ${C.accent}"></div>
${sep(30.5)}
${sep(-3.5)}
${label(-89, -117.5, 'SPEED')}
${label(-89, -123.5, '배속', 'font-size:5.5px;letter-spacing:.5px;color:' + C.dim)}
<div style="position:absolute;left:${sx(-95)}px;top:${sy(BOTTOM_MID) - 10}px;width:1px;height:20px;background:${C.line}"></div>
<div style="position:absolute;left:${sx(93)}px;top:${sy(BOTTOM_MID) - 10}px;width:1px;height:20px;background:${C.line}"></div>
</div>`;
}
const BOTTOM_MID = -119.5;

// ---------- 천체 / 링 / 효과 ----------
function bodyHTML(color) {
    return `<div style="width:64px;height:64px;position:relative">
<svg width="64" height="64" viewBox="0 0 64 64"><defs>
<radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0.62" stop-color="${color}" stop-opacity=".45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
<radialGradient id="s" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".25" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="1"/></radialGradient>
<radialGradient id="sh" cx="65%" cy="68%" r="55%"><stop offset=".4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
</defs>
<circle cx="32" cy="32" r="32" fill="url(#g)"/>
<circle cx="32" cy="32" r="24" fill="url(#s)"/>
<circle cx="32" cy="32" r="24" fill="url(#sh)"/>
</svg></div>`;
}
// 몸체 지름 48 / 그림 64 → 표시 크기 = 지름 × 64/48
function ringHTML() {
    return `<svg width="64" height="64" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="29" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="7 5" opacity=".9"/>
<circle cx="32" cy="32" r="31" fill="none" stroke="${C.accent}" stroke-width="1" opacity=".6"/></svg>`;
}
function burstHTML() {
    return `<svg width="64" height="64" viewBox="0 0 64 64"><defs>
<radialGradient id="b" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="#fff3c4" stop-opacity="0"/><stop offset=".8" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ff7a59" stop-opacity="0"/></radialGradient></defs>
<circle cx="32" cy="32" r="32" fill="url(#b)"/>
${[...Array(12)].map((_, k) => { const a = k * Math.PI / 6; return `<line x1="${32 + 22 * Math.cos(a)}" y1="${32 + 22 * Math.sin(a)}" x2="${32 + 30 * Math.cos(a)}" y2="${32 + 30 * Math.sin(a)}" stroke="#ffe3a3" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>`; }).join('')}
</svg>`;
}

// ---------- 버튼 ----------
function buttonHTML(b, label, active) {
    const w = b.w;
    const h = b.h;
    const fs = Math.max(6, Math.min(h * 0.5, b.w <= 46 && label.length > 6 ? 7.4 : 10));
    let bg = '#111c33';
    let bd = C.line2;
    let fg = C.text;
    let shadow = '';
    let fw = 500;
    const isKR = /[가-힣]/.test(label);
    switch (b.kind) {
        case 'primary':
            bg = active ? 'linear-gradient(#1b6b52,#135540)' : 'linear-gradient(#1f6fa8,#175a8a)';
            bd = active ? C.ok : C.accent;
            fg = '#ffffff';
            fw = 700;
            shadow = `0 0 6px ${active ? C.ok : C.accent}55`;
            break;
        case 'seg':
            bg = active ? C.accent : '#0f1a2f';
            bd = active ? C.accent : C.line2;
            fg = active ? '#04121f' : C.text;
            fw = 700;
            break;
        case 'toggle':
            bg = active ? '#123452' : '#0f1a2f';
            bd = active ? C.accent : C.line2;
            fg = active ? '#ffffff' : C.muted;
            break;
        case 'tab':
            // 투명 배경은 엔트리에서 클릭이 통과하므로 반드시 불투명하게
            bg = active ? '#16304f' : '#0d1628';
            bd = active ? C.accent : C.line;
            fg = active ? '#ffffff' : C.muted;
            break;
        case 'edit':
            bg = '#121d35';
            bd = C.line2;
            fg = C.text;
            break;
        case 'danger':
            bg = '#2a1220';
            bd = '#7a2a40';
            fg = '#ffb3c1';
            break;
        case 'big':
            bg = 'rgba(16,28,52,.85)';
            bd = C.line2;
            fg = C.text;
            fw = 700;
            break;
        case 'bigPrimary':
            bg = 'linear-gradient(#2383c7,#1a639b)';
            bd = C.accent;
            fg = '#fff';
            fw = 700;
            shadow = `0 0 10px ${C.accent}66`;
            break;
        default:
            bg = active ? '#16304f' : '#101a30';
            bd = active ? C.accent : C.line2;
            fg = C.text;
    }
    const dot = b.kind === 'toggle'
        ? `<span style="display:inline-block;width:4px;height:4px;border-radius:2px;margin-right:3px;background:${active ? C.ok : C.dim};${active ? `box-shadow:0 0 4px ${C.ok}` : ''}"></span>`
        : '';
    const bfs = b.kind.startsWith('big') ? 11 : fs;
    return `<div style="width:${w}px;height:${h}px;border-radius:${Math.min(4, h / 3)}px;background:${bg};border:1px solid ${bd};color:${fg};box-shadow:${shadow || 'none'};
display:flex;align-items:center;justify-content:center;font-size:${bfs}px;font-weight:${fw};letter-spacing:${isKR ? 0 : 0.4}px;white-space:nowrap;line-height:1">${dot}${label}</div>`;
}

function modeCardHTML(b) {
    const m = b.card;
    const colors = { BASIC: C.ok, EXPERIMENT: C.accent, SANDBOX: C.accent2 };
    const col = colors[m.mode];
    return `<div style="width:${b.w}px;height:${b.h}px;border-radius:8px;background:linear-gradient(160deg,#13213d,#0b1427);border:1px solid ${col}88;box-shadow:0 0 14px ${col}22;padding:11px 11px;position:relative;overflow:hidden">
<div style="position:absolute;right:-18px;top:-18px;width:60px;height:60px;border-radius:30px;background:radial-gradient(${col}55,transparent 70%)"></div>
<div class="mono" style="font-size:6px;letter-spacing:1.5px;color:${col}">MODE · ${m.ko}</div>
<div style="font-size:15px;font-weight:700;letter-spacing:1px;margin-top:3px">${m.title}</div>
<div style="font-size:8px;font-weight:700;color:${C.text};margin-top:6px">${m.goal}</div>
<div style="height:1px;background:${C.line2};margin:7px 0"></div>
${m.lines.map((t) => `<div style="font-size:7.2px;color:${C.muted};margin-top:3.5px">· ${t}</div>`).join('')}
<div class="mono" style="position:absolute;left:11px;bottom:9px;font-size:6.5px;color:${col}">최대 천체 ${m.max}개 →</div>
</div>`;
}
function presetCardHTML(b) {
    const p = b.preset;
    const colors = { BASIC: C.ok, EXPERIMENT: C.accent, SANDBOX: C.accent2 };
    const col = colors[p.mode];
    const icons = {
        1: `<circle cx="30" cy="22" r="7" fill="${BODY_COLORS[0]}"/><circle cx="30" cy="22" r="16" fill="none" stroke="${C.muted}" stroke-dasharray="2 2" stroke-width=".8"/><circle cx="46" cy="22" r="2.4" fill="${BODY_COLORS[1]}"/>`,
        2: `<circle cx="16" cy="30" r="8" fill="${BODY_COLORS[0]}"/><path d="M26 30 Q40 28 56 8" fill="none" stroke="${C.muted}" stroke-dasharray="2 2" stroke-width=".8"/><circle cx="56" cy="8" r="2.2" fill="${BODY_COLORS[3]}"/>`,
        3: `<ellipse cx="30" cy="22" rx="14" ry="14" fill="none" stroke="${C.muted}" stroke-dasharray="2 2" stroke-width=".8"/><circle cx="16" cy="22" r="5" fill="${BODY_COLORS[0]}"/><circle cx="44" cy="22" r="5" fill="${BODY_COLORS[1]}"/>`,
        4: `<path d="M30 22 C40 8 56 12 56 22 C56 32 40 36 30 22 C20 8 4 12 4 22 C4 32 20 36 30 22Z" fill="none" stroke="${C.muted}" stroke-dasharray="2 2" stroke-width=".8"/><circle cx="30" cy="22" r="3.4" fill="${BODY_COLORS[2]}"/><circle cx="50" cy="14" r="3.4" fill="${BODY_COLORS[1]}"/><circle cx="10" cy="30" r="3.4" fill="${BODY_COLORS[0]}"/>`,
        5: `<circle cx="30" cy="22" r="6" fill="${BODY_COLORS[0]}"/><circle cx="12" cy="10" r="2.5" fill="${BODY_COLORS[4]}"/><circle cx="50" cy="32" r="3" fill="${BODY_COLORS[5]}"/><path d="M44 8 v8 M40 12 h8" stroke="${C.accent2}" stroke-width="1.4"/>`,
    };
    return `<div style="width:${b.w}px;height:${b.h}px;border-radius:7px;background:linear-gradient(170deg,#13213d,#0b1427);border:1px solid ${C.line2};padding:8px 8px;position:relative;overflow:hidden">
<div style="position:absolute;left:0;top:0;right:0;height:2px;background:${col}"></div>
<div class="mono" style="font-size:6px;letter-spacing:1.2px;color:${C.muted}">PRESET 0${p.n}</div>
<svg width="60" height="44" viewBox="0 0 60 44" style="display:block;margin:6px auto 3px">${icons[p.n]}</svg>
<div style="font-size:8.6px;font-weight:700;line-height:1.25">${p.name}</div>
<div style="font-size:6.4px;color:${C.muted};margin-top:2px">${p.sub}</div>
<div style="height:1px;background:${C.line};margin:6px 0 5px"></div>
<div style="font-size:6.4px;color:${C.text};line-height:1.45">Q. ${p.q}</div>
<div class="mono" style="position:absolute;left:8px;bottom:7px;font-size:5.8px;letter-spacing:.8px;color:${col};border:1px solid ${col}88;border-radius:3px;padding:1.5px 3px">${p.mode}</div>
</div>`;
}

// ---------- 화면 ----------
function screenShell(inner) {
    return `<div style="width:480px;height:270px;position:relative;background:radial-gradient(ellipse at 50% 38%,#122044 0%,#0a1124 50%,#05080f 100%);overflow:hidden">
${bgStarsSVG()}${inner}</div>`;
}
function bgStarsSVG() {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let s = '';
    for (let i = 0; i < 120; i++) {
        s += `<circle cx="${(rnd() * 480).toFixed(1)}" cy="${(rnd() * 270).toFixed(1)}" r="${(0.3 + rnd() * 0.8).toFixed(2)}" fill="#cfe0ff" opacity="${(0.1 + rnd() * 0.5).toFixed(2)}"/>`;
    }
    return `<svg width="480" height="270" style="position:absolute;left:0;top:0">${s}</svg>`;
}
function startHTML() {
    return screenShell(`
<svg width="480" height="270" style="position:absolute;left:0;top:0">
<ellipse cx="240" cy="34" rx="120" ry="26" fill="none" stroke="${C.accent}" stroke-opacity=".35" stroke-width="1" transform="rotate(-8 240 34)"/>
<ellipse cx="240" cy="34" rx="165" ry="40" fill="none" stroke="${C.accent2}" stroke-opacity=".18" stroke-width="1" stroke-dasharray="3 4" transform="rotate(-8 240 34)"/>
<circle cx="240" cy="34" r="9" fill="${C.warn}"/><circle cx="240" cy="34" r="18" fill="${C.warn}" opacity=".12"/>
<circle cx="357" cy="17" r="3.5" fill="${C.accent}"/><circle cx="92" cy="58" r="2.5" fill="${C.accent2}"/>
</svg>
<div style="position:absolute;left:0;right:0;top:64px;text-align:center">
  <div class="mono" style="font-size:7px;letter-spacing:3px;color:${C.muted}">INTERACTIVE GRAVITY SIMULATOR</div>
  <div style="font-size:34px;font-weight:700;letter-spacing:5px;margin-top:2px;line-height:1">GRAVITY<span style="color:${C.accent}"> LAB</span></div>
  <div style="font-size:11.5px;font-weight:700;margin-top:9px">“중력은 천체의 움직임을 어떻게 바꿀까?”</div>
  <div style="font-size:7.2px;color:${C.muted};margin-top:5px">초기 조건 설정 → 실행 → 관찰 → 조건 변경 → 다시 실험하는 작은 우주 물리 실험실</div>
</div>
<div class="mono" style="position:absolute;left:10px;bottom:7px;font-size:5.8px;color:${C.dim}">뉴턴의 만유인력 F = G·m₁·m₂ / r² · 시뮬레이션 단위(실제 태양계 축척 아님)</div>`);
}
function modeHTML() {
    return screenShell(`
<div style="position:absolute;left:0;right:0;top:14px;text-align:center">
 <div class="mono" style="font-size:7px;letter-spacing:3px;color:${C.muted}">STEP 1</div>
 <div style="font-size:15px;font-weight:700;margin-top:2px">실험 모드를 고르세요</div>
</div>`);
}
function presetHTML() {
    return screenShell(`
<div style="position:absolute;left:0;right:0;top:14px;text-align:center">
 <div class="mono" style="font-size:7px;letter-spacing:3px;color:${C.muted}">PRESET EXPERIMENTS</div>
 <div style="font-size:15px;font-weight:700;margin-top:2px">질문이 있는 프리셋 실험</div>
</div>`);
}
function helpHTML() {
    const items = [
        ['천체 선택', '시뮬레이션 영역에서 천체를 클릭 (N 키: 다음 천체)'],
        ['질량 변경', '오른쪽 패널 [질량] → 숫자 입력 (0보다 큰 값)'],
        ['초기 속도 변경', '[VX] [VY] → 숫자 입력. EXPERIMENT 이상은 드래그로 위치 이동'],
        ['재생 / 일시정지', '▶ PLAY · ❚❚ PAUSE (스페이스 키). 실행 중 편집하면 자동 일시정지'],
        ['궤적 확인', '[궤적] 켜기/끄기 · 길이 3s/10s/30s/∞ · [지움] 초기화'],
        ['충돌', 'r ≤ r₁ + r₂ 이면 병합 — 질량 보존, 운동량 보존 속도'],
        ['실험 초기화', '↻ RESET (R 키): 실험 시작 직전 상태로. 준비 상태에서는 프리셋 원래 값으로'],
    ];
    return screenShell(`
<div style="position:absolute;left:0;right:0;top:8px;text-align:center">
 <div class="mono" style="font-size:7px;letter-spacing:3px;color:${C.muted}">HOW TO USE</div>
 <div style="font-size:15px;font-weight:700;margin-top:2px">사용 방법</div>
</div>
<div class="mono" style="position:absolute;left:0;right:0;top:40px;font-size:6px;color:${C.dim};text-align:center">단위: 길이 LU · 질량 MU · 시간 s(시뮬레이션 초) · G = 10 — 실제 태양계와 다른 시뮬레이션 단위</div>
<div style="position:absolute;left:44px;right:40px;top:54px">
${items.map(([h, t], k) => `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:3.2px">
 <div class="mono" style="flex:none;width:15px;height:15px;border-radius:4px;background:#16294a;border:1px solid ${C.line2};font-size:7.5px;color:${C.accent};display:flex;align-items:center;justify-content:center">${k + 1}</div>
 <div><div style="font-size:8.5px;font-weight:700">${h}</div><div style="font-size:7px;color:${C.muted};margin-top:1.5px">${t}</div></div></div>`).join('')}
</div>
`);
}

// ---------- 렌더링 ----------
async function render(outDir) {
    const { chromium } = require(process.env.GL_PLAYWRIGHT || 'playwright-core');
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
        const file = path.join(outDir, `${name}.png`);
        await el.screenshot({ path: file, omitBackground: true });
        manifest[name] = { file: `${name}.png`, width: w * 2, height: h * 2 };
    }
    await shot('bg', bgHTML(), 480, 270);
    await shot('frame', frameHTML(), 480, 270);
    for (let k = 0; k < BODY_COLORS.length; k++) {
        await shot(`body${k + 1}`, bodyHTML(BODY_COLORS[k]), 64, 64);
    }
    await shot('ring', ringHTML(), 64, 64);
    await shot('burst', burstHTML(), 64, 64);
    for (const b of L.BUTTONS) {
        if (b.kind === 'card') {
            await shot(`b${b.id}`, modeCardHTML(b), b.w, b.h);
            continue;
        }
        if (b.kind === 'pcard') {
            await shot(`b${b.id}`, presetCardHTML(b), b.w, b.h);
            continue;
        }
        if (b.variants) {
            for (const vnt of b.variants) {
                await shot(`b${b.id}_${vnt.key}`, buttonHTML(b, `<span class="mono" style="font-size:6px;color:${C.muted};margin-right:2px">LEN</span>${vnt.label}`, false), b.w, b.h);
            }
            continue;
        }
        await shot(`b${b.id}`, buttonHTML(b, b.label, false), b.w, b.h);
        if (['primary', 'seg', 'toggle', 'tab', 'ctl'].includes(b.kind)) {
            await shot(`b${b.id}a`, buttonHTML(b, b.label, true), b.w, b.h);
        }
    }
    await shot('screen_start', startHTML(), 480, 270);
    await shot('screen_mode', modeHTML(), 480, 270);
    await shot('screen_preset', presetHTML(), 480, 270);
    await shot('screen_help', helpHTML(), 480, 270);
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
    await browser.close();
    return manifest;
}

module.exports = { render, BODY_COLORS, C };

if (require.main === module) {
    render(process.argv[2] || 'build/assets').then((m) => console.log('rendered', Object.keys(m).length, 'images'));
}
