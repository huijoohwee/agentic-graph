# AgenticGraph Multi-Ontology Integration Architecture

## Design Mantras

```
- [ ] Neutrality; abstract domain logic; forbid programme-specific identifiers
- [ ] Modularity; isolate ontology concerns; forbid mixed semantic responsibilities
- [ ] Configuration; externalize styling; forbid hardcoded visual behavior
- [ ] Extensibility; support ontology bundles; forbid closed vocabularies
- [ ] Provenance; track ontology sources; forbid orphaned type definitions
- [ ] Consistency; apply uniform patterns; forbid arbitrary ontology-specific code
```

---

## Multi-Ontology Integration Architecture

**Ontology Stack**: JSON-LD Context → Vocabulary Terms → Schema-Config Styling → Canvas Rendering

**Data Flow**: Source Ontologies → Multi-Ontology Graph → Schema-Config → Layer Projection → Visual Rendering

**Design Principles**: Vocabulary Neutrality | Configuration-Driven Styling | Layer-Based Filtering | Metadata Provenance

### High-Level Components

- **Multi-Ontology Dataset**: `docs/assets/multi-ontology-kg.jsonld` implements domain-agnostic assessment graphs combining PROV-O, MEX, P-Plan, ML Schema, GeoSPARQL, and RO-Crate.
- **Schema-Config Templates**: `data/config/schema/agenticgraph-schema-config-template.jsonld` transforms ontology terms into styled graph nodes via type selectors and layer configuration; `data/config/schema/agenticgraph-interviewer-schema-config.jsonld` coordinates multi-ontology styling with semantic layer defaults.
- **Canvas Pipeline Integration**: `canvas/src/features/parsers/examplesCatalog.ts` and `canvas/src/features/parsers/workflowPresets.ts` expose preset-driven dataset loading and rendering.

### Integration Bridge: Multi-Ontology Graphs → Canvas Renderer

| Multi-Ontology Stage            | Canvas Renderer Equivalent                    | Configuration Controls                                    |
|---------------------------------|-----------------------------------------------|-----------------------------------------------------------|
| Ontology Context Declaration    | `@context` mapping in JSON-LD                 | `metadata.ontologies` array with `{prefix, iri}` objects  |
| Type-Based Node Styling         | Node visual properties via schema-config      | `nodeShapes`, `nodeColors`, `nodeSizes` by `rdf:type`     |
| Layer-Based Filtering           | Semantic/Document/Schema layer modes          | `layers.mode`, `layers.semantic.hiddenNodeTypes`          |
| Spatial Clustering              | Graph-layer outlines over communities         | `geo:Geometry` nodes, `layers.semantic.communityDetection` |
| Provenance Chains               | Edge rendering of PROV-O relationships        | `prov:wasAttributedTo`, `prov:wasGeneratedBy` styling     |

---

## Component Responsibility Matrix

| Layer/Subsystem       | Path/Module                                   | Component                   | Interface/Method            | Responsibility (S-V-O)                                                                        | Dependencies                          | Contracts                                         | LOC    |
|-----------------------|-----------------------------------------------|-----------------------------|-----------------------------|-----------------------------------------------------------------------------------------------|---------------------------------------|---------------------------------------------------|--------|
| Dataset Definition    | `docs/assets/multi-ontology-kg.jsonld`        | Multi-Ontology Graph        | N/A (data artifact)         | Dataset → encodes assessment workflow → combines PROV-O/MEX/P-Plan/ML Schema/GeoSPARQL/RO-Crate | External ontology IRIs                | Valid JSON-LD with `@context`, `@graph`           | ~500   |
| Schema-Config Template| `data/config/schema/agenticgraph-schema-config-template.jsonld` | Schema Template        | N/A (config artifact)       | Template → defines neutral presets → enables schema-config generation                          | `/schema/AgenticRAG` IRI              | Valid JSON-LD with `metadata.corpusSizePresets`   | ~300   |
| Multi-Ontology Schema | `data/config/schema/agenticgraph-interviewer-schema-config.jsonld` | Interviewer Schema-Config | N/A (config artifact)     | Schema-config → styles ontology types → configures semantic layer defaults                     | Multi-ontology dataset                | Valid JSON-LD with `layers`, `nodeShapes`         | ~400   |
| Example Catalog       | `canvas/src/features/parsers/examplesCatalog.ts` | Examples Catalog         | `multiOntologyWorkflow`     | Catalog entry → maps example ID → pairs dataset and schema-config paths                        | Workflow preset registry              | `{id, datasetPath, schemaPath}` object            | ~50    |
| Workflow Preset       | `canvas/src/features/parsers/workflowPresets.ts` | Workflow Presets         | `multi-ontology-kg` preset  | Preset → declares parser ID → specifies dataset/schema paths → optional 3D overrides            | JSON-LD parser, examples catalog      | Preset schema with `id`, `parserId`, `datasetFileName` | ~80 |
| Schema Summary UI     | `canvas/src/features/schema/SchemaSummaryPanel.tsx` | Schema Summary Panel    | `renderOntologyChip`        | Panel → reads `metadata.ontologies` → renders chip → links to Help documentation                | `GraphData.metadata`                  | Displays `Ontologies: N · Graph layers: M` chip   | ~120   |

---

See continuation in agenticgraph-metadata-document.md for metadata contracts and CLI tooling.
