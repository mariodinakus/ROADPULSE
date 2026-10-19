'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
// Evaluate the browser UMD build without any network or browser dependencies.
const source=fs.readFileSync(path.join(__dirname,'../public/prediction-engine.js'),'utf8');
const context={window:{}};
vm.runInNewContext(source,context,{filename:'prediction-engine.js'});
const model=context.window.RoadPulsePrediction;
const c={lat:40.634,lon:22.944};
const input={date:'2026-10-19',...c};
function trafficSnapshot(overrides={}){
 return {live:true,asOf:new Date().toISOString(),sampleCount:4,slowdownIndex:48,
  segments:[{confidence:85},{confidence:70},{confidence:80},{confidence:85}],
  source:'TomTom Traffic Flow Segment Data v4',...overrides};
}
test('parking yields 24 bounded hourly forecast values and corresponding uncertainty bands',()=>{
 const a=model.parkingForecast(input);
 assert.equal(a.points.length,24);
 for(const p of a.points){
  assert.ok(p.hour>=0&&p.hour<=23&&Number.isInteger(p.score));
  assert.ok(p.low<=p.score&&p.score<=p.high&&p.low>=0&&p.high<=100);
 }
 assert.equal(a.trained,false);assert.equal(a.measuredOccupancy,false);
 assert.equal(a.calibratedIntervals,false);
});
test('manual rain and local event are explicit monotonic stress scenarios',()=>{
 const base=model.parkingForecast(input);
 const stress=model.parkingForecast({...input,rain:true,event:true});
 for(let i=0;i<24;i++)assert.ok(stress.points[i].score>=base.points[i].score);
});
test('weekday peak-hour demand differs from Sunday in the assumed model',()=>{
 const monday=model.parkingForecast(input);
 const sunday=model.parkingForecast({...input,date:'2026-10-18'});
 assert.ok(monday.points[9].score>sunday.points[9].score);
});
test('traffic extrapolation begins at measured slowing and includes four future horizons',()=>{
 const output=model.trafficForecast({snapshot:trafficSnapshot(),...c});
 assert.ok(output);assert.equal(output.points[0].score,48);
 assert.equal(output.points.map(p=>p.minutes).join(','),'0,15,30,60,120');
 for(const p of output.points)assert.ok(p.low<=p.score&&p.score<=p.high&&p.low>=0&&p.high<=100);
 assert.equal(output.trained,false);
 assert.equal(output.measuredNow,true);
});
test('traffic fails closed for stale, future or non-live snapshots',()=>{
 const old=new Date(Date.now()-60*60*1000).toISOString();
 const future=new Date(Date.now()+20*60*1000).toISOString();
 for(const snapshot of [trafficSnapshot({asOf:old}),trafficSnapshot({asOf:future}),
  trafficSnapshot({live:false}),trafficSnapshot({segments:[]})]){
  assert.equal(model.trafficForecast({snapshot,...c}),null);
 }
});
test('invalid location and invalid date do not generate a prediction',()=>{
 assert.throws(()=>model.parkingForecast({...input,lat:999}));
 assert.throws(()=>model.parkingForecast({...input,date:'2026-02-30'}));
});
