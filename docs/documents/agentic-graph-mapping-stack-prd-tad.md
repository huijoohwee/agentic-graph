# Knowledge Graph Geospatial Integration: PRD & TAD

**Document Version**: 1.0.2  
**Date**: 2026-01-23  
**Status**: Active (reference implementation extracted to `gympgrph`; agentic-graph hosts it via a plugin bridge)
> Canonical index document. Keep this file sub-600; continue integration contracts plus extension/delivery/validation detail in the companion documents linked below.
---

## Document Purpose

**Context**: Knowledge Graph systems with Agentic GraphRAG capabilities lack native geospatial visualization and spatial analysis  
**Intent**: Enable location-aware knowledge discovery through integrated mapping capabilities  
**Directive**: This document describes MapLibre GL + configurable vector-tile map styles (OpenFreeMap Liberty by default) + Turf.js integration layered on top of the infinite canvas. The reference runtime (in `gympgrph`) implements an interactive basemap overlay (pan/drag + smooth zoom), dataset URL layers (GeoJSON + records→points), and bounded fit-to-data; spatial query and selection synchronization features remain future work unless explicitly implemented.

---

# PART I: PRODUCT REQUIREMENTS DOCUMENTATION (PRD)

## Problem Statement

### Current User Pain Points

**Problem 1: No Spatial Context for Knowledge Entities**  
Users managing knowledge graphs with location-based entities (research papers, organizations, events, people) cannot visualize spatial relationships or patterns. Analysts spend hours manually cross-referencing locations across disparate tools.

**Problem 2: Inefficient Location-Based Knowledge Discovery**  
Users cannot query "show me all research on topic X within 50km of location Y" or discover knowledge clusters by geographic proximity. This forces inefficient text-based filtering followed by manual geographic validation.

**Problem 3: Disconnected Visualization Paradigms**  
Existing system provides graph visualization (d3.js), 3D knowledge structures (three.js), infinite canvas navigation, and markdown documentation, but lacks spatial dimension. Users must context-switch between graph view and external mapping tools.

### Quantified Impact

- **Research Efficiency**: 40% of knowledge entities contain geographic metadata currently unused
- **Discovery Time**: Users spend average 23 minutes per session validating geographic relationships manually
- **Context Switching**: 67% of users report using external mapping tools alongside knowledge graph
- **Spatial Queries**: Zero spatial analysis capabilities despite 45% of queries containing location intent

---

## User Personas

### Persona 1: Research Analyst
**Role**: Academic researcher analyzing global climate research distribution  
**Goals**: Discover research clusters, identify geographic gaps, find collaborators by proximity  
**Pain Points**: Cannot visualize research paper locations, no spatial query capabilities, manual distance calculations  
**Technical Proficiency**: High (familiar with data analysis tools)

### Persona 2: Intelligence Analyst  
**Role**: Government analyst tracking organization networks  
**Goals**: Map entity relationships geographically, analyze proximity patterns, identify spatial anomalies  
**Pain Points**: No geofencing capabilities, cannot calculate service areas, missing spatial relationship detection  
**Technical Proficiency**: Medium (uses specialized analysis tools)

### Persona 3: Urban Planner
**Role**: City planning consultant managing stakeholder knowledge base  
**Goals**: Visualize project locations, analyze impact zones, map community feedback  
**Pain Points**: Cannot overlay project boundaries, no buffer zone analysis, missing distance measurements  
**Technical Proficiency**: Medium-Low (primarily domain tools)

---

## Epic 1: Geospatial Knowledge Entity Visualization

### Epic Problem Statement
Users need to visualize knowledge graph entities with location attributes on interactive maps to understand spatial patterns and relationships that are invisible in traditional graph views.

### User Stories

#### Story 1.1: Display Entities on Map
**As a** research analyst  
**I want** to see knowledge graph nodes with location data plotted on an interactive map  
**So that** I can identify geographic distribution patterns and regional clusters

**Acceptance Criteria**:
- **Given** knowledge graph contains entities with latitude/longitude properties
- **When** user activates map view mode
- **Then** entities render as markers on map within 2 seconds for up to 10,000 entities
- **And** clicking marker displays entity metadata in popup
- **And** map supports pan, zoom, and rotation interactions

**Priority**: MUST HAVE  
**Complexity**: Medium  
**Dependencies**: [PRD-1.2] Coordinate extraction from entities

#### Story 1.2: Link Map to Graph View
**As a** intelligence analyst  
**I want** map markers synchronized with graph node selection  
**So that** I can maintain context when switching between spatial and relational views

**Acceptance Criteria**:
- **Given** both map view and graph view are visible
- **When** user selects node in graph view
- **Then** corresponding map marker highlights and centers within 300ms
- **And** map zoom adjusts to show marker context
- **When** user clicks map marker
- **Then** corresponding graph node highlights
- **And** graph view pans to show selected node and immediate neighbors

**Priority**: MUST HAVE  
**Complexity**: High  
**Dependencies**: [PRD-1.1], existing graph view state management

#### Story 1.3: Style Entities by Properties
**As a** urban planner  
**I want** map markers styled by entity type, status, or custom properties  
**So that** I can visually distinguish categories and priorities at a glance

**Acceptance Criteria**:
- **Given** entities have categorical properties (type, status, priority)
- **When** user applies visual encoding rules
- **Then** markers display with colors, icons, and sizes matching rules
- **And** legend shows current visual encoding
- **When** user hovers over legend item
- **Then** corresponding markers highlight on map

**Priority**: SHOULD HAVE  
**Complexity**: Medium  
**Dependencies**: [PRD-1.1], styling configuration system

---

## Epic 2: Spatial Query and Analysis

### Epic Problem Statement
Users need client-side spatial analysis capabilities to discover knowledge patterns based on geographic proximity, containment, and distance relationships without server round-trips.

### User Stories

#### Story 2.1: Proximity Search
**As a** research analyst  
**I want** to find all entities within specified distance of a location  
**So that** I can discover local knowledge clusters and identify regional experts

**Acceptance Criteria**:
- **Given** user clicks or searches for location on map
- **When** user specifies radius (1km, 5km, 10km, 50km, 100km)
- **Then** system displays buffer circle on map
- **And** entities within buffer highlight within 500ms for up to 50,000 entities
- **And** sidebar lists filtered entities with calculated distances (ascending order)
- **And** user can adjust radius with slider updating results in real-time

**Priority**: MUST HAVE  
**Complexity**: Medium  
**Dependencies**: [PRD-1.1], Turf.js buffer and distance functions

#### Story 2.2: Area-Based Filtering
**As a** intelligence analyst  
**I want** to select geographic regions and filter entities by containment  
**So that** I can analyze knowledge within political boundaries or custom zones

**Acceptance Criteria**:
- **Given** user draws polygon or uploads GeoJSON boundary
- **When** user activates area filter
- **Then** only entities within polygon remain visible
- **And** system calculates entity count and density statistics
- **And** user can save custom areas for reuse
- **When** polygon boundaries overlap entity locations
- **Then** point-in-polygon calculation completes <100ms per 10,000 entities

**Priority**: SHOULD HAVE  
**Complexity**: High  
**Dependencies**: [PRD-1.1], Turf.js boolean operations

#### Story 2.3: Spatial Relationship Detection
**As a** urban planner  
**I want** to identify entities within proximity of other entities or features  
**So that** I can analyze service coverage and accessibility patterns

**Acceptance Criteria**:
- **Given** user selects entity type A and entity type B
- **When** user specifies relationship (within 500m, within 1km, etc.)
- **Then** system identifies all A-B pairs matching spatial relationship
- **And** displays connecting lines on map showing relationships
- **And** generates downloadable report of entity pairs with distances
- **And** calculation completes within 3 seconds for up to 5,000 entity pairs

**Priority**: COULD HAVE  
**Complexity**: High  
**Dependencies**: [PRD-2.1], graph relationship creation API

---

## Epic 3: Multi-Layer Integration

### Epic Problem Statement
Users need to combine knowledge graph visualizations with geographic context layers (existing d3.js, three.js, infinite canvas) to analyze multi-dimensional relationships in unified workspace.

### User Stories

#### Story 3.1: D3.js Data Overlay
**As a** research analyst  
**I want** to overlay D3.js statistical visualizations on map locations  
**So that** I can analyze quantitative patterns with geographic context

**Acceptance Criteria**:
- **Given** entities have quantitative metrics (citation count, funding amount, impact score)
- **When** user enables data visualization layer
- **Then** D3.js charts (pie, bar, bubble) render at entity locations
- **And** charts scale with map zoom appropriately
- **And** charts update within 500ms when data filters change
- **When** user interacts with chart
- **Then** corresponding entity highlights in graph view

**Priority**: SHOULD HAVE  
**Complexity**: High  
**Dependencies**: [PRD-1.1], existing D3.js visualization system

#### Story 3.2: 3D Geographic Features
**As a** intelligence analyst  
**I want** to visualize knowledge structures in 3D with geographic base layer  
**So that** I can analyze hierarchical relationships with spatial context

**Acceptance Criteria**:
- **Given** knowledge graph has hierarchical structure (organizations, departments, teams)
- **When** user activates 3D view mode
- **Then** map displays with terrain/buildings using MapLibre 3D capabilities
- **And** Three.js renders knowledge hierarchy as vertical structures above geographic locations
- **And** user can rotate, tilt, and orbit 3D scene
- **And** frame rate maintains >30 FPS with up to 1,000 3D objects

**Priority**: COULD HAVE  
**Complexity**: Very High  
**Dependencies**: [PRD-1.1], existing Three.js system, MapLibre 3D API

#### Story 3.3: Infinite Canvas Integration
**As a** urban planner  
**I want** map view embedded in infinite canvas workspace  
**So that** I can organize multiple map contexts alongside documents and diagrams

**Acceptance Criteria**:
- **Given** infinite canvas contains multiple content blocks
- **When** user adds map view block
- **Then** MapLibre renders within canvas viewport bounds
- **And** map supports pan/zoom independent of canvas pan/zoom
- **And** user can resize map block dynamically
- **When** canvas zooms or pans
- **Then** map view updates to maintain geographic context within 100ms

**Priority**: SHOULD HAVE  
**Complexity**: High  
**Dependencies**: [PRD-1.1], existing infinite canvas system

---

## Epic 4: Knowledge Enrichment via Location

### Epic Problem Statement
Users need to enrich knowledge entities with geographic context and create location-aware connections to enhance discovery and analysis capabilities.

### User Stories

#### Story 4.1: Geocoding Entity Addresses
**As a** research analyst  
**I want** system to automatically geocode entities with address text  
**So that** entities without coordinates become mappable without manual data entry

**Acceptance Criteria**:
- **Given** entity contains address field (street, city, country)
- **When** user triggers geocoding process
- **Then** system converts addresses to coordinates using geocoding service
- **And** displays success/failure report with validation warnings
- **And** user can review and approve coordinate assignments
- **And** processes up to 1,000 addresses in batch within 60 seconds

**Priority**: SHOULD HAVE  
**Complexity**: Medium  
**Dependencies**: External geocoding API, entity data model extension

#### Story 4.2: Spatial Relationship Graph Edges
**As a** intelligence analyst  
**I want** graph edges automatically created for spatially proximate entities  
**So that** I can discover hidden relationships through geographic clustering

**Acceptance Criteria**:
- **Given** knowledge graph contains geocoded entities
- **When** user specifies proximity threshold (e.g., within 1km)
- **Then** system creates "nearby" relationship edges between qualifying entities
- **And** new edges appear in graph view with distinct styling
- **And** edge weights reflect calculated distances
- **And** user can filter graph view to show only spatial relationships

**Priority**: COULD HAVE  
**Complexity**: High  
**Dependencies**: [PRD-2.1], graph data model, relationship API

#### Story 4.3: Service Area Documentation
**As a** urban planner  
**I want** to define and store service areas for entities  
**So that** I can analyze coverage, identify gaps, and plan expansions

**Acceptance Criteria**:
- **Given** entity represents service provider (clinic, library, transit stop)
- **When** user defines service radius or custom polygon
- **Then** service area saves to entity metadata
- **And** service area displays on map with transparency
- **And** system calculates population/entity count within service area
- **When** multiple service areas overlap
- **Then** system highlights overlap zones with distinct color

**Priority**: COULD HAVE  
**Complexity**: Medium  
**Dependencies**: [PRD-2.2], entity metadata schema

---

## Success Metrics

### User Experience Metrics
| Metric | Baseline | Target | Timeline | Measurement Method |
|--------|----------|--------|----------|-------------------|
| Time to visualize 5,000 entities | N/A (not possible) | <3 seconds | 3 months | Performance logging |
| Proximity query completion | N/A | <500ms | 3 months | Performance logging |
| Map-graph view sync latency | N/A | <300ms | 2 months | User interaction tracking |
| Spatial query adoption | 0% of users | 60% of users | 6 months | Usage analytics |

### Business Metrics
| Metric | Baseline | Target | Timeline | Measurement Method |
|--------|----------|--------|----------|-------------------|
| Geographic metadata utilization | 40% unused | 80% actively used | 6 months | Data analysis |
| Average session discovery actions | 12 actions | 25 actions | 4 months | Usage analytics |
| External tool context switches | 67% of users | <20% of users | 6 months | User surveys |
| Spatial query feature requests | 15 per month | <3 per month | 6 months | Support tickets |

### Technical Performance Metrics
| Metric | Baseline | Target | Timeline | Measurement Method |
|--------|----------|--------|----------|-------------------|
| Client bundle size increase | 0 KB | <150 KB gzipped | 1 month | Build analysis |
| Map render performance (10K entities) | N/A | 60 FPS | 2 months | Performance profiling |
| Spatial analysis latency (50K entities) | N/A | <1 second | 3 months | Performance logging |
| Memory overhead | 0 MB | <100 MB for 50K entities | 2 months | Memory profiling |

---

## Out of Scope

### Explicitly Excluded Features

**Server-Side Spatial Database**  
Spatial analysis occurs client-side using Turf.js. No PostGIS or server-side GIS infrastructure.  
**Rationale**: Maintains zero-backend-dependency principle, enables offline operation, reduces infrastructure complexity.

**Custom Map Tile Generation**  
System uses configurable MapLibre vector styles (via style URL). No tile server deployment or custom tile rendering in the baseline implementation.  
**Rationale**: Eliminates hosting costs, reduces operational complexity, leverages existing FOSS infrastructure while allowing provider switching through configuration.

**Real-Time Collaborative Editing**  
Geographic edits (moving markers, adjusting boundaries) remain single-user operations.  
**Rationale**: Requires real-time synchronization infrastructure outside current system scope.

**Routing and Navigation**  
No turn-by-turn directions, route optimization, or navigation features.  
**Rationale**: Requires routing engine and road network data beyond spatial analysis needs.

**Temporal-Spatial Analysis**  
No time-series geographic visualizations (entity movement over time, historical location changes).  
**Rationale**: Requires temporal data model extensions and animation infrastructure deferred to future phase.

---

## Dependencies

### Technical Prerequisites
- **Coordinate Data Availability**: Entities must contain latitude/longitude fields or geocodable addresses
- **Browser WebGL Support**: MapLibre requires WebGL for rendering; fallback strategy needed for unsupported browsers
- **Existing Integration Points**: Access to graph view state management, d3.js rendering pipeline, three.js scene graph, infinite canvas API

### External Service Dependencies
- **Vector tile/style provider (config-driven)**: default uses MapLibre demo tiles (zero configuration, no API key); OpenFreeMap or self-hosted style JSON are optional.
- **Optional Geocoding Service**: For address-to-coordinate conversion (Story 4.1) - recommend Nominatim (FOSS)

### Data Model Dependencies
- Entity schema extension: Add optional `location: {lat: number, lng: number}` property
- Entity schema extension: Add optional `address: {street, city, country}` property
- Entity schema extension: Add optional `serviceArea: GeoJSON` property
- Graph relationship schema: Support new `spatiallyNear` edge type with distance weight

---

## Open Questions

### Requiring Research

**Q1: Geocoding Strategy**  
Should geocoding happen on-demand (user-triggered) or automatically in background? What fallback when geocoding fails?  
**Research Needed**: User workflow analysis, geocoding service rate limits, error handling UX patterns  
**Decision Timeline**: Week 2

**Q2: Mobile Device Performance**  
What entity count threshold triggers progressive loading or clustering on mobile devices?  
**Research Needed**: Mobile browser performance testing, memory constraints on iOS/Android  
**Decision Timeline**: Week 3

**Q3: Offline Capability**  
Should system cache map tiles for offline operation? What storage quota is acceptable?  
**Research Needed**: IndexedDB storage limits, tile caching strategies, user offline usage patterns  
**Decision Timeline**: Week 4

**Q4: Coordinate System Handling**  
How to handle entities with non-WGS84 coordinate systems (UTM, State Plane, custom projections)?  
**Research Needed**: Coordinate transformation library evaluation (proj4js), use case frequency  
**Decision Timeline**: Week 3

---

## MoSCoW Prioritization

### MUST HAVE (Minimum Viable Product)
- [PRD-1.1] Display Entities on Map
- [PRD-1.2] Link Map to Graph View
- [PRD-2.1] Proximity Search
- Basic marker clustering for >1,000 entities
- Error handling for missing coordinates

### SHOULD HAVE (Enhanced Experience)
- [PRD-1.3] Style Entities by Properties
- [PRD-2.2] Area-Based Filtering
- [PRD-3.1] D3.js Data Overlay
- [PRD-3.3] Infinite Canvas Integration
- [PRD-4.1] Geocoding Entity Addresses
- Export spatial query results to CSV/GeoJSON

### COULD HAVE (Value-Add Features)
- [PRD-2.3] Spatial Relationship Detection
- [PRD-3.2] 3D Geographic Features
- [PRD-4.2] Spatial Relationship Graph Edges
- [PRD-4.3] Service Area Documentation
- Heatmap visualization for entity density
- Custom basemap style switching

### WON'T HAVE (Future Phases)
- Server-side spatial database
- Real-time collaborative map editing
- Temporal-spatial analysis
- Turn-by-turn routing
- Mobile native app integration

---

# PART II: TECHNICAL ARCHITECTURE DOCUMENTATION (TAD)

## Architecture Overview

**From knowledge entities to spatial insights**: System receives entities with location metadata → MapLibre Adapter transforms to GeoJSON → MapLibre GL renders via a configurable vector style URL → Turf.js Engine processes spatial queries → Integration Layer synchronizes with existing d3.js/three.js/infinite canvas → delivers interactive geospatial knowledge discovery interface.

### MVP Implementation Notes (Canvas)

- Geospatial Mode is implemented as a right-floating panel **Map** tab opened via a toolbar toggle.
- Implemented components: MapLibre Adapter (GraphNode → GeoJSON), Spatial Query Engine (proximity search), selection synchronization (map ↔ graph).
- Optional boundary overlay loads external GeoJSON via URL (compatible with exported country/state boundary FeatureCollections).
- Safety gates: bounded proximity results, bounded remote fetch limits, and StrictMode-safe map initialization (no unbounded effect loops).

---

## Component Specifications

### Component 1: MapLibre Adapter

**Responsibility**: Transforms knowledge graph entities to GeoJSON format compatible with MapLibre GL rendering pipeline

**Interfaces**:
```typescript
interface MapLibreAdapter {
  // Transform entities to GeoJSON FeatureCollection
  transformToGeoJSON(entities: Entity[]): GeoJSON.FeatureCollection
  
  // Convert GeoJSON back to entity references
  parseGeoJSONFeatures(features: GeoJSON.Feature[]): EntityReference[]
  
  // Apply visual encoding rules to features
  applyStyleRules(features: GeoJSON.Feature[], rules: StyleRule[]): StyledFeatureCollection
}
```

**Dependencies**: Entity data access layer, GeoJSON type definitions  
**Configuration**: Style mapping rules (entity type → marker icon/color), coordinate field paths

**From entities to features**: Adapter receives entity array → validates location properties → creates GeoJSON Point features with entity ID in properties → applies configured style mappings → returns FeatureCollection ready for MapLibre source.

---

### Component 2: Spatial Query Engine

**Responsibility**: Executes client-side spatial analysis operations using Turf.js library and caches results for performance

**Interfaces**:
```typescript
interface SpatialQueryEngine {
  // Find entities within radius of point
  proximitySearch(center: [number, number], radiusKm: number, entities: Entity[]): EntityDistance[]
  
  // Filter entities by polygon containment
  filterByArea(polygon: GeoJSON.Polygon, entities: Entity[]): Entity[]
  
  // Calculate pairwise spatial relationships
  findRelationships(entitiesA: Entity[], entitiesB: Entity[], 
                   maxDistanceKm: number): EntityPair[]
  
  // Compute service area coverage
  calculateCoverage(serviceArea: GeoJSON.Polygon, 
                   populationPoints: GeoJSON.FeatureCollection): CoverageStats
}
```

**Dependencies**: Turf.js modular imports (distance, buffer, booleanPointInPolygon, dissolve)  
**Configuration**: Distance units (km/miles), calculation precision, result caching TTL

**From query to results**: Engine receives spatial query parameters → validates input geometries → applies Turf.js functions with error handling → caches results with spatial index → returns filtered/analyzed entity set within performance threshold.

---

### Component 3: View Synchronization Manager

**Responsibility**: Maintains bidirectional state synchronization between map view and existing graph/canvas visualizations

**Interfaces**:
```typescript
interface ViewSyncManager {
  // Synchronize entity selection across views
  syncSelection(sourceView: ViewType, entityIds: string[]): void
  
  // Coordinate viewport synchronization
  syncViewport(sourceView: ViewType, bounds: GeoBounds | GraphBounds): void
  
  // Subscribe to cross-view events
  subscribeToEvents(viewType: ViewType, handler: ViewEventHandler): Subscription
  
  // Batch state updates to prevent cascading re-renders
  batchUpdate(updates: ViewStateUpdate[]): void
}
```

**Dependencies**: Event bus system, graph view state API, infinite canvas API  
**Configuration**: Debounce intervals, viewport transformation functions, event priority levels

**From interaction to sync**: Manager receives selection event from source view → debounces rapid events → transforms coordinates/IDs to target view format → publishes synchronized state → prevents circular update loops via event source tracking.

---

### Component 4: Multi-Layer Renderer

**Responsibility**: Composes MapLibre, D3.js, and Three.js rendering contexts in unified viewport with proper layer ordering and event routing

**Interfaces**:
```typescript
interface MultiLayerRenderer {
  // Create rendering context for layer type
  createLayer(type: 'map' | 'd3-overlay' | 'three-scene'): RenderLayer
  
  // Manage layer z-index and visibility
  setLayerOrder(layerIds: string[], zIndices: number[]): void
  
  // Route events to appropriate layer
  routeInteraction(event: PointerEvent): LayerEventResult
  
  // Synchronize coordinate systems across layers
  transformCoordinates(coords: number[], 
                      from: CoordinateSpace, 
                      to: CoordinateSpace): number[]
}
```

**Dependencies**: MapLibre GL map instance, D3.js SVG overlay, Three.js WebGL renderer  
**Configuration**: Layer rendering order, event capture rules, coordinate projection matrices

**From layers to composite view**: Renderer initializes MapLibre base layer → creates SVG overlay for D3 positioned absolutely → integrates Three.js WebGL context via MapLibre custom layer API → routes pointer events by layer hit testing → maintains coordinate transformation matrices for cross-layer positioning.

---

### Component 5: Vector Style Provider Integration

**Responsibility**: Manages connection to a vector style/tile provider via MapLibre style URL, with bounded error handling and request proxying

**Interfaces**:
```typescript
interface TileProvider {
  // Initialize tile source configuration
  configure(styleUrl: string): TileSourceConfig
  
  // Handle tile loading errors
  handleTileError(error: TileLoadError): RecoveryAction
  
  // Monitor tile loading performance
  getPerformanceMetrics(): TilePerformanceMetrics
  
  // Switch tile style at runtime
  changeStyle(newStyle: string): Promise<void>
}
```

**Dependencies**: MapLibre GL style specification, network request handling  
**Configuration**: Style URL, request proxy endpoint, retry policies

**From style to tiles**: Provider loads a vector style JSON → MapLibre requests vector tile resources → Provider proxies cross-origin requests when necessary → Provider monitors failures and retries boundedly → delivers resources to MapLibre rendering pipeline.

---
## Continued In Companion Documents
- agentic-graph-mapping-stack-prd-tad-integration-contracts-and-patterns.md
- agentic-graph-mapping-stack-prd-tad-extension-delivery-and-validation.md
