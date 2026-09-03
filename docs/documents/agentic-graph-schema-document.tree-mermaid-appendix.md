# agentic-graph Schema Configuration Appendix: Tree & Mermaid Density

This appendix is referenced by `agentic-graph-schema-document.md` and keeps the main document ≤ 600 lines.

```yaml
metadata.tree.mermaidDensity.config:
  scope: tree_specific
  type: object
  mutability: deployment_configurable
  validation: must define sparse/medium/dense presets with separation values
  impact: neutral preset for Mermaid density thresholds and Dagre spacing
```

**Density Bucketing**:

| Statement Count Range | Density Label | Default Separation (anchorsOnly / defaultDiagram) |
|-----------------------|---------------|--------------------------------------------------|
| 0                     | `none`        | N/A                                              |
| 1 - sparseMax         | `sparse`      | [value1] / [value2]                              |
| sparseMax+1 - denseMax| `medium`      | [value3] / [value4]                              |
| denseMax+1 +          | `dense`       | [value5] / [value6]                              |

**Canvas Integration**:

- Canvas reads `metadata.tree.separation` as parser-suggested Dagre spacing.
- Users can override via `schema.layout.tree.separation` in Floating Panel or toolbar settings.
- Schema-config JSON-LD can extend presets via `metadata.tree.mermaidDensity.config`.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Statement Counting    | Compute Mermaid complexity    | - [ ] Parse Mermaid; count nodes/edges/clicks; exclude comments/graph/subgraph/end; forbid partial counts | Mermaid parser            | `countStatements`    | Mermaid text              | statement count       | line parsing + filter exclusions        |
| Density Bucketing     | Assign density label          | - [ ] Compare count to thresholds; assign bucket; forbid arbitrary labels                   | Density analyzer          | `assignDensityBucket` | statement count, config  | density label         | threshold comparison (if/else chain)    |
| Separation Selection  | Choose Dagre spacing          | - [ ] Lookup density bucket; select separation preset; forbid hardcoded values              | Tree layout engine        | `selectSeparation`   | density label, config     | separation value      | dict lookup by density bucket           |

---

## Tree Preset Control (Metadata-Aware)

**Toolbar Tree Preset Control**:

| Preset    | Configuration Changes                                                                                     |
|-----------|-----------------------------------------------------------------------------------------------------------|
| Mermaid   | Seeds `tree.edgeLabels`, `tree.orientation`, `tree.direction`, `tree.separation`, `tree.colorMode` from `metadata.tree` (if present) |
| Document  | Swaps `edgeLabels` to document hierarchy set; keeps separation and direction aligned with schema-config |

**Neutral Heuristic**: No dataset-specific hardcoding; all values derive from `metadata.tree` or schema-config defaults.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Mermaid Preset Application | Seed tree config from metadata | - [ ] Read `metadata.tree`; apply to `schema.layout.tree`; forbid ignoring metadata      | Preset controller         | `applyMermaidPreset` | metadata.tree, schema     | updated schema        | object merge with metadata precedence   |
| Document Preset Application | Switch to hierarchy edges  | - [ ] Replace `edgeLabels` with document set; keep other tree settings; forbid full reset | Preset controller         | `applyDocumentPreset` | schema.layout.tree       | updated schema        | edgeLabels override + preserve others   |

---

## Tree Label LOD Collapse (Density-Aware)

**Heuristic**:

| Mermaid Density | LOD Collapse Mode         | LOD Max Depth | Rationale                                      |
|-----------------|---------------------------|---------------|------------------------------------------------|
| `none`          | Disabled                  | N/A           | No Mermaid diagram; no collapse needed         |
| `sparse`        | Disabled                  | N/A           | Low statement count; all labels visible        |
| `medium`        | `"depth"`                 | 3             | Moderate density; collapse deeper levels       |
| `dense`         | `"depth"`                 | 2             | High density; aggressive collapse for clarity  |

**Configuration Schema**:

```yaml
schema.performance.lod.tree.collapseMode:
  scope: tree_specific
  type: string (enum: "none" | "depth" | "distance")
  mutability: runtime_configurable
  validation: valid collapse mode
  impact: controls tree label LOD collapse strategy

schema.performance.lod.tree.maxDepth:
  scope: tree_specific
  type: number
  mutability: runtime_configurable
  validation: must be positive integer when collapseMode="depth"
  impact: maximum tree depth before collapsing labels
```

**Application Rules**:

- Applied only when `schema.performance.lod.tree` has no explicit collapse configuration.
- Fully overridable from Renderer settings UI or schema-config JSON-LD.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Density-Based Defaults| Seed LOD collapse from density| - [ ] Check `mermaidDensity`; apply heuristic; forbid overriding explicit config           | Schema initializer        | `seedLodFromDensity` | density label, schema     | updated schema        | density bucket → LOD settings lookup    |
| LOD Override          | Allow manual configuration    | - [ ] Respect existing `lod.tree` settings; forbid density override when configured         | Settings validator        | `validateLodConfig`  | schema.lod.tree           | boolean valid         | check for non-null collapseMode         |

---

## Testing & Quality Standards

**Test Coverage Metrics**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Layer Filtering      | Validate semantic hiding        | - [ ] Load example-workflow; toggle layers; verify node counts; forbid incorrect filtering  |
| Schema-Config Loading| Ensure styling applies          | - [ ] Parse schema-config; verify `nodeShapes` mappings; forbid missing selectors          |
| Layout Caching       | Verify cache isolation          | - [ ] Switch layouts; verify independent caches; forbid cache corruption                    |

**Test Categories**:

- **Unit Tests**: Layer filtering logic, similarity calculations, preset selection.
- **Integration Tests**: Full dataset → schema-config → canvas rendering pipeline.

**Quality Gates**:

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Schema Validation    | Prevent runtime errors          | - [ ] Validate schema-config structure; check required keys; forbid late-stage failures     |
| Layer Consistency    | Ensure metadata alignment       | - [ ] Verify `layersFromGraph` matches graph metadata; forbid divergence                    |

---

## Repository Health Checklist

**Configuration Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Schema-Config Pairing| ☐      | - [ ] All datasets have paired schema-configs; forbid orphaned datasets                     |
| Corpus Presets       | ☐      | - [ ] Schema-configs include `corpusSizePresets`; forbid missing preset definitions        |
| Layer Metadata       | ☐      | - [ ] Schema-configs have `layersFromGraph` populated; forbid missing parser hints         |

**Operational Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Layout Cache Bounds  | ☐      | - [ ] Layout caches cleared on graph replacement; forbid memory leaks                       |
| Preset Self-Consistency | ☐   | - [ ] Workflow presets reference valid examples; forbid broken catalog links               |

