'use strict';
/**
 * Figma use_figma 로 보낼 빌드 스크립트를 만든다.
 *   node tools/figma/lo_figma_script.js > tools/figma/out/lo_figma_build.js
 * 스크립트 = lo_design.js(그림 설계) + 레이아웃 데이터 + 해석기
 * 해석기는 그림마다 프레임(칸은 컴포넌트)을 만들고, SVG → 벡터 레이어, 글자 → 텍스트 레이어,
 * 작은 판 그림 → 칸 컴포넌트 인스턴스로 만든다. 모든 그림은 'LIGHTS OUT sheet' 프레임 안에 정해진 좌표로 놓인다.
 */
const fs = require('fs');
const path = require('path');
const { layoutData } = require('./lo_preview');

const design = fs.readFileSync(path.join(__dirname, 'lo_design.js'), 'utf8')
    .replace(/if \(typeof module[\s\S]*$/, '');
const L = layoutData();
const slim = {
    BUTTONS: L.BUTTONS.map(({ id, key, w, h, label, kind, tag, desc, color, icon, skin, level, stage }) => ({ id, key, w, h, label, kind, tag, desc, color, icon, skin, level, stage })),
    BOARD: L.BOARD, TILE: L.TILE, TEXT: L.TEXT, PX: L.PX,
};
const interp = `
const L = ${JSON.stringify(slim)};
const specs = buildSpecs(L);
const { pos, width, height } = layoutSheet(specs);
const FONT = { Jua: { family: 'Jua', style: 'Regular' }, Gaegu: { family: 'Gaegu', style: 'Regular' }, GaeguB: { family: 'Gaegu', style: 'Bold' }, Gowun: { family: 'Gowun Dodum', style: 'Regular' } };
await Promise.all(Object.values(FONT).map((fn) => figma.loadFontAsync(fn)));
const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
for (const n of figma.currentPage.children) { if (n.name === 'LIGHTS OUT sheet') { n.remove(); } }
const sheet = figma.createFrame();
sheet.name = 'LIGHTS OUT sheet';
sheet.resize(width, height);
sheet.fills = [];
sheet.clipsContent = false;
const comps = {};
const made = [];
function mkText(parent, it, dx, dy, color) {
  const t = figma.createText();
  t.fontName = FONT[it.font];
  t.characters = it.s;
  t.fontSize = it.size;
  t.lineHeight = { unit: 'PERCENT', value: it.lh * 100 };
  t.textAlignHorizontal = it.align.toUpperCase();
  t.fills = [{ type: 'SOLID', color: hex(color || it.color) }];
  if (it.runs && !color) { for (const [a, b, c] of it.runs) { t.setRangeFills(a, b, [{ type: 'SOLID', color: hex(c) }]); } }
  parent.appendChild(t);
  t.resize(it.w, Math.max(1, t.height));
  t.textAutoResize = 'HEIGHT';
  t.x = it.x + dx; t.y = it.y + dy;
  t.name = color ? 'shadow' : it.s.slice(0, 24);
}
for (const s of specs) {
  const p = pos[s.name];
  const node = s.component ? figma.createComponent() : figma.createFrame();
  node.name = s.name;
  node.resize(s.w, s.h);
  node.fills = [];
  node.clipsContent = true;
  sheet.appendChild(node);
  node.x = p.x; node.y = p.y;
  for (const it of s.items) {
    if (it.t === 'svg') {
      const v = figma.createNodeFromSvg(it.svg);
      node.appendChild(v); v.x = it.x; v.y = it.y; v.name = 'art';
    } else if (it.t === 'inst') {
      const inst = comps[it.of].createInstance();
      node.appendChild(inst); inst.rescale(it.k); inst.x = it.x; inst.y = it.y;
      if (it.op != null) { inst.opacity = it.op; }
    } else {
      if (it.shadow) { mkText(node, it, it.shadow.dx, it.shadow.dy, it.shadow.color); }
      mkText(node, it, 0, 0, null);
    }
  }
  if (s.component) { comps[s.name] = node; node.description = '게임 칸 그림 (스킨 ' + s.name[1] + ', ' + (s.name[3] === '1' ? '불 켜짐' : '불 꺼짐') + ')'; }
  made.push(node.id);
}
return { sheetId: sheet.id, assets: made.length, width, height, components: Object.keys(comps).length };
`;
process.stdout.write(design + interp);
