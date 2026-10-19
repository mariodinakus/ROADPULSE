'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../public/parking-evidence-core.js'),'utf8');
const context={window:{}};
vm.runInNewContext(script,context,{filename:'parking-evidence-core.js'});
const core=context.window.RoadPulseEvidenceCore;
const area={lat:40.634,lon:22.944};
const day=24*60*60*1000;
const now=Date.now();
function data(count=12){
 const samples=[];
 for(let i=count;i>=1;i--){
   const at=new Date(now-i*day).toISOString();
   samples.push(core.normalize({...area,kind:'thesi',total:20,free:2+i%4,at},Date.parse(at)+1000));
 }
 return samples;
}
test('observations require valid legal bay counts and coordinates',()=>{
 assert.throws(()=>core.normalize({...area,kind:'thesi',total:10,free:11}));
 assert.throws(()=>core.normalize({lat:999,lon:22,kind:'street',total:5,free:0}));
 assert.throws(()=>core.normalize({...area,kind:'unknown',total:10,free:5}));
 assert.equal(core.normalize({...area,kind:'street',total:10,free:0}).occupied,10);
});
test('records store only approximate grid, not exact GPS coordinates',()=>{
 const a=core.normalize({...area,kind:'thesi',total:20,free:6});
 assert.ok(!Object.hasOwn(a,'lat')&&!Object.hasOwn(a,'lon'));
 assert.match(a.cell,/^-?\d+:-?\d+$/);
 assert.equal(a.origin,'manual-eyewitness');
});
test('cannot submit duplicate observations for same zone/category within 15 minutes',()=>{
 const first=core.addRecord([],{...area,kind:'thesi',total:20,free:6},now);
 assert.throws(()=>core.addRecord(first,{...area,kind:'thesi',total:20,free:7},now+60000));
});
test('insufficient samples produce no invented occupancy percentages',()=>{
 const a=core.forecast([],{...area,kind:'thesi'});
 assert.equal(a.points.length,4);
 assert.ok(a.points.every(x=>x.result===null));
 const b=core.forecast(data(2),{...area,kind:'thesi'});
 assert.ok(b.points.every(x=>x.result===null));
});
test('after enough dated observations model yields bounded sample occupancy forecasts',()=>{
 const result=core.forecast(data(),{...area,kind:'thesi'});
 assert.deepEqual(Array.from(result.points,p=>p.minutes),[0,30,60,120]);
 assert.equal(result.coverage.records,12);
 assert.ok(result.points.some(p=>p.result!==null));
 for(const p of result.points.filter(p=>p.result)){
   const x=p.result;
   assert.ok(x.low>=0&&x.low<=x.occupiedPercent);
   assert.ok(x.high<=100&&x.high>=x.occupiedPercent);
   assert.equal(x.statisticallyCalibrated,false);
 }
});
test('different geographic grid cells and parking types are never silently pooled',()=>{
 const samples=data();
 assert.ok(core.forecast(samples,{...area,kind:'street'}).points.every(x=>x.result===null));
 assert.ok(core.forecast(samples,{lat:40.655,lon:22.955,kind:'thesi'}).points.every(x=>x.result===null));
});
test('historical evaluation only trains from earlier records and needs later dates',()=>{
 const out=core.backtest(data(),{...area,kind:'thesi'});
 assert.equal(out.ready,true);
 assert.ok(out.testCount>=3&&out.days>=2);
 assert.ok(Number.isFinite(out.maePercentagePoints));
 assert.equal(out.calibrated,false);
 assert.equal(core.backtest(data(3),{...area,kind:'thesi'}).ready,false);
});
test('imported records beyond retention and malformed records do not contaminate model',()=>{
 const previous=data();
 const fake={...previous[0],id:'bad',total:3,free:12};
 const old={...previous[0],id:'stale',at:new Date(now-150*day).toISOString()};
 const result=core.sanitizeRecords([...previous,fake,old],now);
 assert.equal(result.length,12);
});
