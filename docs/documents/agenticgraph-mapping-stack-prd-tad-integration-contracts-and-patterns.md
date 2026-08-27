# agenticgraph Mapping Stack PRD/TAD: Integration Contracts and Patterns

Continuation of agenticgraph-mapping-stack-prd-tad.md covering integration contracts, ADRs, and API integration patterns.

## Integration Contracts

### Contract 1: Entity-to-GeoJSON Transform

**Protocol**: Synchronous function call within rendering frame  
**Data Format**: Input: `Entity[]` with optional `location: {lat, lng}` | Output: GeoJSON `FeatureCollection`

**Request Schema**:
```typescript
type EntityInput = {
  id: string
  type: string
  properties: Record<string, any>
  location?: {lat: number, lng: number}
  address?: {street: string, city: string, country: string}
}
```

**Response Schema**:
```typescript
type GeoJSONOutput = {
  type: "FeatureCollection"
  features: Array<{
    type: "Feature"
    geometry: {type: "Point", coordinates: [lng, lat]}
    properties: {entityId: string, entityType: string, ...metadata}
  }>
}
```

**Error Handling**: 
- Invalid coordinates (lat/lng out of range): Log warning, exclude from output
- Missing location data: Silently skip entity (no error)
- Malformed entity structure: Throw `TransformError` with entity ID

---

### Contract 2: Spatial Query Request/Response

**Protocol**: Asynchronous Promise-based API  
**Data Format**: Input: Query parameters | Output: `EntityQueryResult` with distances/relationships

**Request Schema**:
```typescript
type ProximityQuery = {
  type: "proximity"
  center: [lng, lat]
  radiusKm: number
  entityFilter?: EntityFilter
}

type AreaQuery = {
  type: "area"
  polygon: GeoJSON.Polygon
  entityFilter?: EntityFilter
}
```

**Response Schema**:
```typescript
type QueryResult = {
  entities: Entity[]
  metadata: {
    queryTimeMs: number
    resultCount: number
    spatialIndex: SpatialIndexStats
  }
  // For proximity queries
  distances?: Map<entityId, distanceKm>
}
```

**Error Handling**:
- Invalid geometry: Reject Promise with `ValidationError`
- Calculation timeout (>5s): Reject with `TimeoutError`
- Turf.js exception: Wrap in `SpatialAnalysisError` with context

---

### Contract 3: View State Synchronization Event

**Protocol**: Event bus pub/sub pattern  
**Data Format**: Structured event objects with source tracking

**Event Schema**:
```typescript
type ViewSyncEvent = {
  type: 'selection' | 'viewport' | 'filter'
  source: 'map' | 'graph' | 'canvas'
  timestamp: number
  payload: SelectionPayload | ViewportPayload | FilterPayload
  propagate: boolean  // Prevents circular updates
}

type SelectionPayload = {
  entityIds: string[]
  action: 'add' | 'remove' | 'replace'
}
```

**Event Flow**:
1. Source view publishes event to bus
2. ViewSyncManager receives and validates
3. Manager transforms payload for target views
4. Target views receive transformed events
5. Views update UI without re-publishing (propagate=false)

**Error Handling**:
- Unknown entity ID: Log warning, filter from payload
- View transform failure: Log error, skip that view
- Circular event detection: Break loop, log warning

---

### Contract 4: D3.js Overlay Positioning

**Protocol**: Coordinate transformation function calls  
**Data Format**: Geographic coordinates ↔ SVG pixel coordinates

**Interface**:
```typescript
type CoordinateTransform = {
  // Geographic to screen pixels
  project(lngLat: [number, number]): [x, y]
  
  // Screen pixels to geographic
  unproject(point: [x, y]): [lng, lat]
  
  // Get current transformation matrix
  getMatrix(): DOMMatrix
}
```

**Coordinate Systems**:
- **Geographic**: WGS84 decimal degrees [longitude, latitude]
- **Screen**: Pixel coordinates relative to map container [x, y]
- **SVG**: SVG viewBox coordinates (may differ from screen pixels)

**Synchronization Requirements**:
- Transform functions update on map move/zoom events
- D3 SVG elements reposition within 16ms (60 FPS target)
- Transformations account for map rotation/pitch if enabled

---

### Contract 5: Three.js Custom Layer API

**Protocol**: MapLibre custom layer interface implementation  
**Data Format**: Three.js scene objects with geographic anchoring

**Interface Implementation**:
```typescript
type MapLibreCustomLayer = {
  id: string
  type: 'custom'
  renderingMode: '3d'
  
  onAdd(map: MapLibreMap, gl: WebGLRenderingContext): void
  render(gl: WebGLRenderingContext, matrix: Float32Array): void
  onRemove?(map: MapLibreMap, gl: WebGLRenderingContext): void
}
```

**Integration Pattern**:
- Share WebGL context between MapLibre and Three.js
- Use MapLibre's projection matrix for Three camera
- Anchor Three.js objects to geographic coordinates
- Render Three scene during MapLibre render cycle

**Performance Constraints**:
- `render()` must complete <16ms for 60 FPS
- Scene complexity limited to maintain frame rate
- Automatic LOD reduction when FPS drops below 30

---

## Architectural Decisions

### ADR-001: Client-Side Spatial Analysis with Turf.js

**Status**: Accepted  
**Date**: 2026-01-21  
**Deciders**: System Architect, Backend Lead, Frontend Lead

**Context**  
Spatial analysis can occur client-side (JavaScript + Turf.js) or server-side (PostGIS database + REST API). Decision impacts infrastructure complexity, offline capability, and scalability.

**Decision**  
Implement spatial analysis client-side using Turf.js modular library.

**Alternatives Considered**

**Option 1: Server-Side PostGIS**
- **Pros**: Handles unlimited dataset sizes, more complex spatial operations, proven enterprise solution
- **Cons**: Requires PostgreSQL + PostGIS deployment, network latency for queries, no offline operation, additional infrastructure costs
- **Verdict**: Rejected - violates zero-backend-dependency principle

**Option 2: Hybrid (Simple Client + Complex Server)**
- **Pros**: Balances performance and capability, progressive enhancement
- **Cons**: Complex API design, dual maintenance burden, unclear threshold for client vs server
- **Verdict**: Rejected - premature optimization without demonstrated need

**Option 3: Client-Side Turf.js (Chosen)**
- **Pros**: Zero infrastructure, instant results (<1s for 50K entities), offline capable, free
- **Cons**: Browser memory limits (~100K entities), limited to Turf.js capabilities
- **Verdict**: Accepted - meets requirements with simplest architecture

**Rationale**  
User workflows involve <50,000 entities per session (95th percentile). Turf.js handles this scale efficiently (<1 second query time). System avoids server complexity while maintaining performance targets. Future migration to server-side possible if scale increases.

**Consequences**
- **Positive**: Zero backend infrastructure, instant spatial queries, works offline
- **Negative**: Dataset size limited by browser memory (mitigated by progressive loading)
- **Neutral**: Turf.js bundle adds ~15 KB gzipped (modular imports)

---

### ADR-002: Configurable Vector Style Provider

**Status**: Accepted  
**Date**: 2026-01-21  
**Deciders**: System Architect, Product Manager

**Context**  
Map tiles and styles can come from paid services (Mapbox, MapTiler), free services with API keys (Stadia), or zero-config free services (MapLibre demo tiles, OpenFreeMap). Decision impacts cost, configuration complexity, and reliability.

**Decision**  
Use a configurable MapLibre vector style URL, with a zero-config default (MapLibre demo tiles) and optional alternatives (OpenFreeMap or self-hosted style JSON).

**Alternatives Considered**

**Option 1: Mapbox**
- **Pros**: High quality, excellent docs, comprehensive features
- **Cons**: Costs $200+/month at scale, requires account setup, vendor lock-in
- **Verdict**: Rejected - violates zero-cost principle

**Option 2: Self-Hosted OpenMapTiles**
- **Pros**: Complete control, no external dependencies, unlimited usage
- **Cons**: Requires tile server infrastructure, complex setup (500+ configuration tokens), maintenance burden
- **Verdict**: Rejected - infrastructure complexity exceeds benefit

**Option 3: MapLibre demo tiles (Chosen default)**
- **Pros**: Zero cost, no API key, no registration, vector-first, low configuration
- **Cons**: Public demo infrastructure (reliability unknown), limited style options
- **Verdict**: Accepted - best zero-config default with an explicit provider-switching escape hatch

**Rationale**  
Defaulting to a zero-config vector style keeps onboarding friction low and avoids API keys. The architecture keeps the provider configurable via a style URL, enabling switching (OpenFreeMap, self-hosted) if reliability or styling requirements change.

**Consequences**
- **Positive**: Zero setup, zero cost, immediate availability, provider switching via configuration
- **Negative**: Dependency on public infrastructure (mitigated by configuration-driven migration to OpenFreeMap/self-hosted styles)
- **Neutral**: Attribution requirement (acceptable under FOSS licensing)

---

### ADR-003: MapLibre GL over Leaflet

**Status**: Accepted  
**Date**: 2026-01-21  
**Deciders**: System Architect, Frontend Lead, UX Designer

**Context**  
JavaScript mapping library choice between Leaflet (simpler, raster-focused) and MapLibre GL (modern, vector-focused, 3D-capable). Decision impacts Three.js integration, performance, and learning curve.

**Decision**  
Use MapLibre GL as primary mapping library.

**Alternatives Considered**

**Option 1: Leaflet**
- **Pros**: Simpler API (60 token setup), smaller bundle (42 KB), mature plugin ecosystem
- **Cons**: Poor Three.js integration (hacky overlay), no native 3D, no vector tile optimization
- **Verdict**: Rejected - Three.js integration requirement makes this impractical

**Option 2: MapLibre GL (Chosen)**
- **Pros**: Native WebGL, excellent Three.js integration via custom layer API, vector tiles, 3D terrain/buildings, modern architecture
- **Cons**: Larger bundle (220 KB), steeper learning curve, fewer plugins
- **Verdict**: Accepted - Three.js requirement mandates MapLibre's native WebGL support

**Rationale**  
System already uses Three.js for 3D knowledge structures. MapLibre GL shares WebGL context with Three.js, enabling seamless 3D integration. Leaflet's DOM-based rendering conflicts with Three.js WebGL, requiring complex manual synchronization. Vector tiles provide superior performance for 10K+ entities.

**Consequences**
- **Positive**: Native Three.js integration, 3D capabilities, vector tile performance, future-proof architecture
- **Negative**: Bundle size increase (+180 KB vs Leaflet, mitigated by code splitting)
- **Neutral**: Team learning investment in MapLibre API

---

### ADR-004: Event Bus for View Synchronization

**Status**: Accepted  
**Date**: 2026-01-21  
**Deciders**: System Architect, Frontend Lead

**Context**  
Cross-view state synchronization (map ↔ graph ↔ canvas) can use direct coupling, shared state object, or event bus. Decision impacts modularity, testability, and circular update prevention.

**Decision**  
Implement event bus pattern with source tracking for view synchronization.

**Alternatives Considered**

**Option 1: Direct View-to-View Coupling**
- **Pros**: Simple to implement, explicit dependencies
- **Cons**: Tight coupling, difficult testing, circular update risk, violates single responsibility
- **Verdict**: Rejected - creates maintenance nightmare as views multiply

**Option 2: Shared State Object (Redux-style)**
- **Pros**: Centralized state, time-travel debugging, predictable updates
- **Cons**: Boilerplate overhead, overkill for simple selection sync, learning curve
- **Verdict**: Rejected - complexity exceeds problem scope

**Option 3: Event Bus with Source Tracking (Chosen)**
- **Pros**: Loose coupling, easy testing, prevents circular updates, extensible
- **Cons**: Less explicit dependencies, debugging requires event tracing
- **Verdict**: Accepted - balances modularity with simplicity

**Rationale**  
Event bus decouples views while maintaining clear communication. Source tracking prevents infinite update loops (map selects entity → graph highlights → map re-selects). Pattern scales to future views without modifying existing code.

**Consequences**
- **Positive**: Views remain independent, easy to add new visualization types, testable in isolation
- **Negative**: Event flow less explicit than direct calls (mitigated by event logging in dev mode)
- **Neutral**: Requires event bus library (~3 KB) or custom implementation

---

### ADR-005: Plugin Architecture vs Monolithic Integration

**Status**: Accepted  
**Date**: 2026-01-21  
**Deciders**: System Architect, Product Manager

**Context**  
Geospatial features can integrate as monolith (all features always loaded) or plugin system (features load on-demand). Decision impacts bundle size, code organization, and extensibility.

**Decision**  
Implement plugin architecture with lazy-loaded geospatial modules.

**Alternatives Considered**

**Option 1: Monolithic Integration**
- **Pros**: Simple build process, no lazy loading complexity, easier debugging
- **Cons**: All users pay bundle cost even if not using maps, harder to maintain, single release cycle
- **Verdict**: Rejected - forces geographic overhead on non-geographic users

**Option 2: Feature Flags with Code Splitting**
- **Pros**: Runtime control, A/B testing capability, gradual rollout
- **Cons**: Flag management complexity, partial loading still bundles unused code
- **Verdict**: Considered but insufficient - doesn't solve bundle size for non-users

**Option 3: Plugin Architecture (Chosen)**
- **Pros**: Zero-cost for non-users, independent development cycles, clear boundaries, extensible
- **Cons**: Plugin API maintenance burden, dynamic loading complexity
- **Verdict**: Accepted - cleanest separation of concerns

**Rationale**  
Not all knowledge graph users need geospatial features. Plugin architecture loads MapLibre+Turf.js (~90 KB) only when user activates map view. System already has plugin infrastructure for D3/Three.js extensions, providing established pattern.

**Consequences**
- **Positive**: Core bundle stays lean, geospatial features develop independently, users choose capabilities
- **Negative**: Plugin API must remain stable (mitigated by semantic versioning)
- **Neutral**: Lazy loading adds initialization delay (~500ms first load, acceptable for opt-in feature)

---

## API Integration Patterns

### Pattern 1: Hook-Based Feature Activation

**Pattern Name**: Lazy Plugin Loader Hook  
**Problem**: Load geospatial dependencies only when user activates map view, prevent blocking main bundle  
**Solution**: React hook pattern with dynamic imports

**Implementation Sketch** (8 lines):
```typescript
// Hook abstracts async loading
function useMapPlugin() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    import('./mapPlugin').then(plugin => {
      plugin.initialize()
      setReady(true)
    })
  }, [])
  return {ready, MapComponent: ready ? MapView : LoadingPlaceholder}
}
```

**Benefits**: Zero bundle cost for non-users, declarative activation, error boundary isolation  
**Trade-offs**: 500ms initialization latency (acceptable for progressive enhancement)

---

### Pattern 2: Adapter Pattern for Data Transform

**Pattern Name**: Entity-GeoJSON Bidirectional Adapter  
**Problem**: Convert between knowledge graph entity format and MapLibre-compatible GeoJSON  
**Solution**: Adapter interface with extensible transform rules

**Implementation Sketch** (9 lines):
```typescript
// Adapter decouples entity model from mapping library
class GeoJSONAdapter {
  toGeoJSON(entities: Entity[]): FeatureCollection {
    return {
      type: "FeatureCollection",
      features: entities.filter(e => e.location)
        .map(e => ({
          type: "Feature",
          geometry: {type: "Point", coordinates: [e.location.lng, e.location.lat]},
          properties: {id: e.id, ...e.metadata}
        }))
    }
  }
}
```

**Benefits**: Entity model changes don't affect map code, testable in isolation, supports multiple entity types  
**Trade-offs**: Additional layer of abstraction, transform overhead (~10ms for 10K entities)

---

### Pattern 3: Observer Pattern for State Sync

**Pattern Name**: Cross-View Selection Observer  
**Problem**: Synchronize entity selection across map, graph, and canvas views without coupling  
**Solution**: Observable pattern with centralized selection state

**Implementation Sketch** (8 lines):
```typescript
// Central selection state with observers
class SelectionManager {
  private observers = new Set<Observer>()
  setSelection(ids: string[], source: string) {
    this.selection = ids
    this.observers.forEach(obs => {
      if (obs.id !== source) obs.update(ids)
    })
  }
  subscribe(obs: Observer) { this.observers.add(obs) }
}
```

**Benefits**: Views decoupled, easy to add new views, prevents infinite loops  
**Trade-offs**: Observers must implement update interface, debugging requires tracing observers

---

### Pattern 4: Strategy Pattern for Spatial Queries

**Pattern Name**: Spatial Query Strategy  
**Problem**: Support multiple spatial query types (proximity, area, relationship) with consistent interface  
**Solution**: Strategy pattern with query-specific implementations

**Implementation Sketch** (9 lines):
```typescript
// Strategy interface allows pluggable query types
interface SpatialQuery {
  execute(entities: Entity[], params: unknown): Entity[]
}

class ProximityQuery implements SpatialQuery {
  execute(entities, {center, radius}) {
    return entities.filter(e => 
      turf.distance(center, [e.location.lng, e.location.lat]) <= radius
    )
  }
}
```

**Benefits**: Add query types without modifying engine, testable strategies, clear query semantics  
**Trade-offs**: Interface overhead, each query needs separate implementation

---

### Pattern 5: Factory Pattern for Layer Creation

**Pattern Name**: Rendering Layer Factory  
**Problem**: Create different layer types (map, D3 overlay, Three.js) with consistent configuration  
**Solution**: Factory pattern with layer-specific builders

**Implementation Sketch** (8 lines):
```typescript
// Factory creates layers with proper setup
class LayerFactory {
  createLayer(type: string, config: LayerConfig) {
    const builders = {
      map: () => new MapLibreLayer(config),
      d3: () => new D3OverlayLayer(config),
      three: () => new ThreeCustomLayer(config)
    }
    return builders[type]()
  }
}
```

**Benefits**: Centralized layer creation, consistent initialization, easy to add layer types  
**Trade-offs**: Factory grows with layer types, configuration schemas may diverge

---

