# agentic-graph GraphRAG Pipeline In Action PRD/TAD: TAD Core

Continuation of agentic-graph-graphrag-pipeline-in-action-prd-tad.md covering architecture overview, component specifications, contracts, and ADRs.

## PART II: TECHNICAL ARCHITECTURE DOCUMENT (TAD)

### Architecture Overview

**From text to analytics-enhanced knowledge graph**: System → receives unstructured text input → preprocesses via NLTK (tokenization, lemmatization, stopword removal) → extracts entities via spaCy NER → generates semantic triples through dependency parsing → **analyzes entity importance via TF-IDF and PageRank** → **detects causal relationships via pattern matching** → constructs graph via NetworkX → **identifies communities via density-based clustering (DBSCAN)** → **computes graph metrics** → delivers interactive visualization with importance-weighted nodes, strength-weighted edges, and color-coded communities.

**Architecture Pattern**: Sequential pipeline with four-layer analytics stack (Entity → Relation → Metadata → Cluster)

---

### Component Specifications

#### TAD-C001: Preprocessing Engine (unchanged from v1.0.0)

**Component**: NLTKPreprocessor  
**Responsibility**: Preprocessor → cleans raw text → removes stopwords and punctuation → produces normalized tokens for downstream NER  
**Interfaces**: 
```typescript
interface IPreprocessor {
  tokenize(text: string): string[]
  lemmatize(tokens: string[]): string[]
  removeStopwords(tokens: string[]): string[]
}
```
**Dependencies**: NLTK stopwords corpus, WordNet lemmatizer  
**Configuration**: `stopwords_language="english"`, `lemmatizer_pos="v|n|a"`

---

#### TAD-C002: Entity Recognition Service (unchanged)

**Component**: SpaCyNERExtractor  
**Responsibility**: Extractor → processes preprocessed tokens → identifies named entities with type labels → delivers structured entity list with spans  
**Interfaces**:
```typescript
interface INERExtractor {
  extractEntities(text: string): Entity[]
}
type Entity = {
  text: string
  label: string
  start: number
  end: number
}
```
**Dependencies**: spaCy `en_core_web_sm` model  
**Configuration**: `confidence_threshold=0.5`, `entity_types=["GPE","LOC","PERSON","ORG","FAC","QUANTITY"]`

---

#### TAD-C003: Triple Extraction Engine (unchanged)

**Component**: DependencyTripleExtractor  
**Responsibility**: Extractor → analyzes dependency parse tree → identifies subject-verb-object patterns → produces semantic triples for graph construction  
**Interfaces**:
```typescript
interface ITripleExtractor {
  extractTriples(doc: SpacyDoc): Triple[]
}
type Triple = {
  subject: string
  predicate: string
  object: string
  confidence: number
}
```
**Dependencies**: spaCy dependency parser  
**Configuration**: `pattern_rules=["nsubj-ROOT-dobj", "nsubj-ROOT-prep-pobj"]`

---

#### TAD-C004: Entity Importance Analyzer (NEW)

**Component**: EntityImportanceScorer  
**Responsibility**: Analyzer → receives entity list and corpus → computes TF-IDF scores → calculates graph centrality metrics → produces importance-ranked entity list  
**Interfaces**:
```typescript
interface IImportanceAnalyzer {
  computeTFIDF(entities: Entity[], corpus: string[]): TFIDFScores
  computeCentrality(graph: Graph): CentralityScores
  rankEntities(entities: Entity[], scores: Scores): RankedEntity[]
}
type TFIDFScores = { [entityId: string]: number }
type CentralityScores = {
  pagerank: { [nodeId: string]: number }
  degree: { [nodeId: string]: number }
  betweenness: { [nodeId: string]: number }
}
type RankedEntity = Entity & {
  frequency: number
  tfidf: number
  pagerank: number
  combinedScore: number
}
```
**Dependencies**: scikit-learn TfidfVectorizer, NetworkX centrality algorithms  
**Configuration**: `tfidf_ngram_range=(1,2)`, `pagerank_alpha=0.85`, `pagerank_max_iter=100`

---

#### TAD-C005: Causality Detection Engine (NEW)

**Component**: CausalRelationClassifier  
**Responsibility**: Classifier → analyzes triple predicates → detects causal markers → computes relationship strength → labels edge types and confidence scores  
**Interfaces**:
```typescript
interface ICausalityDetector {
  detectCausality(triple: Triple, doc: SpacyDoc): CausalEdge
  computeStrength(source: Entity, target: Entity, corpus: string[]): number
}
type CausalEdge = Triple & {
  edgeType: 'causal' | 'dependency' | 'hierarchy' | 'composition' | 'technical'
  causalityScore: number
  strength: number
  pmi: number
}
```
**Dependencies**: spaCy dependency patterns, custom causal marker list  
**Configuration**: `causal_markers=["causes","leads to","results in","enables","reduces"]`, `strength_threshold=0.3`

---

#### TAD-C006: Community Detection Service (NEW)

**Component**: GraphCommunityClustering  
**Responsibility**: Clusterer → receives knowledge graph → applies density-based clustering (DBSCAN) over lightweight token vectors → detects semantic communities → assigns community ids → generates community keyword summaries  
**Interfaces**:
```typescript
interface ICommunityDetector {
  detectCommunities(graph: Graph, options?: DbscanOptions): Community[]
  labelCommunities(communities: Community[], entities: Entity[]): LabeledCommunity[]
}
type DbscanOptions = {
  eps: number
  minPts: number
  maxNodes: number
  maxSteps: number
}
type Community = {
  id: number
  nodes: string[]
  color: string
}
type LabeledCommunity = Community & {
  label: string
  topKeywords: string[]
  density: number
}
```
**Dependencies**: In-house DBSCAN (no external clustering dependency)  
**Configuration**: `eps=0.55`, `minPts=2`, `maxNodes=200`, `maxSteps=120000`

---

#### TAD-C007: Graph Metrics Calculator (NEW)

**Component**: GraphMetricsComputer  
**Responsibility**: Computer → receives constructed graph → calculates density, diameter, clustering coefficient → computes per-community statistics → produces comprehensive graph metrics  
**Interfaces**:
```typescript
interface IMetricsCalculator {
  computeGraphMetrics(graph: Graph): GraphMetrics
  computeCommunityMetrics(graph: Graph, communities: Community[]): CommunityMetrics[]
}
type GraphMetrics = {
  nodeCount: number
  edgeCount: number
  density: number
  diameter: number
  avgPathLength: number
  clusteringCoefficient: number
  connectedComponents: number
}
type CommunityMetrics = {
  communityId: number
  internalEdges: number
  externalEdges: number
  conductance: number
  coverage: number
}
```
**Dependencies**: NetworkX graph algorithms  
**Configuration**: `timeout_seconds=10`

---

#### TAD-C008: Graph Construction Service (updated from v1.0.0)

**Component**: NetworkXGraphBuilder  
**Responsibility**: Builder → consumes entity triples and analytics → constructs directed graph with weighted nodes and edges → integrates importance scores and community assignments → delivers analytics-enriched graph  
**Interfaces**:
```typescript
interface IGraphBuilder {
  buildGraph(triples: CausalEdge[], entities: RankedEntity[]): AnalyticsGraph
  assignCommunities(graph: AnalyticsGraph, communities: LabeledCommunity[]): AnalyticsGraph
}
type AnalyticsGraph = {
  nodes: AnalyticsNode[]
  edges: AnalyticsEdge[]
  communities: LabeledCommunity[]
  metrics: GraphMetrics
}
type AnalyticsNode = {
  id: string
  label: string
  frequency: number
  tfidf: number
  pagerank: number
  community: number
  radius: number  // computed from importance scores
}
type AnalyticsEdge = {
  source: string
  target: string
  label: string
  edgeType: string
  causalityScore: number
  strength: number
  thickness: number  // computed from strength
}
```
**Dependencies**: NetworkX graph construction, TAD-C004, TAD-C005, TAD-C006  
**Configuration**: `node_size_scale=0.5`, `edge_thickness_scale=3.0`

---

#### TAD-C009: Analytics Visualization Controller (updated from v1.0.0)

**Component**: ReactAnalyticsUI  
**Responsibility**: Controller → manages pipeline state → orchestrates analytics computation → renders importance-weighted visualizations → handles community filtering and metric toggling  
**Interfaces**:
```typescript
interface IAnalyticsController {
  processPipelineWithAnalytics(text: string): Promise<AnalyticsPipelineResult>
  filterByCommunity(communityId: number): void
  toggleMetricsDisplay(show: boolean): void
  exportAnalytics(format: 'json' | 'csv'): string
}
type AnalyticsPipelineResult = {
  preprocessed: PreprocessedText
  entities: RankedEntity[]
  triples: CausalEdge[]
  graph: AnalyticsGraph
  communities: LabeledCommunity[]
  metrics: GraphMetrics
}
```
**Dependencies**: React state management, Tailwind CSS, Canvas 2D API  
**Configuration**: `max_stages=7`, `animation_duration=300ms`, `default_community_filter="all"`

---

### Integration Contracts

#### TAD-I001: Preprocessing → NER Interface (unchanged)

**Interface**: TextNormalizationContract  
**Protocol**: In-memory function call  
**Data Format**:
```typescript
Input: { raw: string }
Output: { tokens: string[], lemmas: string[] }
```
**Error Handling**: Invalid UTF-8 → return empty array + log warning

---

#### TAD-I002: NER → Triple Extraction Interface (unchanged)

**Interface**: EntityToTripleContract  
**Protocol**: In-memory object passing  
**Data Format**:
```typescript
Input: { entities: Entity[], doc: SpacyDoc }
Output: { triples: Triple[] }
```
**Error Handling**: No entities found → return empty triple array

---

#### TAD-I003: Triple → Entity Importance Interface (NEW)

**Interface**: TripleToImportanceContract  
**Protocol**: In-memory object transformation  
**Data Format**:
```typescript
Input: { entities: Entity[], triples: Triple[], corpus: string[] }
Output: { rankedEntities: RankedEntity[], tfidfScores: TFIDFScores }
```
**Error Handling**: Empty corpus → use frequency-only ranking

---

#### TAD-I004: Triple → Causality Detection Interface (NEW)

**Interface**: TripleToCausalityContract  
**Protocol**: In-memory enrichment  
**Data Format**:
```typescript
Input: { triples: Triple[], doc: SpacyDoc, corpus: string[] }
Output: { causalEdges: CausalEdge[] }
```
**Error Handling**: No causal markers detected → assign default strength 0.5

---

#### TAD-I005: Graph → Community Detection Interface (NEW)

**Interface**: GraphToCommunityContract  
**Protocol**: In-memory graph analysis  
**Data Format**:
```typescript
Input: { graph: Graph }
Output: { communities: LabeledCommunity[], modularity: number }
```
**Error Handling**: Graph too small (<5 nodes) → return single community

---

#### TAD-I006: Analytics → Visualization Interface (NEW)

**Interface**: AnalyticsToRenderContract  
**Protocol**: In-memory data binding  
**Data Format**:
```typescript
Input: { 
  graph: AnalyticsGraph,
  communities: LabeledCommunity[],
  metrics: GraphMetrics,
  selectedCommunity: number | 'all'
}
Output: { 
  renderableNodes: CanvasNode[],
  renderableEdges: CanvasEdge[],
  displayMetrics: UIMetrics 
}
```
**Error Handling**: Invalid community filter → default to 'all'

---

### Architectural Decisions

#### ADR-001: Use spaCy for NER Instead of Custom BERT Model (unchanged from v1.0.0)

**Status**: Accepted  
**Date**: 2026-01-22  
**Deciders**: Architecture Team

**Context**: Need named entity recognition with balance of accuracy, speed, and ease of deployment.

**Decision**: Use pre-trained spaCy `en_core_web_sm` model for entity extraction.

**Alternatives Considered**:
1. Fine-tuned BERT model: Higher accuracy (90%+ F1) but requires GPU, slow inference
2. OpenAI API for NER: High accuracy but vendor lock-in, costs
3. Rule-based regex: Fast but low accuracy (40-50%)

**Rationale**: spaCy provides 85%+ accuracy, <500ms inference on CPU, zero external dependencies, FOSS licensed (MIT).

**Consequences**:
- **Positive**: Fast deployment, no GPU required, offline capability
- **Negative**: Accuracy ceiling at ~85%
- **Neutral**: Users can swap spaCy for custom models via interface

---

#### ADR-002: Use Dependency Parsing for Triple Extraction (unchanged)

**Status**: Accepted  
**Date**: 2026-01-22

**Context**: Need (subject, predicate, object) triple extraction.

**Decision**: Use spaCy dependency parser with pattern matching.

**Rationale**: Fast (<100ms), already loaded for NER, deterministic.

**Consequences**:
- **Positive**: Zero additional dependencies
- **Negative**: Lower recall than OpenIE (75% vs 85%)

---

#### ADR-003: Use NetworkX for Graph Construction (unchanged)

**Status**: Accepted  
**Date**: 2026-01-22

**Context**: Need graph data structure.

**Decision**: Use NetworkX in-memory graph.

**Rationale**: 50+ algorithms, pure Python, BSD licensed.

**Consequences**:
- **Positive**: Algorithm-rich, Python-native
- **Negative**: No persistence, memory-limited

---

#### ADR-004: Use TF-IDF for Keyword Importance Instead of KeyBERT (NEW)

**Status**: Accepted  
**Date**: 2026-01-22  
**Deciders**: Architecture Team

**Context**: Need to rank entities by importance for visualization. Must balance accuracy with performance.

**Decision**: Use scikit-learn TfidfVectorizer for keyword importance scoring as primary method.

**Alternatives Considered**:
1. **KeyBERT (transformer-based)**: Higher semantic accuracy but requires 500MB model download, 2-3s processing time, GPU for large docs
2. **YAKE (unsupervised)**: Language-agnostic, fast, but requires parameter tuning, less interpretable scores
3. **Frequency-only**: Fastest but ignores document-level importance (common words dominate)

**Rationale**: TF-IDF provides good balance of accuracy (within 10% of KeyBERT for most use cases), speed (<50ms for 1000 words), interpretability, and zero model downloads. scikit-learn is already widely deployed.

**Consequences**:
- **Positive**: Fast computation, no model download, interpretable scores, deterministic
- **Negative**: Cannot capture semantic similarity (e.g., "ML" vs "machine learning" treated as different)
- **Neutral**: Can add KeyBERT as optional enhancement in Phase 2 for users with larger documents

---

#### ADR-005: Use Pattern-Based Causality Detection Instead of CausalNLP (NEW)

**Status**: Accepted  
**Date**: 2026-01-22  
**Deciders**: Architecture Team

**Context**: Need to identify causal relationships in text. Must work reliably without large model dependencies.

**Decision**: Use spaCy dependency parsing with custom causal marker patterns ("causes", "leads to", "results in", "enables", "reduces").

**Alternatives Considered**:
1. **CausalNLP (transformer-based)**: Pre-trained CausalBERT achieves 85% precision but requires 400MB model, 1-2s per sentence, GPU recommended
2. **Rule-based with extensive pattern library**: High recall (90%+) but brittle, requires domain-specific tuning
3. **No causality detection**: Treat all relationships equally (baseline)

**Rationale**: Pattern-based approach achieves 70-75% precision (acceptable for v2.0), processes in <50ms, deterministic, zero additional dependencies. Most causal relationships in technical text use explicit markers.

**Consequences**:
- **Positive**: Fast, lightweight, deterministic, no model download
- **Negative**: Misses implicit causality (e.g., "Increasing temperature melts ice" without explicit "causes")
- **Neutral**: Users with higher accuracy requirements can integrate CausalNLP via plugin architecture in future

---

#### ADR-006: Use Density-Based DBSCAN for Community Detection (NEW)

**Status**: Accepted  
**Date**: 2026-01-22  
**Deciders**: Architecture Team

**Context**: Need to detect semantic communities in knowledge graphs. Must handle graphs of 10-1000 nodes efficiently.

**Decision**: Use a lightweight, dependency-free DBSCAN density clustering implementation for community detection.

**Alternatives Considered**:
1. **Louvain algorithm**: Strong graph-structure communities but requires modularity tooling and additional dependency surface
2. **Leiden algorithm**: Often higher modularity but adds dependency and operational complexity
3. **Label Propagation**: Fast but non-deterministic for reproducibility
4. **Hierarchical clustering on embeddings**: Higher semantic accuracy but requires embeddings/model runtime

**Rationale**: DBSCAN is density-based, deterministic under stable ordering, requires no external clustering library, and can be bounded (max nodes/steps) to prevent runaway computation while still producing usable communities and keyword summaries.

**Consequences**:
- **Positive**: Dependency-free, bounded execution, configurable via `eps/minPts`, stable results
- **Negative**: Community quality depends on feature representation and `eps/minPts` tuning; no modularity score
- **Neutral**: Louvain/Leiden can be added later as optional algorithms behind the same interface

---

#### ADR-007: Compute Analytics On-Demand vs Pre-Compute (NEW)

**Status**: Accepted  
**Date**: 2026-01-22  
**Deciders**: Engineering Lead, UX Designer

**Context**: Analytics computations (TF-IDF, PageRank, DBSCAN clustering) take 500ms-2s. Must decide whether to compute during initial processing or when user requests analytics view.

**Decision**: Pre-compute all analytics during initial pipeline execution.

**Alternatives Considered**:
1. **On-demand computation**: Compute only when user clicks "Show Analytics" - reduces initial load time but adds 1-2s delay when toggling analytics view
2. **Lazy loading with caching**: Compute on first access, cache results - complex state management
3. **Web Worker background computation**: Parallel processing but requires Worker setup, message passing overhead

**Rationale**: Pre-computation adds <2s to initial pipeline execution but enables instant analytics toggling, filtering, and visualization updates. User feedback indicates willingness to wait 3-4s upfront for instant interactive exploration.

**Consequences**:
- **Positive**: Instant analytics view toggling (<100ms), smooth filtering experience, simpler state management
- **Negative**: Initial processing time increases from ~1s to ~3s
- **Neutral**: For very large graphs (>500 nodes), can add progressive computation in future

---

