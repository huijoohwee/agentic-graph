# Legacy agentic-graph Site Selection Widget (Retail / Residential) — Geospatial Knowledge Graph (KG)

Status: Draft (MVP-first)  
Last updated: 2026-04-25  

> Legacy planning note: this draft still references an older RxDB-era local-first design. The current authority is Git-backed authored Markdown/frontmatter; D1 and the browser-local store are structured and working projections.

## 0) Executive summary

This document specifies a **Retail/Residential Site Selection** feature for **agentic-graph** that:

- Builds a **geospatial Knowledge Graph** (candidates ⇄ trade areas ⇄ POIs/competitors ⇄ metrics ⇄ multimedia evidence).
- Renders the result on the existing **map + canvas** surface (MapLibre/GrabMaps) and uses the existing **FastGrid Graph Data Table** for analysis.
- Integrates with:
  - **GrabMaps Search & Discover Places** (Places keyword search + nearby search)
  - **GrabMaps Route & Navigate** (Directions / route distance, duration, geometry)
  - **Turf.js** for trade areas, spatial joins, and metrics.
- Complies with **TCO, FOSS, and token performance/economics** by defaulting to deterministic compute + caching and keeping LLM usage optional and bounded.

The MVP runs **local-first** (RxDB inside the canvas app). Optional **PostgreSQL JSONB** persistence is defined as a publish/sync extension (not required for MVP).

---

## 1) Goals / Non-goals

### 1.1 Goals (MVP)

1. **Create candidate sites** (retail or residential) with location, metadata, and evidence.
2. **Define trade areas** around candidates (radius rings, isochrone-like approximations, polygons).
3. **Discover nearby POIs** (amenities, competitors, transit, schools, etc.) via GrabMaps Places APIs.
4. **Compute metrics** per candidate:
   - counts by category within trade area(s)
   - distance-to-nearest competitor
   - route time/distance to anchor POIs (CBD, transit stations, malls, etc.)
   - simple composite scores (weighted)
5. **Render as KG**:
   - nodes/edges for candidates, trade areas, POIs, categories, metrics, evidence
   - interactive selection sync with table and map
6. **Analyze with FastGrid table**:
   - Candidate comparison table (metrics columns)
   - POI table with category + distance + within-trade-area flags

### 1.2 Non-goals (MVP)

- Full production backend and authentication (beyond existing dev/preview middleware patterns).
- Proprietary GIS engines or paid geocoding beyond GrabMaps.
- Heavy ML/LLM “auto-decision” agents. LLM stays optional for summarization only.

---

## 2) Architecture fit (agentic-graph reality check)

### 2.1 Current relevant capabilities (already in repo)

- **Geospatial mode + Map rendering**: MapLibre is already in dependencies; GrabMaps provides authenticated style and routing endpoints via a **same-origin proxy** (`/__grabmaps_proxy`) with BYOK or server-managed auth.
- **GrabMaps integration patterns**:
  - Places search and nearby queries exist in UI (example: GrabMaps Discovery Widget).
  - Routing/directions are documented and proxied.
- **FastGrid Graph Data Table**:
  - The graph table uses **RxDB** and can infer columns from node/edge properties.
  - Good fit for site-selection metrics (wide tables, sortable, filterable).

### 2.2 Recommended implementation style (TCO-first)

**MVP**: keep everything **in-canvas (frontend)**:

- Store Site Selection KG state in:
  1) the graph (GraphData nodes/edges + properties)
  2) RxDB GraphTable (derived view for analysis)
  3) optionally workspace markdown docs for narrative/evidence

**Optional publish/sync**: Postgres JSONB for persistence and share links:

- Use coarse batch endpoints (push/pull) to minimize infra + cost.
- Avoid JSONB GIN indexes until you have proven query patterns.

---

## 3) Data model (GraphData SSOT + RxDB tables + optional Postgres JSONB)

### 3.1 GraphData SSOT (canonical KG)

Use existing `GraphData` (nodes + edges). The Site Selection widget introduces the following **node/edge type conventions**:

#### Node types

1. `SiteCandidate`
   - `properties` (suggested):
     - `geo:lat`, `geo:lng`
     - `site:kind`: `"retail" | "residential"`
     - `site:label`: display label
     - `site:status`: `"shortlist" | "rejected" | "neutral"`
     - `site:notes`: text
     - `site:score:total`: number
     - `site:score:breakdown`: JSON (weights + component scores)

2. `TradeArea`
   - `properties`:
     - `geo:geometry`: GeoJSON Polygon/MultiPolygon (stringified JSON if needed)
     - `trade:method`: `"radius" | "polygon" | "custom"`
     - `trade:radiusKm`: number (when radius-based)

3. `PlacePOI`
   - `properties`:
     - `grab:place_id` (if available from response)
     - `poi:name`, `poi:address`
     - `geo:lat`, `geo:lng`
     - `poi:category` (normalized)
     - `poi:source`: `"grabmaps"`
     - `poi:raw`: JSON (small/trimmed; do not store huge payloads)

4. `Metric`
   - `properties`:
     - `metric:key` (e.g., `competitors.count.within_1km`)
     - `metric:value` (number/string)
     - `metric:unit` (e.g., `count`, `km`, `min`)
     - `metric:computedAtMs`
     - `metric:method`: `"turf" | "grabmaps" | "manual"`

5. `EvidenceMedia`
   - `properties`:
     - `media:type`: `"image" | "video" | "pdf" | "url" | "markdown"`
     - `media:url` (or proxied URL if needed)
     - `media:caption`
     - `media:license` (for compliance)

#### Edge labels

- `has_trade_area`: `SiteCandidate -> TradeArea`
- `contains_poi`: `TradeArea -> PlacePOI`
- `near_poi`: `SiteCandidate -> PlacePOI` (use when not modeling explicit polygon containment)
- `has_metric`: `SiteCandidate -> Metric`
- `supported_by`: `SiteCandidate -> EvidenceMedia` (or `Metric -> EvidenceMedia`)
- `competes_with`: `SiteCandidate -> PlacePOI` (when `PlacePOI` is competitor)

### 3.2 FastGrid Graph Data Table (RxDB) mapping

The Graph Table auto-sync derives columns from node/edge properties. For Site Selection, prefer **node properties** to keep analysis simple.

Recommended table views:

1. **Candidates (nodes table filtered by `type=SiteCandidate`)**
   - key columns:
     - `site:kind`, `site:status`
     - `geo:lat`, `geo:lng`
     - `site:score:total`
     - metric rollups as columns (see §5.4)

2. **POIs (nodes table filtered by `type=PlacePOI`)**
   - key columns:
     - `poi:category`
     - `poi:name`, `poi:address`
     - `poi:distanceKm:min` (min distance to any candidate)
     - `poi:withinTradeArea:<id>` boolean (optional; can be heavy if many polygons)

3. **Edges table**
   - Used mainly for graph exploration; not primary analytic view.

### 3.3 Optional PostgreSQL JSONB schema (publish/sync)

If/when you add a server runtime, store documents as JSONB to preserve SSOT:

- `site_selection_workspaces`:
  - `id`, `owner_id`, timestamps
  - `document_jsonb` (contains candidates, settings, weights, references)
- `graph_snapshots`:
  - `id`, `workspace_id`, timestamps
  - `graph_jsonb` (GraphData)
- `media_refs`:
  - metadata + signed URLs (if you later use object storage)

Cost guidance:

- Start with `(workspace_id, updated_at)` B-tree indexes only.
- Add JSONB GIN indexes only once you have a proven query pattern.

---

## 4) GrabMaps integration (Search + Routes)

### 4.1 Authentication + proxy (required for browser safety)

Use the existing **GrabMaps proxy middleware**:

- Path: `GRABMAPS_PROXY_PATH` (in code: `grph-shared/src/geospatial/grabMapsSsot.ts`)
- Request pattern:
  - `GET /__grabmaps_proxy?url=<https://maps.grab.com/...>`
  - headers:
    - `x-kg-grabmaps-auth-mode: byok | serverManaged`
    - `x-kg-grabmaps-api-key: <token>` (BYOK only)

This keeps secrets out of the browser bundle (server-managed mode) and prevents non-GrabMaps SSRF by whitelisting `maps.grab.com`.

### 4.2 Places: Search & Discover Places

Endpoints used (SSOT: GrabMaps docs):

1. Keyword search:
   - `GET https://maps.grab.com/api/v1/maps/poi/v1/search`
   - query params (typical):
     - `keyword`
     - `country` (ISO alpha-3, e.g., `SGP`)
     - `location="lat,lon"` (bias)
     - `limit`

2. Nearby search:
   - `GET https://maps.grab.com/api/v1/maps/place/v2/nearby`
   - params:
     - `location="lat,lon"` (required)
     - `radius` (km)
     - `limit`
     - `rankBy=distance|popularity`
     - `language`

**Normalization guidance**:

- Places APIs often vary response field shapes. Keep a small normalization layer:
  - `name`, `address`, `lat`, `lon`, `category`, `place_id` (if available)
- Store the trimmed raw payload in `poi:raw` **only if bounded** (e.g., < 20KB per POI).

### 4.3 Routes: Route & Navigate (Directions)

Endpoint used:

- `GET https://maps.grab.com/api/v1/maps/eta/v1/direction`

Key params:

- `coordinates` (repeat): `"lng,lat"` by default
- `overview=full` to include route geometry
- `profile=driving|walking|cycling|...`
- optional: `alternatives`, `avoid`, `geometries=polyline6`, `lat_first=false`

Widget usage patterns:

- Compute **route time/distance** from candidate → anchor POIs
- Optionally store:
  - `route:distanceMeters`, `route:durationSeconds`
  - `route:geometry` (polyline6) only when needed for visualization

Cost guidance:

- Cache route calls by key: `profile|origin|destination|avoid|overview`.
- Prefer `overview=false` when you only need time/distance (smaller payload).

---

## 5) Turf.js integration (trade areas + metrics)

### 5.1 Required Turf modules

Already present in canvas dependencies:

- `@turf/helpers`
- `@turf/bbox`

Recommended additions (small + common):

- `@turf/circle` (radius trade areas)
- `@turf/boolean-point-in-polygon` (containment test)
- `@turf/distance` (distance in km)
- `@turf/nearest-point` (nearest competitor)
- `@turf/area` (polygon area)

### 5.2 Trade area methods (MVP)

1. **Radius rings**
   - Use `turf.circle(center, radiusKm)` to build polygon.
   - Typical radii:
     - Retail: 0.5km / 1km / 2km
     - Residential: 1km / 2km / 5km (depending on market)

2. **Custom polygon**
   - Draw or import GeoJSON polygon (future enhancement).

### 5.3 Spatial joins

For each candidate and each trade area polygon:

- Assign `contains_poi` edges from TradeArea to POI when point-in-polygon is true.
- Derive metrics:
  - counts by category (competitors, transit, schools, etc.)
  - density metrics (count / area)

### 5.4 Scoring (deterministic, explainable)

Define weights in a widget config (stored in node properties or a dedicated config node):

- Example components:
  - `competitors_within_1km` (lower is better)
  - `transit_within_500m` (higher is better)
  - `route_to_cbd_minutes` (lower is better)

Scoring recommendation:

- Normalize each metric into [0,1] via min/max or fixed thresholds.
- Score = Σ(weight_i * normalized_i)
- Store:
  - `site:score:total`
  - `site:score:breakdown` JSON with per-component contributions

This keeps the system **token-free** for core ranking and produces explainable outcomes.

---

## 6) UI/UX: Widget specification (map + canvas + table)

### 6.1 Where the widget lives

Recommended: add as a **MainPanel → Maps tab section** (because it is inherently geospatial) and/or a Storyboard Widget node (for repeatable workflows).

MVP placement:

- MainPanel → Maps (mode=`maps`) already exists and is a good home for:
  - settings, docs, and “run” actions

### 6.2 Primary user flows

1. **Create candidate**
   - input: label + lat/lng (or search place → pick result)
   - output: `SiteCandidate` node created and selected

2. **Build trade area**
   - choose radius (km) or preset ring set
   - output: `TradeArea` nodes + `has_trade_area` edges
   - map: draw polygon overlays

3. **Discover POIs**
   - choose categories and max radius
   - call GrabMaps Nearby for each candidate (or each ring)
   - output: `PlacePOI` nodes + edges

4. **Compute metrics**
   - run Turf joins + optional GrabMaps Directions to anchors
   - output: Metric nodes + candidate properties (for table columns)

5. **Compare candidates**
   - table view filtered to candidates
   - sort by total score; inspect breakdown

### 6.3 FastGrid table contract

To maximize table usefulness:

- Put “final” metrics on the **candidate node properties**:
  - e.g., `metric:competitors:count:within_1km = 12`
  - e.g., `metric:route:cbd:minutes = 18`
- Keep verbose raw payloads out of candidate nodes; store raw per-POI as needed.

This makes the graph-table auto-inference immediately helpful without building a custom table.

---

## 7) Token performance / economics

### 7.1 Default: zero-token core loop

The widget should be fully functional without any LLM calls:

- place discovery: GrabMaps Places
- trade area + metrics: Turf.js
- table + graph: existing renderer

### 7.2 Optional: bounded LLM summarization (if enabled)

If you want narrative output (e.g., “why this site ranks #1”), do it as:

- One-shot summary per candidate (max ~150–250 tokens output).
- Input context should be **small and structured**:
  - candidate label + top N metrics + top N nearby POIs
- Cache summary by `(candidateId, metricsSignature)` so it does not rerun on every UI change.

### 7.3 Caching strategy (high ROI)

- Cache keys:
  - Places:
    - `places.search|country|location|keyword|limit`
    - `places.nearby|location|radius|rankBy|limit|language|category`
  - Routes:
    - `directions|profile|origin|dest|avoid|overview`
- TTL guidance:
  - Places: 10–60 minutes depending on UX
  - Routes: 1–24 hours (depends on traffic sensitivity; you can store “computedAtMs”)

---

## 8) FOSS + TCO recommendations (what to keep / what to avoid)

### 8.1 Recommended stack (already aligned)

- **Map rendering**: MapLibre GL JS (FOSS) + GrabMaps style/tiles via proxy
- **Spatial compute**: Turf.js (FOSS)
- **Local-first persistence**: RxDB (already in repo)
- **Server persistence (optional)**: PostgreSQL JSONB (open source)

### 8.2 Avoid (for this feature)

- Heavy geo backends (PostGIS-only solutions) for MVP: increases infra and ops.
- Storing large third-party payloads in JSONB: raises storage + compliance risk.
- LLM-driven “agents” for scoring: high cost + low determinism; hard to validate.

---

## 9) Implementation checklist (MVP)

1. **Add widget UI entrypoint** in MainPanel → Maps tab:
   - “Site Selection” section with:
     - Create candidate
     - Add trade area rings
     - Discover POIs (category presets)
     - Compute metrics + scoring
     - Export (GraphData JSON/JSON-LD)
2. **Data creation helpers**:
   - create/update nodes + edges in graph store
   - compute and write candidate metric properties
3. **GrabMaps calls**:
   - use `/__grabmaps_proxy` + headers
   - normalize Place results
   - optionally call Directions (overview minimized when possible)
4. **Turf metrics**:
   - ring polygons + point-in-polygon
   - distance-to-nearest
5. **FastGrid table**:
   - rely on existing syncGraphData→GraphRecordDb; ensure metrics are on candidate properties

---

## 10) Appendix: Example property keys (suggested SSOT)

Candidate:

- `site:kind` = `retail`
- `site:status` = `shortlist`
- `geo:lat` / `geo:lng`
- `site:score:total` = `0.73`
- `metric:competitors:count:within_1km` = `12`
- `metric:amenities:count:within_1km` = `48`
- `metric:route:cbd:minutes` = `18`
- `site:score:breakdown` = `{ "competitors": -0.12, "amenities": 0.21, "route_cbd": 0.18, "weights": {...} }`

POI:

- `poi:category` = `supermarket`
- `poi:name` = `...`
- `poi:address` = `...`
- `geo:lat` / `geo:lng`
- `poi:source` = `grabmaps`
- `grab:place_id` = `...`

TradeArea:

- `trade:method` = `radius`
- `trade:radiusKm` = `1`
- `geo:geometry` = `{"type":"Polygon","coordinates":[...]}`
