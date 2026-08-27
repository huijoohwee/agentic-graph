# AgenticGraph Disjoint Force + Frontmatter Document

## Design Mantras

```
- [ ] Natural Disjoint; separate components softly; forbid rigid grid placement
- [ ] Seeded Stability; warm-start via clustering; forbid random first-frame chaos
- [ ] Frontmatter Isolation; scope frontmatter to Mermaid-only; forbid mixed graph scopes
- [ ] Deterministic Anchors; place component anchors deterministically; forbid unstable ordering
- [ ] Configurable Forces; tune via schema.layout.forces; forbid hidden constants
- [ ] Domain Neutrality; use general algorithms; forbid domain-tuned heuristics
```

---

## Universal Design Principles

| Context         | Intent                              | Directive                                                                 |
|----------------|-------------------------------------|---------------------------------------------------------------------------|
| Determinism    | Stable layout across re-renders      | - [ ] Normalize ids + order components; forbid unstable iteration order   |
| Separation     | Avoid component collapse             | - [ ] Use component anchors + positioning forces; forbid overlap-by-default |
| Performance    | Avoid wasteful recalculation         | - [ ] Warm-start when stable; forbid unnecessary simulation restarts      |
| Configuration  | Externalize behavior                 | - [ ] Declare defaults in schema; forbid inline magic constants           |
| Locality       | Bound responsibility boundaries      | - [ ] Keep component packing + overlap in focused modules                 |
| Reliability    | Ensure frontmatter scope correctness | - [ ] Filter to Mermaid frontmatter nodes in frontmatter mode             |

---

## Canvas Layout Architecture

**Stack**: Markdown → Graph Derivation → Force Seed → Force Simulation → Canvas Render

**Key idea**: For disconnected graphs, use D3 positioning forces (`forceX`/`forceY`) to attract nodes to the viewport center, instead of using uniform translation-based centering that can cause counter-motion artifacts during interaction or complex spiral packing that causes nodes to escape the viewport. This aligns exactly with the [D3 Disjoint Force-Directed Graph](https://observablehq.com/@d3/disjoint-force-directed-graph/2) behavior.

**Core modules**

- Overlap resolution (native broadphase): [overlap.ts](../../canvas/src/components/GraphCanvas/layout/overlap.ts)
- Simulation orchestration: [simulation.ts](../../canvas/src/components/GraphCanvas/simulation.ts)
- Heuristic Clustering (Seed): [heuristic-cluster.ts](../../canvas/src/components/GraphCanvas/layout/heuristic-cluster.ts)
- Frontmatter scoping: [layerDerivation.ts](../../canvas/src/lib/graph/layerDerivation.ts)

---

## Module Specifications

### Module: Disjoint Components (Center Attraction)

**Responsibility**: Prevent disconnected subgraphs from drifting infinitely away due to `forceManyBody` repulsion.

**Interface**: Handled directly in `simulation.ts` via `d3.forceX(centerX)` and `d3.forceY(centerY)`.

**Decision logic**

- Instead of complex spiral component packing, apply a weak `forceX` and `forceY` towards the viewport center to all nodes.
- When `disjointComponents` is enabled in the schema, the anchor strength is slightly increased to ensure subgraphs pack naturally without escaping the viewport.
- Enhancement: Aligned exactly with [D3 Disjoint Force](https://observablehq.com/@d3/disjoint-force-directed-graph/2) principles, simplifying the layout engine and avoiding out-of-bounds nodes.

### Module: Force Simulation (Force Mode)

**Responsibility**: Seed node positions → apply forces → return `d3.forceSimulation`.

**Key forces**

- Link cohesion: `d3.forceLink`
- Repulsion: `d3.forceManyBody`
- Positioning: `d3.forceX` + `d3.forceY` targeting component anchors when `disjointComponents` is enabled
- Overlap: `d3.forceCollide` (radius) + native `bboxCollide` (label-aware AABB with packed R-tree broadphase) + group-level bbox collision (label-aware group boxes)

**Implementation**: [buildSimulation](../../canvas/src/components/GraphCanvas/simulation.ts)

---

## Configuration Schema (Layout Forces)

Defined in [schemaTypes.ts](../../canvas/src/lib/graph/schemaTypes.ts) and defaulted in [schema.ts](../../canvas/src/lib/graph/schema.ts).

```yaml
layout:
  mode: force
  forces:
    disjointComponents: boolean        # default true (enabled unless explicitly false)
    disjointStrength: number           # scales anchor attraction
    centerStrength: number             # also contributes to anchor attraction

    bboxCollide: boolean               # default true
    bboxCollideStrength: number        # default 0.7
    bboxCollidePadding: number         # default 10
    bboxCollideTouchEpsilonPx: number  # default schema-driven
    bboxCollideTouchEpsilonXPx: number # optional axis-specific
    bboxCollideTouchEpsilonYPx: number # optional axis-specific
    bboxCollideTouchEpsilonZPx: number # optional axis-specific
    bboxCollideZEnabled: boolean       # default false
    bboxCollideIterations: number      # default 2

    groupBboxCollide: boolean          # deprecated for disabling; enforced when groups enabled
    groupBboxCollideStrength: number   # default 0.385
    groupBboxCollidePadding: number    # default 10
    groupBboxCollideTouchEpsilonPx: number # default schema-driven
    groupBboxCollideTouchEpsilonXPx: number # optional axis-specific
    groupBboxCollideTouchEpsilonYPx: number # optional axis-specific
    groupBboxCollideTouchEpsilonZPx: number # optional axis-specific
    groupBboxCollideZEnabled: boolean       # default false
    groupBboxCollideExtraGapZPx: number     # optional Z gap
    groupBboxCollideIterations: number # default 2
```

---

## Component Responsibility Matrix

| Layer/Subsystem | Path/Module | Component | Interface/Method | Responsibility (S-V-O) | Contracts |
|---|---|---|---|---|---|
| Layout | [simulation.ts](../../canvas/src/components/GraphCanvas/simulation.ts) | Disjoint attraction | d3.forceX / forceY | Simulation anchors components → pulls nodes to center | Center viewport |
| Layout | [overlap.ts](../../canvas/src/components/GraphCanvas/layout/overlap.ts) | Overlap force | createBboxCollideForce | Force resolves overlaps → adjusts velocities → respects pinned nodes | Label-aware AABB |
| Layout | [simulation.ts](../../canvas/src/components/GraphCanvas/simulation.ts) | Simulation | buildSimulation | Builder constructs forces → seeds nodes → returns simulation | Honors schema.layout.forces |
| Derivation | [layerDerivation.ts](../../canvas/src/lib/graph/layerDerivation.ts) | Frontmatter filter | filterGraphToFrontmatterMermaid | Filter scopes graph → keeps Mermaid frontmatter → returns scoped graph | Mermaid-only scope |

---

## Data Flow

**Pipeline**: Markdown → (Frontmatter toggle) → Graph Derivation → Seed (cluster-aware) → Force Simulation (Center attraction) → Render

| Stage | Input | Output | Performance Consideration |
|---|---|---|---|
| Scope | frontmatterModeEnabled | scoped graph | O(n+e) filter |
| Seed | nodes | seeded positions | avoids first-frame chaos |
| Simulate | nodes + edges + schema | stable positions | warm-start when stable |

---

## Design Decisions & Trade-offs

| Decision | Rationale | Pros | Cons | Mitigation |
|---|---|---|---|---|
| Soft component anchors via forceX/Y | Natural separation; stable during drag | organic, tunable | requires target placement | deterministic spiral packing |
| Native AABB overlap | Handle labels + rect nodes better than radius | fewer label collisions | extra per-tick work | packed R-tree broadphase + low iterations |
| Keep seed step | Preserve readability at init | stable first-frame | heuristic | only used when skipInitialLayout is false |

---

## Anti-Patterns (Forbidden)

| Context | Intent | Directive |
|---|---|---|
| Rigid placement | preserve natural aesthetics | - [ ] Forbid grid-locking components at init |
| Copied algorithms | keep codebase original | - [ ] Forbid copy-paste from external collision repos |
| Untyped config | keep schema authoritative | - [ ] Forbid adding force keys without schemaTypes updates |
| Render loops | keep UI responsive | - [ ] Forbid store updates from simulation tick |
