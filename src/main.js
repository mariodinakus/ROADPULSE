import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
maplibregl.setWorkerUrl(workerUrl);
window.maplibregl = maplibregl;
import('../app.js').catch(error => {
  console.error('ROADPULSE startup:', error);
  const node = document.getElementById('map');
  if (node) node.innerHTML = '<div class="map-load-error">Δεν ήταν δυνατή η εκκίνηση του χάρτη. Ανανέωσε τη σελίδα.</div>';
});
