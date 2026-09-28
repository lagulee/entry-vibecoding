const SHOTS=require('path').join(__dirname,'shots')+'/';
require('fs').mkdirSync(SHOTS,{recursive:true});
module.exports=(page)=>{
 const rect=()=>page.evaluate(()=>{const r=document.querySelector('#entryCanvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});
 const api={
  async shot(name){await page.screenshot({path:SHOTS+name+'.png',clip:await rect()});},
  async click(x,y){const r=await rect();const px=r.x+(x+240)/480*r.width,py=r.y+(135-y)/270*r.height;await page.mouse.move(px,py);await page.mouse.down();await page.waitForTimeout(60);await page.mouse.up();await page.waitForTimeout(250);},
  async drag(x0,y0,x1,y1){const r=await rect();const P=(x,y)=>[r.x+(x+240)/480*r.width,r.y+(135-y)/270*r.height];await page.mouse.move(...P(x0,y0));await page.mouse.down();for(let k=1;k<=10;k++){await page.mouse.move(...P(x0+(x1-x0)*k/10,y0+(y1-y0)*k/10));await page.waitForTimeout(40);}await page.waitForTimeout(100);await page.mouse.up();await page.waitForTimeout(250);},
  g:(n)=>page.evaluate(n=>Entry.variableContainer.getVariableByName(n).getValue(),n),
  set:(n,v)=>page.evaluate(([n,v])=>Entry.variableContainer.getVariableByName(n).setValue(v),[n,v]),
  L:(n)=>page.evaluate(n=>Entry.variableContainer.getListByName(n).getArray().map(x=>x.data),n),
  Ln:(n)=>page.evaluate(n=>Entry.variableContainer.getListByName(n).getArray().map(x=>+x.data),n),
  wait:(ms)=>page.waitForTimeout(ms),
  async btn(id){const Lay=require('../../gl_layout.js');const b=Lay.BUTTONS.find(b=>b.id===id);await api.click(b.x,b.y);},
  async answer(text){for(let k=0;k<20;k++){const open=await page.evaluate(()=>Entry.stage.inputField&&!Entry.stage.inputField._isHidden);if(open)break;await page.waitForTimeout(100);}await page.evaluate((v)=>{Entry.stage.inputField.value(v);Entry.dispatchEvent('canvasInputComplete');},String(text));await page.waitForTimeout(400);},
  snap:()=>page.evaluate(()=>{const L=n=>Entry.variableContainer.getListByName(n).getArray().map(x=>+x.data);const out={};for(const n of ['질량','X','Y','VX','VY','반지름','활성','FX','FY','AX','AY','색상']) out[n]=L(n);out.names=Entry.variableContainer.getListByName('이름').getArray().map(x=>x.data);const g=n=>Entry.variableContainer.getVariableByName(n).getValue();for(const n of ['스텝수','시뮬레이션시간','상태','선택천체','충돌횟수','탈출횟수','배속','모드','화면','누적시간','궤적세대']) out[n]=g(n);return out;}),
  async key(k){await page.keyboard.press(k);await page.waitForTimeout(200);},
  log:(...a)=>console.log('LOG:',...a),
  running:()=>page.evaluate(()=>Entry.engine.isState('run')),
 };
 return api;
};
