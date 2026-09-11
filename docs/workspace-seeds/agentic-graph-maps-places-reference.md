---
title: "Places source methodology and request reference"
doc_type: "Historical source reference"
date: "2026-04-24"
source_provenance: {"repository": "huijoohwee/joohwee", "revision": "59e920337b5591943f10461d45af6b76ea24e1c5", "path": "huijoohwee-docs/agentic-graph-maps-places.md", "sha256": "9e867949c5b0579c9b7a66499f1487e5b6c45c6b7e71a31ba48fcd6828839f91", "restoration": "Source recovery; historical readiness claims require current validation."}
---

# Places methodology and request reference

Companion to [the geospatial source](agentic-graph-maps-places.md). These examples and observations are historical; no requests run when this file opens.

## 1. Methodology

### 1.1 Data Sources & Endpoint Matrix

| # | Endpoint | Method | Parameters per Call | Purpose |
|---|----------|--------|---------------------|---------|
| 1 | `/api/v1/maps/poi/v1/search` | GET | `keyword=cafe`, `country=SGP`, `limit=50` | National cafe POI discovery, baseline popularity ranking |
| 2 | `/api/v1/maps/place/v2/nearby` | GET | 7 locations × `radius=2.5km`, `rank_by=popularity`, `limit=50` | Per-location POI density & competition mapping |
| 3 | `search_places` (MCP) | POST | `query="cafe Singapore"`, `limit=50` | Library-level search cross-validation |
| 4 | `/api/v1/maps/eta/v1/direction` (navigation MCP) | POST | 7 × `{origin, dest}`, `profile=walking` | Walking time: candidate → nearest MRT station |
| 5 | `/api/v1/maps/eta/v1/direction` (navigation MCP) | POST | 7 × `{origin, dest=Raffles Place}`, `profile=driving` | Driving time: candidate → CBD (Raffles Place) |
| 6 | `nearby_search` (MCP) | POST | Same as #2 via library wrapper | Cross-validation of nearby results |

### 1.3 TOPSIS Evaluation Framework

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

## 7. Request Templates & SSOT Field Reference

### 7.1 POI Search Request

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

### 7.2 Nearby Search Request (per location)

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

### 7.3 Navigation / ETA Direction Request (routing profiles)

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

### 7.4 MCP Tool Equivalents Used

| HTTP Endpoint | MCP Tool | Method | Usage in This Study |
|---------------|-----------|--------|--------------------|
| `GET /poi/v1/search` | `search` | Keyword-based POI discovery | National cafe scan |
| `GET /place/v2/nearby` | `search_nearby_pois` | Geospatial proximity | Per-location competition mapping |
| Library JS API | `search_places` | Browser-side rendering | Cross-validation (generates JS code) |
| `GET /eta/v1/direction` | `navigation` | Route geometry + duration | Walking-to-MRT + Driving-to-CBD analysis |
| Library JS API | `route_waypoints` | Multi-stop routes | (Available for extended multi-point analysis) |

### 7.5 Key Response Fields (SSOT)

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



## 5. Top 3 Recommendations for New Cafe Location

### 🥇 Recommendation #1: **Bukit Panjang** — `1.3767, 103.7626`
#### **C* = 0.82 (TOPSIS Rank #1)**

| Attribute | Details |
|-----------|---------|
| **Coordinates** | `1.3767, 103.7626` (Upper Bukit Timah Rd / Bukit Panjang DTL MRT) |
| **Why #1** | **Zero cafe competition** + **exceptional MRT access (16-second walk!)** + **highest commercial building count (18)** + strong F&B scene (restaurants) but no cafe gap filled yet |
| **Target customer** | **DTL MRT commuters** (peak hours breakfast/to-go), **industrial park office workers** (weekday lunches), **temple visitors** (weekend cultural crowd from Sri Murugan Hill Temple) |
| **Catchment area** | 18 commercial buildings within 2.5km = estimated 3,000–5,000 office workers; DTL line ridership ~50,000/day at BPJ station |
| **Risk factors** | Main road (Upper Bukit Timah Rd) has heavy bus traffic — limited al fresco appeal; shopfront availability may be limited along MRT station stretch |
| **Suggested format** | **Specialty coffee kiosk or compact grab-and-go cafe** near DTL MRT exit, with emphasis on morning commuter traffic (06:30–09:30 peak) + quick lunch (12:00–14:00) |
| **Estimated daily footfall** | 800–1,200 transactions (commuter-heavy model) |
| **Differentiation strategy** | "The DTL Commuter's First Coffee" — focus on speed, consistency, loyalty app for regulars; pair with GrabFood for delivery to surrounding commercial buildings |

### 🥈 Recommendation #2: **Punggol** — `1.4053, 103.9070`
#### **C* = 0.78 (TOPSIS Rank #2)**

| Attribute | Details |
|-----------|---------|
| **Coordinates** | `1.4053, 103.9070` (near Punggol MRT / blk 305-306 / Punggol Road) |
| **Why #2** | **Near-zero cafe competition (C1=1 traditional coffeeshop only)** + **highest residential density (C3=22 HDB blocks)** + **young, growing demographic** + waterway lifestyle appeal |
| **Target customer** | **Young families** (weekend brunch with kids), **remote workers / WFH professionals** (weekday daytime), **weekend waterway crowds** (Punggol Promenade Riverside Walk) |
| **Catchment area** | 22 HDB residential POIs ≈ 15,000–22,000 residents within 2.5km; growing town with ongoing BTO completions |
| **Risk factors** | Lower disposable income vs. CBD demographic; needs stronger value proposition; limited evening/nightlife crowd; some residents may prefer traveling to town for "proper" cafe experience |
| **Suggested format** | **Neighborhood family-friendly cafe** with WFH workspace area (power outlets, WiFi), weekend brunch menu, kid-friendly amenities (play corner, high chairs). Size: 1,200–1,800 sqft |
| **Estimated daily footfall** | 400–700 transactions (residential neighborhood model, peaks at weekends) |
| **Differentiation strategy** | "Punggol's Living Room" — community hub concept; host neighborhood events (parenting workshops, book clubs); partner with nearby tuition centers for student study packages |

### 🥉 Recommendation #3: **Woodlands** — `1.4416, 103.7951`
#### **C* = 0.71 (TOPSIS Rank #3)**

| Attribute | Details |
|-----------|---------|
| **Coordinates** | `1.4416, 103.7951` (Woodlands St 83 / Admiralty zone / Woodlands Drive 40) |
| **Why #3** | **Absolute zero cafe competitors (C1=0)** + established residential density + upcoming **Woodlands South MRT (TE line)** + **causeway commuter traffic** from JB travelers + education/childcare ecosystem = family demographic |
| **Target customer** | **Causeway commuters** (pre/post-trip coffee — Malaysia-bound early morning, return evening), **residents** (daily neighborhood visits), **students/parents** (from Evergreen Secondary, multiple preschools) |
| **Catchment area** | 10 residential POIs ≈ 8,000–12,000 residents; plus cross-border commuter overflow; TE line extension brings improved connectivity |
| **Risk factors** | Farthest from CBD (25.5 min drive) — loses weekend urban visitor segment; less "cafe culture" awareness may require market education; commercial shopfront options limited in surveyed HDB precinct |
| **Suggested format** | **Quick-service coffee + grab-and-go** optimized for commuter traffic (05:30–08:30 morning peak critical for JB crowd), with Malaysian Ringgit pricing display option |
| **Estimated daily footfall** | 600–1,000 transactions (commuter-biased, AM-weighted) |
| **Differentiation strategy** | "Last Singapore Coffee Before JB" — play on cross-border identity; offer JB ferry/bus timetable display; stock Malaysian snacks alongside standard cafe menu |



## 6. Competitive Density Heat Map (Visual)

```
                        SINGAPORE ISLAND
    ════════════════════════════════════════════════════
                                                       
     WOODLANDS  ○───────┐                                │
     (C*=0.71)   │       │    YISHUN  ○                 │
                  │       │   (C*=0.62)  │                │
     ───────────┼───────┼──────────────┼────────  JOHOR   │
                  │       │              │         STRAIT   │
     BUKIT      │       │              │                    │
     PANJANG ★ │       │   SENGKANG  ○│                    │
     (C*=0.82)  │       │   (C*=0.22)   │                    │
                  │       │              │                    │
     ───────────┼───────┼──────────────┼──────────────────── │
                  │       │              │                    │
             PUNGGOL ★    │       JURONG WEST ○               │
             (C*=0.78)    │      (C*=0.41)   │                │
                        │                  │                │
     ─────────────────┴──────────────────┴────────────────  │
                                          │                  │
                                    CBD  ☠︎                   │
                                   (C*=0.09)                  │
                                      BASELINE                │
    ════════════════════════════════════════════════════╝

    ★  = Top 3 Recommendation (Green Zone)
    ○  = Evaluated but Not Recommended (Yellow/Red Zone)
    ☠️  = Baseline Reference Only (Red Zone)
    
    GREEN  = Low Competition, High Opportunity
    YELLOW = Moderate, Selective Opportunity  
    RED    = High Competition, Not Recommended
```

