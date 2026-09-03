# agentic-graph × GrabMaps: Drone Flight Path Animation Overlay (TCO Recommendation)

## Context

- Dev repo: `${AG_GITHUB_ROOT}/agentic-graph` (**MainPanel Maps**)
- Prod artifact mirror: `${AG_GITHUB_ROOT}/huijoohwee/content/agentic-graph`
- Deployment: Cloudflare (`airvio.co/agentic-graph`)
- Reference docs: https://maps.grab.com/developer/documentation
- Constraint: **FORBID update code** (this document is recommendation only)

## Goal

Add a **drone flight-path animation overlay** on top of the existing **Route & Navigate** experience (GrabMaps + MapLibre canvas), showing:

1. A route polyline (already supported by existing routing tooling)
2. A “drone” moving along the route geometry over time (animated marker)
3. Optional: “progress trail” (partial polyline) + ETA/remaining distance

## What GrabMaps already provides (to minimize TCO)

### Routing API gives you “animation-grade” geometry

GrabMaps routing returns:
- `duration` (seconds), `distance` (meters)
- `legs` (per-segment duration/distance)
- `geometry`: **encoded polyline6** (high precision) when `overview=full`

Direction endpoint example:
- `GET /api/v1/maps/eta/v1/direction`
- Coordinates default order: **lng,lat** (or `lat_first=true`)

### Two web integration modes (choose based on maintainability)

1. **GrabMaps Library (builder-first)**: `GrabMapsBuilder` + `MapBuilder` (fastest parity with /my-maps)
2. **MapLibre GL JS (low-level)**: fetch style JSON via `GET /api/style.json?theme=...` with Bearer auth, then build your own MapLibre map

## Recommendation (lowest TCO): MapLibre-native animation layers (no extra canvas)

### Why this is the best TCO choice

Using MapLibre’s normal rendering pipeline keeps maintenance and runtime cost low:

- **No separate overlay canvas to maintain** (no re-projection, no resize sync bugs, fewer edge cases)
- **Map interactions “just work”** (pan/zoom/pitch/bearing) because MapLibre re-renders the symbol/line layers automatically
- **Performance scales better** than re-drawing everything in a second canvas each frame
- Works equally well for “Canvas Map” because MapLibre itself renders to a WebGL canvas

### High-level approach

1. **Get route geometry**
   - Call GrabMaps direction endpoint with `overview=full` to receive `routes[0].geometry` (polyline6).
2. **Decode geometry to a coordinate list**
   - Decode polyline6 into `[lng, lat]` points (ensure coordinate order consistency).
3. **Create 2 (or 3) MapLibre layers**
   - `route-line` (LineString) — full route (static)
   - `drone-point` (Point) — current drone position (updated per animation tick)
   - Optional `route-progress` (LineString) — subset of points up to the current index (updated at a lower frequency)
4. **Animate**
   - Use `requestAnimationFrame` (or a timed loop) to advance a distance/time cursor along the polyline.
   - Update only the **Point GeoJSON source** most frames; update the “progress line” less frequently (e.g., 4–10 Hz) to reduce churn.

### “Drone animation” logic (implementation detail notes)

- Prefer **distance-based interpolation** over “point index stepping”:
  - Precompute cumulative distances along the polyline.
  - Move drone by `speed_mps * delta_seconds` (or use route `duration` as a normalized timeline).
  - Interpolate between segment endpoints for smooth motion.
- If you want “realistic drone movement”:
  - Decouple drone speed from road-based route duration (roads ≠ air corridor).
  - Still reuse the route polyline as the **visual path**, but treat timing separately.

### UX suggestions (still low cost)

- Drone icon rotates with bearing:
  - Compute heading from previous point → next point.
- When route recalculates (new waypoints):
  - Fade out old drone/route layers, replace sources, fade in (avoid jarring jumps).

## Alternative (higher TCO): External Canvas overlay on top of the map container

Choose this only if you need custom rendering that MapLibre layers can’t easily do (e.g., complex particle systems, heat shimmer, custom antialiasing, shader effects).

### Costs / risks that increase TCO

- You must keep the overlay aligned with the map across:
  - zoom/pan/pitch/bearing changes
  - DPR / devicePixelRatio
  - container resizes
- You must re-project every point each frame:
  - `lng/lat -> screen pixel` mapping must come from the MapLibre map transform
  - redraw is required on every camera change (and often every animation tick)

### If you still do it

- Use a “passive overlay” approach:
  - A single `<canvas>` absolutely positioned above the map
  - Re-render only on:
    - animation ticks
    - `move`, `zoom`, `rotate`, `pitch` events
  - Avoid full redraws when possible (dirty-rect), but this is complexity (TCO trade-off).

## Integration notes for agentic-graph (Dev → Prod → Cloudflare)

### Recommended rollout (to minimize risk)

1. **Dev (MainPanel Maps) POC**
   - Render static route line from `routes[0].geometry`.
   - Add drone marker and simple animation.
2. **Stabilize + observability**
   - Ensure key management and error paths are explicit (no silent failures).
   - Add performance counters (FPS, source-update rate).
3. **Port to Prod**
   - Keep the animation logic as a small, isolated module (single responsibility).
4. **Cloudflare deploy**
   - Ensure API keys are environment-scoped and do not leak to logs.

### Key technical “gotchas”

- **Coordinate order**: GrabMaps routing defaults to **lng,lat**; only use `lat_first=true` if your entire pipeline expects `lat,lng`.
- **Geometry presence**: route `geometry` requires `overview=full`.
- **Attribution**: GrabMaps requires **© Grab | © OpenStreetMap contributors** attribution when rendering tiles.

## TCO summary (decision table)

| Option | Build effort | Maintenance | Performance | Fit for “drone animation overlay” | Recommendation |
|---|---:|---:|---:|---|---|
| **A. MapLibre layers (GeoJSON source + symbol/line layers)** | Low | Low | High | Excellent | **Yes (preferred)** |
| B. External Canvas overlay above the map | Medium–High | High | Medium–High (depends) | Good | Only if you need non-standard rendering |
| C. DOM/SVG overlay (absolute positioned divs) | Medium | Medium | Low–Medium | OK for simple marker | Not for smooth path animation at scale |

## Proposed “definition of done” for the first ship (MVP)

- Drone moves along a single route polyline smoothly (30–60 FPS target on desktop)
- Route recalculation swaps to the new polyline cleanly
- Animation can be started/stopped/reset without leaking timers
- No custom canvas overlay required

## References

- GrabMaps Developer Docs (index): https://maps.grab.com/developer/documentation  
- Initializing a map (builder + MapLibre options): https://maps.grab.com/developer/documentation/initializing-map  
- Route & Navigate (Directions API, polyline6 geometry, parameters): https://maps.grab.com/developer/documentation/routes  
- GrabMapsLib configuration (routing + overlays like pins/polygons): https://maps.grab.com/developer/documentation/ui-library-config  
