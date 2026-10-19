/* ROADPULSE PREDICTION ENGINE 1.0
   Assumption-driven demand model and observation-anchored short-horizon traffic extrapolation.
   These are NOT trained ML models, measured parking occupancy, or statistically calibrated intervals.
   Pure functions, with explicit uncertainty bands and source provenance. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RoadPulsePrediction=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null),function(){
  'use strict';
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const round=x=>Math.round(x);
  const gaussian=(x,mu,width)=>Math.exp(-0.5*((x-mu)/width)**2);
  const distance=(a,b,c,d)=>{
    const rad=Math.PI/180,p1=a*rad,p2=c*rad,delta=(d-b)*rad;
    const h=Math.sin((c-a)*rad/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(delta/2)**2;
    return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
  };
  const hubs=[
    {name:'Thessaloniki',lat:40.633,lon:22.944,zone:'Europe/Athens'},
    {name:'Athens',lat:37.975,lon:23.734,zone:'Europe/Athens'},
    {name:'Patras',lat:38.246,lon:21.735,zone:'Europe/Athens'},
    {name:'London',lat:51.507,lon:-0.128,zone:'Europe/London'}
  ];
  function locality(lat,lon){
    const a=Number(lat),b=Number(lon);
    if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>85||Math.abs(b)>180)
      throw Error('Invalid location');
    const points=hubs.map(h=>({...h,km:distance(a,b,h.lat,h.lon)})).sort((x,y)=>x.km-y.km);
    const nearest=points[0],urban=nearest.km<25;
    const centrality=urban?Math.exp(-Math.pow(nearest.km/4.3,1.6)):0.22;
    return {name:urban?nearest.name:'Generic urban baseline',zone:urban?nearest.zone:'Europe/Athens',centrality:clamp(centrality,.08,1),local:urban};
  }
  function parkingHour(hour,weekday,centrality,rain,event){
    const workday=weekday>=1&&weekday<=5;
    let p=23+centrality*16;
    if(workday) p+=21*gaussian(hour,9,1.8)+24*gaussian(hour,12.7,2.7)+20*gaussian(hour,19.3,2.7);
    else if(weekday===6) p+=26*gaussian(hour,12.3,2.5)+23*gaussian(hour,20.2,2.5);
    else p+=17*gaussian(hour,12.5,3)+19*gaussian(hour,19.3,2.7);
    p+=rain?7:0;
    p+=event?13:0;
    // Larger centres have more visitor demand. This is a qualitative assumption.
    p+=centrality*6*(gaussian(hour,12.5,4)+gaussian(hour,19.5,3));
    return round(clamp(p,6,96));
  }
  function parkingForecast({date,lat,lon,rain=false,event=false}){
    if(typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))throw Error('Invalid date');
    const d=new Date(date+'T12:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw Error('Invalid date');
    const loc=locality(lat,lon),wd=d.getUTCDay();
    const points=Array.from({length:24},(_,hour)=>{
      const score=parkingHour(hour,wd,loc.centrality,!!rain,!!event);
      const uncertainty=round(16+(1-loc.centrality)*5+((rain||event)?4:0));
      return {hour,score,low:clamp(score-uncertainty,0,100),high:clamp(score+uncertainty,0,100)};
    });
    const typicalHours=points.filter(p=>p.hour>=7&&p.hour<=22);
    const best=typicalHours.reduce((a,b)=>a.score<=b.score?a:b);
    const worst=typicalHours.reduce((a,b)=>a.score>=b.score?a:b);
    return {kind:'parking',date,locality:loc.name,points,best,worst,
      drivers:['time-of-day','weekday','distance-to-urban-core',...(rain?['manual-rain']:[]),...(event?['manual-event']:[])],
      source:'Scenario assumptions, not parking sensors',
      trained:false,measuredOccupancy:false,calibratedIntervals:false,
      description:'Pressure index (0-100). Uncertainty is a sensitivity range, not a probability or confidence interval.'};
  }
  function localHourAndDay(date,zone){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const part=k=>parts.find(p=>p.type===k)?.value;
    return {hour:Number(part('hour'))+Number(part('minute'))/60,
      day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday'))};
  }
  function baseTraffic(hour,day,centrality){
    const workday=day>=1&&day<=5,weekend=day===6;
    const morning=workday?32*gaussian(hour,8.5,1.5):weekend?10*gaussian(hour,11.5,2.3):2;
    const evening=workday?30*gaussian(hour,17.8,2):weekend?21*gaussian(hour,19,2.2):15*gaussian(hour,19,2.6);
    return clamp(6+(0.58+0.55*centrality)*(morning+evening),0,80);
  }
  function trafficForecast({snapshot,lat,lon,asOf}){
    if(!snapshot||snapshot.live!==true||!Array.isArray(snapshot.segments)||snapshot.segments.length<1)
      return null;
    const observed=Number(snapshot.slowdownIndex),count=Number(snapshot.sampleCount);
    const stamp=new Date(asOf||snapshot.asOf),now=Date.now();
    if(!Number.isFinite(observed)||observed<0||observed>100||!Number.isFinite(stamp.getTime()))
      return null;
    if(stamp.getTime()>now+2*60000||now-stamp.getTime()>12*60000)return null;
    const loc=locality(lat,lon),dayAndHour=localHourAndDay(stamp,loc.zone);
    const baseline=baseTraffic(dayAndHour.hour,dayAndHour.day,loc.centrality);
    const validConfidence=snapshot.segments.map(s=>Number(s.confidence)).filter(n=>Number.isFinite(n)&&n>=0&&n<=100);
    const samplePenalty=(5-clamp(count,1,5))*2.5;
    const confPenalty=validConfidence.length?Math.max(0,(75-validConfidence.reduce((a,b)=>a+b,0)/validConfidence.length)*.12):5;
    const points=[0,15,30,60,120].map(minutes=>{
      const moment=new Date(stamp.getTime()+minutes*60000);
      const at=localHourAndDay(moment,loc.zone);
      const futureBaseline=baseTraffic(at.hour,at.day,loc.centrality);
      const retention=Math.exp(-minutes/80);
      const score=minutes===0?round(observed):round(clamp(futureBaseline+(observed-baseline)*retention,0,100));
      const span=minutes===0?0:round(clamp(9+minutes*.17+samplePenalty+confPenalty,12,45));
      return {minutes,score,low:clamp(score-span,0,100),high:clamp(score+span,0,100)};
    });
    return {kind:'traffic',points,asOf:stamp.toISOString(),sampleCount:count,source:snapshot.source,
      measuredNow:true,trained:false,calibratedIntervals:false,
      description:'Current observation extrapolated with decay toward an assumed time-of-day baseline. Ranges are scenario sensitivity, not a statistical confidence interval.'};
  }
  return {parkingForecast,trafficForecast,locality,parkingHour,baseTraffic};
});
