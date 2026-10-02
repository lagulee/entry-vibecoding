'use strict';
/**
 * 그림 몇 개만 고쳤을 때 Figma 시트 전체를 다시 만들지 않고 해당 프레임만 바꾸는 스크립트를 만든다.
 *   node tools/figma/lo_figma_patch.js scr_race [이름...] > tools/figma/out/lo_figma_patch.js
 * (칸 인스턴스가 없는 그림만 대상 — 텍스트와 벡터 레이어만 다시 만든다)
 */
const { buildSpecs } = require('./lo_design');
const { layoutData } = require('./lo_preview');

const names = process.argv.slice(2);
const specs = buildSpecs(layoutData()).filter((s) => names.includes(s.name));
if (specs.some((s) => s.items.some((it) => it.t === 'inst'))) {
    throw new Error('인스턴스가 있는 그림은 전체 빌드(lo_figma_script.js)로 다시 만드세요');
}
process.stdout.write(`const SPECS = ${JSON.stringify(specs)};
const FONT = { Jua: { family: 'Jua', style: 'Regular' }, Gaegu: { family: 'Gaegu', style: 'Regular' }, GaeguB: { family: 'Gaegu', style: 'Bold' }, Gowun: { family: 'Gowun Dodum', style: 'Regular' } };
await Promise.all(Object.values(FONT).map((fn) => figma.loadFontAsync(fn)));
const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const sheet = figma.currentPage.children.find((n) => n.name === 'LIGHTS OUT sheet');
const out = [];
for (const s of SPECS) {
  const node = sheet.findOne((n) => n.name === s.name && (n.type === 'FRAME' || n.type === 'COMPONENT'));
  for (const c of [...node.children]) { c.remove(); }
  for (const it of s.items) {
    if (it.t === 'svg') { const v = figma.createNodeFromSvg(it.svg); node.appendChild(v); v.x = it.x; v.y = it.y; v.name = 'art'; continue; }
    for (const [dx, dy, color] of (it.shadow ? [[it.shadow.dx, it.shadow.dy, it.shadow.color], [0, 0, null]] : [[0, 0, null]])) {
      const t = figma.createText();
      t.fontName = FONT[it.font]; t.characters = it.s; t.fontSize = it.size;
      t.lineHeight = { unit: 'PERCENT', value: it.lh * 100 }; t.textAlignHorizontal = it.align.toUpperCase();
      t.fills = [{ type: 'SOLID', color: hex(color || it.color) }];
      if (it.runs && !color) { for (const [a, b, c] of it.runs) { t.setRangeFills(a, b, [{ type: 'SOLID', color: hex(c) }]); } }
      node.appendChild(t); t.resize(it.w, Math.max(1, t.height)); t.textAutoResize = 'HEIGHT'; t.x = it.x + dx; t.y = it.y + dy;
      t.name = color ? 'shadow' : it.s.slice(0, 24);
    }
  }
  out.push({ id: node.id, name: s.name, children: node.children.length });
}
return { mutated: out };
`);
