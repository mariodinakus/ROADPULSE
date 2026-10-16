# ROADPULSE — Traffic & Parking

A responsive Greek/English mobile-first traffic + parking web app featuring a **real 3D globe** and map, parking places from OpenStreetMap, driving routes, location support, favorites and an **optional real-time TomTom traffic layer**. Dark and light modes. Built for GitHub → Vercel.

## What's real (and what isn't)

| Feature | Source | API key | Limitations |
|---|---|---|---|
| 2D worldwide map, 3D globe, labels | MapLibre GL JS + OpenFreeMap / OSM | No | Map tiles may occasionally be unavailable |
| Parking locations and recorded capacities | OpenStreetMap via Overpass | No | Mapped capacity is **not** vacant spaces; coverage and tags vary |
| Fee / covered / street-side classification | OpenStreetMap tags | No | An absent fee tag means **unknown**, not free |
| Address/city search on explicit submit | Photon / komoot public demo | No | Rate-limited, best-effort; no guarantee |
| Driving route and non-live travel estimate | OpenStreetMap / OSRM public demonstration server | No | Not traffic-aware; best-effort; not for high-volume production |
| Live colored traffic flow | TomTom Orbis Traffic Flow API v2 | **Yes** | Requires developer API key and suitable plan; provider coverage & costs apply |
| Live vacant parking spaces | Not available in this version | — | Needs a real operator/city capacity or sensor feed |
| My location | Browser geolocation, permission-based | No | Works on HTTPS/localhost with user permission |
| Favorites, theme, language | Browser local storage | No | Local to browser/device |

The app does **not** invent congestion values, free spaces, occupancy percentages or parking prices. Without TomTom configuration the traffic toggle is disabled and the app offers a clearly labeled link to Google Maps traffic view. Traffic is overlaid as real raster tiles only when properly connected.

## Deploy to Vercel

1. Create a GitHub repository, and upload all files **at the project root**, keeping `api/` and `assets/` folders intact.
2. In [Vercel](https://vercel.com/new), import the GitHub repository.
3. Set **Framework Preset: Vite**. Vite framework; the Vercel build installs MapLibre and packages the JS locally. Vercel build command: `npm run build`; output directory `dist`. Deploy.
4. Parking, globe, map and routing use external public services and can work immediately on deployment.
5. To activate live traffic, create a TomTom developer key with Orbis Traffic Flow API access. In Vercel → Project → Settings → Environment Variables, create `TOMTOM_API_KEY` for Production (and Preview if wanted). Then **redeploy**.
6. The key is only referenced in `/api/traffic.js` (server-side) and is never embedded in browser scripts or map URL sent to TomTom directly.

For local serverless development, run `npx vercel dev` inside the folder (Vercel CLI required). Directly opening `index.html` is **not** enough for parking, search, traffic and routing because `/api/*` functions must be served.

## Environment variables

```
TOMTOM_API_KEY=your_actual_key_here
APP_PUBLIC_URL=https://your-project.vercel.app
```

Do not commit real credentials. Change env vars in Vercel and redeploy if needed.

## Main files

- `index.html`: accessible UI, panels, map and mobile navigation
- `style.css`: responsive dark/light design
- `app.js`: client state, map and globe, localization, filters, geolocation, map controls
- `api/parking.js`: sanitized, bounded Overpass request
- `api/search.js`: explicit Photon geocoding (no autocomplete spam)
- `api/route.js`: OSRM driving route (not traffic-aware)
- `api/traffic.js`: secure TomTom Orbis raster tile proxy
- `api/config.js`: public feature availability flags without exposing keys
- `manifest.webmanifest`, `sw.js`: installable web app / offline **shell**, not offline mapping

## Privacy and operating notes

- Geolocation is optional. It stays in the browser unless the user explicitly searches parking or plans a route; in that case coordinates are sent to this deployment and the relevant mapping providers. Browser data is stored locally for language, theme and favorites.
- Shared/public Photon, OSRM and Overpass infrastructure is for modest demo/personal use; traffic-layer API quotas must match your use. For a high-traffic public service, obtain supported hosted APIs or self-host the geocoder/router/Overpass data.
- Traffic tiles are cached briefly on Vercel/CDN; live refers to the upstream provider's recently updated flow observations, not second-by-second guaranteed accuracy.
- The service worker deliberately does not cache `/api/*` or external map tiles. Offline navigation/traffic is **not** provided.
- Do not use route estimates as a substitute for safety-critical navigation or road-closure instructions.

## Source documentation

- [MapLibre GL JS globe](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-a-vector-map/)
- [OpenFreeMap](https://openfreemap.org/)
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Photon](https://github.com/komoot/photon)
- [OSRM demo terms](https://routing.openstreetmap.de/about.html)
- [TomTom Orbis Raster Flow v2](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-flow/raster-flow-tiles)
- [OpenStreetMap license](https://www.openstreetmap.org/copyright)

## Next extensions

Real vacant parking spaces require licensed municipality/operator APIs. A scalable production release should add telemetry/monitoring, edge rate-limiting, a contracted geocoder/router, provider quota handling and dedicated accessibility testing on device.

## October 2026 map resilience upgrade

- MapLibre GL 6.14.0 is now bundled locally by Vite, removing the previous fragile unpkg runtime dependency.
- The no-key vector basemap uses OpenFreeMap Liberty/Dark. If the vector source fails to initialize, the application switches to the OpenStreetMap raster map (also no API key; OSM tile usage limits apply).
- Both 2D and 3D globe use MapLibre GL, which requires WebGL support from the user's device/browser.
- The free parking service attempts multiple Overpass API instances concurrently and remains subject to upstream availability and rate limiting. No fake vacancies or occupancy numbers.
- Live TomTom traffic still requires the optional TomTom key; the map/globe never require it.
- New warm ivory, cobalt, periwinkle and coral UI palette; dark version uses midnight-blue.

## Keyless resilient maps (v2.1)
The default 2D map and 3D globe use MapLibre GL and OpenStreetMap tiles without API keys. If tile loading fails, the app retries with OpenFreeMap. If WebGL is unavailable, a standard OpenStreetMap iframe is shown instead. These public tile services still require an internet connection, allow fair-use only, and may have temporary outages. Live road-traffic overlays still need a licensed provider.

If a previous version persists in a browser, clear site data once. This release unregisters earlier ROADPULSE service workers and removes legacy app shell caches to reduce staleness.

## Security and data rights (v2.2)

- Production TomTom key is loaded only server-side. Never commit or copy it to browser code or public issue reports. Production deployment must be triggered after a key is set.
- Traffic raster tiles are proxied through a fixed TomTom URL with integer coordinates, a 9–18 zoom range, no arbitrary upstream URL and a 1 MiB response cap. Errors never print secrets. Cache duration is two minutes on the CDN.
- Configure edge/WAF IP-based rate limiting for `/api/traffic` to protect paid/free third-party quota. No application-level in-memory rate limit is claimed, since serverless instances are distributed.
- CSP and browser security headers block external script injection, prevent embedding this site in third-party frames, and restrict external map/font access to named providers.
- `public/legal.html` documents the OpenStreetMap ODbL, OpenFreeMap and TomTom notices and basic privacy limitations. The original UI/code rights are separate from the providers' map data and their licenses.
- This is a public, anonymous app. Security cannot guarantee immunity from attacks. Activate GitHub/Vercel MFA, restrict collaborator permissions, and monitor TomTom quota.


## Abuse guard (2026-10)

- `/api/traffic` has IP-based fixed-window throttling (180 requests/minute, 1200/day per IP **per warm serverless instance**), an upstream request budget per warm instance (250/minute, 2500/day), and maximum eight concurrent TomTom requests per warm instance.
- Identical tiles are deduplicated while downloading, cached in a short-lived process cache, and cached at the CDN edge for two minutes; failures are never cached.
- Basic cross-origin hotlink checks apply, without claiming to block non-browser clients. Anonymous IP hashes, using an ephemeral per-instance salt, exist only in memory and expire with the runtime.
- **Security limitation:** Warm-function memory is not shared between Vercel instances; this is *best-effort* abuse protection, **not globally enforceable rate limiting** or a hard spending cap. For an enforceable per-user/per-account limit, activate Vercel WAF / an external shared Redis rate limiter, and configure TomTom account quota alerts or limits as available. Vercel Firewall API currently returns `404 Seawall Config not found` in this account.
- See `/legal.html` for data attribution and copyright. Never commit TomTom keys. Production secret is `TOMTOM_API_KEY`, stored as a Sensitive Environment Variable on Vercel.
