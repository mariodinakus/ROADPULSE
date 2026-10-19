# ROADPULSE 3.8 — The city, decoded.

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

## 3.7 — Real field-observation evidence (local-only)

ROADPULSE's Parking Pressure Lab now has **Field Observations** for in-person counting of legal parking bays (total surveyed vs observed empty). The user must explicitly confirm an on-site count and move the map centre to the measured area. Observations are separated by type: THESi-marked on-street bays, other street bays and off-street lots. The THESi type is **user-entered and unverified**, never official provider occupancy.

**Privacy and persistence:** The app stores no individual GPS coordinates or vehicle plates in its records. It stores an approximate 260-metre projected grid ID, the timestamp, parking category, and integer counts using browser `localStorage` (maximum 250 observations, up to 120 days). It uploads **nothing** to Vercel, TomTom, THESi or GitHub. Data stays per browser/device. Export as JSON, remove an individual observation, or erase all local observations.

**Statistical behavior:** At least six records across at least three dates, with at least two samples near the target hour, are required before a sample-based occupancy projection is displayed. A temporal kernel smoother reports the estimated occupied share of the voluntarily observed **sample**, not a live vacancy count, the percentage of all legal bays, or official THESi occupancy. Forecast horizons are now, +30, +60 and +120 minutes. Sensitivity ranges are intentionally **not calibrated confidence intervals**. Predictions are withheld for unsupported areas, parking categories and hours.

A chronological backtest checks only previous observations when predicting subsequent ones; it reports a mean absolute occupancy-percentage-point error only after at least three held-out cases on two different dates. Observations may be biased, user-entered incorrectly or unrepresentative of the neighborhood; the resulting model is not citywide, not independently verified, not an accurate satellite inventory and **not trained on a statistically representative population**. Synthetic test fixtures are used in development but are never published as real occupancy.

Files:
- `public/parking-evidence-core.js` — input validation, approximate location grid, 120-day retention, prediction, rolling evaluation.
- `public/parking-evidence.js` / `.css` — in-browser recording, visualization and JSON export.
- `tests/parking-evidence.test.cjs` — input integrity, geographic/type segregation, limits and backtests.

**Provider availability:** TomTom has an on-street probability API and an off-street availability API, but those products require a separately approved commercial entitlement and coverage verification. The existing traffic key does not guarantee access. Official THESi maps provide legal parking zones, not authenticated public per-bay live vacancy values. Roadpulse intentionally does not scrape these services.

## 3.8 — Satellite basemap and click-through Area Intelligence

**Satellites / aerial imagery:** select `▧ Δορυφόρος / Satellite` in the 2D map style chooser. The raster renderer uses Esri **World Imagery** (public World_Imagery map tiles), first trying `server.arcgisonline.com`, then `services.arcgisonline.com`, and falling back to a conventional street basemap if imagery tiles fail. Both allowed imagery hosts are explicitly listed in `vercel.json`'s image CSP. The imagery is a mosaic of satellite/aerial acquisitions with varying spatial resolution and unspecified individual capture dates in this app; it is **not live**, is not always recent or high-resolution enough to classify individual spaces, and ROADPULSE does **not** detect cars or available spaces using computer vision. Credits to Esri/World Imagery source providers remain visible; external usage is governed by Esri/service conditions.

**Orange circles:** raster-map orange incident pins, which previously only recentered on click, now open the Area Intelligence panel. A click shows the provider-reported incident type, severity, road segment, delay and distance when given, plus nearby traffic analysis from sampled live TomTom flow. Clicking any empty map point inspects that location, while clicking a blue parking marker inspects a mapped facility. Blue clusters still zoom instead of representing free spots. Existing route-selection clicks continue to choose route endpoints.

**Area model disclosure:** the side inspector shows a 0–100 **parking demand scenario** for the selected coordinates over now, 30, 60 and 120 minutes, including a decomposed time/day baseline, urban-centrality assumption, and optional user-selected rain/event scenarios. These are model assumptions, not calibrated parking occupancy or observed vacancies. It separately shows any sufficient user-entered occupancy observations stored in this browser, with explicit provenance. Short-horizon **traffic** projections at +15/30/60/120 minutes require fresh live TomTom flow samples for the same clicked coordinates; missing/stale observations yield no prediction. Projection ranges are sensitivity bands, not calibrated confidence intervals or promised route travel times. The panel lets the user switch into Parking Pressure Lab with the inspected centre.

Security and attribution: map tiles and traffic endpoints are drawn from fixed hosts. The TomTom API key remains server-side and all API rate limits remain unchanged. URLs, GPS and map markers cannot provide real-time parking occupancy by themselves. Provider incidents are not satellite observations.
