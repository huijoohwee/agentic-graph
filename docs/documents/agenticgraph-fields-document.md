# AgenticGraph Graph Fields Architecture

## Design Mantras

```
- [ ] Neutrality; abstract field semantics; forbid dataset-specific field logic
- [ ] Transparency; surface all field sources; forbid hidden transformations
- [ ] Modularity; separate field discovery from mapping; forbid coupled curation
- [ ] Provenance; track field origins; forbid undocumented properties
- [ ] Extensibility; support arbitrary field types; forbid closed schemas
```

---

## Graph Fields Architecture

**Fields Stack**: GraphData Properties → Field Discovery → Field Catalog → AgenticRAG Mapping → Export Preservation

**Data Flow**: Parser Emission → Property Extraction → Structural Field Addition → Catalog Generation → Curation UI → Role Assignment

**Design Principles**: Source Transparency | Schema-Agnostic Discovery | Runtime Configurability | Context-Aware Presentation

---

## Graph Fields View: Canonical Field Inspector

### Field Source Contract

**Single Source of Truth**: All visible fields derive directly from `GraphData` object in canvas store; view never re-parses underlying source files.

**Field Derivation**:

| Source Category       | Extraction Pattern                                      | Field Types                                    |
|-----------------------|---------------------------------------------------------|------------------------------------------------|
| Node Properties       | `GraphNode.properties.*` → field catalog                | Arbitrary workflow fields (tags, scores, etc.) |
| Edge Properties       | `GraphEdge.properties.*` → field catalog                | Weights, labels, custom attributes             |
| Structural Fields     | First-class AgenticRAG dimensions                       | `id`, `label`, `type`, `source`, `target`      |
| Parser-Specific Fields| JSON-LD schema from markdown/HTML/PDF parsers           | `documentPath`, `lineStart`, `lineEnd`, etc.   |

**Configuration Schema**:

```yaml
fieldCatalog.nodeFields:
  scope: graph_global
  type: array (field descriptors)
  mutability: runtime_mutable
  validation: each field has {name, sampleValues, frequency}
  impact: drives Graph Fields UI grid and mapping controls

fieldCatalog.edgeFields:
  scope: graph_global
  type: array (field descriptors)
  mutability: runtime_mutable
  validation: each field has {name, sampleValues, frequency}
  impact: drives edge property inspector and filtering

fieldCatalog.structuralFields:
  scope: graph_global
  type: array (constant set)
  mutability: immutable
  validation: must include ['id', 'label', 'type', 'source', 'target']
  impact: guaranteed first-class dimensions in AgenticRAG schema
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Property Extraction   | Discover all node fields      | - [ ] Iterate `node.properties`; collect keys; forbid filtering by type                     | Field discovery           | `extractNodeFields`  | GraphData nodes           | field name set        | Set union of all property keys          |
| Sample Collection     | Provide example values        | - [ ] Collect first N unique values per field; forbid empty samples                         | Field discovery           | `collectSamples`     | field name, nodes         | value array           | Set of values, slice to N samples       |
| Frequency Calculation | Compute field coverage        | - [ ] Count nodes with field present; compute percentage; forbid missing counts             | Field discovery           | `computeFrequency`   | field name, nodes         | frequency ratio       | (nodes with field) / (total nodes)      |

---

## Component Responsibility Matrix

| Layer/Subsystem       | Path/Module                                   | Component                   | Interface/Method            | Responsibility (S-V-O)                                                                        | Dependencies                          | Contracts                                         | LOC    |
|-----------------------|-----------------------------------------------|-----------------------------|-----------------------------|-----------------------------------------------------------------------------------------------|---------------------------------------|---------------------------------------------------|--------|
| Graph Fields UI       | `canvas/src/features/fields/GraphFieldsView.tsx` | GraphFieldsView          | `render`                    | Component → reads GraphData → renders field catalog → enables field curation                  | `useGraphStore`, field discovery      | React component with field grid                   | ~400   |
| Field Discovery       | `canvas/src/lib/graph/fieldDiscovery.ts`      | Field Discovery Engine      | `discoverFields`            | Engine → iterates nodes/edges → extracts properties → builds catalog                          | GraphData                             | Returns `{nodeFields, edgeFields}` catalog        | ~200   |
| Raw JSON Context Banner| `canvas/src/features/fields/RawContextBanner.tsx` | RawContextBanner        | `render`                    | Banner → detects `context="raw-nodes-edges"` → renders explanation → links to documentation   | `uiCopy` config                       | Conditional banner component                      | ~80    |
| AgenticRAG Mapper     | `canvas/src/features/fields/FieldMappingPanel.tsx` | FieldMappingPanel       | `mapFieldToRole`            | Panel → reads field selections → maps to AgenticRAG roles → updates schema                    | Field catalog, schema config          | Field → role assignment UI                        | ~250   |

---

## Raw JSON Graphs (`context: "raw-nodes-edges"`)

### Raw JSON Ingestion Pattern

**Ingestion Flow**: JSON Source → `rawToGraphData` → Normalized `GraphData` → `context: "raw-nodes-edges"` marker

**Normalization Rules**:

| Input Structure                  | Normalization Behavior                                                    | Output Schema                                      |
|----------------------------------|---------------------------------------------------------------------------|----------------------------------------------------|
| Array named `nodes`/`links`/`extended_nodes` | Recognized as node entries                               | `GraphNode[]` with normalized `id`, `label`, `type`|
| Array named `edges`/`links`      | Recognized as edge entries                                                | `GraphEdge[]` with normalized `source`, `target`   |
| `source`/`target` link fields    | Preserved as standard edge endpoint fields                                | `GraphEdge.source`, `GraphEdge.target`             |
| `from`/`to` link fields          | Normalized to `source`/`target`                                           | `GraphEdge.source`, `GraphEdge.target`             |
| Known structural keys            | Preserved as first-class fields (`id`, `name`, `label`, `type`, `data`)   | Top-level `GraphNode` fields                       |
| Arbitrary workflow keys          | Merged into `properties` container                                        | `GraphNode.properties.*`, `GraphEdge.properties.*` |

**Configuration Schema**:

```yaml
graphData.context:
  scope: graph_global
  type: string (enum: "raw-nodes-edges" | "jsonld" | "markdown" | "csv")
  mutability: immutable
  validation: set by parser during ingestion
  impact: triggers context-specific UI elements (e.g., raw JSON banner)
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Node Array Detection  | Identify node sources         | - [ ] Scan for `nodes`, `links`, `extended_nodes` arrays; forbid custom array name logic   | `rawToGraphData`          | `detectNodeArrays`   | JSON object               | node array            | key name matching against known variants|
| Edge Array Detection  | Identify edge sources         | - [ ] Scan for `edges`, `links` arrays; forbid missing edge detection                      | `rawToGraphData`          | `detectEdgeArrays`   | JSON object               | edge array            | key name matching against known variants|
| Link Field Normalization | Standardize edge endpoints | - [ ] Map `from`/`to` to `source`/`target`; forbid both formats simultaneously             | `rawToGraphData`          | `normalizeLinks`     | edge objects              | normalized edges      | conditional field rename with validation|
| Property Merging      | Preserve arbitrary fields     | - [ ] Copy non-structural keys to `properties`; forbid field loss                           | `rawToGraphData`          | `mergeProperties`    | raw node/edge object      | GraphNode/Edge        | object spread into `properties` container|

---

## Raw JSON Context Banner

### Context-Aware UI Element

**Display Conditions**: Banner appears when `graphData.context === "raw-nodes-edges"`

**Banner Content** (from `canvas/src/lib/config-copy/uiCopy.ts`):

```typescript
{
  graphFieldsRawContextBannerTitle: "Raw JSON Graph Detected",
  graphFieldsRawContextBannerDescription: 
    "Fields derived by rawToGraphData from JSON structure. " +
    "Structural fields (id, label, source, target) normalized to AgenticRAG schema. " +
    "Remaining properties preserved as generic node/edge fields for curation.",
  graphFieldsRawContextBannerAction: "Review and map fields below"
}
```

**Banner Placement**: Rendered in `GraphFieldsView` before main field grid

**Configuration Schema**:

```yaml
uiCopy.graphFieldsRawContextBannerTitle:
  scope: ui_global
  type: string
  mutability: deployment_configurable
  validation: non-empty string
  impact: banner title text

uiCopy.graphFieldsRawContextBannerDescription:
  scope: ui_global
  type: string
  mutability: deployment_configurable
  validation: non-empty string
  impact: explanatory text for raw JSON normalization

uiCopy.graphFieldsRawContextBannerAction:
  scope: ui_global
  type: string
  mutability: deployment_configurable
  validation: non-empty string
  impact: call-to-action guidance for field curation
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Banner Rendering      | Show context explanation      | - [ ] Check `context === "raw-nodes-edges"`; render banner; forbid unconditional display   | `GraphFieldsView`         | `renderContextBanner` | graphData.context        | React element or null | conditional JSX based on context value  |
| Copy Retrieval        | Fetch UI text                 | - [ ] Read from `uiCopy` config; forbid hardcoded banner text                               | `RawContextBanner`        | `getBannerCopy`      | uiCopy config             | copy strings          | object property access                  |

---

## Mapping Raw JSON Fields to AgenticRAG Roles

### Field-to-Role Assignment

**AgenticRAG Role Dimensions**:

| Role Category         | Example Fields                          | Mapping Strategy                                     |
|-----------------------|-----------------------------------------|------------------------------------------------------|
| Primary Identifiers   | `id`, `key`, `uuid`                     | Automatically mapped to `GraphNode.id`               |
| Labels/Names          | `name`, `title`, `label`                | Mapped to `GraphNode.label`                          |
| Type/Category         | `type`, `category`, `kind`, `phase`     | Mapped to `GraphNode.type` or `properties.category`  |
| Descriptive Metadata  | `description`, `notes`, `summary`       | Remain in `properties.*` for search/display          |
| Workflow Phases       | `phase`, `stage`, `layer`               | Map to custom dimension or `properties.phase`        |
| Outcome Indicators    | `status`, `score`, `outcome`, `result`  | Map to custom dimension or `properties.status`       |

**Mapping Workflow**:

| Step | Action                                  | User Interaction                         | System Behavior                                    |
|------|-----------------------------------------|------------------------------------------|----------------------------------------------------|
| 1    | Review field catalog                    | Inspect field grid in Graph Fields view  | Display all discovered fields with samples         |
| 2    | Identify key fields                     | Select fields for AgenticRAG mapping     | Highlight selected fields in UI                    |
| 3    | Assign AgenticRAG roles                 | Choose role from dropdown per field      | Update schema mapping configuration                |
| 4    | Validate mapping                        | Preview mapped graph structure           | Apply mappings; show validation warnings if needed |
| 5    | Export configured schema                | Save schema-config with field mappings   | Write schema-config JSON-LD to disk/storage        |

**Configuration Schema**:

```yaml
schema.fieldMappings:
  scope: schema_global
  type: object (field name → role mapping)
  mutability: runtime_configurable
  validation: roles must be valid AgenticRAG dimensions
  impact: controls how raw JSON fields are interpreted in graph queries and traversals
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Field Selection       | Enable multi-field curation   | - [ ] Support checkbox selection; track selected fields; forbid single-field-only mode     | `GraphFieldsView`         | `handleFieldSelect`  | field name, selection state| updated selection set | Set add/remove operation                |
| Role Assignment       | Map field to dimension        | - [ ] Present role dropdown; update mapping; forbid unmapped required roles                | `FieldMappingPanel`       | `assignRole`         | field name, role          | updated schema        | schema.fieldMappings[field] = role      |
| Mapping Validation    | Ensure schema completeness    | - [ ] Check required roles mapped; warn on conflicts; forbid invalid configurations        | Schema validator          | `validateMappings`   | field mappings            | validation result     | check required fields + conflict detection|

---

## Lifecycle Tags and Graph Layers

### Tag-Based Lifecycle Management

**Lifecycle Roles**: `idea`, `hypothesis`, `execution`, `pivot`, `alert`

**Storage Pattern**: Stored as plain tags in `GraphNode.properties.tags` (string array)

**Graph Layer Integration**:

| Layer Component       | Lifecycle Tag Behavior                                                  |
|-----------------------|-------------------------------------------------------------------------|
| Graph Layer View      | Provides "Lifecycle tags for layers" helper for tag assignment          |
| Renderer Palette      | Lifecycle keys available as color/style presets                         |
| Graph Fields View     | Reflects tags alongside other workflow fields without special schema    |

**Configuration Schema**:

```yaml
properties.tags:
  scope: node_local
  type: array (strings)
  mutability: runtime_mutable
  validation: array of tag strings
  impact: participates in field catalog as regular property; used for lifecycle rendering

rendererPalette.lifecycleKeys:
  scope: renderer_global
  type: array (strings)
  mutability: deployment_configurable
  validation: must include ['idea', 'hypothesis', 'execution', 'pivot', 'alert']
  impact: defines available lifecycle tag presets for Graph Layer helper
```

**Lifecycle Tag Workflow**:

| Step | Action                                  | User Interaction                         | System Behavior                                    |
|------|-----------------------------------------|------------------------------------------|----------------------------------------------------|
| 1    | Select owner node in Graph Layer view   | Click node in canvas                     | Graph Layer panel updates to show selected node    |
| 2    | Open "Lifecycle tags for layers" helper | Click helper button                      | Lifecycle tag selector appears                     |
| 3    | Assign lifecycle tags                   | Check/uncheck lifecycle role checkboxes  | Update `properties.tags` on selected node          |
| 4    | Verify in Graph Fields view             | Switch to Graph Fields panel             | Tags appear in field catalog alongside other props |

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Tag Assignment        | Update node lifecycle tags    | - [ ] Add/remove tag in `properties.tags` array; forbid duplicate tags                     | Graph Layer helper        | `assignLifecycleTag` | node, tag                 | updated node          | array push or filter operation          |
| Tag Rendering         | Apply lifecycle styles        | - [ ] Read `properties.tags`; lookup renderer palette; apply colors; forbid missing palette| Renderer                  | `applyLifecycleStyle` | node tags, palette       | style object          | tag → palette key → color lookup        |
| Field Catalog Inclusion | Show tags in field grid     | - [ ] Discover `tags` field; display in catalog; forbid special-case hiding                | Field discovery           | `extractNodeFields`  | node properties           | field catalog         | generic property extraction (no special case)|

---

## Data Flow: Source → Field Catalog → AgenticRAG

**Pipeline**: Source Ingestion → Property Extraction → Structural Field Addition → Field Discovery → Catalog Generation → User Curation → Role Assignment → Export

| Stage                    | Input                          | Output                         | Responsibility                                              | Performance Consideration                    |
|--------------------------|--------------------------------|--------------------------------|-------------------------------------------------------------|----------------------------------------------|
| Source Ingestion         | JSON/JSON-LD/CSV/Markdown      | Raw GraphData                  | Parser normalizes to GraphData schema                       | O(n) parsing with format-specific overhead   |
| Property Extraction      | Raw GraphData                  | Property key sets              | Iterate nodes/edges, collect property keys                  | O(n * avg_properties) iteration              |
| Structural Field Addition| Property key sets              | Complete field catalog         | Add first-class fields (id, label, type, source, target)    | O(1) constant field addition                 |
| Field Discovery          | Complete field catalog         | Field descriptors with samples | Collect sample values, compute frequencies                  | O(n * k) where k = fields                    |
| Catalog Generation       | Field descriptors              | Rendered field grid            | Build UI grid with samples and frequencies                  | O(1) React rendering                         |
| User Curation            | Field grid interactions        | Selected fields                | User reviews and selects key fields                         | Human-driven, no computation                 |
| Role Assignment          | Selected fields                | Field-to-role mappings         | User assigns AgenticRAG roles via dropdowns                 | O(1) per field assignment                    |
| Export                   | Field mappings + GraphData     | Schema-config JSON-LD          | Write schema-config with fieldMappings to disk              | O(1) JSON serialization                      |

---

## Testing & Quality Standards

**Test Coverage Metrics**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Field Discovery      | Validate property extraction    | - [ ] Test with diverse graphs; verify all properties discovered; forbid missed fields      |
| Raw JSON Normalization | Ensure structural field mapping| - [ ] Test `from`/`to` → `source`/`target` conversion; forbid incomplete normalization     |
| Context Banner       | Validate conditional rendering  | - [ ] Test banner appears only for `raw-nodes-edges` context; forbid unconditional display |

**Test Categories**:

- **Unit Tests**: Field extraction, sample collection, frequency calculation.
- **Integration Tests**: Full raw JSON ingestion → field catalog → AgenticRAG mapping.

**Quality Gates**:

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Field Completeness   | Ensure no property loss         | - [ ] Verify all input properties appear in catalog; forbid silent field drops             |
| Sample Diversity     | Representative value sampling   | - [ ] Collect diverse samples (up to N unique values); forbid homogeneous samples          |
| Mapping Validation   | Prevent invalid role assignments| - [ ] Validate role names against AgenticRAG schema; forbid arbitrary role strings         |

---

## Repository Health Checklist

**Field Discovery Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Property Coverage    | ☐      | - [ ] Field discovery covers all `properties.*` keys; forbid partial extraction            |
| Structural Fields    | ☐      | - [ ] First-class fields (id, label, type) always included; forbid missing structural dims |
| Sample Quality       | ☐      | - [ ] Sample values representative; forbid empty or null-only samples                      |

**UI Copy Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Banner Copy Completeness | ☐  | - [ ] `uiCopy` config includes all banner keys; forbid missing copy                        |
| Deployment Customization | ☐  | - [ ] UI copy configurable without code changes; forbid hardcoded strings                  |

---

## Anti-Patterns (Forbidden)

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Hardcoded Field Logic| Enable generic field handling   | - [ ] Discover fields from GraphData; forbid dataset-specific field assumptions            |
| Implicit Filtering   | Surface all properties          | - [ ] Show all discovered fields in catalog; forbid silent property hiding                 |
| Missing Context Markers | Track ingestion source       | - [ ] Set `graphData.context` during parsing; forbid unmarked raw JSON graphs              |
| Unconfigurable UI Copy | Enable deployment customization | - [ ] Use `uiCopy` config for all UI text; forbid inline string literals                 |