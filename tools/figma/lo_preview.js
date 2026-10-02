'use strict';
/**
 * lo_design.js 의 그림 설계를 로컬 Chromium 으로 그려 본다 (Figma 에 올리기 전 확인용).
 *   node tools/figma/lo_preview.js <출력폴더> [이름 필터...]
 * 텍스트는 Figma 와 같은 글꼴(Jua · Gaegu · Gowun Dodum, @fontsource)로 그린다.
 */
const fs = require('fs');
const path = require('path');
const { buildSpecs } = require('./lo_design');
const L = require('../lo_layout');

const FONTS = path.join(__dirname, '..', '..', 'node_modules', '@fontsource');
const KR = 'U+1100-11FF,U+3000-303F,U+3130-318F,U+AC00-D7AF,U+FF00-FFEF';
const LATIN = 'U+0000-00FF,U+2000-206F,U+2190-21FF,U+2200-22FF,U+2600-27BF';
function face(fam, pkg, file, weight, range) {
    const p = path.join(FONTS, pkg, 'files', file);
    return `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${fs.readFileSync(p).toString('base64')});font-weight:${weight};unicode-range:${range}}`;
}
const FONT_CSS = [
    face('Jua', 'jua', 'jua-korean-400-normal.woff2', 400, KR), face('Jua', 'jua', 'jua-latin-400-normal.woff2', 400, LATIN),
    face('Gaegu', 'gaegu', 'gaegu-korean-700-normal.woff2', 700, KR), face('Gaegu', 'gaegu', 'gaegu-latin-700-normal.woff2', 700, LATIN),
    face('Gaegu', 'gaegu', 'gaegu-korean-400-normal.woff2', 400, KR), face('Gaegu', 'gaegu', 'gaegu-latin-400-normal.woff2', 400, LATIN),
    face('Gowun', 'gowun-dodum', 'gowun-dodum-korean-400-normal.woff2', 400, KR), face('Gowun', 'gowun-dodum', 'gowun-dodum-latin-400-normal.woff2', 400, LATIN),
].join('\n');
const FAMILY = { Jua: ['Jua', 400], Gaegu: ['Gaegu', 400], GaeguB: ['Gaegu', 700], Gowun: ['Gowun', 400] };

function layoutData() {
    return { BUTTONS: L.BUTTONS, BOARD: L.BOARD, TILE: L.TILE, TEXT: L.TEXT, PX: L.PX };
}

function specHTML(spec, byName) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const textDiv = (it, dx = 0, dy = 0, color = null) => {
        const [fam, wt] = FAMILY[it.font];
        let inner = esc(it.s).replace(/\n/g, '<br>');
        if (it.runs && !color) {
            inner = it.runs.map(([a, b, c]) => `<span style="color:${c}">${esc(it.s.slice(a, b))}</span>`).join('');
        }
        return `<div style="position:absolute;left:${it.x + dx}px;top:${it.y + dy}px;width:${it.w}px;font-family:'${fam}';font-weight:${wt};font-size:${it.size}px;line-height:${it.lh};color:${color || it.color};text-align:${it.align};white-space:pre-wrap">${inner}</div>`;
    };
    return spec.items.map((it) => {
        if (it.t === 'svg') {
            return `<div style="position:absolute;left:${it.x}px;top:${it.y}px">${it.svg}</div>`;
        }
        if (it.t === 'inst') {
            const comp = byName[it.of];
            return `<div style="position:absolute;left:${it.x}px;top:${it.y}px;width:64px;height:64px;transform:scale(${it.k});transform-origin:0 0;${it.op != null ? `opacity:${it.op}` : ''}">${specHTML(comp, byName)}</div>`;
        }
        return (it.shadow ? textDiv(it, it.shadow.dx, it.shadow.dy, it.shadow.color) : '') + textDiv(it);
    }).join('');
}

async function render(outDir, filter = []) {
    const { chromium } = require('playwright-core');
    const specs = buildSpecs(layoutData());
    const byName = Object.fromEntries(specs.map((s) => [s.name, s]));
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 600, height: 400 } });
    for (const s of specs) {
        if (filter.length && !filter.some((f) => s.name.startsWith(f))) {
            continue;
        }
        await page.setContent(`<!doctype html><meta charset="utf-8"><style>${FONT_CSS}*{margin:0;padding:0}body{background:transparent}</style>
<div id="r" style="position:relative;width:${s.w}px;height:${s.h}px;overflow:hidden">${specHTML(s, byName)}</div>`);
        await page.evaluate(() => document.fonts.ready);
        await (await page.$('#r')).screenshot({ path: path.join(outDir, `${s.name}.png`), omitBackground: true });
    }
    await browser.close();
    return specs.length;
}

module.exports = { render, layoutData, FONT_CSS };
if (require.main === module) {
    render(process.argv[2] || 'build/preview', process.argv.slice(3)).then((n) => console.log('specs', n));
}
