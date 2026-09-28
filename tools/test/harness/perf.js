const lib=require('./lib');
// 천체 3개/8개(충돌 없는 원궤도 배치)로 배속별 프레임 수와 실제 진행 배속 측정
module.exports=async(page)=>{
 const t=lib(page);
 await page.evaluate(()=>Entry.engine.toggleRun()); await t.wait(1200);
 await t.btn(41); await t.wait(300); await t.btn(51); await t.wait(700);
 const setup=async(N)=>{
  await page.evaluate((N)=>{const L=n=>Entry.variableContainer.getListByName(n);const set=(n,i,v)=>L(n).replaceValue(i,v);
   for(let k=2;k<=8;k++){const on=k<=N?1:0;const r=20+k*13;const ang=k*0.9;const v=Math.sqrt(10*10000/r);
     set('활성',k,on);set('질량',k,1);set('반지름',k,1.5);set('X',k,r*Math.cos(ang));set('Y',k,r*Math.sin(ang));set('VX',k,-v*Math.sin(ang));set('VY',k,v*Math.cos(ang));set('색상',k,k);}
  },N);
 };
 for(const N of [3,8]){
  await t.btn(3); await t.wait(300); await setup(N); await t.btn(3); await t.wait(300);
  // after RESET in READY → preset reload; so setup again (READY) then play
  await setup(N);
  for(const sp of [6,7,8,9]){
   await t.btn(sp); await t.btn(1); await t.wait(700);
   const a=await page.evaluate(()=>[+Entry.variableContainer.getVariableByName('스텝수').getValue(),performance.now(),+Entry.variableContainer.getVariableByName('프레임수').getValue()]);
   await t.wait(3000);
   const b=await page.evaluate(()=>[+Entry.variableContainer.getVariableByName('스텝수').getValue(),performance.now(),+Entry.variableContainer.getVariableByName('프레임수').getValue(),Entry.variableContainer.getListByName('활성').getArray().map(x=>x.data).join('')]);
   await t.btn(2); await t.wait(200);
   const sec=(b[1]-a[1])/1000;
   t.log(`N=${N} speed=${[0,0,0,0,0,0,1,2,5,10][sp]} fps=${((b[2]-a[2])/sec).toFixed(1)} 실제배속=${((b[0]-a[0])/sec/60).toFixed(2)} 활성=${b[3]}`);
  }
  if(N===8) await t.shot('s19_perf8');
 }
};
