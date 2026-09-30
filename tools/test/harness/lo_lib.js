// LIGHTS OUT 테스트 도우미 (lib.js 의 공통 동작 + 이 작품의 버튼/판 좌표)
const base = require('./lib');
const L = require('../../lo_layout.js');
module.exports = (page) => {
    const t = base(page);
    t.btn = async (key) => {
        const b = L.byKey[key];
        if (!b) {
            throw new Error(`no button ${key}`);
        }
        await t.click(b.x, b.y);
    };
    // 판 b(1/2)의 칸 k 를 마우스로 누른다
    t.cell = async (b, k) => {
        const g = await page.evaluate(() => {
            const V = (n) => +Entry.variableContainer.getVariableByName(n).getValue();
            return { n: V('판크기'), s: V('칸크기'), x1: V('보드1X'), y1: V('보드1Y'), x2: V('보드2X'), y2: V('보드2Y') };
        });
        const r = Math.floor((k - 1) / g.n);
        const c = (k - 1) % g.n;
        const off = (g.n - 1) / 2;
        const x = (b === 1 ? g.x1 : g.x2) + (c - off) * g.s;
        const y = (b === 1 ? g.y1 : g.y2) - (r - off) * g.s;
        await t.click(x, y);
    };
    t.board = async (b) => (await t.Ln(`보드${b}`)).slice(0, (await t.g('판크기')) ** 2);
    t.waitFor = async (fn, ms = 8000) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            if (await fn()) {
                return true;
            }
            await page.waitForTimeout(100);
        }
        return false;
    };
    return t;
};
