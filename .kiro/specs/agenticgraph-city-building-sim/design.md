# Design Document

## 1. Design authority

`requirements.md` is normative. This design assigns each requirement to one
repository-native owner and deliberately keeps rendering, simulation,
persistence, invocation, and projections separate.

The City Simulation is one browser-local runtime with six adapter groups:

1. a labeled semantic City media `figure` and `figcaption` around the existing
   native MapLibre Geo+XR host, whose live canvas carries the matching
   accessible name and caption link and is the sole selection-marker owner;
2. a City Builder view plus compact projections in six existing
   FloatingPanel views; and
3. a read-only regional-context adapter that resolves one exact companion
   profile and projects its source-proven geographic features below City;
4. a City-owned geographic adapter that projects the applied source's live
   parcel grid into one City GeoJSON source and four MapLibre layers;
5. a City-owned aerial adapter that publishes the source-authored inspection
   route and stopped aircraft through the existing Flight overlay as an
   independent, camera-free presentation; and
6. WorkspaceFs and MCP adapters that delegate to the same runtime operations.

No adapter owns a second city state, map, Three.js or React Three Fiber
Canvas/stage/mesh/camera, HTML POI marker layer, Flight bootstrap/camera, or
Flight gameplay runtime.

## 2. Owner map

| Owner | Responsibility | Must not own |
|---|---|---|
| `CitySimRuntime` | Committed snapshot, lifecycle fencing, operation dispatch, subscribers | Canvas, files, panel-local copies |
| `citySimAuthoredSource` | Parse and validate the applied parcel grid, geographic profile, exact regional-profile reference, and aerial coordinates | Runtime fallback fixtures, copied regional facts, identity remaps |
| `citySimEconomy` | Pure tick transition and safe-integer validation | Timers, rendering, persistence |
| `citySimCodec` | Canonical KGC plus CSV serialize/parse | WorkspaceFs access |
| `citySimPersistence` | One-path WorkspaceFs write/read-back | Serialization rules, autosave |
| `citySimAdvisor` | Two-round deterministic proposal loop | Model calls, automatic zoning |
| `citySimInvocation` | Strict native grammar parse | Runtime mutation |
| `CitySimMediaFigure` | Semantic `figure` and `figcaption` around the native MapLibre Geo+XR projection; delegate the sole active selection marker to its live canvas | Map lifecycle, Three.js/R3F content, selection marker, pointer capture, generic replacement `div`, `aria-hidden` decoration |
| Native MapLibre canvas semantic owner | Apply the City accessible name, caption relationship, and sole active selection marker directly to the live renderer hit target | Wrapper replacement, gesture capture, `aria-hidden` decoration |
| Regional geographic profile owner | Supply immutable exact geographic rings, real-metre base/height values, accuracy, and provenance through the companion-selected profile | City state, renderer, camera, HTML markers, copied values in this design |
| Regional MapLibre projection owner | Project the admitted regional-context profile into one stable source/layer family below City parcels | Regional fact mutation, camera mechanism, second map, Three.js/R3F content |
| `citySimGeospatialProjection` | Project the live City snapshot and authored geographic profile to the City overlay contract, converting source-authored meter geometry once | Map lifecycle, Flight state, hardcoded parcel fixture |
| City Geo overlay owners | Own `kg-city-sim:geo-overlay`, parcel GeoJSON, layers, selection, and responsive composite-bounds framing on the existing map | Basemap replacement, regional facts, Flight camera, second map |
| `citySimAerialInspectionProjection` | Derive one `stopped` aircraft/route overlay from the City geographic profile with atomic owner `city` and `environment: null` | Local Flight XR environment source/layers, Flight lifecycle, bootstrap, camera, controls, readiness |
| Existing Flight Geo overlay store | Publish/read one aerial snapshot via `gympgrph/src/flightGeoOverlay.ts` | City state, Flight gameplay activation |
| Existing Flight MapLibre projection | Apply the shared source/layer ids via `gympgrph/src/flightGeoOverlayMapLibre.ts` | A second map, duplicate source/layers |
| Existing native MapLibre Geo host | Sole City visual, renderer, camera, and viewport-gesture owner in Geo+XR | City state, a City-owned map |
| `CitySimFloatingPanelView` | Complete City Builder controls and status | Duplicate runtime state |
| `CitySimPanelProjection` | Six contextual projections from one snapshot | Surface-specific city stores |
| `citySimMcpRuntime` | Exactly two MCP registrations and approval delegation | A second dispatcher or route |
| `CitySimRunReadyDemoRuntime` | Source identity admission after bootstrap readiness | Environment-preselected proof |

## 3. Runtime topology

```mermaid
flowchart LR
  Source["Applied workspace seed"] --> Admission["Run-ready admission"]
  Invocation["Native invocation"] --> Parser["Strict parser"]
  MCP["Existing MCP transports"] --> Adapter["City MCP adapter"]
  Admission --> Runtime["CitySimRuntime"]
  Parser --> Runtime
  Adapter --> Runtime
  Runtime --> Tick["Pure economy"]
  Runtime --> Advisor["Local advisor"]
  Runtime --> Persistence["WorkspaceFs adapter"]
  Persistence --> Document["/game-city-sim/city-grid.md"]
  Runtime -. semantic activation .-> Figure["CitySimMediaFigure"]
  Source -->|regional profile id| RegionalProfile["Regional companion profile"]
  RegionalProfile -->|exact rings, metre heights, provenance| RegionalLayers["Regional MapLibre context layers"]
  RegionalLayers --> Geo["Existing native MapLibre Geo host"]
  Runtime -. live parcel projection .-> CityProjection["citySimGeospatialProjection"]
  CityProjection --> CityStore["City Geo overlay store"]
  CityStore --> CityLayers["City parcel MapLibre layers"]
  CityLayers --> Geo
  Runtime -. snapshot .-> Aerial["citySimAerialInspectionProjection"]
  Aerial --> FlightStore["Existing Flight Geo overlay store"]
  FlightStore --> FlightLayers["Existing Flight MapLibre source/layers"]
  FlightLayers --> Geo
  Geo --> Canvas["Live MapLibre canvas semantic owner"]
  Figure --> Canvas
  Runtime -. snapshot .-> Builder["cityBuilder"]
  Runtime -. snapshot .-> Projections["Six existing panel projections"]
```

Admission is gated on Source Files bootstrap readiness. The applied document's
`run_ready_demo.id` is authoritative; known identity/path disagreement is a
typed rejection. Admission requests Surface Mode `geo-xr`; it does not invoke
the Flight source identity or open the Flight Runtime.

The projection order is regional geographic context, City parcels, then the
stopped Flight route/aircraft. The Flight-local XR environment is an
independent optional band and remains absent for City.

## 4. State model

```ts
type CityZone = "unzoned" | "residential" | "commercial" | "industrial";
type CityRunState = "closed" | "ready" | "running" | "stopped" | "blocked";

interface CityParcel {
  id: string; // rNNcNN
  row: number;
  column: number;
  zone: CityZone;
  landValueCents: number;
  population: number;
  pollution: number;
}

interface CitySnapshot {
  schemaId: "agenticgraph-city-grid/v1";
  cityName: string;
  tick: number;
  treasuryCents: number;
  taxRateBasisPoints: number;
  runState: CityRunState;
  parcels: readonly CityParcel[];
  selectedParcelId: string | null;
  clarifyPending: boolean;
  persistenceStatus: "not-loaded" | "loaded" | "saving" | "saved" | "blocked";
  lastResult: CityOperationResult | null;
  revision: number;
}
```

Every numeric field is a safe integer. Parcel arrays are stored and emitted in
ascending parcel-id order. Runtime publication uses immutable snapshots and a
monotonic revision.

### Authored initial City source

The workspace seed describes a 4 by 4 row-major grid:

- treasury: `100000` cents;
- tax rate: `1000` basis points;
- tick: `0`;
- four authored zones (`r00c00` residential, `r00c01` commercial,
  `r01c00` industrial, remaining parcels unzoned);
- one exact companion-owned regional-context profile reference; and
- all starting population, pollution, and land values are explicit in the
  seed's CSV fixture.

`citySimAuthoredSource` parses these values directly from the applied seed. A
focused test parses the authoritative document and rejects missing, malformed,
duplicated, unknown, aliased, or dimension-conflicting source data and regional
profile identity; no runtime default factory, copied regional data, or copied
test fixture exists.

## 5. Deterministic economy

`advanceCityTick(snapshot)` is pure. It clones parcel values, applies v1
coefficients in stable parcel-id order, calculates aggregates, validates the
candidate, and returns either the complete next snapshot or a typed failure
with the original snapshot.

Per parcel:

| Zone | Population delta | Land-value delta | Pollution delta |
|---|---:|---:|---:|
| unzoned | 0 | 0 cents | 0 |
| residential | +2 | +200 cents | 0 |
| commercial | +1 | +100 cents | 0 |
| industrial | 0 | -50 cents | +1 |

After the parcel pass:

```text
taxRevenueCents =
  floor(totalPopulation * taxRateBasisPoints / 100)

treasuryDeltaCents =
  taxRevenueCents
  + 300 * commercialCount
  + 500 * industrialCount
  - 100 * zonedCount
```

`tick` increments by one only in the accepted candidate. Any unsafe integer,
invalid parcel, duplicate id, or invalid coefficient aborts the complete tick.
The fixed-step scheduler requests one tick each 1000 ms while running. A
generation token fences queued callbacks after Stop, Restart, Reset, or Exit.
Rendering never advances the scheduler.

## 6. Lifecycle and mutual exclusion

```mermaid
stateDiagram-v2
  [*] --> Closed
  Closed --> Ready: open
  Ready --> Running: start
  Running --> Stopped: stop
  Stopped --> Running: start
  Ready --> Ready: zone / advise / save
  Stopped --> Stopped: zone / advise / save
  Running --> Running: zone / advise / save
  Ready --> Ready: restart / reset
  Stopped --> Ready: restart / reset
  Running --> Ready: restart / reset
  Ready --> Closed: exit
  Stopped --> Closed: exit
  Running --> Closed: exit
  Ready --> Blocked: malformed read
  Blocked --> Ready: reset
```

On Open, the runtime captures the prior FloatingPanel, Canvas, and regional
presentation state before it changes anything. It asks the existing gameplay-surface coordinator to exit another
exclusive overlay, activates `geo-xr`, retains the existing native MapLibre
host as the sole City visual, renderer, camera, and viewport-gesture owner, and
activates the semantic City media figure around that map without mounting a
City Three.js/R3F stage or local grid. The shared `CanvasViewport` geospatial
publisher resolves the applied source's exact regional-context profile,
projects its checked-in geographic rings and real-metre heights into the
regional MapLibre band, and projects the source's typed `city_geo_xr` profile
as a stopped aircraft/route snapshot with presentation owner `city` and
`environment: null`. City never opens Flight gameplay, borrows a Flight
readiness signal, or owns local Flight XR environment source/layers. The shared
projection owner removes retained Flight-local environment layers and source
before presenting City, without removing the independent regional-context
band or making City the owner of regional facts. If City entry fails, its
FloatingPanel/Canvas surface lifecycle rolls back.

On Exit, it fences the timer; removes the City parcel
`kg-city-sim:geo-overlay` source/layers; releases its Flight Geo overlay
publication and City-selected regional presentation through their existing
owners without mutating companion facts; releases the live MapLibre canvas's
active selection semantics; restores the captured prior regional,
FloatingPanel, and Canvas surface state exactly once; and clears only
session-transient selection/advisor state. The committed in-memory snapshot
remains inspectable until a later Open, Reset, or valid document load.

## 7. Geo+XR MapLibre media surface and camera

The existing native MapLibre Geo+XR host remains mounted as the sole City
visual, renderer, camera, and viewport-gesture owner. `CitySimMediaFigure`
wraps that geospatial projection directly and owns only the semantic `figure`
and `figcaption`. The live MapLibre canvas carries the same accessible name,
references the caption, and owns the sole active selection marker. City mounts
zero Three.js or React Three Fiber Canvas, stage, mesh, camera, or pointer
handler.

City creates no map or Three Canvas. It owns one stable
`kg-city-sim:geo-overlay` source/layer family for live parcels on the existing
one real MapLibre basemap. The selected companion's regional geographic
profile is projected through a distinct stable MapLibre source/layer family
below those parcels. Its polygons preserve exact geographic rings,
real-metre base/height values, accuracy, and provenance; City neither copies
nor mutates those facts. City publishes `environment: null`; no selected or
local Flight XR environment source/layers participate in its presentation.
The aircraft/route remains in the distinct existing Flight source/layers above
the regional context and City parcels. Duplicate ids, copied layer families,
compatibility aliases, Three.js/R3F visuals, and parallel HTML POI markers are
forbidden.

The source-authored parcel table and geographic profile initialize one runtime
snapshot. `citySimGeospatialProjection` converts every live parcel to a
geographic polygon exactly once from source-authored meter geometry;
`kg-city-sim:geo-overlay` renders zone fill, building extrusion, outline, and
selected-parcel outline on the existing map. City Builder controls and
MapLibre parcel clicks both dispatch selection to that one runtime. No local
Three mesh or duplicate parcel store exists.

City source identity remains part of the broader native-XR catalog, but it is
not an XR physics-runtime owner. `isXrPhysicsRuntimeRunReadyDemoActive`
admits only the dedicated physics and Flight sources. `ThreeGraph` excludes
the authored/native graph for City source intent, preventing a
regional-physics flash or retained Three world from sharing the native
MapLibre visual. City owns no local XR environment selection, source/layers,
physics, placement, or Three-renderer behavior. The absence of that local
schematic XR environment does not suppress the separate regional geographic
MapLibre band. Locale-specific geographic content remains solely in the
selected ADM0 companion and is not copied into the City contract.

While City is active, `CitySimMediaFigure` provides the semantic `figure` and
`figcaption`. The live MapLibre canvas receives the same City-stage accessible
name, the caption reference, and the sole marker-only result of
`resolveMediaPreviewSelectableDataAttr(true)`. Neither element installs a
capture handler, generic replacement `div`, or `aria-hidden` decoration, so
MapLibre viewport gestures and City Builder parcel controls remain available.
No regional publisher adds an HTML marker or competing selection target.
The canvas marker and City semantics disappear when City is inactive; the
stable `figure` remains presentational without introducing a second renderer.

`projectCitySimAerialInspectionToGeospatialOverlay` is a pure adapter from the
same City geographic profile to one stopped aircraft/route snapshot. It sets
atomic presentation owner `city`, `environment: null`, phase `stopped`, run id
`0`, tick `0`, and ready-frame request `null`. The existing Flight source and
layers render only the aircraft and route above regional context and City
parcels. City does not own any local Flight XR environment source or layer; its
null publication makes the shared projection owner remove retained
Flight-local environment layers and source.
Owner `city` remains excluded from Flight bootstrap, camera/padding, lifecycle,
mission, controls, and readiness. No revision-prefix alias is consulted.

The City overlay controller fits the union of the admitted regional geographic
feature bounds and authored parcel bounds into the map's visible aperture
around workspace panels. It clears its own applied padding before each
responsive fit, restores prior map padding on handoff, and never replaces the
provider style or captures a Three/R3F camera.

HUD metrics live in FloatingPanel HTML, not a second scene or renderer.

## 8. FloatingPanel composition

`CitySimPanelProjection` accepts one discriminated surface id and derives all
content from `useCitySimSnapshot()`:

| Existing view | Projection | Allowed action |
|---|---|---|
| Media | zone palette and authored procedural appearance | Open City Builder |
| Animation | tick, fixed-step state, last committed revision | Start or Stop |
| Motion Control | normalized input source and selected parcel | Focus selection |
| Game Mode | exclusive overlay state and economy summary | Enter or Exit city |
| Flight Sim | read-only City aerial inspection summary | Handoff to City Builder; never open Flight |
| Camera | native MapLibre framing | Inspect city framing |

These projections are composed by the shared FloatingPanel route wrapper rather
than patched into six feature implementations. This preserves existing surface
ownership and prevents dependency cycles.

`cityBuilder` contains the full status, lifecycle buttons, parcel selector,
three zone buttons, advisor trigger, proposal/tie result, save result, and Exit.
All buttons dispatch one City Runtime operation and render typed failures.

## 9. Input contract

Pointer, keyboard, and touch adapters produce:

```ts
interface CityInputSnapshot {
  source: "pointer" | "keyboard" | "touch";
  selectParcelId: string | null;
  requestedZone: Exclude<CityZone, "unzoned"> | null;
  sequence: number;
}
```

The runtime consumes a copied snapshot when it queues an action. Later browser
events cannot mutate an already queued input. All three sources use the same
selection and zoning dispatcher.

## 10. Persistence contract

The sole path is `/game-city-sim/city-grid.md`. The codec emits:

```markdown
---
schema_id: agenticgraph-city-grid/v1
city_name: Civic Seed
tick: 0
treasury_cents: 100000
tax_rate_basis_points: 1000
---

parcel_id,row,column,zone,land_value_cents,population,pollution
r00c00,0,0,residential,10000,10,0
```

Canonical rules:

1. frontmatter keys use the order shown;
2. one blank line separates frontmatter and CSV;
3. CSV columns use the order shown;
4. rows sort by parcel id;
5. integers use base-10 text with no separators;
6. line endings are LF and the file ends with one newline.

Open checks the path. Missing uses the authored default. Valid bytes become the
session start snapshot. Malformed bytes are retained in a blocked record and
are never rewritten automatically.

Save serializes the committed snapshot, writes through existing WorkspaceFs,
reads the same path back, compares bytes, parses the read-back, and compares
the parsed semantic snapshot. Only then does it publish `saved`. Reset selects
the authored default in memory but deliberately leaves path bytes untouched.

## 11. Advisor

The Advisor is a pure local harness:

1. **generate**: create valid parcel/zone candidates in stable order;
2. **select**: score candidates from committed land value, zone balance, and
   immediate v1 economy delta;
3. **clarify**: if the top-two score gap is below epsilon, return proposals
   with `clarify_required: true` and do not zone;
4. **evolve**: deterministically adjust at most once and rescore.

The loop is capped at two rounds. If the tie remains, the returned recommended
candidate is the one with greater current land value, then smaller parcel id.
It remains a recommendation; only a later explicit Zone operation mutates the
grid.

Every call emits one cost record with model `none`, token counts `0`, cache
hits `0`, and estimated cost `0`. There is no enrichment branch in this
increment.

## 12. Invocation and MCP

Native grammar:

```text
/game.city @canvas #civic operation=<operation>
  [parcel=<rNNcNN>] [type=<residential|commercial|industrial>]
  [scope=<parcel|district>]
```

The parser tokenizes once, rejects duplicates and unknown keys, then checks
operation-specific arguments. It returns data or a typed error; it never calls
the runtime.

MCP schema `agenticgraph-city-sim-mcp/v1` registers exactly:

- `agenticgraph.inspect_local_city_sim`: immutable snapshot;
- `agenticgraph.control_local_city_sim`: approval-gated structured operation.

Both native and MCP control converge on `dispatchCityOperation`. MCP adds no
route and reuses the existing discovery/control transports.

## 13. Failure behavior

| Failure | Result |
|---|---|
| Source identity conflict | Reject activation; prior surface unchanged |
| Geo+XR or MapLibre entry unavailable | Reject Open; restore prior FloatingPanel/Canvas surface state through the City lifecycle |
| Superseded Geo claim rollback fails | Return typed `surface-restoration-failed`; never report successful Exit |
| Invalid parcel, zone, scope, or invocation | Typed error; snapshot unchanged |
| Unsafe tick candidate | Abort whole tick; scheduler stops with local error |
| Malformed City Document | Preserve bytes; block Start/Restart |
| Workspace write/read mismatch | Report save failure; committed state remains |
| Advisor tie | Clarify result only; no automatic zoning |
| Competing gameplay surface | Exit through shared lifecycle before entry |

Errors are visible in City Builder and retained in `lastResult`; no error path
silently repairs a file or mutates a partially computed snapshot.

## 14. Verification design

Focused source proof:

- pure economy coefficient, atomicity, and replay tests;
- codec canonical bytes, malformed preservation, and round-trip tests;
- parser accept/reject and single-effect tests;
- advisor bound/tie/no-mutation tests;
- runtime timer fencing, save/read-back, and surface restoration tests;
- source parsing, parcel GeoJSON, mutation/selection projection, and City plus
  Flight coexistence tests;
- regional-profile admission and MapLibre projection tests for exact
  geographic rings, real-metre base/height properties, accuracy/provenance,
  stable source/layer identities, and deterministic feature order;
- static Geo+XR, semantic-figure, zero-City-Three, one-map ownership, and
  exact-two-MCP registration tests;
- City aerial projection tests for deterministic route/aircraft,
  `environment: null`, permanent `stopped` phase, overlay owner reuse, zero
  local Flight XR environment source/layers, independent regional-context
  retention, Flight gameplay inactivity, and no Flight readiness claim;
- FloatingPanel routing/projection ownership tests;
- authoritative-seed parsing test with no runtime default fixture.

Neutral browser proof:

1. launch the exact candidate with no Flight-local XR environment source,
   layers, or selector, no `kg-city-sim:geo-overlay` source/layers, and no
   `kg-geo-xr:regional-poi` source/layers;
2. clear persisted workspace state and confirm city inactive;
3. open Explorer -> Source Files after bootstrap readiness;
4. apply the authored seed;
5. assert Surface Mode `geo-xr`, `cityBuilder`, one existing native MapLibre
   map wrapped by the semantic City media `figure` and `figcaption`, the live
   canvas as the sole selection-marker owner with the same accessible name and
   caption link, MapLibre camera and viewport gestures, City Builder coordinate
   input, zero City Three.js/R3F Canvas/stage/mesh/camera, zero parallel HTML
   POI markers, and authored starting metrics;
6. zone a parcel, run one tick, stop, and verify no further tick;
7. save and verify read-back success at the canonical path;
8. visit Media, Animation, Motion Control, Game Mode, Flight Sim, and Camera,
   confirming one shared revision and the specified projection;
9. assert the complete companion-selected regional-context feature collection,
   exact geographic rings and real-metre heights, accuracy/provenance fields,
   and stable source/layer identities below City and Flight; fit the union of
   those regional bounds and City parcel bounds inside the visible aperture;
10. assert `rows × columns` live City parcel features, deriving rows, columns,
   parcel width, and parcel depth from the applied source and projecting those
   source-authored meter edges once at map scale; also assert a visible
   zone/selection mutation in the City layers, `environment: null`, zero local
   Flight XR environment source/layers/features, and the stopped
   aircraft/route above regional context and parcels;
11. assert one map and no Flight bootstrap style, camera, gameplay, readiness,
   duplicate ids, or City Three Canvas;
12. exit and verify the City parcel source/layers, City-owned publications,
    and City-selected regional presentation clear, prior map padding is
    restored, and the prior regional, FloatingPanel, and Canvas surface state
    restores exactly once;
13. repeat from neutral state and compare initial serialized bytes, regional
    feature/provenance digest, and aerial projection.

The seed remains `proof-pending` until the focused suite and this browser proof
pass at the exact candidate SHA. Protected integration and release are
subsequent independent gates.
