# AgenticGraph Semantic Layer: Parser → Schema → Canvas

## Design Mantras

```
- [ ] Neutrality; abstract domain logic; forbid dataset-specific semantics
- [ ] Provenance; track extraction lineage; forbid orphaned semantic nodes
- [ ] Configuration; externalize thresholds; forbid hardcoded parameters
- [ ] Composability; layer semantic signals; forbid monolithic extraction
- [ ] Inspectability; expose intermediate states; forbid black-box processing
- [ ] Adaptability; auto-tune from corpus; forbid one-size-fits-all defaults
- [ ] Separation; isolate parser/schema/canvas; forbid cross-concern leakage
```

---

## Universal Design Principles

| Context             | Intent                              | Directive                                                                                      |
|---------------------|-------------------------------------|------------------------------------------------------------------------------------------------|
| Abstraction         | Separate semantic concerns          | - [ ] Define clear semantic contracts; hide extraction details; forbid leaky graph assumptions |
| Configuration       | Externalize semantic behavior       | - [ ] Define threshold schemas; document auto-tuning; forbid embedded semantic constants       |
| Consistency         | Maintain uniform semantics          | - [ ] Apply extraction patterns uniformly; document edge types; forbid arbitrary exceptions    |
| Determinism         | Ensure reproducible semantics       | - [ ] Fix tokenization; normalize spans; forbid non-deterministic entity IDs                   |
| Documentation       | Explain semantic decisions          | - [ ] Document extraction rationale; provide examples; forbid undocumented confidence scores   |
| Extensibility       | Support semantic growth             | - [ ] Design plugin points for extractors; version schemas; forbid closed semantic models      |
| Idempotence         | Guarantee safe re-runs              | - [ ] Produce same entities/relations; avoid state accumulation; forbid non-idempotent merging |
| Instrumentation     | Enable semantic observability       | - [ ] Emit extraction metrics; expose profiles; forbid opaque semantic processing              |
| Modularity          | Isolate semantic responsibilities   | - [ ] Separate TokenLinker/EdgeElevator/PatternMiner; forbid mixed extraction logic            |
| Neutrality          | Abstract semantic logic             | - [ ] Use general NLP algorithms; configure domains; forbid industry-specific extractors       |
| Provenance          | Track semantic lineage              | - [ ] Record source blocks; timestamp mentions; forbid detached semantic nodes                 |
| Testability         | Enable semantic verification        | - [ ] Inject dependencies; expose test hooks; forbid untestable extraction pipelines           |
| Transparency        | Make semantics visible              | - [ ] Log extraction decisions; expose confidence; forbid hidden semantic transformations      |
| Validation          | Verify semantic inputs              | - [ ] Check block structure; enforce span invariants; forbid assumption-based extraction       |

---

## Semantic HTML Content Contract

Generated agenticgraph content HTML must expose meaningful containers for agent and MCP parsing. Content/document exporters and rich-media inline `srcdoc` builders normalize generic HTML division element wrappers into semantic containers (`main`, `section`, `article`, `nav`, `aside`, `header`, `footer`) through the shared headless semantic-HTML helper. UI-only layout chrome can keep local presentation wrappers, but content payloads that agents read or edit must not emit generic HTML division element tags.

---

## Semantic Layer Architecture

**Processing Stack**: Markdown Blocks → TokenLinker → EdgeElevator → PatternMiner → Centrality/Clusters (Communities)

**Data Flow**: Structural Parsing → Mention Extraction → Entity Unification → Relation Extraction → Co-occurrence Mining → Graph Metrics

**Design Principles**: Domain-Agnostic | Configuration-Driven | Provenance-Preserving | Schema-Aligned

### High-Level Components

- **Parser Integration**:
  - `agenticgraph_parser.graph_builder` implements structural parsing, semantic source aggregation, and metadata emission.
- **Semantic Processing**:
  - `agenticgraph_parser.semantic_processor` transforms blocks into entities/mentions/relations via configurable NLP pipelines.
- **Schema Propagation**:
  - `agenticgraph_parser/schema_config.py` maps parser hints into canvas-editable layer configurations.
- **Canvas Runtime**:
  - `data/config/schema/` and canvas schema features coordinate semantic rendering, filtering, and user controls.

### Integration Bridge: Parser → Schema → Canvas

| Parser Stage                    | Schema Equivalent                        | Configuration Controls                                    |
|---------------------------------|------------------------------------------|-----------------------------------------------------------|
| `process_semantics` extraction  | `metadata.layers.semantic` hints         | `sem_defaults`, frontmatter `semanticConfig`              |
| Entity/Mention emission         | `schema.layers.semantic.nodeTypes`       | `nodeMetrics`, `communityProperty`                        |
| `coOccursWith` edge mining      | `schema.layers.semantic.edgeLabel`       | `similarityEdgeLabel`, `edgeMetric`                       |
| Centrality/Cluster computation| `schema.layers.semantic.communityDetection`| `corpusSizePreset`, `topKEdgesPerNode`, `minSimilarity` |

---

## Layer Specifications

### Layer 1: Document Profiling & Auto-Tuning

**From**: Markdown blocks → **To**: Document profile + adapted thresholds → **Enables**: Context-aware extraction parameters.

**Algorithm**: Tokenize all semantic text, count sentences, compute average tokens per sentence, apply tuning rules if `auto_tune_enabled`.

**Configuration Schema**:

```yaml
semantic_doc_profile:
  scope: document_local
  type: object
  mutability: runtime_computed
  validation: requires tokenCount, sentenceCount, avgSentenceTokens
  impact: adapts phrase boundaries, path lengths, confidence thresholds

sem_defaults:
  scope: deployment_configurable
  type: object
  mutability: deployment_configurable
  validation: env vars + frontmatter overrides
  impact: controls all TokenLinker/EdgeElevator/PatternMiner behavior
```

**Interface Pattern**: `process_semantics(semantic_sources, sem_defaults, gid, nodes, edges, add_edge_callback)` → profile text → auto-tune → extract → O(n·m) where n=blocks, m=avg_tokens_per_block

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Function/Method | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|----------------------|---------------------|----------------------------------|
| Profiling        | Estimate corpus stats      | - [ ] Tokenize all text; count sentences; forbid guessed stats                             | semantic_processor| `_profile_text` | semantic_sources     | doc_profile dict    | token_count, sentence_count, avg |
| Auto-tuning      | Adapt to corpus style      | - [ ] Adjust path length for sentence complexity; forbid static defaults                   | semantic_processor| `_auto_tune`    | doc_profile          | updated sem_defaults| avgSentenceTokens thresholds     |
| Environment Config| Load extraction params    | - [ ] Read env vars; merge frontmatter; forbid implicit defaults                           | graph_builder    | `_load_sem_config`| env, frontmatter   | sem_defaults dict   | env precedence + frontmatter overrides|

---

### Layer 2: TokenLinker (Mention & Entity Extraction)

**From**: Semantic blocks → **To**: Mention/Entity nodes + provenance edges → **Enables**: Fine-grained semantic grounding.

**Algorithm**: For each block, tokenize with offsets, merge tokens into candidate spans using phrase boundary heuristics, detect inline code, emit Mention nodes with block/char/token provenance, unify mentions into Entity nodes via normalized text.

**Configuration Schema**:

```yaml
tokenlinker_config:
  phrase_boundary_threshold: 
    type: float
    validation: 0.0 ≤ x ≤ 1.0
    impact: lower = longer phrases, higher = shorter spans
  max_entity_span_tokens:
    type: int
    validation: x ≥ 1
    impact: caps entity length
  coreference_distance_limit:
    type: int
    validation: x ≥ 0
    impact: max token distance for coreference grouping
```

**Interface Pattern**: `_extract_mentions(block, tokens, sem_defaults, gid, nodes, add_edge_callback)` → span detection → inline code detection → mention emission → entity unification → O(t²) where t=tokens_per_block

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Function/Method | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|----------------------|---------------------|----------------------------------|
| Tokenization     | Split text into tokens     | - [ ] Use offset-preserving tokenizer; forbid lossy splits                                 | semantic_processor| `tokenize_with_offsets`| block.text       | tokens list         | regex-based word boundary        |
| Span Merging     | Group tokens into phrases  | - [ ] Apply boundary threshold; limit span length; forbid unbounded merging                | semantic_processor| `merge_tokens_to_spans`| tokens, thresholds| spans list         | adjacency + confidence heuristic |
| Inline Code      | Detect code spans          | - [ ] Pattern match backticks; preserve offsets; forbid text corruption                    | semantic_processor| `detect_inline_code_spans`| block.text    | code_spans list     | regex for \`...\` patterns        |
| Mention Emission | Create Mention nodes       | - [ ] Assign stable IDs; record provenance; forbid duplicate mentions                      | semantic_processor| `_emit_mention` | span, block, gid     | Mention node        | hash(gid, blockId, charRange, text)|
| Entity Unification| Group mentions by text    | - [ ] Normalize text; group by entityType; forbid cross-type merging                       | semantic_processor| `_unify_entities`| mentions           | Entity nodes        | (entityType, normalizedText) key |

---

### Layer 3: EdgeElevator (Sentence-Level Relations)

**From**: Mentions within blocks → **To**: `semanticRelation` edges with confidence/features → **Enables**: Directional semantic links.

**Algorithm**: Group mentions by block, split text into sentences, find mentions per sentence, extract sentence features (temporal, modality, negation), compute confidence, emit ordered `semanticRelation` edges for entity pairs passing thresholds.

**Configuration Schema**:

```yaml
edge_elevator_config:
  edge_confidence_threshold:
    type: float
    validation: 0.0 ≤ x ≤ 1.0
    impact: filters low-confidence relations
  max_syntactic_path_length:
    type: int
    validation: x ≥ 2
    impact: caps entity pair distance in sentence
```

**Interface Pattern**: `_elevate_edges(mentions_by_block, sem_defaults, add_edge_callback)` → sentence splitting → feature extraction → confidence computation → edge emission → O(s·e²) where s=sentences, e=entities_per_sentence

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Function/Method | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|----------------------|---------------------|----------------------------------|
| Sentence Splitting| Isolate relation contexts | - [ ] Use sentence regex; preserve offsets; forbid multi-sentence grouping                 | semantic_processor| `_split_sentences`| block.text         | sentence spans      | `_SENTENCE_SPLIT_RE` pattern     |
| Feature Extraction| Analyze sentence semantics| - [ ] Detect temporal/modality/negation; forbid undocumented features                      | semantic_processor| `extract_sentence_features`| sentence| features dict      | regex + keyword matching         |
| Confidence Scoring| Weight relation strength  | - [ ] Start at 0.5; boost/penalize by features; clamp; forbid arbitrary scores            | semantic_processor| `_compute_confidence`| features, mentions| confidence float   | feature weights + sentence length|
| Edge Emission    | Create relation edges      | - [ ] Emit for valid pairs; deduplicate; forbid duplicate (src, tgt, block, sentence)     | semantic_processor| `_emit_semantic_relation`| src, tgt, confidence| semanticRelation edge| seen_semantic_edges set         |

---

### Layer 4: PatternMiner (Co-occurrence & Similarity)

**From**: Entity block frequencies → **To**: `coOccursWith` edges with PPMI-derived similarity → **Enables**: Document-level semantic clustering.

**Algorithm**: Count entity pair co-occurrences per block, compute PPMI for all pairs, filter by support threshold, emit `coOccursWith` edges with support/pmi/similarity properties.

**Configuration Schema**:

```yaml
pattern_miner_config:
  min_pattern_support:
    type: float
    validation: 0.0 < x ≤ 1.0
    impact: filters low-frequency pairs
  corpus_centrality_algorithm:
    type: string
    validation: "pagerank" | "betweenness" | "none"
    impact: determines centrality metric computation
```

**Interface Pattern**: `_mine_cooccurrence(entity_block_counts, pair_counts, block_count, sem_defaults, add_edge_callback)` → PPMI computation → support filtering → similarity transform → edge emission → O(p) where p=unique_entity_pairs

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Function/Method | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|----------------------|---------------------|----------------------------------|
| Pair Counting    | Aggregate co-occurrences   | - [ ] Count pairs per block; forbid triple or higher-order patterns                        | semantic_processor| `_count_pairs` | entities_per_block   | pair_counts dict    | unordered pair enumeration       |
| PPMI Computation | Weight by mutual info      | - [ ] Compute log(p(a,b)/(p(a)·p(b))); clamp negatives to 0; forbid raw counts            | semantic_processor| `_compute_ppmi`| pair_counts, entity_counts| pmi_scores dict| PPMI formula                     |
| Similarity Transform| Convert PPMI to [0,1]   | - [ ] Apply logistic: 1/(1+exp(-pmi)); forbid unbounded scores                            | semantic_processor| `_pmi_to_similarity`| pmi               | similarity float    | logistic sigmoid                 |
| Edge Emission    | Create coOccursWith edges  | - [ ] Emit with support/pmi/similarity; forbid missing properties                          | semantic_processor| `_emit_cooccurrence_edge`| pair, metrics| coOccursWith edge  | support >= threshold             |

---

### Layer 5: Centrality & Community Detection

**From**: Semantic graph (entities + relations/co-occurrences) → **To**: Centrality scores + community IDs on entities → **Enables**: Graph-level semantic summaries.

**Algorithm**: Build an undirected weighted graph from `semanticRelation` + `coOccursWith` edges, run NetworkX PageRank for centrality, run NetworkX connected components over `coOccursWith` edges for deterministic community IDs, augment entity properties with metrics.

**Configuration Schema**:

```yaml
graph_metrics_config:
  corpus_centrality_algorithm:
    type: string
    validation: "pagerank" | "betweenness" | "none"
    impact: which centrality metric to compute
  community_detection:
    algorithm:
      type: string
      validation: "connected_components"
      impact: deterministic community labeling
```

**Interface Pattern**: `_compute_centrality_communities(entities, semantic_edges, cooccurrence_edges, sem_defaults)` → graph construction → PageRank → connected components → property augmentation → O(n·e) where n=entities, e=edges

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Function/Method | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|----------------------|---------------------|----------------------------------|
| Graph Construction| Build semantic graph      | - [ ] Combine semanticRelation + coOccursWith; forbid isolated nodes without edges        | semantic_processor| `_build_semantic_graph`| edges          | adjacency list      | undirected edge aggregation      |
| PageRank         | Compute centrality         | - [ ] Iterate until convergence; normalize scores; forbid unnormalized ranks              | semantic_processor| `_compute_pagerank`| graph, damping   | centrality dict     | power iteration                  |
| Connected Components| Detect communities      | - [ ] Use NetworkX connected components over `coOccursWith`; forbid nondeterministic ids  | semantic_processor| `_run_networkx_connected_components`| cooccurrence_edges| community_ids dict | stable sort by min-node          |
| Property Augmentation| Write metrics to entities| - [ ] Set mentionCount, blockFrequency, centrality, communityId; forbid overwrite         | semantic_processor| `_augment_entities`| entities, metrics| updated entities   | properties dict merge            |

---

## Component Responsibility Matrix

| Layer/Subsystem | Path/Module                    | Component           | Interface/Method        | Responsibility (S-V-O)                                                | Dependencies                    | Contracts                             | LOC    |
|-----------------|--------------------------------|---------------------|-------------------------|-----------------------------------------------------------------------|---------------------------------|---------------------------------------|--------|
| Profiling       | `agenticgraph_parser/semantic_processor.py`| SemanticProcessor| `_profile_text`         | Profile → tokenizes → text → produces doc_profile with stats          | `tokenize_with_offsets`         | Returns dict with tokenCount, sentenceCount, avgSentenceTokens| ~30    |
| Auto-tuning     | `agenticgraph_parser/semantic_processor.py`| SemanticProcessor| `_auto_tune`            | Tuner → adjusts → thresholds → produces adapted sem_defaults          | doc_profile                     | Modifies sem_defaults in-place based on avgSentenceTokens| ~25    |
| TokenLinker     | `agenticgraph_parser/semantic_processor.py`| SemanticProcessor| `_extract_mentions`     | Extractor → tokenizes → blocks → emits Mention/Entity nodes           | `tokenize_with_offsets`, `merge_tokens_to_spans`| Creates nodes with @id, @type, properties, metadata; emits hasMention/refersTo edges| ~120   |
| EdgeElevator    | `agenticgraph_parser/semantic_processor.py`| SemanticProcessor| `_elevate_edges`        | Elevator → analyzes → sentences → emits semanticRelation edges        | `_split_sentences`, `extract_sentence_features`| Creates edges with relation, confidence, sourceSentence, temporal/modality/negation| ~90    |
| PatternMiner    | `agenticgraph_parser/semantic_processor.py`| SemanticProcessor| `_mine_cooccurrence`    | Miner → counts → pairs → emits coOccursWith edges with PPMI           | `_compute_ppmi`, `_pmi_to_similarity`| Creates edges with support, pmi, similarity, confidence| ~70    |
| Graph Metrics   | `agenticgraph_parser/semantic_processor.py`| SemanticProcessor| `_compute_centrality_communities`| Analyzer → computes → metrics → augments entities with centrality/communities| `nx.pagerank`, `_run_networkx_connected_components`| Adds properties: mentionCount, blockFrequency, centrality, communityId| ~60    |
| Schema Builder  | `agenticgraph_parser/schema_config.py`| SchemaConfigBuilder| `build_schema_config_jsonld`| Builder → reads → graph metadata → produces schema-config JSONâ€'LD     | `graph_jsonld.metadata`         | Populates metadata.layersFromGraph, metadata.layers, corpusSizePresets| ~200   |
| Canvas Controls | `src/components/controls/AiKgSemanticControls.tsx`| AiKgSemanticControls| Component           | UI → exposes → semantic config → enables runtime tuning of similarity | `GraphSchema`                   | Updates schema.layers.semantic via user input| ~150   |

---

## Dependency & Integration Standards

**Dependency Declaration**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Parser Dependencies  | Use neutral NLP libraries       | - [ ] Import standard tokenizers; avoid domain-specific models; forbid proprietary extractors|
| Schema Dependencies  | Align with AgenticRAG contracts | - [ ] Reference `/schema/AgenticRAG/*.jsonld`; forbid undocumented schema extensions       |
| Canvas Dependencies  | Leverage GraphData models       | - [ ] Use typed GraphData, GraphSchema; forbid ad-hoc semantic structures                  |

**Integration Contracts**

- **Parser → Schema**:
  - Must emit `metadata.layers.semantic` with `nodeTypes`, `nodeMetrics`, `edgeLabel`, `edgeMetric`, `communityProperty`.
  - `semanticConfig` must include resolved `sem_defaults` for reproducibility.
- **Schema → Canvas**:
  - Must include `metadata.layersFromGraph.semantic` as read-only parser hints.
  - Must include editable `metadata.layers.semantic` with `similarityMetric`, `topKEdgesPerNode`, `minSimilarity`.
- **Canvas → Renderer**:
  - Must use `schema.layers.semantic.similarityEdgeLabel` to build semantic subgraph.
  - Must respect `schema.layers.semantic.hiddenNodeTypes` for visibility filtering.

**Coupling Metrics**

- `semantic_processor` is decoupled from markdown parsing:
  - Receives `semantic_sources` as opaque block records, not AST nodes.
  - Configuration via `sem_defaults`, not parser-specific settings.
- Canvas semantic controls are decoupled from extraction logic:
  - `AiKgSemanticControls` updates `GraphSchema.layers.semantic`, not parser parameters.
  - Similarity computation in canvas uses schema config, not hardcoded thresholds.

---

## Code Organization Framework

**Directory Structure (relevant subset)**:

```text
agenticgraph/
├── agenticgraph_parser/
│   ├── graph_builder.py           # Markdown parsing + semantic source aggregation
│   ├── semantic_processor.py      # TokenLinker, EdgeElevator, PatternMiner
│   └── text_utils.py              # Tokenization, span merging, utilities
├── data/config/schema/
│   ├── agenticgraph-schema-config-template.jsonld
│   └── agenticgraph-universal-schema-config.jsonld
├── schema/AgenticRAG/
│   ├── graph-schema.jsonld
│   ├── node-schema.jsonld
│   ├── edge-schema.jsonld
│   └── metadata.jsonld
└── src/
    ├── models/
    │   ├── GraphData.ts            # Runtime graph/node/edge models
    │   └── GraphSchema.ts          # Schema layer configuration model
    ├── features/schema/
    │   └── validation.ts           # Schema loading and validation
    └── components/controls/
        └── AiKgSemanticControls.tsx # UI controls for semantic layer
```

**Naming Conventions**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Python Modules       | Follow PEP 8                    | - [ ] Use snake_case; classes PascalCase; forbid abbreviations                             |
| JSONâ€'LD Properties  | Follow AgenticRAG schema        | - [ ] Use camelCase; align with schema/*.jsonld; forbid custom properties without schema   |
| TypeScript Types     | Follow project conventions      | - [ ] Use PascalCase for types; camelCase for properties; forbid inconsistent casing       |
| Constants            | Signal immutability             | - [ ] Use SCREAMING_SNAKE_CASE; group by module; forbid magic values in code               |

**File Organization**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Module Size          | Maintain readability            | - [ ] Keep files under 600 LOC; split at layer boundaries; forbid monolithic modules       |
| Function Length      | Enable comprehension            | - [ ] Limit functions to 50 lines; extract helpers; forbid deep nesting (>4 levels)        |
| Import Organization  | Clarify dependencies            | - [ ] Group stdlib, third-party, local; sort alphabetically; forbid circular imports       |

---

## Testing & Quality Standards

**Test Coverage Metrics**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Unit Tests           | Validate extraction layers      | - [ ] Test TokenLinker/EdgeElevator/PatternMiner in isolation; mock graph callbacks; forbid untested algorithms|
| Integration Tests    | Verify end-to-end semantics     | - [ ] Test full markdown → graph → schema-config pipeline; use realistic fixtures; forbid incomplete coverage|
| Property Tests       | Ensure semantic invariants      | - [ ] Test entity unification, edge deduplication, confidence bounds; forbid untested invariants|

**Test Categories**

- **TokenLinker Tests**:
  - Span merging can be exercised via fixture blocks with known token boundaries.
  - Entity unification can be verified via duplicate normalized texts.
- **EdgeElevator Tests**:
  - Sentence feature extraction can be tested with fixtures containing temporal/modality/negation patterns.
  - Confidence scoring can be validated against expected ranges for known sentence structures.
- **PatternMiner Tests**:
  - PPMI computation can be verified with small co-occurrence matrices.
  - Support filtering can be tested with controlled pair frequencies.
- **Schema Propagation Tests**:
  - Parser hints → schema-config mapping can be verified with known graph metadata.
  - Canvas controls can be tested with mocked GraphSchema updates.

**Quality Gates**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Graph Validation     | Ensure JSONâ€'LD compliance      | - [ ] Validate @context, @type, @id structure; check AgenticRAG alignment; forbid invalid graphs|
| Semantic Validation  | Verify extraction contracts     | - [ ] Validate mention provenance, entity IDs, edge confidence; forbid missing properties   |
| Schema Validation    | Enforce layer configuration     | - [ ] Parse schema-config early; validate required keys; forbid late-stage failures        |

---

## Operational Configuration: Environment Wiring

**Semantic Processor Environment Variables**:

| Variable                          | Scope            | Default                            | Impact                                              |
|-----------------------------------|------------------|------------------------------------|-----------------------------------------------------|
| `AG_PHRASE_BOUNDARY_THRESHOLD`    | deployment       | `0.75`                             | Controls TokenLinker phrase span merging            |
| `AG_EDGE_CONFIDENCE_THRESHOLD`    | deployment       | `0.65`                             | Filters EdgeElevator low-confidence relations       |
| `AG_MAX_SYNTACTIC_PATH_LENGTH`    | deployment       | `4`                                | Caps EdgeElevator entity pair distance in sentence  |
| `AG_MIN_PATTERN_SUPPORT`          | deployment       | `0.05`                             | Filters PatternMiner low-frequency co-occurrences   |
| `AG_CORPUS_CENTRALITY_ALGORITHM`  | deployment       | `"pagerank"`                       | Selects centrality computation algorithm            |
| `AG_AUTO_TUNE_ENABLED`            | deployment       | `true`                             | Enables/disables document-profile-based auto-tuning |

**Artifact Generation**: `graph.jsonld` (with semantic nodes/edges) | `schema-config.jsonld` (with layer hints) | `semantic_doc_profile` (extraction metrics)

**Semantic Processing Integration**:

| Step | Action                                  | Command/Trigger                         | Artifact Consumer                  |
|------|----------------------------------------|------------------------------------------|-------------------------------------|
| 1    | Parse markdown to structural graph     | `graph_builder.parse_markdown_to_graph_jsonld`| Internal nodes/edges lists          |
| 2    | Aggregate semantic sources             | `graph_builder._collect_semantic_sources`| `semantic_processor.process_semantics`|
| 3    | Profile document and auto-tune         | `semantic_processor._profile_text`, `_auto_tune`| Updated `sem_defaults`             |
| 4    | Extract mentions and entities          | `semantic_processor._extract_mentions` | JSONâ€'LD nodes, provenance edges    |
| 5    | Elevate sentence-level relations       | `semantic_processor._elevate_edges`    | `semanticRelation` edges            |
| 6    | Mine co-occurrences and PPMI           | `semantic_processor._mine_cooccurrence`| `coOccursWith` edges                |
| 7    | Compute centrality and communities     | `semantic_processor._compute_centrality_communities`| Entity properties: centrality, communityId|
| 8    | Emit graph metadata with layer hints   | `graph_builder._build_metadata`        | `graph.jsonld.metadata.layers.semantic`|
| 9    | Generate schema-config                 | `build_schema_config_jsonld`           | `schema-config.jsonld`              |
| 10   | Load in canvas and render semantic mode| Canvas initialization + `AiKgSemanticControls`| Interactive graph view             |

| Context              | Intent                          | Directive                                                                                   | Module/Component  | Function/Method              | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|-------------------|------------------------------|------------------------------|------------------------|----------------------------------|
| Config Loading       | Merge env + frontmatter         | - [ ] Read env vars; overlay frontmatter semanticConfig; forbid implicit defaults          | graph_builder     | `_load_sem_config`           | env dict, frontmatter        | sem_defaults dict      | Env precedence + YAML overlay    |
| Semantic Invocation  | Run extraction pipeline         | - [ ] Call process_semantics; pass sem_defaults; forbid silent failures                    | graph_builder     | `parse_markdown_to_graph_jsonld`| markdown text, config    | graph JSONâ€'LD          | Conditional on enable flag       |
| Schema Propagation   | Map parser hints to schema      | - [ ] Copy layersFromGraph; initialize editable layers; forbid missing presets             | schema-config     | `build_schema_config_jsonld` | graph metadata               | schema-config JSONâ€'LD  | layersFromGraph copy + preset merge|

---

## Data Flow

**Pipeline**: Markdown Text → Structural Parsing → Semantic Source Aggregation → Document Profiling → Mention/Entity Extraction → Relation Extraction → Co-occurrence Mining → Centrality/Community → Metadata Emission → Schema Config → Canvas Rendering

| Stage       | Input                          | Output                         | Responsibility                                              | Performance Consideration                    |
|-------------|--------------------------------|--------------------------------|-------------------------------------------------------------|----------------------------------------------|
| Structural Parsing| Markdown text            | Block-level AST                | `graph_builder` parses headings/lists/code/tables/paragraphs| O(n) where n = markdown lines                |
| Semantic Aggregation| Block AST              | `semantic_sources` list        | `graph_builder` collects text blocks for semantic processing| O(b) where b = block count                   |
| Document Profiling| `semantic_sources`      | `semantic_doc_profile`         | `semantic_processor` profiles text, auto-tunes thresholds   | O(t) where t = total tokens                  |
| Mention/Entity| `semantic_sources`        | Mention/Entity nodes, edges    | `semantic_processor` tokenizes, merges spans, unifies entities| O(b·t²) for span merging per block          |
| Relation Extraction| Mentions, blocks        | `semanticRelation` edges       | `semantic_processor` splits sentences, extracts features, emits edges| O(s·e²) where s = sentences, e = entities/sentence|
| Co-occurrence| Entity-block frequencies   | `coOccursWith` edges           | `semantic_processor` counts pairs, computes PPMI, emits edges| O(p) where p = unique entity pairs          |
| Centrality/Community| Semantic graph         | Centrality scores, community IDs| `semantic_processor` runs PageRank, connected components  | O(n·e·i) where n = entities, e = edges, i = iterations|
| Metadata Emission| Graph + metrics          | `metadata.layers.semantic`     | `graph_builder` summarizes extraction, stores semanticConfig| O(1)                                         |
| Schema Config| Graph metadata             | `schema-config.jsonld`         | `build_schema_config_jsonld` maps hints, applies presets    | O(1)                                         |
| Canvas Rendering| Graph + schema-config    | Interactive semantic view      | Canvas builds semantic subgraph, applies filters, renders   | O(n+e) for graph construction + filtering    |

| Context              | Intent                          | Directive                                                                                   | Module           | Function/Method              | Input                | Output                  | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|------------------------------|----------------------|-------------------------|----------------------------------|
| Block Collection     | Aggregate semantic text         | - [ ] Traverse AST; collect text blocks; forbid non-semantic node types                    | graph_builder    | `_collect_semantic_sources`  | ast_nodes            | semantic_sources list   | Block type whitelist             |
| Token Linking        | Extract mentions from text      | - [ ] Tokenize; merge spans; detect code; forbid lossy offsets                             | semantic_processor| `_extract_mentions`         | block, tokens        | Mention/Entity nodes    | Span confidence thresholding     |
| Edge Elevation       | Elevate sentence relations      | - [ ] Split sentences; extract features; compute confidence; forbid arbitrary pairs        | semantic_processor| `_elevate_edges`            | mentions_by_block    | semanticRelation edges  | Confidence threshold + path length|
| Pattern Mining       | Mine document co-occurrences    | - [ ] Count pairs; compute PPMI; filter by support; forbid negative similarities          | semantic_processor| `_mine_cooccurrence`        | entity_frequencies   | coOccursWith edges      | Support threshold + PPMI > 0     |
| Graph Metrics        | Compute centrality/communities  | - [ ] Build graph; run PageRank; propagate labels; forbid disconnected components         | semantic_processor| `_compute_centrality_communities`| entities, edges | augmented entities     | Iterative algorithms             |

---

## Design Decisions & Trade-offs

| Decision             | Rationale                          | Pros                                                  | Cons                                      | Mitigation                                    |
|----------------------|------------------------------------|-------------------------------------------------------|-------------------------------------------|-----------------------------------------------|
| PPMI for similarity  | Avoids embedding dependencies      | No models required, interpretable, fast               | Less semantic than embeddings             | Support hybrid cosine similarity in canvas    |
| Token-level provenance| Enable fine-grained inspection    | Mentions track char/token offsets, block IDs          | Increases node/edge count                 | Canvas can hide mentions in semantic mode     |
| Auto-tuning          | Adapt to corpus style              | No manual threshold tuning per document               | Heuristic-based, may not fit all corpora  | Allow frontmatter overrides for experts       |
| Sentence-level relations| Balance precision and recall    | Captures directional relations within sentences       | Misses cross-sentence relations           | Add optional cross-sentence relation extractor|
| Connected components for communities| Deterministic, stable ids | Fast, deterministic across datasets                  | Can over-fragment sparse graphs           | Tune similarity/edge thresholds upstream      |
| Separate semantic/structural layers| Maintain clear responsibilities| Parser focuses on extraction, canvas on rendering     | Requires schema-config propagation layer  | Schema-config serves as explicit bridge       |

---

## Semantic Processing Directives

### TokenLinker Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Tokenization         | Preserve offsets                | - [ ] Use offset-preserving tokenizer; forbid lossy splits                                 | `tokenize_with_offsets` returns (token, start, end)|
| Span Merging         | Control phrase boundaries       | - [ ] Apply phrase_boundary_threshold; forbid unbounded spans                              | `merge_tokens_to_spans` checks threshold     |
| Entity Unification   | Group by normalized text        | - [ ] Normalize via lowercase; group by entityType; forbid case-sensitive grouping         | `(entityType, normalizedText)` dict key      |
| Inline Code          | Preserve code spans             | - [ ] Detect backticks; set entityType="CodeSpan"; forbid merging code with text           | `detect_inline_code_spans` returns separate list|

### EdgeElevator Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Sentence Splitting   | Isolate relation contexts       | - [ ] Split by sentence regex; forbid multi-sentence grouping                              | `_SENTENCE_SPLIT_RE` pattern                 |
| Feature Extraction   | Capture semantic signals        | - [ ] Detect temporal/modality/negation; forbid undocumented features                      | `extract_sentence_features` returns feature dict|
| Confidence Scoring   | Weight by linguistic features   | - [ ] Start at 0.5; boost/penalize by features; clamp to [0,1]; forbid out-of-bounds     | Confidence clamping function                 |
| Deduplication        | Avoid duplicate relations       | - [ ] Track (src, tgt, block, sentence); forbid multiple edges for same tuple             | `seen_semantic_edges` set                    |

### PatternMiner Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Pair Counting        | Aggregate block-level co-occurrences| - [ ] Count unordered pairs per block; forbid triple patterns                          | Unordered pair enumeration                   |
| PPMI Computation     | Weight by mutual information    | - [ ] Compute log(p(a,b)/(p(a)·p(b))); clamp negatives to 0; forbid raw frequency        | `_compute_ppmi` formula                      |
| Support Filtering    | Filter low-frequency pairs      | - [ ] Filter by min_pattern_support; forbid below-threshold pairs                         | `support >= min_pattern_support` check      |
| Similarity Transform | Convert PPMI to [0,1]           | - [ ] Apply logistic sigmoid; forbid unbounded scores                                     | `1 / (1 + exp(-pmi))` formula                |

---

## Anti-Patterns (Forbidden)

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Hardcoded Thresholds | Enable configuration            | - [ ] Externalize via env vars/frontmatter; forbid magic numbers in extraction code        |
| Dataset-Specific Logic| Maintain neutrality            | - [ ] Use general NLP algorithms; configure via schema; forbid industry-specific extractors |
| Lossy Tokenization   | Preserve provenance             | - [ ] Track char/token offsets; forbid lossy splits that lose position information         |
| Silent Auto-Tuning Failures| Enable debugging           | - [ ] Log all auto-tuning adjustments; forbid silent fallback to defaults                  |
| Cross-Concern Mixing | Maintain separation             | - [ ] Separate TokenLinker/EdgeElevator/PatternMiner; forbid mixed extraction responsibilities|
| Undocumented Features| Enable understanding            | - [ ] Document all sentence features; forbid ad-hoc feature extraction without docs         |
| Unbounded Similarity | Prevent non-comparable scores   | - [ ] Clamp similarities to [0,1]; forbid unbounded PPMI or confidence scores               |
| Missing Provenance   | Enable traceability             | - [ ] Record blockId, charStart, charEnd on all mentions; forbid detached semantic nodes    |
| Schema Misalignment  | Maintain AgenticRAG compliance  | - [ ] Align with `/schema/AgenticRAG`; forbid custom node/edge types without schema updates |
| Canvas Code in Parser| Maintain layer boundaries       | - [ ] Keep extraction in parser; rendering in canvas; forbid UI logic in semantic_processor |

---

## Repository Health Checklist

**Structural Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Module Size          | âœ"      | - [ ] All semantic modules ≤600 LOC; split at layer boundaries; forbid monolithic files    |
| File Organization    | âœ"      | - [ ] Parser, schema, canvas code in separate directories; forbid cross-directory leakage   |

**Maintainability**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Single Responsibility| âœ"      | - [ ] Each layer has one extraction concern; forbid mixed TokenLinker/EdgeElevator logic    |
| Test Coverage        | âœ"      | - [ ] All extraction layers have unit + integration tests; forbid untested semantic algorithms|

**Neutrality**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Domain Agnostic      | âœ"      | - [ ] No industry-specific extractors; forbid product/dataset-specific semantic logic       |
| Configuration-Driven | âœ"      | - [ ] All thresholds via env/frontmatter/schema; forbid hardcoded semantic parameters       |

**Operations**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Error Handling       | âœ"      | - [ ] Extraction logs errors; fails gracefully; forbid silent semantic failures             |
| Observability        | âœ"      | - [ ] Semantic doc profile emitted; extraction metrics logged; forbid black-box processing  |

---

## Version Control Standards

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Schema Versioning    | Track semantic contracts        | - [ ] Version `/schema/AgenticRAG` schemas; document breaking changes; forbid silent schema updates|
| Parser Versioning    | Track extraction changes        | - [ ] Maintain CHANGELOG for semantic_processor; document algorithm updates; forbid undocumented changes|
| Config Versioning    | Track threshold changes         | - [ ] Version schema-config templates; document preset updates; forbid breaking config changes without migration|

---

## Validation Checklist (Semantics)

- [ ] All semantic nodes match `/schema/AgenticRAG` node-schema.jsonld definitions.
- [ ] All semantic edges match `/schema/AgenticRAG` edge-schema.jsonld definitions.
- [ ] No extraction algorithm depends on a specific dataset, project, or repository name.
- [ ] All extraction thresholds are configured via `sem_defaults` or frontmatter, not hardcoded.
- [ ] All mentions include provenance: `blockId`, `charStart`, `charEnd`, `tokenStart`, `tokenEnd`.
- [ ] All entities are unified via normalized text and track `mentionCount`, `blockFrequency`.
- [ ] `semanticRelation` edges include confidence, sourceSentence, temporal/modality/negation features.
- [ ] `coOccursWith` edges include support, pmi, similarity properties.
- [ ] Centrality and community properties are computed when configured and stored on entity nodes.
- [ ] `metadata.layers.semantic` accurately describes extraction outputs: nodeTypes, nodeMetrics, edgeLabel, edgeMetric, communityProperty.
- [ ] Schema-config propagates parser hints into `metadata.layersFromGraph.semantic` and initializes editable `metadata.layers.semantic`.
- [ ] Canvas semantic controls update `GraphSchema.layers.semantic` without modifying parser behavior.
- [ ] Semantic layer behaviors are reusable across at least 3+ distinct document corpora without code changes, only configuration updates.
- [ ] All semantic modules remain ≤600 LOC; new extraction layers follow SRP and RAO documentation patterns.
