# ROADPULSE 3.0 — The city, decoded.

Responsive GR/EN city mobility map for GitHub + Vercel. The new version uses bundled MapLibre GL, a real TomTom Orbis traffic flow overlay, Orbis traffic incidents (when permitted), TomTom Search POI parking data (when permitted), OpenStreetMap map tiles and OSRM routing, plus verified official THESi/ParkPal **external links** for Thessaloniki.

## What is real

- **Live traffic**: TomTom Orbis raster tiles through a server-side proxy; never ship the `TOMTOM_API_KEY` to browsers. Every traffic tile image returned from TomTom is a real provider response.
- **Incidents**: live TomTom Orbis Incident Details within a geographic window; if the plan doesn't allow this service, a transparent error appears, not invented incidents.
- **Parking**: TomTom Search POI results. These are mapped lots, not actual vacant spaces. Fee data is unknown unless independently verified; filtering cannot magically infer fees.
- **THESi/ParkPal**: outbound links to https://thesi.gr/ and https://thessaloniki.parkpal.gr/. **No ParkPal internal API integration or scraping.** The posted THESi fare is historical/current as published by the municipality and must be verified on-site.
- **Road routes**: OSRM public OpenStreetMap demo, estimated travel times **without current traffic**. No API key needed. Provider has usage limits and no production SLA.
- **Map / globe**: MapLibre GL + OpenStreetMap map tiles; no map API key, subject to publicly hosted tile usage rules and browser WebGL support.

## Secure Vercel deployment

Set a **Sensitive Production environment variable** named `TOMTOM_API_KEY`. Never commit keys to GitHub. Existing `/api/traffic.js` includes per-warm-instance traffic abuse limits and a cache. `/api/incidents.js` and `/api/places.js` also have bounded queries, timeouts, and per-instance request limits. This is NOT distributed rate limiting: for real public traffic deploy Vercel WAF/rate limiting and a global quota budget.

## Run locally

`npm install` then `npm run dev`. To test the serverless endpoints use `vercel dev` with your own local secret. `npm run build` creates `dist/`; the Vercel project uses the Vite framework with output directory `dist`.

All map data © OpenStreetMap contributors (ODbL), traffic © TomTom. THESi and ParkPal are unaffiliated external services; trademarks belong to their owners. No guarantee of parking vacancy or route times.
