/* ROADPULSE Satellite Observatory: live STAC catalog lookup, NOT live parking imagery.
 * Sentinel-2 pixels are >=10 m; no vehicle or vacant-bay detection is performed.
 * Fixed upstream and bounded query; never accept an arbitrary remote URL.
 */
const ENDPOINT='https://earth-search.aws.element84.com/v1/search';
const clean=(v,min,max)=>Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
const W=86400000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 const lat=clean(req.query.lat,-80,80),lon=clean(req.query.lon,-180,180);
 if(lat===null||lon===null)return res.status(400).json({error:'Invalid coordinates'});
 const days=clamp(Math.round(Number(req.query.days)||60),7,90);
 const span=0.045,bbox=[clamp(lon-span,-179.999,179.999),clamp(lat-span,-79.999,79.999),
   clamp(lon+span,-179.999,179.999),clamp(lat+span,-79.999,79.999)];
 const until=new Date(),from=new Date(until.getTime()-days*W);
 const q=new URLSearchParams({
  collections:'sentinel-2-l2a',bbox:bbox.join(','),
  datetime:from.toISOString()+'/'+until.toISOString(),limit:'30',sortby:'-properties.datetime'
 });
 try{
  const r=await fetch(ENDPOINT+'?'+q,{headers:{Accept:'application/geo+json, application/json'},signal:AbortSignal.timeout(10500)});
  if(!r.ok)throw Error('catalogue_'+r.status);
  const data=await r.json();
  if(!Array.isArray(data.features))throw Error('invalid_stac_response');
  const items=data.features.filter(f=>f&&f.id&&f.properties?.datetime).map(f=>{
   const capturedAt=new Date(f.properties.datetime);
   if(!Number.isFinite(capturedAt.getTime())||capturedAt>until||capturedAt<from)return null;
   const cloud=Number(f.properties['eo:cloud_cover']);
   const cloudPercent=Number.isFinite(cloud)?clamp(cloud,0,100):null;
   const self=(f.links||[]).find(l=>l.rel==='self'&&typeof l.href==='string'&&l.href.startsWith('https://earth-search.aws.element84.com/'));
   return {id:String(f.id).slice(0,180),captureAt:capturedAt.toISOString(),provider:'Copernicus / Sentinel-2',
     platform:String(f.properties.platform||'Sentinel-2').slice(0,80),
     gsdMeters:10,cloudPercent,sourceUrl:self?.href||null,
     suitableForCarDetection:false,suitableForBayOccupancy:false,
     limitation:'10m pixels cannot resolve individual cars or free curbside bays'};
  }).filter(Boolean).sort((a,b)=>b.captureAt.localeCompare(a.captureAt)).slice(0,16);
  res.setHeader('Cache-Control','public,max-age=0,s-maxage=1800,stale-while-revalidate=1800');
  return res.status(200).json({source:'Element 84 Earth Search STAC / Copernicus Sentinel-2 L2A',
   checkedAt:until.toISOString(),bbox,lookbackDays:days,catalogueOnly:true,
   liveImage:false,liveParkingOccupancy:false,resolutionMeters:10,items,
   explanation:'Acquisition time is from STAC metadata, not satellite-bitmap display time. Esri basemap capture date remains unknown. Sentinel-2 is not capable of counting curbside cars.'});
 }catch(e){
  res.setHeader('Cache-Control','no-store');
  return res.status(503).json({error:'Satellite catalogue temporarily unavailable',liveImage:false,items:[]});
 }
};
