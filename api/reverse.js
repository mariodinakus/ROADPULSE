'use strict';
const {protect}=require('../lib/abuse-guard.cjs');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','private,no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const lat=Number(req.query.lat),lon=Number(req.query.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)
    return res.status(400).json({error:'Invalid coordinates'});
  const rate=protect(req,res,{name:'reverse-address',perMinute:14,perDay:170,totalPerMinute:75});
  if(!rate.ok)return rate.response;
  const key=String(process.env.TOMTOM_API_KEY||'').trim().replace(/^["']|["']$/g,'');
  if(!key)return res.status(503).json({error:'Reverse geocoding not configured'});
  try{
    const lang=req.query.lang==='en'?'en-GB':'el-GR';
    const endpoint='https://api.tomtom.com/search/2/reverseGeocode/'+lat.toFixed(6)+','+lon.toFixed(6)+'.json?'+new URLSearchParams({key,radius:'60',language:lang});
    const upstream=await fetch(endpoint,{signal:AbortSignal.timeout(9000),headers:{Accept:'application/json'}});
    if(!upstream.ok)throw Error('Reverse geocode failed');
    const data=await upstream.json(),a=data.addresses?.[0]?.address||{};
    const clean=(s,n=120)=>String(s??'').replace(/[<>]/g,'').slice(0,n);
    const street=[a.streetName,a.streetNumber].filter(Boolean).join(' ');
    const neighbourhood=clean(a.municipalitySubdivision||a.neighbourhood||'');
    const city=clean(a.municipality||a.countrySecondarySubdivision||'');
    return res.status(200).json({label:clean(street||a.freeformAddress||neighbourhood||city||'Coordinates'),
      neighbourhood,city,source:'TomTom Reverse Geocoding',live:false});
  }catch(error){return res.status(502).json({error:'Address unavailable; GPS coordinates remain valid'});}
};