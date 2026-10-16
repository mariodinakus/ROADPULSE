module.exports = async function handler(req,res) {
  if(req.method!=='GET')return res.status(405).end();
  const coords=['fromLat','fromLon','toLat','toLon'].map(k=>Number(req.query[k]));
  if(coords.some(n=>!Number.isFinite(n))||Math.abs(coords[0])>85||Math.abs(coords[2])>85||Math.abs(coords[1])>180||Math.abs(coords[3])>180){return res.status(400).json({error:'Invalid route coordinates'});}
  const [a,b,c,d]=coords;
  const p=`${b},${a};${d},${c}`;
  // Public OSRM is demonstration infrastructure: no live traffic and no production SLA.
  try {
    const r=await fetch(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${p}?overview=full&geometries=geojson&steps=false`,{
      headers:{'User-Agent':'RoadPulse/1.0 (OSRM OpenStreetMap attribution)'},signal:AbortSignal.timeout(12000)
    });
    if(!r.ok)throw new Error('Routing unavailable');
    const data=await r.json();
    const route=data.routes?.[0];
    if(!route?.geometry?.coordinates?.length)return res.status(404).json({error:'No drivable route found'});
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=90');
    return res.status(200).json({geometry:route.geometry,distanceKm:Math.round(route.distance/100)/10,minutes:Math.max(1,Math.round(route.duration/60)),trafficAware:false,source:'OSRM / OpenStreetMap'});
  }catch{return res.status(503).json({error:'Routing is temporarily unavailable'});}
};
