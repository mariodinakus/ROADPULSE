const instances = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

function distanceKm(a,b,c,d) {
  const rad = Math.PI/180, dLat=(c-a)*rad, dLon=(d-b)*rad;
  const k = Math.sin(dLat/2)**2 + Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dLon/2)**2;
  return 12742 * Math.atan2(Math.sqrt(k), Math.sqrt(1-k));
}

module.exports = async function handler(req,res) {
  if (req.method !== 'GET') return res.status(405).end();
  const lat=Number(req.query.lat), lon=Number(req.query.lon);
  const radius=Math.min(4500,Math.max(500,Number(req.query.radius)||2500));
  if (!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180) {
    return res.status(400).json({error:'Invalid coordinates'});
  }
  const q=`[out:json][timeout:16];(nwr(around:${Math.round(radius)},${lat},${lon})["amenity"="parking"];nwr(around:${Math.round(radius)},${lat},${lon})["parking"="street_side"];);out center 260;`;
  async function fetchFrom(instance){
    // Several public Overpass mirrors reject POST while the same query works via GET.
    const endpoint=instance+'?'+new URLSearchParams({data:q}).toString();
    const r=await fetch(endpoint,{
        method:'GET', headers:{Accept:'application/json','User-Agent':'ROADPULSE/2.3 (OSM attribution; https://github.com/mariodinakus/ROADPULSE)'},
        signal:AbortSignal.timeout(14500)
      });
      if(!r.ok) throw Error('OSM HTTP '+r.status);
      const data=await r.json();
      if (!Array.isArray(data.elements)) throw Error('Invalid Overpass response');
      const entries=[];
      const seen=new Set();
      for(const item of data.elements){
        const tags=item.tags||{};
        if(['private','no','customers','permit'].includes(tags.access)) continue;
        const pLat=Number(item.lat??item.center?.lat),pLon=Number(item.lon??item.center?.lon);
        if(!Number.isFinite(pLat)||!Number.isFinite(pLon)) continue;
        const id=`${item.type}/${item.id}`;
        if(seen.has(id)) continue;
        seen.add(id);
        const distance=distanceKm(lat,lon,pLat,pLon);
        if(distance>radius/1000+0.2)continue;
        const cap=parseInt(tags.capacity,10);
        entries.push({id,lat:pLat,lon:pLon,
          name:String(tags.name||(['multi-storey','underground'].includes(tags.parking)?'Στεγασμένος χώρος στάθμευσης':tags.parking==='street_side'?'Στάθμευση παρά την οδό':'Χώρος στάθμευσης')).slice(0,120),
          type:String(tags.parking||'surface'), fee:tags.fee==='yes'?'paid':tags.fee==='no'?'free':'unknown',
          capacity:Number.isInteger(cap)&&cap>0&&cap<100000?cap:null,
          wheelchair:tags['capacity:disabled']||null,
          access:tags.access||'unknown',
          openingHours:tags.opening_hours?String(tags.opening_hours).slice(0,110):null,
          website:(tags.website&&/^https?:\/\//.test(tags.website))?tags.website:null,
          distanceKm:Math.round(distance*100)/100
        });
      }
      entries.sort((a,b)=>a.distanceKm-b.distanceKm);
      return {items:entries.slice(0,160),count:entries.length,source:'OpenStreetMap / Overpass',asOf:new Date().toISOString(),liveOccupancy:false};
  }
  // Two providers in parallel avoids long serial timeouts in serverless functions.
  try {
    const payload=await Promise.any(instances.map(async (instance,index)=>{
      if(index>0)await new Promise(resolve=>setTimeout(resolve,1400));
      return fetchFrom(instance);
    }));
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=240, stale-while-revalidate=600');
    return res.status(200).json(payload);
  }catch(error){
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({error:'OpenStreetMap parking providers are currently unreachable. Please retry.'});
  }
};
