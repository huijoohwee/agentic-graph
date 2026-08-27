# agenticgraph GraphRAG Pipeline In Action PRD/TAD: Validation and Appendix

Continuation of agenticgraph-graphrag-pipeline-in-action-prd-tad.md covering quality attributes, deployment, validation, analytics, glossary, and implementation notes.

### Quality Attributes

#### Performance

**Requirement**: System processes 1000-word documents with analytics end-to-end in <4 seconds (p95 latency).

**Architecture Pattern**: Sequential pipeline with early-exit on errors, efficient sparse matrix operations for TF-IDF, incremental graph construction.

**Validation**: Load test with 100 sample documents measuring per-stage latency.

**Metrics**:
```
NLTK preprocessing: <50ms
spaCy NER: <500ms
Triple extraction: <200ms
TF-IDF computation: <100ms
Graph construction: <150ms
PageRank calculation: <300ms
Louvain community detection: <400ms
Causality detection: <100ms
Visualization render: <300ms
Total: <2100ms (with 90% buffer = 3990ms)
```

---

#### Scalability

**Requirement**: Support documents up to 10,000 words and graphs up to 500 nodes without client-side memory issues.

**Architecture Pattern**: Sparse matrix representations for TF-IDF, efficient NetworkX data structures, canvas-based rendering (not DOM).

**Validation**: Stress test with 15,000-word documents and 750-node graphs monitoring browser memory usage (<800MB).

**Constraints**: 
- Beyond 10k words, recommend server-side processing
- Beyond 500 nodes, recommend graph simplification (edge pruning, node aggregation)

---

#### Accuracy

**Requirement**: Analytics metrics match reference implementations within acceptable tolerances.

**Architecture Pattern**: Use established libraries (scikit-learn, NetworkX) as ground truth, validate outputs.

**Validation**: Unit tests comparing outputs to reference implementations.

**Tolerances**:
- TF-IDF scores: ≤5% relative error vs scikit-learn
- PageRank scores: ≤5% relative error vs NetworkX
- Community modularity: ≤10% relative error vs python-louvain
- Causality precision: ≥70% on manually labeled test set

---

#### Usability

**Requirement**: Users with basic NLP knowledge understand analytics metrics without documentation.

**Architecture Pattern**: Inline tooltips, progressive disclosure UI, visual encoding of metrics (node size = importance, edge thickness = strength).

**Validation**: User testing with 10 participants achieving >85% task completion without help.

**Metrics**:
- Time to understand PageRank ranking: <60 seconds
- Ability to identify strongest causal relationship: >90% accuracy
- Understanding of community groupings: >85% correct interpretation

---

#### Maintainability

**Requirement**: Developers can swap analytics algorithms (e.g., TF-IDF → KeyBERT) without rewriting UI.

**Architecture Pattern**: Interface-based component contracts, dependency injection, config-driven algorithm selection.

**Validation**: Successfully swap TF-IDF for KeyBERT implementation in <6 hours.

**Design Principles**:
- Each analytics component implements interface contract
- No direct library imports in UI layer
- Configuration file externalizes algorithm choices

---

#### Observability

**Requirement**: Developers can debug analytics failures by inspecting intermediate outputs and metrics.

**Architecture Pattern**: Stage-level logging with metric snapshots, structured error messages, debug mode with detailed outputs.

**Validation**: Inject errors at each analytics stage and verify clear error messages + recovery guidance.

**Telemetry**:
```typescript
interface AnalyticsStageMetrics {
  stage: string
  status: "success" | "error"
  latency_ms: number
  input_size: number
  output_size: number
  metrics: {
    avg_tfidf?: number
    avg_pagerank?: number
    num_communities?: number
    modularity?: number
  }
  error_message?: string
}
```

---

### Deployment Strategy

**Pattern**: Static artifact deployment (client-side only)

**Deployment Flow**:
1. Build React application → bundle JavaScript/CSS with analytics libraries
2. Verify NLP model loading → test spaCy model import
3. Validate analytics computation → run test suite on sample documents
4. Deploy to CDN → upload to Cloudflare Pages / Netlify
5. Validate in production → smoke test with analytics pipeline

**Rollback Strategy**: Revert to previous CDN version via version tags.

**Zero-Downtime**: Not applicable (client-side app, no backend).

---

### Migration Path

**Current State**: Users have v1.0.0 with basic entity extraction and graph construction.

**Target State**: Users have v2.0.0 with entity importance ranking, causality detection, and community clustering.

**Migration Steps**:
1. **Phase 1** (Week 1-3): Add TF-IDF scoring and basic centrality
2. **Phase 2** (Week 4-5): Add causality detection and edge strength
3. **Phase 3** (Week 6-7): Add Louvain community detection
4. **Phase 4** (Week 8-9): Add interactive analytics dashboard with filtering
5. **Phase 5** (Week 10): Performance optimization and user testing

**Backward Compatibility**: v2.0.0 API-compatible with v1.0.0 - analytics are additive enhancements.

**Data Migration**: Not applicable (session-only storage, no persistent data).

---

## PART III: REQUIREMENT TRACEABILITY MATRIX

| PRD ID | PRD User Story | TAD Component | TAD Interface | ADR |
|--------|----------------|---------------|---------------|-----|
| PRD-E001-S001 | Entity Extraction | TAD-C002 | TAD-I002 | ADR-001 |
| PRD-E001-S002 | Triple Extraction | TAD-C003 | TAD-I003 | ADR-002 |
| PRD-E001-S003 | Interactive Visualization | TAD-C009 | TAD-I006 | N/A |
| PRD-E001-S004 | Graph Construction | TAD-C008 | TAD-I005 | ADR-003 |
| PRD-E002-S001 | Keyword Frequency Scoring | TAD-C004 | TAD-I003 | ADR-004 |
| PRD-E002-S002 | Centrality-Based Importance | TAD-C004 | TAD-I003 | ADR-004 |
| PRD-E003-S001 | Causal Relationship Detection | TAD-C005 | TAD-I004 | ADR-005 |
| PRD-E003-S002 | Relationship Strength Measurement | TAD-C005 | TAD-I004 | ADR-005 |
| PRD-E004-S001 | Automated Community Clustering | TAD-C006 | TAD-I005 | ADR-006 |
| PRD-E004-S002 | Hierarchical Topic Modeling | TAD-C006 | TAD-I005 | ADR-006 |
| PRD-E005-S001 | Real-Time Metric Updates | TAD-C009 | TAD-I006 | ADR-007 |
| PRD-E005-S002 | Comparative Analytics | TAD-C009 | TAD-I006 | ADR-007 |

---

## PART IV: VALIDATION CHECKLIST

### PRD Validation

- [x] User stories follow "As a...I want...So that" format
- [x] Acceptance criteria use Given-When-Then pattern
- [x] Features prioritized via MoSCoW framework
- [x] Problem statement precedes solution description
- [x] Success metrics are measurable and time-bound
- [x] Out of scope explicitly defined
- [x] No technical implementation details in PRD
- [x] User personas identified (data analyst, researcher, domain expert, knowledge worker)
- [x] Analytics requirements quantified (≥70% causality precision, ≥0.30 modularity)

### TAD Validation

- [x] Components have single responsibility (SRP)
- [x] Interfaces specified with TypeScript contracts
- [x] Architectural decisions documented with ADR format
- [x] Quality attributes have measurable scenarios
- [x] Deployment strategy defined
- [x] No business logic in TAD (focuses on HOW not WHY)
- [x] Domain-agnostic design (analytics pipeline, not domain-specific)
- [x] Four new components for analytics layers (TAD-C004 through TAD-C007)
- [x] Five new ADRs addressing key algorithm choices

### Traceability Validation

- [x] PRD-to-TAD mapping established in traceability matrix
- [x] All user stories map to TAD components
- [x] All TAD components trace back to PRD requirements
- [x] ADRs reference specific user stories where applicable
- [x] New analytics epics fully traced to implementation

---

## PART V: OPEN QUESTIONS & RISKS

### Open Questions

**OQ-001**: Pattern-based vs transformer-based causality detection?  
**Impact**: Accuracy (70% vs 85%) vs Speed (50ms vs 500ms) vs Dependencies (0 vs 400MB model)  
**Resolution Deadline**: Week 2  
**Owner**: Technical Lead  
**Status**: RESOLVED - ADR-005 selects pattern-based for v2.0.0

**OQ-002**: Edge strength threshold for visual filtering?  
**Impact**: User experience (clutter reduction) vs information completeness  
**Resolution Deadline**: Week 3  
**Owner**: UX Designer  
**Proposed Values**: 0.2 (show only moderate-strong), 0.3 (show only strong), user-configurable slider

**OQ-003**: Pre-compute vs on-demand analytics?  
**Impact**: Initial latency (+2s) vs interactive latency (+1-2s per toggle)  
**Resolution Deadline**: Week 2  
**Owner**: Engineering Lead  
**Status**: RESOLVED - ADR-007 selects pre-compute

**OQ-004**: Optimal community count for navigation?  
**Impact**: Granularity (too few = overgeneralization) vs Usability (too many = cognitive overload)  
**Resolution Deadline**: Week 4  
**Owner**: Product Manager  
**Proposed Range**: 3-7 communities with automatic selection based on modularity

**OQ-005**: Should we support BERTopic for semantic topic modeling in v2.0.0?  
**Impact**: Semantic accuracy (+15%) vs Model size (500MB) vs Computation time (+3-5s)  
**Resolution Deadline**: Week 3  
**Owner**: Product Manager  
**Status**: DEFERRED to v2.1.0 as "Should Have" feature

### Risks

**RISK-001**: TF-IDF may not capture semantic importance for technical jargon  
**Mitigation**: Add KeyBERT as optional enhancement, validate on domain-specific corpora  
**Probability**: Medium | **Impact**: Medium | **Owner**: Data Scientist

**RISK-002**: Pattern-based causality detection misses implicit causal relationships  
**Mitigation**: Expand pattern library, add user feedback mechanism for missed causality  
**Probability**: High | **Impact**: Medium | **Owner**: NLP Engineer

**RISK-003**: Louvain community detection may produce unintuitive clusters for small graphs  
**Mitigation**: Set minimum graph size (10 nodes), fall back to single community for smaller graphs  
**Probability**: Medium | **Impact**: Low | **Owner**: Engineering Lead

**RISK-004**: Analytics computation time exceeds 4s target for large documents  
**Mitigation**: Add progressive computation, optimize TF-IDF with sparse matrices, cache intermediate results  
**Probability**: Medium | **Impact**: High | **Owner**: Performance Engineer

**RISK-005**: Users may not understand statistical metrics (PageRank, modularity, PMI)  
**Mitigation**: Add inline tooltips, provide educational content, use visual encodings (size, color)  
**Probability**: High | **Impact**: High | **Owner**: UX Designer

---

## PART VI: ANALYTICS LAYER SPECIFICATION

### Entity Layer (Nodes)

**Metrics Computed**:
1. **Frequency**: Count of entity mentions in corpus
2. **TF-IDF Score**: Term frequency × inverse document frequency (normalized [0,1])
3. **PageRank**: Importance based on graph structure (normalized [0,1])
4. **HITS (Hubs & Authorities)**: Hub score (points to authorities) and Authority score (pointed to by hubs)
5. **Degree Centrality**: Number of connections (normalized [0,1])
6. **Betweenness Centrality**: Fraction of shortest paths through node (normalized [0,1])
7. **Closeness Centrality**: Inverse sum of shortest paths to all other nodes (normalized [0,1])
8. **Combined Score**: Weighted average `0.4×frequency + 0.3×tfidf + 0.3×pagerank`

**Visual Encoding**:
- Node radius: `baseRadius × (1 + combinedScore × 2)`
- Border width: `2px if pagerank > 0.08, else 0px`
- Pulse animation: Higher frequency = faster pulse

---

### Relation Layer (Edges)

**Metrics Computed**:
1. **Causality Score**: Confidence of causal relationship [0,1] based on marker presence
2. **Co-occurrence Frequency**: Times source and target appear in same sentence/paragraph
3. **PMI (Pointwise Mutual Information)**: `log(P(source,target) / (P(source)×P(target)))`
4. **Edge Strength**: Normalized combination of causality + co-occurrence + PMI [0,1]
5. **Edge Type**: Classification (causal, dependency, hierarchy, composition, technical)

**Visual Encoding**:
- Edge thickness: `1px + strength × 4px`
- Edge opacity: `strength × 0.8`
- Edge color: Inherited from target node community
- Edge label: Shown only for strength > 0.7

---

### Metadata Layer (Attributes)

**Graph-Level Metrics**:
1. **Density**: `actualEdges / possibleEdges`
2. **Diameter**: Longest shortest path between any two nodes
3. **Average Path Length**: Mean shortest path across all node pairs
4. **Clustering Coefficient**: Tendency of nodes to cluster
5. **Connected Components**: Number of disconnected subgraphs

**Community-Level Metrics**:
1. **Modularity**: Quality of community division [-0.5, 1.0], higher = better
2. **Internal Edge Density**: Fraction of edges within community
3. **Conductance**: Ratio of external to total edges (lower = better community)
4. **Coverage**: Fraction of edges within communities

---

### Cluster Layer (Communities)

**Community Detection Parameters**:
- **Algorithm**: Louvain modularity maximization
- **Resolution**: 1.0 (standard)
- **Min Community Size**: 3 nodes
- **Max Communities**: 8 (for visualization clarity)

**Community Labeling Strategy**:
1. Extract all entities in community
2. Compute TF-IDF scores within community
3. Select top 3 keywords by TF-IDF
4. Concatenate as label (e.g., "Training & Data & Optimization")
5. Simplify to readable form (e.g., "Training & Data")

**Visual Encoding**:
- Distinct color per community (predefined palette)
- Spatial grouping via force-directed layout with community attraction
- Community filter enables isolation view

---

## PART VII: GLOSSARY

**Entity**: Named item in text (person, place, organization, date, etc.) identified by NER.

**Triple**: Semantic relationship in (subject, predicate, object) format.

**Knowledge Graph**: Graph data structure where nodes are entities and edges are relationships.

**TF-IDF**: Term Frequency-Inverse Document Frequency, measures keyword importance by balancing frequency with rarity.

**PageRank**: Graph centrality algorithm measuring node importance based on incoming edges (originally developed for web search).

**Causality Score**: Confidence [0,1] that a relationship represents causation rather than correlation.

**PMI (Pointwise Mutual Information)**: Statistical measure of association between two entities based on co-occurrence patterns.

**Community**: Subset of nodes in graph with dense internal connections and sparse external connections.

**Modularity**: Metric [-0.5, 1.0] measuring quality of community detection; higher values indicate stronger community structure.

**Louvain Algorithm**: Greedy optimization algorithm for community detection that maximizes modularity.

**FOSS (Free and Open Source Software)**: Software with source code freely available under open licenses.

**GraphRAG**: Graph Retrieval-Augmented Generation, technique combining knowledge graphs with LLM generation.

---

## Document Metadata

**Document Type**: PRD + TAD (Combined)  
**Version**: 2.0.0  
**Previous Version**: 1.0.0  
**Last Updated**: 2026-01-22  
**Authors**: Product Team, Architecture Team, Analytics Team  
**Reviewers**: AgenticGraph maintainers  
**Status**: Accepted validation appendix  
**Next Review Date**: On source-owner change

**Major Changes from v1.0.0**:
- Added 4 new analytics epics (PRD-E002 through PRD-E005)
- Added 5 new TAD components (TAD-C004 through TAD-C008 updated)
- Added 4 new ADRs (ADR-004 through ADR-007)
- Enhanced traceability matrix with analytics layers
- Added comprehensive analytics layer specification (Part VII)
- Updated success metrics with analytics targets

**Adherence to Guidelines**: This document follows `prd-tad-guidelines.md` CID framework, maintains PRD/TAD separation, uses problem-first approach, specifies measurable outcomes, documents architectural decisions with ADRs, establishes bidirectional traceability, and structures content hierarchically with user-centric narratives.

---

## Prompt_202601221200

https://claude.ai/chat/a049d9b9-5684-48c6-9888-f1754a019e2e

### Prompt-01

```
**FORBID >10 line code blocks, interactive demo**
RECOMMEND minimum viable, strictly FOSS to parse
"Singapore is a city-state in Southeast Asia. It has a population of about 5.9 million and is known for its financial hub, Changi Airport, and future development projects."

```
NLTK (preprocessing: stopwords, regex, lemmatization): https://github.com/nltk/nltk.git
  ↓
HuggingFace Tokenizers (primary tokenization interface): https://github.com/huggingface/tokenizers.git
  ├─ SentencePiece (Unigram/BPE, multilingual): https://github.com/google/sentencepiece.git
  ├─ BPE (minbpe, GPT-style): https://github.com/karpathy/minbpe.git
  └─ WordPiece internally (via HF Tokenizers)
  ↓
spaCy (dependency parsing, POS tagging, NER): https://github.com/explosion/spaCy
  ↓
AllenNLP (semantic role labeling, OpenIE): https://github.com/allenai/allennlp
  ↓
Entity Linking (DBpedia Spotlight / REL):
    - https://github.com/dbpedia-spotlight/dbpedia-spotlight
    - https://github.com/informagi/REL
  ↓
Triple Extraction (OpenIE standalone): https://github.com/dair-iitd/OpenIE-standalone
  ↓
Graph Construction:
    - NetworkX (graph algorithms): https://github.com/networkx/networkx
  ↓
Community Detection / Subgraph Partitioning:
    - NetworkX
  ↓
LLM Inference (retrieval-augmented reasoning over subgraphs)
```
```

#### Response-01

```
I've created an **interactive demo** that shows your minimum viable FOSS GraphRAG pipeline in action. The demo visualizes each step processing the Singapore text through the stack.

**Key features:**
- Click through 5 pipeline stages
- See actual outputs at each step
- Code snippets kept to 2-3 lines max (per your requirement)
- Links to all FOSS repos at bottom
- Shows real entities, triples, and graph structure

**Strictly FOSS components shown:**
1. **NLTK** → Stopword removal, lemmatization
2. **HuggingFace Tokenizers** → Subword tokenization for LLM compatibility
3. **spaCy** → NER (Singapore/GPE, Changi Airport/FAC) + POS tagging
4. **Triple Extraction** → Semantic relationships like "(Singapore, located-in, Southeast Asia)"
5. **NetworkX** → Graph construction with ~7 nodes, 6 edges, 2 communities (demo text)

The demo shows how your text flows through each component and what gets extracted at each stage—from raw text to a structured knowledge graph ready for LLM retrieval.
```

## Implementation (Canvas)

This PRD/TAD is implemented in the `agenticgraph/canvas` pipeline as a domain-agnostic, client-side demo that produces canonical `GraphData` plus inspectable intermediate outputs.

### Where It Lives

- Pipeline (sequential stages, metrics, FOSS attribution): `canvas/src/lib/graph/graphragTextPipeline.ts`
- Parser integration (auto-detect `.txt` + plain-text `.md`): `canvas/src/features/parsers/default.ts` (`graphrag-text`)
- UI visualization (stage-by-stage inspector): `canvas/src/features/panels/views/GraphRagTextPipelineSection.tsx` (Parser tab)
- AIE book chapter snippet demo (multi-input, extraction fidelity): `canvas/src/features/demo/GraphRagAieBookChapterSummariesDemo.tsx`, `canvas/src/features/demo/aieBookChapterSnippets.ts`
- Tests (neutral fixtures + demo-fidelity fixtures): `canvas/src/__tests__/graphragTextPipeline.test.ts`, `canvas/src/__tests__/aieBookGraphRagTextPipeline.test.ts`, `canvas/src/__tests__/fixtures/graphrag-text-demo.md`

### Scope Notes

- The Canvas demo remains extraction-only (no LLM API integration) and runs without server dependencies.
- Library references and code snippets are shown for transparency; the demo pipeline itself uses heuristic implementations (bounded summarization + sentence-level evidence spans) to stay portable.
- Context-Aware Analytics (PageRank / HITS / Betweenness / Closeness) can be toggled from the shared stats and workflow surfaces; the effective settings are captured in `GraphData.metadata.graphragTextPipeline.config`.
