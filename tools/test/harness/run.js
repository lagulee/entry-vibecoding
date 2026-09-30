'use strict';
/**
 * .ent 를 실제 entryjs 엔진에 불러와 테스트 스크립트를 실행한다.
 *   node tools/test/harness/run.js dist/GRAVITY_LAB.ent tools/test/harness/suite.js
 * 환경 변수: CHROMIUM(크롬 실행 파일 경로)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../../..');
const WORK = path.join(__dirname, '.work');

function serve() {
    const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml',
        '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
    const server = http.createServer((q, s) => {
        const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
            s.writeHead(404);
            s.end();
            return;
        }
        s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
        fs.createReadStream(f).pipe(s);
    });
    return new Promise((res) => server.listen(0, () => res(server)));
}

(async () => {
    const [entPath, scriptPath] = process.argv.slice(2);
    if (!fs.existsSync(path.join(__dirname, 'vendor'))) {
        console.error('먼저 npm run test:setup 을 실행하세요.');
        process.exit(1);
    }
    // .ent(tar.gz) 풀기
    const entDir = path.join(WORK, 'ent');
    fs.rmSync(entDir, { recursive: true, force: true });
    fs.mkdirSync(entDir, { recursive: true });
    execFileSync('tar', ['-xzf', path.resolve(entPath), '-C', entDir]);
    const project = JSON.parse(fs.readFileSync(path.join(entDir, 'temp', 'project.json'), 'utf8'));
    const rel = `/${path.relative(ROOT, entDir).split(path.sep).join('/')}/`;
    for (const o of project.objects) {
        for (const p of o.sprite.pictures || []) {
            p.fileurl = rel + p.fileurl;
            p.thumbUrl = rel + p.thumbUrl;
        }
        for (const s of o.sprite.sounds || []) {
            if (s.fileurl) {
                s.fileurl = rel + s.fileurl;
            }
        }
    }
    const server = await serve();
    const port = server.address().port;
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => {
        const t = m.text();
        if (t.startsWith('LOG:')) {
            console.log(t.slice(5));
        }
    });
    await page.goto(`http://localhost:${port}/tools/test/harness/index.html`);
    await page.evaluate(() => window.bootEntry());
    const r = await page.evaluate((proj) => {
        try {
            Entry.loadProject(proj);
            return 'loaded';
        } catch (e) {
            return `ERR ${e.stack}`;
        }
    }, project);
    console.log(`project ${r}`);
    await page.waitForTimeout(800);
    let code = 0;
    try {
        code = (await require(path.resolve(scriptPath))(page)) || 0;
    } catch (e) {
        console.log('SCRIPT ERROR', e.stack);
        code = 1;
    }
    // 하네스 페이지에서만 나는 오류(사운드/그림판 모듈 미탑재)는 무시
    const real = errs.filter((e) => !/reading 'default'|load sound/.test(e));
    if (real.length) {
        console.log(real.slice(0, 10).join('\n'));
    }
    await browser.close();
    server.close();
    process.exit(code);
})();
