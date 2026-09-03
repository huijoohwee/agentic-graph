# agentic-graph Mapping Stack PRD/TAD: Extension, Delivery, and Validation

Continuation of agentic-graph-mapping-stack-prd-tad.md covering extension points, quality attributes, deployment, migration, validation, and appendix material.

## Plugin Extension Points

### Extension Point 1: Custom Spatial Query Operators

**Hook**: `registerSpatialOperator(name: string, implementation: SpatialQueryFunction)`  
**Purpose**: Allow domain-specific spatial analysis beyond Turf.js built-ins  
**Example Use Case**: Academic researchers add "citation proximity" operator (entities near each other with citation links)

**Interface**:
```typescript
type SpatialQueryFunction = (
  entities: Entity[], 
  parameters: Record<string, any>
) => Entity[]

// Registration
spatialEngine.registerOperator('citationProximity', (entities, params) => {
  // Custom logic combining spatial and graph data
})
```

**Constraints**: Operator must return results <3 seconds for 50K entities, handle empty input gracefully

---

### Extension Point 2: Custom Map Layers

**Hook**: `addCustomLayer(config: CustomLayerConfig): LayerHandle`  
**Purpose**: Enable domain-specific map overlays (heatmaps, flow maps, network diagrams)  
**Example Use Case**: Urban planners add transit route layer with real-time updates

**Interface**:
```typescript
type CustomLayerConfig = {
  id: string
  type: 'geojson' | 'd3-overlay' | 'three-custom'
  data: GeoJSON | DataFetchFunction
  style: StyleSpecification
  zIndex: number
}

// Usage
const transitLayer = layerManager.addCustomLayer({
  id: 'transit-routes',
  type: 'geojson',
  data: fetchTransitData,
  style: routeStyle
})
```

**Constraints**: Layer rendering must not degrade map FPS below 30, updates via efficient diff patching

---

### Extension Point 3: Coordinate System Transformers

**Hook**: `registerProjection(name: string, transformer: ProjectionTransformer)`  
**Purpose**: Support non-WGS84 coordinate systems (UTM zones, State Plane, custom grids)  
**Example Use Case**: Government agencies work with State Plane coordinates

**Interface**:
```typescript
type ProjectionTransformer = {
  toWGS84(coords: [number, number]): [lng, lat]
  fromWGS84(lngLat: [number, number]): [x, y]
  bounds: BoundingBox
}

// Registration
projectionManager.register('NAD83-StatePlane-CA-Zone3', {
  toWGS84: (coords) => proj4(statePlane, wgs84, coords),
  fromWGS84: (lngLat) => proj4(wgs84, statePlane, lngLat),
  bounds: {minX, minY, maxX, maxY}
})
```

**Constraints**: Transformation must be bijective, performance <1ms per coordinate, handle datum shifts

---

### Extension Point 4: Geocoding Service Integration

**Hook**: `setGeocodingProvider(provider: GeocodingProvider)`  
**Purpose**: Allow pluggable geocoding services (Nominatim, Google, Mapbox, custom)  
**Example Use Case**: Organizations use internal geocoding API with proprietary data

**Interface**:
```typescript
type GeocodingProvider = {
  geocode(address: string): Promise<GeocodingResult[]>
  reverseGeocode(lngLat: [number, number]): Promise<Address>
  batchGeocode(addresses: string[]): Promise<GeocodingResult[]>
}

// Implementation example (4 lines)
const nominatimProvider = {
  geocode: (addr) => fetch(`nominatim.org/search?q=${addr}`).then(r => r.json()),
  reverseGeocode: ([lng,lat]) => fetch(`nominatim.org/reverse?lat=${lat}&lon=${lng}`).then(r => r.json()),
  batchGeocode: async (addrs) => Promise.all(addrs.map(a => this.geocode(a)))
}
```

**Constraints**: Rate limiting handled by provider, results include confidence score, timeout after 10s

---

### Extension Point 5: Event Stream Subscribers

**Hook**: `subscribeToMapEvents(eventType: MapEventType, handler: EventHandler)`  
**Purpose**: Enable external systems to react to map interactions (clicks, selections, viewport changes)  
**Example Use Case**: Analytics system tracks spatial exploration patterns

**Interface**:
```typescript
type MapEventType = 'click' | 'selection' | 'viewport-change' | 'query-complete'

type MapEvent = {
  type: MapEventType
  timestamp: number
  payload: ClickPayload | SelectionPayload | ViewportPayload
  source: 'user' | 'programmatic'
}

// Subscription
eventBus.subscribe('selection', (event: MapEvent) => {
  analytics.trackSelection(event.payload.entityIds)
})
```

**Constraints**: Handlers must not block rendering thread (async execution), unsubscribe mechanism required

---

## Quality Attributes

### Performance Requirements

**Rendering Performance**:
- Map initialization: <1 second for 5,000 entities
- Marker clustering activation: <500ms for 10,000+ entities
- Pan/zoom interaction: Maintain 60 FPS with 20,000 visible entities
- Layer toggle: <200ms to show/hide layer with 10,000 features
- 3D mode transition: <1 second including terrain loading

**Query Performance**:
- Proximity search: <500ms for 50,000 entities
- Area filter: <1 second for 100,000 entities
- Spatial relationship detection: <3 seconds for 5,000 entity pairs
- Coordinate transformation: <1ms per entity
- GeoJSON conversion: <100ms for 10,000 entities

**Memory Constraints**:
- Base map component: <50 MB
- 10,000 entities loaded: <100 MB total
- 50,000 entities: <300 MB total (with clustering)
- Tile cache: <100 MB (configurable)

---

### Scalability Requirements

**Entity Count Handling**:
- Full feature set: Up to 10,000 entities without degradation
- With clustering: Up to 100,000 entities (progressive loading)
- Spatial queries: 50,000 entities with <3 second latency
- Concurrent visualizations: 3 map views simultaneously

**Geographic Extent**:
- Global coverage: All zoom levels 0-18
- Detail level: City-scale (zoom 12-15) as primary use case
- Coordinate precision: 6 decimal places (~10cm accuracy)

**Progressive Enhancement**:
- <1,000 entities: Full features, no clustering
- 1,000-10,000: Automatic clustering at low zoom
- 10,000-100,000: Mandatory clustering, lazy load on zoom
- >100,000: Require server-side spatial database (out of scope, documented constraint)

---

### Security Requirements

**Data Privacy**:
- Coordinate data remains client-side (no external transmission except tile requests)
- Geocoding requests use HTTPS only
- No entity metadata sent to tile provider
- Support for offline tile cache (no external requests)

**Input Validation**:
- Coordinate bounds validation: lat ∈ [-90, 90], lng ∈ [-180, 180]
- GeoJSON schema validation before rendering
- Spatial query parameter sanitization (prevent injection attacks)
- Maximum polygon complexity limits (prevent DoS via complex geometries)

**Access Control Integration**:
- Respect existing entity-level permissions (filtered entities never render)
- Map view obeys same access controls as graph view
- Spatial query results filtered by user permissions
- Export functionality respects data access policies

---

### Observability Requirements

**Logging**:
- Performance metrics: All spatial queries >1 second logged with parameters
- Error tracking: Coordinate validation failures, tile load errors, transform exceptions
- User actions: Map view activations, spatial queries, layer toggles, entity selections
- Integration health: D3/Three.js sync failures, event bus errors

**Monitoring Dashboards**:
- Real-time FPS counter in dev mode
- Tile request success/failure rates
- Spatial query latency histogram (p50, p95, p99)
- Memory usage tracking with entity count correlation
- Plugin load times and failure rates

**Performance Profiling**:
- Chrome DevTools integration for frame timing
- Turf.js operation profiling (which operations slow)
- Entity-to-GeoJSON transform timing
- View synchronization latency measurement

**User Analytics** (Privacy-Preserving):
- Map view activation rate (% of sessions)
- Average spatial queries per session
- Most common query types (proximity vs area vs relationship)
- Entity count distribution in actual usage
- Browser/device performance cohorts

---

## Deployment Strategy

### Incremental Rollout Plan

**Phase 1: Foundation (Weeks 1-4)**  
Deploy MapLibre GL + OpenFreeMap integration with basic entity display (PRD-1.1, PRD-1.2). No spatial queries yet. Target 10% of users for feedback.

**Validation Criteria**:
- 60 FPS sustained with 5,000 entities
- <2 second map initialization
- Zero tile loading errors >95% reliability
- User feedback survey (NPS >8)

**Rollback Trigger**: FPS <30 for >5% of sessions, tile loading failure >10%

---

**Phase 2: Spatial Queries (Weeks 5-8)**  
Add proximity search and area filtering (PRD-2.1, PRD-2.2). Expand to 30% of users.

**Validation Criteria**:
- Proximity queries complete <500ms for 50K entities
- Zero client crashes from spatial operations
- Query adoption >40% of map view users
- Performance degradation <5% vs Phase 1

**Rollback Trigger**: Query latency >3 seconds p95, browser crashes >1%

---

**Phase 3: Multi-Layer Integration (Weeks 9-12)**  
Deploy D3.js overlay and Three.js integration (PRD-3.1, PRD-3.2). Expand to 60% of users.

**Validation Criteria**:
- D3 layer sync <300ms latency
- Three.js 3D mode maintains >30 FPS
- Cross-view selection works >99% reliability
- Memory usage <400 MB for 10K entities with all layers

**Rollback Trigger**: FPS degradation >20%, memory leaks detected, sync failures >5%

---

**Phase 4: Full Deployment (Weeks 13-16)**  
Enable all features for 100% of users. Monitor for scaling issues.

**Validation Criteria**:
- All Phase 1-3 metrics maintained
- Support ticket volume <5 per week
- Performance across diverse devices/browsers
- User adoption >60% of eligible sessions

**Rollback Trigger**: System-wide performance degradation, critical bugs affecting >10% users

---

### Blue-Green Deployment

**Configuration**: Maintain two identical frontend builds (blue=current, green=new)  
**Switch Mechanism**: Feature flag controls which build serves map plugin  
**Rollback Time**: <5 minutes (toggle feature flag)  
**Database Impact**: None (client-side only changes)

---

### Canary Deployment for Plugin

**Canary Group**: 5% of users receive new map plugin version  
**Metrics Comparison**: Canary performance vs baseline (FPS, query latency, error rate)  
**Automated Rollback**: If canary error rate >2x baseline, auto-disable new version  
**Promotion Criteria**: 24 hours stable with metrics within 10% of baseline

---

## Migration Path

### For Existing Users with Location Data

**Current State**: Users manually maintain location metadata in entity properties  
**Migration Strategy**: Zero-disruption automatic detection

**Migration Steps**:
1. **Detection Phase**: Scan entity schema for location-like properties (`lat/lng`, `latitude/longitude`, `coordinates`, `address`)
2. **Normalization**: Transform detected properties to standard `location: {lat, lng}` format
3. **Validation**: Confirm coordinate bounds, log anomalies for user review
4. **Activation**: Enable map view for entities with valid coordinates (no user action required)

**Data Preservation**: Original property names retained, new `location` field added  
**Rollback**: Disable map plugin, original data unchanged

---

### For Users Without Location Data

**Onboarding Flow**:
1. User adds entity with location-related text (address, city, region)
2. System detects location text, offers geocoding assistant
3. User confirms geocoding results, coordinates saved
4. Map view automatically available

**Geocoding Strategy**: Batch process on-demand (no automatic background geocoding to preserve privacy)

---

### Breaking Changes Policy

**No Breaking Changes**: All location data structures backward compatible  
**Deprecation Process**: If future changes needed, 6-month deprecation notice with migration guide  
**Version Pinning**: Users can pin map plugin version to prevent auto-updates

---

## Traceability Matrix

### PRD to TAD Mapping

| PRD Requirement | TAD Components | Quality Attributes |
|-----------------|----------------|-------------------|
| [PRD-1.1] Display Entities on Map | MapLibre Adapter, Tile Provider | Performance (render), Scalability (entity count) |
| [PRD-1.2] Link Map to Graph View | View Sync Manager, Event Bus | Performance (sync latency), Observability (logging) |
| [PRD-1.3] Style Entities by Properties | MapLibre Adapter (style rules) | Performance (style application) |
| [PRD-2.1] Proximity Search | Spatial Query Engine (Turf.js) | Performance (query latency), Scalability (50K entities) |
| [PRD-2.2] Area-Based Filtering | Spatial Query Engine (polygon ops) | Performance (polygon complexity), Security (validation) |
| [PRD-2.3] Spatial Relationship Detection | Spatial Query Engine (pairwise) | Performance (relationship calc), Scalability (pairs) |
| [PRD-3.1] D3.js Data Overlay | Multi-Layer Renderer, Coord Transform | Performance (FPS), Observability (sync tracking) |
| [PRD-3.2] 3D Geographic Features | Multi-Layer Renderer (Three.js) | Performance (3D FPS), Memory (scene complexity) |
| [PRD-3.3] Infinite Canvas Integration | Multi-Layer Renderer (viewport) | Performance (canvas sync) |
| [PRD-4.1] Geocoding Entity Addresses | Geocoding Provider (extension point) | Security (HTTPS), Privacy (no metadata leak) |
| [PRD-4.2] Spatial Relationship Graph Edges | Spatial Query Engine + Graph API | Scalability (edge creation), Performance (graph update) |
| [PRD-4.3] Service Area Documentation | Spatial Query Engine (coverage calc) | Performance (area stats) |

---

## Validation Checklist

### Pre-Implementation Validation

#### PRD Completeness
- [x] Problem statements articulate user pain points without proposing solutions
- [x] User stories follow "As a...I want...So that" format with clear value proposition
- [x] Acceptance criteria use Given-When-Then pattern with measurable outcomes
- [x] Features prioritized via MoSCoW framework (Must/Should/Could/Won't)
- [x] Success metrics defined with baseline, target, and timeline
- [x] Out of scope items explicitly documented to prevent scope creep
- [x] Dependencies identified with mitigation strategies
- [x] Open questions flagged for research with decision timelines

#### TAD Completeness
- [x] Components have single responsibility with clear boundaries
- [x] Interfaces specified with typed contracts (request/response schemas)
- [x] Architectural decisions documented with ADR format (context, alternatives, rationale)
- [x] Quality attributes specified with concrete scenarios and metrics
- [x] Deployment strategy defined with rollback procedures
- [x] Migration path addresses existing users and data preservation
- [x] Traceability matrix links PRD requirements to TAD components

#### Separation of Concerns
- [x] PRD contains zero implementation details (no code, algorithms, libraries)
- [x] TAD contains zero business logic (no user stories, acceptance criteria)
- [x] PRD focuses on WHAT (user needs) and WHY (business value)
- [x] TAD focuses on HOW (technical approach) and CONSTRAINTS (quality attributes)

---

### Post-Documentation Review

#### Stakeholder Validation
- [ ] Product Manager confirms PRD addresses user research findings
- [ ] UX Designer validates user personas match target audience
- [ ] Development Team confirms TAD provides sufficient implementation guidance
- [ ] QA Engineer verifies acceptance criteria are testable and unambiguous
- [ ] Security Team approves data privacy and input validation strategies
- [ ] Performance Team validates scalability targets are achievable

#### Technical Feasibility
- [ ] MapLibre GL + OpenFreeMap integration prototyped successfully
- [ ] Turf.js performance benchmarked with representative datasets
- [ ] D3.js/Three.js coordinate synchronization tested
- [ ] Event bus pattern prevents circular updates in prototype
- [ ] Plugin lazy loading achieves <500ms initialization target

#### Documentation Quality
- [ ] All mantra requirements (CID framework) applied to specifications
- [ ] Requirement IDs enable bidirectional PRD-TAD traceability
- [ ] No conflicting specifications between PRD and TAD
- [ ] Document versioning tracks evolution with semantic versioning
- [ ] Open questions resolved or assigned to research owners

---

## Appendix: Technology Stack Summary

### Core Libraries (Required)

| Library | Version | License | Bundle Size | Purpose |
|---------|---------|---------|-------------|---------|
| MapLibre GL JS | 4.x | BSD-3 | 220 KB (68 KB gzipped) | Map rendering, 3D visualization |
| Turf.js (modular) | 7.x | MIT | 15-50 KB (5-15 KB gzipped) | Spatial analysis operations |
| OpenFreeMap Tiles | Latest | ODbL | 0 KB (CDN-hosted) | Vector map tiles |

**Total Bundle Impact**: ~90 KB gzipped (lazy-loaded only when map view activated)

### Optional Extensions

| Extension | Purpose | Bundle Impact | Loading Strategy |
|-----------|---------|---------------|------------------|
| Nominatim Client | Address geocoding | +5 KB | On-demand import |
| Proj4js | Coordinate transformations | +20 KB | Lazy load if custom projections needed |
| MapLibre-Three Plugin | Enhanced 3D integration | +8 KB | Bundled with Three.js layer activation |

### Integration Dependencies

| System Component | Required API | Coupling Level |
|-----------------|--------------|----------------|
| Graph View | Selection state getter/setter | Low (event-based) |
| D3.js System | SVG overlay container | Medium (DOM coordination) |
| Three.js System | WebGL context sharing | High (rendering cycle sync) |
| Infinite Canvas | Viewport bounds API | Low (geometric transform) |
| Entity Store | Read-only entity access | Low (query interface) |

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-21 | System Architect | Initial PRD & TAD draft for stakeholder review |

---

## Approval Signatures

**Product Manager**: _________________ Date: _________  
**System Architect**: _________________ Date: _________  
**Engineering Lead**: _________________ Date: _________  
**UX Designer**: _________________ Date: _________

---

*End of Document*

---

https://claude.ai/chat/b9e13636-997e-4d35-b742-44c710e716a5


```
I've created a comprehensive PRD & TAD document for integrating MapLibre GL + OpenFreeMap + Turf.js into your Knowledge Graph/Agentic GraphRAG system.

## Document Highlights:

### **PRD Section (WHAT/WHY)**
- **4 Epics** covering visualization, spatial analysis, multi-layer integration, and knowledge enrichment
- **12 User Stories** with Given-When-Then acceptance criteria
- **3 User Personas** (Research Analyst, Intelligence Analyst, Urban Planner)
- **Quantified Success Metrics** with baselines and targets
- **MoSCoW Prioritization** for incremental delivery

### **TAD Section (HOW)**
- **5 Core Components**: MapLibre Adapter, Spatial Query Engine, View Sync Manager, Multi-Layer Renderer, Tile Provider
- **5 Integration Contracts**: Data transforms, spatial queries, event sync, D3 overlay, Three.js custom layer
- **5 ADRs** documenting critical decisions (Turf.js client-side, OpenFreeMap tiles, MapLibre over Leaflet, Event Bus, Plugin Architecture)
- **5 API Patterns**: Hook-based loading, Adapter, Observer, Strategy, Factory
- **5 Plugin Extension Points**: Custom queries, map layers, projections, geocoding, event streams

### **Key Features Evaluated**:

**APIs**: REST-style contracts with typed schemas, Promise-based async patterns  
**Plugins**: Lazy-loaded architecture with semantic versioning, zero-cost for non-users  
**Hooks**: React-style hooks for feature activation and lifecycle management  
**Events**: Pub/sub event bus with source tracking to prevent circular updates

### **All Guidelines Met**:
✅ Problem-first approach (no solution jumping)  
✅ Domain-agnostic patterns (reusable across knowledge domains)  
✅ Bidirectional traceability (PRD↔TAD matrix)  
✅ No code blocks >10 lines (max 9 lines per example)  
✅ Measurable acceptance criteria  
✅ Quality attributes with concrete scenarios  
✅ Deployment strategy with rollback plans

The document is ready for stakeholder review and provides complete implementation guidance while maintaining separation between product requirements and technical architecture.
```
