# agentic-graph Schema Configuration Architecture

## Design Mantras

```
- [ ] Configuration; externalize behavior; forbid hardcoded styling
- [ ] Modularity; separate layout from layers; forbid coupled rendering
- [ ] Performance; cache layout state; forbid redundant computation
- [ ] Extensibility; support preset expansion; forbid closed configuration
- [ ] Neutrality; derive from metadata; forbid dataset-specific logic
```
## Schema Configuration Architecture

**Schema Stack**: Graph Metadata → Schema-Config Presets → Runtime Configuration → Canvas Rendering

**Configuration Flow**: Parser Hints → Schema-Config Defaults → User Overrides → Renderer Application → Export Preservation

**Design Principles**: Metadata-Driven Defaults | Runtime Configurability | Layout-Layer Separation | Preset Extensibility

**Core modeling note (SSOT)**: Entity (Node) → Relation/Predicate (Edge) → Metadata (Attribute in `properties`/`metadata`) → Cluster (Subgraph/Graph Layer).

## Example Workflow Schema-Config

### Dataset and Schema-Config Pairing

**Dataset**: `docs/assets/example-workflow.jsonld` – Neutral workflow with regions and questions

**Schema-Config**: `data/config/schema/agentic-graph-example-workflow-schema-config.jsonld`

**Configuration Schema**:

```yaml
layers.mode:
  scope: schema_global
  type: string (enum: "semantic" | "document" | "schema")
  mutability: runtime_configurable
  validation: must be valid layer mode
  impact: default is "semantic", matches canvas default and UI "Similarity clusters (semantic)"

layers.semantic.hiddenNodeTypes:
  scope: layer_specific
  type: array (strings)
  mutability: runtime_configurable
  validation: types must exist in graph
  impact: hides ["geo:Polygon"] in semantic mode for graph-layer cluster annotations

layers.documentStructure:
  scope: layer_specific
  type: object
  mutability: deployment_configurable
  validation: neutral configuration for structural layer
  impact: renders full graph without hiding nodes/edges in "Layered structure (document)" mode

layers.schema:
  scope: layer_specific
  type: object
  mutability: deployment_configurable
  validation: neutral configuration for schema layer
  impact: renders full graph in "Schema (entities)" mode
```

**Layer Behavior Summary**:

| Layer Mode         | UI Label                           | Active Configuration                      | Visibility Behavior                                  |
|--------------------|------------------------------------|--------------------------------------------|------------------------------------------------------|
| Semantic           | "Similarity clusters (semantic)"   | `layers.mode: "semantic"`                 | Hides `geo:Polygon` nodes via `hiddenNodeTypes`      |
| Document           | "Layered structure (document)"     | `layers.mode: "document"`                 | Shows all nodes and edges without filtering          |
| Schema             | "Schema (entities)"                | `layers.mode: "schema"`                   | Shows all nodes and edges without filtering          |

**Examples Catalog Entry**:

```typescript
{
  id: "exampleWorkflow",
  datasetPath: "docs/assets/example-workflow.jsonld",
  schemaPath: "data/config/schema/agentic-graph-example-workflow-schema-config.jsonld"
}
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Layer Mode Selection  | Set initial renderer layer    | - [ ] Read `layers.mode` from schema-config; apply to canvas; forbid hardcoded defaults     | Schema loader             | `applyLayerMode`     | schema-config object      | active layer mode     | schema.layers.mode value extraction     |
| Node Filtering        | Hide types in semantic mode   | - [ ] Filter nodes by `hiddenNodeTypes` when `mode === "semantic"`; forbid filtering in other modes | Layer processor           | `filterSemanticNodes` | nodes, schema layers     | filtered nodes        | type membership test + mode check       |

---

## Layout and Mode Interaction

### Layout Modes

**Configuration Schema**:

```yaml
schema.layout.mode:
  scope: schema_global
  type: string (enum: "force" | "radial" | "block" | "mermaid")
  mutability: runtime_configurable
  validation: must be valid layout algorithm
  impact: selects graph layout algorithm or renderer-owned layout mode
```

**Layout Mode Descriptions**:

| Mode      | Algorithm                  | Use Case                     | Complexity     |
|-----------|----------------------------|------------------------------|----------------|
| `force`   | Force-directed simulation  | General-purpose graph layout | O(n²) per tick |
| `radial`  | Circular hierarchy         | Emphasize centrality         | O(n log n)     |
| `block`   | Block-style 2D placement   | Flowchart-like 2D surfaces   | Bounded by graph size |
| `mermaid` | Mermaid-owned layout       | Mermaid frontmatter surfaces | Delegated to Mermaid |

### Flow Renderer Layout Configuration

**Configuration Schema**:

```yaml
schema.layout.flow.engine:
  scope: layout_global
  type: string (enum: "auto" | "elk" | "dagre" | "grid")
  mutability: runtime_configurable
  impact: selects which Flow layout engine to use (bounded fallbacks apply)

schema.layout.flow.elkLayout:
  scope: layout_global
  type: string (enum: "elk" | "elk.layered" | "elk.force" | "elk.mrtree" | "elk.stress")
  mutability: runtime_configurable
  impact: selects ELK algorithm when Flow uses ELK
```

---

### Advanced Fit-to-View Configuration

**Configuration Schema**:

```yaml
schema.layout.fitPadding:
  scope: layout_global
  type: number
  mutability: runtime_configurable
  validation: must be non-negative
  impact: padding around graph in pixels; fit scale computed on a capped 1920×1080 (16:9) frame

schema.layout.fitDetectClusters:
  scope: layout_global
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: enables outlier rejection to focus on main cluster (default: true)

schema.layout.fitTargetAspectRatio:
  scope: layout_global
  type: number
  mutability: runtime_configurable
  validation: must be positive
  impact: target aspect ratio (default: 1.777 for 16:9)

schema.layout.fitEnforceAspectRatio:
  scope: layout_global
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: enforces target aspect ratio by adjusting bounding box (default: true)
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Centroid Calculation  | Compute average position      | - [ ] Sum node positions; divide by count; blend with bbox center; forbid pure bbox centering | Layout engine             | `computeCentroid`    | node positions            | centroid point        | (Σx/n, Σy/n) blended with bbox center   |
| Outlier Rejection     | Focus on main cluster         | - [ ] Detect outliers beyond 2σ; exclude from fit bounds; forbid including all nodes       | Layout engine             | `detectOutliers`     | node positions            | inlier positions      | statistical distance thresholding       |
| Aspect Ratio Enforcement | Adjust bounding box        | - [ ] Compute bbox; expand to match target aspect ratio; forbid distortion                  | Layout engine             | `enforceAspectRatio` | bbox, target ratio        | adjusted bbox         | scale width or height to match ratio    |

---

### Structured Layout Position Caching

**Cache Key Pattern**: `(semanticMode, frontmatterMode, layoutMode, renderMode, renderVariant, layoutVariant?)` → node position map

**Frontmatter Note**:
- Frontmatter mode is “effective” only when the active graph contains frontmatter Mermaid seed nodes; if there are no seeds, filtering is a no-op and caches should not change namespaces.

**Caching Behavior**:

| Scenario                              | Cache Action                                              | Rationale                                                    |
|---------------------------------------|-----------------------------------------------------------|--------------------------------------------------------------|
| Switch from force to radial           | Save force positions under `default:force` (or `frontmatter:force`) key | Preserves force layout when switching to radial              |
| Switch back to force                  | Restore positions from `default:force` (or `frontmatter:force`) key     | Avoids recomputation of stable force layout                  |
| Toggle frontmatter mode               | Restore positions from `frontmatter:*` vs `default:*` key | Prevents cross-mode contamination                             |
| Replace graph data                    | Clear all layout caches                                   | Prevents memory leak and stale position application          |

**Configuration Schema**:

```yaml
layoutCache:
  scope: runtime_internal
  type: Map<string, Map<nodeId, {x, y, z}>>
  mutability: runtime_mutable
  validation: keys match (layerMode, layoutMode) pattern
  impact: enables instant layout restoration without recomputation
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Cache Key Generation  | Create unique layout keys     | - [ ] Combine layer mode and layout mode; use string template; forbid ambiguous keys        | Layout engine             | `generateCacheKey`   | layer mode, layout mode   | cache key string      | `${layerMode}-${layoutMode}` template   |
| Position Restoration  | Load cached positions         | - [ ] Lookup cache by key; apply to nodes; forbid stale cache application                   | Layout engine             | `restorePositions`   | cache key, nodes          | positioned nodes      | map lookup + position assignment        |
| Cache Invalidation    | Clear on graph replacement    | - [ ] Clear all cache entries on new graph load; forbid partial clearing                    | Graph store               | `clearLayoutCache`   | graph replacement event   | void                  | Map.clear() call                        |

---

### Port Handles Configuration

**Configuration Schema**:

```yaml
schema.behavior.portHandles.enabled:
  scope: behavior_global
  type: boolean
  mutability: runtime_configurable
  validation: boolean
  impact: enables cardinal port handles on nodes (default: false)

schema.behavior.portHandles.routeToNearestHandle:
  scope: behavior_global
  type: boolean
  mutability: runtime_configurable
  validation: boolean (active when portHandles.enabled)
  impact: routes 2D edges to nearest N/S/E/W handle (default: true when enabled)
```

**Port Handle Behavior**:

| Layout Mode         | Port Handles Behavior                                                   |
|---------------------|-------------------------------------------------------------------------|
| `force`, `radial`   | When enabled, nodes default to rectangular extents; edges route to cardinal handles |
| `tree`, `mermaid`   | Port handles disabled to avoid coupling layout-specific routing         |

**Node Shape Fallback**:

- Nodes without explicit `visual:shape` or `schema.nodeShapes` override default to rectangular extents when port handles are enabled.
- This ensures ports align to box edges rather than circular boundaries.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Port Position Calculation | Compute cardinal positions | - [ ] Compute N/S/E/W positions from node bounds; forbid diagonal ports                     | Port handler              | `computePortPositions` | node bounds             | {N, S, E, W} points   | geometric calculation from rect bounds  |
| Nearest Port Selection | Route edge to closest handle | - [ ] Compute distance to each port; select minimum; forbid arbitrary selection             | Edge router               | `selectNearestPort`  | edge endpoint, ports      | selected port point   | distance minimization algorithm         |

---

### Rectangular Node Sizing

**Configuration Schema**:

```yaml
schema.layout.rectNodes.maxZoomMinimapWidthRatio:
  scope: layout_global
  type: number
  mutability: runtime_configurable
  validation: must be in range [1, 50]
  impact: node width at max zoom as multiple of minimap width (default: 5, clamped to 1..50)

schema.layout.rectNodes.maxZoomMinimapHeightRatio:
  scope: layout_global
  type: number
  mutability: runtime_configurable
  validation: derived as widthRatio / 2
  impact: node height at max zoom maintaining 2:1 aspect ratio (default: 2.5)
```

**Fallback Sizing Behavior**:

- When `properties["visual:width"]` or `properties["visual:height"]` are missing:
  - Width ratio: clamped to [1, 50] times minimap width.
  - Height ratio: derived as `width / 2` to maintain 2:1 aspect ratio.
  - Floating Panel settings lock aspect ratio to prevent distortion.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Size Fallback         | Compute default dimensions    | - [ ] Check for visual:width/height; compute from minimap ratio; forbid zero dimensions     | Node renderer             | `computeNodeSize`    | node, minimap dims        | {width, height}       | ratio-based calculation with clamps     |
| Aspect Ratio Enforcement | Maintain 2:1 ratio          | - [ ] Derive height as width/2; forbid independent height override                          | Floating Panel UI         | `enforceAspectRatio` | width input               | locked height value   | height = width / 2                      |

---

## Semantic Layer Behavior

### Similarity Graph Derivation

**Processing Flow**:

| Stage                    | Input                          | Output                         | Responsibility                                              | Performance Consideration                    |
|--------------------------|--------------------------------|--------------------------------|-------------------------------------------------------------|----------------------------------------------|
| Tokenization             | Node text fields               | Token arrays per node          | Tokenize labels and properties                              | O(n * avg_text_length)                       |
| Similarity Calculation   | Token arrays                   | Pairwise similarity scores     | Compute cosine similarity or PMI                            | O(n²) for dense, O(nk) for sparse (k=topK)   |
| Edge Sparsification      | Similarity scores              | Filtered edges                 | Apply `topKEdgesPerNode` and `minSimilarity` thresholds     | O(n log k) per node with heap                |
| Community Detection      | Sparse similarity graph        | Community assignments          | Density-based clustering (DBSCAN) assigns `visual:community` with connected-components fallback for robustness | Bounded (maxNodes/maxSteps) + O(m) fallback  |

---

### Metrics and Property Keys (Canonical)

**Nodes (Entity layer)**:

- `type`: `Subject` | `Object` | `Entity` (GraphRAG text pipeline) and `Keyword` (keyword semantic mode).
- `properties["keyword:frequency"]`: mention count for keyword/entity nodes.
- `properties["visual:importance"]` / `properties["visual:nodeSize"]`: renderer sizing inputs derived from frequency + centrality.
- `properties["visual:community"]` / `properties["visual:layer"]`: cluster/community assignment used for layered layouts and group derivation.

**Edges (Relation/Predicate layer)**:

- `properties["strength:count"]`, `properties["strength:ppmi"]`, `properties["strength:score"]`: relation strength metrics.
- `properties["causality:why"]`, `properties["causality:temporal"]`, `properties["causality:modality"]`, `properties["causality:negation"]`, `properties["causality:score"]`: causality components and composite score.
- `properties["visual:width"]`: renderer stroke width derived from strength and causality.

**Clusters/Subgraphs (Graph layers)**:

- Group identity is derived from Mermaid subgraphs, markdown heading sections, keyword role layers, or `visual:community` communities.
- Collapsed group nodes use `properties["kg:groupId"]`, `properties["kg:groupMemberCount"]`, `properties["kg:collapsed"]`.

**Configuration Schema**:

```yaml
layers.semantic.topKEdgesPerNode:
  scope: layer_specific
  type: number
  mutability: runtime_configurable
  validation: must be positive integer
  impact: controls semantic edge density (smaller = sparser, higher = denser)

layers.semantic.minSimilarity:
  scope: layer_specific
  type: number
  mutability: runtime_configurable
  validation: [0, 1] for cosine, [-inf, inf] for PMI
  impact: filters low-quality edges (larger = higher confidence, smaller = broader coverage)
```

**Threshold Interaction**:

- **Smaller `topK`, larger `minSimilarity`**: Sparser, high-confidence neighborhoods.
- **Larger `topK`, smaller `minSimilarity`**: Denser, broader coverage with lower confidence threshold.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Cosine Calculation    | Compute text similarity       | - [ ] Tokenize texts; build TF-IDF vectors; compute cosine; forbid binary term matching     | Similarity engine         | `computeCosine`      | token arrays              | similarity score      | dot product / (norm1 * norm2)           |
| PMI Calculation       | Compute co-occurrence weight  | - [ ] Count co-occurrences; compute PMI; forbid zero-frequency division                     | Similarity engine         | `computePMI`         | co-occurrence counts      | PMI score             | log(p(x,y) / (p(x)*p(y)))               |
| Top-K Selection       | Sparsify edge graph           | - [ ] Sort edges by weight; select top K per node; forbid unsorted selection                | Edge sparsifier           | `selectTopK`         | edges per node            | filtered edges        | heap-based top-K extraction             |

---

### Hidden Node Types

**Configuration Schema**:

```yaml
layers.semantic.hiddenNodeTypes:
  scope: layer_specific
  type: array (strings)
  mutability: runtime_configurable
  validation: types must exist in graph
  impact: hides matching node types ONLY in semantic mode; other layers show all nodes
```

**Filtering Behavior**:

| Condition                              | Nodes Visible                          | Edges Visible                              |
|----------------------------------------|----------------------------------------|--------------------------------------------|
| `schema.layers.mode === "semantic"`    | All nodes EXCEPT `hiddenNodeTypes`     | Edges where both endpoints are visible     |
| `schema.layers.mode === "document"`    | All nodes                              | All edges                                  |
| `schema.layers.mode === "schema"`      | All nodes                              | All edges                                  |
| `hiddenNodeTypes` is empty             | All nodes (regardless of layer mode)   | All edges                                  |

**Test Validation**:

- Load `docs/assets/example-workflow.jsonld`.
- Compare node counts between document layer (all nodes) and semantic layer (excludes `geo:Polygon`).
- Verify edge counts match filtered node sets (no orphaned edges).

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Node Type Filtering   | Hide specific types           | - [ ] Filter nodes by type when mode=semantic; forbid global hiding                         | Layer processor           | `filterNodesByType`  | nodes, hiddenTypes, mode  | filtered nodes        | type ∈ hiddenTypes AND mode=semantic    |
| Edge Pruning          | Remove orphaned edges         | - [ ] Remove edges with hidden endpoints; forbid dangling edges                             | Layer processor           | `pruneOrphanedEdges` | edges, visible nodes      | pruned edges          | source ∈ visible AND target ∈ visible   |

---

### JSON-LD Edge Inference

**Inference Pattern**: Array-valued properties whose targets exist as nodes → inferred edges

**Example**:

```json
{
  "@id": "ex:section-1",
  "hasBlock": [
    {"@id": "ex:paragraph-1"},
    {"@id": "ex:paragraph-2"}
  ]
}
```

**Inferred Edges**:

```json
[
  {"source": "ex:section-1", "target": "ex:paragraph-1", "label": "hasBlock"},
  {"source": "ex:section-1", "target": "ex:paragraph-2", "label": "hasBlock"}
]
```

**Behavioral Impact**:

- Schema and document layers receive full edge set without dataset-specific logic.
- Semantic layer applies similarity-based filtering on top of inferred structural edges.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Edge Inference        | Derive edges from properties  | - [ ] Iterate array properties; check target existence; create edges; forbid missing targets | JSON-LD parser            | `inferEdges`         | node object, graph nodes  | inferred edges        | array iteration + node ID lookup        |
| Reference Resolution  | Validate edge targets         | - [ ] Check `@id` exists in node set; forbid dangling references                            | JSON-LD parser            | `resolveReference`   | `@id` string, node set    | boolean exists        | Set membership test                     |

---

## Markdown Ingestion and Layer Hints

### Markdown → Graph Parsing

**Pipeline**: Markdown Source → `buildMarkdownJsonLd` → `GraphData` with `metadata.layers`

**Layer Hint Emission**:

```json
{
  "metadata": {
    "layers": {
      "semantic": {
        "nodeTypes": ["Entity"],
        "edgeLabel": "coOccursWith",
        "edgeMetric": "pmi"
      },
      "documentStructure": {
        "nodeTypes": ["Document", "Section", "Paragraph", "List", "ListItem", "CodeBlock", "Table"],
        "edgeLabels": ["hasSection", "hasBlock", "hasItem", "next", "linksTo"]
      }
    }
  }
}
```

**Ingestion Metrics**:

```yaml
metadata.ingestionMetrics.totalMs:
  scope: graph_global
  type: number
  mutability: immutable
  validation: must be non-negative
  impact: total parsing time in milliseconds

metadata.ingestionMetrics.buildMarkdownJsonLdMs:
  scope: graph_global
  type: number
  mutability: immutable
  validation: must be non-negative
  impact: time spent in markdown → JSON-LD conversion

metadata.ingestionMetrics.parseJsonLdMs:
  scope: graph_global
  type: number
  mutability: immutable
  validation: must be non-negative
  impact: time spent in JSON-LD → GraphData normalization
```

**Test Validation**:

- Load `docs/assets/example-workflow.md` via markdown parser.
- Assert non-empty node set.
- Assert no parser warnings in `metadata.warnings`.
- Verify `ingestionMetrics` fields are populated.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Markdown Parsing      | Extract structure and entities | - [ ] Parse markdown AST; extract sections/paragraphs; run NER; forbid lossy conversion    | Markdown parser           | `buildMarkdownJsonLd` | markdown text            | JSON-LD object        | AST traversal + semantic extraction     |
| Metric Recording      | Track performance             | - [ ] Record start/end times; compute durations; attach to metadata; forbid missing metrics | Ingestion wrapper         | `recordMetrics`      | parse timestamps          | metrics object        | timestamp subtraction                   |

---
### Schema-Config Generation from Hints

**Generation Pattern**: `graph_jsonld.metadata.layers` → `schema-config.metadata.layers`
**Transformation**:
```python
# Seed from graph metadata
schema_config["metadata"]["layersFromGraph"] = graph_jsonld["metadata"]["layers"]
schema_config["metadata"]["defaultLayerFromGraph"] = graph_jsonld["metadata"]["defaultLayer"]

# Materialize initial layers configuration
schema_config["metadata"]["layers"] = {
    "semantic": {
        "similarityMetric": "pmi",  # Align with PMI-weighted edges
        "similarityEdgeLabel": graph_jsonld["metadata"]["layers"]["semantic"]["edgeLabel"],
        "hiddenNodeTypes": [],  # Can be seeded from parser hints
        # ... corpus presets
    },
    "documentStructure": {
        "structuralNodeTypes": graph_jsonld["metadata"]["layers"]["documentStructure"]["nodeTypes"],
        "structuralEdgeLabels": graph_jsonld["metadata"]["layers"]["documentStructure"]["edgeLabels"]
    }
}
```
**Design Compliance**:
| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Hint Propagation      | Copy parser metadata          | - [ ] Copy `layers` from graph to `layersFromGraph`; forbid transformation during copy      | Schema-config builder     | `propagateLayerHints` | graph metadata           | schema metadata       | dict copy with validation               |
| Metric Alignment      | Match edge metric to similarity | - [ ] Set `similarityMetric: "pmi"` when `edgeMetric: "pmi"`; forbid mismatched metrics   | Schema-config builder     | `alignSimilarityMetric` | layer hints            | similarity config     | conditional metric selection            |
---

## Semantic Threshold Presets
### Corpus-Size Presets

**Preset Definitions**:
| Preset  | Corpus Size      | `topKEdgesPerNode` | `minSimilarity` (cosine) | `minSimilarity` (PMI) |
|---------|------------------|--------------------|--------------------------|----------------------|
| `small` | Up to ~1e3 nodes | 10                 | 0.2                      | 0.3                  |
| `medium`| Up to ~1e4 nodes | 5                  | 0.3                      | 0.5                  |
| `large` | Up to ~1e5 nodes | 3                  | 0.4                      | 0.7                  |
**Template Location**: `data/config/schema/agentic-graph-schema-config-template.jsonld`
**Metadata Fields**:
```yaml
metadata.corpusSizePreset:
  scope: schema_global
  type: string (enum: "small" | "medium" | "large")
  mutability: runtime_configurable
  validation: must match key in corpusSizePresets
  impact: selects effective preset for semantic thresholds

metadata.corpusSizePresets:
  scope: schema_global
  type: object
  mutability: deployment_configurable
  validation: must define small/medium/large with nested threshold values
  impact: source of truth for recommended semantic tuning
```
**Canvas UI Integration**:
- Floating Panel exposes `topKEdgesPerNode` and `minSimilarity` sliders.
- Operators can adapt thresholds interactively; schema-config acts as preset source.
- LLMs and tools can read/update `corpusSizePresets` in schema-config JSON-LD.
**Design Compliance**:
| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Preset Selection      | Apply corpus-size defaults    | - [ ] Read `corpusSizePreset`; lookup thresholds; apply to schema; forbid invalid keys      | Schema loader             | `applyCorpusPreset`  | preset key, presets obj   | threshold values      | dict lookup with validation             |
| Preset Override       | Allow runtime adjustment      | - [ ] Update `topKEdgesPerNode`/`minSimilarity` from UI; forbid preset lock-in              | Settings panel            | `updateThresholds`   | user input values         | updated schema        | direct schema field assignment          |
## Tree Mermaid Density Presets
### Mermaid Diagram Density Metrics
**Metadata Schema**:
```yaml
metadata.tree.mermaidDensity.statementCount:
  scope: tree_specific
  type: number
  mutability: immutable
  validation: must be non-negative integer
  impact: count of non-comment Mermaid statements (nodes, edges, click bindings)

metadata.tree.mermaidDensity.density:
  scope: tree_specific
  type: string (enum: "none" | "sparse" | "medium" | "dense")
  mutability: immutable
  validation: derived from statementCount via thresholds
  impact: coarse bucket label for density-aware configuration

metadata.tree.mermaidDensity.anchorsOnly:
  scope: tree_specific
  type: boolean
  mutability: immutable
  validation: boolean
  impact: indicates whether diagram was parsed in anchors-only mode

metadata.tree.mermaidDensity.config: …
```
See [agentic-graph-schema-document.tree-mermaid-appendix.md](agentic-graph-schema-document.tree-mermaid-appendix.md).
