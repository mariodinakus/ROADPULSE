// Load the application independently of WebGL: raster 2D is always available.
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
window.RoadPulseLoadGlobe = async () => {
  const lib = await import('maplibre-gl');
  lib.setWorkerUrl(workerUrl);
  window.maplibregl = lib;
  return lib;
};
import('../app.js').catch(error => {
  console.error('ROADPULSE app init failed:', error);
  // Keep a working street map even when another module fails.
  const host = document.getElementById('map');
  if (!host) return;
  try {
    const raster = new window.RoadPulseRasterMap(host, {lat:40.634,lon:22.944,zoom:12});
    window.__roadpulseEmergencyRaster = raster;
  } catch {
    host.innerHTML = '<iframe title="OpenStreetMap" style="width:100%;height:100%;border:0" src="https://www.openstreetmap.org/export/embed.html?bbox=22.91%2C40.61%2C22.97%2C40.66&layer=mapnik"></iframe>';
  }
});
