---
title: "Knowledge Graph GraphRAG Pipeline - PRD & TAD"
author: "joohwee"
tags: [EDA, MLP, Test]
date: 2026-01-13
mermaidAnchorsOnly: true
mermaid: |
  graph TD
    Start([Input Text]) --> Input["Singapore is a city-state in Southeast Asia.<br/>It has a population of about 5.9 million and is<br/>known for its financial hub, Changi Airport,<br/>and future development projects."]
    
    Input --> NLTK_Stage[NLTK Preprocessing]
    
    subgraph NLTK["Stage 1: NLTK Preprocessing"]
        NLTK_Stage --> NLTK_Tokenize[Tokenization]
        NLTK_Tokenize --> NLTK_Tokens["Tokens: Singapore, city-state, Southeast,<br/>Asia, population, about, 5.9, million,<br/>known, financial, hub, Changi,<br/>Airport, future, development, projects"]
        
        NLTK_Tokens --> NLTK_Stopwords[Remove Stopwords]
        NLTK_Stopwords --> NLTK_Clean["Filtered: Singapore, city-state,<br/>Southeast, Asia, population,<br/>5.9, million, known, financial,<br/>hub, Changi, Airport, future,<br/>development, projects"]
        
        NLTK_Clean --> NLTK_Lemma[Lemmatization]
        NLTK_Lemma --> NLTK_Output["Lemmas: singapore, city-state,<br/>southeast, asia, population,<br/>million, know, financial, hub,<br/>changi, airport, future,<br/>development, project"]
    end
    
    NLTK_Output --> HF_Stage[HuggingFace Tokenizers]
    
    subgraph HF["Stage 2: HuggingFace Tokenization"]
        HF_Stage --> HF_BPE[Byte-Pair Encoding]
        HF_BPE --> HF_Subwords["Subword Tokens:<br/>Sing|apore|is|a|city|-|state|in<br/>South|east|Asia|.|It|has|a<br/>population|of|about|5|.|9<br/>million|and|is|known|for|its<br/>financial|hub|,|Changi|Airport"]
        
        HF_Subwords --> HF_Count[Token Count]
        HF_Count --> HF_Output["Word tokens: 29<br/>Subword tokens: 35<br/>Compression ratio: 1.21"]
    end
    
    HF_Output --> spaCy_Stage[spaCy Processing]
    
    subgraph spaCy["Stage 3: spaCy NER & POS"]
        spaCy_Stage --> spaCy_NER[Named Entity Recognition]
        spaCy_NER --> spaCy_Entities["Entities Extracted:<br/>━━━━━━━━━━━━━━━<br/>Singapore → GPE<br/>Southeast Asia → LOC<br/>5.9 million → QUANTITY<br/>Changi Airport → FAC"]
        
        spaCy_Entities --> spaCy_POS[Part-of-Speech Tagging]
        spaCy_POS --> spaCy_Tags["POS Tags:<br/>Singapore/PROPN is/AUX a/DET<br/>city-state/NOUN in/ADP<br/>Southeast/PROPN Asia/PROPN"]
        
        spaCy_Tags --> spaCy_Dep[Dependency Parsing]
        spaCy_Dep --> spaCy_Output["Dependencies:<br/>Singapore ← nsubj → is<br/>city-state ← attr → is<br/>Asia ← pobj → in"]
    end
    
    spaCy_Output --> Triple_Stage[Triple Extraction]
    
    subgraph Triple["Stage 4: Semantic Triple Extraction"]
        Triple_Stage --> Triple_Parse[Analyze Dependencies]
        Triple_Parse --> Triple_Pattern[Pattern Matching:<br/>nsubj-ROOT-attr<br/>nsubj-ROOT-prep-pobj]
        
        Triple_Pattern --> Triple_Extract[Extract Relationships]
        Triple_Extract --> Triple_Output["Triples Generated:<br/>━━━━━━━━━━━━━━━━━━━<br/>subject, predicate, object<br/>━━━━━━━━━━━━━━━━━━━<br/>Singapore, is-a, city-state<br/>Singapore, located-in, Southeast Asia<br/>Singapore, has-population, 5.9 million<br/>Singapore, known-for, financial hub<br/>Singapore, known-for, Changi Airport<br/>Singapore, has, development projects"]
    end
    
    Triple_Output --> Entity_Analytics[Entity Importance Analysis]
    
    subgraph Entity_Layer["Stage 5: Entity Layer Analytics NEW"]
        Entity_Analytics --> TFIDF[TF-IDF Scoring]
        TFIDF --> TFIDF_Output["Keyword Importance:<br/>━━━━━━━━━━━━━━━━━━━<br/>Singapore: freq=6, TF-IDF=0.89<br/>Changi Airport: freq=1, TF-IDF=0.72<br/>Southeast Asia: freq=1, TF-IDF=0.68<br/>financial hub: freq=1, TF-IDF=0.65<br/>city-state: freq=1, TF-IDF=0.61"]
        
        TFIDF_Output --> Centrality[Graph Centrality]
        Centrality --> Centrality_Output["Centrality Metrics:<br/>━━━━━━━━━━━━━━━━━━━<br/>PageRank:<br/>  Singapore: 0.42 highest<br/>  Southeast Asia: 0.12<br/>  Changi Airport: 0.10<br/><br/>Degree Centrality:<br/>  Singapore: 1.0 hub<br/>  Others: 0.17-0.20"]
    end
    
    Centrality_Output --> Causality_Analytics[Causality Detection]
    
    subgraph Relation_Layer["Stage 6: Relation Layer Analytics NEW"]
        Causality_Analytics --> Causal_Detect[Causal Pattern Detection]
        Causal_Detect --> Causal_Output["Causal Relationships:<br/>━━━━━━━━━━━━━━━━━━━<br/>Edge Type | Causality Score<br/>━━━━━━━━━━━━━━━━━━━<br/>is-a → hierarchy | 0.85<br/>located-in → dependency | 0.78<br/>has-population → composition | 0.72<br/>known-for → attribute | 0.65<br/>has → composition | 0.58"]
        
        Causal_Output --> Strength_Calc[Edge Strength Calculation]
        Strength_Calc --> Strength_Output["Edge Strength Metrics:<br/>━━━━━━━━━━━━━━━━━━━<br/>Co-occurrence | PMI | Strength<br/>━━━━━━━━━━━━━━━━━━━<br/>Singapore↔city-state: 1 | 2.1 | 0.92<br/>Singapore↔SE Asia: 1 | 1.8 | 0.85<br/>Singapore↔Changi: 1 | 1.6 | 0.78<br/>Singapore↔financial: 1 | 1.5 | 0.75"]
    end
    
    Strength_Output --> Graph_Stage[Graph Construction]
    
    subgraph Graph["Stage 7: NetworkX Graph Construction"]
        Graph_Stage --> Graph_Nodes[Create Weighted Nodes]
        Graph_Nodes --> Graph_NodeList["Nodes 6 with Importance:<br/>━━━━━━━━━━━━━━━━━━━<br/>N1: Singapore r=35 PR=0.42<br/>N2: city-state r=20 PR=0.08<br/>N3: Southeast Asia r=22 PR=0.12<br/>N4: 5.9 million r=18 PR=0.06<br/>N5: Changi Airport r=24 PR=0.10<br/>N6: financial hub r=21 PR=0.09"]
        
        Graph_NodeList --> Graph_Edges[Create Weighted Edges]
        Graph_Edges --> Graph_EdgeList["Edges 6 with Strength:<br/>━━━━━━━━━━━━━━━━━━━<br/>N1 →is-a→ N2 strength=0.92<br/>N1 →located-in→ N3 strength=0.85<br/>N1 →has-population→ N4 strength=0.68<br/>N1 →known-for→ N5 strength=0.78<br/>N1 →known-for→ N6 strength=0.75<br/>N1 →has→ projects strength=0.58"]
    end
    
    Graph_EdgeList --> Metadata_Analytics[Graph Metrics]
    
    subgraph Metadata_Layer["Stage 8: Metadata Layer Analytics NEW"]
        Metadata_Analytics --> Graph_Metrics[Compute Graph Metrics]
        Graph_Metrics --> Metrics_Output["Graph-Level Metrics:<br/>━━━━━━━━━━━━━━━━━━━<br/>Density: 0.20<br/>Diameter: 2<br/>Avg Path Length: 1.4<br/>Clustering Coefficient: 0.0<br/>Connected Components: 1"]
        
        Metrics_Output --> Node_Metrics[Node-Level Metrics]
        Node_Metrics --> Node_Output["Per-Node Statistics:<br/>━━━━━━━━━━━━━━━━━━━<br/>Singapore: deg=6 betw=1.0<br/>Southeast Asia: deg=1 betw=0<br/>Changi Airport: deg=1 betw=0"]
    end
    
    Node_Output --> Community_Analytics[Community Detection]
    
    subgraph Cluster_Layer["Stage 9: Cluster Layer Analytics NEW"]
        Community_Analytics --> Dbscan[DBSCAN Density Clustering]
        Dbscan --> Community_Output["Communities Detected: 2<br/>━━━━━━━━━━━━━━━━━━━<br/><br/>C1: Location Cluster<br/>  Singapore, Southeast Asia,<br/>  city-state<br/><br/>C2: Features Cluster<br/>  financial hub, Changi Airport,<br/>  5.9 million, projects"]
        
        Community_Output --> Topic_Model[Topic Labeling]
        Topic_Model --> Topic_Output["Semantic Topics:<br/>━━━━━━━━━━━━━━━━━━━<br/>Topic 1: Geographic Identity<br/>  Keywords: Singapore,<br/>  Southeast, Asia, city-state<br/>  Coherence: 0.72<br/><br/>Topic 2: Urban Features<br/>  Keywords: airport, financial,<br/>  development, hub<br/>  Coherence: 0.68"]
    end
    
    Topic_Output --> Final[Analytics-Enhanced Graph]
    
    subgraph Final_Graph["Final Output: Knowledge Graph with Analytics"]
        Final --> Complete_Metrics["Complete Graph Analytics:<br/>━━━━━━━━━━━━━━━━━━━<br/>Entity Layer:<br/>  Nodes: 6<br/>  Avg TF-IDF: 0.71<br/>  Avg PageRank: 0.14<br/><br/>Relation Layer:<br/>  Edges: 6<br/>  Avg Causality: 0.73<br/>  Avg Strength: 0.76<br/><br/>Metadata Layer:<br/>  Density: 0.20<br/>  Diameter: 2<br/><br/>Cluster Layer:<br/>  Communities: 2"]
        
        Complete_Metrics --> Visualization["Enhanced Visualization:<br/>┌─────────────────────────┐<br/>│  Singapore r=35 PR=0.42 │<br/>└─────────────────────────┘<br/>       │<br/>       ├─[0.92]→ city-state r=20<br/>       ├─[0.85]→ Southeast Asia r=22<br/>       ├─[0.68]→ 5.9 million r=18<br/>       ├─[0.78]→ Changi Airport r=24<br/>       ├─[0.75]→ financial hub r=21<br/>       └─[0.58]→ projects<br/><br/>Node size = f(TF-IDF + PageRank)<br/>Edge thickness = f(Causality + Strength)<br/>Color = Community assignment"]
    end
    
    %% Library annotations
    NLTK_Stage -.->|nltk.tokenize| NLTK_Lib[NLTK]
    HF_Stage -.->|tokenizers| HF_Lib[HuggingFace]
    spaCy_Stage -.->|spacy.load| spaCy_Lib[spaCy]
    Triple_Stage -.->|dependency parser| Triple_Lib[spaCy Deps]
    TFIDF -.->|TfidfVectorizer| TFIDF_Lib[scikit-learn]
    Centrality -.->|nx.pagerank| Centrality_Lib[NetworkX]
    Causal_Detect -.->|pattern matching| Causal_Lib[spaCy Patterns]
    Strength_Calc -.->|PMI calculation| Strength_Lib[Custom]
    Graph_Stage -.->|nx.Graph| Graph_Lib[NetworkX]
    Graph_Metrics -.->|nx.density| Metrics_Lib[NetworkX]
    Dbscan -.->|cluster| Community_Lib[DBSCAN]
    Topic_Model -.->|BERTopic optional| Topic_Lib[BERTopic]
    
    classDef inputStyle fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef processStyle fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef outputStyle fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef dataStyle fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef analyticsStyle fill:#fce4ec,stroke:#c2185b,stroke-width:3px
    classDef libStyle fill:#e3f2fd,stroke:#1565c0,stroke-width:1px,stroke-dasharray: 5 5
    
    class Start,Input inputStyle
    class NLTK_Stage,HF_Stage,spaCy_Stage,Triple_Stage,Graph_Stage processStyle
    class NLTK_Output,HF_Output,spaCy_Output,Triple_Output,Graph_Output outputStyle
    class NLTK_Tokens,NLTK_Clean,NLTK_Lemma,HF_Subwords,HF_Count,spaCy_Entities,spaCy_Tags,spaCy_Dep,Triple_Pattern,Triple_Extract,Graph_NodeList,Graph_EdgeList,Metrics_Output,Node_Output,Complete_Metrics,Visualization dataStyle
    class Entity_Analytics,TFIDF,TFIDF_Output,Centrality,Centrality_Output,Causality_Analytics,Causal_Detect,Causal_Output,Strength_Calc,Strength_Output,Metadata_Analytics,Graph_Metrics,Node_Metrics,Community_Analytics,Dbscan,Community_Output,Topic_Model,Topic_Output analyticsStyle
    class NLTK_Lib,HF_Lib,spaCy_Lib,Triple_Lib,TFIDF_Lib,Centrality_Lib,Causal_Lib,Strength_Lib,Graph_Lib,Metrics_Lib,Community_Lib,Topic_Lib libStyle
---

# Knowledge Graph GraphRAG Pipeline with Analytics - PRD & TAD

**Version**: 2.1.0  
**Date**: 2026-01-22  
**Status**: Implemented (Enhanced v2.1)  
**Previous Version**: 1.0.0

> Canonical index document. Keep this file sub-600; continue TAD core and validation/appendix detail in the companion documents linked below.

---

## PART I: PRODUCT REQUIREMENTS DOCUMENT (PRD)

### Feature: GraphRAG Text-to-Knowledge Graph Pipeline with Advanced Analytics

#### Problem Statement

Data analysts, researchers, and knowledge workers struggle to extract structured insights from unstructured text documents **and lack quantitative metrics to validate the quality and importance of extracted entities and relationships**. Manual entity extraction is time-consuming, but equally problematic is the inability to prioritize which entities matter most, measure relationship strength, or identify semantic communities in large corpora. Users need not just entity extraction, but **entity importance scoring, relationship causality measurement, and automated community detection** to make knowledge graphs actionable for decision-making.

**Enhanced User Pain Points**:
- Cannot distinguish important entities from noise (all entities treated equally)
- No quantitative measure of relationship strength or causality
- Unable to identify conceptual clusters or communities in knowledge graphs
- Lack visibility into which entities are central to a domain
- Cannot validate if extracted relationships are causal, correlative, or hierarchical
- No automated way to detect semantic communities for hierarchical navigation

**Quantified Impact**: Users spend 15-20 hours per week on manual knowledge extraction PLUS an additional 8-10 hours manually categorizing entities by importance and validating relationships, representing 60% of research time that could be automated with analytics.

---

### User Stories

#### Epic: Text-to-Knowledge Graph with Analytics

**PRD-E001: Core Pipeline** (from v1.0.0)

**PRD-E001-S001: Automated Entity Extraction** (unchanged)

**As a** data analyst  
**I want** the system to automatically identify named entities (people, places, organizations, dates) from text  
**So that** I can build knowledge graphs without manual tagging

**Acceptance Criteria**:
- **Given** plain text input containing entities  
- **When** user submits text for processing  
- **Then** system extracts entities with type labels (GPE, LOC, PERSON, ORG, DATE) with >85% precision

---

**PRD-E001-S002: Relationship Triple Extraction** (unchanged)

**As a** researcher  
**I want** the system to extract semantic relationships between entities in (subject, predicate, object) format  
**So that** I can understand how entities connect without reading full documents

**Acceptance Criteria**:
- **Given** text with entity relationships  
- **When** system processes entities  
- **Then** system produces triples like "(Singapore, located-in, Southeast Asia)" with >75% accuracy

---

**PRD-E001-S003: Interactive Processing Visualization** (unchanged)

**As a** knowledge worker  
**I want** to see each pipeline stage's output in real-time  
**So that** I can understand how my text transforms into structured data

**Acceptance Criteria**:
- **Given** text submitted for processing  
- **When** pipeline executes  
- **Then** user sees progressive results from each stage within 3 seconds

---

**PRD-E001-S004: Knowledge Graph Construction** (unchanged)

**As a** data scientist  
**I want** extracted triples to form a queryable graph structure  
**So that** I can perform graph traversal and community detection

**Acceptance Criteria**:
- **Given** valid entity triples  
- **When** graph construction completes  
- **Then** system displays node count, edge count, and community clusters

---

#### Epic: Advanced Analytics Layer (NEW)

**PRD-E002: Entity Importance Analysis**

**PRD-E002-S001: Keyword Frequency Scoring**

**As a** data analyst  
**I want** entities ranked by frequency and TF-IDF importance scores  
**So that** I can focus on the most relevant concepts in my corpus

**Acceptance Criteria**:
- **Given** extracted entities from processed text  
- **When** entity analysis completes  
- **Then** each entity has frequency count with >99% accuracy
- **And** TF-IDF scores normalized to [0,1] range with two decimal precision
- **And** entities sorted by combined frequency+TF-IDF metric in descending order

**PRD-E002-S002: Centrality-Based Importance**

**As a** researcher  
**I want** entities ranked by graph centrality (PageRank, degree, betweenness)  
**So that** I can identify which concepts are most central to the knowledge domain

**Acceptance Criteria**:
- **Given** constructed knowledge graph with nodes and edges  
- **When** centrality analysis runs  
- **Then** system calculates PageRank scores for all nodes with >95% accuracy vs NetworkX reference
- **And** degree centrality, betweenness centrality computed within 2 seconds for graphs <1000 nodes
- **And** top 10 entities by each centrality measure displayed with visual indicators (node size, border)

---

**PRD-E003: Relationship Causality Analysis**

**PRD-E003-S001: Causal Relationship Detection**

**As a** domain expert  
**I want** relationships classified by type (causal, correlative, hierarchical, compositional)  
**So that** I can distinguish "X causes Y" from "X relates to Y"

**Acceptance Criteria**:
- **Given** extracted semantic triples  
- **When** causality detection runs  
- **Then** system identifies causal markers ("causes", "leads to", "results in", "enables") with >70% precision
- **And** assigns causality confidence score [0,1] to each edge
- **And** labels edge types (causal, dependency, hierarchy, composition, technical)

**PRD-E003-S002: Relationship Strength Measurement**

**As a** data scientist  
**I want** relationships weighted by co-occurrence frequency and statistical association  
**So that** I can prioritize strong vs weak connections in analysis

**Acceptance Criteria**:
- **Given** entity pairs in triples  
- **When** strength calculation completes  
- **Then** system computes co-occurrence frequency with 100% accuracy
- **And** calculates PMI (Pointwise Mutual Information) scores
- **And** visualizes edge thickness proportional to strength (min 1px, max 5px)
- **And** edges with strength <0.3 displayed with transparency to reduce visual clutter

---

**PRD-E004: Semantic Community Detection**

**PRD-E004-S001: Automated Community Clustering**

**As a** knowledge worker  
**I want** entities automatically grouped into semantic communities  
**So that** I can navigate large knowledge graphs by topic clusters

**Acceptance Criteria**:
- **Given** knowledge graph with >10 nodes  
- **When** community detection runs  
- **Then** system applies Louvain algorithm detecting 2-8 communities
- **And** each community has modularity score >0.25
- **And** communities visualized with distinct colors and spatial grouping
- **And** community labels generated from top 3 keywords in cluster

**PRD-E004-S002: Hierarchical Topic Modeling**

**As a** researcher analyzing large corpora  
**I want** hierarchical topic structure extracted from text  
**So that** I can understand document themes at multiple levels of granularity

**Acceptance Criteria**:
- **Given** corpus with >100 sentences  
- **When** topic modeling executes  
- **Then** system extracts 3-7 topics using BERTopic with >60% topic coherence
- **And** each topic has top 10 representative keywords
- **And** topics mapped to graph communities with overlap visualization
- **And** hierarchical structure displayed showing topic-subtopic relationships

---

**PRD-E005: Interactive Analytics Dashboard**

**PRD-E005-S001: Real-Time Metric Updates**

**As a** data analyst  
**I want** entity and edge metrics updated in real-time as I filter the graph  
**So that** I can explore different views without re-processing

**Acceptance Criteria**:
- **Given** user applies community filter  
- **When** graph view updates  
- **Then** entity rankings recalculated for visible nodes within 500ms
- **And** edge strength statistics updated for visible edges
- **And** community metrics (modularity, density) recomputed
- **And** all metrics displayed with smooth transitions (<300ms animation)

**PRD-E005-S002: Comparative Analytics**

**As a** researcher comparing multiple documents  
**I want** side-by-side analytics showing how entity importance differs across texts  
**So that** I can identify unique concepts vs common themes

**Acceptance Criteria**:
- **Given** two or more processed documents  
- **When** comparative mode activated  
- **Then** system displays entity frequency delta (document A vs B)
- **And** highlights entities unique to each document with >0 frequency delta
- **And** shows community overlap percentage between graphs
- **And** generates Venn diagram of shared vs unique entities

---

### Success Metrics

| Metric | Baseline | Target | Timeline | Measurement |
|--------|----------|--------|----------|-------------|
| Entity Extraction Precision | N/A | ≥85% | Week 4 | F1 score on CoNLL-2003 dataset |
| Triple Extraction Accuracy | N/A | ≥75% | Week 6 | Human evaluation on 100 sample triples |
| TF-IDF Accuracy | N/A | ≥95% | Week 3 | Comparison vs scikit-learn reference |
| PageRank Accuracy | N/A | ≥95% | Week 4 | Comparison vs NetworkX reference |
| Causality Detection Precision | N/A | ≥70% | Week 5 | Manual validation on 50 causal pairs |
| Community Detection Quality | N/A | Modularity ≥0.30 | Week 5 | Louvain modularity score |
| Topic Coherence | N/A | ≥60% | Week 7 | UMass coherence metric |
| Analytics Latency (p95) | N/A | <2s | Week 6 | End-to-end for 500-node graphs |
| User Comprehension | N/A | ≥85% | Week 10 | Survey: "I understand entity importance rankings" |

---

### MoSCoW Prioritization

**Must Have**:
- NLTK preprocessing (stopword removal, lemmatization)
- spaCy NER with entity type labels
- Triple extraction producing (subject, predicate, object) format
- TF-IDF keyword frequency scoring
- NetworkX PageRank centrality
- Louvain community detection
- Causal marker detection (pattern-based)
- Interactive visualization with filtering
- Edge strength visualization (thickness)

**Should Have**:
- Betweenness and degree centrality
- PMI (Pointwise Mutual Information) for edge strength
- BERTopic for semantic topic modeling
- KeyBERT for transformer-based keyword extraction
- Hierarchical community visualization
- Export analytics as JSON/CSV
- Comparative analytics across documents

**Could Have**:
- YAKE unsupervised keyword extraction
- CausalNLP transformer-based causality detection
- HDBSCAN density-based clustering
- Real-time collaborative graph editing
- Custom entity type training
- Graph query language interface

**Won't Have** (this release):
- Production graph database integration (Neo4j, FalkorDB)
- LLM-based relationship extraction
- Multi-language support beyond English
- Real-time streaming analytics
- Authentication/authorization system

---

### Out of Scope

- Production deployment infrastructure (users handle their own hosting)
- LLM API integration for generation tasks
- Real-time collaborative features
- Custom NER model training interface
- Graph database deployment and management
- Enterprise authentication systems
- Mobile application development

---

### Dependencies

**Required**:
- spaCy `en_core_web_sm` model (must be pre-downloaded)
- NLTK stopwords corpus (must be pre-downloaded)
- NetworkX >= 3.0
- scikit-learn >= 1.3
- Modern browser with JavaScript enabled
- Python >= 3.8 (for backend analytics)

**Optional (for advanced features)**:
- BERTopic >= 0.15 (for topic modeling)
- KeyBERT >= 0.8 (for transformer-based keywords)
- python-louvain >= 0.16 (for community detection)

**Assumed**:
- User has basic understanding of NLP and graph theory concepts
- Text input is English language
- Documents are <10,000 words for client-side processing
- Users understand statistical metrics (TF-IDF, PageRank)

---

### Open Questions

**OQ-001**: Should causality detection use pattern-based or transformer-based approach?  
**Impact**: Pattern-based is faster (50ms vs 500ms) but less accurate (70% vs 85%)  
**Resolution Deadline**: Week 2  
**Owner**: Technical Lead

**OQ-002**: What threshold for edge strength filtering (hide weak connections)?  
**Impact**: User experience vs information completeness  
**Resolution Deadline**: Week 3  
**Owner**: UX Designer  

**OQ-003**: Should we pre-compute analytics or compute on-demand?  
**Impact**: Startup time vs memory usage  
**Resolution Deadline**: Week 2  
**Owner**: Engineering Lead

**OQ-004**: How many communities is optimal for user navigation?  
**Impact**: Too few = overgeneralization, too many = cognitive overload  
**Resolution Deadline**: Week 4  
**Owner**: Product Manager

---


## Continued In Companion Documents
- agentic-graph-graphrag-pipeline-in-action-prd-tad-tad-core.md
- agentic-graph-graphrag-pipeline-in-action-prd-tad-validation-and-appendix.md
