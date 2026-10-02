'use strict';
/**
 * Figma 에서 받은 시트 캡처 → 게임 그림 PNG(+섬네일, manifest.json)
 *
 *   node tools/figma/lo_slice.js <검은 배경 캡처.png> <흰 배경 캡처.png> <출력폴더>
 *
 * Figma 스크린샷은 투명한 부분을 배경색으로 채워 돌려준다. 그래서 같은 시트를
 * 검은 배경·흰 배경으로 두 번 캡처하고 픽셀마다 투명도를 되살린다.
 *   검은 배경: B = a·C,  흰 배경: W = a·C + (1-a)·255  →  a = 1 - (W-B)/255,  C = B/a
 * 그림 좌표는 lo_design.js 의 layoutSheet 와 같다 (캡처 배율 2).
 */
const fs = require('fs');
const path = require('path');
const { buildSpecs, layoutSheet } = require('./lo_design');
const { layoutData } = require('./lo_preview');

const SCALE = 2;
const THUMB = 0.25;

async function slice(blackPng, whitePng, outDir) {
    const { chromium } = require('playwright-core');
    const specs = buildSpecs(layoutData());
    const { pos, width, height } = layoutSheet(specs);
    fs.mkdirSync(path.join(outDir, 'thumb'), { recursive: true });
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const b64 = (p) => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
    const info = await page.evaluate(async ([bUrl, wUrl, W, H]) => {
        const load = async (u) => { const im = new Image(); im.src = u; await im.decode(); return im; };
        const [bi, wi] = await Promise.all([load(bUrl), load(wUrl)]);
        if (bi.width !== W || bi.height !== H || wi.width !== W || wi.height !== H) {
            return { error: `size ${bi.width}x${bi.height} / ${wi.width}x${wi.height}, expected ${W}x${H}` };
        }
        const px = (im) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, W, H); };
        const B = px(bi).data;
        const Wd = px(wi).data;
        const out = new ImageData(W, H);
        const o = out.data;
        let partial = 0;
        for (let i = 0; i < o.length; i += 4) {
            const d = ((Wd[i] - B[i]) + (Wd[i + 1] - B[i + 1]) + (Wd[i + 2] - B[i + 2])) / 3;
            const a = Math.min(1, Math.max(0, 1 - d / 255));
            if (a < 1 / 255) {
                continue;
            }
            o[i] = Math.min(255, Math.round(B[i] / a));
            o[i + 1] = Math.min(255, Math.round(B[i + 1] / a));
            o[i + 2] = Math.min(255, Math.round(B[i + 2] / a));
            o[i + 3] = Math.round(a * 255);
            if (a < 0.99) {
                partial++;
            }
        }
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.getContext('2d').putImageData(out, 0, 0);
        window.__sheet = c;
        return { partial };
    }, [b64(blackPng), b64(whitePng), width * SCALE, height * SCALE]);
    if (info.error) {
        throw new Error(info.error);
    }
    const manifest = {};
    for (const s of specs) {
        const p = pos[s.name];
        const [img, thumb] = await page.evaluate(([x, y, w, h, t]) => {
            const cut = (k) => {
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
                const g = c.getContext('2d');
                g.imageSmoothingQuality = 'high';
                g.drawImage(window.__sheet, x, y, w, h, 0, 0, c.width, c.height);
                return c.toDataURL('image/png').split(',')[1];
            };
            return [cut(1), cut(t)];
        }, [p.x * SCALE, p.y * SCALE, s.w * SCALE, s.h * SCALE, THUMB]);
        fs.writeFileSync(path.join(outDir, `${s.name}.png`), Buffer.from(img, 'base64'));
        fs.writeFileSync(path.join(outDir, 'thumb', `${s.name}.png`), Buffer.from(thumb, 'base64'));
        manifest[s.name] = { file: `${s.name}.png`, thumb: `thumb/${s.name}.png`, width: s.w * SCALE, height: s.h * SCALE };
    }
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
    await browser.close();
    return { count: specs.length, partialAlphaPixels: info.partial };
}

module.exports = { slice };
if (require.main === module) {
    const [b, w, out = 'assets/lights_out'] = process.argv.slice(2);
    slice(b, w, out).then((r) => console.log('sliced', JSON.stringify(r)));
}
