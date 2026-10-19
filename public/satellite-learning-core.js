/* ROADPULSE Satellite Learning Core 1.0
 * Learning requires genuine human-verified occupancy counts, never undated basemap pixels.
 * Pure functions; no external requests or claim of trained computer vision.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.RoadPulseSatelliteLearningCore=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null),function(){
'use strict';
const DAY=86400000,MAX=600,R=6378137,CELL=260;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function grid(lat,lon){
 const a=Number(lat),b=Number(lon);
 if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>80||Math.abs(b)>180)throw Error('Invalid coordinates');
 const x=R*b*Math.PI/180,y=R*Math.log(Math.tan(Math.PI/4+a*Math.PI/360));
 return Math.floor(x/CELL)+':'+Math.floor(y/CELL);
}
function timeParts(iso){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Athens',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
 const p=k=>parts.find(v=>v.type===k)?.value;
 return {hour:Number(p('hour'))+Number(p('minute'))/60,day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p('weekday'))};
}
function checked(record,now=Date.now()){
 if(!record||typeof record!=='object')throw Error('Observation required');
 const lat=Number(record.lat),lon=Number(record.lon),free=Number(record.free),total=Number(record.total);
 const cell=grid(lat,lon);
 if(!Number.isInteger(total)||total<1||total>250||!Number.isInteger(free)||free<0||free>total)throw Error('Enter real counted spaces, 0<=free<=total<=250');
 const at=new Date(record.at||record.captureAt||now),ts=at.getTime();
 if(!Number.isFinite(ts)||ts>now+120000||ts<now-180*DAY)throw Error('Observation timestamp must be within the past 180 days');
 const origin=record.origin==='licensed-imagery'?'licensed-imagery':record.origin==='eyewitness'?'eyewitness':null;
 if(!origin)throw Error('Source must be eyewitness or licensed imagery');
 let sceneId=null,gsdMeters=null;
 if(origin==='licensed-imagery'){
  if(record.licensed!==true||record.manuallyVerified!==true)throw Error('Imagery must be licensed and counts manually verified');
  sceneId=String(record.sceneId||'').trim().slice(0,100);
  gsdMeters=Number(record.gsdMeters);
  if(sceneId.length<5)throw Error('Capture reference ID required');
  if(!Number.isFinite(gsdMeters)||gsdMeters<0.05||gsdMeters>0.5)throw Error('Ground sampling distance must be 0.05–0.50m/pixel for manually verified parking counts');
  if(record.captureAt){
   const captureTs=Date.parse(record.captureAt);
   if(!Number.isFinite(captureTs)||Math.abs(captureTs-ts)>30*60000)throw Error('Counts timestamp must match image acquisition within 30 minutes');
  }
 }
 return {id:String(record.id||ts.toString(36)+'-'+Math.random().toString(36).slice(2,9)).slice(0,65),
   cell,lat,lon,at:at.toISOString(),total,free,occupied:total-free,origin,sceneId,gsdMeters,
   provenance:origin==='eyewitness'?'User-entered local observation':'User-verified counts on appropriately licensed high-resolution imagery',
   automaticDetection:false,independentlyVerified:false};
}
function sanitize(records,now=Date.now()){
 if(!Array.isArray(records))return [];
 const result=[],seen=new Set();
 for(const row of records.slice(-MAX*3)){
  try{
   const r=checked({...row,licensed:row.origin==='licensed-imagery'?true:undefined,manuallyVerified:row.origin==='licensed-imagery'?true:undefined},now);
   if(typeof row.id!=='string'||!r.id||seen.has(r.id))continue;
   r.id=row.id;seen.add(r.id);result.push(r);
  }catch{}
 }
 return result.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-MAX);
}
function append(records,input,now=Date.now()){
 const list=sanitize(records,now),next=checked(input,now);
 const dup=list.some(r=>r.cell===next.cell&&r.origin===next.origin&&(
  next.sceneId&&r.sceneId===next.sceneId ||
  Math.abs(Date.parse(r.at)-Date.parse(next.at))<10*60000
 ));
 if(dup)throw Error('A matching recent observation or scene already exists for this grid cell');
 return sanitize([...list,next],now);
}
function coverage(records,cell,asOf=Date.now()){
 const rows=sanitize(records,asOf).filter(r=>r.cell===cell&&Date.parse(r.at)<=asOf);
 return {count:rows.length,days:new Set(rows.map(r=>r.at.slice(0,10))).size,
   imageryCounts:rows.filter(r=>r.origin==='licensed-imagery').length,
   fieldCounts:rows.filter(r=>r.origin==='eyewitness').length,last:rows.at(-1)?.at||null};
}
function estimate(records,{lat,lon,at},opts={}){
 const cell=grid(lat,lon),time=Date.parse(at),now=Number.isFinite(opts.now)?opts.now:Date.now();
 if(!Number.isFinite(time)||time>now+366*DAY)return null;
 const hist=sanitize(records,now).filter(r=>r.cell===cell&&Date.parse(r.at)<time&&Date.parse(r.at)<=now);
 const days=new Set(hist.map(r=>r.at.slice(0,10))).size;
 if(hist.length<8||days<3)return null;
 const target=timeParts(at),related=[];
 for(const row of hist){
  const age=(time-Date.parse(row.at))/DAY;if(age<0||age>90)continue;
  const point=timeParts(row.at),gap=Math.min(Math.abs(target.hour-point.hour),24-Math.abs(target.hour-point.hour));
  const workday=d=>(d>=1&&d<=5);
  const w=Math.exp(-0.5*(gap/3)**2)*Math.exp(-age/35)*(workday(target.day)===workday(point.day)?1:0.5);
  if(gap<3)related.push(row);
  row._w=w;
 }
 if(related.length<2)return null;
 let weights=0,sum=0,sq=0,used=0;
 for(const row of hist){
  const weight=row._w||0;if(weight<0.01)continue;
  const pct=row.occupied/row.total;
  weights+=weight;sum+=weight*pct;sq+=weight*pct*pct;used++;
 }
 if(weights<0.75||used<6)return null;
 const pct=sum/weights,variance=Math.max(0,sq/weights-pct*pct);
 const uncertainty=clamp(Math.round((0.12+Math.sqrt(variance)*0.55+0.28/Math.sqrt(used))*100),13,45);
 return {occupiedPercent:Math.round(pct*100),low:clamp(Math.round(pct*100)-uncertainty,0,100),
   high:clamp(Math.round(pct*100)+uncertainty,0,100),
   sampleCount:used,distinctDays:days,gridCell:cell,latest:hist.at(-1)?.at||null,
   model:'Locally weighted empirical occupancy, time-of-day and day-class kernel',
   calibrated:false,probabilityOfVacancy:null,automaticallyDetectedCars:false};
}
function backtest(records,{lat,lon},now=Date.now()){
 const cell=grid(lat,lon);
 const rows=sanitize(records,now).filter(r=>r.cell===cell);
 const evaluations=[];
 for(let i=8;i<rows.length;i++){
  const row=rows[i],predict=estimate(rows.slice(0,i),{lat,lon,at:row.at},{now});
  if(predict)evaluations.push({at:row.at,predicted:predict.occupiedPercent,
    actual:Math.round(100*row.occupied/row.total),absoluteError:Math.abs(predict.occupiedPercent-100*row.occupied/row.total)});
 }
 const days=new Set(evaluations.map(x=>x.at.slice(0,10))).size;
 if(evaluations.length<4||days<2)return {ready:false,evaluated:evaluations.length,days,
  reason:'Too few holdout samples for meaningful quality assessment'};
 const mae=evaluations.reduce((s,x)=>s+x.absoluteError,0)/evaluations.length;
 return {ready:true,evaluated:evaluations.length,days,maePercentagePoints:Math.round(mae*10)/10,
  validation:'Temporal forward-only backtest; user-supplied observations, subject to sampling bias',
  statisticallyCalibrated:false};
}
function isVehicleResolvable(scene){
 const gsd=Number(scene?.gsdMeters),cloud=Number(scene?.cloudPercent);
 return Boolean(scene?.rightsConfirmed&&Number.isFinite(gsd)&&gsd>=0.05&&gsd<=0.5&&
  (!Number.isFinite(cloud)||cloud<=20));
}
return {grid,checked,sanitize,append,coverage,estimate,backtest,isVehicleResolvable};
});