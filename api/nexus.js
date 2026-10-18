'use strict';
// NEXUS read-only integration, based on ROADPULSE's existing TomTom-backed /api/incidents endpoint.
// No GPS tracking, secrets, invented incident/parking availability or bypass of upstream quotas.
const BASE='https://roadpulse-gray.vercel.app';
const CITY={lat:40.64,lon:22.94,label:'Thessaloniki, Greece'};
let cached={at:0,value:null};
const base=()=>({schema:'nexus.v1',appId:'roadpulse',name:'ROADPULSE',url:BASE,source:'ROADPULSE / TomTom Orbis',capabilities:['traffic-incidents','mobility'],notifications:[],status:'unavailable',place:CITY.label,data:null});
module.exports=async(req,res)=>{
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 res.setHeader('Cache-Control','public, s-maxage=180, stale-while-revalidate=120');
 if(cached.value&&Date.now()-cached.at<180000)return res.status(200).json(cached.value);
 const result=base();
 try{
  const controller=new AbortController();const t=setTimeout(()=>controller.abort(),7500);
  let response;try{response=await fetch(`${BASE}/api/incidents?lat=${CITY.lat}&lon=${CITY.lon}`,{headers:{Accept:'application/json'},redirect:'error',signal:controller.signal})}finally{clearTimeout(t)}
  if(!response.ok)throw Error('ROADPULSE incident provider not available');
  const payload=await response.json();if(!Array.isArray(payload.items))throw Error('Bad incident feed');
  const events=payload.items.filter(x=>x&&typeof x==='object'&&typeof x.description==='string').slice(0,140);
  const valid=events.filter(x=>Number.isFinite(x.delaySeconds)&&x.delaySeconds>=600).sort((a,b)=>b.delaySeconds-a.delaySeconds);
  result.status='ok';result.data={summary:`${events.length} reported traffic incidents near Thessaloniki`,incidentCount:events.length,significantDelays:valid.length,maxDelaySeconds:valid.length?valid[0].delaySeconds:null,asOf:payload.asOf||new Date().toISOString(),source:'TomTom Orbis via ROADPULSE · nearby area, not road coverage everywhere'};
  result.notifications=valid.slice(0,3).map(x=>({id:`incident:${String(x.id).slice(0,65)}`,title:'Traffic delay near Thessaloniki',message:`${String(x.description).slice(0,110)} · ${Math.round(x.delaySeconds/60)} min reported delay (TomTom).`,severity:x.delaySeconds>=1800?'warning':'notice',time:payload.asOf||new Date().toISOString()}));
 }catch{result.note='Live incidents unavailable (provider limits, missing authorization or timeout); no fabricated traffic events.'}
 cached={at:Date.now(),value:result};return res.status(200).json(result);
};