/* ROADPULSE City Atlas: 2D-only. No WebGL or globe bundle. */
import('../app.js').catch(error=>{
  console.error('ROADPULSE application initialization failed',error);
  const host=document.getElementById('map');
  if(!host)return;
  try{
    const map=new window.RoadPulseRasterMap(host,{lat:40.634,lon:22.944,zoom:12});
    window.__roadpulseEmergencyRaster=map;
  }catch{
    host.innerHTML='<iframe title="OpenStreetMap" style="width:100%;height:100%;border:0" src="https://www.openstreetmap.org/export/embed.html?bbox=22.91%2C40.61%2C22.97%2C40.66&layer=mapnik"></iframe>';
  }
});