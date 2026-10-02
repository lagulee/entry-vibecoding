'use strict';
/**
 * Figma 에서 그림 하나만 다시 캡처했을 때, 저장해 둔 시트 캡처(검은/흰 배경)에 그 부분만 덮어쓴다.
 *   node tools/figma/lo_sheet_patch.js <그림이름> <캡처.png> [시트.png ...]
 * 불투명한 그림(배경 화면)만 대상 — 투명한 그림은 검은/흰 배경 캡처가 둘 다 필요하다.
 */
const fs = require('fs');
const { buildSpecs, layoutSheet } = require('./lo_design');
const { layoutData } = require('./lo_preview');

(async () => {
    const [name, capture, ...sheets] = process.argv.slice(2);
    const { pos } = layoutSheet(buildSpecs(layoutData()));
    const p = pos[name];
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const url = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
    for (const sheet of sheets) {
        const out = await page.evaluate(async ([s, c, x, y, w, h]) => {
            const load = async (u) => { const im = new Image(); im.src = u; await im.decode(); return im; };
            const [si, ci] = await Promise.all([load(s), load(c)]);
            if (ci.width !== w || ci.height !== h) {
                return { error: `capture ${ci.width}x${ci.height}, expected ${w}x${h}` };
            }
            const cv = document.createElement('canvas');
            cv.width = si.width; cv.height = si.height;
            const g = cv.getContext('2d');
            g.drawImage(si, 0, 0);
            g.clearRect(x, y, w, h);
            g.drawImage(ci, x, y);
            return { data: cv.toDataURL('image/png').split(',')[1] };
        }, [url(sheet), url(capture), p.x * 2, p.y * 2, p.w * 2, p.h * 2]);
        if (out.error) {
            throw new Error(out.error);
        }
        fs.writeFileSync(sheet, Buffer.from(out.data, 'base64'));
        console.log('patched', sheet, name, p);
    }
    await browser.close();
})();
