# AgenticGraph Metadata Contracts

## Design Mantras

```
- [ ] Provenance; track data lineage; forbid orphaned metadata
- [ ] Neutrality; use domain-agnostic keys; forbid sector-specific fields
- [ ] Consistency; apply uniform naming; forbid arbitrary conventions
- [ ] Versioning; track generation timestamps; forbid undated artifacts
- [ ] Documentation; explain all fields; forbid undocumented properties
```

---

## Metadata Architecture

**Metadata Stack**: Parser Emission → Graph Metadata → Schema-Config Metadata → Canvas Consumption

**Data Flow**: Source Parsing → Metadata Attachment → Layer Derivation → UI Rendering → Export Preservation

**Design Principles**: Single Source of Truth | Parser-Derived Hints | Schema-Config Overrides | Canonical Fallback Chains

---

## Graph Metadata (`graph_jsonld.metadata`)

### Core Identification Fields

**Configuration Schema**:

```yaml
graphId:
  scope: graph_global
  type: string
  mutability: immutable
  validation: must follow pattern (md:<slug> | jsonld:<hash> | csv:<hash>)
  impact: stable graph identifier for caching and provenance

generatedAt:
  scope: graph_global
  type: string (ISO 8601 timestamp)
  mutability: immutable
  validation: must be valid ISO 8601 datetime
  impact: temporal provenance for graph generation

agenticRagSchema:
  scope: graph_global
  type: string (URL)
  mutability: deployment_configurable
  validation: must be valid IRI pointing to AgenticRAG schema
  impact: declares schema alignment for downstream tooling

agenticRagContext:
  scope: graph_global
  type: string | array (URL or URLs)
  mutability: deployment_configurable
  validation: must be valid IRI(s) for JSON-LD context
  impact: enables compact IRI expansion and RDF serialization
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Graph ID Generation   | Create stable identifiers     | - [ ] Hash content or use slug; prefix with source type; forbid random IDs without seed     | `build_graph_id`          | `generate_graph_id`  | source path, content hash | `graphId` string      | md5 hash of content or slug extraction  |
| Timestamp Recording   | Track generation time         | - [ ] Use UTC ISO 8601; record at parse time; forbid local timezones                        | `build_metadata`          | `add_timestamp`      | parse completion time     | ISO 8601 string       | datetime.utcnow().isoformat()           |
| Schema IRI Validation | Ensure alignment              | - [ ] Verify IRI format; check AgenticRAG schema existence; forbid broken references        | `validate_metadata`       | `check_schema_iri`   | schema IRI string         | boolean valid         | URL parse + optional HTTP HEAD request  |

---

## Structural Provenance Fields

**Configuration Schema**:

```yaml
semanticConfig:
  scope: graph_global
  type: object
  mutability: immutable
  validation: must match parser semantic extraction settings
  impact: records effective thresholds for entity extraction and co-occurrence

suggestedTraversalEdges:
  scope: graph_global
  type: array (strings)
  mutability: deployment_configurable
  validation: edge labels must exist in graph
  impact: hints for downstream traversal algorithms and path queries
```

**Example**:

```json
{
  "semanticConfig": {
    "minEntityMentions": 2,
    "coOccurrenceWindow": 3,
    "pmiThreshold": 0.5
  },
  "suggestedTraversalEdges": ["hasSection", "next", "coOccursWith", "linksTo"]
}
```

---

## Layer Hint Metadata

### Layout and Default Layer

**Configuration Schema**:

```yaml
layoutMode:
  scope: graph_global
  type: string (enum: "force" | "radial" | "tree" | "mermaid")
  mutability: deployment_configurable
  validation: must be valid layout mode
  impact: suggests initial canvas layout algorithm

defaultLayer:
  scope: graph_global
  type: string (enum: "semantic" | "document" | "schema")
  mutability: deployment_configurable
  validation: must be valid layer mode (legacy values normalized)
  impact: suggests initial renderer layer mode
```

**Legacy Normalization**:

| Legacy Value           | Normalized Value | Client Behavior                                              |
|------------------------|------------------|--------------------------------------------------------------|
| `"document-structure"` | `"document"`     | Canvas normalizes on load, uses `"document"` internally      |
| `"property"`           | `"schema"`       | Canvas normalizes on load, treats as raw schema layer        |

---

### Semantic Layer Hints

**Configuration Schema**:

```yaml
layers.semantic.nodeTypes:
  scope: layer_specific
  type: array (strings)
  mutability: immutable (parser-derived)
  validation: node types must exist in graph
  impact: declares which node types participate in semantic similarity

layers.semantic.nodeMetrics:
  scope: layer_specific
  type: array (strings)
  mutability: immutable (parser-derived)
  validation: metric names must match node property keys
  impact: documents available centrality and frequency metrics

layers.semantic.edgeLabel:
  scope: layer_specific
  type: string
  mutability: immutable (parser-derived)
  validation: must be primary semantic edge type
  impact: identifies co-occurrence or similarity edge label

layers.semantic.edgeMetric:
  scope: layer_specific
  type: string
  mutability: immutable (parser-derived)
  validation: must match edge property key for weights
  impact: identifies edge weight field (e.g., "pmi", "cosine")

layers.semantic.communityProperty:
  scope: layer_specific
  type: string
  mutability: immutable (parser-derived)
  validation: must match node property key
  impact: identifies community assignment field
```

**Example (Markdown Parser)**:

```json
{
  "layers": {
    "semantic": {
      "nodeTypes": ["Entity"],
      "nodeMetrics": ["mentionCount", "blockFrequency", "centrality"],
      "edgeLabel": "coOccursWith",
      "edgeMetric": "pmi",
      "communityProperty": "communityId"
    }
  }
}
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Semantic Node Detection | Identify entity types       | - [ ] Extract node types with semantic properties; record in `nodeTypes`; forbid hardcoded type lists | `semantic_processor`      | `detect_semantic_nodes` | graph nodes         | type array            | filter nodes with `mentionCount` > 0    |
| Edge Metric Recording | Document weight fields        | - [ ] Identify weight property on semantic edges; record label and metric; forbid missing metadata | `semantic_processor`      | `record_edge_metric` | semantic edges           | metric name string    | inspect edge properties for numeric keys|

---

### Document Structure Layer Hints

**Configuration Schema**:

```yaml
layers.documentStructure.nodeTypes:
  scope: layer_specific
  type: array (strings)
  mutability: immutable (parser-derived)
  validation: must be structural node types
  impact: declares document hierarchy types

layers.documentStructure.edgeLabels:
  scope: layer_specific
  type: array (strings)
  mutability: immutable (parser-derived)
  validation: must be structural edge types
  impact: declares containment and sequence relationships
```

**Example (Markdown Parser)**:

```json
{
  "layers": {
    "documentStructure": {
      "nodeTypes": ["Document", "Section", "Paragraph", "List", "ListItem", "CodeBlock", "Table"],
      "edgeLabels": ["hasSection", "hasBlock", "hasItem", "next", "linksTo"]
    }
  }
}
```

---

### Property Layer Hints (Legacy)

**Configuration Schema**:

```yaml
layers.property.nodePropertyContainer:
  scope: layer_specific
  type: string
  mutability: immutable
  validation: must be valid node field name
  impact: identifies node property container (e.g., "properties")

layers.property.edgePropertyContainer:
  scope: layer_specific
  type: string
  mutability: immutable
  validation: must be valid edge field name
  impact: identifies edge property container (e.g., "properties")
```

**Note**: Property layer is a legacy hint for raw attributes. Renderer layer mode is controlled by `schema.layers.mode` (`document` | `schema` | `semantic`), not property layer metadata.

---

## Schema-Config Metadata (`schema-config.metadata`)

### Core Schema Fields

**Configuration Schema**:

```yaml
agenticRagSchema:
  scope: schema_global
  type: string (URL)
  mutability: deployment_configurable
  validation: must match graph metadata `agenticRagSchema`
  impact: ensures schema-config aligns with graph schema

generatedBy:
  scope: schema_global
  type: string
  mutability: immutable
  validation: must identify implementation (e.g., "agenticgraph_parser.schema_config")
  impact: provenance for schema-config generation tool
```

---

### Corpus Size Presets

**Configuration Schema**:

```yaml
corpusSizePreset:
  scope: schema_global
  type: string (enum: "small" | "medium" | "large")
  mutability: runtime_configurable
  validation: must match key in `corpusSizePresets`
  impact: selects active preset for semantic thresholds

corpusSizePresets:
  scope: schema_global
  type: object
  mutability: deployment_configurable
  validation: must define small/medium/large with nested threshold values
  impact: provides recommended semantic tuning per corpus size
```

**Preset Structure**:

```json
{
  "corpusSizePresets": {
    "small": {
      "layers": {
        "semantic": {
          "topKEdgesPerNode": 10,
          "minSimilarity": {
            "cosine": 0.2,
            "pmi": 0.3
          }
        }
      }
    },
    "medium": {
      "layers": {
        "semantic": {
          "topKEdgesPerNode": 5,
          "minSimilarity": {
            "cosine": 0.3,
            "pmi": 0.5
          }
        }
      }
    },
    "large": {
      "layers": {
        "semantic": {
          "topKEdgesPerNode": 3,
          "minSimilarity": {
            "cosine": 0.4,
            "pmi": 0.7
          }
        }
      }
    }
  }
}
```

---

### Layer Propagation from Graphs

**Configuration Schema**:

```yaml
layersFromGraph:
  scope: schema_global
  type: object
  mutability: immutable (copied from graph)
  validation: must mirror `graph_jsonld.metadata.layers` structure
  impact: preserves parser-emitted layer hints without duplication

defaultLayerFromGraph:
  scope: schema_global
  type: string
  mutability: immutable (copied from graph)
  validation: must mirror `graph_jsonld.metadata.defaultLayer`
  impact: preserves parser-suggested default layer mode
```

**Derivation Pattern**:

```python
schema_config["metadata"]["layersFromGraph"] = graph_jsonld["metadata"]["layers"]
schema_config["metadata"]["defaultLayerFromGraph"] = graph_jsonld["metadata"]["defaultLayer"]
```

---

### Active Layer Configuration

**Configuration Schema**:

```yaml
layers.mode:
  scope: schema_global
  type: string (enum: "semantic" | "document" | "schema")
  mutability: runtime_configurable
  validation: must be valid layer mode
  impact: default renderer layer mode (semantic is typical default)

layers.semantic.similarityMetric:
  scope: layer_specific
  type: string (enum: "cosine" | "pmi")
  mutability: runtime_configurable
  validation: must match available edge metrics
  impact: selects similarity calculation algorithm

layers.semantic.similarityEdgeLabel:
  scope: layer_specific
  type: string
  mutability: deployment_configurable
  validation: initialized from `layersFromGraph.semantic.edgeLabel`
  impact: identifies edge type for semantic similarity

layers.semantic.topKEdgesPerNode:
  scope: layer_specific
  type: number
  mutability: runtime_configurable
  validation: must be positive integer
  impact: controls semantic edge sparsity

layers.semantic.minSimilarity:
  scope: layer_specific
  type: number
  mutability: runtime_configurable
  validation: must be in range [0, 1] for cosine, [-inf, inf] for PMI
  impact: filters low-quality semantic edges

layers.semantic.hiddenNodeTypes:
  scope: layer_specific
  type: array (strings)
  mutability: runtime_configurable
  validation: types must exist in graph
  impact: hides specified node types in semantic mode only

layers.semantic.communityDetection:
  scope: layer_specific
  type: object
  mutability: deployment_configurable
  validation: must define enabled and algorithm
  impact: configures NetworkX community detection for graph layers/subgraphs

layers.documentStructure.structuralNodeTypes:
  scope: layer_specific
  type: array (strings)
  mutability: deployment_configurable
  validation: derived from `layersFromGraph.documentStructure.nodeTypes`
  impact: identifies document hierarchy node types

layers.documentStructure.structuralEdgeLabels:
  scope: layer_specific
  type: array (strings)
  mutability: deployment_configurable
  validation: derived from `layersFromGraph.documentStructure.edgeLabels`
  impact: identifies containment and sequence edge types

layers.documentStructure.minGroupSize:
  scope: layer_specific
  type: number
  mutability: runtime_configurable
  validation: must be positive integer
  impact: minimum group size for graph-layer aggregations
```

---

## CLI Inspection Helper

### Markdown Pipeline Layer Inspection

**Command**:

```bash
python -m agenticgraph_parser markdown --input <path/to/doc.md> --print-schema-layers
```

**Behavior**:

| Step | Action                                  | Output                                      |
|------|-----------------------------------------|---------------------------------------------|
| 1    | Parse markdown into JSON-LD graph       | `graph_jsonld` object in memory             |
| 2    | Derive schema-config from graph         | `schema-config.jsonld` object in memory     |
| 3    | Extract `metadata.layers` from schema   | Nested JSON object                          |
| 4    | Pretty-print to stdout                  | Formatted JSON with 2-space indentation     |
| 5    | Exit without writing files              | No filesystem artifacts                     |

**Purpose**: Provides neutral, reproducible inspection of parser-emitted `graph_jsonld.metadata.layers` → `schema-config.metadata.layers` transformation.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Layer Extraction      | Isolate metadata subset       | - [ ] Navigate to `metadata.layers` in schema-config; extract; forbid partial extraction    | CLI handler               | `extract_layers`     | schema-config object      | layers dict           | dict key access with validation         |
| Pretty Printing       | Format for readability        | - [ ] Use JSON.dumps with indent=2; forbid minified output                                  | CLI handler               | `print_layers`       | layers dict               | formatted string      | json.dumps(..., indent=2)               |

---

## Neutrality and Derivation Rules

### Derivation-Only Contract

**Principles**:

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Schema Derivation    | Read graph hints, don't override | - [ ] Copy `metadata.layers` from graph to `layersFromGraph`; forbid parser logic in schema-config generation |
| Manual Override Freedom | Allow manual overrides       | - [ ] Operators can modify `layers`, `corpusSizePresets` in schema-config; forbid automated reverts |
| Tool Compatibility   | Enable LLM/tool updates         | - [ ] Tools read schema-config metadata as source of truth; update via JSON-LD; forbid hardcoded logic |

### Domain-Agnostic Contracts

**Enforcement**:

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Metadata Keys        | Use neutral terminology         | - [ ] Name fields generically (e.g., `layers`, `semantic`, `documentStructure`); forbid dataset/project names |
| Behavior Derivation  | Drive from metadata             | - [ ] Hidden node types, similarity thresholds, grouping → from `metadata.layers`; forbid hardcoded domain rules |
| Schema Alignment     | Point to AgenticRAG schema      | - [ ] Use `agenticRagSchema` IRI; forbid custom schema IRIs without documentation           |

---

## Node/Edge Provenance Metadata

### Document and Codebase Fields

**Preferred Fields (Document)**:

```yaml
metadata.documentPath:
  scope: node_or_edge_local
  type: string
  mutability: immutable
  validation: canonical path, may include #Lx-Ly fragment
  impact: primary provenance for source location

metadata.lineStart:
  scope: node_or_edge_local
  type: number (1-based)
  mutability: immutable
  validation: must be positive integer when present
  impact: start line in source document

metadata.lineEnd:
  scope: node_or_edge_local
  type: number (1-based)
  mutability: immutable
  validation: must be >= lineStart when present
  impact: end line in source document
```

**Fallback Fields (Codebase)**:

```yaml
metadata.codebaseRelPath:
  scope: node_or_edge_local
  type: string
  mutability: immutable
  validation: relative path from codebase root
  impact: fallback when documentPath is absent

metadata.codebasePath:
  scope: node_or_edge_local
  type: string
  mutability: immutable (discouraged)
  validation: absolute filesystem path
  impact: used only when present in imported data, discouraged for portability
```

### Canonicalization Rules
**Fallback Chain**: `documentPath` (strip `#L` fragment) → `codebaseRelPath` → `codebasePath` (if unavoidable)

**Portability Rule**: Producers preserve relative `documentPath` segments when provided (e.g., `docs/example.md`) and strip absolute filesystem paths down to the basename (e.g., `example.md`) to forbid environment-coupled provenance.

**Centralized Implementation**: `lib/graph/documentMetadata.ts` provides `resolveDocumentPath(node)` and `resolveLineRange(node)` functions shared by the markdown workspace, Graph Data Table, and selection/highlight logic.

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method          | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|--------------------------|---------------------------|-----------------------|-----------------------------------------|
| Fragment Stripping    | Extract base document path    | - [ ] Remove `#Lx-Ly` suffix; return base path; forbid double fragments                     | `documentMetadata`        | `stripFragment`          | documentPath string       | base path string      | regex replace `/#L\d+-\d+$/` with empty |
| Fallback Resolution   | Find effective path           | - [ ] Try documentPath, then codebaseRelPath, then codebasePath; forbid undefined return    | `documentMetadata`        | `resolveDocumentPath`    | node metadata object      | path string or null   | sequential field access with null checks|
| Line Range Extraction | Get source line span          | - [ ] Read lineStart/lineEnd; validate range; forbid inverted ranges                         | `documentMetadata`        | `resolveLineRange`       | node metadata object      | {start, end} or null  | validate start <= end, return object    |

## Metadata Quality Gates

**Validation Standards**:

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Graph Metadata       | Ensure completeness             | - [ ] Validate `graphId`, `generatedAt`, `agenticRagSchema` presence; forbid missing core fields |
| Schema-Config Metadata | Ensure alignment              | - [ ] Verify `agenticRagSchema` matches graph; validate `layersFromGraph` structure; forbid mismatched schemas |
| Provenance Metadata  | Ensure resolvability            | - [ ] Validate at least one of `documentPath`/`codebaseRelPath` present; forbid orphaned nodes |

## Repository Health Checklist

**Metadata Completeness**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Graph Core Fields    | ☐      | - [ ] All graphs have `graphId`, `generatedAt`, `agenticRagSchema`; forbid partial metadata |
| Layer Hints          | ☐      | - [ ] Graphs with semantic layers have `metadata.layers.semantic`; forbid undocumented hints |
| Schema Alignment     | ☐      | - [ ] Schema-configs mirror graph `agenticRagSchema`; forbid mismatched IRIs                |

**Provenance Completeness**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Document Paths       | ☐      | - [ ] Nodes have `metadata.documentPath` or `codebaseRelPath`; forbid orphaned nodes       |
| Line Ranges          | ☐      | - [ ] Line ranges are valid when present (start <= end); forbid inverted ranges            |
