/* ROADPULSE / Street search PRIORITY (not probability).
 * OSM geometries and parking tags are infrastructure context, never observed empty bays.
 * The score is an assumption-driven relative index; cannot be interpreted as vacancy odds.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.RoadPulseStreetCore=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const no=new Set(['no','none','prohibited','private','customers','permit','permit_holders','residents']);
const yes=new Set(['yes','parallel','diagonal','perpendicular','marked','on_street','street_side','half_on_kerb','on_kerb','lane']);
function eligibility(tags={}){
 const highway=String(tags.highway||'');
 if(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','footway','cycleway','path','pedestrian','steps','construction','proposed'].includes(highway))return {status:'excluded',reason:'This type of road is not assumed to allow street parking'};
 if(no.has(String(tags.access||'').toLowerCase())||no.has(String(tags.motor_vehicle||'').toLowerCase()))return {status:'excluded',reason:'OSM indicates restricted access'};
 const lane=[tags['parking:lane:left'],tags['parking:lane:right'],tags['parking:lane:both'],tags['parking:left:orientation'],tags['parking:right:orientation'],tags['parking:both:orientation']].filter(Boolean).map(x=>String(x).toLowerCase());
 const conditions=[tags['parking:condition:left'],tags['parking:condition:right'],tags['parking:condition:both'],tags['parking:left:restriction'],tags['parking:right:restriction'],tags['parking:both:restriction']].filter(Boolean).map(x=>String(x).toLowerCase());
 if(conditions.some(x=>/residents|permit|private|no_parking|no_stopping/.test(x)))return {status:'restricted',reason:'OSM includes parking restrictions; verify signs'};
 if(lane.length&&lane.every(x=>no.has(x)||x==='no_parking'||x==='no_stopping'))return {status:'excluded',reason:'OSM parking tags explicitly disallow parking'};
 if(lane.some(x=>yes.has(x)))return {status:'tagged',reason:'OSM parking-lane tag exists (not vacancy evidence)'};
 return {status:'unknown',reason:'No positive legal parking information is mapped for this segment'};
}
function priority(road,{date,hour,lat,lon}={}){
 const elig=eligibility(road.tags||{});
 if(elig.status==='excluded')return {...elig,score:null,tier:'unknown'};
 const d=typeof date==='string'&&/^\d{4}-\d\d-\d\d$/.test(date)?new Date(date+'T12:00:00Z'):new Date();
 const weekday=Number.isNaN(d.getTime())?1:d.getUTCDay(),h=clamp(Number(hour)||0,0,23);
 const engine=typeof window!=='undefined'?window.RoadPulsePrediction:null;
 let pressure=54;
 if(engine?.parkingHour&&engine?.locality){
  try{pressure=engine.parkingHour(h,weekday,engine.locality(Number(lat)||road.lat,Number(lon)||road.lon).centrality,false,false)}catch{}
 }else{
  const work=weekday>0&&weekday<6;
  pressure=30+(work&&h>=8&&h<=19?26:8)+(h>=18&&h<=22?11:0);
 }
 const kind=road.tags?.highway||'residential';
 const roadFactor=({residential:-9,living_street:-11,unclassified:-5,tertiary:8,secondary:12,service:3})[kind]??4;
 // Positive score means more promising search; these offsets are heuristic ONLY.
 const score=clamp(Math.round(100-pressure-roadFactor+(elig.status==='tagged'?12:0)),3,95);
 const tier=elig.status==='restricted'?'restricted':score>=56?'promising':score>=37?'mixed':'difficult';
 return {...elig,score,tier,assumptionBased:true,calibrated:false,probability:null};
}
function distanceKm(a,b,c,d){
 const k=Math.PI/180,dlat=(c-a)*k,dlon=(d-b)*k;
 const v=Math.sin(dlat/2)**2+Math.cos(a*k)*Math.cos(c*k)*Math.sin(dlon/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(v)));
}
function rank(roads,settings){
 return roads.map(road=>({...road,...priority(road,settings)}))
 .filter(x=>x.tier!=='unknown'&&x.tier!=='restricted')
 .sort((a,b)=>(b.score??0)-(a.score??0));
}
return {eligibility,priority,rank,distanceKm};
});