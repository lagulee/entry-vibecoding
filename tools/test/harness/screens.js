// README/문서용 대표 화면 캡처 (tools/test/harness/shots/doc_*.png)
const lib = require('./lib');
module.exports = async (page) => {
    const t = lib(page);
    await page.evaluate(() => Entry.engine.toggleRun());
    await t.wait(1500);
    await t.shot('doc_1_start');
    await t.btn(41); await t.wait(500); await t.shot('doc_2_presets');
    // P1: 속도를 25로 줄인 타원 궤도
    await t.btn(47); await t.wait(700);
    await t.btn(18); await t.answer(25);
    await t.btn(8); await t.btn(1); await t.wait(4200); await t.btn(2); await t.wait(400);
    await t.shot('doc_3_p1_ellipse');
    // P4: 8자 3체 (궤적 ∞)
    await t.btn(30); await t.wait(300); await t.btn(41); await t.wait(300); await t.btn(50); await t.wait(700);
    await t.btn(14); await t.btn(8); await t.btn(1); await t.wait(6500); await t.btn(2); await t.wait(400);
    await t.btn(26); await t.wait(500);
    await t.shot('doc_4_p4_figure8');
    // P2: A(VY 50) 저장 후 B(VY 55) 비교
    await t.btn(30); await t.wait(300); await t.btn(41); await t.wait(300); await t.btn(48); await t.wait(700);
    await t.btn(9); await t.btn(1); await t.wait(3000); await t.btn(2); await t.wait(300);
    await t.btn(27); await t.wait(200); await t.btn(28); await t.wait(1500);
    await t.btn(3); await t.wait(300); await t.btn(18); await t.answer(55);
    await t.btn(9); await t.btn(1); await t.wait(3500); await t.btn(2); await t.wait(500);
    await t.shot('doc_5_p2_compare');
    return 0;
};
