'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const window={};
vm.runInNewContext(read('public/prediction-engine.js'),{window});
const model=window.RoadPulsePrediction;
test('parking prediction differs between day and hour and provides bounded scenario bands',()=>{
 const base=model.parkingForecast({date:'2026-10-19',lat:40.633,lon:22.944});
 const rainy=model.parkingForecast({date:'2026-10-19',lat:40.633,lon:22.944,rain:true,event:true});
 assert.equal(base.points.length,24);
 assert.ok(base.points[10].score>base.points[3].score);
 for(let i=0;i<24;i++){
  assert.ok(rainy.points[i].score>=base.points[i].score);
  assert.ok(base.points[i].low>=0&&base.points[i].high<=100);
  assert.equal(base.trained,false);
 }
});
test('traffic area model requires current TomTom observation and never invents stale metrics',()=>{
 const snap={live:true,sampleCount:5,slowdownIndex:42,segments:[{confidence:80},{confidence:80}],
  asOf:new Date().toISOString(),source:'TomTom'};
 const a=model.trafficForecast({snapshot:snap,lat:40.633,lon:22.944});
 assert.equal(a.points[0].score,42);
 assert.deepEqual(Array.from(a.points,p=>p.minutes),[0,15,30,60,120]);
 const stale={...snap,asOf:new Date(Date.now()-1800000).toISOString()};
 assert.equal(model.trafficForecast({snapshot:stale,lat:40.633,lon:22.944}),null);
 assert.equal(model.trafficForecast({snapshot:{...snap,live:false},lat:40.633,lon:22.944}),null);
});
test('orange incident markers and parking markers open information instead of only centering',()=>{
 const app=read('app.js'),inspector=read('public/area-inspector.js');
 assert.match(app,/onClick:\(\)=>inspectPin\(p,'incident'\)/);
 assert.match(app,/onClick:\(\)=>inspectPin\(p,'parking'\)/);
 assert.match(app,/roadpulse:inspect-point/);
 assert.match(inspector,/roadpulse:inspect-point/);
 assert.match(inspector,/delaySeconds/);
 assert.match(inspector,/model\.parkingHour/);
 assert.match(inspector,/model\.parkingForecast/);
 assert.match(inspector,/trafficForecast/);
});
test('satellite is imagery with attribution and does not claim live vacancy detection',()=>{
 const map=read('public/raster.js'),html=read('index.html');
 const config=JSON.parse(read('vercel.json'));
 const csp=config.headers[0].headers.find(x=>x.key==='Content-Security-Policy').value;
 assert.match(html,/data-map-style="satellite"/);
 assert.match(map,/World_Imagery\/MapServer\/tile/);
 assert.match(map,/roadpulse:imagery-error/);
 assert.match(html,/satelliteMapNote/);
 assert.ok(csp.includes('https://server.arcgisonline.com'));
 assert.ok(csp.includes('https://services.arcgisonline.com'));
 assert.match(read('public/area-inspector.js'),/Vehicle detection from imagery is not performed/);
});
