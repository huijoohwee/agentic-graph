---
title: "Cafe Location Methodology — Historical Fixture and Runtime Readiness"
doc_type: "Place Intelligence and Runtime Readiness Reference"
date: "2026-10-29"
source_provenance: {"repository": "huijoohwee/joohwee", "revision": "59e920337b5591943f10461d45af6b76ea24e1c5", "path": "huijoohwee-docs/agentic-graph-maps-places.md", "sha256": "9e867949c5b0579c9b7a66499f1487e5b6c45c6b7e71a31ba48fcd6828839f91", "restoration": "Recovered April 2026 source; historical observations and scores are unverified."}
readiness_provenance: {"repository": "github.com/huijoohwee/joohwee","revision": "4d9e20f669817603034f65d585fb4609680ff647","path": "undocumented-draft/prd-tad-adr-mvp-gtm-geostack.md","sha256": "e5beb85c4de4fca4b168030cf134937db29f74b492827796db30fdcae9c7644d","state": "untracked draft in joohwee-geostack-prd-scratch; this digest is current, while the immutable sequence-3 START snapshot remains earlier and unchanged"}
start_provenance: {"workflow": "workflow-5c9aed04dbb28e5a6ab268d422827b07", "sequence": 3, "manifest_digest": "b727b74e957b0a4906add3fb7b91372b5a46129c72adc533b432db765c1f33f6", "planning_sha256": "384d78022c9f9487a78e9c581fad76d48f0eef9ed26a1e326b2ff9b5b7be6f8f", "protected_base": "4d9e20f669817603034f65d585fb4609680ff647", "lane": "agent/device-0232231d4a19/geostack", "authority": false, "status": "created"}
runtime_readiness: {"status": "blocked", "local_rung": "undocumented", "delivered_rung": "undocumented", "production_effect_attempted": false, "evidence_scope": "synthetic local browser and document/map preview"}
---

# Cafe location methodology and runtime readiness reference

Companion to [the GeoStack readiness audit](agentic-graph-maps-places.md). The April 2026 place data, scores, endpoint names, and request bodies are historical and unverified. No provider request ran for this audit. Do not execute the request templates below until data rights, provider terms, a hard USD 0 cap or quota-deny behavior, and secret handling are verified.

## 1. Production runtime and cafe-location recommendation

**Runtime recommendation:** keep the MVP local-first. Load an operator-owned, licensed GeoJSON file; validate and emit the deterministic allowlist manifest; reuse Graph's existing GeoJSON parser and main Geo map for matching-feature selection, while search and category filtering stay in the directory. The active document map uses an explicit Markdown GeoJSON collection and replaces retained geographic nodes from an earlier selection; unrelated graph content stays available. Do not create a second map preview in the directory. Use the existing [logistics overview seed](agentic-graph-logistics-supply-chain-overview.md) as a separate synthetic path/distribution view through Graph's existing `SupplyChainOverview` and shared Timeline. Keep provider-backed basemaps optional. Do not add a browser API key or runtime provider request until commercial rights and a hard USD 0 boundary (or deny at quota exhaustion) are demonstrated. The current candidate is a synthetic local demo, not a production service.

**Cafe site recommendation:** none is supported by current evidence. The recovered TOPSIS values and surrounding business claims are historical parser fixtures, not current market observations. Footfall, competition, population, transit, rent, and customer-segment statements below have not been independently verified and must not guide a lease or investment decision.

Before producing a ranked site recommendation, require a current licensed dataset with source/date/coverage, reproduce the scoring from a checked decision matrix, validate each criterion and weight with the operator, and test demand with buyer interviews and the proposed $1 offer. A computed rank alone does not establish demand or commercial viability.

### Logistics-aware evaluation rubric — evidence required, not scored

The existing logistics scenario helps explain how a cafe may depend on inbound supply, transfer/distribution stages, local delivery, and reverse flows. It contains synthetic facilities and schematic connectors. It supplies no route geometry, street distance, ETA, transport cost, service coverage, capacity measurement, or cafe-candidate join. Do not convert its positions or timeline into operational evidence.

For a future recommendation, ask the operator to approve whether each factor matters and supply current, licensed, location-specific evidence. Do not assign weights until the criteria and trade-offs are reviewed. Record missing or incomparable inputs as unknown; do not impute a favorable result.

| Decision factor | Evidence needed for each candidate | Guard against |
|---|---|---|
| Supplier access and replenishment | Named supplier/origin, route source and profile, route date/window, distance/time/cost, delivery schedule, and terms | Straight-line proximity, a synthetic facility, or an unverified historical ETA |
| Distribution reach and capacity | Named hub/fulfillment partner, current served-area boundary, capacity and cut-off windows, evidence owner/date | Assuming that a nearby hub accepts this business or has capacity |
| Mode and transfer resilience | Available transport modes, transfer count, mode-specific constraints, disruption/exception history over a stated period | Counting illustrative road/rail/air/sea links as available service |
| Last-mile/customer access | Licensed route/access data for intended walking, transit, cycling, or delivery modes and time windows | Treating POI count or schematic connector length as travel time or demand |
| Reverse flows and waste | Verified pickup, packaging, returns, and waste collection service with schedule and cost | Assuming reverse logistics exists because the sample scenario shows a return leg |
| Operating viability | Candidate-specific occupancy/rent, loading access, hours, permits, and supplier delivery constraints, independently checked | Reusing historical rent, footfall, or permit claims |

Keep this rubric separate from the archived TOPSIS matrix below. If a future operator-approved matrix adds logistics, document source quality, missingness, uncertainty, weight sensitivity, and stop conditions before ranking. Do not treat multi-modal context as an automatic site score.

**Readiness remains blocked:** VCC-01/03/07/10/11, the strict 500 KiB chunk cap, provider/data rights and cost evidence, protected integration, production authorization, live readback, rollback, and telemetry are open. VCC-12 passes only for the local synthetic supply-chain view, shared event Timeline, and source separation; it does not establish route service or a cafe recommendation. See the linked audit for the measured local demo and exact blockers. No production effect was attempted.

**Path/routing boundary:** the logistics overview is an existing, separate local scenario. Its road, rail, air, and sea lines connect modeled facilities and journeys; they are schematic network legs, not navigable paths. Candidate-to-supplier/distributor routing, walking/driving ETA, network optimization, live schedules, and a cafe distribution score are not implemented or verified. Historical direction/navigation templates later in this file are archived reference material only and were not run.

**Live document/map UI check:** on 2026-10-28, the local Vite preview at `http://127.0.0.1:5173/` selected the canonical `/docs/workspace-seeds/agentic-graph-maps-places.md` source. The active fixture contains six named synthetic points and one coarse region over Singapore. FloatingPanel → Geo shows one Nearby Places panel and one Local POI Directory beside the existing geospatial settings; MainPanel Maps retains its settings without mounting another directory. The directory has no separate map or duplicate attribution card. Searching `Central` returns `Synthetic Demo Place Central`; selecting it selects the matching feature on the existing main map and reports `Selected on the shared map.` Earlier `/notes` copies and the prior Main Toolbar → Settings → Maps placement are historical; neither is the current UI path. This verifies local UI composition only. No production readback, provider-cost evidence, or production readiness is established.

**Canonical logistics UI verification:** selecting `/docs/workspace-seeds/agentic-graph-logistics-supply-chain-overview.md` rendered the existing synthetic facility/path view with its mode and journey controls. The existing BottomPanel Timeline displayed the Network events lane. Seeking `SC-2051 · Port review hold` selected that journey and advanced the shared playhead to 04:22. Selecting the canonical places seed removed the supply-chain view; returning to the logistics seed restored it. Four focused facility/path checks passed. This is local synthetic UI and scenario evidence only; it proves no road routing, distance/ETA, cost, optimization, service capacity, cafe-candidate join, provider use, or production behavior. No production effect or provider request occurred.

## 2. Historical methodology

### 2.1 Historical endpoint matrix (not verified)

| # | Endpoint | Method | Parameters per Call | Purpose |
|---|----------|--------|---------------------|---------|
| 1 | `/api/v1/maps/poi/v1/search` | GET | `keyword=cafe`, `country=SGP`, `limit=50` | National cafe POI discovery, baseline popularity ranking |
| 2 | `/api/v1/maps/place/v2/nearby` | GET | 7 locations × `radius=2.5km`, `rank_by=popularity`, `limit=50` | Per-location POI density & competition mapping |
| 3 | `search_places` (MCP) | POST | `query="cafe Singapore"`, `limit=50` | Library-level search cross-validation |
| 4 | `/api/v1/maps/eta/v1/direction` (navigation MCP) | POST | 7 × `{origin, dest}`, `profile=walking` | Walking time: candidate → nearest MRT station |
| 5 | `/api/v1/maps/eta/v1/direction` (navigation MCP) | POST | 7 × `{origin, dest=Raffles Place}`, `profile=driving` | Driving time: candidate → CBD (Raffles Place) |
| 6 | `nearby_search` (MCP) | POST | Same as #2 via library wrapper | Cross-validation of nearby results |

### 2.2 TOPSIS evaluation framework (historical)

#### Criteria Definition

| Criterion ID | Name | Type | Direction | Weight (`w_j`) | Rationale |
|--------------|------|------|-----------|---------------|-----------|
| **C1** | Cafe Competition Count (2.5km) | Quantitative | **Lower = Better (LB)** | **0.25** | Primary filter: fewer direct competitors = higher market share potential |
| **C2** | Total F&B Count (2.5km) | Quantitative | **Lower = Better (LB)** | **0.10** | F&B saturation proxy; high F&B = crowded food market |
| **C3** | Residential POI Count (2.5km) | Quantitative | **Higher = Better (HB)** | **0.15** | Population catchment proxy (HDB blocks = resident density) |
| **C4** | Shopping Mall / Retail POI Count (2.5km) | Quantitative | **Higher = Better (HB)** | **0.10** | Foot traffic driver; mall shoppers = weekend cafe patrons |
| **C5** | Walking Time to Nearest MRT (minutes) | Quantitative | **Lower = Better (LB)** | **0.15** | MRT accessibility = daily commuter footfall; < 5 min ideal |
| **C6** | Driving Time to CBD (Raffles Place, minutes) | Quantitative | **Target ~22 min (NTB)** | **0.05** | Too close (< 15 min) = high rent; too far (> 30 min) = loses weekend CBD visitors |
| **C7** | Total POI Return Count (2.5km) | Quantitative | **Higher = Better (HB)** | **0.10** | Area vibrancy indicator; more POIs = more economic activity |
| **C8** | Commercial Building Count (2.5km) | Quantitative | **Higher = Better (HB)** | **0.05** | Office worker catchment; weekday lunch crowd potential |

**Total Weight:** 1.00 (100%)

#### TOPSIS Algorithm Steps

```
Step 1: Build decision matrix X (m×n) where m=7 alternatives, n=8 criteria
Step 2: Normalize → R (vector normalization: r_ij = x_ij / √Σx_ij²)
Step 3: Weight → V (v_ij = w_j × r_ij)
Step 4: Determine PIS (V+) = max(HB) or min(LB) per column
Step 5: Determine NIS (V-) = min(HB) or max(LB) per column
Step 6: Compute D+ = √Σ(v_ij - v_j+)²  (distance to ideal)
Step 7: Compute D- = √Σ(v_ij - v_j-)²  (distance to anti-ideal)
Step 8: Compute C* = D- / (D+ + D-)  (relative closeness, 0→1)
Step 9: Rank by C* descending (higher = better)
```

---

## 3. Historical API request templates and field reference — NOT RUN

### 3.1 POI search request template

```bash
curl -G "https://maps.grab.com/api/v1/maps/poi/v1/search" \
  --data-urlencode "keyword=cafe" \
  --data-urlencode "country=SGP" \
  --data-urlencode "limit=50" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

| Parameter | Value | SSOT Key |
|-----------|-------|----------|
| keyword | `cafe` | `grabmaps.mcp.search.keyword` |
| country | `SGP` | `grabmaps.mcp.search.country` |
| limit | `50` | `grabmaps.mcp.search.limit` |

### 3.2 Nearby search request template (per location)

```bash
curl -G "https://maps.grab.com/api/v1/maps/place/v2/nearby" \
  --data-urlencode "location=1.3767,103.7626" \
  --data-urlencode "radius=2.5" \
  --data-urlencode "limit=50" \
  --data-urlencode "rankBy=popularity" \
  --data-urlencode "language=en" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

| Parameter | Value | Notes | SSOT Key |
|-----------|-------|-------|----------|
| location | `<lat>,<lng>` | Center point | `grabmaps.mcp.nearby.location` |
| radius | `2.5` | km ≈ 30 min walk | `grabmaps.mcp.nearby.radius_km` |
| limit | `50` | Max POIs | `grabmaps.mcp.nearby.limit` |
| rankBy | `popularity` | Sort key | `grabmaps.mcp.nearby.rank_by` |

### 3.3 Navigation / ETA direction request template (routing profiles)

```bash
# Walking: candidate → MRT
curl -X POST "https://maps.grab.com/api/v1/maps/eta/v1/direction" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "coordinates": [
      {"latitude": 1.3767, "longitude": 103.7626},
      {"latitude": 1.3765, "longitude": 103.7625}
    ],
    "profile": "walking"
  }'

# Driving: candidate → CBD
curl -X POST "https://maps.grab.com/api/v1/maps/eta/v1/direction" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "coordinates": [
      {"latitude": 1.3767, "longitude": 103.7626},
      {"latitude": 1.2844, "longitude": 103.8508}
    ],
    "profile": "driving"
  }'
```

| Parameter | Values | SSOT Key |
|-----------|--------|----------|
| coordinates | `[{"latitude","longitude"}, ...]` | Minimum 2 waypoints | `grabmaps.mcp.navigation.coordinates` |
| profile | `walking`, `driving`, `cycling`, `motorcycle`, `tricycle` | `grabmaps.mcp.navigation.profile` |
| overview | `no`, `full`, `simplified` | `grabmaps.mcp.navigation.overview` |
| geometries | `polyline6` (default), `polyline`, `no` | `grabmaps.mcp.navigation.geometries` |
| steps | `true`/`false` (turn-by-turn) | `grabmaps.mcp.navigation.steps` |

**Available Transport Profiles for `/api/v1/maps/eta/v1/direction`:**

| Profile | Use Case | Avg Speed (Singapore context) |
|---------|----------|-------------------------------|
| `driving` | General commuting, delivery logistics | ~35–50 km/h urban |
| `walking` | Last-mile, MRT access analysis | ~5 km/h |
| `cycling` | PMA/active mobility, eco-friendly commute | ~12–18 km/h PCN |
| `motorcycle** | Food delivery reach, quick commute | ~25–35 km/h |
| `tricycle` | Neighborhood goods delivery | ~10–15 km/h |

### 3.4 Historical MCP tool names

| HTTP Endpoint | MCP Tool | Method | Archived purpose (not verified) |
|---------------|-----------|--------|--------------------|
| `GET /poi/v1/search` | `search` | Keyword-based POI discovery | Historical national cafe scan |
| `GET /place/v2/nearby` | `search_nearby_pois` | Geospatial proximity | Historical per-location density query |
| Library JS API | `search_places` | Browser-side rendering | Historical cross-validation claim |
| `GET /eta/v1/direction` | `navigation` | Route geometry + duration | Historical MRT/CBD travel-time query |
| Library JS API | `route_waypoints` | Multi-stop routes | Historical extension example |

### 3.5 Historical response fields

| Field | Source Endpoints | Type | Usage in TOPSIS Model |
|-------|------------------|------|----------------------|
| `places[].name` | search, nearby | string | Cafe identification (name match for "cafe", "coffee", "starbucks") |
| `places[].business_type` | search, nearby | string | **C1/C2 filtering**: `food and beverage` type → count toward competition |
| `places[].category` | search, nearby | string | Sub-category detection: `::cafe`, `::coffee`, `::shopping centers` → C4/C3 classification |
| `places[].location.latitude` | search, nearby | float | Proximity calculation input |
| `places[].location.longitude` | search, nearby | float | Proximity calculation input |
| `places[].formatted_address` | search, nearby | string | Human-readable location context |
| `places[].poi_id` | search, nearby | string | Stable unique identifier (deduplication key) |
| `places[].opening_hours` | search, nearby | object (day→[[open,close]]) | Operating hours analysis — determines trading viability |
| `routes[].distance` | navigation/direction | meters (float) | **C5 input**: walking distance to MRT |
| `routes[].duration` | navigation/direction | seconds (float) | **C5/C6 input**: travel time in seconds → converted to minutes |
| `routes[].geometry` | navigation/direction | encoded polyline | Route visualization (optional) |
| `routes[].legs[]` | navigation/direction | array of leg objects | Per-segment breakdown |
| `radius_km` | nearby | float (km) | Search scope parameter (= 2.5 for 30-min walk) |
| `result_count` | nearby | integer | Total POIs returned → **C7 (total POI density)** |

---



## 4. Site recommendation status — no current recommendation

The recovered April 2026 ranking is preserved only to exercise historical score parsing and map joins. Its source observations, TOPSIS calculations, and business claims are not independently validated; the archived scoring conflicts internally. These values do not establish competition, catchment, footfall, rent, transit access, demand, or a viable lease.

| Archived rank | Area | `C*` fixture | Use |
|---:|---|---:|---|
| 1 | Bukit Panjang | 0.82 | Historical score only; not mapped or recommended |
| 2 | Punggol | 0.78 | Historical score only; not mapped or recommended |
| 3 | Woodlands | 0.71 | Historical score only; not mapped or recommended |
| 4 | Yishun | 0.62 | Historical score only; not mapped or recommended |
| 5 | Jurong West | 0.41 | Historical score only; not mapped or recommended |
| 6 | Sengkang | 0.22 | Historical score only; not mapped or recommended |
| 7 | CBD / High St | 0.09 | Historical score only; not mapped or recommended |

Treat the scores as non-decision values. Replace them with a current, rights-cleared dataset and reviewed decision matrix before presenting any ranked location. Validate buyer demand separately; runtime readiness is not market evidence.

## 5. Map source boundary

This reference intentionally contains no candidate coordinates or map diagram. The active cafe/place map uses only the synthetic GeoJSON block in the companion demo. The separate supply-chain view uses the existing scenario source at `canvas/src/features/supply-chain/supplyChainScenario.ts` and renderer `canvas/src/features/supply-chain/SupplyChainOverview.tsx`; its event state follows the shared BottomPanel Timeline. Keep archived scores as non-geospatial text; do not join them to the active map, route scenario, or use them for site decisions.

For the rendered map and blocked readiness audit, see [the places demo](agentic-graph-maps-places.md). For the local synthetic facility/consignment scenario, see [the logistics overview](agentic-graph-logistics-supply-chain-overview.md). These are separate source-selected views; neither adds a parallel map or candidate-ranking panel.

