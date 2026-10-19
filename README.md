# ROADPULSE 3.5 — The city, decoded.

Responsive GR/EN city mobility map for GitHub + Vercel. The new version uses bundled MapLibre GL, a real TomTom Orbis traffic flow overlay, Orbis traffic incidents (when permitted), TomTom Search POI parking data (when permitted), OpenStreetMap map tiles and OSRM routing, plus verified official THESi/ParkPal **external links** for Thessaloniki.

## What is real

- **Live traffic**: TomTom Orbis raster tiles through a server-side proxy; never ship the `TOMTOM_API_KEY` to browsers. Every traffic tile image returned from TomTom is a real provider response.
- **Incidents**: live TomTom Orbis Incident Details within a geographic window; if the plan doesn't allow this service, a transparent error appears, not invented incidents.
- **Parking**: TomTom Search POI results. These are mapped lots, not actual vacant spaces. Fee data is unknown unless independently verified; filtering cannot magically infer fees.
- **THESi/ParkPal**: outbound links to https://thesi.gr/ and https://thessaloniki.parkpal.gr/. **No ParkPal internal API integration or scraping.** The posted THESi fare is historical/current as published by the municipality and must be verified on-site.
- **Road routes**: TomTom Routing API with live traffic-aware journey time and provider-derived congestion delay where authorized. Transparently falls back to public OSRM (estimated times without live traffic) when TomTom is unavailable. Both services have usage limits; OSRM demo has no production SLA.
- **Map / globe**: MapLibre GL + OpenStreetMap map tiles; no map API key, subject to publicly hosted tile usage rules and browser WebGL support.

## Secure Vercel deployment

Set a **Sensitive Production environment variable** named `TOMTOM_API_KEY`. Never commit keys to GitHub. Existing `/api/traffic.js` includes per-warm-instance traffic abuse limits and a cache. `/api/incidents.js` and `/api/places.js` also have bounded queries, timeouts, and per-instance request limits. This is NOT distributed rate limiting: for real public traffic deploy Vercel WAF/rate limiting and a global quota budget.

## Run locally

`npm install` then `npm run dev`. To test the serverless endpoints use `vercel dev` with your own local secret. `npm run build` creates `dist/`; the Vercel project uses the Vite framework with output directory `dist`.

All map data © OpenStreetMap contributors (ODbL), traffic © TomTom. THESi and ParkPal are unaffiliated external services; trademarks belong to their owners. No guarantee of parking vacancy or route times.


## 3.1 — WebGL-independent map reliability

The default 2D map runs on a self-hosted, dependency-free raster tile renderer (`public/raster.js`) and OpenStreetMap tiles, with Carto fallback. It supports dragging, zoom, live TomTom raster traffic overlay, clickable map coordinates, incident/parking markers, and route polylines. It does not depend on MapLibre, WebGL or a CDN JavaScript library. 3D Globe loads MapLibre lazily on explicit request and reverts to the raster map if unavailable. TomTom's key stays server-side in Vercel and only traffic imagery is served through `/api/traffic`.

**Tile usage:** © OpenStreetMap contributors (ODbL); respect OSM tile usage policy. Traffic © TomTom. The non-WebGL fallback does not represent parking occupancy.

## 3.5 — Predictive Pressure Labs

The existing **Parking Pressure Lab** and **Traffic Pressure Lab** now include explicit *projections*.

**Parking Pressure** uses a deterministic, explainable hour-of-day/day-of-week demand curve with an urban-centre proximity factor and two optional user-defined scenarios (rain and local event). It provides 24 hourly scores (0–100), a quieter/busier daytime comparison, and sensitivity ranges. **It is not parking occupancy, vacant-space probability, or a trained model.** No live parking-occupancy dataset is present.

**Traffic Pressure** starts with sampled TomTom Traffic Flow Segment Data (up to five road segments around the selected map point) from `/api/pressure`. It provides projections for +15, +30, +60, and +120 minutes, combining measured current slowdown with exponential persistence decay toward an *assumed*, location- and weekday-aware time profile. It declines to forecast if the input is missing, non-live, or more than 12 minutes old. **These are unvalidated model scenarios, not proven future traffic estimates.** The low/high ranges are sensitivity bands, **not** statistically calibrated confidence intervals.

UI: `public/prediction-engine.js` (pure numerical engine), `public/prediction-ui.js` and `public/prediction-ui.css` (presentation), `public/civic.js` and `public/pressure-labs.js` (existing Lab integration). Existing endpoint security, provider limits and server-side TomTom credential handling remain unchanged.

To run local checks: `npm test`. Model unit tests: `tests/prediction.test.cjs`. To turn the scenarios into trustworthy, location-specific statistical predictions, persist sampled speeds with user consent and provider-compliant storage, gather historical parking occupancy from authorized operators/sensors, train on temporal holdouts and publish out-of-sample errors by horizon and geographic segment.

## 3.6 — THESi official maps and satellite evidence

The Parking section has an **explicitly user-initiated** embedded map with two modes sourced from official THESi/ParkPal pages:
- Visitor (white) bays: https://www.thesi.gr/map/?residents=false
- Resident (blue) bays: https://www.thesi.gr/map/?visitors=false

The user can open either in a full external tab if the third-party embedded site fails to render. Embedded map content is operated by THESi/ParkPal; ROADPULSE does not scrape, persist, or infer any real-time vacancies or expose a TomTom credential to the iframe. A dedicated satellite evidence block explains that no licensed high-resolution, timestamped satellite imagery feed is integrated and that image-derived vacancies cannot be assumed to remain vacant. A municipal parking GIS dataset last modified in September 2017 was identified but deliberately **not** presented as a current parking dataset.

The cross-origin frame is requested only after the user selects “View official map”. CSP allows framing the specific THESi site. No general third-party framing is enabled.
