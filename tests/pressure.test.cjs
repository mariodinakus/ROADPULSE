'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/pressure.js');
const {calcSegment,summarize}=handler.__testing;
function res(){
 return {code:200,headers:{},body:null,
   setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},
   status(n){this.code=n;return this},json(v){this.body=v;return this},end(){return this}};
}
function req(query,ip='198.51.100.160',method='GET'){
 return {method,query,headers:{'x-forwarded-for':ip,'sec-fetch-site':'same-origin'}};
}
test('roadflow index is the percentage speed loss vs free flow',()=>{
 const sample=calcSegment({currentSpeed:30,freeFlowSpeed:60,confidence:.75},0);
 assert.equal(sample.slowdownPercent,50);
 assert.equal(sample.confidence,75);
 assert.equal(sample.closed,false);
});
test('closed sampled road is 100, free flowing or faster is 0',()=>{
 assert.equal(calcSegment({currentSpeed:15,freeFlowSpeed:55,roadClosure:true},2).slowdownPercent,100);
 assert.equal(calcSegment({currentSpeed:65,freeFlowSpeed:60},1).slowdownPercent,0);
 assert.equal(calcSegment({currentSpeed:0,freeFlowSpeed:0},1),null);
});
test('summary uses only valid samples and never claims all five if three respond',()=>{
 const snap=summarize([calcSegment({currentSpeed:15,freeFlowSpeed:30},0),null,calcSegment({currentSpeed:30,freeFlowSpeed:60},2),null,calcSegment({currentSpeed:50,freeFlowSpeed:50},4)]);
 assert.equal(snap.sampleCount,3);assert.equal(snap.requestedSamples,5);assert.equal(snap.slowdownIndex,33);
 assert.equal(summarize([null,null]),null);
});
test('invalid coordinates or method are rejected before TomTom',async()=>{
 const r=res();await handler(req({lat:'999',lon:'22.9'}),r);
 assert.equal(r.code,400);
 const other=res();await handler(req({lat:'40.6',lon:'22.9'},'198.51.100.161','POST'),other);
 assert.equal(other.code,405);
});
test('missing key yields unavailable, never fabricated flow',async()=>{
 const old=process.env.TOMTOM_API_KEY;
 delete process.env.TOMTOM_API_KEY;
 try{const r=res();await handler(req({lat:'40.634',lon:'22.944'},'198.51.100.162'),r);assert.equal(r.code,503);assert.equal(r.body.slowdownIndex,undefined)}
 finally{if(old===undefined)delete process.env.TOMTOM_API_KEY;else process.env.TOMTOM_API_KEY=old}
});
test('live flow returns sampled speeds but never publishes the TomTom key',async()=>{
 const old=process.env.TOMTOM_API_KEY,oldFetch=global.fetch;
 const key='mocked-secret-traffic-key';
 process.env.TOMTOM_API_KEY=key;
 let calls=0;
 global.fetch=async(url)=>{calls++;assert.ok(String(url).includes('flowSegmentData'));assert.ok(String(url).includes(key));
  return {ok:true,json:async()=>({flowSegmentData:{currentSpeed:18,freeFlowSpeed:36,confidence:0.9}})};};
 try{
  const r=res();await handler(req({lat:'40.64512',lon:'22.94789'},'198.51.100.170'),r);
  assert.equal(r.code,200);assert.equal(r.body.slowdownIndex,50);
  assert.equal(r.body.sampleCount,5);assert.equal(calls,5);
  assert.equal(JSON.stringify(r.body).includes(key),false);
  assert.equal(r.body.live,true);assert.equal(r.body.noHistoricalTraining,true);
 }finally{global.fetch=oldFetch;if(old===undefined)delete process.env.TOMTOM_API_KEY;else process.env.TOMTOM_API_KEY=old}
});
