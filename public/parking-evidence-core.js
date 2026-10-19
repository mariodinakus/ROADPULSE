/* ROADPULSE 3.7 — parking field evidence and local occupancy backtest.
 * Voluntary self-reported counts ONLY. No official THESi occupancy, surveillance or satellite input.
 * Pure engine usable in Node tests and a browser; no telemetry/network calls. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RoadPulseEvidenceCore=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null),function(){
  'use strict';
  const R=6378137,STEP=260,MAX_RECORDS=250,MS_DAY=86400000;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const kinds=['thesi','street','lot'];
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  function grid(lat,lon){
    const a=Number(lat),b=Number(lon);
    if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>80||Math.abs(b)>180)throw Error('Invalid map centre');
    const x=R*b*Math.PI/180,y=R*Math.log(Math.tan(Math.PI/4+a*Math.PI/360));
    return Math.floor(x/STEP)+':'+Math.floor(y/STEP);
  }
  function zone(lat,lon){
    if(Number(lat)>49&&Number(lat)<55&&Number(lon)>-2&&Number(lon)<2)return 'Europe/London';
    return 'Europe/Athens';
  }
  function clock(stamp,timezone){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',
      day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp));
    const pick=t=>parts.find(p=>p.type===t)?.value;
    const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(pick('weekday'));
    return {hour:Number(pick('hour'))+Number(pick('minute'))/60,day,
      date:pick('year')+'-'+pick('month')+'-'+pick('day')};
  }
  function normalize(input,now=Date.now()){
    const total=Number(input?.total),free=Number(input?.free);
    const kind=String(input?.kind||''),lat=Number(input?.lat),lon=Number(input?.lon);
    const stamp=input?.at==null?new Date(now).toISOString():new Date(input.at).toISOString();
    const time=Date.parse(stamp);
    if(!kinds.includes(kind))throw Error('Select the correct parking category');
    if(!Number.isInteger(total)||!Number.isInteger(free)||total<1||total>300||free<0||free>total)
      throw Error('Valid integer totals required: 1–300 bays and 0–total free bays');
    if(time>now+2*60000||time<now-7*MS_DAY)throw Error('Only recent observations can be entered');
    const cell=grid(lat,lon);
    return {id:time.toString(36)+'-'+Math.random().toString(36).slice(2,9),
      cell,kind,at:stamp,total,free,occupied:total-free,origin:'manual-eyewitness'};
  }
  function sanitizeRecords(items,now=Date.now()){
    if(!Array.isArray(items))return [];
    const seen=new Set(),out=[];
    for(const item of items.slice(-MAX_RECORDS*3)){
      if(!item||typeof item!=='object')continue;
      const {id,cell,kind,at,total,free}=item;
      if(typeof id!=='string'||id.length>60||!/^-?\d+:-?\d+$/.test(cell||'')||!kinds.includes(kind))continue;
      const tm=Date.parse(at);
      if(!Number.isFinite(tm)||tm>now+2*60000||tm<now-120*MS_DAY)continue;
      if(!Number.isInteger(total)||total<1||total>300||!Number.isInteger(free)||free<0||free>total)continue;
      if(seen.has(id))continue;seen.add(id);
      out.push({id,cell,kind,at:new Date(tm).toISOString(),total,free,occupied:total-free,origin:'manual-eyewitness'});
    }
    return out.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-MAX_RECORDS);
  }
  function addRecord(records,raw,now=Date.now()){
    const clean=sanitizeRecords(records,now);
    const value=normalize(raw,now);
    if(clean.some(r=>r.cell===value.cell&&r.kind===value.kind&&Math.abs(Date.parse(r.at)-Date.parse(value.at))<15*60000))
      throw Error('Already recorded this category and grid cell in the last 15 minutes');
    return sanitizeRecords([...clean,value],now);
  }
  function coverage(records,cell,kind,asOf=Date.now()){
    const subset=sanitizeRecords(records,asOf).filter(r=>r.cell===cell&&r.kind===kind&&Date.parse(r.at)<=asOf);
    const dates=new Set(subset.map(r=>r.at.slice(0,10)));
    return {records:subset.length,days:dates.size,latest:subset.at(-1)?.at||null};
  }
  function timeGap(a,b){
    const diff=Math.abs(a-b)%24;return Math.min(diff,24-diff);
  }
  function estimate(history,query,{allowShortHistory=false}={}){
    const asOf=Date.parse(query.at);
    if(!Number.isFinite(asOf))return null;
    const prev=sanitizeRecords(history,asOf).filter(r=>r.cell===query.cell&&r.kind===query.kind&&Date.parse(r.at)<asOf);
    const dayCount=new Set(prev.map(r=>r.at.slice(0,10))).size;
    if(prev.length<(allowShortHistory?4:6)||dayCount<(allowShortHistory?2:3))return null;
    const zoneId=query.timeZone||'Europe/Athens',target=clock(asOf,zoneId);
    let totalWeight=0,weighted=0,squared=0,maxRelated=0,nearby=0;
    for(const obs of prev){
      const age=(asOf-Date.parse(obs.at))/MS_DAY;
      if(age<0||age>60)continue;
      const when=clock(obs.at,zoneId),dt=timeGap(when.hour,target.hour);
      const sameClass=(target.day>=1&&target.day<=5)===(when.day>=1&&when.day<=5);
      const w=Math.exp(-.5*(dt/2.6)**2)*Math.exp(-age/32)*(sameClass?1:.55)*clamp(Math.sqrt(obs.total/12),.4,1.5);
      const used=obs.occupied/obs.total;
      totalWeight+=w;weighted+=w*used;squared+=w*used*used;
      maxRelated=Math.max(maxRelated,w);
      if(dt<=3)nearby++;
    }
    if(totalWeight<.45||nearby<2)return null;
    const share=weighted/totalWeight;
    const variance=Math.max(0,squared/totalWeight-share*share);
    const width=clamp(Math.round((.18+Math.sqrt(variance)*.6+9/Math.sqrt(prev.length*100))*100),18,45);
    const percent=Math.round(share*100);
    return {occupiedPercent:percent,low:clamp(percent-width,0,100),high:clamp(percent+width,0,100),
      sampleCount:prev.length,days:dayCount,latest:prev.at(-1)?.at||null,
      nNearbyHour:nearby,statisticallyCalibrated:false,source:'Local eyewitness counts',
      model:'Temporal kernel smoother; same ~200–260m map grid, manually sampled parking bays'};
  }
  function forecast(records,{lat,lon,kind,at=new Date().toISOString()}){
    if(!kinds.includes(kind))throw Error('Invalid category');
    const cell=grid(lat,lon),timeZone=zone(lat,lon),target=Date.parse(at);
    if(!Number.isFinite(target))throw Error('Invalid time');
    const points=[0,30,60,120].map(minutes=>({minutes,
      result:estimate(records,{cell,kind,timeZone,at:new Date(target+minutes*60000).toISOString()})}));
    const seen=sanitizeRecords(records,target).filter(r=>r.cell===cell&&r.kind===kind);
    return {cell,kind,points,coverage:coverage(seen,cell,kind,target),observations:seen,
      source:'Self-reported local records only',shared:false,official:false,fromSatellite:false};
  }
  function backtest(records,{lat,lon,kind}){
    const cell=grid(lat,lon),timeZone=zone(lat,lon);
    const all=sanitizeRecords(records).filter(r=>r.cell===cell&&r.kind===kind);
    const evaluated=[];
    for(let i=0;i<all.length;i++){
      const prediction=estimate(all.slice(0,i),{cell,kind,timeZone,at:all[i].at},{allowShortHistory:true});
      if(!prediction)continue;
      const observed=100*(all[i].occupied/all[i].total);
      evaluated.push({at:all[i].at,estimated:prediction.occupiedPercent,actual:Math.round(observed),
        absError:Math.abs(prediction.occupiedPercent-observed)});
    }
    const testDays=new Set(evaluated.map(x=>x.at.slice(0,10))).size;
    if(evaluated.length<3||testDays<2)return {ready:false,testCount:evaluated.length,days:testDays};
    const mae=evaluated.reduce((a,x)=>a+x.absError,0)/evaluated.length;
    return {ready:true,testCount:evaluated.length,days:testDays,maePercentagePoints:Math.round(mae*10)/10,
      method:'Chronological one-step-ahead holdout on voluntarily entered observations; selection-biased',
      calibrated:false};
  }
  return {grid,zone,clock,normalize,sanitizeRecords,addRecord,coverage,estimate,forecast,backtest,
    maxRecords:MAX_RECORDS};
});
