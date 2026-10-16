'use strict';
/* ROADPULSE Parking Atlas: multi-source facilities, not live free-space inference. */
const {protect}=require('../lib/abuse-guard.cjs');
const cache=new Map();
const OSM_MIRRORS=['https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
const RAD=Math.PI/180;
function meters(a,b,c,d){
 const lat=(c-a)*RAD,lon=(d-b)*RAD;
 const z=Math.sin(lat/2)**2+Math.cos(a*RAD)*Math.cos(c*RAD)*Math.sin(lon/2)**2;
 return 12742000*Math.atan2(Math.sqrt(z),Math.sqrt(Math.max(0,1-z)));
}
function safe(s,max=140){return String(s??'').trim().slice(0,max)}
function url(s){const value=safe(s,280);return /^https:\/\/[^\s<>"']+$/i.test(value)?value:null}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
async function fromTomTom(lat,lon,key){
 if(!key)return [];
 const p=new URLSearchParams({key,lat:String(lat),lon:String(lon),radius:'4500',limit:'100',language:'el-GR'});
 const r=await fetch('https://api.tomtom.com/search/2/categorySearch/parking.json?'+p,{
  signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}
 });
 if(!r.ok)throw Error('TomTom POI '+r.status);
 const data=await r.json();
 return (Array.isArray(data.results)?data.results:[]).map((p,i)=>{
  const a=num(p.position?.lat),b=num(p.position?.lon);
  if(a===null||b===null)return null;
  const poi=p.poi||{};
  return {id:'tt-'+safe(p.id||i,80),lat:a,lon:b,name:safe(poi.name||'Parking'),
   address:safe(p.address?.freeformAddress,180),phone:safe(poi.phone,45)||null,url:url(poi.url),
   source:'TomTom',kind:'garage',distanceMeters:Math.round(meters(lat,lon,a,b)),
   fee:'unknown',priceText:null,feeSource:null,capacity:null,access:'unknown',
   openingHours:null,vacancies:null};
 }).filter(Boolean);
}
async function fromOSM(lat,lon){
 const radius=4200;
 const query='[out:json][timeout:12];(nwr(around:'+radius+','+lat+','+lon+')["amenity"="parking"];nwr(around:'+radius+','+lat+','+lon+')["parking"="street_side"];);out center 250;';
 async function call(base){
  const r=await fetch(base+'?'+new URLSearchParams({data:query}),{
   signal:AbortSignal.timeout(13500),
   headers:{Accept:'application/json','User-Agent':'ROADPULSE/3.2 (+https://github.com/mariodinakus/ROADPULSE)'}
  });
  if(!r.ok)throw Error('OSM '+r.status);
  const data=await r.json();if(!Array.isArray(data.elements))throw Error('Invalid OSM response');
  return data.elements;
 }
 // One winning mirror only, no unnecessary further calls after first success.
 const rows=await Promise.any(OSM_MIRRORS.map((mirror,i)=>(async()=>{
  if(i)await new Promise(resolve=>setTimeout(resolve,1400));
  return call(mirror);
 })()));
 return rows.map(p=>{
  const tags=p.tags||{},a=num(p.lat??p.center?.lat),b=num(p.lon??p.center?.lon);
  if(a===null||b===null||tags.access==='private'||tags.access==='no')return null;
  const d=meters(lat,lon,a,b);if(d>radius+250)return null;
  const access=safe(tags.access||'unknown',25),fee=tags.fee==='yes'?'paid':tags.fee==='no'?'free':'unknown';
  const cap=Number.parseInt(tags.capacity,10),priceText=safe(tags.charge||tags['charge:conditional']||'',85)||null;
  const parkingType=safe(tags.parking||'surface',30);
  const display=parkingType==='street_side'?'Στάθμευση παρά την οδό':
   ['multi-storey','underground'].includes(parkingType)?'Στεγασμένο πάρκινγκ':'Χώρος στάθμευσης';
  return {id:'osm-'+p.type+'-'+p.id,lat:a,lon:b,name:safe(tags.name||display),
   address:safe(tags['addr:street']?tags['addr:street']+' '+(tags['addr:housenumber']||''):'',180),
   phone:safe(tags.phone,45)||null,url:url(tags.website||tags['contact:website']),
   source:'OpenStreetMap',kind:parkingType,distanceMeters:Math.round(d),
   fee,priceText,feeSource:priceText?'OpenStreetMap (δηλωμένη τιμή)':fee!=='unknown'?'OpenStreetMap':null,
   capacity:Number.isInteger(cap)&&cap>0&&cap<100000?cap:null,access,
   openingHours:safe(tags.opening_hours,100)||null,vacancies:null};
 }).filter(Boolean);
}
function combined(primary,secondary){
 const list=[...primary];
 for(const p of secondary){
  let near=list.find(x=>meters(x.lat,x.lon,p.lat,p.lon)<18);
  if(near){
   near.source=near.source===p.source?near.source:'TomTom + OpenStreetMap';
   if(p.priceText&&!near.priceText){near.priceText=p.priceText;near.feeSource=p.feeSource}
   if(near.fee==='unknown'&&p.fee!=='unknown')near.fee=p.fee;
   if(!near.capacity&&p.capacity)near.capacity=p.capacity;
   if(!near.openingHours&&p.openingHours)near.openingHours=p.openingHours;
   if(near.access==='unknown'&&p.access!=='unknown')near.access=p.access;
   if(!near.address&&p.address)near.address=p.address;
   if(near.kind==='garage'&&p.kind!=='surface')near.kind=p.kind;
  }else list.push(p);
 }
 return list.sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,220);
}
module.exports=async function(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const lat=num(req.query.lat),lon=num(req.query.lon);
 if(lat===null||lon===null||Math.abs(lat)>85||Math.abs(lon)>180)return res.status(400).json({error:'Invalid coordinates'});
 const rate=protect(req,res,{name:'parking-atlas',perMinute:10,perDay:350,totalPerMinute:75});
 if(!rate.ok)return rate.response;
 const cacheKey=lat.toFixed(3)+','+lon.toFixed(3),old=cache.get(cacheKey);
 if(old&&Date.now()-old.at<300000){res.setHeader('Cache-Control','public,max-age=0,s-maxage=240');return res.status(200).json(old.data)}
 let key=safe(process.env.TOMTOM_API_KEY||'',300).replace(/^["']|["']$/g,'');
 const sources=await Promise.allSettled([fromTomTom(lat,lon,key),fromOSM(lat,lon)]);
 const t=sources[0].status==='fulfilled'?sources[0].value:[];
 const o=sources[1].status==='fulfilled'?sources[1].value:[];
 if(sources.every(x=>x.status==='rejected')){
  if(old)return res.status(200).json({...old.data,stale:true});
  return res.status(503).json({error:'No parking providers available'});
 }
 const items=combined(t,o);
 const data={items,count:items.length,sources:{tomtom:t.length,osm:o.length},
  source:'TomTom Search + OpenStreetMap',asOf:new Date().toISOString(),
  liveOccupancy:false,priceCoverage:items.filter(x=>x.priceText).length,
  disclaimer:'Parking objects are mapped locations, not guaranteed available spaces. OSM fees may be outdated.'};
 cache.set(cacheKey,{data,at:Date.now()});
 if(cache.size>35)cache.delete(cache.keys().next().value);
 res.setHeader('Cache-Control','public,max-age=0,s-maxage=240,stale-while-revalidate=120');
 return res.status(200).json(data);
};