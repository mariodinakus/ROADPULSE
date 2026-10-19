/* OSM street geometry for short-range parking exploration.
 * Do not equate OSM parking metadata with actual real-time vacancy. */
const mirrors=['https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const EARTH=6371;
function km(a,b,c,d){
 const k=Math.PI/180,u=Math.sin((c-a)*k/2)**2+Math.cos(a*k)*Math.cos(c*k)*Math.sin((d-b)*k/2)**2;
 return 2*EARTH*Math.asin(Math.min(1,Math.sqrt(u)));
}
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const lat=Number(req.query.lat),lon=Number(req.query.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>80||Math.abs(lon)>180)return res.status(400).json({error:'Invalid coordinates'});
 const radius=clamp(Math.round(Number(req.query.radius)||600),300,850);
 const a=Math.round(lat*10000)/10000,b=Math.round(lon*10000)/10000;
 const query='[out:json][timeout:15];way(around:'+radius+','+a+','+b+')["highway"~"^(residential|living_street|unclassified|tertiary|secondary|service)$"];out geom 250;';
 async function read(host,index){
  if(index)await new Promise(r=>setTimeout(r,700*index));
  const url=host+'?'+new URLSearchParams({data:query});
  const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'ROADPULSE/4.0; OpenStreetMap credited (https://github.com/mariodinakus/ROADPULSE)'},signal:AbortSignal.timeout(16500)});
  if(!response.ok)throw Error('Overpass '+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload.elements))throw Error('Invalid OSM response');
  const items=payload.elements.map(e=>{
   if(e.type!=='way'||!Array.isArray(e.geometry)||e.geometry.length<2)return null;
   const points=e.geometry.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).slice(0,120).map(p=>[+p.lon,+p.lat]);
   if(points.length<2)return null;
   const mid=points[Math.floor(points.length/2)],distance=km(a,b,mid[1],mid[0]);
   const raw=e.tags||{},keys=['highway','name','access','motor_vehicle','parking:lane:left','parking:lane:right','parking:lane:both','parking:condition:left','parking:condition:right','parking:condition:both','parking:left:orientation','parking:right:orientation','parking:both:orientation','parking:left:restriction','parking:right:restriction','parking:both:restriction'];
   const tags={};for(const key of keys)if(typeof raw[key]==='string')tags[key]=raw[key].slice(0,70);
   return {id:String(e.id),name:String(raw.name||'').slice(0,90),tags,geometry:points,lat:mid[1],lon:mid[0],distanceKm:Math.round(distance*100)/100};
  }).filter(x=>x&&x.distanceKm<=radius/1000+.2).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,130);
  return {items,source:'OpenStreetMap / Overpass',asOf:new Date().toISOString(),observationType:'mapped road geometry and parking tags',liveVacancies:false,satelliteAnalysis:false};
 }
 try{
  const result=await Promise.any(mirrors.map(read));
  res.setHeader('Cache-Control','public,max-age=0,s-maxage=900,stale-while-revalidate=3600');
  return res.status(200).json(result);
 }catch{
  res.setHeader('Cache-Control','no-store');
  return res.status(503).json({error:'OSM street data is temporarily unavailable'});
 }
};