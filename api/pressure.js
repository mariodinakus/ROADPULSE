'use strict';
/**
 * ROADPULSE Traffic Pressure Lab: sampled real-time TomTom road flow.
 * This is NOT citywide congestion and NOT a forecast of future conditions.
 * Five nearest-road snapshots within roughly 0.5 km of the selected point.
 * Never expose the TomTom key to browsers, caches or application responses.
 */
const {protect}=require('../lib/abuse-guard.cjs');
const cache=new Map();
const TTL=120000;
const OFFSETS=[[0,0],[0.0035,0],[-0.0035,0],[0,0.0045],[0,-0.0045]];
function numeric(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(n,min,max){return Math.min(max,Math.max(min,n))}
function calcSegment(flow,index){
 if(!flow||typeof flow!=='object')return null;
 const current=numeric(flow.currentSpeed),free=numeric(flow.freeFlowSpeed),confidence=numeric(flow.confidence);
 if(current===null||free===null||current<0||free<=0||free>180||current>220)return null;
 const closed=flow.roadClosure===true;
 const slowdown=Math.round(clamp((1-current/free)*100,0,100));
 const score=closed?100:slowdown;
 return {id:index+1, currentSpeed:Math.round(current),freeFlowSpeed:Math.round(free),
   slowdownPercent:score, confidence:confidence===null?null:Math.round(clamp(confidence,0,1)*100),
   closed, frc:typeof flow.frc==='string'?flow.frc.slice(0,10):null};
}
function summarize(items){
 const valid=items.filter(Boolean);
 if(!valid.length)return null;
 const avg=Math.round(valid.reduce((sum,x)=>sum+x.slowdownPercent,0)/valid.length);
 return {slowdownIndex:avg, sampleCount:valid.length,requestedSamples:OFFSETS.length,
   currentKmh:Math.round(valid.reduce((sum,x)=>sum+x.currentSpeed,0)/valid.length),
   freeFlowKmh:Math.round(valid.reduce((sum,x)=>sum+x.freeFlowSpeed,0)/valid.length),
   closedCount:valid.filter(s=>s.closed).length,segments:valid};
}
async function oneSample(lat,lon,key,index){
 const query=new URLSearchParams({key,point:lat.toFixed(6)+','+lon.toFixed(6),unit:'KMPH'});
 const url='https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/12/json?'+query.toString();
 const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
 if(!r.ok)throw Error('Flow service error');
 const json=await r.json();
 return calcSegment(json?.flowSegmentData,index);
}
module.exports=async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const lat=numeric(req.query?.lat),lon=numeric(req.query?.lon);
 if(lat===null||lon===null||Math.abs(lat)>80||Math.abs(lon)>180)
   return res.status(400).json({error:'Invalid coordinates'});
 const guard=protect(req,res,{name:'pressure-flow',perMinute:5,perDay:150,totalPerMinute:35,totalPerDay:400});
 if(!guard.ok)return guard.response;
 const key=String(process.env.TOMTOM_API_KEY||'').trim().replace(/^["']|["']$/g,'');
 if(!key)return res.status(503).json({error:'Live flow is not configured'});
 const k=lat.toFixed(3)+':'+lon.toFixed(3),now=Date.now(),hit=cache.get(k);
 if(hit&&hit.expiry>now){res.setHeader('Cache-Control','public,max-age=0,s-maxage=110,stale-while-revalidate=45');return res.status(200).json(hit.body)}
 const outcomes=await Promise.allSettled(OFFSETS.map(([dLat,dLon],i)=>oneSample(clamp(lat+dLat,-80,80),clamp(lon+dLon,-180,180),key,i)));
 const snapshot=summarize(outcomes.map(x=>x.status==='fulfilled'?x.value:null));
 if(!snapshot){res.setHeader('Cache-Control','no-store');return res.status(503).json({error:'Real-time TomTom flow samples unavailable',live:false})}
 const payload={...snapshot,source:'TomTom Traffic Flow Segment Data v4',
   asOf:new Date().toISOString(),live:true,
   definition:'Mean current-vs-free-flow speed reduction among returned sampled road segments; 0=no sampled slowdown, 100=fully stopped or closed.',
   scope:'Five nearest-road lookups, roughly 0.5 km around selected centre. Not a citywide traffic index, route ETA or future forecast.',
   noHistoricalTraining:true};
 cache.set(k,{body:payload,expiry:now+TTL});
 if(cache.size>35)cache.delete(cache.keys().next().value);
 res.setHeader('Cache-Control','public,max-age=0,s-maxage=110,stale-while-revalidate=45');
 return res.status(200).json(payload);
};
module.exports.__testing={calcSegment,summarize};
