import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// The MapLibre library is bundled with our own site: no browser CDN dependencies.
window.maplibregl = maplibregl;
import('../app.js').catch(error => {
  console.error('ROADPULSE startup:', error);
  const node = document.getElementById('map');
  if (node) node.innerHTML = '<div class="map-load-error">Δεν ήταν δυνατή η εκκίνηση του χάρτη. Ανανέωσε τη σελίδα.</div>';
});
