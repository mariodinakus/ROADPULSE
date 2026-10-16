module.exports = async function handler(req,res) {
  if (req.method !== 'GET')return res.status(405).end();
  const query=String(req.query.q||'').trim().slice(0,100);
  if(query.length<3)return res.status(400).json({error:'Enter at least 3 characters'});
  try {
    const lang=req.query.lang==='en'?'en':'el';
    const p=new URLSearchParams({q:query,limit:'7',lang});
    const lat=Number(req.query.lat),lon=Number(req.query.lon);
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=85&&Math.abs(lon)<=180){p.set('lat',String(lat));p.set('lon',String(lon));}
    const r=await fetch(`https://photon.komoot.io/api/?${p}`,{
      headers:{'User-Agent':'RoadPulse/1.0 (city mobility demo)'},signal:AbortSignal.timeout(9000)
    });
    if(!r.ok)throw new Error('Search provider unavailable');
    const data=await r.json();
    const items=(data.features||[]).slice(0,7).map(f=>({
      lat:f.geometry?.coordinates?.[1],lon:f.geometry?.coordinates?.[0],
      name:[f.properties?.name,f.properties?.city||f.properties?.county,f.properties?.country].filter(Boolean).join(', '),
      detail:[f.properties?.street,f.properties?.housenumber].filter(Boolean).join(' ')
    })).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon));
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=1800');
    return res.status(200).json({items,source:'Photon / OpenStreetMap'});
  } catch {
    return res.status(503).json({error:'Search unavailable right now'});
  }
};
